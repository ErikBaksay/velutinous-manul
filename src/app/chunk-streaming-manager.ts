import * as THREE from 'three';
import {
  ChunkViewSelection,
  chunkKey,
  createChunkSelectionSignature,
  INITIAL_DESIRED_CHUNK_BUDGET,
  LogicalChunkCoordinate,
  selectChunksForView,
} from './chunk-visibility';
import { CAMERA_NAVIGATION_PLANE_Y, CameraNavigationState } from './camera-controller';
import {
  DepositChunkObjects,
  DepositChunkRenderer,
} from './deposit-chunk-renderer';
import {
  EnvironmentChunkObjects,
  EnvironmentChunkRenderer,
} from './environment-chunk-renderer';
import { AuthoritativeMapData } from './map/map-types';
import { getRenderQualitySettings, RenderQualitySettings } from './render-quality';
import { getRuntimeQueryParam } from './runtime-query';
import { TerrainChunkRenderer } from './terrain-chunk-renderer';
import { VisualAssetRegistry } from './visual-asset-registry';
import { WaterChunkObjects, WaterChunkRenderer } from './water-chunk-renderer';

export const STREAMING_BUILD_BUDGET_MS = 4;
const CHUNK_DEBUG_BUILD_BUDGET_MS = 16;
const MAX_RETAINED_CHUNKS = INITIAL_DESIRED_CHUNK_BUDGET;

export type ChunkLifecycleState =
  | 'absent'
  | 'queued'
  | 'building'
  | 'ready'
  | 'attached'
  | 'retiring'
  | 'disposed';

export interface ChunkStreamingDiagnostics {
  readonly mapEpoch: number;
  readonly attachedCount: number;
  readonly attachedKeys: readonly string[];
  readonly retainedCount: number;
  readonly queuedCount: number;
  readonly inFlightCount: number;
  readonly lastBundleBuildMs: number | null;
  readonly rollingBundleBuildMs: number | null;
  readonly peakVisibleCount: number;
  readonly initialReady: boolean;
  readonly buildBudgetMs: number;
  readonly initialDesiredBudget: number;
  readonly selectionRevision: number;
  readonly environmentInstanceCount: number;
}

interface ChunkBundle {
  readonly coordinate: LogicalChunkCoordinate;
  readonly terrain: THREE.Mesh;
  readonly water: WaterChunkObjects | null;
  readonly environment: EnvironmentChunkObjects | null;
  readonly deposits: DepositChunkObjects;
}

interface ChunkRecord {
  readonly epoch: number;
  readonly coordinate: LogicalChunkCoordinate;
  state: ChunkLifecycleState;
  bundle?: ChunkBundle;
  retainedSinceRevision?: number;
}

interface ChunkBuildState {
  readonly entry: QueueEntry;
  readonly record: ChunkRecord;
  readonly startedAt: number;
  stage: 0 | 1 | 2 | 3;
  terrain?: THREE.Mesh;
  water?: WaterChunkObjects | null;
  environment?: EnvironmentChunkObjects | null;
  deposits?: DepositChunkObjects;
}

interface QueueEntry {
  readonly epoch: number;
  readonly viewRevision: number;
  readonly coordinate: LogicalChunkCoordinate;
}

export class ChunkStreamingManager {
  private readonly scene: THREE.Scene;
  private readonly visualAssetRegistry: VisualAssetRegistry;
  private readonly ownsVisualAssetRegistry: boolean;
  private readonly quality: RenderQualitySettings;
  private terrainRenderer: TerrainChunkRenderer | null = null;
  private waterRenderer: WaterChunkRenderer | null = null;
  private environmentRenderer: EnvironmentChunkRenderer | null = null;
  private depositRenderer: DepositChunkRenderer | null = null;
  private readonly records = new Map<string, ChunkRecord>();
  private queue: QueueEntry[] = [];
  private desiredKeys = new Set<string>();
  private initialVisibleKeys = new Set<string>();
  private currentSelection: ChunkViewSelection | null = null;
  private selectionSignature = '';
  private lastCameraViewSignature = '';
  private viewRevision = 0;
  private mapEpoch = 0;
  private hasMapData = false;
  private initialReady = false;
  private resolveInitialReady: (() => void) | null = null;
  private initialReadyPromise: Promise<void> = Promise.resolve();
  private inFlightCount = 0;
  private lastBundleBuildMs: number | null = null;
  private rollingBundleBuildMs: number | null = null;
  private peakVisibleCount = 0;
  private activeBuild: ChunkBuildState | null = null;

  constructor(
    scene: THREE.Scene,
    visualAssetRegistry?: VisualAssetRegistry,
    quality: RenderQualitySettings = getRenderQualitySettings(),
  ) {
    this.scene = scene;
    this.visualAssetRegistry = visualAssetRegistry ?? new VisualAssetRegistry();
    this.ownsVisualAssetRegistry = visualAssetRegistry === undefined;
    this.quality = quality;
  }

  beginMap(data: AuthoritativeMapData, seaLevelSample: number): void {
    this.mapEpoch += 1;
    this.disposeActiveBuild();
    this.disposeCurrentRenderers();
    this.records.clear();
    this.queue = [];
    this.desiredKeys.clear();
    this.initialVisibleKeys.clear();
    this.currentSelection = null;
    this.selectionSignature = '';
    this.lastCameraViewSignature = '';
    this.viewRevision = 0;
    this.initialReady = false;
    this.hasMapData = true;
    this.visualAssetRegistry.ensureReady();
    this.initialReadyPromise = new Promise<void>((resolve) => {
      this.resolveInitialReady = resolve;
    });
    this.terrainRenderer = new TerrainChunkRenderer(this.scene, data, []);
    this.waterRenderer = new WaterChunkRenderer(this.scene, data, seaLevelSample, []);
    this.environmentRenderer = new EnvironmentChunkRenderer(
      this.scene,
      data,
      this.visualAssetRegistry,
      [],
      this.quality,
    );
    this.depositRenderer = new DepositChunkRenderer(this.scene, data, this.visualAssetRegistry, []);
  }

  beginInitialView(
    camera: THREE.OrthographicCamera,
    navigationState?: CameraNavigationState,
  ): Promise<void> {
    if (!this.hasMapData) {
      return Promise.resolve();
    }

    const selection = selectChunksForView(camera, undefined, undefined, undefined, navigationState);
    this.environmentRenderer?.setView(camera, navigationState?.navigationPlaneY ?? CAMERA_NAVIGATION_PLANE_Y);
    this.initialVisibleKeys = new Set(selection.visible.map(chunkKey));
    this.applySelection(selection);
    this.lastCameraViewSignature = createCameraViewSignature(camera, navigationState);
    this.resolveInitialReadiness();
    return this.initialReadyPromise;
  }

  update(camera: THREE.OrthographicCamera, navigationState?: CameraNavigationState): void {
    if (!this.hasMapData) {
      return;
    }

    const cameraViewSignature = createCameraViewSignature(camera, navigationState);
    this.environmentRenderer?.setView(camera, navigationState?.navigationPlaneY ?? CAMERA_NAVIGATION_PLANE_Y);
    if (cameraViewSignature !== this.lastCameraViewSignature) {
      const selection = selectChunksForView(camera, undefined, undefined, undefined, navigationState);
      const nextSignature = createChunkSelectionSignature(selection);
      if (nextSignature !== this.selectionSignature) {
        this.viewRevision += 1;
        this.applySelection(selection);
      }
      this.lastCameraViewSignature = cameraViewSignature;
    }

    const frameStart = performance.now();
    const buildBudgetMs = getActiveBuildBudgetMs();
    while (
      (this.queue.length > 0 || this.activeBuild || this.environmentRenderer?.hasPendingLodRefresh()) &&
      performance.now() - frameStart < buildBudgetMs
    ) {
      if (this.activeBuild) {
        this.buildNextBundleStage();
      } else if (this.environmentRenderer?.processNextLodRefresh()) {
        continue;
      } else {
        this.buildNextBundleStage();
      }
    }
    this.waterRenderer?.update(performance.now() / 1_000);
    this.retireStaleRecordsIfSafe();
    this.resolveInitialReadiness();
  }

  getCurrentSelection(): ChunkViewSelection | null {
    return this.currentSelection;
  }

  raycastTerrain(raycaster: THREE.Raycaster): THREE.Vector3 | null {
    return this.terrainRenderer?.raycast(raycaster) ?? null;
  }

  getDiagnostics(): ChunkStreamingDiagnostics {
    let attachedCount = 0;
    let retainedCount = 0;
    let queuedCount = 0;
    const attachedKeys: string[] = [];
    for (const record of this.records.values()) {
      if (record.state === 'attached') {
        attachedCount += 1;
        const key = chunkKey(record.coordinate);
        attachedKeys.push(key);
        if (!this.desiredKeys.has(key)) {
          retainedCount += 1;
        }
      } else if (record.state === 'queued') {
        queuedCount += 1;
      }
    }
    attachedKeys.sort();

    return {
      mapEpoch: this.mapEpoch,
      attachedCount,
      attachedKeys,
      retainedCount,
      queuedCount,
      inFlightCount: this.inFlightCount,
      lastBundleBuildMs: this.lastBundleBuildMs,
      rollingBundleBuildMs: this.rollingBundleBuildMs,
      peakVisibleCount: this.peakVisibleCount,
      initialReady: this.initialReady,
      buildBudgetMs: getActiveBuildBudgetMs(),
      initialDesiredBudget: INITIAL_DESIRED_CHUNK_BUDGET,
      selectionRevision: this.viewRevision,
      environmentInstanceCount: this.environmentRenderer?.getAttachedInstanceCount() ?? 0,
    };
  }

  destroy(): void {
    this.disposeActiveBuild();
    this.disposeCurrentRenderers();
    this.records.clear();
    this.queue = [];
    this.desiredKeys.clear();
    this.initialVisibleKeys.clear();
    this.currentSelection = null;
    this.hasMapData = false;
    if (this.ownsVisualAssetRegistry) {
      this.visualAssetRegistry.destroy();
    }
    this.resolveInitialReady?.();
    this.resolveInitialReady = null;
  }

  private applySelection(selection: ChunkViewSelection): void {
    this.currentSelection = selection;
    this.selectionSignature = createChunkSelectionSignature(selection);
    this.peakVisibleCount = Math.max(this.peakVisibleCount, selection.visible.length);

    const rejectedKeys = new Set(selection.rejected.map(chunkKey));
    const desiredCoordinates = [
      ...selection.visible,
      ...selection.prefetch.filter((chunk) => !rejectedKeys.has(chunkKey(chunk))),
    ];
    this.desiredKeys = new Set(desiredCoordinates.map(chunkKey));

    for (const record of [...this.records.values()]) {
      const key = chunkKey(record.coordinate);
      if (this.desiredKeys.has(key)) {
        record.retainedSinceRevision = undefined;
      } else if (record.state === 'attached') {
        record.retainedSinceRevision ??= this.viewRevision;
      } else if (!this.desiredKeys.has(key) && record.state === 'queued') {
        record.state = 'disposed';
        this.records.delete(key);
      }
    }

    const desiredOrder = new Map(
      desiredCoordinates.map((coordinate, index) => [chunkKey(coordinate), index]),
    );
    const nextQueue = this.queue.filter((entry) => {
      const key = chunkKey(entry.coordinate);
      const record = this.records.get(key);
      return record?.state === 'queued' && this.desiredKeys.has(key);
    });
    nextQueue.sort((first, second) => {
      return (desiredOrder.get(chunkKey(first.coordinate)) ?? Number.MAX_SAFE_INTEGER) -
        (desiredOrder.get(chunkKey(second.coordinate)) ?? Number.MAX_SAFE_INTEGER);
    });
    const queuedKeys = new Set(nextQueue.map((entry) => chunkKey(entry.coordinate)));
    for (const coordinate of desiredCoordinates) {
      const key = chunkKey(coordinate);
      const existing = this.records.get(key);
      if (existing) {
        if (existing.state === 'queued' && !queuedKeys.has(key)) {
          nextQueue.push({
            epoch: this.mapEpoch,
            viewRevision: this.viewRevision,
            coordinate,
          });
          queuedKeys.add(key);
        }
        continue;
      }
      this.records.set(key, {
        epoch: this.mapEpoch,
        coordinate,
        state: 'queued',
      });
      nextQueue.push({
        epoch: this.mapEpoch,
        viewRevision: this.viewRevision,
        coordinate,
      });
      queuedKeys.add(key);
    }
    nextQueue.sort((first, second) => {
      return (desiredOrder.get(chunkKey(first.coordinate)) ?? Number.MAX_SAFE_INTEGER) -
        (desiredOrder.get(chunkKey(second.coordinate)) ?? Number.MAX_SAFE_INTEGER);
    });
    this.queue = nextQueue;
    this.enforceRetainedBudget();
  }

  private buildNextBundleStage(): void {
    if (!this.activeBuild) {
      const entry = this.queue.shift();
      if (!entry) {
        return;
      }
      const record = this.records.get(chunkKey(entry.coordinate));
      if (!record) {
        return;
      }
      record.state = 'building';
      this.activeBuild = {
        entry,
        record,
        startedAt: performance.now(),
        stage: 0,
      };
      this.inFlightCount = 1;
    }

    const build = this.activeBuild;
    if (!build || !this.terrainRenderer || !this.waterRenderer || !this.environmentRenderer || !this.depositRenderer) {
      return;
    }

    try {
      const { x, y } = build.entry.coordinate;
      switch (build.stage) {
        case 0:
          build.terrain = this.terrainRenderer.createChunk(x, y);
          build.stage = 1;
          break;
        case 1:
          build.water = this.waterRenderer.createChunk(x, y);
          build.stage = 2;
          break;
        case 2:
          build.environment = this.environmentRenderer.createChunk(x, y);
          build.stage = 3;
          break;
        case 3:
          build.deposits = this.depositRenderer.createChunk(x, y);
          this.finishBundleBuild(build);
          break;
      }
    } catch (error) {
      this.failBundleBuild(build, error);
    }
  }

  private finishBundleBuild(build: ChunkBuildState): void {
    const key = chunkKey(build.entry.coordinate);
    const bundle: ChunkBundle = {
      coordinate: build.entry.coordinate,
      terrain: build.terrain!,
      water: build.water ?? null,
      environment: build.environment ?? null,
      deposits: build.deposits!,
    };
    const stillUseful = build.entry.epoch === this.mapEpoch &&
      build.record.epoch === this.mapEpoch &&
      this.desiredKeys.has(key);
    if (!stillUseful) {
      this.disposeBundle(bundle);
      build.record.state = 'disposed';
      this.records.delete(key);
    } else {
      this.attachBundle(bundle);
      build.record.bundle = bundle;
      build.record.state = 'attached';
    }
    this.completeBuildTiming(build);
  }

  private failBundleBuild(build: ChunkBuildState, error: unknown): void {
    this.disposePartialBuild(build);
    const key = chunkKey(build.entry.coordinate);
    build.record.state = 'disposed';
    this.records.delete(key);
    this.completeBuildTiming(build);
    console.error('[chunk streaming] bundle build failed', {
      error,
      chunk: build.entry.coordinate,
      epoch: build.entry.epoch,
      viewRevision: build.entry.viewRevision,
    });
  }

  private completeBuildTiming(build: ChunkBuildState): void {
    const duration = performance.now() - build.startedAt;
    this.lastBundleBuildMs = duration;
    this.rollingBundleBuildMs = this.rollingBundleBuildMs === null
      ? duration
      : this.rollingBundleBuildMs * 0.8 + duration * 0.2;
    this.activeBuild = null;
    this.inFlightCount = 0;
  }

  private disposeActiveBuild(): void {
    if (!this.activeBuild) {
      return;
    }
    this.disposePartialBuild(this.activeBuild);
    this.activeBuild.record.state = 'disposed';
    this.records.delete(chunkKey(this.activeBuild.entry.coordinate));
    this.activeBuild = null;
    this.inFlightCount = 0;
  }

  private disposePartialBuild(build: ChunkBuildState): void {
    if (build.terrain) {
      this.terrainRenderer?.disposeChunk(build.terrain);
    }
    if (build.water) {
      this.waterRenderer?.disposeChunk(build.water);
    }
    if (build.environment) {
      this.environmentRenderer?.disposeChunk(build.environment);
    }
    if (build.deposits) {
      this.depositRenderer?.disposeChunk(build.deposits);
    }
  }

  private attachBundle(bundle: ChunkBundle): void {
    if (!this.terrainRenderer || !this.waterRenderer || !this.environmentRenderer || !this.depositRenderer) {
      throw new Error('Chunk renderers are not initialized.');
    }

    const { coordinate } = bundle;
    this.terrainRenderer.attachChunk(coordinate.x, coordinate.y, bundle.terrain);
    if (bundle.water) {
      this.waterRenderer.attachChunk(coordinate.x, coordinate.y, bundle.water);
    }
    if (bundle.environment) {
      this.environmentRenderer.attachChunk(coordinate.x, coordinate.y, bundle.environment);
    }
    this.depositRenderer.attachChunk(coordinate.x, coordinate.y, bundle.deposits);
  }

  private disposeBundle(bundle: ChunkBundle): void {
    this.terrainRenderer?.disposeChunk(bundle.terrain);
    if (bundle.water) {
      this.waterRenderer?.disposeChunk(bundle.water);
    }
    if (bundle.environment) {
      this.environmentRenderer?.disposeChunk(bundle.environment);
    }
    this.depositRenderer?.disposeChunk(bundle.deposits);
  }

  private retireRecord(record: ChunkRecord): void {
    record.state = 'retiring';
    const { x, y } = record.coordinate;
    this.terrainRenderer?.removeChunk(x, y);
    this.waterRenderer?.removeChunk(x, y);
    this.environmentRenderer?.removeChunk(x, y);
    this.depositRenderer?.removeChunk(x, y);
    record.state = 'disposed';
    this.records.delete(chunkKey(record.coordinate));
  }

  private retireStaleRecordsIfSafe(): void {
    if (!this.currentSelection || this.currentSelection.visible.some((chunk) => {
      const record = this.records.get(chunkKey(chunk));
      return record?.state !== 'attached';
    })) {
      return;
    }

    for (const record of [...this.records.values()]) {
      if (record.state === 'attached' && !this.desiredKeys.has(chunkKey(record.coordinate))) {
        this.retireRecord(record);
      }
    }
  }

  private enforceRetainedBudget(): void {
    const retainedRecords = [...this.records.values()]
      .filter((record) => record.state === 'attached' && !this.desiredKeys.has(chunkKey(record.coordinate)))
      .sort((first, second) =>
        (first.retainedSinceRevision ?? 0) - (second.retainedSinceRevision ?? 0),
      );
    const excessCount = retainedRecords.length - MAX_RETAINED_CHUNKS;
    for (let index = 0; index < excessCount; index += 1) {
      const record = retainedRecords[index];
      if (record) {
        this.retireRecord(record);
      }
    }
  }

  private resolveInitialReadiness(): void {
    if (this.initialReady || this.initialVisibleKeys.size === 0) {
      return;
    }

    for (const key of this.initialVisibleKeys) {
      if (this.records.get(key)?.state !== 'attached') {
        return;
      }
    }

    this.initialReady = true;
    this.resolveInitialReady?.();
    this.resolveInitialReady = null;
  }

  private disposeCurrentRenderers(): void {
    this.terrainRenderer?.destroy();
    this.waterRenderer?.destroy();
    this.environmentRenderer?.destroy();
    this.depositRenderer?.destroy();
    this.terrainRenderer = null;
    this.waterRenderer = null;
    this.environmentRenderer = null;
    this.depositRenderer = null;
  }
}

function createCameraViewSignature(
  camera: THREE.OrthographicCamera,
  navigationState?: CameraNavigationState,
): string {
  camera.updateMatrixWorld(true);
  return [
    ...camera.matrixWorld.elements,
    ...camera.projectionMatrix.elements,
    navigationState?.navigationPlaneY ?? 0,
  ].map((value) => Math.round(value * 1_000)).join(',');
}

function getActiveBuildBudgetMs(): number {
  return isChunkDebugEnabled() ? CHUNK_DEBUG_BUILD_BUDGET_MS : STREAMING_BUILD_BUDGET_MS;
}

function isChunkDebugEnabled(): boolean {
  return getRuntimeQueryParam('debug') === 'chunks';
}

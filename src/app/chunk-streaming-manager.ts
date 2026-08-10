import * as THREE from 'three';
import {
  ChunkViewSelection,
  chunkKey,
  createChunkSelectionSignature,
  INITIAL_DESIRED_CHUNK_BUDGET,
  LogicalChunkCoordinate,
  selectChunksForView,
} from './chunk-visibility';
import {
  DepositChunkObjects,
  DepositChunkRenderer,
} from './deposit-chunk-renderer';
import { ForestChunkRenderer } from './forest-chunk-renderer';
import { AuthoritativeMapData } from './map/map-types';
import { TerrainChunkRenderer } from './terrain-chunk-renderer';
import { WaterChunkRenderer } from './water-chunk-renderer';

export const STREAMING_BUILD_BUDGET_MS = 4;

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
  readonly retainedCount: number;
  readonly queuedCount: number;
  readonly inFlightCount: number;
  readonly lastBundleBuildMs: number | null;
  readonly rollingBundleBuildMs: number | null;
  readonly peakVisibleCount: number;
  readonly initialReady: boolean;
  readonly buildBudgetMs: number;
  readonly initialDesiredBudget: number;
}

interface ChunkBundle {
  readonly coordinate: LogicalChunkCoordinate;
  readonly terrain: THREE.Mesh;
  readonly water: THREE.Mesh | null;
  readonly forest: THREE.InstancedMesh | null;
  readonly deposits: DepositChunkObjects;
}

interface ChunkRecord {
  readonly epoch: number;
  readonly coordinate: LogicalChunkCoordinate;
  state: ChunkLifecycleState;
  bundle?: ChunkBundle;
}

interface QueueEntry {
  readonly epoch: number;
  readonly viewRevision: number;
  readonly coordinate: LogicalChunkCoordinate;
}

export class ChunkStreamingManager {
  private readonly scene: THREE.Scene;
  private terrainRenderer: TerrainChunkRenderer | null = null;
  private waterRenderer: WaterChunkRenderer | null = null;
  private forestRenderer: ForestChunkRenderer | null = null;
  private depositRenderer: DepositChunkRenderer | null = null;
  private readonly records = new Map<string, ChunkRecord>();
  private queue: QueueEntry[] = [];
  private desiredKeys = new Set<string>();
  private initialVisibleKeys = new Set<string>();
  private currentSelection: ChunkViewSelection | null = null;
  private selectionSignature = '';
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

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  beginMap(data: AuthoritativeMapData, seaLevelSample: number): void {
    this.mapEpoch += 1;
    this.disposeCurrentRenderers();
    this.records.clear();
    this.queue = [];
    this.desiredKeys.clear();
    this.initialVisibleKeys.clear();
    this.currentSelection = null;
    this.selectionSignature = '';
    this.viewRevision = 0;
    this.initialReady = false;
    this.hasMapData = true;
    this.initialReadyPromise = new Promise<void>((resolve) => {
      this.resolveInitialReady = resolve;
    });
    this.terrainRenderer = new TerrainChunkRenderer(this.scene, data, []);
    this.waterRenderer = new WaterChunkRenderer(this.scene, data, seaLevelSample, []);
    this.forestRenderer = new ForestChunkRenderer(this.scene, data, []);
    this.depositRenderer = new DepositChunkRenderer(this.scene, data, []);
  }

  beginInitialView(camera: THREE.OrthographicCamera): Promise<void> {
    if (!this.hasMapData) {
      return Promise.resolve();
    }

    const selection = selectChunksForView(camera);
    this.initialVisibleKeys = new Set(selection.visible.map(chunkKey));
    this.applySelection(selection);
    this.resolveInitialReadiness();
    return this.initialReadyPromise;
  }

  update(camera: THREE.OrthographicCamera): void {
    if (!this.hasMapData) {
      return;
    }

    const selection = selectChunksForView(camera);
    const nextSignature = createChunkSelectionSignature(selection);
    if (nextSignature !== this.selectionSignature) {
      this.viewRevision += 1;
      this.applySelection(selection);
    }

    const frameStart = performance.now();
    while (this.queue.length > 0 && performance.now() - frameStart < STREAMING_BUILD_BUDGET_MS) {
      this.buildNextBundle();
    }
    this.resolveInitialReadiness();
  }

  getCurrentSelection(): ChunkViewSelection | null {
    return this.currentSelection;
  }

  getDiagnostics(): ChunkStreamingDiagnostics {
    let attachedCount = 0;
    let queuedCount = 0;
    for (const record of this.records.values()) {
      if (record.state === 'attached') {
        attachedCount += 1;
      } else if (record.state === 'queued') {
        queuedCount += 1;
      }
    }

    return {
      mapEpoch: this.mapEpoch,
      attachedCount,
      retainedCount: 0,
      queuedCount,
      inFlightCount: this.inFlightCount,
      lastBundleBuildMs: this.lastBundleBuildMs,
      rollingBundleBuildMs: this.rollingBundleBuildMs,
      peakVisibleCount: this.peakVisibleCount,
      initialReady: this.initialReady,
      buildBudgetMs: STREAMING_BUILD_BUDGET_MS,
      initialDesiredBudget: INITIAL_DESIRED_CHUNK_BUDGET,
    };
  }

  destroy(): void {
    this.disposeCurrentRenderers();
    this.records.clear();
    this.queue = [];
    this.desiredKeys.clear();
    this.initialVisibleKeys.clear();
    this.currentSelection = null;
    this.hasMapData = false;
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
      if (!this.desiredKeys.has(key) && record.state === 'attached') {
        this.retireRecord(record);
      } else if (!this.desiredKeys.has(key) && record.state === 'queued') {
        record.state = 'disposed';
        this.records.delete(key);
      }
    }

    this.queue = this.queue.filter((entry) => {
      const keep = entry.epoch === this.mapEpoch && this.desiredKeys.has(chunkKey(entry.coordinate));
      if (!keep) {
        const key = chunkKey(entry.coordinate);
        const record = this.records.get(key);
        if (record?.state === 'queued') {
          record.state = 'disposed';
          this.records.delete(key);
        }
      }
      return keep;
    });

    for (const coordinate of desiredCoordinates) {
      const key = chunkKey(coordinate);
      if (this.records.has(key)) {
        continue;
      }
      this.records.set(key, {
        epoch: this.mapEpoch,
        coordinate,
        state: 'queued',
      });
      this.queue.push({
        epoch: this.mapEpoch,
        viewRevision: this.viewRevision,
        coordinate,
      });
    }
  }

  private buildNextBundle(): void {
    const entry = this.queue.shift();
    if (!entry) {
      return;
    }

    const key = chunkKey(entry.coordinate);
    const record = this.records.get(key);
    if (!record) {
      return;
    }

    record.state = 'building';
    this.inFlightCount = 1;
    const startedAt = performance.now();
    let bundle: ChunkBundle | null = null;

    try {
      bundle = this.createBundle(entry.coordinate);
      record.state = 'ready';
      const stillUseful = entry.epoch === this.mapEpoch &&
        record.epoch === this.mapEpoch &&
        this.desiredKeys.has(key);
      if (!stillUseful) {
        this.disposeBundle(bundle);
        record.state = 'disposed';
        this.records.delete(key);
        return;
      }

      this.attachBundle(bundle);
      record.bundle = bundle;
      record.state = 'attached';
    } catch (error) {
      if (bundle) {
        this.disposeBundle(bundle);
      }
      record.state = 'disposed';
      this.records.delete(key);
      console.error('[chunk streaming] bundle build failed', {
        error,
        chunk: entry.coordinate,
        epoch: entry.epoch,
        viewRevision: entry.viewRevision,
      });
    } finally {
      const duration = performance.now() - startedAt;
      this.lastBundleBuildMs = duration;
      this.rollingBundleBuildMs = this.rollingBundleBuildMs === null
        ? duration
        : this.rollingBundleBuildMs * 0.8 + duration * 0.2;
      this.inFlightCount = 0;
    }
  }

  private createBundle(coordinate: LogicalChunkCoordinate): ChunkBundle {
    if (!this.terrainRenderer || !this.waterRenderer || !this.forestRenderer || !this.depositRenderer) {
      throw new Error('Chunk renderers are not initialized.');
    }

    let terrain: THREE.Mesh | null = null;
    let water: THREE.Mesh | null = null;
    let forest: THREE.InstancedMesh | null = null;
    let deposits: DepositChunkObjects | null = null;

    try {
      terrain = this.terrainRenderer.createChunk(coordinate.x, coordinate.y);
      water = this.waterRenderer.createChunk(coordinate.x, coordinate.y);
      forest = this.forestRenderer.createChunk(coordinate.x, coordinate.y);
      deposits = this.depositRenderer.createChunk(coordinate.x, coordinate.y);
      return { coordinate, terrain, water, forest, deposits };
    } catch (error) {
      if (terrain) {
        this.terrainRenderer.disposeChunk(terrain);
      }
      if (water) {
        this.waterRenderer.disposeChunk(water);
      }
      if (forest) {
        this.forestRenderer.disposeChunk(forest);
      }
      if (deposits) {
        this.depositRenderer.disposeChunk(deposits);
      }
      throw error;
    }
  }

  private attachBundle(bundle: ChunkBundle): void {
    if (!this.terrainRenderer || !this.waterRenderer || !this.forestRenderer || !this.depositRenderer) {
      throw new Error('Chunk renderers are not initialized.');
    }

    const { coordinate } = bundle;
    this.terrainRenderer.attachChunk(coordinate.x, coordinate.y, bundle.terrain);
    if (bundle.water) {
      this.waterRenderer.attachChunk(coordinate.x, coordinate.y, bundle.water);
    }
    if (bundle.forest) {
      this.forestRenderer.attachChunk(coordinate.x, coordinate.y, bundle.forest);
    }
    this.depositRenderer.attachChunk(coordinate.x, coordinate.y, bundle.deposits);
  }

  private disposeBundle(bundle: ChunkBundle): void {
    this.terrainRenderer?.disposeChunk(bundle.terrain);
    if (bundle.water) {
      this.waterRenderer?.disposeChunk(bundle.water);
    }
    if (bundle.forest) {
      this.forestRenderer?.disposeChunk(bundle.forest);
    }
    this.depositRenderer?.disposeChunk(bundle.deposits);
  }

  private retireRecord(record: ChunkRecord): void {
    record.state = 'retiring';
    const { x, y } = record.coordinate;
    this.terrainRenderer?.removeChunk(x, y);
    this.waterRenderer?.removeChunk(x, y);
    this.forestRenderer?.removeChunk(x, y);
    this.depositRenderer?.removeChunk(x, y);
    record.state = 'disposed';
    this.records.delete(chunkKey(record.coordinate));
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
    this.forestRenderer?.destroy();
    this.depositRenderer?.destroy();
    this.terrainRenderer = null;
    this.waterRenderer = null;
    this.forestRenderer = null;
    this.depositRenderer = null;
  }
}

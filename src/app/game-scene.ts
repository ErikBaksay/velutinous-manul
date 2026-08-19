import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { MAP_HEIGHT, MAP_WIDTH, AuthoritativeMapData } from './map/map-types';
import { TERRAIN_VERTICAL_SCALE } from './map/terrain-generation';
import {
  BASE_CAMERA_VIEW_HEIGHT,
  CAMERA_NAVIGATION_PLANE_Y,
  CameraConstraintOptions,
  CameraController,
  MAX_CAMERA_VIEW_HEIGHT,
} from './camera-controller';
import { ChunkDebugVisualizer } from './chunk-debug-visualizer';
import { ChunkStreamingManager } from './chunk-streaming-manager';
import { RenderDiagnostics, RenderPassTimings } from './render-diagnostics';
import { getRenderQualitySettings, RenderQualitySettings } from './render-quality';
import { getRuntimeQueryParam } from './runtime-query';
import { VisualAssetRegistry } from './visual-asset-registry';
import {
  BuildingDefinition,
  CellCoordinate,
  cellToWorldCenter,
  deriveRoadConnectionMasks,
  getRoadCellKey,
  getRotatedFootprintSize,
  getConstructionTerrainSample,
  terrainHitPointToCellCoordinate,
  VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID,
  VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID,
} from './construction';
import type { PlacedBuildingState, RoadState } from './save/save-contract';
import type { RoadConnectionMask } from './construction/road-network';
import {
  createRaisedRoadTileGeometry,
  deriveRoadGradeProfiles,
  type RoadGradeProfile,
} from './construction/road-geometry';
import { clientPointToNormalizedDeviceCoordinate } from './construction/selection';

export interface GameSceneCellInteractionCallbacks {
  readonly onCellHover: (cell: CellCoordinate) => void;
  readonly onCellClick: (cell: CellCoordinate) => void;
  readonly onPointerLeave: () => void;
}

export interface GameScenePlacementPreview {
  readonly occupiedCells: readonly CellCoordinate[];
  readonly valid: boolean;
  readonly definitionId: string;
  readonly rotationQuarterTurns: 0 | 1 | 2 | 3;
}

export interface GameSceneRoadPreview {
  readonly cell: CellCoordinate;
  readonly valid: boolean;
}

const CAMERA_ORBIT_RADIUS = Math.sqrt(90 ** 2 + 90 ** 2 + 90 ** 2);
const CAMERA_FAR_PLANE = Math.ceil(
  Math.hypot(MAP_WIDTH, MAP_HEIGHT) + CAMERA_ORBIT_RADIUS + TERRAIN_VERTICAL_SCALE + 16,
);
const CAMERA_FOG_NEAR = 250;
const CAMERA_MAP_EDGE_PADDING = 32;
const CAMERA_MINIMUM_ELEVATION = 40;
const CAMERA_MAXIMUM_ELEVATION = 88;
const MAP_BACKDROP_SIZE = Math.max(MAP_WIDTH, MAP_HEIGHT) * 3;
const MAP_DIMENSIONS = { width: MAP_WIDTH, height: MAP_HEIGHT } as const;
const MINE_ASSET_ID = 'mine_shaft_house_lod0';
const WAREHOUSE_ASSET_ID = 'warehouse_lod0';
const BUILDING_LOD_VISIBLE_HEIGHT = 58;

export class GameScene {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null;
  private readonly passTimings: RenderPassTimings;
  private readonly camera: THREE.OrthographicCamera;
  private readonly cameraController: CameraController;
  private readonly chunkStreamingManager: ChunkStreamingManager;
  private readonly visualAssetRegistry = new VisualAssetRegistry();
  private readonly quality: RenderQualitySettings;
  private readonly chunkDebugVisualizer: ChunkDebugVisualizer | null;
  private readonly mapBackdrop: THREE.Mesh;
  private readonly mapCorners = createMapCorners();
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly selectedCellVisual = createSelectedCellVisual();
  private readonly placementPreviewVisual = createPlacementPreviewVisual();
  private readonly placementPreviewModelVisual = new THREE.Group();
  private readonly placedBuildingVisuals = new THREE.Group();
  private readonly roadVisuals = new THREE.Group();
  private readonly roadPreviewVisual = new THREE.Group();
  private readonly onCanvasPointerMove = (event: PointerEvent): void => {
    const cell = this.getTerrainCellFromPointer(event.clientX, event.clientY);
    if (cell) {
      this.cellInteractionCallbacks?.onCellHover(cell);
    }
  };
  private readonly onCanvasClick = (event: MouseEvent): void => {
    const cell = this.getTerrainCellFromPointer(event.clientX, event.clientY);
    if (cell) {
      this.cellInteractionCallbacks?.onCellClick(cell);
    }
  };
  private readonly onCanvasPointerLeave = (): void => {
    this.cellInteractionCallbacks?.onPointerLeave();
  };
  private cellInteractionCallbacks: GameSceneCellInteractionCallbacks | null = null;
  private mapData: AuthoritativeMapData | null = null;
  private frameHandle = 0;
  private previousFrameTime = performance.now();
  private lastCameraFar = Number.NaN;
  private frameTimeMs = 16.67;
  private fps = 60;
  private renderCpuMs = 0;
  private roadStates: readonly RoadState[] = [];
  private roadPreviewCacheKey: string | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
  ) {
    this.quality = getRenderQualitySettings();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = this.quality.shadows && !isChunkDebugEnabled();
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.1, CAMERA_FAR_PLANE);
    this.camera.position.set(90, 108, 90);
    this.camera.lookAt(0, CAMERA_NAVIGATION_PLANE_Y, 0);
    this.cameraController = new CameraController(this.camera, canvas);
    this.cameraController.setConstraints(CAMERA_CONSTRAINTS);
    this.chunkStreamingManager = new ChunkStreamingManager(
      this.scene,
      this.visualAssetRegistry,
      this.quality,
    );
    this.chunkDebugVisualizer = isChunkDebugEnabled()
      ? new ChunkDebugVisualizer(this.scene, host)
      : null;

    this.scene.background = new THREE.Color(0x76918e);
    this.scene.fog = new THREE.Fog(0x76918e, CAMERA_FOG_NEAR, CAMERA_FAR_PLANE);
    this.mapBackdrop = createMapBackdrop();
    this.placedBuildingVisuals.name = 'construction-placed-buildings';
    this.roadVisuals.name = 'construction-placed-roads';
    this.roadPreviewVisual.name = 'construction-road-preview';
    this.roadPreviewVisual.visible = false;
    this.scene.add(this.mapBackdrop);
    this.scene.add(this.selectedCellVisual);
    this.scene.add(this.placementPreviewVisual);
    this.placementPreviewModelVisual.name = 'construction-placement-preview-model';
    this.scene.add(this.placementPreviewModelVisual);
    this.scene.add(this.roadVisuals);
    this.scene.add(this.roadPreviewVisual);
    this.scene.add(this.placedBuildingVisuals);
    this.canvas.addEventListener('pointermove', this.onCanvasPointerMove);
    this.canvas.addEventListener('click', this.onCanvasClick);
    this.canvas.addEventListener('pointerleave', this.onCanvasPointerLeave);

    this.addSoftLighting();
    const postProcessor = createPostProcessor(this.renderer, this.scene, this.camera, host, this.quality);
    this.composer = postProcessor.composer;
    this.passTimings = postProcessor.timings;
    instrumentShadowPass(this.renderer, this.passTimings);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.frameHandle = requestAnimationFrame(this.render);
  }

  destroy(): void {
    cancelAnimationFrame(this.frameHandle);
    this.canvas.removeEventListener('pointermove', this.onCanvasPointerMove);
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('pointerleave', this.onCanvasPointerLeave);
    this.cellInteractionCallbacks = null;
    this.cameraController.dispose();
    this.chunkStreamingManager.destroy();
    this.visualAssetRegistry.destroy();
    this.chunkDebugVisualizer?.dispose();
    this.resizeObserver.disconnect();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) {
        return;
      }

      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    });
    this.composer?.dispose();
    this.renderer.dispose();
  }

  async setMapData(
    data: AuthoritativeMapData,
    seaLevelSample: number,
    startingCell?: number,
  ): Promise<void> {
    this.mapData = data;
    this.setSelectedCell(null);
    this.setPlacementPreview(null);
    this.setRoadPreview(null);
    this.clearRoadVisuals();
    this.roadStates = [];
    this.clearPlacedBuildingVisuals();
    await this.visualAssetRegistry.load();
    this.chunkStreamingManager.beginMap(data, seaLevelSample);
    const seaLevelWorld = (seaLevelSample / 65_535) * TERRAIN_VERTICAL_SCALE + 0.08;
    this.cameraController.setNavigationPlaneY(seaLevelWorld);
    this.mapBackdrop.position.y = seaLevelWorld - 0.04;

    if (startingCell === undefined) {
      this.cameraController.reset(0, 0);
      return this.chunkStreamingManager.beginInitialView(
        this.camera,
        this.cameraController.getNavigationState(),
      );
    }

    const cellX = startingCell % MAP_WIDTH;
    const cellY = Math.floor(startingCell / MAP_WIDTH);
    this.cameraController.reset(
      cellX - MAP_WIDTH / 2 + 0.5,
      cellY - MAP_HEIGHT / 2 + 0.5,
    );
    return this.chunkStreamingManager.beginInitialView(
      this.camera,
      this.cameraController.getNavigationState(),
    );
  }

  setNavigationEnabled(enabled: boolean): void {
    this.cameraController.setNavigationEnabled(enabled);
  }

  setConstructionVisualState(
    clearedCellIndices: readonly number[],
    occupiedCellIndices: readonly number[],
  ): void {
    this.chunkStreamingManager.setConstructionVisualState(
      clearedCellIndices,
      occupiedCellIndices,
    );
  }

  focusCell(cell: CellCoordinate): void {
    if (!this.mapData) {
      return;
    }
    const center = cellToWorldCenter(cell, MAP_DIMENSIONS);
    this.cameraController.reset(center.x, center.z);
  }

  setCellInteractionCallbacks(
    callbacks: GameSceneCellInteractionCallbacks | null,
  ): void {
    this.cellInteractionCallbacks = callbacks;
  }

  setSelectedCell(cell: CellCoordinate | null): void {
    if (!cell || !this.mapData) {
      this.selectedCellVisual.visible = false;
      return;
    }

    const center = cellToWorldCenter(cell, MAP_DIMENSIONS);
    const terrain = getConstructionTerrainSample(this.mapData, MAP_DIMENSIONS, cell);
    this.selectedCellVisual.position.set(center.x, terrain.elevationWorld + 0.06, center.z);
    this.selectedCellVisual.visible = true;
  }

  setPlacementPreview(preview: GameScenePlacementPreview | null): void {
    disposeObjectChildren(this.placementPreviewModelVisual);
    if (!preview || !this.mapData) {
      this.placementPreviewVisual.visible = false;
      this.placementPreviewModelVisual.visible = false;
      return;
    }

    const color = preview.valid ? 0x72d69a : 0xf07878;
    for (let index = 0; index < this.placementPreviewVisual.children.length; index += 1) {
      const cellVisual = this.placementPreviewVisual.children[index];
      if (!(cellVisual instanceof THREE.Group)) {
        continue;
      }
      const cell = preview.occupiedCells[index];
      cellVisual.visible = cell !== undefined;
      if (!cell) {
        continue;
      }
      const center = cellToWorldCenter(cell, MAP_DIMENSIONS);
      const terrain = getConstructionTerrainSample(this.mapData, MAP_DIMENSIONS, cell);
      cellVisual.position.set(center.x, terrain.elevationWorld + 0.09, center.z);
      setCellVisualColor(cellVisual, color, 0.36, 0.98);
    }
    this.placementPreviewVisual.visible = preview.occupiedCells.length > 0;

    const assetId = getBuildingAssetId(preview.definitionId);
    const validCells = preview.occupiedCells.filter((cell) =>
      cell.x >= 0 && cell.x < MAP_WIDTH && cell.y >= 0 && cell.y < MAP_HEIGHT,
    );
    if (!assetId || validCells.length === 0 || !this.visualAssetRegistry.has(assetId)) {
      this.placementPreviewModelVisual.visible = false;
      return;
    }
    const minimumX = Math.min(...preview.occupiedCells.map((cell) => cell.x));
    const maximumX = Math.max(...preview.occupiedCells.map((cell) => cell.x));
    const minimumY = Math.min(...preview.occupiedCells.map((cell) => cell.y));
    const maximumY = Math.max(...preview.occupiedCells.map((cell) => cell.y));
    const center = cellToWorldCenter(
      { x: (minimumX + maximumX) / 2, y: (minimumY + maximumY) / 2 },
      MAP_DIMENSIONS,
    );
    const baseElevation = validCells.reduce((total, cell) =>
      total + getConstructionTerrainSample(this.mapData!, MAP_DIMENSIONS, cell).elevationWorld,
    0) / validCells.length;
    const model = createAuthoredBuildingVisual(
      this.visualAssetRegistry,
      assetId,
      'preview',
      true,
      preview.valid,
    );
    model.position.set(center.x, baseElevation + 0.04, center.z);
    model.rotation.y = -preview.rotationQuarterTurns * Math.PI / 2;
    this.placementPreviewModelVisual.add(model);
    this.placementPreviewModelVisual.visible = true;
  }

  setRoadPreview(preview: GameSceneRoadPreview | null): void {
    const cacheKey = preview ? `${preview.cell.x},${preview.cell.y}:${preview.valid}` : null;
    if (cacheKey === this.roadPreviewCacheKey) {
      return;
    }
    this.roadPreviewCacheKey = cacheKey;
    for (const child of this.roadVisuals.children) {
      child.visible = true;
    }
    disposeObjectChildren(this.roadPreviewVisual);
    if (!preview || !this.mapData || !isCellInMap(preview.cell)) {
      this.roadPreviewVisual.visible = false;
      return;
    }

    const isDuplicate = this.roadStates.some((road) =>
      road.cell.x === preview.cell.x && road.cell.y === preview.cell.y,
    );
    if (!preview.valid || isDuplicate) {
      const previewRoads = isDuplicate ? this.roadStates : [{ cell: preview.cell }];
      const previewMask = isDuplicate
        ? this.roadConnectionMasksForCurrentRoads().get(getRoadCellKey(preview.cell)) ?? 0
        : 0;
      const grade = deriveRoadGradeProfiles(this.mapData, MAP_DIMENSIONS, previewRoads)
        .get(getRoadCellKey(preview.cell));
      if (grade) {
        const placedVisual = this.roadVisuals.children.find((child) =>
          child.userData['roadCellKey'] === getRoadCellKey(preview.cell),
        );
        if (placedVisual) {
          placedVisual.visible = false;
        }
        this.roadPreviewVisual.add(createRoadCellVisual(
          this.mapData,
          preview.cell,
          previewMask,
          grade,
          'invalid-preview',
        ));
      }
      this.roadPreviewVisual.visible = true;
      return;
    }

    const proposedRoads = [...this.roadStates, { cell: preview.cell }];
    const proposedMasks = deriveRoadConnectionMasks(proposedRoads);
    const proposedGrades = deriveRoadGradeProfiles(this.mapData, MAP_DIMENSIONS, proposedRoads);
    const affectedKeys = new Set([
      getRoadCellKey(preview.cell),
      getRoadCellKey({ x: preview.cell.x, y: preview.cell.y - 1 }),
      getRoadCellKey({ x: preview.cell.x + 1, y: preview.cell.y }),
      getRoadCellKey({ x: preview.cell.x, y: preview.cell.y + 1 }),
      getRoadCellKey({ x: preview.cell.x - 1, y: preview.cell.y }),
    ]);
    for (const child of this.roadVisuals.children) {
      if (affectedKeys.has(child.userData['roadCellKey'])) {
        child.visible = false;
      }
    }
    for (const road of proposedRoads) {
      const key = getRoadCellKey(road.cell);
      if (!affectedKeys.has(key)) {
        continue;
      }
      const grade = proposedGrades.get(key);
      if (!grade) {
        continue;
      }
      this.roadPreviewVisual.add(createRoadCellVisual(
        this.mapData,
        road.cell,
        proposedMasks.get(key) ?? 0,
        grade,
        key === getRoadCellKey(preview.cell) ? 'valid-preview' : 'placed',
      ));
    }
    this.roadPreviewVisual.visible = true;
  }

  setRoads(
    roads: readonly RoadState[],
    connectionMasks: ReadonlyMap<string, RoadConnectionMask>,
  ): void {
    this.roadStates = roads.map((road) => ({ cell: { ...road.cell } }));
    disposeObjectChildren(this.roadPreviewVisual);
    this.roadPreviewVisual.visible = false;
    this.roadPreviewCacheKey = null;
    this.clearRoadVisuals();
    if (!this.mapData) {
      return;
    }
    const gradeProfiles = deriveRoadGradeProfiles(this.mapData, MAP_DIMENSIONS, roads);
    for (const road of roads) {
      if (!isCellInMap(road.cell)) {
        continue;
      }
      const key = getRoadCellKey(road.cell);
      const grade = gradeProfiles.get(key);
      if (!grade) {
        continue;
      }
      this.roadVisuals.add(createRoadCellVisual(
        this.mapData,
        road.cell,
        connectionMasks.get(key) ?? 0,
        grade,
        'placed',
      ));
    }
  }

  private roadConnectionMasksForCurrentRoads(): ReadonlyMap<string, RoadConnectionMask> {
    return deriveRoadConnectionMasks(this.roadStates);
  }

  setPlacedBuildings(
    buildings: readonly PlacedBuildingState[],
    definitions: ReadonlyMap<string, BuildingDefinition>,
  ): void {
    this.clearPlacedBuildingVisuals();
    if (!this.mapData) {
      return;
    }

    for (const building of buildings) {
      const definition = definitions.get(building.definitionId);
      if (!definition) {
        continue;
      }
      const size = getRotatedFootprintSize(definition.footprint, building.rotationQuarterTurns);
      const center = cellToWorldCenter(
        { x: building.origin.x + size.width / 2 - 0.5, y: building.origin.y + size.height / 2 - 0.5 },
        MAP_DIMENSIONS,
      );
      let baseElevation = 0;
      for (let y = 0; y < size.height; y += 1) {
        for (let x = 0; x < size.width; x += 1) {
          baseElevation += getConstructionTerrainSample(
            this.mapData,
            MAP_DIMENSIONS,
            { x: building.origin.x + x, y: building.origin.y + y },
          ).elevationWorld;
        }
      }
      baseElevation /= size.width * size.height;

      const assetId = getBuildingAssetId(building.definitionId);
      if (assetId && this.visualAssetRegistry.has(assetId)) {
        const authoredBuilding = createAuthoredBuildingVisual(
          this.visualAssetRegistry,
          assetId,
          building.id,
        );
        authoredBuilding.position.set(center.x, baseElevation, center.z);
        authoredBuilding.rotation.y = -building.rotationQuarterTurns * Math.PI / 2;
        this.placedBuildingVisuals.add(authoredBuilding);
      } else {
        const height = 2.8;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(size.width * 0.82, height, size.height * 0.82),
          new THREE.MeshStandardMaterial({
            color: 0xb63c3c,
            roughness: 0.78,
            metalness: 0.05,
          }),
        );
        mesh.name = `construction-building-${building.id}`;
        mesh.position.set(center.x, baseElevation + height / 2, center.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.placedBuildingVisuals.add(mesh);
      }
    }
  }

  private getTerrainCellFromPointer(clientX: number, clientY: number): CellCoordinate | null {
    const bounds = this.canvas.getBoundingClientRect();
    const normalized = clientPointToNormalizedDeviceCoordinate(clientX, clientY, bounds);
    if (!normalized) {
      return null;
    }

    this.pointer.set(normalized.x, normalized.y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.chunkStreamingManager.raycastTerrain(this.raycaster);
    if (!hit) {
      return null;
    }

    return terrainHitPointToCellCoordinate({ x: hit.x, z: hit.z }, MAP_DIMENSIONS);
  }

  private clearPlacedBuildingVisuals(): void {
    disposeObjectChildren(this.placedBuildingVisuals);
  }

  private clearRoadVisuals(): void {
    disposeObjectChildren(this.roadVisuals);
  }

  private readonly render = (): void => {
    this.frameHandle = requestAnimationFrame(this.render);
    const now = performance.now();
    this.frameTimeMs = this.frameTimeMs * 0.9 + Math.max(0.1, now - this.previousFrameTime) * 0.1;
    this.fps = 1_000 / this.frameTimeMs;
    this.previousFrameTime = now;
    this.renderer.info.reset();
    this.passTimings.sceneRenderCpuMs = 0;
    this.passTimings.shadowPassCpuMs = 0;
    this.passTimings.gtaoPassCpuMs = 0;
    this.cameraController.update(this.frameTimeMs / 1_000);
    updateBuildingVisualLods(
      this.placedBuildingVisuals,
      this.cameraController.getDebugState().visibleViewHeight > BUILDING_LOD_VISIBLE_HEIGHT ? 1 : 0,
    );
    this.updateCameraClipping();
    this.chunkStreamingManager.update(this.camera, this.cameraController.getNavigationState());
    const currentSelection = this.chunkStreamingManager.getCurrentSelection();
    const renderStartedAt = performance.now();
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.renderCpuMs = performance.now() - renderStartedAt;
    if (!this.composer) {
      this.passTimings.sceneRenderCpuMs = this.renderCpuMs;
    }
    if (this.chunkDebugVisualizer && currentSelection) {
      const render: RenderDiagnostics = {
        quality: this.quality.preset,
        fps: this.fps,
        frameTimeMs: this.frameTimeMs,
        renderCpuMs: this.renderCpuMs,
        sceneRenderCpuMs: this.passTimings.sceneRenderCpuMs,
        shadowPassCpuMs: this.passTimings.shadowPassCpuMs,
        gtaoPassCpuMs: this.passTimings.gtaoPassCpuMs,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        points: this.renderer.info.render.points,
        lines: this.renderer.info.render.lines,
      };
      this.chunkDebugVisualizer.update(
        currentSelection,
        this.chunkStreamingManager.getDiagnostics(),
        this.cameraController.getDebugState(),
        render,
      );
    }
  };

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    const aspect = width / height;
    const viewHeight = BASE_CAMERA_VIEW_HEIGHT;

    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();

    const pixelRatio = Math.min(window.devicePixelRatio, this.quality.pixelRatio);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.composer?.setPixelRatio(pixelRatio);
  }

  private updateCameraClipping(): void {
    let maximumDistance = 0;
    for (const corner of this.mapCorners) {
      maximumDistance = Math.max(maximumDistance, this.camera.position.distanceTo(corner));
    }
    const nextFar = Math.max(512, maximumDistance + 64);
    if (Math.abs(nextFar - this.lastCameraFar) > 0.5) {
      this.camera.far = nextFar;
      this.camera.updateProjectionMatrix();
      this.lastCameraFar = nextFar;
    }
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = Math.min(CAMERA_FOG_NEAR, this.camera.far * 0.65);
      this.scene.fog.far = this.camera.far;
    }
  }

  private addSoftLighting(): void {
    const ambient = new THREE.HemisphereLight(0xb9d7dc, 0x263d38, 1.5);
    this.scene.add(ambient);

    const daylight = new THREE.DirectionalLight(0xffe4bf, 2.0);
    daylight.position.set(-130, 180, 90);
    daylight.castShadow = this.quality.shadows;
    daylight.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    daylight.shadow.camera.left = -560;
    daylight.shadow.camera.right = 560;
    daylight.shadow.camera.top = 560;
    daylight.shadow.camera.bottom = -560;
    daylight.shadow.camera.near = 20;
    daylight.shadow.camera.far = 520;
    daylight.shadow.bias = -0.00025;
    daylight.shadow.normalBias = 0.035;
    this.scene.add(daylight);

    const coolFill = new THREE.DirectionalLight(0x8cbcc7, 0.46);
    coolFill.position.set(100, 110, -120);
    this.scene.add(coolFill);
  }

}

function createPostProcessor(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.OrthographicCamera,
  host: HTMLElement,
  quality: RenderQualitySettings,
): { composer: EffectComposer | null; timings: RenderPassTimings } {
  const timings: RenderPassTimings = {
    sceneRenderCpuMs: 0,
    shadowPassCpuMs: 0,
    gtaoPassCpuMs: 0,
  };
  if (!quality.postProcessing || isChunkDebugEnabled()) {
    return { composer: null, timings };
  }
  try {
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    instrumentPostProcessingPass(renderPass, (duration) => {
      timings.sceneRenderCpuMs = duration;
    });
    composer.addPass(renderPass);
    const gtao = new GTAOPass(scene, camera, Math.max(host.clientWidth, 1), Math.max(host.clientHeight, 1));
    instrumentPostProcessingPass(gtao, (duration) => {
      timings.gtaoPassCpuMs = duration;
    }, true);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.updateGtaoMaterial({
      radius: 3.4,
      distanceExponent: 1.35,
      thickness: 1.15,
      distanceFallOff: 1.3,
      scale: 1.15,
      samples: quality.gtaoSamples,
    });
    gtao.updatePdMaterial({
      lumaPhi: 2,
      depthPhi: 2,
      normalPhi: 2,
      radius: 8,
      samples: quality.gtaoDenoiseSamples,
    });
    composer.addPass(gtao);
    return { composer, timings };
  } catch (error) {
    console.warn('[scene] postprocessing unavailable; using direct renderer', error);
    return { composer: null, timings };
  }
}

function instrumentPostProcessingPass(
  pass: Pass,
  record: (durationMs: number) => void,
  disableShadows = false,
): void {
  const originalRender = pass.render.bind(pass);
  pass.render = ((renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
    const startedAt = performance.now();
    const shadowMap = renderer.shadowMap;
    const shadowMapEnabled = shadowMap.enabled;
    if (disableShadows) {
      shadowMap.enabled = false;
    }
    try {
      originalRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      shadowMap.enabled = shadowMapEnabled;
      record(performance.now() - startedAt);
    }
  }) as Pass['render'];
}

function instrumentShadowPass(renderer: THREE.WebGLRenderer, timings: RenderPassTimings): void {
  const shadowMap = renderer.shadowMap;
  const originalRender = shadowMap.render.bind(shadowMap);
  shadowMap.render = ((shadowsArray: THREE.Light[], scene: THREE.Scene, camera: THREE.Camera) => {
    const startedAt = performance.now();
    try {
      originalRender(shadowsArray, scene, camera);
    } finally {
      timings.shadowPassCpuMs += performance.now() - startedAt;
    }
  }) as typeof shadowMap.render;
}

const CAMERA_CONSTRAINTS: CameraConstraintOptions = {
  bounds: {
    minimumX: -MAP_WIDTH / 2,
    maximumX: MAP_WIDTH / 2,
    minimumZ: -MAP_HEIGHT / 2,
    maximumZ: MAP_HEIGHT / 2,
  },
  terrainMinimumY: 0,
  terrainMaximumY: TERRAIN_VERTICAL_SCALE + 5,
  edgePadding: CAMERA_MAP_EDGE_PADDING,
  minimumElevationDegrees: CAMERA_MINIMUM_ELEVATION,
  maximumElevationDegrees: CAMERA_MAXIMUM_ELEVATION,
  maximumVisibleHeight: MAX_CAMERA_VIEW_HEIGHT,
};

function createMapBackdrop(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(MAP_BACKDROP_SIZE, MAP_BACKDROP_SIZE);
  const material = new THREE.MeshBasicMaterial({
    color: 0x2e6470,
    depthWrite: false,
  });
  const backdrop = new THREE.Mesh(geometry, material);
  backdrop.name = 'map-background-water';
  backdrop.rotation.x = -Math.PI / 2;
  backdrop.position.y = CAMERA_NAVIGATION_PLANE_Y - 0.04;
  backdrop.renderOrder = -1;
  return backdrop;
}

function isCellInMap(cell: CellCoordinate): boolean {
  return cell.x >= 0 && cell.x < MAP_WIDTH && cell.y >= 0 && cell.y < MAP_HEIGHT;
}

function createRoadCellVisual(
  mapData: AuthoritativeMapData,
  cell: CellCoordinate,
  connectionMask: RoadConnectionMask,
  grade: RoadGradeProfile,
  style: 'placed' | 'valid-preview' | 'invalid-preview',
): THREE.Group {
  const group = new THREE.Group();
  group.name = `construction-road-${cell.x}-${cell.y}`;
  group.userData['roadCellKey'] = getRoadCellKey(cell);
  const center = cellToWorldCenter(cell, MAP_DIMENSIONS);
  group.position.set(center.x, 0, center.z);
  const preview = style !== 'placed';
  const validPreview = style === 'valid-preview';
  const surfaceColor = validPreview ? 0x527d69 : style === 'invalid-preview' ? 0x9e5450 : 0x303a3b;
  const embankmentColor = validPreview ? 0x82977a : style === 'invalid-preview' ? 0xa9776e : 0x81765f;
  const markingColor = validPreview ? 0xc9e2ce : style === 'invalid-preview' ? 0xf1b1a7 : 0xd8d0ae;
  const opacity = preview ? 0.72 : 1;
  const geometries = createRaisedRoadTileGeometry({
    mapData,
    dimensions: MAP_DIMENSIONS,
    cell,
    connectionMask,
    grade,
  });

  const createMaterial = (color: number, roughness: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0,
      transparent: preview,
      opacity,
      depthWrite: !preview,
      side: THREE.DoubleSide,
    });
  const addMesh = (
    geometry: THREE.BufferGeometry | null,
    color: number,
    roughness: number,
  ): void => {
    if (!geometry) {
      return;
    }
    const mesh = new THREE.Mesh(geometry, createMaterial(color, roughness));
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
  };
  addMesh(geometries.embankment, embankmentColor, 0.96);
  addMesh(geometries.asphalt, surfaceColor, 0.9);
  addMesh(geometries.markings, markingColor, 0.82);

  return group;
}

function createSelectedCellVisual(): THREE.Group {
  const visual = createCellVisual();
  visual.name = 'construction-selected-cell';
  setCellVisualColor(visual, 0xf0c08c, 0.24, 0.92);
  visual.visible = false;
  return visual;
}

function createPlacementPreviewVisual(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'construction-placement-preview';
  for (let index = 0; index < 4; index += 1) {
    const cellVisual = createCellVisual();
    cellVisual.visible = false;
    group.add(cellVisual);
  }
  group.visible = false;
  return group;
}

function createCellVisual(): THREE.Group {
  const group = new THREE.Group();
  const tileGeometry = new THREE.PlaneGeometry(1, 1);
  const tile = new THREE.Mesh(
    tileGeometry,
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  tile.rotation.x = -Math.PI / 2;
  tile.renderOrder = 5;

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(tileGeometry),
    new THREE.LineBasicMaterial({
      transparent: true,
      depthWrite: false,
    }),
  );
  border.rotation.x = -Math.PI / 2;
  border.renderOrder = 6;

  group.add(tile, border);
  return group;
}

function setCellVisualColor(
  group: THREE.Group,
  color: number,
  tileOpacity: number,
  borderOpacity: number,
): void {
  const tile = group.children.find((child) => child instanceof THREE.Mesh);
  if (tile instanceof THREE.Mesh && tile.material instanceof THREE.MeshBasicMaterial) {
    tile.material.color.setHex(color);
    tile.material.opacity = tileOpacity;
  }
  const border = group.children.find((child) => child instanceof THREE.LineSegments);
  if (border instanceof THREE.LineSegments && border.material instanceof THREE.LineBasicMaterial) {
    border.material.color.setHex(color);
    border.material.opacity = borderOpacity;
  }
}

function disposeObjectChildren(group: THREE.Group): void {
  for (const child of [...group.children]) {
    child.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    child.removeFromParent();
  }
}

function createAuthoredBuildingVisual(
  assets: VisualAssetRegistry,
  assetId: string,
  buildingId: string,
  preview = false,
  valid = true,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `construction-building-${buildingId}`;
  for (const lod of preview ? [0] as const : [0, 1] as const) {
    const asset = assets.getLodAsset(assetId, lod);
    const materials = (Array.isArray(asset.material) ? asset.material : [asset.material])
      .map((material) => {
        const clone = material.clone();
        if (preview) {
          clone.transparent = true;
          clone.opacity = 0.56;
          clone.depthWrite = false;
          if (clone instanceof THREE.MeshStandardMaterial) {
            clone.color.lerp(new THREE.Color(valid ? 0x72d69a : 0xf07878), 0.34);
          }
        }
        return clone;
      });
    const mesh = new THREE.Mesh(
      asset.geometry.clone(),
      Array.isArray(asset.material) ? materials : materials[0],
    );
    mesh.name = `${group.name}-lod${lod}`;
    mesh.userData['buildingLod'] = lod;
    mesh.visible = lod === 0;
    mesh.castShadow = !preview;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function updateBuildingVisualLods(group: THREE.Group, activeLod: 0 | 1): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    const buildingLod = object.userData['buildingLod'];
    if (buildingLod === 0 || buildingLod === 1) {
      object.visible = buildingLod === activeLod;
    }
  });
}

function getBuildingAssetId(definitionId: string): string | null {
  if (definitionId === VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID) {
    return MINE_ASSET_ID;
  }
  if (definitionId === VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID) {
    return WAREHOUSE_ASSET_ID;
  }
  return null;
}

function createMapCorners(): readonly THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const x of [CAMERA_CONSTRAINTS.bounds.minimumX, CAMERA_CONSTRAINTS.bounds.maximumX]) {
    for (const y of [CAMERA_CONSTRAINTS.terrainMinimumY, CAMERA_CONSTRAINTS.terrainMaximumY]) {
      for (const z of [CAMERA_CONSTRAINTS.bounds.minimumZ, CAMERA_CONSTRAINTS.bounds.maximumZ]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return corners;
}

function isChunkDebugEnabled(): boolean {
  return getRuntimeQueryParam('debug') === 'chunks';
}

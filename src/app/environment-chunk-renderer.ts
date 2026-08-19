import * as THREE from 'three';
import { AuthoritativeMapData } from './map/map-types';
import {
  deterministicVisualValue,
  getTerrainVisualProfile,
  isPlacementCompatible,
  sampleTerrainVisual,
  TerrainVisualProfile,
  TerrainVisualSample,
} from './terrain-visuals';
import {
  ChunkCoordinate,
  createActiveChunkCoordinates,
  TERRAIN_CHUNK_SIZE,
} from './terrain-chunk-renderer';
import { getTerrainCellCache } from './terrain-cell-cache';
import { getRenderQualitySettings, RenderQualitySettings } from './render-quality';
import { getRuntimeQueryParam } from './runtime-query';
import { AssetPrototype, VisualAssetFamily, VisualAssetRegistry } from './visual-asset-registry';
import { MAP_HEIGHT, MAP_WIDTH } from './map/map-types';

export interface EnvironmentChunkObjects {
  readonly meshes: readonly THREE.BatchedMesh[];
  readonly instanceCount: number;
  readonly lod: 0 | 1;
}

interface Placement {
  readonly assetId: string;
  readonly family: 'canopy' | 'understory' | 'rock' | 'shore';
  readonly sample: TerrainVisualSample;
  readonly scale: number;
  readonly yaw: number;
  readonly offsetX: number;
  readonly offsetZ: number;
}

const UP = new THREE.Vector3(0, 1, 0);

export class EnvironmentChunkRenderer {
  private readonly group = new THREE.Group();
  private readonly chunks = new Map<string, EnvironmentChunkObjects>();
  private readonly data: AuthoritativeMapData;
  private readonly assets: VisualAssetRegistry;
  private readonly quality: RenderQualitySettings;
  private readonly viewTarget = new THREE.Vector3();
  private readonly viewDirection = new THREE.Vector3();
  private readonly lodRefreshQueue: string[] = [];
  private clearedCellIndices = new Set<number>();
  private lodViewSignature = '';
  private viewHeight = 128;

  constructor(
    scene: THREE.Scene,
    data: AuthoritativeMapData,
    assets: VisualAssetRegistry,
    initialChunks: readonly ChunkCoordinate[] = createActiveChunkCoordinates(),
    quality: RenderQualitySettings = getRenderQualitySettings(),
  ) {
    this.group.name = 'environment-chunks';
    this.data = data;
    this.assets = assets;
    this.quality = quality;
    this.assets.ensureReady();
    for (const chunk of initialChunks) {
      const environment = this.createChunk(chunk.x, chunk.y);
      if (environment) {
        this.attachChunk(chunk.x, chunk.y, environment);
      }
    }
    scene.add(this.group);
  }

  destroy(): void {
    this.group.removeFromParent();
    for (const objects of this.chunks.values()) {
      for (const mesh of objects.meshes) {
        mesh.dispose();
      }
    }
    this.chunks.clear();
    this.lodRefreshQueue.length = 0;
  }

  createChunk(chunkX: number, chunkY: number): EnvironmentChunkObjects | null {
    const lod = this.getChunkLod(chunkX, chunkY);
    const placements = collectPlacements(
      this.data,
      chunkX,
      chunkY,
      this.assets,
      lod,
      this.quality.environmentPlacementBudget,
      this.clearedCellIndices,
    );
    if (placements.length === 0) {
      return null;
    }

    const byFamily = new Map<VisualAssetFamily, Placement[]>();
    for (const placement of placements) {
      const family = this.assets.get(placement.assetId).family;
      const bucket = byFamily.get(family) ?? [];
      bucket.push(placement);
      byFamily.set(family, bucket);
    }

    const meshes: THREE.BatchedMesh[] = [];
    for (const [family, familyPlacements] of byFamily) {
      const assetsById = new Map<string, AssetPrototype>();
      let vertexCount = 0;
      let indexCount = 0;
      for (const placement of familyPlacements) {
        const asset = this.assets.get(placement.assetId);
        assetsById.set(asset.id, asset);
      }
      for (const asset of assetsById.values()) {
        vertexCount += asset.geometry.getAttribute('position').count;
        indexCount += asset.geometry.getIndex()?.count ?? asset.geometry.getAttribute('position').count;
      }
      const batch = new THREE.BatchedMesh(
        familyPlacements.length,
        vertexCount,
        Math.max(indexCount, vertexCount),
        this.assets.getFamilyMaterial(family),
      );
      batch.name = `environment-chunk-${chunkX}-${chunkY}-${family}`;
      batch.castShadow = this.quality.environmentShadows &&
        family === 'canopy' &&
        !isDiagnosticsRender();
      batch.receiveShadow = this.quality.environmentShadows;
      const geometryIds = new Map<string, number>();
      for (const asset of assetsById.values()) {
        geometryIds.set(asset.id, batch.addGeometry(asset.geometry));
      }
      placeBatchInstances(this.data, batch, familyPlacements, geometryIds);
      batch.computeBoundingSphere();
      meshes.push(batch);
    }
    return { meshes, instanceCount: placements.length, lod };
  }

  setView(camera: THREE.OrthographicCamera, navigationPlaneY: number): void {
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(this.viewDirection);
    if (Math.abs(this.viewDirection.y) < Number.EPSILON) {
      this.viewTarget.set(camera.position.x, navigationPlaneY, camera.position.z);
    } else {
      const distance = (navigationPlaneY - camera.position.y) / this.viewDirection.y;
      this.viewTarget.copy(camera.position).addScaledVector(this.viewDirection, distance);
    }
    this.viewHeight = 128 / Math.max(camera.zoom, Number.EPSILON);
    const nextLodViewSignature = [
      Math.floor(this.viewTarget.x / TERRAIN_CHUNK_SIZE),
      Math.floor(this.viewTarget.z / TERRAIN_CHUNK_SIZE),
      this.viewHeight > 112 ? 1 : 0,
    ].join(':');
    if (nextLodViewSignature !== this.lodViewSignature) {
      this.lodViewSignature = nextLodViewSignature;
      this.queueLodRefreshes();
    }
  }

  hasPendingLodRefresh(): boolean {
    return this.lodRefreshQueue.length > 0;
  }

  processNextLodRefresh(): boolean {
    while (this.lodRefreshQueue.length > 0) {
      const key = this.lodRefreshQueue.shift();
      if (!key) {
        return false;
      }
      const current = this.chunks.get(key);
      if (!current) {
        continue;
      }
      const [chunkX, chunkY] = key.split(':').map(Number);
      const lod = this.getChunkLod(chunkX, chunkY);
      if (lod === current.lod) {
        continue;
      }
      const replacement = this.createChunk(chunkX, chunkY);
      for (const mesh of current.meshes) {
        mesh.removeFromParent();
        mesh.dispose();
      }
      if (replacement) {
        for (const mesh of replacement.meshes) {
          this.group.add(mesh);
        }
        this.chunks.set(key, replacement);
      } else {
        this.chunks.delete(key);
      }
      return true;
    }
    return false;
  }

  getAttachedInstanceCount(): number {
    let count = 0;
    for (const chunk of this.chunks.values()) {
      count += chunk.instanceCount;
    }
    return count;
  }

  setClearedCellIndices(cellIndices: readonly number[]): void {
    this.clearedCellIndices = new Set(cellIndices);
  }

  attachChunk(chunkX: number, chunkY: number, objects: EnvironmentChunkObjects): void {
    for (const mesh of objects.meshes) {
      this.group.add(mesh);
    }
    this.chunks.set(`${chunkX}:${chunkY}`, objects);
  }

  removeChunk(chunkX: number, chunkY: number): void {
    const key = `${chunkX}:${chunkY}`;
    const objects = this.chunks.get(key);
    if (!objects) {
      return;
    }
    for (const mesh of objects.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.chunks.delete(key);
  }

  disposeChunk(objects: EnvironmentChunkObjects): void {
    for (const mesh of objects.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
  }

  getAttachedCount(): number {
    return this.chunks.size;
  }

  private getChunkLod(chunkX: number, chunkY: number): 0 | 1 {
    const centerX = chunkX * TERRAIN_CHUNK_SIZE - MAP_WIDTH / 2 + TERRAIN_CHUNK_SIZE / 2;
    const centerZ = chunkY * TERRAIN_CHUNK_SIZE - MAP_HEIGHT / 2 + TERRAIN_CHUNK_SIZE / 2;
    const distanceInChunks = Math.max(
      Math.abs(centerX - this.viewTarget.x),
      Math.abs(centerZ - this.viewTarget.z),
    ) / TERRAIN_CHUNK_SIZE;
    const zoomPenalty = this.viewHeight > 112 ? 1 : 0;
    return distanceInChunks <= Math.max(0, this.quality.environmentLodRadius - zoomPenalty) ? 0 : 1;
  }

  private queueLodRefreshes(): void {
    const queued = new Set(this.lodRefreshQueue);
    for (const [key, objects] of this.chunks) {
      const [chunkX, chunkY] = key.split(':').map(Number);
      if (this.getChunkLod(chunkX, chunkY) !== objects.lod && !queued.has(key)) {
        this.lodRefreshQueue.push(key);
        queued.add(key);
      }
    }
  }
}

function isDiagnosticsRender(): boolean {
  return getRuntimeQueryParam('debug') === 'chunks';
}

export function countEnvironmentPlacements(
  data: AuthoritativeMapData,
  chunkX: number,
  chunkY: number,
  assets: VisualAssetRegistry,
  clearedCellIndices: ReadonlySet<number> = new Set(),
): number {
  assets.ensureReady();
  return collectPlacements(
    data,
    chunkX,
    chunkY,
    assets,
    0,
    Number.POSITIVE_INFINITY,
    clearedCellIndices,
  ).length;
}

function collectPlacements(
  data: AuthoritativeMapData,
  chunkX: number,
  chunkY: number,
  assets: VisualAssetRegistry,
  lod: 0 | 1,
  placementBudget: number,
  clearedCellIndices: ReadonlySet<number>,
): Placement[] {
  const placements: Placement[] = [];
  for (let localY = 0; localY < TERRAIN_CHUNK_SIZE; localY += 1) {
    for (let localX = 0; localX < TERRAIN_CHUNK_SIZE; localX += 1) {
      const cellX = chunkX * TERRAIN_CHUNK_SIZE + localX;
      const cellY = chunkY * TERRAIN_CHUNK_SIZE + localY;
      if (cellX >= MAP_WIDTH || cellY >= MAP_HEIGHT) {
        continue;
      }
      if (clearedCellIndices.has(cellY * MAP_WIDTH + cellX)) {
        continue;
      }
      const sample = sampleTerrainVisual(data, cellX, cellY);
      const profile = getTerrainVisualProfile(sample);
      addHabitatPlacements(placements, sample, profile, assets, lod);
    }
  }
  if (placements.length <= placementBudget) {
    return placements;
  }

  return distributePlacementBudget(placements, placementBudget);
}

const PLACEMENT_FAMILY_ORDER: readonly Placement['family'][] = [
  'canopy',
  'understory',
  'rock',
  'shore',
];

const PLACEMENT_FAMILY_WEIGHTS: Readonly<Record<Placement['family'], number>> = {
  canopy: 0.58,
  understory: 0.27,
  rock: 0.1,
  shore: 0.05,
};

function distributePlacementBudget(
  placements: readonly Placement[],
  placementBudget: number,
): Placement[] {
  const budget = Math.max(0, Math.floor(placementBudget));
  if (budget === 0) {
    return [];
  }

  const byFamily = new Map<Placement['family'], Placement[]>();
  for (const family of PLACEMENT_FAMILY_ORDER) {
    byFamily.set(family, []);
  }
  for (const placement of placements) {
    byFamily.get(placement.family)?.push(placement);
  }

  const allocation = new Map<Placement['family'], number>();
  let allocated = 0;
  for (const family of PLACEMENT_FAMILY_ORDER) {
    const available = byFamily.get(family)?.length ?? 0;
    const count = Math.min(available, Math.floor(budget * PLACEMENT_FAMILY_WEIGHTS[family]));
    allocation.set(family, count);
    allocated += count;
  }

  // Redistribute unused slots in priority order. This keeps canopy preferred,
  // while still guaranteeing that available understory/rock/shore content is
  // represented when a family has fewer candidates than its share.
  let remaining = budget - allocated;
  while (remaining > 0) {
    let added = false;
    for (const family of PLACEMENT_FAMILY_ORDER) {
      const available = byFamily.get(family)?.length ?? 0;
      const current = allocation.get(family) ?? 0;
      if (current >= available) {
        continue;
      }
      allocation.set(family, current + 1);
      remaining -= 1;
      added = true;
      if (remaining === 0) {
        break;
      }
    }
    if (!added) {
      break;
    }
  }

  const selected: Placement[] = [];
  for (const family of PLACEMENT_FAMILY_ORDER) {
    const familyPlacements = byFamily.get(family) ?? [];
    const count = allocation.get(family) ?? 0;
    selected.push(...selectEvenly(familyPlacements, count));
  }
  return selected;
}

function selectEvenly<T>(items: readonly T[], count: number): T[] {
  if (count <= 0) {
    return [];
  }
  if (count >= items.length) {
    return [...items];
  }

  const selected: T[] = [];
  for (let index = 0; index < count; index += 1) {
    const sourceIndex = Math.min(
      items.length - 1,
      Math.floor((index + 0.5) * items.length / count),
    );
    selected.push(items[sourceIndex]);
  }
  return selected;
}

function addHabitatPlacements(
  placements: Placement[],
  sample: TerrainVisualSample,
  profile: TerrainVisualProfile,
  assets: VisualAssetRegistry,
  lod: 0 | 1,
): void {
  const cluster = deterministicVisualValue(
    Math.floor(sample.cellX / 6) * 97 + Math.floor(sample.cellY / 6) * 193,
    sample.landmassId,
    41,
  );
  const clearing = deterministicVisualValue(
    Math.floor(sample.cellX / 4) * 149 + Math.floor(sample.cellY / 4) * 283,
    sample.landmassId,
    79,
  );
  const clusterMultiplier = THREE.MathUtils.clamp(0.56 + cluster * 0.9, 0.35, 1.35);
  const clearingMultiplier = clearing > profile.clearingBias ? 0.18 : 1;

  addSinglePlacement(placements, sample, profile.canopy, profile.canopyDensity * clusterMultiplier * clearingMultiplier, 'canopy', assets, lod, 1);
  addSinglePlacement(placements, sample, profile.understory, profile.understoryDensity * (0.7 + cluster * 0.55), 'understory', assets, lod, 7);
  addSinglePlacement(placements, sample, profile.rocks, profile.rockDensity * (0.7 + (1 - cluster) * 0.5), 'rock', assets, lod, 13);
  addSinglePlacement(placements, sample, profile.shore, profile.shoreDensity, 'shore', assets, lod, 19);
}

function addSinglePlacement(
  placements: Placement[],
  sample: TerrainVisualSample,
  candidates: readonly string[],
  density: number,
  family: 'canopy' | 'understory' | 'rock' | 'shore',
  assets: VisualAssetRegistry,
  lod: 0 | 1,
  salt: number,
): void {
  if (candidates.length === 0 || !isPlacementCompatible(sample, family)) {
    return;
  }
  const chance = deterministicVisualValue(sample.cellIndex, sample.landmassId, salt);
  if (chance > THREE.MathUtils.clamp(density, 0, 0.94)) {
    return;
  }
  const baseAssetId = candidates[Math.floor(deterministicVisualValue(sample.cellIndex, sample.landmassId, salt + 1) * candidates.length) % candidates.length];
  if (!baseAssetId || !assets.has(baseAssetId)) {
    return;
  }
  const assetId = assets.getLodAsset(baseAssetId, lod).id;
  const variation = deterministicVisualValue(sample.cellIndex, sample.landmassId, salt + 2);
  const offset = deterministicVisualValue(sample.cellIndex, sample.landmassId, salt + 3) - 0.5;
  placements.push({
    assetId,
    family,
    sample,
    scale: family === 'canopy'
      ? 0.74 + variation * 0.45
      : family === 'rock'
        ? 0.62 + variation * 0.48
        : 0.7 + variation * 0.38,
    yaw: deterministicVisualValue(sample.cellIndex, sample.landmassId, salt + 4) * Math.PI * 2,
    offsetX: offset * 0.68,
    offsetZ: (deterministicVisualValue(sample.cellIndex, sample.landmassId, salt + 5) - 0.5) * 0.68,
  });
}

function placeBatchInstances(
  data: AuthoritativeMapData,
  batch: THREE.BatchedMesh,
  placements: readonly Placement[],
  geometryIds: ReadonlyMap<string, number>,
): void {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const align = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  for (const placement of placements) {
    const geometryId = geometryIds.get(placement.assetId);
    if (geometryId === undefined) {
      continue;
    }
    const terrain = getTerrainCellCache(data, placement.sample.cellX, placement.sample.cellY);
    normal.set(terrain.normalX, terrain.normalY, terrain.normalZ);
    align.setFromUnitVectors(UP, normal);
    yaw.setFromAxisAngle(UP, placement.yaw);
    align.multiply(yaw);
    position.set(
      placement.sample.cellX - MAP_WIDTH / 2 + 0.5 + placement.offsetX,
      terrain.elevationWorld,
      placement.sample.cellY - MAP_HEIGHT / 2 + 0.5 + placement.offsetZ,
    );
    scale.setScalar(placement.scale);
    matrix.compose(position, align, scale);
    const instanceId = batch.addInstance(geometryId);
    batch.setMatrixAt(instanceId, matrix);
  }
}

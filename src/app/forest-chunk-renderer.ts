import * as THREE from 'three';
import {
  BIOME_KIND_CODES,
  MAP_HEIGHT,
  MAP_WIDTH,
  AuthoritativeMapData,
  WATER_KIND_CODES,
} from './map/map-types';
import { sampleHeight } from './terrain-chunk-renderer';
import {
  ChunkCoordinate,
  createActiveChunkCoordinates,
  TERRAIN_CHUNK_SIZE,
} from './terrain-chunk-renderer';

const TREE_PLACEMENT_CHANCE = 0.28;
const FOREST_TYPES = ['conifer', 'broadleaf'] as const;
type ForestType = (typeof FOREST_TYPES)[number];

export interface ForestChunkObjects {
  readonly meshes: readonly THREE.InstancedMesh[];
}

export class ForestChunkRenderer {
  private readonly group = new THREE.Group();
  private readonly coniferGeometry = new THREE.ConeGeometry(0.62, 3.4, 6);
  private readonly broadleafGeometry = new THREE.DodecahedronGeometry(0.92, 0);
  private readonly materials: Readonly<Record<ForestType, THREE.MeshStandardMaterial>> = {
    conifer: new THREE.MeshStandardMaterial({
      color: 0x234e3b,
      roughness: 0.94,
      metalness: 0,
    }),
    broadleaf: new THREE.MeshStandardMaterial({
      color: 0x5f8a58,
      roughness: 0.96,
      metalness: 0,
    }),
  };
  private readonly chunks = new Map<string, ForestChunkObjects>();
  private readonly data: AuthoritativeMapData;

  constructor(
    scene: THREE.Scene,
    data: AuthoritativeMapData,
    initialChunks: readonly ChunkCoordinate[] = createActiveChunkCoordinates(),
  ) {
    this.group.name = 'forest-chunks';
    this.data = data;
    for (const chunk of initialChunks) {
      const forest = this.createChunk(chunk.x, chunk.y);
      if (forest) {
        this.attachChunk(chunk.x, chunk.y, forest);
      }
    }
    scene.add(this.group);
  }

  destroy(): void {
    this.group.removeFromParent();
    this.coniferGeometry.dispose();
    this.broadleafGeometry.dispose();
    for (const material of Object.values(this.materials)) {
      material.dispose();
    }
    this.chunks.clear();
  }

  createChunk(chunkX: number, chunkY: number): ForestChunkObjects | null {
    const counts = countForestTypes(this.data, chunkX, chunkY);
    if (counts.conifer === 0 && counts.broadleaf === 0) {
      return null;
    }

    const meshes: THREE.InstancedMesh[] = [];
    for (const type of FOREST_TYPES) {
      const instanceCount = counts[type];
      if (instanceCount === 0) {
        continue;
      }

      const forest = new THREE.InstancedMesh(
        type === 'conifer' ? this.coniferGeometry : this.broadleafGeometry,
        this.materials[type],
        instanceCount,
      );
      forest.name = `forest-chunk-${chunkX}-${chunkY}-${type}`;
      forest.castShadow = false;
      forest.receiveShadow = false;
      placeForestInstances(this.data, forest, chunkX, chunkY, type);
      meshes.push(forest);
    }
    return { meshes };
  }

  attachChunk(chunkX: number, chunkY: number, forest: ForestChunkObjects): void {
    const key = `${chunkX}:${chunkY}`;
    for (const mesh of forest.meshes) {
      this.group.add(mesh);
    }
    this.chunks.set(key, forest);
  }

  removeChunk(chunkX: number, chunkY: number): void {
    const key = `${chunkX}:${chunkY}`;
    const forest = this.chunks.get(key);
    if (!forest) {
      return;
    }

    for (const mesh of forest.meshes) {
      mesh.removeFromParent();
    }
    this.chunks.delete(key);
  }

  disposeChunk(forest: ForestChunkObjects): void {
    for (const mesh of forest.meshes) {
      mesh.removeFromParent();
    }
  }

  getAttachedCount(): number {
    return this.chunks.size;
  }
}

export function countForestCandidates(
  data: AuthoritativeMapData,
  chunkX: number,
  chunkY: number,
): number {
  const counts = countForestTypes(data, chunkX, chunkY);
  return counts.conifer + counts.broadleaf;
}

export function countForestTypes(
  data: AuthoritativeMapData,
  chunkX: number,
  chunkY: number,
): Readonly<Record<ForestType, number>> {
  const counts: Record<ForestType, number> = { conifer: 0, broadleaf: 0 };
  forEachChunkCell(chunkX, chunkY, (cellIndex, cellX, cellY) => {
    if (!isForestCandidate(data, cellIndex, cellX, cellY)) {
      return;
    }
    counts[getForestType(data, cellIndex, cellX, cellY)] += 1;
  });
  return counts;
}

function placeForestInstances(
  data: AuthoritativeMapData,
  forest: THREE.InstancedMesh,
  chunkX: number,
  chunkY: number,
  type: ForestType,
): void {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const rotationAxis = new THREE.Vector3(0, 1, 0);
  let instanceIndex = 0;

  forEachChunkCell(chunkX, chunkY, (cellIndex, cellX, cellY) => {
    if (
      !isForestCandidate(data, cellIndex, cellX, cellY) ||
      getForestType(data, cellIndex, cellX, cellY) !== type
    ) {
      return;
    }

    const variation = hashCell(cellIndex, data.landmassId[cellIndex]);
    const treeScale = type === 'conifer'
      ? 0.72 + (variation & 0xff) / 255 * 0.5
      : 0.7 + (variation & 0xff) / 255 * 0.46;
    position.set(
      cellX - MAP_WIDTH / 2 + 0.5,
      sampleHeight(data, cellX, cellY) + (type === 'conifer' ? 1.7 : 1.05) * treeScale,
      cellY - MAP_HEIGHT / 2 + 0.5,
    );
    rotation.setFromAxisAngle(rotationAxis, ((variation >>> 8) / 255) * Math.PI * 2);
    if (type === 'conifer') {
      scale.set(treeScale, treeScale, treeScale);
    } else {
      scale.set(treeScale * 1.08, treeScale * 1.12, treeScale * 1.08);
    }
    matrix.compose(position, rotation, scale);
    forest.setMatrixAt(instanceIndex, matrix);
    instanceIndex += 1;
  });
  forest.instanceMatrix.needsUpdate = true;
}

function isForestCandidate(
  data: AuthoritativeMapData,
  cellIndex: number,
  cellX: number,
  cellY: number,
): boolean {
  return (
    data.biome[cellIndex] === BIOME_KIND_CODES.forest &&
    data.waterKind[cellIndex] === WATER_KIND_CODES.none &&
    forestPlacementThreshold(data, cellIndex, cellX, cellY) >
      hashCell(cellIndex, data.landmassId[cellIndex]) / 4_294_967_295
  );
}

function forestPlacementThreshold(
  data: AuthoritativeMapData,
  cellIndex: number,
  cellX: number,
  cellY: number,
): number {
  const cluster = hashCell(
    Math.floor(cellX / 8) * 131 + Math.floor(cellY / 8),
    data.landmassId[cellIndex],
  ) / 4_294_967_295;
  const clearing = hashCell(
    Math.floor(cellX / 3) * 197 + Math.floor(cellY / 3),
    data.landmassId[cellIndex] + 17,
  ) / 4_294_967_295;
  return THREE.MathUtils.clamp(
    TREE_PLACEMENT_CHANCE + (cluster - 0.5) * 0.34 - (clearing > 0.86 ? 0.12 : 0),
    0.08,
    0.48,
  );
}

function getForestType(
  data: AuthoritativeMapData,
  cellIndex: number,
  cellX: number,
  cellY: number,
): ForestType {
  const moisture = readClimateValue(data.moisture, cellIndex, 0.72);
  const temperature = readClimateValue(data.temperature, cellIndex, 0.72);
  const variation = hashCell(cellIndex ^ (cellX * 17 + cellY * 31), data.landmassId[cellIndex]);
  const broadleafChance = THREE.MathUtils.clamp(
    0.22 + moisture * 0.34 + temperature * 0.22,
    0.2,
    0.7,
  );
  return (variation / 4_294_967_295) < broadleafChance ? 'broadleaf' : 'conifer';
}

function readClimateValue(values: Uint8Array, index: number, fallback: number): number {
  const value = values[index];
  return value === undefined ? fallback : value / 255;
}

function forEachChunkCell(
  chunkX: number,
  chunkY: number,
  callback: (cellIndex: number, cellX: number, cellY: number) => void,
): void {
  for (let localY = 0; localY < TERRAIN_CHUNK_SIZE; localY += 1) {
    for (let localX = 0; localX < TERRAIN_CHUNK_SIZE; localX += 1) {
      const cellX = chunkX * TERRAIN_CHUNK_SIZE + localX;
      const cellY = chunkY * TERRAIN_CHUNK_SIZE + localY;
      callback(cellY * MAP_WIDTH + cellX, cellX, cellY);
    }
  }
}

function hashCell(cellIndex: number, landmassId: number): number {
  let value = cellIndex ^ Math.imul(landmassId + 1, 0x9e37_79b9);
  value = Math.imul(value ^ (value >>> 16), 0x85eb_ca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2_ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

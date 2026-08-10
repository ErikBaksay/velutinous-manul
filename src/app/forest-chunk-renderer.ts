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

export class ForestChunkRenderer {
  private readonly group = new THREE.Group();
  private readonly treeGeometry = new THREE.ConeGeometry(0.62, 3.4, 6);
  private readonly treeMaterial = new THREE.MeshStandardMaterial({
    color: 0x31583d,
    roughness: 0.96,
    metalness: 0,
  });
  private readonly chunks = new Map<string, THREE.InstancedMesh>();
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
    this.treeGeometry.dispose();
    this.treeMaterial.dispose();
    this.chunks.clear();
  }

  createChunk(chunkX: number, chunkY: number): THREE.InstancedMesh | null {
    const instanceCount = countForestCandidates(this.data, chunkX, chunkY);
    if (instanceCount === 0) {
      return null;
    }

    const forest = new THREE.InstancedMesh(
      this.treeGeometry,
      this.treeMaterial,
      instanceCount,
    );
    forest.name = `forest-chunk-${chunkX}-${chunkY}`;
    placeForestInstances(this.data, forest, chunkX, chunkY);
    return forest;
  }

  attachChunk(chunkX: number, chunkY: number, forest: THREE.InstancedMesh): void {
    const key = `${chunkX}:${chunkY}`;
    this.group.add(forest);
    this.chunks.set(key, forest);
  }

  removeChunk(chunkX: number, chunkY: number): void {
    const key = `${chunkX}:${chunkY}`;
    const forest = this.chunks.get(key);
    if (!forest) {
      return;
    }

    forest.removeFromParent();
    this.chunks.delete(key);
  }

  disposeChunk(forest: THREE.InstancedMesh): void {
    forest.removeFromParent();
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
  let count = 0;
  forEachChunkCell(chunkX, chunkY, (cellIndex) => {
    if (isForestCandidate(data, cellIndex)) {
      count += 1;
    }
  });
  return count;
}

function placeForestInstances(
  data: AuthoritativeMapData,
  forest: THREE.InstancedMesh,
  chunkX: number,
  chunkY: number,
): void {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let instanceIndex = 0;

  forEachChunkCell(chunkX, chunkY, (cellIndex, cellX, cellY) => {
    if (!isForestCandidate(data, cellIndex)) {
      return;
    }

    const variation = hashCell(cellIndex, data.landmassId[cellIndex]);
    const treeScale = 0.78 + (variation & 0xff) / 255 * 0.42;
    position.set(
      cellX - MAP_WIDTH / 2 + 0.5,
      sampleHeight(data, cellX, cellY) + 1.7 * treeScale,
      cellY - MAP_HEIGHT / 2 + 0.5,
    );
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ((variation >>> 8) / 255) * Math.PI * 2);
    scale.set(treeScale, treeScale, treeScale);
    matrix.compose(position, rotation, scale);
    forest.setMatrixAt(instanceIndex, matrix);
    instanceIndex += 1;
  });
  forest.instanceMatrix.needsUpdate = true;
}

function isForestCandidate(data: AuthoritativeMapData, cellIndex: number): boolean {
  return (
    data.biome[cellIndex] === BIOME_KIND_CODES.forest &&
    data.waterKind[cellIndex] === WATER_KIND_CODES.none &&
    hashCell(cellIndex, data.landmassId[cellIndex]) / 4_294_967_295 < TREE_PLACEMENT_CHANCE
  );
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

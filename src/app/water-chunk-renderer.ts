import * as THREE from 'three';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  AuthoritativeMapData,
  WATER_KIND_CODES,
} from './map/map-types';
import { TERRAIN_VERTICAL_SCALE } from './map/terrain-generation';
import {
  ChunkCoordinate,
  createActiveChunkCoordinates,
  TERRAIN_CHUNK_SIZE,
} from './terrain-chunk-renderer';

export class WaterChunkRenderer {
  private readonly group = new THREE.Group();
  private readonly material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  private readonly chunks = new Map<string, THREE.Mesh>();
  private readonly data: AuthoritativeMapData;
  private readonly seaLevelWorld: number;

  constructor(
    scene: THREE.Scene,
    data: AuthoritativeMapData,
    seaLevelSample: number,
    initialChunks: readonly ChunkCoordinate[] = createActiveChunkCoordinates(),
  ) {
    this.group.name = 'water-chunks';
    this.data = data;
    this.seaLevelWorld = (seaLevelSample / 65_535) * TERRAIN_VERTICAL_SCALE + 0.08;
    for (const chunk of initialChunks) {
      const waterChunk = this.createChunk(chunk.x, chunk.y);
      if (waterChunk) {
        this.attachChunk(chunk.x, chunk.y, waterChunk);
      }
    }
    scene.add(this.group);
  }

  destroy(): void {
    this.group.removeFromParent();
    for (const chunk of this.chunks.values()) {
      chunk.geometry.dispose();
    }
    this.material.dispose();
    this.chunks.clear();
  }

  createChunk(chunkX: number, chunkY: number): THREE.Mesh | null {
    const geometry = createWaterChunkGeometry(this.data, chunkX, chunkY, this.seaLevelWorld);
    if (geometry.getAttribute('position').count === 0) {
      geometry.dispose();
      return null;
    }

    const chunk = new THREE.Mesh(geometry, this.material);
    chunk.name = `water-chunk-${chunkX}-${chunkY}`;
    chunk.renderOrder = 2;
    return chunk;
  }

  attachChunk(chunkX: number, chunkY: number, chunk: THREE.Mesh): void {
    const key = `${chunkX}:${chunkY}`;
    this.group.add(chunk);
    this.chunks.set(key, chunk);
  }

  removeChunk(chunkX: number, chunkY: number): void {
    const key = `${chunkX}:${chunkY}`;
    const chunk = this.chunks.get(key);
    if (!chunk) {
      return;
    }

    chunk.removeFromParent();
    chunk.geometry.dispose();
    this.chunks.delete(key);
  }

  disposeChunk(chunk: THREE.Mesh): void {
    chunk.geometry.dispose();
  }

  getAttachedCount(): number {
    return this.chunks.size;
  }
}

export function createWaterChunkGeometry(
  data: AuthoritativeMapData,
  chunkX: number,
  chunkY: number,
  seaLevelWorld: number,
): THREE.BufferGeometry {
  let waterCellCount = 0;
  for (let localY = 0; localY < TERRAIN_CHUNK_SIZE; localY += 1) {
    for (let localX = 0; localX < TERRAIN_CHUNK_SIZE; localX += 1) {
      const cellIndex = (chunkY * TERRAIN_CHUNK_SIZE + localY) * MAP_WIDTH;
      const waterKind = data.waterKind[cellIndex + chunkX * TERRAIN_CHUNK_SIZE + localX];
      if (waterKind !== WATER_KIND_CODES.none) {
        waterCellCount += 1;
      }
    }
  }

  const positions = new Float32Array(waterCellCount * 4 * 3);
  const normals = new Float32Array(waterCellCount * 4 * 3);
  const colors = new Float32Array(waterCellCount * 4 * 3);
  const indices = new Uint16Array(waterCellCount * 6);
  let vertexOffset = 0;
  let indexOffset = 0;
  let vertexIndex = 0;

  for (let localY = 0; localY < TERRAIN_CHUNK_SIZE; localY += 1) {
    for (let localX = 0; localX < TERRAIN_CHUNK_SIZE; localX += 1) {
      const globalX = chunkX * TERRAIN_CHUNK_SIZE + localX;
      const globalY = chunkY * TERRAIN_CHUNK_SIZE + localY;
      const cellIndex = globalY * MAP_WIDTH + globalX;
      if (data.waterKind[cellIndex] === WATER_KIND_CODES.none) {
        continue;
      }

      const worldX = globalX - MAP_WIDTH / 2;
      const worldZ = globalY - MAP_HEIGHT / 2;
      const color =
        data.waterKind[cellIndex] === WATER_KIND_CODES.river
          ? { red: 0.42, green: 0.68, blue: 0.67 }
          : { red: 0.22, green: 0.46, blue: 0.55 };
      addVertex(positions, normals, colors, vertexOffset, worldX, worldZ, seaLevelWorld, color);
      addVertex(
        positions,
        normals,
        colors,
        vertexOffset + 3,
        worldX + 1,
        worldZ,
        seaLevelWorld,
        color,
      );
      addVertex(
        positions,
        normals,
        colors,
        vertexOffset + 6,
        worldX,
        worldZ + 1,
        seaLevelWorld,
        color,
      );
      addVertex(
        positions,
        normals,
        colors,
        vertexOffset + 9,
        worldX + 1,
        worldZ + 1,
        seaLevelWorld,
        color,
      );

      indices[indexOffset] = vertexIndex;
      indices[indexOffset + 1] = vertexIndex + 2;
      indices[indexOffset + 2] = vertexIndex + 1;
      indices[indexOffset + 3] = vertexIndex + 1;
      indices[indexOffset + 4] = vertexIndex + 2;
      indices[indexOffset + 5] = vertexIndex + 3;
      vertexOffset += 12;
      vertexIndex += 4;
      indexOffset += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function addVertex(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  offset: number,
  x: number,
  z: number,
  y: number,
  color: { red: number; green: number; blue: number },
): void {
  positions[offset] = x;
  positions[offset + 1] = y;
  positions[offset + 2] = z;
  normals[offset + 1] = 1;
  colors[offset] = color.red;
  colors[offset + 1] = color.green;
  colors[offset + 2] = color.blue;
}

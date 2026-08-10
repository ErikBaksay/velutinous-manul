import * as THREE from 'three';
import {
  BIOME_KIND_CODES,
  HEIGHT_SAMPLE_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  AuthoritativeMapData,
} from './map/map-types';
import { TERRAIN_VERTICAL_SCALE } from './map/terrain-generation';

export const TERRAIN_CHUNK_SIZE = 32;
export const ACTIVE_CHUNK_RADIUS = 8;

const CHUNKS_PER_SIDE = MAP_WIDTH / TERRAIN_CHUNK_SIZE;

export interface ChunkCoordinate {
  readonly x: number;
  readonly y: number;
}

export function createActiveChunkCoordinates(): readonly ChunkCoordinate[] {
  const centerChunk = Math.floor(CHUNKS_PER_SIDE / 2);
  const minimumChunk = Math.max(0, centerChunk - ACTIVE_CHUNK_RADIUS);
  const maximumChunk = Math.min(CHUNKS_PER_SIDE - 1, centerChunk + ACTIVE_CHUNK_RADIUS);
  const coordinates: ChunkCoordinate[] = [];

  for (let chunkY = minimumChunk; chunkY <= maximumChunk; chunkY += 1) {
    for (let chunkX = minimumChunk; chunkX <= maximumChunk; chunkX += 1) {
      coordinates.push({ x: chunkX, y: chunkY });
    }
  }
  return coordinates;
}

export class TerrainChunkRenderer {
  private readonly group = new THREE.Group();
  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  private readonly chunks = new Map<string, THREE.Mesh>();
  private readonly data: AuthoritativeMapData;

  constructor(
    scene: THREE.Scene,
    data: AuthoritativeMapData,
    initialChunks: readonly ChunkCoordinate[] = createActiveChunkCoordinates(),
  ) {
    this.group.name = 'terrain-chunks';
    this.data = data;
    for (const chunk of initialChunks) {
      this.attachChunk(chunk.x, chunk.y, this.createChunk(chunk.x, chunk.y));
    }
    scene.add(this.group);
  }

  destroy(): void {
    this.group.removeFromParent();
    for (const chunk of this.chunks.values()) {
      chunk.geometry.dispose();
    }
    this.chunks.clear();
    this.material.dispose();
  }

  createChunk(chunkX: number, chunkY: number): THREE.Mesh {
    const chunk = new THREE.Mesh(createChunkGeometry(this.data, chunkX, chunkY), this.material);
    chunk.name = `terrain-chunk-${chunkX}-${chunkY}`;
    chunk.receiveShadow = true;
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

export function createChunkGeometry(
  data: AuthoritativeMapData,
  chunkX: number,
  chunkY: number,
): THREE.BufferGeometry {
  const verticesPerSide = TERRAIN_CHUNK_SIZE + 1;
  const vertexCount = verticesPerSide * verticesPerSide;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(TERRAIN_CHUNK_SIZE * TERRAIN_CHUNK_SIZE * 6);

  for (let localY = 0; localY <= TERRAIN_CHUNK_SIZE; localY += 1) {
    for (let localX = 0; localX <= TERRAIN_CHUNK_SIZE; localX += 1) {
      const globalX = chunkX * TERRAIN_CHUNK_SIZE + localX;
      const globalY = chunkY * TERRAIN_CHUNK_SIZE + localY;
      const vertexIndex = localY * verticesPerSide + localX;
      const positionOffset = vertexIndex * 3;
      const elevation = sampleHeight(data, globalX, globalY);
      const normal = calculateTerrainNormal(data, globalX, globalY);
      const biomeCode = data.biome[globalY * MAP_WIDTH + globalX];
      const color = calculateTerrainColor(elevation, normal.y, biomeCode);

      positions[positionOffset] = globalX - MAP_WIDTH / 2;
      positions[positionOffset + 1] = elevation;
      positions[positionOffset + 2] = globalY - MAP_HEIGHT / 2;
      normals[positionOffset] = normal.x;
      normals[positionOffset + 1] = normal.y;
      normals[positionOffset + 2] = normal.z;
      colors[positionOffset] = color.r;
      colors[positionOffset + 1] = color.g;
      colors[positionOffset + 2] = color.b;
    }
  }

  let indexOffset = 0;
  for (let localY = 0; localY < TERRAIN_CHUNK_SIZE; localY += 1) {
    for (let localX = 0; localX < TERRAIN_CHUNK_SIZE; localX += 1) {
      const topLeft = localY * verticesPerSide + localX;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + verticesPerSide;
      const bottomRight = bottomLeft + 1;

      indices[indexOffset] = topLeft;
      indices[indexOffset + 1] = bottomLeft;
      indices[indexOffset + 2] = topRight;
      indices[indexOffset + 3] = topRight;
      indices[indexOffset + 4] = bottomLeft;
      indices[indexOffset + 5] = bottomRight;
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

export function sampleHeight(data: AuthoritativeMapData, sampleX: number, sampleY: number): number {
  const clampedX = Math.min(Math.max(sampleX, 0), MAP_WIDTH);
  const clampedY = Math.min(Math.max(sampleY, 0), MAP_HEIGHT);
  const index = clampedY * HEIGHT_SAMPLE_WIDTH + clampedX;
  return (data.heightSamples[index] / 65_535) * TERRAIN_VERTICAL_SCALE;
}

export function calculateTerrainNormal(
  data: AuthoritativeMapData,
  sampleX: number,
  sampleY: number,
): THREE.Vector3 {
  const slopeX = (sampleHeight(data, sampleX + 1, sampleY) - sampleHeight(data, sampleX - 1, sampleY)) / 2;
  const slopeY = (sampleHeight(data, sampleX, sampleY + 1) - sampleHeight(data, sampleX, sampleY - 1)) / 2;
  return new THREE.Vector3(-slopeX, 1, -slopeY).normalize();
}

function calculateTerrainColor(
  elevation: number,
  upwardNormal: number,
  biomeCode: number,
): THREE.Color {
  const normalizedElevation = THREE.MathUtils.clamp(elevation / TERRAIN_VERTICAL_SCALE, 0, 1);
  const color = new THREE.Color(BIOME_COLORS[biomeCode] ?? BIOME_COLORS[BIOME_KIND_CODES.plains]);
  const slopeShade = THREE.MathUtils.clamp(0.78 + upwardNormal * 0.22, 0.78, 1);
  const elevationShade = 0.88 + normalizedElevation * 0.14;
  return color.multiplyScalar(slopeShade * elevationShade);
}

const BIOME_COLORS: Readonly<Record<number, number>> = Object.freeze({
  [BIOME_KIND_CODES.plains]: 0xb0a86a,
  [BIOME_KIND_CODES.forest]: 0x4f754d,
  [BIOME_KIND_CODES.hills]: 0x9a875b,
  [BIOME_KIND_CODES.mountains]: 0x8b8176,
  [BIOME_KIND_CODES.wetland]: 0x78906b,
  [BIOME_KIND_CODES.coast]: 0xb8b17c,
});

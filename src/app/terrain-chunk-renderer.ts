import * as THREE from 'three';
import {
  BIOME_KIND_CODES,
  HEIGHT_SAMPLE_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  AuthoritativeMapData,
} from './map/map-types';
import { TERRAIN_VERTICAL_SCALE } from './map/terrain-generation';
import { getTerrainCellCache } from './terrain-cell-cache';

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
  private readonly material = createTerrainMaterial();
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

  raycast(raycaster: THREE.Raycaster): THREE.Vector3 | null {
    const intersections = raycaster.intersectObjects([...this.chunks.values()], false);
    return intersections[0]?.point.clone() ?? null;
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
  const climate = new Float32Array(vertexCount * 3);
  const features = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(TERRAIN_CHUNK_SIZE * TERRAIN_CHUNK_SIZE * 6);
  const color = new THREE.Color();

  for (let localY = 0; localY <= TERRAIN_CHUNK_SIZE; localY += 1) {
    for (let localX = 0; localX <= TERRAIN_CHUNK_SIZE; localX += 1) {
      const globalX = chunkX * TERRAIN_CHUNK_SIZE + localX;
      const globalY = chunkY * TERRAIN_CHUNK_SIZE + localY;
      const vertexIndex = localY * verticesPerSide + localX;
      const positionOffset = vertexIndex * 3;
      const cellX = Math.min(Math.max(globalX, 0), MAP_WIDTH - 1);
      const cellY = Math.min(Math.max(globalY, 0), MAP_HEIGHT - 1);
      const cellIndex = cellY * MAP_WIDTH + cellX;
      const biomeCode = data.biome[cellIndex];
      const terrain = getTerrainCellCache(data, cellX, cellY);
      const elevation = terrain.elevationWorld;
      calculateTerrainColor(data, cellX, cellY, elevation, terrain.normalY, biomeCode, color);
      const moisture = readClimateValue(data.moisture, cellIndex, 0.58);
      const temperature = readClimateValue(data.temperature, cellIndex, 0.58);
      const nearWater = terrain.nearWater ? 1 : 0;

      positions[positionOffset] = globalX - MAP_WIDTH / 2;
      positions[positionOffset + 1] = elevation;
      positions[positionOffset + 2] = globalY - MAP_HEIGHT / 2;
      normals[positionOffset] = terrain.normalX;
      normals[positionOffset + 1] = terrain.normalY;
      normals[positionOffset + 2] = terrain.normalZ;
      colors[positionOffset] = color.r;
      colors[positionOffset + 1] = color.g;
      colors[positionOffset + 2] = color.b;
      climate[positionOffset] = moisture;
      climate[positionOffset + 1] = temperature;
      climate[positionOffset + 2] = THREE.MathUtils.clamp(elevation / TERRAIN_VERTICAL_SCALE, 0, 1);
      features[positionOffset] = THREE.MathUtils.clamp(terrain.slope, 0, 1);
      features[positionOffset + 1] = nearWater;
      features[positionOffset + 2] = biomeCode / 5;
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
  geometry.setAttribute('terrainClimate', new THREE.Float32BufferAttribute(climate, 3));
  geometry.setAttribute('terrainFeatures', new THREE.Float32BufferAttribute(features, 3));
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
  const terrain = getTerrainCellCache(data, sampleX, sampleY);
  return new THREE.Vector3(terrain.normalX, terrain.normalY, terrain.normalZ);
}

export function calculateTerrainColor(
  data: AuthoritativeMapData,
  cellX: number,
  cellY: number,
  elevation: number,
  upwardNormal: number,
  biomeCode: number,
  target = new THREE.Color(),
): THREE.Color {
  const normalizedElevation = THREE.MathUtils.clamp(elevation / TERRAIN_VERTICAL_SCALE, 0, 1);
  const clampedX = Math.min(Math.max(cellX, 0), MAP_WIDTH - 1);
  const clampedY = Math.min(Math.max(cellY, 0), MAP_HEIGHT - 1);
  const cellIndex = clampedY * MAP_WIDTH + clampedX;
  const moisture = readClimateValue(data.moisture, cellIndex, 0.58);
  const temperature = readClimateValue(data.temperature, cellIndex, 0.58);
  const variation = 0.94 + (hashTerrainRegion(clampedX, clampedY) - 0.5) * 0.12;
  target.set(BIOME_COLORS[biomeCode] ?? BIOME_COLORS[BIOME_KIND_CODES.plains]);

  if (moisture > 0.72) {
    target.lerp(MOISTURE_TERRAIN_TINT, Math.min(0.18, (moisture - 0.72) * 0.7));
  }
  if (temperature < 0.32) {
    target.lerp(COLD_TERRAIN_TINT, Math.min(0.12, (0.32 - temperature) * 0.45));
  }

  const slopeShade = THREE.MathUtils.clamp(0.78 + upwardNormal * 0.22, 0.78, 1);
  const elevationShade = 0.9 + normalizedElevation * 0.12;
  return target.multiplyScalar(slopeShade * elevationShade * variation);
}

const MOISTURE_TERRAIN_TINT = new THREE.Color(0x5a806d);
const COLD_TERRAIN_TINT = new THREE.Color(0x778a86);

const BIOME_COLORS: Readonly<Record<number, number>> = Object.freeze({
  [BIOME_KIND_CODES.plains]: 0x7e9766,
  [BIOME_KIND_CODES.forest]: 0x3f684d,
  [BIOME_KIND_CODES.hills]: 0x879361,
  [BIOME_KIND_CODES.mountains]: 0x7f8980,
  [BIOME_KIND_CODES.wetland]: 0x648879,
  [BIOME_KIND_CODES.coast]: 0xa8ac82,
});

function createTerrainMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute vec3 terrainClimate;
         attribute vec3 terrainFeatures;
         varying vec3 vTerrainClimate;
         varying vec3 vTerrainFeatures;
         varying vec3 vTerrainWorldPosition;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vTerrainClimate = terrainClimate;
         vTerrainFeatures = terrainFeatures;
         vTerrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vTerrainClimate;
         varying vec3 vTerrainFeatures;
         varying vec3 vTerrainWorldPosition;
         float terrainDetailNoise(vec2 p) {
           return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453);
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float detail = terrainDetailNoise(vTerrainWorldPosition.xz * 0.075) - 0.5;
         float moisture = smoothstep(0.22, 0.86, vTerrainClimate.x);
         float warmGrowth = smoothstep(0.3, 0.75, vTerrainClimate.y);
         float rock = smoothstep(0.14, 0.4, vTerrainFeatures.x);
         float waterEdge = vTerrainFeatures.y * (0.5 + moisture * 0.5);
         vec3 grass = mix(vec3(0.25, 0.38, 0.21), vec3(0.42, 0.52, 0.26), warmGrowth);
         vec3 meadow = vec3(0.48, 0.55, 0.31);
         vec3 soil = vec3(0.39, 0.32, 0.22);
         vec3 wetGround = vec3(0.23, 0.37, 0.31);
         vec3 exposedRock = vec3(0.42, 0.43, 0.38);
         vec3 coast = vec3(0.64, 0.57, 0.37);
         vec3 authoredSurface = mix(soil, grass, smoothstep(0.18, 0.52, moisture));
         authoredSurface = mix(authoredSurface, meadow, smoothstep(0.45, 0.82, moisture) * (1.0 - rock));
         authoredSurface = mix(authoredSurface, wetGround, moisture * 0.38);
         authoredSurface = mix(authoredSurface, exposedRock, rock * 0.8);
         authoredSurface = mix(authoredSurface, coast, waterEdge * 0.75);
         authoredSurface *= 0.93 + detail * 0.11 + (vTerrainClimate.z - 0.5) * 0.08;
         diffuseColor.rgb = mix(diffuseColor.rgb, authoredSurface, 0.76);`,
      );
  };
  material.customProgramCacheKey = () => 'living-landscape-terrain-v2';
  return material;
}

function readClimateValue(values: Uint8Array, index: number, fallback: number): number {
  const value = values[index];
  return value === undefined ? fallback : value / 255;
}

function hashTerrainRegion(cellX: number, cellY: number): number {
  let value = Math.imul(Math.floor(cellX / 10) + 1, 0x9e37_79b9) ^
    Math.imul(Math.floor(cellY / 10) + 1, 0x85eb_ca6b);
  value = Math.imul(value ^ (value >>> 16), 0xc2b2_ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_295;
}

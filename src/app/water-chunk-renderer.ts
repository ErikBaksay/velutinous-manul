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
  sampleHeight,
  TERRAIN_CHUNK_SIZE,
} from './terrain-chunk-renderer';

const SHORELINE_WIDTH = 0.34;
const WATER_SURFACE_OFFSET = 0.012;

export interface WaterChunkObjects {
  readonly surface: THREE.Mesh;
  readonly shoreline: THREE.Mesh | null;
}

export class WaterChunkRenderer {
  private readonly group = new THREE.Group();
  private readonly material = createWaterMaterial();
  private readonly shorelineMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  private readonly chunks = new Map<string, WaterChunkObjects>();
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
      disposeWaterChunk(chunk);
    }
    this.material.dispose();
    this.shorelineMaterial.dispose();
    this.chunks.clear();
  }

  createChunk(chunkX: number, chunkY: number): WaterChunkObjects | null {
    const geometry = createWaterChunkGeometry(this.data, chunkX, chunkY, this.seaLevelWorld);
    if (geometry.getAttribute('position').count === 0) {
      geometry.dispose();
      return null;
    }

    const surface = new THREE.Mesh(geometry, this.material);
    surface.name = `water-chunk-${chunkX}-${chunkY}`;
    surface.renderOrder = 2;

    const shorelineGeometry = createShorelineChunkGeometry(
      this.data,
      chunkX,
      chunkY,
      this.seaLevelWorld,
    );
    const shoreline = shorelineGeometry.getAttribute('position').count === 0
      ? null
      : new THREE.Mesh(shorelineGeometry, this.shorelineMaterial);
    if (shoreline) {
      shoreline.name = `shoreline-chunk-${chunkX}-${chunkY}`;
      shoreline.renderOrder = 3;
    } else {
      shorelineGeometry.dispose();
    }
    return { surface, shoreline };
  }

  attachChunk(chunkX: number, chunkY: number, chunk: WaterChunkObjects): void {
    const key = `${chunkX}:${chunkY}`;
    this.group.add(chunk.surface);
    if (chunk.shoreline) {
      this.group.add(chunk.shoreline);
    }
    this.chunks.set(key, chunk);
  }

  removeChunk(chunkX: number, chunkY: number): void {
    const key = `${chunkX}:${chunkY}`;
    const chunk = this.chunks.get(key);
    if (!chunk) {
      return;
    }

    chunk.surface.removeFromParent();
    chunk.shoreline?.removeFromParent();
    disposeWaterChunk(chunk);
    this.chunks.delete(key);
  }

  disposeChunk(chunk: WaterChunkObjects): void {
    chunk.surface.removeFromParent();
    chunk.shoreline?.removeFromParent();
    disposeWaterChunk(chunk);
  }

  update(timeSeconds: number): void {
    this.material.uniforms['uTime'].value = timeSeconds;
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
  const waterData = new Float32Array(waterCellCount * 4 * 2);
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
      const color = getWaterColor(data, globalX, globalY, cellIndex, seaLevelWorld);
      const depth = getWaterDepth(data, globalX, globalY, seaLevelWorld);
      const shore = countLandNeighbors(data, globalX, globalY) / 4;
      addVertex(positions, normals, colors, waterData, vertexOffset, worldX, worldZ, seaLevelWorld, color, depth, shore);
      addVertex(
        positions,
        normals,
        colors,
        waterData,
        vertexOffset + 3,
        worldX + 1,
        worldZ,
        seaLevelWorld,
        color,
        depth,
        shore,
      );
      addVertex(
        positions,
        normals,
        colors,
        waterData,
        vertexOffset + 6,
        worldX,
        worldZ + 1,
        seaLevelWorld,
        color,
        depth,
        shore,
      );
      addVertex(
        positions,
        normals,
        colors,
        waterData,
        vertexOffset + 9,
        worldX + 1,
        worldZ + 1,
        seaLevelWorld,
        color,
        depth,
        shore,
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
  geometry.setAttribute('waterData', new THREE.Float32BufferAttribute(waterData, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createShorelineChunkGeometry(
  data: AuthoritativeMapData,
  chunkX: number,
  chunkY: number,
  seaLevelWorld: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (const shorelineEdge of collectShorelineEdges(data, chunkX, chunkY)) {
    const globalX = shorelineEdge.cellX;
    const globalY = shorelineEdge.cellY;
    const cellIndex = globalY * MAP_WIDTH + globalX;
    const worldX = globalX - MAP_WIDTH / 2;
    const worldZ = globalY - MAP_HEIGHT / 2;
    const shoreColor = getShoreColor(data, globalX, globalY, cellIndex);
    const neighborX = globalX + shorelineEdge.direction.dx;
    const neighborY = globalY + shorelineEdge.direction.dy;
    addShoreQuad(
      positions,
      normals,
      colors,
      indices,
      worldX,
      worldZ,
      seaLevelWorld + WATER_SURFACE_OFFSET,
      Math.min(sampleHeight(data, neighborX, neighborY) + 0.025, seaLevelWorld + 0.42),
      shorelineEdge.direction.edge,
      shoreColor,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (indices.length > 0) {
    geometry.setIndex(indices);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

export interface ShorelineEdge {
  readonly cellX: number;
  readonly cellY: number;
  readonly direction: ShoreDirection;
}

/** Each boundary is owned by its water cell, so adjacent chunks cannot both emit it. */
export function collectShorelineEdges(
  data: AuthoritativeMapData,
  chunkX: number,
  chunkY: number,
): readonly ShorelineEdge[] {
  const edges: ShorelineEdge[] = [];
  for (let localY = 0; localY < TERRAIN_CHUNK_SIZE; localY += 1) {
    for (let localX = 0; localX < TERRAIN_CHUNK_SIZE; localX += 1) {
      const cellX = chunkX * TERRAIN_CHUNK_SIZE + localX;
      const cellY = chunkY * TERRAIN_CHUNK_SIZE + localY;
      const cellIndex = cellY * MAP_WIDTH + cellX;
      if (data.waterKind[cellIndex] === WATER_KIND_CODES.none) {
        continue;
      }
      for (const direction of neighbors) {
        if (isLandCell(data, cellX + direction.dx, cellY + direction.dy)) {
          edges.push({ cellX, cellY, direction });
        }
      }
    }
  }
  return edges;
}

const neighbors: readonly ShoreDirection[] = [
  { dx: 0, dy: -1, edge: 'north' },
  { dx: 1, dy: 0, edge: 'east' },
  { dx: 0, dy: 1, edge: 'south' },
  { dx: -1, dy: 0, edge: 'west' },
];

function addVertex(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  waterData: Float32Array,
  offset: number,
  x: number,
  z: number,
  y: number,
  color: { red: number; green: number; blue: number },
  depth: number,
  shore: number,
): void {
  positions[offset] = x;
  positions[offset + 1] = y;
  positions[offset + 2] = z;
  normals[offset + 1] = 1;
  colors[offset] = color.red;
  colors[offset + 1] = color.green;
  colors[offset + 2] = color.blue;
  const dataOffset = (offset / 3) * 2;
  waterData[dataOffset] = depth;
  waterData[dataOffset + 1] = shore;
}

function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      attribute vec3 color;
      attribute vec2 waterData;
      varying vec3 vColor;
      varying vec3 vPosition;
      varying vec2 vWaterData;

      void main() {
        vec3 transformed = position;
        float ripple = sin((transformed.x + transformed.z) * 0.22 + uTime * 0.42) * 0.5;
        ripple += cos((transformed.x - transformed.z) * 0.14 + uTime * 0.28) * 0.5;
        transformed.y += ripple * 0.018;
        vColor = color * (0.97 + ripple * 0.035);
        vPosition = transformed;
        vWaterData = waterData;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying vec3 vPosition;
      varying vec2 vWaterData;

      void main() {
        float detail = sin(vPosition.x * 0.12 + vPosition.z * 0.17) * 0.5 +
          cos(vPosition.x * 0.21 - vPosition.z * 0.08) * 0.5;
        float shallow = smoothstep(0.72, 0.04, vWaterData.x) * 0.52 + vWaterData.y * 0.18;
        vec3 deep = vec3(0.018, 0.09, 0.16);
        vec3 mid = vec3(0.025, 0.23, 0.32);
        vec3 shallowWater = vec3(0.10, 0.43, 0.46);
        vec3 water = mix(deep, mid, shallow);
        water = mix(water, shallowWater, smoothstep(0.46, 0.82, shallow) * 0.38);
        water *= 0.96 + detail * 0.055;
        float foam = smoothstep(0.78, 1.0, shallow) * (0.16 + detail * 0.06);
        gl_FragColor = vec4(mix(water, vec3(0.55, 0.70, 0.61), foam), 1.0);
      }
    `,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

interface ShoreDirection {
  readonly dx: number;
  readonly dy: number;
  readonly edge: 'north' | 'east' | 'south' | 'west';
}

type ShoreVertex = readonly [x: number, z: number, isLandSide: boolean];

function addShoreQuad(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  worldX: number,
  worldZ: number,
  y: number,
  landY: number,
  edge: ShoreDirection['edge'],
  color: { red: number; green: number; blue: number },
): void {
  const startIndex = positions.length / 3;
  const width = SHORELINE_WIDTH * (0.78 + shoreJitter(worldX, worldZ, edge) * 0.42);
  const along = (shoreJitter(worldX + 3.7, worldZ - 1.9, edge) - 0.5) * 0.12;
  let vertices: readonly ShoreVertex[];
  switch (edge) {
    case 'north':
      vertices = [
        [worldX, worldZ, false],
        [worldX + 1, worldZ, false],
        [worldX, worldZ + width + along, true],
        [worldX + 1, worldZ + width - along, true],
      ];
      break;
    case 'east':
      vertices = [
        [worldX + 1 - width, worldZ, false],
        [worldX + 1, worldZ, true],
        [worldX + 1 - width, worldZ + 1, false],
        [worldX + 1, worldZ + 1, true],
      ];
      break;
    case 'south':
      vertices = [
        [worldX, worldZ + 1 - width - along, false],
        [worldX + 1, worldZ + 1 - width + along, false],
        [worldX, worldZ + 1, true],
        [worldX + 1, worldZ + 1, true],
      ];
      break;
    case 'west':
      vertices = [
        [worldX, worldZ, true],
        [worldX + width, worldZ, false],
        [worldX, worldZ + 1, true],
        [worldX + width, worldZ + 1, false],
      ];
      break;
  }

  for (const [x, z, isLandSide] of vertices) {
    positions.push(x, isLandSide ? landY : y, z);
    normals.push(0, 1, 0);
    const tone = 0.93 + shoreJitter(x, z, edge) * 0.12;
    const landColor = new THREE.Color(0xb8a878).lerp(new THREE.Color(0x8e8c7b), shoreJitter(x + 4, z - 2, edge) * 0.5);
    const selectedColor = isLandSide ? landColor : new THREE.Color(color.red, color.green, color.blue).lerp(new THREE.Color(0xbfd3c0), 0.38);
    colors.push(selectedColor.r * tone, selectedColor.g * tone, selectedColor.b * tone);
  }
  indices.push(
    startIndex,
    startIndex + 2,
    startIndex + 1,
    startIndex + 1,
    startIndex + 2,
    startIndex + 3,
  );
}

function shoreJitter(x: number, z: number, edge: ShoreDirection['edge']): number {
  const salt = edge === 'north' ? 11 : edge === 'east' ? 23 : edge === 'south' ? 37 : 53;
  const value = Math.sin((x * 12.9898 + z * 78.233 + salt) * 0.37) * 43758.5453;
  return value - Math.floor(value);
}

function getWaterColor(
  data: AuthoritativeMapData,
  globalX: number,
  globalY: number,
  cellIndex: number,
  seaLevelWorld: number,
): { red: number; green: number; blue: number } {
  const kind = data.waterKind[cellIndex];
  const depth = THREE.MathUtils.clamp(
    (seaLevelWorld - sampleHeight(data, globalX, globalY)) / TERRAIN_VERTICAL_SCALE,
    0,
    1,
  );
  const landNeighbors = countLandNeighbors(data, globalX, globalY);
  const shallow = THREE.MathUtils.clamp(landNeighbors / 4 + (1 - depth) * 0.35, 0, 1);
  const color = new THREE.Color(kind === WATER_KIND_CODES.river ? 0x4b8d8e : 0x216b7d);
  color.lerp(new THREE.Color(0x74b4aa), shallow * 0.66);
  color.multiplyScalar(0.92 + ((cellIndex * 17) % 29) / 255);
  return { red: color.r, green: color.g, blue: color.b };
}

function getWaterDepth(
  data: AuthoritativeMapData,
  globalX: number,
  globalY: number,
  seaLevelWorld: number,
): number {
  return THREE.MathUtils.clamp(
    (seaLevelWorld - sampleHeight(data, globalX, globalY)) / TERRAIN_VERTICAL_SCALE,
    0,
    1,
  );
}

function getShoreColor(
  data: AuthoritativeMapData,
  globalX: number,
  globalY: number,
  cellIndex: number,
): { red: number; green: number; blue: number } {
  const variation = ((globalX * 17 + globalY * 31 + cellIndex) % 17) / 17;
  const color = new THREE.Color(0xb4aa78).lerp(new THREE.Color(0x9a9b7b), variation * 0.55);
  if (countLandNeighbors(data, globalX, globalY) >= 3) {
    color.lerp(new THREE.Color(0xd0c495), 0.25);
  }
  return { red: color.r, green: color.g, blue: color.b };
}

function countLandNeighbors(data: AuthoritativeMapData, cellX: number, cellY: number): number {
  let count = 0;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    if (isLandCell(data, cellX + dx, cellY + dy)) {
      count += 1;
    }
  }
  return count;
}

function isLandCell(data: AuthoritativeMapData, cellX: number, cellY: number): boolean {
  return cellX >= 0 && cellX < MAP_WIDTH && cellY >= 0 && cellY < MAP_HEIGHT &&
    data.waterKind[cellY * MAP_WIDTH + cellX] === WATER_KIND_CODES.none;
}

function disposeWaterChunk(chunk: WaterChunkObjects): void {
  chunk.surface.geometry.dispose();
  chunk.shoreline?.geometry.dispose();
}

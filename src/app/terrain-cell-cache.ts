import {
  HEIGHT_SAMPLE_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  AuthoritativeMapData,
} from './map/map-types';
import { TERRAIN_VERTICAL_SCALE } from './map/terrain-generation';

export interface TerrainCellCache {
  readonly cellX: number;
  readonly cellY: number;
  readonly cellIndex: number;
  readonly elevationWorld: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
  readonly slope: number;
  readonly nearWater: boolean;
  readonly resourceIntensity: number;
}

const caches = new WeakMap<AuthoritativeMapData, Map<number, TerrainCellCache>>();

export function getTerrainCellCache(
  data: AuthoritativeMapData,
  cellX: number,
  cellY: number,
): TerrainCellCache {
  const clampedX = Math.min(Math.max(cellX, 0), MAP_WIDTH - 1);
  const clampedY = Math.min(Math.max(cellY, 0), MAP_HEIGHT - 1);
  const cellIndex = clampedY * MAP_WIDTH + clampedX;
  let cache = caches.get(data);
  if (!cache) {
    cache = new Map<number, TerrainCellCache>();
    caches.set(data, cache);
  }

  const existing = cache.get(cellIndex);
  if (existing) {
    return existing;
  }

  const elevationWorld = readHeight(data, clampedX, clampedY);
  const slopeX = (readHeight(data, clampedX + 1, clampedY) - readHeight(data, clampedX - 1, clampedY)) / 2;
  const slopeZ = (readHeight(data, clampedX, clampedY + 1) - readHeight(data, clampedX, clampedY - 1)) / 2;
  const length = Math.hypot(slopeX, 1, slopeZ);
  const resourceIntensity = Math.max(
    ...Object.values(data.resourceIntensity).map((values) => values[cellIndex] ?? 0),
    0,
  );
  const result: TerrainCellCache = Object.freeze({
    cellX: clampedX,
    cellY: clampedY,
    cellIndex,
    elevationWorld,
    normalX: -slopeX / length,
    normalY: 1 / length,
    normalZ: -slopeZ / length,
    slope: 1 - 1 / length,
    nearWater: hasWaterNeighbor(data, clampedX, clampedY),
    resourceIntensity,
  });
  cache.set(cellIndex, result);
  return result;
}

function readHeight(data: AuthoritativeMapData, cellX: number, cellY: number): number {
  const clampedX = Math.min(Math.max(cellX, 0), MAP_WIDTH);
  const clampedY = Math.min(Math.max(cellY, 0), MAP_HEIGHT);
  return (data.heightSamples[clampedY * HEIGHT_SAMPLE_WIDTH + clampedX] / 65_535) * TERRAIN_VERTICAL_SCALE;
}

function hasWaterNeighbor(data: AuthoritativeMapData, cellX: number, cellY: number): boolean {
  return (
    isWater(data, cellX, cellY - 1) ||
    isWater(data, cellX + 1, cellY) ||
    isWater(data, cellX, cellY + 1) ||
    isWater(data, cellX - 1, cellY)
  );
}

function isWater(data: AuthoritativeMapData, cellX: number, cellY: number): boolean {
  return cellX >= 0 && cellX < MAP_WIDTH && cellY >= 0 && cellY < MAP_HEIGHT &&
    data.waterKind[cellY * MAP_WIDTH + cellX] !== 0;
}

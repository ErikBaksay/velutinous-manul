import {
  BIOME_KIND_CODES,
  MAP_HEIGHT,
  MAP_WIDTH,
  AuthoritativeMapData,
  WATER_KIND_CODES,
} from './map/map-types';
import { TERRAIN_VERTICAL_SCALE } from './map/terrain-generation';
import { getTerrainCellCache } from './terrain-cell-cache';

export interface TerrainVisualSample {
  readonly cellX: number;
  readonly cellY: number;
  readonly cellIndex: number;
  readonly elevationWorld: number;
  readonly normalizedElevation: number;
  readonly slope: number;
  readonly moisture: number;
  readonly temperature: number;
  readonly biome: number;
  readonly waterKind: number;
  readonly nearWater: boolean;
  readonly landmassId: number;
  readonly resourceMask: number;
  readonly resourceIntensity: number;
}

export interface TerrainVisualProfile {
  readonly canopy: readonly string[];
  readonly understory: readonly string[];
  readonly rocks: readonly string[];
  readonly shore: readonly string[];
  readonly canopyDensity: number;
  readonly understoryDensity: number;
  readonly rockDensity: number;
  readonly shoreDensity: number;
  readonly clearingBias: number;
}

const EMPTY_PROFILE: TerrainVisualProfile = Object.freeze({
  canopy: [],
  understory: [],
  rocks: [],
  shore: [],
  canopyDensity: 0,
  understoryDensity: 0,
  rockDensity: 0,
  shoreDensity: 0,
  clearingBias: 1,
});

export function sampleTerrainVisual(data: AuthoritativeMapData, cellX: number, cellY: number): TerrainVisualSample {
  const clampedX = Math.min(Math.max(cellX, 0), MAP_WIDTH - 1);
  const clampedY = Math.min(Math.max(cellY, 0), MAP_HEIGHT - 1);
  const cellIndex = clampedY * MAP_WIDTH + clampedX;
  const terrain = getTerrainCellCache(data, clampedX, clampedY);
  const resourceMask = data.resourceMask[cellIndex] ?? 0;
  return {
    cellX: clampedX,
    cellY: clampedY,
    cellIndex,
    elevationWorld: terrain.elevationWorld,
    normalizedElevation: terrain.elevationWorld / TERRAIN_VERTICAL_SCALE,
    slope: terrain.slope,
    moisture: readClimate(data.moisture, cellIndex, 0.58),
    temperature: readClimate(data.temperature, cellIndex, 0.58),
    biome: data.biome[cellIndex] ?? BIOME_KIND_CODES.plains,
    waterKind: data.waterKind[cellIndex] ?? WATER_KIND_CODES.none,
    nearWater: terrain.nearWater,
    landmassId: data.landmassId[cellIndex] ?? 0,
    resourceMask,
    resourceIntensity: terrain.resourceIntensity / 255,
  };
}

export function getTerrainVisualProfile(sample: TerrainVisualSample): TerrainVisualProfile {
  if (sample.waterKind !== WATER_KIND_CODES.none) {
    return EMPTY_PROFILE;
  }

  const coast = sample.nearWater || sample.biome === BIOME_KIND_CODES.coast;
  if (sample.biome === BIOME_KIND_CODES.wetland) {
    return {
      canopy: ['tree_birch_lod0'],
      understory: ['reed_cluster_lod0', 'shrub_cluster_lod0', 'grass_clump_lod0'],
      rocks: ['rock_pebbles_lod0'],
      shore: coast ? ['shore_stones_lod0', 'driftwood_lod0'] : [],
      canopyDensity: 0.05,
      understoryDensity: 0.52,
      rockDensity: 0.04,
      shoreDensity: coast ? 0.38 : 0,
      clearingBias: 0.85,
    };
  }
  if (sample.biome === BIOME_KIND_CODES.mountains || sample.slope > 0.34) {
    return {
      canopy: sample.temperature > 0.42 ? ['tree_pine_lod0', 'tree_spruce_lod0'] : ['tree_spruce_lod0'],
      understory: ['grass_clump_lod0'],
      rocks: ['rock_outcrop_lod0', 'rock_boulder_lod0', 'rock_pebbles_lod0'],
      shore: [],
      canopyDensity: THREE_LIKE_CLAMP(0.04 + (1 - sample.slope) * 0.18, 0, 0.2),
      understoryDensity: 0.12,
      rockDensity: 0.2,
      shoreDensity: 0,
      clearingBias: 1.2,
    };
  }
  if (sample.biome === BIOME_KIND_CODES.forest) {
    return {
      canopy: sample.temperature > 0.55
        ? ['tree_oak_lod0', 'tree_birch_lod0', 'tree_pine_lod0', 'tree_spruce_lod0']
        : ['tree_spruce_lod0', 'tree_pine_lod0', 'tree_birch_lod0'],
      understory: ['shrub_cluster_lod0', 'grass_clump_lod0'],
      rocks: ['rock_pebbles_lod0', 'rock_boulder_lod0'],
      shore: coast ? ['shore_stones_lod0', 'driftwood_lod0'] : [],
      canopyDensity: 0.62 + sample.moisture * 0.18,
      understoryDensity: 0.34 + sample.moisture * 0.2,
      rockDensity: 0.06,
      shoreDensity: coast ? 0.3 : 0,
      clearingBias: 0.72 + sample.slope * 0.4,
    };
  }
  if (sample.biome === BIOME_KIND_CODES.hills) {
    return {
      canopy: ['tree_pine_lod0', 'tree_birch_lod0', 'tree_oak_lod0'],
      understory: ['grass_clump_lod0', 'shrub_cluster_lod0'],
      rocks: ['rock_pebbles_lod0', 'rock_boulder_lod0'],
      shore: coast ? ['shore_stones_lod0'] : [],
      canopyDensity: 0.16 + sample.moisture * 0.2,
      understoryDensity: 0.3,
      rockDensity: 0.1,
      shoreDensity: coast ? 0.28 : 0,
      clearingBias: 1.05,
    };
  }
  return {
    canopy: sample.temperature > 0.52 ? ['tree_oak_lod0', 'tree_birch_lod0'] : ['tree_pine_lod0'],
    understory: ['grass_clump_lod0', 'shrub_cluster_lod0'],
    rocks: ['rock_pebbles_lod0'],
    shore: coast ? ['shore_stones_lod0', 'driftwood_lod0'] : [],
    canopyDensity: coast ? 0.08 : 0.04,
    understoryDensity: 0.32 + sample.moisture * 0.12,
    rockDensity: 0.05,
    shoreDensity: coast ? 0.32 : 0,
    clearingBias: 1.1,
  };
}

export function isPlacementCompatible(sample: TerrainVisualSample, family: 'canopy' | 'understory' | 'rock' | 'shore'): boolean {
  if (sample.waterKind !== WATER_KIND_CODES.none || sample.slope > 0.52) {
    return false;
  }
  if (family === 'shore') {
    return sample.nearWater || sample.biome === BIOME_KIND_CODES.coast;
  }
  if (family === 'rock') {
    return sample.biome !== BIOME_KIND_CODES.wetland || sample.slope > 0.16;
  }
  return sample.biome !== BIOME_KIND_CODES.coast || sample.nearWater;
}

export function deterministicVisualValue(cellIndex: number, landmassId: number, salt = 0): number {
  let value = cellIndex ^ Math.imul(landmassId + 1, 0x9e37_79b9) ^ Math.imul(salt + 1, 0x85eb_ca6b);
  value = Math.imul(value ^ (value >>> 16), 0xc2b2_ae35);
  value = Math.imul(value ^ (value >>> 13), 0x27d4_eb2d);
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_295;
}

function readClimate(values: Uint8Array, index: number, fallback: number): number {
  return values[index] === undefined ? fallback : values[index] / 255;
}

function THREE_LIKE_CLAMP(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

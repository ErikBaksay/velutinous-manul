export const MAP_WIDTH = 1024;
export const MAP_HEIGHT = 1024;
export const MAP_CELL_COUNT = MAP_WIDTH * MAP_HEIGHT;
export const HEIGHT_SAMPLE_WIDTH = MAP_WIDTH + 1;
export const HEIGHT_SAMPLE_HEIGHT = MAP_HEIGHT + 1;
export const HEIGHT_SAMPLE_COUNT = HEIGHT_SAMPLE_WIDTH * HEIGHT_SAMPLE_HEIGHT;

export type MapPreset = 'balanced-continental' | 'riverlands' | 'highland-frontier';

export const MAP_PRESETS: readonly MapPreset[] = [
  'balanced-continental',
  'riverlands',
  'highland-frontier',
];

export interface MapConfig {
  seed: string;
  preset: MapPreset;
  width: number;
  height: number;
  waterCoverage: number;
  terrainRoughness: number;
  forestDensity: number;
  resourceAbundance: number;
}

export const DEFAULT_MAP_CONFIG: Readonly<MapConfig> = Object.freeze({
  seed: 'VM-START-001',
  preset: 'balanced-continental',
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  waterCoverage: 0.18,
  terrainRoughness: 0.5,
  forestDensity: 0.55,
  resourceAbundance: 0.6,
});

export const MAX_WATER_COVERAGE = 0.95;

export type ResourceKind =
  | 'iron-ore'
  | 'copper-ore'
  | 'stone'
  | 'timber'
  | 'fertile-land';

export const RESOURCE_KINDS: readonly ResourceKind[] = [
  'iron-ore',
  'copper-ore',
  'stone',
  'timber',
  'fertile-land',
];

export const RESOURCE_MASK_CODES: Readonly<Record<ResourceKind, number>> = Object.freeze({
  'iron-ore': 1,
  'copper-ore': 2,
  stone: 4,
  timber: 8,
  'fertile-land': 16,
});

export type WaterKind = 'none' | 'ocean' | 'lake' | 'river';

export const WATER_KIND_CODES: Readonly<Record<WaterKind, number>> = Object.freeze({
  none: 0,
  ocean: 1,
  lake: 2,
  river: 3,
});

export type BiomeKind = 'plains' | 'forest' | 'hills' | 'mountains' | 'wetland' | 'coast';

export const BIOME_KIND_CODES: Readonly<Record<BiomeKind, number>> = Object.freeze({
  plains: 0,
  forest: 1,
  hills: 2,
  mountains: 3,
  wetland: 4,
  coast: 5,
});

export const MAP_FLAG_CODES = Object.freeze({
  buildable: 1,
  impassable: 2,
  forest: 4,
});

export interface DepositSource {
  id: number;
  kind: 'iron-ore' | 'copper-ore' | 'stone';
  centerCell: number;
  radius: number;
  strength: number;
  baseCapacity: number;
  resourceProvinceId: number;
}

export interface MapSummary {
  seed: string;
  configHash: string;
  mapIdentity: string;
  mapHash: string;
  seaLevelSample: number;
  riverCellCount: number;
  regionCount: number;
  buildableCellCount: number;
  resourceProvinceCount: number;
  resourceSourceCount: number;
  startingCell: number;
  startingBuildableCellCount: number;
  startingStonePathCost: number;
  startingTimberPathCost: number;
  startingFertileLandPathCost: number;
  startingIronPathCost: number;
  startingCopperPathCost: number;
  startingValidCandidateCount: number;
  generationDurationMs: number;
  estimatedFinalBytes: number;
  estimatedPeakBytes: number;
}

export type GenerationPhase =
  | 'prepare'
  | 'terrain'
  | 'erosion'
  | 'sea-level-and-water'
  | 'hydrology'
  | 'biomes-and-landmasses'
  | 'resource-provinces'
  | 'resource-validation'
  | 'chunk-preparation'
  | 'complete';

export interface AuthoritativeMapData {
  heightSamples: Uint16Array;
  moisture: Uint8Array;
  temperature: Uint8Array;
  biome: Uint8Array;
  waterKind: Uint8Array;
  flags: Uint8Array;
  landmassId: Uint16Array;
  resourceProvinceId: Uint16Array;
  resourceMask: Uint8Array;
  resourceIntensity: Record<ResourceKind, Uint8Array>;
  deposits: DepositSource[];
}

export type TransferableMapData = AuthoritativeMapData;

export function createEmptyAuthoritativeMapData(): AuthoritativeMapData {
  const resourceIntensity = {} as Record<ResourceKind, Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(MAP_CELL_COUNT);
  }

  return {
    heightSamples: new Uint16Array(HEIGHT_SAMPLE_COUNT),
    moisture: new Uint8Array(MAP_CELL_COUNT),
    temperature: new Uint8Array(MAP_CELL_COUNT),
    biome: new Uint8Array(MAP_CELL_COUNT),
    waterKind: new Uint8Array(MAP_CELL_COUNT),
    flags: new Uint8Array(MAP_CELL_COUNT),
    landmassId: new Uint16Array(MAP_CELL_COUNT),
    resourceProvinceId: new Uint16Array(MAP_CELL_COUNT),
    resourceMask: new Uint8Array(MAP_CELL_COUNT),
    resourceIntensity,
    deposits: [],
  };
}

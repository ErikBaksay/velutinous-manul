import {
  DEFAULT_MAP_CONFIG,
  MAP_FLAG_CODES,
  WATER_KIND_CODES,
  createEmptyAuthoritativeMapData,
} from './map-types';
import { generateTerrainHeightSamples } from './terrain-generation';
import { applyLightweightErosion, classifyOceanAndLakes } from './water-generation';
import { generateRivers } from './hydrology-generation';
import { generateBiomesAndLandmasses } from './biome-generation';
import { generateResourceProvincesAndFields } from './resource-generation';
import {
  COPPER_MAX_PATH_COST,
  IRON_MAX_PATH_COST,
  LOCAL_RESOURCE_MAX_PATH_COST,
  MIN_START_BUILDABLE_AREA,
  repairStartingResources,
  selectStartingBasin,
  selectStartingBasinCandidate,
} from './starting-basin-generation';

describe('starting basin generation', () => {
  it('repairs and validates deterministic starting resource reachability', () => {
    const data = generateMapData();
    const candidate = selectStartingBasinCandidate(data, DEFAULT_MAP_CONFIG);
    repairStartingResources(data, candidate);
    const result = selectStartingBasin(data, DEFAULT_MAP_CONFIG);

    expect(result.startingCell).toBeGreaterThanOrEqual(0);
    expect(data.waterKind[result.startingCell]).toBe(WATER_KIND_CODES.none);
    expect(data.flags[result.startingCell] & MAP_FLAG_CODES.buildable).not.toBe(0);
    expect(result.buildableCellCount).toBeGreaterThanOrEqual(MIN_START_BUILDABLE_AREA);
    expect(result.stonePathCost).toBeLessThanOrEqual(LOCAL_RESOURCE_MAX_PATH_COST);
    expect(result.timberPathCost).toBeLessThanOrEqual(LOCAL_RESOURCE_MAX_PATH_COST);
    expect(result.fertileLandPathCost).toBeLessThanOrEqual(LOCAL_RESOURCE_MAX_PATH_COST);
    expect(result.ironPathCost).toBeLessThanOrEqual(IRON_MAX_PATH_COST);
    expect(result.copperPathCost).toBeLessThanOrEqual(COPPER_MAX_PATH_COST);
    expect(result.validCandidateCount).toBeGreaterThan(0);
  });

  it('produces the same repaired basin for the same seed and configuration', () => {
    const first = generateMapData();
    const second = generateMapData();
    const firstCandidate = selectStartingBasinCandidate(first, DEFAULT_MAP_CONFIG);
    const secondCandidate = selectStartingBasinCandidate(second, DEFAULT_MAP_CONFIG);
    repairStartingResources(first, firstCandidate);
    repairStartingResources(second, secondCandidate);

    expect(selectStartingBasin(first, DEFAULT_MAP_CONFIG)).toEqual(
      selectStartingBasin(second, DEFAULT_MAP_CONFIG),
    );
    expect(first.deposits).toEqual(second.deposits);
  });

  it('keeps a high-elevation seed playable after relative biome classification', () => {
    const config = { ...DEFAULT_MAP_CONFIG, seed: 'VELUTINOUS-MANUL-e73c4b5c-89c5059b' };
    const data = generateMapData(config);
    const candidate = selectStartingBasinCandidate(data, config);
    repairStartingResources(data, candidate);
    const result = selectStartingBasin(data, config);

    expect(result.buildableCellCount).toBeGreaterThanOrEqual(MIN_START_BUILDABLE_AREA);
    expect(result.copperPathCost).toBeLessThanOrEqual(COPPER_MAX_PATH_COST);
  });
});

function generateMapData(config = DEFAULT_MAP_CONFIG) {
  const data = createEmptyAuthoritativeMapData();
  generateTerrainHeightSamples(config, data.heightSamples);
  applyLightweightErosion(data.heightSamples);
  classifyOceanAndLakes(data, config);
  generateRivers(data);
  generateBiomesAndLandmasses(data, config);
  generateResourceProvincesAndFields(data, config);
  return data;
}

import {
  BIOME_KIND_CODES,
  DEFAULT_MAP_CONFIG,
  HEIGHT_SAMPLE_COUNT,
  MAP_CELL_COUNT,
  RESOURCE_KINDS,
  AuthoritativeMapData,
  WATER_KIND_CODES,
} from './map-types';
import { generateTerrainHeightSamples } from './terrain-generation';
import { applyLightweightErosion, classifyOceanAndLakes } from './water-generation';
import { generateRivers } from './hydrology-generation';
import { generateBiomesAndLandmasses } from './biome-generation';
import { generateResourceProvincesAndFields } from './resource-generation';

describe('resource province and renewable field generation', () => {
  it('assigns deterministic provinces and renewable fields only to land cells', () => {
    const first = generateResourceData(DEFAULT_MAP_CONFIG);
    const second = generateResourceData(DEFAULT_MAP_CONFIG);

    expect(first.result.resourceProvinceCount).toBe(24);
    expect(first.result.timberCellCount).toBeGreaterThan(0);
    expect(first.result.fertileCellCount).toBeGreaterThan(0);
    expect(first.data.resourceProvinceId).toEqual(second.data.resourceProvinceId);
    expect(first.data.resourceMask).toEqual(second.data.resourceMask);
    expect(first.data.resourceIntensity.timber).toEqual(second.data.resourceIntensity.timber);
    expect(first.data.resourceIntensity['fertile-land']).toEqual(
      second.data.resourceIntensity['fertile-land'],
    );
    expect(first.result.depositSources).toEqual(second.result.depositSources);
    expect(first.result.depositSources.length).toBeGreaterThan(0);
    expect(first.result.depositSources.every((deposit) => deposit.resourceProvinceId > 0)).toBe(true);

    let landCellCount = 0;
    for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
      if (first.data.waterKind[cellIndex] === WATER_KIND_CODES.none) {
        landCellCount += 1;
        expect(first.data.resourceProvinceId[cellIndex]).toBeGreaterThan(0);
      } else {
        expect(first.data.resourceProvinceId[cellIndex]).toBe(0);
        expect(first.data.resourceMask[cellIndex]).toBe(0);
      }
    }
    expect(landCellCount).toBeGreaterThan(0);
  }, 300_000);

  it('responds measurably to global resource abundance', () => {
    const scarceConfig = { ...DEFAULT_MAP_CONFIG, resourceAbundance: 0 };
    const abundantConfig = { ...DEFAULT_MAP_CONFIG, resourceAbundance: 1 };
    const scarce = generateResourceData(scarceConfig);
    const abundant = generateResourceData(abundantConfig);

    expect(scarce.result.timberCellCount).toBe(0);
    expect(scarce.result.fertileCellCount).toBe(0);
    expect(scarce.result.depositSources.length).toBe(0);
    expect(abundant.result.depositSources.length).toBeGreaterThan(scarce.result.depositSources.length);
    expect(sum(abundant.data.resourceIntensity.timber)).toBeGreaterThan(
      sum(scarce.data.resourceIntensity.timber),
    );
    expect(sum(abundant.data.resourceIntensity['fertile-land'])).toBeGreaterThan(
      sum(scarce.data.resourceIntensity['fertile-land']),
    );
  });

  it('does not treat unrelated biomes as renewable fields', () => {
    const { data } = generateResourceData(DEFAULT_MAP_CONFIG);
    for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
      if (data.biome[cellIndex] !== BIOME_KIND_CODES.forest) {
        expect(data.resourceIntensity.timber[cellIndex]).toBe(0);
      }
      if (
        data.biome[cellIndex] !== BIOME_KIND_CODES.plains &&
        data.biome[cellIndex] !== BIOME_KIND_CODES.wetland
      ) {
        expect(data.resourceIntensity['fertile-land'][cellIndex]).toBe(0);
      }
    }
  }, 300_000);
});

function generateResourceData(config: typeof DEFAULT_MAP_CONFIG) {
  const data = createData();
  generateTerrainHeightSamples(config, data.heightSamples);
  applyLightweightErosion(data.heightSamples);
  classifyOceanAndLakes(data, config);
  generateRivers(data);
  generateBiomesAndLandmasses(data, config);
  const result = generateResourceProvincesAndFields(data, config);
  return { data, result };
}

function createData(): AuthoritativeMapData {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
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

function sum(values: Uint8Array): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

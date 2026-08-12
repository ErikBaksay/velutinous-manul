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

describe('biome and landmass generation', () => {
  it('classifies every cell and assigns landmass IDs to non-water cells', () => {
    const data = createData();
    generateTerrainHeightSamples(DEFAULT_MAP_CONFIG, data.heightSamples);
    applyLightweightErosion(data.heightSamples);
    classifyOceanAndLakes(data, DEFAULT_MAP_CONFIG);
    generateRivers(data);

    const result = generateBiomesAndLandmasses(data, DEFAULT_MAP_CONFIG);
    const classifiedCells = Object.values(result.biomeCounts).reduce(
      (total, count) => total + count,
      0,
    );

    expect(result.landmassCount).toBeGreaterThan(0);
    expect(result.buildableCellCount).toBeGreaterThan(0);
    expect(classifiedCells).toBe(MAP_CELL_COUNT);

    for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
      expect(data.biome[cellIndex]).toBeGreaterThanOrEqual(BIOME_KIND_CODES.plains);
      expect(data.biome[cellIndex]).toBeLessThanOrEqual(BIOME_KIND_CODES.coast);
      if (data.waterKind[cellIndex] !== WATER_KIND_CODES.none) {
        expect(data.biome[cellIndex]).toBe(BIOME_KIND_CODES.coast);
        expect(data.landmassId[cellIndex]).toBe(0);
      }
    }
  }, 300_000);
});

function createData(): AuthoritativeMapData {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(0);
  }

  return {
    heightSamples: new Uint16Array(HEIGHT_SAMPLE_COUNT),
    moisture: new Uint8Array(MAP_CELL_COUNT),
    temperature: new Uint8Array(MAP_CELL_COUNT),
    biome: new Uint8Array(MAP_CELL_COUNT),
    waterKind: new Uint8Array(MAP_CELL_COUNT),
    flags: new Uint8Array(MAP_CELL_COUNT),
    landmassId: new Uint16Array(MAP_CELL_COUNT),
    resourceProvinceId: new Uint16Array(0),
    resourceMask: new Uint8Array(0),
    resourceIntensity,
    deposits: [],
  };
}

import {
  DEFAULT_MAP_CONFIG,
  HEIGHT_SAMPLE_COUNT,
  MAP_CELL_COUNT,
  RESOURCE_KINDS,
  AuthoritativeMapData,
} from './map-types';
import { generateTerrainHeightSamples } from './terrain-generation';
import { applyLightweightErosion, classifyOceanAndLakes } from './water-generation';
import { generateRivers } from './hydrology-generation';

describe('hydrology generation', () => {
  it('generates terminating rivers without cycles from deterministic downhill flow', () => {
    const data = createHeightOnlyData();
    generateTerrainHeightSamples(DEFAULT_MAP_CONFIG, data.heightSamples);
    applyLightweightErosion(data.heightSamples);
    classifyOceanAndLakes(data, DEFAULT_MAP_CONFIG);

    const result = generateRivers(data);

    expect(result.riverCellCount).toBeGreaterThan(0);
    expect(result.riverTerminationCount).toBeGreaterThan(0);
    expect(result.riverCycleCount).toBe(0);
    expect(result.maximumAccumulation).toBeGreaterThan(512);
  });
});

function createHeightOnlyData(): AuthoritativeMapData {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(0);
  }

  return {
    heightSamples: new Uint16Array(HEIGHT_SAMPLE_COUNT),
    moisture: new Uint8Array(0),
    temperature: new Uint8Array(0),
    biome: new Uint8Array(0),
    waterKind: new Uint8Array(MAP_CELL_COUNT),
    flags: new Uint8Array(0),
    landmassId: new Uint16Array(0),
    resourceProvinceId: new Uint16Array(0),
    resourceMask: new Uint8Array(0),
    resourceIntensity,
    deposits: [],
  };
}

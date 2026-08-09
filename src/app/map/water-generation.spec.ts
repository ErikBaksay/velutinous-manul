import {
  DEFAULT_MAP_CONFIG,
  HEIGHT_SAMPLE_COUNT,
  HEIGHT_SAMPLE_WIDTH,
  MAP_CELL_COUNT,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_WATER_COVERAGE,
  RESOURCE_KINDS,
  AuthoritativeMapData,
} from './map-types';
import { generateTerrainHeightSamples } from './terrain-generation';
import { applyLightweightErosion, classifyOceanAndLakes } from './water-generation';

describe('water generation', () => {
  it('applies bounded deterministic erosion to terrain peaks', () => {
    const first = new Uint16Array(HEIGHT_SAMPLE_COUNT).fill(20_000);
    const second = new Uint16Array(HEIGHT_SAMPLE_COUNT).fill(20_000);
    const center = Math.floor(HEIGHT_SAMPLE_WIDTH / 2);
    const centerIndex = center * HEIGHT_SAMPLE_WIDTH + center;
    first[centerIndex] = 60_000;
    second[centerIndex] = 60_000;

    applyLightweightErosion(first);
    applyLightweightErosion(second);

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(first[centerIndex]).toBeLessThan(60_000);
    expect(first[centerIndex]).toBeGreaterThanOrEqual(0);
  });

  it('keeps total generated water close to the configured coverage', () => {
    const data = createHeightOnlyData();
    generateTerrainHeightSamples(DEFAULT_MAP_CONFIG, data.heightSamples);
    const result = classifyOceanAndLakes(data, { ...DEFAULT_MAP_CONFIG, waterCoverage: 0.25 });
    const totalWater = result.oceanCellCount + result.lakeCellCount;

    expect(totalWater / MAP_CELL_COUNT).toBeGreaterThan(0.21);
    expect(totalWater / MAP_CELL_COUNT).toBeLessThan(0.29);
    expect(result.oceanCellCount).toBeGreaterThan(0);
  });

  it('caps water coverage so a requested all-water map still leaves playable land', () => {
    const data = createHeightOnlyData();
    generateTerrainHeightSamples(DEFAULT_MAP_CONFIG, data.heightSamples);
    const result = classifyOceanAndLakes(data, { ...DEFAULT_MAP_CONFIG, waterCoverage: 1 });
    const totalWater = result.oceanCellCount + result.lakeCellCount;

    expect(totalWater).toBeLessThan(MAP_CELL_COUNT);
    expect(totalWater / MAP_CELL_COUNT).toBeLessThanOrEqual(MAX_WATER_COVERAGE + 0.02);
  });

  it('keeps enclosed submerged areas as lakes instead of oceans', () => {
    const data = createHeightOnlyData();
    for (let sampleY = 0; sampleY <= MAP_HEIGHT; sampleY += 1) {
      for (let sampleX = 0; sampleX <= MAP_WIDTH; sampleX += 1) {
        const insideBasin =
          sampleX > MAP_WIDTH * 0.25 &&
          sampleX < MAP_WIDTH * 0.75 &&
          sampleY > MAP_HEIGHT * 0.25 &&
          sampleY < MAP_HEIGHT * 0.75;
        data.heightSamples[sampleY * HEIGHT_SAMPLE_WIDTH + sampleX] = insideBasin
          ? 10_000
          : 50_000;
      }
    }

    const result = classifyOceanAndLakes(data, { ...DEFAULT_MAP_CONFIG, waterCoverage: 0.18 });

    expect(result.oceanCellCount).toBe(0);
    expect(result.lakeCellCount).toBeGreaterThan(0);
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

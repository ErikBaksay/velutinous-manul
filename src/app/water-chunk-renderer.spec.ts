import {
  HEIGHT_SAMPLE_COUNT,
  MAP_CELL_COUNT,
  MAP_WIDTH,
  RESOURCE_KINDS,
  AuthoritativeMapData,
  WATER_KIND_CODES,
} from './map/map-types';
import { createWaterChunkGeometry } from './water-chunk-renderer';

describe('water chunks', () => {
  it('creates one flat water quad for each classified water cell', () => {
    const data = createWaterOnlyData();
    const cellX = 16 * 32 + 4;
    const cellY = 16 * 32 + 7;
    data.waterKind[cellY * MAP_WIDTH + cellX] = WATER_KIND_CODES.lake;

    const geometry = createWaterChunkGeometry(data, 16, 16, 12.5);
    const positions = geometry.getAttribute('position');
    const indices = geometry.getIndex();

    expect(positions.count).toBe(4);
    expect(indices?.count).toBe(6);
    expect(positions.getY(0)).toBeCloseTo(12.5, 5);
    geometry.dispose();
  });
});

function createWaterOnlyData(): AuthoritativeMapData {
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

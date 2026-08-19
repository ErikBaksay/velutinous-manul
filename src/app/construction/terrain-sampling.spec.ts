import {
  HEIGHT_SAMPLE_COUNT,
  MAP_CELL_COUNT,
  RESOURCE_KINDS,
  AuthoritativeMapData,
} from '../map/map-types';
import { TERRAIN_VERTICAL_SCALE } from '../map/terrain-generation';
import { getTerrainHeightAtCellLocal, getTerrainHeightAtSamplePosition } from './terrain-sampling';

describe('construction terrain sampling', () => {
  const dimensions = { width: 2, height: 2 } as const;

  it('samples flat terrain consistently at corners and interior points', () => {
    const data = createHeightData(dimensions, 12_000);

    expect(getTerrainHeightAtCellLocal(data, dimensions, { x: 0, y: 0 }, -0.5, -0.5))
      .toBeCloseTo(height(12_000), 5);
    expect(getTerrainHeightAtCellLocal(data, dimensions, { x: 0, y: 0 }, 0, 0))
      .toBeCloseTo(height(12_000), 5);
    expect(getTerrainHeightAtSamplePosition(data, dimensions, 1.25, 1.75))
      .toBeCloseTo(height(12_000), 5);
  });

  it('follows directional slopes at arbitrary points', () => {
    const data = createHeightData(dimensions, 0);
    for (let y = 0; y <= dimensions.height; y += 1) {
      for (let x = 0; x <= dimensions.width; x += 1) {
        data.heightSamples[y * (dimensions.width + 1) + x] = x * 1_000;
      }
    }

    expect(getTerrainHeightAtCellLocal(data, dimensions, { x: 0, y: 0 }, -0.25, 0))
      .toBeCloseTo(height(250), 5);
    expect(getTerrainHeightAtCellLocal(data, dimensions, { x: 0, y: 0 }, 0.25, 0))
      .toBeCloseTo(height(750), 5);
  });

  it('uses the terrain diagonal rather than bilinear interpolation', () => {
    const data = createHeightData(dimensions, 0);
    setCellCornerHeights(data, dimensions, { x: 0, y: 0 }, [0, 10_000, 20_000, 30_000]);

    expect(getTerrainHeightAtCellLocal(data, dimensions, { x: 0, y: 0 }, -0.25, -0.25))
      .toBeCloseTo(height(7_500), 5);
    expect(getTerrainHeightAtCellLocal(data, dimensions, { x: 0, y: 0 }, 0.25, 0.25))
      .toBeCloseTo(height(22_500), 5);
    expect(getTerrainHeightAtCellLocal(data, dimensions, { x: 0, y: 0 }, 0, 0))
      .toBeCloseTo(height(15_000), 5);
  });

  it('matches the shared edge between neighboring cells', () => {
    const data = createHeightData(dimensions, 0);
    for (let y = 0; y <= dimensions.height; y += 1) {
      for (let x = 0; x <= dimensions.width; x += 1) {
        data.heightSamples[y * (dimensions.width + 1) + x] = (x + y * 2) * 1_000;
      }
    }

    const eastEdge = getTerrainHeightAtCellLocal(data, dimensions, { x: 0, y: 0 }, 0.5, 0.15);
    const westEdge = getTerrainHeightAtCellLocal(data, dimensions, { x: 1, y: 0 }, -0.5, 0.15);
    expect(eastEdge).toBeCloseTo(westEdge, 5);
  });
});

function createHeightData(
  dimensions: { readonly width: number; readonly height: number },
  sample: number,
): AuthoritativeMapData {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(MAP_CELL_COUNT);
  }
  const data: AuthoritativeMapData = {
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
  data.heightSamples.fill(sample);
  return data;
}

function setCellCornerHeights(
  data: AuthoritativeMapData,
  dimensions: { readonly width: number; readonly height: number },
  cell: { readonly x: number; readonly y: number },
  heights: readonly [number, number, number, number],
): void {
  const sampleWidth = dimensions.width + 1;
  data.heightSamples[cell.y * sampleWidth + cell.x] = heights[0];
  data.heightSamples[cell.y * sampleWidth + cell.x + 1] = heights[1];
  data.heightSamples[(cell.y + 1) * sampleWidth + cell.x] = heights[2];
  data.heightSamples[(cell.y + 1) * sampleWidth + cell.x + 1] = heights[3];
}

function height(sample: number): number {
  return sample / 65_535 * TERRAIN_VERTICAL_SCALE;
}

import * as THREE from 'three';
import {
  BIOME_KIND_CODES,
  HEIGHT_SAMPLE_COUNT,
  HEIGHT_SAMPLE_WIDTH,
  MAP_CELL_COUNT,
  RESOURCE_KINDS,
} from './map/map-types';
import {
  calculateTerrainColor,
  calculateTerrainNormal,
  createChunkGeometry,
} from './terrain-chunk-renderer';

describe('terrain chunks', () => {
  it('derives identical normals on both sides of a chunk boundary', () => {
    const data = createHeightOnlyData();
    const leftGeometry = createChunkGeometry(data, 0, 0);
    const rightGeometry = createChunkGeometry(data, 1, 0);
    const leftNormals = leftGeometry.getAttribute('normal');
    const rightNormals = rightGeometry.getAttribute('normal');

    for (let localY = 0; localY <= 32; localY += 1) {
      const leftOffset = (localY * 33 + 32) * 3;
      const rightOffset = localY * 33 * 3;
      expect(leftNormals.getX(localY * 33 + 32)).toBeCloseTo(
        rightNormals.getX(localY * 33),
        5,
      );
      expect(leftNormals.getY(localY * 33 + 32)).toBeCloseTo(
        rightNormals.getY(localY * 33),
        5,
      );
      expect(leftNormals.getZ(localY * 33 + 32)).toBeCloseTo(
        rightNormals.getZ(localY * 33),
        5,
      );
      expect(leftNormals.array[leftOffset]).toBeCloseTo(rightNormals.array[rightOffset], 5);
    }

    const normal = calculateTerrainNormal(data, 32, 12);
    expect(new THREE.Vector3(normal.x, normal.y, normal.z).length()).toBeCloseTo(1, 5);
    leftGeometry.dispose();
    rightGeometry.dispose();
  });

  it('varies terrain color from biome climate values and deterministic regions', () => {
    const data = createHeightOnlyData();
    data.moisture = new Uint8Array(MAP_CELL_COUNT).fill(240);
    data.temperature = new Uint8Array(MAP_CELL_COUNT).fill(220);

    const lushColor = calculateTerrainColor(
      data,
      32,
      32,
      8,
      0.92,
      BIOME_KIND_CODES.forest,
    );
    const dryColor = calculateTerrainColor(
      { ...data, moisture: new Uint8Array(MAP_CELL_COUNT).fill(40) },
      32,
      32,
      8,
      0.92,
      BIOME_KIND_CODES.forest,
    );
    const neighboringRegionColor = calculateTerrainColor(
      data,
      42,
      32,
      8,
      0.92,
      BIOME_KIND_CODES.forest,
    );

    expect(lushColor.getHex()).not.toBe(dryColor.getHex());
    expect(lushColor.getHex()).not.toBe(neighboringRegionColor.getHex());
  });
});

function createHeightOnlyData() {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(0);
  }

  const data = {
    heightSamples: new Uint16Array(HEIGHT_SAMPLE_COUNT),
    moisture: new Uint8Array(0),
    temperature: new Uint8Array(0),
    biome: new Uint8Array(0),
    waterKind: new Uint8Array(0),
    flags: new Uint8Array(0),
    landmassId: new Uint16Array(0),
    resourceProvinceId: new Uint16Array(0),
    resourceMask: new Uint8Array(0),
    resourceIntensity,
    deposits: [],
  };

  for (let y = 0; y <= 1024; y += 1) {
    for (let x = 0; x <= 1024; x += 1) {
      data.heightSamples[y * HEIGHT_SAMPLE_WIDTH + x] = (x * 37 + y * 19) % 65_535;
    }
  }

  return data;
}

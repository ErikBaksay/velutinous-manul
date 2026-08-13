import * as THREE from 'three';
import {
  BIOME_KIND_CODES,
  HEIGHT_SAMPLE_COUNT,
  MAP_CELL_COUNT,
  RESOURCE_KINDS,
  AuthoritativeMapData,
  WATER_KIND_CODES,
} from './map/map-types';
import {
  countForestCandidates,
  countForestTypes,
  ForestChunkRenderer,
} from './forest-chunk-renderer';

describe('forest chunks', () => {
  it('places deterministic instanced trees only in forest cells', () => {
    const data = createForestData();
    const firstCount = countForestCandidates(data, 16, 16);
    const secondCount = countForestCandidates(data, 16, 16);
    const scene = new THREE.Scene();
    const renderer = new ForestChunkRenderer(scene, data);

    expect(firstCount).toBeGreaterThan(0);
    expect(secondCount).toBe(firstCount);
    const forestTypes = countForestTypes(data, 16, 16);
    expect(forestTypes.conifer).toBeGreaterThan(0);
    expect(forestTypes.broadleaf).toBeGreaterThan(0);
    expect(scene.getObjectByName('forest-chunks')?.children.length).toBeGreaterThan(0);
    expect(scene.getObjectByName('forest-chunks')?.children.some((child) => child.name.endsWith('-conifer'))).toBe(true);
    expect(scene.getObjectByName('forest-chunks')?.children.some((child) => child.name.endsWith('-broadleaf'))).toBe(true);

    renderer.destroy();
    expect(scene.getObjectByName('forest-chunks')).toBeUndefined();
  });
});

function createForestData(): AuthoritativeMapData {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(0);
  }

  return {
    heightSamples: new Uint16Array(HEIGHT_SAMPLE_COUNT),
    moisture: new Uint8Array(0),
    temperature: new Uint8Array(0),
    biome: new Uint8Array(MAP_CELL_COUNT).fill(BIOME_KIND_CODES.forest),
    waterKind: new Uint8Array(MAP_CELL_COUNT).fill(WATER_KIND_CODES.none),
    flags: new Uint8Array(0),
    landmassId: new Uint16Array(MAP_CELL_COUNT).fill(1),
    resourceProvinceId: new Uint16Array(0),
    resourceMask: new Uint8Array(0),
    resourceIntensity,
    deposits: [],
  };
}

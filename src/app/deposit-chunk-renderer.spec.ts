import * as THREE from 'three';
import {
  DepositSource,
  HEIGHT_SAMPLE_COUNT,
  MAP_CELL_COUNT,
  RESOURCE_KINDS,
  AuthoritativeMapData,
  WATER_KIND_CODES,
} from './map/map-types';
import { countActiveDeposits, DepositChunkRenderer } from './deposit-chunk-renderer';
import { VisualAssetRegistry } from './visual-asset-registry';

describe('deposit outcrops', () => {
  it('renders only deposits inside the active chunk window', () => {
    const data = createDepositData([
      createDeposit(1, 'iron-ore', 512, 512),
      createDeposit(2, 'copper-ore', 900, 900),
    ]);
    const scene = new THREE.Scene();

    expect(countActiveDeposits(data)).toBe(1);
    const renderer = new DepositChunkRenderer(scene, data);
    const group = scene.getObjectByName('deposit-outcrops');

    expect(group).toBeDefined();
    expect(group?.getObjectByName('deposit-outcrops-iron-ore')).toBeDefined();
    expect(group?.getObjectByName('deposit-outcrops-copper-ore')).toBeUndefined();
    expect(group?.getObjectByName('deposit-marker-1')).toBeDefined();
    expect(group?.getObjectByName('deposit-marker-2')).toBeUndefined();
    expect(group?.getObjectByName('deposit-marker-1')?.position.y).toBeGreaterThan(0);

    renderer.destroy();
    expect(scene.getObjectByName('deposit-outcrops')).toBeUndefined();
  });

  it('keeps an injected visual asset registry alive after renderer destruction', () => {
    const data = createDepositData([]);
    const scene = new THREE.Scene();
    const assets = new VisualAssetRegistry();
    assets.ensureReady();
    const renderer = new DepositChunkRenderer(scene, data, assets, []);

    renderer.destroy();

    expect(assets.has('ore_iron_lod0')).toBeTrue();
    assets.destroy();
  });
});

function createDeposit(
  id: number,
  kind: DepositSource['kind'],
  cellX: number,
  cellY: number,
): DepositSource {
  return {
    id,
    kind,
    centerCell: cellY * 1024 + cellX,
    radius: 7,
    strength: 0.8,
    baseCapacity: 1_000,
    resourceProvinceId: 1,
  };
}

function createDepositData(deposits: DepositSource[]): AuthoritativeMapData {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(0);
  }

  return {
    heightSamples: new Uint16Array(HEIGHT_SAMPLE_COUNT),
    moisture: new Uint8Array(0),
    temperature: new Uint8Array(0),
    biome: new Uint8Array(MAP_CELL_COUNT),
    waterKind: new Uint8Array(MAP_CELL_COUNT).fill(WATER_KIND_CODES.none),
    flags: new Uint8Array(0),
    landmassId: new Uint16Array(0),
    resourceProvinceId: new Uint16Array(0),
    resourceMask: new Uint8Array(0),
    resourceIntensity,
    deposits,
  };
}

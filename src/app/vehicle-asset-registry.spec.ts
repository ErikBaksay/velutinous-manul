import * as THREE from 'three';
import {
  COURIER_VAN_ASSET_ID,
  VehicleAssetRegistry,
} from './vehicle-asset-registry';

describe('vehicle asset registry', () => {
  it('loads the authored courier van hierarchy and validates grounded bounds', async () => {
    const registry = new VehicleAssetRegistry();
    await registry.load();

    expect(registry.hasCourierVan()).toBe(true);
    const prototype = registry.getCourierVan();
    const size = prototype.bounds.getSize(new THREE.Vector3());

    expect(prototype.id).toBe(COURIER_VAN_ASSET_ID);
    expect(prototype.root.name).toBe(COURIER_VAN_ASSET_ID);
    expect(size.x).toBeGreaterThan(5.5);
    expect(size.x).toBeLessThan(6.6);
    expect(size.y).toBeCloseTo(2.48, 1);
    expect(size.z).toBeCloseTo(2.2, 1);
    expect(prototype.bounds.min.y).toBeCloseTo(0, 5);
    expect(prototype.root.children.length).toBeGreaterThan(1);

    registry.destroy();
    expect(registry.hasCourierVan()).toBe(false);
  });

  it('creates independent visual instances and cleans up the shared source', async () => {
    const registry = new VehicleAssetRegistry();
    await registry.load();

    const first = registry.createCourierVanInstance();
    const second = registry.createCourierVanInstance();

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
    expect(first?.children.length).toBeGreaterThan(1);

    registry.destroy();
    expect(registry.createCourierVanInstance()).toBeNull();
  });
});

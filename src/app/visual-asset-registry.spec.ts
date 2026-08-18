import * as THREE from 'three';
import { VisualAssetRegistry } from './visual-asset-registry';

describe('visual asset registry', () => {
  it('exposes the complete original environment kit without external dependencies', () => {
    const registry = new VisualAssetRegistry();
    registry.ensureReady();

    expect(registry.has('tree_spruce_lod0')).toBe(true);
    expect(registry.has('tree_oak_lod0')).toBe(true);
    expect(registry.has('reed_cluster_lod0')).toBe(true);
    expect(registry.has('shore_stones_lod0')).toBe(true);
    expect(registry.has('ore_iron_lod0')).toBe(true);
    expect(registry.listFamily('canopy').length).toBeGreaterThanOrEqual(4);
    expect(registry.getLodAsset('tree_spruce_lod0', 1).lod).toBe(1);

    registry.destroy();
    expect(registry.listFamily('canopy').length).toBe(0);
  });

  it('bakes authored transforms and grounds loaded assets', async () => {
    const registry = new VisualAssetRegistry();
    await registry.load();

    const boulder = registry.get('rock_boulder_lod0');
    boulder.geometry.computeBoundingBox();
    const bounds = boulder.geometry.boundingBox;

    expect(bounds).not.toBeNull();
    expect(bounds?.min.y).toBeCloseTo(0, 5);
    expect(bounds?.max.y).toBeCloseTo(1.224, 2);

    registry.destroy();
  });

  it('keeps composite nature trees on the upright procedural compatibility kit', async () => {
    const registry = new VisualAssetRegistry();
    await registry.load();

    for (const baseId of ['tree_spruce', 'tree_pine', 'tree_birch', 'tree_oak']) {
      for (const lod of [0, 1] as const) {
        const tree = registry.getLodAsset(`${baseId}_lod0`, lod);
        tree.geometry.computeBoundingBox();
        const size = tree.geometry.boundingBox?.getSize(new THREE.Vector3());

        expect(size).toBeDefined();
        expect(size?.y ?? 0).toBeGreaterThan((size?.x ?? Number.POSITIVE_INFINITY) * 1.35);
        expect(size?.y ?? 0).toBeGreaterThan((size?.z ?? Number.POSITIVE_INFINITY) * 1.35);
      }
    }

    registry.destroy();
  });

  it('loads the composite mine while retaining grounded single-mesh nature assets', async () => {
    const registry = new VisualAssetRegistry();
    await registry.load();

    for (const id of [
      'shrub_cluster_lod0',
      'grass_clump_lod0',
      'reed_cluster_lod0',
      'rock_pebbles_lod0',
      'rock_boulder_lod0',
      'rock_outcrop_lod0',
      'shore_stones_lod0',
      'driftwood_lod0',
    ]) {
      const nature = registry.get(id);
      nature.geometry.computeBoundingBox();
      expect(nature.geometry.boundingBox?.min.y).toBeCloseTo(0, 5);
    }

    for (const lod of [0, 1] as const) {
      const mine = registry.getLodAsset('mine_shaft_house_lod0', lod);
      mine.geometry.computeBoundingBox();
      const size = mine.geometry.boundingBox?.getSize(new THREE.Vector3());

      expect(size?.x).toBeCloseTo(14.9, 1);
      expect(size?.z).toBeLessThanOrEqual(6.01);
      expect(Array.isArray(mine.material)).toBe(true);
      expect(Array.isArray(mine.material) ? mine.material.length : 0).toBeGreaterThan(1);
    }

    registry.destroy();
  });
});

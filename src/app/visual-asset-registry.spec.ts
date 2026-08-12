import { VisualAssetRegistry } from './visual-asset-registry';

describe('visual asset registry', () => {
  it('exposes the complete original environment kit without external dependencies', () => {
    const registry = new VisualAssetRegistry();
    registry.ensureReady();

    expect(registry.has('tree_spruce_lod0')).toBeTrue();
    expect(registry.has('tree_oak_lod0')).toBeTrue();
    expect(registry.has('reed_cluster_lod0')).toBeTrue();
    expect(registry.has('shore_stones_lod0')).toBeTrue();
    expect(registry.has('ore_iron_lod0')).toBeTrue();
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
});

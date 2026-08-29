import * as THREE from 'three';
import { getRegisteredVisualAssetFamily, VisualAssetRegistry } from './visual-asset-registry';

describe('visual asset registry contract', () => {
  it('registers the authored mine as a building asset family', () => {
    expect(getRegisteredVisualAssetFamily('mine_shaft_house')).toBe('building');
  });

  it('registers the authored warehouse as a building asset family', () => {
    expect(getRegisteredVisualAssetFamily('warehouse')).toBe('building');
  });

  it('registers the church and Residential Building 01 under stable IDs', () => {
    expect(getRegisteredVisualAssetFamily('church')).toBe('building');
    expect(getRegisteredVisualAssetFamily('residential_01')).toBe('building');
  });

  it('provides both settlement LODs and a procedural fallback contract', () => {
    const registry = new VisualAssetRegistry();
    registry.ensureReady();

    for (const [id, width, depth] of [
      ['church', 6.4, 14.0],
      ['residential_01', 9.27, 7.02],
    ] as const) {
      const lod0 = registry.get(`${id}_lod0`);
      const lod1 = registry.get(`${id}_lod1`);
      lod0.geometry.computeBoundingBox();
      const size = lod0.geometry.boundingBox?.getSize(new THREE.Vector3());
      expect(size?.x).toBeCloseTo(width);
      expect(size?.z).toBeCloseTo(depth);
      expect(lod1.lod).toBe(1);
    }

    registry.destroy();
  });
});

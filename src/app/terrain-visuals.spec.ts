import { createEmptyAuthoritativeMapData, BIOME_KIND_CODES, WATER_KIND_CODES } from './map/map-types';
import {
  deterministicVisualValue,
  getTerrainVisualProfile,
  isPlacementCompatible,
  sampleTerrainVisual,
} from './terrain-visuals';

describe('terrain visual habitats', () => {
  it('produces deterministic samples and forest habitat profiles', () => {
    const data = createEmptyAuthoritativeMapData();
    const cell = 512 * 1024 + 512;
    data.biome[cell] = BIOME_KIND_CODES.forest;
    data.moisture[cell] = 190;
    data.temperature[cell] = 150;

    const first = sampleTerrainVisual(data, 512, 512);
    const second = sampleTerrainVisual(data, 512, 512);
    const profile = getTerrainVisualProfile(first);

    expect(first).toEqual(second);
    expect(profile.canopy).toContain('tree_spruce_lod0');
    expect(profile.understory.length).toBeGreaterThan(0);
    expect(isPlacementCompatible(first, 'canopy')).toBe(true);
    expect(deterministicVisualValue(first.cellIndex, first.landmassId, 4))
      .toBe(deterministicVisualValue(first.cellIndex, first.landmassId, 4));
  });

  it('rejects all environment placement on water', () => {
    const data = createEmptyAuthoritativeMapData();
    const cell = 256 * 1024 + 256;
    data.waterKind[cell] = WATER_KIND_CODES.lake;
    const sample = sampleTerrainVisual(data, 256, 256);

    expect(getTerrainVisualProfile(sample).canopy).toEqual([]);
    expect(isPlacementCompatible(sample, 'canopy')).toBe(false);
    expect(isPlacementCompatible(sample, 'shore')).toBe(false);
  });
});

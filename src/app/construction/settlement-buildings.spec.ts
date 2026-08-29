import {
  createVelutinousManulConstructionDefinitionRegistry,
  VELUTINOUS_MANUL_CHURCH_DEFINITION,
  VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION,
} from './index';

describe('settlement building definitions', () => {
  it('defines the church at 7×14 with strict land placement', () => {
    expect(VELUTINOUS_MANUL_CHURCH_DEFINITION.footprint).toEqual({ width: 7, height: 14 });
    expect(VELUTINOUS_MANUL_CHURCH_DEFINITION.placement).toEqual({
      requiresBuildable: true,
      allowWater: false,
      allowImpassable: false,
      maxSlope: 0.2,
    });
  });

  it('defines Residential Building 01 at 10×8 with strict land placement', () => {
    expect(VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION.footprint).toEqual({ width: 10, height: 8 });
    expect(VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION.placement).toEqual({
      requiresBuildable: true,
      allowWater: false,
      allowImpassable: false,
      maxSlope: 0.2,
    });
  });

  it('registers both settlement definitions alongside existing construction', () => {
    const registry = createVelutinousManulConstructionDefinitionRegistry();
    expect(registry.get(VELUTINOUS_MANUL_CHURCH_DEFINITION.id)).toBe(VELUTINOUS_MANUL_CHURCH_DEFINITION);
    expect(registry.get(VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION.id))
      .toBe(VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION);
  });
});

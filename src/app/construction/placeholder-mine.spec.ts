import {
  createVelutinousManulConstructionDefinitionRegistry,
  VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
  VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID,
} from './placeholder-mine';

describe('Velutinous Manul placeholder mine definition', () => {
  it('defines the configurable 2×2 strict-land placeholder mine', () => {
    expect(VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION).toEqual({
      id: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID,
      footprint: { width: 2, height: 2 },
      placement: {
        requiresBuildable: true,
        allowWater: false,
        allowImpassable: false,
        maxSlope: 0.2,
      },
    });
  });

  it('creates a registry containing the placeholder mine', () => {
    const registry = createVelutinousManulConstructionDefinitionRegistry();

    expect(registry.get(VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID)).toBe(
      VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    );
  });
});

import {
  createVelutinousManulConstructionDefinitionRegistry,
  VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
  VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID,
} from './placeholder-mine';
import { VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID } from './warehouse';

describe('Velutinous Manul placeholder mine definition', () => {
  it('defines the configurable 15×6 strict-land mine', () => {
    expect(VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION).toEqual({
      id: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID,
      footprint: { width: 15, height: 6 },
      placement: {
        requiresBuildable: true,
        allowWater: false,
        allowImpassable: false,
        maxSlope: 0.2,
      },
    });
  });

  it('creates a registry containing the mine and warehouse', () => {
    const registry = createVelutinousManulConstructionDefinitionRegistry();

    expect(registry.get(VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID)).toBe(
      VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    );
    expect(registry.has(VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID)).toBe(true);
  });
});

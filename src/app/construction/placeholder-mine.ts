import {
  BuildingDefinition,
  createBuildingDefinitionRegistry,
} from './building-definitions';
import { VELUTINOUS_MANUL_WAREHOUSE_DEFINITION } from './warehouse';

export const VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID =
  'velutinous-manul-placeholder-mine' as const;

export const VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION: BuildingDefinition = Object.freeze({
  id: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID,
  footprint: Object.freeze({
    width: 15,
    height: 6,
  }),
  placement: Object.freeze({
    requiresBuildable: true,
    allowWater: false,
    allowImpassable: false,
    maxSlope: 0.2,
  }),
});

export function createVelutinousManulConstructionDefinitionRegistry(): ReadonlyMap<
  string,
  BuildingDefinition
> {
  return createBuildingDefinitionRegistry([
    VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    VELUTINOUS_MANUL_WAREHOUSE_DEFINITION,
  ]);
}

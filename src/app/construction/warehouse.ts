import type { BuildingDefinition } from './building-definitions';

export const VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID =
  'velutinous-manul-warehouse' as const;

export const VELUTINOUS_MANUL_WAREHOUSE_DEFINITION: BuildingDefinition = Object.freeze({
  id: VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID,
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

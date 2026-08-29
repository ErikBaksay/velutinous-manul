import type { BuildingDefinition } from './building-definitions';

export const VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID =
  'velutinous-manul-residential-01' as const;

export const VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION: BuildingDefinition = Object.freeze({
  id: VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID,
  footprint: Object.freeze({
    width: 10,
    height: 8,
  }),
  placement: Object.freeze({
    requiresBuildable: true,
    allowWater: false,
    allowImpassable: false,
    maxSlope: 0.2,
  }),
});

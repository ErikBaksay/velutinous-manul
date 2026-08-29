import type { BuildingDefinition } from './building-definitions';

export const VELUTINOUS_MANUL_CHURCH_DEFINITION_ID =
  'velutinous-manul-church' as const;

export const VELUTINOUS_MANUL_CHURCH_DEFINITION: BuildingDefinition = Object.freeze({
  id: VELUTINOUS_MANUL_CHURCH_DEFINITION_ID,
  footprint: Object.freeze({
    width: 7,
    height: 14,
  }),
  placement: Object.freeze({
    requiresBuildable: true,
    allowWater: false,
    allowImpassable: false,
    maxSlope: 0.2,
  }),
});

import { validateRectangularFootprint, RectangularFootprint } from './footprint';

export interface PlacementPolicy {
  readonly requiresBuildable: boolean;
  readonly allowWater: boolean;
  readonly allowImpassable: boolean;
  readonly maxSlope: number;
}

export interface BuildingDefinition {
  readonly id: string;
  readonly footprint: RectangularFootprint;
  readonly placement: PlacementPolicy;
}

export type BuildingDefinitionIssue =
  | 'invalid-id'
  | 'invalid-footprint'
  | 'invalid-requires-buildable'
  | 'invalid-allow-water'
  | 'invalid-allow-impassable'
  | 'invalid-max-slope';

export function validateBuildingDefinition(
  definition: BuildingDefinition,
): readonly BuildingDefinitionIssue[] {
  const issues: BuildingDefinitionIssue[] = [];
  if (definition.id.trim().length === 0) {
    issues.push('invalid-id');
  }
  if (validateRectangularFootprint(definition.footprint).length > 0) {
    issues.push('invalid-footprint');
  }
  if (typeof definition.placement.requiresBuildable !== 'boolean') {
    issues.push('invalid-requires-buildable');
  }
  if (typeof definition.placement.allowWater !== 'boolean') {
    issues.push('invalid-allow-water');
  }
  if (typeof definition.placement.allowImpassable !== 'boolean') {
    issues.push('invalid-allow-impassable');
  }
  if (!Number.isFinite(definition.placement.maxSlope) ||
      definition.placement.maxSlope < 0 ||
      definition.placement.maxSlope > 1) {
    issues.push('invalid-max-slope');
  }
  return issues;
}

export function createBuildingDefinitionRegistry(
  definitions: readonly BuildingDefinition[],
): ReadonlyMap<string, BuildingDefinition> {
  const registry = new Map<string, BuildingDefinition>();
  for (const definition of definitions) {
    if (validateBuildingDefinition(definition).length > 0) {
      throw new Error(`Building definition "${definition.id}" is invalid.`);
    }
    if (registry.has(definition.id)) {
      throw new Error(`Building definition "${definition.id}" is duplicated.`);
    }
    registry.set(definition.id, definition);
  }
  return registry;
}

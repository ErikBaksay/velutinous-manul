import type { BuildingDefinition } from '../construction/building-definitions';
import { getFootprintCells } from '../construction/footprint';
import type { CellCoordinate } from '../construction/grid-coordinates';
import {
  VELUTINOUS_MANUL_CHURCH_DEFINITION_ID,
  VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID,
} from '../construction';
import type { PlacedBuildingState, TownState } from '../save/save-contract';

export const TOWN_FOUNDING_RADIUS_CELLS = 8;
export const RESIDENTIAL_POPULATION_CAPACITY = 10;
export const RESIDENTIAL_WORKER_CAPACITY = 10;

export type TownFoundationFailureCode =
  | 'unknown-church'
  | 'church-already-founded'
  | 'missing-residence'
  | 'ambiguous-residence'
  | 'invalid-name';

export interface TownFoundationEvaluation {
  readonly valid: boolean;
  readonly churchBuildingId: string;
  readonly eligibleResidentialBuildingIds: readonly string[];
  readonly failureCode?: TownFoundationFailureCode;
}

export interface ResidentialTownAssignment {
  readonly townIds: readonly string[];
  readonly unfoundedChurchIds: readonly string[];
}

export type ResidentialPlacementFailureCode =
  | 'outside-town-influence'
  | 'ambiguous-town-influence';

export interface ResidentialPlacementEvaluation {
  readonly valid: boolean;
  readonly assignment: ResidentialTownAssignment;
  readonly failureCode?: ResidentialPlacementFailureCode;
  readonly targetTownId?: string;
  readonly targetChurchId?: string;
}

export interface TownCapacity {
  readonly population: number;
  readonly workers: number;
}

export function getBuildingFootprintCells(
  building: PlacedBuildingState,
  definitions: ReadonlyMap<string, BuildingDefinition>,
): readonly CellCoordinate[] {
  const definition = definitions.get(building.definitionId);
  if (!definition) {
    return [];
  }
  return getFootprintCells(
    definition.footprint,
    building.origin,
    building.rotationQuarterTurns,
  );
}

export function getChebyshevFootprintDistance(
  first: PlacedBuildingState,
  second: PlacedBuildingState,
  definitions: ReadonlyMap<string, BuildingDefinition>,
): number {
  const firstCells = getBuildingFootprintCells(first, definitions);
  const secondCells = getBuildingFootprintCells(second, definitions);
  if (firstCells.length === 0 || secondCells.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = Number.POSITIVE_INFINITY;
  for (const firstCell of firstCells) {
    for (const secondCell of secondCells) {
      distance = Math.min(
        distance,
        Math.max(
          Math.abs(firstCell.x - secondCell.x),
          Math.abs(firstCell.y - secondCell.y),
        ),
      );
    }
  }
  return distance;
}

export function isWithinTownInfluence(
  candidate: PlacedBuildingState,
  anchor: PlacedBuildingState,
  definitions: ReadonlyMap<string, BuildingDefinition>,
  radius = TOWN_FOUNDING_RADIUS_CELLS,
): boolean {
  return getChebyshevFootprintDistance(candidate, anchor, definitions) <= radius;
}

export function evaluateResidentialTownAssignment(
  residence: PlacedBuildingState,
  buildings: readonly PlacedBuildingState[],
  towns: readonly TownState[],
  definitions: ReadonlyMap<string, BuildingDefinition>,
): ResidentialTownAssignment {
  const byId = new Map(buildings.map((building) => [building.id, building]));
  const townIds = towns
    .filter((town) => town.residentialBuildingIds.includes(residence.id) ||
      townInfluenceBuildingIds(town).some((buildingId) => {
        const anchor = byId.get(buildingId);
        return anchor && isWithinTownInfluence(residence, anchor, definitions);
      }))
    .map((town) => town.id);
  const unfoundedChurchIds = buildings
    .filter((building) => building.definitionId === VELUTINOUS_MANUL_CHURCH_DEFINITION_ID)
    .filter((church) => !towns.some((town) => town.churchBuildingId === church.id))
    .filter((church) => isWithinTownInfluence(residence, church, definitions))
    .map((church) => church.id);

  return {
    townIds: [...new Set(townIds)].sort(),
    unfoundedChurchIds: [...new Set(unfoundedChurchIds)].sort(),
  };
}

export function evaluateResidentialPlacement(
  residence: PlacedBuildingState,
  buildings: readonly PlacedBuildingState[],
  towns: readonly TownState[],
  definitions: ReadonlyMap<string, BuildingDefinition>,
): ResidentialPlacementEvaluation {
  const assignment = evaluateResidentialTownAssignment(residence, buildings, towns, definitions);
  if (assignment.townIds.length === 1 && assignment.unfoundedChurchIds.length === 0) {
    return {
      valid: true,
      assignment,
      targetTownId: assignment.townIds[0],
    };
  }
  if (assignment.townIds.length === 0 && assignment.unfoundedChurchIds.length === 1) {
    return {
      valid: true,
      assignment,
      targetChurchId: assignment.unfoundedChurchIds[0],
    };
  }
  return {
    valid: false,
    assignment,
    failureCode: assignment.townIds.length > 1 ||
      assignment.unfoundedChurchIds.length > 1 ||
      (assignment.townIds.length > 0 && assignment.unfoundedChurchIds.length > 0)
      ? 'ambiguous-town-influence'
      : 'outside-town-influence',
  };
}

export function evaluateTownFoundation(
  church: PlacedBuildingState,
  buildings: readonly PlacedBuildingState[],
  towns: readonly TownState[],
  definitions: ReadonlyMap<string, BuildingDefinition>,
): TownFoundationEvaluation {
  if (church.definitionId !== VELUTINOUS_MANUL_CHURCH_DEFINITION_ID ||
      !definitions.has(church.definitionId)) {
    return {
      valid: false,
      churchBuildingId: church.id,
      eligibleResidentialBuildingIds: [],
      failureCode: 'unknown-church',
    };
  }
  if (towns.some((town) => town.churchBuildingId === church.id)) {
    return {
      valid: false,
      churchBuildingId: church.id,
      eligibleResidentialBuildingIds: [],
      failureCode: 'church-already-founded',
    };
  }

  const eligibleResidentialBuildingIds = buildings
    .filter((building) => building.definitionId === VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID)
    .filter((building) => !towns.some((town) => town.residentialBuildingIds.includes(building.id)))
    .filter((building) => {
      const assignment = evaluateResidentialTownAssignment(building, buildings, towns, definitions);
      return assignment.townIds.length === 0 &&
        assignment.unfoundedChurchIds.length === 1 &&
        assignment.unfoundedChurchIds[0] === church.id;
    })
    .map((building) => building.id)
    .sort();

  return eligibleResidentialBuildingIds.length > 0
    ? { valid: true, churchBuildingId: church.id, eligibleResidentialBuildingIds }
    : {
      valid: false,
      churchBuildingId: church.id,
      eligibleResidentialBuildingIds,
      failureCode: 'missing-residence',
    };
}

export function townInfluenceBuildingIds(town: TownState): readonly string[] {
  return [town.churchBuildingId, ...town.residentialBuildingIds];
}

export function getTownCapacity(town: TownState): TownCapacity {
  return {
    population: town.residentialBuildingIds.length * RESIDENTIAL_POPULATION_CAPACITY,
    workers: town.residentialBuildingIds.length * RESIDENTIAL_WORKER_CAPACITY,
  };
}

export function createTownState(
  id: string,
  name: string,
  churchBuildingId: string,
  residentialBuildingIds: readonly string[],
): TownState {
  return {
    id,
    name: name.trim(),
    churchBuildingId,
    residentialBuildingIds: [...new Set(residentialBuildingIds)].sort(),
  };
}

export function addResidenceToTown(
  towns: readonly TownState[],
  townId: string,
  residenceBuildingId: string,
): readonly TownState[] {
  return towns.map((town) => town.id !== townId
    ? town
    : {
      ...town,
      residentialBuildingIds: [...new Set([...town.residentialBuildingIds, residenceBuildingId])].sort(),
    });
}

export function removeBuildingFromTowns(
  towns: readonly TownState[],
  buildingId: string,
): readonly TownState[] {
  return towns
    .filter((town) => town.churchBuildingId !== buildingId || town.residentialBuildingIds.length > 0)
    .map((town) => ({
      ...town,
      residentialBuildingIds: town.residentialBuildingIds.filter((id) => id !== buildingId),
    }));
}

export function validateTownName(name: string, towns: readonly TownState[]): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'Enter a town name.';
  }
  if (trimmed.length > 40) {
    return 'Town names must be 40 characters or fewer.';
  }
  if (towns.some((town) => town.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
    return 'A town with that name already exists.';
  }
  return null;
}

export function getNextTownId(towns: readonly TownState[]): string {
  const ids = new Set(towns.map((town) => town.id));
  let ordinal = 1;
  while (ids.has(`town-${ordinal}`)) {
    ordinal += 1;
  }
  return `town-${ordinal}`;
}

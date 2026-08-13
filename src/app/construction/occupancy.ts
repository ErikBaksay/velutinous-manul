import type { PlacedBuildingState } from '../save/save-contract';
import { getFootprintCells } from './footprint';
import {
  cellCoordinateToIndex,
  CellCoordinate,
  getCellCount,
  GridDimensions,
} from './grid-coordinates';
import { BuildingDefinition } from './building-definitions';

export interface CellOccupancy {
  readonly width: number;
  readonly height: number;
  readonly ownerByCell: Int32Array;
  readonly buildingIds: readonly string[];
}

export type OccupancyIssueCode =
  | 'unknown-definition'
  | 'overlapping-buildings'
  | 'duplicate-building-id'
  | 'out-of-bounds';

export interface OccupancyIssue {
  readonly code: OccupancyIssueCode;
  readonly buildingId: string;
  readonly cell?: CellCoordinate;
  readonly conflictingBuildingId?: string;
}

export interface OccupancyBuildResult {
  readonly occupancy: CellOccupancy;
  readonly issues: readonly OccupancyIssue[];
}

export function createCellOccupancy(
  dimensions: GridDimensions,
  placedBuildings: readonly PlacedBuildingState[],
  definitions: ReadonlyMap<string, BuildingDefinition>,
): OccupancyBuildResult {
  const ownerByCell = new Int32Array(getCellCount(dimensions));
  ownerByCell.fill(-1);
  const buildingIds = placedBuildings.map((building) => building.id);
  const issues: OccupancyIssue[] = [];
  const seenIds = new Set<string>();

  placedBuildings.forEach((building, buildingIndex) => {
    if (seenIds.has(building.id)) {
      issues.push({ code: 'duplicate-building-id', buildingId: building.id });
    }
    seenIds.add(building.id);

    const definition = definitions.get(building.definitionId);
    if (!definition) {
      issues.push({ code: 'unknown-definition', buildingId: building.id });
      return;
    }

    for (const cell of getFootprintCells(
      definition.footprint,
      building.origin,
      building.rotationQuarterTurns,
    )) {
      const cellIndex = cellCoordinateToIndex(cell, dimensions);
      if (cellIndex === null) {
        issues.push({ code: 'out-of-bounds', buildingId: building.id, cell });
        continue;
      }

      const existingOwner = ownerByCell[cellIndex];
      if (existingOwner !== -1) {
        issues.push({
          code: 'overlapping-buildings',
          buildingId: building.id,
          cell,
          conflictingBuildingId: buildingIds[existingOwner],
        });
        continue;
      }
      ownerByCell[cellIndex] = buildingIndex;
    }
  });

  return {
    occupancy: {
      width: dimensions.width,
      height: dimensions.height,
      ownerByCell,
      buildingIds,
    },
    issues,
  };
}

export function getOccupyingBuildingId(
  occupancy: CellOccupancy,
  cellIndex: number,
): string | undefined {
  const ownerIndex = occupancy.ownerByCell[cellIndex];
  return ownerIndex === undefined || ownerIndex < 0
    ? undefined
    : occupancy.buildingIds[ownerIndex];
}

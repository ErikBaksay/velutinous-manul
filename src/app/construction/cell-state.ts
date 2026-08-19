import type { PlacedBuildingState, RoadState } from '../save/save-contract';
import { getFootprintCells } from './footprint';
import type { BuildingDefinition } from './building-definitions';
import {
  cellCoordinateToIndex,
  type GridDimensions,
} from './grid-coordinates';
import { getRoadCellIndices } from './road-network';
import type { CellOccupancy } from './occupancy';

export function getPlacedBuildingCellIndices(
  buildings: readonly PlacedBuildingState[],
  dimensions: GridDimensions,
  definitions: ReadonlyMap<string, BuildingDefinition>,
): readonly number[] {
  const cellIndices: number[] = [];
  for (const building of buildings) {
    const definition = definitions.get(building.definitionId);
    if (!definition) {
      continue;
    }
    for (const cell of getFootprintCells(
      definition.footprint,
      building.origin,
      building.rotationQuarterTurns,
    )) {
      const cellIndex = cellCoordinateToIndex(cell, dimensions);
      if (cellIndex !== null) {
        cellIndices.push(cellIndex);
      }
    }
  }
  return sortUniqueCellIndices(cellIndices, dimensions);
}

export function getCurrentConstructionCellIndices(
  occupancy: CellOccupancy,
  roads: readonly RoadState[],
  dimensions: GridDimensions,
): readonly number[] {
  const occupiedByBuildings: number[] = [];
  for (let cellIndex = 0; cellIndex < occupancy.ownerByCell.length; cellIndex += 1) {
    if ((occupancy.ownerByCell[cellIndex] ?? -1) >= 0) {
      occupiedByBuildings.push(cellIndex);
    }
  }
  return sortUniqueCellIndices(
    [...occupiedByBuildings, ...getRoadCellIndices(roads, dimensions)],
    dimensions,
  );
}

export function mergeClearedCellIndices(
  dimensions: GridDimensions,
  ...cellIndexSources: readonly (readonly number[])[]
): readonly number[] {
  return sortUniqueCellIndices(cellIndexSources.flat(), dimensions);
}

function sortUniqueCellIndices(
  cellIndices: readonly number[],
  dimensions: GridDimensions,
): readonly number[] {
  const unique = new Set<number>();
  const cellCount = dimensions.width * dimensions.height;
  for (const cellIndex of cellIndices) {
    if (Number.isInteger(cellIndex) && cellIndex >= 0 && cellIndex < cellCount) {
      unique.add(cellIndex);
    }
  }
  return [...unique].sort((left, right) => left - right);
}

import {
  MAP_FLAG_CODES,
  WATER_KIND_CODES,
  type AuthoritativeMapData,
} from '../map/map-types';
import type { RoadState } from '../save/save-contract';
import { getConstructionTerrainSample } from './placement-validation';
import {
  cellCoordinateToIndex,
  type CellCoordinate,
  type GridDimensions,
  isCellWithinBounds,
} from './grid-coordinates';
import { getOccupyingBuildingId, type CellOccupancy } from './occupancy';

export const ROAD_MAX_SLOPE = 0.2;

export const ROAD_CONNECTION_MASK = Object.freeze({
  north: 1,
  east: 2,
  south: 4,
  west: 8,
});

export type RoadConnectionMask = number;

export type RoadPlacementFailureCode =
  | 'out-of-bounds'
  | 'not-buildable'
  | 'impassable'
  | 'water'
  | 'slope-too-steep'
  | 'occupied-by-building'
  | 'duplicate-road';

export interface RoadPlacementFailure {
  readonly code: RoadPlacementFailureCode;
  readonly cell: CellCoordinate;
  readonly cellIndex?: number;
  readonly actualSlope?: number;
  readonly maxSlope?: number;
  readonly occupiedBy?: string;
}

export interface RoadPlacementValidationInput {
  readonly dimensions: GridDimensions;
  readonly mapData: AuthoritativeMapData;
  readonly occupancy: CellOccupancy;
  readonly roads: readonly RoadState[];
  readonly cell: CellCoordinate;
}

export interface RoadPlacementValidationResult {
  readonly valid: boolean;
  readonly cell: CellCoordinate;
  readonly cellIndex: number | null;
  readonly failures: readonly RoadPlacementFailure[];
}

export function getRoadCellKey(cell: CellCoordinate): string {
  return `${cell.x},${cell.y}`;
}

export function getRoadCellIndices(
  roads: readonly RoadState[],
  dimensions: GridDimensions,
): ReadonlySet<number> {
  const indices = new Set<number>();
  for (const road of roads) {
    const cellIndex = cellCoordinateToIndex(road.cell, dimensions);
    if (cellIndex !== null) {
      indices.add(cellIndex);
    }
  }
  return indices;
}

export function sortRoads(roads: readonly RoadState[]): readonly RoadState[] {
  return [...roads]
    .map((road) => ({ cell: { x: road.cell.x, y: road.cell.y } }))
    .sort((left, right) => left.cell.y - right.cell.y || left.cell.x - right.cell.x);
}

export function addRoad(
  roads: readonly RoadState[],
  cell: CellCoordinate,
): readonly RoadState[] {
  if (roads.some((road) => road.cell.x === cell.x && road.cell.y === cell.y)) {
    return sortRoads(roads);
  }
  return sortRoads([...roads, { cell: { x: cell.x, y: cell.y } }]);
}

export function removeRoad(
  roads: readonly RoadState[],
  cell: CellCoordinate,
): readonly RoadState[] {
  return sortRoads(roads.filter((road) => road.cell.x !== cell.x || road.cell.y !== cell.y));
}

export function deriveRoadConnectionMasks(
  roads: readonly RoadState[],
): ReadonlyMap<string, RoadConnectionMask> {
  const roadKeys = new Set(roads.map((road) => getRoadCellKey(road.cell)));
  const masks = new Map<string, RoadConnectionMask>();

  for (const road of sortRoads(roads)) {
    const { x, y } = road.cell;
    let mask = 0;
    if (roadKeys.has(getRoadCellKey({ x, y: y - 1 }))) {
      mask |= ROAD_CONNECTION_MASK.north;
    }
    if (roadKeys.has(getRoadCellKey({ x: x + 1, y }))) {
      mask |= ROAD_CONNECTION_MASK.east;
    }
    if (roadKeys.has(getRoadCellKey({ x, y: y + 1 }))) {
      mask |= ROAD_CONNECTION_MASK.south;
    }
    if (roadKeys.has(getRoadCellKey({ x: x - 1, y }))) {
      mask |= ROAD_CONNECTION_MASK.west;
    }
    masks.set(getRoadCellKey(road.cell), mask);
  }

  return masks;
}

export function validateRoadPlacement(
  input: RoadPlacementValidationInput,
): RoadPlacementValidationResult {
  const cell = { x: input.cell.x, y: input.cell.y };
  const failures: RoadPlacementFailure[] = [];
  const cellIndex = cellCoordinateToIndex(cell, input.dimensions);

  if (!isCellWithinBounds(cell, input.dimensions)) {
    failures.push({ code: 'out-of-bounds', cell });
    return { valid: false, cell, cellIndex: null, failures };
  }

  if (input.roads.some((road) => road.cell.x === cell.x && road.cell.y === cell.y)) {
    failures.push({ code: 'duplicate-road', cell, cellIndex: cellIndex! });
  }

  const flags = input.mapData.flags[cellIndex!] ?? 0;
  const waterKind = input.mapData.waterKind[cellIndex!] ?? WATER_KIND_CODES.none;
  const terrain = getConstructionTerrainSample(input.mapData, input.dimensions, cell);
  const occupiedBy = getOccupyingBuildingId(input.occupancy, cellIndex!);

  if ((flags & MAP_FLAG_CODES.buildable) === 0) {
    failures.push({ code: 'not-buildable', cell, cellIndex: cellIndex! });
  }
  if ((flags & MAP_FLAG_CODES.impassable) !== 0) {
    failures.push({ code: 'impassable', cell, cellIndex: cellIndex! });
  }
  if (waterKind !== WATER_KIND_CODES.none) {
    failures.push({ code: 'water', cell, cellIndex: cellIndex! });
  }
  if (terrain.slope > ROAD_MAX_SLOPE) {
    failures.push({
      code: 'slope-too-steep',
      cell,
      cellIndex: cellIndex!,
      actualSlope: terrain.slope,
      maxSlope: ROAD_MAX_SLOPE,
    });
  }
  if (occupiedBy !== undefined) {
    failures.push({
      code: 'occupied-by-building',
      cell,
      cellIndex: cellIndex!,
      occupiedBy,
    });
  }

  return { valid: failures.length === 0, cell, cellIndex, failures };
}

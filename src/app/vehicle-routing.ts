import type { BuildingDefinition } from './construction/building-definitions';
import { getFootprintCells } from './construction/footprint';
import type { CellCoordinate } from './construction/grid-coordinates';
import { getRoadCellKey } from './construction/road-network';
import type { PlacedBuildingState, RoadState } from './save/save-contract';

export interface CourierVanRoute {
  readonly sourceRoadCell: CellCoordinate;
  readonly destinationRoadCell: CellCoordinate;
  readonly cells: readonly CellCoordinate[];
}

const ROUTE_DIRECTIONS: readonly CellCoordinate[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export function findCourierVanRoute(
  source: PlacedBuildingState,
  destination: PlacedBuildingState,
  roads: readonly RoadState[],
  definitions: ReadonlyMap<string, BuildingDefinition>,
): CourierVanRoute | null {
  const sourceDefinition = definitions.get(source.definitionId);
  const destinationDefinition = definitions.get(destination.definitionId);
  if (!sourceDefinition || !destinationDefinition) {
    return null;
  }

  const roadKeys = new Set(roads.map((road) => getRoadCellKey(road.cell)));
  const sourceAccess = getAdjacentRoadCells(source, sourceDefinition, roadKeys);
  const destinationAccess = getAdjacentRoadCells(destination, destinationDefinition, roadKeys);
  if (sourceAccess.length === 0 || destinationAccess.length === 0) {
    return null;
  }

  const destinationKeys = new Set(destinationAccess.map(getRoadCellKey));
  const candidates: CourierVanRoute[] = [];
  for (const sourceRoadCell of sourceAccess) {
    const path = findPath(sourceRoadCell, destinationKeys, roadKeys);
    if (!path) {
      continue;
    }
    const destinationRoadCell = path[path.length - 1];
    if (!destinationRoadCell) {
      continue;
    }
    candidates.push({
      sourceRoadCell,
      destinationRoadCell,
      cells: path,
    });
  }

  candidates.sort(compareRoutes);
  return candidates[0] ?? null;
}

function getAdjacentRoadCells(
  building: PlacedBuildingState,
  definition: BuildingDefinition,
  roadKeys: ReadonlySet<string>,
): CellCoordinate[] {
  const footprint = getFootprintCells(
    definition.footprint,
    building.origin,
    building.rotationQuarterTurns,
  );
  const footprintKeys = new Set(footprint.map(getRoadCellKey));
  const access = new Map<string, CellCoordinate>();
  for (const cell of footprint) {
    for (const direction of ROUTE_DIRECTIONS) {
      const candidate = { x: cell.x + direction.x, y: cell.y + direction.y };
      const key = getRoadCellKey(candidate);
      if (!footprintKeys.has(key) && roadKeys.has(key)) {
        access.set(key, candidate);
      }
    }
  }
  return [...access.values()].sort(compareCells);
}

function findPath(
  start: CellCoordinate,
  destinationKeys: ReadonlySet<string>,
  roadKeys: ReadonlySet<string>,
): CellCoordinate[] | null {
  const startKey = getRoadCellKey(start);
  const queue: CellCoordinate[] = [{ ...start }];
  const previous = new Map<string, string | null>([[startKey, null]]);
  let destinationKey: string | undefined = destinationKeys.has(startKey) ? startKey : undefined;

  for (let index = 0; index < queue.length && !destinationKey; index += 1) {
    const current = queue[index];
    if (!current) {
      break;
    }
    for (const direction of ROUTE_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = getRoadCellKey(next);
      if (!roadKeys.has(nextKey) || previous.has(nextKey)) {
        continue;
      }
      previous.set(nextKey, getRoadCellKey(current));
      queue.push(next);
      if (destinationKeys.has(nextKey)) {
        destinationKey = nextKey;
        break;
      }
    }
  }

  if (!destinationKey) {
    return null;
  }

  const path: CellCoordinate[] = [];
  let currentKey: string | null | undefined = destinationKey;
  while (currentKey !== null && currentKey !== undefined) {
    const [x, y] = currentKey.split(',').map(Number);
    path.push({ x, y });
    currentKey = previous.get(currentKey);
  }
  return path.reverse();
}

function compareRoutes(left: CourierVanRoute, right: CourierVanRoute): number {
  return left.cells.length - right.cells.length ||
    compareCells(left.sourceRoadCell, right.sourceRoadCell) ||
    compareCells(left.destinationRoadCell, right.destinationRoadCell) ||
    compareCellSequences(left.cells, right.cells);
}

function compareCellSequences(left: readonly CellCoordinate[], right: readonly CellCoordinate[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = compareCells(left[index]!, right[index]!);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

function compareCells(left: CellCoordinate, right: CellCoordinate): number {
  return left.y - right.y || left.x - right.x;
}

import {
  MAP_CELL_COUNT,
  MAP_HEIGHT,
  MAP_WIDTH,
  AuthoritativeMapData,
  WATER_KIND_CODES,
} from './map-types';
import { getCellElevationSample } from './water-generation';

const FLOW_SINK = 0xff;
const RIVER_ACCUMULATION_THRESHOLD = 512;
const FLOW_DIRECTIONS = [
  { deltaX: -1, deltaY: -1 },
  { deltaX: 0, deltaY: -1 },
  { deltaX: 1, deltaY: -1 },
  { deltaX: -1, deltaY: 0 },
  { deltaX: 1, deltaY: 0 },
  { deltaX: -1, deltaY: 1 },
  { deltaX: 0, deltaY: 1 },
  { deltaX: 1, deltaY: 1 },
] as const;

export interface HydrologyResult {
  riverCellCount: number;
  riverTerminationCount: number;
  riverCycleCount: number;
  maximumAccumulation: number;
}

export function generateRivers(data: AuthoritativeMapData): HydrologyResult {
  const cellElevations = new Uint16Array(MAP_CELL_COUNT);
  const histogram = new Uint32Array(65_536);
  for (let cellY = 0; cellY < MAP_HEIGHT; cellY += 1) {
    for (let cellX = 0; cellX < MAP_WIDTH; cellX += 1) {
      const cellIndex = cellY * MAP_WIDTH + cellX;
      const elevation = getCellElevationSample(data, cellX, cellY);
      cellElevations[cellIndex] = elevation;
      histogram[elevation] += 1;
    }
  }

  const sortedCells = createElevationOrder(cellElevations, histogram);
  const flowDirection = new Uint8Array(MAP_CELL_COUNT).fill(FLOW_SINK);
  const flowAccumulation = new Uint32Array(MAP_CELL_COUNT);

  for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
    if (data.waterKind[cellIndex] === WATER_KIND_CODES.none) {
      flowAccumulation[cellIndex] = 1;
      flowDirection[cellIndex] = findDownhillDirection(cellIndex, cellElevations);
    }
  }

  let maximumAccumulation = 0;
  for (let orderIndex = sortedCells.length - 1; orderIndex >= 0; orderIndex -= 1) {
    const cellIndex = sortedCells[orderIndex];
    if (data.waterKind[cellIndex] !== WATER_KIND_CODES.none) {
      continue;
    }

    const accumulation = flowAccumulation[cellIndex];
    maximumAccumulation = Math.max(maximumAccumulation, accumulation);
    const downstream = getDownstreamCell(cellIndex, flowDirection[cellIndex]);
    if (downstream !== -1) {
      flowAccumulation[downstream] += accumulation;
    }
  }

  let riverCellCount = 0;
  for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
    if (
      data.waterKind[cellIndex] === WATER_KIND_CODES.none &&
      flowAccumulation[cellIndex] >= RIVER_ACCUMULATION_THRESHOLD
    ) {
      data.waterKind[cellIndex] = WATER_KIND_CODES.river;
      riverCellCount += 1;
    }
  }

  let riverTerminationCount = 0;
  for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
    if (data.waterKind[cellIndex] !== WATER_KIND_CODES.river) {
      continue;
    }

    const downstream = getDownstreamCell(cellIndex, flowDirection[cellIndex]);
    if (downstream === -1 || isTerminalWater(data.waterKind[downstream])) {
      riverTerminationCount += 1;
    }
  }

  return {
    riverCellCount,
    riverTerminationCount,
    riverCycleCount: validateNoFlowCycles(data, flowDirection),
    maximumAccumulation,
  };
}

function createElevationOrder(
  cellElevations: Uint16Array,
  histogram: Uint32Array,
): Uint32Array {
  const offsets = new Uint32Array(histogram.length + 1);
  for (let elevation = 0; elevation < histogram.length; elevation += 1) {
    offsets[elevation + 1] = offsets[elevation] + histogram[elevation];
  }

  const cursors = offsets.slice(0, histogram.length);
  const sortedCells = new Uint32Array(MAP_CELL_COUNT);
  for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
    const elevation = cellElevations[cellIndex];
    sortedCells[cursors[elevation]] = cellIndex;
    cursors[elevation] += 1;
  }
  return sortedCells;
}

function findDownhillDirection(cellIndex: number, cellElevations: Uint16Array): number {
  const cellX = cellIndex % MAP_WIDTH;
  const cellY = Math.floor(cellIndex / MAP_WIDTH);
  const elevation = cellElevations[cellIndex];
  let lowestElevation = elevation;
  let lowestDirection = FLOW_SINK;

  for (let direction = 0; direction < FLOW_DIRECTIONS.length; direction += 1) {
    const neighborX = cellX + FLOW_DIRECTIONS[direction].deltaX;
    const neighborY = cellY + FLOW_DIRECTIONS[direction].deltaY;
    if (neighborX < 0 || neighborX >= MAP_WIDTH || neighborY < 0 || neighborY >= MAP_HEIGHT) {
      continue;
    }

    const neighborIndex = neighborY * MAP_WIDTH + neighborX;
    if (cellElevations[neighborIndex] < lowestElevation) {
      lowestElevation = cellElevations[neighborIndex];
      lowestDirection = direction;
    }
  }

  return lowestDirection;
}

function getDownstreamCell(cellIndex: number, direction: number): number {
  if (direction === FLOW_SINK) {
    return -1;
  }

  const cellX = cellIndex % MAP_WIDTH;
  const cellY = Math.floor(cellIndex / MAP_WIDTH);
  const neighborX = cellX + FLOW_DIRECTIONS[direction].deltaX;
  const neighborY = cellY + FLOW_DIRECTIONS[direction].deltaY;
  if (neighborX < 0 || neighborX >= MAP_WIDTH || neighborY < 0 || neighborY >= MAP_HEIGHT) {
    return -1;
  }
  return neighborY * MAP_WIDTH + neighborX;
}

function isTerminalWater(waterKind: number): boolean {
  return (
    waterKind === WATER_KIND_CODES.ocean || waterKind === WATER_KIND_CODES.lake
  );
}

function validateNoFlowCycles(
  data: AuthoritativeMapData,
  flowDirection: Uint8Array,
): number {
  const visitStamp = new Uint32Array(MAP_CELL_COUNT);
  let stamp = 0;
  let cycleCount = 0;

  for (let startCell = 0; startCell < MAP_CELL_COUNT; startCell += 1) {
    if (data.waterKind[startCell] !== WATER_KIND_CODES.river) {
      continue;
    }

    stamp += 1;
    let cellIndex = startCell;
    while (cellIndex !== -1 && !isTerminalWater(data.waterKind[cellIndex])) {
      if (visitStamp[cellIndex] === stamp) {
        cycleCount += 1;
        break;
      }
      visitStamp[cellIndex] = stamp;
      cellIndex = getDownstreamCell(cellIndex, flowDirection[cellIndex]);
    }
  }

  return cycleCount;
}

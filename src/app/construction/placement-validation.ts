import {
  MAP_FLAG_CODES,
  WATER_KIND_CODES,
  AuthoritativeMapData,
} from '../map/map-types';
import { TERRAIN_VERTICAL_SCALE } from '../map/terrain-generation';
import type { GridOrigin, QuarterTurn } from '../save/save-contract';
import {
  BuildingDefinition,
  validateBuildingDefinition,
} from './building-definitions';
import { getFootprintCells, isQuarterTurn } from './footprint';
import {
  cellCoordinateToIndex,
  CellCoordinate,
  GridDimensions,
  isCellWithinBounds,
  isGridCoordinate,
} from './grid-coordinates';
import {
  CellOccupancy,
} from './occupancy';

export type PlacementFailureCode =
  | 'unknown-definition'
  | 'invalid-definition'
  | 'invalid-origin'
  | 'invalid-rotation'
  | 'origin-out-of-bounds'
  | 'footprint-out-of-bounds'
  | 'not-buildable'
  | 'impassable'
  | 'water'
  | 'slope-too-steep'
  | 'occupied'
  | 'missing-mineral-deposit';

export interface PlacementFailure {
  readonly code: PlacementFailureCode;
  readonly cell?: CellCoordinate;
  readonly cellIndex?: number;
  readonly actualSlope?: number;
  readonly maxSlope?: number;
  readonly occupiedBy?: string;
}

export interface PlacementCellDiagnostic {
  readonly cell: CellCoordinate;
  readonly cellIndex: number | null;
  readonly valid: boolean;
  readonly flags: number | null;
  readonly waterKind: number | null;
  readonly terrainSlope: number | null;
  readonly occupiedBy?: string;
  readonly failures: readonly PlacementFailure[];
}

export interface PlacementValidationInput {
  readonly dimensions: GridDimensions;
  readonly mapData: AuthoritativeMapData;
  readonly definitions: ReadonlyMap<string, BuildingDefinition>;
  readonly occupancy: CellOccupancy;
  readonly definitionId: string;
  readonly origin: GridOrigin;
  readonly rotationQuarterTurns: QuarterTurn;
}

export interface PlacementValidationResult {
  readonly valid: boolean;
  readonly definitionId: string;
  readonly origin: GridOrigin;
  readonly rotationQuarterTurns: QuarterTurn;
  readonly occupiedCells: readonly CellCoordinate[];
  readonly cellDiagnostics: readonly PlacementCellDiagnostic[];
  readonly failures: readonly PlacementFailure[];
}

export interface ConstructionTerrainSample {
  readonly elevationWorld: number;
  readonly slope: number;
}

export function validateBuildingPlacement(
  input: PlacementValidationInput,
): PlacementValidationResult {
  const failures: PlacementFailure[] = [];
  const definition = input.definitions.get(input.definitionId);
  const origin = { x: input.origin.x, y: input.origin.y };
  const rotationQuarterTurns = input.rotationQuarterTurns;

  if (!definition) {
    failures.push({ code: 'unknown-definition' });
  } else if (validateBuildingDefinition(definition).length > 0) {
    failures.push({ code: 'invalid-definition' });
  }

  if (!isGridCoordinate(origin)) {
    failures.push({ code: 'invalid-origin' });
  }
  if (!isQuarterTurn(rotationQuarterTurns)) {
    failures.push({ code: 'invalid-rotation' });
  }

  if (!definition || failures.some((failure) => failure.code === 'invalid-definition') ||
      failures.some((failure) => failure.code === 'invalid-origin') ||
      failures.some((failure) => failure.code === 'invalid-rotation')) {
    return createResult(input, [], [], failures);
  }

  if (!isCellWithinBounds(origin, input.dimensions)) {
    failures.push({ code: 'origin-out-of-bounds', cell: origin });
  }

  const occupiedCells = getFootprintCells(
    definition.footprint,
    origin,
    rotationQuarterTurns,
  );
  const cellDiagnostics: PlacementCellDiagnostic[] = [];

  for (const cell of occupiedCells) {
    const cellIndex = cellCoordinateToIndex(cell, input.dimensions);
    if (cellIndex === null) {
      const cellFailures: PlacementFailure[] = [
        { code: 'footprint-out-of-bounds', cell },
      ];
      cellDiagnostics.push({
        cell,
        cellIndex: null,
        valid: false,
        flags: null,
        waterKind: null,
        terrainSlope: null,
        failures: cellFailures,
      });
      failures.push(...cellFailures);
      continue;
    }

    const flags = input.mapData.flags[cellIndex] ?? 0;
    const waterKind = input.mapData.waterKind[cellIndex] ?? WATER_KIND_CODES.none;
    const terrain = getConstructionTerrainSample(input.mapData, input.dimensions, cell);
    const occupiedBy = getOccupyingBuildingId(input.occupancy, cellIndex);
    const cellFailures: PlacementFailure[] = [];

    if (definition.placement.requiresBuildable &&
        (flags & MAP_FLAG_CODES.buildable) === 0) {
      cellFailures.push({ code: 'not-buildable', cell, cellIndex });
    }
    if (!definition.placement.allowImpassable &&
        (flags & MAP_FLAG_CODES.impassable) !== 0) {
      cellFailures.push({ code: 'impassable', cell, cellIndex });
    }
    if (!definition.placement.allowWater && waterKind !== WATER_KIND_CODES.none) {
      cellFailures.push({ code: 'water', cell, cellIndex });
    }
    if (terrain.slope > definition.placement.maxSlope) {
      cellFailures.push({
        code: 'slope-too-steep',
        cell,
        cellIndex,
        actualSlope: terrain.slope,
        maxSlope: definition.placement.maxSlope,
      });
    }
    if (occupiedBy !== undefined) {
      cellFailures.push({ code: 'occupied', cell, cellIndex, occupiedBy });
    }

    const diagnostic: PlacementCellDiagnostic = {
      cell,
      cellIndex,
      valid: cellFailures.length === 0,
      flags,
      waterKind,
      terrainSlope: terrain.slope,
      ...(occupiedBy === undefined ? {} : { occupiedBy }),
      failures: cellFailures,
    };
    cellDiagnostics.push(diagnostic);
    failures.push(...cellFailures);
  }

  return createResult(input, occupiedCells, cellDiagnostics, failures);
}

export function getConstructionTerrainSample(
  mapData: AuthoritativeMapData,
  dimensions: GridDimensions,
  cell: CellCoordinate,
): ConstructionTerrainSample {
  const elevationWorld = readCellElevationWorld(mapData, dimensions, cell);
  const slopeX = (
    readHeightWorld(mapData, dimensions, cell.x + 1, cell.y) -
    readHeightWorld(mapData, dimensions, cell.x - 1, cell.y)
  ) / 2;
  const slopeZ = (
    readHeightWorld(mapData, dimensions, cell.x, cell.y + 1) -
    readHeightWorld(mapData, dimensions, cell.x, cell.y - 1)
  ) / 2;
  const normalLength = Math.hypot(slopeX, 1, slopeZ);

  return {
    elevationWorld,
    slope: 1 - 1 / normalLength,
  };
}

function getOccupyingBuildingId(occupancy: CellOccupancy, cellIndex: number): string | undefined {
  const ownerIndex = occupancy.ownerByCell[cellIndex];
  return ownerIndex === undefined || ownerIndex < 0
    ? undefined
    : occupancy.buildingIds[ownerIndex];
}

function createResult(
  input: PlacementValidationInput,
  occupiedCells: readonly CellCoordinate[],
  cellDiagnostics: readonly PlacementCellDiagnostic[],
  failures: readonly PlacementFailure[],
): PlacementValidationResult {
  return {
    valid: failures.length === 0,
    definitionId: input.definitionId,
    origin: { x: input.origin.x, y: input.origin.y },
    rotationQuarterTurns: input.rotationQuarterTurns,
    occupiedCells,
    cellDiagnostics,
    failures,
  };
}

function readCellElevationWorld(
  mapData: AuthoritativeMapData,
  dimensions: GridDimensions,
  cell: CellCoordinate,
): number {
  const topLeft = readHeightSample(mapData, dimensions, cell.x, cell.y);
  const topRight = readHeightSample(mapData, dimensions, cell.x + 1, cell.y);
  const bottomLeft = readHeightSample(mapData, dimensions, cell.x, cell.y + 1);
  const bottomRight = readHeightSample(mapData, dimensions, cell.x + 1, cell.y + 1);
  return ((topLeft + topRight + bottomLeft + bottomRight) / 4 / 65_535) * TERRAIN_VERTICAL_SCALE;
}

function readHeightWorld(
  mapData: AuthoritativeMapData,
  dimensions: GridDimensions,
  sampleX: number,
  sampleY: number,
): number {
  return readHeightSample(mapData, dimensions, sampleX, sampleY) / 65_535 * TERRAIN_VERTICAL_SCALE;
}

function readHeightSample(
  mapData: AuthoritativeMapData,
  dimensions: GridDimensions,
  sampleX: number,
  sampleY: number,
): number {
  const clampedX = Math.min(Math.max(sampleX, 0), dimensions.width);
  const clampedY = Math.min(Math.max(sampleY, 0), dimensions.height);
  return mapData.heightSamples[clampedY * (dimensions.width + 1) + clampedX] ?? 0;
}

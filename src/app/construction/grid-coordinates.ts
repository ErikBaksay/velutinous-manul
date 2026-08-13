export interface GridDimensions {
  readonly width: number;
  readonly height: number;
}

export interface GridCoordinate {
  readonly x: number;
  readonly y: number;
}

export interface CellCoordinate {
  readonly x: number;
  readonly y: number;
}

export interface WorldCellCenter {
  readonly x: number;
  readonly z: number;
}

export type GridCoordinateIssue = 'invalid-coordinate' | 'non-integer-x' | 'non-integer-y';

export function validateGridCoordinate(value: unknown): readonly GridCoordinateIssue[] {
  if (!isRecord(value)) {
    return ['invalid-coordinate'];
  }

  const issues: GridCoordinateIssue[] = [];
  if (!Number.isInteger(value['x'])) {
    issues.push('non-integer-x');
  }
  if (!Number.isInteger(value['y'])) {
    issues.push('non-integer-y');
  }
  return issues;
}

export function isGridCoordinate(value: unknown): value is GridCoordinate {
  return validateGridCoordinate(value).length === 0;
}

export function isValidGridDimensions(dimensions: GridDimensions): boolean {
  return Number.isInteger(dimensions.width) && dimensions.width > 0 &&
    Number.isInteger(dimensions.height) && dimensions.height > 0;
}

export function getCellCount(dimensions: GridDimensions): number {
  assertGridDimensions(dimensions);
  return dimensions.width * dimensions.height;
}

export function isCellWithinBounds(
  cell: CellCoordinate,
  dimensions: GridDimensions,
): boolean {
  return isValidGridDimensions(dimensions) &&
    Number.isInteger(cell.x) && Number.isInteger(cell.y) &&
    cell.x >= 0 && cell.x < dimensions.width &&
    cell.y >= 0 && cell.y < dimensions.height;
}

export function cellCoordinateToIndex(
  cell: CellCoordinate,
  dimensions: GridDimensions,
): number | null {
  if (!isCellWithinBounds(cell, dimensions)) {
    return null;
  }
  return cell.y * dimensions.width + cell.x;
}

export function cellIndexToCoordinate(
  cellIndex: number,
  dimensions: GridDimensions,
): CellCoordinate | null {
  if (!isValidGridDimensions(dimensions) ||
      !Number.isInteger(cellIndex) ||
      cellIndex < 0 ||
      cellIndex >= dimensions.width * dimensions.height) {
    return null;
  }

  return {
    x: cellIndex % dimensions.width,
    y: Math.floor(cellIndex / dimensions.width),
  };
}

export function cellToWorldCenter(
  cell: CellCoordinate,
  dimensions: GridDimensions,
): WorldCellCenter {
  assertGridDimensions(dimensions);
  return {
    x: cell.x + 0.5 - dimensions.width / 2,
    z: cell.y + 0.5 - dimensions.height / 2,
  };
}

export function worldToCellCoordinate(
  worldX: number,
  worldZ: number,
  dimensions: GridDimensions,
): CellCoordinate | null {
  if (!isValidGridDimensions(dimensions) || !Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
    return null;
  }

  const cell = {
    x: Math.floor(worldX + dimensions.width / 2),
    y: Math.floor(worldZ + dimensions.height / 2),
  };
  return isCellWithinBounds(cell, dimensions) ? cell : null;
}

function assertGridDimensions(dimensions: GridDimensions): void {
  if (!isValidGridDimensions(dimensions)) {
    throw new Error('Grid dimensions must be positive integers.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

import type { GridOrigin, QuarterTurn } from '../save/save-contract';
import type { CellCoordinate, GridCoordinate } from './grid-coordinates';

export interface RectangularFootprint {
  readonly width: number;
  readonly height: number;
}

export type FootprintIssue = 'invalid-width' | 'invalid-height' | 'invalid-rotation';

export function validateRectangularFootprint(
  footprint: RectangularFootprint,
): readonly FootprintIssue[] {
  const issues: FootprintIssue[] = [];
  if (!Number.isInteger(footprint.width) || footprint.width <= 0) {
    issues.push('invalid-width');
  }
  if (!Number.isInteger(footprint.height) || footprint.height <= 0) {
    issues.push('invalid-height');
  }
  return issues;
}

export function isQuarterTurn(value: unknown): value is QuarterTurn {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function getRotatedFootprintSize(
  footprint: RectangularFootprint,
  rotationQuarterTurns: QuarterTurn,
): RectangularFootprint {
  assertRectangularFootprint(footprint);
  assertQuarterTurn(rotationQuarterTurns);

  return rotationQuarterTurns % 2 === 0
    ? { width: footprint.width, height: footprint.height }
    : { width: footprint.height, height: footprint.width };
}

export function getFootprintCells(
  footprint: RectangularFootprint,
  origin: GridOrigin,
  rotationQuarterTurns: QuarterTurn,
): readonly CellCoordinate[] {
  assertRectangularFootprint(footprint);
  assertQuarterTurn(rotationQuarterTurns);

  const cells: CellCoordinate[] = [];
  for (let localY = 0; localY < footprint.height; localY += 1) {
    for (let localX = 0; localX < footprint.width; localX += 1) {
      const rotated = rotateLocalCoordinate(
        { x: localX, y: localY },
        footprint,
        rotationQuarterTurns,
      );
      cells.push({
        x: origin.x + rotated.x,
        y: origin.y + rotated.y,
      });
    }
  }

  return cells.sort(compareCells);
}

function rotateLocalCoordinate(
  coordinate: GridCoordinate,
  footprint: RectangularFootprint,
  rotationQuarterTurns: QuarterTurn,
): GridCoordinate {
  switch (rotationQuarterTurns) {
    case 0:
      return { x: coordinate.x, y: coordinate.y };
    case 1:
      return { x: footprint.height - 1 - coordinate.y, y: coordinate.x };
    case 2:
      return {
        x: footprint.width - 1 - coordinate.x,
        y: footprint.height - 1 - coordinate.y,
      };
    case 3:
      return { x: coordinate.y, y: footprint.width - 1 - coordinate.x };
  }
}

function compareCells(first: CellCoordinate, second: CellCoordinate): number {
  return first.y - second.y || first.x - second.x;
}

function assertRectangularFootprint(footprint: RectangularFootprint): void {
  if (validateRectangularFootprint(footprint).length > 0) {
    throw new Error('Footprint width and height must be positive integers.');
  }
}

function assertQuarterTurn(rotationQuarterTurns: unknown): asserts rotationQuarterTurns is QuarterTurn {
  if (!isQuarterTurn(rotationQuarterTurns)) {
    throw new Error('Rotation must be a quarter-turn value from 0 through 3.');
  }
}

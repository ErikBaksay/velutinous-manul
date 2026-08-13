import {
  cellCoordinateToIndex,
  cellIndexToCoordinate,
  cellToWorldCenter,
  validateGridCoordinate,
  worldToCellCoordinate,
} from './grid-coordinates';

describe('construction grid coordinates', () => {
  const dimensions = { width: 4, height: 3 };

  it('converts bounded cells to indexes and back deterministically', () => {
    expect(cellCoordinateToIndex({ x: 2, y: 1 }, dimensions)).toBe(6);
    expect(cellIndexToCoordinate(6, dimensions)).toEqual({ x: 2, y: 1 });
    expect(cellCoordinateToIndex({ x: 4, y: 1 }, dimensions)).toBeNull();
    expect(cellIndexToCoordinate(12, dimensions)).toBeNull();
  });

  it('maps cell centers to the existing centered Three.js world plane', () => {
    expect(cellToWorldCenter({ x: 0, y: 0 }, dimensions)).toEqual({ x: -1.5, z: -1 });
    expect(cellToWorldCenter({ x: 3, y: 2 }, dimensions)).toEqual({ x: 1.5, z: 1 });
    expect(worldToCellCoordinate(-1.5, -1, dimensions)).toEqual({ x: 0, y: 0 });
    expect(worldToCellCoordinate(1.5, 1, dimensions)).toEqual({ x: 3, y: 2 });
    expect(worldToCellCoordinate(2, 0, dimensions)).toBeNull();
  });

  it('reports non-integer coordinate components instead of normalizing them', () => {
    expect(validateGridCoordinate({ x: 1.5, y: 2 })).toEqual(['non-integer-x']);
    expect(validateGridCoordinate({ x: 1, y: -2.25 })).toEqual(['non-integer-y']);
    expect(validateGridCoordinate({ x: 1 })).toEqual(['non-integer-y']);
    expect(validateGridCoordinate(null)).toEqual(['invalid-coordinate']);
  });
});

import {
  getFootprintCells,
  getRotatedFootprintSize,
  validateRectangularFootprint,
} from './footprint';

describe('construction footprints', () => {
  const footprint = { width: 2, height: 3 };
  const origin = { x: 10, y: 20 };

  it('returns canonical cells in row-major order', () => {
    expect(getFootprintCells(footprint, origin, 0)).toEqual([
      { x: 10, y: 20 },
      { x: 11, y: 20 },
      { x: 10, y: 21 },
      { x: 11, y: 21 },
      { x: 10, y: 22 },
      { x: 11, y: 22 },
    ]);
  });

  it('rotates a non-square footprint around its anchor and swaps its bounds', () => {
    expect(getRotatedFootprintSize(footprint, 1)).toEqual({ width: 3, height: 2 });
    expect(getFootprintCells(footprint, origin, 1)).toEqual([
      { x: 10, y: 20 },
      { x: 11, y: 20 },
      { x: 12, y: 20 },
      { x: 10, y: 21 },
      { x: 11, y: 21 },
      { x: 12, y: 21 },
    ]);
    expect(getFootprintCells(footprint, origin, 2)).toEqual([
      { x: 10, y: 20 },
      { x: 11, y: 20 },
      { x: 10, y: 21 },
      { x: 11, y: 21 },
      { x: 10, y: 22 },
      { x: 11, y: 22 },
    ]);
    expect(getFootprintCells(footprint, origin, 3)).toEqual([
      { x: 10, y: 20 },
      { x: 11, y: 20 },
      { x: 12, y: 20 },
      { x: 10, y: 21 },
      { x: 11, y: 21 },
      { x: 12, y: 21 },
    ]);
  });

  it('rejects invalid dimensions and rotations', () => {
    expect(validateRectangularFootprint({ width: 0, height: 2 })).toEqual(['invalid-width']);
    expect(validateRectangularFootprint({ width: 2.5, height: 2 })).toEqual(['invalid-width']);
    expect(() => getRotatedFootprintSize(footprint, 4 as never)).toThrow(
      'Rotation must be a quarter-turn value from 0 through 3.',
    );
  });
});

import {
  clientPointToNormalizedDeviceCoordinate,
  terrainHitPointToCellCoordinate,
} from './selection';

describe('construction selection utilities', () => {
  it('converts canvas client coordinates into normalized device coordinates', () => {
    expect(clientPointToNormalizedDeviceCoordinate(
      100,
      50,
      { left: 100, top: 50, width: 800, height: 400 },
    )).toEqual({ x: -1, y: 1 });

    expect(clientPointToNormalizedDeviceCoordinate(
      500,
      250,
      { left: 100, top: 50, width: 800, height: 400 },
    )).toEqual({ x: 0, y: 0 });
  });

  it('rejects invalid canvas bounds and non-finite pointer coordinates', () => {
    expect(clientPointToNormalizedDeviceCoordinate(
      100,
      50,
      { left: 0, top: 0, width: 0, height: 400 },
    )).toBeNull();
    expect(clientPointToNormalizedDeviceCoordinate(
      Number.NaN,
      50,
      { left: 0, top: 0, width: 800, height: 400 },
    )).toBeNull();
  });

  it('converts a terrain world hit into the corresponding map cell', () => {
    expect(terrainHitPointToCellCoordinate(
      { x: -1.25, z: 0.75 },
      { width: 4, height: 4 },
    )).toEqual({ x: 0, y: 2 });
  });

  it('returns null for off-map and non-finite terrain hits', () => {
    expect(terrainHitPointToCellCoordinate(
      { x: 2, z: 0 },
      { width: 4, height: 4 },
    )).toBeNull();
    expect(terrainHitPointToCellCoordinate(
      { x: Number.POSITIVE_INFINITY, z: 0 },
      { width: 4, height: 4 },
    )).toBeNull();
  });
});

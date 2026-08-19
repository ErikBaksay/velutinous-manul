import { createBuildingDefinitionRegistry } from './building-definitions';
import {
  getCurrentConstructionCellIndices,
  getPlacedBuildingCellIndices,
  mergeClearedCellIndices,
} from './cell-state';
import { createCellOccupancy } from './occupancy';

describe('construction cell state', () => {
  const dimensions = { width: 10, height: 10 };
  const definitions = createBuildingDefinitionRegistry([
    {
      id: 'test-building',
      footprint: { width: 2, height: 3 },
      placement: {
        requiresBuildable: false,
        allowWater: true,
        allowImpassable: true,
        maxSlope: 1,
      },
    },
  ]);

  it('derives every cell of a rotated building footprint', () => {
    const cells = getPlacedBuildingCellIndices([
      {
        id: 'building-1',
        definitionId: 'test-building',
        origin: { x: 2, y: 3 },
        rotationQuarterTurns: 1,
      },
    ], dimensions, definitions);

    expect(cells).toEqual([32, 33, 34, 42, 43, 44]);
  });

  it('merges and sorts permanent clearing without duplicates or out-of-bounds cells', () => {
    expect(mergeClearedCellIndices(
      dimensions,
      [42, 7, 42],
      [0, 99, 100, -1],
    )).toEqual([0, 7, 42, 99]);
  });

  it('tracks current building and road cells independently of permanent clearing', () => {
    const placedBuildings = [{
      id: 'building-1',
      definitionId: 'test-building',
      origin: { x: 2, y: 3 },
      rotationQuarterTurns: 0 as const,
    }];
    const occupancy = createCellOccupancy(dimensions, placedBuildings, definitions).occupancy;

    expect(getCurrentConstructionCellIndices(
      occupancy,
      [{ cell: { x: 0, y: 0 } }, { cell: { x: 3, y: 3 } }],
      dimensions,
    )).toEqual([0, 32, 33, 42, 43, 52, 53]);
  });
});

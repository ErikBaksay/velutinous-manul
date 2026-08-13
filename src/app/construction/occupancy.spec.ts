import type { PlacedBuildingState } from '../save/save-contract';
import { createBuildingDefinitionRegistry } from './building-definitions';
import {
  createCellOccupancy,
  getOccupyingBuildingId,
} from './occupancy';

describe('construction occupancy', () => {
  it('derives cell ownership and reports overlaps and unknown definitions', () => {
    const definitions = createBuildingDefinitionRegistry([
      createDefinition('wide', 2, 1),
      createDefinition('small', 1, 1),
    ]);
    const buildings: readonly PlacedBuildingState[] = [
      { id: 'wide-1', definitionId: 'wide', origin: { x: 0, y: 0 }, rotationQuarterTurns: 0 },
      { id: 'small-1', definitionId: 'small', origin: { x: 1, y: 0 }, rotationQuarterTurns: 0 },
      { id: 'future-1', definitionId: 'future-structure', origin: { x: 3, y: 2 }, rotationQuarterTurns: 0 },
    ];

    const result = createCellOccupancy({ width: 4, height: 3 }, buildings, definitions);

    expect(result.occupancy.ownerByCell[0]).toBe(0);
    expect(result.occupancy.ownerByCell[1]).toBe(0);
    expect(getOccupyingBuildingId(result.occupancy, 1)).toBe('wide-1');
    expect(getOccupyingBuildingId(result.occupancy, 2)).toBeUndefined();
    expect(result.issues).toEqual([
      {
        code: 'overlapping-buildings',
        buildingId: 'small-1',
        cell: { x: 1, y: 0 },
        conflictingBuildingId: 'wide-1',
      },
      { code: 'unknown-definition', buildingId: 'future-1' },
    ]);
  });
});

function createDefinition(id: string, width: number, height: number) {
  return {
    id,
    footprint: { width, height },
    placement: {
      requiresBuildable: true,
      allowWater: false,
      allowImpassable: false,
      maxSlope: 0.2,
    },
  };
}

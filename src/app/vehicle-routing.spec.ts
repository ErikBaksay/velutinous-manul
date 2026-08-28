import type { BuildingDefinition } from './construction/building-definitions';
import type { PlacedBuildingState, RoadState } from './save/save-contract';
import { findCourierVanRoute } from './vehicle-routing';

const DEFINITIONS = new Map<string, BuildingDefinition>([
  ['mine', definition('mine')],
  ['warehouse', definition('warehouse')],
]);

describe('courier van routing', () => {
  it('finds the shortest route between nearest building access roads', () => {
    const route = findCourierVanRoute(
      building('mine-1', 'mine', { x: 0, y: 0 }),
      building('warehouse-1', 'warehouse', { x: 3, y: 0 }),
      roads([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }]),
      DEFINITIONS,
    );

    expect(route).toEqual({
      sourceRoadCell: { x: 1, y: 0 },
      destinationRoadCell: { x: 2, y: 0 },
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    });
  });

  it('breaks equal-length route ties by stable coordinates', () => {
    const source = building('mine-1', 'mine', { x: 0, y: 0 });
    const destination = building('warehouse-1', 'warehouse', { x: 2, y: 2 });
    const network = roads([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
    ]);

    const first = findCourierVanRoute(source, destination, network, DEFINITIONS);
    const second = findCourierVanRoute(source, destination, [...network].reverse(), DEFINITIONS);

    expect(first?.cells).toEqual([{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
    expect(second).toEqual(first);
  });

  it('reports missing access and disconnected roads as unavailable', () => {
    const source = building('mine-1', 'mine', { x: 0, y: 0 });
    const destination = building('warehouse-1', 'warehouse', { x: 3, y: 0 });

    expect(findCourierVanRoute(source, destination, [], DEFINITIONS)).toBeNull();
    expect(findCourierVanRoute(
      source,
      destination,
      roads([{ x: 1, y: 0 }, { x: 10, y: 10 }, { x: 3, y: 1 }]),
      DEFINITIONS,
    )).toBeNull();
  });

  it('keeps a dispatched route valid as a snapshot after road edits', () => {
    const source = building('mine-1', 'mine', { x: 0, y: 0 });
    const destination = building('warehouse-1', 'warehouse', { x: 3, y: 0 });
    const originalRoads = roads([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    const route = findCourierVanRoute(source, destination, originalRoads, DEFINITIONS);

    expect(route).not.toBeNull();
    const routeSnapshot = route!.cells.map((cell) => ({ ...cell }));
    const editedRoads = originalRoads.filter((road) => road.cell.x !== 2);

    expect(findCourierVanRoute(source, destination, editedRoads, DEFINITIONS)).toBeNull();
    expect(routeSnapshot).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });
});

function definition(id: string): BuildingDefinition {
  return {
    id,
    footprint: { width: 1, height: 1 },
    placement: {
      requiresBuildable: false,
      allowWater: false,
      allowImpassable: false,
      maxSlope: 1,
    },
  };
}

function building(id: string, definitionId: string, origin: { x: number; y: number }): PlacedBuildingState {
  return { id, definitionId, origin, rotationQuarterTurns: 0 };
}

function roads(cells: readonly { x: number; y: number }[]): RoadState[] {
  return cells.map((cell) => ({ cell: { ...cell } }));
}

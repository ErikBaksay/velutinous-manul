import type { BuildingDefinition } from './construction/building-definitions';
import type { PlacedBuildingState, RoadState } from './save/save-contract';
import {
  createEmptyMineralProductionState,
  MAX_MINERAL_OUTPUT_BUFFER,
  type CourierVanState,
  type MineralProductionState,
} from './save/save-contract';
import {
  advanceCourierVans,
  cancelCourierVansForBuilding,
  COURIER_VAN_LOADING_SECONDS,
  dispatchCourierVans,
  getCourierVanTransportSummary,
  MAX_COURIER_VANS_PER_MINE_PER_DISPATCH,
} from './vehicle-transport';

const DEFINITIONS = new Map<string, BuildingDefinition>([
  ['mine', definition('mine')],
  ['warehouse', definition('warehouse')],
]);
const BUILDINGS = [
  building('mine-1', 'mine', { x: 0, y: 0 }),
  building('warehouse-1', 'warehouse', { x: 3, y: 0 }),
];
const ROADS = [{ cell: { x: 1, y: 0 } }, { cell: { x: 2, y: 0 } }];

describe('courier van transport', () => {
  it('dispatches one capacity-limited van per available order', () => {
    const result = dispatchCourierVans(
      productionWithBuffer(25),
      [],
      BUILDINGS,
      ROADS,
      DEFINITIONS,
    );

    expect(result.dispatchedVans).toBe(3);
    expect(result.dispatchedUnits).toBe(25);
    expect(result.production.mines[0]?.outputBuffer).toBe(0);
    expect(result.vehicles.map((vehicle) => vehicle.amount)).toEqual([10, 10, 5]);
    expect(result.production.transfers.map((transfer) => transfer.status)).toEqual([
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('keeps every pending transfer when more than 64 vans are dispatched', () => {
    const result = dispatchCourierVans(
      productionWithBuffer(650),
      [],
      BUILDINGS,
      ROADS,
      DEFINITIONS,
    );

    expect(result.dispatchedVans).toBe(65);
    expect(result.production.transfers).toHaveLength(65);
    expect(new Set(result.production.transfers.map((transfer) => transfer.id)).size).toBe(65);
    expect(new Set(result.vehicles.map((vehicle) => vehicle.transferId))).toEqual(
      new Set(result.production.transfers.map((transfer) => transfer.id)),
    );
  });

  it('does not dispatch an unbounded or non-progressing output buffer', () => {
    const result = dispatchCourierVans(
      productionWithBuffer(Number.MAX_VALUE),
      [],
      BUILDINGS,
      ROADS,
      DEFINITIONS,
    );

    expect(result.dispatchedVans).toBe(0);
    expect(result.blockedDeliveries).toBe(1);
    expect(result.production.mines[0]?.outputBuffer).toBe(Number.MAX_VALUE);
  });

  it('keeps the remaining buffer when one dispatch reaches its van budget', () => {
    const result = dispatchCourierVans(
      productionWithBuffer(MAX_MINERAL_OUTPUT_BUFFER),
      [],
      BUILDINGS,
      ROADS,
      DEFINITIONS,
    );

    expect(result.dispatchedVans).toBe(MAX_COURIER_VANS_PER_MINE_PER_DISPATCH);
    expect(result.production.mines[0]?.outputBuffer).toBe(
      MAX_MINERAL_OUTPUT_BUFFER - MAX_COURIER_VANS_PER_MINE_PER_DISPATCH * 10,
    );
  });

  it('progresses through loading, en-route travel, unloading, and arrival accounting', () => {
    const dispatched = dispatchCourierVans(
      productionWithBuffer(10),
      [],
      BUILDINGS,
      ROADS,
      DEFINITIONS,
    );
    let production = dispatched.production;
    let vehicles = dispatched.vehicles;

    let advanced = advanceCourierVans(production, vehicles, 0.25);
    vehicles = advanced.vehicles;
    expect(vehicles[0]?.phase).toBe('loading');
    expect(vehicles[0]?.phaseRemainingSeconds).toBeCloseTo(COURIER_VAN_LOADING_SECONDS - 0.25);

    advanced = advanceCourierVans(production, vehicles, 0.1);
    production = advanced.production;
    vehicles = advanced.vehicles;
    expect(vehicles[0]?.phase).toBe('enroute');
    expect(vehicles[0]?.routeIndex).toBe(0);
    expect(vehicles[0]?.progress).toBe(0);

    advanced = advanceCourierVans(production, vehicles, 0.25);
    production = advanced.production;
    vehicles = advanced.vehicles;
    expect(vehicles[0]?.phase).toBe('enroute');
    expect(vehicles[0]?.progress).toBeCloseTo(0.75);

    advanced = advanceCourierVans(production, vehicles, 0.25);
    production = advanced.production;
    vehicles = advanced.vehicles;
    expect(vehicles[0]?.phase).toBe('unloading');
    expect(vehicles[0]?.routeIndex).toBe(1);

    advanced = advanceCourierVans(production, vehicles, 0.25);
    production = advanced.production;
    vehicles = advanced.vehicles;
    expect(advanced.deliveredUnits).toBe(10);
    expect(vehicles).toEqual([]);
    expect(production.warehouses[0]?.quantities['iron-ore']).toBe(10);
    expect(production.mines[0]?.deliveredTotal).toBe(10);
    expect(production.completedDeliveryCount).toBe(1);
    expect(production.transfers[0]?.status).toBe('delivered');
  });

  it('advances all vans by the same authoritative delta', () => {
    const dispatched = dispatchCourierVans(
      productionWithBuffer(20),
      [],
      BUILDINGS,
      ROADS,
      DEFINITIONS,
    );
    const loading = advanceCourierVans(dispatched.production, dispatched.vehicles, 0.25);
    const loadingComplete = advanceCourierVans(loading.production, loading.vehicles, 0.1);
    const advanced = advanceCourierVans(loadingComplete.production, loadingComplete.vehicles, 0.25);

    expect(advanced.vehicles).toHaveLength(2);
    expect(advanced.vehicles.map((vehicle) => vehicle.progress)).toEqual([0.75, 0.75]);
  });

  it('reports blocked output until both buildings have connected road access', () => {
    const production = productionWithBuffer(10);
    const blocked = getCourierVanTransportSummary(
      production,
      [],
      BUILDINGS,
      [{ cell: { x: 1, y: 0 } }],
      DEFINITIONS,
    );

    expect(blocked.blockedDeliveries).toBe(1);
    expect(dispatchCourierVans(production, [], BUILDINGS, [], DEFINITIONS).blockedDeliveries).toBe(1);
  });

  it('cancels affected trips and returns cargo to an existing source buffer', () => {
    const dispatched = dispatchCourierVans(
      productionWithBuffer(10),
      [],
      BUILDINGS,
      ROADS,
      DEFINITIONS,
    );
    const cancelled = cancelCourierVansForBuilding(
      dispatched.production,
      dispatched.vehicles,
      'warehouse-1',
    );

    expect(cancelled.vehicles).toEqual([]);
    expect(cancelled.production.mines[0]?.outputBuffer).toBe(10);
    expect(cancelled.production.transfers[0]?.status).toBe('cancelled');
  });

  it('continues on the saved route after its roads are edited', () => {
    const dispatched = dispatchCourierVans(
      productionWithBuffer(10),
      [],
      BUILDINGS,
      ROADS,
      DEFINITIONS,
    );
    const editedRoads = ROADS.filter((road) => road.cell.x !== 2);
    let production = dispatched.production;
    let vehicles: readonly CourierVanState[] = dispatched.vehicles;
    let advanced = advanceCourierVans(production, vehicles, 0.25);
    production = advanced.production;
    vehicles = advanced.vehicles;
    for (const elapsed of [0.1, 0.25, 0.25, 0.25]) {
      advanced = advanceCourierVans(production, vehicles, elapsed);
      production = advanced.production;
      vehicles = advanced.vehicles;
    }

    expect(editedRoads).toEqual([{ cell: { x: 1, y: 0 } }]);
    expect(advanced.deliveredUnits).toBe(10);
    expect(vehicles).toEqual([]);
  });
});

function productionWithBuffer(amount: number): MineralProductionState {
  const empty = createEmptyMineralProductionState();
  return {
    ...empty,
    tick: 4,
    mines: [{
      mineBuildingId: 'mine-1',
      depositId: 1,
      resourceKind: 'iron-ore',
      outputBuffer: amount,
      assignedWarehouseId: 'warehouse-1',
      producedTotal: amount,
      deliveredTotal: 0,
    }],
    warehouses: [{
      warehouseBuildingId: 'warehouse-1',
      quantities: { 'iron-ore': 0, 'copper-ore': 0, stone: 0 },
    }],
  };
}

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

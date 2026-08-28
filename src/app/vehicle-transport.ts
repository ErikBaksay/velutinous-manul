import type { BuildingDefinition } from './construction/building-definitions';
import {
  type CourierVanState,
  type MineralProductionState,
  type MineProductionState,
  type PlacedBuildingState,
  type RoadState,
  type TransferOrder,
  COURIER_VAN_CAPACITY,
  MAX_MINERAL_OUTPUT_BUFFER,
  trimTransferHistory,
} from './save/save-contract';
import { findCourierVanRoute } from './vehicle-routing';

export { COURIER_VAN_CAPACITY } from './save/save-contract';

export const COURIER_VAN_SPEED_CELLS_PER_SECOND = 3;
export const COURIER_VAN_LOADING_SECONDS = 0.35;
export const COURIER_VAN_UNLOADING_SECONDS = 0.35;
export const VEHICLE_SIMULATION_STEP_SECONDS = 0.1;
export const VEHICLE_SIMULATION_MAX_DELTA_SECONDS = 0.25;
export const MAX_COURIER_VANS_PER_MINE_PER_DISPATCH = 256;

export interface CourierVanDispatchResult {
  readonly production: MineralProductionState;
  readonly vehicles: readonly CourierVanState[];
  readonly dispatchedUnits: number;
  readonly dispatchedVans: number;
  readonly blockedDeliveries: number;
}

export interface CourierVanAdvanceResult {
  readonly production: MineralProductionState;
  readonly vehicles: readonly CourierVanState[];
  readonly deliveredUnits: number;
  readonly arrivedVans: number;
}

export interface CourierVanTransportSummary {
  readonly activeVans: number;
  readonly pendingDeliveries: number;
  readonly blockedDeliveries: number;
  readonly completedDeliveries: number;
}

export function dispatchCourierVans(
  production: MineralProductionState,
  vehicles: readonly CourierVanState[],
  buildings: readonly PlacedBuildingState[],
  roads: readonly RoadState[],
  definitions: ReadonlyMap<string, BuildingDefinition>,
): CourierVanDispatchResult {
  const buildingById = new Map(buildings.map((building) => [building.id, building]));
  const nextMines: MineProductionState[] = production.mines.map((mine) => ({ ...mine }));
  const nextTransfers = [...production.transfers];
  const nextVehicles: CourierVanState[] = [...vehicles];
  const usedTransferIds = new Set(nextTransfers.map((transfer) => transfer.id));
  const usedVehicleIds = new Set(nextVehicles.map((vehicle) => vehicle.id));
  let dispatchedUnits = 0;
  let dispatchedVans = 0;
  let blockedDeliveries = 0;

  for (const mine of [...nextMines].sort((left, right) => left.mineBuildingId.localeCompare(right.mineBuildingId))) {
    if (mine.outputBuffer <= 0 || !mine.assignedWarehouseId) {
      continue;
    }
    const source = buildingById.get(mine.mineBuildingId);
    const destination = buildingById.get(mine.assignedWarehouseId);
    if (!source || !destination) {
      blockedDeliveries += 1;
      continue;
    }
    const route = findCourierVanRoute(source, destination, roads, definitions);
    if (!route) {
      blockedDeliveries += 1;
      continue;
    }

    const mineIndex = nextMines.findIndex((candidate) => candidate.mineBuildingId === mine.mineBuildingId);
    if (mineIndex < 0) {
      continue;
    }
    let remaining = nextMines[mineIndex]!.outputBuffer;
    if (!Number.isFinite(remaining) || remaining > MAX_MINERAL_OUTPUT_BUFFER) {
      blockedDeliveries += 1;
      continue;
    }
    let orderOrdinal = 1;
    let dispatchedVansForMine = 0;
    while (remaining > 0 && dispatchedVansForMine < MAX_COURIER_VANS_PER_MINE_PER_DISPATCH) {
      const amount = Math.min(COURIER_VAN_CAPACITY, remaining);
      const transferId = createUniqueId(
        `transfer-${production.tick}-${mine.mineBuildingId}-${orderOrdinal}`,
        usedTransferIds,
      );
      const vehicleId = createUniqueId(`courier-van-${transferId}`, usedVehicleIds);
      const transfer: TransferOrder = {
        id: transferId,
        sourceMineId: mine.mineBuildingId,
        destinationWarehouseId: destination.id,
        resourceKind: mine.resourceKind,
        amount,
        status: 'pending',
      };
      nextTransfers.push(transfer);
      nextVehicles.push({
        id: vehicleId,
        transferId,
        sourceMineId: mine.mineBuildingId,
        destinationWarehouseId: destination.id,
        resourceKind: mine.resourceKind,
        amount,
        route: route.cells.map((cell) => ({ ...cell })),
        routeIndex: 0,
        progress: 0,
        phase: 'loading',
        phaseRemainingSeconds: COURIER_VAN_LOADING_SECONDS,
      });
      remaining -= amount;
      dispatchedUnits += amount;
      dispatchedVans += 1;
      dispatchedVansForMine += 1;
      orderOrdinal += 1;
    }
    nextMines[mineIndex] = { ...nextMines[mineIndex]!, outputBuffer: remaining };
  }

  return {
    production: {
      ...production,
      mines: nextMines,
      transfers: trimTransferHistory(nextTransfers),
    },
    vehicles: nextVehicles,
    dispatchedUnits,
    dispatchedVans,
    blockedDeliveries,
  };
}

export function advanceCourierVans(
  production: MineralProductionState,
  vehicles: readonly CourierVanState[],
  elapsedSeconds: number,
): CourierVanAdvanceResult {
  const simulationDelta = Math.min(
    VEHICLE_SIMULATION_MAX_DELTA_SECONDS,
    Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0),
  );
  let nextProduction = cloneProduction(production);
  const nextVehicles: CourierVanState[] = [];
  let deliveredUnits = 0;
  let arrivedVans = 0;

  for (const originalVehicle of vehicles) {
    let remainingTime = simulationDelta;
    let vehicle: CourierVanState = {
      ...originalVehicle,
      route: originalVehicle.route.map((cell) => ({ ...cell })),
    };
    let vehicleFinished = false;
    while (remainingTime > Number.EPSILON && !vehicleFinished) {
      if (vehicle.phase === 'enroute') {
        const routeSegments = Math.max(0, vehicle.route.length - 1);
        if (routeSegments === 0 || vehicle.routeIndex >= routeSegments) {
          vehicle = toUnloading(vehicle);
          continue;
        }
        const distanceRemaining = routeSegments - vehicle.routeIndex - vehicle.progress;
        const timeToNextCell = distanceRemaining / COURIER_VAN_SPEED_CELLS_PER_SECOND;
        const elapsed = Math.min(remainingTime, timeToNextCell);
        const moved = elapsed * COURIER_VAN_SPEED_CELLS_PER_SECOND;
        const totalProgress = vehicle.progress + moved;
        const wholeCells = Math.min(
          routeSegments - vehicle.routeIndex,
          Math.floor(totalProgress + Number.EPSILON),
        );
        vehicle = {
          ...vehicle,
          routeIndex: vehicle.routeIndex + wholeCells,
          progress: wholeCells >= 1 ? totalProgress - wholeCells : totalProgress,
        };
        remainingTime -= elapsed;
        if (vehicle.routeIndex >= routeSegments && vehicle.progress <= Number.EPSILON) {
          vehicle = toUnloading(vehicle);
        }
        continue;
      }

      const phaseElapsed = Math.min(remainingTime, vehicle.phaseRemainingSeconds);
      const phaseRemaining = vehicle.phaseRemainingSeconds - phaseElapsed;
      remainingTime -= phaseElapsed;
      if (phaseRemaining > Number.EPSILON) {
        vehicle = { ...vehicle, phaseRemainingSeconds: phaseRemaining };
        continue;
      }
      if (vehicle.phase === 'loading') {
        vehicle = vehicle.route.length <= 1
          ? toUnloading(vehicle)
          : { ...vehicle, phase: 'enroute', phaseRemainingSeconds: 0 };
        continue;
      }
      if (vehicle.phase === 'unloading') {
        const result = completeVehicleDelivery(nextProduction, vehicle);
        nextProduction = result.production;
        deliveredUnits += result.deliveredUnits;
        arrivedVans += 1;
        vehicleFinished = true;
      }
    }
    if (!vehicleFinished) {
      nextVehicles.push(vehicle);
    }
  }

  return {
    production: nextProduction,
    vehicles: nextVehicles,
    deliveredUnits,
    arrivedVans,
  };
}

export function cancelCourierVansForBuilding(
  production: MineralProductionState,
  vehicles: readonly CourierVanState[],
  buildingId: string,
): { readonly production: MineralProductionState; readonly vehicles: readonly CourierVanState[] } {
  const cancelledTransferIds = new Set(
    vehicles
      .filter((vehicle) => vehicle.sourceMineId === buildingId || vehicle.destinationWarehouseId === buildingId)
      .map((vehicle) => vehicle.transferId),
  );
  const affectedTransfers = production.transfers.filter((transfer) =>
    (transfer.sourceMineId === buildingId || transfer.destinationWarehouseId === buildingId) &&
    transfer.status === 'pending',
  );
  affectedTransfers.forEach((transfer) => cancelledTransferIds.add(transfer.id));

  let nextProduction = cloneProduction(production);
  const sourceMineIds = new Set(
    production.mines.map((mine) => mine.mineBuildingId),
  );
  for (const vehicle of vehicles) {
    if (!cancelledTransferIds.has(vehicle.transferId) || !sourceMineIds.has(vehicle.sourceMineId)) {
      continue;
    }
    const mineIndex = nextProduction.mines.findIndex((mine) => mine.mineBuildingId === vehicle.sourceMineId);
    if (mineIndex >= 0) {
      const mine = nextProduction.mines[mineIndex]!;
      const nextMines = nextProduction.mines.map((mine, index) => index === mineIndex
        ? {
          ...mine,
          outputBuffer: mine.outputBuffer + vehicle.amount,
        }
        : mine);
      nextProduction = {
        ...nextProduction,
        mines: nextMines,
      };
    }
  }

  const transfers = trimTransferHistory(nextProduction.transfers.map((transfer) =>
    cancelledTransferIds.has(transfer.id) && transfer.status === 'pending'
      ? { ...transfer, status: 'cancelled' }
      : transfer,
  ));

  return {
    production: { ...nextProduction, transfers },
    vehicles: vehicles.filter((vehicle) => !cancelledTransferIds.has(vehicle.transferId)),
  };
}

export function getCourierVanTransportSummary(
  production: MineralProductionState,
  vehicles: readonly CourierVanState[],
  buildings: readonly PlacedBuildingState[],
  roads: readonly RoadState[],
  definitions: ReadonlyMap<string, BuildingDefinition>,
): CourierVanTransportSummary {
  const buildingById = new Map(buildings.map((building) => [building.id, building]));
  let blockedDeliveries = 0;
  for (const mine of production.mines) {
    if (mine.outputBuffer <= 0 || !mine.assignedWarehouseId) {
      continue;
    }
    const source = buildingById.get(mine.mineBuildingId);
    const destination = buildingById.get(mine.assignedWarehouseId);
    if (!source || !destination || !findCourierVanRoute(source, destination, roads, definitions)) {
      blockedDeliveries += 1;
    }
  }
  return {
    activeVans: vehicles.length,
    pendingDeliveries: production.transfers.filter((transfer) => transfer.status === 'pending').length,
    blockedDeliveries,
    completedDeliveries: production.completedDeliveryCount,
  };
}

function completeVehicleDelivery(
  production: MineralProductionState,
  vehicle: CourierVanState,
): { readonly production: MineralProductionState; readonly deliveredUnits: number } {
  const transfer = production.transfers.find((candidate) => candidate.id === vehicle.transferId);
  if (!transfer || transfer.status !== 'pending') {
    return { production, deliveredUnits: 0 };
  }
  const warehouseIndex = production.warehouses.findIndex((warehouse) =>
    warehouse.warehouseBuildingId === vehicle.destinationWarehouseId,
  );
  const mineIndex = production.mines.findIndex((mine) => mine.mineBuildingId === vehicle.sourceMineId);
  if (warehouseIndex < 0) {
    return {
      production: {
        ...production,
        transfers: trimTransferHistory(production.transfers.map((candidate) =>
          candidate.id === vehicle.transferId ? { ...candidate, status: 'cancelled' } : candidate,
        )),
      },
      deliveredUnits: 0,
    };
  }

  const warehouse = production.warehouses[warehouseIndex]!;
  const warehouses = production.warehouses.map((candidate, index) => index === warehouseIndex
    ? {
      ...candidate,
      quantities: {
        ...candidate.quantities,
        [vehicle.resourceKind]: candidate.quantities[vehicle.resourceKind] + vehicle.amount,
      },
    }
    : candidate);
  const mines = production.mines.map((candidate, index) => index === mineIndex
    ? { ...candidate, deliveredTotal: candidate.deliveredTotal + vehicle.amount }
    : candidate);
  return {
    production: {
      ...production,
      mines,
      warehouses,
      transfers: trimTransferHistory(production.transfers.map((candidate) =>
        candidate.id === vehicle.transferId ? { ...candidate, status: 'delivered' } : candidate,
      )),
      completedDeliveryCount: production.completedDeliveryCount + 1,
    },
    deliveredUnits: vehicle.amount,
  };
}

function toUnloading(vehicle: CourierVanState): CourierVanState {
  return {
    ...vehicle,
    phase: 'unloading',
    routeIndex: Math.max(0, vehicle.route.length - 1),
    progress: 0,
    phaseRemainingSeconds: COURIER_VAN_UNLOADING_SECONDS,
  };
}

function cloneProduction(production: MineralProductionState): MineralProductionState {
  return {
    tick: production.tick,
    deposits: production.deposits.map((deposit) => ({ ...deposit })),
    mines: production.mines.map((mine) => ({ ...mine })),
    warehouses: production.warehouses.map((warehouse) => ({
      warehouseBuildingId: warehouse.warehouseBuildingId,
      quantities: { ...warehouse.quantities },
    })),
    transfers: production.transfers.map((transfer) => ({ ...transfer })),
    completedDeliveryCount: production.completedDeliveryCount,
  };
}

function createUniqueId(base: string, used: Set<string>): string {
  let id = base;
  let ordinal = 2;
  while (used.has(id)) {
    id = `${base}-${ordinal}`;
    ordinal += 1;
  }
  used.add(id);
  return id;
}

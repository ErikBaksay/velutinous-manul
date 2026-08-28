import {
  MineralResourceKind,
  MINERAL_RESOURCE_KINDS,
  RESOURCE_MASK_CODES,
  AuthoritativeMapData,
  DepositSource,
  WATER_KIND_CODES,
} from './map/map-types';
import {
  BuildingDefinition,
  getRotatedFootprintSize,
  VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID,
  VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID,
} from './construction';
import { cellToWorldCenter, CellCoordinate, GridDimensions, worldToCellCoordinate } from './construction/grid-coordinates';
import { QuarterTurn } from './save/save-contract';
import {
  DepositProductionState,
  MineProductionState,
  MineralProductionState,
  PlacedBuildingState,
  WarehouseInventoryState,
  createEmptyMineralInventory,
  trimTransferHistory,
} from './save/save-contract';

export const MINE_RESOURCE_ANCHOR = Object.freeze({
  localX: 5.25,
  localZ: 0,
  extractionRadiusCells: 1,
});

export const MINERAL_PRODUCTION_RATE = 10;
export interface MineBindingResult {
  readonly anchorCell: CellCoordinate;
  readonly deposit: DepositSource;
}

export interface MineBindingInput {
  readonly mapData: AuthoritativeMapData;
  readonly dimensions: GridDimensions;
  readonly building: PlacedBuildingState;
  readonly definition: BuildingDefinition;
}

export interface ProductionTickResult {
  readonly production: MineralProductionState;
  readonly delivered: number;
  readonly buffered: number;
}

export function findMineDepositBinding(input: MineBindingInput): MineBindingResult | null {
  const anchorCell = getMineAnchorCell(
    input.building.origin,
    input.building.rotationQuarterTurns,
    input.definition,
    input.dimensions,
  );
  if (!anchorCell) {
    return null;
  }

  const candidates = input.mapData.deposits
    .filter((deposit) => isMineralResourceKind(deposit.kind))
    .filter((deposit) => isDepositWithinExtractionRadius(
      input.mapData,
      input.dimensions,
      deposit,
      anchorCell,
    ))
    .sort((left, right) => {
      const distanceDifference = distanceToDeposit(left, anchorCell, input.dimensions) -
        distanceToDeposit(right, anchorCell, input.dimensions);
      return distanceDifference || left.id - right.id;
    });

  const deposit = candidates[0];
  return deposit ? { anchorCell, deposit } : null;
}

export function addMineProductionState(
  production: MineralProductionState,
  building: PlacedBuildingState,
  binding: MineBindingResult,
): MineralProductionState {
  const existingMine = production.mines.find((mine) => mine.mineBuildingId === building.id);
  if (existingMine) {
    return production;
  }

  const existingDeposit = production.deposits.find((deposit) => deposit.depositId === binding.deposit.id);
  const depositState: DepositProductionState = existingDeposit ?? {
    depositId: binding.deposit.id,
    resourceKind: binding.deposit.kind,
    remainingCapacity: binding.deposit.baseCapacity,
  };

  return {
    ...production,
    deposits: existingDeposit ? production.deposits : [...production.deposits, depositState],
    mines: [
      ...production.mines,
      {
        mineBuildingId: building.id,
        depositId: binding.deposit.id,
        resourceKind: binding.deposit.kind,
        outputBuffer: 0,
        assignedWarehouseId: null,
        producedTotal: 0,
        deliveredTotal: 0,
      },
    ],
  };
}

export function addWarehouseProductionState(
  production: MineralProductionState,
  buildingId: string,
): MineralProductionState {
  if (production.warehouses.some((warehouse) => warehouse.warehouseBuildingId === buildingId)) {
    return production;
  }
  return {
    ...production,
    warehouses: [
      ...production.warehouses,
      { warehouseBuildingId: buildingId, quantities: createEmptyMineralInventory() },
    ],
  };
}

export function reconcileMineralProductionState(
  production: MineralProductionState,
  placedBuildings: readonly PlacedBuildingState[],
): MineralProductionState {
  const warehouseIds = new Set(
    placedBuildings
      .filter((building) => building.definitionId === VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID)
      .map((building) => building.id),
  );
  const warehouses = production.warehouses.filter((warehouse) =>
    warehouseIds.has(warehouse.warehouseBuildingId),
  );
  const existingWarehouseIds = new Set(warehouses.map((warehouse) => warehouse.warehouseBuildingId));
  for (const warehouseId of warehouseIds) {
    if (!existingWarehouseIds.has(warehouseId)) {
      warehouses.push({ warehouseBuildingId: warehouseId, quantities: createEmptyMineralInventory() });
    }
  }
  const mineIds = new Set(
    placedBuildings
      .filter((building) => building.definitionId === VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID)
      .map((building) => building.id),
  );
  return {
    ...production,
    mines: production.mines.filter((mine) => mineIds.has(mine.mineBuildingId)),
    warehouses,
  };
}

export function assignMineWarehouse(
  production: MineralProductionState,
  mineBuildingId: string,
  warehouseBuildingId: string | null,
): MineralProductionState {
  if (warehouseBuildingId !== null &&
      !production.warehouses.some((warehouse) => warehouse.warehouseBuildingId === warehouseBuildingId)) {
    return production;
  }
  return {
    ...production,
    mines: production.mines.map((mine) => mine.mineBuildingId === mineBuildingId
      ? { ...mine, assignedWarehouseId: warehouseBuildingId }
      : mine),
  };
}

export function removeBuildingProductionState(
  production: MineralProductionState,
  buildingId: string,
  definitionId: string,
): MineralProductionState {
  if (definitionId === VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID) {
    return {
      ...production,
      mines: production.mines.filter((mine) => mine.mineBuildingId !== buildingId),
      transfers: production.transfers.map((transfer) =>
        transfer.sourceMineId === buildingId && transfer.status === 'pending'
          ? { ...transfer, status: 'cancelled' }
          : transfer,
      ),
    };
  }

  if (definitionId === VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID) {
    return {
      ...production,
      warehouses: production.warehouses.filter((warehouse) => warehouse.warehouseBuildingId !== buildingId),
      mines: production.mines.map((mine) => mine.assignedWarehouseId === buildingId
        ? { ...mine, assignedWarehouseId: null }
        : mine),
      transfers: production.transfers.map((transfer) =>
        transfer.destinationWarehouseId === buildingId && transfer.status === 'pending'
          ? { ...transfer, status: 'cancelled' }
          : transfer,
      ),
    };
  }

  return production;
}

export function runMineralProductionTick(
  production: MineralProductionState,
  placedBuildings: readonly PlacedBuildingState[],
): ProductionTickResult {
  const existingBuildingIds = new Set(placedBuildings.map((building) => building.id));
  const mines = [...production.mines]
    .filter((mine) => existingBuildingIds.has(mine.mineBuildingId))
    .sort((left, right) => left.mineBuildingId.localeCompare(right.mineBuildingId));
  const warehouses = production.warehouses.filter((warehouse) =>
    existingBuildingIds.has(warehouse.warehouseBuildingId));
  const deposits = production.deposits.map((deposit) => ({ ...deposit }));
  const depositById = new Map(deposits.map((deposit) => [deposit.depositId, deposit]));
  let buffered = 0;
  const nextMines: MineProductionState[] = [];

  for (const mine of mines) {
    const deposit = depositById.get(mine.depositId);
    if (!deposit || deposit.resourceKind !== mine.resourceKind) {
      nextMines.push(mine);
      buffered += mine.outputBuffer;
      continue;
    }

    // Deposits are an unlimited gameplay source. `remainingCapacity` is kept
    // in the saved/map contract for compatibility with older worlds and map
    // metadata, but it is not a production limiter.
    const extracted = MINERAL_PRODUCTION_RATE;
    const outputBuffer = mine.outputBuffer + extracted;
    buffered += outputBuffer;
    nextMines.push({
      ...mine,
      outputBuffer,
      producedTotal: mine.producedTotal + extracted,
    });
  }

  return {
    production: {
      tick: production.tick + 1,
      deposits,
      mines: nextMines,
      warehouses,
      transfers: trimTransferHistory(production.transfers),
      completedDeliveryCount: production.completedDeliveryCount,
    },
    delivered: 0,
    buffered,
  };
}

function getMineAnchorCell(
  origin: CellCoordinate,
  rotation: QuarterTurn,
  definition: BuildingDefinition,
  dimensions: GridDimensions,
): CellCoordinate | null {
  const size = getRotatedFootprintSize(definition.footprint, rotation);
  const center = cellToWorldCenter({
    x: origin.x + size.width / 2 - 0.5,
    y: origin.y + size.height / 2 - 0.5,
  }, dimensions);
  const angle = -rotation * Math.PI / 2;
  const localX = MINE_RESOURCE_ANCHOR.localX;
  const localZ = MINE_RESOURCE_ANCHOR.localZ;
  const worldX = center.x + localX * Math.cos(angle) - localZ * Math.sin(angle);
  const worldZ = center.z + localX * Math.sin(angle) + localZ * Math.cos(angle);
  return worldToCellCoordinate(worldX, worldZ, dimensions);
}

function isDepositWithinExtractionRadius(
  mapData: AuthoritativeMapData,
  dimensions: GridDimensions,
  deposit: DepositSource,
  anchorCell: CellCoordinate,
): boolean {
  const centerX = deposit.centerCell % dimensions.width;
  const centerY = Math.floor(deposit.centerCell / dimensions.width);
  const radius = deposit.radius;
  const extractionRadius = MINE_RESOURCE_ANCHOR.extractionRadiusCells;
  for (let offsetY = -extractionRadius; offsetY <= extractionRadius; offsetY += 1) {
    for (let offsetX = -extractionRadius; offsetX <= extractionRadius; offsetX += 1) {
      const cellX = anchorCell.x + offsetX;
      const cellY = anchorCell.y + offsetY;
      if (cellX < 0 || cellY < 0 || cellX >= dimensions.width || cellY >= dimensions.height) {
        continue;
      }
      const deltaX = cellX - centerX;
      const deltaY = cellY - centerY;
      if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > radius) {
        continue;
      }
      const cellIndex = cellY * dimensions.width + cellX;
      if (mapData.waterKind[cellIndex] === WATER_KIND_CODES.none &&
          (mapData.resourceMask[cellIndex] & RESOURCE_MASK_CODES[deposit.kind]) !== 0) {
        return true;
      }
    }
  }
  return false;
}

function distanceToDeposit(
  deposit: DepositSource,
  anchorCell: CellCoordinate,
  dimensions: GridDimensions,
): number {
  const centerX = deposit.centerCell % dimensions.width;
  const centerY = Math.floor(deposit.centerCell / dimensions.width);
  return Math.hypot(centerX - anchorCell.x, centerY - anchorCell.y);
}

function isMineralResourceKind(value: DepositSource['kind']): value is MineralResourceKind {
  return (MINERAL_RESOURCE_KINDS as readonly string[]).includes(value);
}

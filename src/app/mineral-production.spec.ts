import {
  AuthoritativeMapData,
  MAP_FLAG_CODES,
  MineralResourceKind,
  MINERAL_RESOURCE_KINDS,
  RESOURCE_KINDS,
  WATER_KIND_CODES,
} from './map/map-types';
import {
  VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
  VELUTINOUS_MANUL_WAREHOUSE_DEFINITION,
} from './construction';
import {
  addMineProductionState,
  addWarehouseProductionState,
  assignMineWarehouse,
  findMineDepositBinding,
  removeBuildingProductionState,
  runMineralProductionTick,
} from './mineral-production';
import {
  createEmptyMineralProductionState,
  PlacedBuildingState,
} from './save/save-contract';

const DIMENSIONS = { width: 32, height: 32 } as const;

describe('generic mineral production', () => {
  it.each(MINERAL_RESOURCE_KINDS)('binds a mine to %s', (resourceKind) => {
    const mapData = createMapData(resourceKind, 12, 3);
    const binding = findMineDepositBinding({
      mapData,
      dimensions: DIMENSIONS,
      building: mine('mine-1', { x: 0, y: 0 }),
      definition: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    });

    expect(binding?.anchorCell).toEqual({ x: 12, y: 3 });
    expect(binding?.deposit.kind).toBe(resourceKind);
  });

  it('rotates the shaft anchor with the building', () => {
    const mapData = createMapData('iron-ore', 3, 2);
    const binding = findMineDepositBinding({
      mapData,
      dimensions: DIMENSIONS,
      building: {
        ...mine('mine-rotated', { x: 0, y: 0 }),
        rotationQuarterTurns: 1,
      },
      definition: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    });

    expect(binding?.anchorCell).toEqual({ x: 3, y: 2 });
  });

  it('chooses the nearest deposit and breaks equal-distance ties by ID', () => {
    const mapData = createMapData('iron-ore', 12, 3);
    const baseDeposit = mapData.deposits[0];
    mapData.deposits.length = 0;
    mapData.deposits.push(
      { ...baseDeposit, id: 20, centerCell: 13 + 3 * DIMENSIONS.width },
      { ...baseDeposit, id: 10, centerCell: 11 + 3 * DIMENSIONS.width },
    );
    addMineralMask(mapData, 'iron-ore', 13, 3);
    addMineralMask(mapData, 'iron-ore', 11, 3);

    const binding = findMineDepositBinding({
      mapData,
      dimensions: DIMENSIONS,
      building: mine('mine-1', { x: 0, y: 0 }),
      definition: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    });

    expect(binding?.deposit.id).toBe(10);
  });

  it('rejects a missing or incompatible mineral deposit', () => {
    const missing = findMineDepositBinding({
      mapData: createMapData('iron-ore', 0, 0, false),
      dimensions: DIMENSIONS,
      building: mine('mine-1', { x: 0, y: 0 }),
      definition: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    });
    const incompatible = findMineDepositBinding({
      mapData: createMapData('copper-ore', 0, 0),
      dimensions: DIMENSIONS,
      building: mine('mine-1', { x: 0, y: 0 }),
      definition: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    });

    expect(missing).toBeNull();
    expect(incompatible).toBeNull();
  });

  it('buffers output until a warehouse is assigned, then delivers only there', () => {
    const mapData = createMapData('iron-ore', 12, 3);
    const binding = findMineDepositBinding({
      mapData,
      dimensions: DIMENSIONS,
      building: mine('mine-1', { x: 0, y: 0 }),
      definition: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    })!;
    let production = addMineProductionState(createEmptyMineralProductionState(), mine('mine-1', { x: 0, y: 0 }), binding);
    production = addWarehouseProductionState(production, 'warehouse-a');
    production = addWarehouseProductionState(production, 'warehouse-b');

    let tick = runMineralProductionTick(production, [
      mine('mine-1', { x: 0, y: 0 }),
      warehouse('warehouse-a'),
      warehouse('warehouse-b'),
    ]);
    expect(tick.production.mines[0].outputBuffer).toBe(10);
    expect(tick.production.warehouses[0].quantities['iron-ore']).toBe(0);

    production = assignMineWarehouse(tick.production, 'mine-1', 'warehouse-a');
    tick = runMineralProductionTick(production, [
      mine('mine-1', { x: 0, y: 0 }),
      warehouse('warehouse-a'),
      warehouse('warehouse-b'),
    ]);

    expect(tick.production.warehouses.find((warehouse) => warehouse.warehouseBuildingId === 'warehouse-a')?.quantities['iron-ore']).toBe(20);
    expect(tick.production.warehouses.find((warehouse) => warehouse.warehouseBuildingId === 'warehouse-b')?.quantities['iron-ore']).toBe(0);
    expect(tick.production.mines[0].outputBuffer).toBe(0);
    expect(tick.production.transfers.at(-1)?.status).toBe('delivered');
  });

  it('shares deposit capacity between mines and stops at exhaustion', () => {
    const mapData = createMapData('stone', 12, 3);
    mapData.deposits[0] = { ...mapData.deposits[0], baseCapacity: 15 };
    const first = mine('mine-1', { x: 0, y: 0 });
    const second = mine('mine-2', { x: 1, y: 0 });
    const binding = findMineDepositBinding({
      mapData,
      dimensions: DIMENSIONS,
      building: first,
      definition: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    })!;
    let production = addMineProductionState(createEmptyMineralProductionState(), first, binding);
    production = addMineProductionState(production, second, binding);
    const firstTick = runMineralProductionTick(production, [first, second]);
    const secondTick = runMineralProductionTick(firstTick.production, [first, second]);

    expect(firstTick.production.deposits[0].remainingCapacity).toBe(0);
    expect(firstTick.production.mines.map((mineState) => mineState.producedTotal)).toEqual([10, 5]);
    expect(secondTick.production.mines.map((mineState) => mineState.producedTotal)).toEqual([10, 5]);
  });

  it('clears assignments and cancels pending transfers when a warehouse is removed', () => {
    const mapData = createMapData('copper-ore', 12, 3);
    const building = mine('mine-1', { x: 0, y: 0 });
    const binding = findMineDepositBinding({
      mapData,
      dimensions: DIMENSIONS,
      building,
      definition: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION,
    })!;
    let production = addMineProductionState(createEmptyMineralProductionState(), building, binding);
    production = addWarehouseProductionState(production, 'warehouse-a');
    production = assignMineWarehouse(production, 'mine-1', 'warehouse-a');
    production = {
      ...production,
      transfers: [{
        id: 'pending-1',
        sourceMineId: 'mine-1',
        destinationWarehouseId: 'warehouse-a',
        resourceKind: 'copper-ore',
        amount: 3,
        status: 'pending',
      }],
    };

    const cleaned = removeBuildingProductionState(production, 'warehouse-a', 'velutinous-manul-warehouse');

    expect(cleaned.mines[0].assignedWarehouseId).toBeNull();
    expect(cleaned.transfers[0].status).toBe('cancelled');
    expect(cleaned.mines[0].outputBuffer).toBe(0);
  });
});

function mine(id: string, origin: { x: number; y: number }): PlacedBuildingState {
  return {
    id,
    definitionId: 'velutinous-manul-placeholder-mine',
    origin,
    rotationQuarterTurns: 0,
  };
}

function warehouse(id: string): PlacedBuildingState {
  return {
    id,
    definitionId: 'velutinous-manul-warehouse',
    origin: { x: 0, y: 0 },
    rotationQuarterTurns: 0,
  };
}

function createMapData(
  resourceKind: MineralResourceKind,
  centerX: number,
  centerY: number,
  includeDeposit = true,
): AuthoritativeMapData {
  const cellCount = DIMENSIONS.width * DIMENSIONS.height;
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const kind of RESOURCE_KINDS) {
    resourceIntensity[kind] = new Uint8Array(cellCount);
  }
  const mapData: AuthoritativeMapData = {
    heightSamples: new Uint16Array((DIMENSIONS.width + 1) * (DIMENSIONS.height + 1)),
    moisture: new Uint8Array(cellCount),
    temperature: new Uint8Array(cellCount),
    biome: new Uint8Array(cellCount),
    waterKind: new Uint8Array(cellCount),
    flags: new Uint8Array(cellCount).fill(MAP_FLAG_CODES.buildable),
    landmassId: new Uint16Array(cellCount),
    resourceProvinceId: new Uint16Array(cellCount),
    resourceMask: new Uint8Array(cellCount),
    resourceIntensity,
    deposits: [],
  };
  if (includeDeposit) {
    mapData.deposits.push({
      id: 1,
      kind: resourceKind,
      centerCell: centerY * DIMENSIONS.width + centerX,
      radius: 2,
      strength: 0.8,
      baseCapacity: 100,
      resourceProvinceId: 1,
    });
    addMineralMask(mapData, resourceKind, centerX, centerY);
  }
  return mapData;
}

function addMineralMask(
  mapData: AuthoritativeMapData,
  resourceKind: MineralResourceKind,
  centerX: number,
  centerY: number,
): void {
  const mask = resourceKind === 'iron-ore' ? 1 : resourceKind === 'copper-ore' ? 2 : 4;
  for (let y = centerY - 2; y <= centerY + 2; y += 1) {
    for (let x = centerX - 2; x <= centerX + 2; x += 1) {
      if (x < 0 || y < 0 || x >= DIMENSIONS.width || y >= DIMENSIONS.height) {
        continue;
      }
      mapData.resourceMask[y * DIMENSIONS.width + x] |= mask;
    }
  }
}

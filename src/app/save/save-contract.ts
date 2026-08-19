import {
  AuthoritativeMapData,
  MapConfig,
  MapPreset,
  MapSummary,
  MineralResourceKind,
} from '../map/map-types';

export const SAVE_GAME_FORMAT = 'velutinous-manul-save' as const;
export const LEGACY_SAVE_GAME_SCHEMA_VERSION = 1 as const;
export const LEGACY_SAVE_GAME_SCHEMA_VERSION_V2 = 2 as const;
export const LEGACY_SAVE_GAME_SCHEMA_VERSION_V3 = 3 as const;
export const SAVE_GAME_SCHEMA_VERSION = 4 as const;
export const AUTOSAVE_ID = 'autosave' as const;
export const AUTOSAVE_NAME = 'Autosave' as const;

export type SaveSlotKind = 'manual' | 'autosave';

export type QuarterTurn = 0 | 1 | 2 | 3;

export interface GridOrigin {
  readonly x: number;
  readonly y: number;
}

export interface RoadState {
  readonly cell: GridOrigin;
}

export interface PlacedBuildingState {
  readonly id: string;
  readonly definitionId: string;
  readonly origin: GridOrigin;
  readonly rotationQuarterTurns: QuarterTurn;
}

export type TransferStatus = 'pending' | 'delivered' | 'cancelled';

export interface DepositProductionState {
  readonly depositId: number;
  readonly resourceKind: MineralResourceKind;
  readonly remainingCapacity: number;
}

export interface MineProductionState {
  readonly mineBuildingId: string;
  readonly depositId: number;
  readonly resourceKind: MineralResourceKind;
  readonly outputBuffer: number;
  readonly assignedWarehouseId: string | null;
  readonly producedTotal: number;
  readonly deliveredTotal: number;
}

export interface WarehouseInventoryState {
  readonly warehouseBuildingId: string;
  readonly quantities: Readonly<Record<MineralResourceKind, number>>;
}

export interface TransferOrder {
  readonly id: string;
  readonly sourceMineId: string;
  readonly destinationWarehouseId: string;
  readonly resourceKind: MineralResourceKind;
  readonly amount: number;
  readonly status: TransferStatus;
}

export interface MineralProductionState {
  readonly tick: number;
  readonly deposits: readonly DepositProductionState[];
  readonly mines: readonly MineProductionState[];
  readonly warehouses: readonly WarehouseInventoryState[];
  readonly transfers: readonly TransferOrder[];
}

export interface GameplayState {
  readonly placedBuildings: readonly PlacedBuildingState[];
  readonly roads: readonly RoadState[];
  readonly production: MineralProductionState;
}

export interface WorldMapSnapshot {
  readonly configuration: MapConfig;
  readonly generationSummary: MapSummary;
  readonly authoritativeData: AuthoritativeMapData;
}

export interface WorldSession {
  readonly sessionId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly map: WorldMapSnapshot;
  readonly gameplay: GameplayState;
}

export interface LegacySaveGame {
  readonly format: typeof SAVE_GAME_FORMAT;
  readonly schemaVersion: typeof LEGACY_SAVE_GAME_SCHEMA_VERSION;
  readonly saveId: string;
  readonly world: WorldSession;
}

export interface SaveGame {
  readonly format: typeof SAVE_GAME_FORMAT;
  readonly schemaVersion: typeof SAVE_GAME_SCHEMA_VERSION;
  readonly saveId: string;
  readonly slotName: string;
  readonly slotKind: SaveSlotKind;
  readonly world: WorldSession;
}

export interface SaveSlotMetadata {
  readonly saveId: string;
  readonly schemaVersion: typeof SAVE_GAME_SCHEMA_VERSION;
  readonly slotName: string;
  readonly slotKind: SaveSlotKind;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly seed: string;
  readonly preset: MapPreset;
  readonly configHash: string;
  readonly mapIdentity: string;
  readonly mapHash: string;
}

export interface CreateWorldSessionInput {
  readonly sessionId: string;
  readonly mapConfig: MapConfig;
  readonly mapSummary: MapSummary;
  readonly mapData: AuthoritativeMapData;
}

export function createWorldSession(
  input: CreateWorldSessionInput,
  now = Date.now(),
): WorldSession {
  return {
    sessionId: input.sessionId,
    createdAt: now,
    updatedAt: now,
    map: {
      configuration: input.mapConfig,
      generationSummary: input.mapSummary,
      authoritativeData: input.mapData,
    },
    gameplay: {
      placedBuildings: [],
      roads: [],
      production: createEmptyMineralProductionState(),
    },
  };
}

export function createSaveGame(
  saveId: string,
  world: WorldSession,
  slotName: string,
  slotKind: SaveSlotKind,
): SaveGame {
  return {
    format: SAVE_GAME_FORMAT,
    schemaVersion: SAVE_GAME_SCHEMA_VERSION,
    saveId,
    slotName,
    slotKind,
    world,
  };
}

export function createSaveSlotMetadata(saveGame: SaveGame): SaveSlotMetadata {
  const { configuration, generationSummary } = saveGame.world.map;

  return {
    saveId: saveGame.saveId,
    schemaVersion: saveGame.schemaVersion,
    slotName: saveGame.slotName,
    slotKind: saveGame.slotKind,
    createdAt: saveGame.world.createdAt,
    updatedAt: saveGame.world.updatedAt,
    seed: configuration.seed,
    preset: configuration.preset,
    configHash: generationSummary.configHash,
    mapIdentity: generationSummary.mapIdentity,
    mapHash: generationSummary.mapHash,
  };
}

export function createUpdatedWorldSession(
  world: WorldSession,
  now = Date.now(),
): WorldSession {
  return {
    ...world,
    updatedAt: now,
    map: {
      ...world.map,
      configuration: { ...world.map.configuration },
      generationSummary: { ...world.map.generationSummary },
      authoritativeData: world.map.authoritativeData,
    },
    gameplay: {
      ...world.gameplay,
      placedBuildings: world.gameplay.placedBuildings.map((building) => ({
        ...building,
        origin: { ...building.origin },
      })),
      roads: world.gameplay.roads.map((road) => ({
        cell: { ...road.cell },
      })),
      production: cloneMineralProductionState(world.gameplay.production),
    },
  };
}

export function createFallbackImportedSlotName(world: WorldSession): string {
  return `Imported World — ${world.map.configuration.seed}`;
}

export function createEmptyMineralInventory(): Readonly<Record<MineralResourceKind, number>> {
  return {
    'iron-ore': 0,
    'copper-ore': 0,
    stone: 0,
  };
}

export function createEmptyMineralProductionState(): MineralProductionState {
  return {
    tick: 0,
    deposits: [],
    mines: [],
    warehouses: [],
    transfers: [],
  };
}

export function cloneMineralProductionState(
  production: MineralProductionState,
): MineralProductionState {
  return {
    tick: production.tick,
    deposits: production.deposits.map((deposit) => ({ ...deposit })),
    mines: production.mines.map((mine) => ({ ...mine })),
    warehouses: production.warehouses.map((warehouse) => ({
      warehouseBuildingId: warehouse.warehouseBuildingId,
      quantities: { ...warehouse.quantities },
    })),
    transfers: production.transfers.map((transfer) => ({ ...transfer })),
  };
}

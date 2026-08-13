import {
  AuthoritativeMapData,
  MapConfig,
  MapPreset,
  MapSummary,
} from '../map/map-types';

export const SAVE_GAME_FORMAT = 'velutinous-manul-save' as const;
export const SAVE_GAME_SCHEMA_VERSION = 1 as const;

export type QuarterTurn = 0 | 1 | 2 | 3;

export interface GridOrigin {
  readonly x: number;
  readonly y: number;
}

export interface PlacedBuildingState {
  readonly id: string;
  readonly definitionId: string;
  readonly origin: GridOrigin;
  readonly rotationQuarterTurns: QuarterTurn;
}

export interface GameplayState {
  readonly placedBuildings: readonly PlacedBuildingState[];
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

export interface SaveGame {
  readonly format: typeof SAVE_GAME_FORMAT;
  readonly schemaVersion: typeof SAVE_GAME_SCHEMA_VERSION;
  readonly saveId: string;
  readonly world: WorldSession;
}

export interface SaveSlotMetadata {
  readonly saveId: string;
  readonly schemaVersion: typeof SAVE_GAME_SCHEMA_VERSION;
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
    },
  };
}

export function createSaveGame(saveId: string, world: WorldSession): SaveGame {
  return {
    format: SAVE_GAME_FORMAT,
    schemaVersion: SAVE_GAME_SCHEMA_VERSION,
    saveId,
    world,
  };
}

export function createSaveSlotMetadata(saveGame: SaveGame): SaveSlotMetadata {
  const { configuration, generationSummary } = saveGame.world.map;

  return {
    saveId: saveGame.saveId,
    schemaVersion: saveGame.schemaVersion,
    createdAt: saveGame.world.createdAt,
    updatedAt: saveGame.world.updatedAt,
    seed: configuration.seed,
    preset: configuration.preset,
    configHash: generationSummary.configHash,
    mapIdentity: generationSummary.mapIdentity,
    mapHash: generationSummary.mapHash,
  };
}

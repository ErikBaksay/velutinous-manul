import {
  AuthoritativeMapData,
  DepositSource,
  MapConfig,
  MapSummary,
  MineralResourceKind,
  MINERAL_RESOURCE_KINDS,
  RESOURCE_KINDS,
  ResourceKind,
} from '../map/map-types';
import {
  createEmptyMineralProductionState,
  createFallbackImportedSlotName,
  createUpdatedWorldSession,
  LegacySaveGame,
  LEGACY_SAVE_GAME_SCHEMA_VERSION_V2,
  LEGACY_SAVE_GAME_SCHEMA_VERSION_V3,
  LEGACY_SAVE_GAME_SCHEMA_VERSION_V4,
  SaveGame,
  SaveSlotKind,
  SAVE_GAME_FORMAT,
  SAVE_GAME_SCHEMA_VERSION,
  WorldSession,
} from './save-contract';

type TypedArrayKind = 'Uint8Array' | 'Uint16Array';

interface EncodedTypedArray {
  readonly type: TypedArrayKind;
  readonly length: number;
  readonly base64: string;
}

interface PortableAuthoritativeMapData {
  readonly heightSamples: EncodedTypedArray;
  readonly moisture: EncodedTypedArray;
  readonly temperature: EncodedTypedArray;
  readonly biome: EncodedTypedArray;
  readonly waterKind: EncodedTypedArray;
  readonly flags: EncodedTypedArray;
  readonly landmassId: EncodedTypedArray;
  readonly resourceProvinceId: EncodedTypedArray;
  readonly resourceMask: EncodedTypedArray;
  readonly resourceIntensity: Record<ResourceKind, EncodedTypedArray>;
  readonly deposits: readonly DepositSource[];
}

interface PortableWorldSession {
  readonly sessionId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly map: {
    readonly configuration: MapConfig;
    readonly generationSummary: MapSummary;
    readonly authoritativeData: PortableAuthoritativeMapData;
  };
  readonly gameplay: WorldSession['gameplay'];
}

interface PortableSaveEnvelope {
  readonly format: typeof SAVE_GAME_FORMAT;
  readonly schemaVersion: number;
  readonly saveId: string;
  readonly slotName?: string;
  readonly slotKind?: SaveSlotKind;
  readonly world: PortableWorldSession;
}

export class SaveValidationError extends Error {
  readonly code = 'invalid-save' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SaveValidationError';
  }
}

export function serializeSaveGame(saveGame: SaveGame): string {
  validateSaveGame(saveGame);
  const envelope: PortableSaveEnvelope = {
    format: SAVE_GAME_FORMAT,
    schemaVersion: SAVE_GAME_SCHEMA_VERSION,
    saveId: saveGame.saveId,
    slotName: saveGame.slotName,
    slotKind: saveGame.slotKind,
    world: encodeWorld(saveGame.world),
  };
  return JSON.stringify(envelope);
}

export function parsePortableSaveFile(content: string): SaveGame {
  let raw: unknown;
  try {
    raw = JSON.parse(content) as unknown;
  } catch {
    throw new SaveValidationError('The selected file is not valid JSON.');
  }

  const envelope = asRecord(raw, 'The save file must contain a JSON object.');
  assertString(envelope['format'], 'The save file format is missing or invalid.');
  if (envelope['format'] !== SAVE_GAME_FORMAT) {
    throw new SaveValidationError('This file is not a Velutinous Manul save.');
  }

  const schemaVersion = assertInteger(
    envelope['schemaVersion'],
    'The save file schema version is missing or invalid.',
  );
  if (schemaVersion > SAVE_GAME_SCHEMA_VERSION) {
    throw new SaveValidationError(
      `This save uses schema version ${schemaVersion}, but this game supports version ${SAVE_GAME_SCHEMA_VERSION}.`,
    );
  }
  if (schemaVersion !== 1 && schemaVersion !== LEGACY_SAVE_GAME_SCHEMA_VERSION_V2 &&
      schemaVersion !== LEGACY_SAVE_GAME_SCHEMA_VERSION_V3 &&
      schemaVersion !== LEGACY_SAVE_GAME_SCHEMA_VERSION_V4 &&
      schemaVersion !== SAVE_GAME_SCHEMA_VERSION) {
    throw new SaveValidationError(`Save schema version ${schemaVersion} is not supported.`);
  }

  const saveId = assertNonEmptyString(envelope['saveId'], 'The save ID is missing or invalid.');
  const world = decodeWorld(
    envelope['world'],
    schemaVersion >= LEGACY_SAVE_GAME_SCHEMA_VERSION_V3,
    schemaVersion >= LEGACY_SAVE_GAME_SCHEMA_VERSION_V4,
    schemaVersion === SAVE_GAME_SCHEMA_VERSION,
  );

  if (schemaVersion === 1) {
    const legacy: LegacySaveGame = {
      format: SAVE_GAME_FORMAT,
      schemaVersion: 1,
      saveId,
      world,
    };
    return {
      format: legacy.format,
      schemaVersion: SAVE_GAME_SCHEMA_VERSION,
      saveId: legacy.saveId,
      slotName: createFallbackImportedSlotName(legacy.world),
      slotKind: 'manual',
      world: createUpdatedWorldSession(legacy.world, legacy.world.updatedAt),
    };
  }

  const slotName = assertNonEmptyString(envelope['slotName'], 'The save name is missing or invalid.');
  const slotKind = assertSlotKind(envelope['slotKind']);
  const saveGame: SaveGame = {
    format: SAVE_GAME_FORMAT,
    schemaVersion: SAVE_GAME_SCHEMA_VERSION,
    saveId,
    slotName,
    slotKind,
    world,
  };
  return validateSaveGame(saveGame);
}

export function validateSaveGame(value: unknown): SaveGame {
  const save = asRecord(value, 'The stored save is not an object.');
  if (save['format'] !== SAVE_GAME_FORMAT) {
    throw new SaveValidationError('The stored save has an invalid format.');
  }
  const schemaVersion = save['schemaVersion'];
  if (schemaVersion !== LEGACY_SAVE_GAME_SCHEMA_VERSION_V2 &&
      schemaVersion !== LEGACY_SAVE_GAME_SCHEMA_VERSION_V3 &&
      schemaVersion !== LEGACY_SAVE_GAME_SCHEMA_VERSION_V4 &&
      schemaVersion !== SAVE_GAME_SCHEMA_VERSION) {
    throw new SaveValidationError('The stored save uses an unsupported schema version.');
  }
  const saveId = assertNonEmptyString(save['saveId'], 'The stored save ID is invalid.');
  const slotName = assertNonEmptyString(save['slotName'], 'The stored save name is invalid.');
  const slotKind = assertSlotKind(save['slotKind']);
  const world = validateWorld(
    save['world'],
    schemaVersion >= LEGACY_SAVE_GAME_SCHEMA_VERSION_V3,
    schemaVersion >= LEGACY_SAVE_GAME_SCHEMA_VERSION_V4,
    schemaVersion === SAVE_GAME_SCHEMA_VERSION,
  );
  return {
    format: SAVE_GAME_FORMAT,
    schemaVersion: SAVE_GAME_SCHEMA_VERSION,
    saveId,
    slotName,
    slotKind,
    world,
  };
}

function encodeWorld(world: WorldSession): PortableWorldSession {
  return {
    sessionId: world.sessionId,
    createdAt: world.createdAt,
    updatedAt: world.updatedAt,
    map: {
      configuration: world.map.configuration,
      generationSummary: world.map.generationSummary,
      authoritativeData: {
        heightSamples: encodeTypedArray(world.map.authoritativeData.heightSamples),
        moisture: encodeTypedArray(world.map.authoritativeData.moisture),
        temperature: encodeTypedArray(world.map.authoritativeData.temperature),
        biome: encodeTypedArray(world.map.authoritativeData.biome),
        waterKind: encodeTypedArray(world.map.authoritativeData.waterKind),
        flags: encodeTypedArray(world.map.authoritativeData.flags),
        landmassId: encodeTypedArray(world.map.authoritativeData.landmassId),
        resourceProvinceId: encodeTypedArray(world.map.authoritativeData.resourceProvinceId),
        resourceMask: encodeTypedArray(world.map.authoritativeData.resourceMask),
        resourceIntensity: Object.fromEntries(
          RESOURCE_KINDS.map((kind) => [
            kind,
            encodeTypedArray(world.map.authoritativeData.resourceIntensity[kind]),
          ]),
        ) as Record<ResourceKind, EncodedTypedArray>,
        deposits: world.map.authoritativeData.deposits,
      },
    },
    gameplay: world.gameplay,
  };
}

function decodeWorld(
  value: unknown,
  includeProduction: boolean,
  includeRoads: boolean,
  includeClearedCells: boolean,
): WorldSession {
  const raw = asRecord(value, 'The save world is missing or invalid.');
  const map = asRecord(raw['map'], 'The save map is missing or invalid.');
  const configuration = decodeMapConfig(map['configuration']);
  const generationSummary = decodeMapSummary(map['generationSummary']);
  const authoritativeData = decodeAuthoritativeMapData(
    map['authoritativeData'],
    configuration,
  );
  const world: WorldSession = {
    sessionId: assertNonEmptyString(raw['sessionId'], 'The world session ID is invalid.'),
    createdAt: assertTimestamp(raw['createdAt'], 'The world creation time is invalid.'),
    updatedAt: assertTimestamp(raw['updatedAt'], 'The world update time is invalid.'),
    map: {
      configuration,
      generationSummary,
      authoritativeData,
    },
    gameplay: decodeGameplay(
      raw['gameplay'],
      includeProduction,
      includeRoads,
      includeClearedCells,
      configuration.width,
      configuration.height,
    ),
  };
  return validateWorld(world, includeProduction, includeRoads, includeClearedCells);
}

function validateWorld(
  value: unknown,
  includeProduction: boolean,
  includeRoads: boolean,
  includeClearedCells: boolean,
): WorldSession {
  const raw = asRecord(value, 'The world session is missing or invalid.');
  const map = asRecord(raw['map'], 'The world map is missing or invalid.');
  const configuration = validateMapConfig(map['configuration']);
  const generationSummary = validateMapSummary(map['generationSummary']);
  const authoritativeData = validateAuthoritativeMapData(
    map['authoritativeData'],
    configuration,
  );
  return {
    sessionId: assertNonEmptyString(raw['sessionId'], 'The world session ID is invalid.'),
    createdAt: assertTimestamp(raw['createdAt'], 'The world creation time is invalid.'),
    updatedAt: assertTimestamp(raw['updatedAt'], 'The world update time is invalid.'),
    map: {
      configuration,
      generationSummary,
      authoritativeData,
    },
    gameplay: validateGameplay(
      raw['gameplay'],
      includeProduction,
      includeRoads,
      includeClearedCells,
      configuration.width,
      configuration.height,
    ),
  };
}

function decodeMapConfig(value: unknown): MapConfig {
  return validateMapConfig(value);
}

function validateMapConfig(value: unknown): MapConfig {
  const raw = asRecord(value, 'The map configuration is missing or invalid.');
  const seed = assertNonEmptyString(raw['seed'], 'The map seed is invalid.');
  const preset = raw['preset'];
  if (preset !== 'balanced-continental' && preset !== 'riverlands' && preset !== 'highland-frontier') {
    throw new SaveValidationError('The map preset is invalid.');
  }
  const width = assertPositiveInteger(raw['width'], 'The map width is invalid.');
  const height = assertPositiveInteger(raw['height'], 'The map height is invalid.');
  return {
    seed,
    preset,
    width,
    height,
    waterCoverage: assertRatio(raw['waterCoverage'], 'The water coverage is invalid.'),
    terrainRoughness: assertRatio(raw['terrainRoughness'], 'The terrain roughness is invalid.'),
    forestDensity: assertRatio(raw['forestDensity'], 'The forest density is invalid.'),
    resourceAbundance: assertRatio(raw['resourceAbundance'], 'The resource abundance is invalid.'),
  };
}

function decodeMapSummary(value: unknown): MapSummary {
  return validateMapSummary(value);
}

function validateMapSummary(value: unknown): MapSummary {
  const raw = asRecord(value, 'The map generation summary is missing or invalid.');
  return {
    seed: assertNonEmptyString(raw['seed'], 'The map summary seed is invalid.'),
    configHash: assertNonEmptyString(raw['configHash'], 'The map config hash is invalid.'),
    mapIdentity: assertNonEmptyString(raw['mapIdentity'], 'The map identity is invalid.'),
    mapHash: assertNonEmptyString(raw['mapHash'], 'The map hash is invalid.'),
    seaLevelSample: assertFiniteNumber(raw['seaLevelSample'], 'The sea-level sample is invalid.'),
    riverCellCount: assertNonNegativeInteger(raw['riverCellCount'], 'The river-cell count is invalid.'),
    regionCount: assertNonNegativeInteger(raw['regionCount'], 'The region count is invalid.'),
    buildableCellCount: assertNonNegativeInteger(raw['buildableCellCount'], 'The buildable-cell count is invalid.'),
    resourceProvinceCount: assertNonNegativeInteger(raw['resourceProvinceCount'], 'The resource-province count is invalid.'),
    resourceSourceCount: assertNonNegativeInteger(raw['resourceSourceCount'], 'The resource-source count is invalid.'),
    startingCell: assertNonNegativeInteger(raw['startingCell'], 'The starting cell is invalid.'),
    startingBuildableCellCount: assertNonNegativeInteger(raw['startingBuildableCellCount'], 'The starting buildable-cell count is invalid.'),
    startingStonePathCost: assertFiniteNumber(raw['startingStonePathCost'], 'The starting stone path cost is invalid.'),
    startingTimberPathCost: assertFiniteNumber(raw['startingTimberPathCost'], 'The starting timber path cost is invalid.'),
    startingFertileLandPathCost: assertFiniteNumber(raw['startingFertileLandPathCost'], 'The starting fertile-land path cost is invalid.'),
    startingIronPathCost: assertFiniteNumber(raw['startingIronPathCost'], 'The starting iron path cost is invalid.'),
    startingCopperPathCost: assertFiniteNumber(raw['startingCopperPathCost'], 'The starting copper path cost is invalid.'),
    startingValidCandidateCount: assertNonNegativeInteger(raw['startingValidCandidateCount'], 'The starting candidate count is invalid.'),
    generationDurationMs: assertNonNegativeInteger(raw['generationDurationMs'], 'The generation duration is invalid.'),
    estimatedFinalBytes: assertNonNegativeInteger(raw['estimatedFinalBytes'], 'The final memory estimate is invalid.'),
    estimatedPeakBytes: assertNonNegativeInteger(raw['estimatedPeakBytes'], 'The peak memory estimate is invalid.'),
  };
}

function decodeAuthoritativeMapData(
  value: unknown,
  configuration: MapConfig,
): AuthoritativeMapData {
  const raw = asRecord(value, 'The authoritative map data is missing or invalid.');
  const resourceIntensity = asRecord(
    raw['resourceIntensity'],
    'The resource intensity data is missing or invalid.',
  );
  return validateAuthoritativeMapData(
    {
      heightSamples: decodeTypedArray(raw['heightSamples'], 'Uint16Array'),
      moisture: decodeTypedArray(raw['moisture'], 'Uint8Array'),
      temperature: decodeTypedArray(raw['temperature'], 'Uint8Array'),
      biome: decodeTypedArray(raw['biome'], 'Uint8Array'),
      waterKind: decodeTypedArray(raw['waterKind'], 'Uint8Array'),
      flags: decodeTypedArray(raw['flags'], 'Uint8Array'),
      landmassId: decodeTypedArray(raw['landmassId'], 'Uint16Array'),
      resourceProvinceId: decodeTypedArray(raw['resourceProvinceId'], 'Uint16Array'),
      resourceMask: decodeTypedArray(raw['resourceMask'], 'Uint8Array'),
      resourceIntensity: Object.fromEntries(
        RESOURCE_KINDS.map((kind) => [kind, decodeTypedArray(resourceIntensity[kind], 'Uint8Array')]),
      ) as Record<ResourceKind, Uint8Array>,
      deposits: raw['deposits'],
    },
    configuration,
  );
}

function validateAuthoritativeMapData(
  value: unknown,
  configuration: MapConfig,
): AuthoritativeMapData {
  const raw = asRecord(value, 'The authoritative map data is missing or invalid.');
  const cellCount = configuration.width * configuration.height;
  const heightSampleCount = (configuration.width + 1) * (configuration.height + 1);
  const heightSamples = assertTypedArray(raw['heightSamples'], 'Uint16Array', heightSampleCount);
  const moisture = assertTypedArray(raw['moisture'], 'Uint8Array', cellCount);
  const temperature = assertTypedArray(raw['temperature'], 'Uint8Array', cellCount);
  const biome = assertTypedArray(raw['biome'], 'Uint8Array', cellCount);
  const waterKind = assertTypedArray(raw['waterKind'], 'Uint8Array', cellCount);
  const flags = assertTypedArray(raw['flags'], 'Uint8Array', cellCount);
  const landmassId = assertTypedArray(raw['landmassId'], 'Uint16Array', cellCount);
  const resourceProvinceId = assertTypedArray(raw['resourceProvinceId'], 'Uint16Array', cellCount);
  const resourceMask = assertTypedArray(raw['resourceMask'], 'Uint8Array', cellCount);
  const resourceIntensityRaw = asRecord(
    raw['resourceIntensity'],
    'The resource intensity data is missing or invalid.',
  );
  const resourceIntensity = {} as Record<ResourceKind, Uint8Array>;
  for (const kind of RESOURCE_KINDS) {
    resourceIntensity[kind] = assertTypedArray(
      resourceIntensityRaw[kind],
      'Uint8Array',
      cellCount,
    );
  }
  const deposits = validateDeposits(raw['deposits']);
  return {
    heightSamples,
    moisture,
    temperature,
    biome,
    waterKind,
    flags,
    landmassId,
    resourceProvinceId,
    resourceMask,
    resourceIntensity,
    deposits,
  };
}

function decodeGameplay(
  value: unknown,
  includeProduction: boolean,
  includeRoads: boolean,
  includeClearedCells: boolean,
  width: number,
  height: number,
): WorldSession['gameplay'] {
  return validateGameplay(value, includeProduction, includeRoads, includeClearedCells, width, height);
}

function validateGameplay(
  value: unknown,
  includeProduction: boolean,
  includeRoads: boolean,
  includeClearedCells: boolean,
  width: number,
  height: number,
): WorldSession['gameplay'] {
  const raw = asRecord(value, 'The gameplay state is missing or invalid.');
  if (!Array.isArray(raw['placedBuildings'])) {
    throw new SaveValidationError('The placed-building state is invalid.');
  }
  return {
    placedBuildings: raw['placedBuildings'].map((building, index) => {
      const item = asRecord(building, `Placed building ${index} is invalid.`);
      const rotation = assertInteger(
        item['rotationQuarterTurns'],
        `Placed building ${index} rotation is invalid.`,
      );
      if (rotation < 0 || rotation > 3) {
        throw new SaveValidationError(`Placed building ${index} rotation is invalid.`);
      }
      const origin = asRecord(item['origin'], `Placed building ${index} origin is invalid.`);
      return {
        id: assertNonEmptyString(item['id'], `Placed building ${index} ID is invalid.`),
        definitionId: assertNonEmptyString(
          item['definitionId'],
          `Placed building ${index} definition is invalid.`,
        ),
        origin: {
          x: assertInteger(origin['x'], `Placed building ${index} X coordinate is invalid.`),
          y: assertInteger(origin['y'], `Placed building ${index} Y coordinate is invalid.`),
        },
        rotationQuarterTurns: rotation as 0 | 1 | 2 | 3,
      };
    }),
    roads: includeRoads
      ? validateRoads(raw['roads'], width, height)
      : [],
    clearedCellIndices: includeClearedCells
      ? validateClearedCellIndices(raw['clearedCellIndices'], width, height)
      : [],
    production: includeProduction
      ? validateMineralProductionState(raw['production'])
      : createEmptyMineralProductionState(),
  };
}

function validateClearedCellIndices(
  value: unknown,
  width: number,
  height: number,
): readonly number[] {
  if (!Array.isArray(value)) {
    throw new SaveValidationError('The cleared-cell state is invalid.');
  }

  const cellCount = width * height;
  const seen = new Set<number>();
  return value.map((cellIndex, index) => {
    const parsed = assertInteger(cellIndex, `Cleared cell ${index} is invalid.`);
    if (parsed < 0 || parsed >= cellCount) {
      throw new SaveValidationError(`Cleared cell ${index} is outside the map.`);
    }
    if (seen.has(parsed)) {
      throw new SaveValidationError(`Cleared cell ${index} duplicates another cell.`);
    }
    seen.add(parsed);
    return parsed;
  }).sort((left, right) => left - right);
}

function validateRoads(value: unknown, width: number, height: number): WorldSession['gameplay']['roads'] {
  if (!Array.isArray(value)) {
    throw new SaveValidationError('The road state is invalid.');
  }

  const seenCells = new Set<string>();
  return value.map((road, index) => {
    const item = asRecord(road, `Road ${index} is invalid.`);
    const cell = asRecord(item['cell'], `Road ${index} cell is invalid.`);
    const x = assertInteger(cell['x'], `Road ${index} X coordinate is invalid.`);
    const y = assertInteger(cell['y'], `Road ${index} Y coordinate is invalid.`);
    if (x < 0 || x >= width || y < 0 || y >= height) {
      throw new SaveValidationError(`Road ${index} cell is outside the map.`);
    }
    const key = `${x},${y}`;
    if (seenCells.has(key)) {
      throw new SaveValidationError(`Road ${index} duplicates another road cell.`);
    }
    seenCells.add(key);
    return { cell: { x, y } };
  }).sort((left, right) => left.cell.y - right.cell.y || left.cell.x - right.cell.x);
}

function validateMineralProductionState(value: unknown): WorldSession['gameplay']['production'] {
  const raw = asRecord(value, 'The mineral production state is missing or invalid.');
  const tick = assertNonNegativeInteger(raw['tick'], 'The production tick is invalid.');
  if (!Array.isArray(raw['deposits'])) {
    throw new SaveValidationError('The production deposit state is invalid.');
  }
  if (!Array.isArray(raw['mines'])) {
    throw new SaveValidationError('The production mine state is invalid.');
  }
  if (!Array.isArray(raw['warehouses'])) {
    throw new SaveValidationError('The production warehouse state is invalid.');
  }
  if (!Array.isArray(raw['transfers'])) {
    throw new SaveValidationError('The production transfer state is invalid.');
  }

  return {
    tick,
    deposits: raw['deposits'].map((deposit, index) => {
      const item = asRecord(deposit, `Production deposit ${index} is invalid.`);
      return {
        depositId: assertNonNegativeInteger(item['depositId'], `Production deposit ${index} ID is invalid.`),
        resourceKind: assertMineralResourceKind(item['resourceKind'], `Production deposit ${index} resource is invalid.`),
        remainingCapacity: assertNonNegativeNumber(
          item['remainingCapacity'],
          `Production deposit ${index} capacity is invalid.`,
        ),
      };
    }),
    mines: raw['mines'].map((mine, index) => {
      const item = asRecord(mine, `Production mine ${index} is invalid.`);
      const assignedWarehouseId = item['assignedWarehouseId'];
      if (assignedWarehouseId !== null && typeof assignedWarehouseId !== 'string') {
        throw new SaveValidationError(`Production mine ${index} warehouse assignment is invalid.`);
      }
      return {
        mineBuildingId: assertNonEmptyString(item['mineBuildingId'], `Production mine ${index} ID is invalid.`),
        depositId: assertNonNegativeInteger(item['depositId'], `Production mine ${index} deposit is invalid.`),
        resourceKind: assertMineralResourceKind(item['resourceKind'], `Production mine ${index} resource is invalid.`),
        outputBuffer: assertNonNegativeNumber(item['outputBuffer'], `Production mine ${index} buffer is invalid.`),
        assignedWarehouseId,
        producedTotal: assertNonNegativeNumber(item['producedTotal'], `Production mine ${index} production total is invalid.`),
        deliveredTotal: assertNonNegativeNumber(item['deliveredTotal'], `Production mine ${index} delivery total is invalid.`),
      };
    }),
    warehouses: raw['warehouses'].map((warehouse, index) => {
      const item = asRecord(warehouse, `Production warehouse ${index} is invalid.`);
      const quantities = asRecord(item['quantities'], `Production warehouse ${index} inventory is invalid.`);
      return {
        warehouseBuildingId: assertNonEmptyString(
          item['warehouseBuildingId'],
          `Production warehouse ${index} ID is invalid.`,
        ),
        quantities: Object.fromEntries(MINERAL_RESOURCE_KINDS.map((kind) => [
          kind,
          assertNonNegativeNumber(quantities[kind], `Production warehouse ${index} quantity is invalid.`),
        ])) as WorldSession['gameplay']['production']['warehouses'][number]['quantities'],
      };
    }),
    transfers: raw['transfers'].map((transfer, index) => {
      const item = asRecord(transfer, `Production transfer ${index} is invalid.`);
      const status = item['status'];
      if (status !== 'pending' && status !== 'delivered' && status !== 'cancelled') {
        throw new SaveValidationError(`Production transfer ${index} status is invalid.`);
      }
      return {
        id: assertNonEmptyString(item['id'], `Production transfer ${index} ID is invalid.`),
        sourceMineId: assertNonEmptyString(item['sourceMineId'], `Production transfer ${index} source is invalid.`),
        destinationWarehouseId: assertNonEmptyString(
          item['destinationWarehouseId'],
          `Production transfer ${index} destination is invalid.`,
        ),
        resourceKind: assertMineralResourceKind(item['resourceKind'], `Production transfer ${index} resource is invalid.`),
        amount: assertPositiveNumber(item['amount'], `Production transfer ${index} amount is invalid.`),
        status,
      };
    }),
  };
}

function validateDeposits(value: unknown): DepositSource[] {
  if (!Array.isArray(value)) {
    throw new SaveValidationError('The deposit data is invalid.');
  }
  return value.map((deposit, index) => {
    const raw = asRecord(deposit, `Deposit ${index} is invalid.`);
    const kind = raw['kind'];
    if (kind !== 'iron-ore' && kind !== 'copper-ore' && kind !== 'stone') {
      throw new SaveValidationError(`Deposit ${index} kind is invalid.`);
    }
    return {
      id: assertNonNegativeInteger(raw['id'], `Deposit ${index} ID is invalid.`),
      kind,
      centerCell: assertNonNegativeInteger(raw['centerCell'], `Deposit ${index} center is invalid.`),
      radius: assertFiniteNumber(raw['radius'], `Deposit ${index} radius is invalid.`),
      strength: assertFiniteNumber(raw['strength'], `Deposit ${index} strength is invalid.`),
      baseCapacity: assertFiniteNumber(raw['baseCapacity'], `Deposit ${index} capacity is invalid.`),
      resourceProvinceId: assertNonNegativeInteger(
        raw['resourceProvinceId'],
        `Deposit ${index} province is invalid.`,
      ),
    };
  });
}

function encodeTypedArray(array: Uint8Array | Uint16Array): EncodedTypedArray {
  const type: TypedArrayKind = array instanceof Uint16Array ? 'Uint16Array' : 'Uint8Array';
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  return {
    type,
    length: array.length,
    base64: bytesToBase64(bytes),
  };
}

function decodeTypedArray(value: unknown, expectedType: TypedArrayKind): Uint8Array | Uint16Array {
  const raw = asRecord(value, 'The typed-array data is invalid.');
  if (raw['type'] !== expectedType) {
    throw new SaveValidationError(`Expected ${expectedType} data.`);
  }
  const length = assertNonNegativeInteger(raw['length'], 'The typed-array length is invalid.');
  const base64 = assertString(raw['base64'], 'The typed-array encoding is invalid.');
  const bytes = base64ToBytes(base64);
  const bytesPerElement = expectedType === 'Uint16Array' ? 2 : 1;
  if (bytes.length !== length * bytesPerElement) {
    throw new SaveValidationError('The typed-array byte length does not match its declared length.');
  }
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return expectedType === 'Uint16Array'
    ? new Uint16Array(buffer)
    : new Uint8Array(buffer);
}

function assertTypedArray(
  value: unknown,
  expectedType: 'Uint8Array',
  expectedLength: number,
): Uint8Array;
function assertTypedArray(
  value: unknown,
  expectedType: 'Uint16Array',
  expectedLength: number,
): Uint16Array;
function assertTypedArray(
  value: unknown,
  expectedType: TypedArrayKind,
  expectedLength: number,
): Uint8Array | Uint16Array {
  if (!(value instanceof Uint8Array) && !(value instanceof Uint16Array)) {
    throw new SaveValidationError(`Expected ${expectedType} data.`);
  }
  if (expectedType === 'Uint16Array' && !(value instanceof Uint16Array)) {
    throw new SaveValidationError(`Expected ${expectedType} data.`);
  }
  if (expectedType === 'Uint8Array' && !(value instanceof Uint8Array)) {
    throw new SaveValidationError(`Expected ${expectedType} data.`);
  }
  if (value.length !== expectedLength) {
    throw new SaveValidationError('The typed-array length does not match the map configuration.');
  }
  return value;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== 'function') {
    throw new SaveValidationError('This browser cannot encode portable save files.');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob !== 'function') {
    throw new SaveValidationError('This browser cannot decode portable save files.');
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new SaveValidationError('The portable save contains invalid base64 data.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function assertSlotKind(value: unknown): SaveSlotKind {
  if (value !== 'manual' && value !== 'autosave') {
    throw new SaveValidationError('The save slot kind is invalid.');
  }
  return value;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SaveValidationError(message);
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw new SaveValidationError(message);
  }
  return value;
}

function assertNonEmptyString(value: unknown, message: string): string {
  const stringValue = assertString(value, message).trim();
  if (stringValue.length === 0) {
    throw new SaveValidationError(message);
  }
  return stringValue;
}

function assertFiniteNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SaveValidationError(message);
  }
  return value;
}

function assertNonNegativeNumber(value: unknown, message: string): number {
  const numberValue = assertFiniteNumber(value, message);
  if (numberValue < 0) {
    throw new SaveValidationError(message);
  }
  return numberValue;
}

function assertPositiveNumber(value: unknown, message: string): number {
  const numberValue = assertFiniteNumber(value, message);
  if (numberValue <= 0) {
    throw new SaveValidationError(message);
  }
  return numberValue;
}

function assertMineralResourceKind(value: unknown, message: string): MineralResourceKind {
  if (!(MINERAL_RESOURCE_KINDS as readonly unknown[]).includes(value)) {
    throw new SaveValidationError(message);
  }
  return value as MineralResourceKind;
}

function assertInteger(value: unknown, message: string): number {
  const numberValue = assertFiniteNumber(value, message);
  if (!Number.isInteger(numberValue)) {
    throw new SaveValidationError(message);
  }
  return numberValue;
}

function assertPositiveInteger(value: unknown, message: string): number {
  const numberValue = assertInteger(value, message);
  if (numberValue <= 0) {
    throw new SaveValidationError(message);
  }
  return numberValue;
}

function assertNonNegativeInteger(value: unknown, message: string): number {
  const numberValue = assertInteger(value, message);
  if (numberValue < 0) {
    throw new SaveValidationError(message);
  }
  return numberValue;
}

function assertTimestamp(value: unknown, message: string): number {
  const numberValue = assertNonNegativeInteger(value, message);
  if (numberValue === 0) {
    throw new SaveValidationError(message);
  }
  return numberValue;
}

function assertRatio(value: unknown, message: string): number {
  const numberValue = assertFiniteNumber(value, message);
  if (numberValue < 0 || numberValue > 1) {
    throw new SaveValidationError(message);
  }
  return numberValue;
}

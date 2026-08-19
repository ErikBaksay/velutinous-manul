import {
  DEFAULT_MAP_CONFIG,
  AuthoritativeMapData,
  MapSummary,
  RESOURCE_KINDS,
} from '../map/map-types';
import {
  createEmptyMineralProductionState,
  createSaveGame,
  createWorldSession,
  SAVE_GAME_SCHEMA_VERSION,
} from './save-contract';
import {
  parsePortableSaveFile,
  SaveValidationError,
  serializeSaveGame,
} from './portable-save-codec';

describe('portable save codec', () => {
  it('round-trips the authoritative typed arrays through JSON and base64', () => {
    const mapData = createMapData();
    mapData.heightSamples[0] = 4321;
    mapData.resourceIntensity['iron-ore'][0] = 27;
    const world = createWorldSession(
      {
        sessionId: 'codec-session',
        mapConfig: { ...DEFAULT_MAP_CONFIG, width: 2, height: 2 },
        mapSummary: createMapSummary(),
        mapData,
      },
      1_753_000_000_100,
    );
    const content = serializeSaveGame({
      format: 'velutinous-manul-save',
      schemaVersion: SAVE_GAME_SCHEMA_VERSION,
      saveId: 'codec-save',
      slotName: 'Codec World',
      slotKind: 'manual',
      world,
    });

    const parsed = parsePortableSaveFile(content);

    expect(parsed.slotName).toBe('Codec World');
    expect(parsed.slotKind).toBe('manual');
    expect(parsed.world.map.authoritativeData.heightSamples).toBeInstanceOf(Uint16Array);
    expect(parsed.world.map.authoritativeData.heightSamples[0]).toBe(4321);
    expect(parsed.world.map.authoritativeData.resourceIntensity['iron-ore'][0]).toBe(27);
    expect(parsed.world.map.authoritativeData.moisture.length).toBe(4);
  });

  it('round-trips placed buildings without requiring a registered definition', () => {
    const world = createWorldSession(
      {
        sessionId: 'placed-building-session',
        mapConfig: { ...DEFAULT_MAP_CONFIG, width: 2, height: 2 },
        mapSummary: createMapSummary(),
        mapData: createMapData(),
      },
      1_753_000_000_103,
    );
    const placedBuildings = [
      {
        id: 'future-structure-1',
        definitionId: 'future-structure',
        origin: { x: 1, y: 0 },
        rotationQuarterTurns: 3 as const,
      },
      {
        id: 'velutinous-manul-warehouse-1',
        definitionId: 'velutinous-manul-warehouse',
        origin: { x: 0, y: 1 },
        rotationQuarterTurns: 1 as const,
      },
    ];
    const roads = [{ cell: { x: 0, y: 0 } }, { cell: { x: 1, y: 1 } }];
    const content = serializeSaveGame(
      createSaveGame(
        'placed-building-save',
        { ...world, gameplay: { ...world.gameplay, placedBuildings, roads } },
        'Placed Buildings',
        'manual',
      ),
    );

    const parsed = parsePortableSaveFile(content);

    expect(parsed.world.gameplay.placedBuildings).toEqual(placedBuildings);
    expect(parsed.world.gameplay.roads).toEqual(roads);
  });

  it('round-trips generic mineral production state', () => {
    const world = createWorldSession(
      {
        sessionId: 'production-session',
        mapConfig: { ...DEFAULT_MAP_CONFIG, width: 2, height: 2 },
        mapSummary: createMapSummary(),
        mapData: createMapData(),
      },
      1_753_000_000_104,
    );
    const production = {
      ...createEmptyMineralProductionState(),
      tick: 3,
      deposits: [{ depositId: 7, resourceKind: 'copper-ore' as const, remainingCapacity: 41 }],
      mines: [{
        mineBuildingId: 'velutinous-manul-placeholder-mine-1',
        depositId: 7,
        resourceKind: 'copper-ore' as const,
        outputBuffer: 2,
        assignedWarehouseId: 'velutinous-manul-warehouse-1',
        producedTotal: 32,
        deliveredTotal: 30,
      }],
      warehouses: [{
        warehouseBuildingId: 'velutinous-manul-warehouse-1',
        quantities: { 'iron-ore': 0, 'copper-ore': 30, stone: 0 },
      }],
      transfers: [{
        id: 'transfer-3-velutinous-manul-placeholder-mine-1',
        sourceMineId: 'velutinous-manul-placeholder-mine-1',
        destinationWarehouseId: 'velutinous-manul-warehouse-1',
        resourceKind: 'copper-ore' as const,
        amount: 30,
        status: 'delivered' as const,
      }],
    };
    const parsed = parsePortableSaveFile(serializeSaveGame(createSaveGame(
      'production-save',
      { ...world, gameplay: { ...world.gameplay, production } },
      'Production World',
      'manual',
    )));

    expect(parsed.world.gameplay.production).toEqual(production);
  });

  it('migrates a version-one portable file to a named manual save', () => {
    const world = createWorldSession(
      {
        sessionId: 'legacy-session',
        mapConfig: { ...DEFAULT_MAP_CONFIG, width: 2, height: 2 },
        mapSummary: createMapSummary(),
        mapData: createMapData(),
      },
      1_753_000_000_101,
    );
    const current = JSON.parse(serializeSaveGame({
      format: 'velutinous-manul-save',
      schemaVersion: SAVE_GAME_SCHEMA_VERSION,
      saveId: 'legacy-save',
      slotName: 'Current Name',
      slotKind: 'manual',
      world,
    })) as Record<string, unknown>;
    delete current['slotName'];
    delete current['slotKind'];
    current['schemaVersion'] = 1;

    const parsed = parsePortableSaveFile(JSON.stringify(current));

    expect(parsed.schemaVersion).toBe(SAVE_GAME_SCHEMA_VERSION);
    expect(parsed.slotKind).toBe('manual');
    expect(parsed.slotName).toBe('Imported World — VELUTINOUS-MANUL-START-001');
  });

  it('migrates a version-two portable file with empty production state', () => {
    const world = createWorldSession(
      {
        sessionId: 'legacy-v2-session',
        mapConfig: { ...DEFAULT_MAP_CONFIG, width: 2, height: 2 },
        mapSummary: createMapSummary(),
        mapData: createMapData(),
      },
      1_753_000_000_105,
    );
    const current = JSON.parse(serializeSaveGame({
      format: 'velutinous-manul-save',
      schemaVersion: SAVE_GAME_SCHEMA_VERSION,
      saveId: 'legacy-v2-save',
      slotName: 'Legacy v2 World',
      slotKind: 'manual',
      world,
    })) as Record<string, any>;
    current['schemaVersion'] = 2;
    delete current['world']['gameplay']['production'];

    const parsed = parsePortableSaveFile(JSON.stringify(current));

    expect(parsed.schemaVersion).toBe(SAVE_GAME_SCHEMA_VERSION);
    expect(parsed.slotName).toBe('Legacy v2 World');
    expect(parsed.world.gameplay.production).toEqual(createEmptyMineralProductionState());
  });

  it('migrates a version-three portable file with empty road state', () => {
    const world = createWorldSession(
      {
        sessionId: 'legacy-v3-session',
        mapConfig: { ...DEFAULT_MAP_CONFIG, width: 2, height: 2 },
        mapSummary: createMapSummary(),
        mapData: createMapData(),
      },
      1_753_000_000_106,
    );
    const current = JSON.parse(serializeSaveGame(createSaveGame(
      'legacy-v3-save',
      {
        ...world,
        gameplay: {
          ...world.gameplay,
          production: { ...world.gameplay.production, tick: 7 },
        },
      },
      'Legacy v3 World',
      'manual',
    ))) as Record<string, any>;
    current['schemaVersion'] = 3;
    delete current['world']['gameplay']['roads'];

    const parsed = parsePortableSaveFile(JSON.stringify(current));

    expect(parsed.schemaVersion).toBe(SAVE_GAME_SCHEMA_VERSION);
    expect(parsed.world.gameplay.roads).toEqual([]);
    expect(parsed.world.gameplay.production.tick).toBe(7);
  });

  it('rejects future schemas, malformed base64, and wrong typed-array lengths', () => {
    const world = createWorldSession(
      {
        sessionId: 'invalid-session',
        mapConfig: { ...DEFAULT_MAP_CONFIG, width: 2, height: 2 },
        mapSummary: createMapSummary(),
        mapData: createMapData(),
      },
      1_753_000_000_102,
    );
    const raw = JSON.parse(serializeSaveGame({
      format: 'velutinous-manul-save',
      schemaVersion: SAVE_GAME_SCHEMA_VERSION,
      saveId: 'invalid-save',
      slotName: 'Invalid World',
      slotKind: 'manual',
      world,
    })) as Record<string, any>;

    raw['schemaVersion'] = 99;
    expect(() => parsePortableSaveFile(JSON.stringify(raw))).toThrow(SaveValidationError);

    raw['schemaVersion'] = SAVE_GAME_SCHEMA_VERSION;
    raw['world']['map']['authoritativeData']['moisture']['base64'] = 'not-base64';
    expect(() => parsePortableSaveFile(JSON.stringify(raw))).toThrow(SaveValidationError);

    const valid = JSON.parse(serializeSaveGame({
      format: 'velutinous-manul-save',
      schemaVersion: SAVE_GAME_SCHEMA_VERSION,
      saveId: 'invalid-save-2',
      slotName: 'Invalid World',
      slotKind: 'manual',
      world,
    })) as Record<string, any>;
    valid['world']['map']['authoritativeData']['moisture']['length'] = 3;
    expect(() => parsePortableSaveFile(JSON.stringify(valid))).toThrow(SaveValidationError);

    const invalidProduction = JSON.parse(serializeSaveGame({
      format: 'velutinous-manul-save',
      schemaVersion: SAVE_GAME_SCHEMA_VERSION,
      saveId: 'invalid-save-3',
      slotName: 'Invalid World',
      slotKind: 'manual',
      world,
    })) as Record<string, any>;
    invalidProduction['world']['gameplay']['production']['warehouses'] = [{
      warehouseBuildingId: 'warehouse-1',
      quantities: { 'iron-ore': -1, 'copper-ore': 0, stone: 0 },
    }];
    expect(() => parsePortableSaveFile(JSON.stringify(invalidProduction))).toThrow(SaveValidationError);

    const invalidRoads = JSON.parse(serializeSaveGame(createSaveGame(
      'invalid-save-4',
      world,
      'Invalid World',
      'manual',
    ))) as Record<string, any>;
    invalidRoads['world']['gameplay']['roads'] = [
      { cell: { x: 0, y: 0 } },
      { cell: { x: 0, y: 0 } },
    ];
    expect(() => parsePortableSaveFile(JSON.stringify(invalidRoads))).toThrow(SaveValidationError);
  });
});

function createMapData(): AuthoritativeMapData {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(4);
  }
  return {
    heightSamples: new Uint16Array(9),
    moisture: new Uint8Array(4),
    temperature: new Uint8Array(4),
    biome: new Uint8Array(4),
    waterKind: new Uint8Array(4),
    flags: new Uint8Array(4),
    landmassId: new Uint16Array(4),
    resourceProvinceId: new Uint16Array(4),
    resourceMask: new Uint8Array(4),
    resourceIntensity,
    deposits: [],
  };
}

function createMapSummary(): MapSummary {
  return {
    seed: DEFAULT_MAP_CONFIG.seed,
    configHash: 'config-hash',
    mapIdentity: `1:${DEFAULT_MAP_CONFIG.seed}:config`,
    mapHash: 'map-hash',
    seaLevelSample: 30_000,
    riverCellCount: 1,
    regionCount: 1,
    buildableCellCount: 4,
    resourceProvinceCount: 1,
    resourceSourceCount: 0,
    startingCell: 0,
    startingBuildableCellCount: 4,
    startingStonePathCost: 1,
    startingTimberPathCost: 1,
    startingFertileLandPathCost: 1,
    startingIronPathCost: 1,
    startingCopperPathCost: 1,
    startingValidCandidateCount: 1,
    generationDurationMs: 1,
    estimatedFinalBytes: 1,
    estimatedPeakBytes: 1,
  };
}

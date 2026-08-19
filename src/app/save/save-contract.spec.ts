import {
  createSaveGame,
  createSaveSlotMetadata,
  createWorldSession,
  SAVE_GAME_FORMAT,
  SAVE_GAME_SCHEMA_VERSION,
} from './save-contract';
import {
  AuthoritativeMapData,
  DEFAULT_MAP_CONFIG,
  MapSummary,
  RESOURCE_KINDS,
} from '../map/map-types';

describe('save contract', () => {
  it('creates an empty world session from the generated map snapshot', () => {
    const mapConfig = { ...DEFAULT_MAP_CONFIG, seed: 'VELUTINOUS-MANUL-SAVE-001' };
    const mapSummary = createMapSummary(mapConfig.seed);
    const mapData = createMapData();
    mapData.heightSamples[0] = 321;
    mapData.resourceIntensity['iron-ore'][0] = 17;

    const session = createWorldSession(
      {
        sessionId: 'session-001',
        mapConfig,
        mapSummary,
        mapData,
      },
      1_753_000_000_000,
    );

    expect(session.sessionId).toBe('session-001');
    expect(session.createdAt).toBe(1_753_000_000_000);
    expect(session.updatedAt).toBe(1_753_000_000_000);
    expect(session.map.configuration).toBe(mapConfig);
    expect(session.map.generationSummary).toBe(mapSummary);
    expect(session.map.generationSummary.mapIdentity).toBe(
      '1:VELUTINOUS-MANUL-SAVE-001:config',
    );
    expect(session.map.generationSummary.mapHash).toBe('map-hash');
    expect(session.map.authoritativeData).toBe(mapData);
    expect(session.map.authoritativeData.heightSamples).toBeInstanceOf(Uint16Array);
    expect(session.map.authoritativeData.heightSamples[0]).toBe(321);
    expect(session.gameplay.placedBuildings).toEqual([]);
    expect(session.gameplay.roads).toEqual([]);
  });

  it('wraps a world session in the versioned save envelope', () => {
    const world = createWorldSession(
      {
        sessionId: 'session-002',
        mapConfig: DEFAULT_MAP_CONFIG,
        mapSummary: createMapSummary(DEFAULT_MAP_CONFIG.seed),
        mapData: createMapData(),
      },
      1_753_000_000_001,
    );

    const saveGame = createSaveGame('save-002', world, 'Test World', 'manual');

    expect(saveGame).toEqual({
      format: SAVE_GAME_FORMAT,
      schemaVersion: SAVE_GAME_SCHEMA_VERSION,
      saveId: 'save-002',
      slotName: 'Test World',
      slotKind: 'manual',
      world,
    });
  });

  it('derives lightweight slot metadata without authoritative map arrays', () => {
    const world = createWorldSession(
      {
        sessionId: 'session-003',
        mapConfig: DEFAULT_MAP_CONFIG,
        mapSummary: createMapSummary(DEFAULT_MAP_CONFIG.seed),
        mapData: createMapData(),
      },
      1_753_000_000_002,
    );
    const metadata = createSaveSlotMetadata(
      createSaveGame('save-003', world, 'Test World', 'manual'),
    );

    expect(metadata).toEqual({
      saveId: 'save-003',
      schemaVersion: SAVE_GAME_SCHEMA_VERSION,
      slotName: 'Test World',
      slotKind: 'manual',
      createdAt: 1_753_000_000_002,
      updatedAt: 1_753_000_000_002,
      seed: DEFAULT_MAP_CONFIG.seed,
      preset: DEFAULT_MAP_CONFIG.preset,
      configHash: 'config-hash',
      mapIdentity: `1:${DEFAULT_MAP_CONFIG.seed}:config`,
      mapHash: 'map-hash',
    });
    expect(metadata).not.toHaveProperty('authoritativeData');
    expect(metadata).not.toHaveProperty('heightSamples');
  });

  it('preserves typed-array map data through structured cloning', () => {
    const mapData = createMapData();
    mapData.heightSamples[0] = 654;
    mapData.resourceIntensity['copper-ore'][0] = 23;

    const saveGame = createSaveGame(
      'save-004',
      createWorldSession(
        {
          sessionId: 'session-004',
          mapConfig: DEFAULT_MAP_CONFIG,
          mapSummary: createMapSummary(DEFAULT_MAP_CONFIG.seed),
          mapData,
        },
        1_753_000_000_003,
      ),
      'Test World',
      'manual',
    );
    const cloned = structuredClone(saveGame);

    expect(cloned).not.toBe(saveGame);
    expect(cloned.world.map.authoritativeData).not.toBe(mapData);
    expect(cloned.world.map.authoritativeData.heightSamples).toBeInstanceOf(Uint16Array);
    expect(Array.from(cloned.world.map.authoritativeData.heightSamples)).toEqual(
      Array.from(mapData.heightSamples),
    );
    expect(cloned.world.map.authoritativeData.resourceIntensity['copper-ore'][0]).toBe(23);
  });

  it('preserves placed building state through structured cloning', () => {
    const world = createWorldSession(
      {
        sessionId: 'session-005',
        mapConfig: DEFAULT_MAP_CONFIG,
        mapSummary: createMapSummary(DEFAULT_MAP_CONFIG.seed),
        mapData: createMapData(),
      },
      1_753_000_000_004,
    );
    const placedBuildings = [
      {
        id: 'future-structure-1',
        definitionId: 'future-structure',
        origin: { x: 12, y: 18 },
        rotationQuarterTurns: 1 as const,
      },
      {
        id: 'future-structure-2',
        definitionId: 'another-future-structure',
        origin: { x: 30, y: 40 },
        rotationQuarterTurns: 3 as const,
      },
    ];
    const roads = [{ cell: { x: 4, y: 5 } }, { cell: { x: 8, y: 9 } }];
    const saveGame = createSaveGame(
      'save-005',
      { ...world, gameplay: { ...world.gameplay, placedBuildings, roads } },
      'Placed Buildings',
      'manual',
    );

    const cloned = structuredClone(saveGame);

    expect(cloned.world.gameplay.placedBuildings).toEqual(placedBuildings);
    expect(cloned.world.gameplay.roads).toEqual(roads);
  });
});

function createMapData(): AuthoritativeMapData {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(2);
  }

  return {
    heightSamples: new Uint16Array(2),
    moisture: new Uint8Array(2),
    temperature: new Uint8Array(2),
    biome: new Uint8Array(2),
    waterKind: new Uint8Array(2),
    flags: new Uint8Array(2),
    landmassId: new Uint16Array(2),
    resourceProvinceId: new Uint16Array(2),
    resourceMask: new Uint8Array(2),
    resourceIntensity,
    deposits: [],
  };
}

function createMapSummary(seed: string): MapSummary {
  return {
    seed,
    configHash: 'config-hash',
    mapIdentity: `1:${seed}:config`,
    mapHash: 'map-hash',
    seaLevelSample: 30_000,
    riverCellCount: 10,
    regionCount: 2,
    buildableCellCount: 100,
    resourceProvinceCount: 3,
    resourceSourceCount: 4,
    startingCell: 5,
    startingBuildableCellCount: 80,
    startingStonePathCost: 10,
    startingTimberPathCost: 11,
    startingFertileLandPathCost: 12,
    startingIronPathCost: 13,
    startingCopperPathCost: 14,
    startingValidCandidateCount: 15,
    generationDurationMs: 100,
    estimatedFinalBytes: 200,
    estimatedPeakBytes: 300,
  };
}

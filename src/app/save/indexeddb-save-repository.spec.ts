import { AuthoritativeMapData, DEFAULT_MAP_CONFIG, MapSummary, RESOURCE_KINDS } from '../map/map-types';
import { createSaveGame, createWorldSession } from './save-contract';
import {
  IndexedDbSaveRepository,
  SAVE_DATABASE_NAME,
  SAVE_METADATA_STORE,
  SAVE_PAYLOAD_STORE,
} from './indexeddb-save-repository';

describe('IndexedDbSaveRepository', () => {
  it('stores metadata and payload transactionally while listing metadata only', async () => {
    const databaseName = `${SAVE_DATABASE_NAME}-repository-${crypto.randomUUID()}`;
    const repository = new IndexedDbSaveRepository(databaseName);
    const world = createWorldSession(
      {
        sessionId: 'repository-session',
        mapConfig: { ...DEFAULT_MAP_CONFIG, width: 2, height: 2 },
        mapSummary: createMapSummary(),
        mapData: createMapData(),
      },
      1_753_000_000_200,
    );
    const save = createSaveGame('repository-save', world, 'Repository World', 'manual');

    await repository.put(save);
    const metadata = await repository.listMetadata();
    const loaded = await repository.get(save.saveId);

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({ saveId: 'repository-save', slotName: 'Repository World' });
    expect(metadata[0]).not.toHaveProperty('authoritativeData');
    expect(loaded?.world.map.authoritativeData.heightSamples).toBeInstanceOf(Uint16Array);
    expect(loaded?.world.map.authoritativeData.heightSamples).not.toBe(
      world.map.authoritativeData.heightSamples,
    );

    await repository.delete(save.saveId);
    expect(await repository.get(save.saveId)).toBeNull();
    expect(await repository.listMetadata()).toEqual([]);
    await deleteDatabase(databaseName);
  });

  it('creates the expected object stores during database initialization', async () => {
    const databaseName = `${SAVE_DATABASE_NAME}-schema-${crypto.randomUUID()}`;
    const repository = new IndexedDbSaveRepository(databaseName);
    await repository.listMetadata();

    const stores = await readStoreNames(databaseName);

    expect(stores).toEqual(expect.arrayContaining([SAVE_METADATA_STORE, SAVE_PAYLOAD_STORE]));
    await deleteDatabase(databaseName);
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

function readStoreNames(databaseName: string): Promise<readonly string[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => {
      const database = request.result;
      const names = Array.from(database.objectStoreNames);
      database.close();
      resolve(names);
    };
    request.onerror = () => reject(request.error);
  });
}

function deleteDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

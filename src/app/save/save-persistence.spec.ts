import { AuthoritativeMapData, DEFAULT_MAP_CONFIG, MapSummary, RESOURCE_KINDS } from '../map/map-types';
import { createWorldSession } from './save-contract';
import { IndexedDbSaveRepository, SAVE_DATABASE_NAME } from './indexeddb-save-repository';
import { LastActiveSaveReference, LAST_ACTIVE_SAVE_STORAGE_KEY } from './last-active-save';
import { SaveNameConflictError, SavePersistenceService } from './save-persistence';

describe('SavePersistenceService', () => {
  beforeEach(() => {
    localStorage.removeItem(LAST_ACTIVE_SAVE_STORAGE_KEY);
  });

  it('keeps Autosave protected and tracks the latest active save', async () => {
    const databaseName = `${SAVE_DATABASE_NAME}-persistence-${crypto.randomUUID()}`;
    const service = new SavePersistenceService(
      new IndexedDbSaveRepository(databaseName),
      new LastActiveSaveReference(),
    );
    const world = createWorld();

    const autosave = await service.saveAutosave(world);
    const manual = await service.saveManual(world, 'First World');
    const saves = await service.listSaves();

    expect(autosave.slotName).toBe('Autosave');
    expect(autosave.slotKind).toBe('autosave');
    expect(manual.slotKind).toBe('manual');
    expect(saves.map((save) => save.slotName)).toEqual(['Autosave', 'First World']);
    expect(localStorage.getItem(LAST_ACTIVE_SAVE_STORAGE_KEY)).toBe(manual.saveId);

    await expect(service.saveManual(world, 'First World')).rejects.toBeInstanceOf(SaveNameConflictError);
    await expect(service.deleteManualSave(autosave.saveId)).rejects.toThrow('protected');

    await service.deleteManualSave(manual.saveId);
    expect(localStorage.getItem(LAST_ACTIVE_SAVE_STORAGE_KEY)).toBe('autosave');
    await deleteDatabase(databaseName);
  });

  it('imports a save as a fresh manual slot and exports it as JSON', async () => {
    const databaseName = `${SAVE_DATABASE_NAME}-import-${crypto.randomUUID()}`;
    const service = new SavePersistenceService(
      new IndexedDbSaveRepository(databaseName),
      new LastActiveSaveReference(),
    );
    const world = createWorld();
    const source = await service.saveAutosave(world);
    const exported = await service.exportSave(source.saveId);

    const imported = await service.importSave(exported.content, 'Imported World');

    expect(imported.saveId).not.toBe(source.saveId);
    expect(imported.slotName).toBe('Imported World');
    expect(imported.slotKind).toBe('manual');
    expect(imported.world.map.generationSummary.mapIdentity).toBe(
      world.map.generationSummary.mapIdentity,
    );
    await deleteDatabase(databaseName);
  });
});

function createWorld() {
  return createWorldSession(
    {
      sessionId: 'persistence-session',
      mapConfig: { ...DEFAULT_MAP_CONFIG, width: 2, height: 2 },
      mapSummary: createMapSummary(),
      mapData: createMapData(),
    },
    1_753_000_000_300,
  );
}

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

function deleteDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

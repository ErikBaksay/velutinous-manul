import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';
import {
  createSaveSlotMetadata,
  LEGACY_SAVE_GAME_SCHEMA_VERSION_V2,
  SaveGame,
  SaveSlotMetadata,
  SAVE_GAME_SCHEMA_VERSION,
} from './save-contract';
import { SaveValidationError, validateSaveGame } from './portable-save-codec';

export const SAVE_DATABASE_NAME = 'velutinous-manul-saves';
export const SAVE_DATABASE_VERSION = 1;
export const SAVE_METADATA_STORE = 'save-metadata';
export const SAVE_PAYLOAD_STORE = 'save-payload';
export const SAVE_DATABASE_NAME_TOKEN = new InjectionToken<string>('SAVE_DATABASE_NAME');

export class SaveStorageError extends Error {
  readonly code: 'storage-unavailable' | 'storage-operation-failed';

  constructor(
    code: 'storage-unavailable' | 'storage-operation-failed',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SaveStorageError';
    this.code = code;
  }
}

@Injectable({ providedIn: 'root' })
export class IndexedDbSaveRepository {
  private readonly databaseName: string;

  constructor(
    @Optional() @Inject(SAVE_DATABASE_NAME_TOKEN) databaseName: string | null = null,
  ) {
    this.databaseName = databaseName ?? SAVE_DATABASE_NAME;
  }

  listMetadata(): Promise<readonly SaveSlotMetadata[]> {
    return this.withDatabase((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction(SAVE_METADATA_STORE, 'readonly');
      const request = transaction.objectStore(SAVE_METADATA_STORE).getAll();
      let metadata: SaveSlotMetadata[] = [];

      request.onsuccess = () => {
        metadata = (request.result as unknown[]).map((value) => validateMetadata(value));
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => {
        resolve(metadata.sort(compareMetadata));
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  get(saveId: string): Promise<SaveGame | null> {
    return this.withDatabase((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction(SAVE_PAYLOAD_STORE, 'readonly');
      const request = transaction.objectStore(SAVE_PAYLOAD_STORE).get(saveId);
      let save: SaveGame | null = null;

      request.onsuccess = () => {
        if (request.result !== undefined) {
          save = validateSaveGame(request.result);
        }
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(save);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  put(saveGame: SaveGame): Promise<void> {
    const validatedSave = validateSaveGame(saveGame);
    const metadata = createSaveSlotMetadata(validatedSave);
    return this.withDatabase((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction(
        [SAVE_METADATA_STORE, SAVE_PAYLOAD_STORE],
        'readwrite',
      );
      transaction.objectStore(SAVE_METADATA_STORE).put(metadata);
      transaction.objectStore(SAVE_PAYLOAD_STORE).put(validatedSave);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  delete(saveId: string): Promise<void> {
    return this.withDatabase((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction(
        [SAVE_METADATA_STORE, SAVE_PAYLOAD_STORE],
        'readwrite',
      );
      transaction.objectStore(SAVE_METADATA_STORE).delete(saveId);
      transaction.objectStore(SAVE_PAYLOAD_STORE).delete(saveId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  private withDatabase<T>(operation: (database: IDBDatabase) => Promise<T>): Promise<T> {
    return this.openDatabase()
      .then((database) => operation(database).finally(() => database.close()))
      .catch((error: unknown) => {
        if (error instanceof SaveValidationError) {
          throw error;
        }
        throw new SaveStorageError(
          'storage-operation-failed',
          'The browser save storage operation failed.',
          { cause: error },
        );
      });
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new SaveStorageError(
        'storage-unavailable',
        'IndexedDB is unavailable in this browser.',
      ));
    }

    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(this.databaseName, SAVE_DATABASE_VERSION);
      } catch (error: unknown) {
        reject(new SaveStorageError(
          'storage-unavailable',
          'IndexedDB could not be opened in this browser.',
          { cause: error },
        ));
        return;
      }

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SAVE_METADATA_STORE)) {
          database.createObjectStore(SAVE_METADATA_STORE, { keyPath: 'saveId' });
        }
        if (!database.objectStoreNames.contains(SAVE_PAYLOAD_STORE)) {
          database.createObjectStore(SAVE_PAYLOAD_STORE, { keyPath: 'saveId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new SaveStorageError(
        'storage-unavailable',
        'IndexedDB could not be opened in this browser.',
        { cause: request.error },
      ));
      request.onblocked = () => reject(new SaveStorageError(
        'storage-unavailable',
        'IndexedDB is blocked by another browser tab.',
      ));
    });
  }
}

function validateMetadata(value: unknown): SaveSlotMetadata {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SaveValidationError('The stored save metadata is invalid.');
  }
  const raw = value as Record<string, unknown>;
  if ((raw['schemaVersion'] !== LEGACY_SAVE_GAME_SCHEMA_VERSION_V2 &&
       raw['schemaVersion'] !== SAVE_GAME_SCHEMA_VERSION) ||
      raw['slotKind'] !== 'manual' && raw['slotKind'] !== 'autosave') {
    throw new SaveValidationError('The stored save metadata uses an unsupported format.');
  }
  const strings = ['saveId', 'slotName', 'seed', 'configHash', 'mapIdentity', 'mapHash'];
  for (const key of strings) {
    if (typeof raw[key] !== 'string' || raw[key].trim().length === 0) {
      throw new SaveValidationError('The stored save metadata is invalid.');
    }
  }
  const timestamps = ['createdAt', 'updatedAt'];
  for (const key of timestamps) {
    if (typeof raw[key] !== 'number' || !Number.isInteger(raw[key]) || raw[key] <= 0) {
      throw new SaveValidationError('The stored save metadata timestamp is invalid.');
    }
  }
  if (raw['preset'] !== 'balanced-continental' && raw['preset'] !== 'riverlands' && raw['preset'] !== 'highland-frontier') {
    throw new SaveValidationError('The stored save metadata preset is invalid.');
  }
  return {
    ...(raw as unknown as SaveSlotMetadata),
    schemaVersion: SAVE_GAME_SCHEMA_VERSION,
  };
}

function compareMetadata(left: SaveSlotMetadata, right: SaveSlotMetadata): number {
  if (left.slotKind !== right.slotKind) {
    return left.slotKind === 'autosave' ? -1 : 1;
  }
  return right.updatedAt - left.updatedAt;
}

import { Injectable } from '@angular/core';
import {
  AUTOSAVE_ID,
  AUTOSAVE_NAME,
  createSaveGame,
  createUpdatedWorldSession,
  SaveGame,
  SaveSlotMetadata,
  WorldSession,
} from './save-contract';
import { IndexedDbSaveRepository } from './indexeddb-save-repository';
import { LastActiveSaveReference } from './last-active-save';
import {
  parsePortableSaveFile,
  serializeSaveGame,
} from './portable-save-codec';

export const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1_000;

export class SaveNameConflictError extends Error {
  readonly code = 'save-name-conflict' as const;
  readonly existing: SaveSlotMetadata;

  constructor(existing: SaveSlotMetadata) {
    super(`A save named “${existing.slotName}” already exists.`);
    this.name = 'SaveNameConflictError';
    this.existing = existing;
  }
}

export class SaveActionError extends Error {
  readonly code = 'save-action-failed' as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SaveActionError';
  }
}

@Injectable({ providedIn: 'root' })
export class SavePersistenceService {
  constructor(
    private readonly repository: IndexedDbSaveRepository,
    private readonly lastActive: LastActiveSaveReference,
  ) {}

  listSaves(): Promise<readonly SaveSlotMetadata[]> {
    return this.repository.listMetadata();
  }

  async loadSave(saveId: string): Promise<SaveGame | null> {
    const save = await this.repository.get(saveId);
    if (save) {
      this.lastActive.set(save.saveId);
    }
    return save;
  }

  async loadLastActiveSave(): Promise<SaveGame | null> {
    const saveId = this.lastActive.get();
    if (!saveId) {
      return null;
    }
    const save = await this.repository.get(saveId);
    if (!save) {
      const autosave = await this.repository.get(AUTOSAVE_ID);
      if (autosave) {
        this.lastActive.set(AUTOSAVE_ID);
        return autosave;
      }
      this.lastActive.clear();
      return null;
    }
    return save;
  }

  async saveManual(
    world: WorldSession,
    slotName: string,
    overwriteSaveId?: string,
  ): Promise<SaveGame> {
    const normalizedName = normalizeManualSaveName(slotName);
    const metadata = await this.repository.listMetadata();
    const existing = metadata.find((item) =>
      item.slotKind === 'manual' && item.slotName.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
    );
    if (existing && existing.saveId !== overwriteSaveId) {
      throw new SaveNameConflictError(existing);
    }
    if (overwriteSaveId && (!existing || existing.saveId !== overwriteSaveId)) {
      throw new SaveActionError('The selected save could not be overwritten.');
    }

    const save = createSaveGame(
      overwriteSaveId ?? createSaveId(),
      createUpdatedWorldSession(world),
      normalizedName,
      'manual',
    );
    await this.repository.put(save);
    this.lastActive.set(save.saveId);
    return save;
  }

  async saveAutosave(world: WorldSession): Promise<SaveGame> {
    const save = createSaveGame(
      AUTOSAVE_ID,
      createUpdatedWorldSession(world),
      AUTOSAVE_NAME,
      'autosave',
    );
    await this.repository.put(save);
    this.lastActive.set(save.saveId);
    return save;
  }

  async deleteManualSave(saveId: string): Promise<void> {
    const metadata = await this.repository.listMetadata();
    const target = metadata.find((item) => item.saveId === saveId);
    if (!target) {
      return;
    }
    if (target.slotKind === 'autosave') {
      throw new SaveActionError('Autosave is protected and cannot be deleted.');
    }
    await this.repository.delete(saveId);
    if (this.lastActive.get() === saveId) {
      const autosave = await this.repository.get(AUTOSAVE_ID);
      if (autosave) {
        this.lastActive.set(AUTOSAVE_ID);
      } else {
        this.lastActive.clear();
      }
    }
  }

  async exportSave(saveId: string): Promise<{ content: string; fileName: string }> {
    const save = await this.repository.get(saveId);
    if (!save) {
      throw new SaveActionError('The selected save is no longer available.');
    }
    return {
      content: serializeSaveGame(save),
      fileName: createExportFileName(save.slotName),
    };
  }

  async importSave(content: string, slotNameOverride?: string): Promise<SaveGame> {
    const parsed = parsePortableSaveFile(content);
    const importedName = parsed.slotKind === 'autosave'
      ? `${parsed.slotName} (Imported)`
      : parsed.slotName;
    const slotName = normalizeManualSaveName(slotNameOverride ?? importedName);
    const metadata = await this.repository.listMetadata();
    const existing = metadata.find((item) =>
      item.slotName.toLocaleLowerCase() === slotName.toLocaleLowerCase(),
    );
    if (existing) {
      throw new SaveNameConflictError(existing);
    }
    const save = createSaveGame(
      createSaveId(),
      createUpdatedWorldSession(parsed.world),
      slotName,
      'manual',
    );
    await this.repository.put(save);
    this.lastActive.set(save.saveId);
    return save;
  }

  isReservedSlotName(slotName: string): boolean {
    return slotName.trim().toLocaleLowerCase() === AUTOSAVE_NAME.toLocaleLowerCase();
  }

}

function normalizeManualSaveName(value: string): string {
  const name = value.trim();
  if (name.length === 0) {
    throw new SaveActionError('Save names cannot be empty.');
  }
  if (name.length > 80) {
    throw new SaveActionError('Save names must be 80 characters or fewer.');
  }
  if (name.toLocaleLowerCase() === AUTOSAVE_NAME.toLocaleLowerCase()) {
    throw new SaveActionError('The name Autosave is reserved for automatic recovery.');
  }
  return name;
}

function createSaveId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createExportFileName(slotName: string): string {
  const safeName = slotName
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLocaleLowerCase() || 'world';
  return `velutinous-manul-${safeName}.json`;
}

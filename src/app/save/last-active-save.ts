import { Injectable } from '@angular/core';

export const LAST_ACTIVE_SAVE_STORAGE_KEY = 'velutinous-manul:last-active-save-id';

export class LastActiveSaveStorageError extends Error {
  readonly code = 'local-storage-unavailable' as const;

  constructor() {
    super('Local storage is unavailable in this browser.');
    this.name = 'LastActiveSaveStorageError';
  }
}

@Injectable({ providedIn: 'root' })
export class LastActiveSaveReference {
  get(): string | null {
    try {
      return typeof localStorage === 'undefined'
        ? null
        : localStorage.getItem(LAST_ACTIVE_SAVE_STORAGE_KEY);
    } catch {
      throw new LastActiveSaveStorageError();
    }
  }

  set(saveId: string): void {
    try {
      if (typeof localStorage === 'undefined') {
        throw new LastActiveSaveStorageError();
      }
      localStorage.setItem(LAST_ACTIVE_SAVE_STORAGE_KEY, saveId);
    } catch (error: unknown) {
      if (error instanceof LastActiveSaveStorageError) {
        throw error;
      }
      throw new LastActiveSaveStorageError();
    }
  }

  clear(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.removeItem(LAST_ACTIVE_SAVE_STORAGE_KEY);
    } catch {
      throw new LastActiveSaveStorageError();
    }
  }
}

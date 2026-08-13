import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { getRuntimeQueryParams } from './runtime-query';
import { SaveSlotMetadata } from './save/save-contract';
import {
  SaveActionError,
  SaveNameConflictError,
  SavePersistenceService,
} from './save/save-persistence';
import { WorldSessionRuntime } from './session-runtime';

export type LoadSaveReason =
  | 'missing-last-active'
  | 'session-unavailable'
  | 'storage-unavailable'
  | 'save-unavailable'
  | null;

@Component({
  selector: 'app-load-save',
  standalone: true,
  template: `
    <main class="save-screen" aria-labelledby="save-title">
      <section class="save-card">
        <p class="eyebrow">VELUTINOUS MANUL</p>
        <h1 id="save-title">Load Save</h1>
        @if (reason === 'missing-last-active') {
          <p class="message" role="alert">
            There is no last active save to continue. Create a new world to begin.
          </p>
        } @else if (reason === 'session-unavailable') {
          <p class="message" role="alert">
            This world session is no longer available. Load a saved world to continue.
          </p>
        } @else if (reason === 'storage-unavailable') {
          <p class="message" role="alert">
            Local save storage is unavailable in this browser. You can still try importing a portable save.
          </p>
        } @else if (reason === 'save-unavailable') {
          <p class="message" role="alert">
            The last active save could not be opened. Choose another world or import a backup.
          </p>
        } @else {
          <p class="message">Choose a local world or import a portable backup.</p>
        }

        @if (storageError) {
          <p class="error-message" role="alert">{{ storageError }}</p>
        }
        @if (actionMessage) {
          <p class="success-message" role="status">{{ actionMessage }}</p>
        }
        @if (actionError) {
          <p class="error-message" role="alert">{{ actionError }}</p>
        }

        <div class="save-toolbar">
          <button type="button" (click)="openImportPicker()" [disabled]="isBusy">
            Import Save
          </button>
          <input
            #importInput
            class="visually-hidden"
            type="file"
            accept="application/json,.json"
            (change)="importFile($event)"
          />
        </div>

        @if (pendingImportContent) {
          <section class="import-prompt" aria-labelledby="import-title">
            <h2 id="import-title">Choose an import name</h2>
            <p>The imported save name already exists. Enter a new name; no existing save will be overwritten.</p>
            <label>
              New save name
              <input
                type="text"
                [value]="pendingImportName"
                (input)="pendingImportName = readInputValue($event)"
                maxlength="80"
                autofocus
              />
            </label>
            <div class="prompt-actions">
              <button type="button" (click)="confirmImportName()" [disabled]="isBusy">Import</button>
              <button class="secondary-action" type="button" (click)="cancelImportName()">Cancel</button>
            </div>
          </section>
        }

        <section class="save-list" aria-label="Saved worlds">
          @if (saves.length === 0) {
            <div class="empty-state" role="status">
              <span class="empty-mark" aria-hidden="true">○</span>
              <strong>No saved worlds</strong>
              <span>{{ isLoading ? 'Checking this device…' : 'There is nothing to load on this device.' }}</span>
            </div>
          } @else {
            @for (save of saves; track save.saveId) {
              <article class="save-row" [class.is-autosave]="save.slotKind === 'autosave'">
                <div class="save-row-copy">
                  <div class="save-row-title">
                    <strong>{{ save.slotName }}</strong>
                    @if (save.slotKind === 'autosave') {
                      <span class="slot-badge">AUTOSAVE</span>
                    }
                  </div>
                  <span>{{ save.preset }} · {{ save.seed }}</span>
                  <small>Updated {{ formatDate(save.updatedAt) }}</small>
                </div>
                <div class="save-row-actions">
                  <button type="button" (click)="loadSlot(save)" [disabled]="isBusy">Load</button>
                  <button type="button" (click)="exportSlot(save)" [disabled]="isBusy">Export</button>
                  @if (save.slotKind === 'manual') {
                    <button class="danger-action" type="button" (click)="deleteSlot(save)" [disabled]="isBusy">Delete</button>
                  }
                </div>
              </article>
            }
          }
        </section>

        <div class="actions">
          <button type="button" (click)="newWorld()">New World <span aria-hidden="true">→</span></button>
          <button class="secondary-action" type="button" (click)="backToStart()">Back to Start</button>
        </div>
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .save-screen {
        display: grid;
        place-items: center;
        width: 100%;
        min-height: 100%;
        box-sizing: border-box;
        padding: 24px;
        color: #f4eadc;
        background: linear-gradient(145deg, #222a31, #4c5f5d 62%, #283c3f);
      }

      .save-card {
        width: min(660px, 100%);
        max-height: calc(100vh - 48px);
        overflow: auto;
        padding: clamp(30px, 5vw, 54px);
        box-sizing: border-box;
        background: rgba(25, 29, 33, 0.9);
        border: 1px solid rgba(225, 177, 126, 0.3);
        border-radius: 20px;
        box-shadow: 0 28px 70px rgba(14, 17, 21, 0.4);
      }

      .eyebrow {
        margin: 0 0 16px;
        color: #d8a06f;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.16em;
      }

      h1 {
        margin: 0 0 14px;
        color: #fff3e4;
        font-size: 34px;
        font-weight: 650;
        letter-spacing: -0.04em;
      }

      h2 {
        margin: 0 0 8px;
        color: #f5e8d9;
        font-size: 15px;
      }

      .message,
      .error-message,
      .success-message {
        margin: 0 auto 12px;
        max-width: 60ch;
        color: #c9c1b8;
        font-size: 13px;
        line-height: 1.55;
      }

      .error-message {
        color: #efb29c;
      }

      .success-message {
        color: #b8d7a7;
      }

      .save-toolbar {
        display: flex;
        justify-content: flex-end;
        margin: 20px 0 12px;
      }

      .save-toolbar button,
      .save-row-actions button,
      .prompt-actions button {
        padding: 9px 12px;
        color: #fff3e4;
        background: rgba(186, 111, 69, 0.72);
        border: 1px solid rgba(242, 184, 126, 0.58);
        border-radius: 8px;
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        font-weight: 650;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.55;
      }

      .save-list {
        display: grid;
        gap: 8px;
        margin: 20px 0 28px;
      }

      .empty-state {
        display: grid;
        gap: 6px;
        padding: 28px 20px;
        color: #a9a097;
        background: rgba(255, 247, 237, 0.05);
        border: 1px solid rgba(247, 232, 214, 0.1);
        border-radius: 12px;
        font-size: 11px;
        text-align: center;
      }

      .empty-state strong {
        color: #f1e1d0;
        font-size: 14px;
        font-weight: 600;
      }

      .empty-mark {
        color: #d8a06f;
        font-size: 30px;
        line-height: 1;
      }

      .save-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px;
        background: rgba(255, 247, 237, 0.05);
        border: 1px solid rgba(247, 232, 214, 0.1);
        border-radius: 11px;
      }

      .save-row.is-autosave {
        border-color: rgba(225, 177, 126, 0.38);
        background: rgba(186, 111, 69, 0.1);
      }

      .save-row-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
        color: #b9b0a7;
        font-size: 11px;
      }

      .save-row-copy > span,
      .save-row-copy small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .save-row-copy small {
        color: #8f8983;
      }

      .save-row-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .save-row-title strong {
        overflow: hidden;
        color: #f1e1d0;
        font-size: 14px;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .slot-badge {
        flex: 0 0 auto;
        padding: 3px 5px;
        color: #f6d4ae;
        border: 1px solid rgba(242, 184, 126, 0.42);
        border-radius: 4px;
        font-size: 8px;
        letter-spacing: 0.08em;
      }

      .save-row-actions {
        display: flex;
        flex: 0 0 auto;
        gap: 6px;
      }

      .save-row-actions .danger-action {
        color: #efb29c;
        background: transparent;
        border-color: rgba(239, 178, 156, 0.32);
      }

      .import-prompt {
        display: grid;
        gap: 10px;
        margin: 18px 0;
        padding: 16px;
        color: #c9c1b8;
        background: rgba(216, 160, 111, 0.1);
        border: 1px solid rgba(225, 177, 126, 0.3);
        border-radius: 10px;
        font-size: 12px;
        line-height: 1.45;
      }

      .import-prompt p {
        margin: 0;
      }

      .import-prompt label {
        display: grid;
        gap: 5px;
        color: #a9a097;
        font-size: 10px;
      }

      .import-prompt input {
        padding: 9px 10px;
        color: #f7ecdf;
        background: rgba(255, 247, 237, 0.07);
        border: 1px solid rgba(247, 232, 214, 0.16);
        border-radius: 7px;
        font: inherit;
        font-size: 12px;
      }

      .prompt-actions {
        display: flex;
        gap: 7px;
      }

      .secondary-action {
        color: #c9c1b8 !important;
        background: transparent !important;
        border-color: rgba(247, 232, 214, 0.14) !important;
      }

      .actions {
        display: grid;
        gap: 9px;
      }

      .actions button {
        padding: 13px 16px;
        color: #fff3e4;
        background: linear-gradient(100deg, rgba(186, 111, 69, 0.72), rgba(128, 78, 55, 0.72));
        border: 1px solid rgba(242, 184, 126, 0.58);
        border-radius: 9px;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 650;
      }

      button:focus-visible,
      input:focus-visible {
        outline: 2px solid #f0c08c;
        outline-offset: 3px;
      }

      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class LoadSave implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly persistence = inject(SavePersistenceService);
  private readonly sessionRuntime = inject(WorldSessionRuntime);

  readonly reason: LoadSaveReason = getLoadSaveReason(
    this.route.snapshot.queryParamMap.get('reason'),
  );
  saves: readonly SaveSlotMetadata[] = [];
  isLoading = true;
  isBusy = false;
  storageError: string | null = null;
  actionError: string | null = null;
  actionMessage: string | null = null;
  pendingImportContent: string | null = null;
  pendingImportName = '';

  ngOnInit(): void {
    void this.refreshSaves();
  }

  openImportPicker(): void {
    document.querySelector<HTMLInputElement>('input[type="file"]')?.click();
  }

  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.clearFeedback();
    this.isBusy = true;
    try {
      await this.persistence.importSave(await file.text());
      this.actionMessage = 'Save imported successfully.';
      await this.refreshSaves();
    } catch (error: unknown) {
      if (error instanceof SaveNameConflictError) {
        this.pendingImportContent = await file.text();
        this.pendingImportName = `${error.existing.slotName} (Imported)`;
      } else {
        this.actionError = getSaveErrorMessage(error);
      }
    } finally {
      this.isBusy = false;
    }
  }

  async confirmImportName(): Promise<void> {
    if (!this.pendingImportContent) {
      return;
    }
    this.clearFeedback();
    this.isBusy = true;
    try {
      await this.persistence.importSave(this.pendingImportContent, this.pendingImportName);
      this.pendingImportContent = null;
      this.pendingImportName = '';
      this.actionMessage = 'Save imported successfully.';
      await this.refreshSaves();
    } catch (error: unknown) {
      this.actionError = getSaveErrorMessage(error);
    } finally {
      this.isBusy = false;
    }
  }

  cancelImportName(): void {
    this.pendingImportContent = null;
    this.pendingImportName = '';
  }

  async loadSlot(slot: SaveSlotMetadata): Promise<void> {
    this.clearFeedback();
    this.isBusy = true;
    try {
      const save = await this.persistence.loadSave(slot.saveId);
      if (!save) {
        this.actionError = 'This save is no longer available.';
        await this.refreshSaves();
        return;
      }
      this.sessionRuntime.setActiveWorld(save.world);
      await this.router.navigate(['/world'], { queryParams: getRuntimeQueryParams() });
    } catch (error: unknown) {
      this.actionError = getSaveErrorMessage(error);
    } finally {
      this.isBusy = false;
    }
  }

  async exportSlot(slot: SaveSlotMetadata): Promise<void> {
    this.clearFeedback();
    this.isBusy = true;
    try {
      const exported = await this.persistence.exportSave(slot.saveId);
      downloadTextFile(exported.content, exported.fileName);
      this.actionMessage = `Exported ${slot.slotName}.`;
    } catch (error: unknown) {
      this.actionError = getSaveErrorMessage(error);
    } finally {
      this.isBusy = false;
    }
  }

  async deleteSlot(slot: SaveSlotMetadata): Promise<void> {
    if (slot.slotKind === 'autosave' || !window.confirm(`Delete “${slot.slotName}”?`)) {
      return;
    }
    this.clearFeedback();
    this.isBusy = true;
    try {
      await this.persistence.deleteManualSave(slot.saveId);
      this.actionMessage = `Deleted ${slot.slotName}.`;
      await this.refreshSaves();
    } catch (error: unknown) {
      this.actionError = getSaveErrorMessage(error);
    } finally {
      this.isBusy = false;
    }
  }

  newWorld(): void {
    void this.router.navigate(['/new-world'], { queryParams: getRuntimeQueryParams() });
  }

  backToStart(): void {
    void this.router.navigate(['/'], { queryParams: getRuntimeQueryParams() });
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  readInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private async refreshSaves(): Promise<void> {
    this.isLoading = true;
    try {
      this.saves = await this.persistence.listSaves();
      this.storageError = null;
    } catch (error: unknown) {
      this.saves = [];
      this.storageError = getSaveErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }

  private clearFeedback(): void {
    this.actionError = null;
    this.actionMessage = null;
  }
}

function getLoadSaveReason(value: string | null): LoadSaveReason {
  return value === 'missing-last-active' ||
    value === 'session-unavailable' ||
    value === 'storage-unavailable' ||
    value === 'save-unavailable'
    ? value
    : null;
}

function getSaveErrorMessage(error: unknown): string {
  if (error instanceof SaveActionError || error instanceof SaveNameConflictError) {
    return error.message;
  }
  return 'The save operation could not be completed. Try again or use a portable backup.';
}

function downloadTextFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

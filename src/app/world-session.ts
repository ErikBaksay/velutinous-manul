import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import type { WorldSession as WorldSessionData } from './save/save-contract';
import { getRuntimeQueryParams } from './runtime-query';
import {
  SaveActionError,
  SaveNameConflictError,
  SavePersistenceService,
  AUTOSAVE_INTERVAL_MS,
} from './save/save-persistence';
import { WorldSessionRuntime } from './session-runtime';

@Component({
  selector: 'app-world-session',
  standalone: true,
  template: `
    <main #sceneFrame class="world-frame" aria-label="Velutinous Manul world session">
      <canvas #gameCanvas tabindex="0" aria-label="Interactive world camera"></canvas>

      <section class="world-hud" aria-labelledby="world-title">
        <p class="eyebrow">VELUTINOUS MANUL</p>
        <h1 id="world-title">World Session</h1>
        @if (world) {
          <p
            class="world-identity"
            data-testid="world-map-identity"
            [attr.data-starting-cell]="world.map.generationSummary.startingCell"
          >{{ world.map.generationSummary.mapIdentity }}</p>
        }
        <p class="save-note" [class.is-error]="saveError" role="status">
          {{ saveError ?? saveMessage }}
        </p>
        @if (sceneError) {
          <p class="scene-error" role="alert">{{ sceneError }}</p>
        }

        @if (showSaveDialog) {
          <section class="save-dialog" aria-labelledby="save-dialog-title">
            <h2 id="save-dialog-title">Save World</h2>
            <label>
              Save name
              <input
                type="text"
                [value]="manualSaveName"
                (input)="manualSaveName = readInputValue($event)"
                maxlength="80"
                autofocus
              />
            </label>
            <div class="dialog-actions">
              <button type="button" (click)="saveManual()" [disabled]="isSaving">Save</button>
              <button class="secondary-action" type="button" (click)="closeSaveDialog()" [disabled]="isSaving">Cancel</button>
            </div>
          </section>
        }

        @if (!showSaveDialog) {
          <button type="button" (click)="openSaveDialog()">Save World</button>
        }
        <button class="secondary-action" type="button" (click)="leaveWorld()" [disabled]="isLeaving">
          {{ isLeaving ? 'Saving…' : 'Leave World' }}
        </button>
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

      .world-frame {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #262b34;
      }

      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }

      canvas:focus-visible {
        outline: 2px solid rgba(224, 164, 112, 0.8);
        outline-offset: -2px;
      }

      .world-hud {
        position: absolute;
        top: 24px;
        right: 24px;
        width: min(300px, calc(100vw - 48px));
        padding: 20px;
        box-sizing: border-box;
        color: #f4eadc;
        background: rgba(24, 29, 34, 0.86);
        border: 1px solid rgba(225, 177, 126, 0.3);
        border-radius: 14px;
        box-shadow: 0 16px 38px rgba(14, 17, 21, 0.32);
        backdrop-filter: blur(13px);
      }

      .eyebrow {
        margin: 0 0 10px;
        color: #d8a06f;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.14em;
      }

      h1 {
        margin: 0 0 8px;
        color: #fff3e4;
        font-size: 22px;
        font-weight: 650;
        letter-spacing: -0.03em;
      }

      h2 {
        margin: 0;
        color: #f5e8d9;
        font-size: 15px;
      }

      .world-identity {
        margin: 0;
        color: #e0b487;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        overflow-wrap: anywhere;
      }

      .save-note {
        min-height: 30px;
        margin: 14px 0 0;
        color: #b9b0a7;
        font-size: 11px;
        line-height: 1.45;
      }

      .save-note.is-error {
        color: #efb29c;
      }

      .scene-error {
        margin: 10px 0 0;
        color: #efb29c;
        font-size: 11px;
        line-height: 1.45;
      }

      .world-hud > button,
      .dialog-actions button {
        width: 100%;
        margin-top: 10px;
        padding: 11px 14px;
        color: #fff3e4;
        background: rgba(186, 111, 69, 0.72);
        border: 1px solid rgba(242, 184, 126, 0.58);
        border-radius: 8px;
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        font-weight: 650;
      }

      .world-hud > button:disabled,
      .dialog-actions button:disabled {
        cursor: wait;
        opacity: 0.55;
      }

      .secondary-action {
        color: #c9c1b8 !important;
        background: transparent !important;
        border-color: rgba(247, 232, 214, 0.14) !important;
      }

      .save-dialog {
        display: grid;
        gap: 10px;
        margin-top: 14px;
        padding: 14px;
        background: rgba(216, 160, 111, 0.1);
        border: 1px solid rgba(225, 177, 126, 0.3);
        border-radius: 10px;
      }

      .save-dialog label {
        display: grid;
        gap: 5px;
        color: #a9a097;
        font-size: 10px;
      }

      .save-dialog input {
        padding: 9px 10px;
        color: #f7ecdf;
        background: rgba(255, 247, 237, 0.07);
        border: 1px solid rgba(247, 232, 214, 0.16);
        border-radius: 7px;
        font: inherit;
        font-size: 12px;
      }

      .dialog-actions {
        display: grid;
        gap: 6px;
      }

      button:focus-visible,
      input:focus-visible {
        outline: 2px solid #f0c08c;
        outline-offset: 3px;
      }
    `,
  ],
})
export class WorldSession implements AfterViewInit, OnDestroy {
  @ViewChild('sceneFrame', { static: true })
  private readonly sceneFrame!: ElementRef<HTMLElement>;

  @ViewChild('gameCanvas', { static: true })
  private readonly gameCanvas!: ElementRef<HTMLCanvasElement>;

  private readonly router = inject(Router);
  private readonly sessionRuntime = inject(WorldSessionRuntime);
  private readonly persistence = inject(SavePersistenceService);
  private gameScene: import('./game-scene').GameScene | null = null;
  private isDestroyed = false;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private autosavePromise: Promise<boolean> | null = null;
  world: WorldSessionData | null = this.sessionRuntime.getActiveWorld();
  sceneError: string | null = null;
  saveError: string | null = null;
  saveMessage = 'Autosave is preparing…';
  showSaveDialog = false;
  manualSaveName = '';
  isSaving = false;
  isLeaving = false;

  ngAfterViewInit(): void {
    if (!this.world) {
      void this.router.navigate(['/load-save'], {
        queryParams: { reason: 'session-unavailable' },
      });
      return;
    }

    void this.performAutosave();
    this.autosaveTimer = setInterval(() => {
      void this.performAutosave();
    }, AUTOSAVE_INTERVAL_MS);

    void import('./game-scene')
      .then(({ GameScene }) => {
        if (this.isDestroyed || !this.world) {
          return;
        }
        this.gameScene = new GameScene(
          this.gameCanvas.nativeElement,
          this.sceneFrame.nativeElement,
        );
        this.gameScene.setNavigationEnabled(false);
        return this.gameScene.setMapData(
          this.world.map.authoritativeData,
          this.world.map.generationSummary.seaLevelSample,
          this.world.map.generationSummary.startingCell,
        );
      })
      .then(() => {
        if (!this.isDestroyed) {
          this.gameScene?.setNavigationEnabled(true);
        }
      })
      .catch((error: unknown) => {
        if (this.isDestroyed) {
          return;
        }
        this.sceneError = 'The world session could not be prepared in this browser.';
        console.error('[world session] initialization failed', error);
      });
  }

  openSaveDialog(): void {
    this.saveError = null;
    this.showSaveDialog = true;
    this.manualSaveName = `World — ${this.world?.map.configuration.seed ?? 'New World'}`;
  }

  closeSaveDialog(): void {
    if (!this.isSaving) {
      this.showSaveDialog = false;
    }
  }

  async saveManual(): Promise<void> {
    if (!this.world || this.isSaving) {
      return;
    }
    this.isSaving = true;
    this.saveError = null;
    try {
      let saved;
      try {
        saved = await this.persistence.saveManual(this.world, this.manualSaveName);
      } catch (error: unknown) {
        if (!(error instanceof SaveNameConflictError) ||
          !window.confirm(`Overwrite “${error.existing.slotName}”?`)) {
          throw error;
        }
        saved = await this.persistence.saveManual(
          this.world,
          this.manualSaveName,
          error.existing.saveId,
        );
      }
      this.world = saved.world;
      this.sessionRuntime.setActiveWorld(saved.world);
      this.saveMessage = `Saved ${saved.slotName}. Autosave remains active.`;
      this.showSaveDialog = false;
    } catch (error: unknown) {
      this.saveError = getSaveErrorMessage(error, MANUAL_SAVE_FALLBACK);
    } finally {
      this.isSaving = false;
    }
  }

  readInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  async leaveWorld(): Promise<void> {
    if (this.isLeaving) {
      return;
    }
    this.isLeaving = true;
    const autosaved = await this.performAutosave();
    if (!autosaved) {
      this.isLeaving = false;
      return;
    }
    this.stopAutosaveTimer();
    this.sessionRuntime.clearActiveWorld();
    await this.router.navigate(['/'], { queryParams: getRuntimeQueryParams() });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.stopAutosaveTimer();
    this.sessionRuntime.clearActiveWorld();
    this.gameScene?.destroy();
  }

  private performAutosave(): Promise<boolean> {
    if (!this.world) {
      return Promise.resolve(false);
    }
    if (this.autosavePromise) {
      return this.autosavePromise;
    }
    this.autosavePromise = this.writeAutosave().finally(() => {
      this.autosavePromise = null;
    });
    return this.autosavePromise;
  }

  private async writeAutosave(): Promise<boolean> {
    if (!this.world) {
      return false;
    }
    this.isSaving = true;
    try {
      const saved = await this.persistence.saveAutosave(this.world);
      this.world = saved.world;
      this.sessionRuntime.setActiveWorld(saved.world);
      this.saveError = null;
      this.saveMessage = `Autosaved at ${new Date(saved.world.updatedAt).toLocaleTimeString()}.`;
      return true;
    } catch (error: unknown) {
      this.saveError = getSaveErrorMessage(error, AUTOSAVE_FALLBACK);
      return false;
    } finally {
      this.isSaving = false;
    }
  }

  private stopAutosaveTimer(): void {
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }
}

const MANUAL_SAVE_FALLBACK =
  'Manual save could not be completed. Your world remains in memory; try again or create a portable backup.';
const AUTOSAVE_FALLBACK =
  'Autosave could not be completed. Your world remains in memory; try again or create a portable backup.';

function getSaveErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof SaveActionError || error instanceof SaveNameConflictError) {
    return error.message;
  }
  return fallbackMessage;
}

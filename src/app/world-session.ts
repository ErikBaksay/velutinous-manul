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
        <p class="unsaved-note">
          Unsaved session. Leaving or reloading this page will discard this world until local saving is implemented.
        </p>
        @if (sceneError) {
          <p class="scene-error" role="alert">{{ sceneError }}</p>
        }
        <button type="button" (click)="leaveWorld()">Leave World</button>
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
        width: min(280px, calc(100vw - 48px));
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

      .world-identity {
        margin: 0;
        color: #e0b487;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        overflow-wrap: anywhere;
      }

      .unsaved-note,
      .scene-error {
        margin: 14px 0 0;
        color: #b9b0a7;
        font-size: 11px;
        line-height: 1.45;
      }

      .scene-error {
        color: #efb29c;
      }

      .world-hud button {
        width: 100%;
        margin-top: 18px;
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

      .world-hud button:focus-visible {
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
  private gameScene: import('./game-scene').GameScene | null = null;
  private isDestroyed = false;
  world: WorldSessionData | null = this.sessionRuntime.getActiveWorld();
  sceneError: string | null = null;

  ngAfterViewInit(): void {
    if (!this.world) {
      void this.router.navigate(['/load-save'], {
        queryParams: { reason: 'session-unavailable' },
      });
      return;
    }

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

  leaveWorld(): void {
    this.sessionRuntime.clearActiveWorld();
    void this.router.navigate(['/'], { queryParams: getRuntimeQueryParams() });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.sessionRuntime.clearActiveWorld();
    this.gameScene?.destroy();
  }
}

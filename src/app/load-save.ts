import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { getRuntimeQueryParams } from './runtime-query';

export type LoadSaveReason = 'missing-last-active' | 'session-unavailable' | null;

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
            This world session is no longer available. Unsaved sessions are cleared when the page is reloaded.
          </p>
        } @else {
          <p class="message">
            No saved worlds are available yet. Local save storage and portable import/export will arrive in a later milestone.
          </p>
        }

        <div class="empty-state" role="status">
          <span class="empty-mark" aria-hidden="true">○</span>
          <strong>No saved worlds</strong>
          <span>There is nothing to load on this device.</span>
        </div>

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
        height: 100%;
        box-sizing: border-box;
        padding: 24px;
        color: #f4eadc;
        background: linear-gradient(145deg, #222a31, #4c5f5d 62%, #283c3f);
      }

      .save-card {
        width: min(500px, 100%);
        padding: clamp(30px, 6vw, 54px);
        box-sizing: border-box;
        background: rgba(25, 29, 33, 0.88);
        border: 1px solid rgba(225, 177, 126, 0.3);
        border-radius: 20px;
        box-shadow: 0 28px 70px rgba(14, 17, 21, 0.4);
        text-align: center;
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

      .message {
        margin: 0 auto;
        max-width: 44ch;
        color: #c9c1b8;
        font-size: 13px;
        line-height: 1.55;
      }

      .empty-state {
        display: grid;
        gap: 6px;
        margin: 28px 0;
        padding: 28px 20px;
        color: #a9a097;
        background: rgba(255, 247, 237, 0.05);
        border: 1px solid rgba(247, 232, 214, 0.1);
        border-radius: 12px;
        font-size: 11px;
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

      .actions .secondary-action {
        color: #c9c1b8;
        background: transparent;
        border-color: rgba(247, 232, 214, 0.14);
      }

      .actions button:focus-visible {
        outline: 2px solid #f0c08c;
        outline-offset: 3px;
      }
    `,
  ],
})
export class LoadSave {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly reason: LoadSaveReason = getLoadSaveReason(
    this.route.snapshot.queryParamMap.get('reason'),
  );

  newWorld(): void {
    void this.router.navigate(['/new-world'], { queryParams: getRuntimeQueryParams() });
  }

  backToStart(): void {
    void this.router.navigate(['/'], { queryParams: getRuntimeQueryParams() });
  }
}

function getLoadSaveReason(value: string | null): LoadSaveReason {
  return value === 'missing-last-active' || value === 'session-unavailable' ? value : null;
}

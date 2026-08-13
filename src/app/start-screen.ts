import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { getRuntimeQueryParams } from './runtime-query';

@Component({
  selector: 'app-start-screen',
  standalone: true,
  template: `
    <main class="start-screen" aria-labelledby="start-title">
      <section class="start-card">
        <p class="eyebrow">VELUTINOUS MANUL</p>
        <h1 id="start-title">Build a beautiful industrial region.</h1>
        <p class="intro">
          Shape a world, explore its starting area, and grow a connected economy from the landscape.
        </p>

        <div class="entry-actions" aria-label="Game entry actions">
          <button type="button" (click)="continueGame()">
            <span>
              <strong>Continue</strong>
              <small>No saved world is available yet</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <button type="button" (click)="loadSave()">
            <span>
              <strong>Load Save</strong>
              <small>Open local worlds when save storage is available</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <button class="primary-action" type="button" (click)="newWorld()">
            <span>
              <strong>New World</strong>
              <small>Open the Map Workshop</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <p class="storage-note">Worlds are not saved until local persistence is added.</p>
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

      .start-screen {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        padding: 24px;
        color: #f4eadc;
        background:
          radial-gradient(circle at 70% 20%, rgba(184, 111, 70, 0.24), transparent 42%),
          linear-gradient(145deg, #222a31, #4c5f5d 62%, #283c3f);
      }

      .start-card {
        width: min(520px, 100%);
        padding: clamp(30px, 6vw, 58px);
        box-sizing: border-box;
        background: rgba(25, 29, 33, 0.86);
        border: 1px solid rgba(225, 177, 126, 0.3);
        border-radius: 22px;
        box-shadow: 0 28px 70px rgba(14, 17, 21, 0.4), inset 0 1px rgba(255, 239, 214, 0.08);
        backdrop-filter: blur(16px);
      }

      .eyebrow {
        margin: 0 0 18px;
        color: #d8a06f;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.16em;
      }

      h1 {
        margin: 0 0 16px;
        color: #fff3e4;
        font-size: clamp(32px, 6vw, 52px);
        font-weight: 650;
        letter-spacing: -0.045em;
        line-height: 0.98;
      }

      .intro {
        max-width: 38ch;
        margin: 0;
        color: #c9c1b8;
        font-size: 14px;
        line-height: 1.6;
      }

      .entry-actions {
        display: grid;
        gap: 9px;
        margin-top: 34px;
      }

      .entry-actions button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        width: 100%;
        padding: 15px 16px;
        color: #f4eadc;
        background: rgba(255, 247, 237, 0.06);
        border: 1px solid rgba(247, 232, 214, 0.14);
        border-radius: 10px;
        cursor: pointer;
        text-align: left;
      }

      .entry-actions button:hover,
      .entry-actions button:focus-visible {
        background: rgba(216, 160, 111, 0.16);
        border-color: rgba(225, 177, 126, 0.5);
      }

      .entry-actions button:focus-visible {
        outline: 2px solid #f0c08c;
        outline-offset: 3px;
      }

      .entry-actions .primary-action {
        color: #fff3e4;
        background: linear-gradient(100deg, rgba(186, 111, 69, 0.72), rgba(128, 78, 55, 0.72));
        border-color: rgba(242, 184, 126, 0.58);
      }

      .entry-actions span:first-child {
        display: grid;
        gap: 4px;
      }

      .entry-actions strong {
        font-size: 14px;
        font-weight: 650;
      }

      .entry-actions small {
        color: #a9a097;
        font-size: 10px;
        line-height: 1.3;
      }

      .primary-action small {
        color: #ead2bb;
      }

      .storage-note {
        margin: 24px 0 0;
        color: #948d87;
        font-size: 10px;
        letter-spacing: 0.04em;
        line-height: 1.5;
      }
    `,
  ],
})
export class StartScreen {
  private readonly router = inject(Router);

  continueGame(): void {
    void this.router.navigate(['/load-save'], {
      queryParams: { ...getRuntimeQueryParams(), reason: 'missing-last-active' },
    });
  }

  loadSave(): void {
    void this.router.navigate(['/load-save'], { queryParams: getRuntimeQueryParams() });
  }

  newWorld(): void {
    void this.router.navigate(['/new-world'], { queryParams: getRuntimeQueryParams() });
  }
}

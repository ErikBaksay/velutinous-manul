import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-toast-stack',
  standalone: true,
  template: `
    @if (message) {
      <div class="gameplay-toast placement-message" [class.is-error]="messageIsError" role="status">
        <span class="toast-dot" aria-hidden="true"></span>
        <span>{{ message }}</span>
      </div>
    }
    @if (sceneError) {
      <div class="gameplay-toast is-error scene-toast" role="alert">{{ sceneError }}</div>
    }
  `,
})
export class ToastStack {
  @Input() message: string | null = null;
  @Input() messageIsError = false;
  @Input() sceneError: string | null = null;
}

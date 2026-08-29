import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-save-world-dialog',
  standalone: true,
  template: `
    @if (open) {
      <div class="modal-backdrop" (click)="cancel.emit()">
        <section
          class="gameplay-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-dialog-title"
          (click)="$event.stopPropagation()"
        >
          <span class="modal-kicker">World archive</span>
          <h2 id="save-dialog-title">Save World</h2>
          <p class="modal-copy">Save the current world and keep autosave active.</p>
          <label class="modal-field">
            Save name
            <input
              #saveInput
              type="text"
              [value]="saveName"
              maxlength="80"
              autocomplete="off"
              (input)="nameChange.emit(readInputValue($event))"
            />
          </label>
          <div class="modal-actions">
            <button class="modal-primary" type="button" (click)="confirm.emit()" [disabled]="saving">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <button class="modal-secondary" type="button" (click)="cancel.emit()" [disabled]="saving">Cancel</button>
          </div>
        </section>
      </div>
    }
  `,
})
export class SaveWorldDialog implements OnChanges {
  @ViewChild('saveInput') private readonly saveInput?: ElementRef<HTMLInputElement>;

  @Input() open = false;
  @Input() saveName = '';
  @Input() saving = false;

  @Output() readonly nameChange = new EventEmitter<string>();
  @Output() readonly confirm = new EventEmitter<void>();
  @Output() readonly cancel = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      setTimeout(() => {
        this.saveInput?.nativeElement.focus();
        this.saveInput?.nativeElement.select();
      }, 0);
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (!this.open) {
      return;
    }
    if (event.key === 'Escape' && !this.saving) {
      event.preventDefault();
      this.cancel.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const dialog = this.saveInput?.nativeElement.closest('.gameplay-modal');
    const focusable = dialog
      ? [...dialog.querySelectorAll<HTMLElement>('button, input, [href], [tabindex]:not([tabindex="-1"])')]
      : [];
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  readInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}

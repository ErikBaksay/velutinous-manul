import {
  AfterViewInit,
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
  selector: 'app-found-town-dialog',
  standalone: true,
  template: `
    @if (open) {
      <div class="modal-backdrop" (click)="cancel.emit()">
        <section
          #dialog
          class="gameplay-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="town-dialog-title"
          data-testid="town-founding-dialog"
          (click)="$event.stopPropagation()"
        >
          <span class="modal-kicker">Settlement</span>
          <h2 id="town-dialog-title">Found Town</h2>
          <p class="modal-copy">
            Claim the church and {{ eligibleResidenceCount }} qualifying residence{{ eligibleResidenceCount === 1 ? '' : 's' }} as a new town.
          </p>
          <label class="modal-field">
            Town name
            <input
              #nameInput
              type="text"
              data-testid="town-name"
              [value]="townName"
              maxlength="40"
              autocomplete="off"
              (input)="nameChange.emit(readInputValue($event))"
            />
          </label>
          @if (nameError) {
            <p class="modal-error" data-testid="town-name-error" role="alert">{{ nameError }}</p>
          }
          <div class="modal-actions">
            <button class="modal-primary" type="button" data-testid="confirm-found-town" (click)="confirm.emit()">
              Found Town
            </button>
            <button class="modal-secondary" type="button" (click)="cancel.emit()">Cancel</button>
          </div>
        </section>
      </div>
    }
  `,
})
export class FoundTownDialog implements OnChanges, AfterViewInit {
  @ViewChild('nameInput') private readonly nameInput?: ElementRef<HTMLInputElement>;

  @Input() open = false;
  @Input() townName = '';
  @Input() nameError: string | null = null;
  @Input() eligibleResidenceCount = 0;

  @Output() readonly nameChange = new EventEmitter<string>();
  @Output() readonly confirm = new EventEmitter<void>();
  @Output() readonly cancel = new EventEmitter<void>();

  ngAfterViewInit(): void {
    this.focusNameInput();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      setTimeout(() => this.focusNameInput(), 0);
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (!this.open) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel.emit();
      return;
    }
    if (event.key === 'Enter' && event.target === this.nameInput?.nativeElement) {
      event.preventDefault();
      this.confirm.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const dialog = this.nameInput?.nativeElement.closest('.gameplay-modal');
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

  private focusNameInput(): void {
    if (this.open) {
      this.nameInput?.nativeElement.focus();
      this.nameInput?.nativeElement.select();
    }
  }
}

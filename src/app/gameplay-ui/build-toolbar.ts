import { Component, EventEmitter, Input, Output } from '@angular/core';
import { GameplayTool, MineralDepositOption } from './models';

@Component({
  selector: 'app-build-toolbar',
  standalone: true,
  template: `
    <aside class="build-toolbar" aria-labelledby="build-toolbar-title">
      <div class="toolbar-heading">
        <span class="toolbar-kicker">Build</span>
        <h2 id="build-toolbar-title">Construction</h2>
      </div>

      <div class="tool-palette" role="group" aria-label="Construction tools">
        @for (tool of tools; track tool.id) {
          <button
            type="button"
            class="tool-button"
            [class.is-active]="activeTool === tool.id"
            [attr.aria-pressed]="activeTool === tool.id"
            [attr.title]="tool.description"
            [attr.data-shortcut]="tool.shortcut"
            (click)="toolChange.emit(tool.id)"
          >
            <span class="tool-button-label">{{ tool.label }}</span>
            <span class="tool-shortcut" aria-hidden="true"></span>
          </button>
        }
      </div>

      @if (activeTool !== 'select') {
        <section class="tool-context" aria-live="polite">
          <div class="context-heading">
            <strong>{{ activeToolLabel }}</strong>
            <button class="context-cancel" type="button" (click)="cancel.emit()">Escape</button>
          </div>
          <p>{{ activeToolDescription }}</p>

          @if (activeTool === 'mine') {
            <label class="field-label">
              Mineral deposit
              <select
                aria-label="Mineral deposit target"
                [value]="mineralDepositSelection"
                (change)="depositChange.emit(readSelectValue($event))"
              >
                <option value="">Choose a deposit</option>
                @for (deposit of mineralDeposits; track deposit.id) {
                  <option [value]="deposit.id">{{ formatDeposit(deposit) }}</option>
                }
              </select>
            </label>
            <div class="context-actions">
              <button type="button" (click)="focusDeposit.emit()" [disabled]="!mineralDepositSelection">
                Focus deposit
              </button>
              <button type="button" data-testid="prepare-mine-deposit" (click)="prepareMine.emit()" [disabled]="!mineralDepositSelection">
                Prepare placement
              </button>
              <button type="button" data-testid="place-focused-mine" (click)="placeFocusedMine.emit()" [disabled]="!placementPreviewValid">
                Place focused mine
              </button>
            </div>
          }

          @if (activeTool === 'warehouse') {
            <button class="context-primary" type="button" data-testid="place-starting-warehouse" (click)="placeStartingWarehouse.emit()">
              Place at starting area
            </button>
          }

          @if (placementMessage && placementMessageIsError) {
            <p class="tool-feedback" [class.is-error]="placementMessageIsError" role="status">
              {{ placementMessage }}
            </p>
          }
        </section>
      }
    </aside>
  `,
})
export class BuildToolbar {
  @Input() activeTool: GameplayTool = 'select';
  @Input() mineralDeposits: readonly MineralDepositOption[] = [];
  @Input() mineralDepositSelection = '';
  @Input() placementPreviewValid = false;
  @Input() placementMessage: string | null = null;
  @Input() placementMessageIsError = false;

  @Output() readonly toolChange = new EventEmitter<GameplayTool>();
  @Output() readonly depositChange = new EventEmitter<string>();
  @Output() readonly focusDeposit = new EventEmitter<void>();
  @Output() readonly prepareMine = new EventEmitter<void>();
  @Output() readonly placeFocusedMine = new EventEmitter<void>();
  @Output() readonly placeStartingWarehouse = new EventEmitter<void>();
  @Output() readonly cancel = new EventEmitter<void>();

  readonly tools: readonly ToolDefinition[] = [
    { id: 'select', label: 'Select', shortcut: 'S', description: 'Select a building or road' },
    { id: 'mine', label: 'Mine', shortcut: 'M', description: 'Place a shaft-house mine' },
    { id: 'warehouse', label: 'Warehouse', shortcut: 'W', description: 'Place an arcaded warehouse' },
    { id: 'church', label: 'Church', shortcut: 'C', description: 'Place a church town anchor' },
    { id: 'residential', label: 'Residence', shortcut: 'R', description: 'Place a residential building' },
    { id: 'road', label: 'Road', shortcut: 'D', description: 'Place a road segment' },
  ];

  get activeToolLabel(): string {
    return this.tools.find((tool) => tool.id === this.activeTool)?.label ?? 'Construction';
  }

  get activeToolDescription(): string {
    switch (this.activeTool) {
      case 'mine':
        return 'Place a mine on buildable land that reaches a mineral deposit.';
      case 'warehouse':
        return 'Place a broad warehouse on buildable land. Repeated placement stays active.';
      case 'church':
        return 'Place a church freely on buildable land. Repeated placement stays active.';
      case 'residential':
        return 'Place a residence inside exactly one church or town influence area. Repeated placement stays active.';
      case 'road':
        return 'Place connected road segments on buildable land. Repeated placement stays active.';
      default:
        return '';
    }
  }

  formatDeposit(deposit: MineralDepositOption): string {
    return `Deposit ${deposit.id} · ${formatMineralKind(deposit.kind)}`;
  }

  readSelectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}

interface ToolDefinition {
  readonly id: GameplayTool;
  readonly label: string;
  readonly shortcut: string;
  readonly description: string;
}

function formatMineralKind(kind: MineralDepositOption['kind']): string {
  switch (kind) {
    case 'iron-ore':
      return 'Iron ore';
    case 'copper-ore':
      return 'Copper ore';
    case 'stone':
      return 'Stone';
  }
}

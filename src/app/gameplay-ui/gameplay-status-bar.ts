import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { RoadState, WarehouseInventoryState } from '../save/save-contract';
import type { WorldOverviewSummary } from './models';

@Component({
  selector: 'app-gameplay-status-bar',
  standalone: true,
  template: `
    <header class="gameplay-status-bar" aria-label="World status">
      <div class="status-identity">
        <span class="status-brand">VELUTINOUS MANUL</span>
        <h1>{{ worldName }}</h1>
        <span
          class="visually-hidden"
          data-testid="world-map-identity"
          [attr.data-starting-cell]="startingCell"
        >{{ worldName }}</span>
      </div>

      <div class="status-metrics" aria-label="World summary">
        <div class="status-metric">
          <span>Towns</span>
          <strong>{{ summary.townCount }}</strong>
        </div>
        <div class="status-metric">
          <span>Population</span>
          <strong>{{ summary.populationCapacity }}</strong>
        </div>
        <div class="status-metric">
          <span>Workers</span>
          <strong>{{ summary.workerCapacity }}</strong>
        </div>
        <div class="status-metric status-metric-wide" data-testid="transport-summary" [class.is-warning]="summary.blockedDeliveries > 0">
          <span>Transport</span>
          <strong>{{ transportLabel }}</strong>
          <span class="visually-hidden" data-testid="active-van-count">Active courier vans: {{ summary.activeVans }}</span>
          <span class="visually-hidden" data-testid="pending-delivery-count">Pending deliveries: {{ summary.pendingDeliveries }}</span>
          <span class="visually-hidden" data-testid="blocked-delivery-count">Blocked deliveries: {{ summary.blockedDeliveries }}</span>
          <span class="visually-hidden" data-testid="completed-delivery-count">Completed deliveries: {{ summary.completedDeliveries }}</span>
        </div>
        <div class="status-metric status-metric-wide" data-testid="warehouse-inventory-list" [class.is-warning]="summary.warehouseCount === 0">
          <span>Storage</span>
          <strong>{{ storageLabel }}</strong>
          @for (warehouse of warehouseInventories; track warehouse.warehouseBuildingId) {
            <span class="visually-hidden" [attr.data-testid]="'warehouse-inventory-' + warehouse.warehouseBuildingId + '-iron-ore'">
              Iron ore: {{ warehouse.quantities['iron-ore'] }}
            </span>
            <span class="visually-hidden" [attr.data-testid]="'warehouse-inventory-' + warehouse.warehouseBuildingId + '-copper-ore'">
              Copper ore: {{ warehouse.quantities['copper-ore'] }}
            </span>
            <span class="visually-hidden" [attr.data-testid]="'warehouse-inventory-' + warehouse.warehouseBuildingId + '-stone'">
              Stone: {{ warehouse.quantities.stone }}
            </span>
          }
        </div>
      </div>

      <div class="status-actions">
        <span class="save-indicator save-note" [class.is-error]="saveError" role="status">
          <span class="status-dot" aria-hidden="true"></span>
          {{ saveError ?? saveMessage }}
        </span>
        <button type="button" class="status-button" data-testid="overview-toggle" (click)="overview.emit()">
          Overview
        </button>
        <button type="button" class="status-button status-button-primary" data-testid="save-world-action" (click)="save.emit()">
          Save World
        </button>
        <button type="button" class="status-button status-button-quiet" data-testid="leave-world" [disabled]="isLeaving" (click)="leave.emit()">
          {{ isLeaving ? 'Saving…' : 'Leave World' }}
        </button>
      </div>
      <span class="visually-hidden" data-testid="road-count">Road cells: {{ roadCount }}</span>
      <span class="visually-hidden" data-testid="road-layout" [attr.data-road-layout]="roadLayout">{{ roadLayout }}</span>
    </header>
  `,
})
export class GameplayStatusBar {
  @Input() worldName = 'World Session';
  @Input() startingCell: number | null = null;
  @Input() saveMessage = '';
  @Input() saveError: string | null = null;
  @Input() summary: WorldOverviewSummary = emptyWorldSummary();
  @Input() warehouseInventories: readonly WarehouseInventoryState[] = [];
  @Input() roadCount = 0;
  @Input() roadLayout = '';
  @Input() isLeaving = false;

  @Output() readonly overview = new EventEmitter<void>();
  @Output() readonly save = new EventEmitter<void>();
  @Output() readonly leave = new EventEmitter<void>();

  get transportLabel(): string {
    if (this.summary.blockedDeliveries > 0) {
      return `${this.summary.blockedDeliveries} blocked`;
    }
    return `${this.summary.activeVans} active`;
  }

  get storageLabel(): string {
    if (this.summary.warehouseCount === 0) {
      return 'No warehouses';
    }
    return `${this.summary.warehouseCount} warehouse${this.summary.warehouseCount === 1 ? '' : 's'}`;
  }
}

function emptyWorldSummary(): WorldOverviewSummary {
  return {
    townCount: 0,
    populationCapacity: 0,
    workerCapacity: 0,
    activeVans: 0,
    pendingDeliveries: 0,
    blockedDeliveries: 0,
    completedDeliveries: 0,
    warehouseCount: 0,
    storedIronOre: 0,
    storedCopperOre: 0,
    storedStone: 0,
    presetLabel: 'Balanced Continental',
  };
}

import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { WarehouseInventoryState } from '../save/save-contract';
import type {
  SystemsDrawerTab,
  TownSummary,
  WorldOverviewSummary,
} from './models';

@Component({
  selector: 'app-systems-drawer',
  standalone: true,
  template: `
    @if (open) {
      <div class="drawer-layer">
        <button class="drawer-scrim" type="button" aria-label="Close overview" (click)="close.emit()"></button>
        <aside class="systems-drawer" aria-labelledby="systems-drawer-title">
          <div class="drawer-heading">
            <div>
              <span class="panel-kicker">Command center</span>
              <h2 id="systems-drawer-title">Overview</h2>
            </div>
            <button class="inspector-close" type="button" aria-label="Close overview" (click)="close.emit()">×</button>
          </div>

          <nav class="drawer-tabs" role="tablist" aria-label="World systems">
            @for (tab of tabs; track tab.id) {
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="activeTab === tab.id"
                [class.is-active]="activeTab === tab.id"
                [attr.data-testid]="'overview-tab-' + tab.id"
                (click)="tabChange.emit(tab.id)"
              >{{ tab.label }}</button>
            }
          </nav>

          @if (activeTab === 'towns') {
            <section class="drawer-content" role="tabpanel">
              <div class="drawer-summary-row">
                <span>{{ summary.townCount }} town{{ summary.townCount === 1 ? '' : 's' }}</span>
                <strong>{{ summary.populationCapacity }} population capacity</strong>
              </div>
              @if (townSummaries.length === 0) {
                <div class="drawer-empty">
                  <strong>No towns founded</strong>
                  <span>Place a church and a qualifying residence to begin a settlement.</span>
                </div>
              } @else {
                <div class="town-list">
                  @for (town of townSummaries; track town.id) {
                    <button class="town-list-item" type="button" (click)="focusTown.emit(town.id)">
                      <span class="town-list-name"><span class="town-dot" aria-hidden="true"></span>{{ town.name }}</span>
                      <span class="town-list-stats">{{ town.residenceCount }} residences · {{ town.populationCapacity }} pop · {{ town.workerCapacity }} workers</span>
                    </button>
                  }
                </div>
              }
            </section>
          }

          @if (activeTab === 'logistics') {
            <section class="drawer-content" role="tabpanel" data-testid="overview-logistics">
              <div class="overview-stat-grid">
                <div><span>Active vans</span><strong>{{ summary.activeVans }}</strong></div>
                <div><span>Pending</span><strong>{{ summary.pendingDeliveries }}</strong></div>
                <div class="is-warning"><span>Blocked</span><strong>{{ summary.blockedDeliveries }}</strong></div>
                <div><span>Delivered</span><strong>{{ summary.completedDeliveries }}</strong></div>
              </div>
              <p class="drawer-note">
                {{ summary.blockedDeliveries > 0
                  ? 'Some mineral output is waiting for a connected road route.'
                  : 'Road logistics are operating normally.' }}
              </p>
            </section>
          }

          @if (activeTab === 'storage') {
            <section class="drawer-content" role="tabpanel" data-testid="overview-storage">
              <div class="drawer-summary-row">
                <span>{{ summary.warehouseCount }} warehouse{{ summary.warehouseCount === 1 ? '' : 's' }}</span>
                <strong>Stored materials</strong>
              </div>
              @if (warehouseInventories.length === 0) {
                <div class="drawer-empty">
                  <strong>No warehouse inventory</strong>
                  <span>Place a warehouse to receive mineral output.</span>
                </div>
              } @else {
                @for (warehouse of warehouseInventories; track warehouse.warehouseBuildingId; let index = $index) {
                  <section class="inventory-row">
                    <strong>Warehouse {{ index + 1 }}</strong>
                    <span>Iron ore {{ warehouse.quantities['iron-ore'] }}</span>
                    <span>Copper ore {{ warehouse.quantities['copper-ore'] }}</span>
                    <span>Stone {{ warehouse.quantities.stone }}</span>
                  </section>
                }
              }
            </section>
          }

          @if (activeTab === 'world') {
            <section class="drawer-content" role="tabpanel" data-testid="overview-world">
              <div class="world-detail">
                <span>Landscape preset</span>
                <strong>{{ summary.presetLabel }}</strong>
              </div>
              <div class="world-detail">
                <span>Simulation</span>
                <strong>Local browser session</strong>
              </div>
              <p class="drawer-note">Technical map diagnostics remain available through the debug query tools.</p>
            </section>
          }
        </aside>
      </div>
    }
  `,
})
export class SystemsDrawer {
  @Input() open = false;
  @Input() activeTab: SystemsDrawerTab = 'towns';
  @Input() summary: WorldOverviewSummary = emptyWorldSummary();
  @Input() townSummaries: readonly TownSummary[] = [];
  @Input() warehouseInventories: readonly WarehouseInventoryState[] = [];

  @Output() readonly close = new EventEmitter<void>();
  @Output() readonly tabChange = new EventEmitter<SystemsDrawerTab>();
  @Output() readonly focusTown = new EventEmitter<string>();

  readonly tabs: readonly { id: SystemsDrawerTab; label: string }[] = [
    { id: 'towns', label: 'Towns' },
    { id: 'logistics', label: 'Logistics' },
    { id: 'storage', label: 'Storage' },
    { id: 'world', label: 'World' },
  ];
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

import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MineProductionState } from '../save/save-contract';
import type {
  PlacedBuildingState,
  RoadState,
  TownState,
  WarehouseInventoryState,
} from '../save/save-contract';
import type {
  TownCapacity,
  TownFoundationEvaluation,
} from '../settlement/town-foundation';
import type { WarehouseOption } from './models';

@Component({
  selector: 'app-selection-inspector',
  standalone: true,
  template: `
    @if (open) {
      <aside class="selection-inspector" aria-labelledby="inspector-title">
        <div class="inspector-heading">
          <div>
            <span class="panel-kicker">Inspector</span>
            <h2 id="inspector-title">{{ selectedBuilding ? buildingLabel : selectedRoad ? 'Road segment' : 'Terrain' }}</h2>
            @if (selectedBuilding) {
              <p class="inspector-subtitle">{{ buildingSubtitle }}</p>
            } @else if (selectedRoad) {
              <p class="inspector-subtitle">Infrastructure</p>
            } @else {
              <p class="inspector-subtitle">Nothing built here yet</p>
            }
          </div>
          <button class="inspector-close" type="button" aria-label="Close inspector" (click)="close.emit()">×</button>
        </div>

        @if (!selectedBuilding && !selectedRoad) {
          <div class="inspector-empty">
            <span class="empty-mark" aria-hidden="true">＋</span>
            <strong>Select a building</strong>
            <p>Choose a building or road on the map to see its details and actions.</p>
          </div>
        }

        @if (selectedTown) {
          <section class="inspector-card town-card" data-testid="selected-town-summary">
            <div class="card-heading">
              <span class="card-kicker">Town</span>
              <strong>{{ selectedTown.name }}</strong>
            </div>
            <div class="capacity-grid">
              <div><span>Population capacity: </span><strong data-testid="town-population">{{ townCapacity?.population ?? 0 }}</strong></div>
              <div><span>Worker capacity: </span><strong data-testid="town-worker-capacity">{{ townCapacity?.workers ?? 0 }}</strong></div>
            </div>
            <p data-testid="town-residence-count">{{ selectedTown.residentialBuildingIds.length }} residences</p>
            <div class="inspector-actions">
              <button type="button" (click)="focusTown.emit(selectedTown.id)">Focus town</button>
              <button class="secondary-action" type="button" (click)="toggleInfluence.emit(selectedTown.id)">
                {{ influenceVisible ? 'Hide influence' : 'Show influence' }}
              </button>
            </div>
          </section>
        }

        @if (foundingChurch && foundationEvaluation) {
          <section class="inspector-card foundation-card" data-testid="town-foundation-card">
            <div class="card-heading">
              <span class="card-kicker">Settlement</span>
              <strong>Town foundation</strong>
            </div>
            <p class="card-copy">The church and all qualifying residences will form one town.</p>
            <ul class="foundation-checklist">
              <li class="is-complete"><span aria-hidden="true">✓</span> Church selected</li>
              <li [class.is-complete]="foundationEvaluation.eligibleResidentialBuildingIds.length > 0">
                <span aria-hidden="true">{{ foundationEvaluation.eligibleResidentialBuildingIds.length > 0 ? '✓' : '○' }}</span>
                {{ foundationEvaluation.eligibleResidentialBuildingIds.length }} qualifying residence{{ foundationEvaluation.eligibleResidentialBuildingIds.length === 1 ? '' : 's' }}
              </li>
              <li [class.is-complete]="foundationEvaluation.valid">
                <span aria-hidden="true">{{ foundationEvaluation.valid ? '✓' : '○' }}</span> Ready to found
              </li>
            </ul>
            <button
              class="inspector-primary"
              type="button"
              data-testid="found-town"
              [disabled]="!foundationEvaluation.valid"
              (click)="foundTown.emit()"
            >Found Town</button>
            @if (!foundationEvaluation.valid) {
              <p class="inspector-error" data-testid="found-town-feedback" role="status">
                {{ foundationEvaluation.failureCode === 'missing-residence'
                  ? 'Place at least one qualifying residence before founding this town.'
                  : 'This church cannot found a town.' }}
              </p>
            }
          </section>
        }

        @if (selectedMineProduction) {
          <section class="inspector-card" data-testid="selected-mine-production">
            <div class="card-heading">
              <span class="card-kicker">Production</span>
              <strong>Mine output</strong>
            </div>
            <dl class="detail-list">
              <div><dt>Resource</dt><dd data-testid="mine-resource">{{ formatResource(selectedMineProduction.resourceKind) }}</dd></div>
              <div><dt>Deposit</dt><dd>Assigned mineral deposit</dd></div>
              <span class="visually-hidden" data-testid="mine-deposit">#{{ selectedMineProduction.depositId }}</span>
              <div><dt>Buffered</dt><dd data-testid="mine-output-buffer">{{ selectedMineProduction.outputBuffer }}</dd></div>
              <div><dt>Produced</dt><dd>{{ selectedMineProduction.producedTotal }}</dd></div>
              <span class="visually-hidden" data-testid="mine-produced-total">
                Produced: {{ selectedMineProduction.producedTotal }}
              </span>
              <div><dt>Delivered</dt><dd>{{ selectedMineProduction.deliveredTotal }}</dd></div>
              <span class="visually-hidden" data-testid="mine-delivered-total">
                Delivered: {{ selectedMineProduction.deliveredTotal }}
              </span>
              <div><dt>Destination</dt><dd>{{ warehouseLabel(selectedMineProduction.assignedWarehouseId) }}</dd></div>
              <span class="visually-hidden" data-testid="mine-assigned-warehouse">
                Assigned warehouse: {{ selectedMineProduction.assignedWarehouseId ?? 'Unassigned' }}
              </span>
            </dl>
            <label class="field-label">
              Warehouse destination
              <select
                aria-label="Warehouse destination"
                [value]="selectedWarehouseDestination"
                (change)="warehouseChange.emit(readSelectValue($event))"
              >
                <option value="">Unassigned</option>
                @for (warehouse of warehouseOptions; track warehouse.id) {
                  <option [value]="warehouse.id">{{ warehouse.label }}</option>
                }
              </select>
            </label>
            <button class="secondary-action" type="button" (click)="assignWarehouse.emit()">Assign Warehouse</button>
          </section>
        }

        @if (selectedWarehouseInventory) {
          <section class="inspector-card" data-testid="selected-warehouse-inventory">
            <div class="card-heading">
              <span class="card-kicker">Storage</span>
              <strong>Warehouse inventory</strong>
            </div>
            <dl class="detail-list">
              <div><dt>Iron ore</dt><dd data-testid="warehouse-iron-ore">{{ selectedWarehouseInventory.quantities['iron-ore'] }}</dd></div>
              <div><dt>Copper ore</dt><dd data-testid="warehouse-copper-ore">{{ selectedWarehouseInventory.quantities['copper-ore'] }}</dd></div>
              <div><dt>Stone</dt><dd data-testid="warehouse-stone">{{ selectedWarehouseInventory.quantities.stone }}</dd></div>
            </dl>
          </section>
        }

        @if (selectedBuilding?.definitionId === residentialDefinitionId) {
          <section class="inspector-card residence-card">
            <div class="card-heading">
              <span class="card-kicker">Housing</span>
              <strong>Residential capacity</strong>
            </div>
            <div class="capacity-grid">
              <div><span>Population</span><strong>+10</strong></div>
              <div><span>Workers</span><strong>+10</strong></div>
            </div>
            <p>{{ selectedTown ? 'This residence belongs to ' + selectedTown.name + '.' : 'This residence is ready to be claimed by a new town.' }}</p>
          </section>
        }

        @if (selectedBuilding?.definitionId === churchDefinitionId && selectedTown) {
          <p class="inspector-note" [class.is-warning]="churchProtected">
            {{ churchProtected
              ? 'This church is protected while its town still has residences.'
              : 'The town is empty. Remove the church or rebuild the town with new residences.' }}
          </p>
        }

        @if (selectedRoad) {
          <section class="inspector-card" data-testid="selected-road">
            <div class="card-heading">
              <span class="card-kicker">Infrastructure</span>
              <strong>Road segment</strong>
            </div>
            <p>{{ roadConnections }}</p>
            <span class="visually-hidden" data-testid="selected-road-cell">
              Cell: {{ selectedRoad.cell.x }}, {{ selectedRoad.cell.y }}
            </span>
            <span class="visually-hidden" data-testid="selected-road-mask">Connections: {{ roadMask }}</span>
          </section>
        }

        @if (selectedBuilding) {
          <button
            class="remove-action"
            type="button"
            data-testid="remove-selected-building"
            (click)="removeBuilding.emit()"
          >Remove Selected Building</button>
        } @else if (selectedRoad) {
          <button class="remove-action" type="button" data-testid="remove-selected-road" (click)="removeRoad.emit()">
            Remove road segment
          </button>
        }
      </aside>
    }
  `,
})
export class SelectionInspector {
  @Input() open = false;
  @Input() selectedBuilding: PlacedBuildingState | null = null;
  @Input() selectedRoad: RoadState | null = null;
  @Input() selectedTown: TownState | null = null;
  @Input() townCapacity: TownCapacity | null = null;
  @Input() buildingLabel = 'Building';
  @Input() buildingSubtitle = 'Construction';
  @Input() foundingChurch: PlacedBuildingState | null = null;
  @Input() foundationEvaluation: TownFoundationEvaluation | null = null;
  @Input() selectedMineProduction: MineProductionState | null = null;
  @Input() selectedWarehouseInventory: WarehouseInventoryState | null = null;
  @Input() warehouseOptions: readonly WarehouseOption[] = [];
  @Input() selectedWarehouseDestination = '';
  @Input() roadConnections = 'Connected road';
  @Input() roadMask = 0;
  @Input() churchProtected = false;
  @Input() influenceVisible = true;
  @Input() churchDefinitionId = '';
  @Input() residentialDefinitionId = '';

  @Output() readonly close = new EventEmitter<void>();
  @Output() readonly foundTown = new EventEmitter<void>();
  @Output() readonly focusTown = new EventEmitter<string>();
  @Output() readonly toggleInfluence = new EventEmitter<string>();
  @Output() readonly warehouseChange = new EventEmitter<string>();
  @Output() readonly assignWarehouse = new EventEmitter<void>();
  @Output() readonly removeBuilding = new EventEmitter<void>();
  @Output() readonly removeRoad = new EventEmitter<void>();

  formatResource(kind: MineProductionState['resourceKind']): string {
    switch (kind) {
      case 'iron-ore':
        return 'Iron ore';
      case 'copper-ore':
        return 'Copper ore';
      case 'stone':
        return 'Stone';
    }
  }

  readSelectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  warehouseLabel(warehouseId: string | null): string {
    if (!warehouseId) {
      return 'Unassigned';
    }
    return this.warehouseOptions.find((warehouse) => warehouse.id === warehouseId)?.label ?? 'Assigned warehouse';
  }
}

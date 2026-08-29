import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  createUpdatedWorldSession,
  type MineProductionState,
  type PlacedBuildingState,
  type RoadState,
  type TownState,
  type WorldSession as WorldSessionData,
} from './save/save-contract';
import {
  addRoad,
  cellCoordinateToIndex,
  createCellOccupancy,
  createVelutinousManulConstructionDefinitionRegistry,
  deriveRoadConnectionMasks,
  getCurrentConstructionCellIndices,
  getPlacedBuildingCellIndices,
  getRoadCellIndices,
  getRoadCellKey,
  getOccupyingBuildingId,
  mergeClearedCellIndices,
  removeRoad,
  ROAD_CONNECTION_MASK,
  type CellCoordinate,
  type CellOccupancy,
  type PlacementValidationResult,
  type RoadPlacementValidationResult,
  validateBuildingPlacement,
  validateRoadPlacement,
  VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID,
  VELUTINOUS_MANUL_CHURCH_DEFINITION_ID,
  VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID,
  VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID,
} from './construction';
import {
  addResidenceToTown,
  createTownState,
  evaluateResidentialPlacement,
  evaluateTownFoundation,
  getNextTownId,
  getTownCapacity,
  removeBuildingFromTowns,
  validateTownName,
} from './settlement';
import { getRuntimeQueryParams } from './runtime-query';
import {
  SaveActionError,
  SaveNameConflictError,
  SavePersistenceService,
  AUTOSAVE_INTERVAL_MS,
} from './save/save-persistence';
import { WorldSessionRuntime } from './session-runtime';
import { GameplayShell } from './gameplay-ui/gameplay-shell';
import type {
  GameplaySimulationSpeed,
  GameplayTool,
  MineralDepositOption,
  SystemsDrawerTab,
  TownSummary,
  WarehouseOption,
  WorldOverviewSummary,
} from './gameplay-ui/models';
import {
  addMineProductionState,
  addWarehouseProductionState,
  assignMineWarehouse,
  findMineDepositBinding,
  reconcileMineralProductionState,
  removeBuildingProductionState,
  runMineralProductionTick,
} from './mineral-production';
import {
  advanceCourierVans,
  cancelCourierVansForBuilding,
  dispatchCourierVans,
  getCourierVanTransportSummary,
  VEHICLE_SIMULATION_MAX_DELTA_SECONDS,
  VEHICLE_SIMULATION_STEP_SECONDS,
} from './vehicle-transport';

export const SIMULATION_SPEEDS = [1, 2, 4] as const;
export type SimulationSpeed = (typeof SIMULATION_SPEEDS)[number];
export const SIMULATION_TICK_INTERVAL_SECONDS = 1;
export const COURIER_DISPATCH_INTERVAL_TICKS = 10;

export interface SimulationClockState {
  readonly productionAccumulatorSeconds: number;
}

export interface SimulationClockStep {
  readonly elapsedSeconds: number;
  readonly runProductionTick: boolean;
}

export interface SimulationClockAdvance {
  readonly state: SimulationClockState;
  readonly steps: readonly SimulationClockStep[];
}

const SIMULATION_CLOCK_EPSILON = 1e-9;

export function advanceSimulationClock(
  state: SimulationClockState,
  realElapsedSeconds: number,
  speed: SimulationSpeed,
  paused = false,
): SimulationClockAdvance {
  if (paused) {
    return { state, steps: [] };
  }

  const clampedRealElapsed = Math.min(
    VEHICLE_SIMULATION_MAX_DELTA_SECONDS,
    Math.max(0, Number.isFinite(realElapsedSeconds) ? realElapsedSeconds : 0),
  );
  if (clampedRealElapsed <= SIMULATION_CLOCK_EPSILON) {
    return { state, steps: [] };
  }

  let accumulator = Math.max(0, state.productionAccumulatorSeconds);
  let remainingSeconds = clampedRealElapsed * speed;
  const steps: SimulationClockStep[] = [];

  while (remainingSeconds > SIMULATION_CLOCK_EPSILON) {
    const untilProductionTick = SIMULATION_TICK_INTERVAL_SECONDS - accumulator;
    if (untilProductionTick <= SIMULATION_CLOCK_EPSILON) {
      accumulator = Math.max(0, accumulator - SIMULATION_TICK_INTERVAL_SECONDS);
      steps.push({ elapsedSeconds: 0, runProductionTick: true });
      continue;
    }

    const elapsedSeconds = Math.min(
      remainingSeconds,
      untilProductionTick,
      VEHICLE_SIMULATION_MAX_DELTA_SECONDS,
    );
    if (elapsedSeconds <= SIMULATION_CLOCK_EPSILON) {
      break;
    }
    remainingSeconds -= elapsedSeconds;
    accumulator += elapsedSeconds;
    const runProductionTick = accumulator >= SIMULATION_TICK_INTERVAL_SECONDS - SIMULATION_CLOCK_EPSILON;
    if (runProductionTick) {
      accumulator = Math.max(0, accumulator - SIMULATION_TICK_INTERVAL_SECONDS);
    }
    steps.push({ elapsedSeconds, runProductionTick });
  }

  return {
    state: { productionAccumulatorSeconds: accumulator },
    steps,
  };
}

@Component({
  selector: 'app-world-session',
  standalone: true,
  imports: [GameplayShell],
  template: `
    <main #sceneFrame class="world-frame" aria-label="Velutinous Manul world session">
      <canvas #gameCanvas tabindex="0" aria-label="Interactive world camera"></canvas>

      <app-gameplay-shell
        [startingCell]="world?.map?.generationSummary?.startingCell ?? null"
        [saveMessage]="saveMessage"
        [saveError]="saveError"
        [summary]="worldOverviewSummary"
        [warehouseInventories]="warehouseProductionStates"
        [roadCount]="roadStates.length"
        [roadLayout]="roadLayout"
        [isLeaving]="isLeaving"
        [activeTool]="activeTool"
        [mineralDeposits]="mineralDepositOptions"
        [mineralDepositSelection]="mineralDepositSelection"
        [placementPreviewValid]="placementPreview?.valid ?? false"
        [placementMessage]="placementMessage"
        [placementMessageIsError]="hasPlacementError"
        [inspectorOpen]="inspectorOpen"
        [selectedBuilding]="selectedBuilding"
        [selectedRoad]="selectedRoad"
        [selectedTown]="selectedTown"
        [selectedTownCapacity]="selectedTown ? getTownCapacity(selectedTown) : null"
        [buildingLabel]="selectedBuildingLabel"
        [buildingSubtitle]="selectedBuildingSubtitle"
        [foundingChurch]="foundingChurch"
        [foundationEvaluation]="foundationEvaluation"
        [eligibleResidenceCount]="foundationEvaluation?.eligibleResidentialBuildingIds?.length ?? 0"
        [selectedMineProduction]="selectedMineProduction"
        [selectedWarehouseInventory]="selectedWarehouseInventory"
        [warehouseOptions]="warehouseOptions"
        [warehouseInventories]="warehouseProductionStates"
        [selectedWarehouseDestination]="selectedWarehouseDestination"
        [roadConnections]="selectedRoadConnectionLabel"
        [roadMask]="selectedRoadMask"
        [churchProtected]="isSelectedChurchProtected"
        [influenceVisible]="townInfluenceVisible"
        [churchDefinitionId]="velutinousManulChurchDefinitionId"
        [residentialDefinitionId]="velutinousManulResidentialDefinitionId"
        [townSummaries]="townSummaries"
        [sceneError]="sceneError"
        [showTownFoundingDialog]="showTownFoundingDialog"
        [townName]="townName"
        [townNameError]="townNameError"
        [showSaveDialog]="showSaveDialog"
        [manualSaveName]="manualSaveName"
        [isSaving]="isSaving"
        [simulationPaused]="isSimulationPaused"
        [simulationSpeed]="simulationSpeed"
        [simulationTick]="world?.gameplay?.production?.tick ?? 0"
        [simulationSpeeds]="simulationSpeeds"
        (toolChange)="handleToolChange($event)"
        (depositChange)="mineralDepositSelection = $event"
        (focusDeposit)="focusSelectedMineralDeposit()"
        (prepareMine)="prepareSelectedMineralDepositPlacement()"
        (placeFocusedMine)="placeFocusedMine()"
        (placeStartingWarehouse)="placeWarehouseAtStartingArea()"
        (cancelPlacement)="cancelPlacement()"
        (closeInspector)="clearSelection()"
        (openFoundTown)="openFoundTownDialog()"
        (confirmFoundTown)="foundTown()"
        (focusTown)="focusTownById($event)"
        (toggleInfluence)="toggleTownInfluence($event)"
        (warehouseChange)="setWarehouseDestination($event)"
        (assignWarehouse)="assignSelectedMineWarehouse()"
        (removeBuilding)="removeSelectedBuilding()"
        (removeRoad)="removeSelectedRoad()"
        (save)="openSaveDialog()"
        (leave)="leaveWorld()"
        (townNameChange)="townName = $event; townNameError = null"
        (closeTownDialog)="closeFoundTownDialog()"
        (saveNameChange)="manualSaveName = $event"
        (confirmSave)="saveManual()"
        (closeSaveDialog)="closeSaveDialog()"
        (toggleSimulationPause)="toggleSimulationPause()"
        (speedChange)="setSimulationSpeed($event)"
      />

      @if (legacyHudEnabled) {
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
        <p class="save-note" [class.is-error]="saveError" role="status">
          {{ saveError ?? saveMessage }}
        </p>
        @if (selectedCell) {
          <p class="selected-cell" data-testid="selected-cell">
            Selected cell: {{ selectedCell.x }}, {{ selectedCell.y }}
          </p>
        }
        <section class="construction-tools" aria-labelledby="construction-title">
          <h2 id="construction-title">Construction</h2>
          <div class="tool-palette" role="group" aria-label="Construction tools">
            <button
              type="button"
              [class.is-active]="activeTool === 'select'"
              (click)="selectTool()"
            >Select</button>
            <button
              type="button"
              [class.is-active]="activeTool === 'mine'"
              (click)="activateMineTool()"
            >Mine</button>
            <button
              type="button"
              [class.is-active]="activeTool === 'warehouse'"
              (click)="activateWarehouseTool()"
            >Warehouse</button>
            <button
              type="button"
              [class.is-active]="activeTool === 'church'"
              (click)="activateChurchTool()"
            >Church</button>
            <button
              type="button"
              [class.is-active]="activeTool === 'residential'"
              (click)="activateResidentialTool()"
            >Residence</button>
            <button
              type="button"
              [class.is-active]="activeTool === 'road'"
              (click)="activateRoadTool()"
            >Road</button>
          </div>
          @if (activeTool === 'mine') {
            <p class="tool-note">Hover over land to preview a large 15×6 shaft-house mine.</p>
            <label class="deposit-target">
              Mineral deposit target
              <select
                aria-label="Mineral deposit target"
                [value]="mineralDepositSelection"
                (change)="mineralDepositSelection = readSelectValue($event)"
              >
                <option value="">Choose a deposit</option>
                @for (deposit of mineralDeposits; track deposit.id) {
                  <option [value]="deposit.id">#{{ deposit.id }} — {{ formatMineralKind(deposit.kind) }}</option>
                }
              </select>
            </label>
            <button
              class="secondary-action"
              type="button"
              (click)="focusSelectedMineralDeposit()"
              [disabled]="!mineralDepositSelection"
            >Focus Deposit</button>
            <button
              class="secondary-action"
              type="button"
              data-testid="prepare-mine-deposit"
              (click)="prepareSelectedMineralDepositPlacement()"
              [disabled]="!mineralDepositSelection"
            >Prepare Mine at Deposit</button>
            <button
              class="secondary-action"
              type="button"
              data-testid="place-focused-mine"
              (click)="placeFocusedMine()"
              [disabled]="!placementPreview?.valid"
            >Place Focused Mine</button>
            <button class="secondary-action" type="button" (click)="cancelPlacement()">Cancel</button>
          }
          @if (activeTool === 'warehouse') {
            <p class="tool-note">Hover over land to preview a broad 15×6 arcaded logistics warehouse.</p>
            <button
              class="secondary-action"
              type="button"
              data-testid="place-starting-warehouse"
              (click)="placeWarehouseAtStartingArea()"
            >Place at Starting Area</button>
            <button class="secondary-action" type="button" (click)="cancelPlacement()">Cancel</button>
          }
          @if (activeTool === 'church') {
            <p class="tool-note">Place a church freely on buildable land. A church becomes a town anchor when you found the town.</p>
            <button class="secondary-action" type="button" (click)="cancelPlacement()">Cancel</button>
          }
          @if (activeTool === 'residential') {
            <p class="tool-note">Place a 10×8 residence inside exactly one church or founded-town influence area.</p>
            <button class="secondary-action" type="button" (click)="cancelPlacement()">Cancel</button>
          }
          @if (activeTool === 'road') {
            <p class="tool-note">Hover over land to preview a one-cell road segment.</p>
            <button class="secondary-action" type="button" (click)="cancelPlacement()">Cancel</button>
          }
          @if (placementMessage) {
            <p
              class="placement-message"
              [class.is-error]="(placementPreview && !placementPreview.valid) ||
                (roadPlacementPreview && !roadPlacementPreview.valid)"
              role="status"
            >{{ placementMessage }}</p>
          }
          @if (selectedBuilding) {
            @if (selectedTown) {
              <section class="production-card" data-testid="selected-town-summary">
                <h3>{{ selectedTown.name }}</h3>
                <p data-testid="town-population">Population capacity: {{ getTownCapacity(selectedTown).population }}</p>
                <p data-testid="town-worker-capacity">Worker capacity: {{ getTownCapacity(selectedTown).workers }}</p>
                <p data-testid="town-residence-count">Residences: {{ selectedTown.residentialBuildingIds.length }}</p>
              </section>
            }
            @if (foundingChurch && foundationEvaluation) {
              <button
                type="button"
                class="secondary-action"
                data-testid="found-town"
                (click)="openFoundTownDialog()"
                [disabled]="!foundationEvaluation.valid"
              >Found Town</button>
              @if (!foundationEvaluation.valid) {
                <p class="placement-message is-error" data-testid="found-town-feedback">
                  {{ foundationEvaluation.failureCode === 'missing-residence'
                    ? 'Place at least one qualifying residence before founding this town.'
                    : 'This church cannot found a town.' }}
                </p>
              }
            }
            @if (selectedMineProduction) {
              <section class="production-card" data-testid="selected-mine-production">
                <h3>Mine production</h3>
                <p data-testid="mine-resource">Resource: {{ formatMineralKind(selectedMineProduction.resourceKind) }}</p>
                <p data-testid="mine-deposit">Deposit: #{{ selectedMineProduction.depositId }}</p>
                <p data-testid="mine-deposit-supply">Deposit supply: Unlimited</p>
                <p data-testid="mine-output-buffer">Buffered: {{ selectedMineProduction.outputBuffer }}</p>
                <p data-testid="mine-produced-total">Produced: {{ selectedMineProduction.producedTotal }}</p>
                <p data-testid="mine-delivered-total">Delivered: {{ selectedMineProduction.deliveredTotal }}</p>
                <p data-testid="mine-assigned-warehouse">
                  Assigned warehouse: {{ selectedMineProduction.assignedWarehouseId ?? 'Unassigned' }}
                </p>
                <label>
                  Warehouse destination
                  <select
                    aria-label="Warehouse destination"
                    [value]="selectedWarehouseDestination"
                    (change)="setWarehouseSelection($event)"
                  >
                    <option value="">Unassigned</option>
                    @for (warehouse of warehouseBuildings; track warehouse.id) {
                      <option [value]="warehouse.id">{{ warehouse.id }}</option>
                    }
                  </select>
                </label>
                <button type="button" class="secondary-action" (click)="assignSelectedMineWarehouse()">
                  Assign Warehouse
                </button>
              </section>
            }
            @if (selectedWarehouseInventory) {
              <section class="production-card" data-testid="selected-warehouse-inventory">
                <h3>Warehouse inventory</h3>
                <p data-testid="warehouse-iron-ore">Iron ore: {{ selectedWarehouseInventory.quantities['iron-ore'] }}</p>
                <p data-testid="warehouse-copper-ore">Copper ore: {{ selectedWarehouseInventory.quantities['copper-ore'] }}</p>
                <p data-testid="warehouse-stone">Stone: {{ selectedWarehouseInventory.quantities.stone }}</p>
              </section>
            }
            <button class="remove-action" type="button" (click)="removeSelectedBuilding()">
              Remove Selected Building
            </button>
          }
          @if (selectedRoad && !selectedBuilding) {
            <section class="production-card" data-testid="selected-road">
              <h3>Road segment</h3>
              <p data-testid="selected-road-cell">Cell: {{ selectedRoad.cell.x }}, {{ selectedRoad.cell.y }}</p>
              <p data-testid="selected-road-mask">Connections: {{ selectedRoadMask }}</p>
            </section>
            <button class="remove-action" type="button" (click)="removeSelectedRoad()">
              Remove Selected Road
            </button>
          }
        </section>
        @if (showTownFoundingDialog) {
          <section class="save-dialog" aria-labelledby="town-dialog-title" data-testid="town-founding-dialog">
            <h2 id="town-dialog-title">Found Town</h2>
            <p class="tool-note">The church and all currently qualifying unassigned residences will form this town.</p>
            <label>
              Town name
              <input
                type="text"
                data-testid="town-name"
                [value]="townName"
                (input)="townName = readInputValue($event); townNameError = null"
                maxlength="40"
                autofocus
              />
            </label>
            @if (townNameError) {
              <p class="placement-message is-error" data-testid="town-name-error" role="alert">{{ townNameError }}</p>
            }
            <div class="dialog-actions">
              <button type="button" data-testid="confirm-found-town" (click)="foundTown()">Found Town</button>
              <button class="secondary-action" type="button" (click)="closeFoundTownDialog()">Cancel</button>
            </div>
          </section>
        }
        @if (roadStates.length > 0) {
          <section class="production-card" data-testid="road-network-summary">
            <h3>Road network</h3>
            <p data-testid="road-count">Road cells: {{ roadStates.length }}</p>
            <p data-testid="road-layout" [attr.data-road-layout]="roadLayout">{{ roadLayout }}</p>
          </section>
        }
        <section class="production-card transport-summary" data-testid="transport-summary">
          <h3>Transport</h3>
          <p data-testid="active-van-count">Active courier vans: {{ transportSummary.activeVans }}</p>
          <p data-testid="pending-delivery-count">Pending deliveries: {{ transportSummary.pendingDeliveries }}</p>
          <p data-testid="blocked-delivery-count">Blocked deliveries: {{ transportSummary.blockedDeliveries }}</p>
          <p data-testid="completed-delivery-count">Completed deliveries: {{ transportSummary.completedDeliveries }}</p>
          @if (transportSummary.blockedDeliveries > 0) {
            <p class="transport-warning">Road access is needed before buffered mineral output can move.</p>
          }
        </section>
        @if (warehouseProductionStates.length > 0) {
          <section class="production-card" data-testid="warehouse-inventory-list">
            <h3>Warehouse inventories</h3>
            @for (warehouse of warehouseProductionStates; track warehouse.warehouseBuildingId) {
              <h4>{{ warehouse.warehouseBuildingId }}</h4>
              <p [attr.data-testid]="'warehouse-inventory-' + warehouse.warehouseBuildingId + '-iron-ore'">
                Iron ore: {{ warehouse.quantities['iron-ore'] }}
              </p>
              <p [attr.data-testid]="'warehouse-inventory-' + warehouse.warehouseBuildingId + '-copper-ore'">
                Copper ore: {{ warehouse.quantities['copper-ore'] }}
              </p>
              <p [attr.data-testid]="'warehouse-inventory-' + warehouse.warehouseBuildingId + '-stone'">
                Stone: {{ warehouse.quantities.stone }}
              </p>
            }
          </section>
        }
        @if (sceneError) {
          <p class="scene-error" role="alert">{{ sceneError }}</p>
        }

        @if (showSaveDialog) {
          <section class="save-dialog" aria-labelledby="save-dialog-title">
            <h2 id="save-dialog-title">Save World</h2>
            <label>
              Save name
              <input
                type="text"
                [value]="manualSaveName"
                (input)="manualSaveName = readInputValue($event)"
                maxlength="80"
                autofocus
              />
            </label>
            <div class="dialog-actions">
              <button type="button" (click)="saveManual()" [disabled]="isSaving">Save</button>
              <button class="secondary-action" type="button" (click)="closeSaveDialog()" [disabled]="isSaving">Cancel</button>
            </div>
          </section>
        }

        @if (!showSaveDialog) {
          <section class="production-card simulation-card" data-testid="simulation-controls" aria-labelledby="simulation-title">
            <div class="simulation-heading">
              <h3 id="simulation-title">Simulation</h3>
              <span
                class="simulation-status"
                [class.is-paused]="isSimulationPaused"
                data-testid="simulation-status"
                role="status"
              >{{ isSimulationPaused ? 'Paused' : 'Running' }}</span>
            </div>
            <p class="production-tick" data-testid="simulation-tick">
              Simulation tick: {{ world?.gameplay?.production?.tick ?? 0 }}
            </p>
            <div class="simulation-controls" role="group" aria-label="Simulation controls">
              <button
                type="button"
                class="simulation-pause"
                data-testid="simulation-pause"
                (click)="toggleSimulationPause()"
                [attr.aria-pressed]="isSimulationPaused"
              >{{ isSimulationPaused ? 'Resume' : 'Pause' }}</button>
              @for (speed of simulationSpeeds; track speed) {
                <button
                  type="button"
                  class="simulation-speed"
                  [class.is-active]="simulationSpeed === speed"
                  [attr.data-testid]="'simulation-speed-' + speed"
                  [attr.aria-pressed]="simulationSpeed === speed"
                  (click)="setSimulationSpeed(speed)"
                >{{ speed }}×</button>
              }
            </div>
            <p class="simulation-speed-note" data-testid="simulation-speed-label">
              Speed: {{ simulationSpeed }}×
            </p>
          </section>
          <button type="button" (click)="openSaveDialog()">Save World</button>
        }
        <button class="secondary-action" type="button" (click)="leaveWorld()" [disabled]="isLeaving">
          {{ isLeaving ? 'Saving…' : 'Leave World' }}
        </button>
      </section>
      }
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
        width: min(300px, calc(100vw - 48px));
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

      h2 {
        margin: 0;
        color: #f5e8d9;
        font-size: 15px;
      }

      .world-identity {
        margin: 0;
        color: #e0b487;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        overflow-wrap: anywhere;
      }

      .save-note {
        min-height: 30px;
        margin: 14px 0 0;
        color: #b9b0a7;
        font-size: 11px;
        line-height: 1.45;
      }

      .save-note.is-error {
        color: #efb29c;
      }

      .production-tick {
        margin: 10px 0 0;
        color: #b9b0a7;
        font-size: 10px;
      }

      .simulation-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .simulation-heading h3 {
        margin: 0;
      }

      .simulation-status {
        color: #94ddb0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .simulation-status.is-paused {
        color: #e0b487;
      }

      .simulation-controls {
        display: grid;
        grid-template-columns: 1.4fr repeat(3, 1fr);
        gap: 5px;
        margin-top: 5px;
      }

      .simulation-controls button {
        min-width: 0;
        padding: 7px 5px;
        color: #d9d0c7;
        background: rgba(255, 247, 237, 0.05);
        border: 1px solid rgba(247, 232, 214, 0.14);
        border-radius: 6px;
        cursor: pointer;
        font: inherit;
        font-size: 10px;
        font-weight: 650;
      }

      .simulation-controls button.is-active,
      .simulation-controls button.simulation-pause[aria-pressed='true'] {
        color: #fff3e4;
        background: rgba(186, 111, 69, 0.62);
        border-color: rgba(242, 184, 126, 0.58);
      }

      .simulation-speed-note {
        margin: 5px 0 0;
        color: #a9a097;
        font-size: 9px;
      }

      .selected-cell {
        margin: 0 0 4px;
        color: #f0c08c;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
      }

      .construction-tools {
        display: grid;
        gap: 8px;
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid rgba(247, 232, 214, 0.12);
      }

      .construction-tools h2 {
        font-size: 12px;
      }

      .tool-palette {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }

      .tool-palette button,
      .remove-action {
        padding: 9px 10px;
        color: #d9d0c7;
        background: rgba(255, 247, 237, 0.05);
        border: 1px solid rgba(247, 232, 214, 0.14);
        border-radius: 7px;
        cursor: pointer;
        font: inherit;
        font-size: 10px;
        font-weight: 650;
      }

      .production-card {
        display: grid;
        gap: 5px;
        padding: 10px;
        color: #d9d0c7;
        background: rgba(255, 247, 237, 0.04);
        border: 1px solid rgba(247, 232, 214, 0.12);
        border-radius: 8px;
        font-size: 10px;
      }

      .production-card h3,
      .production-card p {
        margin: 0;
      }

      .production-card h3 {
        color: #f5e8d9;
        font-size: 11px;
      }

      .production-card label {
        display: grid;
        gap: 5px;
        margin-top: 4px;
      }

      .production-card select {
        padding: 7px 8px;
        color: #f7ecdf;
        background: rgba(255, 247, 237, 0.07);
        border: 1px solid rgba(247, 232, 214, 0.16);
        border-radius: 6px;
        font: inherit;
        font-size: 10px;
      }

      .deposit-target {
        display: grid;
        gap: 5px;
        color: #a9a097;
        font-size: 10px;
      }

      .deposit-target select {
        padding: 7px 8px;
        color: #f7ecdf;
        background: rgba(255, 247, 237, 0.07);
        border: 1px solid rgba(247, 232, 214, 0.16);
        border-radius: 6px;
        font: inherit;
        font-size: 10px;
      }

      .tool-palette button.is-active {
        color: #fff3e4;
        background: rgba(186, 111, 69, 0.62);
        border-color: rgba(242, 184, 126, 0.58);
      }

      .tool-note,
      .placement-message {
        margin: 0;
        color: #b9b0a7;
        font-size: 10px;
        line-height: 1.4;
      }

      .placement-message {
        color: #94ddb0;
      }

      .placement-message.is-error {
        color: #ef9a9a;
      }

      .remove-action {
        width: 100%;
        color: #efc0ad;
        background: rgba(143, 60, 50, 0.26);
        border-color: rgba(239, 154, 140, 0.32);
      }

      .scene-error {
        margin: 10px 0 0;
        color: #efb29c;
        font-size: 11px;
        line-height: 1.45;
      }

      .world-hud > button,
      .dialog-actions button {
        width: 100%;
        margin-top: 10px;
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

      .world-hud > button:disabled,
      .dialog-actions button:disabled {
        cursor: wait;
        opacity: 0.55;
      }

      .secondary-action {
        color: #c9c1b8 !important;
        background: transparent !important;
        border-color: rgba(247, 232, 214, 0.14) !important;
      }

      .save-dialog {
        display: grid;
        gap: 10px;
        margin-top: 14px;
        padding: 14px;
        background: rgba(216, 160, 111, 0.1);
        border: 1px solid rgba(225, 177, 126, 0.3);
        border-radius: 10px;
      }

      .save-dialog label {
        display: grid;
        gap: 5px;
        color: #a9a097;
        font-size: 10px;
      }

      .save-dialog input {
        padding: 9px 10px;
        color: #f7ecdf;
        background: rgba(255, 247, 237, 0.07);
        border: 1px solid rgba(247, 232, 214, 0.16);
        border-radius: 7px;
        font: inherit;
        font-size: 12px;
      }

      .dialog-actions {
        display: grid;
        gap: 6px;
      }

      button:focus-visible,
      input:focus-visible {
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
  private readonly persistence = inject(SavePersistenceService);
  private readonly constructionDefinitions = createVelutinousManulConstructionDefinitionRegistry();
  private gameScene: import('./game-scene').GameScene | null = null;
  private isDestroyed = false;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private simulationTimer: ReturnType<typeof setInterval> | null = null;
  private lastSimulationAt = performance.now();
  private simulationClock: SimulationClockState = { productionAccumulatorSeconds: 0 };
  private productionTicksSinceCourierDispatch = 0;
  private autosavePromise: Promise<boolean> | null = null;
  world: WorldSessionData | null = this.sessionRuntime.getActiveWorld();
  private occupancy: CellOccupancy = createEmptyOccupancy();
  sceneError: string | null = null;
  saveError: string | null = null;
  saveMessage = 'Autosave is preparing…';
  selectedCell: CellCoordinate | null = null;
  activeTool: 'select' | 'mine' | 'warehouse' | 'church' | 'residential' | 'road' = 'select';
  placementPreview: PlacementValidationResult | null = null;
  roadPlacementPreview: RoadPlacementValidationResult | null = null;
  placementMessage: string | null = null;
  warehouseSelection = '';
  private warehouseSelectionChanged = false;
  mineralDepositSelection = '';
  showSaveDialog = false;
  manualSaveName = '';
  showTownFoundingDialog = false;
  townName = '';
  townNameError: string | null = null;
  inspectorOpen = false;
  townInfluenceVisible = true;
  isSaving = false;
  isLeaving = false;
  readonly simulationSpeeds = SIMULATION_SPEEDS;
  simulationSpeed: SimulationSpeed = 1;
  isSimulationPaused = false;
  readonly legacyHudEnabled = false;

  readonly velutinousManulChurchDefinitionId = VELUTINOUS_MANUL_CHURCH_DEFINITION_ID;
  readonly velutinousManulResidentialDefinitionId = VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID;

  @HostListener('document:keydown', ['$event'])
  handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    if (this.showTownFoundingDialog) {
      this.closeFoundTownDialog();
      return;
    }
    if (this.showSaveDialog) {
      this.closeSaveDialog();
      return;
    }
    if (this.activeTool !== 'select') {
      this.cancelPlacement();
      return;
    }
    if (this.inspectorOpen) {
      this.clearSelection();
    }
  }

  ngAfterViewInit(): void {
    if (!this.world) {
      void this.router.navigate(['/load-save'], {
        queryParams: { reason: 'session-unavailable' },
      }).catch(() => undefined);
      return;
    }

    this.world = {
      ...this.world,
      gameplay: {
        ...this.world.gameplay,
        towns: this.world.gameplay.towns ?? [],
        clearedCellIndices: this.getClearedCellIndices(
          this.world.gameplay.placedBuildings,
          this.world.gameplay.roads,
        ),
        production: reconcileMineralProductionState(
          this.world.gameplay.production,
          this.world.gameplay.placedBuildings,
        ),
        vehicles: this.world.gameplay.vehicles ?? [],
      },
    };
    this.sessionRuntime.setActiveWorld(this.world);
    this.rebuildOccupancy();
    this.dispatchAvailableCourierVans();

    setTimeout(() => {
      if (!this.isDestroyed) {
        void this.performAutosave();
      }
    }, 0);
    this.autosaveTimer = setInterval(() => {
      void this.performAutosave();
    }, AUTOSAVE_INTERVAL_MS);
    this.startSimulationTimer();

    void import('./game-scene')
      .then(({ GameScene }) => {
        if (this.isDestroyed || !this.world) {
          return;
        }
        this.gameScene = new GameScene(
          this.gameCanvas.nativeElement,
          this.sceneFrame.nativeElement,
        );
        this.gameScene.setCellInteractionCallbacks({
          onCellHover: (cell) => this.handleCellHover(cell),
          onCellClick: (cell) => this.handleCellClick(cell),
          onPointerLeave: () => this.handlePointerLeave(),
        });
        this.gameScene.setConstructionVisualState(
          this.world.gameplay.clearedCellIndices,
          getCurrentConstructionCellIndices(
            this.occupancy,
            this.world.gameplay.roads,
            this.getGridDimensions(),
          ),
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
          this.syncConstructionVisuals();
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

  openSaveDialog(): void {
    this.saveError = null;
    this.showSaveDialog = true;
    this.manualSaveName = `World — ${this.world?.map.configuration.seed ?? 'New World'}`;
  }

  closeSaveDialog(): void {
    if (!this.isSaving) {
      this.showSaveDialog = false;
    }
  }

  async saveManual(): Promise<void> {
    if (!this.world || this.isSaving) {
      return;
    }
    this.isSaving = true;
    this.saveError = null;
    try {
      let saved;
      try {
        saved = await this.persistence.saveManual(this.world, this.manualSaveName);
      } catch (error: unknown) {
        if (!(error instanceof SaveNameConflictError) ||
          !window.confirm(`Overwrite “${error.existing.slotName}”?`)) {
          throw error;
        }
        saved = await this.persistence.saveManual(
          this.world,
          this.manualSaveName,
          error.existing.saveId,
        );
      }
      this.world = saved.world;
      this.sessionRuntime.setActiveWorld(saved.world);
      this.syncConstructionVisuals();
      this.saveMessage = `Saved ${saved.slotName}. Autosave remains active.`;
      this.showSaveDialog = false;
    } catch (error: unknown) {
      this.saveError = getSaveErrorMessage(error, MANUAL_SAVE_FALLBACK);
    } finally {
      this.isSaving = false;
    }
  }

  readInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  selectTool(): void {
    this.activeTool = 'select';
    this.placementPreview = null;
    this.roadPlacementPreview = null;
    this.placementMessage = null;
    this.gameScene?.setPlacementPreview(null);
    this.gameScene?.setRoadPreview(null);
  }

  activateMineTool(): void {
    this.activateBuildingTool('mine');
    if (!this.mineralDepositSelection && this.mineralDeposits[0]) {
      this.mineralDepositSelection = String(this.mineralDeposits[0].id);
    }
  }

  activateWarehouseTool(): void {
    this.activateBuildingTool('warehouse');
  }

  activateChurchTool(): void {
    this.activateBuildingTool('church');
  }

  activateResidentialTool(): void {
    this.activateBuildingTool('residential');
  }

  activateRoadTool(): void {
    this.activeTool = 'road';
    this.placementPreview = null;
    this.roadPlacementPreview = null;
    this.placementMessage = 'Move over terrain to preview a road segment.';
    this.gameScene?.setPlacementPreview(null);
    if (this.selectedCell) {
      this.updateRoadPreview(this.selectedCell);
    }
  }

  handleToolChange(tool: GameplayTool): void {
    switch (tool) {
      case 'select':
        this.selectTool();
        return;
      case 'mine':
        this.activateMineTool();
        return;
      case 'warehouse':
        this.activateWarehouseTool();
        return;
      case 'church':
        this.activateChurchTool();
        return;
      case 'residential':
        this.activateResidentialTool();
        return;
      case 'road':
        this.activateRoadTool();
        return;
    }
  }

  cancelPlacement(): void {
    this.selectTool();
  }

  clearSelection(): void {
    this.selectedCell = null;
    this.inspectorOpen = false;
    this.gameScene?.setSelectedCell(null);
    this.syncTownVisualState();
  }

  focusTownById(townId: string): void {
    const town = this.towns.find((candidate) => candidate.id === townId);
    const church = town && this.world?.gameplay.placedBuildings.find((building) =>
      building.id === town.churchBuildingId,
    );
    if (!town || !church) {
      return;
    }
    this.selectCell(church.origin);
    this.gameScene?.focusCell(church.origin);
  }

  toggleTownInfluence(_townId: string): void {
    this.townInfluenceVisible = !this.townInfluenceVisible;
    this.syncTownVisualState();
  }

  setWarehouseDestination(value: string): void {
    this.warehouseSelection = value;
    this.warehouseSelectionChanged = true;
  }

  get towns(): readonly TownState[] {
    return this.world?.gameplay.towns ?? [];
  }

  get townSummaries(): readonly TownSummary[] {
    return this.towns.map((town) => {
      const capacity = getTownCapacity(town);
      return {
        id: town.id,
        name: town.name,
        residenceCount: town.residentialBuildingIds.length,
        populationCapacity: capacity.population,
        workerCapacity: capacity.workers,
      };
    });
  }

  get worldOverviewSummary(): WorldOverviewSummary {
    const transport = this.transportSummary;
    const warehouses = this.warehouseProductionStates;
    return {
      townCount: this.towns.length,
      populationCapacity: this.towns.reduce(
        (total, town) => total + getTownCapacity(town).population,
        0,
      ),
      workerCapacity: this.towns.reduce(
        (total, town) => total + getTownCapacity(town).workers,
        0,
      ),
      activeVans: transport.activeVans,
      pendingDeliveries: transport.pendingDeliveries,
      blockedDeliveries: transport.blockedDeliveries,
      completedDeliveries: transport.completedDeliveries,
      warehouseCount: warehouses.length,
      storedIronOre: warehouses.reduce((total, warehouse) => total + warehouse.quantities['iron-ore'], 0),
      storedCopperOre: warehouses.reduce((total, warehouse) => total + warehouse.quantities['copper-ore'], 0),
      storedStone: warehouses.reduce((total, warehouse) => total + warehouse.quantities.stone, 0),
      presetLabel: this.world ? formatWorldPresetLabel(this.world.map.configuration.preset) : 'Balanced Continental',
    };
  }

  get mineralDepositOptions(): readonly MineralDepositOption[] {
    return this.mineralDeposits.map((deposit) => ({ id: deposit.id, kind: deposit.kind }));
  }

  get warehouseOptions(): readonly WarehouseOption[] {
    return this.warehouseBuildings.map((warehouse, index) => ({
      id: warehouse.id,
      label: `Warehouse ${index + 1}`,
    }));
  }

  get selectedBuildingLabel(): string {
    return this.selectedBuilding ? getBuildingLabel(this.selectedBuilding.definitionId) : 'Building';
  }

  get selectedBuildingSubtitle(): string {
    if (this.selectedTown) {
      return this.selectedTown.name;
    }
    if (this.selectedBuilding?.definitionId === VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID) {
      return 'Housing';
    }
    if (this.selectedBuilding?.definitionId === VELUTINOUS_MANUL_CHURCH_DEFINITION_ID) {
      return 'Civic building';
    }
    return 'Construction';
  }

  get selectedRoadConnectionLabel(): string {
    return formatRoadConnections(this.selectedRoadMask);
  }

  get hasPlacementError(): boolean {
    return (this.placementPreview !== null && !this.placementPreview.valid) ||
      (this.roadPlacementPreview !== null && !this.roadPlacementPreview.valid);
  }

  get isSelectedChurchProtected(): boolean {
    const selectedBuilding = this.selectedBuilding;
    return selectedBuilding?.definitionId === VELUTINOUS_MANUL_CHURCH_DEFINITION_ID &&
      this.towns.some((town) => town.churchBuildingId === selectedBuilding.id &&
        town.residentialBuildingIds.length > 0);
  }

  get selectedTown(): TownState | null {
    const building = this.selectedBuilding;
    if (!building) {
      return null;
    }
    return this.towns.find((town) => town.churchBuildingId === building.id ||
      town.residentialBuildingIds.includes(building.id)) ?? null;
  }

  get foundingChurch(): PlacedBuildingState | null {
    const selected = this.selectedBuilding;
    if (!selected || !this.world) {
      return null;
    }
    if (selected.definitionId === VELUTINOUS_MANUL_CHURCH_DEFINITION_ID &&
        !this.towns.some((town) => town.churchBuildingId === selected.id)) {
      return selected;
    }
    if (selected.definitionId !== VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID) {
      return null;
    }
    const assignment = evaluateResidentialPlacement(
      selected,
      this.world.gameplay.placedBuildings,
      this.towns,
      this.constructionDefinitions,
    );
    return assignment.targetChurchId
      ? this.world.gameplay.placedBuildings.find((building) => building.id === assignment.targetChurchId) ?? null
      : null;
  }

  get foundationEvaluation() {
    const church = this.foundingChurch;
    return church && this.world
      ? evaluateTownFoundation(
        church,
        this.world.gameplay.placedBuildings,
        this.towns,
        this.constructionDefinitions,
      )
      : null;
  }

  getTownCapacity(town: TownState) {
    return getTownCapacity(town);
  }

  openFoundTownDialog(): void {
    const evaluation = this.foundationEvaluation;
    if (!evaluation?.valid) {
      this.placementMessage = evaluation?.failureCode === 'missing-residence'
        ? 'Place at least one qualifying residence before founding this town.'
        : 'This church cannot found a town here.';
      return;
    }
    let suggestedOrdinal = this.towns.length + 1;
    while (this.towns.some((town) => town.name.trim().toLocaleLowerCase() === `town ${suggestedOrdinal}`.toLocaleLowerCase())) {
      suggestedOrdinal += 1;
    }
    this.townName = `Town ${suggestedOrdinal}`;
    this.townNameError = null;
    this.showTownFoundingDialog = true;
  }

  closeFoundTownDialog(): void {
    this.showTownFoundingDialog = false;
    this.townNameError = null;
  }

  foundTown(): void {
    if (!this.world) {
      return;
    }
    const church = this.foundingChurch;
    const evaluation = church
      ? evaluateTownFoundation(
        church,
        this.world.gameplay.placedBuildings,
        this.towns,
        this.constructionDefinitions,
      )
      : null;
    if (!church || !evaluation?.valid) {
      this.townNameError = 'This church no longer has a valid town foundation.';
      return;
    }
    const nameError = validateTownName(this.townName, this.towns);
    if (nameError) {
      this.townNameError = nameError;
      return;
    }
    const town = createTownState(
      getNextTownId(this.towns),
      this.townName,
      church.id,
      evaluation.eligibleResidentialBuildingIds,
    );
    this.updatePlacedBuildings(
      this.world.gameplay.placedBuildings,
      this.world.gameplay.production,
      this.world.gameplay.roads,
      this.world.gameplay.vehicles,
      true,
      [...this.towns, town],
    );
    this.showTownFoundingDialog = false;
    this.townNameError = null;
    this.placementMessage = `Founded ${town.name} with ${town.residentialBuildingIds.length * 10} population and worker capacity.`;
  }

  get selectedBuilding(): PlacedBuildingState | null {
    if (!this.world || !this.selectedCell) {
      return null;
    }
    const cellIndex = cellCoordinateToIndex(
      this.selectedCell,
      this.getGridDimensions(),
    );
    if (cellIndex === null) {
      return null;
    }
    const buildingId = getOccupyingBuildingId(this.occupancy, cellIndex);
    return this.world.gameplay.placedBuildings.find((building) => building.id === buildingId) ?? null;
  }

  get selectedMineProduction(): MineProductionState | null {
    const selectedBuilding = this.selectedBuilding;
    if (!selectedBuilding || !this.world) {
      return null;
    }
    return this.world.gameplay.production.mines.find((mine) =>
      mine.mineBuildingId === selectedBuilding.id,
    ) ?? null;
  }

  get warehouseBuildings(): readonly PlacedBuildingState[] {
    return this.world?.gameplay.placedBuildings.filter((building) =>
      building.definitionId === VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID,
    ) ?? [];
  }

  get mineralDeposits(): readonly WorldSessionData['map']['authoritativeData']['deposits'][number][] {
    return this.world?.map?.authoritativeData?.deposits ?? [];
  }

  get selectedWarehouseInventory(): WorldSessionData['gameplay']['production']['warehouses'][number] | null {
    const selectedBuilding = this.selectedBuilding;
    if (!selectedBuilding || selectedBuilding.definitionId !== VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID) {
      return null;
    }
    return this.world?.gameplay.production.warehouses.find((warehouse) =>
      warehouse.warehouseBuildingId === selectedBuilding.id,
    ) ?? null;
  }

  get selectedWarehouseDestination(): string {
    if (this.warehouseSelectionChanged) {
      return this.warehouseSelection;
    }
    return this.selectedMineProduction?.assignedWarehouseId ?? '';
  }

  get warehouseProductionStates(): readonly WorldSessionData['gameplay']['production']['warehouses'][number][] {
    return this.world?.gameplay?.production?.warehouses ?? [];
  }

  get transportSummary() {
    const gameplay = this.world?.gameplay;
    if (!gameplay?.production) {
      return {
        activeVans: 0,
        pendingDeliveries: 0,
        blockedDeliveries: 0,
        completedDeliveries: 0,
      };
    }
    return getCourierVanTransportSummary(
      gameplay.production,
      gameplay.vehicles ?? [],
      gameplay.placedBuildings ?? [],
      gameplay.roads ?? [],
      this.constructionDefinitions,
    );
  }

  removeSelectedBuilding(): void {
    const selectedBuilding = this.selectedBuilding;
    if (!selectedBuilding || !this.world) {
      return;
    }
    if (selectedBuilding.definitionId === VELUTINOUS_MANUL_CHURCH_DEFINITION_ID &&
        this.towns.some((town) => town.churchBuildingId === selectedBuilding.id &&
          town.residentialBuildingIds.length > 0)) {
      this.placementMessage = 'A founded town church is protected from demolition.';
      return;
    }
    const cancelled = cancelCourierVansForBuilding(
      this.world.gameplay.production,
      this.world.gameplay.vehicles,
      selectedBuilding.id,
    );
    const production = removeBuildingProductionState(
      cancelled.production,
      selectedBuilding.id,
      selectedBuilding.definitionId,
    );
    this.updatePlacedBuildings(
      this.world.gameplay.placedBuildings.filter((building) => building.id !== selectedBuilding.id),
      production,
      this.world.gameplay.roads,
      cancelled.vehicles,
      true,
      removeBuildingFromTowns(this.towns, selectedBuilding.id),
    );
    this.placementMessage = `Removed the selected ${getBuildingLabel(selectedBuilding.definitionId)}.`;
    if (this.activeTool !== 'select' && this.selectedCell) {
      this.updatePlacementPreview(this.selectedCell);
    }
  }

  removeSelectedRoad(): void {
    const selectedRoad = this.selectedRoad;
    if (!selectedRoad || !this.world) {
      return;
    }
    this.updatePlacedBuildings(
      this.world.gameplay.placedBuildings,
      this.world.gameplay.production,
      removeRoad(this.world.gameplay.roads, selectedRoad.cell),
    );
    this.dispatchAvailableCourierVans();
    this.placementMessage = 'Removed road segment.';
    this.selectCell(selectedRoad.cell);
  }

  private selectCell(cell: CellCoordinate): void {
    this.selectedCell = { x: cell.x, y: cell.y };
    this.inspectorOpen = this.selectedBuilding !== null || this.selectedRoad !== null;
    this.warehouseSelection = this.selectedMineProduction?.assignedWarehouseId ?? '';
    this.warehouseSelectionChanged = false;
    this.gameScene?.setSelectedCell(this.selectedCell);
    this.syncTownVisualState();
  }

  private handleCellHover(cell: CellCoordinate): void {
    if (this.activeTool === 'road') {
      this.updateRoadPreview(cell);
    } else if (this.activeTool !== 'select') {
      this.updatePlacementPreview(cell);
    }
  }

  private handleCellClick(cell: CellCoordinate): void {
    if (this.activeTool === 'road') {
      this.placeRoad(cell);
      return;
    }
    if (this.activeTool !== 'select') {
      this.placeBuilding(cell);
      return;
    }
    this.selectCell(cell);
  }

  private handlePointerLeave(): void {
    if (this.activeTool === 'select') {
      return;
    }
    if (this.activeTool === 'road') {
      this.roadPlacementPreview = null;
      this.placementMessage = 'Move over terrain to preview a road segment.';
      this.gameScene?.setRoadPreview(null);
      return;
    }
    this.placementPreview = null;
    this.placementMessage = `Move over terrain to preview the ${getBuildingLabel(this.getActiveDefinitionId())}.`;
    this.gameScene?.setPlacementPreview(null);
  }

  private updatePlacementPreview(origin: CellCoordinate): void {
    const definitionId = this.getActiveDefinitionId();
    const label = getBuildingLabel(definitionId);
    const validation = this.validateBuilding(definitionId, origin);
    this.placementPreview = validation;
    this.placementMessage = validation.valid
      ? `Valid placement — click to place the ${label}.`
      : `Cannot place ${label}: ${getPlacementFailureMessage(validation)}`;
    this.gameScene?.setPlacementPreview(validation);
  }

  private updateRoadPreview(cell: CellCoordinate): void {
    if (!this.world) {
      return;
    }
    const validation = this.validateRoad(cell);
    this.roadPlacementPreview = validation;
    this.placementMessage = validation.valid
      ? `Valid placement — click to place the road segment.`
      : `Cannot place road: ${getRoadPlacementFailureMessage(validation)}`;
    this.gameScene?.setRoadPreview({
      cell: validation.cell,
      valid: validation.valid,
    });
  }

  private placeBuilding(origin: CellCoordinate): void {
    if (!this.world) {
      return;
    }
    const definitionId = this.getActiveDefinitionId();
    const label = getBuildingLabel(definitionId);
    const validation = this.validateBuilding(definitionId, origin);
    if (!validation.valid) {
      this.placementPreview = validation;
      this.placementMessage = `Cannot place ${label}: ${getPlacementFailureMessage(validation)}`;
      this.gameScene?.setPlacementPreview(validation);
      return;
    }

    const building: PlacedBuildingState = {
      id: createNextBuildingId(this.world.gameplay.placedBuildings, definitionId),
      definitionId,
      origin: { x: origin.x, y: origin.y },
      rotationQuarterTurns: 0,
    };
    let production = this.world.gameplay.production;
    if (definitionId === VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID) {
      const binding = this.findMineBinding(building);
      if (!binding) {
        this.placementMessage = `Cannot place ${label}: the shaft must reach a mineral deposit.`;
        return;
      }
      production = addMineProductionState(production, building, binding);
    } else if (definitionId === VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID) {
      production = addWarehouseProductionState(production, building.id);
    }
    let towns = this.towns;
    if (definitionId === VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID) {
      const assignment = evaluateResidentialPlacement(
        building,
        [...this.world.gameplay.placedBuildings, building],
        towns,
        this.constructionDefinitions,
      );
      if (!assignment.valid) {
        this.placementMessage = `Cannot place ${label}: ${getResidentialPlacementFailureMessage(assignment.failureCode)}`;
        return;
      }
      if (assignment.targetTownId) {
        towns = addResidenceToTown(towns, assignment.targetTownId, building.id);
      }
    }
    this.updatePlacedBuildings(
      [...this.world.gameplay.placedBuildings, building],
      production,
      this.world.gameplay.roads,
      this.world.gameplay.vehicles,
      true,
      towns,
    );
    this.dispatchAvailableCourierVans();
    this.selectCell(origin);
    this.placementMessage = `Placed ${label}.`;
    this.placementPreview = null;
    this.gameScene?.setPlacementPreview(null);
  }

  private placeRoad(cell: CellCoordinate): void {
    if (!this.world) {
      return;
    }
    const validation = this.validateRoad(cell);
    if (!validation.valid) {
      this.roadPlacementPreview = validation;
      this.placementMessage = `Cannot place road: ${getRoadPlacementFailureMessage(validation)}`;
      this.gameScene?.setRoadPreview({
        cell: validation.cell,
        valid: false,
      });
      return;
    }

    const roads = addRoad(this.world.gameplay.roads, cell);
    this.updatePlacedBuildings(
      this.world.gameplay.placedBuildings,
      this.world.gameplay.production,
      roads,
    );
    this.dispatchAvailableCourierVans();
    this.selectCell(cell);
    this.placementMessage = 'Placed road segment.';
    this.roadPlacementPreview = null;
    this.gameScene?.setRoadPreview(null);
  }

  private validateBuilding(
    definitionId: string,
    origin: CellCoordinate,
  ): PlacementValidationResult {
    if (!this.world) {
      throw new Error('Cannot validate placement without an active world.');
    }
    const validation = validateBuildingPlacement({
      dimensions: this.getGridDimensions(),
      mapData: this.world.map.authoritativeData,
      definitions: this.constructionDefinitions,
      occupancy: this.occupancy,
      roadCellIndices: getRoadCellIndices(this.world.gameplay.roads, this.getGridDimensions()),
      definitionId,
      origin,
      rotationQuarterTurns: 0,
    });
    if (!validation.valid) {
      return validation;
    }
    if (definitionId === VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID) {
      const candidate: PlacedBuildingState = {
        id: 'placement-preview',
        definitionId,
        origin: { x: origin.x, y: origin.y },
        rotationQuarterTurns: 0,
      };
      if (this.findMineBinding(candidate)) {
        return validation;
      }
      return {
        ...validation,
        valid: false,
        failures: [...validation.failures, { code: 'missing-mineral-deposit' }],
      };
    }
    if (definitionId === VELUTINOUS_MANUL_CHURCH_DEFINITION_ID) {
      return validation;
    }
    if (definitionId === VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID) {
      const candidate: PlacedBuildingState = {
        id: 'placement-preview',
        definitionId,
        origin: { x: origin.x, y: origin.y },
        rotationQuarterTurns: 0,
      };
      const settlementValidation = evaluateResidentialPlacement(
        candidate,
        [...this.world.gameplay.placedBuildings, candidate],
        this.towns,
        this.constructionDefinitions,
      );
      if (!settlementValidation.valid) {
        return {
          ...validation,
          valid: false,
          failures: [
            ...validation.failures,
            { code: settlementValidation.failureCode ?? 'outside-town-influence' },
          ],
        };
      }
      return validation;
    }
    return validation;
  }

  private findMineBinding(building: PlacedBuildingState) {
    if (!this.world) {
      return null;
    }
    const definition = this.constructionDefinitions.get(building.definitionId);
    if (!definition) {
      return null;
    }
    return findMineDepositBinding({
      mapData: this.world.map.authoritativeData,
      dimensions: this.getGridDimensions(),
      building,
      definition,
    });
  }

  private activateBuildingTool(tool: 'mine' | 'warehouse' | 'church' | 'residential'): void {
    this.activeTool = tool;
    this.roadPlacementPreview = null;
    this.gameScene?.setRoadPreview(null);
    const label = getBuildingLabel(this.getActiveDefinitionId());
    this.placementMessage = `Move over terrain to preview the ${label}.`;
    if (this.selectedCell) {
      this.updatePlacementPreview(this.selectedCell);
    }
  }

  focusSelectedMineralDeposit(): void {
    if (!this.world || !this.mineralDepositSelection) {
      return;
    }
    const depositId = Number(this.mineralDepositSelection);
    const deposit = this.mineralDeposits.find((candidate) => candidate.id === depositId);
    if (!deposit) {
      return;
    }
    const origin = this.findMineOriginForDeposit(deposit);
    if (!origin) {
      this.placementPreview = null;
      this.placementMessage = `No buildable 15×6 mine placement reaches deposit #${deposit.id}.`;
      this.gameScene?.setPlacementPreview(null);
      return;
    }
    this.activeTool = 'mine';
    this.selectCell(origin);
    this.gameScene?.focusCell(origin);
    this.updatePlacementPreview(origin);
  }

  prepareSelectedMineralDepositPlacement(): boolean {
    if (!this.world || !this.mineralDepositSelection) {
      return false;
    }
    const depositId = Number(this.mineralDepositSelection);
    const deposit = this.mineralDeposits.find((candidate) => candidate.id === depositId);
    if (!deposit) {
      return false;
    }
    const origin = this.findMineOriginForDeposit(deposit);
    if (!origin) {
      this.placementPreview = null;
      this.placementMessage = 'No buildable 15×6 mine placement reaches deposit #' + deposit.id + '.';
      this.gameScene?.setPlacementPreview(null);
      return false;
    }
    this.activeTool = 'mine';
    this.selectCell(origin);
    this.updatePlacementPreview(origin);
    return true;
  }

  placeFocusedMine(): void {
    if (this.activeTool !== 'mine' || !this.selectedCell || !this.placementPreview?.valid) {
      return;
    }
    this.placeBuilding(this.selectedCell);
  }

  placeWarehouseAtStartingArea(): void {
    if (!this.world || this.activeTool !== 'warehouse') {
      return;
    }
    const origin = this.findStartingWarehouseOrigin();
    if (!origin) {
      this.placementMessage = 'No valid starting-area warehouse placement is available.';
      return;
    }
    this.placeBuilding(origin);
  }

  private findStartingWarehouseOrigin(): CellCoordinate | null {
    if (!this.world) {
      return null;
    }
    const dimensions = this.getGridDimensions();
    const startingCell = this.world.map.generationSummary.startingCell;
    const center = {
      x: startingCell % dimensions.width,
      y: Math.floor(startingCell / dimensions.width),
    };
    for (let distance = 0; distance <= 24; distance += 1) {
      for (let offsetY = -distance; offsetY <= distance; offsetY += 1) {
        for (let offsetX = -distance; offsetX <= distance; offsetX += 1) {
          if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== distance) {
            continue;
          }
          const origin = { x: center.x - 7 + offsetX, y: center.y - 3 + offsetY };
          if (this.validateBuilding(VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID, origin).valid) {
            return origin;
          }
        }
      }
    }
    return null;
  }

  private findMineOriginForDeposit(
    deposit: WorldSessionData['map']['authoritativeData']['deposits'][number],
  ): CellCoordinate | null {
    const width = this.getGridDimensions().width;
    const center = { x: deposit.centerCell % width, y: Math.floor(deposit.centerCell / width) };
    for (let distance = 0; distance <= 2; distance += 1) {
      for (let offsetY = -distance; offsetY <= distance; offsetY += 1) {
        for (let offsetX = -distance; offsetX <= distance; offsetX += 1) {
          if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== distance) {
            continue;
          }
          const origin = { x: center.x - 12 + offsetX, y: center.y - 3 + offsetY };
          const validation = this.validateBuilding(
            VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID,
            origin,
          );
          if (validation.valid && this.findMineBinding({
            id: 'placement-preview',
            definitionId: VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID,
            origin,
            rotationQuarterTurns: 0,
          })?.deposit.id === deposit.id) {
            return origin;
          }
        }
      }
    }
    return null;
  }

  private getActiveDefinitionId(): string {
    if (this.activeTool === 'mine') {
      return VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID;
    }
    if (this.activeTool === 'warehouse') {
      return VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID;
    }
    if (this.activeTool === 'church') {
      return VELUTINOUS_MANUL_CHURCH_DEFINITION_ID;
    }
    if (this.activeTool === 'residential') {
      return VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID;
    }
    throw new Error('The active tool does not have a building definition.');
  }

  private validateRoad(cell: CellCoordinate): RoadPlacementValidationResult {
    if (!this.world) {
      throw new Error('Cannot validate road placement without an active world.');
    }
    return validateRoadPlacement({
      dimensions: this.getGridDimensions(),
      mapData: this.world.map.authoritativeData,
      occupancy: this.occupancy,
      roads: this.world.gameplay.roads,
      cell,
    });
  }

  formatMineralKind(kind: MineProductionState['resourceKind']): string {
    switch (kind) {
      case 'iron-ore':
        return 'Iron ore';
      case 'copper-ore':
        return 'Copper ore';
      case 'stone':
        return 'Stone';
    }
  }

  private updatePlacedBuildings(
    placedBuildings: readonly PlacedBuildingState[],
    production = this.world?.gameplay.production,
    roads = this.world?.gameplay.roads ?? [],
    vehicles = this.world?.gameplay.vehicles ?? [],
    syncStaticVisuals = true,
    towns = this.world?.gameplay.towns ?? [],
  ): void {
    if (!this.world) {
      return;
    }
    this.world = createUpdatedWorldSession({
      ...this.world,
      gameplay: {
        placedBuildings,
        towns,
        roads,
        clearedCellIndices: this.getClearedCellIndices(placedBuildings, roads),
        production: reconcileMineralProductionState(
          production ?? this.world.gameplay.production,
          placedBuildings,
        ),
        vehicles,
      },
    });
    this.sessionRuntime.setActiveWorld(this.world);
    this.syncConstructionVisuals(syncStaticVisuals);
  }

  private syncConstructionVisuals(syncStaticVisuals = true): void {
    if (syncStaticVisuals) {
      this.rebuildOccupancy();
      this.gameScene?.setConstructionVisualState(
        this.world?.gameplay.clearedCellIndices ?? [],
        this.world
          ? getCurrentConstructionCellIndices(
            this.occupancy,
            this.world.gameplay.roads,
            this.getGridDimensions(),
          )
          : [],
      );
      this.gameScene?.setPlacedBuildings(
        this.world?.gameplay.placedBuildings ?? [],
        this.constructionDefinitions,
      );
      this.gameScene?.setRoads(
        this.world?.gameplay.roads ?? [],
        deriveRoadConnectionMasks(this.world?.gameplay.roads ?? []),
      );
      this.gameScene?.setTownVisualState(
        this.world?.gameplay.towns ?? [],
        this.world?.gameplay.placedBuildings ?? [],
        this.constructionDefinitions,
        this.foundingChurch?.id ?? null,
        this.townInfluenceVisible,
      );
    }
    this.gameScene?.setCourierVans(this.world?.gameplay.vehicles ?? []);
  }

  private syncTownVisualState(): void {
    this.gameScene?.setTownVisualState(
      this.world?.gameplay.towns ?? [],
      this.world?.gameplay.placedBuildings ?? [],
      this.constructionDefinitions,
      this.foundingChurch?.id ?? null,
      this.townInfluenceVisible,
    );
  }

  private getClearedCellIndices(
    placedBuildings: readonly PlacedBuildingState[],
    roads: readonly RoadState[],
  ): readonly number[] {
    const dimensions = this.getGridDimensions();
    return mergeClearedCellIndices(
      dimensions,
      this.world?.gameplay.clearedCellIndices ?? [],
      getPlacedBuildingCellIndices(placedBuildings, dimensions, this.constructionDefinitions),
      [...getRoadCellIndices(roads, dimensions)],
    );
  }

  private rebuildOccupancy(): void {
    if (!this.world) {
      this.occupancy = createEmptyOccupancy();
      return;
    }
    this.occupancy = createCellOccupancy(
      this.getGridDimensions(),
      this.world.gameplay.placedBuildings,
      this.constructionDefinitions,
    ).occupancy;
  }

  private getGridDimensions(): { width: number; height: number } {
    return {
      width: this.world?.map.configuration.width ?? 1,
      height: this.world?.map.configuration.height ?? 1,
    };
  }

  get roadStates(): readonly RoadState[] {
    return this.world?.gameplay.roads ?? [];
  }

  get selectedRoad(): RoadState | null {
    if (!this.selectedCell) {
      return null;
    }
    return this.roadStates.find((road) =>
      road.cell.x === this.selectedCell?.x && road.cell.y === this.selectedCell?.y,
    ) ?? null;
  }

  get selectedRoadMask(): number {
    const selectedRoad = this.selectedRoad;
    if (!selectedRoad) {
      return 0;
    }
    return deriveRoadConnectionMasks(this.roadStates).get(getRoadCellKey(selectedRoad.cell)) ?? 0;
  }

  get roadLayout(): string {
    const masks = deriveRoadConnectionMasks(this.roadStates);
    return this.roadStates
      .map((road) => `${getRoadCellKey(road.cell)}:${masks.get(getRoadCellKey(road.cell)) ?? 0}`)
      .join('|');
  }

  readSelectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  setWarehouseSelection(event: Event): void {
    this.warehouseSelection = this.readSelectValue(event);
    this.warehouseSelectionChanged = true;
  }

  assignSelectedMineWarehouse(): void {
    const selectedMine = this.selectedMineProduction;
    if (!selectedMine || !this.world) {
      return;
    }
    // Keep the authoritative assignment when a re-selection happened before
    // the browser had restored the select's displayed value. An explicit
    // change to “Unassigned” still clears it.
    const warehouseId = this.warehouseSelectionChanged
      ? this.warehouseSelection || null
      : selectedMine.assignedWarehouseId;
    const production = assignMineWarehouse(
      this.world.gameplay.production,
      selectedMine.mineBuildingId,
      warehouseId,
    );
    // Assignment changes simulation state only; avoid rebuilding every authored
    // building mesh when the scene itself has not changed.
    this.updatePlacedBuildings(
      this.world.gameplay.placedBuildings,
      production,
      this.world.gameplay.roads,
      this.world.gameplay.vehicles,
      false,
    );
    this.dispatchAvailableCourierVans();
    this.warehouseSelection = this.world.gameplay.production.mines.find((mine) =>
      mine.mineBuildingId === selectedMine.mineBuildingId,
    )?.assignedWarehouseId ?? '';
    this.warehouseSelectionChanged = false;
    const warehouseLabel = warehouseId
      ? this.warehouseOptions.find((warehouse) => warehouse.id === warehouseId)?.label ?? 'the warehouse'
      : null;
    this.placementMessage = warehouseLabel
      ? `Assigned the mine to ${warehouseLabel}.`
      : 'Unassigned the mine from its warehouse.';
  }

  toggleSimulationPause(): void {
    if (!this.world || this.isLeaving) {
      return;
    }
    this.isSimulationPaused = !this.isSimulationPaused;
    this.resetSimulationTimeAnchor();
  }

  setSimulationSpeed(speed: SimulationSpeed): void {
    if (!this.simulationSpeeds.includes(speed)) {
      return;
    }
    this.simulationSpeed = speed;
    this.resetSimulationTimeAnchor();
  }

  async leaveWorld(): Promise<void> {
    if (this.isLeaving) {
      return;
    }
    this.isLeaving = true;
    this.stopSimulationTimer();
    const autosaved = await this.performAutosave();
    if (!autosaved) {
      this.isLeaving = false;
      this.startSimulationTimer();
      return;
    }
    this.stopAutosaveTimer();
    this.sessionRuntime.clearActiveWorld();
    await this.router.navigate(['/'], { queryParams: getRuntimeQueryParams() });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.stopAutosaveTimer();
    this.stopSimulationTimer();
    this.sessionRuntime.clearActiveWorld();
    this.gameScene?.destroy();
  }

  private performAutosave(): Promise<boolean> {
    if (!this.world) {
      return Promise.resolve(false);
    }
    if (this.autosavePromise) {
      return this.autosavePromise;
    }
    this.autosavePromise = this.writeAutosave().finally(() => {
      this.autosavePromise = null;
    });
    return this.autosavePromise;
  }

  private async writeAutosave(): Promise<boolean> {
    if (!this.world) {
      return false;
    }
    this.isSaving = true;
    try {
      const saved = await this.persistence.saveAutosave(this.world);
      this.world = saved.world;
      this.sessionRuntime.setActiveWorld(saved.world);
      this.syncConstructionVisuals();
      this.saveError = null;
      this.saveMessage = `Autosaved at ${new Date(saved.world.updatedAt).toLocaleTimeString()}.`;
      return true;
    } catch (error: unknown) {
      this.saveError = getSaveErrorMessage(error, AUTOSAVE_FALLBACK);
      return false;
    } finally {
      this.isSaving = false;
    }
  }

  private stopAutosaveTimer(): void {
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  private startSimulationTimer(): void {
    if (this.simulationTimer !== null) {
      return;
    }
    this.resetSimulationTimeAnchor();
    this.simulationTimer = setInterval(
      () => this.advanceSimulation(),
      VEHICLE_SIMULATION_STEP_SECONDS * 1_000,
    );
  }

  private stopSimulationTimer(): void {
    if (this.simulationTimer !== null) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
  }

  private resetSimulationTimeAnchor(): void {
    this.lastSimulationAt = performance.now();
  }

  private advanceSimulation(): void {
    const now = performance.now();
    const realElapsed = Math.min(
      VEHICLE_SIMULATION_MAX_DELTA_SECONDS,
      Math.max(0, (now - this.lastSimulationAt) / 1_000),
    );
    this.lastSimulationAt = now;
    if (!this.world || this.isSaving || this.isLeaving || this.isSimulationPaused) {
      return;
    }

    const clockAdvance = advanceSimulationClock(
      this.simulationClock,
      realElapsed,
      this.simulationSpeed,
    );
    this.simulationClock = clockAdvance.state;
    if (clockAdvance.steps.length === 0) {
      return;
    }

    let production = this.world.gameplay.production;
    let vehicles = this.world.gameplay.vehicles;
    let worldChanged = false;
    for (const step of clockAdvance.steps) {
      if (step.elapsedSeconds > Number.EPSILON && vehicles.length > 0) {
        const advanced = advanceCourierVans(production, vehicles, step.elapsedSeconds);
        production = advanced.production;
        vehicles = advanced.vehicles;
        worldChanged = true;
      }
      if (!step.runProductionTick) {
        continue;
      }
      const result = runMineralProductionTick(
        production,
        this.world.gameplay.placedBuildings,
      );
      production = result.production;
      this.productionTicksSinceCourierDispatch += 1;
      if (this.productionTicksSinceCourierDispatch >= COURIER_DISPATCH_INTERVAL_TICKS) {
        const dispatch = dispatchCourierVans(
          production,
          vehicles,
          this.world.gameplay.placedBuildings,
          this.world.gameplay.roads,
          this.constructionDefinitions,
        );
        production = dispatch.production;
        vehicles = dispatch.vehicles;
        this.productionTicksSinceCourierDispatch = 0;
      }
      worldChanged = true;
    }

    if (worldChanged) {
      this.updatePlacedBuildings(
        this.world.gameplay.placedBuildings,
        production,
        this.world.gameplay.roads,
        vehicles,
        false,
      );
    }
  }

  private dispatchAvailableCourierVans(): void {
    if (!this.world) {
      return;
    }
    const dispatch = dispatchCourierVans(
      this.world.gameplay.production,
      this.world.gameplay.vehicles,
      this.world.gameplay.placedBuildings,
      this.world.gameplay.roads,
      this.constructionDefinitions,
    );
    if (dispatch.dispatchedVans === 0) {
      return;
    }
    this.updatePlacedBuildings(
      this.world.gameplay.placedBuildings,
      dispatch.production,
      this.world.gameplay.roads,
      dispatch.vehicles,
    );
  }
}

function formatWorldPresetLabel(preset: WorldSessionData['map']['configuration']['preset']): string {
  switch (preset) {
    case 'riverlands':
      return 'Riverlands';
    case 'highland-frontier':
      return 'Highland Frontier';
    default:
      return 'Balanced Continental';
  }
}

function formatRoadConnections(mask: number): string {
  const directions: string[] = [];
  if ((mask & ROAD_CONNECTION_MASK.north) !== 0) directions.push('north');
  if ((mask & ROAD_CONNECTION_MASK.east) !== 0) directions.push('east');
  if ((mask & ROAD_CONNECTION_MASK.south) !== 0) directions.push('south');
  if ((mask & ROAD_CONNECTION_MASK.west) !== 0) directions.push('west');
  return directions.length > 0 ? `Connected ${directions.join(', ')}` : 'Standalone road segment';
}

function createEmptyOccupancy(): CellOccupancy {
  return {
    width: 1,
    height: 1,
    ownerByCell: new Int32Array([-1]),
    buildingIds: [],
  };
}

function createNextBuildingId(
  buildings: readonly PlacedBuildingState[],
  definitionId: string,
): string {
  const existingIds = new Set(buildings.map((building) => building.id));
  let ordinal = 1;
  while (existingIds.has(`${definitionId}-${ordinal}`)) {
    ordinal += 1;
  }
  return `${definitionId}-${ordinal}`;
}

function getBuildingLabel(definitionId: string): string {
  return definitionId === VELUTINOUS_MANUL_PLACEHOLDER_MINE_DEFINITION_ID
    ? 'shaft-house mine'
    : definitionId === VELUTINOUS_MANUL_WAREHOUSE_DEFINITION_ID
      ? 'arcaded warehouse'
      : definitionId === VELUTINOUS_MANUL_CHURCH_DEFINITION_ID
        ? 'church'
        : definitionId === VELUTINOUS_MANUL_RESIDENTIAL_01_DEFINITION_ID
          ? 'residence'
          : 'building';
}

function getPlacementFailureMessage(validation: PlacementValidationResult): string {
  const failure = validation.failures[0];
  switch (failure?.code) {
    case 'origin-out-of-bounds':
    case 'footprint-out-of-bounds':
      return 'the building footprint is outside the map';
    case 'not-buildable':
      return 'the terrain is not buildable';
    case 'impassable':
      return 'the terrain is impassable';
    case 'water':
      return 'the building must be placed on land';
    case 'slope-too-steep':
      return 'the terrain is too steep';
    case 'occupied':
      return 'the footprint is occupied';
    case 'road-occupied':
      return 'the footprint contains a road';
    case 'missing-mineral-deposit':
      return 'the mine shaft must reach an iron, copper, or stone deposit';
    case 'outside-town-influence':
      return 'the residence must be within a church or founded-town influence area';
    case 'ambiguous-town-influence':
      return 'the residence overlaps more than one church or town influence area';
    default:
      return 'the selected location is invalid';
  }
}

function getResidentialPlacementFailureMessage(
  failureCode: 'outside-town-influence' | 'ambiguous-town-influence' | undefined,
): string {
  return failureCode === 'ambiguous-town-influence'
    ? 'the residence overlaps more than one church or town influence area'
    : 'the residence must be within a church or founded-town influence area';
}

function getRoadPlacementFailureMessage(validation: RoadPlacementValidationResult): string {
  const failure = validation.failures[0];
  switch (failure?.code) {
    case 'out-of-bounds':
      return 'the road cell is outside the map';
    case 'not-buildable':
      return 'the terrain is not buildable';
    case 'impassable':
      return 'the terrain is impassable';
    case 'water':
      return 'the road must be placed on land';
    case 'slope-too-steep':
      return 'the terrain is too steep';
    case 'occupied-by-building':
      return 'the cell is occupied by a building';
    case 'duplicate-road':
      return 'a road already occupies this cell';
    default:
      return 'the selected location is invalid';
  }
}

const MANUAL_SAVE_FALLBACK =
  'Manual save could not be completed. Your world remains in memory; try again or create a portable backup.';
const AUTOSAVE_FALLBACK =
  'Autosave could not be completed. Your world remains in memory; try again or create a portable backup.';

function getSaveErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof SaveActionError || error instanceof SaveNameConflictError) {
    return error.message;
  }
  return fallbackMessage;
}

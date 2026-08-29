import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
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
import { BuildToolbar } from './build-toolbar';
import { FoundTownDialog } from './found-town-dialog';
import { GameplayStatusBar } from './gameplay-status-bar';
import type {
  GameplaySimulationSpeed,
  GameplayTool,
  MineralDepositOption,
  SystemsDrawerTab,
  TownSummary,
  WarehouseOption,
  WorldOverviewSummary,
} from './models';
import { SaveWorldDialog } from './save-world-dialog';
import { SelectionInspector } from './selection-inspector';
import { SimulationBar } from './simulation-bar';
import { SystemsDrawer } from './systems-drawer';
import { ToastStack } from './toast-stack';

@Component({
  selector: 'app-gameplay-shell',
  standalone: true,
  imports: [
    BuildToolbar,
    FoundTownDialog,
    GameplayStatusBar,
    SaveWorldDialog,
    SelectionInspector,
    SimulationBar,
    SystemsDrawer,
    ToastStack,
  ],
  encapsulation: ViewEncapsulation.None,
  template: `
    <section class="gameplay-shell" aria-label="Gameplay controls">
      <app-gameplay-status-bar
        [worldName]="worldName"
        [startingCell]="startingCell"
        [saveMessage]="saveMessage"
        [saveError]="saveError"
        [summary]="summary"
        [warehouseInventories]="warehouseInventories"
        [roadCount]="roadCount"
        [roadLayout]="roadLayout"
        [isLeaving]="isLeaving"
        (overview)="toggleOverview()"
        (save)="save.emit()"
        (leave)="leave.emit()"
      />

      <app-build-toolbar
        [activeTool]="activeTool"
        [mineralDeposits]="mineralDeposits"
        [mineralDepositSelection]="mineralDepositSelection"
        [placementPreviewValid]="placementPreviewValid"
        [placementMessage]="placementMessage"
        [placementMessageIsError]="placementMessageIsError"
        (toolChange)="toolChange.emit($event)"
        (depositChange)="depositChange.emit($event)"
        (focusDeposit)="focusDeposit.emit()"
        (prepareMine)="prepareMine.emit()"
        (placeFocusedMine)="placeFocusedMine.emit()"
        (placeStartingWarehouse)="placeStartingWarehouse.emit()"
        (cancel)="cancelPlacement.emit()"
      />

      <app-selection-inspector
        [open]="inspectorOpen"
        [selectedBuilding]="selectedBuilding"
        [selectedRoad]="selectedRoad"
        [selectedTown]="selectedTown"
        [townCapacity]="selectedTownCapacity"
        [buildingLabel]="buildingLabel"
        [buildingSubtitle]="buildingSubtitle"
        [foundingChurch]="foundingChurch"
        [foundationEvaluation]="foundationEvaluation"
        [selectedMineProduction]="selectedMineProduction"
        [selectedWarehouseInventory]="selectedWarehouseInventory"
        [warehouseOptions]="warehouseOptions"
        [selectedWarehouseDestination]="selectedWarehouseDestination"
        [roadConnections]="roadConnections"
        [roadMask]="roadMask"
        [churchProtected]="churchProtected"
        [influenceVisible]="influenceVisible"
        [churchDefinitionId]="churchDefinitionId"
        [residentialDefinitionId]="residentialDefinitionId"
        (close)="closeInspector.emit()"
        (foundTown)="openFoundTown.emit()"
        (focusTown)="focusTown.emit($event)"
        (toggleInfluence)="toggleInfluence.emit($event)"
        (warehouseChange)="warehouseChange.emit($event)"
        (assignWarehouse)="assignWarehouse.emit()"
        (removeBuilding)="removeBuilding.emit()"
        (removeRoad)="removeRoad.emit()"
      />

      <app-simulation-bar
        [paused]="simulationPaused"
        [simulationSpeed]="simulationSpeed"
        [simulationTick]="simulationTick"
        [speeds]="simulationSpeeds"
        (togglePause)="toggleSimulationPause.emit()"
        (speedChange)="speedChange.emit($event)"
      />

      <app-toast-stack
        [message]="placementMessage"
        [messageIsError]="placementMessageIsError"
        [sceneError]="sceneError"
      />

      <app-systems-drawer
        [open]="overviewOpen"
        [activeTab]="activeSystemsTab"
        [summary]="summary"
        [townSummaries]="townSummaries"
        [warehouseInventories]="warehouseInventories"
        (close)="closeOverview()"
        (tabChange)="activeSystemsTab = $event"
        (focusTown)="focusTown.emit($event); closeOverview()"
      />

      <app-found-town-dialog
        [open]="showTownFoundingDialog"
        [townName]="townName"
        [nameError]="townNameError"
        [eligibleResidenceCount]="eligibleResidenceCount"
        (nameChange)="townNameChange.emit($event)"
        (confirm)="confirmFoundTown.emit()"
        (cancel)="closeTownDialog.emit()"
      />

      <app-save-world-dialog
        [open]="showSaveDialog"
        [saveName]="manualSaveName"
        [saving]="isSaving"
        (nameChange)="saveNameChange.emit($event)"
        (confirm)="confirmSave.emit()"
        (cancel)="closeSaveDialog.emit()"
      />
    </section>
  `,
  styles: [
    `
      .gameplay-shell {
        position: absolute;
        inset: 0;
        z-index: 10;
        pointer-events: none;
        color: #f4eadc;
        font-family: Inter, system-ui, sans-serif;
      }

      .gameplay-shell app-gameplay-status-bar,
      .gameplay-shell app-build-toolbar,
      .gameplay-shell app-selection-inspector,
      .gameplay-shell app-simulation-bar,
      .gameplay-shell app-systems-drawer,
      .gameplay-shell app-toast-stack,
      .gameplay-shell app-found-town-dialog,
      .gameplay-shell app-save-world-dialog {
        display: block;
      }

      .gameplay-shell app-gameplay-status-bar,
      .gameplay-shell app-build-toolbar,
      .gameplay-shell app-selection-inspector,
      .gameplay-shell app-simulation-bar {
        pointer-events: auto;
      }

      .gameplay-status-bar {
        position: absolute;
        top: 16px;
        right: 16px;
        left: 16px;
        display: grid;
        grid-template-columns: minmax(180px, 0.85fr) minmax(360px, 1.6fr) minmax(340px, 1.4fr);
        align-items: center;
        gap: 16px;
        min-height: 58px;
        padding: 10px 14px 10px 18px;
        box-sizing: border-box;
        background: rgba(24, 29, 34, 0.9);
        border: 1px solid rgba(225, 177, 126, 0.28);
        border-radius: 14px;
        box-shadow: 0 14px 34px rgba(14, 17, 21, 0.28), inset 0 1px rgba(255, 239, 214, 0.08);
        backdrop-filter: blur(16px);
      }

      .status-identity {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      .status-brand,
      .toolbar-kicker,
      .panel-kicker,
      .card-kicker,
      .modal-kicker {
        color: #d8a06f;
        font-size: 9px;
        font-weight: 750;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .status-identity h1 {
        margin: 0;
        overflow: hidden;
        color: #fff3e4;
        font-size: 15px;
        font-weight: 650;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .status-metrics {
        display: flex;
        align-items: stretch;
        justify-content: center;
        gap: 8px;
        min-width: 0;
      }

      .status-metric {
        display: grid;
        gap: 2px;
        min-width: 62px;
        padding: 5px 9px;
        background: rgba(255, 247, 237, 0.045);
        border: 1px solid rgba(247, 232, 214, 0.1);
        border-radius: 8px;
      }

      .status-metric span {
        color: #a9a097;
        font-size: 8px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .status-metric strong {
        color: #f5e8d9;
        font-size: 13px;
        font-weight: 650;
        white-space: nowrap;
      }

      .status-metric.is-warning strong {
        color: #f0c08c;
      }

      .status-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 7px;
        min-width: 0;
      }

      .save-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        margin-right: 3px;
        overflow: hidden;
        color: #9eaa9b;
        font-size: 9px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .save-indicator.is-error {
        color: #efb29c;
      }

      .status-dot,
      .toast-dot,
      .simulation-state-dot {
        flex: 0 0 auto;
        width: 6px;
        height: 6px;
        background: #9cb27e;
        border-radius: 50%;
        box-shadow: 0 0 9px rgba(156, 178, 126, 0.7);
      }

      .save-indicator.is-error .status-dot {
        background: #d87964;
        box-shadow: 0 0 9px rgba(216, 121, 100, 0.7);
      }

      .status-button,
      .tool-button,
      .context-actions button,
      .context-primary,
      .inspector-actions button,
      .inspector-primary,
      .remove-action,
      .simulation-controls button,
      .drawer-tabs button,
      .town-list-item,
      .drawer-scrim,
      .inspector-close,
      .context-cancel,
      .modal-actions button {
        font: inherit;
        cursor: pointer;
      }

      .status-button {
        padding: 8px 10px;
        color: #d9d0c7;
        background: rgba(255, 247, 237, 0.055);
        border: 1px solid rgba(247, 232, 214, 0.14);
        border-radius: 7px;
        font-size: 10px;
        font-weight: 650;
        white-space: nowrap;
      }

      .status-button-primary,
      .context-primary,
      .inspector-primary,
      .modal-primary {
        color: #fff3e4;
        background: rgba(186, 111, 69, 0.78);
        border-color: rgba(242, 184, 126, 0.58);
      }

      .status-button-quiet {
        color: #aaa29b;
        background: transparent;
      }

      .build-toolbar,
      .selection-inspector {
        position: absolute;
        top: 92px;
        bottom: 82px;
        overflow-y: auto;
        box-sizing: border-box;
        background: rgba(24, 29, 34, 0.9);
        border: 1px solid rgba(225, 177, 126, 0.25);
        border-radius: 13px;
        box-shadow: 0 16px 38px rgba(14, 17, 21, 0.26), inset 0 1px rgba(255, 239, 214, 0.06);
        backdrop-filter: blur(15px);
      }

      .build-toolbar {
        left: 16px;
        width: 208px;
        padding: 14px;
      }

      .selection-inspector {
        right: 16px;
        width: min(336px, calc(100vw - 32px));
        padding: 17px;
      }

      .toolbar-heading,
      .inspector-heading,
      .drawer-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .toolbar-heading {
        display: grid;
        gap: 4px;
        margin: 1px 2px 13px;
      }

      .toolbar-heading h2,
      .inspector-heading h2,
      .drawer-heading h2,
      .gameplay-modal h2 {
        margin: 0;
        color: #f5e8d9;
        font-size: 16px;
        font-weight: 650;
        letter-spacing: -0.02em;
      }

      .tool-palette {
        display: grid;
        gap: 5px;
      }

      .tool-button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
        min-height: 37px;
        padding: 8px 9px 8px 11px;
        color: #c9c1b8;
        background: rgba(255, 247, 237, 0.045);
        border: 1px solid rgba(247, 232, 214, 0.1);
        border-radius: 8px;
        text-align: left;
        font-size: 11px;
        font-weight: 650;
      }

      .tool-button.is-active {
        color: #fff3e4;
        background: rgba(186, 111, 69, 0.62);
        border-color: rgba(242, 184, 126, 0.58);
        box-shadow: 0 0 0 1px rgba(242, 184, 126, 0.1);
      }

      .tool-context {
        display: grid;
        gap: 9px;
        margin-top: 13px;
        padding: 12px;
        background: rgba(216, 160, 111, 0.09);
        border: 1px solid rgba(225, 177, 126, 0.24);
        border-radius: 9px;
      }

      .context-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .context-heading strong {
        color: #f5e8d9;
        font-size: 11px;
      }

      .context-cancel {
        padding: 2px 4px;
        color: #c9a47e;
        background: transparent;
        border: 0;
        font-size: 9px;
      }

      .tool-context p,
      .card-copy,
      .inspector-empty p,
      .drawer-note,
      .drawer-empty span,
      .modal-copy,
      .inspector-note {
        margin: 0;
        color: #ada49b;
        font-size: 10px;
        line-height: 1.45;
      }

      .field-label,
      .modal-field {
        display: grid;
        gap: 5px;
        color: #bdb2a7;
        font-size: 10px;
      }

      .gameplay-shell select,
      .gameplay-shell input {
        width: 100%;
        min-width: 0;
        padding: 8px 9px;
        box-sizing: border-box;
        color: #f7ecdf;
        background: rgba(255, 247, 237, 0.07);
        border: 1px solid rgba(247, 232, 214, 0.16);
        border-radius: 7px;
        font: inherit;
        font-size: 11px;
      }

      .context-actions,
      .inspector-actions {
        display: grid;
        gap: 6px;
      }

      .context-actions button,
      .context-primary,
      .inspector-actions button,
      .inspector-primary {
        width: 100%;
        padding: 8px 9px;
        color: #e8d7c6;
        background: rgba(255, 247, 237, 0.055);
        border: 1px solid rgba(247, 232, 214, 0.14);
        border-radius: 7px;
        font-size: 10px;
        font-weight: 650;
      }

      .context-actions button:disabled,
      .inspector-primary:disabled,
      .remove-action:disabled,
      .modal-actions button:disabled {
        cursor: not-allowed;
        opacity: 0.48;
      }

      .tool-feedback {
        color: #94ddb0 !important;
      }

      .tool-feedback.is-error,
      .inspector-error,
      .modal-error {
        color: #ef9a9a !important;
      }

      .inspector-heading {
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(247, 232, 214, 0.11);
      }

      .inspector-subtitle {
        margin: 4px 0 0;
        color: #a9a097;
        font-size: 10px;
      }

      .inspector-close {
        display: grid;
        place-items: center;
        width: 25px;
        height: 25px;
        padding: 0;
        color: #d8a06f;
        background: rgba(255, 247, 237, 0.06);
        border: 1px solid rgba(247, 232, 214, 0.14);
        border-radius: 50%;
        font-size: 18px;
        line-height: 1;
      }

      .inspector-empty {
        display: grid;
        gap: 5px;
        padding: 18px 3px 10px;
      }

      .inspector-empty strong {
        color: #eee0d0;
        font-size: 12px;
      }

      .empty-mark {
        color: #d8a06f;
        font-size: 22px;
        line-height: 1;
      }

      .inspector-card {
        display: grid;
        gap: 9px;
        margin-top: 13px;
        padding: 12px;
        color: #d9d0c7;
        background: rgba(255, 247, 237, 0.045);
        border: 1px solid rgba(247, 232, 214, 0.12);
        border-radius: 9px;
        font-size: 10px;
      }

      .card-heading {
        display: grid;
        gap: 3px;
      }

      .card-heading strong {
        color: #f5e8d9;
        font-size: 12px;
      }

      .capacity-grid,
      .overview-stat-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .capacity-grid > div,
      .overview-stat-grid > div {
        display: grid;
        gap: 3px;
        padding: 8px;
        background: rgba(255, 247, 237, 0.045);
        border: 1px solid rgba(247, 232, 214, 0.08);
        border-radius: 7px;
      }

      .capacity-grid span,
      .overview-stat-grid span {
        color: #a9a097;
        font-size: 9px;
      }

      .capacity-grid strong,
      .overview-stat-grid strong {
        color: #f0c08c;
        font-size: 14px;
        font-weight: 650;
      }

      .inspector-card > p {
        margin: 0;
        color: #afa69c;
      }

      .foundation-checklist {
        display: grid;
        gap: 6px;
        margin: 0;
        padding: 0;
        color: #aaa097;
        list-style: none;
      }

      .foundation-checklist li {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      .foundation-checklist li.is-complete {
        color: #bfe1ae;
      }

      .foundation-checklist li span {
        color: #d8a06f;
      }

      .detail-list {
        display: grid;
        gap: 6px;
        margin: 0;
      }

      .detail-list > div {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }

      .detail-list dt {
        color: #a9a097;
      }

      .detail-list dd {
        margin: 0;
        color: #eee0d0;
        font-variant-numeric: tabular-nums;
        text-align: right;
      }

      .inspector-note {
        margin-top: 13px;
        padding: 10px;
        color: #b8d7a7;
        background: rgba(148, 221, 176, 0.08);
        border: 1px solid rgba(148, 221, 176, 0.18);
        border-radius: 8px;
      }

      .inspector-note.is-warning {
        color: #efc0ad;
        background: rgba(143, 60, 50, 0.19);
        border-color: rgba(239, 154, 140, 0.24);
      }

      .inspector-error,
      .modal-error {
        margin: 0;
        font-size: 10px;
        line-height: 1.4;
      }

      .remove-action {
        width: 100%;
        margin-top: 13px;
        padding: 9px 10px;
        color: #efc0ad;
        background: rgba(143, 60, 50, 0.26);
        border: 1px solid rgba(239, 154, 140, 0.32);
        border-radius: 7px;
        font-size: 10px;
        font-weight: 650;
      }

      .simulation-bar {
        position: absolute;
        bottom: 16px;
        left: 50%;
        display: flex;
        align-items: center;
        gap: 9px;
        max-width: calc(100vw - 32px);
        padding: 8px 10px;
        box-sizing: border-box;
        background: rgba(24, 29, 34, 0.9);
        border: 1px solid rgba(225, 177, 126, 0.25);
        border-radius: 10px;
        box-shadow: 0 12px 30px rgba(14, 17, 21, 0.24);
        backdrop-filter: blur(14px);
        transform: translateX(-50%);
      }

      .simulation-state {
        display: flex;
        align-items: center;
        gap: 5px;
        color: #94ddb0;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .simulation-state.is-paused {
        color: #e0b487;
      }

      .simulation-state.is-paused .simulation-state-dot {
        background: #d8a06f;
        box-shadow: 0 0 9px rgba(216, 160, 111, 0.7);
      }

      .simulation-controls {
        display: flex;
        gap: 4px;
      }

      .simulation-controls button {
        min-width: 34px;
        padding: 6px 7px;
        color: #d9d0c7;
        background: rgba(255, 247, 237, 0.05);
        border: 1px solid rgba(247, 232, 214, 0.14);
        border-radius: 6px;
        font-size: 10px;
        font-weight: 650;
      }

      .simulation-controls button.is-active,
      .simulation-controls button.simulation-pause[aria-pressed='true'] {
        color: #fff3e4;
        background: rgba(186, 111, 69, 0.62);
        border-color: rgba(242, 184, 126, 0.58);
      }

      .simulation-hint {
        color: #918980;
        font-size: 9px;
      }

      .gameplay-toast {
        position: absolute;
        bottom: 82px;
        left: 240px;
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: min(420px, calc(100vw - 500px));
        padding: 9px 11px;
        color: #bfe1ae;
        background: rgba(24, 29, 34, 0.9);
        border: 1px solid rgba(148, 221, 176, 0.2);
        border-radius: 8px;
        box-shadow: 0 10px 24px rgba(14, 17, 21, 0.24);
        font-size: 10px;
        line-height: 1.35;
        pointer-events: none;
        backdrop-filter: blur(10px);
      }

      .gameplay-toast.is-error {
        color: #efb29c;
        border-color: rgba(239, 154, 140, 0.28);
      }

      .gameplay-toast.is-error .toast-dot {
        background: #d87964;
        box-shadow: 0 0 9px rgba(216, 121, 100, 0.7);
      }

      .scene-toast {
        bottom: 119px;
      }

      .drawer-layer {
        position: absolute;
        inset: 0;
        pointer-events: auto;
      }

      .drawer-scrim {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        padding: 0;
        background: rgba(7, 11, 13, 0.28);
        border: 0;
        cursor: default;
      }

      .systems-drawer {
        position: absolute;
        top: 92px;
        bottom: 82px;
        left: 240px;
        display: flex;
        flex-direction: column;
        width: min(410px, calc(100vw - 280px));
        padding: 17px;
        box-sizing: border-box;
        overflow: hidden;
        background: rgba(24, 29, 34, 0.97);
        border: 1px solid rgba(225, 177, 126, 0.3);
        border-radius: 13px;
        box-shadow: 0 20px 48px rgba(14, 17, 21, 0.38);
        backdrop-filter: blur(16px);
      }

      .drawer-tabs {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
        margin-top: 16px;
        padding-bottom: 11px;
        border-bottom: 1px solid rgba(247, 232, 214, 0.1);
      }

      .drawer-tabs button {
        padding: 8px 4px;
        color: #a9a097;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        font-size: 9px;
        font-weight: 650;
      }

      .drawer-tabs button.is-active {
        color: #fff3e4;
        background: rgba(186, 111, 69, 0.35);
        border-color: rgba(242, 184, 126, 0.3);
      }

      .drawer-content {
        display: grid;
        gap: 11px;
        min-height: 0;
        padding-top: 14px;
        overflow-y: auto;
      }

      .drawer-summary-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        color: #b9b0a7;
        font-size: 11px;
      }

      .drawer-empty {
        display: grid;
        gap: 6px;
        padding: 24px 14px;
        color: #a9a097;
        background: rgba(255, 247, 237, 0.04);
        border: 1px solid rgba(247, 232, 214, 0.1);
        border-radius: 9px;
        text-align: center;
      }

      .drawer-empty strong {
        color: #f1e1d0;
        font-size: 12px;
      }

      .town-list {
        display: grid;
        gap: 6px;
      }

      .town-list-item {
        display: grid;
        gap: 5px;
        padding: 10px;
        color: #d9d0c7;
        background: rgba(255, 247, 237, 0.045);
        border: 1px solid rgba(247, 232, 214, 0.11);
        border-radius: 8px;
        text-align: left;
      }

      .town-list-item:hover,
      .town-list-item:focus-visible {
        background: rgba(216, 160, 111, 0.14);
        border-color: rgba(225, 177, 126, 0.38);
      }

      .town-list-name {
        display: flex;
        align-items: center;
        gap: 7px;
        color: #f5e8d9;
        font-size: 12px;
        font-weight: 650;
      }

      .town-dot {
        width: 7px;
        height: 7px;
        background: #94ddb0;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(148, 221, 176, 0.65);
      }

      .town-list-stats {
        color: #a9a097;
        font-size: 9px;
      }

      .inventory-row {
        display: grid;
        grid-template-columns: 1fr repeat(3, auto);
        align-items: center;
        gap: 8px;
        padding: 9px;
        color: #b9b0a7;
        background: rgba(255, 247, 237, 0.045);
        border: 1px solid rgba(247, 232, 214, 0.1);
        border-radius: 8px;
        font-size: 9px;
      }

      .world-detail {
        display: grid;
        gap: 4px;
        padding: 10px;
        background: rgba(255, 247, 237, 0.045);
        border: 1px solid rgba(247, 232, 214, 0.1);
        border-radius: 8px;
      }

      .world-detail span {
        color: #a9a097;
        font-size: 9px;
      }

      .world-detail strong {
        color: #f1e1d0;
        font-size: 12px;
      }

      .modal-backdrop {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
        background: rgba(7, 11, 13, 0.48);
        pointer-events: auto;
        backdrop-filter: blur(4px);
      }

      .gameplay-modal {
        display: grid;
        gap: 11px;
        width: min(370px, 100%);
        padding: 22px;
        box-sizing: border-box;
        color: #f4eadc;
        background: rgba(24, 29, 34, 0.98);
        border: 1px solid rgba(225, 177, 126, 0.34);
        border-radius: 14px;
        box-shadow: 0 24px 65px rgba(7, 11, 13, 0.5), inset 0 1px rgba(255, 239, 214, 0.08);
      }

      .modal-field input {
        padding: 10px;
        font-size: 13px;
      }

      .modal-actions {
        display: grid;
        gap: 7px;
        margin-top: 4px;
      }

      .modal-actions button {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid rgba(242, 184, 126, 0.58);
        border-radius: 7px;
        font-size: 11px;
        font-weight: 650;
      }

      .modal-secondary,
      .secondary-action {
        color: #c9c1b8 !important;
        background: transparent !important;
        border-color: rgba(247, 232, 214, 0.14) !important;
      }

      .gameplay-shell button:hover:not(:disabled) {
        filter: brightness(1.12);
      }

      .gameplay-shell button:focus-visible,
      .gameplay-shell input:focus-visible,
      .gameplay-shell select:focus-visible {
        outline: 2px solid #f0c08c;
        outline-offset: 3px;
      }

      .visually-hidden {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        padding: 0 !important;
        margin: -1px !important;
        overflow: hidden !important;
        clip: rect(0, 0, 0, 0) !important;
        white-space: nowrap !important;
        border: 0 !important;
      }

      @media (max-width: 1350px) {
        .gameplay-status-bar {
          grid-template-columns: minmax(170px, 0.8fr) minmax(280px, 1.35fr) minmax(300px, 1.35fr);
        }

        .status-actions {
          gap: 5px;
        }

        .save-indicator {
          max-width: 126px;
        }
      }

      @media (max-width: 1080px) {
        .gameplay-status-bar {
          grid-template-columns: minmax(150px, 0.7fr) 1fr auto;
        }

        .status-metric {
          min-width: 48px;
          padding-inline: 6px;
        }

        .status-button-quiet {
          display: none;
        }

        .status-metric-wide {
          display: none;
        }

        .build-toolbar {
          width: 180px;
          padding: 11px;
        }

        .systems-drawer {
          left: 208px;
          width: min(390px, calc(100vw - 240px));
        }

        .gameplay-toast {
          left: 208px;
          max-width: min(390px, calc(100vw - 500px));
        }
      }

      @media (max-height: 760px) {
        .gameplay-status-bar {
          top: 10px;
          min-height: 52px;
        }

        .build-toolbar,
        .selection-inspector,
        .systems-drawer {
          top: 72px;
          bottom: 68px;
        }

        .simulation-bar {
          bottom: 10px;
        }

        .gameplay-toast {
          bottom: 68px;
        }

        .scene-toast {
          bottom: 103px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .gameplay-shell * {
          scroll-behavior: auto !important;
          transition: none !important;
        }
      }
    `,
  ],
})
export class GameplayShell {
  @Input() worldName = 'World Session';
  @Input() startingCell: number | null = null;
  @Input() saveMessage = '';
  @Input() saveError: string | null = null;
  @Input() summary: WorldOverviewSummary = emptyWorldSummary();
  @Input() warehouseInventories: readonly WarehouseInventoryState[] = [];
  @Input() roadCount = 0;
  @Input() roadLayout = '';
  @Input() isLeaving = false;
  @Input() activeTool: GameplayTool = 'select';
  @Input() mineralDeposits: readonly MineralDepositOption[] = [];
  @Input() mineralDepositSelection = '';
  @Input() placementPreviewValid = false;
  @Input() placementMessage: string | null = null;
  @Input() placementMessageIsError = false;
  @Input() inspectorOpen = false;
  @Input() selectedBuilding: PlacedBuildingState | null = null;
  @Input() selectedRoad: RoadState | null = null;
  @Input() selectedTown: TownState | null = null;
  @Input() selectedTownCapacity: TownCapacity | null = null;
  @Input() buildingLabel = 'Building';
  @Input() buildingSubtitle = 'Construction';
  @Input() foundingChurch: PlacedBuildingState | null = null;
  @Input() foundationEvaluation: TownFoundationEvaluation | null = null;
  @Input() eligibleResidenceCount = 0;
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
  @Input() townSummaries: readonly TownSummary[] = [];
  @Input() sceneError: string | null = null;
  @Input() showTownFoundingDialog = false;
  @Input() townName = '';
  @Input() townNameError: string | null = null;
  @Input() showSaveDialog = false;
  @Input() manualSaveName = '';
  @Input() isSaving = false;
  @Input() simulationPaused = false;
  @Input() simulationSpeed: GameplaySimulationSpeed = 1;
  @Input() simulationTick = 0;
  @Input() simulationSpeeds: readonly GameplaySimulationSpeed[] = [1, 2, 4];

  @Output() readonly toolChange = new EventEmitter<GameplayTool>();
  @Output() readonly depositChange = new EventEmitter<string>();
  @Output() readonly focusDeposit = new EventEmitter<void>();
  @Output() readonly prepareMine = new EventEmitter<void>();
  @Output() readonly placeFocusedMine = new EventEmitter<void>();
  @Output() readonly placeStartingWarehouse = new EventEmitter<void>();
  @Output() readonly cancelPlacement = new EventEmitter<void>();
  @Output() readonly closeInspector = new EventEmitter<void>();
  @Output() readonly openFoundTown = new EventEmitter<void>();
  @Output() readonly confirmFoundTown = new EventEmitter<void>();
  @Output() readonly foundTown = new EventEmitter<void>();
  @Output() readonly focusTown = new EventEmitter<string>();
  @Output() readonly toggleInfluence = new EventEmitter<string>();
  @Output() readonly warehouseChange = new EventEmitter<string>();
  @Output() readonly assignWarehouse = new EventEmitter<void>();
  @Output() readonly removeBuilding = new EventEmitter<void>();
  @Output() readonly removeRoad = new EventEmitter<void>();
  @Output() readonly save = new EventEmitter<void>();
  @Output() readonly leave = new EventEmitter<void>();
  @Output() readonly townNameChange = new EventEmitter<string>();
  @Output() readonly closeTownDialog = new EventEmitter<void>();
  @Output() readonly saveNameChange = new EventEmitter<string>();
  @Output() readonly confirmSave = new EventEmitter<void>();
  @Output() readonly closeSaveDialog = new EventEmitter<void>();
  @Output() readonly toggleSimulationPause = new EventEmitter<void>();
  @Output() readonly speedChange = new EventEmitter<GameplaySimulationSpeed>();

  overviewOpen = false;
  activeSystemsTab: SystemsDrawerTab = 'towns';

  toggleOverview(): void {
    this.overviewOpen = !this.overviewOpen;
  }

  closeOverview(): void {
    this.overviewOpen = false;
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

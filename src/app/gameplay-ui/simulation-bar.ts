import { Component, EventEmitter, Input, Output } from '@angular/core';
import { GameplaySimulationSpeed } from './models';

@Component({
  selector: 'app-simulation-bar',
  standalone: true,
  template: `
    <footer class="simulation-bar" aria-label="Simulation controls" data-testid="simulation-controls">
      <span class="simulation-label">Simulation</span>
      <span class="simulation-state" [class.is-paused]="paused" data-testid="simulation-status" role="status">
        <span class="simulation-state-dot" aria-hidden="true"></span>
        {{ paused ? 'Paused' : 'Running' }}
      </span>
      <div class="simulation-controls" role="group" aria-label="Simulation speed">
        <button
          type="button"
          class="simulation-pause"
          data-testid="simulation-pause"
          [attr.aria-pressed]="paused"
          (click)="togglePause.emit()"
        >{{ paused ? 'Resume' : 'Pause' }}</button>
        @for (speed of speeds; track speed) {
          <button
            type="button"
            class="simulation-speed"
            [class.is-active]="simulationSpeed === speed"
            [attr.aria-pressed]="simulationSpeed === speed"
            [attr.data-testid]="'simulation-speed-' + speed"
            (click)="speedChange.emit(speed)"
          >{{ speed }}×</button>
        }
      </div>
      <span class="simulation-hint">{{ paused ? 'Simulation is paused' : 'World is advancing' }}</span>
      <span class="visually-hidden" data-testid="simulation-tick">Simulation tick: {{ simulationTick }}</span>
      <span class="visually-hidden" data-testid="simulation-speed-label">Speed: {{ simulationSpeed }}×</span>
    </footer>
  `,
})
export class SimulationBar {
  @Input() paused = false;
  @Input() simulationSpeed: GameplaySimulationSpeed = 1;
  @Input() simulationTick = 0;
  @Input() speeds: readonly GameplaySimulationSpeed[] = [1, 2, 4];

  @Output() readonly togglePause = new EventEmitter<void>();
  @Output() readonly speedChange = new EventEmitter<GameplaySimulationSpeed>();
}

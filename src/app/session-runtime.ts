import { Injectable } from '@angular/core';
import { WorldSession } from './save/save-contract';

@Injectable({ providedIn: 'root' })
export class WorldSessionRuntime {
  private activeWorld: WorldSession | null = null;

  setActiveWorld(world: WorldSession): void {
    this.activeWorld = world;
  }

  getActiveWorld(): WorldSession | null {
    return this.activeWorld;
  }

  clearActiveWorld(): void {
    this.activeWorld = null;
  }
}

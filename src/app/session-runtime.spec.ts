import { TestBed } from '@angular/core/testing';
import { WorldSession } from './save/save-contract';
import { WorldSessionRuntime } from './session-runtime';

describe('WorldSessionRuntime', () => {
  it('stores and clears only the ephemeral active world', () => {
    const runtime = TestBed.inject(WorldSessionRuntime);
    const world = {} as WorldSession;

    expect(runtime.getActiveWorld()).toBeNull();
    runtime.setActiveWorld(world);
    expect(runtime.getActiveWorld()).toBe(world);
    runtime.clearActiveWorld();
    expect(runtime.getActiveWorld()).toBeNull();
  });
});

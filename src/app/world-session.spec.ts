import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createCellOccupancy, type BuildingDefinition } from './construction';
import type {
  CourierVanState,
  PlacedBuildingState,
  WorldSession as WorldSessionData,
} from './save/save-contract';
import { SavePersistenceService } from './save/save-persistence';
import { WorldSessionRuntime } from './session-runtime';
import {
  advanceSimulationClock,
  COURIER_DISPATCH_INTERVAL_TICKS,
  WorldSession,
} from './world-session';

describe('advanceSimulationClock', () => {
  it('does not complete a production tick before one simulated second at 1×', () => {
    let first = advanceSimulationClock({ productionAccumulatorSeconds: 0 }, 0, 1);
    for (let index = 0; index < 3; index += 1) {
      first = advanceSimulationClock(first.state, 0.25, 1);
      expect(first.steps.some((step) => step.runProductionTick)).toBe(false);
    }
    const second = advanceSimulationClock(first.state, 0.25, 1);

    expect(second.steps.filter((step) => step.runProductionTick)).toHaveLength(1);
    expect(second.state.productionAccumulatorSeconds).toBeCloseTo(0);
  });

  it.each([
    { speed: 2 as const, realElapsedSeconds: 0.5 },
    { speed: 4 as const, realElapsedSeconds: 0.25 },
  ])('completes one production tick after the matching real-time interval at $speed×', ({
    speed,
    realElapsedSeconds,
  }) => {
    let result = advanceSimulationClock({ productionAccumulatorSeconds: 0 }, 0, speed);
    const cycles = realElapsedSeconds === 0.5 ? 2 : 1;
    for (let index = 0; index < cycles; index += 1) {
      result = advanceSimulationClock(result.state, realElapsedSeconds / cycles, speed);
    }

    expect(result.steps.filter((step) => step.runProductionTick)).toHaveLength(1);
    expect(result.state.productionAccumulatorSeconds).toBeCloseTo(0);
  });

  it('freezes the clock while paused', () => {
    const state = { productionAccumulatorSeconds: 0.4 };
    const result = advanceSimulationClock(state, 10, 4, true);

    expect(result.state).toBe(state);
    expect(result.steps).toEqual([]);
  });

  it('preserves fractional time across timer cycles', () => {
    const first = advanceSimulationClock(
      advanceSimulationClock(
        { productionAccumulatorSeconds: 0 },
        0.25,
        1,
      ).state,
      0.15,
      1,
    );
    let second = advanceSimulationClock(first.state, 0.25, 1);
    second = advanceSimulationClock(second.state, 0.25, 1);
    second = advanceSimulationClock(second.state, 0.1, 1);

    expect(first.state.productionAccumulatorSeconds).toBeCloseTo(0.4);
    expect(second.steps.filter((step) => step.runProductionTick)).toHaveLength(1);
  });

  it('applies a speed change only to elapsed time after the change', () => {
    const beforeSpeedChange = advanceSimulationClock(
      advanceSimulationClock(
        { productionAccumulatorSeconds: 0 },
        0.25,
        1,
      ).state,
      0.15,
      1,
    );
    const afterSpeedChange = advanceSimulationClock(
      beforeSpeedChange.state,
      0.1,
      4,
    );

    expect(afterSpeedChange.steps.some((step) => step.runProductionTick)).toBe(false);
    expect(afterSpeedChange.state.productionAccumulatorSeconds).toBeCloseTo(0.8);
  });

  it('clamps real elapsed time and splits fast-forward time into safe substeps', () => {
    const result = advanceSimulationClock(
      { productionAccumulatorSeconds: 0 },
      1,
      4,
    );

    expect(result.steps.length).toBe(4);
    expect(result.steps.every((step) => step.elapsedSeconds <= 0.25)).toBe(true);
    expect(result.steps.filter((step) => step.runProductionTick)).toHaveLength(1);
  });
});

describe('WorldSession', () => {
  let persistence: {
    saveAutosave: ReturnType<typeof vi.fn>;
    saveManual: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    persistence = {
      saveAutosave: vi.fn(),
      saveManual: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [WorldSession],
      providers: [
        provideRouter([]),
        { provide: SavePersistenceService, useValue: persistence },
        { provide: WorldSessionRuntime, useValue: new WorldSessionRuntime() },
      ],
    }).compileComponents();
  });

  it('renders scene preparation errors as an alert', () => {
    const fixture = TestBed.createComponent(WorldSession);
    fixture.detectChanges();

    fixture.componentInstance.sceneError =
      'The world session could not be prepared in this browser.';
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    expect(alert?.textContent).toContain('The world session could not be prepared');
    fixture.destroy();
  });

  it('offers the mine and warehouse as separate construction tools', () => {
    const fixture = TestBed.createComponent(WorldSession);
    fixture.detectChanges();

    const labels = [...fixture.nativeElement.querySelectorAll('.tool-palette button')]
      .map((button: Element) => button.textContent?.trim());
    expect(labels).toEqual(['Select', 'Mine', 'Warehouse', 'Road']);
    fixture.destroy();
  });

  it('renders automatic simulation controls with a running 1× default', () => {
    const fixture = TestBed.createComponent(WorldSession);
    fixture.detectChanges();

    const controls = fixture.nativeElement.querySelector('[data-testid="simulation-controls"]') as HTMLElement;
    expect(controls.textContent).toContain('Running');
    expect(controls.textContent).toContain('Simulation tick: 0');
    expect(controls.querySelector('[data-testid="simulation-speed-1"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(controls.querySelector('[data-testid="run-production-tick"]')).toBeNull();
    fixture.destroy();
  });

  it('pauses and resumes independently from the selected simulation speed', () => {
    const fixture = TestBed.createComponent(WorldSession);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    component.world = createWorldStub();
    fixture.detectChanges();

    const pause = fixture.nativeElement.querySelector('[data-testid="simulation-pause"]') as HTMLButtonElement;
    const speedFour = fixture.nativeElement.querySelector('[data-testid="simulation-speed-4"]') as HTMLButtonElement;
    pause.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="simulation-status"]')?.textContent)
      .toContain('Paused');
    expect(pause.textContent).toContain('Resume');

    speedFour.click();
    fixture.detectChanges();
    expect(component.simulationSpeed).toBe(4);
    expect(fixture.nativeElement.querySelector('[data-testid="simulation-status"]')?.textContent)
      .toContain('Paused');
    expect(speedFour.getAttribute('aria-pressed')).toBe('true');

    pause.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="simulation-status"]')?.textContent)
      .toContain('Running');
    fixture.destroy();
  });

  it('freezes courier vans while paused and advances them with production at the selected speed', () => {
    const fixture = TestBed.createComponent(WorldSession);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    component.world = createAssignedWorldWithVehicleStub();
    component.simulationSpeed = 2;
    component.isSimulationPaused = true;
    fixture.detectChanges();

    const internals = component as unknown as {
      lastSimulationAt: number;
      advanceSimulation(): void;
    };
    internals.lastSimulationAt = performance.now() - 100;
    internals.advanceSimulation();
    expect(component.world.gameplay.production.tick).toBe(0);
    expect(component.world.gameplay.vehicles[0]?.progress).toBe(0);

    component.toggleSimulationPause();
    internals.lastSimulationAt = performance.now() - 100;
    internals.advanceSimulation();
    expect(component.world.gameplay.production.tick).toBe(0);
    expect(component.world.gameplay.vehicles[0]?.progress).toBeCloseTo(0.6, 1);

    internals.lastSimulationAt = performance.now() - 250;
    internals.advanceSimulation();
    expect(component.world.gameplay.production.tick).toBe(0);
    expect(getVehicleRouteDistance(component.world.gameplay.vehicles[0])).toBeCloseTo(2.1, 1);

    internals.lastSimulationAt = performance.now() - 150;
    internals.advanceSimulation();
    expect(component.world.gameplay.production.tick).toBe(1);
    expect(component.world.gameplay.production.mines[0]?.producedTotal).toBe(10);
    expect(getVehicleRouteDistance(component.world.gameplay.vehicles[0])).toBeCloseTo(3, 1);
    fixture.destroy();
  });

  it('dispatches buffered output once every ten production ticks', () => {
    const fixture = TestBed.createComponent(WorldSession);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const world = createAssignedWorldStub();
    component.world = {
      ...world,
      gameplay: {
        ...world.gameplay,
        roads: Array.from({ length: 18 }, (_, index) => ({ cell: { x: index + 2, y: 1 } })),
      },
    };

    const internals = component as unknown as {
      constructionDefinitions: ReadonlyMap<string, BuildingDefinition>;
      lastSimulationAt: number;
      advanceSimulation(): void;
    };
    const oneCellDefinition = (id: string): BuildingDefinition => ({
      id,
      footprint: { width: 1, height: 1 },
      placement: {
        requiresBuildable: true,
        allowWater: false,
        allowImpassable: false,
        maxSlope: 1,
      },
    });
    internals.constructionDefinitions = new Map([
      [world.gameplay.placedBuildings[0]!.definitionId, oneCellDefinition(world.gameplay.placedBuildings[0]!.definitionId)],
      [world.gameplay.placedBuildings[1]!.definitionId, oneCellDefinition(world.gameplay.placedBuildings[1]!.definitionId)],
    ]);

    const advanceProductionTick = (): void => {
      for (let cycle = 0; cycle < 4; cycle += 1) {
        internals.lastSimulationAt = performance.now() - 0.25 * 1_000;
        internals.advanceSimulation();
      }
    };

    for (let tick = 0; tick < COURIER_DISPATCH_INTERVAL_TICKS - 1; tick += 1) {
      advanceProductionTick();
    }
    expect(component.world.gameplay.production.tick).toBe(COURIER_DISPATCH_INTERVAL_TICKS - 1);
    expect(component.world.gameplay.vehicles).toHaveLength(0);
    expect(component.world.gameplay.production.mines[0]?.outputBuffer).toBe(90);

    advanceProductionTick();

    expect(component.world.gameplay.production.tick).toBe(COURIER_DISPATCH_INTERVAL_TICKS);
    expect(component.world.gameplay.production.mines[0]?.outputBuffer).toBe(0);
    expect(component.world.gameplay.vehicles).toHaveLength(10);
    fixture.destroy();
  });

  it('uses a manual-save fallback for unexpected manual-save failures', async () => {
    const fixture = TestBed.createComponent(WorldSession);
    fixture.detectChanges();
    fixture.componentInstance.world = createWorldStub();
    fixture.componentInstance.manualSaveName = 'Test World';
    persistence.saveManual.mockRejectedValueOnce(new Error('quota exceeded'));

    await fixture.componentInstance.saveManual();
    fixture.detectChanges();

    const saveNote = fixture.nativeElement.querySelector('.save-note') as HTMLElement;
    expect(saveNote.textContent).toContain('Manual save could not be completed');
    expect(saveNote.textContent).not.toContain('Autosave could not be completed');
    fixture.destroy();
  });

  it('keeps the Autosave fallback for unexpected autosave failures', async () => {
    const fixture = TestBed.createComponent(WorldSession);
    fixture.detectChanges();
    fixture.componentInstance.world = createWorldStub();
    persistence.saveAutosave.mockRejectedValueOnce(new Error('quota exceeded'));

    const internals = fixture.componentInstance as unknown as {
      writeAutosave(): Promise<boolean>;
    };
    await internals.writeAutosave();
    fixture.detectChanges();

    const saveNote = fixture.nativeElement.querySelector('.save-note') as HTMLElement;
    expect(saveNote.textContent).toContain('Autosave could not be completed');
    fixture.destroy();
  });

  it('preserves the authoritative mine assignment when the select value is stale', () => {
    const fixture = TestBed.createComponent(WorldSession);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const world = createAssignedWorldStub();
    component.world = world;

    const internals = component as unknown as {
      occupancy: ReturnType<typeof createCellOccupancy>['occupancy'];
      constructionDefinitions: ReadonlyMap<string, unknown>;
      selectCell(cell: { x: number; y: number }): void;
      assignSelectedMineWarehouse(): void;
    };
    internals.occupancy = createCellOccupancy(
      { width: 40, height: 24 },
      world.gameplay.placedBuildings,
      internals.constructionDefinitions as never,
    ).occupancy;
    internals.selectCell({ x: 1, y: 1 });
    component.warehouseSelection = '';

    expect(component.selectedWarehouseDestination).toBe('warehouse-1');
    internals.assignSelectedMineWarehouse();

    expect(component.world?.gameplay.production.mines[0]?.assignedWarehouseId).toBe('warehouse-1');
    expect(component.warehouseSelection).toBe('warehouse-1');
    fixture.destroy();
  });
});

function createWorldStub(): WorldSessionData {
  return {
    sessionId: 'world-session-test',
    createdAt: 1,
    updatedAt: 1,
    map: {
      configuration: { seed: 'TEST-SEED' },
      generationSummary: {
        mapIdentity: 'test-map-identity',
        startingCell: 0,
      },
    },
    gameplay: { placedBuildings: [] },
  } as unknown as WorldSessionData;
}

function createAssignedWorldStub(): WorldSessionData {
  const mine: PlacedBuildingState = {
    id: 'mine-1',
    definitionId: 'velutinous-manul-placeholder-mine',
    origin: { x: 1, y: 1 },
    rotationQuarterTurns: 0,
  };
  const warehouse: PlacedBuildingState = {
    id: 'warehouse-1',
    definitionId: 'velutinous-manul-warehouse',
    origin: { x: 20, y: 1 },
    rotationQuarterTurns: 0,
  };
  return {
    sessionId: 'assigned-world-test',
    createdAt: 1,
    updatedAt: 1,
    map: {
      configuration: { seed: 'TEST-SEED', width: 40, height: 24 },
      generationSummary: { mapIdentity: 'assigned-world-test', startingCell: 0 },
    },
    gameplay: {
      placedBuildings: [mine, warehouse],
      roads: [],
      clearedCellIndices: [],
      production: {
        tick: 0,
        deposits: [{ depositId: 1, resourceKind: 'iron-ore', remainingCapacity: 0 }],
        mines: [{
          mineBuildingId: mine.id,
          depositId: 1,
          resourceKind: 'iron-ore',
          outputBuffer: 0,
          assignedWarehouseId: warehouse.id,
          producedTotal: 0,
          deliveredTotal: 0,
        }],
        warehouses: [{
          warehouseBuildingId: warehouse.id,
          quantities: { 'iron-ore': 0, 'copper-ore': 0, stone: 0 },
        }],
        transfers: [],
      },
      vehicles: [],
    },
  } as unknown as WorldSessionData;
}

function createAssignedWorldWithVehicleStub(): WorldSessionData {
  const world = createAssignedWorldStub();
  const vehicle: CourierVanState = {
    id: 'courier-van-1',
    transferId: 'transfer-1',
    sourceMineId: 'mine-1',
    destinationWarehouseId: 'warehouse-1',
    resourceKind: 'iron-ore',
    amount: 10,
    route: Array.from({ length: 11 }, (_, x) => ({ x, y: 0 })),
    routeIndex: 0,
    progress: 0,
    phase: 'enroute',
    phaseRemainingSeconds: 0,
  };
  return {
    ...world,
    gameplay: {
      ...world.gameplay,
      vehicles: [vehicle],
      production: {
        ...world.gameplay.production,
        transfers: [{
          id: 'transfer-1',
          sourceMineId: 'mine-1',
          destinationWarehouseId: 'warehouse-1',
          resourceKind: 'iron-ore',
          amount: 10,
          status: 'pending',
        }],
      },
    },
  } as unknown as WorldSessionData;
}

function getVehicleRouteDistance(vehicle: CourierVanState | undefined): number {
  return (vehicle?.routeIndex ?? 0) + (vehicle?.progress ?? 0);
}

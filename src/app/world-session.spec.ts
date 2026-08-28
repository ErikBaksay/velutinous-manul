import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createCellOccupancy } from './construction';
import type { PlacedBuildingState, WorldSession as WorldSessionData } from './save/save-contract';
import { SavePersistenceService } from './save/save-persistence';
import { WorldSessionRuntime } from './session-runtime';
import { WorldSession } from './world-session';

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
    },
    gameplay: {
      placedBuildings: [mine, warehouse],
      roads: [],
      clearedCellIndices: [],
      production: {
        tick: 0,
        deposits: [],
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

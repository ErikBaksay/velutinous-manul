import { TestBed } from '@angular/core/testing';
import type {
  PlacedBuildingState,
  TownState,
} from '../save/save-contract';
import { BuildToolbar } from './build-toolbar';
import { FoundTownDialog } from './found-town-dialog';
import { GameplayStatusBar } from './gameplay-status-bar';
import { SelectionInspector } from './selection-inspector';
import { SimulationBar } from './simulation-bar';
import { SystemsDrawer } from './systems-drawer';

describe('gameplay UI components', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        BuildToolbar,
        FoundTownDialog,
        GameplayStatusBar,
        SelectionInspector,
        SimulationBar,
        SystemsDrawer,
      ],
    }).compileComponents();
  });

  it('keeps construction tools repeatable and exposes the active tool state', () => {
    const fixture = TestBed.createComponent(BuildToolbar);
    const component = fixture.componentInstance;
    const selectedTools: string[] = [];
    component.toolChange.subscribe((tool) => selectedTools.push(tool));
    component.activeTool = 'residential';
    component.placementMessage = 'Move over terrain to preview the residence.';
    fixture.detectChanges();

    expect([...fixture.nativeElement.querySelectorAll('.tool-button')]
      .map((button: Element) => button.textContent?.trim()))
      .toEqual(['Select', 'Mine', 'Warehouse', 'Church', 'Residence', 'Road']);
    expect(fixture.nativeElement.querySelector('[aria-pressed="true"]')?.textContent).toContain('Residence');
    expect(fixture.nativeElement.querySelector('.tool-context')?.textContent)
      .toContain('Repeated placement');

    (fixture.nativeElement.querySelector('[aria-label="Construction tools"] button') as HTMLButtonElement).click();
    expect(selectedTools).toEqual(['select']);
    fixture.destroy();
  });

  it('shows type-specific church and residence inspection states', () => {
    const fixture = TestBed.createComponent(SelectionInspector);
    const component = fixture.componentInstance;
    component.open = true;
    component.churchDefinitionId = 'church';
    component.residentialDefinitionId = 'residence';
    component.selectedBuilding = building('church-1', 'church');
    component.selectedTown = town('town-1', 'Harbor', ['residence-1']);
    component.townCapacity = { population: 10, workers: 10 };
    component.buildingLabel = 'Church';
    component.churchProtected = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('protected while its town still has residences');
    expect(fixture.nativeElement.querySelector('[data-testid="remove-selected-building"]'))
      .toBeTruthy();

    component.selectedBuilding = building('residence-1', 'residence');
    component.selectedTown = null;
    component.churchProtected = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Population+10');
    expect(fixture.nativeElement.textContent).toContain('Workers+10');
    fixture.destroy();
  });

  it('renders the foundation checklist and emits a request for the naming dialog', () => {
    const fixture = TestBed.createComponent(SelectionInspector);
    const component = fixture.componentInstance;
    let requested = false;
    component.foundTown.subscribe(() => requested = true);
    component.open = true;
    component.selectedBuilding = building('church-1', 'church');
    component.foundingChurch = component.selectedBuilding;
    component.churchDefinitionId = 'church';
    component.foundationEvaluation = {
      valid: true,
      churchBuildingId: 'church-1',
      eligibleResidentialBuildingIds: ['residence-1'],
    };
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('1 qualifying residence');
    (fixture.nativeElement.querySelector('[data-testid="found-town"]') as HTMLButtonElement).click();
    expect(requested).toBe(true);
    fixture.destroy();
  });

  it('provides overview tabs and human-readable status summaries', () => {
    const drawer = TestBed.createComponent(SystemsDrawer);
    drawer.componentInstance.open = true;
    drawer.componentInstance.townSummaries = [{
      id: 'town-1',
      name: 'Harbor',
      residenceCount: 2,
      populationCapacity: 20,
      workerCapacity: 20,
    }];
    drawer.detectChanges();
    expect(drawer.nativeElement.textContent).toContain('Harbor');
    expect(drawer.nativeElement.querySelectorAll('[role="tab"]')).toHaveLength(4);
    (drawer.nativeElement.querySelector('[data-testid="overview-tab-storage"]') as HTMLButtonElement).click();
    drawer.componentInstance.activeTab = 'storage';
    drawer.detectChanges();
    expect(drawer.nativeElement.textContent).toContain('Stored materials');
    drawer.destroy();

    const status = TestBed.createComponent(GameplayStatusBar);
    status.componentInstance.summary = {
      townCount: 1,
      populationCapacity: 20,
      workerCapacity: 20,
      activeVans: 2,
      pendingDeliveries: 1,
      blockedDeliveries: 0,
      completedDeliveries: 3,
      warehouseCount: 1,
      storedIronOre: 0,
      storedCopperOre: 0,
      storedStone: 0,
      presetLabel: 'Balanced Continental',
    };
    status.detectChanges();
    expect(status.nativeElement.querySelector('h1')?.textContent).toContain('World Session');
    expect(status.nativeElement.textContent).toContain('Leave World');
    status.destroy();
  });

  it('closes the founding dialog with Escape and keeps the name field in the modal', () => {
    const fixture = TestBed.createComponent(FoundTownDialog);
    const component = fixture.componentInstance;
    let cancelled = false;
    component.cancel.subscribe(() => cancelled = true);
    component.open = true;
    component.townName = 'Town 1';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="town-name"]')?.value).toBe('Town 1');
    component.handleKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancelled).toBe(true);
    fixture.destroy();
  });

  it('marks simulation state and speed as accessible pressed controls', () => {
    const fixture = TestBed.createComponent(SimulationBar);
    fixture.componentInstance.paused = true;
    fixture.componentInstance.simulationSpeed = 4;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="simulation-status"]')?.textContent)
      .toContain('Paused');
    expect(fixture.nativeElement.querySelector('[data-testid="simulation-speed-4"]')
      ?.getAttribute('aria-pressed')).toBe('true');
    fixture.destroy();
  });
});

function building(id: string, definitionId: string): PlacedBuildingState {
  return {
    id,
    definitionId,
    origin: { x: 0, y: 0 },
    rotationQuarterTurns: 0,
  };
}

function town(id: string, name: string, residenceIds: readonly string[]): TownState {
  return {
    id,
    name,
    churchBuildingId: 'church-1',
    residentialBuildingIds: residenceIds,
  };
}

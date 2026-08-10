import { TestBed } from '@angular/core/testing';
import {
  App,
  formatGenerationDuration,
  formatGenerationMemory,
  getGenerationMilestoneIndex,
  getPlayerFacingDetail,
  normalizeGenerationProgress,
} from './app';
import { GenerationPhase } from './map/map-types';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the scene canvas', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('canvas')).toBeTruthy();
  });

  it('maps every worker phase into the intended player-facing milestone', () => {
    const phases: GenerationPhase[] = [
      'prepare',
      'terrain',
      'erosion',
      'sea-level-and-water',
      'hydrology',
      'biomes-and-landmasses',
      'resource-provinces',
      'resource-validation',
      'chunk-preparation',
      'complete',
    ];

    expect(phases.map(getGenerationMilestoneIndex)).toEqual([0, 0, 0, 1, 1, 2, 3, 4, 4, 4]);
    expect(phases.every((phase) => getPlayerFacingDetail(phase).length > 0)).toBeTrue();
  });

  it('normalizes progress and formats completion summary values', () => {
    expect(normalizeGenerationProgress(-1)).toBe(0);
    expect(normalizeGenerationProgress(0.42)).toBe(0.42);
    expect(normalizeGenerationProgress(2)).toBe(1);
    expect(normalizeGenerationProgress(Number.NaN)).toBe(0);
    expect(formatGenerationDuration(850)).toBe('850 ms');
    expect(formatGenerationDuration(1_250)).toBe('1.3 s');
    expect(formatGenerationMemory(4 * 1024 * 1024)).toBe('4.0 MB');
  });

  it('dismisses completion and error overlays through their recovery actions', () => {
    const app = TestBed.createComponent(App).componentInstance;

    app.overlayState = 'complete';
    app.exploreMap();
    expect(app.overlayState).toBe('hidden');
    expect(app.isExploring).toBeTrue();
    expect(app.isDockOpen).toBeFalse();

    app.openDock();
    expect(app.isDockOpen).toBeTrue();
    app.closeDock();
    expect(app.isDockOpen).toBeFalse();

    app.overlayState = 'error';
    app.editSettings();
    expect(app.overlayState).toBe('hidden');
    expect(app.isExploring).toBeTrue();
    expect(app.isDockOpen).toBeTrue();
  });
});

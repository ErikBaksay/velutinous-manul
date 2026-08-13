import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { WorldSession as WorldSessionData } from './save/save-contract';
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

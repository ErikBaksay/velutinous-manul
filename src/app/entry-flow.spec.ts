import { ActivatedRoute, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoadSave } from './load-save';
import { routes } from './app.routes';
import { StartScreen } from './start-screen';

describe('entry flow screens', () => {
  it('routes each start-screen action to its dedicated destination', async () => {
    await TestBed.configureTestingModule({
      imports: [StartScreen],
      providers: [provideRouter(routes)],
    }).compileComponents();

    const fixture = TestBed.createComponent(StartScreen);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;

    buttons[1]?.click();
    await fixture.whenStable();
    expect(router.url).toBe('/load-save');

    buttons[2]?.click();
    await fixture.whenStable();
    expect(router.url).toBe('/new-world');

    buttons[0]?.click();
    await fixture.whenStable();
    expect(router.url).toBe('/load-save?reason=missing-last-active');
  });

  it('shows the honest empty-save state and unavailable-session message', async () => {
    await TestBed.configureTestingModule({
      imports: [LoadSave],
      providers: [
        provideRouter(routes),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => key === 'reason' ? 'session-unavailable' : null,
              },
            },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LoadSave);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('No saved worlds');
    expect(text).toContain('This world session is no longer available');
    expect(text).toContain('Local save storage and portable import/export will arrive in a later milestone');
  });
});

import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { StartScreen } from './start-screen';
import { WorldSessionRuntime } from './session-runtime';

describe('application routes', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('declares the start, workshop, save, guarded world, and fallback routes', () => {
    expect(routes.map((route) => route.path)).toEqual(['', 'new-world', 'load-save', 'world', '**']);
    expect(routes.find((route) => route.path === 'world')?.canActivate?.length).toBe(1);
  });

  it('renders the dedicated start screen without creating a scene', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('app-start-screen')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });

  it('routes Continue to the explicit missing-last-active state', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/');
    fixture.detectChanges();
    await fixture.whenStable();
    const startScreen = fixture.debugElement.query(By.directive(StartScreen)).componentInstance as StartScreen;
    await startScreen.continueGame();
    fixture.detectChanges();

    expect(router.url).toBe('/load-save?reason=missing-last-active');
    expect(fixture.nativeElement.textContent).toContain('There is no last active save to continue');
  });

  it('redirects direct world access when no in-memory session exists', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/world');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(router.url).toBe('/load-save?reason=session-unavailable');
    expect(fixture.nativeElement.textContent).toContain('This world session is no longer available');
  });

});

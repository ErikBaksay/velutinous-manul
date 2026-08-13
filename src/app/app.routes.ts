import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { WorldWorkshop } from './app';
import { LoadSave } from './load-save';
import { WorldSessionRuntime } from './session-runtime';
import { StartScreen } from './start-screen';
import { WorldSession } from './world-session';

export const worldSessionGuard: CanActivateFn = () => {
  const sessionRuntime = inject(WorldSessionRuntime);
  const router = inject(Router);
  return sessionRuntime.getActiveWorld()
    ? true
    : router.createUrlTree(['/load-save'], {
      queryParams: { reason: 'session-unavailable' },
    });
};

export const routes: Routes = [
  { path: '', component: StartScreen },
  { path: 'new-world', component: WorldWorkshop },
  { path: 'load-save', component: LoadSave },
  { path: 'world', component: WorldSession, canActivate: [worldSessionGuard] },
  { path: '**', redirectTo: '' },
];

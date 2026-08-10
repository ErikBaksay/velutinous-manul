import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import {
  DEFAULT_MAP_CONFIG,
  GenerationPhase,
  MAX_WATER_COVERAGE,
  MapConfig,
  MapPreset,
  MapSummary,
} from './map/map-types';
import { MapWorkerClient } from './map/map-worker.client';
import { normalizeMapConfig } from './map/map-identity';

type MapSetting = 'waterCoverage' | 'terrainRoughness' | 'forestDensity' | 'resourceAbundance';

export type GenerationOverlayState = 'hidden' | 'generating' | 'complete' | 'error';

export interface GenerationProgressState {
  phase: GenerationPhase;
  progress: number;
  detail: string;
}

export interface GenerationMilestone {
  id: 'terrain' | 'waterways' | 'biomes-and-forests' | 'resources' | 'starting-area';
  label: string;
  phases: readonly GenerationPhase[];
}

export const GENERATION_MILESTONES: readonly GenerationMilestone[] = [
  { id: 'terrain', label: 'Terrain', phases: ['prepare', 'terrain', 'erosion'] },
  {
    id: 'waterways',
    label: 'Waterways',
    phases: ['sea-level-and-water', 'hydrology'],
  },
  {
    id: 'biomes-and-forests',
    label: 'Biomes & Forests',
    phases: ['biomes-and-landmasses'],
  },
  { id: 'resources', label: 'Resources', phases: ['resource-provinces'] },
  {
    id: 'starting-area',
    label: 'Starting Area',
    phases: ['resource-validation', 'chunk-preparation', 'complete'],
  },
];

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('sceneFrame', { static: true })
  private readonly sceneFrame!: ElementRef<HTMLElement>;

  @ViewChild('gameCanvas', { static: true })
  private readonly gameCanvas!: ElementRef<HTMLCanvasElement>;

  private gameScene: import('./game-scene').GameScene | null = null;
  private readonly mapWorkerClient = new MapWorkerClient();
  private isDestroyed = false;
  mapConfig: MapConfig = normalizeMapConfig(DEFAULT_MAP_CONFIG);
  isGenerating = true;
  generationError: string | null = null;
  overlayState: GenerationOverlayState = 'generating';
  generationProgress: GenerationProgressState = createInitialGenerationProgress();
  lastMapSummary: MapSummary | null = null;

  readonly generationMilestones = GENERATION_MILESTONES;
  readonly maxWaterCoveragePercent = MAX_WATER_COVERAGE * 100;

  get controlsLocked(): boolean {
    return this.overlayState !== 'hidden';
  }

  get progressPercent(): number {
    return Math.round(clamp(this.generationProgress.progress, 0, 1) * 100);
  }

  ngAfterViewInit(): void {
    void import('./game-scene')
      .then(({ GameScene }) => {
        if (this.isDestroyed) {
          return;
        }
        this.gameScene = new GameScene(
          this.gameCanvas.nativeElement,
          this.sceneFrame.nativeElement,
        );
        this.gameScene.setNavigationEnabled(false);
        this.startGeneration();
      })
      .catch((error: unknown) => {
        if (this.isDestroyed) {
          return;
        }
        this.isGenerating = false;
        this.overlayState = 'error';
        this.generationError =
          'The 3D map preview could not initialize in this browser. Try reloading or using a browser with WebGL support.';
        console.error('[scene] initialization failed', error);
      });
  }

  generateWorld(): void {
    if (this.isGenerating) {
      return;
    }

    this.startGeneration();
  }

  private startGeneration(): void {
    this.gameScene?.setNavigationEnabled(false);
    this.isGenerating = true;
    this.generationError = null;
    this.overlayState = 'generating';
    this.generationProgress = createInitialGenerationProgress();
    this.lastMapSummary = null;
    this.mapWorkerClient.generate({ ...this.mapConfig }, {
      onProgress: (message) => {
        this.generationProgress = {
          phase: message.phase,
          progress: normalizeGenerationProgress(message.progress),
          detail: getPlayerFacingDetail(message.phase),
        };
        console.debug('[map worker]', message.detail);
      },
      onComplete: (message) => {
        this.generationError = null;
        this.generationProgress = {
          phase: 'complete',
          progress: 1,
          detail: 'Preparing the starting view.',
        };
        this.lastMapSummary = message.summary;
        const initialReady = this.gameScene?.setMapData(
          message.data,
          message.summary.seaLevelSample,
          message.summary.startingCell,
        ) ?? Promise.resolve();
        void initialReady.then(() => {
          if (this.isDestroyed) {
            return;
          }
          this.isGenerating = false;
          this.generationProgress = {
            phase: 'complete',
            progress: 1,
            detail: 'Your world is ready to explore.',
          };
          this.overlayState = 'complete';
          console.info('[map worker] Gate 6.3 world generated', {
            summary: message.summary,
            heightRange: getHeightRange(message.data.heightSamples),
          });
        }).catch((error: unknown) => {
          if (this.isDestroyed) {
            return;
          }
          this.isGenerating = false;
          this.overlayState = 'error';
          this.generationError =
            'The world was generated, but the starting view could not be prepared. Try generating it again.';
          console.error('[chunk streaming] initial view preparation failed', error);
        });
      },
      onError: (message) => {
        this.isGenerating = false;
        this.overlayState = 'error';
        this.generationError =
          'This seed and these settings could not create a valid starting area. Try randomizing the seed or adjusting the world settings.';
        console.error('[map worker] Gate 6.3 generation failed', message.message);
      },
    });
  }

  exploreMap(): void {
    if (this.overlayState === 'complete') {
      this.overlayState = 'hidden';
      this.gameScene?.setNavigationEnabled(true);
    }
  }

  editSettings(): void {
    if (this.overlayState === 'error') {
      this.overlayState = 'hidden';
      this.gameScene?.setNavigationEnabled(true);
    }
  }

  isMilestoneComplete(index: number): boolean {
    return this.overlayState === 'complete' || index < this.getActiveMilestoneIndex();
  }

  isMilestoneActive(index: number): boolean {
    return this.overlayState === 'generating' && index === this.getActiveMilestoneIndex();
  }

  isMilestoneUpcoming(index: number): boolean {
    return !this.isMilestoneComplete(index) && !this.isMilestoneActive(index);
  }

  milestoneMarker(index: number): string {
    return this.isMilestoneComplete(index) ? '✓' : this.isMilestoneActive(index) ? '•' : '';
  }

  private getActiveMilestoneIndex(): number {
    return getGenerationMilestoneIndex(this.generationProgress.phase);
  }

  formatDuration(milliseconds: number): string {
    return formatGenerationDuration(milliseconds);
  }

  formatMemory(bytes: number): string {
    return formatGenerationMemory(bytes);
  }

  updateSeed(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.mapConfig = { ...this.mapConfig, seed: input.value };
    this.generationError = null;
  }

  randomizeSeed(): void {
    const values = new Uint32Array(2);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(values);
      this.mapConfig = {
        ...this.mapConfig,
        seed: `VM-${values[0].toString(16).padStart(8, '0')}-${values[1].toString(16).padStart(8, '0')}`,
      };
      this.generationError = null;
      return;
    }

    this.mapConfig = {
      ...this.mapConfig,
      seed: `VM-${Date.now().toString(36).toUpperCase()}`,
    };
    this.generationError = null;
  }

  selectPreset(preset: MapPreset): void {
    this.mapConfig = { ...this.mapConfig, preset };
    this.generationError = null;
  }

  updateSetting(setting: MapSetting, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value) / 100;
    this.mapConfig = { ...this.mapConfig, [setting]: value };
    this.generationError = null;
  }

  formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  presetLabel(preset: MapPreset): string {
    switch (preset) {
      case 'riverlands':
        return 'RIVERLANDS';
      case 'highland-frontier':
        return 'HIGHLAND FRONTIER';
      default:
        return 'BALANCED';
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.mapWorkerClient.dispose();
    this.gameScene?.destroy();
  }
}

function createInitialGenerationProgress(): GenerationProgressState {
  return {
    phase: 'prepare',
    progress: 0,
    detail: getPlayerFacingDetail('prepare'),
  };
}

export function getGenerationMilestoneIndex(phase: GenerationPhase): number {
  const milestoneIndex = GENERATION_MILESTONES.findIndex((milestone) =>
    milestone.phases.includes(phase),
  );
  return milestoneIndex >= 0 ? milestoneIndex : GENERATION_MILESTONES.length - 1;
}

export function getPlayerFacingDetail(phase: GenerationPhase): string {
  switch (phase) {
    case 'prepare':
      return 'Setting the world identity and preparing the terrain.';
    case 'terrain':
      return 'Shaping relief, landforms, and continental character.';
    case 'erosion':
      return 'Softening the terrain into natural-looking forms.';
    case 'sea-level-and-water':
      return 'Finding coastlines, oceans, and inland lakes.';
    case 'hydrology':
      return 'Carving the routes of rivers and waterways.';
    case 'biomes-and-landmasses':
      return 'Establishing climate, biomes, and forests.';
    case 'resource-provinces':
      return 'Placing regional resources across the world.';
    case 'resource-validation':
      return 'Securing a playable starting area.';
    case 'chunk-preparation':
      return 'Preparing the map for exploration.';
    case 'complete':
      return 'Your world is ready to explore.';
  }
}

export function normalizeGenerationProgress(value: number): number {
  return clamp(value, 0, 1);
}

export function formatGenerationDuration(milliseconds: number): string {
  if (milliseconds < 1_000) {
    return `${Math.max(0, Math.round(milliseconds))} ms`;
  }
  return `${(milliseconds / 1_000).toFixed(1)} s`;
}

export function formatGenerationMemory(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : minimum, minimum), maximum);
}

function getHeightRange(heights: Uint16Array): { minimum: number; maximum: number } {
  let minimum = 65_535;
  let maximum = 0;
  for (const height of heights) {
    minimum = Math.min(minimum, height);
    maximum = Math.max(maximum, height);
  }
  return { minimum, maximum };
}

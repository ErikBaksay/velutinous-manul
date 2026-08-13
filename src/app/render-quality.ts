export type RenderQualityPreset = 'low' | 'balanced' | 'high';

export interface RenderQualitySettings {
  readonly preset: RenderQualityPreset;
  readonly pixelRatio: number;
  readonly postProcessing: boolean;
  readonly gtaoSamples: number;
  readonly gtaoDenoiseSamples: number;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly environmentShadows: boolean;
  readonly environmentPlacementBudget: number;
  readonly environmentLodRadius: number;
}

const QUALITY_SETTINGS: Readonly<Record<RenderQualityPreset, RenderQualitySettings>> = Object.freeze({
  low: Object.freeze({
    preset: 'low',
    pixelRatio: 1,
    postProcessing: false,
    gtaoSamples: 0,
    gtaoDenoiseSamples: 0,
    shadows: false,
    shadowMapSize: 512,
    environmentShadows: false,
    environmentPlacementBudget: 180,
    environmentLodRadius: 1,
  }),
  balanced: Object.freeze({
    preset: 'balanced',
    pixelRatio: 1.25,
    postProcessing: false,
    gtaoSamples: 0,
    gtaoDenoiseSamples: 0,
    shadows: true,
    shadowMapSize: 1024,
    environmentShadows: false,
    environmentPlacementBudget: 320,
    environmentLodRadius: 2,
  }),
  high: Object.freeze({
    preset: 'high',
    pixelRatio: 1.5,
    postProcessing: true,
    gtaoSamples: 4,
    gtaoDenoiseSamples: 4,
    shadows: true,
    shadowMapSize: 1024,
    environmentShadows: true,
    environmentPlacementBudget: 480,
    environmentLodRadius: 3,
  }),
});

export function getRenderQualitySettings(): RenderQualitySettings {
  if (typeof window === 'undefined') {
    return QUALITY_SETTINGS.balanced;
  }

  const requested = new URLSearchParams(window.location.search).get('quality');
  if (requested === 'low' || requested === 'balanced' || requested === 'high') {
    return QUALITY_SETTINGS[requested];
  }

  return QUALITY_SETTINGS.balanced;
}

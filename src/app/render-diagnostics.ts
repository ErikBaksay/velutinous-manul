import { RenderQualityPreset } from './render-quality';

export interface RenderDiagnostics {
  readonly quality: RenderQualityPreset;
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly renderCpuMs: number;
  readonly sceneRenderCpuMs: number;
  readonly shadowPassCpuMs: number;
  readonly gtaoPassCpuMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly lines: number;
}

export interface RenderPassTimings {
  sceneRenderCpuMs: number;
  shadowPassCpuMs: number;
  gtaoPassCpuMs: number;
}

import {
  AuthoritativeMapData,
  GenerationPhase,
  MapConfig,
  MapSummary,
  TransferableMapData,
} from './map-types';

export type GenerateRequest = {
  kind: 'generate';
  requestId: number;
  config: MapConfig;
};

export type GenerateProgress = {
  kind: 'progress';
  requestId: number;
  phase: GenerationPhase;
  progress: number;
  detail: string;
};

export type GenerateComplete = {
  kind: 'complete';
  requestId: number;
  summary: MapSummary;
  data: TransferableMapData;
};

export type GenerateError = {
  kind: 'error';
  requestId: number;
  message: string;
};

export type GenerateResponse = GenerateProgress | GenerateComplete | GenerateError;

export interface MapWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null;
  onmessage: ((event: MessageEvent<GenerateResponse>) => void) | null;
  postMessage(message: GenerateRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface GenerateHandlers {
  onProgress?: (message: GenerateProgress) => void;
  onComplete?: (message: GenerateComplete) => void;
  onError?: (message: GenerateError) => void;
}

export function getMapDataTransferables(data: AuthoritativeMapData): Transferable[] {
  return [
    data.heightSamples.buffer as ArrayBuffer,
    data.moisture.buffer as ArrayBuffer,
    data.temperature.buffer as ArrayBuffer,
    data.biome.buffer as ArrayBuffer,
    data.waterKind.buffer as ArrayBuffer,
    data.flags.buffer as ArrayBuffer,
    data.landmassId.buffer as ArrayBuffer,
    data.resourceProvinceId.buffer as ArrayBuffer,
    data.resourceMask.buffer as ArrayBuffer,
    ...Object.keys(data.resourceIntensity)
      .sort()
      .map(
        (resourceKind) =>
          data.resourceIntensity[resourceKind as keyof typeof data.resourceIntensity]
            .buffer as ArrayBuffer,
      ),
  ];
}

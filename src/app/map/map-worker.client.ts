import {
  GenerateHandlers,
  GenerateResponse,
  MapWorkerLike,
} from './map-worker.protocol';
import { MapConfig } from './map-types';

export type MapWorkerFactory = () => MapWorkerLike;

export class MapWorkerClient {
  private worker: MapWorkerLike | null = null;
  private activeRequestId: number | null = null;
  private nextRequestId = 0;

  constructor(private readonly workerFactory: MapWorkerFactory = createMapWorker) {}

  generate(config: MapConfig, handlers: GenerateHandlers = {}): number {
    const requestId = ++this.nextRequestId;
    this.replaceWorker();

    const worker = this.workerFactory();
    this.worker = worker;
    this.activeRequestId = requestId;

    worker.onmessage = (event): void => {
      this.handleResponse(requestId, event.data, handlers);
    };
    worker.onerror = (event): void => {
      if (this.activeRequestId !== requestId) {
        return;
      }

      this.activeRequestId = null;
      handlers.onError?.({
        kind: 'error',
        requestId,
        message: event.message || 'Map generation worker failed.',
      });
    };
    worker.postMessage({
      kind: 'generate',
      requestId,
      config,
    });

    return requestId;
  }

  dispose(): void {
    this.replaceWorker();
    this.activeRequestId = null;
  }

  private handleResponse(
    requestId: number,
    response: GenerateResponse,
    handlers: GenerateHandlers,
  ): void {
    if (this.activeRequestId !== requestId || response.requestId !== requestId) {
      return;
    }

    switch (response.kind) {
      case 'progress':
        handlers.onProgress?.(response);
        return;
      case 'complete':
        this.activeRequestId = null;
        handlers.onComplete?.(response);
        return;
      case 'error':
        this.activeRequestId = null;
        handlers.onError?.(response);
        return;
    }
  }

  private replaceWorker(): void {
    if (!this.worker) {
      return;
    }

    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }
}

function createMapWorker(): MapWorkerLike {
  return new Worker(new URL('./map-generation.worker', import.meta.url), {
    type: 'module',
  });
}

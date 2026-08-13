import { DEFAULT_MAP_CONFIG, createEmptyAuthoritativeMapData } from './map-types';
import { GenerateResponse, getMapDataTransferables, MapWorkerLike } from './map-worker.protocol';
import { MapWorkerClient } from './map-worker.client';

describe('MapWorkerClient', () => {
  it('starts requests with increasing IDs and replaces the previous worker', () => {
    const workers: FakeMapWorker[] = [];
    const client = new MapWorkerClient(() => {
      const worker = new FakeMapWorker();
      workers.push(worker);
      return worker;
    });

    expect(client.generate(DEFAULT_MAP_CONFIG)).toBe(1);
    expect(workers[0].requests[0].requestId).toBe(1);

    expect(client.generate(DEFAULT_MAP_CONFIG)).toBe(2);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].requests[0].requestId).toBe(2);
  });

  it('forwards active progress and completion responses', () => {
    const worker = new FakeMapWorker();
    const progress: string[] = [];
    let completed = false;
    const client = new MapWorkerClient(() => worker);

    client.generate(DEFAULT_MAP_CONFIG, {
      onProgress: (message) => progress.push(message.detail),
      onComplete: () => {
        completed = true;
      },
    });
    worker.emit({
      kind: 'progress',
      requestId: 1,
      phase: 'prepare',
      progress: 0,
      detail: 'started',
    });
    worker.emit({
      kind: 'complete',
      requestId: 1,
      summary: createSummary(),
      data: createEmptyAuthoritativeMapData(),
    });

    expect(progress).toEqual(['started']);
    expect(completed).toBe(true);
  });

  it('ignores responses from a replaced request, even if an old handler fires', () => {
    const workers: FakeMapWorker[] = [];
    const progress: number[] = [];
    const client = new MapWorkerClient(() => {
      const worker = new FakeMapWorker();
      workers.push(worker);
      return worker;
    });

    client.generate(DEFAULT_MAP_CONFIG, {
      onProgress: (message) => progress.push(message.requestId),
    });
    const oldHandler = workers[0].onmessage;
    client.generate(DEFAULT_MAP_CONFIG, {
      onProgress: (message) => progress.push(message.requestId),
    });

    oldHandler?.({
      data: {
        kind: 'progress',
        requestId: 1,
        phase: 'terrain',
        progress: 0.5,
        detail: 'stale',
      },
    } as MessageEvent<GenerateResponse>);
    workers[1].emit({
      kind: 'progress',
      requestId: 2,
      phase: 'prepare',
      progress: 0,
      detail: 'active',
    });

    expect(progress).toEqual([2]);
  });

  it('reports active worker errors and ignores stale worker errors', () => {
    const workers: FakeMapWorker[] = [];
    const errors: string[] = [];
    const client = new MapWorkerClient(() => {
      const worker = new FakeMapWorker();
      workers.push(worker);
      return worker;
    });

    client.generate(DEFAULT_MAP_CONFIG, { onError: (message) => errors.push(message.message) });
    const oldErrorHandler = workers[0].onerror;
    client.generate(DEFAULT_MAP_CONFIG, { onError: (message) => errors.push(message.message) });

    oldErrorHandler?.({ message: 'stale error' } as ErrorEvent);
    workers[1].emitError('active error');

    expect(errors).toEqual(['active error']);
  });
});

describe('map data transferables', () => {
  it('returns one transferable buffer for every authoritative typed array', () => {
    const data = createEmptyAuthoritativeMapData();
    const transferables = getMapDataTransferables(data);
    const buffers = transferables.map((transferable) => transferable as ArrayBuffer);

    expect(transferables.length).toBe(14);
    expect(new Set(buffers).size).toBe(14);
  });
});

class FakeMapWorker implements MapWorkerLike {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<GenerateResponse>) => void) | null = null;
  requests: Array<{ requestId: number }> = [];
  terminated = false;

  postMessage(message: { requestId: number }): void {
    this.requests.push({ requestId: message.requestId });
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(response: GenerateResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<GenerateResponse>);
  }

  emitError(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function createSummary() {
  return {
    seed: DEFAULT_MAP_CONFIG.seed,
    configHash: 'config',
    mapIdentity: 'identity',
    mapHash: 'map',
    seaLevelSample: 0,
    riverCellCount: 0,
    regionCount: 0,
    buildableCellCount: 0,
    resourceProvinceCount: 0,
    resourceSourceCount: 0,
    startingCell: 0,
    startingBuildableCellCount: 0,
    startingStonePathCost: 0,
    startingTimberPathCost: 0,
    startingFertileLandPathCost: 0,
    startingIronPathCost: 0,
    startingCopperPathCost: 0,
    startingValidCandidateCount: 0,
    generationDurationMs: 0,
    estimatedFinalBytes: 0,
    estimatedPeakBytes: 0,
  };
}

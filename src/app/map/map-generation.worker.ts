import {
  createConfigHash,
  createMapHash,
  createMapIdentity,
  normalizeMapConfig,
} from './map-identity';
import { estimateMapMemory } from './map-memory';
import {
  GenerateComplete,
  GenerateError,
  GenerateProgress,
  GenerateRequest,
  GenerateResponse,
  getMapDataTransferables,
} from './map-worker.protocol';
import { createEmptyAuthoritativeMapData } from './map-types';
import { generateTerrainHeightSamples } from './terrain-generation';
import { applyLightweightErosion, classifyOceanAndLakes } from './water-generation';
import { generateRivers } from './hydrology-generation';
import { generateBiomesAndLandmasses } from './biome-generation';
import { generateResourceProvincesAndFields } from './resource-generation';
import {
  repairStartingResources,
  selectStartingBasin,
  selectStartingBasinCandidate,
} from './starting-basin-generation';

interface MapWorkerScope {
  onmessage: ((event: MessageEvent<GenerateRequest>) => void) | null;
  postMessage(message: GenerateResponse, transfer?: Transferable[]): void;
}

const workerScope = self as unknown as MapWorkerScope;

workerScope.onmessage = (event: MessageEvent<GenerateRequest>): void => {
  const request = event.data;
  if (!request || request.kind !== 'generate') {
    return;
  }

  const startedAt = performance.now();
  postProgress(request.requestId, 'prepare', 0, 'Worker started; preparing the terrain heightfield.');

  try {
    const config = normalizeMapConfig(request.config);
    const data = createEmptyAuthoritativeMapData();
    const memory = estimateMapMemory();

    postProgress(request.requestId, 'terrain', 0.08, 'Generating deterministic layered terrain noise.');
    generateTerrainHeightSamples(config, data.heightSamples);
    postProgress(request.requestId, 'terrain', 0.8, 'Terrain heightfield generated.');
    postProgress(request.requestId, 'erosion', 0.82, 'Applying bounded deterministic terrain smoothing.');
    applyLightweightErosion(data.heightSamples);
    postProgress(request.requestId, 'sea-level-and-water', 0.84, 'Solving sea level and classifying water bodies.');
    const water = classifyOceanAndLakes(data, config);
    postProgress(
      request.requestId,
      'sea-level-and-water',
      0.9,
      `Classified ${water.oceanCellCount} ocean cells and ${water.lakeCellCount} lake cells.`,
    );
    postProgress(request.requestId, 'hydrology', 0.92, 'Computing deterministic downhill flow and accumulation.');
    const hydrology = generateRivers(data);
    postProgress(
      request.requestId,
      'hydrology',
      0.96,
      `Rasterized ${hydrology.riverCellCount} river cells with ${hydrology.riverTerminationCount} terminations.`,
    );
    postProgress(request.requestId, 'biomes-and-landmasses', 0.97, 'Deriving climate, biomes, and landmass IDs.');
    const biomes = generateBiomesAndLandmasses(data, config);
    postProgress(
      request.requestId,
      'biomes-and-landmasses',
      0.985,
      `Classified ${biomes.buildableCellCount} buildable cells across ${biomes.landmassCount} landmasses.`,
    );
    postProgress(
      request.requestId,
      'resource-provinces',
      0.99,
      'Generating deterministic resource provinces, renewable fields, and mineral deposits.',
    );
    const resources = generateResourceProvincesAndFields(data, config);
    postProgress(
      request.requestId,
      'resource-provinces',
      0.995,
      `Assigned ${resources.resourceProvinceCount} provinces, ${resources.timberCellCount} timber cells, ${resources.fertileCellCount} fertile cells, and ${resources.depositSources.length} mineral deposits.`,
    );
    postProgress(
      request.requestId,
      'resource-validation',
      0.997,
      'Selecting a deterministic starting basin and validating coarse resource reachability.',
    );
    const startingCandidate = selectStartingBasinCandidate(data, config);
    repairStartingResources(data, startingCandidate);
    const startingBasin = selectStartingBasin(data, config);
    postProgress(
      request.requestId,
      'resource-validation',
      0.998,
      `Selected start cell ${startingBasin.startingCell} with ${startingBasin.buildableCellCount} reachable buildable cells and copper path cost ${startingBasin.copperPathCost}.`,
    );
    postProgress(request.requestId, 'chunk-preparation', 0.999, 'Typed-array payload prepared for transfer.');

    const complete: GenerateComplete = {
      kind: 'complete',
      requestId: request.requestId,
      summary: {
        seed: config.seed,
        configHash: createConfigHash(config),
        mapIdentity: createMapIdentity(config),
        mapHash: createMapHash(data),
        seaLevelSample: water.seaLevelSample,
        riverCellCount: hydrology.riverCellCount,
        regionCount: biomes.landmassCount,
        buildableCellCount: biomes.buildableCellCount,
        resourceProvinceCount: resources.resourceProvinceCount,
        resourceSourceCount: resources.depositSources.length,
        startingCell: startingBasin.startingCell,
        startingBuildableCellCount: startingBasin.buildableCellCount,
        startingStonePathCost: startingBasin.stonePathCost,
        startingTimberPathCost: startingBasin.timberPathCost,
        startingFertileLandPathCost: startingBasin.fertileLandPathCost,
        startingIronPathCost: startingBasin.ironPathCost,
        startingCopperPathCost: startingBasin.copperPathCost,
        startingValidCandidateCount: startingBasin.validCandidateCount,
        generationDurationMs: Math.round(performance.now() - startedAt),
        estimatedFinalBytes: memory.finalBytes,
        estimatedPeakBytes: memory.peakBytes,
      },
      data,
    };

    workerScope.postMessage(complete, getMapDataTransferables(data));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown map generation error.';
    const response: GenerateError = {
      kind: 'error',
      requestId: request.requestId,
      message,
    };
    workerScope.postMessage(response);
  }
};

function postProgress(
  requestId: number,
  phase: GenerateProgress['phase'],
  progress: number,
  detail: string,
): void {
  const response: GenerateProgress = {
    kind: 'progress',
    requestId,
    phase,
    progress,
    detail,
  };
  workerScope.postMessage(response);
}

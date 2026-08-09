import {
  HEIGHT_SAMPLE_COUNT,
  HEIGHT_SAMPLE_WIDTH,
  MAP_CELL_COUNT,
  MAP_HEIGHT,
  MAP_WIDTH,
  AuthoritativeMapData,
  MapConfig,
  WATER_KIND_CODES,
} from './map-types';

const SEA_LEVEL_HISTOGRAM_BINS = 1_024;
const EROSION_PASSES = 2;
const EROSION_STRENGTH = 0.18;

export interface WaterGenerationResult {
  seaLevelSample: number;
  oceanCellCount: number;
  lakeCellCount: number;
}

export function applyLightweightErosion(heightSamples: Uint16Array): void {
  if (heightSamples.length !== HEIGHT_SAMPLE_COUNT) {
    throw new Error(`Expected ${HEIGHT_SAMPLE_COUNT} height samples.`);
  }

  const scratch = new Uint16Array(HEIGHT_SAMPLE_COUNT);
  for (let pass = 0; pass < EROSION_PASSES; pass += 1) {
    scratch.set(heightSamples);
    for (let sampleY = 1; sampleY < MAP_HEIGHT; sampleY += 1) {
      for (let sampleX = 1; sampleX < MAP_WIDTH; sampleX += 1) {
        const index = sampleY * HEIGHT_SAMPLE_WIDTH + sampleX;
        const neighborAverage =
          (heightSamples[index - 1] +
            heightSamples[index + 1] +
            heightSamples[index - HEIGHT_SAMPLE_WIDTH] +
            heightSamples[index + HEIGHT_SAMPLE_WIDTH]) /
          4;
        const difference = heightSamples[index] - neighborAverage;
        if (difference > 0) {
          scratch[index] = Math.max(
            0,
            heightSamples[index] - Math.round(difference * EROSION_STRENGTH),
          );
        }
      }
    }
    heightSamples.set(scratch);
  }
}

export function classifyOceanAndLakes(
  data: AuthoritativeMapData,
  config: MapConfig,
): WaterGenerationResult {
  data.waterKind.fill(WATER_KIND_CODES.none);
  const targetWaterCells = Math.round(
    MAP_CELL_COUNT * Math.min(Math.max(config.waterCoverage, 0), 1),
  );
  if (targetWaterCells === 0) {
    return { seaLevelSample: 0, oceanCellCount: 0, lakeCellCount: 0 };
  }

  const histogram = new Uint32Array(SEA_LEVEL_HISTOGRAM_BINS);
  forEachCell((cellIndex, cellX, cellY) => {
    const elevation = getCellElevationSample(data, cellX, cellY);
    const bin = Math.min(
      SEA_LEVEL_HISTOGRAM_BINS - 1,
      Math.floor((elevation * SEA_LEVEL_HISTOGRAM_BINS) / 65_536),
    );
    histogram[bin] += 1;
  });

  const seaLevelSample = solveSeaLevelSample(histogram, targetWaterCells);
  const submerged = new Uint8Array(MAP_CELL_COUNT);
  forEachCell((cellIndex, cellX, cellY) => {
    submerged[cellIndex] = getCellElevationSample(data, cellX, cellY) <= seaLevelSample ? 1 : 0;
  });

  const queue = new Uint32Array(MAP_CELL_COUNT);
  let queueHead = 0;
  let queueTail = 0;
  const enqueueIfOcean = (cellIndex: number): void => {
    if (submerged[cellIndex] === 1 && data.waterKind[cellIndex] === WATER_KIND_CODES.none) {
      data.waterKind[cellIndex] = WATER_KIND_CODES.ocean;
      queue[queueTail] = cellIndex;
      queueTail += 1;
    }
  };

  for (let cellX = 0; cellX < MAP_WIDTH; cellX += 1) {
    enqueueIfOcean(cellX);
    enqueueIfOcean((MAP_HEIGHT - 1) * MAP_WIDTH + cellX);
  }
  for (let cellY = 1; cellY < MAP_HEIGHT - 1; cellY += 1) {
    enqueueIfOcean(cellY * MAP_WIDTH);
    enqueueIfOcean(cellY * MAP_WIDTH + MAP_WIDTH - 1);
  }

  while (queueHead < queueTail) {
    const cellIndex = queue[queueHead];
    queueHead += 1;
    const cellX = cellIndex % MAP_WIDTH;
    const cellY = Math.floor(cellIndex / MAP_WIDTH);
    if (cellX > 0) {
      enqueueIfOcean(cellIndex - 1);
    }
    if (cellX < MAP_WIDTH - 1) {
      enqueueIfOcean(cellIndex + 1);
    }
    if (cellY > 0) {
      enqueueIfOcean(cellIndex - MAP_WIDTH);
    }
    if (cellY < MAP_HEIGHT - 1) {
      enqueueIfOcean(cellIndex + MAP_WIDTH);
    }
  }

  let oceanCellCount = 0;
  let lakeCellCount = 0;
  for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
    if (data.waterKind[cellIndex] === WATER_KIND_CODES.ocean) {
      oceanCellCount += 1;
    } else if (submerged[cellIndex] === 1) {
      data.waterKind[cellIndex] = WATER_KIND_CODES.lake;
      lakeCellCount += 1;
    }
  }

  return { seaLevelSample, oceanCellCount, lakeCellCount };
}

function solveSeaLevelSample(histogram: Uint32Array, targetWaterCells: number): number {
  let accumulated = 0;
  for (let bin = 0; bin < histogram.length; bin += 1) {
    accumulated += histogram[bin];
    if (accumulated >= targetWaterCells) {
      return Math.min(65_535, Math.round(((bin + 1) * 65_535) / histogram.length));
    }
  }
  return 65_535;
}

export function getCellElevationSample(
  data: AuthoritativeMapData,
  cellX: number,
  cellY: number,
): number {
  const topLeft = cellY * HEIGHT_SAMPLE_WIDTH + cellX;
  const topRight = topLeft + 1;
  const bottomLeft = topLeft + HEIGHT_SAMPLE_WIDTH;
  const bottomRight = bottomLeft + 1;
  return Math.round(
    (data.heightSamples[topLeft] +
      data.heightSamples[topRight] +
      data.heightSamples[bottomLeft] +
      data.heightSamples[bottomRight]) /
      4,
  );
}

function forEachCell(callback: (cellIndex: number, cellX: number, cellY: number) => void): void {
  for (let cellY = 0; cellY < MAP_HEIGHT; cellY += 1) {
    for (let cellX = 0; cellX < MAP_WIDTH; cellX += 1) {
      callback(cellY * MAP_WIDTH + cellX, cellX, cellY);
    }
  }
}

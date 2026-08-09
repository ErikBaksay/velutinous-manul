import { createGenerationRandomStreams } from './deterministic-random';
import {
  BIOME_KIND_CODES,
  MAP_FLAG_CODES,
  MAP_CELL_COUNT,
  MAP_HEIGHT,
  MAP_WIDTH,
  BiomeKind,
  AuthoritativeMapData,
  MapConfig,
  WATER_KIND_CODES,
} from './map-types';
import { getCellElevationSample } from './water-generation';

const BIOME_KINDS: readonly BiomeKind[] = [
  'plains',
  'forest',
  'hills',
  'mountains',
  'wetland',
  'coast',
];

export interface BiomeGenerationResult {
  landmassCount: number;
  buildableCellCount: number;
  biomeCounts: Record<BiomeKind, number>;
}

export function generateBiomesAndLandmasses(
  data: AuthoritativeMapData,
  config: MapConfig,
): BiomeGenerationResult {
  const climateSeed = createGenerationRandomStreams(config.seed).forests.nextUint32();
  const biomeCounts = createBiomeCounts();
  data.landmassId.fill(0);
  data.flags.fill(0);

  // Terrain noise can legitimately shift the absolute elevation range from
  // seed to seed. Biome thresholds describe elevation above sea level, not a
  // fixed world-space sample value, so derive a stable relative land height.
  const seaLevelSample = getWaterLevelSample(data);
  const landHeightRange = Math.max(1, 65_535 - seaLevelSample);

  let buildableCellCount = 0;
  for (let cellY = 0; cellY < MAP_HEIGHT; cellY += 1) {
    for (let cellX = 0; cellX < MAP_WIDTH; cellX += 1) {
      const cellIndex = cellY * MAP_WIDTH + cellX;
      const absoluteElevation = getCellElevationSample(data, cellX, cellY);
      const elevation = clamp(
        (absoluteElevation - seaLevelSample) / landHeightRange,
        0,
        1,
      );
      const slope = getCellSlope(data, cellX, cellY);
      const nearWater = hasAdjacentWater(data, cellX, cellY);
      const latitude = Math.abs(cellY / (MAP_HEIGHT - 1) * 2 - 1);
      const climateWave =
        Math.sin((cellX + (climateSeed % 10_000)) * 0.014) * 0.1 +
        Math.cos((cellY + (climateSeed % 7_000)) * 0.011) * 0.1;
      const temperature = clamp(0.94 - latitude * 0.52 - elevation * 0.42 + climateWave, 0, 1);
      const moisture = clamp(
        0.52 + (1 - elevation) * 0.16 + (1 - latitude) * 0.12 + climateWave + (nearWater ? 0.2 : 0),
        0,
        1,
      );

      const biome = selectBiome(
        data.waterKind[cellIndex],
        nearWater,
        elevation,
        slope,
        moisture,
        temperature,
        config.forestDensity,
      );
      data.biome[cellIndex] = BIOME_KIND_CODES[biome];
      data.moisture[cellIndex] = Math.round(moisture * 255);
      data.temperature[cellIndex] = Math.round(temperature * 255);
      biomeCounts[biome] += 1;

      const buildable = isBuildable(data.waterKind[cellIndex], biome, elevation, slope);
      data.flags[cellIndex] = buildable ? MAP_FLAG_CODES.buildable : MAP_FLAG_CODES.impassable;
      if (biome === 'forest') {
        data.flags[cellIndex] |= MAP_FLAG_CODES.forest;
      }
      if (buildable) {
        buildableCellCount += 1;
      }
    }
  }

  const landmassCount = assignLandmasses(data);
  return { landmassCount, buildableCellCount, biomeCounts };
}

function selectBiome(
  waterKind: number,
  nearWater: boolean,
  elevation: number,
  slope: number,
  moisture: number,
  temperature: number,
  forestDensity: number,
): BiomeKind {
  if (waterKind !== WATER_KIND_CODES.none) {
    return 'coast';
  }
  if (nearWater && elevation < 0.38) {
    return 'coast';
  }
  if (elevation > 0.78 || slope > 0.1) {
    return 'mountains';
  }
  if (elevation > 0.6 || slope > 0.06) {
    return 'hills';
  }
  if (moisture > 0.79 && temperature > 0.28) {
    return 'wetland';
  }
  const forestThreshold = 0.54 + (1 - forestDensity) * 0.2;
  if (moisture > forestThreshold && temperature > 0.2) {
    return 'forest';
  }
  return 'plains';
}

function isBuildable(waterKind: number, biome: BiomeKind, elevation: number, slope: number): boolean {
  return (
    waterKind === WATER_KIND_CODES.none &&
    biome !== 'mountains' &&
    biome !== 'wetland' &&
    elevation < 0.78 &&
    slope < 0.08
  );
}

function getCellSlope(data: AuthoritativeMapData, cellX: number, cellY: number): number {
  const center = getCellElevationSample(data, cellX, cellY);
  const right = getCellElevationSample(data, Math.min(MAP_WIDTH - 1, cellX + 1), cellY);
  const down = getCellElevationSample(data, cellX, Math.min(MAP_HEIGHT - 1, cellY + 1));
  return Math.min(1, Math.max(Math.abs(center - right), Math.abs(center - down)) / 65_535 * 4);
}

function hasAdjacentWater(data: AuthoritativeMapData, cellX: number, cellY: number): boolean {
  return (
    (cellX > 0 && data.waterKind[cellY * MAP_WIDTH + cellX - 1] !== WATER_KIND_CODES.none) ||
    (cellX < MAP_WIDTH - 1 && data.waterKind[cellY * MAP_WIDTH + cellX + 1] !== WATER_KIND_CODES.none) ||
    (cellY > 0 && data.waterKind[(cellY - 1) * MAP_WIDTH + cellX] !== WATER_KIND_CODES.none) ||
    (cellY < MAP_HEIGHT - 1 && data.waterKind[(cellY + 1) * MAP_WIDTH + cellX] !== WATER_KIND_CODES.none)
  );
}

function getWaterLevelSample(data: AuthoritativeMapData): number {
  let highestWaterSample = 0;
  let lowestLandSample = 65_535;
  let hasWater = false;
  let hasLand = false;

  for (let cellY = 0; cellY < MAP_HEIGHT; cellY += 1) {
    for (let cellX = 0; cellX < MAP_WIDTH; cellX += 1) {
      const cellIndex = cellY * MAP_WIDTH + cellX;
      const elevation = getCellElevationSample(data, cellX, cellY);
      const waterKind = data.waterKind[cellIndex];
      if (
        waterKind === WATER_KIND_CODES.ocean ||
        waterKind === WATER_KIND_CODES.lake
      ) {
        highestWaterSample = Math.max(highestWaterSample, elevation);
        hasWater = true;
      } else if (waterKind === WATER_KIND_CODES.none) {
        lowestLandSample = Math.min(lowestLandSample, elevation);
        hasLand = true;
      }
    }
  }

  if (hasWater) {
    return highestWaterSample;
  }
  return hasLand ? lowestLandSample : 0;
}

function assignLandmasses(data: AuthoritativeMapData): number {
  const queue = new Uint32Array(MAP_CELL_COUNT);
  let landmassCount = 0;

  for (let startCell = 0; startCell < MAP_CELL_COUNT; startCell += 1) {
    if (
      data.waterKind[startCell] !== WATER_KIND_CODES.none ||
      data.landmassId[startCell] !== 0
    ) {
      continue;
    }

    landmassCount += 1;
    if (landmassCount > 65_535) {
      throw new Error('Map v1 exceeded the landmass ID capacity.');
    }

    let queueHead = 0;
    let queueTail = 0;
    data.landmassId[startCell] = landmassCount;
    queue[queueTail] = startCell;
    queueTail += 1;

    while (queueHead < queueTail) {
      const cellIndex = queue[queueHead];
      queueHead += 1;
      const cellX = cellIndex % MAP_WIDTH;
      const cellY = Math.floor(cellIndex / MAP_WIDTH);
      if (cellX > 0) {
        if (visitLandmassNeighbor(data, cellIndex - 1, landmassCount, queue, queueTail)) {
          queueTail += 1;
        }
      }
      if (cellX < MAP_WIDTH - 1) {
        if (visitLandmassNeighbor(data, cellIndex + 1, landmassCount, queue, queueTail)) {
          queueTail += 1;
        }
      }
      if (cellY > 0) {
        if (
          visitLandmassNeighbor(data, cellIndex - MAP_WIDTH, landmassCount, queue, queueTail)
        ) {
          queueTail += 1;
        }
      }
      if (cellY < MAP_HEIGHT - 1) {
        if (
          visitLandmassNeighbor(data, cellIndex + MAP_WIDTH, landmassCount, queue, queueTail)
        ) {
          queueTail += 1;
        }
      }
    }
  }

  return landmassCount;
}

function visitLandmassNeighbor(
  data: AuthoritativeMapData,
  cellIndex: number,
  landmassId: number,
  queue: Uint32Array,
  queueTail: number,
): boolean {
  if (
    data.waterKind[cellIndex] === WATER_KIND_CODES.none &&
    data.landmassId[cellIndex] === 0
  ) {
    data.landmassId[cellIndex] = landmassId;
    queue[queueTail] = cellIndex;
    return true;
  }
  return false;
}

function createBiomeCounts(): Record<BiomeKind, number> {
  const counts = {} as Record<BiomeKind, number>;
  for (const biome of BIOME_KINDS) {
    counts[biome] = 0;
  }
  return counts;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

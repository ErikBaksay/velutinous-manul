import {
  BIOME_KIND_CODES,
  MAP_CELL_COUNT,
  MAP_FLAG_CODES,
  MAP_HEIGHT,
  MAP_WIDTH,
  RESOURCE_MASK_CODES,
  RESOURCE_KINDS,
  DepositSource,
  AuthoritativeMapData,
  MapConfig,
  WATER_KIND_CODES,
} from './map-types';
import { createGenerationRandomStreams } from './deterministic-random';

const RESOURCE_PROVINCE_COUNT = 24;

interface ProvinceCenter {
  x: number;
  y: number;
}

export interface ResourceFieldResult {
  resourceProvinceCount: number;
  timberCellCount: number;
  fertileCellCount: number;
  depositSources: DepositSource[];
}

const MINERAL_KINDS: readonly DepositSource['kind'][] = [
  'iron-ore',
  'copper-ore',
  'stone',
];

const BASE_DEPOSIT_COUNTS: Readonly<Record<DepositSource['kind'], number>> = Object.freeze({
  'iron-ore': 10,
  'copper-ore': 8,
  stone: 14,
});

const MINERAL_MASK_CODES: Readonly<Record<DepositSource['kind'], number>> = {
  'iron-ore': RESOURCE_MASK_CODES['iron-ore'],
  'copper-ore': RESOURCE_MASK_CODES['copper-ore'],
  stone: RESOURCE_MASK_CODES.stone,
};

const MINERAL_MIN_CENTER_DISTANCE = 24;

export function generateResourceProvincesAndFields(
  data: AuthoritativeMapData,
  config: MapConfig,
): ResourceFieldResult {
  const centers = createProvinceCenters(config.seed);
  data.resourceProvinceId.fill(0);
  data.resourceMask.fill(0);
  for (const resourceKind of RESOURCE_KINDS) {
    data.resourceIntensity[resourceKind].fill(0);
  }

  for (let cellY = 0; cellY < MAP_HEIGHT; cellY += 1) {
    for (let cellX = 0; cellX < MAP_WIDTH; cellX += 1) {
      const cellIndex = cellY * MAP_WIDTH + cellX;
      if (data.waterKind[cellIndex] !== WATER_KIND_CODES.none) {
        continue;
      }
      data.resourceProvinceId[cellIndex] = findNearestProvince(cellX, cellY, centers);
    }
  }

  let timberCellCount = 0;
  let fertileCellCount = 0;
  for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
    const provinceId = data.resourceProvinceId[cellIndex];
    if (provinceId === 0) {
      continue;
    }

    const localVariation = hashCell(cellIndex, provinceId) / 4_294_967_295;
    const biome = data.biome[cellIndex];
    if (biome === BIOME_KIND_CODES.forest) {
      const intensity = Math.round(
        clamp((0.58 + localVariation * 0.34) * config.resourceAbundance * 255, 0, 255),
      );
      data.resourceIntensity.timber[cellIndex] = intensity;
      if (intensity > 0) {
        data.resourceMask[cellIndex] |= RESOURCE_MASK_CODES.timber;
        timberCellCount += 1;
      }
    }

    if (
      (data.flags[cellIndex] & MAP_FLAG_CODES.buildable) !== 0 &&
      (biome === BIOME_KIND_CODES.plains || biome === BIOME_KIND_CODES.wetland)
    ) {
      const biomeSuitability = biome === BIOME_KIND_CODES.wetland ? 0.86 : 0.72;
      const intensity = Math.round(
        clamp((biomeSuitability + localVariation * 0.24) * config.resourceAbundance * 255, 0, 255),
      );
      data.resourceIntensity['fertile-land'][cellIndex] = intensity;
      if (intensity > 0) {
        data.resourceMask[cellIndex] |= RESOURCE_MASK_CODES['fertile-land'];
        fertileCellCount += 1;
      }
    }
  }

  const depositSources = generateMineralDeposits(data, config);
  data.deposits = depositSources;

  return {
    resourceProvinceCount: centers.length,
    timberCellCount,
    fertileCellCount,
    depositSources,
  };
}

export function rebuildMineralResourceFields(data: AuthoritativeMapData): void {
  for (const kind of MINERAL_KINDS) {
    data.resourceIntensity[kind].fill(0);
    const maskCode = MINERAL_MASK_CODES[kind];
    for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
      data.resourceMask[cellIndex] &= ~maskCode;
    }
  }
  for (const deposit of data.deposits) {
    rasterizeDeposit(data, deposit);
  }
}

function generateMineralDeposits(
  data: AuthoritativeMapData,
  config: MapConfig,
): DepositSource[] {
  const deposits: DepositSource[] = [];
  let nextId = 1;

  for (const kind of MINERAL_KINDS) {
    const random = createGenerationRandomStreams(config.seed).resources.fork(kind);
    const targetCount = scaledDepositCount(BASE_DEPOSIT_COUNTS[kind], config.resourceAbundance);
    for (let index = 0; index < targetCount; index += 1) {
      const centerCell = findDepositCenter(data, kind, random, deposits);
      if (centerCell === null) {
        continue;
      }

      const radius = random.nextInt(5, 10);
      const strength = 0.62 + random.nextFloat() * 0.33;
      const baseCapacity = Math.round(
        (700 + random.nextFloat() * 1_000) * (0.5 + config.resourceAbundance * 0.5),
      );
      const deposit: DepositSource = {
        id: nextId,
        kind,
        centerCell,
        radius,
        strength,
        baseCapacity,
        resourceProvinceId: data.resourceProvinceId[centerCell],
      };
      nextId += 1;
      deposits.push(deposit);
      rasterizeDeposit(data, deposit);
    }
  }

  return deposits;
}

function scaledDepositCount(baseCount: number, abundance: number): number {
  if (abundance <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(baseCount * abundance));
}

function findDepositCenter(
  data: AuthoritativeMapData,
  kind: DepositSource['kind'],
  random: ReturnType<typeof createGenerationRandomStreams>['resources'],
  existingDeposits: readonly DepositSource[],
): number | null {
  for (let attempt = 0; attempt < 512; attempt += 1) {
    const cellX = random.nextInt(2, MAP_WIDTH - 2);
    const cellY = random.nextInt(2, MAP_HEIGHT - 2);
    const cellIndex = cellY * MAP_WIDTH + cellX;
    if (isValidDepositCenter(data, kind, cellIndex) && isFarEnough(cellX, cellY, existingDeposits)) {
      return cellIndex;
    }
  }

  for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
    const cellX = cellIndex % MAP_WIDTH;
    const cellY = Math.floor(cellIndex / MAP_WIDTH);
    if (isValidDepositCenter(data, kind, cellIndex) && isFarEnough(cellX, cellY, existingDeposits)) {
      return cellIndex;
    }
  }
  return null;
}

function isValidDepositCenter(
  data: AuthoritativeMapData,
  kind: DepositSource['kind'],
  cellIndex: number,
): boolean {
  if (
    data.waterKind[cellIndex] !== WATER_KIND_CODES.none ||
    data.resourceProvinceId[cellIndex] === 0
  ) {
    return false;
  }

  const biome = data.biome[cellIndex];
  if (kind === 'iron-ore' || kind === 'copper-ore') {
    return biome === BIOME_KIND_CODES.hills || biome === BIOME_KIND_CODES.mountains;
  }
  return biome === BIOME_KIND_CODES.plains || biome === BIOME_KIND_CODES.hills;
}

function isFarEnough(
  cellX: number,
  cellY: number,
  existingDeposits: readonly DepositSource[],
): boolean {
  const minimumDistanceSquared = MINERAL_MIN_CENTER_DISTANCE * MINERAL_MIN_CENTER_DISTANCE;
  for (const deposit of existingDeposits) {
    const existingX = deposit.centerCell % MAP_WIDTH;
    const existingY = Math.floor(deposit.centerCell / MAP_WIDTH);
    const deltaX = cellX - existingX;
    const deltaY = cellY - existingY;
    if (deltaX * deltaX + deltaY * deltaY < minimumDistanceSquared) {
      return false;
    }
  }
  return true;
}

function rasterizeDeposit(data: AuthoritativeMapData, deposit: DepositSource): void {
  const centerX = deposit.centerCell % MAP_WIDTH;
  const centerY = Math.floor(deposit.centerCell / MAP_WIDTH);
  const minimumX = Math.max(0, centerX - deposit.radius);
  const maximumX = Math.min(MAP_WIDTH - 1, centerX + deposit.radius);
  const minimumY = Math.max(0, centerY - deposit.radius);
  const maximumY = Math.min(MAP_HEIGHT - 1, centerY + deposit.radius);
  const maskCode = MINERAL_MASK_CODES[deposit.kind];
  const intensityField = data.resourceIntensity[deposit.kind];

  for (let cellY = minimumY; cellY <= maximumY; cellY += 1) {
    for (let cellX = minimumX; cellX <= maximumX; cellX += 1) {
      const deltaX = cellX - centerX;
      const deltaY = cellY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance > deposit.radius) {
        continue;
      }

      const cellIndex = cellY * MAP_WIDTH + cellX;
      if (data.waterKind[cellIndex] !== WATER_KIND_CODES.none) {
        continue;
      }
      const falloff = 1 - distance / (deposit.radius + 1);
      const intensity = Math.round(deposit.strength * falloff * 255);
      if (intensity <= intensityField[cellIndex]) {
        continue;
      }
      intensityField[cellIndex] = intensity;
      data.resourceMask[cellIndex] |= maskCode;
    }
  }
}

function createProvinceCenters(seed: string): ProvinceCenter[] {
  const random = createGenerationRandomStreams(seed).resources;
  const centers: ProvinceCenter[] = [];
  for (let index = 0; index < RESOURCE_PROVINCE_COUNT; index += 1) {
    centers.push({
      x: random.nextInt(32, MAP_WIDTH - 32),
      y: random.nextInt(32, MAP_HEIGHT - 32),
    });
  }
  return centers;
}

function findNearestProvince(cellX: number, cellY: number, centers: ProvinceCenter[]): number {
  let nearestProvince = 1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centers.length; index += 1) {
    const deltaX = cellX - centers[index].x;
    const deltaY = cellY - centers[index].y;
    const distance = deltaX * deltaX + deltaY * deltaY;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestProvince = index + 1;
    }
  }
  return nearestProvince;
}

function hashCell(cellIndex: number, provinceId: number): number {
  let value = cellIndex ^ Math.imul(provinceId + 1, 0x9e37_79b9);
  value = Math.imul(value ^ (value >>> 16), 0x85eb_ca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2_ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

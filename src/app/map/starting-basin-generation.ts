import {
  HEIGHT_SAMPLE_WIDTH,
  MAP_CELL_COUNT,
  MAP_FLAG_CODES,
  MAP_HEIGHT,
  MAP_WIDTH,
  RESOURCE_KINDS,
  RESOURCE_MASK_CODES,
  AuthoritativeMapData,
  DepositSource,
  MapConfig,
  WATER_KIND_CODES,
} from './map-types';
import { rebuildMineralResourceFields } from './resource-generation';

export const COARSE_CELL_SIZE = 4;
export const COARSE_WIDTH = MAP_WIDTH / COARSE_CELL_SIZE;
export const COARSE_HEIGHT = MAP_HEIGHT / COARSE_CELL_SIZE;
export const COARSE_NODE_COUNT = COARSE_WIDTH * COARSE_HEIGHT;

export const MIN_START_BUILDABLE_AREA = 3_000;
export const LOCAL_RESOURCE_MAX_PATH_COST = 64;
export const IRON_MAX_PATH_COST = 128;
export const COPPER_PREFERRED_MIN_PATH_COST = 160;
export const COPPER_MAX_PATH_COST = 512;

const MIN_PASSABLE_CELLS_PER_NODE = 12;
const UNREACHABLE = 0xffff_ffff;

export interface StartingBasinResult {
  startingCell: number;
  startingCoarseNode: number;
  startingLandmassId: number;
  buildableCellCount: number;
  stonePathCost: number;
  timberPathCost: number;
  fertileLandPathCost: number;
  ironPathCost: number;
  copperPathCost: number;
  validCandidateCount: number;
}

interface NavigationGrid {
  passable: Uint8Array;
  buildableCellCount: Uint16Array;
  waterCellCount: Uint8Array;
  componentId: Uint16Array;
  componentBuildableArea: Uint32Array;
}

export function selectStartingBasin(
  data: AuthoritativeMapData,
  config: MapConfig,
): StartingBasinResult {
  return selectStartingBasinInternal(data, config, true);
}

export function selectStartingBasinCandidate(
  data: AuthoritativeMapData,
  config: MapConfig,
): StartingBasinResult {
  return selectStartingBasinInternal(data, config, false);
}

export function repairStartingResources(
  data: AuthoritativeMapData,
  candidate: StartingBasinResult,
): void {
  const navigation = buildNavigationGrid(data);
  const distances = calculateDistanceFromNode(navigation, candidate.startingCoarseNode);

  ensureRenewableField(data, navigation, distances, 'timber', LOCAL_RESOURCE_MAX_PATH_COST);
  ensureRenewableField(
    data,
    navigation,
    distances,
    'fertile-land',
    LOCAL_RESOURCE_MAX_PATH_COST,
  );

  relocateDeposit(data, navigation, distances, 'stone', LOCAL_RESOURCE_MAX_PATH_COST, 0);
  relocateDeposit(data, navigation, distances, 'iron-ore', IRON_MAX_PATH_COST, 0);
  relocateDeposit(
    data,
    navigation,
    distances,
    'copper-ore',
    COPPER_MAX_PATH_COST,
    COPPER_PREFERRED_MIN_PATH_COST,
  );
  rebuildMineralResourceFields(data);
}

function selectStartingBasinInternal(
  data: AuthoritativeMapData,
  _config: MapConfig,
  requireResourceInvariants: boolean,
): StartingBasinResult {
  const navigation = buildNavigationGrid(data);
  const resourceTargets = collectResourceTargets(data, navigation);
  const resourceDistances = new Map<string, Uint32Array>();
  for (const resourceKind of RESOURCE_KINDS) {
    resourceDistances.set(
      resourceKind,
      calculateDistanceToTargets(navigation, resourceTargets.get(resourceKind) ?? []),
    );
  }

  let bestCandidate: { nodeIndex: number; score: number; paths: ResourcePathCosts } | null = null;
  let validCandidateCount = 0;
  for (let nodeIndex = 0; nodeIndex < COARSE_NODE_COUNT; nodeIndex += 1) {
    if (!isValidCandidateNode(navigation, nodeIndex)) {
      continue;
    }

    const paths = getResourcePathCosts(resourceDistances, nodeIndex);
    if (
      !isValidCandidateNode(navigation, nodeIndex) ||
      (requireResourceInvariants && !meetsStartingResourceInvariants(navigation, nodeIndex, paths))
    ) {
      continue;
    }

    validCandidateCount += 1;
    const score = scoreCandidate(data, navigation, nodeIndex, paths);
    if (
      bestCandidate === null ||
      score > bestCandidate.score ||
      (score === bestCandidate.score && nodeIndex < bestCandidate.nodeIndex)
    ) {
      bestCandidate = { nodeIndex, score, paths };
    }
  }

  if (bestCandidate === null) {
    throw new Error('Map v1 could not find a valid starting basin with required resources.');
  }

  const startingCell = selectStartingCell(data, bestCandidate.nodeIndex);
  return {
    startingCell,
    startingCoarseNode: bestCandidate.nodeIndex,
    startingLandmassId: data.landmassId[startingCell],
    buildableCellCount: navigation.componentBuildableArea[
      navigation.componentId[bestCandidate.nodeIndex]
    ],
    stonePathCost: bestCandidate.paths.stone,
    timberPathCost: bestCandidate.paths.timber,
    fertileLandPathCost: bestCandidate.paths['fertile-land'],
    ironPathCost: bestCandidate.paths['iron-ore'],
    copperPathCost: bestCandidate.paths['copper-ore'],
    validCandidateCount,
  };
}

function buildNavigationGrid(data: AuthoritativeMapData): NavigationGrid {
  const passable = new Uint8Array(COARSE_NODE_COUNT);
  const buildableCellCount = new Uint16Array(COARSE_NODE_COUNT);
  const waterCellCount = new Uint8Array(COARSE_NODE_COUNT);

  for (let coarseY = 0; coarseY < COARSE_HEIGHT; coarseY += 1) {
    for (let coarseX = 0; coarseX < COARSE_WIDTH; coarseX += 1) {
      const nodeIndex = coarseY * COARSE_WIDTH + coarseX;
      let passableCellCount = 0;
      let buildableCells = 0;
      let waterCells = 0;
      for (let localY = 0; localY < COARSE_CELL_SIZE; localY += 1) {
        for (let localX = 0; localX < COARSE_CELL_SIZE; localX += 1) {
          const cellX = coarseX * COARSE_CELL_SIZE + localX;
          const cellY = coarseY * COARSE_CELL_SIZE + localY;
          const cellIndex = cellY * MAP_WIDTH + cellX;
          const water = data.waterKind[cellIndex] !== WATER_KIND_CODES.none;
          if (water) {
            waterCells += 1;
            continue;
          }
          if ((data.flags[cellIndex] & MAP_FLAG_CODES.impassable) === 0) {
            passableCellCount += 1;
          }
          if ((data.flags[cellIndex] & MAP_FLAG_CODES.buildable) !== 0) {
            buildableCells += 1;
          }
        }
      }

      passable[nodeIndex] = passableCellCount >= MIN_PASSABLE_CELLS_PER_NODE ? 1 : 0;
      buildableCellCount[nodeIndex] = buildableCells;
      waterCellCount[nodeIndex] = waterCells;
    }
  }

  const componentId = new Uint16Array(COARSE_NODE_COUNT);
  const componentBuildableArea = new Uint32Array(COARSE_NODE_COUNT + 1);
  const queue = new Uint32Array(COARSE_NODE_COUNT);
  let componentCount = 0;

  for (let startNode = 0; startNode < COARSE_NODE_COUNT; startNode += 1) {
    if (passable[startNode] === 0 || componentId[startNode] !== 0) {
      continue;
    }
    componentCount += 1;
    if (componentCount > 65_535) {
      throw new Error('Map v1 exceeded coarse starting-basin component capacity.');
    }

    let queueHead = 0;
    let queueTail = 0;
    let componentArea = 0;
    componentId[startNode] = componentCount;
    queue[queueTail] = startNode;
    queueTail += 1;

    while (queueHead < queueTail) {
      const nodeIndex = queue[queueHead];
      queueHead += 1;
      componentArea += buildableCellCount[nodeIndex];
      forEachNeighbor(nodeIndex, (neighbor) => {
        if (passable[neighbor] !== 0 && componentId[neighbor] === 0) {
          componentId[neighbor] = componentCount;
          queue[queueTail] = neighbor;
          queueTail += 1;
        }
      });
    }
    componentBuildableArea[componentCount] = componentArea;
  }

  return {
    passable,
    buildableCellCount,
    waterCellCount,
    componentId,
    componentBuildableArea,
  };
}

function collectResourceTargets(
  data: AuthoritativeMapData,
  navigation: NavigationGrid,
): Map<string, number[]> {
  const targets = new Map<string, number[]>();
  for (const resourceKind of RESOURCE_KINDS) {
    targets.set(resourceKind, []);
  }

  for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
    const nodeIndex = cellToCoarseNode(cellIndex);
    if (navigation.passable[nodeIndex] === 0) {
      continue;
    }
    for (const resourceKind of RESOURCE_KINDS) {
      if (data.resourceIntensity[resourceKind][cellIndex] > 0) {
        addUniqueTarget(targets.get(resourceKind)!, nodeIndex);
      }
    }
  }

  for (const deposit of data.deposits) {
    const resourceKind = deposit.kind;
    const nodeIndex = findNearestPassableNode(navigation, cellToCoarseNode(deposit.centerCell));
    if (nodeIndex !== null) {
      addUniqueTarget(targets.get(resourceKind)!, nodeIndex);
    }
  }
  return targets;
}

function calculateDistanceToTargets(
  navigation: NavigationGrid,
  targetNodes: readonly number[],
): Uint32Array {
  const distances = new Uint32Array(COARSE_NODE_COUNT);
  distances.fill(UNREACHABLE);
  const queue = new Uint32Array(COARSE_NODE_COUNT);
  let queueHead = 0;
  let queueTail = 0;

  for (const targetNode of targetNodes) {
    if (navigation.passable[targetNode] === 0 || distances[targetNode] === 0) {
      continue;
    }
    distances[targetNode] = 0;
    queue[queueTail] = targetNode;
    queueTail += 1;
  }

  while (queueHead < queueTail) {
    const nodeIndex = queue[queueHead];
    queueHead += 1;
    const nextDistance = distances[nodeIndex] + COARSE_CELL_SIZE;
    forEachNeighbor(nodeIndex, (neighbor) => {
      if (navigation.passable[neighbor] !== 0 && distances[neighbor] === UNREACHABLE) {
        distances[neighbor] = nextDistance;
        queue[queueTail] = neighbor;
        queueTail += 1;
      }
    });
  }
  return distances;
}

function calculateDistanceFromNode(
  navigation: NavigationGrid,
  startingNode: number,
): Uint32Array {
  const distances = new Uint32Array(COARSE_NODE_COUNT);
  distances.fill(UNREACHABLE);
  if (navigation.passable[startingNode] === 0) {
    return distances;
  }

  const queue = new Uint32Array(COARSE_NODE_COUNT);
  let queueHead = 0;
  let queueTail = 0;
  distances[startingNode] = 0;
  queue[queueTail] = startingNode;
  queueTail += 1;

  while (queueHead < queueTail) {
    const nodeIndex = queue[queueHead];
    queueHead += 1;
    const nextDistance = distances[nodeIndex] + COARSE_CELL_SIZE;
    forEachNeighbor(nodeIndex, (neighbor) => {
      if (navigation.passable[neighbor] !== 0 && distances[neighbor] === UNREACHABLE) {
        distances[neighbor] = nextDistance;
        queue[queueTail] = neighbor;
        queueTail += 1;
      }
    });
  }
  return distances;
}

function ensureRenewableField(
  data: AuthoritativeMapData,
  navigation: NavigationGrid,
  distances: Uint32Array,
  resourceKind: 'timber' | 'fertile-land',
  maximumPathCost: number,
): void {
  for (let cellIndex = 0; cellIndex < MAP_CELL_COUNT; cellIndex += 1) {
    if (
      data.resourceIntensity[resourceKind][cellIndex] > 0 &&
      distances[cellToCoarseNode(cellIndex)] <= maximumPathCost
    ) {
      return;
    }
  }

  const nodeIndex = findReachableNode(navigation, distances, maximumPathCost, 0);
  if (nodeIndex === null) {
    return;
  }
  const cellIndex = findCellInNode(data, nodeIndex);
  if (cellIndex === null) {
    return;
  }
  data.resourceIntensity[resourceKind][cellIndex] = Math.max(
    data.resourceIntensity[resourceKind][cellIndex],
    192,
  );
  data.resourceMask[cellIndex] |= RESOURCE_MASK_CODES[resourceKind];
}

function relocateDeposit(
  data: AuthoritativeMapData,
  navigation: NavigationGrid,
  distances: Uint32Array,
  kind: 'iron-ore' | 'copper-ore' | 'stone',
  maximumPathCost: number,
  preferredMinimumPathCost: number,
): void {
  const deposits = data.deposits.filter((deposit) => deposit.kind === kind);
  let nodeIndex = findReachableNode(
    navigation,
    distances,
    maximumPathCost,
    preferredMinimumPathCost,
  );
  if (nodeIndex === null && preferredMinimumPathCost > 0) {
    nodeIndex = findReachableNode(navigation, distances, maximumPathCost, 0);
  }
  if (nodeIndex === null) {
    return;
  }

  const centerCell = findCellInNode(data, nodeIndex);
  if (centerCell === null) {
    return;
  }
  const deposit = deposits[0] ?? createFallbackDeposit(data, kind, centerCell);
  deposit.centerCell = centerCell;
  deposit.resourceProvinceId = data.resourceProvinceId[centerCell];
  if (deposits.length === 0) {
    data.deposits.push(deposit);
  }
}

function findReachableNode(
  navigation: NavigationGrid,
  distances: Uint32Array,
  maximumPathCost: number,
  minimumPathCost: number,
): number | null {
  let bestNode: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let nodeIndex = 0; nodeIndex < COARSE_NODE_COUNT; nodeIndex += 1) {
    const pathCost = distances[nodeIndex];
    if (
      navigation.passable[nodeIndex] === 0 ||
      pathCost === UNREACHABLE ||
      pathCost > maximumPathCost ||
      pathCost < minimumPathCost
    ) {
      continue;
    }
    if (pathCost < bestDistance || (pathCost === bestDistance && nodeIndex < bestNode!)) {
      bestDistance = pathCost;
      bestNode = nodeIndex;
    }
  }
  return bestNode;
}

function findCellInNode(data: AuthoritativeMapData, nodeIndex: number): number | null {
  const coarseX = nodeIndex % COARSE_WIDTH;
  const coarseY = Math.floor(nodeIndex / COARSE_WIDTH);
  let fallbackCell: number | null = null;
  for (let localY = 0; localY < COARSE_CELL_SIZE; localY += 1) {
    for (let localX = 0; localX < COARSE_CELL_SIZE; localX += 1) {
      const cellX = coarseX * COARSE_CELL_SIZE + localX;
      const cellY = coarseY * COARSE_CELL_SIZE + localY;
      const cellIndex = cellY * MAP_WIDTH + cellX;
      if (data.waterKind[cellIndex] !== WATER_KIND_CODES.none) {
        continue;
      }
      fallbackCell ??= cellIndex;
      if ((data.flags[cellIndex] & MAP_FLAG_CODES.buildable) !== 0) {
        return cellIndex;
      }
    }
  }
  return fallbackCell;
}

function createFallbackDeposit(
  data: AuthoritativeMapData,
  kind: 'iron-ore' | 'copper-ore' | 'stone',
  centerCell: number,
): DepositSource {
  let nextId = 1;
  for (const deposit of data.deposits) {
    nextId = Math.max(nextId, deposit.id + 1);
  }
  return {
    id: nextId,
    kind,
    centerCell,
    radius: 7,
    strength: 0.8,
    baseCapacity: 900,
    resourceProvinceId: data.resourceProvinceId[centerCell],
  };
}

function getResourcePathCosts(
  distances: ReadonlyMap<string, Uint32Array>,
  nodeIndex: number,
): ResourcePathCosts {
  return {
    stone: getDistance(distances.get('stone')!, nodeIndex),
    timber: getDistance(distances.get('timber')!, nodeIndex),
    'fertile-land': getDistance(distances.get('fertile-land')!, nodeIndex),
    'iron-ore': getDistance(distances.get('iron-ore')!, nodeIndex),
    'copper-ore': getDistance(distances.get('copper-ore')!, nodeIndex),
  };
}

function meetsStartingResourceInvariants(
  navigation: NavigationGrid,
  nodeIndex: number,
  paths: ResourcePathCosts,
): boolean {
  const component = navigation.componentId[nodeIndex];
  if (component === 0 || navigation.componentBuildableArea[component] < MIN_START_BUILDABLE_AREA) {
    return false;
  }
  return (
    paths.stone <= LOCAL_RESOURCE_MAX_PATH_COST &&
    paths.timber <= LOCAL_RESOURCE_MAX_PATH_COST &&
    paths['fertile-land'] <= LOCAL_RESOURCE_MAX_PATH_COST &&
    paths['iron-ore'] <= IRON_MAX_PATH_COST &&
    paths['copper-ore'] <= COPPER_MAX_PATH_COST
  );
}

function isValidCandidateNode(navigation: NavigationGrid, nodeIndex: number): boolean {
  const component = navigation.componentId[nodeIndex];
  return (
    navigation.passable[nodeIndex] !== 0 &&
    component !== 0 &&
    navigation.componentBuildableArea[component] >= MIN_START_BUILDABLE_AREA
  );
}

function scoreCandidate(
  data: AuthoritativeMapData,
  navigation: NavigationGrid,
  nodeIndex: number,
  paths: ResourcePathCosts,
): number {
  const component = navigation.componentId[nodeIndex];
  const componentArea = navigation.componentBuildableArea[component];
  const localBuildable = navigation.buildableCellCount[nodeIndex];
  const localResourceCoverage = getLocalResourceCoverage(data, nodeIndex);
  const waterProximity = getWaterProximity(navigation, nodeIndex);
  const copperDistancePreference = Math.max(
    0,
    paths['copper-ore'] - COPPER_PREFERRED_MIN_PATH_COST,
  );
  const terrainQuality = getTerrainQuality(data, nodeIndex);

  return (
    componentArea * 0.001 +
    localBuildable * 5 +
    localResourceCoverage * 2 +
    waterProximity * 3 +
    terrainQuality * 2 +
    copperDistancePreference * 0.08 -
    scorePathCost(paths.stone, 0.12) +
    scorePathCost(paths.timber, 0.08) +
    scorePathCost(paths['fertile-land'], 0.08) +
    scorePathCost(paths['iron-ore'], 0.04)
  );
}

function scorePathCost(pathCost: number, weight: number): number {
  return Number.isFinite(pathCost) ? -pathCost * weight : -10_000;
}

function selectStartingCell(data: AuthoritativeMapData, nodeIndex: number): number {
  const coarseX = nodeIndex % COARSE_WIDTH;
  const coarseY = Math.floor(nodeIndex / COARSE_WIDTH);
  let bestCell = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let localY = 0; localY < COARSE_CELL_SIZE; localY += 1) {
    for (let localX = 0; localX < COARSE_CELL_SIZE; localX += 1) {
      const cellX = coarseX * COARSE_CELL_SIZE + localX;
      const cellY = coarseY * COARSE_CELL_SIZE + localY;
      const cellIndex = cellY * MAP_WIDTH + cellX;
      if (
        data.waterKind[cellIndex] !== WATER_KIND_CODES.none ||
        (data.flags[cellIndex] & MAP_FLAG_CODES.buildable) === 0
      ) {
        continue;
      }

      const resourceCoverage = countBits(data.resourceMask[cellIndex]);
      const centerBias = 3 - Math.abs(localX - 1.5) - Math.abs(localY - 1.5);
      const score = resourceCoverage * 10 + centerBias;
      if (score > bestScore || (score === bestScore && cellIndex < bestCell)) {
        bestScore = score;
        bestCell = cellIndex;
      }
    }
  }

  if (bestCell < 0) {
    throw new Error('Map v1 selected a coarse node without a buildable starting cell.');
  }
  return bestCell;
}

function getLocalResourceCoverage(data: AuthoritativeMapData, nodeIndex: number): number {
  const coarseX = nodeIndex % COARSE_WIDTH;
  const coarseY = Math.floor(nodeIndex / COARSE_WIDTH);
  let coverage = 0;
  for (let localY = 0; localY < COARSE_CELL_SIZE; localY += 1) {
    for (let localX = 0; localX < COARSE_CELL_SIZE; localX += 1) {
      const cellIndex = (coarseY * COARSE_CELL_SIZE + localY) * MAP_WIDTH +
        coarseX * COARSE_CELL_SIZE + localX;
      coverage += countBits(data.resourceMask[cellIndex]);
    }
  }
  return coverage;
}

function getWaterProximity(navigation: NavigationGrid, nodeIndex: number): number {
  let waterCells = navigation.waterCellCount[nodeIndex];
  forEachNeighbor(nodeIndex, (neighbor) => {
    waterCells += navigation.waterCellCount[neighbor];
  });
  return waterCells > 0 ? 1 : 0;
}

function getTerrainQuality(data: AuthoritativeMapData, nodeIndex: number): number {
  const centerX = (nodeIndex % COARSE_WIDTH) * COARSE_CELL_SIZE + 2;
  const centerY = Math.floor(nodeIndex / COARSE_WIDTH) * COARSE_CELL_SIZE + 2;
  const sample = data.heightSamples[centerY * HEIGHT_SAMPLE_WIDTH + centerX] / 65_535;
  return 1 - Math.abs(sample - 0.42);
}

function findNearestPassableNode(
  navigation: NavigationGrid,
  originNode: number,
): number | null {
  if (navigation.passable[originNode] !== 0) {
    return originNode;
  }
  const originX = originNode % COARSE_WIDTH;
  const originY = Math.floor(originNode / COARSE_WIDTH);
  for (let radius = 1; radius <= 4; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) {
          continue;
        }
        const nodeX = originX + offsetX;
        const nodeY = originY + offsetY;
        if (
          nodeX >= 0 &&
          nodeX < COARSE_WIDTH &&
          nodeY >= 0 &&
          nodeY < COARSE_HEIGHT
        ) {
          const nodeIndex = nodeY * COARSE_WIDTH + nodeX;
          if (navigation.passable[nodeIndex] !== 0) {
            return nodeIndex;
          }
        }
      }
    }
  }
  return null;
}

function addUniqueTarget(targets: number[], nodeIndex: number): void {
  if (!targets.includes(nodeIndex)) {
    targets.push(nodeIndex);
  }
}

function cellToCoarseNode(cellIndex: number): number {
  const cellX = cellIndex % MAP_WIDTH;
  const cellY = Math.floor(cellIndex / MAP_WIDTH);
  return Math.floor(cellY / COARSE_CELL_SIZE) * COARSE_WIDTH + Math.floor(cellX / COARSE_CELL_SIZE);
}

function getDistance(distances: Uint32Array, nodeIndex: number): number {
  return distances[nodeIndex] === UNREACHABLE ? Number.POSITIVE_INFINITY : distances[nodeIndex];
}

function forEachNeighbor(nodeIndex: number, callback: (neighbor: number) => void): void {
  const nodeX = nodeIndex % COARSE_WIDTH;
  const nodeY = Math.floor(nodeIndex / COARSE_WIDTH);
  if (nodeX > 0) {
    callback(nodeIndex - 1);
  }
  if (nodeX < COARSE_WIDTH - 1) {
    callback(nodeIndex + 1);
  }
  if (nodeY > 0) {
    callback(nodeIndex - COARSE_WIDTH);
  }
  if (nodeY < COARSE_HEIGHT - 1) {
    callback(nodeIndex + COARSE_WIDTH);
  }
}

function countBits(value: number): number {
  let bits = value;
  let count = 0;
  while (bits !== 0) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}

interface ResourcePathCosts {
  stone: number;
  timber: number;
  'fertile-land': number;
  'iron-ore': number;
  'copper-ore': number;
}

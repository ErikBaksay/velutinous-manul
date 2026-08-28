import type { CellCoordinate, WorldCellCenter } from './construction/grid-coordinates';
import { ROAD_SURFACE_WIDTH } from './construction/road-geometry';

export const COURIER_VAN_RENDER_SCALE = 0.18;
export const COURIER_VAN_LANE_OFFSET = ROAD_SURFACE_WIDTH / 4;

export type VehicleLanePhase = 'loading' | 'enroute' | 'unloading';

export interface VehicleLanePoseState {
  readonly route: readonly CellCoordinate[];
  readonly routeIndex: number;
  readonly progress: number;
  readonly phase: VehicleLanePhase;
}

export interface VehicleLanePoint {
  readonly x: number;
  readonly z: number;
}

export interface VehicleLanePose {
  readonly position: VehicleLanePoint;
  readonly heading: number;
}

export type CellCenterResolver = (cell: CellCoordinate) => WorldCellCenter;

/**
 * Builds a parallel route on the right-hand side of each road direction.
 * Interior corners use the intersection of the two offset segment lines so
 * the lane does not snap back through the road center at a turn.
 */
export function createRightHandLanePath(
  route: readonly CellCoordinate[],
  laneOffset: number,
  resolveCellCenter: CellCenterResolver,
): readonly VehicleLanePoint[] {
  if (route.length === 0 || !Number.isFinite(laneOffset) || laneOffset < 0) {
    return [];
  }

  const centers = route.map(resolveCellCenter);
  if (centers.length === 1 || laneOffset === 0) {
    return centers.map((center) => ({ ...center }));
  }

  const directions = centers.slice(0, -1).map((center, index) =>
    getUnitDirection(center, centers[index + 1]!),
  );
  const normals = directions.map((direction) => ({
    x: -direction.z,
    z: direction.x,
  }));

  return centers.map((center, index) => {
    const previousNormal = normals[index - 1];
    const nextNormal = normals[index];
    if (!previousNormal) {
      return addScaled(center, nextNormal!, laneOffset);
    }
    if (!nextNormal) {
      return addScaled(center, previousNormal, laneOffset);
    }

    if (directions[index - 1]!.x === directions[index]!.x &&
        directions[index - 1]!.z === directions[index]!.z) {
      return addScaled(center, previousNormal, laneOffset);
    }

    const miter = normalize({
      x: previousNormal.x + nextNormal.x,
      z: previousNormal.z + nextNormal.z,
    });
    const miterProjection = miter.x * previousNormal.x + miter.z * previousNormal.z;
    if (miterProjection <= Number.EPSILON) {
      return addScaled(center, previousNormal, laneOffset);
    }

    return addScaled(center, miter, laneOffset / miterProjection);
  });
}

/**
 * Calculates a pose from a previously-built lane path. Callers should retain
 * the path between frames instead of rebuilding route geometry while rendering.
 */
export function getRightHandLanePose(
  state: VehicleLanePoseState,
  lanePath: readonly VehicleLanePoint[],
  resolveCellCenter: CellCenterResolver,
): VehicleLanePose {
  const route = state.route;
  if (route.length === 0 || lanePath.length === 0) {
    return { position: { x: 0, z: 0 }, heading: 0 };
  }

  const routeIndex = clampIndex(state.routeIndex, route.length);
  const currentCell = route[routeIndex] ?? route[0]!;
  const unloading = state.phase === 'unloading' && routeIndex > 0;
  const fromIndex = unloading ? routeIndex - 1 : routeIndex;
  const toIndex = state.phase === 'enroute'
    ? Math.min(routeIndex + 1, route.length - 1)
    : state.phase === 'loading' ? Math.min(1, route.length - 1) : routeIndex;
  const travelProgress = state.phase === 'enroute'
    ? clamp01(state.progress)
    : unloading ? 1 : 0;
  const fromPoint = lanePath[fromIndex] ?? lanePath[0]!;
  const toPoint = lanePath[toIndex] ?? fromPoint;
  const position = {
    x: lerp(fromPoint.x, toPoint.x, travelProgress),
    z: lerp(fromPoint.z, toPoint.z, travelProgress),
  };
  const headingFrom = unloading ? route[routeIndex - 1] ?? currentCell : currentCell;
  const headingTo = state.phase === 'enroute' || state.phase === 'loading'
    ? route[Math.min(routeIndex + 1, route.length - 1)] ?? currentCell
    : currentCell;
  const heading = getHeading(headingFrom, headingTo, resolveCellCenter);

  return { position, heading };
}

function getUnitDirection(
  from: VehicleLanePoint,
  to: VehicleLanePoint,
): VehicleLanePoint {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  if (length <= Number.EPSILON) {
    return { x: 0, z: 0 };
  }
  return {
    x: (to.x - from.x) / length,
    z: (to.z - from.z) / length,
  };
}

function normalize(point: VehicleLanePoint): VehicleLanePoint {
  const length = Math.hypot(point.x, point.z);
  if (length <= Number.EPSILON) {
    return { x: 0, z: 0 };
  }
  return { x: point.x / length, z: point.z / length };
}

function addScaled(
  point: VehicleLanePoint,
  direction: VehicleLanePoint,
  scale: number,
): VehicleLanePoint {
  return {
    x: point.x + direction.x * scale,
    z: point.z + direction.z * scale,
  };
}

function getHeading(
  from: CellCoordinate,
  to: CellCoordinate,
  resolveCellCenter: CellCenterResolver,
): number {
  const fromCenter = resolveCellCenter(from);
  const toCenter = resolveCellCenter(to);
  const directionX = toCenter.x - fromCenter.x;
  const directionZ = toCenter.z - fromCenter.z;
  return Math.abs(directionX) + Math.abs(directionZ) > Number.EPSILON
    ? Math.atan2(directionZ, -directionX)
    : 0;
}

function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(Number.isFinite(index) ? Math.trunc(index) : 0, 0), length - 1);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

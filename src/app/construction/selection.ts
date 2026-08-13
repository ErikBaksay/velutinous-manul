import type { CellCoordinate, GridDimensions } from './grid-coordinates';
import { worldToCellCoordinate } from './grid-coordinates';

export interface CanvasBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface NormalizedDeviceCoordinate {
  readonly x: number;
  readonly y: number;
}

export interface TerrainHitPoint {
  readonly x: number;
  readonly z: number;
}

export function clientPointToNormalizedDeviceCoordinate(
  clientX: number,
  clientY: number,
  bounds: CanvasBounds,
): NormalizedDeviceCoordinate | null {
  if (!Number.isFinite(clientX) ||
      !Number.isFinite(clientY) ||
      !Number.isFinite(bounds.left) ||
      !Number.isFinite(bounds.top) ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      bounds.width <= 0 ||
      bounds.height <= 0) {
    return null;
  }

  return {
    x: ((clientX - bounds.left) / bounds.width) * 2 - 1,
    y: 1 - ((clientY - bounds.top) / bounds.height) * 2,
  };
}

export function terrainHitPointToCellCoordinate(
  hit: TerrainHitPoint,
  dimensions: GridDimensions,
): CellCoordinate | null {
  if (!Number.isFinite(hit.x) || !Number.isFinite(hit.z)) {
    return null;
  }
  return worldToCellCoordinate(hit.x, hit.z, dimensions);
}

import type { AuthoritativeMapData } from './map/map-types';
import { TERRAIN_VERTICAL_SCALE } from './map/terrain-generation';

export interface TerrainSurfaceDimensions {
  readonly width: number;
  readonly height: number;
}

/**
 * Samples the piecewise-linear terrain surface used by the terrain mesh. Each
 * cell is split from its top-right to bottom-left corner.
 */
export function getTerrainHeightAtSamplePosition(
  mapData: AuthoritativeMapData,
  dimensions: TerrainSurfaceDimensions,
  sampleX: number,
  sampleY: number,
): number {
  const clampedX = clamp(sampleX, 0, dimensions.width);
  const clampedY = clamp(sampleY, 0, dimensions.height);
  const baseX = Math.min(Math.floor(clampedX), dimensions.width - 1);
  const baseY = Math.min(Math.floor(clampedY), dimensions.height - 1);
  const localX = clampedX - baseX;
  const localY = clampedY - baseY;
  const topLeft = readHeightWorld(mapData, dimensions, baseX, baseY);
  const topRight = readHeightWorld(mapData, dimensions, baseX + 1, baseY);
  const bottomLeft = readHeightWorld(mapData, dimensions, baseX, baseY + 1);
  const bottomRight = readHeightWorld(mapData, dimensions, baseX + 1, baseY + 1);

  if (localX + localY <= 1) {
    return topLeft + (topRight - topLeft) * localX + (bottomLeft - topLeft) * localY;
  }
  return topRight * (1 - localY) +
    bottomLeft * (1 - localX) +
    bottomRight * (localX + localY - 1);
}

function readHeightWorld(
  mapData: AuthoritativeMapData,
  dimensions: TerrainSurfaceDimensions,
  sampleX: number,
  sampleY: number,
): number {
  const clampedX = clamp(sampleX, 0, dimensions.width);
  const clampedY = clamp(sampleY, 0, dimensions.height);
  const sampleIndex = clampedY * (dimensions.width + 1) + clampedX;
  return (mapData.heightSamples[sampleIndex] ?? 0) / 65_535 * TERRAIN_VERTICAL_SCALE;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

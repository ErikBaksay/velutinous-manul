import { getTerrainHeightAtSamplePosition } from '../terrain-surface';
import type { TerrainSurfaceDimensions } from '../terrain-surface';
import type { AuthoritativeMapData } from '../map/map-types';
import type { CellCoordinate, GridDimensions } from './grid-coordinates';

export function getTerrainHeightAtCellLocal(
  mapData: AuthoritativeMapData,
  dimensions: GridDimensions,
  cell: CellCoordinate,
  localX: number,
  localZ: number,
): number {
  return getTerrainHeightAtSamplePosition(
    mapData,
    dimensions as TerrainSurfaceDimensions,
    cell.x + localX + 0.5,
    cell.y + localZ + 0.5,
  );
}

export { getTerrainHeightAtSamplePosition } from '../terrain-surface';

import * as THREE from 'three';
import {
  MAP_CELL_COUNT,
  RESOURCE_KINDS,
  type AuthoritativeMapData,
} from '../map/map-types';
import { ROAD_CONNECTION_MASK } from './road-network';
import {
  createRaisedRoadTileGeometry,
  deriveRoadGradeProfiles,
  getRoadFootprintPolygon,
  getRoadSurfaceElevationAtLocalPoint,
  ROAD_CROWN_HEIGHT,
  ROAD_EMBANKMENT_CLEARANCE,
  ROAD_EMBANKMENT_WIDTH,
  ROAD_SURFACE_WIDTH,
} from './road-geometry';
import { getTerrainHeightAtCellLocal } from './terrain-sampling';

describe('raised road geometry', () => {
  const dimensions = { width: 2, height: 2 } as const;

  it('creates a bounded, wider road footprint for every connection mask', () => {
    expect(ROAD_SURFACE_WIDTH).toBe(0.88);
    expect(ROAD_EMBANKMENT_WIDTH).toBe(0.98);
    for (let mask = 0; mask <= 15; mask += 1) {
      const asphalt = getRoadFootprintPolygon(ROAD_SURFACE_WIDTH, mask);
      const embankment = getRoadFootprintPolygon(ROAD_EMBANKMENT_WIDTH, mask);
      expect(asphalt.length).toBeGreaterThanOrEqual(4);
      expect(embankment.length).toBe(asphalt.length);
      expect(signedArea(asphalt)).toBeGreaterThan(0);
      for (const point of embankment) {
        expect(Math.abs(point.x)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(point.z)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('builds finite asphalt and embankment geometry for all 16 masks', () => {
    const data = createHeightData(dimensions);
    for (let mask = 0; mask <= 15; mask += 1) {
      const roads = [{ cell: { x: 0, y: 0 } }];
      const grade = deriveRoadGradeProfiles(data, dimensions, roads).get('0,0')!;
      const geometry = createRaisedRoadTileGeometry({
        mapData: data,
        dimensions,
        cell: roads[0].cell,
        connectionMask: mask,
        grade,
      });
      for (const layer of [geometry.asphalt, geometry.embankment]) {
        expect(layer.getAttribute('position').count).toBeGreaterThan(0);
        expect(layer.getIndex()?.count ?? 0).toBeGreaterThan(0);
        expectGeometryToBeFinite(layer);
      }
      const asphaltNormals = geometry.asphalt.getAttribute('normal');
      expect([...Array(asphaltNormals.count).keys()].some((index) =>
        asphaltNormals.getY(index) > 0,
      )).toBe(true);
      geometry.asphalt.dispose();
      geometry.embankment.dispose();
      geometry.markings?.dispose();
    }
  });

  it('shares an exact engineered grade across connected cell boundaries', () => {
    const data = createHeightData(dimensions);
    for (let y = 0; y <= dimensions.height; y += 1) {
      for (let x = 0; x <= dimensions.width; x += 1) {
        data.heightSamples[y * (dimensions.width + 1) + x] = x * 7_000 + y * 1_000;
      }
    }
    const roads = [
      { cell: { x: 0, y: 0 } },
      { cell: { x: 1, y: 0 } },
    ];
    const grades = deriveRoadGradeProfiles(data, dimensions, roads);
    const west = grades.get('0,0')!;
    const east = grades.get('1,0')!;
    const westBoundary = getRoadSurfaceElevationAtLocalPoint(
      west,
      ROAD_CONNECTION_MASK.east,
      0.5,
      0,
    );
    const eastBoundary = getRoadSurfaceElevationAtLocalPoint(
      east,
      ROAD_CONNECTION_MASK.west,
      -0.5,
      0,
    );

    expect(west.connectionElevations.east).toBe(east.connectionElevations.west);
    expect(westBoundary).toBeCloseTo(eastBoundary, 8);
    expect(westBoundary).toBeCloseTo(
      (west.centerElevation + east.centerElevation) / 2 + ROAD_CROWN_HEIGHT,
      8,
    );
  });

  it('keeps a symmetric crowned cross-section instead of following terrain triangles', () => {
    const data = createHeightData(dimensions);
    setCellCornerHeights(data, dimensions, { x: 0, y: 0 }, [0, 25_000, 4_000, 31_000]);
    const roads = [
      { cell: { x: 0, y: 0 } },
      { cell: { x: 1, y: 0 } },
    ];
    const grade = deriveRoadGradeProfiles(data, dimensions, roads).get('0,0')!;
    const mask = ROAD_CONNECTION_MASK.east;
    const northEdge = getRoadSurfaceElevationAtLocalPoint(grade, mask, 0.5, -0.3);
    const southEdge = getRoadSurfaceElevationAtLocalPoint(grade, mask, 0.5, 0.3);
    const crown = getRoadSurfaceElevationAtLocalPoint(grade, mask, 0.5, 0);

    expect(northEdge).toBeCloseTo(southEdge, 8);
    expect(crown).toBeGreaterThan(northEdge);
  });

  it('terminates the aggregate embankment on the sampled terrain surface', () => {
    const data = createHeightData(dimensions);
    setCellCornerHeights(data, dimensions, { x: 0, y: 0 }, [2_000, 10_000, 18_000, 27_000]);
    const roads = [{ cell: { x: 0, y: 0 } }];
    const grade = deriveRoadGradeProfiles(data, dimensions, roads).get('0,0')!;
    const outerOutline = getRoadFootprintPolygon(ROAD_EMBANKMENT_WIDTH, 0);
    const tile = createRaisedRoadTileGeometry({
      mapData: data,
      dimensions,
      cell: roads[0].cell,
      connectionMask: 0,
      grade,
    });
    const positions = tile.embankment.getAttribute('position');
    for (let index = 0; index < outerOutline.length; index += 1) {
      const vertexIndex = outerOutline.length + index;
      const point = outerOutline[index];
      expect(positions.getY(vertexIndex)).toBeCloseTo(
        getTerrainHeightAtCellLocal(data, dimensions, roads[0].cell, point.x, point.z) +
          ROAD_EMBANKMENT_CLEARANCE,
        5,
      );
    }
    tile.asphalt.dispose();
    tile.embankment.dispose();
    tile.markings?.dispose();
  });

  it('marks endpoints, straights, and corners but leaves junction pads clear', () => {
    const data = createHeightData(dimensions);
    const roads = [{ cell: { x: 0, y: 0 } }];
    const grade = deriveRoadGradeProfiles(data, dimensions, roads).get('0,0')!;
    const markingFor = (mask: number) => createRaisedRoadTileGeometry({
      mapData: data,
      dimensions,
      cell: roads[0].cell,
      connectionMask: mask,
      grade,
    }).markings;

    expect(markingFor(ROAD_CONNECTION_MASK.east)).not.toBeNull();
    expect(markingFor(ROAD_CONNECTION_MASK.east | ROAD_CONNECTION_MASK.west)).not.toBeNull();
    expect(markingFor(ROAD_CONNECTION_MASK.north | ROAD_CONNECTION_MASK.east)).not.toBeNull();
    expect(markingFor(
      ROAD_CONNECTION_MASK.north | ROAD_CONNECTION_MASK.east | ROAD_CONNECTION_MASK.south,
    )).toBeNull();
    expect(markingFor(15)).toBeNull();
    expect(markingFor(0)).toBeNull();
  });
});

function expectGeometryToBeFinite(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  for (let index = 0; index < positions.count; index += 1) {
    expect(Number.isFinite(positions.getX(index))).toBe(true);
    expect(Number.isFinite(positions.getY(index))).toBe(true);
    expect(Number.isFinite(positions.getZ(index))).toBe(true);
    expect(Number.isFinite(normals.getX(index))).toBe(true);
    expect(Number.isFinite(normals.getY(index))).toBe(true);
    expect(Number.isFinite(normals.getZ(index))).toBe(true);
  }
}

function signedArea(polygon: readonly { readonly x: number; readonly z: number }[]): number {
  return polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return area + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

function createHeightData(
  dimensions: { readonly width: number; readonly height: number },
): AuthoritativeMapData {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(MAP_CELL_COUNT);
  }
  return {
    heightSamples: new Uint16Array((dimensions.width + 1) * (dimensions.height + 1)),
    moisture: new Uint8Array(MAP_CELL_COUNT),
    temperature: new Uint8Array(MAP_CELL_COUNT),
    biome: new Uint8Array(MAP_CELL_COUNT),
    waterKind: new Uint8Array(MAP_CELL_COUNT),
    flags: new Uint8Array(MAP_CELL_COUNT),
    landmassId: new Uint16Array(MAP_CELL_COUNT),
    resourceProvinceId: new Uint16Array(MAP_CELL_COUNT),
    resourceMask: new Uint8Array(MAP_CELL_COUNT),
    resourceIntensity,
    deposits: [],
  };
}

function setCellCornerHeights(
  data: AuthoritativeMapData,
  dimensions: { readonly width: number; readonly height: number },
  cell: { readonly x: number; readonly y: number },
  heights: readonly [number, number, number, number],
): void {
  const sampleWidth = dimensions.width + 1;
  data.heightSamples[cell.y * sampleWidth + cell.x] = heights[0];
  data.heightSamples[cell.y * sampleWidth + cell.x + 1] = heights[1];
  data.heightSamples[(cell.y + 1) * sampleWidth + cell.x] = heights[2];
  data.heightSamples[(cell.y + 1) * sampleWidth + cell.x + 1] = heights[3];
}

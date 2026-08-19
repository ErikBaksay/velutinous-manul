import * as THREE from 'three';
import type { AuthoritativeMapData } from '../map/map-types';
import type { RoadState } from '../save/save-contract';
import type { CellCoordinate, GridDimensions } from './grid-coordinates';
import { getTerrainHeightAtCellLocal } from './terrain-sampling';
import {
  getRoadCellKey,
  ROAD_CONNECTION_MASK,
  type RoadConnectionMask,
} from './road-network';

export const ROAD_SURFACE_WIDTH = 0.88;
export const ROAD_EMBANKMENT_WIDTH = 0.98;
export const ROAD_DECK_CLEARANCE = 0.105;
export const ROAD_CROWN_HEIGHT = 0.012;
export const ROAD_SURFACE_EDGE_DROP = 0.018;
export const ROAD_EMBANKMENT_CLEARANCE = 0.008;
export const ROAD_MARKING_CLEARANCE = 0.006;
export const ROAD_MARKING_WIDTH = 0.035;

export interface RoadFootprintPoint {
  readonly x: number;
  readonly z: number;
}

export interface RoadGradeProfile {
  readonly centerElevation: number;
  readonly connectionElevations: Readonly<Partial<Record<RoadDirection, number>>>;
}

export interface RaisedRoadTileGeometry {
  readonly asphalt: THREE.BufferGeometry;
  readonly embankment: THREE.BufferGeometry;
  readonly markings: THREE.BufferGeometry | null;
}

export interface RaisedRoadTileGeometryOptions {
  readonly mapData: AuthoritativeMapData;
  readonly dimensions: GridDimensions;
  readonly cell: CellCoordinate;
  readonly connectionMask: RoadConnectionMask;
  readonly grade: RoadGradeProfile;
}

type RoadDirection = 'north' | 'east' | 'south' | 'west';

interface RoadRectangle {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

interface BoundaryEdge {
  readonly start: RoadFootprintPoint;
  readonly end: RoadFootprintPoint;
}

const DIRECTION_DATA: Readonly<Record<RoadDirection, {
  readonly dx: number;
  readonly dz: number;
  readonly mask: number;
}>> = Object.freeze({
  north: { dx: 0, dz: -1, mask: ROAD_CONNECTION_MASK.north },
  east: { dx: 1, dz: 0, mask: ROAD_CONNECTION_MASK.east },
  south: { dx: 0, dz: 1, mask: ROAD_CONNECTION_MASK.south },
  west: { dx: -1, dz: 0, mask: ROAD_CONNECTION_MASK.west },
});

/**
 * Produces the engineered road elevation field independently from render
 * objects. Connected cells interpolate between their terrain-relative center
 * elevations, so both halves of a connection share the same boundary height
 * and longitudinal grade.
 */
export function deriveRoadGradeProfiles(
  mapData: AuthoritativeMapData,
  dimensions: GridDimensions,
  roads: readonly RoadState[],
): ReadonlyMap<string, RoadGradeProfile> {
  const roadKeys = new Set(roads.map((road) => getRoadCellKey(road.cell)));
  const centerElevations = new Map<string, number>();
  for (const road of roads) {
    centerElevations.set(
      getRoadCellKey(road.cell),
      getTerrainHeightAtCellLocal(mapData, dimensions, road.cell, 0, 0) + ROAD_DECK_CLEARANCE,
    );
  }

  const profiles = new Map<string, RoadGradeProfile>();
  for (const road of roads) {
    const key = getRoadCellKey(road.cell);
    const centerElevation = centerElevations.get(key)!;
    const connectionElevations: Partial<Record<RoadDirection, number>> = {};
    for (const direction of roadDirections()) {
      const data = DIRECTION_DATA[direction];
      const neighborKey = getRoadCellKey({
        x: road.cell.x + data.dx,
        y: road.cell.y + data.dz,
      });
      if (roadKeys.has(neighborKey)) {
        connectionElevations[direction] =
          (centerElevation + centerElevations.get(neighborKey)!) / 2;
      }
    }
    profiles.set(key, { centerElevation, connectionElevations });
  }
  return profiles;
}

export function createRaisedRoadTileGeometry(
  options: RaisedRoadTileGeometryOptions,
): RaisedRoadTileGeometry {
  const asphaltOutline = getRoadFootprintPolygon(
    ROAD_SURFACE_WIDTH,
    options.connectionMask,
  );
  const embankmentOutline = getRoadFootprintPolygon(
    ROAD_EMBANKMENT_WIDTH,
    options.connectionMask,
  );

  return {
    asphalt: createAsphaltGeometry(asphaltOutline, options),
    embankment: createEmbankmentGeometry(asphaltOutline, embankmentOutline, options),
    markings: createRoadMarkingGeometry(options),
  };
}

/**
 * Returns a single orthogonal outline for a center pad and its connection
 * arms. The surface does not inherit the terrain mesh's diagonal split.
 */
export function getRoadFootprintPolygon(
  width: number,
  connectionMask: RoadConnectionMask,
): readonly RoadFootprintPoint[] {
  if (!Number.isFinite(width) || width <= 0 || width >= 1) {
    throw new Error('Road footprint width must be greater than zero and less than one cell.');
  }

  const halfWidth = width / 2;
  const rectangles: RoadRectangle[] = [
    { minX: -halfWidth, maxX: halfWidth, minZ: -halfWidth, maxZ: halfWidth },
  ];
  if ((connectionMask & ROAD_CONNECTION_MASK.north) !== 0) {
    rectangles.push({ minX: -halfWidth, maxX: halfWidth, minZ: -0.5, maxZ: -halfWidth });
  }
  if ((connectionMask & ROAD_CONNECTION_MASK.east) !== 0) {
    rectangles.push({ minX: halfWidth, maxX: 0.5, minZ: -halfWidth, maxZ: halfWidth });
  }
  if ((connectionMask & ROAD_CONNECTION_MASK.south) !== 0) {
    rectangles.push({ minX: -halfWidth, maxX: halfWidth, minZ: halfWidth, maxZ: 0.5 });
  }
  if ((connectionMask & ROAD_CONNECTION_MASK.west) !== 0) {
    rectangles.push({ minX: -0.5, maxX: -halfWidth, minZ: -halfWidth, maxZ: halfWidth });
  }

  const allEdges = rectangles.flatMap(rectangleToEdges);
  const edgeCounts = new Map<string, number>();
  for (const edge of allEdges) {
    const key = canonicalEdgeKey(edge.start, edge.end);
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  }
  const boundaryEdges = allEdges.filter(
    (edge) => edgeCounts.get(canonicalEdgeKey(edge.start, edge.end)) === 1,
  );
  const outgoing = new Map<string, BoundaryEdge[]>();
  for (const edge of boundaryEdges) {
    const edges = outgoing.get(pointKey(edge.start)) ?? [];
    edges.push(edge);
    outgoing.set(pointKey(edge.start), edges);
  }

  const firstEdge = boundaryEdges[0];
  if (!firstEdge) {
    return [];
  }
  const polygon: RoadFootprintPoint[] = [firstEdge.start];
  const used = new Set<BoundaryEdge>();
  let current = firstEdge;
  for (let step = 0; step <= boundaryEdges.length; step += 1) {
    used.add(current);
    polygon.push(current.end);
    if (pointsEqual(current.end, firstEdge.start)) {
      polygon.pop();
      break;
    }
    const next = outgoing.get(pointKey(current.end))?.find((edge) => !used.has(edge));
    if (!next) {
      throw new Error('Road footprint boundary could not be traced into a closed polygon.');
    }
    current = next;
  }

  const simplified = simplifyPolygon(polygon);
  const oriented = signedArea(simplified) >= 0 ? simplified : [...simplified].reverse();
  return bevelInteriorRoadCorners(oriented);
}

export function getRoadSurfaceElevationAtLocalPoint(
  grade: RoadGradeProfile,
  connectionMask: RoadConnectionMask,
  localX: number,
  localZ: number,
): number {
  const halfWidth = ROAD_SURFACE_WIDTH / 2;
  const arm = getArmAtPoint(connectionMask, localX, localZ, halfWidth);
  let elevation = grade.centerElevation;
  if (arm) {
    const edgeElevation = grade.connectionElevations[arm] ?? grade.centerElevation;
    const axis = arm === 'east' || arm === 'west' ? Math.abs(localX) : Math.abs(localZ);
    const progress = Math.min(1, Math.max(0, (axis - halfWidth) / (0.5 - halfWidth)));
    elevation = THREE.MathUtils.lerp(grade.centerElevation, edgeElevation, progress);
  }

  const lateral = arm === 'east' || arm === 'west'
    ? Math.abs(localZ)
    : arm === 'north' || arm === 'south'
      ? Math.abs(localX)
      : 0;
  const crown = arm
    ? ROAD_CROWN_HEIGHT * Math.max(0, 1 - lateral / halfWidth)
    : ROAD_CROWN_HEIGHT;
  return elevation + crown;
}

function createAsphaltGeometry(
  outline: readonly RoadFootprintPoint[],
  options: RaisedRoadTileGeometryOptions,
): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const point of outline) {
    positions.push(
      point.x,
      getRoadSurfaceElevationAtLocalPoint(
        options.grade,
        options.connectionMask,
        point.x,
        point.z,
      ),
      point.z,
    );
  }
  const indices: number[] = [];
  const triangles = THREE.ShapeUtils.triangulateShape(
    outline.map((point) => new THREE.Vector2(point.x, point.z)),
    [],
  );
  for (const triangle of triangles) {
    const first = outline[triangle[0]];
    const second = outline[triangle[1]];
    const third = outline[triangle[2]];
    const center = {
      x: (first.x + second.x + third.x) / 3,
      z: (first.z + second.z + third.z) / 3,
    };
    const centerIndex = positions.length / 3;
    positions.push(
      center.x,
      getRoadSurfaceElevationAtLocalPoint(
        options.grade,
        options.connectionMask,
        center.x,
        center.z,
      ),
      center.z,
    );
    indices.push(
      triangle[0], centerIndex, triangle[1],
      triangle[1], centerIndex, triangle[2],
      triangle[2], centerIndex, triangle[0],
    );
  }
  return finishGeometry(positions, indices);
}

function createEmbankmentGeometry(
  asphaltOutline: readonly RoadFootprintPoint[],
  outerOutline: readonly RoadFootprintPoint[],
  options: RaisedRoadTileGeometryOptions,
): THREE.BufferGeometry {
  if (asphaltOutline.length !== outerOutline.length) {
    throw new Error('Road surface and embankment outlines must share their topology.');
  }
  const positions: number[] = [];
  for (const point of asphaltOutline) {
    positions.push(
      point.x,
      getRoadSurfaceElevationAtLocalPoint(
        options.grade,
        options.connectionMask,
        point.x,
        point.z,
      ) - ROAD_SURFACE_EDGE_DROP,
      point.z,
    );
  }
  for (const point of outerOutline) {
    positions.push(
      point.x,
      getTerrainHeightAtCellLocal(
        options.mapData,
        options.dimensions,
        options.cell,
        point.x,
        point.z,
      ) + ROAD_EMBANKMENT_CLEARANCE,
      point.z,
    );
  }

  const indices: number[] = [];
  const outerStart = asphaltOutline.length;
  for (let index = 0; index < asphaltOutline.length; index += 1) {
    const next = (index + 1) % asphaltOutline.length;
    indices.push(index, outerStart + index, outerStart + next, index, outerStart + next, next);
  }
  return finishGeometry(positions, indices);
}

function createRoadMarkingGeometry(
  options: RaisedRoadTileGeometryOptions,
): THREE.BufferGeometry | null {
  const directions = connectedDirections(options.connectionMask);
  if (directions.length === 0 || directions.length >= 3) {
    return null;
  }

  let path: readonly RoadFootprintPoint[];
  if (directions.length === 1) {
    const direction = DIRECTION_DATA[directions[0]];
    path = [
      { x: direction.dx * 0.04, z: direction.dz * 0.04 },
      { x: direction.dx * 0.34, z: direction.dz * 0.34 },
    ];
  } else if (areOpposite(directions[0], directions[1])) {
    const horizontal = directions.includes('east');
    path = horizontal
      ? [{ x: -0.18, z: 0 }, { x: 0.18, z: 0 }]
      : [{ x: 0, z: -0.18 }, { x: 0, z: 0.18 }];
  } else {
    path = createCornerMarkingPath(directions[0], directions[1]);
  }
  return createMarkingRibbon(path, options);
}

function createCornerMarkingPath(
  first: RoadDirection,
  second: RoadDirection,
): readonly RoadFootprintPoint[] {
  const firstData = DIRECTION_DATA[first];
  const secondData = DIRECTION_DATA[second];
  const points: RoadFootprintPoint[] = [];
  for (let step = 0; step <= 5; step += 1) {
    const t = step / 5;
    const inverse = 1 - t;
    points.push({
      x: 0.3 * (inverse * inverse * firstData.dx + t * t * secondData.dx),
      z: 0.3 * (inverse * inverse * firstData.dz + t * t * secondData.dz),
    });
  }
  return points;
}

function createMarkingRibbon(
  path: readonly RoadFootprintPoint[],
  options: RaisedRoadTileGeometryOptions,
): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index];
    const previous = path[Math.max(0, index - 1)];
    const next = path[Math.min(path.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const offsetX = -dz / length * ROAD_MARKING_WIDTH / 2;
    const offsetZ = dx / length * ROAD_MARKING_WIDTH / 2;
    for (const side of [-1, 1]) {
      const x = point.x + offsetX * side;
      const z = point.z + offsetZ * side;
      positions.push(
        x,
        getRoadSurfaceElevationAtLocalPoint(options.grade, options.connectionMask, x, z) +
          ROAD_MARKING_CLEARANCE,
        z,
      );
    }
  }
  const indices: number[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = index * 2;
    indices.push(start, start + 1, start + 3, start, start + 3, start + 2);
  }
  return finishGeometry(positions, indices);
}

function getArmAtPoint(
  mask: RoadConnectionMask,
  x: number,
  z: number,
  halfWidth: number,
): RoadDirection | null {
  if (x > halfWidth && (mask & ROAD_CONNECTION_MASK.east) !== 0) return 'east';
  if (x < -halfWidth && (mask & ROAD_CONNECTION_MASK.west) !== 0) return 'west';
  if (z > halfWidth && (mask & ROAD_CONNECTION_MASK.south) !== 0) return 'south';
  if (z < -halfWidth && (mask & ROAD_CONNECTION_MASK.north) !== 0) return 'north';
  return null;
}

function connectedDirections(mask: RoadConnectionMask): RoadDirection[] {
  return roadDirections().filter((direction) => (mask & DIRECTION_DATA[direction].mask) !== 0);
}

function roadDirections(): RoadDirection[] {
  return ['north', 'east', 'south', 'west'];
}

function areOpposite(first: RoadDirection, second: RoadDirection): boolean {
  return (first === 'north' && second === 'south') ||
    (first === 'south' && second === 'north') ||
    (first === 'east' && second === 'west') ||
    (first === 'west' && second === 'east');
}

function finishGeometry(positions: number[], indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function rectangleToEdges(rectangle: RoadRectangle): readonly BoundaryEdge[] {
  return polygonToEdges([
    { x: rectangle.minX, z: rectangle.minZ },
    { x: rectangle.maxX, z: rectangle.minZ },
    { x: rectangle.maxX, z: rectangle.maxZ },
    { x: rectangle.minX, z: rectangle.maxZ },
  ]);
}

function polygonToEdges(polygon: readonly RoadFootprintPoint[]): readonly BoundaryEdge[] {
  return polygon.map((start, index) => ({
    start,
    end: polygon[(index + 1) % polygon.length],
  }));
}

function simplifyPolygon(polygon: readonly RoadFootprintPoint[]): RoadFootprintPoint[] {
  const result: RoadFootprintPoint[] = [];
  for (const point of polygon) {
    if (!result.at(-1) || !pointsEqual(result.at(-1)!, point)) {
      result.push(point);
    }
  }
  if (result.length > 1 && pointsEqual(result[0], result.at(-1)!)) {
    result.pop();
  }
  let changed = true;
  while (changed && result.length >= 3) {
    changed = false;
    for (let index = 0; index < result.length; index += 1) {
      const previous = result[(index + result.length - 1) % result.length];
      const current = result[index];
      const next = result[(index + 1) % result.length];
      const cross = (current.x - previous.x) * (next.z - current.z) -
        (current.z - previous.z) * (next.x - current.x);
      if (Math.abs(cross) < 1e-8) {
        result.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return result;
}

function bevelInteriorRoadCorners(
  polygon: readonly RoadFootprintPoint[],
): RoadFootprintPoint[] {
  const beveled: RoadFootprintPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    // Connection cross-sections must remain exact at cell boundaries so the
    // neighboring tile has the same edge vertices.
    if (Math.abs(current.x) === 0.5 || Math.abs(current.z) === 0.5) {
      beveled.push(current);
      continue;
    }
    const previousLength = Math.hypot(previous.x - current.x, previous.z - current.z);
    const nextLength = Math.hypot(next.x - current.x, next.z - current.z);
    const radius = Math.min(0.045, previousLength * 0.35, nextLength * 0.35);
    if (radius < 1e-5) {
      beveled.push(current);
      continue;
    }
    beveled.push(
      {
        x: current.x + (previous.x - current.x) / previousLength * radius,
        z: current.z + (previous.z - current.z) / previousLength * radius,
      },
      {
        x: current.x + (next.x - current.x) / nextLength * radius,
        z: current.z + (next.z - current.z) / nextLength * radius,
      },
    );
  }
  return beveled;
}

function signedArea(polygon: readonly RoadFootprintPoint[]): number {
  return polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return area + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

function canonicalEdgeKey(start: RoadFootprintPoint, end: RoadFootprintPoint): string {
  const first = pointKey(start);
  const second = pointKey(end);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function pointKey(point: RoadFootprintPoint): string {
  return `${point.x.toFixed(8)},${point.z.toFixed(8)}`;
}

function pointsEqual(first: RoadFootprintPoint, second: RoadFootprintPoint): boolean {
  return Math.abs(first.x - second.x) < 1e-8 && Math.abs(first.z - second.z) < 1e-8;
}

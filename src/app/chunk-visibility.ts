import * as THREE from 'three';
import {
  CAMERA_NAVIGATION_PLANE_USER_DATA_KEY,
  CAMERA_NAVIGATION_PLANE_Y,
  CameraNavigationState,
  getCameraTerrainProjectionBounds,
} from './camera-controller';
import { MAP_HEIGHT, MAP_WIDTH } from './map/map-types';
import { TERRAIN_VERTICAL_SCALE } from './map/terrain-generation';
import { TERRAIN_CHUNK_SIZE } from './terrain-chunk-renderer';

export const INITIAL_DESIRED_CHUNK_BUDGET = 576;
export const CHUNK_PREFETCH_RADIUS = 1;
export const MAX_CHUNK_CONTENT_HEIGHT = TERRAIN_VERTICAL_SCALE + 5;

export interface LogicalChunkCoordinate {
  readonly x: number;
  readonly y: number;
}

export interface ChunkSelectionBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
}

export interface ChunkViewSelection {
  readonly visible: readonly LogicalChunkCoordinate[];
  readonly prefetch: readonly LogicalChunkCoordinate[];
  readonly desired: readonly LogicalChunkCoordinate[];
  readonly rejected: readonly LogicalChunkCoordinate[];
  readonly candidateCount: number;
  readonly visibleBounds: ChunkSelectionBounds;
  readonly budgetState: 'within-budget' | 'prefetch-over-budget' | 'visible-over-budget';
}

const TERRAIN_MINIMUM_HEIGHT = 0;

export function selectChunksForView(
  camera: THREE.OrthographicCamera,
  mapWidth = MAP_WIDTH,
  mapHeight = MAP_HEIGHT,
  chunkSize = TERRAIN_CHUNK_SIZE,
  navigationState?: CameraNavigationState,
): ChunkViewSelection {
  camera.updateMatrixWorld(true);
  const frustum = createCameraFrustum(camera);
  const projectionBounds = getCameraTerrainProjectionBounds(
    camera,
    TERRAIN_MINIMUM_HEIGHT,
    MAX_CHUNK_CONTENT_HEIGHT,
  );
  const candidateBounds = getCandidateChunkBounds(
    projectionBounds,
    mapWidth,
    mapHeight,
    chunkSize,
  );
  const visible: LogicalChunkCoordinate[] = [];

  for (let y = candidateBounds.minimumY; y <= candidateBounds.maximumY; y += 1) {
    for (let x = candidateBounds.minimumX; x <= candidateBounds.maximumX; x += 1) {
      const bounds = getChunkWorldBounds(x, y, mapWidth, mapHeight, chunkSize);
      if (frustum.intersectsBox(bounds)) {
        visible.push({ x, y });
      }
    }
  }

  const navigationTarget = getNavigationTarget(camera, navigationState);
  sortChunksByTarget(visible, navigationTarget, mapWidth, mapHeight, chunkSize);
  const visibleKeys = new Set(visible.map(chunkKey));
  const prefetch: LogicalChunkCoordinate[] = [];
  const desiredBounds = expandChunkBounds(
    getCoordinateBounds(visible, candidateBounds),
    CHUNK_PREFETCH_RADIUS,
    mapWidth / chunkSize,
    mapHeight / chunkSize,
  );

  for (let y = desiredBounds.minimumY; y <= desiredBounds.maximumY; y += 1) {
    for (let x = desiredBounds.minimumX; x <= desiredBounds.maximumX; x += 1) {
      if (!visibleKeys.has(chunkKey({ x, y }))) {
        prefetch.push({ x, y });
      }
    }
  }

  sortChunksByTarget(prefetch, navigationTarget, mapWidth, mapHeight, chunkSize);

  const desired = [...visible, ...prefetch];
  const rejected = visible.length > INITIAL_DESIRED_CHUNK_BUDGET
    ? []
    : desired.slice(INITIAL_DESIRED_CHUNK_BUDGET);
  const budgetState = visible.length > INITIAL_DESIRED_CHUNK_BUDGET
    ? 'visible-over-budget'
    : rejected.length > 0
      ? 'prefetch-over-budget'
      : 'within-budget';

  return {
    visible,
    prefetch,
    desired,
    rejected,
    candidateCount: getChunkCount(candidateBounds),
    visibleBounds: getCoordinateBounds(visible, candidateBounds),
    budgetState,
  };
}

export function getChunkWorldBounds(
  chunkX: number,
  chunkY: number,
  mapWidth = MAP_WIDTH,
  mapHeight = MAP_HEIGHT,
  chunkSize = TERRAIN_CHUNK_SIZE,
): THREE.Box3 {
  const minimumX = chunkX * chunkSize - mapWidth / 2;
  const minimumZ = chunkY * chunkSize - mapHeight / 2;
  return new THREE.Box3(
    new THREE.Vector3(minimumX, TERRAIN_MINIMUM_HEIGHT, minimumZ),
    new THREE.Vector3(
      minimumX + chunkSize,
      MAX_CHUNK_CONTENT_HEIGHT,
      minimumZ + chunkSize,
    ),
  );
}

export function getChunkWorldCenter(
  chunk: LogicalChunkCoordinate,
  mapWidth = MAP_WIDTH,
  mapHeight = MAP_HEIGHT,
  chunkSize = TERRAIN_CHUNK_SIZE,
): THREE.Vector3 {
  const bounds = getChunkWorldBounds(chunk.x, chunk.y, mapWidth, mapHeight, chunkSize);
  return bounds.getCenter(new THREE.Vector3());
}

export function chunkKey(chunk: LogicalChunkCoordinate): string {
  return `${chunk.x}:${chunk.y}`;
}

export function createChunkSelectionSignature(selection: ChunkViewSelection): string {
  return [
    createCoordinateSetSignature(selection.visible),
    createCoordinateSetSignature(selection.prefetch),
    createCoordinateSetSignature(selection.rejected),
  ].join('|');
}

function createCoordinateSetSignature(chunks: readonly LogicalChunkCoordinate[]): string {
  return chunks.map(chunkKey).sort().join(',');
}

function createCameraFrustum(camera: THREE.OrthographicCamera): THREE.Frustum {
  const projectionView = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  return new THREE.Frustum().setFromProjectionMatrix(projectionView);
}

function getNavigationTarget(
  camera: THREE.OrthographicCamera,
  navigationState?: CameraNavigationState,
): THREE.Vector3 {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  if (Math.abs(direction.y) < Number.EPSILON) {
    return camera.position.clone();
  }

  const navigationPlaneY = navigationState?.navigationPlaneY ?? getNavigationPlaneY(camera);
  const distance = (navigationPlaneY - camera.position.y) / direction.y;
  return camera.position.clone().addScaledVector(direction, distance);
}

function getNavigationPlaneY(camera: THREE.OrthographicCamera): number {
  const value = camera.userData[CAMERA_NAVIGATION_PLANE_USER_DATA_KEY];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : CAMERA_NAVIGATION_PLANE_Y;
}

function sortChunksByTarget(
  chunks: LogicalChunkCoordinate[],
  target: THREE.Vector3,
  mapWidth: number,
  mapHeight: number,
  chunkSize: number,
): void {
  chunks.sort((first, second) => {
    const firstCenter = getChunkWorldCenter(first, mapWidth, mapHeight, chunkSize);
    const secondCenter = getChunkWorldCenter(second, mapWidth, mapHeight, chunkSize);
    return firstCenter.distanceToSquared(target) - secondCenter.distanceToSquared(target);
  });
}

function getCandidateChunkBounds(
  projectionBounds: {
    minimumX: number;
    maximumX: number;
    minimumZ: number;
    maximumZ: number;
  },
  mapWidth: number,
  mapHeight: number,
  chunkSize: number,
): ChunkSelectionBounds {
  return {
    minimumX: clampChunkIndex(
      Math.floor((projectionBounds.minimumX + mapWidth / 2) / chunkSize) - 1,
      mapWidth / chunkSize,
    ),
    maximumX: clampChunkIndex(
      Math.floor((projectionBounds.maximumX + mapWidth / 2) / chunkSize) + 1,
      mapWidth / chunkSize,
    ),
    minimumY: clampChunkIndex(
      Math.floor((projectionBounds.minimumZ + mapHeight / 2) / chunkSize) - 1,
      mapHeight / chunkSize,
    ),
    maximumY: clampChunkIndex(
      Math.floor((projectionBounds.maximumZ + mapHeight / 2) / chunkSize) + 1,
      mapHeight / chunkSize,
    ),
  };
}

function getCoordinateBounds(
  coordinates: readonly LogicalChunkCoordinate[],
  fallback: ChunkSelectionBounds,
): ChunkSelectionBounds {
  if (coordinates.length === 0) {
    return fallback;
  }

  return {
    minimumX: Math.min(...coordinates.map((coordinate) => coordinate.x)),
    maximumX: Math.max(...coordinates.map((coordinate) => coordinate.x)),
    minimumY: Math.min(...coordinates.map((coordinate) => coordinate.y)),
    maximumY: Math.max(...coordinates.map((coordinate) => coordinate.y)),
  };
}

function expandChunkBounds(
  bounds: ChunkSelectionBounds,
  radius: number,
  chunksWide: number,
  chunksHigh: number,
): ChunkSelectionBounds {
  return {
    minimumX: clampChunkIndex(bounds.minimumX - radius, chunksWide),
    maximumX: clampChunkIndex(bounds.maximumX + radius, chunksWide),
    minimumY: clampChunkIndex(bounds.minimumY - radius, chunksHigh),
    maximumY: clampChunkIndex(bounds.maximumY + radius, chunksHigh),
  };
}

function clampChunkIndex(index: number, chunkCount: number): number {
  return Math.min(Math.max(index, 0), chunkCount - 1);
}

function getChunkCount(bounds: ChunkSelectionBounds): number {
  return Math.max(0, bounds.maximumX - bounds.minimumX + 1) *
    Math.max(0, bounds.maximumY - bounds.minimumY + 1);
}

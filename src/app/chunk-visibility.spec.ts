import * as THREE from 'three';
import { MAP_HEIGHT, MAP_WIDTH } from './map/map-types';
import {
  chunkKey,
  createChunkSelectionSignature,
  getChunkWorldBounds,
  getChunkWorldCenter,
  INITIAL_DESIRED_CHUNK_BUDGET,
  selectChunksForView,
} from './chunk-visibility';
import { TERRAIN_CHUNK_SIZE } from './terrain-chunk-renderer';

describe('chunk visibility selection', () => {
  it('selects a bounded candidate area instead of scanning the full map', () => {
    const camera = createCamera();
    const selection = selectChunksForView(camera);

    expect(selection.visible.length).toBeGreaterThan(0);
    expect(selection.candidateCount).toBeLessThan(32 * 32);
    expect(selection.desired.length).toBeGreaterThanOrEqual(selection.visible.length);
    expect(new Set(selection.desired.map((chunk) => `${chunk.x}:${chunk.y}`)).size).toBe(
      selection.desired.length,
    );
  });

  it('keeps elevated chunk content inside the frustum test volume', () => {
    const camera = createCamera();
    camera.position.set(220, 118, 220);
    camera.lookAt(0, 18, 0);
    camera.updateMatrixWorld(true);
    const selection = selectChunksForView(camera);

    expect(selection.visible.length).toBeGreaterThan(0);
    expect(selection.visible.every((chunk) => chunk.x >= 0 && chunk.x < 32)).toBe(true);
    expect(selection.visible.every((chunk) => chunk.y >= 0 && chunk.y < 32)).toBe(true);
  });

  it('produces stable signatures for unchanged selection sets', () => {
    const camera = createCamera();
    const first = selectChunksForView(camera);
    const second = selectChunksForView(camera);

    expect(createChunkSelectionSignature(first)).toBe(createChunkSelectionSignature(second));
  });

  it('prioritizes visible chunks nearest the navigation target', () => {
    const camera = createCamera();
    const selection = selectChunksForView(camera);
    const target = new THREE.Vector3(0, 18, 0);
    const firstDistance = getChunkWorldCenter(selection.visible[0]).distanceToSquared(target);

    expect(firstDistance).toBe(
      Math.min(
        ...selection.visible.map((chunk) => getChunkWorldCenter(chunk).distanceToSquared(target)),
      ),
    );
  });

  it('reports budget pressure without dropping visible chunks', () => {
    const camera = createCamera();
    camera.zoom = 0.25;
    camera.updateProjectionMatrix();
    const selection = selectChunksForView(camera);

    if (selection.visible.length <= INITIAL_DESIRED_CHUNK_BUDGET) {
      expect(selection.rejected.length).toBe(
        Math.max(selection.desired.length - INITIAL_DESIRED_CHUNK_BUDGET, 0),
      );
    } else {
      expect(selection.rejected.length).toBe(0);
      expect(selection.budgetState).toBe('visible-over-budget');
    }
  });

  it('does not omit frustum-intersecting chunks at shallow elevations', () => {
    for (const elevation of [12, 20, 30, 45, 65]) {
      const camera = createCoverageCamera(elevation);
      const selection = selectChunksForView(camera);
      const expected = getReferenceVisibleChunkKeys(camera);

      expect(selection.visible.map(chunkKey).sort()).toEqual(expected.sort());
    }
  });
});

function createCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-64, 64, 64, -64, 0.1, 1_800);
  camera.position.set(90, 108, 90);
  camera.lookAt(0, 18, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function createCoverageCamera(elevationDegrees: number): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-102.4, 102.4, 64, -64, 0.1, 1_800);
  const horizontalRadius = Math.sqrt(90 ** 2 + 90 ** 2);
  const heading = THREE.MathUtils.degToRad(315);
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  camera.position.set(
    Math.sin(heading) * horizontalRadius,
    18 + Math.tan(elevation) * horizontalRadius,
    Math.cos(heading) * horizontalRadius,
  );
  camera.lookAt(0, 18, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function getReferenceVisibleChunkKeys(camera: THREE.OrthographicCamera): string[] {
  const projectionView = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projectionView);
  const keys: string[] = [];

  for (let chunkY = 0; chunkY < MAP_HEIGHT / TERRAIN_CHUNK_SIZE; chunkY += 1) {
    for (let chunkX = 0; chunkX < MAP_WIDTH / TERRAIN_CHUNK_SIZE; chunkX += 1) {
      if (frustum.intersectsBox(getChunkWorldBounds(chunkX, chunkY))) {
        keys.push(`${chunkX}:${chunkY}`);
      }
    }
  }

  return keys;
}

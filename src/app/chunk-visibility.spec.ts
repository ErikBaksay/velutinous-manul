import * as THREE from 'three';
import {
  createChunkSelectionSignature,
  getChunkWorldCenter,
  INITIAL_DESIRED_CHUNK_BUDGET,
  selectChunksForView,
} from './chunk-visibility';

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
    expect(selection.visible.every((chunk) => chunk.x >= 0 && chunk.x < 32)).toBeTrue();
    expect(selection.visible.every((chunk) => chunk.y >= 0 && chunk.y < 32)).toBeTrue();
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
});

function createCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-64, 64, 64, -64, 0.1, 1_800);
  camera.position.set(90, 108, 90);
  camera.lookAt(0, 18, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

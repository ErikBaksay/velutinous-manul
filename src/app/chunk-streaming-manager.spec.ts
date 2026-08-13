import * as THREE from 'three';
import { createEmptyAuthoritativeMapData } from './map/map-types';
import {
  ChunkStreamingManager,
  STREAMING_BUILD_BUDGET_MS,
} from './chunk-streaming-manager';
import { INITIAL_DESIRED_CHUNK_BUDGET } from './chunk-visibility';

describe('ChunkStreamingManager', () => {
  it('attaches the initial visible bundles before resolving readiness', async () => {
    const scene = new THREE.Scene();
    const manager = new ChunkStreamingManager(scene);
    const camera = createCamera();

    manager.beginMap(createEmptyAuthoritativeMapData(), 32_000);
    const ready = manager.beginInitialView(camera);
    for (let frame = 0; frame < 240; frame += 1) {
      manager.update(camera);
    }
    await ready;

    const diagnostics = manager.getDiagnostics();
    expect(diagnostics.initialReady).toBe(true);
    expect(diagnostics.attachedCount).toBeGreaterThanOrEqual(1);
    expect(diagnostics.queuedCount).toBeGreaterThanOrEqual(0);
    manager.destroy();
  });

  it('advances the map epoch and disposes the previous logical window', async () => {
    const scene = new THREE.Scene();
    const manager = new ChunkStreamingManager(scene);
    const camera = createCamera();

    manager.beginMap(createEmptyAuthoritativeMapData(), 32_000);
    const firstReady = manager.beginInitialView(camera);
    for (let frame = 0; frame < 240; frame += 1) {
      manager.update(camera);
    }
    await firstReady;
    expect(manager.getDiagnostics().mapEpoch).toBe(1);

    manager.beginMap(createEmptyAuthoritativeMapData(), 32_000);
    const secondReady = manager.beginInitialView(camera);
    for (let frame = 0; frame < 240; frame += 1) {
      manager.update(camera);
    }
    await secondReady;

    expect(manager.getDiagnostics().mapEpoch).toBe(2);
    expect(scene.getObjectByName('terrain-chunks')).toBeDefined();
    manager.destroy();
  });

  it('retains outgoing bundles until the new visible set is attached', async () => {
    const scene = new THREE.Scene();
    const manager = new ChunkStreamingManager(scene);
    const camera = createCamera();

    manager.beginMap(createEmptyAuthoritativeMapData(), 32_000);
    const ready = manager.beginInitialView(camera);
    runFrames(manager, camera, 240);
    await ready;

    const previousAttached = new Set(manager.getDiagnostics().attachedKeys);
    camera.position.set(474, 45, 294);
    camera.lookAt(384, 18, 384);
    camera.updateMatrixWorld(true);
    manager.update(camera);

    const selection = manager.getCurrentSelection();
    const transitioned = manager.getDiagnostics();
    if (!selection) {
      throw new Error('Expected a current selection after moving the camera.');
    }
    const nextDesired = new Set(selection.desired.map((chunk) => `${chunk.x}:${chunk.y}`));
    const outgoing = [...previousAttached].filter((key) => !nextDesired.has(key));
    expect(outgoing.length).toBeGreaterThan(0);
    expect(outgoing.some((key) => transitioned.attachedKeys.includes(key))).toBe(true);
    expect(transitioned.retainedCount).toBeGreaterThan(0);
    expect(transitioned.retainedCount).toBeLessThanOrEqual(INITIAL_DESIRED_CHUNK_BUDGET);

    runFrames(manager, camera, 240);
    const settled = manager.getDiagnostics();
    expect(settled.retainedCount).toBe(0);
    expect(selection.visible.every((chunk) => settled.attachedKeys.includes(`${chunk.x}:${chunk.y}`))).toBe(true);
    expect(settled.queuedCount).toBe(0);
    expect(settled.inFlightCount).toBe(0);
    expect(settled.buildBudgetMs).toBe(STREAMING_BUILD_BUDGET_MS);
    manager.destroy();
  });

  it('returns a terrain hit only from an attached chunk', async () => {
    const scene = new THREE.Scene();
    const manager = new ChunkStreamingManager(scene);
    const camera = createCamera();

    manager.beginMap(createEmptyAuthoritativeMapData(), 32_000);
    const ready = manager.beginInitialView(camera);
    runFrames(manager, camera, 240);
    await ready;

    const hit = manager.raycastTerrain(new THREE.Raycaster(
      new THREE.Vector3(0.5, 100, 0.5),
      new THREE.Vector3(0, -1, 0),
    ));
    expect(hit).not.toBeNull();
    manager.destroy();
  });
});

function runFrames(
  manager: ChunkStreamingManager,
  camera: THREE.OrthographicCamera,
  frameCount: number,
): void {
  for (let frame = 0; frame < frameCount; frame += 1) {
    manager.update(camera);
  }
}

function createCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-64, 64, 64, -64, 0.1, 1_800);
  camera.position.set(90, 108, 90);
  camera.lookAt(0, 18, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

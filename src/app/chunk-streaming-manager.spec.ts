import * as THREE from 'three';
import { createEmptyAuthoritativeMapData } from './map/map-types';
import { ChunkStreamingManager } from './chunk-streaming-manager';

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
    expect(diagnostics.initialReady).toBeTrue();
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
});

function createCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-64, 64, 64, -64, 0.1, 1_800);
  camera.position.set(90, 108, 90);
  camera.lookAt(0, 18, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

import * as THREE from 'three';
import {
  BASE_CAMERA_VIEW_HEIGHT,
  CAMERA_NAVIGATION_PLANE_Y,
  CameraConstraintOptions,
  CameraController,
  MAX_CAMERA_VIEW_HEIGHT,
  MIN_CAMERA_VIEW_HEIGHT,
} from './camera-controller';

describe('CameraController', () => {
  let canvas: HTMLCanvasElement;
  let camera: THREE.OrthographicCamera;
  let controller: CameraController;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.width = 800;
    canvas.height = 600;
    document.body.append(canvas);
    camera = new THREE.OrthographicCamera(-64, 64, 64, -64, 0.1, 500);
    controller = new CameraController(camera, canvas);
  });

  afterEach(() => {
    controller.dispose();
    canvas.remove();
  });

  it('resets the camera around the fixed navigation plane', () => {
    controller.reset(12, -8);

    expect(camera.position.x).toBeCloseTo(102);
    expect(camera.position.y).toBeCloseTo(CAMERA_NAVIGATION_PLANE_Y + 90);
    expect(camera.position.z).toBeCloseTo(82);
    expect(camera.zoom).toBeCloseTo(BASE_CAMERA_VIEW_HEIGHT / MAX_CAMERA_VIEW_HEIGHT);
  });

  it('keeps the orbit pivot on the active map surface', () => {
    controller.setNavigationPlaneY(35.24);
    controller.reset(12, -8);

    expect(camera.position.y).toBeCloseTo(125.24);
    expect(controller.getDebugState().target[1]).toBeCloseTo(35.24);
    expect(controller.getDebugState().navigationPlaneY).toBeCloseTo(35.24);
  });

  it('does not relocate the target when the view reaches the map edge', () => {
    controller.setConstraints(createConstraints(-128, 128, -128, 128));
    controller.reset(400, 400);

    expect(controller.getDebugState().target[0]).toBeCloseTo(400);
    expect(controller.getDebugState().target[2]).toBeCloseTo(400);
    expect(controller.getDebugState().targetClamped).toBeFalse();
  });

  it('raises the minimum zoom when a low-angle footprint cannot fit', () => {
    controller.setConstraints(createConstraints(-32, 32, -32, 32));

    expect(controller.getDebugState().minimumZoom).toBeGreaterThan(BASE_CAMERA_VIEW_HEIGHT / MAX_CAMERA_VIEW_HEIGHT);
  });

  it('clamps long frame deltas before applying keyboard movement', () => {
    canvas.focus();
    canvas.dispatchEvent(new Event('pointerdown'));
    controller.setNavigationEnabled(true);
    const before = controller.getDebugState().target;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));

    controller.update(1);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));

    const after = controller.getDebugState().target;
    expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeLessThan(10);
  });

  it('converts the visible-height limits into orthographic zoom limits', () => {
    expect(BASE_CAMERA_VIEW_HEIGHT / camera.zoom).toBeCloseTo(MAX_CAMERA_VIEW_HEIGHT);
    expect(BASE_CAMERA_VIEW_HEIGHT / MIN_CAMERA_VIEW_HEIGHT).toBeGreaterThan(1);
    expect(BASE_CAMERA_VIEW_HEIGHT / MAX_CAMERA_VIEW_HEIGHT).toBeGreaterThan(1);
  });

  it('moves continuously with focused keyboard input only when enabled', () => {
    canvas.focus();
    canvas.dispatchEvent(new Event('pointerdown'));
    controller.setNavigationEnabled(true);
    const initialX = camera.position.x;
    const event = new KeyboardEvent('keydown', {
      code: 'KeyW',
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    controller.update(1 / 60);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));

    expect(event.defaultPrevented).toBeTrue();
    expect(camera.position.x).not.toBe(initialX);

    const movedX = camera.position.x;
    controller.setNavigationEnabled(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    controller.update(1);

    expect(camera.position.x).toBe(movedX);
  });
});

function createConstraints(
  minimumX: number,
  maximumX: number,
  minimumZ: number,
  maximumZ: number,
): CameraConstraintOptions {
  return {
    bounds: { minimumX, maximumX, minimumZ, maximumZ },
    terrainMinimumY: 0,
    terrainMaximumY: 70,
    edgePadding: 0,
    minimumElevationDegrees: 20,
    maximumElevationDegrees: 88,
    maximumVisibleHeight: MAX_CAMERA_VIEW_HEIGHT,
  };
}

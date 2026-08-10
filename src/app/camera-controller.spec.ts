import * as THREE from 'three';
import {
  BASE_CAMERA_VIEW_HEIGHT,
  CAMERA_NAVIGATION_PLANE_Y,
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
    canvas.width = 800;
    canvas.height = 600;
    camera = new THREE.OrthographicCamera(-64, 64, 64, -64, 0.1, 500);
    controller = new CameraController(camera, canvas);
  });

  afterEach(() => {
    controller.dispose();
  });

  it('resets the camera around the fixed navigation plane', () => {
    controller.reset(12, -8);

    expect(camera.position.x).toBeCloseTo(102);
    expect(camera.position.y).toBeCloseTo(CAMERA_NAVIGATION_PLANE_Y + 90);
    expect(camera.position.z).toBeCloseTo(82);
    expect(camera.zoom).toBe(1);
  });

  it('converts the visible-height limits into orthographic zoom limits', () => {
    expect(BASE_CAMERA_VIEW_HEIGHT / camera.zoom).toBe(BASE_CAMERA_VIEW_HEIGHT);
    expect(BASE_CAMERA_VIEW_HEIGHT / MIN_CAMERA_VIEW_HEIGHT).toBeGreaterThan(1);
    expect(BASE_CAMERA_VIEW_HEIGHT / MAX_CAMERA_VIEW_HEIGHT).toBeLessThan(1);
  });

  it('moves continuously with focused keyboard input only when enabled', () => {
    canvas.focus();
    controller.setNavigationEnabled(true);
    const initialX = camera.position.x;
    const event = new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true });
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

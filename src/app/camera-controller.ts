import * as THREE from 'three';
import { MOUSE } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const CAMERA_NAVIGATION_PLANE_Y = 18;
export const BASE_CAMERA_VIEW_HEIGHT = 128;
export const MIN_CAMERA_VIEW_HEIGHT = 48;
export const MAX_CAMERA_VIEW_HEIGHT = 320;

const MIN_CAMERA_ZOOM = BASE_CAMERA_VIEW_HEIGHT / MAX_CAMERA_VIEW_HEIGHT;
const MAX_CAMERA_ZOOM = BASE_CAMERA_VIEW_HEIGHT / MIN_CAMERA_VIEW_HEIGHT;
const MIN_POLAR_ANGLE = THREE.MathUtils.degToRad(2);
const MAX_POLAR_ANGLE = THREE.MathUtils.degToRad(78);
const KEY_PAN_SPEED = 96;
const INITIAL_CAMERA_OFFSET = new THREE.Vector3(90, 90, 90);

const MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
]);

export class CameraController {
  private readonly controls: OrbitControls;
  private readonly movementKeys = new Set<string>();
  private navigationEnabled = false;
  private sceneHasFocus = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.navigationEnabled || !this.sceneHasFocus || isEditableTarget(event.target)) {
      return;
    }

    if (!MOVEMENT_KEYS.has(event.code)) {
      return;
    }

    this.movementKeys.add(event.code);
    event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.movementKeys.delete(event.code);
  };

  private readonly onWindowBlur = (): void => {
    this.clearMovementKeys();
    this.sceneHasFocus = false;
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') {
      this.clearMovementKeys();
      this.sceneHasFocus = false;
    }
  };

  private readonly onPointerDown = (): void => {
    this.sceneHasFocus = true;
    this.domElement.focus({ preventScroll: true });
  };

  private readonly onFocus = (): void => {
    this.sceneHasFocus = true;
  };

  private readonly onCanvasBlur = (): void => {
    this.clearMovementKeys();
    this.sceneHasFocus = false;
  };

  constructor(
    private readonly camera: THREE.OrthographicCamera,
    private readonly domElement: HTMLCanvasElement,
  ) {
    this.controls = new OrbitControls(camera, domElement);
    this.controls.mouseButtons.LEFT = null;
    this.controls.mouseButtons.MIDDLE = MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = MOUSE.PAN;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = MIN_POLAR_ANGLE;
    this.controls.maxPolarAngle = MAX_POLAR_ANGLE;
    this.controls.minZoom = MIN_CAMERA_ZOOM;
    this.controls.maxZoom = MAX_CAMERA_ZOOM;
    this.controls.enabled = false;

    domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    domElement.addEventListener('focus', this.onFocus);
    domElement.addEventListener('blur', this.onCanvasBlur);

    this.reset(0, 0);
  }

  setNavigationEnabled(enabled: boolean): void {
    this.navigationEnabled = enabled;
    this.controls.enabled = enabled;
    if (!enabled) {
      this.clearMovementKeys();
      this.sceneHasFocus = false;
    }
  }

  reset(targetX: number, targetZ: number): void {
    this.controls.target.set(targetX, CAMERA_NAVIGATION_PLANE_Y, targetZ);
    this.camera.position
      .copy(this.controls.target)
      .add(INITIAL_CAMERA_OFFSET);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.controls.saveState();
  }

  update(deltaSeconds: number): void {
    this.controls.update(Math.min(Math.max(deltaSeconds, 0), 0.05));
    if (!this.navigationEnabled || this.movementKeys.size === 0) {
      return;
    }

    const delta = this.getKeyboardPanDelta(deltaSeconds);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.controls.target.y = CAMERA_NAVIGATION_PLANE_Y;
    this.controls.update();
  }

  dispose(): void {
    this.clearMovementKeys();
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.domElement.removeEventListener('focus', this.onFocus);
    this.domElement.removeEventListener('blur', this.onCanvasBlur);
    this.controls.dispose();
  }

  private getKeyboardPanDelta(deltaSeconds: number): THREE.Vector3 {
    const azimuth = this.controls.getAzimuthalAngle();
    const forward = new THREE.Vector3(-Math.sin(azimuth), 0, -Math.cos(azimuth));
    const right = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth));
    const movement = new THREE.Vector3();

    if (this.movementKeys.has('KeyW') || this.movementKeys.has('ArrowUp')) {
      movement.add(forward);
    }
    if (this.movementKeys.has('KeyS') || this.movementKeys.has('ArrowDown')) {
      movement.sub(forward);
    }
    if (this.movementKeys.has('KeyD') || this.movementKeys.has('ArrowRight')) {
      movement.add(right);
    }
    if (this.movementKeys.has('KeyA') || this.movementKeys.has('ArrowLeft')) {
      movement.sub(right);
    }

    if (movement.lengthSq() === 0) {
      return movement;
    }

    movement.normalize().multiplyScalar(KEY_PAN_SPEED * deltaSeconds);
    return movement;
  }

  private clearMovementKeys(): void {
    this.movementKeys.clear();
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.matches('input, textarea, select, button, [contenteditable="true"]')
  );
}

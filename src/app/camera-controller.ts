import * as THREE from 'three';
import { MOUSE } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const CAMERA_NAVIGATION_PLANE_Y = 18;
export const CAMERA_NAVIGATION_PLANE_USER_DATA_KEY = 'cameraNavigationPlaneY';
export const BASE_CAMERA_VIEW_HEIGHT = 128;
export const MIN_CAMERA_VIEW_HEIGHT = 32;
export const MAX_CAMERA_VIEW_HEIGHT = BASE_CAMERA_VIEW_HEIGHT / 1.54;

export interface CameraBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
}

export interface CameraConstraintOptions {
  readonly bounds: CameraBounds;
  readonly terrainMinimumY: number;
  readonly terrainMaximumY: number;
  readonly edgePadding: number;
  readonly minimumElevationDegrees: number;
  readonly maximumElevationDegrees: number;
  readonly maximumVisibleHeight: number;
}

export interface CameraNavigationState {
  readonly navigationPlaneY: number;
}

export interface CameraTerrainProjectionBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
}

export interface CameraDebugState {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly zoom: number;
  readonly polarAngleDegrees: number;
  readonly elevationDegrees: number;
  readonly headingDegrees: number;
  readonly navigationPlaneY: number;
  readonly visibleViewHeight: number;
  readonly targetClamped: boolean;
  readonly minimumZoom: number;
  readonly maximumZoom: number;
  readonly minimumElevationDegrees: number;
  readonly maximumElevationDegrees: number;
  readonly navigationEnabled: boolean;
  readonly sceneHasFocus: boolean;
}

const MIN_CAMERA_ZOOM = BASE_CAMERA_VIEW_HEIGHT / MAX_CAMERA_VIEW_HEIGHT;
const MAX_CAMERA_ZOOM = BASE_CAMERA_VIEW_HEIGHT / MIN_CAMERA_VIEW_HEIGHT;
const DEFAULT_MINIMUM_ELEVATION_DEGREES = 20;
const DEFAULT_MAXIMUM_ELEVATION_DEGREES = 88;
const KEY_PAN_SPEED = 96;
const INITIAL_CAMERA_OFFSET = new THREE.Vector3(90, 90, 90);
const FRUSTUM_CORNER_NDC = [
  new THREE.Vector3(-1, -1, -1),
  new THREE.Vector3(1, -1, -1),
  new THREE.Vector3(-1, 1, -1),
  new THREE.Vector3(1, 1, -1),
  new THREE.Vector3(-1, -1, 1),
  new THREE.Vector3(1, -1, 1),
  new THREE.Vector3(-1, 1, 1),
  new THREE.Vector3(1, 1, 1),
] as const;
const FRUSTUM_EDGES = [
  [0, 1], [2, 3], [0, 2], [1, 3],
  [4, 5], [6, 7], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
] as const;

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
  private navigationPlaneY = CAMERA_NAVIGATION_PLANE_Y;
  private constraints: CameraConstraintOptions | null = null;
  private targetClamped = false;
  private minimumZoom = MIN_CAMERA_ZOOM;
  private minimumElevationDegrees = DEFAULT_MINIMUM_ELEVATION_DEGREES;
  private maximumElevationDegrees = DEFAULT_MAXIMUM_ELEVATION_DEGREES;
  private lastConstrainedPosition: THREE.Vector3 | null = null;
  private lastConstrainedTarget: THREE.Vector3 | null = null;
  private lastConstrainedQuaternion: THREE.Quaternion | null = null;
  private lastConstrainedZoom: number | null = null;

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
    this.controls.zoomToCursor = true;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(2);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(90 - this.minimumElevationDegrees);
    this.controls.minZoom = MIN_CAMERA_ZOOM;
    this.controls.maxZoom = MAX_CAMERA_ZOOM;
    this.controls.enabled = false;
    this.setNavigationPlaneY(this.navigationPlaneY);

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

  setConstraints(options: CameraConstraintOptions): void {
    if (!isValidConstraintOptions(options)) {
      return;
    }

    this.constraints = options;
    this.minimumElevationDegrees = options.minimumElevationDegrees;
    this.maximumElevationDegrees = options.maximumElevationDegrees;
    this.lastConstrainedPosition = null;
    this.lastConstrainedTarget = null;
    this.lastConstrainedQuaternion = null;
    this.lastConstrainedZoom = null;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(90 - options.maximumElevationDegrees);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(90 - options.minimumElevationDegrees);
    this.applyConstraints();
  }

  getNavigationState(): CameraNavigationState {
    return { navigationPlaneY: this.navigationPlaneY };
  }

  setNavigationPlaneY(navigationPlaneY: number): void {
    if (!Number.isFinite(navigationPlaneY)) {
      return;
    }

    this.navigationPlaneY = navigationPlaneY;
    this.camera.userData[CAMERA_NAVIGATION_PLANE_USER_DATA_KEY] = navigationPlaneY;
    this.controls.target.y = navigationPlaneY;
    this.controls.update();
    this.applyConstraints();
  }

  getDebugState(): CameraDebugState {
    const polarAngleDegrees = THREE.MathUtils.radToDeg(this.controls.getPolarAngle());
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
      zoom: this.camera.zoom,
      polarAngleDegrees,
      elevationDegrees: 90 - polarAngleDegrees,
      headingDegrees: normalizeHeadingDegrees(
        -THREE.MathUtils.radToDeg(this.controls.getAzimuthalAngle()),
      ),
      navigationPlaneY: this.navigationPlaneY,
      visibleViewHeight: BASE_CAMERA_VIEW_HEIGHT / this.camera.zoom,
      targetClamped: this.targetClamped,
      minimumZoom: this.minimumZoom,
      maximumZoom: MAX_CAMERA_ZOOM,
      minimumElevationDegrees: this.minimumElevationDegrees,
      maximumElevationDegrees: this.maximumElevationDegrees,
      navigationEnabled: this.navigationEnabled,
      sceneHasFocus: this.sceneHasFocus,
    };
  }

  reset(targetX: number, targetZ: number): void {
    this.controls.target.set(targetX, this.navigationPlaneY, targetZ);
    this.camera.position
      .copy(this.controls.target)
      .add(INITIAL_CAMERA_OFFSET);
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.applyConstraints();
    this.controls.saveState();
  }

  update(deltaSeconds: number): void {
    const safeDeltaSeconds = Math.min(Math.max(deltaSeconds, 0), 0.05);
    this.controls.update(safeDeltaSeconds);
    if (!this.navigationEnabled || this.movementKeys.size === 0) {
      this.applyConstraints();
      return;
    }

    const delta = this.getKeyboardPanDelta(safeDeltaSeconds);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.controls.target.y = this.navigationPlaneY;
    this.camera.userData[CAMERA_NAVIGATION_PLANE_USER_DATA_KEY] = this.navigationPlaneY;
    this.controls.update();
    this.applyConstraints();
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

    const visibleViewHeight = BASE_CAMERA_VIEW_HEIGHT / this.camera.zoom;
    movement.normalize().multiplyScalar(
      KEY_PAN_SPEED * deltaSeconds * visibleViewHeight / BASE_CAMERA_VIEW_HEIGHT,
    );
    return movement;
  }

  private applyConstraints(): void {
    if (!this.constraints) {
      this.minimumZoom = MIN_CAMERA_ZOOM;
      this.controls.minZoom = this.minimumZoom;
      return;
    }

    this.targetClamped = false;

    if (this.lastConstrainedPosition &&
      this.lastConstrainedTarget &&
      this.lastConstrainedQuaternion &&
      this.lastConstrainedZoom !== null &&
      this.lastConstrainedPosition.equals(this.camera.position) &&
      this.lastConstrainedTarget.equals(this.controls.target) &&
      this.lastConstrainedQuaternion.equals(this.camera.quaternion) &&
      Math.abs(this.lastConstrainedZoom - this.camera.zoom) < Number.EPSILON) {
      return;
    }

    this.minimumZoom = this.getMinimumZoomForCurrentView();
    this.controls.minZoom = this.minimumZoom;
    if (this.camera.zoom < this.minimumZoom) {
      this.camera.zoom = this.minimumZoom;
      this.camera.updateProjectionMatrix();
    }
    this.recordConstraintState();
  }

  private getMinimumZoomForCurrentView(): number {
    if (!this.constraints) {
      return MIN_CAMERA_ZOOM;
    }

    const currentZoom = this.camera.zoom;
    const minimumWidth = Math.max(
      this.constraints.bounds.maximumX - this.constraints.bounds.minimumX - this.constraints.edgePadding * 2,
      1,
    );
    const minimumDepth = Math.max(
      this.constraints.bounds.maximumZ - this.constraints.bounds.minimumZ - this.constraints.edgePadding * 2,
      1,
    );
    const configuredMinimumZoom = Math.max(
      MIN_CAMERA_ZOOM,
      BASE_CAMERA_VIEW_HEIGHT / this.constraints.maximumVisibleHeight,
    );
    const fitsAt = (zoom: number): boolean => {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
      const footprint = getCameraTerrainProjectionBounds(
        this.camera,
        this.constraints!.terrainMinimumY,
        this.constraints!.terrainMaximumY,
      );
      return footprint.maximumX - footprint.minimumX <= minimumWidth + 0.001 &&
        footprint.maximumZ - footprint.minimumZ <= minimumDepth + 0.001;
    };

    if (fitsAt(configuredMinimumZoom)) {
      this.camera.zoom = currentZoom;
      this.camera.updateProjectionMatrix();
      return configuredMinimumZoom;
    }

    let low = configuredMinimumZoom;
    let high = MAX_CAMERA_ZOOM;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const midpoint = (low + high) / 2;
      if (fitsAt(midpoint)) {
        high = midpoint;
      } else {
        low = midpoint;
      }
    }
    this.camera.zoom = currentZoom;
    this.camera.updateProjectionMatrix();
    return high;
  }

  private recordConstraintState(): void {
    this.lastConstrainedPosition ??= new THREE.Vector3();
    this.lastConstrainedTarget ??= new THREE.Vector3();
    this.lastConstrainedQuaternion ??= new THREE.Quaternion();
    this.lastConstrainedPosition.copy(this.camera.position);
    this.lastConstrainedTarget.copy(this.controls.target);
    this.lastConstrainedQuaternion.copy(this.camera.quaternion);
    this.lastConstrainedZoom = this.camera.zoom;
  }

  private clearMovementKeys(): void {
    this.movementKeys.clear();
  }
}

export function getCameraTerrainProjectionBounds(
  camera: THREE.OrthographicCamera,
  terrainMinimumY: number,
  terrainMaximumY: number,
): CameraTerrainProjectionBounds {
  camera.updateMatrixWorld(true);
  const frustumCorners = FRUSTUM_CORNER_NDC.map((corner) => corner.clone().unproject(camera));
  const points: THREE.Vector3[] = [];

  for (const corner of frustumCorners) {
    if (corner.y >= terrainMinimumY && corner.y <= terrainMaximumY) {
      points.push(corner.clone());
    }
  }

  for (const [startIndex, endIndex] of FRUSTUM_EDGES) {
    const start = frustumCorners[startIndex];
    const end = frustumCorners[endIndex];
    const verticalDelta = end.y - start.y;
    if (Math.abs(verticalDelta) < Number.EPSILON) {
      continue;
    }

    for (const height of [terrainMinimumY, terrainMaximumY]) {
      const interpolation = (height - start.y) / verticalDelta;
      if (interpolation < -0.001 || interpolation > 1.001) {
        continue;
      }
      points.push(start.clone().lerp(end, THREE.MathUtils.clamp(interpolation, 0, 1)));
    }
  }

  if (points.length === 0) {
    points.push(...frustumCorners);
  }

  return {
    minimumX: Math.min(...points.map((point) => point.x)),
    maximumX: Math.max(...points.map((point) => point.x)),
    minimumZ: Math.min(...points.map((point) => point.z)),
    maximumZ: Math.max(...points.map((point) => point.z)),
  };
}

function isValidConstraintOptions(options: CameraConstraintOptions): boolean {
  return Number.isFinite(options.bounds.minimumX) &&
    Number.isFinite(options.bounds.maximumX) &&
    Number.isFinite(options.bounds.minimumZ) &&
    Number.isFinite(options.bounds.maximumZ) &&
    options.bounds.maximumX > options.bounds.minimumX &&
    options.bounds.maximumZ > options.bounds.minimumZ &&
    Number.isFinite(options.terrainMinimumY) &&
    Number.isFinite(options.terrainMaximumY) &&
    options.terrainMaximumY > options.terrainMinimumY &&
    Number.isFinite(options.edgePadding) &&
    options.edgePadding >= 0 &&
    Number.isFinite(options.minimumElevationDegrees) &&
    Number.isFinite(options.maximumElevationDegrees) &&
    options.minimumElevationDegrees > 0 &&
    options.maximumElevationDegrees > options.minimumElevationDegrees &&
    Number.isFinite(options.maximumVisibleHeight) &&
    options.maximumVisibleHeight > 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.matches('input, textarea, select, button, [contenteditable="true"]')
  );
}

function normalizeHeadingDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

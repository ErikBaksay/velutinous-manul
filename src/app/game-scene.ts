import * as THREE from 'three';
import { MAP_HEIGHT, MAP_WIDTH, AuthoritativeMapData } from './map/map-types';
import { TERRAIN_VERTICAL_SCALE } from './map/terrain-generation';
import {
  BASE_CAMERA_VIEW_HEIGHT,
  CAMERA_NAVIGATION_PLANE_Y,
  CameraConstraintOptions,
  CameraController,
  MAX_CAMERA_VIEW_HEIGHT,
} from './camera-controller';
import { ChunkDebugVisualizer } from './chunk-debug-visualizer';
import { ChunkStreamingManager } from './chunk-streaming-manager';

const CAMERA_ORBIT_RADIUS = Math.sqrt(90 ** 2 + 90 ** 2 + 90 ** 2);
const CAMERA_FAR_PLANE = Math.ceil(
  Math.hypot(MAP_WIDTH, MAP_HEIGHT) + CAMERA_ORBIT_RADIUS + TERRAIN_VERTICAL_SCALE + 16,
);
const CAMERA_FOG_NEAR = 420;
const CAMERA_MAP_EDGE_PADDING = 32;
const CAMERA_MINIMUM_ELEVATION = 40;
const CAMERA_MAXIMUM_ELEVATION = 88;
const MAP_BACKDROP_SIZE = Math.max(MAP_WIDTH, MAP_HEIGHT) * 3;

export class GameScene {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.OrthographicCamera;
  private readonly cameraController: CameraController;
  private readonly chunkStreamingManager: ChunkStreamingManager;
  private readonly chunkDebugVisualizer: ChunkDebugVisualizer | null;
  private readonly mapBackdrop: THREE.Mesh;
  private readonly resizeObserver: ResizeObserver;
  private frameHandle = 0;
  private previousFrameTime = performance.now();
  private lastCameraFar = Number.NaN;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.camera = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.1, CAMERA_FAR_PLANE);
    this.camera.position.set(90, 108, 90);
    this.camera.lookAt(0, CAMERA_NAVIGATION_PLANE_Y, 0);
    this.cameraController = new CameraController(this.camera, canvas);
    this.cameraController.setConstraints(CAMERA_CONSTRAINTS);
    this.chunkStreamingManager = new ChunkStreamingManager(this.scene);
    this.chunkDebugVisualizer = isChunkDebugEnabled()
      ? new ChunkDebugVisualizer(this.scene, host)
      : null;

    this.scene.background = new THREE.Color(0x59636c);
    this.scene.fog = new THREE.Fog(0x59636c, CAMERA_FOG_NEAR, CAMERA_FAR_PLANE);
    this.mapBackdrop = createMapBackdrop();
    this.scene.add(this.mapBackdrop);

    this.addSoftLighting();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.frameHandle = requestAnimationFrame(this.render);
  }

  destroy(): void {
    cancelAnimationFrame(this.frameHandle);
    this.cameraController.dispose();
    this.chunkStreamingManager.destroy();
    this.chunkDebugVisualizer?.dispose();
    this.resizeObserver.disconnect();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    });
    this.renderer.dispose();
  }

  setMapData(
    data: AuthoritativeMapData,
    seaLevelSample: number,
    startingCell?: number,
  ): Promise<void> {
    this.chunkStreamingManager.beginMap(data, seaLevelSample);
    const seaLevelWorld = (seaLevelSample / 65_535) * TERRAIN_VERTICAL_SCALE + 0.08;
    this.cameraController.setNavigationPlaneY(seaLevelWorld);
    this.mapBackdrop.position.y = seaLevelWorld - 0.04;

    if (startingCell === undefined) {
      this.cameraController.reset(0, 0);
      return this.chunkStreamingManager.beginInitialView(
        this.camera,
        this.cameraController.getNavigationState(),
      );
    }

    const cellX = startingCell % MAP_WIDTH;
    const cellY = Math.floor(startingCell / MAP_WIDTH);
    this.cameraController.reset(
      cellX - MAP_WIDTH / 2 + 0.5,
      cellY - MAP_HEIGHT / 2 + 0.5,
    );
    return this.chunkStreamingManager.beginInitialView(
      this.camera,
      this.cameraController.getNavigationState(),
    );
  }

  setNavigationEnabled(enabled: boolean): void {
    this.cameraController.setNavigationEnabled(enabled);
  }

  private readonly render = (): void => {
    this.frameHandle = requestAnimationFrame(this.render);
    const now = performance.now();
    this.cameraController.update((now - this.previousFrameTime) / 1_000);
    this.previousFrameTime = now;
    this.updateCameraClipping();
    this.chunkStreamingManager.update(this.camera, this.cameraController.getNavigationState());
    const currentSelection = this.chunkStreamingManager.getCurrentSelection();
    if (this.chunkDebugVisualizer && currentSelection) {
      this.chunkDebugVisualizer.update(
        currentSelection,
        this.chunkStreamingManager.getDiagnostics(),
        this.cameraController.getDebugState(),
      );
    }
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    const aspect = width / height;
    const viewHeight = BASE_CAMERA_VIEW_HEIGHT;

    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
  }

  private updateCameraClipping(): void {
    const mapCorners = [
      new THREE.Vector3(CAMERA_CONSTRAINTS.bounds.minimumX, CAMERA_CONSTRAINTS.terrainMinimumY, CAMERA_CONSTRAINTS.bounds.minimumZ),
      new THREE.Vector3(CAMERA_CONSTRAINTS.bounds.minimumX, CAMERA_CONSTRAINTS.terrainMaximumY, CAMERA_CONSTRAINTS.bounds.minimumZ),
      new THREE.Vector3(CAMERA_CONSTRAINTS.bounds.minimumX, CAMERA_CONSTRAINTS.terrainMinimumY, CAMERA_CONSTRAINTS.bounds.maximumZ),
      new THREE.Vector3(CAMERA_CONSTRAINTS.bounds.minimumX, CAMERA_CONSTRAINTS.terrainMaximumY, CAMERA_CONSTRAINTS.bounds.maximumZ),
      new THREE.Vector3(CAMERA_CONSTRAINTS.bounds.maximumX, CAMERA_CONSTRAINTS.terrainMinimumY, CAMERA_CONSTRAINTS.bounds.minimumZ),
      new THREE.Vector3(CAMERA_CONSTRAINTS.bounds.maximumX, CAMERA_CONSTRAINTS.terrainMaximumY, CAMERA_CONSTRAINTS.bounds.minimumZ),
      new THREE.Vector3(CAMERA_CONSTRAINTS.bounds.maximumX, CAMERA_CONSTRAINTS.terrainMinimumY, CAMERA_CONSTRAINTS.bounds.maximumZ),
      new THREE.Vector3(CAMERA_CONSTRAINTS.bounds.maximumX, CAMERA_CONSTRAINTS.terrainMaximumY, CAMERA_CONSTRAINTS.bounds.maximumZ),
    ];
    const maximumDistance = Math.max(
      ...mapCorners.map((corner) => this.camera.position.distanceTo(corner)),
    );
    const nextFar = Math.max(512, maximumDistance + 64);
    if (Math.abs(nextFar - this.lastCameraFar) > 0.5) {
      this.camera.far = nextFar;
      this.camera.updateProjectionMatrix();
      this.lastCameraFar = nextFar;
    }
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = Math.min(CAMERA_FOG_NEAR, this.camera.far * 0.65);
      this.scene.fog.far = this.camera.far;
    }
  }

  private addSoftLighting(): void {
    const ambient = new THREE.HemisphereLight(0xb6b5a7, 0x404640, 1.55);
    this.scene.add(ambient);

    const sunset = new THREE.DirectionalLight(0xffc18d, 1.15);
    sunset.position.set(-80, 110, 35);
    this.scene.add(sunset);

    const coolFill = new THREE.DirectionalLight(0x71879a, 0.8);
    coolFill.position.set(70, 55, -80);
    this.scene.add(coolFill);
  }

}

const CAMERA_CONSTRAINTS: CameraConstraintOptions = {
  bounds: {
    minimumX: -MAP_WIDTH / 2,
    maximumX: MAP_WIDTH / 2,
    minimumZ: -MAP_HEIGHT / 2,
    maximumZ: MAP_HEIGHT / 2,
  },
  terrainMinimumY: 0,
  terrainMaximumY: TERRAIN_VERTICAL_SCALE + 5,
  edgePadding: CAMERA_MAP_EDGE_PADDING,
  minimumElevationDegrees: CAMERA_MINIMUM_ELEVATION,
  maximumElevationDegrees: CAMERA_MAXIMUM_ELEVATION,
  maximumVisibleHeight: MAX_CAMERA_VIEW_HEIGHT,
};

function createMapBackdrop(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(MAP_BACKDROP_SIZE, MAP_BACKDROP_SIZE);
  const material = new THREE.MeshBasicMaterial({
    color: 0x466873,
    depthWrite: false,
  });
  const backdrop = new THREE.Mesh(geometry, material);
  backdrop.name = 'map-background-water';
  backdrop.rotation.x = -Math.PI / 2;
  backdrop.position.y = CAMERA_NAVIGATION_PLANE_Y - 0.04;
  backdrop.renderOrder = -1;
  return backdrop;
}

function isChunkDebugEnabled(): boolean {
  return typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === 'chunks';
}

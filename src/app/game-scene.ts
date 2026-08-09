import * as THREE from 'three';
import { AuthoritativeMapData } from './map/map-types';
import { ForestChunkRenderer } from './forest-chunk-renderer';
import { DepositChunkRenderer } from './deposit-chunk-renderer';
import { TerrainChunkRenderer } from './terrain-chunk-renderer';
import { WaterChunkRenderer } from './water-chunk-renderer';

export class GameScene {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.OrthographicCamera;
  private readonly resizeObserver: ResizeObserver;
  private forestChunkRenderer: ForestChunkRenderer | null = null;
  private depositChunkRenderer: DepositChunkRenderer | null = null;
  private terrainChunkRenderer: TerrainChunkRenderer | null = null;
  private waterChunkRenderer: WaterChunkRenderer | null = null;
  private frameHandle = 0;

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

    this.camera = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.1, 500);
    this.camera.position.set(90, 108, 90);
    this.camera.lookAt(0, 18, 0);

    this.scene.background = new THREE.Color(0x59636c);
    this.scene.fog = new THREE.Fog(0x59636c, 260, 500);

    this.addSoftLighting();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.frameHandle = requestAnimationFrame(this.render);
  }

  destroy(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.forestChunkRenderer?.destroy();
    this.forestChunkRenderer = null;
    this.depositChunkRenderer?.destroy();
    this.depositChunkRenderer = null;
    this.waterChunkRenderer?.destroy();
    this.waterChunkRenderer = null;
    this.terrainChunkRenderer?.destroy();
    this.terrainChunkRenderer = null;
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

  setMapData(data: AuthoritativeMapData, seaLevelSample: number): void {
    this.forestChunkRenderer?.destroy();
    this.depositChunkRenderer?.destroy();
    this.waterChunkRenderer?.destroy();
    this.terrainChunkRenderer?.destroy();
    this.terrainChunkRenderer = new TerrainChunkRenderer(this.scene, data);
    this.waterChunkRenderer = new WaterChunkRenderer(this.scene, data, seaLevelSample);
    this.forestChunkRenderer = new ForestChunkRenderer(this.scene, data);
    this.depositChunkRenderer = new DepositChunkRenderer(this.scene, data);
  }

  private readonly render = (): void => {
    this.frameHandle = requestAnimationFrame(this.render);
    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    const aspect = width / height;
    const viewHeight = 128;

    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
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

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveRuntimeAssetUrl } from './visual-asset-registry';

export const COURIER_VAN_ASSET_ID = 'courier_van_lod0' as const;
export const COURIER_VAN_ASSET_PATH = 'assets/vehicles/courier_van.glb' as const;

export interface VehicleAssetPrototype {
  readonly id: typeof COURIER_VAN_ASSET_ID;
  readonly root: THREE.Object3D;
  readonly bounds: THREE.Box3;
}

export class VehicleAssetRegistry {
  private prototype: VehicleAssetPrototype | null = null;
  private didAttemptLoad = false;
  private didWarnUnavailable = false;

  async load(): Promise<void> {
    if (this.didAttemptLoad) {
      return;
    }
    this.didAttemptLoad = true;
    let root: THREE.Object3D | null = null;
    try {
      root = await loadGlb(resolveRuntimeAssetUrl(COURIER_VAN_ASSET_PATH));
      const bounds = new THREE.Box3().setFromObject(root);
      validateCourierVanRoot(root, bounds);
      this.prototype = { id: COURIER_VAN_ASSET_ID, root, bounds };
    } catch (error) {
      if (root) {
        disposeVehicleObject(root);
      }
      if (!this.didWarnUnavailable) {
        console.warn('[vehicle assets] courier van is unavailable; vehicle visuals are disabled', error);
        this.didWarnUnavailable = true;
      }
    }
  }

  hasCourierVan(): boolean {
    return this.prototype !== null;
  }

  getCourierVan(): VehicleAssetPrototype {
    if (!this.prototype) {
      throw new Error('Courier van asset has not been loaded.');
    }
    return this.prototype;
  }

  createCourierVanInstance(): THREE.Object3D | null {
    return this.prototype?.root.clone(true) ?? null;
  }

  destroy(): void {
    if (!this.prototype) {
      return;
    }
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.prototype.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.prototype = null;
  }
}

function loadGlb(url: string): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const root = gltf.scene.getObjectByName(COURIER_VAN_ASSET_ID);
      if (!root) {
        reject(new Error(`Courier van root must be named ${COURIER_VAN_ASSET_ID}.`));
        return;
      }
      resolve(root);
    }, undefined, reject);
  });
}

function validateCourierVanRoot(root: THREE.Object3D, bounds: THREE.Box3): void {
  if (root.name !== COURIER_VAN_ASSET_ID) {
    throw new Error(`Courier van root must be named ${COURIER_VAN_ASSET_ID}.`);
  }
  const dimensions = bounds.getSize(new THREE.Vector3());
  if (dimensions.x < 5.5 || dimensions.x > 6.6) {
    throw new Error(`Courier van length is outside the runtime envelope: ${dimensions.x.toFixed(3)}.`);
  }
  if (dimensions.y < 2.15 || dimensions.y > 2.55) {
    throw new Error(`Courier van height is outside the runtime envelope: ${dimensions.y.toFixed(3)}.`);
  }
  if (dimensions.z < 2.0 || dimensions.z > 2.8) {
    throw new Error(`Courier van width is outside the runtime envelope: ${dimensions.z.toFixed(3)}.`);
  }
  if (Math.abs(bounds.min.y) > 0.005) {
    throw new Error(`Courier van is not grounded: minimum Y=${bounds.min.y.toFixed(5)}.`);
  }
}

function disposeVehicleObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

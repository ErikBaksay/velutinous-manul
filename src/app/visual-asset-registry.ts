import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type VisualAssetFamily = 'canopy' | 'understory' | 'rock' | 'shore' | 'deposit';

export interface AssetPrototype {
  readonly id: string;
  readonly baseId: string;
  readonly family: VisualAssetFamily;
  readonly lod: 0 | 1;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material | THREE.Material[];
}

const ASSET_FAMILIES: Readonly<Record<string, VisualAssetFamily>> = Object.freeze({
  tree_spruce: 'canopy',
  tree_pine: 'canopy',
  tree_birch: 'canopy',
  tree_oak: 'canopy',
  shrub_cluster: 'understory',
  grass_clump: 'understory',
  reed_cluster: 'understory',
  rock_pebbles: 'rock',
  rock_boulder: 'rock',
  rock_outcrop: 'rock',
  shore_stones: 'shore',
  driftwood: 'shore',
  ore_iron: 'deposit',
  ore_copper: 'deposit',
  ore_stone: 'deposit',
});

const MATERIAL_COLORS: Readonly<Record<string, number>> = Object.freeze({
  tree_spruce_lod0: 0x173d2c,
  tree_pine_lod0: 0x28563a,
  tree_birch_lod0: 0x426b3d,
  tree_oak_lod0: 0x4f7a47,
  shrub_cluster_lod0: 0x5f8a4c,
  grass_clump_lod0: 0x83a05c,
  reed_cluster_lod0: 0x718c56,
  rock_pebbles_lod0: 0x8b8b79,
  rock_boulder_lod0: 0x686e68,
  rock_outcrop_lod0: 0x72776e71,
  shore_stones_lod0: 0xa59b83,
  driftwood_lod0: 0x80634b,
  ore_iron_lod0: 0x9b5b4b,
  ore_copper_lod0: 0x4e9b82,
  ore_stone_lod0: 0xb2afa0,
});

export class VisualAssetRegistry {
  private readonly prototypes = new Map<string, AssetPrototype>();
  private readonly familyMaterials = new Map<VisualAssetFamily, THREE.MeshStandardMaterial>();
  private readonly loadedRoots: THREE.Object3D[] = [];
  private didWarnFallback = false;

  async load(): Promise<void> {
    if (this.prototypes.size > 0) {
      return;
    }

    try {
      const manifestResponse = await fetch('/assets/environment/manifest.json');
      if (!manifestResponse.ok) {
        throw new Error(`Environment manifest is not available (${manifestResponse.status}).`);
      }
      const manifest = await manifestResponse.json() as { runtimeAsset?: boolean; assetPath?: string };
      if (!manifest.runtimeAsset) {
        throw new Error('Environment GLB has not been exported yet.');
      }
      await this.loadGlb(manifest.assetPath ?? '/assets/environment/environment.glb');
      this.completeMissingAssetsWithFallback();
    } catch (error) {
      // Blender is an authoring dependency, not a runtime dependency. Keeping a
      // code-native kit here makes development builds useful before the GLB is exported.
      if (!this.didWarnFallback) {
        console.warn('[visual assets] authored GLB unavailable; using procedural kit', error);
        this.didWarnFallback = true;
      }
      this.createProceduralKit();
      this.addMissingLodFallbacks();
    }
  }

  get(id: string): AssetPrototype {
    const asset = this.prototypes.get(id);
    if (!asset) {
      throw new Error(`Unknown environment asset: ${id}`);
    }
    return asset;
  }

  listFamily(family: VisualAssetFamily): readonly AssetPrototype[] {
    return [...this.prototypes.values()].filter((asset) => asset.family === family);
  }

  getFamilyMaterial(family: VisualAssetFamily): THREE.MeshStandardMaterial {
    const existing = this.familyMaterials.get(family);
    if (existing) {
      return existing;
    }
    const color = family === 'canopy'
      ? 0x315b3d
      : family === 'understory'
        ? 0x759452
        : family === 'rock'
          ? 0x77766b
          : family === 'shore'
            ? 0xb3a579
            : 0x9a6850;
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: family === 'rock' || family === 'deposit' ? 0.96 : 0.9,
      metalness: 0,
      flatShading: true,
    });
    this.familyMaterials.set(family, material);
    return material;
  }

  has(id: string): boolean {
    return this.prototypes.has(id);
  }

  /** Provides a synchronous fallback for tests and callers that build a chunk before async loading. */
  ensureReady(): void {
    if (this.prototypes.size === 0) {
      this.createProceduralKit();
      this.addMissingLodFallbacks();
    }
  }

  destroy(): void {
    for (const asset of this.prototypes.values()) {
      asset.geometry.dispose();
      for (const material of Array.isArray(asset.material) ? asset.material : [asset.material]) {
        material.dispose();
      }
    }
    this.prototypes.clear();
    for (const material of this.familyMaterials.values()) {
      material.dispose();
    }
    this.familyMaterials.clear();
    for (const root of this.loadedRoots) {
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          material.dispose();
        }
      });
    }
    this.loadedRoots.length = 0;
  }

  private loadGlb(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => {
        const root = gltf.scene;
        this.loadedRoots.push(root);
        root.updateMatrixWorld(true);
        root.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) {
            return;
          }
          const id = object.name;
          const baseId = getBaseAssetId(id);
          const family = ASSET_FAMILIES[baseId];
          if (!family || this.prototypes.has(id)) {
            return;
          }
          const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
          const materials = sourceMaterials.map((sourceMaterial) => {
            const material = sourceMaterial instanceof THREE.MeshStandardMaterial
              ? sourceMaterial.clone()
              : new THREE.MeshStandardMaterial({ color: MATERIAL_COLORS[id] ?? 0x778877 });
            material.roughness = 0.88;
            material.metalness = 0;
            return material;
          });
          this.prototypes.set(id, {
            id,
            baseId,
            family,
            lod: getAssetLod(id),
            geometry: prepareAssetGeometry(object.geometry, object.matrixWorld),
            material: materials.length === 1 ? materials[0] : materials,
          });
        });
        if (this.prototypes.size === 0) {
          reject(new Error('Environment GLB contains no recognized asset IDs.'));
        } else {
          resolve();
        }
      }, undefined, reject);
    });
  }

  private createProceduralKit(): void {
    const specs: ReadonlyArray<readonly [string, VisualAssetFamily, THREE.BufferGeometry]> = [
      ['tree_spruce_lod0', 'canopy', createSpruceGeometry()],
      ['tree_pine_lod0', 'canopy', createPineGeometry()],
      ['tree_birch_lod0', 'canopy', createBirchGeometry()],
      ['tree_oak_lod0', 'canopy', createOakGeometry()],
      ['shrub_cluster_lod0', 'understory', createShrubGeometry()],
      ['grass_clump_lod0', 'understory', createGrassGeometry()],
      ['reed_cluster_lod0', 'understory', createReedGeometry()],
      ['rock_pebbles_lod0', 'rock', createPebbleGeometry()],
      ['rock_boulder_lod0', 'rock', createBoulderGeometry()],
      ['rock_outcrop_lod0', 'rock', createOutcropGeometry()],
      ['shore_stones_lod0', 'shore', createShoreStonesGeometry()],
      ['driftwood_lod0', 'shore', createDriftwoodGeometry()],
      ['ore_iron_lod0', 'deposit', createOreGeometry(0x9b5b4b)],
      ['ore_copper_lod0', 'deposit', createOreGeometry(0x4e9b82)],
      ['ore_stone_lod0', 'deposit', createOreGeometry(0xb2afa0)],
    ];
    for (const [id, family, geometry] of specs) {
      const preparedGeometry = prepareAssetGeometry(geometry);
      geometry.dispose();
      this.prototypes.set(id, {
        id,
        baseId: getBaseAssetId(id),
        family,
        lod: 0,
        geometry: preparedGeometry,
        material: new THREE.MeshStandardMaterial({
          color: MATERIAL_COLORS[id] ?? 0x778877,
          roughness: family === 'rock' || family === 'deposit' ? 0.96 : 0.9,
          metalness: 0,
          flatShading: true,
        }),
      });
    }
  }

  private completeMissingAssetsWithFallback(): void {
    const authored = new Map(this.prototypes);
    this.createProceduralKit();
    for (const baseId of Object.keys(ASSET_FAMILIES)) {
      const lod0Id = `${baseId}_lod0`;
      const lod1Id = `${baseId}_lod1`;
      for (const id of [lod0Id, lod1Id]) {
        const asset = authored.get(id);
        if (!asset) {
          continue;
        }
        const fallback = this.prototypes.get(id);
        if (fallback) {
          disposeAsset(fallback);
        }
        this.prototypes.set(id, asset);
      }

    }
    this.addMissingLodFallbacks();
  }

  private addMissingLodFallbacks(): void {
    for (const baseId of Object.keys(ASSET_FAMILIES)) {
      const lod0Id = `${baseId}_lod0`;
      const lod1Id = `${baseId}_lod1`;
      if (this.prototypes.has(lod1Id)) {
        continue;
      }
      const lod0 = this.prototypes.get(lod0Id);
      if (lod0) {
        this.prototypes.set(lod1Id, {
          ...lod0,
          id: lod1Id,
          lod: 1,
          geometry: lod0.geometry.clone(),
          material: cloneMaterial(lod0.material),
        });
      }
    }
  }

  getLodAsset(id: string, lod: 0 | 1): AssetPrototype {
    const baseId = getBaseAssetId(id);
    const requestedId = `${baseId}_lod${lod}`;
    return this.prototypes.get(requestedId) ?? this.get(`${baseId}_lod0`);
  }
}

function getBaseAssetId(id: string): string {
  return id.replace(/_lod[01]$/, '');
}

function getAssetLod(id: string): 0 | 1 {
  return id.endsWith('_lod1') ? 1 : 0;
}

function cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  return Array.isArray(material)
    ? material.map((entry) => entry.clone())
    : material.clone();
}

function disposeAsset(asset: AssetPrototype): void {
  asset.geometry.dispose();
  for (const material of Array.isArray(asset.material) ? asset.material : [asset.material]) {
    material.dispose();
  }
}

function prepareAssetGeometry(
  source: THREE.BufferGeometry,
  transform?: THREE.Matrix4,
): THREE.BufferGeometry {
  const geometry = source.clone();
  if (transform) {
    geometry.applyMatrix4(transform);
  }

  geometry.computeBoundingBox();
  const minimumY = geometry.boundingBox?.min.y ?? 0;
  if (Number.isFinite(minimumY) && Math.abs(minimumY) > Number.EPSILON) {
    geometry.translate(0, -minimumY, 0);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSpruceGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [createTrunk(0.16, 2.1, 1.1)];
  for (const [y, radius, height] of [[1.15, 0.76, 1.5], [2.0, 0.62, 1.55], [2.7, 0.44, 1.3], [3.25, 0.24, 1.0]] as const) {
    parts.push(transformed(new THREE.ConeGeometry(radius, height, 7), 0, y, 0));
  }
  return merged(parts);
}

function createPineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [createTrunk(0.18, 2.8, 1.25)];
  for (const [y, radius, height] of [[1.3, 0.9, 1.3], [2.05, 0.82, 1.45], [2.8, 0.67, 1.5], [3.5, 0.44, 1.3]] as const) {
    parts.push(transformed(new THREE.ConeGeometry(radius, height, 8), 0, y, 0));
  }
  return merged(parts);
}

function createBirchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [createTrunk(0.13, 2.4, 1.05)];
  for (const [x, y, z, scale] of [[-0.34, 1.6, 0.02, 0.72], [0.3, 2.0, 0.05, 0.7], [0, 2.62, 0.02, 0.76], [0.1, 3.16, 0, 0.54]] as const) {
    parts.push(transformed(new THREE.IcosahedronGeometry(scale, 0), x, y, z));
  }
  return merged(parts);
}

function createOakGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [createTrunk(0.18, 2.1, 1.1)];
  for (const [x, y, z, scale] of [[-0.43, 2.0, 0, 0.72], [0.37, 2.04, 0.02, 0.76], [0, 2.45, 0.1, 0.82], [0, 2.85, -0.03, 0.58]] as const) {
    parts.push(transformed(new THREE.IcosahedronGeometry(scale, 1), x, y, z));
  }
  return merged(parts);
}

function createTrunk(radius: number, height: number, y: number): THREE.BufferGeometry {
  return transformed(new THREE.CylinderGeometry(radius, radius * 1.35, height, 6), 0, y, 0);
}

function createShrubGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z, scale] of [[-0.35, 0.42, 0, 0.45], [0.15, 0.5, -0.05, 0.58], [0.47, 0.36, 0.08, 0.38], [-0.02, 0.66, 0.18, 0.38]] as const) {
    parts.push(transformed(new THREE.IcosahedronGeometry(scale, 0), x, y, z));
  }
  return merged(parts);
}

function createGrassGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 7; index += 1) {
    const angle = index * 0.9;
    parts.push(transformed(new THREE.ConeGeometry(0.055, 0.55 + (index % 3) * 0.12, 4), Math.cos(angle) * 0.22, 0.28, Math.sin(angle) * 0.22, 0, angle * 0.2));
  }
  return merged(parts);
}

function createReedGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = index * 0.78;
    parts.push(transformed(new THREE.CylinderGeometry(0.035, 0.05, 1.05 + (index % 3) * 0.18, 5), Math.cos(angle) * 0.28, 0.54, Math.sin(angle) * 0.28, 0, angle * 0.18));
  }
  return merged(parts);
}

function createPebbleGeometry(): THREE.BufferGeometry {
  return merged([
    transformed(new THREE.IcosahedronGeometry(0.18, 0), -0.24, 0.13, 0, 0, 0.1),
    transformed(new THREE.IcosahedronGeometry(0.23, 0), 0.05, 0.16, -0.02, 0.3, 0),
    transformed(new THREE.IcosahedronGeometry(0.14, 0), 0.28, 0.1, 0.08, 0, 0.4),
  ]);
}

function createBoulderGeometry(): THREE.BufferGeometry {
  return merged([transformed(new THREE.IcosahedronGeometry(0.72, 1), 0, 0.55, 0, 0.15, 0.1, 1.15, 0.82, 0.9)]);
}

function createOutcropGeometry(): THREE.BufferGeometry {
  return merged([
    transformed(new THREE.IcosahedronGeometry(0.8, 1), -0.35, 0.62, 0, 0.1, 0.2, 0.95, 1.05, 0.8),
    transformed(new THREE.IcosahedronGeometry(0.55, 0), 0.43, 0.4, 0.08, 0.2, 0.1, 0.9, 0.72, 0.9),
  ]);
}

function createShoreStonesGeometry(): THREE.BufferGeometry {
  return merged([
    transformed(new THREE.IcosahedronGeometry(0.23, 0), -0.38, 0.18, 0, 0, 0, 1.2, 0.8, 0.9),
    transformed(new THREE.IcosahedronGeometry(0.3, 0), 0, 0.22, 0.05, 0.2, 0.1, 0.9, 0.72, 1.1),
    transformed(new THREE.IcosahedronGeometry(0.19, 0), 0.35, 0.14, -0.03, 0, 0.1, 1.1, 0.7, 0.92),
  ]);
}

function createDriftwoodGeometry(): THREE.BufferGeometry {
  return merged([transformed(new THREE.CylinderGeometry(0.09, 0.13, 1.2, 6), 0, 0.16, 0, 0, 0, Math.PI / 2, 0.8, 0.8, 1.15)]);
}

function createOreGeometry(color: number): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(0.7, 1);
  const accent = new THREE.IcosahedronGeometry(0.24, 0);
  accent.applyMatrix4(new THREE.Matrix4().makeTranslation(0.35, 0.65, 0.15));
  const geometry = merged([base, accent]);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  const c = new THREE.Color(color);
  for (let index = 0; index < colors.length; index += 3) {
    colors[index] = c.r;
    colors[index + 1] = c.g;
    colors[index + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function transformed(
  geometry: THREE.BufferGeometry,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.BufferGeometry {
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  ));
  return geometry;
}

function merged(geometries: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = geometries.map((geometry) => {
    if (!geometry.index) {
      return geometry;
    }
    const nonIndexed = geometry.toNonIndexed();
    geometry.dispose();
    return nonIndexed;
  });
  const result = mergeGeometries(normalized, false);
  if (!result) {
    normalized.forEach((geometry) => geometry.dispose());
    throw new Error('Unable to merge environment geometry.');
  }
  normalized.forEach((geometry) => {
    if (geometry !== result) {
      geometry.dispose();
    }
  });
  result.computeVertexNormals();
  result.computeBoundingSphere();
  return result;
}

import * as THREE from 'three';
import { createEmptyAuthoritativeMapData, BIOME_KIND_CODES } from './map/map-types';
import {
  countEnvironmentPlacements,
  EnvironmentChunkRenderer,
} from './environment-chunk-renderer';
import { VisualAssetRegistry } from './visual-asset-registry';

describe('environment chunk renderer', () => {
  it('creates deterministic authored batches and disposes chunk objects without shared assets', () => {
    const data = createEmptyAuthoritativeMapData();
    data.biome.fill(BIOME_KIND_CODES.forest);
    const assets = new VisualAssetRegistry();
    assets.ensureReady();
    const scene = new THREE.Scene();
    const renderer = new EnvironmentChunkRenderer(scene, data, assets, []);

    const firstCount = countEnvironmentPlacements(data, 16, 16, assets);
    const secondCount = countEnvironmentPlacements(data, 16, 16, assets);
    const chunk = renderer.createChunk(16, 16);

    expect(firstCount).toBeGreaterThan(0);
    expect(secondCount).toBe(firstCount);
    expect(chunk?.meshes.length).toBeGreaterThan(1);
    expect(chunk?.meshes.every((mesh) => !mesh.castShadow && !mesh.receiveShadow)).toBeTrue();
    expect(chunk?.instanceCount).toBeLessThanOrEqual(320);

    if (chunk) {
      renderer.attachChunk(16, 16, chunk);
      renderer.removeChunk(16, 16);
    }
    renderer.destroy();
    expect(assets.has('tree_spruce_lod0')).toBeTrue();
    assets.destroy();
  });
});

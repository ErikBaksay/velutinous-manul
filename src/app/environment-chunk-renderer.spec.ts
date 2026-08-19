import * as THREE from 'three';
import {
  createEmptyAuthoritativeMapData,
  BIOME_KIND_CODES,
  MAP_WIDTH,
} from './map/map-types';
import {
  countEnvironmentPlacements,
  EnvironmentChunkRenderer,
} from './environment-chunk-renderer';
import { VisualAssetRegistry } from './visual-asset-registry';
import { TERRAIN_CHUNK_SIZE } from './terrain-chunk-renderer';

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
    expect(chunk?.meshes.every((mesh) => !mesh.castShadow && !mesh.receiveShadow)).toBe(true);
    expect(chunk?.instanceCount).toBeLessThanOrEqual(320);

    if (chunk) {
      renderer.attachChunk(16, 16, chunk);
      renderer.removeChunk(16, 16);
    }
    renderer.destroy();
    expect(assets.has('tree_spruce_lod0')).toBe(true);
    assets.destroy();
  });

  it('removes every generated environment item from permanently cleared cells', () => {
    const data = createEmptyAuthoritativeMapData();
    data.biome.fill(BIOME_KIND_CODES.forest);
    const assets = new VisualAssetRegistry();
    assets.ensureReady();
    const renderer = new EnvironmentChunkRenderer(new THREE.Scene(), data, assets, []);
    const chunkX = 16;
    const chunkY = 16;
    const baseline = countEnvironmentPlacements(data, chunkX, chunkY, assets);
    const cleared = Array.from(
      { length: TERRAIN_CHUNK_SIZE * TERRAIN_CHUNK_SIZE },
      (_, index) =>
        (chunkY * TERRAIN_CHUNK_SIZE + Math.floor(index / TERRAIN_CHUNK_SIZE)) * MAP_WIDTH +
        chunkX * TERRAIN_CHUNK_SIZE + index % TERRAIN_CHUNK_SIZE,
    );

    renderer.setClearedCellIndices(cleared);

    expect(baseline).toBeGreaterThan(0);
    expect(countEnvironmentPlacements(data, chunkX, chunkY, assets, new Set(cleared))).toBe(0);
    expect(renderer.createChunk(chunkX, chunkY)).toBeNull();

    renderer.destroy();
    assets.destroy();
  });
});

import {
  AuthoritativeMapData,
  DEFAULT_MAP_CONFIG,
  MAX_WATER_COVERAGE,
  RESOURCE_KINDS,
} from './map-types';
import {
  canonicalizeMapConfig,
  createConfigHash,
  createMapHash,
  createMapIdentity,
  GENERATOR_VERSION,
  normalizeMapConfig,
} from './map-identity';
import { createGenerationRandomStreams } from './deterministic-random';
import {
  estimateMapMemory,
  TARGET_FINAL_MAP_BYTES,
  TARGET_PEAK_WORKER_BYTES,
} from './map-memory';

describe('map identity foundation', () => {
  it('canonicalizes equivalent configuration values', () => {
    const first = normalizeMapConfig({
      ...DEFAULT_MAP_CONFIG,
      waterCoverage: 0.1804,
    });
    const second = normalizeMapConfig({
      ...DEFAULT_MAP_CONFIG,
      waterCoverage: 0.18049,
    });

    expect(canonicalizeMapConfig(first)).toBe(canonicalizeMapConfig(second));
    expect(createConfigHash(first)).toBe(createConfigHash(second));
  });

  it('keeps seed out of configHash but includes it in mapIdentity', () => {
    const first = normalizeMapConfig({ ...DEFAULT_MAP_CONFIG, seed: 'ALPHA' });
    const second = normalizeMapConfig({ ...DEFAULT_MAP_CONFIG, seed: 'BETA' });

    expect(createConfigHash(first)).toBe(createConfigHash(second));
    expect(createMapIdentity(first)).not.toBe(createMapIdentity(second));
    expect(createMapIdentity(first)).toContain(`${GENERATOR_VERSION}:ALPHA:`);
  });

  it('normalizes empty seeds and clamps controls', () => {
    const normalized = normalizeMapConfig({
      seed: '  ',
      waterCoverage: 4,
      forestDensity: -1,
    });

    expect(normalized.seed).toBe(DEFAULT_MAP_CONFIG.seed);
    expect(normalized.waterCoverage).toBe(MAX_WATER_COVERAGE);
    expect(normalized.forestDensity).toBe(0);
  });

  it('keeps random substreams independent', () => {
    const first = createGenerationRandomStreams('same-seed');
    const second = createGenerationRandomStreams('same-seed');

    first.terrain.nextFloat();
    first.terrain.nextFloat();

    expect(first.resources.nextUint32()).toBe(second.resources.nextUint32());
    expect(first.hydrology.nextUint32()).toBe(second.hydrology.nextUint32());
  });

  it('changes mapHash when authoritative data changes', () => {
    const first = createSmallMapData();
    const second = createSmallMapData();
    second.heightSamples[0] = 1;

    expect(createMapHash(first)).not.toBe(createMapHash(second));
    expect(createMapHash(first)).toBe(createMapHash(first));
  });

  it('keeps the planned map memory estimate within v1 budgets', () => {
    const estimate = estimateMapMemory();

    expect(estimate.finalBytes).toBeLessThanOrEqual(TARGET_FINAL_MAP_BYTES);
    expect(estimate.peakBytes).toBeLessThanOrEqual(TARGET_PEAK_WORKER_BYTES);
  });
});

function createSmallMapData(): AuthoritativeMapData {
  const resourceIntensity = {} as Record<(typeof RESOURCE_KINDS)[number], Uint8Array>;
  for (const resourceKind of RESOURCE_KINDS) {
    resourceIntensity[resourceKind] = new Uint8Array(2);
  }

  return {
    heightSamples: new Uint16Array(2),
    moisture: new Uint8Array(2),
    temperature: new Uint8Array(2),
    biome: new Uint8Array(2),
    waterKind: new Uint8Array(2),
    flags: new Uint8Array(2),
    landmassId: new Uint16Array(2),
    resourceProvinceId: new Uint16Array(2),
    resourceMask: new Uint8Array(2),
    resourceIntensity,
    deposits: [],
  };
}

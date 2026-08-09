import {
  DEFAULT_MAP_CONFIG,
  MAP_HEIGHT,
  MAP_PRESETS,
  MAP_WIDTH,
  MapConfig,
  AuthoritativeMapData,
} from './map-types';
import { hashAuthoritativeMapData, hashString } from './map-hash';

export const GENERATOR_VERSION = 1;
export const CONFIG_QUANTIZATION = 1000;

export function normalizeMapConfig(input: Partial<MapConfig> = {}): MapConfig {
  const preset = input.preset ?? DEFAULT_MAP_CONFIG.preset;
  if (!MAP_PRESETS.includes(preset)) {
    throw new Error(`Unsupported map preset: ${String(preset)}`);
  }

  const width = input.width ?? MAP_WIDTH;
  const height = input.height ?? MAP_HEIGHT;
  if (width !== MAP_WIDTH || height !== MAP_HEIGHT) {
    throw new Error(`Map v1 requires a ${MAP_WIDTH}x${MAP_HEIGHT} logical-cell map.`);
  }

  return {
    seed: normalizeSeed(input.seed ?? DEFAULT_MAP_CONFIG.seed),
    preset,
    width,
    height,
    waterCoverage: quantizeControl(input.waterCoverage ?? DEFAULT_MAP_CONFIG.waterCoverage),
    terrainRoughness: quantizeControl(
      input.terrainRoughness ?? DEFAULT_MAP_CONFIG.terrainRoughness,
    ),
    forestDensity: quantizeControl(input.forestDensity ?? DEFAULT_MAP_CONFIG.forestDensity),
    resourceAbundance: quantizeControl(
      input.resourceAbundance ?? DEFAULT_MAP_CONFIG.resourceAbundance,
    ),
  };
}

export function normalizeSeed(seed: string): string {
  const normalized = seed.trim();
  return normalized.length > 0 ? normalized : DEFAULT_MAP_CONFIG.seed;
}

export function quantizeControl(value: number): number {
  return Math.round(clamp(value, 0, 1) * CONFIG_QUANTIZATION) / CONFIG_QUANTIZATION;
}

export function canonicalizeMapConfig(config: MapConfig): string {
  const normalized = normalizeMapConfig(config);
  return JSON.stringify({
    preset: normalized.preset,
    width: normalized.width,
    height: normalized.height,
    waterCoverage: normalized.waterCoverage,
    terrainRoughness: normalized.terrainRoughness,
    forestDensity: normalized.forestDensity,
    resourceAbundance: normalized.resourceAbundance,
  });
}

export function createConfigHash(config: MapConfig): string {
  return hashString(canonicalizeMapConfig(config));
}

export function createMapIdentity(config: MapConfig): string {
  const normalized = normalizeMapConfig(config);
  return `${GENERATOR_VERSION}:${normalized.seed}:${createConfigHash(normalized)}`;
}

export function createMapHash(data: AuthoritativeMapData): string {
  return hashAuthoritativeMapData(data);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

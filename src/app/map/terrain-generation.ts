import { createGenerationRandomStreams } from './deterministic-random';
import {
  HEIGHT_SAMPLE_COUNT,
  HEIGHT_SAMPLE_HEIGHT,
  HEIGHT_SAMPLE_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  MapConfig,
} from './map-types';

export const HEIGHT_QUANTIZATION = 65_535;
export const TERRAIN_VERTICAL_SCALE = 60;

export function generateTerrainHeightSamples(
  config: MapConfig,
  heightSamples: Uint16Array,
): void {
  if (heightSamples.length !== HEIGHT_SAMPLE_COUNT) {
    throw new Error(`Expected ${HEIGHT_SAMPLE_COUNT} height samples.`);
  }

  const seed = createGenerationRandomStreams(config.seed).terrain.nextUint32();
  const roughness = config.terrainRoughness;
  const presetBias = getPresetBias(config.preset);

  for (let sampleY = 0; sampleY < HEIGHT_SAMPLE_HEIGHT; sampleY += 1) {
    const v = sampleY / MAP_HEIGHT;
    for (let sampleX = 0; sampleX < HEIGHT_SAMPLE_WIDTH; sampleX += 1) {
      const u = sampleX / MAP_WIDTH;
      const warpX = (valueNoise(seed ^ 0x19a7_31d1, u * 2.2, v * 2.2) - 0.5) * 0.16;
      const warpY = (valueNoise(seed ^ 0x6c8e_9cf5, u * 2.2, v * 2.2) - 0.5) * 0.16;
      const warpedX = u + warpX;
      const warpedY = v + warpY;

      const continental = valueNoise(seed ^ 0x3c6e_f372, warpedX * 1.25, warpedY * 1.25);
      const regional = fractalNoise(seed ^ 0xdaa6_6d2b, warpedX * 2.8, warpedY * 2.8, 4);
      const detail = fractalNoise(seed ^ 0x78bd_642f, warpedX * 18, warpedY * 18, 4);
      const ridge = ridgeNoise(seed ^ 0x4f1b_2d83, warpedX * 6.5, warpedY * 6.5, 3);

      let elevation =
        continental * 0.52 +
        regional * (0.22 + roughness * 0.16) +
        detail * (0.16 + roughness * 0.2) +
        ridge * presetBias.ridgeStrength;
      elevation = elevation * presetBias.contrast + presetBias.base;

      if (config.preset === 'riverlands') {
        elevation -= ridge * 0.08;
        elevation += valueNoise(seed ^ 0x1f12_3bb5, warpedX * 1.8, warpedY * 5.5) * 0.05;
      } else if (config.preset === 'highland-frontier') {
        elevation += ridge * 0.16;
        elevation += detail * roughness * 0.08;
      }

      const normalized = clamp(elevation, 0, 1);
      const index = sampleY * HEIGHT_SAMPLE_WIDTH + sampleX;
      heightSamples[index] = Math.round(normalized * HEIGHT_QUANTIZATION);
    }
  }
}

function getPresetBias(preset: MapConfig['preset']): {
  base: number;
  contrast: number;
  ridgeStrength: number;
} {
  switch (preset) {
    case 'riverlands':
      return { base: 0.13, contrast: 0.83, ridgeStrength: 0.035 };
    case 'highland-frontier':
      return { base: 0.1, contrast: 1.06, ridgeStrength: 0.12 };
    case 'balanced-continental':
      return { base: 0.12, contrast: 0.96, ridgeStrength: 0.12 };
  }
}

function fractalNoise(seed: number, x: number, y: number, octaveCount: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let amplitudeTotal = 0;

  for (let octave = 0; octave < octaveCount; octave += 1) {
    total += valueNoise(seed + octave * 0x9e37_79b9, x * frequency, y * frequency) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total / amplitudeTotal;
}

function ridgeNoise(seed: number, x: number, y: number, octaveCount: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let amplitudeTotal = 0;

  for (let octave = 0; octave < octaveCount; octave += 1) {
    const sample = valueNoise(seed + octave * 0x85eb_ca6b, x * frequency, y * frequency);
    total += (1 - Math.abs(sample * 2 - 1)) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total / amplitudeTotal;
}

function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const top = lerp(hashGrid(seed, x0, y0), hashGrid(seed, x0 + 1, y0), tx);
  const bottom = lerp(hashGrid(seed, x0, y0 + 1), hashGrid(seed, x0 + 1, y0 + 1), tx);
  return lerp(top, bottom, ty);
}

function hashGrid(seed: number, x: number, y: number): number {
  let value = seed ^ Math.imul(x, 0x27d4_eb2d) ^ Math.imul(y, 0x1656_67b1);
  value = Math.imul(value ^ (value >>> 15), 0x85eb_ca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2_ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_295;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(first: number, second: number, amount: number): number {
  return first + (second - first) * amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

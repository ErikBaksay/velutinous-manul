import {
  HEIGHT_SAMPLE_COUNT,
  HEIGHT_SAMPLE_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  DEFAULT_MAP_CONFIG,
} from './map-types';
import { generateTerrainHeightSamples } from './terrain-generation';

describe('terrain height generation', () => {
  it('generates the same heightfield for the same seed and settings', () => {
    const first = new Uint16Array(HEIGHT_SAMPLE_COUNT);
    const second = new Uint16Array(HEIGHT_SAMPLE_COUNT);

    generateTerrainHeightSamples(DEFAULT_MAP_CONFIG, first);
    generateTerrainHeightSamples(DEFAULT_MAP_CONFIG, second);

    expect(Array.from(first)).toEqual(Array.from(second));
  });

  it('changes the heightfield when the seed changes', () => {
    const first = new Uint16Array(HEIGHT_SAMPLE_COUNT);
    const second = new Uint16Array(HEIGHT_SAMPLE_COUNT);

    generateTerrainHeightSamples(DEFAULT_MAP_CONFIG, first);
    generateTerrainHeightSamples({ ...DEFAULT_MAP_CONFIG, seed: 'different-seed' }, second);

    expect(Array.from(first)).not.toEqual(Array.from(second));
  });

  it('produces a finite heightfield with visible relief', () => {
    const heights = new Uint16Array(HEIGHT_SAMPLE_COUNT);
    generateTerrainHeightSamples(DEFAULT_MAP_CONFIG, heights);

    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const height of heights) {
      minimum = Math.min(minimum, height);
      maximum = Math.max(maximum, height);
    }

    expect(minimum).toBeGreaterThanOrEqual(0);
    expect(maximum).toBeLessThanOrEqual(65_535);
    expect(maximum - minimum).toBeGreaterThan(1_000);
  });

  it('supports all three planned terrain presets', () => {
    for (const preset of ['balanced-continental', 'riverlands', 'highland-frontier'] as const) {
      const heights = new Uint16Array(HEIGHT_SAMPLE_COUNT);
      generateTerrainHeightSamples({ ...DEFAULT_MAP_CONFIG, preset }, heights);

      expect(heights[0]).toBeGreaterThanOrEqual(0);
      expect(heights[MAP_HEIGHT * HEIGHT_SAMPLE_WIDTH + MAP_WIDTH]).toBeLessThanOrEqual(65_535);
    }
  });
});

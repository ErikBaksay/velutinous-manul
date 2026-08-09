import { hashStringToUint32 } from './map-hash';

export class DeterministicRandom {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === 'number' ? seed >>> 0 : hashStringToUint32(seed);
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  nextUint32(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x100000000;
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
      throw new Error('DeterministicRandom.nextInt requires integer bounds.');
    }
    if (maxExclusive <= minInclusive) {
      throw new Error('DeterministicRandom.nextInt requires a positive range.');
    }

    return minInclusive + Math.floor(this.nextFloat() * (maxExclusive - minInclusive));
  }

  fork(label: string): DeterministicRandom {
    return new DeterministicRandom(`${this.state}:${label}`);
  }
}

export interface GenerationRandomStreams {
  terrain: DeterministicRandom;
  erosion: DeterministicRandom;
  hydrology: DeterministicRandom;
  forests: DeterministicRandom;
  regions: DeterministicRandom;
  resources: DeterministicRandom;
}

export function createGenerationRandomStreams(seed: string): GenerationRandomStreams {
  return {
    terrain: new DeterministicRandom(`${seed}:terrain`),
    erosion: new DeterministicRandom(`${seed}:erosion`),
    hydrology: new DeterministicRandom(`${seed}:hydrology`),
    forests: new DeterministicRandom(`${seed}:forests`),
    regions: new DeterministicRandom(`${seed}:regions`),
    resources: new DeterministicRandom(`${seed}:resources`),
  };
}

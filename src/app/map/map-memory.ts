import {
  HEIGHT_SAMPLE_COUNT,
  MAP_CELL_COUNT,
  RESOURCE_KINDS,
} from './map-types';

export const TARGET_FINAL_MAP_BYTES = 32 * 1024 * 1024;
export const TARGET_PEAK_WORKER_BYTES = 128 * 1024 * 1024;

export interface MapMemoryEstimate {
  finalBytes: number;
  scratchBytes: number;
  peakBytes: number;
  finalWithinBudget: boolean;
  peakWithinBudget: boolean;
}

export function estimateAuthoritativeMapBytes(): number {
  const heightBytes = HEIGHT_SAMPLE_COUNT * Uint16Array.BYTES_PER_ELEMENT;
  const cellByteFields = 6 + RESOURCE_KINDS.length;
  const cellUint16Fields = 2;
  const cellBytes = MAP_CELL_COUNT * (cellByteFields + cellUint16Fields * Uint16Array.BYTES_PER_ELEMENT);

  return heightBytes + cellBytes;
}

export function estimatePeakWorkerBytes(): number {
  const workingHeightBytes = HEIGHT_SAMPLE_COUNT * Float32Array.BYTES_PER_ELEMENT;
  const erosionScratchBytes = HEIGHT_SAMPLE_COUNT * Float32Array.BYTES_PER_ELEMENT;
  const flowAccumulationBytes = MAP_CELL_COUNT * Uint32Array.BYTES_PER_ELEMENT;
  const flowDirectionBytes = MAP_CELL_COUNT * Uint8Array.BYTES_PER_ELEMENT;
  const coarseTraversalBytes = Math.ceil(MAP_CELL_COUNT / 16) * Uint8Array.BYTES_PER_ELEMENT;

  return (
    estimateAuthoritativeMapBytes() +
    workingHeightBytes +
    erosionScratchBytes +
    flowAccumulationBytes +
    flowDirectionBytes +
    coarseTraversalBytes
  );
}

export function estimateMapMemory(): MapMemoryEstimate {
  const finalBytes = estimateAuthoritativeMapBytes();
  const peakBytes = estimatePeakWorkerBytes();

  return {
    finalBytes,
    scratchBytes: peakBytes - finalBytes,
    peakBytes,
    finalWithinBudget: finalBytes <= TARGET_FINAL_MAP_BYTES,
    peakWithinBudget: peakBytes <= TARGET_PEAK_WORKER_BYTES,
  };
}

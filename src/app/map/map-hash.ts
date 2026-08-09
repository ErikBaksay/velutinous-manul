const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const encoder = new TextEncoder();

export function hashStringToUint32(value: string, seed = FNV_OFFSET_BASIS): number {
  return hashBytes(encoder.encode(value), seed);
}

export function hashBytes(bytes: Uint8Array, seed = FNV_OFFSET_BASIS): number {
  let hash = seed >>> 0;

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash >>> 0;
}

export function formatHash(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

export function hashString(value: string): string {
  return formatHash(hashStringToUint32(value));
}

export function hashAuthoritativeMapData(
  data: Readonly<{
    heightSamples: Uint16Array;
    moisture: Uint8Array;
    temperature: Uint8Array;
    biome: Uint8Array;
    waterKind: Uint8Array;
    flags: Uint8Array;
    landmassId: Uint16Array;
    resourceProvinceId: Uint16Array;
    resourceMask: Uint8Array;
    resourceIntensity: Record<string, Uint8Array>;
    deposits: ReadonlyArray<{
      id: number;
      kind: string;
      centerCell: number;
      radius: number;
      strength: number;
      baseCapacity: number;
      resourceProvinceId: number;
    }>;
  }>,
): string {
  let hash = FNV_OFFSET_BASIS;

  const update = (name: string, view: ArrayBufferView): void => {
    hash = hashBytes(encoder.encode(name), hash);
    hash = hashBytes(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), hash);
  };

  update('heightSamples', data.heightSamples);
  update('moisture', data.moisture);
  update('temperature', data.temperature);
  update('biome', data.biome);
  update('waterKind', data.waterKind);
  update('flags', data.flags);
  update('landmassId', data.landmassId);
  update('resourceProvinceId', data.resourceProvinceId);
  update('resourceMask', data.resourceMask);

  for (const resourceKind of Object.keys(data.resourceIntensity).sort()) {
    update(`resourceIntensity:${resourceKind}`, data.resourceIntensity[resourceKind]);
  }

  for (const deposit of data.deposits) {
    hash = hashStringToUint32(
      [
        deposit.id,
        deposit.kind,
        deposit.centerCell,
        deposit.radius,
        deposit.strength,
        deposit.baseCapacity,
        deposit.resourceProvinceId,
      ].join(':'),
      hash,
    );
  }

  return formatHash(hash);
}

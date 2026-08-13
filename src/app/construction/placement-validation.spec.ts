import {
  MAP_FLAG_CODES,
  RESOURCE_KINDS,
  ResourceKind,
  WATER_KIND_CODES,
  AuthoritativeMapData,
} from '../map/map-types';
import { createBuildingDefinitionRegistry } from './building-definitions';
import { createCellOccupancy } from './occupancy';
import {
  getConstructionTerrainSample,
  validateBuildingPlacement,
} from './placement-validation';

describe('construction placement validation', () => {
  it('accepts a flat buildable footprint and reports every occupied cell', () => {
    const dimensions = { width: 4, height: 3 };
    const mapData = createMapData(4, 3);
    mapData.flags.fill(MAP_FLAG_CODES.buildable);
    const definitions = createBuildingDefinitionRegistry([createDefinition('yard', 2, 1)]);
    const occupancy = createCellOccupancy(dimensions, [], definitions).occupancy;

    const result = validateBuildingPlacement({
      dimensions,
      mapData,
      definitions,
      occupancy,
      definitionId: 'yard',
      origin: { x: 1, y: 1 },
      rotationQuarterTurns: 0,
    });

    expect(result.valid).toBe(true);
    expect(result.occupiedCells).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }]);
    expect(result.cellDiagnostics).toHaveLength(2);
    expect(result.failures).toEqual([]);
  });

  it('reports rotated footprint bounds separately from origin bounds', () => {
    const dimensions = { width: 3, height: 2 };
    const mapData = createMapData(3, 2);
    mapData.flags.fill(MAP_FLAG_CODES.buildable);
    const definitions = createBuildingDefinitionRegistry([createDefinition('tower', 2, 2)]);
    const occupancy = createCellOccupancy(dimensions, [], definitions).occupancy;

    const result = validateBuildingPlacement({
      dimensions,
      mapData,
      definitions,
      occupancy,
      definitionId: 'tower',
      origin: { x: 2, y: 0 },
      rotationQuarterTurns: 1,
    });

    expect(result.valid).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toEqual([
      'footprint-out-of-bounds',
      'footprint-out-of-bounds',
    ]);
    expect(result.cellDiagnostics).toHaveLength(4);
  });

  it('evaluates buildability, impassability, water, slope, and occupancy', () => {
    const dimensions = { width: 2, height: 2 };
    const mapData = createMapData(2, 2);
    mapData.flags.fill(MAP_FLAG_CODES.buildable);
    mapData.flags[0] = 0;
    mapData.flags[1] = MAP_FLAG_CODES.impassable;
    mapData.waterKind[0] = WATER_KIND_CODES.river;
    for (let sampleY = 0; sampleY <= 2; sampleY += 1) {
      mapData.heightSamples[sampleY * 3 + 2] = 65_535;
    }
    const definitions = createBuildingDefinitionRegistry([createDefinition('yard', 2, 2)]);
    const occupancy = createCellOccupancy(
      dimensions,
      [{
        id: 'existing-yard',
        definitionId: 'yard',
        origin: { x: 1, y: 1 },
        rotationQuarterTurns: 0,
      }],
      definitions,
    ).occupancy;

    const result = validateBuildingPlacement({
      dimensions,
      mapData,
      definitions,
      occupancy,
      definitionId: 'yard',
      origin: { x: 0, y: 0 },
      rotationQuarterTurns: 0,
    });

    expect(result.valid).toBe(false);
    expect(new Set(result.failures.map((failure) => failure.code))).toEqual(new Set([
      'not-buildable',
      'impassable',
      'water',
      'slope-too-steep',
      'occupied',
    ]));
    expect(result.cellDiagnostics.every((diagnostic) => diagnostic.cellIndex !== null)).toBe(true);
  });

  it('allows future special-surface definitions to opt into water explicitly', () => {
    const dimensions = { width: 1, height: 1 };
    const mapData = createMapData(1, 1);
    mapData.waterKind[0] = WATER_KIND_CODES.river;
    const definitions = createBuildingDefinitionRegistry([{
      id: 'future-bridge',
      footprint: { width: 1, height: 1 },
      placement: {
        requiresBuildable: false,
        allowWater: true,
        allowImpassable: true,
        maxSlope: 1,
      },
    }]);
    const occupancy = createCellOccupancy(dimensions, [], definitions).occupancy;

    const result = validateBuildingPlacement({
      dimensions,
      mapData,
      definitions,
      occupancy,
      definitionId: 'future-bridge',
      origin: { x: 0, y: 0 },
      rotationQuarterTurns: 0,
    });

    expect(result.valid).toBe(true);
  });

  it('returns stable failures for unknown definitions and invalid origins', () => {
    const dimensions = { width: 2, height: 2 };
    const mapData = createMapData(2, 2);
    const definitions = createBuildingDefinitionRegistry([]);
    const occupancy = createCellOccupancy(dimensions, [], definitions).occupancy;

    const result = validateBuildingPlacement({
      dimensions,
      mapData,
      definitions,
      occupancy,
      definitionId: 'missing',
      origin: { x: 0.5, y: 0 },
      rotationQuarterTurns: 0,
    });

    expect(result.failures.map((failure) => failure.code)).toEqual([
      'unknown-definition',
      'invalid-origin',
    ]);
    expect(result.occupiedCells).toEqual([]);
  });

  it('uses the terrain-cache slope units for height-sample validation', () => {
    const mapData = createMapData(1, 1);
    mapData.heightSamples[1] = 65_535;
    mapData.heightSamples[3] = 65_535;

    const sample = getConstructionTerrainSample(mapData, { width: 1, height: 1 }, { x: 0, y: 0 });

    expect(sample.slope).toBeGreaterThan(0.9);
  });
});

function createDefinition(id: string, width: number, height: number) {
  return {
    id,
    footprint: { width, height },
    placement: {
      requiresBuildable: true,
      allowWater: false,
      allowImpassable: false,
      maxSlope: 0.2,
    },
  };
}

function createMapData(width: number, height: number): AuthoritativeMapData {
  const resourceIntensity = {} as Record<ResourceKind, Uint8Array>;
  for (const kind of RESOURCE_KINDS) {
    resourceIntensity[kind] = new Uint8Array(width * height);
  }
  return {
    heightSamples: new Uint16Array((width + 1) * (height + 1)),
    moisture: new Uint8Array(width * height),
    temperature: new Uint8Array(width * height),
    biome: new Uint8Array(width * height),
    waterKind: new Uint8Array(width * height),
    flags: new Uint8Array(width * height),
    landmassId: new Uint16Array(width * height),
    resourceProvinceId: new Uint16Array(width * height),
    resourceMask: new Uint8Array(width * height),
    resourceIntensity,
    deposits: [],
  };
}

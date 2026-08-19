import {
  MAP_FLAG_CODES,
  RESOURCE_KINDS,
  type AuthoritativeMapData,
  type ResourceKind,
  WATER_KIND_CODES,
} from '../map/map-types';
import { createBuildingDefinitionRegistry } from './building-definitions';
import { createCellOccupancy } from './occupancy';
import {
  addRoad,
  deriveRoadConnectionMasks,
  getRoadCellKey,
  removeRoad,
  ROAD_CONNECTION_MASK,
  validateRoadPlacement,
} from './road-network';

describe('road network', () => {
  it('derives endpoint, straight, corner, T, and four-way masks', () => {
    const roads = [
      { cell: { x: 1, y: 1 } },
      { cell: { x: 1, y: 0 } },
      { cell: { x: 2, y: 1 } },
      { cell: { x: 1, y: 2 } },
      { cell: { x: 0, y: 1 } },
      { cell: { x: 3, y: 1 } },
    ];

    const masks = deriveRoadConnectionMasks(roads);

    expect(masks.get(getRoadCellKey({ x: 3, y: 1 }))).toBe(ROAD_CONNECTION_MASK.west);
    expect(masks.get(getRoadCellKey({ x: 2, y: 1 }))).toBe(
      ROAD_CONNECTION_MASK.east | ROAD_CONNECTION_MASK.west,
    );
    expect(masks.get(getRoadCellKey({ x: 1, y: 0 }))).toBe(ROAD_CONNECTION_MASK.south);
    expect(masks.get(getRoadCellKey({ x: 1, y: 1 }))).toBe(
      ROAD_CONNECTION_MASK.north |
        ROAD_CONNECTION_MASK.east |
        ROAD_CONNECTION_MASK.south |
        ROAD_CONNECTION_MASK.west,
    );

    const tMasks = deriveRoadConnectionMasks([
      { cell: { x: 6, y: 6 } },
      { cell: { x: 7, y: 6 } },
      { cell: { x: 5, y: 6 } },
      { cell: { x: 6, y: 5 } },
    ]);
    expect(tMasks.get(getRoadCellKey({ x: 6, y: 6 }))).toBe(
      ROAD_CONNECTION_MASK.north |
        ROAD_CONNECTION_MASK.east |
        ROAD_CONNECTION_MASK.west,
    );

    const cornerMasks = deriveRoadConnectionMasks([
      { cell: { x: 4, y: 4 } },
      { cell: { x: 5, y: 4 } },
      { cell: { x: 4, y: 5 } },
    ]);
    expect(cornerMasks.get(getRoadCellKey({ x: 4, y: 4 }))).toBe(
      ROAD_CONNECTION_MASK.east | ROAD_CONNECTION_MASK.south,
    );
  });

  it('keeps add/remove operations immutable and deterministically ordered', () => {
    const roads = [{ cell: { x: 3, y: 2 } }];
    const added = addRoad(roads, { x: 1, y: 1 });
    const removed = removeRoad(added, { x: 3, y: 2 });

    expect(roads).toEqual([{ cell: { x: 3, y: 2 } }]);
    expect(added).toEqual([
      { cell: { x: 1, y: 1 } },
      { cell: { x: 3, y: 2 } },
    ]);
    expect(removed).toEqual([{ cell: { x: 1, y: 1 } }]);
  });

  it('recomputes neighbor masks after removal', () => {
    const roads = [
      { cell: { x: 1, y: 1 } },
      { cell: { x: 2, y: 1 } },
      { cell: { x: 3, y: 1 } },
    ];
    const masks = deriveRoadConnectionMasks(removeRoad(roads, { x: 2, y: 1 }));

    expect(masks.get(getRoadCellKey({ x: 1, y: 1 }))).toBe(0);
    expect(masks.get(getRoadCellKey({ x: 3, y: 1 }))).toBe(0);
  });

  it('rejects invalid terrain, duplicate, and building-overlap placements', () => {
    const dimensions = { width: 3, height: 3 };
    const mapData = createMapData(3, 3);
    mapData.flags.fill(MAP_FLAG_CODES.buildable);
    mapData.flags[1] = 0;
    mapData.flags[2] = MAP_FLAG_CODES.impassable;
    mapData.waterKind[3] = WATER_KIND_CODES.river;
    for (let sampleY = 0; sampleY <= 3; sampleY += 1) {
      mapData.heightSamples[sampleY * 4 + 3] = 65_535;
    }
    const definitions = createBuildingDefinitionRegistry([{
      id: 'yard',
      footprint: { width: 1, height: 1 },
      placement: {
        requiresBuildable: true,
        allowWater: false,
        allowImpassable: false,
        maxSlope: 0.2,
      },
    }]);
    const occupancy = createCellOccupancy(
      dimensions,
      [{
        id: 'yard-1',
        definitionId: 'yard',
        origin: { x: 2, y: 2 },
        rotationQuarterTurns: 0,
      }],
      definitions,
    ).occupancy;
    const roads = [{ cell: { x: 0, y: 0 } }];

    expect(validateRoadPlacement({
      dimensions,
      mapData,
      occupancy,
      roads,
      cell: { x: -1, y: 0 },
    }).failures.map((failure) => failure.code)).toEqual(['out-of-bounds']);
    expect(validateRoadPlacement({
      dimensions,
      mapData,
      occupancy,
      roads,
      cell: { x: 1, y: 0 },
    }).failures.map((failure) => failure.code)).toContain('not-buildable');
    expect(validateRoadPlacement({
      dimensions,
      mapData,
      occupancy,
      roads,
      cell: { x: 2, y: 0 },
    }).failures.map((failure) => failure.code)).toContain('impassable');
    expect(validateRoadPlacement({
      dimensions,
      mapData,
      occupancy,
      roads,
      cell: { x: 0, y: 1 },
    }).failures.map((failure) => failure.code)).toContain('water');
    expect(validateRoadPlacement({
      dimensions,
      mapData,
      occupancy,
      roads,
      cell: { x: 3, y: 0 },
    }).failures.map((failure) => failure.code)).toContain('out-of-bounds');
    expect(validateRoadPlacement({
      dimensions,
      mapData,
      occupancy,
      roads,
      cell: { x: 0, y: 0 },
    }).failures.map((failure) => failure.code)).toContain('duplicate-road');
    expect(validateRoadPlacement({
      dimensions,
      mapData,
      occupancy,
      roads,
      cell: { x: 2, y: 2 },
    }).failures.map((failure) => failure.code)).toContain('occupied-by-building');
    expect(validateRoadPlacement({
      dimensions,
      mapData,
      occupancy,
      roads,
      cell: { x: 2, y: 1 },
    }).failures.map((failure) => failure.code)).toContain('slope-too-steep');
  });
});

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

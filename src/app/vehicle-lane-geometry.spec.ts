import { ROAD_SURFACE_WIDTH } from './construction/road-geometry';
import {
  COURIER_VAN_LANE_OFFSET,
  COURIER_VAN_RENDER_SCALE,
  createRightHandLanePath,
  getRightHandLanePose,
} from './vehicle-lane-geometry';

const resolveCellCenter = (cell: { x: number; y: number }) => ({
  x: cell.x,
  z: cell.y,
});

describe('courier van lane geometry', () => {
  it('keeps the rendered van and its lane offset inside one road lane', () => {
    const roadLaneWidth = ROAD_SURFACE_WIDTH / 2;
    const renderedVanWidth = 2.2 * COURIER_VAN_RENDER_SCALE;

    expect(COURIER_VAN_RENDER_SCALE).toBe(0.18);
    expect(COURIER_VAN_LANE_OFFSET).toBe(ROAD_SURFACE_WIDTH / 4);
    expect(COURIER_VAN_LANE_OFFSET + renderedVanWidth / 2).toBeLessThanOrEqual(roadLaneWidth);
  });

  it.each([
    {
      name: 'eastbound',
      route: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      expected: { x: 0, z: COURIER_VAN_LANE_OFFSET },
    },
    {
      name: 'westbound',
      route: [{ x: 1, y: 0 }, { x: 0, y: 0 }],
      expected: { x: 1, z: -COURIER_VAN_LANE_OFFSET },
    },
    {
      name: 'southbound',
      route: [{ x: 0, y: 0 }, { x: 0, y: 1 }],
      expected: { x: -COURIER_VAN_LANE_OFFSET, z: 0 },
    },
    {
      name: 'northbound',
      route: [{ x: 0, y: 1 }, { x: 0, y: 0 }],
      expected: { x: COURIER_VAN_LANE_OFFSET, z: 1 },
    },
  ])('places $name traffic on the right-hand side', ({ route, expected }) => {
    const path = createRightHandLanePath(route, COURIER_VAN_LANE_OFFSET, resolveCellCenter);

    expect(path[0]).toEqual(expected);
  });

  it('keeps straight segments parallel to the same offset lane', () => {
    const path = createRightHandLanePath(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
      COURIER_VAN_LANE_OFFSET,
      resolveCellCenter,
    );

    expect(path).toEqual([
      { x: 0, z: COURIER_VAN_LANE_OFFSET },
      { x: 1, z: COURIER_VAN_LANE_OFFSET },
      { x: 2, z: COURIER_VAN_LANE_OFFSET },
    ]);
  });

  it('joins a right turn with a stable offset corner', () => {
    const path = createRightHandLanePath(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      COURIER_VAN_LANE_OFFSET,
      resolveCellCenter,
    );

    expect(path[0]?.x).toBe(0);
    expect(path[0]?.z).toBeCloseTo(COURIER_VAN_LANE_OFFSET);
    expect(path[1]?.x).toBeCloseTo(1 - COURIER_VAN_LANE_OFFSET);
    expect(path[1]?.z).toBeCloseTo(COURIER_VAN_LANE_OFFSET);
    expect(path[2]?.x).toBeCloseTo(1 - COURIER_VAN_LANE_OFFSET);
    expect(path[2]?.z).toBe(1);
  });

  it('uses lane endpoints while loading and unloading', () => {
    const route = [{ x: 0, y: 0 }, { x: 1, y: 0 }];

    const loading = getRightHandLanePose({
      route,
      routeIndex: 0,
      progress: 0,
      phase: 'loading',
    }, createRightHandLanePath(route, COURIER_VAN_LANE_OFFSET, resolveCellCenter), resolveCellCenter);
    const unloading = getRightHandLanePose({
      route,
      routeIndex: 1,
      progress: 0,
      phase: 'unloading',
    }, createRightHandLanePath(route, COURIER_VAN_LANE_OFFSET, resolveCellCenter), resolveCellCenter);

    expect(loading.position).toEqual({ x: 0, z: COURIER_VAN_LANE_OFFSET });
    expect(unloading.position).toEqual({ x: 1, z: COURIER_VAN_LANE_OFFSET });
  });

  it('uses a precomputed lane path without rebuilding route geometry', () => {
    const route = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    const lanePath = createRightHandLanePath(route, COURIER_VAN_LANE_OFFSET, resolveCellCenter);
    let resolverCalls = 0;
    const pose = getRightHandLanePose({
      route,
      routeIndex: 1,
      progress: 0.5,
      phase: 'enroute',
    }, lanePath, (cell) => {
      resolverCalls += 1;
      return resolveCellCenter(cell);
    });

    expect(pose.position.x).toBeCloseTo(1 - COURIER_VAN_LANE_OFFSET);
    expect(resolverCalls).toBe(2);
  });

  it('keeps a one-cell route centered and finite', () => {
    const route = [{ x: 4, y: 3 }];
    const pose = getRightHandLanePose({
      route,
      routeIndex: 0,
      progress: 0.5,
      phase: 'enroute',
    }, createRightHandLanePath(route, COURIER_VAN_LANE_OFFSET, resolveCellCenter), resolveCellCenter);

    expect(pose).toEqual({ position: { x: 4, z: 3 }, heading: 0 });
  });
});

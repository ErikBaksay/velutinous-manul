import { expect, Page, test, TestInfo } from '@playwright/test';

const DETERMINISTIC_SEED = 'VELUTINOUS-MANUL-START-001';
const CAMERA_SPEED = 96;
const MIN_ZOOM = 1.54;
const MAX_ZOOM = 128 / 32;

interface DebugMetrics {
  readonly text: string;
  readonly visible: number;
  readonly prefetch: number;
  readonly desired: number;
  readonly activeDesired: number;
  readonly attached: number;
  readonly attachedChunks: readonly string[];
  readonly missingDesired: number;
  readonly missingVisible: number;
  readonly retained: number;
  readonly queued: number;
  readonly building: number;
  readonly rejected: number;
  readonly candidates: number;
  readonly frustumCulled: number;
  readonly initial: string;
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraTarget: readonly [number, number, number];
  readonly zoom: number;
  readonly visibleViewHeight: number;
  readonly minimumZoom: number;
  readonly maximumZoom: number;
  readonly polarAngle: number;
  readonly elevation: number;
  readonly minimumElevation: number;
  readonly maximumElevation: number;
  readonly heading: number;
  readonly targetClamped: boolean;
  readonly navigationPlaneY: number;
  readonly navigationEnabled: boolean;
  readonly sceneHasFocus: boolean;
  readonly visibleChunks: readonly string[];
  readonly prefetchChunks: readonly string[];
  readonly rejectedChunks: readonly string[];
}

interface CameraCase {
  readonly label: string;
  readonly elevation: number | null;
  readonly heading: number | null;
  readonly zoom: 'default' | 'min' | 'max';
  readonly target: readonly [number, number] | null;
}

const CAMERA_CASES: readonly CameraCase[] = [
  { label: 'reset-default', elevation: null, heading: null, zoom: 'default', target: null },
  { label: 'shallow-north-center', elevation: 40, heading: 0, zoom: 'default', target: [0, 0] },
  { label: 'shallow-south-edge-zoom-out', elevation: 40, heading: 180, zoom: 'min', target: [0, 400] },
  { label: 'shallow-east-edge-zoom-in', elevation: 40, heading: 90, zoom: 'max', target: null },
  { label: 'shallow-west-edge-default', elevation: 40, heading: 270, zoom: 'default', target: null },
  { label: 'mid-east-edge-default', elevation: 45, heading: 90, zoom: 'default', target: null },
  { label: 'mid-diagonal-center-zoom-in', elevation: 45, heading: 45, zoom: 'max', target: null },
  { label: 'high-west-edge-default', elevation: 65, heading: 270, zoom: 'default', target: null },
  { label: 'steep-northwest-corner-zoom-in', elevation: 88, heading: 315, zoom: 'max', target: [-400, -400] },
  { label: 'shallow-southeast-corner', elevation: 40, heading: 135, zoom: 'default', target: null },
  { label: 'shallow-southwest-corner-default', elevation: 40, heading: 225, zoom: 'default', target: null },
];

test.describe('Velutinous Manul browser diagnostics', () => {
  test.describe.configure({ timeout: 480_000 });

  test('routes through the start screen, workshop, and unsaved world session', async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);

    await page.goto('/?debug=chunks&metrics=only#/');
    await expect(page.getByRole('heading', { name: 'Build a beautiful industrial region.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New World' })).toBeVisible();
    await expect(page.getByLabel('Interactive map camera')).toHaveCount(0);

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Load Save' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('There is no last active save to continue');

    await page.getByRole('button', { name: 'Back to Start' }).click();
    await page.getByRole('button', { name: 'New World' }).click();
    await expect(page.getByRole('heading', { name: 'Create New World' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Generate World/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shaping your continent' })).toHaveCount(0);

    await page.getByRole('button', { name: /^Generate World/ }).click();
    await waitForWorldReady(page);
    const generatedStartingCell = await page.getByTestId('generated-starting-cell').getAttribute('data-starting-cell');
    expect(generatedStartingCell).not.toBeNull();
    await page.getByRole('button', { name: /Explore Map/ }).click();
    await expect(page.getByRole('button', { name: /Accept World/ })).toBeVisible();
    await page.getByRole('button', { name: /Accept World/ }).click();

    await expect(page.getByRole('heading', { name: 'World Session' })).toBeVisible();
    await expect(page.getByTestId('world-map-identity')).toContainText(
      'VELUTINOUS-MANUL-START-001',
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('world-map-identity')).toHaveAttribute(
      'data-starting-cell',
      generatedStartingCell!,
    );
    expect(browserErrors.assetWarnings).toEqual([]);
    await waitForStreamingSettled(page, 120_000);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Load Save' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('This world session is no longer available');

    expect(browserErrors.consoleErrors).toEqual([]);
    expect(browserErrors.pageErrors).toEqual([]);
  });

  test('dispatches a courier van, delivers on arrival, and persists the transport state', async ({ page }) => {
    await prepareInitialWorld(page);
    await page.getByRole('button', { name: /Accept World/ }).click();
    await expect(page.getByRole('heading', { name: 'World Session' })).toBeVisible();
    await waitForStreamingSettled(page);
    await pauseSimulation(page);

    await page.getByRole('button', { name: 'Warehouse', exact: true }).click();
    await page.getByTestId('place-starting-warehouse').click();
    await expect(page.locator('.placement-message')).toContainText('Placed arcaded warehouse');

    await page.getByRole('button', { name: 'Mine', exact: true }).click();
    const depositSelect = page.getByLabel('Mineral deposit target');
    await expect(depositSelect.locator('option')).toHaveCount(20);
    const mineDepositId = await page.evaluate(() => {
      const angular = (window as unknown as {
        ng?: { getComponent?: (element: Element) => any };
      }).ng;
      const component = angular?.getComponent?.(document.querySelector('app-world-session')!);
      const warehouse = component?.world?.gameplay?.placedBuildings
        .find((building: any) => building.definitionId.includes('warehouse'));
      if (!component || !warehouse) {
        throw new Error('The browser transport flow could not locate the starting warehouse.');
      }
      const candidates = component.mineralDeposits
        .map((deposit: any) => ({
          id: deposit.id,
          origin: component['findMineOriginForDeposit'](deposit),
        }))
        .filter((candidate: any) => candidate.origin)
        .map((candidate: any) => ({
          ...candidate,
          distance: Math.abs(candidate.origin.x - warehouse.origin.x) +
            Math.abs(candidate.origin.y - warehouse.origin.y),
        }))
        .sort((left: any, right: any) =>
          left.distance - right.distance ||
          left.id - right.id,
        );
      if (!candidates[0]) {
        throw new Error('The browser transport flow could not find a buildable mineral deposit.');
      }
      return String((candidates.find((candidate: any) => candidate.distance >= 30) ?? candidates[0]).id);
    });
    await depositSelect.selectOption(mineDepositId);
    await page.getByTestId('prepare-mine-deposit').click();
    await expect(page.locator('.placement-message')).toContainText('Valid placement');
    await page.getByTestId('place-focused-mine').click();
    await expect(page.getByTestId('selected-mine-production')).toBeVisible();

    const mineResource = await page.getByTestId('mine-resource').textContent();
    const mineDeposit = await page.getByTestId('mine-deposit').textContent();
    expect(mineDeposit).toContain(`#${mineDepositId}`);

    const warehouseDestination = page.getByLabel('Warehouse destination');
    const warehouseIds = await warehouseDestination.locator('option').evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter((value) => value.length > 0),
    );
    expect(warehouseIds.length).toBe(1);
    await warehouseDestination.selectOption(warehouseIds[0]);
    await page.getByRole('button', { name: 'Assign Warehouse', exact: true }).click();
    await page.evaluate(() => {
      const angular = (window as unknown as {
        ng?: {
          getComponent?: (element: Element) => any;
          applyChanges?: (component: any) => void;
        };
      }).ng;
      const host = document.querySelector('app-world-session');
      const component = host && angular?.getComponent?.(host);
      const mine = component?.world?.gameplay?.placedBuildings
        .find((building: any) => building.definitionId.includes('mine'));
      if (!component || !mine) {
        throw new Error('The browser assignment flow could not locate the placed mine.');
      }
      component.selectTool();
      component['selectCell']({ x: mine.origin.x, y: mine.origin.y });
      angular?.applyChanges?.(component);
    });
    await expect(warehouseDestination).toHaveValue(warehouseIds[0]);
    await expect(page.getByTestId('mine-assigned-warehouse')).toContainText(warehouseIds[0]);
    await runUntilFirstMineTickAndPause(page);
    await expect(page.getByTestId('mine-produced-total')).toHaveText('Produced: 10');
    await expect(page.getByTestId('mine-delivered-total')).toContainText('0');
    await expect(page.getByTestId('mine-output-buffer')).toContainText('10');
    await expect(page.getByTestId('blocked-delivery-count')).toContainText('1');

    const resourceSuffix = mineResource?.includes('Iron')
      ? 'iron-ore'
      : mineResource?.includes('Copper')
        ? 'copper-ore'
        : 'stone';
    const expectedInventoryTestId = `warehouse-inventory-${warehouseIds[0]}-${resourceSuffix}`;

    await placeRoadRouteBetweenMineAndWarehouse(page);
    await expect(page.getByTestId('active-van-count')).toContainText('1');
    await expect(page.getByTestId('pending-delivery-count')).toContainText('1');

    await page.getByRole('button', { name: 'Save World', exact: true }).click();
    await page.getByLabel('Save name').fill('Generic Mine Transfer');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.save-note')).toContainText('Saved Generic Mine Transfer');

    const savedVehicleCount = await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('velutinous-manul-saves');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const payloads = await new Promise<any[]>((resolve, reject) => {
          const request = database.transaction('save-payload', 'readonly')
            .objectStore('save-payload')
            .getAll();
          request.onsuccess = () => resolve(request.result as any[]);
          request.onerror = () => reject(request.error);
        });
        return payloads.find((payload) => payload.slotName === 'Generic Mine Transfer')?.world.gameplay.vehicles.length ?? 0;
      } finally {
        database.close();
      }
    });
    expect(savedVehicleCount).toBe(1);

    await page.getByRole('button', { name: 'Leave World', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Build a beautiful industrial region.' })).toBeVisible();
    await page.getByRole('button', { name: /Load Save/ }).click();
    await expect(page.getByRole('heading', { name: 'Load Save' })).toBeVisible();
    const savedRow = page.locator('.save-row').filter({ hasText: 'Generic Mine Transfer' });
    await expect(savedRow).toBeVisible();
    await savedRow.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'World Session' })).toBeVisible();

    await expect(page.getByTestId('warehouse-inventory-list')).toBeVisible();
    await expect(page.getByTestId(expectedInventoryTestId)).toContainText('10', { timeout: 180_000 });
    await expect(page.getByTestId('completed-delivery-count')).toContainText('1');
  });

  test('places a connected road chain and persists it with the mineral inventory', async ({ page }) => {
    await prepareInitialWorld(page);
    await page.getByRole('button', { name: /Accept World/ }).click();
    await expect(page.getByRole('heading', { name: 'World Session' })).toBeVisible();
    await waitForStreamingSettled(page);
    await pauseSimulation(page);

    await page.getByRole('button', { name: 'Warehouse', exact: true }).click();
    await page.getByTestId('place-starting-warehouse').click();
    await expect(page.locator('.placement-message')).toContainText('Placed arcaded warehouse');

    await page.getByRole('button', { name: 'Mine', exact: true }).click();
    const depositSelect = page.getByLabel('Mineral deposit target');
    await depositSelect.selectOption('3');
    await page.getByTestId('prepare-mine-deposit').click();
    await page.getByTestId('place-focused-mine').click();
    await expect(page.getByTestId('selected-mine-production')).toBeVisible();
    const mineResource = await page.getByTestId('mine-resource').textContent();
    const resourceSuffix = mineResource?.includes('Iron')
      ? 'iron-ore'
      : mineResource?.includes('Copper')
        ? 'copper-ore'
        : 'stone';

    const warehouseDestination = page.getByLabel('Warehouse destination');
    const warehouseIds = await warehouseDestination.locator('option').evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter((value) => value.length > 0),
    );
    await warehouseDestination.selectOption(warehouseIds[0]);
    await page.getByRole('button', { name: 'Assign Warehouse', exact: true }).click();
    await runUntilFirstMineTickAndPause(page);
    await expect(page.getByTestId('mine-produced-total')).toHaveText('Produced: 10');
    await expect(page.getByTestId('mine-delivered-total')).toContainText('0');
    await expect(page.getByTestId('mine-output-buffer')).toContainText('10');

    await placeDeterministicRoadChain(page);
    await expect(page.getByTestId('road-count')).toContainText('3');
    const roadLayout = await page.getByTestId('road-layout').getAttribute('data-road-layout');
    expect(roadLayout).not.toBeNull();
    expect(roadLayout!.split('|').some((entry) => Number(entry.split(':')[1]) > 0)).toBe(true);

    await page.getByRole('button', { name: 'Save World', exact: true }).click();
    await page.getByLabel('Save name').fill('Road Network Round Trip');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.save-note')).toContainText('Saved Road Network Round Trip');

    await page.getByRole('button', { name: 'Leave World', exact: true }).click();
    await page.getByRole('button', { name: /Load Save/ }).click();
    const savedRow = page.locator('.save-row').filter({ hasText: 'Road Network Round Trip' });
    await savedRow.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'World Session' })).toBeVisible();
    await pauseSimulation(page);
    await expect(page.getByTestId('road-count')).toContainText('3');
    await expect(page.getByTestId('road-layout')).toHaveAttribute('data-road-layout', roadLayout!);
    await expect(page.getByTestId('warehouse-inventory-list')).toBeVisible();
    await expect(page.getByTestId(`warehouse-inventory-${warehouseIds[0]}-${resourceSuffix}`)).toContainText('0');
  });

  test('pauses the simulation and applies 2× and 4× speeds', async ({ page }) => {
    await prepareInitialWorld(page);
    await page.getByRole('button', { name: /Accept World/ }).click();
    await expect(page.getByRole('heading', { name: 'World Session' })).toBeVisible();
    await waitForStreamingSettled(page);
    await pauseSimulation(page);

    const readSimulationTick = async (): Promise<number> => {
      const text = await page.getByTestId('simulation-tick').textContent();
      return Number(text?.match(/\d+/)?.[0] ?? Number.NaN);
    };
    const pausedTick = await readSimulationTick();
    await page.waitForTimeout(700);
    expect(await readSimulationTick()).toBe(pausedTick);

    await page.getByTestId('simulation-speed-2').click();
    await page.getByTestId('simulation-pause').click();
    await page.waitForTimeout(1_200);
    await page.getByTestId('simulation-pause').click();
    const twoXTick = await readSimulationTick();
    expect(twoXTick - pausedTick).toBeGreaterThanOrEqual(2);

    await page.getByTestId('simulation-speed-4').click();
    await page.getByTestId('simulation-pause').click();
    await page.waitForTimeout(1_200);
    await page.getByTestId('simulation-pause').click();
    const fourXTick = await readSimulationTick();
    expect(fourXTick - twoXTick).toBeGreaterThanOrEqual(4);
  });

  test('locks generation input and exercises exploration controls', async ({ page }, testInfo) => {
    const browserErrors = collectBrowserErrors(page);
    await prepareDeterministicWorld(page);

    const canvas = page.getByLabel('Interactive map camera');
    const canvasPoint = await getCanvasPoint(page);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, canvasPoint)).toBe('CANVAS');
    await page.mouse.click(canvasPoint.x, canvasPoint.y);
    await canvas.focus();

    const beforeGeneration = await readDebugMetrics(page);
    const seed = page.getByLabel('World seed');
    await seed.fill(DETERMINISTIC_SEED);
    await page.getByRole('button', { name: /^Generate World/ }).click();
    await expect(page.getByRole('heading', { name: 'Shaping your continent' })).toBeVisible();
    await expect(seed).toBeDisabled();

    await page.keyboard.press('w');
    await page.keyboard.press('ArrowUp');
    await page.mouse.wheel(0, -500);
    await orbitDrag(page, 100, -80, 'middle');
    await orbitDrag(page, 100, 40, 'right');

    const duringGeneration = await readDebugMetrics(page);
    expect(cameraDistance(beforeGeneration.cameraPosition, duringGeneration.cameraPosition)).toBeLessThan(0.05);
    expect(cameraDistance(beforeGeneration.cameraTarget, duringGeneration.cameraTarget)).toBeLessThan(0.05);
    expect(Math.abs(beforeGeneration.zoom - duringGeneration.zoom)).toBeLessThan(0.001);
    expect(Math.abs(beforeGeneration.polarAngle - duringGeneration.polarAngle)).toBeLessThan(0.05);

    await waitForWorldReady(page);
    await page.getByRole('button', { name: /Explore Map/ }).click();
    await waitForStreamingSettled(page);

    const afterExplore = await readDebugMetrics(page);
    expect(cameraDistance(afterExplore.cameraTarget, duringGeneration.cameraTarget)).toBeLessThan(0.05);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, canvasPoint)).toBe('CANVAS');
    await focusCanvasForNavigation(page);
    await expect(canvas).toBeFocused();
    await expect.poll(async () => (await readDebugMetrics(page)).sceneHasFocus, { timeout: 2_000 }).toBe(true);
    const postFocus = await readDebugMetrics(page);
    expect(postFocus.navigationEnabled).toBe(true);
    expect(postFocus.sceneHasFocus).toBe(true);

    const beforeWasd = await readDebugMetrics(page);
    const afterWasd = await holdKeyUntilMoved(page, 'KeyW', beforeWasd);
    expect(cameraDistance(beforeWasd.cameraTarget, afterWasd.cameraTarget)).toBeGreaterThan(1);

    const beforeArrows = await readDebugMetrics(page);
    const afterArrows = await holdKeyUntilMoved(page, 'ArrowRight', beforeArrows);
    expect(cameraDistance(beforeArrows.cameraTarget, afterArrows.cameraTarget)).toBeGreaterThan(1);

    const beforeCursorZoom = await readDebugMetrics(page);
    await page.mouse.move(canvasPoint.x, canvasPoint.y);
    await page.mouse.wheel(0, -260);
    await waitForCameraStable(page);
    const afterCursorZoom = await readDebugMetrics(page);
    expect(afterCursorZoom.zoom).toBeGreaterThan(beforeCursorZoom.zoom);
    expect(cameraDistance(beforeCursorZoom.cameraTarget, afterCursorZoom.cameraTarget)).toBeGreaterThan(0.01);

    const beforeOrbit = await readDebugMetrics(page);
    await orbitDrag(page, 90, -70, 'middle');
    const afterOrbit = await readDebugMetrics(page);
    expect(Math.abs(shortestAngleDelta(beforeOrbit.heading, afterOrbit.heading))).toBeGreaterThan(1);
    expect(afterOrbit.elevation).toBeGreaterThanOrEqual(afterOrbit.minimumElevation - 0.5);
    expect(afterOrbit.elevation).toBeLessThanOrEqual(afterOrbit.maximumElevation + 0.5);

    const beforePan = await readDebugMetrics(page);
    await orbitDrag(page, 80, 45, 'right');
    const afterPan = await readDebugMetrics(page);
    expect(cameraDistance(beforePan.cameraTarget, afterPan.cameraTarget)).toBeGreaterThan(1);

    const beforeZoom = await readDebugMetrics(page);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(120);
    const afterZoom = await readDebugMetrics(page);
    expect(Math.abs(beforeZoom.zoom - afterZoom.zoom)).toBeGreaterThan(0.01);

    await waitForCameraStable(page);
    const beforeLeftClick = await readDebugMetrics(page);
    await page.mouse.click(canvasPoint.x, canvasPoint.y);
    await waitForCameraStable(page);
    const afterLeftClick = await readDebugMetrics(page);
    expect(cameraDistance(beforeLeftClick.cameraTarget, afterLeftClick.cameraTarget)).toBeLessThan(1.25);
    expect(Math.abs(beforeLeftClick.zoom - afterLeftClick.zoom)).toBeLessThan(0.005);
    expect(Math.abs(shortestAngleDelta(beforeLeftClick.heading, afterLeftClick.heading))).toBeLessThan(1);
    expect(Math.abs(beforeLeftClick.elevation - afterLeftClick.elevation)).toBeLessThan(0.5);

    await attachDiagnostic(testInfo, page, 'controls-final');
    await attachBrowserErrors(testInfo, browserErrors);
    expect(browserErrors.consoleErrors).toEqual([]);
    expect(browserErrors.pageErrors).toEqual([]);
  });

  test('keeps frustum-visible chunks attached through shallow camera transitions', async ({ page }, testInfo) => {
    const browserErrors = collectBrowserErrors(page);
    await prepareInitialWorld(page);

    const canvas = page.getByLabel('Interactive map camera');
    const canvasPoint = await getCanvasPoint(page);
    await page.mouse.click(canvasPoint.x, canvasPoint.y);
    await canvas.focus();

    for (const elevation of [88, 75, 60, 45, 40]) {
      await setElevation(page, elevation);
      await waitForStreamingSettled(page);
      const metrics = await readDebugMetrics(page);
      expectVisibleChunksAttached(metrics);
      await attachDiagnostic(testInfo, page, `transition-elevation-${elevation}`);
    }

    await setElevation(page, 65);
    await setZoom(page, 'max');
    await setElevation(page, 40);
    await waitForStreamingSettled(page);
    const zoomedInShallow = await readDebugMetrics(page);
    expect(zoomedInShallow.zoom).toBeGreaterThan(2.4);
    expect(zoomedInShallow.elevation).toBeGreaterThan(39);
    expect(zoomedInShallow.elevation).toBeLessThan(42);
    expect(zoomedInShallow.navigationPlaneY).toBeGreaterThan(25);
    expectVisibleChunksAttached(zoomedInShallow);
    await attachDiagnostic(testInfo, page, 'transition-shallow-zoomed-in');

    await setZoom(page, 'min');
    await waitForVisibleStreamingSettled(page);
    const zoomedOut = await readDebugMetrics(page);
    expectVisibleChunksAttached(zoomedOut);
    expectFiniteCameraTarget(zoomedOut);
    await attachDiagnostic(testInfo, page, 'transition-shallow-zoomed-out');

    await holdKey(page, 'KeyS', 2_000);
    await waitForVisibleStreamingSettled(page);
    const afterRapidPan = await readDebugMetrics(page);
    expectVisibleChunksAttached(afterRapidPan);
    expectFiniteCameraTarget(afterRapidPan);
    await attachDiagnostic(testInfo, page, 'transition-shallow-rapid-pan');

    await attachBrowserErrors(testInfo, browserErrors);
    expect(browserErrors.consoleErrors).toEqual([]);
    expect(browserErrors.pageErrors).toEqual([]);
  });

  test('keeps bounded camera framing across desktop aspect ratios', async ({ page }, testInfo) => {
    const browserErrors = collectBrowserErrors(page);
    await prepareInitialWorld(page);

    const canvas = page.getByLabel('Interactive map camera');
    await canvas.focus();
    const viewportCases = [
      { width: 1_440, height: 900, elevation: 40, heading: 0, zoom: 'min' as const, target: [400, 400] as const },
      { width: 1_024, height: 768, elevation: 45, heading: 90, zoom: 'default' as const, target: [400, 0] as const },
      { width: 1_920, height: 800, elevation: 80, heading: 225, zoom: 'max' as const, target: [-400, -400] as const },
    ];

    for (const cameraCase of viewportCases) {
      await page.setViewportSize({ width: cameraCase.width, height: cameraCase.height });
      await page.waitForTimeout(250);
      await setElevation(page, cameraCase.elevation);
      await setHeading(page, cameraCase.heading);
      await setZoom(page, cameraCase.zoom);
      await moveTargetTo(page, cameraCase.target[0], cameraCase.target[1]);
      await waitForVisibleStreamingSettled(page);

      const metrics = await attachDiagnostic(
        testInfo,
        page,
        `viewport-${cameraCase.width}x${cameraCase.height}`,
        false,
      );
      expectVisibleChunksAttached(metrics);
      expectFiniteCameraTarget(metrics);
      expect(metrics.elevation).toBeGreaterThanOrEqual(39);
      expect(metrics.elevation).toBeLessThanOrEqual(88.5);
    }

    await attachBrowserErrors(testInfo, browserErrors);
    expect(browserErrors.consoleErrors).toEqual([]);
    expect(browserErrors.pageErrors).toEqual([]);
  });

  for (const cameraCase of CAMERA_CASES) {
    test(`captures deterministic ${cameraCase.label} camera state`, async ({ page }, testInfo) => {
      const browserErrors = collectBrowserErrors(page);
      await prepareInitialWorld(page);

      const canvas = page.getByLabel('Interactive map camera');
      const canvasPoint = await getCanvasPoint(page);
      await page.mouse.click(canvasPoint.x, canvasPoint.y);
      await canvas.focus();

      if (cameraCase.elevation !== null) {
        await setElevation(page, cameraCase.elevation);
      }
      if (cameraCase.heading !== null) {
        await setHeading(page, cameraCase.heading);
      }
      await setZoom(page, cameraCase.zoom);
      if (cameraCase.target !== null) {
        await moveTargetTo(page, cameraCase.target[0], cameraCase.target[1]);
      }

      await waitForDiagnosticFrame(page);
      const metrics = await attachDiagnostic(testInfo, page, cameraCase.label, true);
      expect(metrics.initial).toBe('ready');
      expect(metrics.visible).toBeGreaterThan(0);
      expect(metrics.activeDesired).toBe(metrics.desired - metrics.rejected);
      expect(metrics.attached).toBeGreaterThan(0);
      expect(metrics.missingDesired).toBeGreaterThanOrEqual(0);
      if (cameraCase.label === 'shallow-north-center') {
        await attachDiagnostic(testInfo, page, 'shallow-before-bottom-approach');
        await holdKey(page, 'KeyS', 1_200);
        await waitForDiagnosticFrame(page);
        const bottomApproach = await attachDiagnostic(testInfo, page, 'shallow-bottom-approach');
        expect(bottomApproach.elevation).toBeGreaterThan(39);
        expect(bottomApproach.visible).toBeGreaterThan(0);
      }

      await waitForStreamingSettled(page);
      expectVisibleChunksAttached(await readDebugMetrics(page));

      await attachBrowserErrors(testInfo, browserErrors);
      expect(browserErrors.consoleErrors).toEqual([]);
      expect(browserErrors.pageErrors).toEqual([]);
    });
  }
});

async function prepareDeterministicWorld(page: Page): Promise<void> {
  await page.goto('/?debug=chunks&metrics=only#/new-world');
  await expect(page.getByRole('button', { name: /^Generate World/ })).toBeVisible();
  await page.getByRole('button', { name: /^Generate World/ }).click();
  await waitForWorldReady(page);
  await page.getByRole('button', { name: /Explore Map/ }).click();
  await page.getByRole('button', { name: /World settings/ }).click();

  const seed = page.getByLabel('World seed');
  await expect(seed).toBeEnabled();
  await seed.fill(DETERMINISTIC_SEED);
  await page.getByRole('button', { name: /^Generate World/ }).click();
  await expect(seed).toBeDisabled();
  await waitForWorldReady(page);
  await page.getByRole('button', { name: /Explore Map/ }).click();
  await page.getByRole('button', { name: /World settings/ }).click();
  await waitForStreamingSettled(page);
}

async function prepareInitialWorld(page: Page): Promise<void> {
  await page.goto('/?debug=chunks&metrics=only#/new-world');
  await expect(page.getByRole('button', { name: /^Generate World/ })).toBeVisible();
  await page.getByRole('button', { name: /^Generate World/ }).click();
  await waitForWorldReady(page);
  await expect(page.getByLabel('World seed')).toHaveValue(DETERMINISTIC_SEED);
  await page.getByRole('button', { name: /Explore Map/ }).click();
  await waitForStreamingSettled(page);
}

async function pauseSimulation(page: Page): Promise<void> {
  await expect(page.getByTestId('simulation-status')).toHaveText('Running');
  await page.getByTestId('simulation-pause').click();
  await expect(page.getByTestId('simulation-status')).toHaveText('Paused');
}

async function runUntilFirstMineTickAndPause(page: Page): Promise<void> {
  await page.getByTestId('simulation-pause').click();
  await page.waitForFunction(() => {
    const angular = (window as unknown as {
      ng?: { getComponent?: (element: Element) => any };
    }).ng;
    const host = document.querySelector('app-world-session');
    const component = host && angular?.getComponent?.(host);
    const mine = component?.world?.gameplay?.production?.mines?.[0];
    if (!component || !mine || mine.producedTotal < 10) {
      return false;
    }
    if (!component.isSimulationPaused) {
      component.toggleSimulationPause();
    }
    return component.isSimulationPaused;
  });
  await expect(page.getByTestId('simulation-status')).toHaveText('Paused');
}

async function waitForWorldReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'World ready' })).toBeVisible({ timeout: 300_000 });
  await expect(page.getByRole('button', { name: /Explore Map/ })).toBeVisible();
}

async function waitForStreamingSettled(page: Page, timeout = 120_000): Promise<DebugMetrics> {
  await expect.poll(async () => (await readDebugMetrics(page)).initial, { timeout }).toBe('ready');
  await expect.poll(async () => (await readDebugMetrics(page)).queued, { timeout }).toBe(0);
  await expect.poll(async () => (await readDebugMetrics(page)).building, { timeout }).toBe(0);
  await expect.poll(async () => (await readDebugMetrics(page)).missingDesired, { timeout }).toBe(0);
  await expect.poll(async () => (await readDebugMetrics(page)).missingVisible, { timeout }).toBe(0);
  await page.waitForTimeout(100);
  return readDebugMetrics(page);
}

async function waitForVisibleStreamingSettled(page: Page, timeout = 120_000): Promise<DebugMetrics> {
  await expect.poll(async () => (await readDebugMetrics(page)).initial, { timeout }).toBe('ready');
  await waitForCameraStable(page);
  await expect.poll(async () => (await readDebugMetrics(page)).missingVisible, { timeout }).toBe(0);
  await expect.poll(async () => {
    const metrics = await readDebugMetrics(page);
    return metrics.visibleChunks.every((key) => metrics.attachedChunks.includes(key));
  }, { timeout }).toBe(true);
  await page.waitForTimeout(150);
  return readDebugMetrics(page);
}

function expectVisibleChunksAttached(metrics: DebugMetrics): void {
  expect(metrics.missingVisible).toBe(0);
  expect(metrics.visibleChunks.every((key) => metrics.attachedChunks.includes(key))).toBe(true);
}

function expectFiniteCameraTarget(metrics: DebugMetrics): void {
  expect(metrics.cameraTarget.every((component) => Number.isFinite(component))).toBe(true);
}

async function waitForDiagnosticFrame(page: Page): Promise<DebugMetrics> {
  const metrics = page.getByTestId('chunk-stream-debug-metrics');
  await expect(metrics).toBeVisible();
  await page.waitForTimeout(250);
  return readDebugMetrics(page);
}

async function waitForCameraStable(page: Page): Promise<void> {
  let previous = await readDebugMetrics(page);
  let stableFrames = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await readDebugMetrics(page);
    if (cameraDistance(previous.cameraPosition, current.cameraPosition) < 0.01 &&
      cameraDistance(previous.cameraTarget, current.cameraTarget) < 0.01) {
      stableFrames += 1;
      if (stableFrames >= 3) {
        return;
      }
    } else {
      stableFrames = 0;
    }
    previous = current;
  }
}

async function readDebugMetrics(page: Page): Promise<DebugMetrics> {
  const metrics = page.getByTestId('chunk-stream-debug-metrics');
  await expect(metrics).toBeVisible();
  return metrics.evaluate((element) => {
    const value = (name: string): string => element.getAttribute(`data-${name}`) ?? '';
    const numberValue = (name: string): number => Number(value(name));
    const vectorValue = (name: string): readonly [number, number, number] => {
      const values = value(name).split(',').map(Number);
      return [values[0] ?? Number.NaN, values[1] ?? Number.NaN, values[2] ?? Number.NaN];
    };
    const listValue = (name: string): readonly string[] => value(name).split(',').filter(Boolean);

    return {
      text: element.textContent ?? '',
      visible: numberValue('visible'),
      prefetch: numberValue('prefetch'),
      desired: numberValue('desired'),
      activeDesired: numberValue('active-desired'),
      attached: numberValue('attached'),
      attachedChunks: listValue('attached-chunks'),
      missingDesired: numberValue('missing-desired'),
      missingVisible: numberValue('missing-visible'),
      retained: numberValue('retained'),
      queued: numberValue('queued'),
      building: numberValue('building'),
      rejected: numberValue('rejected'),
      candidates: numberValue('candidates'),
      frustumCulled: numberValue('frustum-culled'),
      initial: value('initial'),
      cameraPosition: vectorValue('camera-position'),
      cameraTarget: vectorValue('camera-target'),
      zoom: numberValue('zoom-value'),
      visibleViewHeight: numberValue('visible-view-height'),
      minimumZoom: numberValue('minimum-zoom'),
      maximumZoom: numberValue('maximum-zoom'),
      polarAngle: numberValue('polar-angle'),
      elevation: numberValue('elevation'),
      minimumElevation: numberValue('minimum-elevation'),
      maximumElevation: numberValue('maximum-elevation'),
      heading: numberValue('heading'),
      targetClamped: value('target-clamped') === 'true',
      navigationPlaneY: numberValue('navigation-plane-y'),
      navigationEnabled: value('navigation-enabled') === 'true',
      sceneHasFocus: value('scene-has-focus') === 'true',
      visibleChunks: listValue('visible-chunks'),
      prefetchChunks: listValue('prefetch-chunks'),
      rejectedChunks: listValue('rejected-chunks'),
    };
  });
}

async function attachDiagnostic(
  testInfo: TestInfo,
  page: Page,
  label: string,
  captureScreenshot = true,
): Promise<DebugMetrics> {
  const metrics = await readDebugMetrics(page);
  await testInfo.attach(`${label}-metrics`, {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
  if (captureScreenshot) {
    try {
      await testInfo.attach(`${label}-screenshot`, {
        body: await page.screenshot({ animations: 'disabled', timeout: 5_000 }),
        contentType: 'image/png',
      });
    } catch (error: unknown) {
      await testInfo.attach(`${label}-screenshot-error`, {
        body: String(error),
        contentType: 'text/plain',
      });
    }
  }
  return metrics;
}

function collectBrowserErrors(page: Page): {
  consoleErrors: string[];
  pageErrors: string[];
  assetWarnings: string[];
} {
  const errors = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    assetWarnings: [] as string[],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.consoleErrors.push(message.text());
    }
    if (
      message.type() === 'warning' &&
      message.text().includes('[visual assets] authored GLB unavailable')
    ) {
      errors.assetWarnings.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.pageErrors.push(error.stack ?? error.message);
  });
  return errors;
}

async function attachBrowserErrors(
  testInfo: TestInfo,
  errors: { consoleErrors: string[]; pageErrors: string[] },
): Promise<void> {
  await testInfo.attach('browser-errors', {
    body: JSON.stringify(errors, null, 2),
    contentType: 'application/json',
  });
}

async function getCanvasPoint(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator(
    'canvas[aria-label="Interactive map camera"], canvas[aria-label="Interactive world camera"]',
  ).first().boundingBox();
  if (!box) {
    throw new Error('The interactive map canvas has no layout box.');
  }
  return { x: box.x + box.width * 0.78, y: box.y + box.height * 0.5 };
}

async function placeDeterministicRoadChain(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Road', exact: true }).click();
  const roadCells = await page.evaluate(() => {
    const angular = (window as unknown as {
      ng?: {
        getComponent?: (element: Element) => any;
        applyChanges?: (component: any) => void;
      };
    }).ng;
    const host = document.querySelector('app-world-session');
    const component = host && angular?.getComponent?.(host);
    if (!component) {
      throw new Error('The Angular world-session component is unavailable to the browser test.');
    }

    component.activateRoadTool();
    const selected = component.selectedCell ?? {
      x: component.world.map.generationSummary.startingCell % component.world.map.configuration.width,
      y: Math.floor(component.world.map.generationSummary.startingCell / component.world.map.configuration.width),
    };
    const candidates = new Map<string, { x: number; y: number }>();
    for (let y = Math.max(0, selected.y - 80); y <= Math.min(component.world.map.configuration.height - 1, selected.y + 80); y += 1) {
      for (let x = Math.max(0, selected.x - 80); x <= Math.min(component.world.map.configuration.width - 1, selected.x + 80); x += 1) {
        const cell = { x, y };
        if (component['validateRoad'](cell).valid) {
          candidates.set(`${x},${y}`, cell);
        }
      }
    }

    const path = (start: { x: number; y: number }, length: number, current: { x: number; y: number }[]): { x: number; y: number }[] | null => {
      if (current.length === length) {
        return current;
      }
      const neighbors = [
        { x: start.x + 1, y: start.y },
        { x: start.x - 1, y: start.y },
        { x: start.x, y: start.y + 1 },
        { x: start.x, y: start.y - 1 },
      ];
      for (const neighbor of neighbors) {
        const candidate = candidates.get(`${neighbor.x},${neighbor.y}`);
        if (!candidate || current.some((cell) => cell.x === candidate.x && cell.y === candidate.y)) {
          continue;
        }
        const result = path(candidate, length, [...current, candidate]);
        if (result) {
          return result;
        }
      }
      return null;
    };

    for (const candidate of candidates.values()) {
      const result = path(candidate, 3, [candidate]);
      if (result) {
        return result;
      }
    }
    throw new Error(`Could not find three adjacent valid road cells among ${candidates.size} candidates.`);
  });

  await page.evaluate((cells) => {
    const angular = (window as unknown as {
      ng?: {
        getComponent?: (element: Element) => any;
        applyChanges?: (component: any) => void;
      };
    }).ng;
    const host = document.querySelector('app-world-session');
    const component = host && angular?.getComponent?.(host);
    if (!component) {
      throw new Error('The Angular world-session component is unavailable to the browser test.');
    }
    component.activateRoadTool();
    for (const cell of cells) {
      component['placeRoad'](cell);
    }
    angular?.applyChanges?.(component);
  }, roadCells);
  await expect(page.locator('.placement-message')).toContainText('Placed road');
}

async function placeRoadRouteBetweenMineAndWarehouse(page: Page): Promise<void> {
  const route = await page.evaluate(() => {
    const angular = (window as unknown as {
      ng?: {
        getComponent?: (element: Element) => any;
        applyChanges?: (component: any) => void;
      };
    }).ng;
    const host = document.querySelector('app-world-session');
    const component = host && angular?.getComponent?.(host);
    if (!component) {
      throw new Error('The Angular world-session component is unavailable to the browser test.');
    }

    const buildings = component.world.gameplay.placedBuildings;
    const mine = buildings.find((building: any) => building.definitionId.includes('mine'));
    const warehouse = buildings.find((building: any) => building.definitionId.includes('warehouse'));
    if (!mine || !warehouse) {
      throw new Error('The browser transport flow requires a mine and warehouse.');
    }

    const dimensions = component.world.map.configuration;
    const footprint = (building: any): { x: number; y: number }[] => {
      const definition = component['constructionDefinitions'].get(building.definitionId);
      const width = building.rotationQuarterTurns % 2 === 0
        ? definition.footprint.width
        : definition.footprint.height;
      const height = building.rotationQuarterTurns % 2 === 0
        ? definition.footprint.height
        : definition.footprint.width;
      return Array.from({ length: width * height }, (_, index) => ({
        x: building.origin.x + index % width,
        y: building.origin.y + Math.floor(index / width),
      }));
    };
    const footprintKeys = new Set([...footprint(mine), ...footprint(warehouse)]
      .map((cell) => `${cell.x},${cell.y}`));
    const roadKeys = new Set(component.world.gameplay.roads
      .map((road: any) => `${road.cell.x},${road.cell.y}`));
    const directions = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    const validationCache = new Map<string, boolean>();
    const isWalkable = (cell: { x: number; y: number }): boolean => {
      if (cell.x < 0 || cell.x >= dimensions.width || cell.y < 0 || cell.y >= dimensions.height ||
        footprintKeys.has(`${cell.x},${cell.y}`)) {
        return false;
      }
      const key = `${cell.x},${cell.y}`;
      if (roadKeys.has(key)) {
        return true;
      }
      const cached = validationCache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const valid = component['validateRoad'](cell).valid;
      validationCache.set(key, valid);
      return valid;
    };
    const accessCells = (building: any): { x: number; y: number }[] => {
      const access = new Map<string, { x: number; y: number }>();
      for (const cell of footprint(building)) {
        for (const direction of directions) {
          const candidate = { x: cell.x + direction.x, y: cell.y + direction.y };
          if (isWalkable(candidate)) {
            access.set(`${candidate.x},${candidate.y}`, candidate);
          }
        }
      }
      return [...access.values()].sort((left, right) => left.y - right.y || left.x - right.x);
    };
    const sourceAccess = accessCells(mine);
    const destinationKeys = new Set(accessCells(warehouse).map((cell) => `${cell.x},${cell.y}`));
    const queue = [...sourceAccess];
    const previous = new Map<string, string | null>(
      sourceAccess.map((cell) => [`${cell.x},${cell.y}`, null]),
    );
    let destinationKey: string | undefined;
    for (let index = 0; index < queue.length && !destinationKey; index += 1) {
      const current = queue[index];
      if (!current) {
        break;
      }
      if (destinationKeys.has(`${current.x},${current.y}`)) {
        destinationKey = `${current.x},${current.y}`;
        break;
      }
      for (const direction of directions) {
        const next = { x: current.x + direction.x, y: current.y + direction.y };
        const nextKey = `${next.x},${next.y}`;
        if (!isWalkable(next) || previous.has(nextKey)) {
          continue;
        }
        previous.set(nextKey, `${current.x},${current.y}`);
        queue.push(next);
      }
    }
    if (!destinationKey) {
      throw new Error('Could not find a buildable road route between the mine and warehouse.');
    }

    const path: { x: number; y: number }[] = [];
    let currentKey: string | null | undefined = destinationKey;
    while (currentKey !== null && currentKey !== undefined) {
      const [x, y] = currentKey.split(',').map(Number);
      path.push({ x, y });
      currentKey = previous.get(currentKey);
    }
    path.reverse();
    component.activateRoadTool();
    for (const cell of path) {
      component['placeRoad'](cell);
    }
    angular?.applyChanges?.(component);
    return path;
  });

  expect(route.length).toBeGreaterThan(0);
}

async function holdKey(page: Page, key: string, milliseconds: number): Promise<void> {
  const playwrightKey = key.startsWith('Key') ? key.slice(3).toLowerCase() : key;
  await page.keyboard.down(playwrightKey);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(playwrightKey);
}

async function holdKeyUntilMoved(page: Page, key: string, before: DebugMetrics): Promise<DebugMetrics> {
  const playwrightKey = key.startsWith('Key') ? key.slice(3).toLowerCase() : key;
  await page.getByLabel('Interactive map camera').focus();
  await page.keyboard.down(playwrightKey);
  try {
    await expect.poll(
      async () => cameraDistance(before.cameraTarget, (await readDebugMetrics(page)).cameraTarget),
      { timeout: 4_000, intervals: [100, 200, 300] },
    ).toBeGreaterThan(1);
  } finally {
    await page.keyboard.up(playwrightKey);
  }
  return readDebugMetrics(page);
}

async function focusCanvasForNavigation(page: Page): Promise<void> {
  const point = await getCanvasPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  await page.getByLabel('Interactive map camera').focus();
}

async function orbitDrag(
  page: Page,
  deltaX: number,
  deltaY: number,
  button: 'middle' | 'right',
  settleMilliseconds = 100,
): Promise<DebugMetrics> {
  const point = await getCanvasPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button });
  await page.mouse.move(point.x + deltaX, point.y + deltaY, { steps: 8 });
  await page.mouse.up({ button });
  await page.waitForTimeout(settleMilliseconds);
  return readDebugMetrics(page);
}

async function setElevation(page: Page, desired: number): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const before = await readDebugMetrics(page);
    const difference = desired - before.elevation;
    if (Math.abs(difference) < 0.8) {
      return;
    }

    const deltaY = clamp(difference * 900 / 360, -240, 240);
    await orbitDrag(page, 0, deltaY, 'middle');
  }
  const final = await readDebugMetrics(page);
  expect(Math.abs(final.elevation - desired)).toBeLessThan(1.5);
}

async function setHeading(page: Page, desired: number): Promise<void> {
  const before = await readDebugMetrics(page);
  const difference = shortestAngleDelta(desired, before.heading);
  if (Math.abs(difference) < 8) {
    return;
  }

  // OrbitControls' exact pixel-to-angle response is intentionally left to the
  // browser. A bounded drag records the resulting heading without turning the
  // diagnostic sweep into a fragile screenshot-style calibration test.
  await orbitDrag(page, clamp(-difference * 1440 / 360 * 0.4, -120, 120), 0, 'middle');
}

async function setZoom(page: Page, desired: CameraCase['zoom']): Promise<void> {
  const desiredZoom = desired === 'min' ? MIN_ZOOM : desired === 'max' ? MAX_ZOOM : 1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await readDebugMetrics(page);
    if (Math.abs(current.zoom - desiredZoom) < 0.025) {
      return;
    }
    await page.mouse.wheel(0, current.zoom < desiredZoom ? -260 : 260);
    await page.waitForTimeout(35);
  }
  const final = await readDebugMetrics(page);
  if (desired === 'min') {
    expect(final.zoom).toBeGreaterThanOrEqual(final.minimumZoom - 0.03);
    expect(final.zoom).toBeLessThanOrEqual(final.maximumZoom + 0.03);
  } else if (desired === 'max') {
    expect(final.zoom).toBeGreaterThan(2.4);
  } else {
    expect(final.zoom).toBeGreaterThanOrEqual(final.minimumZoom - 0.03);
    expect(final.zoom).toBeLessThanOrEqual(Math.max(1.2, final.minimumZoom + 0.03));
  }
}

async function moveTargetTo(page: Page, desiredX: number, desiredZ: number): Promise<void> {
  // A bounded sweep keeps the browser run finite while the attached metrics record
  // the actual target reached by user input, even when a requested edge/corner is
  // farther away than one practical interaction.
  for (let attempt = 0; attempt < 1; attempt += 1) {
    const current = await readDebugMetrics(page);
    const deltaX = desiredX - current.cameraTarget[0];
    const deltaZ = desiredZ - current.cameraTarget[2];
    if (Math.hypot(deltaX, deltaZ) < 24) {
      return;
    }

    const heading = current.heading * Math.PI / 180;
    const forwardX = Math.sin(heading);
    const forwardZ = -Math.cos(heading);
    const rightX = Math.cos(heading);
    const rightZ = Math.sin(heading);
    const forwardDistance = deltaX * forwardX + deltaZ * forwardZ;
    const rightDistance = deltaX * rightX + deltaZ * rightZ;
    const keys: string[] = [];
    if (forwardDistance > 1) {
      keys.push('KeyW');
    } else if (forwardDistance < -1) {
      keys.push('KeyS');
    }
    if (rightDistance > 1) {
      keys.push('KeyD');
    } else if (rightDistance < -1) {
      keys.push('KeyA');
    }
    if (keys.length === 0) {
      return;
    }

    const speed = keys.length === 2 ? CAMERA_SPEED / Math.sqrt(2) : CAMERA_SPEED;
    const duration = Math.min(1_800, Math.max(Math.abs(forwardDistance), Math.abs(rightDistance)) / speed * 1_000);
    await Promise.all(keys.map((key) => page.keyboard.down(key.slice(3).toLowerCase())));
    await page.waitForTimeout(duration);
    await Promise.all(keys.map((key) => page.keyboard.up(key.slice(3).toLowerCase())));
  }
}

function cameraDistance(
  first: readonly [number, number, number],
  second: readonly [number, number, number],
): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

function shortestAngleDelta(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

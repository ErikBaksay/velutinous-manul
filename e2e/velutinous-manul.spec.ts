import { expect, Page, test, TestInfo } from '@playwright/test';

const DETERMINISTIC_SEED = 'VM-START-001';
const CAMERA_SPEED = 96;
const MIN_ZOOM = 128 / 320;
const MAX_ZOOM = 128 / 48;

interface DebugMetrics {
  readonly text: string;
  readonly visible: number;
  readonly prefetch: number;
  readonly desired: number;
  readonly activeDesired: number;
  readonly attached: number;
  readonly missingDesired: number;
  readonly queued: number;
  readonly building: number;
  readonly rejected: number;
  readonly candidates: number;
  readonly frustumCulled: number;
  readonly initial: string;
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraTarget: readonly [number, number, number];
  readonly zoom: number;
  readonly polarAngle: number;
  readonly elevation: number;
  readonly heading: number;
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
  { label: 'shallow-north-center', elevation: 12, heading: 0, zoom: 'default', target: [0, 0] },
  { label: 'shallow-south-edge-zoom-out', elevation: 12, heading: 180, zoom: 'min', target: [0, 400] },
  { label: 'shallow-east-edge-zoom-in', elevation: 12, heading: 90, zoom: 'max', target: null },
  { label: 'shallow-west-edge-default', elevation: 12, heading: 270, zoom: 'default', target: null },
  { label: 'mid-east-edge-default', elevation: 24, heading: 90, zoom: 'default', target: null },
  { label: 'mid-diagonal-center-zoom-in', elevation: 45, heading: 45, zoom: 'max', target: null },
  { label: 'high-west-edge-default', elevation: 65, heading: 270, zoom: 'default', target: null },
  { label: 'steep-northwest-corner-zoom-in', elevation: 88, heading: 315, zoom: 'max', target: [-400, -400] },
  { label: 'shallow-southeast-corner', elevation: 12, heading: 135, zoom: 'default', target: null },
  { label: 'shallow-southwest-corner-default', elevation: 12, heading: 225, zoom: 'default', target: null },
];

test.describe('Velutinous Manul browser diagnostics', () => {
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

    const beforeOrbit = await readDebugMetrics(page);
    await orbitDrag(page, 90, -70, 'middle');
    const afterOrbit = await readDebugMetrics(page);
    expect(Math.abs(shortestAngleDelta(beforeOrbit.heading, afterOrbit.heading))).toBeGreaterThan(1);
    expect(Math.abs(beforeOrbit.elevation - afterOrbit.elevation)).toBeGreaterThan(1);

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
    expect(cameraDistance(beforeLeftClick.cameraTarget, afterLeftClick.cameraTarget)).toBeLessThan(0.5);
    expect(Math.abs(beforeLeftClick.zoom - afterLeftClick.zoom)).toBeLessThan(0.005);
    expect(Math.abs(shortestAngleDelta(beforeLeftClick.heading, afterLeftClick.heading))).toBeLessThan(0.5);
    expect(Math.abs(beforeLeftClick.elevation - afterLeftClick.elevation)).toBeLessThan(0.5);

    await attachDiagnostic(testInfo, page, 'controls-final');
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
        expect(bottomApproach.elevation).toBeLessThan(14);
        expect(bottomApproach.visible).toBeGreaterThan(0);
      }

      await attachBrowserErrors(testInfo, browserErrors);
      expect(browserErrors.consoleErrors).toEqual([]);
      expect(browserErrors.pageErrors).toEqual([]);
    });
  }
});

async function prepareDeterministicWorld(page: Page): Promise<void> {
  await page.goto('/?debug=chunks&metrics=only');
  await waitForWorldReady(page);
  await page.getByRole('button', { name: /Explore Map/ }).click();

  const seed = page.getByLabel('World seed');
  await expect(seed).toBeEnabled();
  await seed.fill(DETERMINISTIC_SEED);
  await page.getByRole('button', { name: /^Generate World/ }).click();
  await expect(seed).toBeDisabled();
  await waitForWorldReady(page);
  await page.getByRole('button', { name: /Explore Map/ }).click();
  await waitForStreamingSettled(page);
}

async function prepareInitialWorld(page: Page): Promise<void> {
  await page.goto('/?debug=chunks&metrics=only');
  await waitForWorldReady(page);
  await expect(page.getByLabel('World seed')).toHaveValue(DETERMINISTIC_SEED);
  await page.getByRole('button', { name: /Explore Map/ }).click();
  await waitForStreamingSettled(page);
}

async function waitForWorldReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'World ready' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('button', { name: /Explore Map/ })).toBeVisible();
}

async function waitForStreamingSettled(page: Page): Promise<DebugMetrics> {
  await expect.poll(async () => (await readDebugMetrics(page)).initial).toBe('ready');
  await expect.poll(async () => (await readDebugMetrics(page)).queued).toBe(0);
  await expect.poll(async () => (await readDebugMetrics(page)).building).toBe(0);
  await expect.poll(async () => (await readDebugMetrics(page)).missingDesired).toBe(0);
  await page.waitForTimeout(100);
  return readDebugMetrics(page);
}

async function waitForDiagnosticFrame(page: Page): Promise<DebugMetrics> {
  const metrics = page.getByTestId('chunk-stream-debug-metrics');
  await expect(metrics).toBeVisible();
  await page.waitForTimeout(250);
  return readDebugMetrics(page);
}

async function waitForCameraStable(page: Page): Promise<void> {
  let previous = await readDebugMetrics(page);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await readDebugMetrics(page);
    if (cameraDistance(previous.cameraPosition, current.cameraPosition) < 0.01) {
      return;
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
      missingDesired: numberValue('missing-desired'),
      queued: numberValue('queued'),
      building: numberValue('building'),
      rejected: numberValue('rejected'),
      candidates: numberValue('candidates'),
      frustumCulled: numberValue('frustum-culled'),
      initial: value('initial'),
      cameraPosition: vectorValue('camera-position'),
      cameraTarget: vectorValue('camera-target'),
      zoom: numberValue('zoom-value'),
      polarAngle: numberValue('polar-angle'),
      elevation: numberValue('elevation'),
      heading: numberValue('heading'),
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

function collectBrowserErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const errors = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.consoleErrors.push(message.text());
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
  const box = await page.getByLabel('Interactive map camera').boundingBox();
  if (!box) {
    throw new Error('The interactive map canvas has no layout box.');
  }
  return { x: box.x + box.width * 0.78, y: box.y + box.height * 0.5 };
}

async function holdKey(page: Page, key: string, milliseconds: number): Promise<void> {
  const playwrightKey = key.startsWith('Key') ? key.slice(3).toLowerCase() : key;
  await page.keyboard.down(playwrightKey);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(playwrightKey);
}

async function holdKeyUntilMoved(page: Page, key: string, before: DebugMetrics): Promise<DebugMetrics> {
  await holdKey(page, key, 220);
  let after = await readDebugMetrics(page);
  if (cameraDistance(before.cameraTarget, after.cameraTarget) <= 1) {
    await focusCanvasForNavigation(page);
    await holdKey(page, key, 220);
    after = await readDebugMetrics(page);
  }
  return after;
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
    expect(final.zoom).toBeLessThan(0.55);
  } else if (desired === 'max') {
    expect(final.zoom).toBeGreaterThan(2.4);
  } else {
    expect(final.zoom).toBeGreaterThan(0.8);
    expect(final.zoom).toBeLessThan(1.2);
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

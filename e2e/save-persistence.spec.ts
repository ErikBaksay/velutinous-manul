import { expect, Page, test } from '@playwright/test';

const SAVE_DATABASE_NAME = 'velutinous-manul-saves';
const LAST_ACTIVE_SAVE_STORAGE_KEY = 'velutinous-manul:last-active-save-id';

test.describe('save persistence smoke flow', () => {
  test.describe.configure({ timeout: 360_000 });

  test('creates, restores, lists, and protects saves', async ({ page }) => {
    await resetSaveStorage(page);
    await page.goto('/?debug=chunks&metrics=only#/new-world');
    await expect(page.getByRole('heading', { name: 'Create New World' })).toBeVisible();

    await page.getByRole('button', { name: /^Generate World/ }).click();
    await waitForWorldReady(page);
    await page.getByRole('button', { name: /Explore Map/ }).click();
    await page.getByRole('button', { name: /Accept World/ }).click();

    await expect(page.getByRole('heading', { name: 'World Session' })).toBeVisible();
    const worldIdentity = await page.getByTestId('world-map-identity').textContent();
    await expect(page.locator('.save-note')).toContainText('Autosaved at', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Save World', exact: true }).click();
    await page.getByLabel('Save name').fill('Round Trip World');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.save-note')).toContainText('Saved Round Trip World');

    await page.getByRole('button', { name: 'Leave World', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Build a beautiful industrial region.' }),
    ).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'World Session' })).toBeVisible();
    await expect(page.getByTestId('world-map-identity')).toHaveText(worldIdentity ?? '');

    await page.getByRole('button', { name: 'Leave World', exact: true }).click();
    await page.getByRole('button', { name: 'Load Save' }).click();
    await expect(page.getByRole('heading', { name: 'Load Save' })).toBeVisible();

    const autosaveRow = page.locator('.save-row').filter({ hasText: 'Autosave' });
    const manualSaveRow = page.locator('.save-row').filter({ hasText: 'Round Trip World' });
    await expect(autosaveRow).toHaveCount(1);
    await expect(manualSaveRow).toHaveCount(1);
    await expect(autosaveRow.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(manualSaveRow.getByRole('button', { name: 'Delete' })).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await manualSaveRow.getByRole('button', { name: 'Delete' }).click();
    await expect(manualSaveRow).toHaveCount(0);
    await expect(autosaveRow).toHaveCount(1);
  });
});

async function resetSaveStorage(page: Page): Promise<void> {
  await page.goto('/#/');
  await page.evaluate(({ databaseName, lastActiveKey }) => {
    localStorage.removeItem(lastActiveKey);
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  }, { databaseName: SAVE_DATABASE_NAME, lastActiveKey: LAST_ACTIVE_SAVE_STORAGE_KEY });
}

async function waitForWorldReady(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'World ready' }),
  ).toBeVisible({ timeout: 300_000 });
  await expect(page.getByRole('button', { name: /Explore Map/ })).toBeVisible();
}

import { expect, test, type Page } from '@playwright/test';
import { act, freshApp, openSample } from '../helpers';
import { mockDrive, mockGoogleScripts } from './google';

/** A fresh app with Google mocked: sign-in grants at once, the Picker picks `window.__pick`. */
async function setup(page: Page) {
  await mockGoogleScripts(page);
  const drive = await mockDrive(page);
  await freshApp(page);
  return drive;
}
const button = (page: Page) => page.getByTestId('drive-button');
const pick = (page: Page) => page.getByRole('button', { name: 'Pick', exact: true }).click();
const rename = async (page: Page, id: string, label: string) => {
  await page.locator(`[data-testid="node-${id}"] rect`).first().click();
  await page.getByTestId('prop-label').fill(label);
  await page.keyboard.press('Escape');
};
const stored = (drive: Awaited<ReturnType<typeof mockDrive>>, id = 'created-1') => JSON.parse(drive.files.get(id)!.content) as { title: string; nodes: { id: string; label: string }[] };
const labelIn = (doc: ReturnType<typeof stored>, id: string) => doc.nodes.find((n) => n.id === id)!.label;

test('connect, save to a folder, and save edits automatically', async ({ page }) => {
  const drive = await setup(page);
  await openSample(page);
  await expect(button(page)).toHaveText('Connect Drive');
  await button(page).click();
  await expect(button(page)).toHaveText('Save to Drive');
  await button(page).click();
  await pick(page);
  await expect(button(page)).toHaveAttribute('data-status', 'synced');
  expect(drive.files.get('created-1')).toMatchObject({ parents: ['folder-1'], mimeType: 'application/vnd.structlet+json' });
  expect(drive.files.get('created-1')!.name).toBe('온라인 상점 · 시스템 구성도.structlet');

  await rename(page, 'api', 'Orders API');
  await expect(button(page)).toHaveAttribute('data-status', 'synced', { timeout: 8000 });
  await expect.poll(() => labelIn(stored(drive), 'api')).toBe('Orders API');
  // ⌘S saves to the linked file instead of downloading.
  let downloaded = false;
  page.on('download', () => (downloaded = true));
  await rename(page, 'db', 'Orders DB');
  await page.locator('body').press('ControlOrMeta+s');
  await expect.poll(() => labelIn(stored(drive), 'db')).toBe('Orders DB');
  expect(downloaded).toBe(false);
});

test('after a reload the file waits for reconnecting, then catches up', async ({ page }) => {
  const drive = await setup(page);
  await openSample(page);
  await button(page).click();
  await button(page).click();
  await pick(page);
  await expect(button(page)).toHaveAttribute('data-status', 'synced');
  await page.reload();
  await expect(button(page)).toHaveAttribute('data-status', 'paused');
  await expect(button(page)).toHaveText('Reconnect');
  await rename(page, 'api', 'Edited offline');
  await button(page).click();
  await expect(button(page)).toHaveAttribute('data-status', 'synced', { timeout: 8000 });
  await expect.poll(() => labelIn(stored(drive), 'api')).toBe('Edited offline');
  // The reload happened right after saving: Drive never received an empty diagram.
  expect(stored(drive).nodes).toHaveLength(11);
});

test('changes made elsewhere are merged; a real conflict asks which side to keep', async ({ page }) => {
  const drive = await setup(page);
  await openSample(page);
  await button(page).click();
  await button(page).click();
  await pick(page);
  await expect(button(page)).toHaveAttribute('data-status', 'synced');
  const elsewhere = (fn: (doc: ReturnType<typeof stored>) => void) => {
    const file = drive.files.get('created-1')!;
    const doc = JSON.parse(file.content);
    fn(doc);
    file.content = JSON.stringify(doc);
    file.version++;
  };

  // Another device renamed the DB; here the API is renamed: both survive.
  elsewhere((d) => void (d.nodes.find((n) => n.id === 'db')!.label = 'Remote DB'));
  await rename(page, 'api', 'Local API');
  await expect(page.locator('.diagram')).toContainText('Remote DB', { timeout: 8000 });
  await expect.poll(() => [labelIn(stored(drive), 'api'), labelIn(stored(drive), 'db')]).toEqual(['Local API', 'Remote DB']);

  // Both renamed the cache differently: the user chooses.
  elsewhere((d) => void (d.nodes.find((n) => n.id === 'cache')!.label = 'Theirs'));
  await rename(page, 'cache', 'Mine');
  await expect(button(page)).toHaveAttribute('data-status', 'conflict', { timeout: 8000 });
  await button(page).click();
  await expect(page.getByTestId('conflict-dialog')).toContainText('Name');
  await page.getByTestId('conflict-all-theirs').click();
  await page.getByTestId('conflict-apply').click();
  await expect(button(page)).toHaveAttribute('data-status', 'synced', { timeout: 8000 });
  await expect(page.locator('.diagram')).toContainText('Theirs');
  expect(labelIn(stored(drive), 'cache')).toBe('Theirs');
});

test('open a diagram from Drive, stop syncing, and disconnect', async ({ page }) => {
  const drive = await setup(page);
  const shared = { format: 'structlet', formatVersion: 1, id: 'shared-doc', title: 'Shared', containers: [], nodes: [{ id: 'n1', serviceId: 'server', label: 'From Drive', parentId: null, x: 0, y: 0, width: 64, height: 64, locked: false, variant: 'icon' }], edges: [], annotations: [] };
  drive.files.set('shared', { name: 'Shared.structlet', version: 3, content: JSON.stringify(shared), parents: ['folder-1'], mimeType: 'application/vnd.structlet+json' });
  await act(page, 'menu-file');
  await page.getByTestId('drive-open').click();
  await pick(page);
  await expect(page.locator('.diagram')).toContainText('From Drive');
  await expect(button(page)).toHaveAttribute('data-status', 'synced');
  // Opening wrote nothing back.
  expect(drive.files.get('shared')!.version).toBe(3);

  await button(page).click();
  await expect(page.getByTestId('drive-file')).toHaveText('Shared.structlet');
  await page.getByTestId('drive-stop').click();
  await expect(button(page)).toHaveText('Save to Drive');
  await act(page, 'menu-file');
  await page.getByTestId('drive-disconnect').click();
  await page.getByTestId('disconnect-confirm').click();
  await expect(button(page)).toHaveText('Connect Drive');
});

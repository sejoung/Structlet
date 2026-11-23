import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { act, center, drag, freshApp } from './helpers';

test('saved infrastructure details are editable in the inspector and readable in both viewers', async ({ page }) => {
  await freshApp(page);
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  const draft = {
    nodes: [
      { id: 'api', label: 'Example API', service: 'k8s.deployment', infrastructure: {
        securityGroupRules: [{ direction: 'ingress', protocol: 'tcp', peers: ['192.0.2.0/24'], fromPort: 443, toPort: 443 }],
        remoteStates: [{ address: 'data.terraform_remote_state.network', backend: 's3', outputs: ['vpc_id'] }],
        placement: { nodePools: ['compute'] },
      } },
      { id: 'pool', label: 'Compute pool', service: 'k8s.karpenter-nodepool' },
    ],
    edges: [{ from: 'api', to: 'pool', label: 'node placement', dashed: true, relationship: true }],
  };
  await picker.setFiles({ name: 'example.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(draft)) });
  const api = page.getByTestId('node-api').locator('rect').first();
  await api.click();
  const inspector = page.getByTestId('infrastructure-details');
  await expect(inspector.getByText('Inbound · tcp 443')).toBeVisible();
  await expect(inspector.getByText('192.0.2.0/24')).toBeVisible();
  await inspector.getByRole('button', { name: 'Edit details' }).click();
  const input = inspector.getByRole('textbox', { name: 'Infrastructure details' });
  await input.fill('{"remoteStates":[{"address":true}]}');
  await inspector.getByRole('button', { name: 'Apply details' }).click();
  await expect(inspector.getByRole('alert')).toContainText('remoteStates[0].address');
  await input.fill(JSON.stringify({ ...draft.nodes[0]!.infrastructure, placement: { nodePools: ['compute'], nodeGroups: ['managed'] } }));
  await inspector.getByRole('button', { name: 'Apply details' }).click();
  await expect(inspector.getByText('managed')).toBeVisible();

  const [saved] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-save')]);
  const path = (await saved.path())!;
  const [open] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await open.setFiles(path);
  const edge = page.locator('.diagram path[data-edge]');
  await expect(edge).toHaveAttribute('stroke-dasharray', '6 4');

  await page.getByTestId('tb-present').click();
  const dialog = page.getByRole('dialog', { name: 'Infrastructure details' });
  const start = await center(page, 'node-api');
  await drag(page, start, { x: start.x + 30, y: start.y });
  await expect(dialog).toHaveCount(0);
  await api.click();
  await expect(dialog.getByText('managed')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Edit details' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByTestId('exit-present').click();

  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  const iso = page.getByTestId('isometric');
  const label = iso.locator('[data-iso-label="node"][data-iso-object="api"] text').first();
  await label.click();
  await expect(dialog.getByText('vpc_id')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await label.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'View infrastructure details' }).click();
  await expect(dialog.getByText('managed')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(iso.locator('path[data-edge]')).toHaveAttribute('stroke-dasharray', '6 4');

  const [exported] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-svg')]);
  expect(readFileSync((await exported.path())!, 'utf8')).toContain('stroke-dasharray="6 4"');
});

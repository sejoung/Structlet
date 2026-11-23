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

test('imported workloads, Argo CD and node provisioning details are visible in Korean viewers', async ({ page }) => {
  await freshApp(page, 'ko');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await picker.setFiles('tests/unit/adapters/fixtures/kubernetes-infrastructure.yaml');
  const app = page.getByTestId('node-k8s-argocd-application-billing').locator('rect').first();
  await app.click();
  const inspector = page.getByTestId('infrastructure-details');
  await expect(inspector.getByText('https://charts.example.test/public')).toBeVisible();
  await expect(inspector.getByRole('heading', { name: '자동 동기화' })).toBeVisible();
  await expect(inspector.getByText('미사용', { exact: true })).toHaveCount(3);

  const [saved] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-save')]);
  const [open] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await open.setFiles((await saved.path())!);
  const dialog = page.getByRole('dialog', { name: '인프라 상세' });

  await page.getByTestId('tb-present').click();
  await app.click();
  await expect(dialog.getByText('$values/profiles/test.yaml')).toBeVisible();
  await dialog.getByRole('button', { name: '닫기' }).click();
  await page.getByTestId('node-k8s-billing-deployment-paused-api').locator('rect').first().click();
  await expect(dialog.getByText('선언된 복제본 수')).toBeVisible();
  await expect(dialog.getByText('0', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '닫기' }).click();
  await page.getByTestId('exit-present').click();

  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  const iso = page.getByTestId('isometric');
  const label = (id: string) => iso.locator(`[data-iso-label="node"][data-iso-object="${id}"] text`).first();
  await label('k8s-billing-cronjob-cleanup').click();
  await expect(dialog.getByText('30 2 * * 1-5', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Asia/Seoul')).toBeVisible();
  await dialog.getByRole('button', { name: '닫기' }).click();
  await label('k8s-cluster-nodepool-compute').click();
  await expect(dialog.getByText('512Gi')).toBeVisible();
  await expect(dialog.getByText('workload=gpu')).toBeVisible();
  await expect(dialog.getByText('WhenEmptyOrUnderutilized')).toBeVisible();
  await expect(dialog.getByText('20%')).toBeVisible();
  await expect(dialog.getByText('In arm64, amd64')).toBeVisible();
  await expect(dialog.getByText('최소 고유 값 개수')).toHaveCount(2);
  await dialog.getByRole('button', { name: '닫기' }).click();
  await label('k8s-cluster-ec2nodeclass-linux').click({ button: 'right' });
  await page.getByRole('menuitem', { name: '인프라 상세 보기' }).click();
  await expect(dialog.getByText('/dev/xvda · gp3 · 80Gi')).toBeVisible();
  await expect(dialog.getByText('snap-example')).toBeVisible();
  await expect(dialog.getByText('암호화', { exact: true })).toBeVisible();
  await expect(dialog.getByText('KarpenterNodeRole-example')).toBeVisible();
  await expect(dialog.getByText('/platform/amis/approved')).toBeVisible();
  await expect(dialog.getByText('subnet-synthetic')).toBeVisible();
  await expect(dialog.getByText('worker-*')).toBeVisible();
});

test('CloudFront cache behaviors and WAF rules are readable after saving and reopening', async ({ page }) => {
  await freshApp(page);
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-import')]);
  await picker.setFiles('tests/unit/adapters/fixtures/terraform-edge-policies.json');

  const cloudFront = page.getByTestId('node-tf-aws_cloudfront_distribution.website').locator('rect').first();
  await cloudFront.click();
  const inspector = page.getByTestId('infrastructure-details');
  await expect(inspector.getByText('website-policy')).toBeVisible();
  await expect(inspector.getByText('whitelist, Accept-Language')).toBeVisible();
  await expect(inspector.getByText('policy-unavailable')).toBeVisible();
  await expect(inspector.getByText('redirect-to-https')).toBeVisible();
  const defaultBehavior = inspector.getByRole('listitem').filter({ hasText: 'Default behavior' });
  await expect(defaultBehavior.getByText('GET, HEAD, OPTIONS', { exact: true })).toBeVisible();
  await expect(defaultBehavior.getByText('Cached HTTP methods')).toBeVisible();
  await expect(defaultBehavior.getByText('GET, HEAD', { exact: true })).toBeVisible();
  await expect(inspector.getByText('TLSv1.2_2021')).toBeVisible();

  const [saved] = await Promise.all([page.waitForEvent('download'), act(page, 'tb-save')]);
  const [open] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await open.setFiles((await saved.path())!);

  await page.getByTestId('tb-present').click();
  const dialog = page.getByRole('dialog', { name: 'Infrastructure details' });
  await cloudFront.click();
  await expect(dialog.getByText('/static/*')).toBeVisible();
  await expect(dialog.getByText('images-policy')).toBeVisible();
  const staticBehavior = dialog.getByRole('listitem').filter({ hasText: '/static/*' });
  await expect(staticBehavior.getByText('https-only')).toBeVisible();
  await expect(staticBehavior.getByText('GET, HEAD, OPTIONS', { exact: true })).toBeVisible();
  await expect(dialog.getByText('TLSv1.2_2021')).toBeVisible();
  await expect(staticBehavior.getByText('Disabled', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('exit-present').click();

  await page.locator('[data-testid="tb-view"] [data-value="isometric"]').click();
  const iso = page.getByTestId('isometric');
  await iso.locator('[data-iso-label="node"][data-iso-object="tf-aws_cloudfront_distribution.website"] text').first().click();
  await expect(dialog.getByText('TLSv1.2_2021')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await iso.locator('[data-iso-label="node"][data-iso-object="tf-aws_wafv2_web_acl.website"] text').first().click();
  await expect(dialog.getByText('managed-baseline')).toBeVisible();
  await expect(dialog.getByText('Scope-down conditions')).toBeVisible();
  await expect(dialog.getByText('KR, JP')).toBeVisible();
  await expect(dialog.getByText('192.0.2.0/24, 198.51.100.4/32')).toBeVisible();
  await expect(dialog.getByText('website-acl-metrics')).toBeVisible();
  await expect(dialog.getByText('rate-metrics')).toBeVisible();
});

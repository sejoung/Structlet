import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { act, freshApp, openManual } from './helpers';

test('manual provides a Korean prompt and portable skill and turns an AI draft into an openable diagram', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await freshApp(page, 'ko');
  const guide = await openManual(page);
  await guide.getByRole('radio', { name: 'AI로 구성도 만들기' }).click();

  await guide.getByRole('button', { name: '프롬프트 복사' }).click();
  await expect(guide.getByText('프롬프트를 복사했습니다.')).toBeVisible();
  const copied = await guide.evaluate(() => navigator.clipboard.readText());
  const [prompt] = await Promise.all([
    guide.waitForEvent('download'), guide.getByRole('button', { name: '프롬프트 다운로드 (.md)' }).click(),
  ]);
  expect(prompt.suggestedFilename()).toBe('structlet-prompt-ko.md');
  expect(readFileSync((await prompt.path())!, 'utf8')).toBe(copied);

  const [skill] = await Promise.all([
    guide.waitForEvent('download'), guide.getByRole('button', { name: 'Structlet 스킬 다운로드 (.zip)' }).click(),
  ]);
  expect(skill.suggestedFilename()).toBe('structlet-skill.zip');
  const entries = unzipSync(readFileSync((await skill.path())!));
  expect(entries['structlet/scripts/compile.mjs']).toBeDefined();
  expect(strFromU8(entries['structlet/references/prompt-ko.md']!)).toBe(copied);

  const input = guide.getByLabel('AI 초안 JSON');
  const convert = guide.getByRole('button', { name: '.structlet 다운로드', exact: true });
  await input.fill(JSON.stringify({ edges: [{ from: 'api', to: 'unknown' }] }));
  await convert.click();
  await expect(guide.getByRole('alert')).toContainText('unknown');

  const example = copied.match(/\x60{3}json\n[\s\S]*?\n\x60{3}/)![0];
  await input.fill(example);
  const [diagram] = await Promise.all([guide.waitForEvent('download'), convert.click()]);
  expect(diagram.suggestedFilename()).toBe('주문 API.structlet');
  await guide.close();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), act(page, 'tb-open')]);
  await chooser.setFiles((await diagram.path())!);
  await expect(page.getByTestId('node-api')).toBeVisible();
  await expect(page.locator('.diagram [data-node="api"] [data-node-specs]')).toContainText('2 vCPU · 2 GiB RAM');
});

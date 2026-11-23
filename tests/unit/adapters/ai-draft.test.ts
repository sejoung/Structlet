import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, it } from 'vitest';
import { buildStructletSkill } from '../../../scripts/structlet-skill';
import { createAppearance, findService } from '../../../src/adapters/catalog/services';
import { compileDraft } from '../../../src/adapters/draft/compile';
import { parseStructlet } from '../../../src/adapters/format/structlet-format';
import { emptyDocument, worldRect } from '../../../src/domain';
import { computeScene, containsRect, intersects } from '../../../src/engine';

const prompts = new URL('../../../samples/ai/structlet/references/', import.meta.url);

it.each(['en', 'ko'])('compiles the %s prompt example into a grouped .structlet document', (language) => {
  const prompt = readFileSync(new URL(`prompt-${language}.md`, prompts), 'utf8');
  const example = prompt.match(/\x60{3}json\n[\s\S]*?\n\x60{3}/);
  expect(example).not.toBeNull();
  const result = compileDraft(example![0], emptyDocument('ai', 'AI'));
  expect(result.ok, result.ok ? '' : result.errors.join(', ')).toBe(true);
  if (!result.ok) return;
  expect(parseStructlet(result.text)).toEqual({ ok: true, document: result.document });
  const { document } = result;
  const api = document.nodes.find(({ id }) => id === 'api')!;
  expect(api.specs).toMatchObject({ vcpus: 2, memoryGiB: 2, showDetails: true });
  expect(document.nodes.every(({ serviceId }) => !!findService(serviceId))).toBe(true);
  expect(containsRect(worldRect(document, document.containers[0]!), worldRect(document, api))).toBe(true);
});

it('rejects an empty AI draft and invalid references', () => {
  const base = emptyDocument('ai', 'AI');
  expect(compileDraft('{}', base).ok).toBe(false);
  const invalid = compileDraft(JSON.stringify({ nodes: [{ id: 'api' }], edges: [{ from: 'api', to: 'missing' }] }), base);
  expect(invalid.ok ? [] : invalid.errors).toEqual(expect.arrayContaining([expect.stringContaining('missing')]));
  expect(base.nodes).toHaveLength(0);
});

it('runs the standalone skill compiler in another directory and keeps the original file during updates', async () => {
  const files = unzipSync(await buildStructletSkill());
  expect(strFromU8(files['structlet/SKILL.md']!)).toContain('name: structlet');
  const catalog = strFromU8(files['structlet/references/services.tsv']!);
  expect(catalog).toContain('aws.ec2\tAmazon EC2');
  expect(catalog).toContain('aws.vpc-endpoint\tVPC endpoint');
  expect(files['structlet/references/prompt-ko.md']).toBeDefined();
  const dir = mkdtempSync(join(tmpdir(), 'structlet-compile-'));
  try {
    const script = join(dir, 'compile.mjs');
    writeFileSync(script, files['structlet/scripts/compile.mjs']!);
    const run = (...params: string[]) => spawnSync(process.execPath, [script, ...params], { cwd: dir, encoding: 'utf8' });
    const input = join(dir, 'architecture.draft.json');
    const draft = JSON.parse(readFileSync(new URL('../../../samples/draft-example.json', import.meta.url), 'utf8'));
    const text = '연결이 지연되면 관측 자료는 보관 영역에서 다시 읽습니다.\n'.repeat(8);
    draft.annotations.push(
      { id: 'detail', kind: 'text', text, target: 'api' },
      { id: 'report', kind: 'text', text, target: 'api' },
      { id: 'boundary', kind: 'text', text, target: 'private' },
      { id: 'footer', kind: 'text', text },
      { id: 'fixed', kind: 'text', text: 'Manually positioned', x: -120, y: -80 },
    );
    writeFileSync(input, JSON.stringify(draft));
    const built = run('architecture.draft.json');
    expect(built.status, built.stderr).toBe(0);
    expect(built.stdout.trim()).toBe('architecture.structlet');
    const output = join(dir, 'architecture.structlet');
    const before = readFileSync(output, 'utf8');
    const original = parseStructlet(before);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    expect(original.document.annotations.find(({ id }) => id === 'fixed')).toMatchObject({ x: -120, y: -80 });
    const scene = computeScene(original.document, createAppearance('en'));
    const nodeBounds = scene.nodes.flatMap(({ rect, labelBox, specCaption }) => [rect, ...(labelBox ? [labelBox] : []), ...(specCaption ? [specCaption.box] : [])]);
    for (const note of scene.annotations.filter(({ kind }) => kind !== 'step')) {
      expect(nodeBounds.every((rect) => !intersects(note.rect, rect)), note.id).toBe(true);
      expect(scene.annotations.every((other) => other === note || !intersects(note.rect, other.rect)), note.id).toBe(true);
    }

    writeFileSync(join(dir, 'update.json'), JSON.stringify({ nodes: [{ id: 'api', label: 'Updated API' }] }));
    const edit = run('update.json', 'revised.structlet', '--base', 'architecture.structlet');
    expect(edit.status, edit.stderr).toBe(0);
    const revised = parseStructlet(readFileSync(join(dir, 'revised.structlet'), 'utf8'));
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    const oldApi = original.document.nodes.find(({ id }) => id === 'api')!;
    expect(revised.document.nodes.find(({ id }) => id === 'api')).toEqual({ ...oldApi, label: 'Updated API' });
    expect(revised.document.annotations).toEqual(original.document.annotations);

    expect(run('update.json', 'architecture.structlet', '--base', 'architecture.structlet').status).toBe(1);
    expect(readFileSync(output, 'utf8')).toBe(before);
    writeFileSync(join(dir, 'invalid.json'), JSON.stringify({ edges: [{ from: 'api', to: 'missing' }] }));
    expect(run('invalid.json', 'invalid.structlet').status).toBe(1);
    expect(existsSync(join(dir, 'invalid.structlet'))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

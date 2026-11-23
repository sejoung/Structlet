import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function lintFiles(fixtures: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'structlet-lint-'));
  try {
    const paths = Object.entries(fixtures).map(([name, text]) => {
      const path = join(directory, name);
      writeFileSync(path, text);
      return path;
    });
    return spawnSync(process.execPath, ['scripts/check-comments.mjs', ...paths], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('source comment lint', () => {
  it('rejects source comments with their file and line numbers', () => {
    const result = lintFiles({
      'code.tsx': 'const value = 1; // trailing\nconst view = <div>{/* hidden */}</div>;\n',
      'styles.css': 'body { margin: 0; }\n/* styles */\n',
      'index.html': '<main>Read me</main>\n<!-- note -->\n',
      'workflow.yml': 'name: Build # explanation\n',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('code.tsx:1: source comments are not allowed');
    expect(result.stderr).toContain('code.tsx:2: source comments are not allowed');
    expect(result.stderr).toContain('styles.css:2: source comments are not allowed');
    expect(result.stderr).toContain('index.html:2: source comments are not allowed');
    expect(result.stderr).toContain('workflow.yml:1: source comments are not allowed');
  });

  it('allows comment-like text in URLs, JSX strings, regular expressions and config values', () => {
    const result = lintFiles({
      'code.tsx': 'const link = "https://example.test";\nconst re = /\\/\\*/;\nconst view = <div>{"/* literal */"}</div>;\n',
      'styles.css': '.badge::before { content: "/* literal */"; }\n',
      'workflow.yml': 'name: "Build # literal"\nrun: |\n  echo "# literal"\n',
    });
    expect(result.status, result.stderr).toBe(0);
  });
});

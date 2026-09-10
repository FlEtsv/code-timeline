import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cobertura } from '../lib/coverage.mjs';

test('la guardia enumera cambios sin entrada e ignora su propio almacén', () => {
  const repo = mkdtempSync(join(tmpdir(), 'ct-coverage-'));
  execFileSync('git', ['init'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  writeFileSync(join(repo, 'a.js'), 'const a = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'base'], { cwd: repo });
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\n');
  writeFileSync(join(repo, 'b.js'), 'const b = 1;\n');
  mkdirSync(join(repo, '.code-timeline'));
  writeFileSync(join(repo, '.code-timeline', 'index.json'), '{}');
  const changes = [{ date: new Date(Date.now() + 1000).toISOString(), status: 'change', files: [{ file: 'a.js', after: 'const a = 2;' }] }];
  const result = cobertura({ repoPath: repo }, changes);
  assert.equal(result.completa, false);
  assert.deepEqual(result.archivosSinEntrada, ['b.js']);
  writeFileSync(join(repo, 'a.js'), 'const a = 2;\nconst nuevo = true;\n');
  assert.deepEqual(cobertura({ repoPath: repo }, changes).archivosSinEntrada.sort(), ['a.js', 'b.js']);
  rmSync(repo, { recursive: true, force: true });
});

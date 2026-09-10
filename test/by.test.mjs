import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = mkdtempSync(join(root, '.by-test-'));
process.env.CODE_TIMELINE_DATA = join(fixture, 'data');
const { createProject, addChange, listChanges, resumirCambio } = await import('../lib/store.mjs');
const { renderMarkdown } = await import('../lib/markdown.mjs');

test.after(() => {
  assert.ok(resolve(fixture).startsWith(resolve(root)));
  rmSync(fixture, { recursive: true, force: true });
});

function repoLab(nombre, { autor } = {}) {
  const repo = join(fixture, nombre);
  mkdirSync(repo, { recursive: true });
  const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
  git('init', '-b', 'main');
  if (autor !== null) {
    git('config', 'user.name', autor ? autor.split(' <')[0] : 'Lab Dev');
    git('config', 'user.email', autor ? autor.match(/<(.+)>/)[1] : 'lab@example.test');
  }
  writeFileSync(join(repo, 'a.txt'), 'antes\n');
  git('add', '.');
  execFileSync('git', ['commit', '-m', 'seed'], { cwd: repo, stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'S', GIT_AUTHOR_EMAIL: 's@s', GIT_COMMITTER_NAME: 'S', GIT_COMMITTER_EMAIL: 's@s' } });
  return repo;
}

test('sin "by", la entrada toma la identidad git del repo', () => {
  const repo = repoLab('r1', { autor: 'Ana Pérez <ana@equipo.dev>' });
  const p = createProject({ name: 'r1', repoPath: repo });
  writeFileSync(join(repo, 'a.txt'), 'despues\n');
  const c = addChange(p.id, { title: 'X', explanation: 'Y', files: [{ file: 'a.txt' }] });
  assert.equal(c.by, 'Ana Pérez <ana@equipo.dev>');
  assert.equal(c.branch, 'main');
  assert.ok(c.baseSha && c.baseSha.length >= 7);
  assert.ok(c.updatedAt);
});

test('"by" explícito manda sobre el git config', () => {
  const repo = repoLab('r2', { autor: 'Ana <ana@x.dev>' });
  const p = createProject({ name: 'r2', repoPath: repo });
  writeFileSync(join(repo, 'a.txt'), 'z\n');
  const c = addChange(p.id, { title: 'X', explanation: 'Y', by: 'Bot CI <ci@x.dev>', files: [{ file: 'a.txt' }] });
  assert.equal(c.by, 'Bot CI <ci@x.dev>');
});

test('repo sin identidad git: "by" queda vacío, no revienta', () => {
  const repo = repoLab('r3', { autor: null });
  const p = createProject({ name: 'r3', repoPath: repo });
  writeFileSync(join(repo, 'a.txt'), 'q\n');
  const c = addChange(p.id, { title: 'X', explanation: 'Y', files: [{ file: 'a.txt' }] });
  assert.equal(c.by, '');
});

test('el resumen y el export markdown llevan by y rama', () => {
  const repo = repoLab('r4', { autor: 'Cé <ce@x.dev>' });
  const p = createProject({ name: 'Proyecto R4', repoPath: repo });
  writeFileSync(join(repo, 'a.txt'), 'w\n');
  addChange(p.id, { title: 'Título', explanation: 'Motivo', files: [{ file: 'a.txt' }] });

  const [entrada] = listChanges(p.id);
  const resumen = resumirCambio(entrada);
  assert.equal(resumen.by, 'Cé <ce@x.dev>');
  assert.equal(resumen.branch, 'main');

  const md = renderMarkdown({ name: 'Proyecto R4' }, listChanges(p.id));
  assert.match(md, /por Cé <ce@x\.dev>/);
  assert.match(md, /rama `main`/);
});

test('normalize de una entrada vieja (sin by/branch/updatedAt) no rompe', () => {
  const repo = repoLab('r5');
  const p = createProject({ name: 'r5', repoPath: repo });
  const changesPath = join(process.env.CODE_TIMELINE_DATA, 'projects', p.id, 'changes.json');
  writeFileSync(changesPath, JSON.stringify({ changes: [{
    id: 'vieja-1', status: 'change', date: '2020-01-01T00:00:00Z', title: 'Antigua',
    explanation: 'De antes de esta feature', files: [{ file: 'a.txt', after: 'x' }],
    relation: { type: 'start', note: '' },
  }] }));
  const [c] = listChanges(p.id);
  assert.equal(c.by, '');
  assert.equal(c.branch, '');
  assert.equal(c.updatedAt, '2020-01-01T00:00:00Z');
});

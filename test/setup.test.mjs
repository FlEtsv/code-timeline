import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const data = mkdtempSync(join(tmpdir(), 'ct-setup-data-'));
process.env.CODE_TIMELINE_DATA = data;
const { setup } = await import('../lib/setup.mjs');

test('setup instala, vincula y deja instrucciones y guardia de Claude de forma idempotente', () => {
  const repo = mkdtempSync(join(tmpdir(), 'ct-setup-repo-'));
  mkdirSync(join(repo, '.git', 'hooks'), { recursive: true });
  const fake = () => ({ instalados: ['Claude Code', 'Codex'], errores: [], server: '/server.mjs' });
  const uno = setup({ repoPath: repo, agente: 'ambos', versionado: true, instalarFn: fake });
  const dos = setup({ repoPath: repo, agente: 'ambos', versionado: true, instalarFn: fake });
  assert.equal(uno.project.id, dos.project.id);
  assert.equal(uno.project.storageMode, 'versioned');
  assert.equal((readFileSync(join(repo, 'AGENTS.md'), 'utf8').match(/code-timeline:inicio/g) || []).length, 1);
  assert.match(readFileSync(join(repo, 'CLAUDE.md'), 'utf8'), /archivosSinEntrada/);
  const settings = JSON.parse(readFileSync(join(repo, '.claude', 'settings.local.json'), 'utf8'));
  assert.equal(settings.hooks.Stop.length, 1);
  assert.match(settings.hooks.Stop[0].hooks[0].command, / guard /);
  assert.match(readFileSync(join(repo, '.git', 'hooks', 'pre-commit'), 'utf8'), /guard --repo/);
  rmSync(repo, { recursive: true, force: true });
});

test('setup recupera un historial versionado al configurar un clon nuevo', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'ct-setup-clone-'));
  mkdirSync(join(repo, '.code-timeline', 'entries'), { recursive: true });
  const change = { id: 'c1', date: '2026-01-01T00:00:00Z', status: 'change', title: 'Importado', explanation: 'Motivo', files: [] };
  writeFileSync(join(repo, '.code-timeline', 'entries', 'c1.json'), JSON.stringify({ format: 'code-timeline/entry-v2', change }));
  writeFileSync(join(repo, '.code-timeline', 'index.json'), JSON.stringify({
    format: 'code-timeline/versioned-v2', project: { name: 'Clon' }, entries: [{ id: 'c1', path: 'entries/c1.json' }],
  }));
  const fake = () => ({ instalados: [], errores: [], server: '/server.mjs' });
  const result = setup({ repoPath: repo, agente: 'codex', instalarFn: fake });
  const store = await import('../lib/store.mjs');
  assert.equal(store.listChanges(result.project.id)[0].title, 'Importado');
  assert.equal(result.project.storageMode, 'versioned');
  rmSync(repo, { recursive: true, force: true });
});

test.after(() => rmSync(data, { recursive: true, force: true }));

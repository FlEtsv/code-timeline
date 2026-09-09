import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = mkdtempSync(join(root, '.sync-test-'));
process.env.CODE_TIMELINE_DATA = join(fixture, 'data');
const { createProject, addChange, syncReport } = await import('../lib/store.mjs');
const { cambiosSinRegistrar } = await import('../lib/git.mjs');

test('sync: huecos conocidos, CLI y MCP equivalentes y solo lectura', async (t) => {
  t.after(() => {
    assert.ok(resolve(fixture).startsWith(resolve(root)));
    rmSync(fixture, { recursive: true, force: true });
  });
  const repo = join(fixture, 'repo con espacios');
  mkdirSync(repo);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  const commit = (date) => {
    git('add', '.');
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo, stdio: 'pipe',
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  };
  writeFileSync(join(repo, 'viejo.txt'), 'viejo\n');
  writeFileSync(join(repo, 'cubierto.txt'), 'antes\n');
  commit('2020-01-01T00:00:00Z');
  const project = createProject({ name: 'sync', repoPath: repo });
  writeFileSync(join(repo, 'cubierto.txt'), 'despues\n');
  addChange(project.id, { date: '2020-01-02T00:00:00Z', title: 'Registrado', explanation: 'Fixture',
    files: [{ file: 'cubierto.txt', before: 'antes', after: 'despues' }] });
  writeFileSync(join(repo, 'omitido.txt'), 'sin entrada\n');
  commit('2020-01-03T00:00:00Z');
  writeFileSync(join(repo, 'viejo.txt'), 'local\n');
  git('add', 'viejo.txt');
  writeFileSync(join(repo, 'nuevo ñ.txt'), 'nuevo\n');
  const snapshot = (dir) => Object.fromEntries(readdirSync(dir, { withFileTypes: true }).map((e) =>
    [e.name, e.isDirectory() ? snapshot(join(dir, e.name)) : readFileSync(join(dir, e.name)).toString('base64')]));
  const before = snapshot(process.env.CODE_TIMELINE_DATA);
  const report = syncReport(project.id);
  assert.equal(report.message, '3 cambios sin registrar');
  assert.deepEqual(report.gaps.map((g) => g.file).sort(), ['nuevo ñ.txt', 'omitido.txt', 'viejo.txt'].sort());
  assert.ok(report.gaps.every((g) => g.reason && !g.reason.includes('\n')));
  const cli = execFileSync(process.execPath, [join(root, 'bin/cli.mjs'), 'sync'], { cwd: repo, encoding: 'utf8' });
  assert.ok(cli.includes(report.message));
  for (const gap of report.gaps) assert.ok(cli.includes(`${JSON.stringify(gap.file)}: ${gap.reason}`));
  const client = new Client({ name: 'sync-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'server.mjs')],
    env: { ...process.env }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'sync_report', arguments: { projectId: repo } });
    assert.deepEqual(result.structuredContent, report);
    assert.deepEqual(JSON.parse(result.content[0].text), report);
  } finally { await client.close(); }
  assert.deepEqual(snapshot(process.env.CODE_TIMELINE_DATA), before);
  const changesPath = join(process.env.CODE_TIMELINE_DATA, 'projects', project.id, 'changes.json');
  const saved = readFileSync(changesPath);
  writeFileSync(`${changesPath}.bak`, saved);
  writeFileSync(changesPath, '{broken');
  const corrupt = snapshot(process.env.CODE_TIMELINE_DATA);
  assert.deepEqual(syncReport(project.id), report);
  assert.deepEqual(snapshot(process.env.CODE_TIMELINE_DATA), corrupt);
  writeFileSync(changesPath, saved);
  const propuesta = { status: 'proposal', date: '2030-01-01T00:00:00Z', files: [{ file: 'nuevo ñ.txt', after: 'nuevo\n' }] };
  assert.ok(cambiosSinRegistrar(repo, [propuesta]).gaps.some((g) => g.file === 'nuevo ñ.txt'));
  writeFileSync(join(repo, 'cubierto.txt'), 'cambio posterior\n');
  assert.ok(syncReport(project.id).gaps.some((g) => g.file === 'cubierto.txt'));
  assert.ok(cambiosSinRegistrar(repo, []).gaps.some((g) => g.file === 'cubierto.txt'));
  const empty = join(fixture, 'empty');
  mkdirSync(empty);
  execFileSync('git', ['init'], { cwd: empty, stdio: 'pipe' });
  assert.equal(cambiosSinRegistrar(empty, []).count, 0);
  writeFileSync(join(empty, 'first.txt'), 'first');
  assert.equal(cambiosSinRegistrar(empty, []).count, 1);
  assert.match(execFileSync(process.execPath, [join(root, 'bin/cli.mjs'), '--help'], { encoding: 'utf8' }), /sync \[/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const CLI = join(root, 'bin/cli.mjs');
const DRIVER = join(root, 'bin/merge-changes.mjs');
const fixture = mkdtempSync(join(root, '.team-test-'));
process.env.CODE_TIMELINE_DATA = join(fixture, 'data');
const { createProject, addChange, projectDataDir, esDeEquipo } = await import('../lib/store.mjs');

test.after(() => {
  assert.ok(resolve(fixture).startsWith(resolve(root)));
  rmSync(fixture, { recursive: true, force: true });
});

const G = (dir, ...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe',
  env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' } });

test('merge driver: unión por id, y en colisión gana updatedAt más reciente', () => {
  const d = join(fixture, 'md'); mkdirSync(d);
  const ent = (id, updatedAt, title) => ({ id, status: 'change', date: '2024-01-01T00:00:00Z', updatedAt, title,
    explanation: 'x', files: [{ file: 'a', after: 'x' }], relation: { type: 'start', note: '' } });

  writeFileSync(join(d, 'O.json'), JSON.stringify({ changes: [ent('1', '2024-01-01T00:00:00Z', 'base')] }));
  writeFileSync(join(d, 'A.json'), JSON.stringify({ changes: [
    ent('1', '2024-03-10T00:00:00Z', 'MÍA nueva'),   // colisión: la mía es más reciente
    ent('2', '2024-02-01T00:00:00Z', 'solo mía'),
  ] }));
  writeFileSync(join(d, 'B.json'), JSON.stringify({ changes: [
    ent('1', '2024-02-01T00:00:00Z', 'suya vieja'),
    ent('3', '2024-02-05T00:00:00Z', 'solo suya'),
  ] }));

  execFileSync(process.execPath, [DRIVER, join(d, 'O.json'), join(d, 'A.json'), join(d, 'B.json'), 'changes.json']);
  const res = JSON.parse(readFileSync(join(d, 'A.json'), 'utf8')).changes;
  assert.deepEqual(res.map((c) => c.id).sort(), ['1', '2', '3']);      // las tres, sin perder ninguna
  assert.equal(res.find((c) => c.id === '1').title, 'MÍA nueva');       // gana la más reciente
});

test('team init deja el dir de datos como repo git con el driver configurado', () => {
  const p = createProject({ name: 'ti', repoPath: join(fixture, 'repo-ti') });
  mkdirSync(join(fixture, 'repo-ti'), { recursive: true });
  const bare = join(fixture, 'remoto-ti.git');
  execFileSync('git', ['init', '--bare', bare], { stdio: 'pipe' });

  const out = execFileSync(process.execPath, [CLI, 'team', 'init', p.id, '--url', bare], { encoding: 'utf8' });
  assert.match(out, /es ahora el repo del timeline/);
  assert.ok(esDeEquipo(p.id));
  const dir = projectDataDir(p.id);
  assert.ok(existsSync(join(dir, '.gitattributes')));
  assert.match(readFileSync(join(dir, '.gitattributes'), 'utf8'), /changes\.json merge=code-timeline/);
  assert.match(G(dir, 'config', 'merge.code-timeline.driver').toString(), /merge-changes\.mjs/);
});

test('round-trip: dos personas, entradas divergentes, ninguna se pierde', () => {
  // "Persona A" = este proceso. Vincula, registra una entrada, empuja.
  const repoA = join(fixture, 'repo-rt'); mkdirSync(repoA);
  execFileSync('git', ['init', repoA], { stdio: 'pipe' });
  execFileSync('git', ['-C', repoA, 'config', 'user.email', 'a@a'], { stdio: 'pipe' });
  execFileSync('git', ['-C', repoA, 'config', 'user.name', 'A'], { stdio: 'pipe' });
  writeFileSync(join(repoA, 'f.txt'), '1\n');
  G(repoA, 'add', '-A'); G(repoA, 'commit', '-m', 'seed');
  const p = createProject({ name: 'rt', repoPath: repoA });
  addChange(p.id, { title: 'De A', explanation: 'x', files: [{ file: 'f.txt', before: '1\n', after: '1\n' }] });

  const bare = join(fixture, 'remoto-rt.git');
  execFileSync('git', ['init', '--bare', bare], { stdio: 'pipe' });
  execFileSync(process.execPath, [CLI, 'team', 'init', p.id, '--url', bare], { encoding: 'utf8' });
  execFileSync(process.execPath, [CLI, 'team', 'push', p.id], { encoding: 'utf8' });

  // "Persona B" = un clon del repo del timeline, que añade otra entrada a mano
  const dirB = join(fixture, 'clonB');
  execFileSync('git', ['clone', bare, dirB], { stdio: 'pipe' });
  execFileSync('git', ['-C', dirB, 'config', 'user.email', 'b@b'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dirB, 'config', 'user.name', 'B'], { stdio: 'pipe' });
  execFileSync('git', ['-C', dirB, 'config', 'merge.code-timeline.driver', `node "${DRIVER}" %O %A %B %P`], { stdio: 'pipe' });
  const cf = join(dirB, 'changes.json');
  const doc = JSON.parse(readFileSync(cf, 'utf8'));
  doc.changes.push({ id: 'de-b', status: 'change', date: '2024-05-01T00:00:00Z', updatedAt: '2024-05-01T00:00:00Z',
    title: 'De B', explanation: 'y', files: [{ file: 'f.txt', after: '1\n' }], relation: { type: 'continuation', note: '' } });
  writeFileSync(cf, JSON.stringify(doc, null, 2));
  G(dirB, 'add', '-A'); G(dirB, 'commit', '-m', 'de B'); G(dirB, 'push', 'origin', 'HEAD');

  // A hace pull: el merge driver une las dos entradas
  execFileSync(process.execPath, [CLI, 'team', 'pull', p.id], { encoding: 'utf8' });
  const finales = JSON.parse(readFileSync(join(projectDataDir(p.id), 'changes.json'), 'utf8')).changes;
  const titulos = finales.map((c) => c.title).sort();
  assert.deepEqual(titulos, ['De A', 'De B'], 'las dos entradas presentes tras el merge');
});

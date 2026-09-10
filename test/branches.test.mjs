import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = mkdtempSync(join(root, '.branches-test-'));
process.env.CODE_TIMELINE_DATA = join(fixture, 'data');
const { createProject, addChange, branchReport, syncReport, estadosDeRama } = await import('../lib/store.mjs');
const { ramas, estadoDeRamaEntrada, commitsDeRama } = await import('../lib/git.mjs');

test.after(() => {
  assert.ok(resolve(fixture).startsWith(resolve(root)));
  rmSync(fixture, { recursive: true, force: true });
});

// Un repo de laboratorio con: main + una rama fusionada + una rama viva por
// delante. Uno nuevo por test (git no deja re-init limpio en el mismo sitio).
let n = 0;
function repo() {
  const dir = join(fixture, `repo-${++n}`);
  mkdirSync(dir);
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'S', GIT_AUTHOR_EMAIL: 's@s', GIT_COMMITTER_NAME: 'S', GIT_COMMITTER_EMAIL: 's@s',
      GIT_AUTHOR_DATE: '2021-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2021-01-01T00:00:00Z' } });
  g('init', '-b', 'main');
  g('config', 'user.name', 'Lab');
  g('config', 'user.email', 'lab@x.dev');
  writeFileSync(join(dir, 'base.txt'), 'base\n'); g('add', '.'); g('commit', '-m', 'base');

  // rama fusionada: hace un commit y se integra en main; luego se borra
  g('checkout', '-b', 'feat/fusionada');
  writeFileSync(join(dir, 'f.txt'), 'f\n'); g('add', '.'); g('commit', '-m', 'en fusionada');
  const shaFusionada = g('rev-parse', 'HEAD').toString().trim();
  g('checkout', 'main'); g('merge', '--no-ff', 'feat/fusionada', '-m', 'merge fusionada');
  g('branch', '-D', 'feat/fusionada');

  // rama viva: dos commits por delante de main, sin fusionar
  g('checkout', '-b', 'feat/viva');
  writeFileSync(join(dir, 'v.txt'), 'v1\n'); g('add', '.'); g('commit', '-m', 'viva 1');
  writeFileSync(join(dir, 'v.txt'), 'v2\n'); g('add', '.'); g('commit', '-m', 'viva 2');
  g('checkout', 'main');
  return { dir, shaFusionada };
}

test('ramas(): adelante/atrás y merged', () => {
  const { dir } = repo();
  const lista = ramas(dir, { principal: 'main' });
  const viva = lista.find((r) => r.nombre === 'feat/viva');
  assert.ok(viva, 'debe listar feat/viva');
  assert.equal(viva.adelante, 2);
  assert.equal(viva.atras, 0);
  assert.equal(viva.fusionada, false);
  // main y origin/HEAD no salen; feat/fusionada ya no existe
  assert.ok(!lista.some((r) => r.nombre === 'main'));
});

test('branchReport(): entradas por rama y commits sin registrar', () => {
  const { dir } = repo();
  const p = createProject({ name: 'br', repoPath: dir });
  // una entrada anclada a feat/viva (simulada: se registra el estado y luego se fija branch)
  execFileSync('git', ['checkout', 'feat/viva'], { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'v.txt'), 'v3\n');
  addChange(p.id, { title: 'Cambio en viva', explanation: 'Motivo', files: [{ file: 'v.txt', before: 'v2\n', after: 'v3\n' }] });
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'v3'], { cwd: dir, stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'S', GIT_AUTHOR_EMAIL: 's@s', GIT_COMMITTER_NAME: 'S', GIT_COMMITTER_EMAIL: 's@s' } });
  execFileSync('git', ['checkout', 'main'], { cwd: dir, stdio: 'pipe' });

  const rep = branchReport(p.id);
  assert.equal(rep.principal, 'main');
  const viva = rep.ramas.find((r) => r.nombre === 'feat/viva');
  assert.equal(viva.entradas, 1, 'la entrada se cuenta en su rama');
  // feat/viva tiene commits que no están registrados (viva 1, viva 2 y el v3 posterior)
  assert.ok(viva.sinRegistrar >= 1, `esperaba huecos en feat/viva, dio ${viva.sinRegistrar}`);
});

test('sync --branch acota a los commits de esa rama', () => {
  const { dir } = repo();
  const p = createProject({ name: 'sb', repoPath: dir });
  const enViva = syncReport(p.id, { branch: 'feat/viva' });
  assert.equal(enViva.branch, 'feat/viva');
  assert.ok(enViva.gaps.some((g) => g.file === 'v.txt'));
  // en main (HEAD) v.txt no aparece: no está en main
  const enMain = syncReport(p.id);
  assert.ok(!enMain.gaps.some((g) => g.file === 'v.txt'));
});

test('estadoDeRamaEntrada(): viva / fusionada / huérfana', () => {
  const { dir, shaFusionada } = repo();
  assert.equal(estadoDeRamaEntrada(dir, { branch: 'feat/viva', baseSha: 'x' }).estado, 'viva');
  const fus = estadoDeRamaEntrada(dir, { branch: 'feat/fusionada', baseSha: shaFusionada });
  assert.equal(fus.estado, 'fusionada');
  assert.ok(fus.enCommit, 'debe decir por qué commit entró');
  const huerf = estadoDeRamaEntrada(dir, { branch: 'feat/borrada-sin-merge', baseSha: '0'.repeat(40) });
  assert.equal(huerf.estado, 'huerfana');
  assert.equal(estadoDeRamaEntrada(dir, { branch: '' }).estado, 'sin-rama');
});

test('estadosDeRama() devuelve un estado por entrada', () => {
  const { dir } = repo();
  const p = createProject({ name: 'ed', repoPath: dir });
  writeFileSync(join(dir, 'base.txt'), 'base2\n');
  addChange(p.id, { title: 'En main', explanation: 'M', files: [{ file: 'base.txt', before: 'base\n', after: 'base2\n' }] });
  const estados = estadosDeRama(p.id);
  const ids = Object.keys(estados);
  assert.equal(ids.length, 1);
  assert.equal(estados[ids[0]].estado, 'viva'); // registrada en main, que existe
});

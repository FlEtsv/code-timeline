import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'ct-pruebas-'));
process.env.CODE_TIMELINE_DATA = DATA;
const store = await import('../lib/store.mjs');

const FILES = [{ file: 'src/a.js', after: 'const a = 1;' }];
let p;

beforeEach(() => {
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  p = store.createProject({ name: 'Pruebas', repoPath: '/tmp/repo' });
});

const nuevo = () => store.addChange(p.id, { title: 't', explanation: 'e', files: FILES });

test('un cambio nace sin probar', () => {
  assert.equal(nuevo().test.status, 'untested');
});

test('probar y revisar son cosas distintas', () => {
  const c = nuevo();
  store.updateChange(p.id, c.id, { verified: true });
  const [leido] = store.listChanges(p.id);
  assert.equal(leido.verified, true);
  assert.equal(leido.test.status, 'untested', 'revisar no implica probar');
});

test('una prueba automática exige el comando que la repite', () => {
  const c = nuevo();
  assert.throws(() => store.setTest(p.id, c.id, { status: 'auto' }), /comando/);
  const out = store.setTest(p.id, c.id, { status: 'auto', command: 'npm test' });
  assert.equal(out.test.status, 'auto');
  assert.equal(out.test.command, 'npm test');
  assert.ok(out.test.at);
});

test('se puede registrar que la prueba falla', () => {
  // Un historial donde solo cabe lo que funciona miente por omisión.
  const c = nuevo();
  const out = store.setTest(p.id, c.id, { status: 'failing', note: 'peta con sku vacío' });
  assert.equal(out.test.status, 'failing');
  assert.equal(out.test.note, 'peta con sku vacío');
});

test('un status inventado se rechaza', () => {
  const c = nuevo();
  assert.throws(() => store.setTest(p.id, c.id, { status: 'más o menos' }), /status debe ser/);
});

test('actualizar solo un campo conserva los demás', () => {
  const c = nuevo();
  store.setTest(p.id, c.id, { status: 'auto', command: 'npm test', note: 'cubre el caso vacío' });
  const out = store.setTest(p.id, c.id, { status: 'failing' });
  assert.equal(out.test.command, 'npm test');
  assert.equal(out.test.note, 'cubre el caso vacío');
});

test('los contadores distinguen probados de los que fallan', () => {
  const a = nuevo(); const b = nuevo(); const c = nuevo();
  store.setTest(p.id, a.id, { status: 'auto', command: 'npm test' });
  store.setTest(p.id, b.id, { status: 'manual', note: 'a mano' });
  store.setTest(p.id, c.id, { status: 'failing' });
  const proj = store.listProjects().find((x) => x.id === p.id);
  assert.equal(proj.testedCount, 2, 'las que fallan no cuentan como probadas');
  assert.equal(proj.failingCount, 1);
});

test('una entrada antigua sin campo test se lee como sin probar', () => {
  writeFileSync(join(DATA, 'projects', p.id, 'changes.json'), JSON.stringify({
    changes: [{ id: 'viejo', title: 't', explanation: 'e', files: FILES }],
  }));
  assert.equal(store.listChanges(p.id)[0].test.status, 'untested');
});

test('la prueba sobrevive al viaje de export e import', () => {
  const c = nuevo();
  store.setTest(p.id, c.id, { status: 'auto', command: 'npm test -- carrito' });
  const out = store.importProject(store.exportProject(p.id), { mode: 'new' });
  assert.equal(store.listChanges(out.projectId)[0].test.command, 'npm test -- carrito');
});

test('una propuesta puede nacer con su prueba propuesta', () => {
  const prop = store.addProposal(p.id, {
    title: 'x', explanation: 'e', files: FILES,
    test: { status: 'manual', note: 'se comprueba abriendo el carrito' },
  });
  assert.equal(prop.test.status, 'manual');
});

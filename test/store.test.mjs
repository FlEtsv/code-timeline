import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// El almacén se apunta a un directorio temporal ANTES de importarlo: DATA_DIR
// se resuelve al cargar el módulo, y sin esto los tests escribirían en el
// historial real del repo.
const DATA = mkdtempSync(join(tmpdir(), 'ct-store-'));
process.env.CODE_TIMELINE_DATA = DATA;
const store = await import('../lib/store.mjs');

const FILES = [{ file: 'src/a.js', after: 'const a = 1;' }];
let p;

beforeEach(() => {
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  p = store.createProject({ name: 'Proyecto de prueba', repoPath: '/tmp/repo' });
});

test('un cambio nuevo nace como "change" y sin revisar', () => {
  const c = store.addChange(p.id, { title: 't', explanation: 'e', files: FILES });
  assert.equal(c.status, 'change');
  assert.equal(c.verified, false);
  assert.equal(c.relation.type, 'start');
});

test('title y explanation son obligatorios', () => {
  assert.throws(() => store.addChange(p.id, { title: '', explanation: 'e', files: FILES }), /obligatorios/);
  assert.throws(() => store.addChange(p.id, { title: 't', explanation: '', files: FILES }), /obligatorios/);
});

test('cada archivo necesita ruta y código resultante', () => {
  assert.throws(() => store.addChange(p.id, { title: 't', explanation: 'e', files: [] }), /al menos un elemento/);
  assert.throws(() => store.addChange(p.id, { title: 't', explanation: 'e', files: [{ file: 'a.js' }] }), /al menos un elemento/);
});

test('un salto sin explicación se rechaza', () => {
  store.addChange(p.id, { title: 'uno', explanation: 'e', files: FILES });
  assert.throws(
    () => store.addChange(p.id, { title: 'dos', explanation: 'e', files: FILES, relationType: 'jump' }),
    /requiere relationNote/,
  );
});

test('una propuesta pendiente no rompe el hilo del historial', () => {
  store.addChange(p.id, { title: 'uno', explanation: 'e', files: FILES });
  store.addProposal(p.id, { title: 'propuesta', explanation: 'e', files: FILES });
  const c = store.addChange(p.id, { title: 'dos', explanation: 'e', files: FILES });
  // Si la relación se calculara contra la última ENTRADA y no contra el último
  // cambio aplicado, este saldría como "start" por venir tras una propuesta.
  assert.equal(c.relation.type, 'continuation');
});

test('aceptar deja la propuesta pendiente de aplicar, no en el historial', () => {
  const prop = store.addProposal(p.id, { title: 'propuesta', explanation: 'e', files: FILES });
  assert.equal(prop.status, 'proposal');
  const acc = store.decideProposal(p.id, prop.id, { decision: 'accept' });
  assert.equal(acc.status, 'accepted', 'aceptar no puede afirmar que el código ya existe');
  assert.equal(acc.fromProposal, true);
  assert.ok(acc.decidedAt);
  assert.equal(store.listByStatus(p.id, 'change').length, 0);
});

test('descartar archiva con el motivo, no borra', () => {
  const prop = store.addProposal(p.id, { title: 'propuesta', explanation: 'e', files: FILES });
  const rej = store.decideProposal(p.id, prop.id, { decision: 'reject', note: 'ya lo resuelve otra cosa' });
  assert.equal(rej.status, 'rejected');
  assert.equal(rej.decisionNote, 'ya lo resuelve otra cosa');
  assert.equal(store.listChanges(p.id).length, 1);
});

test('una decisión que no sea aceptar o descartar se rechaza', () => {
  const prop = store.addProposal(p.id, { title: 'x', explanation: 'e', files: FILES });
  assert.throws(() => store.decideProposal(p.id, prop.id, { decision: 'quizás' }), /accept.*reject/);
});

test('un cambio ya registrado no se puede decidir', () => {
  const c = store.addChange(p.id, { title: 't', explanation: 'e', files: FILES });
  assert.throws(() => store.decideProposal(p.id, c.id, { decision: 'reject' }), /no una propuesta/);
});

test('markApplied solo acepta propuestas aceptadas', () => {
  const prop = store.addProposal(p.id, { title: 'x', explanation: 'e', files: FILES });
  assert.throws(() => store.markApplied(p.id, prop.id, {}), /aceptada/);

  store.decideProposal(p.id, prop.id, { decision: 'accept' });
  const done = store.markApplied(p.id, prop.id, {
    files: [{ file: 'src/a.js', after: 'const a = 2; // lo aplicado difiere' }],
    commit: 'abc1234',
  });
  assert.equal(done.status, 'change');
  assert.equal(done.commit, 'abc1234');
  assert.match(done.files[0].after, /difiere/, 'debe guardar lo aplicado, no lo propuesto');
  assert.equal(done.verified, false, 'vuelve a pendiente de revisar');
  assert.ok(done.appliedAt);

  // Y no se puede aplicar dos veces.
  assert.throws(() => store.markApplied(p.id, prop.id, {}), /aceptada/);
});

test('sin files, markApplied conserva los de la propuesta', () => {
  const prop = store.addProposal(p.id, { title: 'x', explanation: 'e', files: FILES });
  store.decideProposal(p.id, prop.id, { decision: 'accept' });
  const done = store.markApplied(p.id, prop.id, {});
  assert.equal(done.files[0].after, FILES[0].after);
});

test('los contadores separan cambios, propuestas y aceptadas', () => {
  const c = store.addChange(p.id, { title: 'a', explanation: 'e', files: FILES });
  store.updateChange(p.id, c.id, { verified: true });
  store.addProposal(p.id, { title: 'b', explanation: 'e', files: FILES });
  const acc = store.addProposal(p.id, { title: 'c', explanation: 'e', files: FILES });
  store.decideProposal(p.id, acc.id, { decision: 'accept' });

  const proj = store.listProjects().find((x) => x.id === p.id);
  assert.equal(proj.changeCount, 1, 'las propuestas no cuentan como cambios');
  assert.equal(proj.verifiedCount, 1);
  assert.equal(proj.proposalCount, 1);
  assert.equal(proj.acceptedCount, 1);
});

test('las entradas antiguas sin status se leen como cambios', () => {
  // Un data/ escrito antes de que existieran las propuestas: se normaliza al
  // leer, sin migrar el fichero.
  writeFileSync(join(DATA, 'projects', p.id, 'changes.json'), JSON.stringify({
    changes: [{ id: 'viejo', title: 't', explanation: 'e', files: FILES, verified: true }],
  }));
  const [c] = store.listChanges(p.id);
  assert.equal(c.status, 'change');
  assert.equal(c.decision, null);
  assert.equal(c.fromProposal, false);
  assert.equal(c.verified, true, 'no debe pisar lo que ya traía');
});

test('proyectos con el mismo nombre no chocan de id', () => {
  const otro = store.createProject({ name: 'Proyecto de prueba', repoPath: '/tmp/otro' });
  assert.notEqual(otro.id, p.id);
});

test('pedir un proyecto que no existe da un error con salida', () => {
  assert.throws(() => store.getProject('no-existe'), /list_projects/);
});

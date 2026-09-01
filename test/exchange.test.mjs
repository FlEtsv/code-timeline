import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'ct-exch-'));
process.env.CODE_TIMELINE_DATA = DATA;
const store = await import('../lib/store.mjs');
const { renderMarkdown } = await import('../lib/markdown.mjs');

const FILES = [{ file: 'src/a.js', before: null, after: 'const a = 1;' }];
let p;

beforeEach(() => {
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  p = store.createProject({ name: 'Origen', repoPath: '/tmp/repo' });
});

function poblar() {
  const c = store.addChange(p.id, { title: 'un cambio', explanation: 'porque sí', files: FILES });
  store.updateChange(p.id, c.id, { verified: true, note: 'mi nota de revisión' });
  store.addProposal(p.id, { title: 'una propuesta', explanation: 'e', files: FILES });
  const r = store.addProposal(p.id, { title: 'una descartada', explanation: 'e', files: FILES });
  store.decideProposal(p.id, r.id, { decision: 'reject', note: 'no compensa' });
  return c;
}

test('el export lleva el historial entero, con notas y revisiones', () => {
  poblar();
  const b = store.exportProject(p.id);
  assert.equal(b.format, 'code-timeline/v1');
  assert.equal(b.changes.length, 3, 'propuestas y descartes también viajan');
  const cambio = b.changes.find((c) => c.status === 'change');
  assert.equal(cambio.note, 'mi nota de revisión');
  assert.equal(cambio.verified, true);
});

test('importar crea un proyecto nuevo sin tocar el de origen', () => {
  poblar();
  const b = store.exportProject(p.id);
  const out = store.importProject(b, { mode: 'new' });
  assert.notEqual(out.projectId, p.id);
  assert.equal(out.imported, 3);
  assert.equal(store.listChanges(p.id).length, 3, 'el origen queda igual');
  assert.equal(store.listChanges(out.projectId).length, 3);
});

test('fusionar el mismo export dos veces no duplica nada', () => {
  poblar();
  const b = store.exportProject(p.id);
  const primera = store.importProject(b, { mode: 'merge', targetId: p.id });
  assert.equal(primera.imported, 0);
  assert.equal(primera.skipped, 3);
  assert.equal(store.listChanges(p.id).length, 3);
});

test('fusionar trae solo lo que falta, en orden de fecha', () => {
  poblar();
  const b = store.exportProject(p.id);
  const destino = store.createProject({ name: 'Destino', repoPath: '/tmp/otro' });
  store.addChange(destino.id, { title: 'propio', explanation: 'e', files: FILES, date: '2020-01-01T00:00:00.000Z' });

  const out = store.importProject(b, { mode: 'merge', targetId: destino.id });
  assert.equal(out.imported, 3);
  const fechas = store.listChanges(destino.id).map((c) => c.date);
  assert.deepEqual(fechas, [...fechas].sort(), 'las entradas quedan en orden cronológico');
});

test('un fichero que no es un export nuestro se rechaza', () => {
  assert.throws(() => store.importProject({ changes: [] }, {}), /no es un export/);
  assert.throws(() => store.importProject(null, {}), /no es un export/);
  assert.throws(() => store.importProject({ format: 'otra-cosa' }, {}), /no es un export/);
});

test('fusionar exige saber en qué proyecto', () => {
  const b = store.exportProject(p.id);
  assert.throws(() => store.importProject(b, { mode: 'merge' }), /targetId/);
});

test('sin repoPath no se puede importar: no habría contra qué leer el código', () => {
  const b = store.exportProject(p.id);
  delete b.project.repoPath;
  assert.throws(() => store.importProject(b, { mode: 'new' }), /repoPath/);
  const out = store.importProject(b, { mode: 'new', repoPath: '/tmp/aqui' });
  assert.equal(store.getProject(out.projectId).repoPath, '/tmp/aqui');
});

test('el Markdown separa las secciones por estado', () => {
  poblar();
  const acc = store.addProposal(p.id, { title: 'aceptada', explanation: 'e', files: FILES });
  store.decideProposal(p.id, acc.id, { decision: 'accept' });

  const md = renderMarkdown(store.getProject(p.id), store.listChanges(p.id));
  assert.match(md, /## Propuestas pendientes/);
  assert.match(md, /## Aceptadas · pendientes de aplicar/);
  assert.match(md, /## Historial de cambios/);
  assert.match(md, /## Propuestas descartadas/);
  assert.match(md, /no compensa/, 'el motivo del descarte tiene que constar');
});

test('el vallado del bloque crece si el código ya trae backticks', () => {
  const c = store.addChange(p.id, {
    title: 'con vallas', explanation: 'e',
    files: [{ file: 'a.md', after: 'texto\n```\ninterior\n```\nfin' }],
  });
  const md = renderMarkdown(store.getProject(p.id), store.listChanges(p.id));
  // Con una valla de tres, el bloque se cortaría por la mitad.
  assert.match(md, /````/);
  assert.ok(c.id);
});

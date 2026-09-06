import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// El almacén se apunta a un directorio temporal ANTES de importarlo: DATA_DIR
// se resuelve al cargar el módulo, y sin esto los tests escribirían en el
// historial real del repo.
const DATA = mkdtempSync(join(tmpdir(), 'ct-robusto-'));
process.env.CODE_TIMELINE_DATA = DATA;
const store = await import('../lib/store.mjs');

const STORE_URL = new URL('../lib/store.mjs', import.meta.url).href;
const FILES = [{ file: 'src/a.js', after: 'const a = 1;' }];
let p;

function changesPath(id) {
  return join(DATA, 'projects', id, 'changes.json');
}

function nuevoCambio(titulo) {
  return store.addChange(p.id, { title: titulo, explanation: 'porque sí', files: FILES });
}

beforeEach(() => {
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  p = store.createProject({ name: 'Proyecto de prueba', repoPath: '/tmp/repo' });
});

test('un temporal a medias no estorba a la lectura ni a la siguiente escritura', () => {
  nuevoCambio('uno');
  // Lo que dejaría un proceso muerto entre el write y el rename: basura con
  // nombre de temporal, en el mismo directorio que el fichero bueno.
  writeFileSync(`${changesPath(p.id)}.9999.deadbeef.tmp`, '{"changes": [{"id": "a med');

  assert.equal(store.listChanges(p.id).length, 1);
  nuevoCambio('dos');
  assert.deepEqual(store.listChanges(p.id).map((c) => c.title), ['uno', 'dos']);
});

test('una escritura que falla deja el fichero anterior intacto', () => {
  const registro = join(DATA, 'projects.json');
  const antes = readFileSync(registro, 'utf8');

  // Un dato que no se puede serializar revienta dentro de writeJson. Como el
  // JSON se genera antes de tocar el disco, el fichero de antes sigue entero.
  const ciclo = {};
  ciclo.self = ciclo;
  assert.throws(() => store.updateProject(p.id, { githubRemote: ciclo }));

  assert.equal(readFileSync(registro, 'utf8'), antes);
  assert.equal(store.getProject(p.id).githubRemote, null);
});

test('se guarda copia de la versión anterior antes de sobrescribir', () => {
  nuevoCambio('uno');
  nuevoCambio('dos');

  const copia = JSON.parse(readFileSync(`${changesPath(p.id)}.bak`, 'utf8'));
  assert.deepEqual(copia.changes.map((c) => c.title), ['uno']);
});

test('si el principal está corrupto se recupera de la copia', () => {
  nuevoCambio('uno');
  nuevoCambio('dos');
  writeFileSync(changesPath(p.id), '{"changes": [ {"id": "medio escr');

  // No se cae ni devuelve una lista vacía: tira de la copia.
  assert.deepEqual(store.listChanges(p.id).map((c) => c.title), ['uno']);

  // Y el ilegible se aparta en vez de quedarse ahí para que la próxima
  // escritura haga copia de seguridad DE LA BASURA.
  assert.ok(existsSync(`${changesPath(p.id)}.corrupto`));
  nuevoCambio('tres');
  assert.deepEqual(store.listChanges(p.id).map((c) => c.title), ['uno', 'tres']);
});

test('sin copia utilizable se avisa con el fichero y la copia, no con una lista vacía', () => {
  nuevoCambio('uno');
  writeFileSync(changesPath(p.id), 'esto no es json');
  writeFileSync(`${changesPath(p.id)}.bak`, 'esto tampoco');

  assert.throws(() => store.listChanges(p.id), (err) => {
    assert.match(err.message, /changes\.json/);
    assert.match(err.message, /changes\.json\.bak/);
    return true;
  });
});

test('un candado caducado no deja el almacén bloqueado para siempre', () => {
  const candado = `${changesPath(p.id)}.lock`;
  writeFileSync(candado, '12345:proceso-muerto\n2020-01-01T00:00:00.000Z');
  const viejo = new Date(Date.now() - 60000);
  utimesSync(candado, viejo, viejo);

  nuevoCambio('uno');
  assert.equal(store.listChanges(p.id).length, 1);
  assert.ok(!existsSync(candado));
});

// Lo que de verdad se pierde sin bloqueo entre procesos: dos ciclos
// leer-modificar-escribir solapados (el MCP registrando un cambio y la web
// marcando revisado). Se comprueba con procesos de verdad, no con hilos.
test('dos procesos escribiendo a la vez no se pisan las entradas', async () => {
  const script = join(DATA, 'escritor.mjs');
  writeFileSync(script, `
const store = await import(process.env.STORE_URL);
for (let i = 0; i < 4; i++) {
  store.addChange(process.env.PROYECTO, {
    title: process.env.ETIQUETA + '-' + i,
    explanation: 'e',
    files: [{ file: 'src/a.js', after: 'const a = 1;' }],
  });
}
`);

  const escritor = (etiqueta) => new Promise((resolveP, rejectP) => {
    const hijo = spawn(process.execPath, [script], {
      env: { ...process.env, CODE_TIMELINE_DATA: DATA, STORE_URL, PROYECTO: p.id, ETIQUETA: etiqueta },
    });
    let err = '';
    hijo.stderr.on('data', (d) => { err += d; });
    hijo.on('close', (code) => (code === 0 ? resolveP() : rejectP(new Error(`salida ${code}: ${err}`))));
  });

  await Promise.all([escritor('a'), escritor('b'), escritor('c')]);

  const titulos = store.listChanges(p.id).map((c) => c.title);
  assert.equal(titulos.length, 12, `se perdieron entradas: ${titulos.join(', ')}`);
  assert.equal(new Set(titulos).size, 12);
});

test('dos escrituras seguidas sobre el mismo cambio conservan las dos', () => {
  const c = nuevoCambio('uno');
  store.updateChange(p.id, c.id, { verified: true });
  store.updateChange(p.id, c.id, { note: 'revisado a mano' });

  const guardado = store.listChanges(p.id)[0];
  assert.equal(guardado.verified, true);
  assert.equal(guardado.note, 'revisado a mano');
});

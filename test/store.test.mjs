import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
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

test('hace falta al menos un archivo', () => {
  assert.throws(() => store.addChange(p.id, { title: 't', explanation: 'e', files: [] }), /al menos un elemento/);
});

test('un archivo sin código se captura; si no se puede, se dice', () => {
  // El repoPath de este proyecto de prueba no existe, así que no hay nada que
  // capturar y el error tiene que explicar qué mirar — no dejar pasar una
  // entrada con el "después" vacío, que en la web se vería como un panel en
  // blanco sin decir por qué.
  assert.throws(
    () => store.addChange(p.id, { title: 't', explanation: 'e', files: [{ file: 'a.js' }] }),
    /No se pudo capturar el código de: a\.js/,
  );
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

test('pedir un proyecto que no existe dice cuáles hay', () => {
  // El error trae la lista: así no hace falta gastar una llamada a
  // list_projects solo para descubrir que el id estaba mal escrito.
  assert.throws(() => store.getProject('no-existe'), /No existe el proyecto/);
  assert.throws(() => store.getProject('no-existe'), new RegExp(p.id));
});

test('un proyecto se puede pedir por la ruta de su repo', () => {
  assert.equal(store.getProject('/tmp/repo').id, p.id);
  // Una cadena que no parece ruta se trata como id aunque no exista: el error
  // de id es más útil que uno sobre un directorio que nadie mencionó.
  assert.throws(() => store.getProject('idmalescrito'), /No existe el proyecto "idmalescrito"/);
});

// ── Sellado de commits ──────────────────────────────────────

test('sellar rellena el commit de las entradas que no lo tienen', () => {
  const a = store.addChange(p.id, { title: 'a', explanation: 'e', files: FILES });
  const b = store.addChange(p.id, { title: 'b', explanation: 'e', files: FILES });
  const r = store.stampCommits(p.id, [
    { changeId: a.id, commit: 'abc1234' },
    { changeId: b.id, commit: 'def5678' },
  ]);
  assert.equal(r.sellados, 2);
  const guardados = store.listChanges(p.id);
  assert.equal(guardados.find((c) => c.id === a.id).commit, 'abc1234');
  assert.equal(guardados.find((c) => c.id === b.id).commit, 'def5678');
});

test('sellar no pisa un commit ya apuntado', () => {
  // El commit que puso quien escribió el cambio manda sobre el que deduce el
  // copiloto mirando fechas y archivos.
  const a = store.addChange(p.id, { title: 'a', explanation: 'e', files: FILES, commit: 'elbueno' });
  const r = store.stampCommits(p.id, [{ changeId: a.id, commit: 'otro' }]);
  assert.equal(r.sellados, 0);
  assert.equal(store.listChanges(p.id)[0].commit, 'elbueno');
});

test('sellar aguanta ids que ya no existen y listas vacías', () => {
  assert.equal(store.stampCommits(p.id, []).sellados, 0);
  assert.equal(store.stampCommits(p.id, [{ changeId: 'fantasma', commit: 'abc' }]).sellados, 0);
});

test('nombrar un proyecto por su ruta escribe en SU carpeta, no en una inventada', () => {
  // El fallo que esto vigila: getProject aprendió a resolver rutas, pero el
  // resto del almacén usaba ese mismo string como nombre de carpeta. Una
  // llamada con una ruta creaba "data/projects/Users/steven/..." — un
  // proyecto paralelo, en silencio, cuyas entradas no salían en ninguna parte.
  // Se perdieron dos entradas reales antes de verlo.
  const antes = store.listChanges(p.id).length;
  store.addChange('/tmp/repo', { title: 'por ruta', explanation: 'e', files: FILES });
  assert.equal(store.listChanges(p.id).length, antes + 1,
    'la entrada tiene que caer en el proyecto de siempre');
  assert.equal(store.listChanges('/tmp/repo').length, antes + 1,
    'y leerla por la ruta tiene que dar lo mismo que por el id');
  assert.ok(!existsSync(join(DATA, 'projects', 'tmp')),
    'no puede haberse creado ninguna carpeta a partir de la ruta');
});

test('leer y decidir por ruta también van al mismo sitio', () => {
  const prop = store.addProposal('/tmp/repo', { title: 'p', explanation: 'e', files: FILES });
  assert.ok(store.listByStatus(p.id, 'proposal').some((c) => c.id === prop.id));
  store.decideProposal('/tmp/repo', prop.id, { decision: 'reject', note: 'no' });
  assert.equal(store.listChanges(p.id).find((c) => c.id === prop.id).status, 'rejected');
});

// ── Explicaciones línea por línea ───────────────────────────

test('la explicación se guarda colgada del archivo y del lado', () => {
  const c = store.addChange(p.id, { title: 't', explanation: 'e', files: FILES });
  const e = { lineas: [{ n: 1, que: 'define a' }], resumen: 'r', modelo: 'sonnet' };
  store.setExplicacion(p.id, c.id, { fileIndex: 0, lado: 'after', explicacion: e });

  const f = store.listChanges(p.id).find((x) => x.id === c.id).files[0];
  assert.deepEqual(f.explicaciones.after.lineas, e.lineas);
  assert.equal(f.explicaciones.before, undefined, 'el otro lado no se toca');
});

test('rehacer una explicación sustituye la anterior, y borrarla la quita', () => {
  const c = store.addChange(p.id, { title: 't', explanation: 'e', files: FILES });
  const uno = { lineas: [{ n: 1, que: 'vieja' }] };
  const dos = { lineas: [{ n: 1, que: 'nueva' }] };
  store.setExplicacion(p.id, c.id, { fileIndex: 0, explicacion: uno });
  store.setExplicacion(p.id, c.id, { fileIndex: 0, explicacion: dos });
  const leer = () => store.listChanges(p.id).find((x) => x.id === c.id).files[0];
  assert.equal(leer().explicaciones.after.lineas[0].que, 'nueva');

  // Borrarla no puede dejar un objeto vacío colgando en el dato.
  store.setExplicacion(p.id, c.id, { fileIndex: 0, explicacion: null });
  assert.equal(leer().explicaciones, undefined);
});

test('una explicación no puede apuntar a un archivo o un lado que no existen', () => {
  const c = store.addChange(p.id, { title: 't', explanation: 'e', files: FILES });
  const e = { lineas: [{ n: 1, que: 'x' }] };
  assert.throws(() => store.setExplicacion(p.id, c.id, { fileIndex: 9, explicacion: e }), /posición 9/);
  assert.throws(() => store.setExplicacion(p.id, c.id, { fileIndex: -1, explicacion: e }), /índice válido/);
  assert.throws(() => store.setExplicacion(p.id, c.id, { fileIndex: 0, lado: 'medio', explicacion: e }), /"after" o "before"/);
  assert.throws(() => store.setExplicacion(p.id, 'fantasma', { fileIndex: 0, explicacion: e }), /No existe el cambio/);
});

test('la explicación sobrevive a que se reescriban los archivos de la entrada', () => {
  // markApplied y otras rutas pasan por normalizeFiles: si ahí se perdiera, la
  // explicación desaparecería sin que nadie la borrara.
  const prop = store.addProposal(p.id, { title: 'p', explanation: 'e', files: FILES });
  store.decideProposal(p.id, prop.id, { decision: 'accept' });
  store.setExplicacion(p.id, prop.id, { fileIndex: 0, explicacion: { lineas: [{ n: 1, que: 'x' }] } });
  const antes = store.listChanges(p.id).find((x) => x.id === prop.id).files[0].explicaciones;
  assert.ok(antes, 'debería estar guardada antes de aplicar');

  store.markApplied(p.id, prop.id, { files: [{ file: 'src/a.js', after: 'const a = 2;' }] });
  // Al aplicar con archivos NUEVOS la explicación vieja ya no aplica a ese
  // código, así que se pierde a propósito; lo que no puede es romper nada.
  const despues = store.listChanges(p.id).find((x) => x.id === prop.id);
  assert.equal(despues.status, 'change');
  assert.equal(despues.files[0].after, 'const a = 2;');
});

test('la explicación escrita al vuelo se guarda con el cambio', () => {
  const c = store.addChange(p.id, {
    title: 't', explanation: 'e', files: FILES,
    explicaLineas: [{
      file: 'src/a.js',
      lineas: [{ n: 2, que: 'la segunda' }, { n: 1, que: 'la primera' }, { n: 'x', que: 'basura' }],
      resumen: 'un resumen',
    }],
  });
  const e = c.files[0].explicaciones.after;
  assert.deepEqual(e.lineas.map((l) => l.n), [1, 2], 'ordenadas y sin basura');
  assert.equal(e.resumen, 'un resumen');
  // Se marca distinto de las pedidas después: quien la escribió tenía el repo
  // delante, no solo el fragmento.
  assert.match(e.modelo, /quien escribió/);
});

test('una explicación al vuelo que no cuadra con ningún archivo se ignora', () => {
  const c = store.addChange(p.id, {
    title: 't', explanation: 'e', files: FILES,
    explicaLineas: [{ file: 'otro/fichero.js', lineas: [{ n: 1, que: 'x' }] }],
  });
  assert.equal(c.files[0].explicaciones, undefined, 'no se cuelga del archivo equivocado');
});

test('una lista de líneas vacía no deja una explicación fantasma', () => {
  const c = store.addChange(p.id, {
    title: 't', explanation: 'e', files: FILES,
    explicaLineas: [{ file: 'src/a.js', lineas: [{ n: 'x', que: '' }] }],
  });
  assert.equal(c.files[0].explicaciones, undefined);
});

// ── Buscar en el historial ──────────────────────────────────

test('buscar encuentra por el porqué, no solo por el título', () => {
  store.addChange(p.id, {
    title: 'Ajuste menor en el arranque', explanation: 'El candado entre procesos caducaba antes de tiempo.', files: FILES,
  });
  store.addChange(p.id, { title: 'Otra cosa', explanation: 'Nada que ver.', files: FILES });

  const r = store.buscar(p.id, 'candado');
  assert.equal(r.length, 1);
  assert.match(r[0].title, /arranque/);
  // El extracto tiene que traer el trozo donde casa, no el principio a secas.
  assert.match(r[0].porque, /candado/);
});

test('el título pesa más que el porqué, y el porqué más que la ruta', () => {
  const porTitulo = store.addChange(p.id, { title: 'El candado', explanation: 'x', files: FILES });
  const porPorque = store.addChange(p.id, { title: 'Otra', explanation: 'habla del candado aquí', files: FILES });
  const r = store.buscar(p.id, 'candado');
  assert.equal(r[0].id, porTitulo.id, 'quien lo lleva en el título va primero');
  assert.ok(r.find((x) => x.id === porPorque.id), 'pero el otro también aparece');
});

test('buscar no devuelve el código: para eso está get_change', () => {
  store.addChange(p.id, { title: 'Con candado', explanation: 'e', files: FILES });
  const r = store.buscar(p.id, 'candado');
  assert.deepEqual(r[0].files, ['src/a.js'], 'solo las rutas');
  assert.equal(r[0].before, undefined);
  assert.equal(r[0].after, undefined);
});

test('una búsqueda vacía o de palabras cortas no devuelve todo el historial', () => {
  store.addChange(p.id, { title: 'algo', explanation: 'e', files: FILES });
  assert.deepEqual(store.buscar(p.id, ''), []);
  assert.deepEqual(store.buscar(p.id, '   '), []);
  // "de" y "el" no son términos: si contaran, cualquier consulta traería todo.
  assert.deepEqual(store.buscar(p.id, 'de el la'), []);
});

test('sin coincidencias devuelve una lista vacía, no lo más parecido', () => {
  store.addChange(p.id, { title: 'algo', explanation: 'e', files: FILES });
  assert.deepEqual(store.buscar(p.id, 'palabrainexistente'), []);
});

test('buscar respeta el límite pedido', () => {
  for (let i = 0; i < 8; i++) {
    store.addChange(p.id, { title: `Cambio con candado ${i}`, explanation: 'e', files: FILES });
  }
  assert.equal(store.buscar(p.id, 'candado').length, 5, 'cinco por defecto');
  assert.equal(store.buscar(p.id, 'candado', { limit: 2 }).length, 2);
});

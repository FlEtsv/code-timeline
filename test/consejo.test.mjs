import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  slug, grupos, mensajeCommit, comandoCommit, pendientesDeCommit, deriva, cuerpoPr, aconsejar,
} from '../lib/consejo.mjs';
import { instantanea, commitsDesde } from '../lib/git.mjs';

// El copiloto aconseja sobre el repo del usuario, así que lo que se prueba
// aquí es que no se invente trabajo (falsos avisos) y que lo que dice del
// estado de git sea cierto contra un repo de verdad.

function cambio(props) {
  return {
    id: props.id || Math.random().toString(36).slice(2),
    status: 'change',
    date: props.date || '2026-01-01T10:00:00.000Z',
    title: props.title || 'Un cambio',
    explanation: props.explanation || 'Un motivo.',
    files: props.files || [{ file: 'a.js', after: 'const a = 1;' }],
    relation: props.relation || { type: 'continuation' },
    verified: props.verified || false,
    ...props,
  };
}

// ── Texto ───────────────────────────────────────────────────

test('el slug de una rama pierde acentos, mayúsculas y signos', () => {
  assert.equal(slug('Inyectar el TOKEN de Hermes (403)'), 'inyectar-el-token-de-hermes-403');
  assert.equal(slug('   '), '');
});

test('el asunto del commit se corta a lo que cabe en git log', () => {
  const largo = 'Palabra '.repeat(20).trim();
  const m = mensajeCommit([cambio({ title: largo })]);
  assert.ok(m.asunto.length <= 73, `asunto de ${m.asunto.length} caracteres`);
  assert.match(m.asunto, /…$/);
});

test('el punto final del título no pasa al asunto', () => {
  assert.equal(mensajeCommit([cambio({ title: 'Arreglar la cola.' })]).asunto, 'Arreglar la cola');
});

// ── Agrupar por saltos ──────────────────────────────────────

test('un salto parte la tanda en dos commits', () => {
  const g = grupos([
    cambio({ id: '1' }),
    cambio({ id: '2' }),
    cambio({ id: '3', relation: { type: 'jump', note: 'otro problema' } }),
    cambio({ id: '4' }),
  ]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].map((c) => c.id), ['1', '2']);
  assert.deepEqual(g[1].map((c) => c.id), ['3', '4']);
});

test('sin saltos, la tanda es un solo commit', () => {
  assert.equal(grupos([cambio({}), cambio({})]).length, 1);
  assert.equal(grupos([]).length, 0);
});

// ── Mensaje de commit ───────────────────────────────────────

test('el cuerpo sale del porqué registrado, no del diff', () => {
  const m = mensajeCommit([cambio({
    title: 'Sellar el token',
    explanation: 'Hermes responde 403 sin cabecera.\n\nSegundo párrafo que no va al commit.',
  })]);
  assert.equal(m.asunto, 'Sellar el token');
  assert.match(m.cuerpo, /Hermes responde 403 sin cabecera\./);
  assert.doesNotMatch(m.cuerpo, /Segundo párrafo/);
});

test('varias entradas: la primera manda y el resto se listan', () => {
  const m = mensajeCommit([
    cambio({ title: 'Primera' }),
    cambio({ title: 'Segunda' }),
    cambio({ title: 'Tercera' }),
  ]);
  assert.equal(m.asunto, 'Primera');
  assert.match(m.cuerpo, /En la misma tanda:/);
  assert.match(m.cuerpo, /- Segunda/);
  assert.match(m.cuerpo, /- Tercera/);
  assert.equal(m.entradas.length, 3);
});

test('una prueba en rojo se advierte dentro del propio mensaje', () => {
  const m = mensajeCommit([cambio({ test: { status: 'failing' } })]);
  assert.match(m.cuerpo, /prueba en rojo/);
});

test('el comando de commit sobrevive a un apóstrofo en el texto', () => {
  const cmd = comandoCommit({ asunto: "L'accent d'un titre", cuerpo: "y un 'entrecomillado'" });
  // Sin escapar, la comilla cerraría la cadena y el shell partiría el comando.
  assert.match(cmd, /'L'\\''accent d'\\''un titre'/);
  // Y lo que el shell reconstruye tiene que ser el texto original.
  const eco = execFileSync('/bin/sh', ['-c', `printf %s ${cmd.match(/-m (.*) -m/)[1]}`], { encoding: 'utf8' });
  assert.equal(eco, "L'accent d'un titre");
});

// ── Qué está pendiente de commit ────────────────────────────

test('una entrada con commit apuntado no está pendiente', () => {
  const git = { ultimoCommit: { fecha: Date.parse('2026-01-01T00:00:00Z') } };
  const lista = [
    cambio({ id: 'sellada', date: '2026-01-02T00:00:00.000Z', commit: 'abc1234' }),
    cambio({ id: 'suelta', date: '2026-01-02T00:00:00.000Z' }),
  ];
  assert.deepEqual(pendientesDeCommit(lista, git).map((c) => c.id), ['suelta']);
});

test('lo anterior al último commit no cuenta como pendiente', () => {
  const git = { ultimoCommit: { fecha: Date.parse('2026-01-05T00:00:00Z') } };
  const lista = [cambio({ id: 'vieja', date: '2026-01-01T00:00:00.000Z' })];
  assert.equal(pendientesDeCommit(lista, git).length, 0);
});

// ── Deriva ──────────────────────────────────────────────────

function repoTemporal() {
  const dir = mkdtempSync(join(tmpdir(), 'ct-consejo-'));
  return { repoPath: dir, id: 'tmp', name: 'Temporal' };
}

test('deriva: el código registrado sigue en el archivo', () => {
  const p = repoTemporal();
  writeFileSync(join(p.repoPath, 'a.js'), 'const a = 1;\nconst b = 2;\n');
  const hallazgos = deriva(p, [cambio({ files: [{ file: 'a.js', after: 'const a = 1;\nconst b = 2;' }] })]);
  assert.deepEqual(hallazgos, []);
  rmSync(p.repoPath, { recursive: true, force: true });
});

test('deriva: el código registrado ya no está', () => {
  const p = repoTemporal();
  writeFileSync(join(p.repoPath, 'a.js'), 'otra cosa completamente distinta\ny otra linea mas\n');
  const hallazgos = deriva(p, [cambio({ files: [{ file: 'a.js', after: 'const a = 1;\nconst b = 2;' }] })]);
  assert.equal(hallazgos.length, 1);
  assert.match(hallazgos[0].motivo, /0%/);
  rmSync(p.repoPath, { recursive: true, force: true });
});

test('deriva: un borrado registrado como tal no es deriva', () => {
  const p = repoTemporal();
  const hallazgos = deriva(p, [cambio({
    files: [{ file: 'se-fue.js', after: '// (fichero eliminado)\n// porque ya no hacía falta' }],
  })]);
  assert.deepEqual(hallazgos, []);
  rmSync(p.repoPath, { recursive: true, force: true });
});

test('deriva: un archivo de fuera del repo no se juzga', () => {
  const p = repoTemporal();
  const hallazgos = deriva(p, [cambio({
    files: [{ file: '~/.claude/CLAUDE.md', after: 'una linea\notra linea' }],
  })]);
  assert.deepEqual(hallazgos, []);
  rmSync(p.repoPath, { recursive: true, force: true });
});

test('deriva: solo se juzga la última entrada de cada archivo', () => {
  const p = repoTemporal();
  writeFileSync(join(p.repoPath, 'a.js'), 'version nueva del archivo\ncon dos lineas\n');
  const hallazgos = deriva(p, [
    cambio({ id: 'vieja', date: '2026-01-01T00:00:00.000Z', files: [{ file: 'a.js', after: 'version vieja\nque ya no esta' }] }),
    cambio({ id: 'nueva', date: '2026-02-01T00:00:00.000Z', files: [{ file: 'a.js', after: 'version nueva del archivo\ncon dos lineas' }] }),
  ]);
  // La vieja quedó superada por la nueva: que no cuadre es lo esperado.
  assert.deepEqual(hallazgos, []);
  rmSync(p.repoPath, { recursive: true, force: true });
});

// ── Contra un repo git de verdad ────────────────────────────

function repoGit() {
  const dir = mkdtempSync(join(tmpdir(), 'ct-git-'));
  const g = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  g('init', '-b', 'main');
  g('config', 'user.email', 'prueba@ejemplo.com');
  g('config', 'user.name', 'Prueba');
  writeFileSync(join(dir, 'a.js'), 'const a = 1;\n');
  g('add', '-A');
  g('commit', '-m', 'primero');
  return { dir, g };
}

test('la instantánea de git dice la rama, el árbol y el último commit', () => {
  const { dir, g } = repoGit();
  const limpia = instantanea(dir);
  assert.equal(limpia.rama, 'main');
  assert.equal(limpia.ramaPrincipal, 'main');
  assert.equal(limpia.estado.limpio, true);
  assert.equal(limpia.ultimoCommit.asunto, 'primero');
  // Sin remoto no hay rama de seguimiento: la pregunta no aplica, y eso es
  // null, no cero. Confundirlo aconsejaría "sube tus commits" a un repo local.
  assert.equal(limpia.sinEmpujar, null);

  writeFileSync(join(dir, 'a.js'), 'const a = 2;\n');
  writeFileSync(join(dir, 'nuevo.js'), 'const b = 3;\n');
  const sucia = instantanea(dir);
  assert.equal(sucia.estado.limpio, false);
  assert.deepEqual(sucia.estado.modificados, ['a.js']);
  assert.deepEqual(sucia.estado.sinSeguimiento, ['nuevo.js']);

  g('checkout', '-q', '-b', 'una-rama');
  assert.equal(instantanea(dir).rama, 'una-rama');
  rmSync(dir, { recursive: true, force: true });
});

test('commitsDesde devuelve los archivos de cada commit, del más viejo al más nuevo', () => {
  const { dir, g } = repoGit();
  writeFileSync(join(dir, 'b.js'), 'const b = 1;\n');
  g('add', '-A');
  g('commit', '-m', 'segundo');
  const commits = commitsDesde(dir, 0);
  assert.equal(commits.length, 2);
  assert.equal(commits[0].asunto, 'primero');
  assert.equal(commits[1].asunto, 'segundo');
  assert.deepEqual(commits[1].archivos, ['b.js']);
  rmSync(dir, { recursive: true, force: true });
});

test('con el árbol sucio y una entrada nueva, aconseja commitear', () => {
  const { dir } = repoGit();
  writeFileSync(join(dir, 'a.js'), 'const a = 2;\n');
  const proyecto = { id: 'tmp', name: 'Temporal', repoPath: dir };
  const r = aconsejar(proyecto, [cambio({
    date: new Date(Date.now() + 1000).toISOString(),
    title: 'Subir a la versión 2',
    explanation: 'Porque la 1 se quedó corta.',
    files: [{ file: 'a.js', after: 'const a = 2;' }],
  })]);
  const commit = r.consejos.find((c) => c.id === 'commit');
  assert.ok(commit, 'no aconsejó commitear');
  assert.match(commit.comandos[0].texto, /git commit -m 'Subir a la versión 2'/);
  assert.match(r.mensaje.cuerpo, /la 1 se quedó corta/);
  rmSync(dir, { recursive: true, force: true });
});

test('con el árbol limpio no aconseja commitear nada', () => {
  const { dir } = repoGit();
  const r = aconsejar({ id: 'tmp', name: 'Temporal', repoPath: dir }, []);
  assert.equal(r.consejos.find((c) => c.id === 'commit'), undefined);
  assert.equal(r.consejos.find((c) => c.id === 'sin-registrar'), undefined);
  rmSync(dir, { recursive: true, force: true });
});

test('un salto entre lo pendiente pide separar commits y ofrece rama', () => {
  const { dir } = repoGit();
  writeFileSync(join(dir, 'a.js'), 'const a = 2;\n');
  const ahora = Date.now();
  const r = aconsejar({ id: 'tmp', name: 'Temporal', repoPath: dir }, [
    cambio({ id: '1', date: new Date(ahora + 1000).toISOString(), title: 'Lo primero' }),
    cambio({
      id: '2', date: new Date(ahora + 2000).toISOString(), title: 'Otro asunto',
      relation: { type: 'jump', note: 'no tiene que ver con lo anterior' },
    }),
  ]);
  const separar = r.consejos.find((c) => c.id === 'separar');
  assert.ok(separar, 'no detectó el salto');
  assert.match(separar.detalle, /no tiene que ver con lo anterior/);
  // Se está en la rama principal, así que además ofrece abrir una.
  assert.match(separar.comandos[0].texto, /git checkout -b otro-asunto/);
  rmSync(dir, { recursive: true, force: true });
});

test('un proyecto que no es repo git no rompe nada', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ct-nogit-'));
  const r = aconsejar({ id: 'tmp', name: 'Sin git', repoPath: dir }, [cambio({})]);
  assert.equal(r.git, null);
  assert.deepEqual(r.consejos, []);
  rmSync(dir, { recursive: true, force: true });
});

// ── Cuerpo de PR ────────────────────────────────────────────

test('el cuerpo del PR trae qué, por qué y cómo se probó', () => {
  const p = { id: 'tmp', name: 'Temporal', repoPath: tmpdir() };
  const pr = cuerpoPr(p, [
    cambio({ title: 'Arreglar la cola', explanation: 'Se atascaba con 3 reintentos.', test: { status: 'auto', command: 'npm test' } }),
    cambio({ title: 'Sin prueba', explanation: 'Un ajuste de texto.' }),
  ], null);
  assert.match(pr.texto, /## Qué cambia/);
  assert.match(pr.texto, /- Arreglar la cola/);
  assert.match(pr.texto, /Se atascaba con 3 reintentos\./);
  assert.match(pr.texto, /## Cómo se ha probado/);
  assert.match(pr.texto, /automática: `npm test`/);
  assert.equal(pr.entradas, 2);
});

test('el PR avisa de lo que no debería fusionarse a ciegas', () => {
  const p = { id: 'tmp', name: 'Temporal', repoPath: tmpdir() };
  const pr = cuerpoPr(p, [cambio({ test: { status: 'failing' }, verified: false })], null);
  assert.match(pr.texto, /Antes de fusionar/);
  assert.match(pr.texto, /prueba en rojo/);
});

test('sin entradas no se inventa un PR', () => {
  assert.equal(cuerpoPr({ id: 'x', name: 'X', repoPath: tmpdir() }, [], null), null);
});

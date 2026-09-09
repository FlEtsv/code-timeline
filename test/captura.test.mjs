import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { capturar, trocearDiff, completarArchivos } from '../lib/captura.mjs';

// Esto sustituye a que un agente teclee el código: si captura de menos, el
// historial pierde el antes/después que es su razón de ser; si captura de
// más o miente sobre las líneas, se lee peor que lo que había.

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'ct-cap-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-b', 'main');
  g('config', 'user.email', 'p@p.p');
  g('config', 'user.name', 'P');
  return { dir, g };
}

const esc = (dir, f, txt) => writeFileSync(join(dir, f), txt);

test('trocearDiff separa cada tramo con su rango y sus dos lados', () => {
  const tramos = trocearDiff([
    '--- a/x.js', '+++ b/x.js',
    '@@ -1,3 +1,4 @@',
    ' uno',
    '-dos',
    '+DOS',
    '+dos y medio',
    ' tres',
  ].join('\n'));
  assert.equal(tramos.length, 1);
  assert.equal(tramos[0].desde, 1);
  assert.equal(tramos[0].hasta, 4);
  assert.deepEqual(tramos[0].antes, ['uno', 'dos', 'tres']);
  assert.deepEqual(tramos[0].despues, ['uno', 'DOS', 'dos y medio', 'tres']);
});

test('captura el cambio sin commitear, que es el caso normal', () => {
  const { dir, g } = repo();
  esc(dir, 'a.js', 'const a = 1;\nconst b = 2;\nconst c = 3;\n');
  g('add', '-A'); g('commit', '-m', 'x');
  esc(dir, 'a.js', 'const a = 1;\nconst b = 22;\nconst c = 3;\n');

  const r = capturar(dir, 'a.js');
  assert.equal(r.origen, 'sin commitear');
  assert.match(r.before, /const b = 2;/);
  assert.match(r.after, /const b = 22;/);
  assert.doesNotMatch(r.after, /const b = 2;\n/);
  rmSync(dir, { recursive: true, force: true });
});

test('si no hay nada sin commitear, mira el último commit', () => {
  const { dir, g } = repo();
  esc(dir, 'a.js', 'viejo\n');
  g('add', '-A'); g('commit', '-m', 'uno');
  esc(dir, 'a.js', 'nuevo\n');
  g('add', '-A'); g('commit', '-m', 'dos');

  const r = capturar(dir, 'a.js');
  assert.equal(r.origen, 'último commit');
  assert.match(r.before, /viejo/);
  assert.match(r.after, /nuevo/);
  rmSync(dir, { recursive: true, force: true });
});

test('un archivo nuevo no tiene "antes"', () => {
  const { dir, g } = repo();
  esc(dir, 'a.js', 'algo\n');
  g('add', '-A'); g('commit', '-m', 'x');
  esc(dir, 'nuevo.js', 'const nuevo = 1;\n');

  const r = capturar(dir, 'nuevo.js');
  assert.equal(r.before, null);
  assert.match(r.after, /const nuevo = 1;/);
  rmSync(dir, { recursive: true, force: true });
});

test('un archivo borrado se captura como borrado', () => {
  const { dir, g } = repo();
  esc(dir, 'a.js', 'me voy a ir\n');
  g('add', '-A'); g('commit', '-m', 'x');
  unlinkSync(join(dir, 'a.js'));

  const r = capturar(dir, 'a.js');
  assert.match(r.before, /me voy a ir/);
  // La misma convención que ya usaban las entradas escritas a mano, para que
  // el detector de deriva la siga reconociendo como un borrado a propósito.
  assert.match(r.after, /eliminado/);
  rmSync(dir, { recursive: true, force: true });
});

test('varios tramos van separados, no pegados', () => {
  const { dir, g } = repo();
  const lineas = Array.from({ length: 60 }, (_, i) => `linea ${i + 1}`);
  esc(dir, 'a.js', lineas.join('\n') + '\n');
  g('add', '-A'); g('commit', '-m', 'x');
  lineas[2] = 'CAMBIADA arriba';
  lineas[50] = 'CAMBIADA abajo';
  esc(dir, 'a.js', lineas.join('\n') + '\n');

  const r = capturar(dir, 'a.js');
  assert.match(r.after, /CAMBIADA arriba/);
  assert.match(r.after, /CAMBIADA abajo/);
  // Sin la marca, parecería que la línea 6 continúa en la 48.
  assert.match(r.after, /^…$/m);
  rmSync(dir, { recursive: true, force: true });
});

test('un rango acota a su tramo y descarta los demás', () => {
  const { dir, g } = repo();
  const lineas = Array.from({ length: 60 }, (_, i) => `linea ${i + 1}`);
  esc(dir, 'a.js', lineas.join('\n') + '\n');
  g('add', '-A'); g('commit', '-m', 'x');
  lineas[2] = 'CAMBIADA arriba';
  lineas[50] = 'CAMBIADA abajo';
  esc(dir, 'a.js', lineas.join('\n') + '\n');

  const r = capturar(dir, 'a.js', { lineStart: 49, lineEnd: 53 });
  assert.match(r.after, /CAMBIADA abajo/);
  assert.doesNotMatch(r.after, /CAMBIADA arriba/);
  assert.equal(r.lineStart, 49);
  rmSync(dir, { recursive: true, force: true });
});

test('un rango que no cae en ningún tramo no hace que se mienta sobre las líneas', () => {
  const { dir, g } = repo();
  const lineas = Array.from({ length: 60 }, (_, i) => `linea ${i + 1}`);
  esc(dir, 'a.js', lineas.join('\n') + '\n');
  g('add', '-A'); g('commit', '-m', 'x');
  lineas[2] = 'CAMBIADA';
  esc(dir, 'a.js', lineas.join('\n') + '\n');

  // Se piden unas líneas donde no hay ningún cambio: se captura lo que sí
  // cambió, pero el rango que se anuncia tiene que ser el real.
  const r = capturar(dir, 'a.js', { lineStart: 40, lineEnd: 45 });
  assert.match(r.after, /CAMBIADA/);
  assert.notEqual(r.lineStart, 40);
  assert.ok(r.lineStart < 10, `esperaba el rango real, salió ${r.lineStart}`);
  rmSync(dir, { recursive: true, force: true });
});

test('un archivo sin cambios y sin rango no se captura', () => {
  const { dir, g } = repo();
  esc(dir, 'a.js', 'quieto\n');
  g('add', '-A'); g('commit', '-m', 'x');
  assert.equal(capturar(dir, 'a.js'), null);
  rmSync(dir, { recursive: true, force: true });
});

test('un archivo que no existe no se captura', () => {
  const { dir } = repo();
  assert.equal(capturar(dir, 'fantasma.js'), null);
  rmSync(dir, { recursive: true, force: true });
});

test('un cambio enorme se recorta y lo dice, en vez de recortar en silencio', () => {
  const { dir, g } = repo();
  const lineas = Array.from({ length: 900 }, (_, i) => `linea ${i + 1}`);
  esc(dir, 'a.js', lineas.join('\n') + '\n');
  g('add', '-A'); g('commit', '-m', 'x');
  // Un cambio cada 20 líneas: muchos tramos, muy por encima del tope.
  for (let i = 0; i < 900; i += 20) lineas[i] = `CAMBIADA ${i}`;
  esc(dir, 'a.js', lineas.join('\n') + '\n');

  const r = capturar(dir, 'a.js');
  assert.match(r.origen, /recortado/);
  assert.match(r.after, /hay más cambios en este archivo/);
  rmSync(dir, { recursive: true, force: true });
});

test('completarArchivos respeta el código escrito a mano', () => {
  const { dir, g } = repo();
  esc(dir, 'a.js', 'original\n');
  g('add', '-A'); g('commit', '-m', 'x');
  esc(dir, 'a.js', 'cambiado\n');

  const { files, capturados } = completarArchivos(dir, [
    { file: 'a.js', after: 'esto lo escribí yo' },
  ]);
  assert.equal(capturados, 0);
  assert.equal(files[0].after, 'esto lo escribí yo');
  rmSync(dir, { recursive: true, force: true });
});

test('completarArchivos rellena solo lo que falta', () => {
  const { dir, g } = repo();
  esc(dir, 'a.js', 'uno\n');
  esc(dir, 'b.js', 'dos\n');
  g('add', '-A'); g('commit', '-m', 'x');
  esc(dir, 'a.js', 'UNO\n');
  esc(dir, 'b.js', 'DOS\n');

  const { files, capturados } = completarArchivos(dir, [
    { file: 'a.js', after: 'a mano' },
    { file: 'b.js' },
  ]);
  assert.equal(capturados, 1);
  assert.equal(files[0].after, 'a mano');
  assert.match(files[1].after, /DOS/);
  assert.equal(files[1].capturado, 'sin commitear');
  rmSync(dir, { recursive: true, force: true });
});

test('sin repo, completarArchivos devuelve lo que le dieron', () => {
  const entrada = [{ file: 'a.js' }];
  assert.deepEqual(completarArchivos(null, entrada).files, entrada);
  assert.equal(completarArchivos(null, entrada).capturados, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlight, languageFromPath, normalizeLanguage } from '../lib/highlight.mjs';

// El resaltador es un tokenizador de una pasada sobre texto que viene de
// archivos ajenos: lo que se prueba aquí es que no se cuelga, que no deja
// escapar HTML y que no miente sobre lenguajes que no conoce.

test('marca palabras clave, llamadas, cadenas y números', () => {
  const out = highlight("const n = suma(1, 'dos');", 'javascript');
  assert.match(out, /<span class="tk-key">const<\/span>/);
  assert.match(out, /<span class="tk-fn">suma<\/span>/);
  assert.match(out, /<span class="tk-num">1<\/span>/);
  assert.match(out, /<span class="tk-str">&#39;dos&#39;|<span class="tk-str">'dos'/);
});

test('un identificador solo es función si le sigue un paréntesis', () => {
  assert.doesNotMatch(highlight('const suma = 1;', 'javascript'), /tk-fn/);
  assert.match(highlight('suma(1)', 'javascript'), /tk-fn/);
});

test('el token de comentario depende del lenguaje', () => {
  assert.match(highlight('a = 1  # nota', 'python'), /<span class="tk-com"># nota<\/span>/);
  assert.match(highlight('SELECT 1 -- nota', 'sql'), /<span class="tk-com">-- nota<\/span>/);
  assert.match(highlight('a = 1; // nota', 'javascript'), /<span class="tk-com">\/\/ nota<\/span>/);
  // En Python "//" es división entera, no un comentario.
  assert.doesNotMatch(highlight('a = 7 // 2', 'python'), /tk-com/);
});

test('SQL y CSS comparan claves sin distinguir mayúsculas; JS no', () => {
  assert.match(highlight('SELECT x FROM t', 'sql'), /<span class="tk-key">SELECT<\/span>/);
  assert.match(highlight('select x from t', 'sql'), /<span class="tk-key">select<\/span>/);
  // "If" con mayúscula no es una palabra clave de JavaScript, y pintarla como
  // tal haría pasar por sintaxis lo que es un identificador cualquiera.
  assert.doesNotMatch(highlight('If(x)', 'javascript'), /tk-key/);
});

test('con un lenguaje desconocido no se inventa palabras clave', () => {
  const out = highlight("fn main() { let x = 'a'; } // nota", 'rust');
  assert.doesNotMatch(out, /tk-key/, 'no debería marcar claves de un lenguaje que no conoce');
  assert.match(out, /tk-str/, 'las cadenas sí son casi universales');
  assert.match(out, /tk-com/);
});

test('escapa el HTML del código', () => {
  const out = highlight('const t = "<script>alert(1)</script>";', 'javascript');
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /&lt;script&gt;/);
});

test('el ampersand no se escapa dos veces', () => {
  assert.match(highlight('a && b', 'javascript'), /&amp;&amp;/);
  assert.doesNotMatch(highlight('a && b', 'javascript'), /&amp;amp;/);
});

test('aguanta cadenas y comentarios sin cerrar sin colgarse', () => {
  assert.match(highlight("const a = 'sin cerrar", 'javascript'), /tk-str/);
  assert.match(highlight('/* sin cerrar', 'javascript'), /tk-com/);
  assert.match(highlight('const a = `plantilla', 'javascript'), /tk-str/);
});

test('respeta el escape dentro de una cadena', () => {
  // La comilla escapada no cierra la cadena: si la cerrara, el resto de la
  // línea se pintaría como código.
  const out = highlight("'a\\'b' + c", 'javascript');
  assert.equal((out.match(/tk-str/g) || []).length, 1);
});

test('entradas vacías o nulas devuelven cadena vacía', () => {
  for (const v of ['', null, undefined]) assert.equal(highlight(v, 'javascript'), '');
});

test('reconoce alias y deduce el lenguaje por la extensión', () => {
  assert.equal(normalizeLanguage('mjs'), 'javascript');
  assert.equal(normalizeLanguage('TSX'), 'typescript');
  assert.equal(languageFromPath('src/lib/store.mjs'), 'javascript');
  assert.equal(languageFromPath('consulta.sql'), 'sql');
  assert.equal(languageFromPath('sin-extension'), 'sin-extension');
});

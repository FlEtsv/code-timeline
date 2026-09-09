import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdToHtml } from '../lib/mdtext.mjs';

// Estos textos los escribe un modelo y se pintan dentro de la página. Lo que
// se prueba aquí es que el formato sale, que el HTML ajeno no entra, y que no
// se inventa cursivas donde hay nombres de variables.

test('negrita, cursiva y código en línea', () => {
  const out = mdToHtml('Un **motivo** en _cursiva_ con `codigo()` dentro.');
  assert.match(out, /<strong>motivo<\/strong>/);
  assert.match(out, /<em>cursiva<\/em>/);
  assert.match(out, /<code>codigo\(\)<\/code>/);
});

test('el HTML del texto se escapa y no llega a la página', () => {
  const out = mdToHtml('Ojo con <script>alert(1)</script> y con <b>esto</b>.');
  assert.doesNotMatch(out, /<script>/);
  assert.doesNotMatch(out, /<b>/);
  assert.match(out, /&lt;script&gt;/);
});

test('dentro de `código` los asteriscos y guiones bajos son literales', () => {
  const out = mdToHtml('El campo `gate_state` y el glob `*.js` no son formato.');
  assert.match(out, /<code>gate_state<\/code>/);
  assert.match(out, /<code>\*\.js<\/code>/);
  assert.doesNotMatch(out, /<em>/);
});

test('un identificador con guiones bajos no se vuelve cursiva', () => {
  // El caso que motiva la guarda: en estas explicaciones abundan nombres como
  // memory_project_path, y el Markdown ingenuo se comería el tramo central.
  const out = mdToHtml('Se pasa memory_project_path al arrancar.');
  assert.doesNotMatch(out, /<em>/);
  assert.match(out, /memory_project_path/);
});

test('listas con guion y numeradas', () => {
  const conGuion = mdToHtml('Motivos:\n- uno\n- dos');
  assert.match(conGuion, /<ul><li>uno<\/li><li>dos<\/li><\/ul>/);
  // La lista va pegada al párrafo, sin línea en blanco: caso corriente.
  assert.match(conGuion, /<p>Motivos:<\/p>/);

  const numerada = mdToHtml('1. primero\n2. segundo');
  assert.match(numerada, /<ol><li>primero<\/li><li>segundo<\/li><\/ol>/);
});

test('bloque de código con valla, con su lenguaje', () => {
  const out = mdToHtml('Así:\n\n```js\nconst a = **no** es negrita;\n```');
  assert.match(out, /<pre class="lang-js"><code>const a = \*\*no\*\* es negrita;<\/code><\/pre>/);
});

test('los enlaces solo salen con esquemas que abren una página', () => {
  assert.match(mdToHtml('[docs](https://ejemplo.com)'), /<a href="https:\/\/ejemplo.com"/);
  const malo = mdToHtml('[pincha](javascript:alert(1))');
  assert.doesNotMatch(malo, /<a /);
  assert.match(malo, /\[pincha\]/);
});

test('los enlaces se abren fuera y sin ceder la pestaña', () => {
  assert.match(mdToHtml('[x](/p/uno)'), /rel="noopener noreferrer"/);
});

test('cita y encabezado, rebajado para no competir con el título', () => {
  assert.match(mdToHtml('> Esto es una cita.'), /<blockquote>Esto es una cita\.<\/blockquote>/);
  // "# " es h3, no h1: el título de la entrada ya es el h2 de la tarjeta.
  assert.match(mdToHtml('# Un encabezado'), /<h3>Un encabezado<\/h3>/);
});

test('los párrafos se separan y el salto suelto se respeta', () => {
  const out = mdToHtml('Uno.\nSigue.\n\nOtro párrafo.');
  assert.match(out, /<p>Uno\.<br \/>Sigue\.<\/p>/);
  assert.match(out, /<p>Otro párrafo\.<\/p>/);
});

test('un texto vacío no deja etiquetas sueltas', () => {
  assert.equal(mdToHtml(''), '');
  assert.equal(mdToHtml('   \n  '), '');
  assert.equal(mdToHtml(null), '');
  assert.equal(mdToHtml(undefined), '');
});

test('una explicación real del propio historial sale entera', () => {
  // Forma típica de lo que escribe Claude: párrafos, negrita de etiqueta,
  // rutas con backticks y una lista.
  const real = [
    'Hermes protege su servidor MCP con un middleware global que responde 403',
    'a toda petición sin la cabecera `x-hermes-token`.',
    '',
    '**Why:** el lanzador construía el comando de Codex sin token.',
    '',
    '- Sin cabecera: 403.',
    '- Con cabecera: 200.',
  ].join('\n');
  const out = mdToHtml(real);
  assert.match(out, /<code>x-hermes-token<\/code>/);
  assert.match(out, /<strong>Why:<\/strong>/);
  assert.match(out, /<ul><li>Sin cabecera: 403\.<\/li>/);
  assert.doesNotMatch(out, /\*\*/);
});

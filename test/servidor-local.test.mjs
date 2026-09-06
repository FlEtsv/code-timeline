import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// El almacén se fija al cargar el módulo, así que la variable va antes del
// import: estas pruebas levantan el servidor de verdad y no tienen por qué
// enseñar el historial real de nadie.
const TMP = mkdtempSync(join(tmpdir(), 'ct-servidor-'));
process.env.CODE_TIMELINE_DATA = TMP;
const { startServer } = await import('../lib/httpserver.mjs');

const CLI = new URL('../bin/cli.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function cerrar(server) {
  return new Promise((resolve) => server.close(resolve));
}

// Lo que sostiene la promesa del README: aquí se sirve el código del usuario y
// una API de escritura sin autenticación. Sin host, node escucha en todas las
// interfaces y eso queda a la vista de cualquiera en la misma wifi.
test('por defecto el servidor solo escucha en 127.0.0.1', async () => {
  const server = await startServer({ port: 0 });
  const dir = server.address();
  assert.equal(dir.address, '127.0.0.1');
  assert.notEqual(dir.address, '0.0.0.0');
  assert.notEqual(dir.address, '::');
  await cerrar(server);
});

test('salir a la red local es una decisión explícita, no el defecto', async () => {
  const server = await startServer({ port: 0, host: '0.0.0.0' });
  assert.equal(server.address().address, '0.0.0.0');
  await cerrar(server);
});

test('la portada sigue respondiendo en 127.0.0.1', async () => {
  const server = await startServer({ port: 0 });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<html/i);
  await cerrar(server);
});

// Arranca el CLI de verdad porque lo que se comprueba es el cableado del
// subcomando: que --host llegue hasta startServer y que un host abierto se
// anuncie por pantalla en vez de pasar callando.
// `hasta` es el trozo de salida que cierra la espera: el CLI escribe la URL y
// el aviso en dos console.log, que llegan en chunks distintos, así que esperar
// siempre por la URL dejaría al aviso fuera de la comprobación por milésimas.
function servir(args, hasta = 'Ctrl+C') {
  const hijo = spawn(process.execPath, [CLI, 'serve', ...args], {
    env: { ...process.env, CODE_TIMELINE_DATA: TMP },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  const listo = new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error(`el CLI no arrancó: ${salida}`)), 10000);
    hijo.stdout.on('data', (chunk) => {
      salida += chunk;
      if (salida.includes(hasta)) { clearTimeout(temporizador); resolve(); }
    });
    hijo.on('error', reject);
  });
  return { hijo, listo, texto: () => salida };
}

test('code-timeline serve no se abre a la red sin que se lo pidan', async () => {
  const { hijo, listo, texto } = servir(['--port', '0']);
  try {
    await listo;
    // Margen para que un aviso indebido llegase a aparecer: sin él, "no hay
    // AVISO" podría ser sólo que aún no ha salido por la tubería.
    await new Promise((r) => setTimeout(r, 200));
    assert.match(texto(), /corriendo en http:\/\/localhost/);
    assert.doesNotMatch(texto(), /AVISO/);
  } finally {
    hijo.kill();
  }
});

test('con --host abierto avisa de que la web queda visible desde otros equipos', async () => {
  const { hijo, listo, texto } = servir(['--port', '0', '--host', '0.0.0.0'], 'AVISO');
  try {
    await listo;
    assert.match(texto(), /AVISO: escuchando en 0\.0\.0\.0/);
    assert.match(texto(), /otros equipos de la red/);
  } finally {
    hijo.kill();
  }
});

test.after(() => { rmSync(TMP, { recursive: true, force: true }); });

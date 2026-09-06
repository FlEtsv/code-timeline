import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../bin/cli.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const temporales = [];

function almacen() {
  const dir = mkdtempSync(join(tmpdir(), 'ct-doctor-'));
  temporales.push(dir);
  return dir;
}

// Se lanza el CLI de verdad como proceso aparte: lo que se comprueba es el
// código de salida, y eso no existe si se importa el módulo.
function ejecutar(args, datos) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, CODE_TIMELINE_DATA: datos },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    hijo.stdout.on('data', (chunk) => { salida += chunk; });
    hijo.stderr.on('data', (chunk) => { salida += chunk; });
    hijo.on('error', reject);
    hijo.on('close', (code) => resolve({ code, salida }));
  });
}

test('con todo en su sitio, doctor sale con 0', async () => {
  const datos = almacen();
  const repo = almacen();
  const vinculado = await ejecutar(['link', '--name', 'Proyecto sano', '--path', repo], datos);
  assert.equal(vinculado.code, 0);

  const { code, salida } = await ejecutar(['doctor'], datos);
  assert.equal(code, 0, salida);
  assert.match(salida, /Todo correcto\./);
  // El directorio y la regla que lo eligió: sin las dos cosas el diagnóstico no
  // sirve para averiguar por qué se está mirando ese almacén y no otro.
  assert.match(salida, /CODE_TIMELINE_DATA/);
  assert.ok(salida.includes(datos), 'debe decir la ruta del almacén en uso');
  assert.match(salida, /vinculados: 1/);
  assert.match(salida, /sin restos de escrituras a medias/);
});

// La causa número uno de que la web no cargue los archivos, y hoy solo se ve
// entrando cambio a cambio en la página.
test('un proyecto cuyo repositorio ya no existe hace que doctor salga con 1', async () => {
  const datos = almacen();
  const repo = join(almacen(), 'se-lo-llevaron');
  await ejecutar(['link', '--name', 'Proyecto mudado', '--path', repo], datos);

  const { code, salida } = await ejecutar(['doctor'], datos);
  assert.equal(code, 1, salida);
  assert.match(salida, /el repositorio ya no está ahí/);
  assert.match(salida, /Vuelve a vincularlo/);
  assert.match(salida, /1 problema que revisar\./);
});

test('doctor señala el fichero corrupto y el candado, y dice qué hacer con cada uno', async () => {
  const datos = almacen();
  const repo = almacen();
  await ejecutar(['link', '--name', 'Proyecto con restos', '--path', repo], datos);
  writeFileSync(join(datos, 'projects.json.corrupto'), '{ a medias');
  mkdirSync(join(datos, 'projects', 'sub'), { recursive: true });
  writeFileSync(join(datos, 'projects', 'sub', 'changes.json.lock'), '123:abc');

  const { code, salida } = await ejecutar(['doctor'], datos);
  assert.equal(code, 1, salida);
  assert.match(salida, /El historial bueno ya está en .*projects\.json/);
  assert.match(salida, /Bloqueo puesto/);
  assert.match(salida, /2 problemas que revisar\./);
});

test('la ayuda anuncia doctor y los cuatro estados de test', async () => {
  const datos = almacen();
  const { salida } = await ejecutar([], datos);
  assert.match(salida, /^ {2}doctor\s/m);
  assert.match(salida, /--status untested\|auto\|manual\|failing/);
});

test.after(() => {
  for (const dir of temporales) rmSync(dir, { recursive: true, force: true });
});

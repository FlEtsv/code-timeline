import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveDataDir, ensureDataDirExists } from '../lib/datadir.mjs';

// resolveDataDir se prueba con raíz y home inyectados: la de verdad se
// resuelve al cargar el módulo y depende de dónde esté instalado esto, que es
// justo lo que aquí hay que poder simular.
const TMP = mkdtempSync(join(tmpdir(), 'ct-datadir-'));

function raiz(...segmentos) {
  const path = join(TMP, ...segmentos);
  mkdirSync(path, { recursive: true });
  return path;
}

function conGit(...segmentos) {
  const path = raiz(...segmentos);
  mkdirSync(join(path, '.git'), { recursive: true });
  return path;
}

test('CODE_TIMELINE_DATA manda por encima de todo lo demás', () => {
  const root = conGit('clon-con-variable');
  const elegido = resolveDataDir({
    env: { CODE_TIMELINE_DATA: join(TMP, 'elegido-a-mano') },
    root,
    home: join(TMP, 'home'),
  });
  assert.equal(elegido, join(TMP, 'elegido-a-mano'));
});

test('la variable se resuelve a absoluta, aunque llegue relativa', () => {
  const elegido = resolveDataDir({ env: { CODE_TIMELINE_DATA: 'datos-relativos' }, root: TMP, home: TMP });
  assert.equal(elegido, join(process.cwd(), 'datos-relativos'));
});

test('desde un clon del repo se sigue usando su carpeta data', () => {
  const root = conGit('clon');
  assert.equal(resolveDataDir({ env: {}, root, home: join(TMP, 'home') }), join(root, 'data'));
});

test('instalado como dependencia escribe en el home, no en node_modules', () => {
  const root = raiz('proyecto-ajeno', 'node_modules', 'code-timeline');
  const home = join(TMP, 'home');
  assert.equal(resolveDataDir({ env: {}, root, home }), join(home, '.code-timeline'));
});

// El caso que bloqueaba publicar: `npm install <ruta>` o un enlace pueden
// dejar un .git dentro de node_modules, y entonces la regla del clon sola
// mandaría el historial a un directorio que borra cualquier reinstalación.
test('un .git dentro de node_modules no cuela como clon', () => {
  const root = conGit('otro-proyecto', 'node_modules', 'code-timeline');
  const home = join(TMP, 'home');
  assert.equal(resolveDataDir({ env: {}, root, home }), join(home, '.code-timeline'));
});

test('instalado global (sin .git y sin node_modules) también va al home', () => {
  const root = raiz('opt', 'code-timeline');
  const home = join(TMP, 'home');
  assert.equal(resolveDataDir({ env: {}, root, home }), join(home, '.code-timeline'));
});

test('el directorio del home se crea si no existe', () => {
  const dir = join(TMP, 'home-nuevo', '.code-timeline');
  assert.equal(existsSync(dir), false);
  ensureDataDirExists(dir);
  assert.equal(existsSync(dir), true);
});

// store.mjs y webproc.mjs tienen que apuntar al MISMO sitio: si cada uno
// calculase la ruta por su cuenta, el pid del servidor web acabaría lejos de
// los datos y web_status miraría donde no es. Va en un proceso aparte porque
// ambos módulos fijan su directorio al cargarse, y este fichero ya los ha
// cargado (o los cargará) con el entorno de verdad.
test('el almacén y el pid del servidor web comparten directorio', () => {
  const datos = mkdtempSync(join(tmpdir(), 'ct-datadir-juntos-'));
  const guion = join(datos, 'comprobar.mjs');
  const libUrl = new URL('../lib/', import.meta.url).href;
  writeFileSync(guion, `
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from ${JSON.stringify(libUrl + 'datadir.mjs')};
import { createProject } from ${JSON.stringify(libUrl + 'store.mjs')};
import { webStatus } from ${JSON.stringify(libUrl + 'webproc.mjs')};

createProject({ name: 'Proyecto', repoPath: process.cwd() });
// webStatus lee el fichero del pid: si lo busca donde acabamos de dejarlo,
// es que webproc usa el mismo directorio que el almacén.
writeFileSync(join(DATA_DIR, 'webserver.json'), JSON.stringify({ pid: process.pid, port: 4173 }));
console.log(JSON.stringify({ dataDir: DATA_DIR, pid: (webStatus() || {}).pid }));
`);

  const salida = spawnSync(process.execPath, [guion], {
    env: { ...process.env, CODE_TIMELINE_DATA: datos },
    encoding: 'utf8',
  });
  assert.equal(salida.status, 0, salida.stderr);
  const visto = JSON.parse(salida.stdout.trim());

  assert.equal(visto.dataDir, datos);
  assert.equal(existsSync(join(datos, 'projects.json')), true);
  assert.equal(typeof visto.pid, 'number');

  rmSync(datos, { recursive: true, force: true });
});

test.after(() => { rmSync(TMP, { recursive: true, force: true }); });

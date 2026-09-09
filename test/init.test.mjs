import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../bin/cli.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const temporales = [];

function dirTemp(prefijo) {
  const dir = mkdtempSync(join(tmpdir(), prefijo));
  temporales.push(dir);
  return dir;
}

// Se lanza el CLI de verdad como proceso aparte, igual que test/doctor.test.mjs:
// lo que se comprueba es la salida y el estado en disco, no las llamadas internas.
function ejecutar(args, env) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    hijo.stdout.on('data', (chunk) => { salida += chunk; });
    hijo.stderr.on('data', (chunk) => { salida += chunk; });
    hijo.on('error', reject);
    hijo.on('close', (code) => resolve({ code, salida }));
  });
}

// Un "claude" de mentira: entiende "mcp list" y "mcp add" y guarda lo
// registrado en un fichero JSON, para que una segunda llamada al CLI vea el
// mismo estado que dejó la primera. init.js lo lanza con el mismo node que
// está corriendo el test (ver ejecutarClaude en bin/cli.mjs) precisamente
// para que esto funcione igual en Windows y en Linux sin depender de un
// binario real ni de un shell.
function claudeFalso(dir) {
  const script = join(dir, 'claude-falso.mjs');
  writeFileSync(script, `
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const estado = process.env.FAKE_CLAUDE_ESTADO;
const args = process.argv.slice(2);
function leer() { return existsSync(estado) ? JSON.parse(readFileSync(estado, 'utf8')) : []; }
if (args[0] === 'mcp' && args[1] === 'list') {
  for (const nombre of leer()) console.log(\`\${nombre}: node algo.mjs - Connected\`);
  process.exit(0);
}
if (args[0] === 'mcp' && args[1] === 'add') {
  const idx = args.indexOf('--');
  const nombre = idx > 0 ? args[idx - 1] : args[args.length - 1];
  const registrados = leer();
  if (!registrados.includes(nombre)) registrados.push(nombre);
  writeFileSync(estado, JSON.stringify(registrados));
  process.exit(0);
}
process.exit(1);
`);
  return script;
}

function envConClaudeFalso(datos, estado, claude) {
  return {
    CODE_TIMELINE_DATA: datos,
    CODE_TIMELINE_CLAUDE: claude,
    FAKE_CLAUDE_ESTADO: estado,
  };
}

test('primera ejecución: registra el MCP, vincula el repo y crea el bloque en CLAUDE.md', async () => {
  const datos = dirTemp('ct-init-datos-');
  const repo = dirTemp('ct-init-repo-');
  const soporte = dirTemp('ct-init-soporte-');
  const claude = claudeFalso(soporte);
  const estado = join(soporte, 'estado.json');

  const { code, salida } = await ejecutar(
    ['init', '--path', repo, '--name', 'Proyecto Init'],
    envConClaudeFalso(datos, estado, claude),
  );

  assert.equal(code, 0, salida);
  assert.match(salida, /MCP "code-timeline" registrado en scope user/);
  assert.match(salida, /Proyecto vinculado: /);
  assert.match(salida, /CLAUDE\.md: bloque de uso creado/);

  // El "claude" de mentira quedó con el MCP anotado.
  assert.deepEqual(JSON.parse(readFileSync(estado, 'utf8')), ['code-timeline']);

  // El proyecto quedó vinculado de verdad, contra este repo.
  const { salida: listado } = await ejecutar(['projects'], { CODE_TIMELINE_DATA: datos });
  assert.match(listado, /Proyecto Init/);
  assert.ok(listado.includes(repo), 'debe listar la ruta del repo vinculado');

  // El CLAUDE.md del repo lleva el bloque delimitado con el id del proyecto.
  const claudeMdPath = join(repo, 'CLAUDE.md');
  assert.ok(existsSync(claudeMdPath));
  const contenido = readFileSync(claudeMdPath, 'utf8');
  assert.match(contenido, /<!-- code-timeline:start -->/);
  assert.match(contenido, /<!-- code-timeline:end -->/);
  assert.match(contenido, /add_change/);
  assert.match(contenido, /propose_change/);
});

test('segunda ejecución: no cambia nada y cada paso se reporta como ya hecho', async () => {
  const datos = dirTemp('ct-init-datos-');
  const repo = dirTemp('ct-init-repo-');
  const soporte = dirTemp('ct-init-soporte-');
  const claude = claudeFalso(soporte);
  const estado = join(soporte, 'estado.json');
  const env = envConClaudeFalso(datos, estado, claude);

  const primera = await ejecutar(['init', '--path', repo, '--name', 'Proyecto Init'], env);
  assert.equal(primera.code, 0, primera.salida);

  const claudeMdPath = join(repo, 'CLAUDE.md');
  const contenidoTrasPrimera = readFileSync(claudeMdPath, 'utf8');

  const { code, salida } = await ejecutar(['init', '--path', repo, '--name', 'Proyecto Init'], env);

  assert.equal(code, 0, salida);
  assert.match(salida, /MCP "code-timeline" ya estaba registrado en scope user — omitido/);
  assert.match(salida, /Proyecto ya vinculado \(.+\) — omitido/);
  assert.match(salida, /CLAUDE\.md ya tenía el bloque de uso al día — omitido/);

  // Ni el MCP se duplica, ni el CLAUDE.md cambia una coma.
  assert.deepEqual(JSON.parse(readFileSync(estado, 'utf8')), ['code-timeline']);
  assert.equal(readFileSync(claudeMdPath, 'utf8'), contenidoTrasPrimera);

  // Ni hay un segundo proyecto vinculado al mismo repo.
  const { salida: listado } = await ejecutar(['projects'], { CODE_TIMELINE_DATA: datos });
  assert.equal((listado.match(/Proyecto Init/g) || []).length, 1);
});

test('un CLAUDE.md ya existente conserva su contenido y gana el bloque al final', async () => {
  const datos = dirTemp('ct-init-datos-');
  const repo = dirTemp('ct-init-repo-');
  const soporte = dirTemp('ct-init-soporte-');
  const claude = claudeFalso(soporte);
  const estado = join(soporte, 'estado.json');

  const claudeMdPath = join(repo, 'CLAUDE.md');
  writeFileSync(claudeMdPath, '# Mi proyecto\n\nInstrucciones que ya tenía antes de nada.\n');

  const { code, salida } = await ejecutar(
    ['init', '--path', repo],
    envConClaudeFalso(datos, estado, claude),
  );

  assert.equal(code, 0, salida);
  const contenido = readFileSync(claudeMdPath, 'utf8');
  assert.match(contenido, /Instrucciones que ya tenía antes de nada\./);
  assert.match(contenido, /<!-- code-timeline:start -->/);

  // Volver a ejecutar no debe duplicar el bloque ni tocar lo de antes.
  await ejecutar(['init', '--path', repo], envConClaudeFalso(datos, estado, claude));
  const trasSegunda = readFileSync(claudeMdPath, 'utf8');
  assert.equal((trasSegunda.match(/<!-- code-timeline:start -->/g) || []).length, 1);
  assert.match(trasSegunda, /Instrucciones que ya tenía antes de nada\./);
});

test('sin "claude" disponible, init no revienta y avisa de que hay que registrar el MCP a mano', async () => {
  const datos = dirTemp('ct-init-datos-');
  const repo = dirTemp('ct-init-repo-');

  const { code, salida } = await ejecutar(['init', '--path', repo], {
    CODE_TIMELINE_DATA: datos,
    CODE_TIMELINE_CLAUDE: join(repo, 'no-existe-de-verdad'),
  });

  assert.equal(code, 0, salida);
  assert.match(salida, /No se pudo comprobar si el MCP está registrado/);
  assert.match(salida, /claude mcp add --scope user code-timeline/);
  // Aunque falle lo de claude, el resto del comando sigue adelante.
  assert.match(salida, /Proyecto vinculado: /);
  assert.match(salida, /CLAUDE\.md: bloque de uso creado/);
});

test('con una ruta que no existe, init falla ANTES de registrar nada', async () => {
  const datos = dirTemp('ct-init-datos-');
  const soporte = dirTemp('ct-init-soporte-');
  const claude = claudeFalso(soporte);
  const estado = join(soporte, 'estado.json');
  const inexistente = join(soporte, 'no', 'existe', 'este', 'repo');

  const { code, salida } = await ejecutar(
    ['init', '--path', inexistente],
    envConClaudeFalso(datos, estado, claude),
  );

  assert.equal(code, 1, salida);
  assert.match(salida, /no existe/);
  // Nada quedó a medias: ni MCP anotado, ni proyecto vinculado.
  assert.ok(!existsSync(estado), 'no debe haber tocado el MCP');
  const { salida: listado } = await ejecutar(['projects'], { CODE_TIMELINE_DATA: datos });
  assert.doesNotMatch(listado, /no\/existe|no\\existe/);
});

test('la ayuda anuncia init', async () => {
  const datos = dirTemp('ct-init-datos-');
  const { salida } = await ejecutar([], { CODE_TIMELINE_DATA: datos });
  assert.match(salida, /^ {2}init\s/m);
  assert.match(salida, /Idempotente/);
});

test.after(() => {
  for (const dir of temporales) rmSync(dir, { recursive: true, force: true });
});

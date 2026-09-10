#!/usr/bin/env node
import {
  listProjects, getProject, createProject, listChanges, listByStatus,
  decideProposal, markApplied, setTest, exportProject, importProject, timelineHtmlPath,
  findProjectByRepo, recordQaRun, listQaRuns, stampCommits, syncReport, branchReport,
} from '../lib/store.mjs';
import { renderTimelineHtml } from '../lib/render.mjs';
import { aconsejar, cuerpoPr, sellosPendientes, comandoCommit } from '../lib/consejo.mjs';
import { renderMarkdown } from '../lib/markdown.mjs';
import { startServer } from '../lib/httpserver.mjs';
import { DATA_DIR, DATA_DIR_REASON } from '../lib/datadir.mjs';
import { webStatus } from '../lib/webproc.mjs';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [, , cmd, ...rest] = process.argv;

function flag(name, args) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

// spawn no lanza al fallar: si el programa no existe (un Linux sin xdg-open),
// lo cuenta con un evento 'error', y un 'error' sin escuchador tumba el
// proceso. Sin este on('error') el servidor se caería justo tras arrancar.
function abrirEn(comando, args) {
  const hijo = spawn(comando, args, { stdio: 'ignore', detached: true });
  hijo.on('error', () => {});
  hijo.unref();
}

function printProjects(projects) {
  if (!projects.length) {
    console.log('Sin proyectos vinculados todavía. Usa: code-timeline link --name "..." --path "..."');
    // Aquí es donde hace falta saberlo: si la lista sale vacía y el usuario
    // esperaba sus proyectos, lo primero que hay que descartar es que esté
    // mirando otro almacén (CODE_TIMELINE_DATA, o instalado fuera del repo).
    console.log(`Datos en: ${DATA_DIR}`);
    return;
  }
  for (const p of projects) {
    const prop = p.proposalCount ? `\n  propuestas: ${p.proposalCount} pendiente${p.proposalCount === 1 ? '' : 's'}` : '';
    const apl = p.acceptedCount ? `\n  por aplicar: ${p.acceptedCount}` : '';
    const pru = `\n  probados:  ${p.testedCount}${p.failingCount ? ` (${p.failingCount} falla${p.failingCount === 1 ? '' : 'n'})` : ''}`;
    console.log(`${p.id}\n  nombre:    ${p.name}\n  repo:      ${p.repoPath}\n  cambios:   ${p.changeCount}\n  revisados: ${p.verifiedCount}${pru}${prop}${apl}\n`);
  }
}

// ── doctor ──────────────────────────────────────────────────
// Las tres reglas de lib/datadir.mjs, dichas para quien no ha leído el código.
// Saber en qué carpeta está el almacén no sirve de nada sin saber POR QUÉ: eso
// es lo que dice si hay que tocar la variable de entorno, mudarse de clon, o
// nada.
const MOTIVOS_DATOS = {
  env: 'la variable de entorno CODE_TIMELINE_DATA',
  clon: 'el clon del repositorio (hay un .git en la raíz)',
  perfil: 'el directorio del perfil del usuario (instalado, sin clon a la vista)',
};

function nodeMinimo() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return pkg.engines && pkg.engines.node;
  } catch {
    return undefined;
  }
}

// Restos de una escritura que fue mal. El almacén los deja a propósito (el
// fichero ilegible es la prueba de qué pasó), pero no los explica en ningún
// sitio, y a ojo no se distingue el bueno del apartado. Cada hallazgo viene
// con la línea de qué hacer con él.
function restosDelAlmacen(dir) {
  const hallazgos = [];
  const pendientes = [dir];
  while (pendientes.length) {
    const actual = pendientes.pop();
    let entradas;
    try { entradas = readdirSync(actual, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      const ruta = join(actual, e.name);
      if (e.isDirectory()) { pendientes.push(ruta); continue; }
      if (e.name.endsWith('.corrupto')) {
        const bueno = ruta.replace(/\.corrupto$/, '');
        hallazgos.push({ ruta, aviso: `El historial bueno ya está en ${bueno}: se restauró solo desde la copia .bak. Esto es la versión ilegible que se apartó; puedes borrarla.` });
      } else if (e.name.endsWith('.lock')) {
        hallazgos.push({ ruta, aviso: 'Bloqueo puesto. Si no hay nada escribiendo ahora mismo (ni el servidor MCP ni la web), bórralo y vuelve a intentarlo.' });
      } else if (e.name.endsWith('.bak') && !existsSync(ruta.replace(/\.bak$/, ''))) {
        const principal = ruta.replace(/\.bak$/, '');
        hallazgos.push({ ruta, aviso: `Falta su fichero principal (${principal}). Cópialo con ese nombre para recuperar el historial.` });
      }
    }
  }
  return hallazgos;
}

// ── init ────────────────────────────────────────────────────
// Lo que hoy hay que hacer a mano leyendo el README para empezar a usar esto
// en un proyecto: registrar el MCP, vincular el repo y dejar dicho en su
// CLAUDE.md cómo usarlo. Los tres pasos son idempotentes: cada uno comprueba
// primero si ya está hecho antes de tocar nada.

const MCP_NAME = 'code-timeline';
const CLAUDE_BIN = process.env.CODE_TIMELINE_CLAUDE || 'claude';
const INIT_START = '<!-- code-timeline:start -->';
const INIT_END = '<!-- code-timeline:end -->';

function serverMjsPath() {
  return fileURLToPath(new URL('../server.mjs', import.meta.url));
}

// Ejecuta el binario de claude sin pasar por un shell. En las pruebas,
// CODE_TIMELINE_CLAUDE puede apuntar a un script .mjs de mentira: en ese caso
// se lanza con el mismo node que está corriendo este proceso, en vez de
// intentar ejecutarlo como si fuera un binario del sistema.
function ejecutarClaude(args) {
  const esScript = /\.[cm]?js$/.test(CLAUDE_BIN);
  return execFileSync(esScript ? process.execPath : CLAUDE_BIN, esScript ? [CLAUDE_BIN, ...args] : args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10000,
  });
}

// null: no se pudo comprobar (claude no está en el PATH, o el comando falló).
// Se trata distinto de "no registrado": registrar a ciegas cuando no se sabe
// el estado real podría duplicar la entrada.
function mcpYaRegistrado(nombre) {
  let salida;
  try {
    salida = ejecutarClaude(['mcp', 'list']);
  } catch {
    return null;
  }
  return salida.split('\n').some((linea) => linea.trim().split(/[:\s]/)[0] === nombre);
}

function registrarMcp(nombre, ruta) {
  ejecutarClaude(['mcp', 'add', '--scope', 'user', nombre, '--', 'node', ruta]);
}

function bloqueUsoClaudeMd(proyecto) {
  return [
    INIT_START,
    '## Code Timeline',
    '',
    `Repositorio vinculado a Code Timeline como \`${proyecto.id}\`. El MCP ` +
      '`code-timeline` está en scope user, así que cualquier sesión de Claude Code ' +
      'aquí ya puede usarlo sin nada más que instalar.',
    '',
    'Registra cada cambio de código nada más hacerlo, con `add_change` — el porqué, ' +
      'mientras esté fresco, no reconstruido al final. Lo que veas mejorable pero no ' +
      'toque el encargo, con `propose_change`, para decidirlo luego en la web en vez ' +
      'de perderlo al cerrar el chat. Antes de ponerte a trabajar aquí, revisa ' +
      '`list_proposals` con `status: "accepted"`: es el único sitio donde consta si ' +
      'se aceptó algo entre sesiones.',
    INIT_END,
  ].join('\n');
}

// Inserta o reemplaza el bloque delimitado sin tocar el resto del archivo.
function actualizarClaudeMd(ruta, bloque) {
  const existente = existsSync(ruta) ? readFileSync(ruta, 'utf8') : '';
  const patron = new RegExp(`${INIT_START}[\\s\\S]*?${INIT_END}`);
  const habiaBloque = patron.test(existente);

  const siguiente = habiaBloque ? existente.replace(patron, bloque)
    : existente.trim() ? `${existente.replace(/\s+$/, '')}\n\n${bloque}\n`
    : `${bloque}\n`;

  if (siguiente === existente) return 'sin cambios';
  writeFileSync(ruta, siguiente);
  return habiaBloque ? 'actualizado' : existente ? 'añadido' : 'creado';
}

switch (cmd) {
  case 'init': {
    const repoPath = resolve(flag('path', rest) || process.cwd());
    const name = flag('name', rest) || repoPath.split(/[\\/]/).filter(Boolean).pop() || 'proyecto';

    // Comprobar la ruta ANTES de tocar nada: los tres pasos de init mutan
    // estado (MCP en scope user, proyecto en el store, CLAUDE.md), y si la ruta
    // no existe se quedaban registrados apuntando a la nada, a medias.
    if (!existsSync(repoPath)) {
      console.error(`code-timeline init: la ruta "${repoPath}" no existe.`);
      process.exit(1);
    }
    if (!existsSync(join(repoPath, '.git'))) {
      // Aviso, no error: code-timeline lee git (sync, sellar, git_advice) pero
      // vincular en si no lo exige, igual que `code-timeline link`.
      console.log(`⚠ "${repoPath}" no parece un repositorio git (no hay .git): `
        + `sync, sellar y el copiloto de git no tendran de donde leer.\n`);
    }

    console.log(`code-timeline init — ${repoPath}\n`);

    const registrado = mcpYaRegistrado(MCP_NAME);
    if (registrado === true) {
      console.log(`✔ MCP "${MCP_NAME}" ya estaba registrado en scope user — omitido`);
    } else if (registrado === null) {
      console.log(`✘ No se pudo comprobar si el MCP está registrado (¿"claude" en el PATH?) — omitido. A mano:`);
      console.log(`  claude mcp add --scope user ${MCP_NAME} -- node "${serverMjsPath()}"`);
    } else {
      try {
        registrarMcp(MCP_NAME, serverMjsPath());
        console.log(`✔ MCP "${MCP_NAME}" registrado en scope user`);
      } catch (err) {
        console.log(`✘ No se pudo registrar el MCP: ${err.message}`);
      }
    }

    let proyecto = findProjectByRepo(repoPath);
    if (proyecto) {
      console.log(`✔ Proyecto ya vinculado (${proyecto.id}) — omitido`);
    } else {
      proyecto = createProject({ name, repoPath });
      console.log(`✔ Proyecto vinculado: ${proyecto.id}`);
    }

    const claudeMdPath = join(repoPath, 'CLAUDE.md');
    const resultado = actualizarClaudeMd(claudeMdPath, bloqueUsoClaudeMd(proyecto));
    console.log(resultado === 'sin cambios'
      ? '✔ CLAUDE.md ya tenía el bloque de uso al día — omitido'
      : `✔ CLAUDE.md: bloque de uso ${resultado}`);
    break;
  }

  case 'sync': {
    try {
      const id = rest[0] && !rest[0].startsWith('--') ? rest[0] : flag('repo', rest) || process.cwd();
      const branch = flag('branch', rest) || undefined;
      const report = syncReport(id, { branch });
      console.log(report.message + (branch ? ` en ${branch}` : ''));
      for (const gap of report.gaps) console.log(`  ${JSON.stringify(gap.file)}: ${gap.reason}`);
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
    }
    break;
  }

  case 'branches': {
    try {
      const id = rest[0] && !rest[0].startsWith('--') ? rest[0] : flag('repo', rest) || process.cwd();
      const rep = branchReport(id, { fetch: rest.includes('--fetch') });
      console.log(`rama principal: ${rep.principal || '(ninguna)'}`);
      console.log('');
      const fila = (r) => {
        const marca = r.nombre === rep.ramaActual ? '* ' : '  ';
        const pos = r.remota ? '(remota)'
          : `▲${r.adelante ?? '?'} ▼${r.atras ?? '?'}${r.fusionada ? ' fusionada' : ''}`;
        const huecos = r.sinRegistrar == null ? '' : `${r.sinRegistrar} sin registrar`;
        return `${marca}${r.nombre.padEnd(34)} ${pos.padEnd(22)} ${String(r.entradas).padStart(3)} entr  ${huecos}`;
      };
      for (const r of rep.ramas) console.log(fila(r));
      if (!rep.ramas.length) console.log('(no hay más ramas que la principal)');
    } catch (err) {
      console.error(err.message);
      process.exitCode = 1;
    }
    break;
  }

  case 'projects': {
    printProjects(listProjects());
    break;
  }

  case 'link': {
    const name = flag('name', rest);
    const path = flag('path', rest);
    const remote = flag('remote', rest);
    if (!name || !path) {
      console.error('Uso: code-timeline link --name "Nombre" --path "/ruta/al/repo" [--remote "git@..."]');
      process.exit(1);
    }
    const p = createProject({ name, repoPath: path, githubRemote: remote });
    console.log(`Vinculado: ${p.id}`);
    break;
  }

  case 'changes': {
    const id = rest[0];
    if (!id) { console.error('Uso: code-timeline changes <projectId> [--limit N]'); process.exit(1); }
    const limit = flag('limit', rest);
    const changes = listChanges(id, limit ? Number(limit) : undefined);
    if (!changes.length) { console.log('Sin cambios registrados aún.'); break; }
    for (const c of changes) {
      const files = (c.files || []).map((f) => f.file + (f.lineStart ? ':' + f.lineStart : '')).join(', ');
      console.log(`[${c.relation.type}] ${c.date}  ${files}\n  ${c.title}\n`);
    }
    break;
  }

  case 'proposals': {
    const id = rest[0];
    if (!id) { console.error('Uso: code-timeline proposals <projectId> [--accepted|--rejected]'); process.exit(1); }
    const status = rest.includes('--rejected') ? 'rejected' : rest.includes('--accepted') ? 'accepted' : 'proposal';
    const list = listByStatus(id, status);
    if (!list.length) {
      console.log(status === 'rejected' ? 'Sin propuestas descartadas.'
        : status === 'accepted' ? 'Sin propuestas aceptadas pendientes de aplicar.'
        : 'Sin propuestas pendientes.');
      break;
    }
    for (const c of list) {
      const files = (c.files || []).map((f) => f.file).join(', ');
      console.log(`${c.id}\n  ${c.title}\n  ${files}${c.decisionNote ? '\n  motivo: ' + c.decisionNote : ''}\n`);
    }
    break;
  }

  case 'decide': {
    const [id, changeId, decision] = rest;
    if (!id || !changeId || (decision !== 'accept' && decision !== 'reject')) {
      console.error('Uso: code-timeline decide <projectId> <changeId> accept|reject [--note "motivo"]');
      process.exit(1);
    }
    const out = decideProposal(id, changeId, { decision, note: flag('note', rest) });
    console.log(`${out.title}\n  ${decision === 'accept' ? 'aceptada: ya es un cambio del historial' : 'descartada'}`);
    break;
  }

  case 'applied': {
    const [id, changeId] = rest;
    if (!id || !changeId) { console.error('Uso: code-timeline applied <projectId> <changeId> [--commit sha]'); process.exit(1); }
    const out = markApplied(id, changeId, { commit: flag('commit', rest) });
    console.log(`${out.title}\n  ya es un cambio del historial, pendiente de revisar`);
    break;
  }

  case 'test': {
    const [id, changeId] = rest;
    if (!id || !changeId) {
      console.error('Uso: code-timeline test <projectId> <changeId> [--status auto|manual|failing|untested] [--command "..."] [--note "..."]');
      process.exit(1);
    }
    const out = setTest(id, changeId, {
      status: flag('status', rest),
      command: flag('command', rest),
      note: flag('note', rest),
    });
    console.log(`${out.title}\n  prueba: ${out.test.status}${out.test.command ? ' · ' + out.test.command : ''}`);
    break;
  }

  // Pensado para que lo llame un arnés externo al terminar (qabot y
  // compañía). Si el repo no está vinculado NO es un error: sale con 0 y sin
  // ruido, para que quien lo invoque no tenga que saber nada de esto ni se
  // rompa su ciclo por una herramienta que a lo mejor ni está.
  case 'qa': {
    const repo = flag('repo', rest) || process.cwd();
    const proyecto = findProjectByRepo(repo);
    if (!proyecto) break;

    if (rest.includes('--listar')) {
      const runs = listQaRuns(proyecto.id, Number(flag('limit', rest)) || 10);
      if (!runs.length) { console.log('Sin ejecuciones de QA registradas.'); break; }
      for (const r of runs) {
        console.log(`${r.result === 'verde' ? '✔' : '✘'} ${r.at}  ${r.environment || '-'}  ${r.command}`);
      }
      break;
    }

    const result = flag('resultado', rest);
    if (!result) { console.error('Uso: code-timeline qa --resultado verde|rojo [--comando "..."] [--entorno staging] [--detalle "..."] [--repo ruta]'); process.exit(1); }
    const run = recordQaRun(proyecto.id, {
      result,
      command: flag('comando', rest),
      environment: flag('entorno', rest),
      detail: flag('detalle', rest),
    });
    console.log(`${proyecto.id}: QA ${run.result}${run.environment ? ' en ' + run.environment : ''}`);
    break;
  }

  // ── Copiloto de git ───────────────────────────────────────
  // Los tres comandos leen git y no lo escriben: imprimen lo que convendría
  // hacer y el comando para hacerlo. Quien commitea es el usuario.

  case 'consejo': {
    const repo = flag('repo', rest) || process.cwd();
    const proyecto = rest[0] && !rest[0].startsWith('--') ? getProject(rest[0]) : findProjectByRepo(repo);
    if (!proyecto) { console.error(`No hay ningún proyecto vinculado para ${repo}.`); process.exit(1); }
    const r = aconsejar(proyecto, listChanges(proyecto.id));
    if (!r.git) { console.log(`${proyecto.name}: no es un repositorio git.`); break; }

    const estado = r.git.estado && r.git.estado.limpio
      ? 'árbol limpio'
      : `${r.git.estado.modificados.length + r.git.estado.sinSeguimiento.length} archivo(s) sin commitear`;
    console.log(`${proyecto.name} · ${r.git.rama || 'sin rama'} · ${estado}`);
    if (r.git.ultimoCommit) console.log(`último commit ${r.git.ultimoCommit.hash} — ${r.git.ultimoCommit.asunto}`);
    console.log('');

    if (!r.consejos.length) { console.log('Nada que hacer con git ahora mismo.'); break; }
    for (const c of r.consejos) {
      console.log(`${c.nivel === 'aviso' ? '!' : '·'} ${c.titulo}`);
      console.log(`  ${c.detalle}`);
      for (const cmd of c.comandos || []) console.log(`  $ ${cmd.texto.split('\n')[0]}${cmd.texto.includes('\n') ? ' …' : ''}`);
      console.log('');
    }
    if (r.mensaje) {
      console.log('Mensaje de commit propuesto:');
      console.log(comandoCommit(r.mensaje));
    }
    break;
  }

  case 'sellar': {
    const id = flag('proyecto', rest) || rest[0];
    const proyecto = id ? getProject(id) : findProjectByRepo(flag('repo', rest) || process.cwd());
    if (!proyecto) { console.error('Uso: code-timeline sellar --proyecto <projectId> [--simular]'); process.exit(1); }
    const changes = listChanges(proyecto.id);
    const sellos = sellosPendientes(proyecto, changes, aconsejar(proyecto, changes).git);
    if (!sellos.length) { console.log('No hay ninguna entrada que sellar.'); break; }
    if (rest.includes('--simular')) {
      for (const s2 of sellos) console.log(`${s2.commit}  ${s2.title}`);
      console.log(`\n${sellos.length} entrada(s) se sellarían. Sin --simular se escriben.`);
      break;
    }
    const hecho = stampCommits(proyecto.id, sellos);
    for (const e of hecho.entradas) console.log(`${e.commit}  ${e.title}`);
    console.log(`\n${hecho.sellados} entrada(s) selladas.`);
    break;
  }

  case 'pr': {
    const id = rest[0] && !rest[0].startsWith('--') ? rest[0] : null;
    const proyecto = id ? getProject(id) : findProjectByRepo(flag('repo', rest) || process.cwd());
    if (!proyecto) { console.error('Uso: code-timeline pr [<projectId>] [--out ruta]'); process.exit(1); }
    const changes = listChanges(proyecto.id);
    const pr = cuerpoPr(proyecto, changes, aconsejar(proyecto, changes).git);
    if (!pr) { console.log('No hay entradas registradas en esta rama.'); break; }
    const out = flag('out', rest);
    if (out && out !== '-') { writeFileSync(resolve(out), pr.texto); console.log(`Escrito en ${resolve(out)}`); }
    else console.log(pr.texto);
    break;
  }

  case 'export': {
    const id = rest[0];
    if (!id) { console.error('Uso: code-timeline export <projectId> [--format json|md] [--out ruta]'); process.exit(1); }
    const format = flag('format', rest) || 'json';
    if (format !== 'json' && format !== 'md') { console.error('--format debe ser json o md'); process.exit(1); }
    const project = getProject(id);
    const body = format === 'json'
      ? JSON.stringify(exportProject(id), null, 2)
      : renderMarkdown(project, listChanges(id));
    const out = flag('out', rest);
    if (out === '-') { process.stdout.write(body); break; }
    const path = out ? resolve(out) : timelineHtmlPath(id).replace(/timeline\.html$/, `export.${format}`);
    writeFileSync(path, body);
    console.log(path);
    break;
  }

  case 'import': {
    const file = rest[0];
    if (!file) { console.error('Uso: code-timeline import <fichero.json> [--merge <projectId>] [--repo <ruta>]'); process.exit(1); }
    const target = flag('merge', rest);
    const bundle = JSON.parse(readFileSync(resolve(file), 'utf8'));
    const out = importProject(bundle, {
      mode: target ? 'merge' : 'new',
      targetId: target,
      repoPath: flag('repo', rest),
    });
    console.log(`${out.projectId}: ${out.imported} entrada${out.imported === 1 ? '' : 's'} importada${out.imported === 1 ? '' : 's'}` +
      (out.skipped ? `, ${out.skipped} ya estaba${out.skipped === 1 ? '' : 'n'}` : ''));
    break;
  }

  case 'render': {
    const id = rest[0];
    if (!id) { console.error('Uso: code-timeline render <projectId>'); process.exit(1); }
    const project = getProject(id);
    const changes = listChanges(id);
    const html = renderTimelineHtml(project, changes);
    const path = timelineHtmlPath(id);
    writeFileSync(path, html);
    console.log(path);
    break;
  }

  case 'serve': {
    const portArg = flag('port', rest);
    const port = portArg ? Number(portArg) : 4173;
    const host = flag('host', rest) || '127.0.0.1';
    const server = await startServer({ port, host });
    const url = `http://localhost:${port}`;
    console.log(`code-timeline corriendo en ${url}  (Ctrl+C para parar)`);
    // Salir de la máquina no puede pasar en silencio: aquí se sirve el código
    // del usuario y sus notas, y la API de escritura no pide credenciales.
    if (host !== '127.0.0.1' && host !== 'localhost') {
      console.log(`AVISO: escuchando en ${host} — la web queda accesible desde otros equipos de la red, y quien la abra puede leer tu código y tus notas y marcar cambios como revisados.`);
    }
    if (rest.includes('--open')) {
      if (process.platform === 'win32') {
        abrirEn('cmd', ['/c', 'start', '', url]);
      } else if (process.platform === 'darwin') {
        abrirEn('open', [url]);
      } else {
        abrirEn('xdg-open', [url]);
      }
    }
    process.on('SIGINT', () => { server.close(() => process.exit(0)); });
    break;
  }

  case 'show': {
    const id = rest[0];
    if (!id) { console.error('Uso: code-timeline show <projectId>'); process.exit(1); }
    console.log(JSON.stringify(getProject(id), null, 2));
    break;
  }

  // Lo que rompe en silencio, en una sola pantalla: mirar un almacén que no es
  // el que uno cree, un repositorio que se movió (la web deja de enseñar los
  // archivos y hoy eso solo se ve entrando cambio a cambio), o restos de una
  // escritura que fue mal. Sale con 1 si hay algo que arreglar, para que un
  // script pueda usarlo.
  case 'doctor': {
    const problemas = [];
    const linea = (ok, texto) => console.log(`  ${ok ? '✔' : '✘'} ${texto}`);

    console.log('code-timeline doctor\n');

    console.log('Datos');
    console.log(`  directorio: ${DATA_DIR}`);
    console.log(`  regla:      ${MOTIVOS_DATOS[DATA_DIR_REASON] || DATA_DIR_REASON}`);
    // Se comprueba ANTES de listar proyectos: listProjects crea el directorio,
    // y entonces ya no se distinguiría un almacén nuevo de uno de siempre.
    if (!existsSync(DATA_DIR)) console.log('  aún no existe: se crea al vincular el primer proyecto');
    console.log('');

    const minimo = nodeMinimo();
    const mayorMinimo = minimo ? Number((minimo.match(/\d+/) || [])[0]) : NaN;
    const cumpleNode = Number.isNaN(mayorMinimo) || Number(process.versions.node.split('.')[0]) >= mayorMinimo;
    console.log('Node');
    console.log(`  versión: ${process.version}${minimo ? `   mínimo declarado: ${minimo}` : ''}`);
    linea(cumpleNode, cumpleNode ? 'la versión vale' : `por debajo del mínimo (${minimo}): actualiza node`);
    if (!cumpleNode) problemas.push('node por debajo del mínimo');
    console.log('');

    console.log('Proyectos');
    let proyectos = null;
    try {
      proyectos = listProjects();
    } catch (e) {
      linea(false, `no se puede leer el registro de proyectos: ${e.message}`);
      problemas.push('registro de proyectos ilegible');
    }
    if (proyectos) {
      console.log(`  vinculados: ${proyectos.length}`);
      for (const p of proyectos) {
        const hay = existsSync(p.repoPath);
        linea(hay, `${p.id} → ${p.repoPath}${hay ? '' : '   el repositorio ya no está ahí'}`);
        if (!hay) {
          console.log('     La web no podrá enseñar los archivos de sus cambios. Vuelve a vincularlo con la ruta nueva: code-timeline link --name "..." --path "..."');
          problemas.push(`repositorio ausente: ${p.id}`);
        }
      }
    }
    console.log('');

    console.log('Almacén');
    const restos = existsSync(DATA_DIR) ? restosDelAlmacen(DATA_DIR) : [];
    if (!restos.length) linea(true, 'sin restos de escrituras a medias');
    for (const r of restos) {
      linea(false, r.ruta);
      console.log(`     ${r.aviso}`);
      problemas.push(`resto en el almacén: ${r.ruta}`);
    }
    console.log('');

    console.log('Web');
    const web = webStatus();
    console.log(web
      ? `  ✔ corriendo en ${web.url} (puerto ${web.port}, pid ${web.pid})`
      : '  · parada. Se levanta con: code-timeline serve --port 4173');
    console.log('');

    if (!problemas.length) { console.log('Todo correcto.'); break; }
    console.log(`${problemas.length} problema${problemas.length === 1 ? '' : 's'} que revisar.`);
    process.exit(1);
  }

  default:
    console.log(`code-timeline — historial visual de cambios de código

Comandos:
  sync [<projectId>] [--branch B]       lista cambios sin registrar (solo lectura).
                                        --branch acota a los commits de esa rama
  branches [<projectId>] [--fetch]      las ramas del repo: adelante/atrás de la
                                        principal, entradas del historial y commits
                                        sin registrar por rama. --fetch trae antes
  init [--path P] [--name N]            registra el MCP en scope user, vincula el repo
                                        (el de --path, o el directorio actual) y deja un
                                        bloque de uso en su CLAUDE.md. Idempotente: cada
                                        paso que ya estaba hecho se omite y se dice
  serve [--port N] [--host H] [--open]  levanta la web en localhost (viva, con notas)
                                        --host por defecto 127.0.0.1: solo tu máquina.
                                        Otro valor la abre a la red local
  projects                              lista proyectos vinculados
  link --name N --path P [--remote R]   vincula un proyecto nuevo
  changes <projectId> [--limit N]       lista los cambios registrados
  proposals <projectId> [--accepted|--rejected]
                                        propuestas pendientes, aceptadas sin aplicar, o descartadas
  decide <projectId> <changeId> accept|reject [--note "..."]
                                        acepta o descarta una propuesta
  applied <projectId> <changeId> [--commit sha]
                                        confirma que una aceptada ya está escrita
  test <projectId> <changeId> [--status untested|auto|manual|failing] [--command "..."] [--note "..."]
                                        registra cómo se comprueba un cambio
  export <projectId> [--format json|md] [--out ruta|-]
                                        exporta el historial (json = respaldo, md = lectura)
  import <fichero.json> [--merge <projectId>] [--repo <ruta>]
                                        importa un export: proyecto nuevo, o fusiona en uno existente
  qa --resultado verde|rojo [--comando "..."] [--entorno E] [--detalle "..."] [--repo ruta]
                                        registra una ejecución de QA de un arnés externo
                                        (--listar para verlas). Silencioso si el repo no
                                        está vinculado: pensado para llamarlo desde otro script
  consejo [<projectId>] [--repo ruta]   qué convendría hacer con git: commit, rama, pruebas
                                        en rojo, entradas por sellar, deriva. Con el mensaje
                                        de commit ya redactado desde el porqué registrado
  sellar --proyecto <projectId> [--simular]
                                        apunta en cada entrada el commit que la recogió
  pr [<projectId>] [--out ruta]         cuerpo de PR desde las entradas de la rama actual
  render <projectId>                    exporta un timeline.html estático (archivo)
  show <projectId>                      metadatos completos del proyecto (JSON)
  doctor                                diagnóstico: dónde están los datos y por qué,
                                        versión de node, repositorios que ya no están,
                                        restos del almacén y estado de la web.
                                        Sale con 1 si encuentra algo que arreglar

Para AÑADIR cambios y propuestas (con diff antes/después y explicación), se
hace desde Claude Code vía el servidor MCP — es quien redacta cada entrada
mientras trabaja. Este CLI es para consultar, decidir, servir la web y
exportar. El PDF sale de la web: botón "Imprimir / PDF".`);
}

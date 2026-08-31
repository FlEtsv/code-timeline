#!/usr/bin/env node
import {
  listProjects, getProject, createProject, listChanges, listByStatus,
  decideProposal, exportProject, importProject, timelineHtmlPath,
} from '../lib/store.mjs';
import { renderTimelineHtml } from '../lib/render.mjs';
import { renderMarkdown } from '../lib/markdown.mjs';
import { startServer } from '../lib/httpserver.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const [, , cmd, ...rest] = process.argv;

function flag(name, args) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

function printProjects(projects) {
  if (!projects.length) {
    console.log('Sin proyectos vinculados todavía. Usa: code-timeline link --name "..." --path "..."');
    return;
  }
  for (const p of projects) {
    const prop = p.proposalCount ? `\n  propuestas: ${p.proposalCount} pendiente${p.proposalCount === 1 ? '' : 's'}` : '';
    console.log(`${p.id}\n  nombre:    ${p.name}\n  repo:      ${p.repoPath}\n  cambios:   ${p.changeCount}\n  revisados: ${p.verifiedCount}${prop}\n`);
  }
}

switch (cmd) {
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
    if (!id) { console.error('Uso: code-timeline proposals <projectId> [--rejected]'); process.exit(1); }
    const status = rest.includes('--rejected') ? 'rejected' : 'proposal';
    const list = listByStatus(id, status);
    if (!list.length) { console.log(status === 'rejected' ? 'Sin propuestas descartadas.' : 'Sin propuestas pendientes.'); break; }
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
    const server = await startServer({ port });
    const url = `http://localhost:${port}`;
    console.log(`code-timeline corriendo en ${url}  (Ctrl+C para parar)`);
    if (rest.includes('--open') && process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
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

  default:
    console.log(`code-timeline — historial visual de cambios de código

Comandos:
  serve [--port N] [--open]             levanta la web en localhost (viva, con notas)
  projects                              lista proyectos vinculados
  link --name N --path P [--remote R]   vincula un proyecto nuevo
  changes <projectId> [--limit N]       lista los cambios registrados
  proposals <projectId> [--rejected]    lista las propuestas pendientes (o las descartadas)
  decide <projectId> <changeId> accept|reject [--note "..."]
                                        acepta o descarta una propuesta
  export <projectId> [--format json|md] [--out ruta|-]
                                        exporta el historial (json = respaldo, md = lectura)
  import <fichero.json> [--merge <projectId>] [--repo <ruta>]
                                        importa un export: proyecto nuevo, o fusiona en uno existente
  render <projectId>                    exporta un timeline.html estático (archivo)
  show <projectId>                      metadatos completos del proyecto (JSON)

Para AÑADIR cambios y propuestas (con diff antes/después y explicación), se
hace desde Claude Code vía el servidor MCP — es quien redacta cada entrada
mientras trabaja. Este CLI es para consultar, decidir, servir la web y
exportar. El PDF sale de la web: botón "Imprimir / PDF".`);
}

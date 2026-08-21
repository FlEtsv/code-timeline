#!/usr/bin/env node
import { listProjects, getProject, createProject, listChanges, timelineHtmlPath } from '../lib/store.mjs';
import { renderTimelineHtml } from '../lib/render.mjs';
import { startServer } from '../lib/httpserver.mjs';
import { writeFileSync } from 'node:fs';
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
    console.log(`${p.id}\n  nombre:    ${p.name}\n  repo:      ${p.repoPath}\n  cambios:   ${p.changeCount}\n  revisados: ${p.verifiedCount}\n`);
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
      console.log(`[${c.relation.type}] ${c.date}  ${c.file}${c.lineStart ? ':' + c.lineStart : ''}\n  ${c.title}\n`);
    }
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
  render <projectId>                    exporta un timeline.html estático (archivo)
  show <projectId>                      metadatos completos del proyecto (JSON)

Para AÑADIR cambios (con diff antes/después y explicación), se hace desde
Claude Code vía el servidor MCP — es quien redacta cada entrada mientras
trabaja. Este CLI es para consultar, servir la web y exportar.`);
}

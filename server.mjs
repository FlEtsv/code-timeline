#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import {
  listProjects, getProject, createProject,
  listChanges, addChange, timelineHtmlPath,
} from './lib/store.mjs';
import { renderTimelineHtml } from './lib/render.mjs';
import { startWeb, stopWeb, webStatus } from './lib/webproc.mjs';

const server = new McpServer({ name: 'code-timeline', version: '1.0.0' });

function text(obj) {
  return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] };
}

server.registerTool(
  'list_projects',
  {
    title: 'Listar proyectos vinculados',
    description: 'Lista todos los proyectos registrados en Code Timeline, con su id, ruta y número de cambios registrados.',
    inputSchema: {},
  },
  async () => text(listProjects()),
);

server.registerTool(
  'link_project',
  {
    title: 'Vincular un proyecto nuevo',
    description: 'Registra un repositorio para poder llevarle un historial de cambios. Se hace una vez por proyecto.',
    inputSchema: {
      name: z.string().describe('Nombre legible del proyecto, ej. "Dashboard Inventario"'),
      repoPath: z.string().describe('Ruta absoluta al repositorio en disco'),
      githubRemote: z.string().optional().describe('URL del remoto de GitHub, si existe'),
    },
  },
  async ({ name, repoPath, githubRemote }) => text(createProject({ name, repoPath, githubRemote })),
);

server.registerTool(
  'get_project',
  {
    title: 'Ver metadatos de un proyecto',
    description: 'Devuelve los metadatos completos de un proyecto vinculado.',
    inputSchema: { projectId: z.string() },
  },
  async ({ projectId }) => text(getProject(projectId)),
);

server.registerTool(
  'add_change',
  {
    title: 'Registrar un cambio de código en el historial',
    description:
      'Añade una entrada al timeline de un proyecto: qué método/clase/atributo cambió, dónde (archivo:línea), el código antes y después, y por qué. ' +
      'Si el cambio continúa directamente al anterior, deja relationType sin especificar (por defecto "continuation"). ' +
      'Si NO tiene relación con el cambio anterior (otro commit, otro problema, otro momento), pon relationType="jump" y explica el salto en relationNote.',
    inputSchema: {
      projectId: z.string(),
      file: z.string().describe('Ruta del archivo relativa al repo, ej. "web/client/app.js"'),
      lineStart: z.number().optional().describe('Línea donde empieza el cambio en el estado actual del archivo'),
      lineEnd: z.number().optional().describe('Línea donde termina (si es una sola línea, igual a lineStart)'),
      unitType: z.string().optional().describe('Tipo de unidad: función, método, clase, atributo, llamada, config...'),
      unitName: z.string().optional().describe('Nombre de la unidad, ej. "totalCentimos()"'),
      title: z.string().describe('Resumen de una línea de qué cambió'),
      language: z.string().optional().describe('Lenguaje para el bloque de código, ej. javascript, sql, python'),
      before: z.string().nullable().optional().describe('Código anterior. null u omitido si es código nuevo que no existía'),
      after: z.string().describe('Código resultante tras el cambio'),
      explanation: z.string().describe('Qué cambió y POR QUÉ — el motivo real, no una paráfrasis del diff'),
      commit: z.string().optional().describe('Hash corto del commit, si ya existe'),
      date: z.string().optional().describe('ISO 8601; por defecto, ahora'),
      relationType: z.enum(['continuation', 'jump', 'start']).optional(),
      relationNote: z.string().optional().describe('Obligatorio si relationType="jump": explica qué distingue este cambio del anterior'),
    },
  },
  async (args) => text(addChange(args.projectId, args)),
);

server.registerTool(
  'list_changes',
  {
    title: 'Listar cambios registrados',
    description: 'Devuelve las entradas del historial de un proyecto, en orden cronológico.',
    inputSchema: { projectId: z.string(), limit: z.number().optional() },
  },
  async ({ projectId, limit }) => text(listChanges(projectId, limit)),
);

server.registerTool(
  'render_timeline',
  {
    title: 'Exportar el timeline a un HTML estático',
    description:
      'Escribe en disco una foto estática del timeline de un proyecto (para archivar o abrir sin servidor). ' +
      'La vista viva e interactiva (con "revisado" y notas) es start_web, no esto.',
    inputSchema: { projectId: z.string() },
  },
  async ({ projectId }) => {
    const project = getProject(projectId);
    const changes = listChanges(projectId);
    const html = renderTimelineHtml(project, changes);
    const path = timelineHtmlPath(projectId);
    writeFileSync(path, html);
    return text({ path, changeCount: changes.length });
  },
);

server.registerTool(
  'start_web',
  {
    title: 'Levantar la web local del timeline',
    description:
      'Arranca (o reutiliza si ya está corriendo) el servidor local del timeline y devuelve su URL. ' +
      'Úsalo cuando el usuario pida "la web", "el timeline" o "levanta el servidor". Es un servidor en su máquina, no un Artifact.',
    inputSchema: { port: z.number().optional().describe('Por defecto 4173') },
  },
  async ({ port }) => text(startWeb(port ? { port } : undefined)),
);

server.registerTool(
  'stop_web',
  {
    title: 'Parar la web local del timeline',
    description: 'Detiene el servidor local si está corriendo.',
    inputSchema: {},
  },
  async () => text(stopWeb()),
);

server.registerTool(
  'web_status',
  {
    title: 'Ver si la web local está corriendo',
    description: 'Comprueba si el servidor del timeline está activo y en qué puerto/URL.',
    inputSchema: {},
  },
  async () => text(webStatus() || { running: false }),
);

const transport = new StdioServerTransport();
await server.connect(transport);

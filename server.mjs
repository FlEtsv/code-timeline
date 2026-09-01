#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  listProjects, getProject, createProject,
  listChanges, listByStatus, addChange, addProposal, decideProposal, markApplied, setTest,
  exportProject, importProject, timelineHtmlPath,
} from './lib/store.mjs';
import { renderTimelineHtml } from './lib/render.mjs';
import { renderMarkdown } from './lib/markdown.mjs';
import { startWeb, stopWeb, webStatus } from './lib/webproc.mjs';

const server = new McpServer({ name: 'code-timeline', version: '1.0.0' });

function text(obj) {
  return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] };
}

function fileSchema(description) {
  return z.array(z.object({
    file: z.string().describe('Ruta del archivo relativa al repo, ej. "web/client/app.js"'),
    lineStart: z.number().optional().describe('Línea donde empieza el cambio en el estado actual del archivo'),
    lineEnd: z.number().optional().describe('Línea donde termina (si es una sola línea, igual a lineStart)'),
    language: z.string().optional().describe('Lenguaje para el bloque de código, ej. javascript, sql, python'),
    before: z.string().nullable().optional().describe('Código anterior en ESTE archivo. null u omitido si es código nuevo que no existía'),
    after: z.string().describe('Código resultante en ESTE archivo tras el cambio'),
  })).min(1).describe(description);
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
    title: 'Registrar un cambio de código YA APLICADO',
    description:
      'SOLO para código que ya has escrito en el repo. Si todavía no lo has tocado y lo que quieres es sugerirlo, usa propose_change. ' +
      'Añade una entrada al timeline de un proyecto: qué método/clase/atributo cambió, en qué archivo(s) — puede tocar más de uno —, ' +
      'el código antes y después de cada archivo, y por qué. Deja el código lo más completo posible, sin truncar con "...": ' +
      'el mini-editor de la web ya deja ver el archivo entero, pero el antes/después es lo primero que se lee y debe bastar por sí solo. ' +
      'Si el cambio continúa directamente al anterior, deja relationType sin especificar (por defecto "continuation"). ' +
      'Si NO tiene relación con el cambio anterior (otro commit, otro problema, otro momento), pon relationType="jump" y explica el salto en relationNote.',
    inputSchema: {
      projectId: z.string(),
      files: fileSchema('Uno por cada archivo que toca el cambio, en el orden que tenga sentido leerlos'),
      unitType: z.string().optional().describe('Tipo de unidad: función, método, clase, atributo, llamada, config...'),
      unitName: z.string().optional().describe('Nombre de la unidad, ej. "totalCentimos()"'),
      title: z.string().describe('Resumen de una línea de qué cambió'),
      explanation: z.string().describe('Qué cambió y POR QUÉ — el motivo real, no una paráfrasis del diff'),
      commit: z.string().optional().describe('Hash corto del commit, si ya existe. Se usa para leer el archivo TAL COMO ESTABA en ese commit (git show) al abrir el mini-editor'),
      date: z.string().optional().describe('ISO 8601; por defecto, ahora'),
      relationType: z.enum(['continuation', 'jump', 'start']).optional(),
      relationNote: z.string().optional().describe('Obligatorio si relationType="jump": explica qué distingue este cambio del anterior'),
      test: z.object({
        status: z.enum(['untested', 'auto', 'manual', 'failing']),
        command: z.string().optional(),
        note: z.string().optional(),
      }).optional().describe('Cómo se comprueba el cambio, si ya lo sabes. Si no, regístralo luego con set_test'),
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

server.registerTool(
  'propose_change',
  {
    title: 'Proponer un cambio que todavía NO has aplicado',
    description:
      'Registra una PROPUESTA: código que crees que habría que cambiar pero que no has tocado. Aparece aparte del historial, ' +
      'arriba, esperando que el usuario la acepte o la descarte desde la web. Aceptada, pasa a ser un cambio del historial; ' +
      'descartada, se archiva con el motivo. ' +
      'Úsalo cuando veas algo mejorable fuera del encargo, cuando haya más de un camino razonable y quieras que elija, ' +
      'o cuando el cambio sea lo bastante grande como para acordarlo antes de escribirlo. ' +
      'El "después" es el código que PROPONES, no el que existe: la vista a pantalla completa avisa de ello. ' +
      'Si el cambio ya está hecho, la herramienta correcta es add_change.',
    inputSchema: {
      projectId: z.string(),
      files: fileSchema('Los archivos que tocaría la propuesta, con el código actual en "before" y el propuesto en "after"'),
      unitType: z.string().optional().describe('Tipo de unidad: función, método, clase, atributo, config...'),
      unitName: z.string().optional().describe('Nombre de la unidad, ej. "totalCentimos()"'),
      title: z.string().describe('Resumen de una línea de qué propones'),
      explanation: z.string().describe('Qué propones y POR QUÉ: qué problema resuelve o qué mejora, y qué se pierde si no se hace'),
      date: z.string().optional().describe('ISO 8601; por defecto, ahora'),
    },
  },
  async (args) => text(addProposal(args.projectId, args)),
);

server.registerTool(
  'list_proposals',
  {
    title: 'Listar propuestas',
    description:
      'Devuelve las propuestas de un proyecto según su estado. ' +
      '"proposal" (por defecto): pendientes de que el usuario decida. ' +
      '"accepted": YA ACEPTADAS y esperando a que alguien las escriba — esto es trabajo comprometido y pendiente, ' +
      'míralo al empezar a trabajar en un proyecto y cuando el usuario diga "aplica la propuesta ..."; ' +
      'al terminar de aplicarla, llama a mark_applied. ' +
      '"rejected": descartadas, con el motivo — consúltalo antes de proponer, para no repetir algo ya rechazado.',
    inputSchema: {
      projectId: z.string(),
      status: z.enum(['proposal', 'accepted', 'rejected']).optional().describe('"proposal" (por defecto), "accepted" (aceptadas sin aplicar) o "rejected"'),
    },
  },
  async ({ projectId, status }) => text(listByStatus(projectId, status || 'proposal')),
);

server.registerTool(
  'decide_proposal',
  {
    title: 'Aceptar o descartar una propuesta',
    description:
      'Marca una propuesta como aceptada o descartada. Aceptar NO la mete en el historial: la deja en estado ' +
      '"accepted" (aprobada, pendiente de aplicar), porque en ese momento el código todavía no existe. ' +
      'Entra en el historial cuando alguien la escribe y lo confirma con mark_applied. ' +
      'La decisión es del usuario: usa esto solo cuando te lo pida explícitamente ("acepta la propuesta del carrito"), ' +
      'nunca por tu cuenta ni para dar por buena una propuesta tuya.',
    inputSchema: {
      projectId: z.string(),
      changeId: z.string().describe('id de la propuesta, de list_proposals'),
      decision: z.enum(['accept', 'reject']),
      note: z.string().optional().describe('Motivo. Muy recomendable al descartar: es lo que evita volver a proponerlo'),
    },
  },
  async ({ projectId, changeId, decision, note }) => text(decideProposal(projectId, changeId, { decision, note })),
);

server.registerTool(
  'export_project',
  {
    title: 'Exportar el historial de un proyecto',
    description:
      'Escribe el historial completo (cambios, propuestas, descartes, notas y qué está revisado) a un fichero. ' +
      'Formato "json" para respaldar o mover el proyecto a otra máquina (lo lee import_project); ' +
      '"md" para leerlo o compartirlo como texto. Como data/ no se versiona, esto es la vía de respaldo.',
    inputSchema: {
      projectId: z.string(),
      format: z.enum(['json', 'md']).optional().describe('Por defecto "json"'),
      outPath: z.string().optional().describe('Ruta absoluta del fichero a escribir. Por defecto, dentro de data/projects/<id>/'),
    },
  },
  async ({ projectId, format = 'json', outPath }) => {
    const project = getProject(projectId);
    const body = format === 'json'
      ? JSON.stringify(exportProject(projectId), null, 2)
      : renderMarkdown(project, listChanges(projectId));
    const path = outPath
      ? resolve(outPath)
      : timelineHtmlPath(projectId).replace(/timeline\.html$/, `export.${format}`);
    writeFileSync(path, body);
    return text({ path, format, bytes: Buffer.byteLength(body) });
  },
);

server.registerTool(
  'import_project',
  {
    title: 'Importar un historial exportado',
    description:
      'Lee un fichero JSON de export_project. Por defecto crea un proyecto NUEVO con ese historial. ' +
      'Con mode="merge" y targetId, añade a un proyecto existente solo las entradas que le falten (compara por id, ' +
      'así que reimportar el mismo fichero dos veces no duplica nada).',
    inputSchema: {
      filePath: z.string().describe('Ruta al .json exportado'),
      mode: z.enum(['new', 'merge']).optional().describe('Por defecto "new"'),
      targetId: z.string().optional().describe('Obligatorio con mode="merge"'),
      repoPath: z.string().optional().describe('Ruta del repo en ESTA máquina, si difiere de la del export'),
    },
  },
  async ({ filePath, mode, targetId, repoPath }) => {
    const bundle = JSON.parse(readFileSync(resolve(filePath), 'utf8'));
    return text(importProject(bundle, { mode: mode || 'new', targetId, repoPath }));
  },
);

server.registerTool(
  'mark_applied',
  {
    title: 'Confirmar que una propuesta aceptada ya está escrita',
    description:
      'Cierra el círculo de una propuesta: pasa de "aceptada" a cambio del historial. Llámalo DESPUÉS de haber ' +
      'escrito el código de verdad en el repo, nunca antes — el historial dice lo que está en el código. ' +
      'Pasa en "files" lo que realmente escribiste: casi nunca es idéntico a lo propuesto, y lo que hay que guardar ' +
      'es lo aplicado, no lo sugerido. La entrada se recoloca con la fecha de hoy y vuelve a "pendiente de revisar", ' +
      'para que el usuario la verifique como cualquier otro cambio.',
    inputSchema: {
      projectId: z.string(),
      changeId: z.string().describe('id de la propuesta aceptada, de list_proposals con status="accepted"'),
      files: fileSchema('El código REAL que escribiste. Omítelo solo si aplicaste la propuesta tal cual, sin un carácter de diferencia').optional(),
      commit: z.string().optional().describe('Hash corto del commit, si ya lo hiciste'),
      note: z.string().optional().describe('Qué cambió respecto a lo propuesto, si hubo que desviarse'),
    },
  },
  async ({ projectId, changeId, files, commit, note }) => text(markApplied(projectId, changeId, { files, commit, note })),
);

server.registerTool(
  'set_test',
  {
    title: 'Registrar cómo se comprueba un cambio',
    description:
      'Deja constancia de cómo se prueba una entrada del historial. Es distinto de "revisado": revisar es que el ' +
      'usuario lo haya leído; probar es que algo lo haya ejecutado. Un cambio puede estar revisado y sin probar. ' +
      'Llámalo cuando escribas o ejecutes una prueba que cubra el cambio, y di la verdad: si el test falla, ' +
      'status="failing" — un historial donde solo consta lo que funciona miente por omisión. ' +
      'status="auto" exige el comando que la ejecuta: sin él la prueba no se puede repetir.',
    inputSchema: {
      projectId: z.string(),
      changeId: z.string(),
      status: z.enum(['untested', 'auto', 'manual', 'failing']).optional()
        .describe('"auto" (hay test y pasa), "manual" (comprobado a mano), "failing" (probado y falla), "untested"'),
      command: z.string().optional().describe('El comando que ejecuta la prueba, ej. npm test -- carrito. Obligatorio con status="auto"'),
      note: z.string().optional().describe('Qué cubre la prueba, o cómo se comprobó a mano y con qué datos'),
    },
  },
  async ({ projectId, changeId, status, command, note }) => text(setTest(projectId, changeId, { status, command, note })),
);

const transport = new StdioServerTransport();
await server.connect(transport);

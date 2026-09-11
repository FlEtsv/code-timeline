#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { cobertura } from './lib/coverage.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  listProjects, getProject, createProject,
  listChanges, listByStatus, addChange, addProposal, decideProposal, markApplied, setTest,
  exportProject, importProject, timelineHtmlPath, stampCommits, resumirCambio, getChange, buscar,
  resolveProject,
} from './lib/store.mjs';
import { aconsejar, cuerpoPr, sellosPendientes, comandoCommit } from './lib/consejo.mjs';
import { renderTimelineHtml } from './lib/render.mjs';
import { renderMarkdown } from './lib/markdown.mjs';
import { startWeb, stopWeb, webStatus } from './lib/webproc.mjs';

const server = new McpServer({ name: 'code-timeline', version: '1.0.0' });
const SOLO_LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
const ESCRITURA_SEGURA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };

// Devuelve el id canónico admitiendo también la ruta del repo. La resolución
// vive en el almacén (getProject); esto solo la normaliza antes de pasarla a
// las funciones que esperan un id de verdad.
const PROJECT_ID = z.string().describe(
  'El id del proyecto, o la ruta del repo — con la ruta te ahorras llamar a list_projects para averiguar el id',
);

function pid(clave) {
  return resolveProject(clave).id;
}

// JSON compacto, sin indentar: esto lo lee un modelo, no una persona, y la
// indentación era un 12% de todo lo que devuelven las herramientas — puros
// espacios en blanco por los que se paga igual.
function text(obj) {
  return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] };
}

function fileSchema(description) {
  return z.array(z.object({
    file: z.string().describe('Ruta del archivo relativa al repo, ej. "web/client/app.js"'),
    lineStart: z.number().optional().describe('Línea donde empieza el cambio. Opcional: acota la captura cuando en el mismo archivo hay varios cambios sueltos y solo uno es de esta entrada'),
    lineEnd: z.number().optional().describe('Línea donde termina (si es una sola línea, igual a lineStart)'),
    language: z.string().optional().describe('Lenguaje del bloque de código. Opcional: por defecto se deduce de la extensión'),
    before: z.string().nullable().optional().describe('NO LO ESCRIBAS salvo que el código no esté en git. Se captura solo'),
    after: z.string().optional().describe('NO LO ESCRIBAS salvo que el código no esté en git (lo editaste fuera del repo, o quieres enseñar un fragmento distinto del diff). Se captura solo de git diff'),
  })).min(1).describe(description);
}

server.registerTool(
  'list_projects',
  {
    title: 'Listar proyectos vinculados',
    annotations: SOLO_LECTURA,
    description: 'Lista todos los proyectos registrados en Code Timeline, con su id, ruta y número de cambios registrados.',
    inputSchema: {},
  },
  // Solo lo que sirve para elegir un proyecto y saber si tiene algo pendiente.
  // Devolver los ocho contadores costaba 530 tokens por llamada para que casi
  // siempre se leyera una línea.
  async () => text(listProjects().map((p) => ({
    id: p.id,
    name: p.name,
    repoPath: p.repoPath,
    cambios: p.changeCount,
    ...(p.proposalCount ? { propuestasPendientes: p.proposalCount } : {}),
    ...(p.acceptedCount ? { aceptadasSinAplicar: p.acceptedCount } : {}),
    ...(p.failingCount ? { pruebasEnRojo: p.failingCount } : {}),
  }))),
);

server.registerTool(
  'link_project',
  {
    title: 'Vincular un proyecto nuevo',
    annotations: ESCRITURA_SEGURA,
    description: 'Registra un repositorio para poder llevarle un historial de cambios. Se hace una vez por proyecto.',
    inputSchema: {
      name: z.string().describe('Nombre legible del proyecto, ej. "Dashboard Inventario"'),
      repoPath: z.string().describe('Ruta absoluta al repositorio en disco'),
      githubRemote: z.string().optional().describe('URL del remoto de GitHub, si existe'),
      storageMode: z.enum(['private', 'versioned']).optional().describe('"private" guarda fuera del repo; "versioned" usa .code-timeline/index.json y un archivo por entrada'),
    },
  },
  async ({ name, repoPath, githubRemote, storageMode }) => text(createProject({ name, repoPath, githubRemote, storageMode })),
);

server.registerTool(
  'get_project',
  {
    title: 'Ver metadatos de un proyecto',
    annotations: SOLO_LECTURA,
    description: 'Devuelve los metadatos completos de un proyecto vinculado.',
    inputSchema: { projectId: z.string() },
  },
  async ({ projectId }) => text(getProject(pid(projectId))),
);

server.registerTool(
  'add_change',
  {
    title: 'Registrar un cambio de código YA APLICADO',
    annotations: ESCRITURA_SEGURA,
    description:
      'SOLO para código que ya has escrito en el repo. Si todavía no lo has tocado y lo que quieres es sugerirlo, usa propose_change. ' +
      'Se registra TODO cambio de código, sin filtrar por importancia: un renombrado, un texto de UI o un ajuste de formato ' +
      'llevan entrada igual que un refactor — no decides tú qué merece constar, y si el motivo es que lo pidió el usuario, eso es lo que va en explanation. ' +
      'Añade una entrada al timeline de un proyecto: qué método/clase/atributo cambió, en qué archivo(s) — puede tocar más de uno —, ' +
      'y por qué. NO ESCRIBAS el código: basta con la ruta de cada archivo — el antes/después se captura solo de git diff, ' +
      'que es exacto y no te cuesta tokens. Escribe "after" a mano solo si el código no está en git (lo editaste fuera del repo) ' +
      'o si quieres enseñar un fragmento distinto del que saldría del diff. ' +
      'EXPLICA LAS LÍNEAS QUE NO SE ENTIENDEN SOLAS en "explicaLineas": acabas de escribir ese código y lo tienes en contexto, ' +
      'así que hacerlo ahora sale 4 veces más barato y 2,5 veces más rápido que pedirlo después desde la web —que tiene que ' +
      'arrancar una sesión aparte solo para leerlo—, y sale mejor, porque tú sabes por qué está escrito así. ' +
      'No expliques lo obvio: un renombrado o un ajuste de formato no necesitan nada, y una llave de cierre tampoco. ' +
      'Si el cambio continúa directamente al anterior, deja relationType sin especificar (por defecto "continuation"). ' +
      'Si NO tiene relación con el cambio anterior (otro commit, otro problema, otro momento), pon relationType="jump" y explica el salto en relationNote.',
    inputSchema: {
      projectId: PROJECT_ID,
      files: fileSchema('Uno por cada archivo que toca el cambio, en el orden que tenga sentido leerlos'),
      unitType: z.string().optional().describe('Tipo de unidad: función, método, clase, atributo, llamada, config...'),
      unitName: z.string().optional().describe('Nombre de la unidad, ej. "totalCentimos()"'),
      title: z.string().describe('Resumen de una línea de qué cambió'),
      explanation: z.string().describe('Qué cambió y POR QUÉ — el motivo real, no una paráfrasis del diff'),
      commit: z.string().optional().describe('Hash corto del commit, si ya existe. Se usa para leer el archivo TAL COMO ESTABA en ese commit (git show) al abrir el mini-editor'),
      date: z.string().optional().describe('ISO 8601; por defecto, ahora'),
      relationType: z.enum(['continuation', 'jump', 'start']).optional(),
      relationNote: z.string().optional().describe('Obligatorio si relationType="jump": explica qué distingue este cambio del anterior'),
      explicaLineas: z.array(z.object({
        file: z.string().describe('Ruta del archivo, la misma que en "files"'),
        lineas: z.array(z.object({
          n: z.number().describe('Número de línea DENTRO del fragmento capturado, empezando en 1'),
          que: z.string().describe('Qué hace esa línea. Concreto: nombra las variables y funciones que aparecen'),
        })).min(1),
        resumen: z.string().optional().describe('Una frase: qué hace el fragmento en conjunto'),
      })).optional().describe(
        'Explicación línea por línea de los archivos cuyo código no se entienda leyéndolo. Se guarda junto al cambio y la web ' +
        'la enseña enlazada con cada línea, sin tocar el archivo. Salta las líneas obvias: es mejor no decir nada que decir ' +
        '"cierra el bloque". Si el cambio es evidente, omite este campo entero.',
      ),
      test: z.object({
        status: z.enum(['untested', 'auto', 'manual', 'failing']),
        command: z.string().optional(),
        note: z.string().optional(),
      }).optional().describe('Cómo se comprueba el cambio, si ya lo sabes. Si no, regístralo luego con set_test'),
    },
  },
  // Se confirma lo justo, no la entrada entera: devolverla completa costaba
  // ~1.664 tokens de entrada por llamada —más de lo que cuesta escribirla— y
  // era repetirle a quien acaba de escribirla lo que ya sabe. Lo único que no
  // sabía es el id, y de dónde se capturó el código.
  async (args) => {
    const c = addChange(pid(args.projectId), args);
    return text({
      id: c.id,
      status: c.status,
      relation: c.relation.type,
      archivos: c.files.map((f) => ({
        file: f.file,
        lineas: f.lineStart ? `${f.lineStart}-${f.lineEnd}` : null,
        codigo: f.capturado ? `capturado de git (${f.capturado})` : 'escrito a mano',
      })),
    });
  },
);

server.registerTool(
  'list_changes',
  {
    title: 'Listar cambios registrados',
    annotations: SOLO_LECTURA,
    description:
      'Devuelve las entradas del historial de un proyecto, en orden cronológico, SIN el código: título, porqué ' +
      'recortado, archivos, unidad, estado y prueba. Es lo que hace falta para orientarse, y cuesta un 10% de lo ' +
      'que costaría con el código dentro. Cuando necesites una entrada entera —su antes/después completo—, pídela ' +
      'con get_change en vez de traértelas todas.',
    inputSchema: { projectId: PROJECT_ID, limit: z.number().optional() },
  },
  async ({ projectId, limit }) => text(listChanges(pid(projectId), limit).map(resumirCambio)),
);

server.registerTool(
  'buscar',
  {
    title: 'Buscar en el historial sin traérselo entero',
    annotations: SOLO_LECTURA,
    description:
      'Busca por texto en el título, el porqué, la unidad y las rutas de un proyecto, y devuelve las entradas que casan ' +
      'con un trozo del porqué alrededor de donde casa. Úsalo en vez de list_changes cuando busques algo concreto ' +
      '("¿dónde tocamos el candado?", "el cambio de la sesión de Odoo"): cuesta unas diez veces menos que traerse el ' +
      'historial entero. Con el id que devuelva, get_change trae esa entrada completa.',
    inputSchema: {
      projectId: PROJECT_ID,
      consulta: z.string().describe('Lo que buscas, en palabras. Las de menos de 3 letras se ignoran'),
      limit: z.number().optional().describe('Cuántas devolver. Por defecto 5'),
    },
  },
  async ({ projectId, consulta, limit }) => text(buscar(pid(projectId), consulta, { limit })),
);

server.registerTool(
  'estado',
  {
    title: 'Dónde estoy y qué me reclama algo',
    annotations: SOLO_LECTURA,
    description:
      'Lo primero al ponerte a trabajar en un repo. En una sola llamada: si está vinculado, qué hay pendiente ' +
      '(propuestas por decidir, aceptadas sin escribir, pruebas en rojo) y qué convendría hacer con git. ' +
      'Sustituye a llamar list_projects, list_proposals y git_advice por separado.',
    inputSchema: { projectId: PROJECT_ID.optional().describe('El id o la ruta. Sin esto, lista los proyectos') },
  },
  async ({ projectId }) => {
    if (!projectId) {
      return text({
        proyectos: listProjects().map((p) => ({ id: p.id, name: p.name, repoPath: p.repoPath, cambios: p.changeCount })),
        pista: 'Pásale el id o la ruta del repo para ver qué hay pendiente en uno.',
      });
    }
    const project = getProject(pid(projectId));
    const changes = listChanges(project.id);
    const r = aconsejar(project, changes);
    const aceptadas = changes.filter((c) => c.status === 'accepted');
    const coberturaActual = cobertura(project, changes);
    const sinEntrada = coberturaActual.archivosSinEntrada;
    return text({
      proyecto: project.id,
      entradas: changes.filter((c) => (c.status || 'change') === 'change').length,
      // Lo que reclama una decisión va primero y entero: es lo único que se
      // pierde si nadie lo mira.
      propuestasPorDecidir: changes.filter((c) => c.status === 'proposal').map((c) => ({ id: c.id, title: c.title })),
      aceptadasSinEscribir: aceptadas.map((c) => ({ id: c.id, title: c.title })),
      pruebasEnRojo: changes.filter((c) => c.test && c.test.status === 'failing').map((c) => c.title),
      historialCompleto: sinEntrada.length === 0,
      archivosSinEntrada: sinEntrada,
      git: r.git ? { rama: r.git.rama, arbolLimpio: r.git.estado ? r.git.estado.limpio : null, sinEmpujar: r.git.sinEmpujar } : null,
      consejos: r.consejos.map((c) => ({ id: c.id, titulo: c.titulo })),
    });
  },
);

server.registerTool(
  'get_change',
  {
    title: 'Una entrada del historial, entera',
    annotations: SOLO_LECTURA,
    description:
      'Devuelve UNA entrada completa, con el código antes/después de cada archivo. Úsalo cuando list_changes te ' +
      'haya dicho cuál te interesa: traerte el historial entero con el código dentro cuesta diez veces más y casi ' +
      'nunca hace falta.',
    inputSchema: { projectId: PROJECT_ID, changeId: z.string() },
  },
  async ({ projectId, changeId }) => text(getChange(pid(projectId), changeId)),
);

server.registerTool(
  'render_timeline',
  {
    title: 'Exportar el timeline a un HTML estático',
    annotations: ESCRITURA_SEGURA,
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
  'web',
  {
    title: 'La web local del historial',
    annotations: ESCRITURA_SEGURA,
    description:
      'Controla el servidor web donde el usuario lee y revisa el historial. accion "abrir" lo levanta (reutiliza el que ' +
      'ya esté corriendo en vez de duplicarlo) y devuelve la URL; "estado" dice si sigue vivo; "cerrar" lo para. ' +
      'Es lo que se usa cuando el usuario pide "la web", "el timeline" o "levanta el servidor".',
    inputSchema: {
      accion: z.enum(['abrir', 'estado', 'cerrar']).describe('Por defecto "abrir"').optional(),
      port: z.number().optional(),
      open: z.boolean().optional().describe('Abrir el navegador al levantarlo'),
    },
  },
  async ({ accion, port, open }) => {
    if (accion === 'cerrar') return text(stopWeb());
    if (accion === 'estado') return text(webStatus());
    return text(await startWeb({ port, open }));
  },
);

server.registerTool(
  'propose_change',
  {
    title: 'Proponer un cambio que todavía NO has aplicado',
    annotations: ESCRITURA_SEGURA,
    description:
      'Registra una PROPUESTA: código que crees que habría que cambiar pero que no has tocado. Aparece aparte del historial, ' +
      'arriba, esperando que el usuario la acepte o la descarte desde la web. Aceptada, pasa a ser un cambio del historial; ' +
      'descartada, se archiva con el motivo. ' +
      'Úsalo SIEMPRE que sugieras una mejora: algo fuera del encargo, un camino alternativo que quieras que elija, ' +
      'o un cambio lo bastante grande como para acordarlo antes de escribirlo. Una sugerencia que solo dices en la respuesta ' +
      'se pierde al cerrar el chat; registrada, el usuario la acepta o la descarta cuando quiera. ' +
      'El "después" es el código que PROPONES, no el que existe: la vista a pantalla completa avisa de ello. ' +
      'Si el cambio ya está hecho, la herramienta correcta es add_change.',
    inputSchema: {
      projectId: PROJECT_ID,
      files: fileSchema('Los archivos que tocaría la propuesta, con el código actual en "before" y el propuesto en "after"'),
      unitType: z.string().optional().describe('Tipo de unidad: función, método, clase, atributo, config...'),
      unitName: z.string().optional().describe('Nombre de la unidad, ej. "totalCentimos()"'),
      title: z.string().describe('Resumen de una línea de qué propones'),
      explanation: z.string().describe('Qué propones y POR QUÉ: qué problema resuelve o qué mejora, y qué se pierde si no se hace'),
      date: z.string().optional().describe('ISO 8601; por defecto, ahora'),
    },
  },
  async (args) => {
    const c = addProposal(pid(args.projectId), args);
    return text({ id: c.id, status: c.status, archivos: c.files.map((f) => f.file) });
  },
);

server.registerTool(
  'list_proposals',
  {
    title: 'Listar propuestas',
    annotations: SOLO_LECTURA,
    description:
      'Devuelve las propuestas de un proyecto según su estado. ' +
      '"proposal" (por defecto): pendientes de que el usuario decida. ' +
      '"accepted": YA ACEPTADAS y esperando a que alguien las escriba — esto es trabajo comprometido y pendiente, ' +
      'míralo al empezar a trabajar en un proyecto y cuando el usuario diga "aplica la propuesta ..."; ' +
      'al terminar de aplicarla, llama a mark_applied. ' +
      '"rejected": descartadas, con el motivo — consúltalo antes de proponer, para no repetir algo ya rechazado.',
    inputSchema: {
      projectId: PROJECT_ID,
      status: z.enum(['proposal', 'accepted', 'rejected']).optional().describe('"proposal" (por defecto), "accepted" (aceptadas sin aplicar) o "rejected"'),
    },
  },
  // Una propuesta se decide leyendo su porqué, así que aquí el recorte es más
  // largo que en list_changes. El código propuesto sigue estando en get_change.
  async ({ projectId, status }) => text(
    listByStatus(pid(projectId), status || 'proposal').map((c) => resumirCambio(c, { explicacion: 900 })),
  ),
);

server.registerTool(
  'decide_proposal',
  {
    title: 'Aceptar o descartar una propuesta',
    annotations: ESCRITURA_SEGURA,
    description:
      'Marca una propuesta como aceptada o descartada. Aceptar NO la mete en el historial: la deja en estado ' +
      '"accepted" (aprobada, pendiente de aplicar), porque en ese momento el código todavía no existe. ' +
      'Entra en el historial cuando alguien la escribe y lo confirma con mark_applied. ' +
      'La decisión es del usuario: usa esto solo cuando te lo pida explícitamente ("acepta la propuesta del carrito"), ' +
      'nunca por tu cuenta ni para dar por buena una propuesta tuya.',
    inputSchema: {
      projectId: PROJECT_ID,
      changeId: z.string().describe('id de la propuesta, de list_proposals'),
      decision: z.enum(['accept', 'reject']),
      note: z.string().optional().describe('Motivo. Muy recomendable al descartar: es lo que evita volver a proponerlo'),
    },
  },
  async ({ projectId, changeId, decision, note }) => text(decideProposal(projectId, changeId, { decision, note })),
);

server.registerTool(
  'exchange_project',
  {
    title: 'Sacar o meter un historial completo',
    annotations: ESCRITURA_SEGURA,
    description:
      'direccion "export" escribe el historial entero a un fichero: "json" para respaldar o llevarlo a otra máquina, ' +
      '"md" para leerlo o compartirlo. Como data/ no se versiona, esto es la vía de respaldo. ' +
      'direccion "import" lee un json exportado: crea un proyecto nuevo, o con targetId añade a uno existente solo las ' +
      'entradas que le falten (compara por id, así que reimportar dos veces no duplica).',
    inputSchema: {
      direccion: z.enum(['export', 'import']),
      projectId: z.string().optional().describe('Al exportar, cuál. Al importar con fusión, el destino'),
      format: z.enum(['json', 'md']).optional().describe('Solo al exportar. Por defecto json'),
      filePath: z.string().optional().describe('Al importar, el .json. Al exportar, dónde escribirlo'),
      repoPath: z.string().optional().describe('Al importar, la ruta del repo en ESTA máquina si difiere'),
    },
  },
  async ({ direccion, projectId, format, filePath, repoPath }) => {
    if (direccion === 'import') {
      if (!filePath) throw new Error('Al importar hace falta filePath, el .json exportado.');
      const bundle = JSON.parse(readFileSync(resolve(filePath), 'utf8'));
      return text(importProject(bundle, {
        mode: projectId ? 'merge' : 'new', targetId: projectId, repoPath,
      }));
    }
    if (!projectId) throw new Error('Al exportar hace falta projectId.');
    const id = pid(projectId);
    const project = getProject(id);
    const salida = filePath ? resolve(filePath) : join(dirname(timelineHtmlPath(id)), `historial.${format || 'json'}`);
    const cuerpo = (format || 'json') === 'md'
      ? renderMarkdown(project, listChanges(id))
      : JSON.stringify(exportProject(id), null, 2);
    writeFileSync(salida, cuerpo);
    return text({ escrito: salida, entradas: listChanges(id).length });
  },
);

server.registerTool(
  'mark_applied',
  {
    title: 'Confirmar que una propuesta aceptada ya está escrita',
    annotations: ESCRITURA_SEGURA,
    description:
      'Cierra el círculo de una propuesta: pasa de "aceptada" a cambio del historial. Llámalo DESPUÉS de haber ' +
      'escrito el código de verdad en el repo, nunca antes — el historial dice lo que está en el código. ' +
      'Pasa en "files" lo que realmente escribiste: casi nunca es idéntico a lo propuesto, y lo que hay que guardar ' +
      'es lo aplicado, no lo sugerido. La entrada se recoloca con la fecha de hoy y vuelve a "pendiente de revisar", ' +
      'para que el usuario la verifique como cualquier otro cambio.',
    inputSchema: {
      projectId: PROJECT_ID,
      changeId: z.string().describe('id de la propuesta aceptada, de list_proposals con status="accepted"'),
      files: fileSchema('El código REAL que escribiste. Omítelo solo si aplicaste la propuesta tal cual, sin un carácter de diferencia').optional(),
      commit: z.string().optional().describe('Hash corto del commit, si ya lo hiciste'),
      note: z.string().optional().describe('Qué cambió respecto a lo propuesto, si hubo que desviarse'),
    },
  },
  async ({ projectId, changeId, files, commit, note }) => text(markApplied(pid(projectId), changeId, { files, commit, note })),
);

server.registerTool(
  'set_test',
  {
    title: 'Registrar cómo se comprueba un cambio',
    annotations: ESCRITURA_SEGURA,
    description:
      'Deja constancia de cómo se prueba una entrada del historial. Es distinto de "revisado": revisar es que el ' +
      'usuario lo haya leído; probar es que algo lo haya ejecutado. Un cambio puede estar revisado y sin probar. ' +
      'Llámalo cuando escribas o ejecutes una prueba que cubra el cambio, y di la verdad: si el test falla, ' +
      'status="failing" — un historial donde solo consta lo que funciona miente por omisión. ' +
      'status="auto" exige el comando que la ejecuta: sin él la prueba no se puede repetir.',
    inputSchema: {
      projectId: PROJECT_ID,
      changeId: z.string(),
      status: z.enum(['untested', 'auto', 'manual', 'failing']).optional()
        .describe('"auto" (hay test y pasa), "manual" (comprobado a mano), "failing" (probado y falla), "untested"'),
      command: z.string().optional().describe('El comando que ejecuta la prueba, ej. npm test -- carrito. Obligatorio con status="auto"'),
      note: z.string().optional().describe('Qué cubre la prueba, o cómo se comprobó a mano y con qué datos'),
    },
  },
  async ({ projectId, changeId, status, command, note }) => text(setTest(pid(projectId), changeId, { status, command, note })),
);


// ── Copiloto de git ─────────────────────────────────────────
// Estas tres herramientas leen git; ninguna lo escribe. Commitear, ramificar
// o subir sigue siendo del usuario: aquí solo se le dice qué convendría y se
// le da el comando escrito.

server.registerTool(
  'git_advice',
  {
    title: 'Qué convendría hacer con git ahora',
    annotations: SOLO_LECTURA,
    description:
      'Cruza el historial con el estado del repo y devuelve qué convendría hacer: si toca un commit —con el mensaje ya ' +
      'redactado a partir del PORQUÉ que registraste, no del diff—, si la tanda son en realidad varios commits porque ' +
      'hay un salto de contexto entre las entradas, si conviene abrir una rama, si hay pruebas en rojo a punto de ' +
      'entrar en el historial de git, o si el código ya no se parece a lo que dice una entrada. ' +
      'Llámalo al cerrar una tanda de trabajo en un proyecto vinculado, y siempre que el usuario pregunte si commitear ' +
      'o cómo llamar a un commit o a una rama. ' +
      'NO ejecuta nada de git: pásale al usuario el consejo y el comando, y ejecútalo solo si te lo pide él.',
    inputSchema: { projectId: z.string() },
  },
  async ({ projectId }) => {
    const project = getProject(pid(projectId));
    const r = aconsejar(project, listChanges(project.id));
    if (!r.git) return text(`"${project.name}" no es un repositorio git, o git no responde en ${project.repoPath}.`);
    return text({
      rama: r.git.rama,
      ramaPrincipal: r.git.ramaPrincipal,
      arbolLimpio: r.git.estado ? r.git.estado.limpio : null,
      ultimoCommit: r.git.ultimoCommit,
      sinEmpujar: r.git.sinEmpujar,
      entradasSinCommitear: r.pendientes.length,
      mensajePropuesto: r.mensaje && { ...r.mensaje, comando: comandoCommit(r.mensaje) },
      consejos: r.consejos,
    });
  },
);

server.registerTool(
  'stamp_commits',
  {
    title: 'Apuntar en cada entrada el commit que la recogió',
    annotations: ESCRITURA_SEGURA,
    description:
      'Busca, para cada entrada sin commit apuntado, el primer commit posterior que toca sus archivos, y lo sella. ' +
      'Enlaza el historial con git: la vista a pantalla completa puede entonces leer el archivo tal como estaba, y ' +
      'esas entradas dejan de contar como pendientes de commit. Llámalo después de commitear trabajo que registraste. ' +
      'Nunca pisa un commit ya apuntado. Con dryRun=true dice qué sellaría sin tocar nada.',
    inputSchema: {
      projectId: PROJECT_ID,
      dryRun: z.boolean().optional().describe('true para ver qué se sellaría sin escribirlo'),
    },
  },
  async ({ projectId, dryRun }) => {
    const project = getProject(pid(projectId));
    const changes = listChanges(project.id);
    const sellos = sellosPendientes(project, changes, aconsejar(project, changes).git);
    if (!sellos.length) return text('No hay ninguna entrada que sellar: o ya tienen commit, o su código todavía no se ha commiteado.');
    if (dryRun) return text({ sellaria: sellos.length, entradas: sellos });
    return text(stampCommits(project.id, sellos));
  },
);

server.registerTool(
  'pr_body',
  {
    title: 'Redactar el cuerpo de un PR desde el historial',
    annotations: SOLO_LECTURA,
    description:
      'Devuelve en Markdown qué cambia, por qué y cómo se ha probado, a partir de las entradas registradas en la rama ' +
      'actual (desde que se separó de la principal). Sirve para la descripción de un pull request o para el ' +
      'comentario de handoff al cerrar la jornada. No publica nada en GitHub: devuelve el texto para que lo pegue el usuario.',
    inputSchema: { projectId: z.string() },
  },
  async ({ projectId }) => {
    const project = getProject(pid(projectId));
    const changes = listChanges(project.id);
    const pr = cuerpoPr(project, changes, aconsejar(project, changes).git);
    if (!pr) return text('No hay entradas registradas en esta rama para redactar un PR.');
    return text(pr.texto);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

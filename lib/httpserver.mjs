import { createServer } from 'node:http';
import { listProjects, getProject, listChanges, updateChange, decideProposal, exportProject, lastQaRun, branchReport } from './store.mjs';
import { renderTimelineHtml, renderIndexHtml, renderChangeDetailHtml, renderFileTable, esc } from './render.mjs';
import { renderMarkdown } from './markdown.mjs';
import { aconsejar, cuerpoPr } from './consejo.mjs';
import { ACCIONES, verTrabajo, trabajosDe, limpiarTrabajos } from './acciones.mjs';
import { randomBytes } from 'node:crypto';
import { readFileAtCommit } from './repofile.mjs';

function fileTableHtml(project, change, f) {
  try {
    const content = readFileAtCommit(project.repoPath, f.file, change.commit);
    return renderFileTable(content, f.lineStart, f.lineEnd, f.file);
  } catch (err) {
    return `<div class="editor-error">No se pudo leer ${esc(f.file)}: ${esc(String(err && err.message ? err.message : err))}</div>`;
  }
}

function send(res, status, body, type = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// host por defecto 127.0.0.1 y no "todas las interfaces": aquí se sirve el
// código fuente del usuario y sus notas. Escuchar en 0.0.0.0 lo deja a la vista
// de cualquiera que comparta la wifi. Salir a la red es una decisión del
// usuario (--host).
//
// Desde que la web puede EJECUTAR acciones —aplicar una propuesta lanzando a
// Claude, commitear— este puerto puede tocar la máquina, así que las rutas que
// escriben piden un token. Se genera aquí en cada arranque, viaja dentro del
// HTML de la página y nunca sale a ningún otro sitio.
//
// Es lo que para un CSRF: una web cualquiera que visites puede hacer que tu
// navegador dispare una petición contra localhost, pero no puede LEER nuestra
// página para sacar el token. La comprobación de Origin es la segunda vuelta de
// llave, por si el token se filtrara por otra vía.
export function startServer({ port = 4173, host = '127.0.0.1' } = {}) {
  const TOKEN = randomBytes(32).toString('hex');

  // Sin cabecera Origin es una petición que no viene de una página (curl, el
  // propio CLI): el token ya la gobierna. Con Origin, tiene que ser el nuestro.
  function origenValido(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      const o = new URL(origin);
      return o.hostname === host || o.hostname === 'localhost' || o.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }

  function autorizado(req) {
    return origenValido(req) && req.headers['x-ct-token'] === TOKEN;
  }

  const server = createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return send(res, 400, 'Bad request');
    }

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        return send(res, 200, renderIndexHtml(listProjects()));
      }

      const pMatch = url.pathname.match(/^\/p\/([^/]+)\/?$/);
      if (req.method === 'GET' && pMatch) {
        const project = getProject(pMatch[1]);
        const changes = listChanges(pMatch[1]);
        // El copiloto pregunta a git en cada carga, no en un proceso aparte:
        // el estado del repo cambia por debajo mientras la página está abierta,
        // y un consejo calculado hace media hora aconsejaría sobre otro repo.
        // El cockpit de ramas es lo mismo: ?branch= filtra, ?fetch=1 trae del
        // remoto primero (única cosa de la página que mueve refs, y solo si se pide).
        let cockpit;
        try {
          cockpit = branchReport(project.id, { fetch: url.searchParams.get('fetch') === '1' });
          cockpit.branch = url.searchParams.get('branch') || null;
        } catch { cockpit = undefined; }
        return send(res, 200, renderTimelineHtml(project, changes, lastQaRun(pMatch[1]), aconsejar(project, changes), TOKEN, cockpit));
      }

      const cMatch = url.pathname.match(/^\/p\/([^/]+)\/c\/([^/]+)\/?$/);
      if (req.method === 'GET' && cMatch) {
        const project = getProject(cMatch[1]);
        const changes = listChanges(cMatch[1]);
        const index = changes.findIndex((c) => c.id === cMatch[2]);
        if (index === -1) return send(res, 404, 'No encontrado');
        const change = changes[index];
        const fileHtmls = (change.files || []).map((f) => fileTableHtml(project, change, f));
        return send(res, 200, renderChangeDetailHtml(project, changes, index, fileHtmls, TOKEN));
      }

      // Los export se sirven con Content-Disposition para que el enlace del
      // toolbar baje un fichero con nombre en vez de abrir texto en la pestaña.
      const exportMatch = url.pathname.match(/^\/p\/([^/]+)\/export\.(json|md)$/);
      if (req.method === 'GET' && exportMatch) {
        const [, projectId, format] = exportMatch;
        const project = getProject(projectId);
        const stamp = new Date().toISOString().slice(0, 10);
        const filename = `code-timeline-${projectId}-${stamp}.${format}`;
        const body = format === 'json'
          ? JSON.stringify(exportProject(projectId), null, 2)
          : renderMarkdown(project, listChanges(projectId));
        res.writeHead(200, {
          'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        return res.end(body);
      }

      // El cuerpo del PR se descarga como texto para pegarlo en GitHub. No se
      // publica desde aquí: esta herramienta no habla con la API de GitHub ni
      // guarda credenciales, y no va a empezar a hacerlo por comodidad.
      const prMatch = url.pathname.match(/^\/p\/([^/]+)\/pr\.md$/);
      if (req.method === 'GET' && prMatch) {
        const project = getProject(prMatch[1]);
        const changes = listChanges(prMatch[1]);
        const pr = cuerpoPr(project, changes, aconsejar(project, changes).git);
        if (!pr) return send(res, 404, 'No hay entradas en esta rama para redactar un PR.', 'text/plain; charset=utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="pr-${prMatch[1]}-${(pr.rama || 'rama').replace(/[^\w.-]/g, '-')}.md"`,
        });
        return res.end(pr.texto);
      }

      // A partir de aquí todo escribe, así que todo pide token.
      const decisionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/changes\/([^/]+)\/decision$/);
      if (req.method === 'POST' && decisionMatch) {
        if (!autorizado(req)) return sendJson(res, 403, { error: 'Petición no autorizada.' });
        const body = await readJsonBody(req);
        return sendJson(res, 200, decideProposal(decisionMatch[1], decisionMatch[2], body));
      }

      const apiMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/changes\/([^/]+)$/);
      if (req.method === 'PATCH' && apiMatch) {
        if (!autorizado(req)) return sendJson(res, 403, { error: 'Petición no autorizada.' });
        const body = await readJsonBody(req);
        const updated = updateChange(apiMatch[1], apiMatch[2], body);
        return sendJson(res, 200, updated);
      }

      // Las acciones: lo único de todo el servidor que ejecuta algo fuera de
      // su propio proceso. Devuelven el trabajo al momento y la página va
      // preguntando por él, porque una sesión de Claude tarda minutos y dejar
      // la petición HTTP abierta la mataría el primer timeout del navegador.
      const accionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/acciones$/);
      if (req.method === 'POST' && accionMatch) {
        if (!autorizado(req)) return sendJson(res, 403, { error: 'Petición no autorizada.' });
        const body = await readJsonBody(req);
        // Object.hasOwn y no ACCIONES[x]: "constructor" o "toString" son
        // truthy por herencia de Object.prototype y pasaban el filtro.
        const accion = Object.hasOwn(ACCIONES, String(body.accion)) ? ACCIONES[body.accion] : null;
        if (!accion) return sendJson(res, 400, { error: `Acción desconocida: ${body.accion}` });
        limpiarTrabajos();
        return sendJson(res, 200, accion(accionMatch[1], body));
      }

      // Consultar un trabajo no cambia nada, así que no pide token: lo que
      // devuelve es lo que ya está en la página de quien lo lanzó.
      const trabajoMatch = url.pathname.match(/^\/api\/trabajos\/([^/]+)$/);
      if (req.method === 'GET' && trabajoMatch) {
        const t = verTrabajo(trabajoMatch[1]);
        return t ? sendJson(res, 200, t) : sendJson(res, 404, { error: 'No existe ese trabajo.' });
      }

      const trabajosMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/trabajos$/);
      if (req.method === 'GET' && trabajosMatch) {
        return sendJson(res, 200, trabajosDe(trabajosMatch[1]));
      }

      const fileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/changes\/([^/]+)\/files\/(\d+)$/);
      if (req.method === 'GET' && fileMatch) {
        const project = getProject(fileMatch[1]);
        const change = listChanges(fileMatch[1]).find((c) => c.id === fileMatch[2]);
        if (!change) return send(res, 404, 'No encontrado');
        const f = (change.files || [])[Number(fileMatch[3])];
        if (!f) return send(res, 404, 'No encontrado');
        return send(res, 200, fileTableHtml(project, change, f));
      }

      return send(res, 404, 'No encontrado');
    } catch (err) {
      return sendJson(res, 400, { error: String(err && err.message ? err.message : err) });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}

import { createServer } from 'node:http';
import { listProjects, getProject, listChanges, updateChange } from './store.mjs';
import { renderTimelineHtml, renderIndexHtml, renderFileTable, esc } from './render.mjs';
import { readFileAtCommit } from './repofile.mjs';

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

export function startServer({ port = 4173 } = {}) {
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
        return send(res, 200, renderTimelineHtml(project, changes));
      }

      const apiMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/changes\/([^/]+)$/);
      if (req.method === 'PATCH' && apiMatch) {
        const body = await readJsonBody(req);
        const updated = updateChange(apiMatch[1], apiMatch[2], body);
        return sendJson(res, 200, updated);
      }

      const fileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/changes\/([^/]+)\/files\/(\d+)$/);
      if (req.method === 'GET' && fileMatch) {
        const project = getProject(fileMatch[1]);
        const change = listChanges(fileMatch[1]).find((c) => c.id === fileMatch[2]);
        if (!change) return send(res, 404, 'No encontrado');
        const f = (change.files || [])[Number(fileMatch[3])];
        if (!f) return send(res, 404, 'No encontrado');
        try {
          const content = readFileAtCommit(project.repoPath, f.file, change.commit);
          return send(res, 200, renderFileTable(content, f.lineStart, f.lineEnd));
        } catch (err) {
          return send(res, 200, `<div class="editor-error">No se pudo leer ${esc(f.file)}: ${esc(String(err && err.message ? err.message : err))}</div>`);
        }
      }

      return send(res, 404, 'No encontrado');
    } catch (err) {
      return sendJson(res, 400, { error: String(err && err.message ? err.message : err) });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

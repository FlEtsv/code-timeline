import { createServer } from 'node:http';
import { listProjects, getProject, listChanges, updateChange, decideProposal, exportProject } from './store.mjs';
import { renderTimelineHtml, renderIndexHtml, renderChangeDetailHtml, renderFileTable, esc } from './render.mjs';
import { renderMarkdown } from './markdown.mjs';
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

      const cMatch = url.pathname.match(/^\/p\/([^/]+)\/c\/([^/]+)\/?$/);
      if (req.method === 'GET' && cMatch) {
        const project = getProject(cMatch[1]);
        const changes = listChanges(cMatch[1]);
        const index = changes.findIndex((c) => c.id === cMatch[2]);
        if (index === -1) return send(res, 404, 'No encontrado');
        const change = changes[index];
        const fileHtmls = (change.files || []).map((f) => fileTableHtml(project, change, f));
        return send(res, 200, renderChangeDetailHtml(project, changes, index, fileHtmls));
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

      const decisionMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/changes\/([^/]+)\/decision$/);
      if (req.method === 'POST' && decisionMatch) {
        const body = await readJsonBody(req);
        return sendJson(res, 200, decideProposal(decisionMatch[1], decisionMatch[2], body));
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
        return send(res, 200, fileTableHtml(project, change, f));
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

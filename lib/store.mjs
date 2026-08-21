import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const PROJECTS_FILE = join(DATA_DIR, 'projects.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(PROJECTS_FILE)) writeFileSync(PROJECTS_FILE, JSON.stringify({ projects: [] }, null, 2));
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'proyecto';
}

function projectDir(id) {
  return join(DATA_DIR, 'projects', id);
}

function changesFile(id) {
  return join(projectDir(id), 'changes.json');
}

export function listProjects() {
  ensureDataDir();
  const { projects } = readJson(PROJECTS_FILE, { projects: [] });
  return projects.map((p) => {
    const changes = readJson(changesFile(p.id), { changes: [] }).changes;
    return {
      ...p,
      changeCount: changes.length,
      verifiedCount: changes.filter((c) => c.verified).length,
    };
  });
}

export function getProject(id) {
  ensureDataDir();
  const { projects } = readJson(PROJECTS_FILE, { projects: [] });
  const p = projects.find((x) => x.id === id);
  if (!p) throw new Error(`No existe el proyecto "${id}". Usa list_projects para ver los disponibles.`);
  return p;
}

export function createProject({ name, repoPath, githubRemote }) {
  ensureDataDir();
  if (!name || !repoPath) throw new Error('name y repoPath son obligatorios.');
  const { projects } = readJson(PROJECTS_FILE, { projects: [] });

  let base = slugify(name);
  let id = base;
  let n = 2;
  while (projects.some((p) => p.id === id)) id = `${base}-${n++}`;

  const project = {
    id,
    name,
    repoPath,
    githubRemote: githubRemote || null,
    createdAt: new Date().toISOString(),
  };
  projects.push(project);
  writeJson(PROJECTS_FILE, { projects });

  mkdirSync(projectDir(id), { recursive: true });
  writeJson(changesFile(id), { changes: [] });

  return project;
}

export function updateProject(id, patch) {
  ensureDataDir();
  const { projects } = readJson(PROJECTS_FILE, { projects: [] });
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`No existe el proyecto "${id}".`);
  projects[idx] = { ...projects[idx], ...patch };
  writeJson(PROJECTS_FILE, { projects });
  return projects[idx];
}

export function listChanges(id, limit) {
  getProject(id);
  const { changes } = readJson(changesFile(id), { changes: [] });
  return limit ? changes.slice(-limit) : changes;
}

export function addChange(id, entry) {
  getProject(id);
  const { changes } = readJson(changesFile(id), { changes: [] });

  const previous = changes[changes.length - 1] || null;
  const relationType = entry.relationType || (previous ? 'continuation' : 'start');
  const relationNote = entry.relationNote ||
    (relationType === 'start' ? 'Primer cambio registrado para este proyecto.' :
     relationType === 'continuation' ? 'Continúa directamente el cambio anterior.' : '');

  if (relationType === 'jump' && !entry.relationNote) {
    throw new Error('relationType "jump" requiere relationNote explicando el salto respecto al cambio anterior.');
  }

  const files = (entry.files || []).map((f) => ({
    file: f.file,
    lineStart: f.lineStart ?? null,
    lineEnd: f.lineEnd ?? f.lineStart ?? null,
    language: f.language || 'javascript',
    before: f.before ?? null,
    after: f.after,
  }));

  const change = {
    id: randomUUID(),
    date: entry.date || new Date().toISOString(),
    commit: entry.commit || null,
    unit: { type: entry.unitType || 'código', name: entry.unitName || '' },
    title: entry.title,
    files,
    explanation: entry.explanation,
    relation: { type: relationType, note: relationNote },
    verified: false,
    note: '',
  };

  if (!change.title || !change.explanation) {
    throw new Error('title y explanation son obligatorios.');
  }
  if (!files.length || files.some((f) => !f.file || !f.after)) {
    throw new Error('files debe tener al menos un elemento, cada uno con "file" y "after".');
  }

  changes.push(change);
  writeJson(changesFile(id), { changes });
  return change;
}

export function updateChange(id, changeId, patch) {
  getProject(id);
  const { changes } = readJson(changesFile(id), { changes: [] });
  const idx = changes.findIndex((c) => c.id === changeId);
  if (idx === -1) throw new Error(`No existe el cambio "${changeId}" en "${id}".`);
  if ('verified' in patch) changes[idx].verified = !!patch.verified;
  if ('note' in patch) changes[idx].note = String(patch.note ?? '');
  writeJson(changesFile(id), { changes });
  return changes[idx];
}

export function timelineHtmlPath(id) {
  return join(projectDir(id), 'timeline.html');
}

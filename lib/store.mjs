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
  return projects.map((p) => ({
    ...p,
    changeCount: readJson(changesFile(p.id), { changes: [] }).changes.length,
  }));
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
    artifactUrl: null,
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

  const change = {
    id: randomUUID(),
    date: entry.date || new Date().toISOString(),
    commit: entry.commit || null,
    file: entry.file,
    lineStart: entry.lineStart ?? null,
    lineEnd: entry.lineEnd ?? entry.lineStart ?? null,
    unit: { type: entry.unitType || 'código', name: entry.unitName || '' },
    title: entry.title,
    language: entry.language || 'javascript',
    before: entry.before ?? null,
    after: entry.after,
    explanation: entry.explanation,
    relation: { type: relationType, note: relationNote },
  };

  if (!change.file || !change.title || !change.after || !change.explanation) {
    throw new Error('file, title, after y explanation son obligatorios.');
  }

  changes.push(change);
  writeJson(changesFile(id), { changes });
  return change;
}

export function timelineHtmlPath(id) {
  return join(projectDir(id), 'timeline.html');
}

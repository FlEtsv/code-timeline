import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// CODE_TIMELINE_DATA mueve el almacén fuera del repo. Existe sobre todo para
// que los tests trabajen en un directorio temporal en vez de pisar el
// historial real, pero sirve igual para guardar el tuyo en otro sitio.
const DATA_DIR = process.env.CODE_TIMELINE_DATA
  ? resolve(process.env.CODE_TIMELINE_DATA)
  : join(ROOT, 'data');
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
    const applied = changes.filter((c) => (c.status || 'change') === 'change');
    return {
      ...p,
      changeCount: applied.length,
      verifiedCount: applied.filter((c) => c.verified).length,
      proposalCount: changes.filter((c) => c.status === 'proposal').length,
      acceptedCount: changes.filter((c) => c.status === 'accepted').length,
      rejectedCount: changes.filter((c) => c.status === 'rejected').length,
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

// Las entradas escritas antes de que existieran las propuestas no tienen
// "status". Son cambios ya aplicados: se normalizan al leer, no se migra el
// fichero — así un data/ viejo sigue abriendo sin tocarlo.
function normalize(change) {
  return {
    status: 'change',
    decision: null,
    decidedAt: null,
    decisionNote: '',
    fromProposal: false,
    ...change,
  };
}

export function listChanges(id, limit) {
  getProject(id);
  const { changes } = readJson(changesFile(id), { changes: [] });
  const all = changes.map(normalize);
  return limit ? all.slice(-limit) : all;
}

// Los cambios (aplicados) y las propuestas (pendientes o descartadas) viven en
// el mismo fichero y comparten id: aceptar una propuesta la convierte en
// cambio sin moverla de sitio ni perder su historia.
export function listByStatus(id, status) {
  return listChanges(id).filter((c) => c.status === status);
}

function normalizeFiles(files) {
  return (files || []).map((f) => ({
    file: f.file,
    lineStart: f.lineStart ?? null,
    lineEnd: f.lineEnd ?? f.lineStart ?? null,
    language: f.language || 'javascript',
    before: f.before ?? null,
    after: f.after,
  }));
}

export function addChange(id, entry) {
  return addEntry(id, entry, 'change');
}

// Una propuesta es un cambio que todavía no está en el código. Mismo esquema
// —archivos, antes/después, porqué— porque la idea es poder revisarla igual
// que un cambio antes de decidir; lo único que cambia es el status.
export function addProposal(id, entry) {
  return addEntry(id, entry, 'proposal');
}

function addEntry(id, entry, status) {
  getProject(id);
  const { changes } = readJson(changesFile(id), { changes: [] });

  // La relación se calcula contra el último CAMBIO aplicado, no contra la
  // última entrada: una propuesta pendiente no rompe el hilo del historial,
  // y varias propuestas seguidas no se encadenan entre ellas.
  const applied = changes.filter((c) => (c.status || 'change') === 'change');
  const previous = applied[applied.length - 1] || null;
  const relationType = entry.relationType || (previous ? 'continuation' : 'start');
  const relationNote = entry.relationNote ||
    (relationType === 'start' ? 'Primer cambio registrado para este proyecto.' :
     relationType === 'continuation' ? 'Continúa directamente el cambio anterior.' : '');

  if (relationType === 'jump' && !entry.relationNote) {
    throw new Error('relationType "jump" requiere relationNote explicando el salto respecto al cambio anterior.');
  }

  const files = normalizeFiles(entry.files);

  const change = {
    id: randomUUID(),
    status,
    date: entry.date || new Date().toISOString(),
    commit: entry.commit || null,
    unit: { type: entry.unitType || 'código', name: entry.unitName || '' },
    title: entry.title,
    files,
    explanation: entry.explanation,
    relation: { type: relationType, note: relationNote },
    verified: false,
    note: '',
    decision: null,
    decidedAt: null,
    decisionNote: '',
    fromProposal: false,
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

// Aceptar NO mete la propuesta en el historial: la deja "aceptada, pendiente
// de aplicar". El historial dice lo que está en el código, y en el momento de
// aceptar todavía no lo está — nadie la ha escrito. Pasa a ser un cambio
// cuando quien la aplica lo confirma con markApplied().
//
// Rechazarla la archiva con tu motivo — no se borra: saber qué se descartó y
// por qué es la mitad del valor de haberlo propuesto.
export function decideProposal(id, changeId, { decision, note } = {}) {
  if (decision !== 'accept' && decision !== 'reject') {
    throw new Error('decision debe ser "accept" o "reject".');
  }
  getProject(id);
  const { changes } = readJson(changesFile(id), { changes: [] });
  const idx = changes.findIndex((c) => c.id === changeId);
  if (idx === -1) throw new Error(`No existe la entrada "${changeId}" en "${id}".`);

  const current = changes[idx];
  const status = current.status || 'change';
  if (status === 'change' && !current.fromProposal) {
    throw new Error('Esa entrada es un cambio ya registrado, no una propuesta.');
  }

  changes[idx] = {
    ...current,
    status: decision === 'accept' ? 'accepted' : 'rejected',
    decision: decision === 'accept' ? 'accepted' : 'rejected',
    decidedAt: new Date().toISOString(),
    decisionNote: String(note ?? current.decisionNote ?? ''),
    fromProposal: true,
  };
  writeJson(changesFile(id), { changes });
  return changes[idx];
}

// Lo que cierra el círculo: quien aplica la propuesta confirma que ya está en
// el código, y solo entonces entra en el historial. Acepta los archivos reales
// porque lo aplicado casi nunca es idéntico a lo propuesto — y lo que el
// historial tiene que guardar es lo que se escribió, no lo que se sugirió.
export function markApplied(id, changeId, { files, commit, note } = {}) {
  getProject(id);
  const { changes } = readJson(changesFile(id), { changes: [] });
  const idx = changes.findIndex((c) => c.id === changeId);
  if (idx === -1) throw new Error(`No existe la entrada "${changeId}" en "${id}".`);

  const current = changes[idx];
  if (current.status !== 'accepted') {
    throw new Error(
      `Solo se marca como aplicada una propuesta aceptada. "${changeId}" está en estado "${current.status || 'change'}".`,
    );
  }

  const applied = files && files.length ? normalizeFiles(files) : current.files;
  if (applied.some((f) => !f.file || !f.after)) {
    throw new Error('Cada archivo necesita "file" y "after".');
  }

  changes[idx] = {
    ...current,
    status: 'change',
    files: applied,
    commit: commit || current.commit,
    appliedAt: new Date().toISOString(),
    date: new Date().toISOString(),
    note: note ? String(note) : current.note,
    verified: false,
  };
  writeJson(changesFile(id), { changes });
  return changes[idx];
}

const EXPORT_FORMAT = 'code-timeline/v1';

// El export lleva el proyecto y su historial entero —propuestas y descartes
// incluidos— porque es también la vía de respaldo: data/ no se versiona, así
// que esto es lo único que hay entre tú y perder las notas de revisión.
export function exportProject(id) {
  const project = getProject(id);
  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    project,
    changes: listChanges(id),
  };
}

// mode "new" crea un proyecto aparte (por defecto: no pisa nada).
// mode "merge" mete las entradas que falten en un proyecto que ya existe,
// comparando por id — reimportar el mismo fichero dos veces no duplica nada.
export function importProject(bundle, { mode = 'new', targetId, repoPath } = {}) {
  if (!bundle || bundle.format !== EXPORT_FORMAT) {
    throw new Error(`El fichero no es un export de Code Timeline (falta format: "${EXPORT_FORMAT}").`);
  }
  const incoming = (bundle.changes || []).map(normalize);

  if (mode === 'merge') {
    if (!targetId) throw new Error('mode "merge" necesita targetId.');
    getProject(targetId);
    const { changes } = readJson(changesFile(targetId), { changes: [] });
    const known = new Set(changes.map((c) => c.id));
    const added = incoming.filter((c) => !known.has(c.id));
    changes.push(...added);
    changes.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    writeJson(changesFile(targetId), { changes });
    return { projectId: targetId, imported: added.length, skipped: incoming.length - added.length };
  }

  const src = bundle.project || {};
  const path = repoPath || src.repoPath;
  if (!path) {
    throw new Error('El export no trae repoPath: pasa uno para saber contra qué repo se lee el código.');
  }
  const project = createProject({
    name: src.name || 'Proyecto importado',
    repoPath: path,
    githubRemote: src.githubRemote,
  });
  writeJson(changesFile(project.id), { changes: incoming });
  return { projectId: project.id, imported: incoming.length, skipped: 0 };
}

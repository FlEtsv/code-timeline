import {
  readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync,
  openSync, writeSync, fsyncSync, closeSync, renameSync, copyFileSync, unlinkSync, statSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './datadir.mjs';

const PROJECTS_FILE = join(DATA_DIR, 'projects.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(PROJECTS_FILE)) writeFileSync(PROJECTS_FILE, JSON.stringify({ projects: [] }, null, 2));
}

// ── Persistencia segura ─────────────────────────────────────
// data/ no se versiona: si un fichero queda a medias o lo pisan dos procesos a
// la vez, el historial se pierde y no hay copia en git de la que tirar. Y hay
// dos procesos escribiendo los mismos ficheros de verdad: el servidor MCP
// (add_change) y el servidor web (marcar revisado, decidir una propuesta).
// De ahí las tres piezas de abajo: escritura atómica, copia de la versión
// anterior, y un candado entre procesos para el ciclo leer-modificar-escribir.

function backupPath(path) {
  return `${path}.bak`;
}

function lockPath(path) {
  return `${path}.lock`;
}

// Un candado abandonado por un proceso muerto no puede bloquear el almacén
// para siempre: pasado este plazo se da por caducado y se retira.
const LOCK_STALE_MS = 10000;
const LOCK_RETRIES = 40;
const LOCK_WAIT_MS = 50;

// Los candados que tiene ESTE proceso. Sirve para que el bloqueo sea
// reentrante: una función bloqueada que llame a otra sobre el mismo fichero
// se estaría esperando a sí misma para siempre.
const heldLocks = new Set();

// Espera bloqueante: todo el almacén es síncrono (readFileSync/writeFileSync)
// y meter async aquí cambiaría la firma de cada función exportada.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function lockAgeMs(lock) {
  try { return Date.now() - statSync(lock).mtimeMs; } catch { return Infinity; }
}

function acquireLock(lock, token) {
  for (let intento = 0; intento <= LOCK_RETRIES; intento++) {
    try {
      // "wx" falla si el fichero ya existe: crear y comprobar en un solo paso,
      // que es justo lo que hace falta para que el candado valga entre procesos.
      const fd = openSync(lock, 'wx');
      try { writeSync(fd, `${token}\n${new Date().toISOString()}`); } finally { closeSync(fd); }
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (lockAgeMs(lock) > LOCK_STALE_MS) {
        try { unlinkSync(lock); } catch { /* se lo llevó otro: reintentamos igual */ }
        continue;
      }
      sleepSync(LOCK_WAIT_MS);
    }
  }
  throw new Error(
    `No se pudo bloquear "${lock}" para escribir: otro proceso lo tiene tomado. ` +
    'Si sabes que no hay ninguno escribiendo, borra ese fichero de bloqueo y vuelve a intentarlo.',
  );
}

function releaseLock(lock, token) {
  // Solo se retira el candado propio: si caducó y otro lo cogió mientras
  // tanto, borrarlo sería dejarle sin protección a media escritura.
  try {
    if (readFileSync(lock, 'utf8').split('\n')[0] !== token) return;
    unlinkSync(lock);
  } catch { /* ya no está: nada que soltar */ }
}

// Envuelve un ciclo leer-modificar-escribir entero, no solo la escritura: lo
// que se pierde sin candado es la modificación de en medio (dos procesos leen
// la misma lista y el segundo guarda encima del primero).
function withLock(path, fn) {
  if (heldLocks.has(path)) return fn();
  mkdirSync(dirname(path), { recursive: true });
  const lock = lockPath(path);
  const token = `${process.pid}:${randomUUID()}`;
  acquireLock(lock, token);
  heldLocks.add(path);
  try {
    return fn();
  } finally {
    heldLocks.delete(path);
    releaseLock(lock, token);
  }
}

function parseJsonFile(path) {
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    // Un fichero a medias puede llegar a ser JSON válido ("null", un número).
    // Los nuestros son siempre objetos: cualquier otra cosa es basura.
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function readJson(path, fallback) {
  const bak = backupPath(path);

  if (!existsSync(path)) {
    // Sin principal pero con copia: alguien murió entre el rename y aquí.
    // Devolver el fallback en ese caso sería lo peor posible — el siguiente
    // guardado escribiría una lista vacía encima del historial de verdad.
    const recuperado = existsSync(bak) ? parseJsonFile(bak) : null;
    return recuperado || fallback;
  }

  const data = parseJsonFile(path);
  if (data) return data;

  const recuperado = existsSync(bak) ? parseJsonFile(bak) : null;
  if (recuperado) {
    // El fichero ilegible se aparta (no se borra: es la prueba de qué pasó) y
    // la copia pasa a ocupar su sitio. Si lo dejáramos como está, el próximo
    // writeJson haría copia de seguridad DEL FICHERO CORRUPTO y se llevaría por
    // delante la única versión buena que quedaba.
    try {
      renameSync(path, `${path}.corrupto`);
      copyFileSync(bak, path);
    } catch { /* si no se puede reparar en disco, al menos seguimos con lo leído */ }
    return recuperado;
  }

  throw new Error(
    `El fichero "${path}" está corrupto o ilegible, y su copia de seguridad ("${bak}") ` +
    `${existsSync(bak) ? 'tampoco se puede leer' : 'no existe'}. ` +
    'No se devuelve un historial vacío a propósito: guardar encima borraría lo que quede. ' +
    'Repara o restaura el fichero a mano antes de seguir.',
  );
}

function writeJson(path, data) {
  // Serializar primero: si esto revienta, el fichero de disco sigue intacto.
  const json = JSON.stringify(data, null, 2);
  mkdirSync(dirname(path), { recursive: true });

  // Copia de la versión anterior antes de pisarla. El rename atómico protege
  // de una escritura a medias; esto protege de una escritura completa pero
  // equivocada, que es lo único que queda por lo que perder el historial.
  if (existsSync(path)) {
    const bakTmp = `${backupPath(path)}.${process.pid}.tmp`;
    try {
      copyFileSync(path, bakTmp);
      renameSync(bakTmp, backupPath(path));
    } catch (err) {
      try { unlinkSync(bakTmp); } catch { /* nada que limpiar */ }
      throw err;
    }
  }

  // El temporal va en el MISMO directorio: rename solo es atómico dentro del
  // mismo sistema de ficheros. El nombre lleva pid y azar para que dos
  // procesos escribiendo a la vez no compartan temporal.
  const tmp = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, json);
    fsyncSync(fd);   // sin esto el rename puede llegar al disco antes que el contenido
  } finally {
    closeSync(fd);
  }
  try {
    renameAtomic(tmp, path);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* nada que limpiar */ }
    throw err;
  }
}

// En Windows el rename sobre un fichero que otro proceso tiene abierto (el
// servidor web leyéndolo justo ahora, un antivirus mirándolo) falla con EPERM
// aunque no haya nada roto. Es transitorio: unos reintentos cortos y sale.
function renameAtomic(tmp, path) {
  for (let intento = 0; ; intento++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (err) {
      const transitorio = err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY';
      if (!transitorio || intento >= 10) throw err;
      sleepSync(20);
    }
  }
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
      testedCount: applied.filter((c) => c.test && (c.test.status === 'auto' || c.test.status === 'manual')).length,
      failingCount: applied.filter((c) => c.test && c.test.status === 'failing').length,
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

  return withLock(PROJECTS_FILE, () => {
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
  });
}

export function updateProject(id, patch) {
  ensureDataDir();
  return withLock(PROJECTS_FILE, () => {
    const { projects } = readJson(PROJECTS_FILE, { projects: [] });
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`No existe el proyecto "${id}".`);
    projects[idx] = { ...projects[idx], ...patch };
    writeJson(PROJECTS_FILE, { projects });
    return projects[idx];
  });
}

// Las entradas escritas antes de que existieran las propuestas no tienen
// "status". Son cambios ya aplicados: se normalizan al leer, no se migra el
// fichero — así un data/ viejo sigue abriendo sin tocarlo.
// Estados de prueba. "failing" existe a propósito: un historial donde solo se
// puede anotar lo que funciona miente por omisión, y lo que hace falta saber al
// revisar es justamente qué está probado y qué no.
export const TEST_STATUSES = ['untested', 'auto', 'manual', 'failing'];

const NO_TEST = { status: 'untested', command: '', note: '', at: null };

function normalize(change) {
  return {
    status: 'change',
    decision: null,
    decidedAt: null,
    decisionNote: '',
    fromProposal: false,
    ...change,
    test: { ...NO_TEST, ...(change.test || {}) },
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
  return withLock(changesFile(id), () => addEntryLocked(id, entry, status));
}

function addEntryLocked(id, entry, status) {
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
    test: { ...NO_TEST, ...(entry.test || {}) },
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
  return withLock(changesFile(id), () => {
    const { changes } = readJson(changesFile(id), { changes: [] });
    const idx = changes.findIndex((c) => c.id === changeId);
    if (idx === -1) throw new Error(`No existe el cambio "${changeId}" en "${id}".`);
    if ('verified' in patch) changes[idx].verified = !!patch.verified;
    if ('note' in patch) changes[idx].note = String(patch.note ?? '');
    writeJson(changesFile(id), { changes });
    return changes[idx];
  });
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
  return withLock(changesFile(id), () => {
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
  });
}

// Lo que cierra el círculo: quien aplica la propuesta confirma que ya está en
// el código, y solo entonces entra en el historial. Acepta los archivos reales
// porque lo aplicado casi nunca es idéntico a lo propuesto — y lo que el
// historial tiene que guardar es lo que se escribió, no lo que se sugirió.
export function markApplied(id, changeId, { files, commit, note } = {}) {
  getProject(id);
  return withLock(changesFile(id), () => {
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
  });
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
    return withLock(changesFile(targetId), () => {
      const { changes } = readJson(changesFile(targetId), { changes: [] });
      const known = new Set(changes.map((c) => c.id));
      const added = incoming.filter((c) => !known.has(c.id));
      changes.push(...added);
      changes.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      writeJson(changesFile(targetId), { changes });
      return { projectId: targetId, imported: added.length, skipped: incoming.length - added.length };
    });
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

// Cómo se comprobó un cambio. Va aparte de "verified": revisarlo es que un
// humano lo haya leído; probarlo es que algo lo haya ejecutado. Un cambio puede
// estar revisado y sin probar, y saber cuál de las dos falta es la mitad de la
// pregunta al mirar un historial ajeno.
export function setTest(id, changeId, { status, command, note } = {}) {
  if (status !== undefined && !TEST_STATUSES.includes(status)) {
    throw new Error(`status debe ser uno de: ${TEST_STATUSES.join(', ')}.`);
  }
  getProject(id);
  return withLock(changesFile(id), () => {
    const { changes } = readJson(changesFile(id), { changes: [] });
    const idx = changes.findIndex((c) => c.id === changeId);
    if (idx === -1) throw new Error(`No existe la entrada "${changeId}" en "${id}".`);

    const current = { ...NO_TEST, ...(changes[idx].test || {}) };
    const next = {
      status: status ?? current.status,
      command: command !== undefined ? String(command) : current.command,
      note: note !== undefined ? String(note) : current.note,
      at: new Date().toISOString(),
    };
    if (next.status === 'auto' && !next.command) {
      throw new Error('Una prueba automática necesita el comando que la ejecuta: sin él no se puede repetir.');
    }
    changes[idx] = { ...changes[idx], test: next };
    writeJson(changesFile(id), { changes });
    return changes[idx];
  });
}

// ── Registro de QA ──────────────────────────────────────────
// Las ejecuciones de un arnés externo (qabot y compañía) NO son entradas del
// historial: una entrada es una decisión de código con su porqué, y meter aquí
// "batería verde en staging" cada vez lo llenaría de ruido hasta que dejara de
// poder leerse. Se guardan aparte, a nivel de proyecto, y se enseñan como
// estado, no como cambios.

const QA_MAX = 20;   // se conserva lo reciente; esto es un estado, no un archivo
const QA_RESULTS = ['verde', 'rojo'];

function qaFile(id) {
  return join(projectDir(id), 'qa.json');
}

// Deja que una herramienta externa resuelva el proyecto por su ruta, sin
// tener que conocer ni guardar el projectId.
//
// Compara por ruta REAL, no por la escrita: en macOS /tmp es un enlace a
// /private/tmp, y con solo normalizar, la misma carpeta llegada por dos
// caminos no se reconoce. Si la ruta ya no existe se cae a la normalizada,
// que es lo único que queda cuando el repo se ha movido o borrado.
function rutaReal(p) {
  try { return realpathSync(resolve(p)); } catch { return resolve(p); }
}

export function findProjectByRepo(repoPath) {
  if (!repoPath) return null;
  const objetivo = rutaReal(repoPath);
  return listProjects().find((p) => p.repoPath && rutaReal(p.repoPath) === objetivo) || null;
}

export function listQaRuns(id, limit) {
  getProject(id);
  const { runs } = readJson(qaFile(id), { runs: [] });
  return limit ? runs.slice(-limit) : runs;
}

export function recordQaRun(id, { result, command, environment, detail } = {}) {
  if (!QA_RESULTS.includes(result)) {
    throw new Error(`result debe ser uno de: ${QA_RESULTS.join(', ')}.`);
  }
  getProject(id);
  return withLock(qaFile(id), () => {
    const { runs } = readJson(qaFile(id), { runs: [] });
    const run = {
      id: randomUUID(),
      at: new Date().toISOString(),
      result,
      command: String(command ?? ''),
      environment: String(environment ?? ''),
      detail: String(detail ?? ''),
    };
    runs.push(run);
    writeJson(qaFile(id), { runs: runs.slice(-QA_MAX) });
    return run;
  });
}

export function lastQaRun(id) {
  const runs = listQaRuns(id);
  return runs.length ? runs[runs.length - 1] : null;
}

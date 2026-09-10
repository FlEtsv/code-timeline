import {
  readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync,
  openSync, writeSync, fsyncSync, closeSync, renameSync, copyFileSync, unlinkSync, statSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './datadir.mjs';
import { completarArchivos } from './captura.mjs';

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

// El id que nombra la carpeta de datos tiene que ser SIEMPRE el slug canónico.
// getProject admite además la ruta del repo, y sin esta guarda una llamada con
// una ruta escribiría en "data/projects/Users/steven/..." — un proyecto
// paralelo, en silencio, con entradas que no aparecen en ninguna parte. Pasó.
function idCanonico(id) {
  const clave = String(id || '');
  // Un id nunca lleva barras ni empieza por punto: si las lleva, es una ruta y
  // hay que resolverla. Y si no resuelve, que reviente aquí y no escribiendo.
  return /[/\\]/.test(clave) || clave.startsWith('.') ? getProject(clave).id : clave;
}

function projectDir(id) {
  return join(DATA_DIR, 'projects', idCanonico(id));
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

// Un proyecto se puede nombrar por su id o por la RUTA de su repo. Lo segundo
// evita tener que llamar a list_projects solo para averiguar el id: quien
// trabaja siempre sabe en qué directorio está, y ese rodeo costaba cientos de
// tokens cada vez. Va aquí y no en el servidor MCP para que valga igual desde
// el CLI y desde el hook.
export function getProject(idORuta) {
  ensureDataDir();
  const clave = String(idORuta || '');
  const { projects } = readJson(PROJECTS_FILE, { projects: [] });

  const porId = projects.find((x) => x.id === clave);
  if (porId) return porId;

  // Solo se prueba como ruta si lo parece: así un id mal escrito sigue dando
  // el error de id, que es más útil que "no encuentro ese directorio".
  if (clave.includes('/')) {
    const buscado = rutaReal(clave);
    const porRuta = projects.find((x) => rutaReal(x.repoPath || '') === buscado);
    if (porRuta) return porRuta;
  }

  throw new Error(
    `No existe el proyecto "${clave}". Los que hay: ${projects.map((x) => x.id).join(', ') || '(ninguno)'}.`,
  );
}

// Se mantiene el nombre por si algo lo importa; es el mismo camino.
export const resolveProject = getProject;

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

// El resumen de una entrada: todo menos el código. Es lo que hace falta para
// saber QUÉ hay en el historial; el código solo importa cuando vas a leer una
// entrada concreta, y entonces se pide esa.
//
// Medido sobre los proyectos reales, devolver el resumen en vez de todo ahorra
// entre el 90% y el 94% de lo que un agente se mete en contexto al mirar el
// historial: 37.000 tokens se quedan en 2.100 en el proyecto más grande.
export function resumirCambio(c, { explicacion = 240 } = {}) {
  const texto = String(c.explanation || '');
  return {
    id: c.id,
    date: c.date,
    status: c.status,
    title: c.title,
    unit: c.unit,
    files: (c.files || []).map((f) => f.file + (f.lineStart ? `:${f.lineStart}` : '')),
    relation: c.relation && c.relation.type,
    verified: c.verified,
    commit: c.commit,
    test: c.test && c.test.status,
    // La explicación se recorta, no se quita: sin nada de porqué, la lista
    // deja de servir para orientarse y habría que pedir cada entrada entera.
    explanation: texto.slice(0, explicacion) + (texto.length > explicacion ? '…' : ''),
    // El motivo de un descarte va entero: es corto, y es justo lo que hay que
    // leer antes de volver a proponer algo que ya se rechazó.
    ...(c.decisionNote ? { decisionNote: c.decisionNote } : {}),
  };
}

export function getChange(id, changeId) {
  const c = listChanges(id).find((x) => x.id === changeId);
  if (!c) throw new Error(`No existe el cambio "${changeId}" en "${id}".`);
  return c;
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
    language: f.language || languageFromPath(f.file),
    before: f.before ?? null,
    after: f.after,
    // De dónde salió el código, si no lo escribió quien registra la entrada.
    ...(f.capturado ? { capturado: f.capturado } : {}),
    // Las explicaciones línea por línea, si alguien las pidió ya.
    ...(f.explicaciones ? { explicaciones: f.explicaciones } : {}),
  }));
}

// El lenguaje se deduce de la extensión: pedírselo a quien registra era una
// clave más que escribir a cambio de nada, y por defecto se marcaba todo como
// javascript aunque fuera Python o SQL.
function languageFromPath(ruta) {
  const ext = String(ruta || '').split('.').pop().toLowerCase();
  const mapa = {
    mjs: 'javascript', cjs: 'javascript', js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript', py: 'python', rb: 'ruby', go: 'go',
    rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c',
    cpp: 'cpp', cs: 'csharp', php: 'php', sql: 'sql', css: 'css', scss: 'scss',
    html: 'html', vue: 'vue', svelte: 'svelte', sh: 'bash', zsh: 'bash',
    json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', applescript: 'applescript',
  };
  return mapa[ext] || 'javascript';
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

  // El código que falte se captura de git en vez de hacer que lo escriba quien
  // registra la entrada: es el 59% de lo que un agente teclea por MCP, y ya
  // está en el disco. Ver lib/captura.mjs.
  const proyecto = getProject(id);
  const { files: completos } = completarArchivos(proyecto.repoPath, entry.files);
  const files = normalizeFiles(completos);

  // La explicación que venga escrita al vuelo se cuelga de su archivo. Viene
  // por ruta y no por índice porque quien la escribe piensa en archivos, no en
  // posiciones de un array.
  for (const e of entry.explicaLineas || []) {
    const destino = files.find((f) => f.file === e.file);
    if (!destino || !Array.isArray(e.lineas) || !e.lineas.length) continue;
    destino.explicaciones = {
      ...(destino.explicaciones || {}),
      after: {
        lineas: e.lineas
          .filter((l) => l && Number.isFinite(Number(l.n)) && String(l.que || '').trim())
          .map((l) => ({ n: Number(l.n), que: String(l.que).trim() }))
          .sort((a, b) => a.n - b.n),
        resumen: String(e.resumen || '').trim(),
        // Quien la escribió tenía el repo entero delante, no solo el
        // fragmento: por eso se marca distinto de las pedidas después.
        modelo: 'quien escribió el cambio',
        nivel: 'normal',
        fecha: entry.date || new Date().toISOString(),
      },
    };
    if (!destino.explicaciones.after.lineas.length) delete destino.explicaciones;
  }

  const sinCodigo = files.filter((f) => f.after == null).map((f) => f.file);
  if (sinCodigo.length) {
    throw new Error(
      `No se pudo capturar el código de: ${sinCodigo.join(', ')}. ` +
      'Comprueba la ruta (va relativa al repo) o pasa "after" a mano.',
    );
  }

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

// Sella entradas con el commit que las recogió. Escribe en una sola pasada
// bajo un único candado: sellar de una en una abriría y cerraría el fichero
// por cada entrada, y entre medias el servidor web podría estar escribiendo.
//
// Solo rellena huecos: una entrada que ya tiene commit no se toca. El commit
// registrado por quien escribió el cambio manda sobre el que deduce el
// copiloto mirando fechas y archivos.
export function stampCommits(id, sellos) {
  getProject(id);
  if (!Array.isArray(sellos) || !sellos.length) return { sellados: 0, entradas: [] };
  return withLock(changesFile(id), () => {
    const { changes } = readJson(changesFile(id), { changes: [] });
    const hechos = [];
    for (const { changeId, commit, corrige, exacto } of sellos) {
      const idx = changes.findIndex((c) => c.id === changeId);
      if (idx === -1 || !commit) continue;
      // Un sello ya puesto solo se pisa para CORREGIRLO, y solo cuando el
      // nuevo commit contiene todos los archivos de la entrada y el viejo no.
      if (changes[idx].commit && !(corrige === changes[idx].commit && exacto)) continue;
      changes[idx].commit = String(commit);
      hechos.push({ changeId, commit: String(commit), title: changes[idx].title });
    }
    if (hechos.length) writeJson(changesFile(id), { changes });
    return { sellados: hechos.length, entradas: hechos };
  });
}

// Guarda la explicación línea por línea de un trozo de código de una entrada.
// Va colgada del archivo y del lado (antes/después) al que pertenece, porque
// una entrada puede tocar varios archivos y cada panel se explica aparte.
//
// La explicación NO toca el código: es una capa de lectura. Por eso se puede
// borrar (pasando null) sin que el historial pierda nada.
export function setExplicacion(id, changeId, { fileIndex, lado = 'after', explicacion }) {
  getProject(id);
  const i = Number(fileIndex);
  if (!Number.isInteger(i) || i < 0) throw new Error('fileIndex tiene que ser un índice válido.');
  if (lado !== 'after' && lado !== 'before') throw new Error('lado tiene que ser "after" o "before".');

  return withLock(changesFile(id), () => {
    const { changes } = readJson(changesFile(id), { changes: [] });
    const idx = changes.findIndex((c) => c.id === changeId);
    if (idx === -1) throw new Error(`No existe el cambio "${changeId}" en "${id}".`);
    const f = (changes[idx].files || [])[i];
    if (!f) throw new Error(`El cambio "${changeId}" no tiene un archivo en la posición ${i}.`);

    f.explicaciones = f.explicaciones || {};
    if (explicacion) f.explicaciones[lado] = explicacion;
    else delete f.explicaciones[lado];
    if (!Object.keys(f.explicaciones).length) delete f.explicaciones;

    writeJson(changesFile(id), { changes });
    return f.explicaciones ? (f.explicaciones[lado] || null) : null;
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

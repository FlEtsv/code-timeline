// Lectura del estado de git de un repo vinculado.
//
// TODO lo de este módulo es de solo lectura. Code Timeline aconseja sobre git
// —cuándo conviene un commit, cuándo una rama— pero no ejecuta nada que
// escriba: ni commit, ni checkout, ni push. El usuario copia el comando y
// decide. Un historial que además mueve el repo por su cuenta deja de ser
// revisable y pasa a ser algo de lo que hay que fiarse.
//
// Todas las funciones devuelven null (o vacío) si el comando falla, en vez de
// lanzar: un proyecto vinculado puede no ser un repo git, estar recién
// inicializado y sin commits, o tener el remoto caído. Nada de eso debe tumbar
// la página ni el hook.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trocearDiff } from './captura.mjs';

const LIMITE_SALIDA = 1024 * 1024 * 20;
const LIMITE_MS = 5000;

function git(repoPath, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: LIMITE_SALIDA,
      timeout: LIMITE_MS,
    });
  } catch {
    return null;
  }
}

export function esRepo(repoPath) {
  return git(repoPath, ['rev-parse', '--git-dir']) !== null;
}

// Los cambios de código que NO están en el historial de Code Timeline. La red
// de seguridad para cuando el agente se salta un `add_change`: sin esto, un
// hueco no se nota hasta que alguien busca en el historial algo que nunca se
// registró.
//
// Mira tres fuentes y las cruza contra lo registrado (entradas con estado
// `change` y su commit o su before/after):
//   1. commits de la rama desde la fecha de la última entrada aplicada
//      (todo el historial si no hay ninguna),
//   2. el diff sin commitear (working tree + stage),
//   3. los archivos sin seguimiento.
// La comparación es de CÓDIGO —los tramos del diff tienen que aparecer en el
// before/after de alguna entrada del mismo archivo—, no del significado de la
// explicación: eso no se puede verificar. Un archivo con huecos cuenta una
// sola vez aunque aparezca en varias fuentes. Solo informa; no escribe nada.
export function cambiosSinRegistrar(repoPath, entries) {
  if (!esRepo(repoPath)) throw new Error('No es un repositorio git.');
  const aplicadas = entries.filter((c) => (c.status || 'change') === 'change');
  const desde = Math.max(0, ...aplicadas.map((c) => Date.parse(c.date) || 0));
  const huecos = new Map();
  const ejecutar = (args) => {
    const out = git(repoPath, args);
    if (out === null) throw new Error('No se pudo leer git para generar el informe.');
    return out;
  };
  const archivos = (out) => out.split('\0').filter(Boolean);
  const registrados = (file) => aplicadas.flatMap((c) =>
    (c.files || []).filter((f) => f.file.replace(/\\/g, '/') === file).map((f) => ({ c, f })));
  const comprobar = (file, diff, motivo, hash) => {
    const registros = registrados(file);
    if (hash && registros.some(({ c }) => c.commit && (hash.startsWith(c.commit) || c.commit === hash))) return;
    const tramos = trocearDiff(diff);
    const cubierto = tramos.length && tramos.every((t) => registros.some(({ f }) =>
      (!t.antes.length || String(f.before ?? '').includes(t.antes.join('\n'))) &&
      (!t.despues.length || String(f.after ?? '').includes(t.despues.join('\n')))));
    if (!cubierto) huecos.set(file, { file, reason: motivo });
  };
  const head = git(repoPath, ['rev-parse', '--verify', 'HEAD']);
  // Git fecha los commits en segundos; una entrada puede llevar milisegundos.
  const hashes = head ? ejecutar(['log', '--format=%H', `--since=${new Date(Math.floor(desde / 1000) * 1000).toISOString()}`]).trim() : '';
  for (const hash of hashes ? hashes.split('\n') : []) {
    const rutas = archivos(ejecutar(['diff-tree', '--root', '-m', '--no-commit-id', '--name-only', '-r', '-z', hash]));
    for (const file of new Set(rutas)) {
      const diff = ejecutar(['show', '--format=', '--root', '-m', '--no-ext-diff', '--no-textconv', '--no-color', '-U0', hash, '--', file]);
      comprobar(file, diff, `Commit ${hash.slice(0, 7)} sin un cambio equivalente registrado`, hash);
    }
  }
  const bases = head ? [['HEAD']] : [['--cached'], []];
  for (const base of bases) {
    const rutas = archivos(ejecutar(['diff', ...base, '--name-only', '-z']));
    for (const file of rutas) {
      comprobar(file, ejecutar(['diff', ...base, '--no-ext-diff', '--no-textconv', '--no-color', '-U0', '--', file]),
        'Diff sin commitear sin un cambio equivalente registrado');
    }
  }
  for (const file of archivos(ejecutar(['ls-files', '--others', '--exclude-standard', '-z']))) {
    const contenido = readFileSync(join(repoPath, file), 'utf8');
    if (!registrados(file).some(({ f }) => f.after === contenido || f.after === contenido.replace(/\r?\n$/, ''))) {
      huecos.set(file, { file, reason: 'Archivo sin seguimiento no registrado' });
    }
  }
  const gaps = [...huecos.values()].sort((a, b) => a.file.localeCompare(b.file));
  return { since: desde ? new Date(desde).toISOString() : null, count: gaps.length, message: `${gaps.length} cambios sin registrar`, gaps };
}

export function ramaActual(repoPath) {
  const rama = git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!rama) return null;
  const nombre = rama.trim();
  // En un repo sin commits, HEAD no apunta a nada y git responde "HEAD".
  return nombre === 'HEAD' ? null : nombre;
}

// La rama principal del repo, que es contra la que se juzga si conviene abrir
// una: se pregunta al remoto, y si no hay remoto se cae a lo que exista.
export function ramaPrincipal(repoPath) {
  const cabeza = git(repoPath, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (cabeza) return cabeza.trim().replace('refs/remotes/origin/', '');
  for (const candidata of ['main', 'master']) {
    if (git(repoPath, ['rev-parse', '--verify', '--quiet', candidata])) return candidata;
  }
  return null;
}

export function remoto(repoPath) {
  const url = git(repoPath, ['remote', 'get-url', 'origin']);
  if (!url) return null;
  const limpia = url.trim();
  // git@github.com:duenio/repo.git y https://github.com/duenio/repo.git
  const m = limpia.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/i);
  return {
    url: limpia,
    github: Boolean(m),
    slug: m ? `${m[1]}/${m[2]}` : null,
  };
}

export function estado(repoPath) {
  const salida = git(repoPath, ['status', '--porcelain=v1', '--untracked-files=normal']);
  if (salida === null) return null;
  const modificados = [];
  const sinSeguimiento = [];
  for (const linea of salida.split('\n')) {
    if (!linea.trim()) continue;
    const marca = linea.slice(0, 2);
    // El nombre puede venir como "viejo -> nuevo" en un renombrado.
    const ruta = linea.slice(3).split(' -> ').pop().replace(/^"|"$/g, '');
    if (marca === '??') sinSeguimiento.push(ruta);
    else modificados.push(ruta);
  }
  return { modificados, sinSeguimiento, limpio: !modificados.length && !sinSeguimiento.length };
}

export function ultimoCommit(repoPath) {
  const salida = git(repoPath, ['log', '-1', '--format=%h%x00%ct%x00%s']);
  if (!salida) return null;
  const [hash, ts, asunto] = salida.trim().split('\u0000');
  return { hash, fecha: Number(ts) * 1000, asunto };
}

// Commits desde una fecha, con los archivos que toca cada uno. Se usa para
// sellar entradas: saber en qué commit acabó cada cambio registrado.
export function commitsDesde(repoPath, desdeMs) {
  const desde = new Date(desdeMs || 0).toISOString();
  const salida = git(repoPath, [
    'log', '--format=%x01%h%x00%ct%x00%s', '--name-only', '--no-merges', `--since=${desde}`,
  ]);
  if (!salida) return [];
  const commits = [];
  for (const trozo of salida.split('\u0001')) {
    if (!trozo.trim()) continue;
    const lineas = trozo.split('\n');
    const [hash, ts, asunto] = lineas[0].split('\u0000');
    if (!hash) continue;
    commits.push({
      hash,
      fecha: Number(ts) * 1000,
      asunto: asunto || '',
      archivos: lineas.slice(1).map((l) => l.trim()).filter(Boolean),
    });
  }
  // git log va del más nuevo al más viejo; para sellar interesa al revés,
  // porque a cada entrada le corresponde el PRIMER commit que la recoge.
  return commits.reverse();
}

// Commits que aún no están en el remoto. Sin remoto o sin rama de seguimiento
// devuelve null: no es que haya cero, es que la pregunta no aplica.
export function sinEmpujar(repoPath) {
  const seguimiento = git(repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (!seguimiento) return null;
  const cuenta = git(repoPath, ['rev-list', '--count', `${seguimiento.trim()}..HEAD`]);
  return cuenta === null ? null : Number(cuenta.trim());
}

// Dónde se separó la rama actual de la principal. Marca desde cuándo cuentan
// las entradas de esta rama, que es lo que va al cuerpo de un PR.
export function baseDeRama(repoPath, principal) {
  if (!principal) return null;
  const base = git(repoPath, ['merge-base', 'HEAD', principal]);
  if (!base) return null;
  const hash = base.trim();
  const ts = git(repoPath, ['log', '-1', '--format=%ct', hash]);
  return { hash: hash.slice(0, 7), fecha: ts ? Number(ts.trim()) * 1000 : 0 };
}

export function leerArchivo(repoPath, ruta) {
  return git(repoPath, ['show', `HEAD:${ruta}`]);
}

// El archivo tal como quedó en un commit concreto. Devuelve null si ahí no
// existía, que es información útil y no un error.
export function leerArchivoEn(repoPath, commit, ruta) {
  return git(repoPath, ['show', `${commit}:${ruta}`]);
}

export function instantanea(repoPath) {
  if (!esRepo(repoPath)) return null;
  return {
    rama: ramaActual(repoPath),
    ramaPrincipal: ramaPrincipal(repoPath),
    remoto: remoto(repoPath),
    estado: estado(repoPath),
    ultimoCommit: ultimoCommit(repoPath),
    sinEmpujar: sinEmpujar(repoPath),
  };
}

import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Dónde vive el almacén. Un solo sitio: lo importan store.mjs y webproc.mjs,
// y si cada uno lo calculase por su cuenta acabarían discrepando (el pid del
// servidor web en un directorio y los datos en otro).
//
// El orden importa, y la regla del clon es la que evita romper a quien ya lo
// usa: instalado como dependencia la raíz del paquete cuelga de node_modules,
// y ahí un `npm install` limpio se lleva por delante el historial entero —
// que además no se versiona a propósito.
//
//   1. CODE_TIMELINE_DATA manda siempre (tests en temporal, o el historial
//      guardado donde el usuario quiera).
//   2. Ejecutando desde un clon del repo: la carpeta data/ de siempre, para no
//      mover el historial actual del dueño ni desmentir al README.
//   3. Instalado (dependencia o global): el perfil del usuario, que sobrevive
//      a reinstalar el paquete.
export function resolveDataDir(opts = {}) {
  return resolveDataDirWithReason(opts).dir;
}

// La misma resolución, diciendo además CUÁL de las tres reglas ganó. `doctor`
// lo enseña: saber que el almacén está en tal sitio no sirve de nada si no se
// sabe por qué, que es lo que dice si hay que tocar la variable de entorno,
// mudarse de clon, o nada.
export function resolveDataDirWithReason({ env = process.env, root = ROOT, home = homedir() } = {}) {
  if (env.CODE_TIMELINE_DATA) return { dir: resolve(env.CODE_TIMELINE_DATA), reason: 'env' };
  if (isRepoClone(root)) return { dir: join(root, 'data'), reason: 'clon' };
  return { dir: join(home, '.code-timeline'), reason: 'perfil' };
}

// Dos condiciones, no una: el .git dice que es un clon de trabajo, y la
// ausencia de node_modules en la ruta descarta el caso raro de un paquete
// instalado que arrastre un .git dentro (npm no lo empaqueta, pero un
// `npm install <ruta>` o un enlace sí pueden dejarlo ahí).
function isRepoClone(root) {
  if (root.split(/[\\/]/).includes('node_modules')) return false;
  return existsSync(join(root, '.git'));
}

const RESUELTO = resolveDataDirWithReason();

export const DATA_DIR = RESUELTO.dir;
export const DATA_DIR_REASON = RESUELTO.reason;

export function ensureDataDirExists(dir = DATA_DIR) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

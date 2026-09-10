import { instantanea } from './git.mjs';
import { pendientesDeCommit } from './consejo.mjs';
import { capturar } from './captura.mjs';

const IGNORADOS = ['.code-timeline/', '.claude/', 'AGENTS.md', 'CLAUDE.md'];

export function cobertura(project, changes) {
  const git = instantanea(project.repoPath);
  if (!git || !git.estado) return { comprobable: false, completa: true, archivosSinEntrada: [] };
  const pendientes = pendientesDeCommit(changes, git);
  // Un archivo sin seguimiento se captura leyéndolo del disco, y una vez en el
  // índice sale de git diff, que no trae el salto de línea final. Es el mismo
  // código, así que comparar en crudo daba por no registrado lo que sí lo
  // estaba, justo al preparar el commit.
  const norm = (t) => String(t).replace(/\s+$/, '');
  const porArchivo = new Map();
  for (const f of pendientes.flatMap((c) => c.files || [])) {
    if (!porArchivo.has(f.file)) porArchivo.set(f.file, []);
    porArchivo.get(f.file).push(...String(f.after || '').split('\n…\n').map(norm));
  }
  const tocados = [...git.estado.modificados, ...git.estado.sinSeguimiento]
    .filter((f) => !IGNORADOS.some((prefijo) => f === prefijo || f.startsWith(prefijo)));
  const archivosSinEntrada = tocados.filter((file) => {
    const actuales = capturar(project.repoPath, file);
    if (!actuales) return !porArchivo.has(file);
    const documentados = porArchivo.get(file) || [];
    return String(actuales.after || '').split('\n…\n')
      .some((tramo) => !documentados.includes(norm(tramo)));
  });
  return { comprobable: true, completa: archivosSinEntrada.length === 0, archivosSinEntrada, pendientes };
}

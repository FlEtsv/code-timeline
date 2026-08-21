import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readFileAtCommit(repoPath, file, commit) {
  // "archivo:línea" en todo este proyecto siempre se lee contra el ESTADO ACTUAL
  // del working tree (así se registra cada cambio) — es lo que abrirías en el editor
  // hoy. El commit es solo el respaldo si el archivo ya no existe ahí (renombrado o
  // borrado desde que se registró el cambio).
  try {
    return readFileSync(join(repoPath, file), 'utf8');
  } catch (err) {
    if (!commit) throw err;
    return execFileSync('git', ['show', `${commit}:${file}`], {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 30,
    });
  }
}

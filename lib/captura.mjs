// Capturar el antes/después del código en vez de hacer que lo escriba Claude.
//
// El porqué, medido sobre los 129 cambios ya registrados: el código
// `before`/`after` era el 59% de todo lo que un agente escribe por MCP —
// ~103.000 tokens de salida, unos 800 por entrada. Y es código que ya está en
// el disco y en git. Se estaba pagando por reteclear algo que este proceso
// puede leer solo.
//
// Así que `add_change` admite ahora que los archivos vengan sin código:
// `{ file: "lib/x.mjs" }` basta. Lo que Claude sigue escribiendo es lo único
// que solo él sabe — el título y el PORQUÉ —, que es justo lo que distingue
// este historial de un `git log`.
//
// La captura sale de `git diff`, no de leer el archivo entero: el diff ya sabe
// QUÉ cambió, así que el antes y el después salen exactos y acotados sin que
// nadie tenga que decir por dónde mirar.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Líneas de contexto alrededor de cada cambio. Tres es lo que enseña un diff
// normal: suficiente para situarse, poco para que el panel siga leyéndose.
const CONTEXTO = 3;

// Entre dos tramos cambiados del mismo archivo va esta marca, para que no
// parezca que el código de arriba continúa en el de abajo.
const CORTE = '…';

function git(repoPath, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 1024 * 1024 * 20,
      timeout: 5000,
    });
  } catch {
    return null;
  }
}

// Parte un diff unificado en tramos, cada uno con su antes, su después y la
// línea por la que empieza en el archivo de ahora.
export function trocearDiff(diff) {
  const tramos = [];
  let actual = null;

  for (const linea of String(diff || '').split('\n')) {
    const cabecera = linea.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (cabecera) {
      if (actual) tramos.push(actual);
      actual = {
        desde: Number(cabecera[1]),
        hasta: Number(cabecera[1]) + (cabecera[2] === undefined ? 1 : Number(cabecera[2])) - 1,
        antes: [],
        despues: [],
      };
      continue;
    }
    if (!actual) continue;   // cabeceras del diff antes del primer @@

    const marca = linea[0];
    const cuerpo = linea.slice(1);
    if (marca === '-') actual.antes.push(cuerpo);
    else if (marca === '+') actual.despues.push(cuerpo);
    else if (marca === ' ') { actual.antes.push(cuerpo); actual.despues.push(cuerpo); }
    // '\' es "No newline at end of file": no es contenido.
  }
  if (actual) tramos.push(actual);
  return tramos;
}

// Tope de lo que se captura de un archivo. Un cambio que toca tantos sitios
// que no cabe aquí probablemente debería ser varias entradas; recortarlo en
// silencio sería peor, así que se dice.
const MAX_LINEAS = 400;

function unir(tramos, lado, recortado) {
  const texto = tramos.map((t) => t[lado].join('\n')).join(`\n${CORTE}\n`);
  return recortado ? `${texto}\n${CORTE} (hay más cambios en este archivo)` : texto;
}

// Un archivo nuevo no tiene "antes", y su diff lo dice con /dev/null.
function esNuevo(diff) {
  return /^--- \/dev\/null$/m.test(diff || '');
}

function esBorrado(diff) {
  return /^\+\+\+ \/dev\/null$/m.test(diff || '');
}

// Devuelve { before, after, lineStart, lineEnd, origen } o null si no hay nada
// que capturar. `origen` dice de dónde salió, para poder explicarlo.
export function capturar(repoPath, archivo, { lineStart, lineEnd } = {}) {
  const opciones = ['diff', `-U${CONTEXTO}`, '--no-color', '--no-ext-diff'];

  // Primero el trabajo sin commitear, que es el caso normal: se registra el
  // cambio justo después de escribirlo. Si no hay nada ahí, el último commit
  // —porque puede registrarse algo ya commiteado.
  const intentos = [
    { args: [...opciones, 'HEAD', '--', archivo], origen: 'sin commitear' },
    { args: [...opciones, 'HEAD~1', 'HEAD', '--', archivo], origen: 'último commit' },
  ];

  for (const intento of intentos) {
    const diff = git(repoPath, intento.args);
    if (!diff || !diff.trim()) continue;

    if (esBorrado(diff)) {
      return { before: trocearDiff(diff).map((t) => t.antes.join('\n')).join(`\n${CORTE}\n`), after: '// (fichero eliminado)', origen: intento.origen };
    }

    let tramos = trocearDiff(diff);
    if (!tramos.length) continue;

    // Si quien registra acotó unas líneas, solo se captura lo que cae ahí:
    // un archivo con varios cambios sueltos no debe traerse entero.
    //
    // Cuando el rango no cae sobre ningún tramo se capturan todos, porque las
    // líneas que apunta un agente suelen ser aproximadas y lo que de verdad
    // cambió en ese archivo es la respuesta honesta. Pero entonces el rango
    // que se anuncia tiene que ser el real, no el que se pidió: decir
    // "líneas 655-660" mientras se enseña el archivo entero es mentir.
    let acotado = false;
    if (lineStart) {
      const fin = lineEnd || lineStart;
      const dentro = tramos.filter((t) => t.hasta >= lineStart && t.desde <= fin);
      if (dentro.length) { tramos = dentro; acotado = true; }
    }

    let recortado = false;
    let total = tramos.reduce((n, t) => n + t.antes.length + t.despues.length, 0);
    while (tramos.length > 1 && total > MAX_LINEAS) {
      const fuera = tramos.pop();
      total -= fuera.antes.length + fuera.despues.length;
      recortado = true;
    }

    return {
      before: esNuevo(diff) ? null : unir(tramos, 'antes', recortado),
      after: unir(tramos, 'despues', recortado),
      lineStart: acotado ? lineStart : tramos[0].desde,
      lineEnd: (acotado && lineEnd) ? lineEnd : tramos[tramos.length - 1].hasta,
      origen: recortado ? `${intento.origen}, recortado` : intento.origen,
    };
  }

  // Sin diff: o el archivo no está en git (sin seguimiento), o no ha cambiado.
  // En ambos casos lo que hay en el disco es el "después"; sin un rango de
  // líneas no se captura el archivo entero, que podría ser enorme.
  try {
    const contenido = readFileSync(join(repoPath, archivo), 'utf8');
    const seguido = git(repoPath, ['ls-files', '--error-unmatch', '--', archivo]) !== null;
    if (!lineStart && seguido) return null;   // sin cambios y sin rango: nada que decir

    const lineas = contenido.split('\n');
    const desde = lineStart ? Math.max(1, lineStart) : 1;
    const hasta = lineEnd || (lineStart ? lineStart : lineas.length);
    return {
      before: null,
      after: lineas.slice(desde - 1, hasta).join('\n'),
      lineStart: desde,
      lineEnd: Math.min(hasta, lineas.length),
      origen: seguido ? 'disco' : 'archivo nuevo',
    };
  } catch {
    return null;
  }
}

// Rellena los archivos de una entrada a los que les falte el código. Los que
// ya lo traen no se tocan: quien lo escribió a mano tenía un motivo, y a veces
// el fragmento que explica el cambio no es exactamente el que salió del diff.
export function completarArchivos(repoPath, files) {
  if (!repoPath || !Array.isArray(files)) return { files, capturados: 0 };
  let capturados = 0;

  const salida = files.map((f) => {
    if (f.after != null) return f;
    const cap = capturar(repoPath, f.file, { lineStart: f.lineStart, lineEnd: f.lineEnd });
    if (!cap) return f;
    capturados += 1;
    return {
      ...f,
      before: f.before !== undefined ? f.before : cap.before,
      after: cap.after,
      lineStart: f.lineStart || cap.lineStart,
      lineEnd: f.lineEnd || cap.lineEnd,
      capturado: cap.origen,
    };
  });

  return { files: salida, capturados };
}

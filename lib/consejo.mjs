// El copiloto de git: mira el historial y el estado del repo, y dice qué
// convendría hacer con git ahora mismo.
//
// La idea es que Code Timeline sabe algo que git no sabe: el PORQUÉ de cada
// cambio, escrito cuando estaba fresco. Con eso puede redactar un mensaje de
// commit de verdad en vez de adivinarlo del diff, y puede detectar que una
// tanda de trabajo dejó de ser una sola cosa — un `jump` entre entradas es,
// literalmente, un cambio de contexto — y que por tanto pide dos commits o
// una rama aparte.
//
// Aconseja; no ejecuta. Todos los comandos que salen de aquí son texto para
// que el usuario los copie. Ver la cabecera de git.mjs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  instantanea, commitsDesde, baseDeRama, leerArchivoEn,
} from './git.mjs';

// ── Utilidades de texto ─────────────────────────────────────

export function slug(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
}

// El asunto de un commit se lee en una línea de `git log --oneline`: si no
// cabe, se corta ahí. 72 es el ancho que respetan git y GitHub.
function asunto(titulo) {
  const limpio = String(titulo || '').trim().replace(/\s+/g, ' ').replace(/\.$/, '');
  if (limpio.length <= 72) return limpio;
  const corte = limpio.slice(0, 72);
  const espacio = corte.lastIndexOf(' ');
  return (espacio > 40 ? corte.slice(0, espacio) : corte).replace(/[,;:]$/, '') + '…';
}

function parrafos(texto) {
  return String(texto || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

// El cuerpo de un commit se lee en una terminal, donde nada lo va a reajustar.
function ajustar(texto, ancho = 72) {
  const salida = [];
  for (const linea of String(texto).split('\n')) {
    if (linea.length <= ancho) { salida.push(linea); continue; }
    let actual = '';
    for (const palabra of linea.split(' ')) {
      if (actual && (actual + ' ' + palabra).length > ancho) { salida.push(actual); actual = palabra; }
      else actual = actual ? actual + ' ' + palabra : palabra;
    }
    if (actual) salida.push(actual);
  }
  return salida.join('\n');
}

// ── Qué está sin commitear ──────────────────────────────────

const esCambio = (c) => (c.status || 'change') === 'change';

// Una entrada está pendiente de commit si nadie la ha sellado y se registró
// después del último commit. Lo segundo importa: sin ello, un proyecto que
// nunca haya usado el sellado vería TODO su historial como pendiente.
export function pendientesDeCommit(changes, git) {
  const corte = git && git.ultimoCommit ? git.ultimoCommit.fecha : 0;
  return changes.filter((c) => esCambio(c) && !c.commit && (Date.parse(c.date) || 0) > corte);
}

// Un `jump` declara que la entrada no tiene que ver con la anterior. Ese es
// justo el corte natural entre dos commits: agrupamos por ahí.
export function grupos(entradas) {
  const salida = [];
  for (const c of entradas) {
    const salta = c.relation && c.relation.type === 'jump';
    if (!salida.length || salta) salida.push([c]);
    else salida[salida.length - 1].push(c);
  }
  return salida;
}

export function archivosDe(entradas) {
  return [...new Set(entradas.flatMap((c) => (c.files || []).map((f) => f.file)))];
}

// Los archivos que aparecen en más de un grupo. Si los hay, la separación en
// commits no se puede hacer repartiendo archivos.
export function archivosCompartidos(bloques) {
  const vistos = new Map();
  bloques.forEach((bloque, i) => {
    for (const archivo of archivosDe(bloque)) {
      if (!vistos.has(archivo)) vistos.set(archivo, new Set());
      vistos.get(archivo).add(i);
    }
  });
  return [...vistos].filter(([, grupos]) => grupos.size > 1).map(([archivo]) => archivo);
}

function comillasSiHaceFalta(ruta) {
  return /[\s'"$`\\]/.test(ruta) ? `'${ruta.replace(/'/g, `'\\''`)}'` : ruta;
}

export function mensajeCommit(entradas) {
  if (!entradas.length) return null;
  const [primera, ...resto] = entradas;
  const cuerpo = [];

  const explicacion = parrafos(primera.explanation);
  if (explicacion.length) cuerpo.push(ajustar(explicacion[0]));

  if (resto.length) {
    cuerpo.push('En la misma tanda:');
    cuerpo.push(resto.map((c) => ajustar(`- ${asunto(c.title)}`, 70)).join('\n'));
  }

  const rotas = entradas.filter((c) => c.test && c.test.status === 'failing');
  if (rotas.length) {
    cuerpo.push(`Atención: ${rotas.length} de estos cambios tiene una prueba en rojo.`);
  }

  return {
    asunto: asunto(primera.title),
    cuerpo: cuerpo.join('\n\n'),
    entradas: entradas.map((c) => c.id),
  };
}

// El comando listo para pegar. Dos -m porque el cuerpo va en su propio
// párrafo, y comillas simples escapadas para que un apóstrofo no lo rompa.
export function comandoCommit(mensaje) {
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  return mensaje.cuerpo
    ? `git commit -m ${q(mensaje.asunto)} -m ${q(mensaje.cuerpo)}`
    : `git commit -m ${q(mensaje.asunto)}`;
}

// ── Sellado: qué commit recogió cada entrada ────────────────

// Para cada entrada sin sellar, el commit que la recogió.
//
// Se busca el primero posterior a ella que contenga TODOS sus archivos, no
// alguno: emparejar por "toca alguno" se equivoca en cuanto dos commits
// seguidos tocan el mismo archivo, que es lo normal cuando una tanda se parte
// en dos. Le pasó a este propio repo — una entrada sobre captura.mjs +
// store.mjs se selló con el commit anterior, que solo tenía store.mjs.
//
// Y "el primero" y no "el último" porque una entrada entra en el historial en
// cuanto alguien la commitea; que otro commit posterior vuelva a tocar el
// archivo no cambia dónde entró.
export function sellosPendientes(project, changes, git, { recalcular = false } = {}) {
  const candidatas = changes.filter((c) => esCambio(c) && (recalcular || !c.commit));
  if (!candidatas.length || !git || !git.ultimoCommit) return [];

  const primera = candidatas.reduce((min, c) => Math.min(min, Date.parse(c.date) || 0), Infinity);
  const commits = commitsDesde(project.repoPath, primera === Infinity ? 0 : primera);
  if (!commits.length) return [];

  const sellos = [];
  for (const c of candidatas) {
    // git guarda la fecha de un commit con precisión de SEGUNDO y las entradas
    // llevan milisegundos. Una entrada registrada a las 14:09:57.412 y
    // commiteada acto seguido queda "después" de su propio commit, que git
    // marca a las 14:09:57.000, y se sellaba al commit siguiente. Se compara
    // por segundos, que es la precisión real del dato.
    const fecha = Math.floor((Date.parse(c.date) || 0) / 1000) * 1000;
    const suyos = [...new Set((c.files || []).map((f) => f.file))];
    if (!suyos.length) continue;
    const posteriores = commits.filter((k) => k.fecha >= fecha);

    // Tres criterios, del más fuerte al más débil. Los dos primeros son
    // decisiones; el tercero es una conjetura y se marca como tal.
    //
    // 1. El código de la entrada ESTÁ en el archivo tal como quedó en ese
    //    commit. Es la prueba directa de dónde entró, y resuelve el caso que
    //    las rutas no pueden: dos commits seguidos que tocan los mismos
    //    archivos. Le pasó a este repo.
    const porContenido = posteriores.find((k) => loTrajoEsteCommit(project.repoPath, k, c));
    // 2. El commit trae todos sus archivos.
    const porArchivos = posteriores.find((k) => suyos.every((a) => k.archivos.includes(a)));
    // 3. Toca alguno: la entrada quedó repartida entre varios commits.
    const porAlguno = posteriores.find((k) => suyos.some((a) => k.archivos.includes(a)));

    const commit = porContenido || porArchivos || porAlguno;
    if (!commit || commit.hash === c.commit) continue;
    const seguro = Boolean(porContenido);

    sellos.push({
      changeId: c.id,
      title: c.title,
      commit: commit.hash,
      asunto: commit.asunto,
      seguro,
      // Solo se pisa un sello ya puesto cuando el nuevo es demostrablemente
      // mejor, es decir, cuando se comprobó contra el contenido del archivo.
      ...(c.commit ? { corrige: c.commit, exacto: seguro } : {}),
    });
  }
  return sellos;
}

// Qué proporción del código de una entrada aparece en el archivo tal como
// quedó en ese commit. Se comparan líneas sueltas y no el bloque entero porque
// la captura recorta y une tramos con una marca.
function coincidencia(repoPath, hash, f) {
  const contenido = leerArchivoEn(repoPath, hash, f.file);
  if (contenido == null) return null;
  const esperadas = lineasUtiles(String(f.after || '').split(CORTE_CAPTURA).join('\n'));
  if (esperadas.length < 2) return null;   // muy poco como para decidir
  const presentes = new Set(lineasUtiles(contenido));
  return esperadas.filter((l) => presentes.has(l)).length / esperadas.length;
}

// ¿Fue ESTE commit el que trajo el código de la entrada?
//
// No basta con que el código esté ahí: el `after` que captura la herramienta
// lleva tres líneas de contexto a cada lado, así que en un cambio de una línea
// seis de siete líneas ya existían ANTES. Mirar solo el commit daba por bueno
// el commit anterior al cambio real, y encima como "seguro" — se comprobó con
// un repo de prueba y sellaba al padre.
//
// Lo que de verdad distingue al commit que introdujo el cambio es que el
// código encaje mejor en él que en su padre. Eso es lo que se pregunta aquí.
function loTrajoEsteCommit(repoPath, commit, entrada) {
  let alguno = false;
  for (const f of entrada.files || []) {
    if (!commit.archivos.includes(f.file)) return false;
    const aqui = coincidencia(repoPath, commit.hash, f);
    if (aqui == null || aqui < 0.8) return false;
    const antes = coincidencia(repoPath, `${commit.hash}~1`, f);
    if (antes == null) {
      // Sin padre legible —primer commit del repo, o el archivo no existía—
      // el archivo es entero de este commit, así que su código tiene que
      // aparecer casi al completo. Con el 0,8 de antes, las líneas de
      // contexto bastaban para dar por bueno el primer commit de un repo.
      if (aqui < 0.98) return false;
    } else if (antes >= aqui) {
      // Si encaja igual o mejor en el padre, el cambio ya estaba: no lo trajo
      // este commit.
      return false;
    }
    alguno = true;
  }
  return alguno;
}

// La marca que pone la captura entre dos tramos del mismo archivo.
const CORTE_CAPTURA = '…';

// ── Deriva: lo que dice el historial ya no está en el código ─

// La primera línea del "después" cuando la entrada registra que el archivo se
// borra, en las formas en que se ha escrito hasta ahora.
const ANUNCIA_BORRADO = /elimin|borrad|suprimid|retirad|delete|removed/i;

function lineasUtiles(texto) {
  return String(texto || '').split('\n').map((l) => l.trim()).filter((l) => l.length > 3);
}

// Una entrada deriva cuando su código "después" ya no se reconoce en el
// archivo. Solo se mira la ÚLTIMA entrada de cada archivo: si otra posterior
// lo tocó, que la vieja ya no cuadre es lo normal, no una señal.
export function deriva(project, changes) {
  const ultimaPorArchivo = new Map();
  for (const c of changes) {
    if (!esCambio(c)) continue;
    for (const f of c.files || []) {
      const previa = ultimaPorArchivo.get(f.file);
      if (!previa || (Date.parse(c.date) || 0) >= (Date.parse(previa.change.date) || 0)) {
        ultimaPorArchivo.set(f.file, { change: c, file: f });
      }
    }
  }

  const hallazgos = [];
  for (const [ruta, { change, file }] of ultimaPorArchivo) {
    // Una entrada puede registrar un archivo de fuera del repo (un CLAUDE.md
    // global, un archivo de configuración del sistema). No es deriva: es que
    // esa ruta nunca fue relativa al proyecto.
    if (ruta.startsWith('/') || ruta.startsWith('~') || ruta.startsWith('..')) continue;
    let contenido;
    try {
      contenido = readFileSync(join(project.repoPath, ruta), 'utf8');
    } catch (err) {
      // Una carpeta con ese nombre no es un archivo que falte: anunciarlo como
      // "ya no existe" sería mentir sobre lo que se ve en el disco.
      if (err && err.code === 'EISDIR') continue;
      // Que el archivo no esté solo es deriva si la entrada decía que había
      // código ahí. Un borrado registrado como tal — el "después" empieza
      // anunciándolo — es el historial acertando, no fallando.
      if (!ANUNCIA_BORRADO.test(String(file.after || '').trim().split('\n')[0] || '')) {
        hallazgos.push({
          changeId: change.id, title: change.title, file: ruta,
          motivo: 'el archivo ya no existe en el repo',
        });
      }
      continue;
    }
    const esperadas = lineasUtiles(file.after);
    if (esperadas.length < 2) continue;   // un fragmento de una línea no da para juzgar
    const presentes = new Set(lineasUtiles(contenido));
    const encontradas = esperadas.filter((l) => presentes.has(l)).length;
    const proporcion = encontradas / esperadas.length;
    if (proporcion < 0.5) {
      hallazgos.push({
        changeId: change.id, title: change.title, file: ruta,
        motivo: `solo queda el ${Math.round(proporcion * 100)}% del código registrado`,
      });
    }
  }
  return hallazgos;
}

// ── Cuerpo de un PR ─────────────────────────────────────────

export function cuerpoPr(project, changes, git) {
  const base = git && git.ramaPrincipal ? baseDeRama(project.repoPath, git.ramaPrincipal) : null;
  const desde = base ? base.fecha : 0;
  const enRama = changes.filter((c) => esCambio(c) && (Date.parse(c.date) || 0) >= desde);
  if (!enRama.length) return null;

  const out = [];
  out.push('## Qué cambia', '');
  for (const c of enRama) out.push(`- ${asunto(c.title)}`);
  out.push('', '## Por qué', '');
  for (const c of enRama) {
    const [primer] = parrafos(c.explanation);
    out.push(`**${asunto(c.title)}**`, '', primer || '_Sin explicación registrada._', '');
  }

  const conPrueba = enRama.filter((c) => c.test && c.test.status !== 'untested');
  out.push('## Cómo se ha probado', '');
  if (!conPrueba.length) {
    out.push('_Ninguna de estas entradas tiene prueba registrada._', '');
  } else {
    const etiqueta = { auto: 'automática', manual: 'a mano', failing: 'EN ROJO' };
    for (const c of conPrueba) {
      const t = c.test;
      out.push(`- **${asunto(c.title)}** — ${etiqueta[t.status] || t.status}` +
        (t.command ? `: \`${t.command}\`` : '') + (t.note ? `. ${t.note}` : ''));
    }
    out.push('');
  }

  const sinRevisar = enRama.filter((c) => !c.verified).length;
  const rotas = enRama.filter((c) => c.test && c.test.status === 'failing').length;
  const avisos = [];
  if (rotas) avisos.push(`${rotas} cambio(s) con la prueba en rojo`);
  if (sinRevisar) avisos.push(`${sinRevisar} sin revisar en el timeline`);
  if (avisos.length) out.push('> **Antes de fusionar:** ' + avisos.join(' · '), '');

  out.push(`_${enRama.length} entrada(s) del timeline de ${project.name}` +
    (base ? `, desde ${base.hash}` : '') + '._');

  return { rama: git && git.rama, base: base && base.hash, entradas: enRama.length, texto: out.join('\n') };
}

// ── El consejo ──────────────────────────────────────────────

function consejo(id, nivel, titulo, detalle, comandos = []) {
  return { id, nivel, titulo, detalle, comandos };
}

export function aconsejar(project, changes) {
  const git = instantanea(project.repoPath);
  if (!git) {
    return { git: null, consejos: [], pendientes: [], mensaje: null };
  }

  const consejos = [];
  const pendientes = pendientesDeCommit(changes, git);
  const bloques = grupos(pendientes);
  const sucio = git.estado && !git.estado.limpio;
  const enPrincipal = git.rama && git.ramaPrincipal && git.rama === git.ramaPrincipal;

  // 1. Un salto entre las entradas pendientes dice que esto ya no es una sola
  //    cosa. Es la señal más fuerte que tiene el historial y va primero.
  if (bloques.length > 1 && sucio) {
    const salto = bloques[1][0];
    const compartidos = archivosCompartidos(bloques);

    // Decir "son dos commits" sin mirar si se pueden separar es mandar a
    // alguien a un callejón: si los dos grupos tocan el mismo archivo, no hay
    // `git add <archivo>` que los parta, y hay que trocear por hunks o
    // reconstruir un estado intermedio. Vale más avisarlo aquí.
    const detalle = compartidos.length
      ? `Hay un salto de contexto en «${salto.title}»: ${(salto.relation && salto.relation.note) || 'sin motivo anotado'}. ` +
        `Pero los dos grupos tocan ${compartidos.length === 1 ? 'el mismo archivo' : 'los mismos archivos'} ` +
        `(${compartidos.slice(0, 3).join(', ')}${compartidos.length > 3 ? ` y ${compartidos.length - 3} más` : ''}), ` +
        'así que no basta con repartir archivos: hay que separar por trozos con `git add -p`, ' +
        'o commitear todo junto y explicar el salto en el propio mensaje.'
      : `Hay un salto de contexto en «${salto.title}»: ${(salto.relation && salto.relation.note) || 'sin motivo anotado'}. ` +
        'Ningún archivo está en los dos grupos, así que se pueden separar repartiéndolos.';

    consejos.push(consejo(
      'separar',
      'aviso',
      `Esto son ${bloques.length} commits, no uno`,
      detalle,
      [
        compartidos.length
          ? { etiqueta: 'Separar por trozos', texto: 'git add -p' }
          : {
            etiqueta: 'Commitear solo lo anterior al salto',
            texto: `git add ${archivosDe(bloques[0]).map(comillasSiHaceFalta).join(' ')} && ${comandoCommit(mensajeCommit(bloques[0]))}`,
          },
        // Si además se está en la principal, lo nuevo merece su propia rama:
        // son dos cosas distintas y una de ellas acaba de empezar.
        ...(enPrincipal ? [{ etiqueta: 'Abrir una rama para lo nuevo', texto: `git checkout -b ${slug(salto.title)}` }] : []),
      ],
    ));
  }

  // 2. Trabajo sin commitear con entradas que ya explican el porqué: el
  //    mensaje se redacta solo.
  const mensaje = bloques.length ? mensajeCommit(bloques[0]) : null;
  if (sucio && mensaje) {
    const cuantas = bloques[0].length;
    consejos.push(consejo(
      'commit',
      'sugerencia',
      cuantas === 1 ? 'Conviene un commit' : `Conviene un commit con ${cuantas} entradas`,
      'El árbol tiene cambios sin commitear y el timeline ya sabe por qué. ' +
      'Este mensaje sale de lo que registraste, no del diff.',
      [
        { etiqueta: 'Añadir y commitear', texto: `git add -A && ${comandoCommit(mensaje)}`, accion: 'commit' },
        { etiqueta: 'Solo el mensaje', texto: `${mensaje.asunto}\n\n${mensaje.cuerpo}` },
      ],
    ));
  } else if (sucio && !pendientes.length) {
    consejos.push(consejo(
      'sin-registrar',
      'aviso',
      'Hay código sin commitear que tampoco está en el timeline',
      `git ve ${(git.estado.modificados.length + git.estado.sinSeguimiento.length)} archivo(s) tocados, ` +
      'pero no hay ninguna entrada posterior al último commit. O falta registrar el cambio, o no era código.',
    ));
  }

  // 3. Trabajar directamente sobre la principal con una tanda ya larga.
  if (enPrincipal && pendientes.length >= 3 && bloques.length === 1) {
    consejos.push(consejo(
      'rama',
      'sugerencia',
      `${pendientes.length} entradas sin commitear sobre ${git.rama}`,
      'Una tanda de este tamaño en la rama principal es difícil de revisar y de deshacer. ' +
      'Una rama la deja aparte y abre la puerta a un PR.',
      [{ etiqueta: 'Abrir la rama', texto: `git checkout -b ${slug(pendientes[0].title)}` }],
    ));
  }

  // 4. Pruebas en rojo entre lo que está a punto de commitearse.
  const rotas = pendientes.filter((c) => c.test && c.test.status === 'failing');
  if (rotas.length) {
    consejos.push(consejo(
      'rojas',
      'aviso',
      `${rotas.length} cambio(s) sin commitear con la prueba en rojo`,
      rotas.map((c) => `«${c.title}»` + (c.test.command ? ` — \`${c.test.command}\`` : '')).join(' · ') +
      '. Commitear no los arregla, pero deja el rojo dentro del historial de git.',
    ));
  }

  // 5. Entradas que ya están en un commit pero no lo tienen apuntado.
  const sellos = sellosPendientes(project, changes, git);
  if (sellos.length) {
    consejos.push(consejo(
      'sellar',
      'sugerencia',
      `${sellos.length} entrada(s) ya commiteadas sin su commit apuntado`,
      'Sellarlas enlaza el historial con git: la pantalla completa puede leer el archivo tal como estaba, ' +
      'y dejan de contar como pendientes de commit.',
      [{ etiqueta: 'Sellar', texto: `code-timeline sellar --proyecto ${project.id}` }],
    ));
  }

  // 6. Commits hechos que nadie ha subido.
  if (git.sinEmpujar) {
    consejos.push(consejo(
      'empujar',
      'sugerencia',
      `${git.sinEmpujar} commit(s) sin subir`,
      'Están solo en esta máquina. Si alguien más trabaja en el repo, todavía no lo ve.',
      [{ etiqueta: 'Subir', texto: 'git push', accion: 'push' }],
    ));
  }

  // 7. Historial que ya no cuadra con el código.
  const derivadas = deriva(project, changes);
  if (derivadas.length) {
    consejos.push(consejo(
      'deriva',
      'aviso',
      `${derivadas.length} entrada(s) ya no se reconocen en el código`,
      derivadas.slice(0, 4).map((d) => `${d.file}: ${d.motivo} («${d.title}»)`).join(' · ') +
      (derivadas.length > 4 ? ` · y ${derivadas.length - 4} más` : '') +
      '. O se revirtió, o se reescribió sin registrarlo.',
    ));
  }

  // 8. Aceptadas sin aplicar: no es git, pero es trabajo comprometido y la
  //    web es el único sitio donde consta.
  const aceptadas = changes.filter((c) => c.status === 'accepted').length;
  if (aceptadas) {
    consejos.push(consejo(
      'aceptadas',
      'sugerencia',
      `${aceptadas} propuesta(s) aceptada(s) sin aplicar`,
      'Aprobadas, pero nadie ha escrito el código todavía.',
    ));
  }

  return { git, consejos, pendientes, mensaje };
}

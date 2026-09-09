// Markdown en los textos de una entrada: explicación, notas, motivo de un
// salto, motivo de un descarte.
//
// No es un Markdown completo ni quiere serlo. Estos textos los escribe Claude
// y ya venían con formato — `**Why:**`, backticks, listas —, pero la web los
// pintaba en crudo con esc() y se leían con los asteriscos a la vista. Aquí
// está lo que aparece de verdad en esos textos y nada más: no hay tablas, ni
// imágenes, ni HTML incrustado.
//
// El orden importa: primero se escapa TODO, y solo después se reintroducen las
// etiquetas que genera esta función. Así ningún texto guardado puede inyectar
// HTML en la página, venga de donde venga.
//
// El export a fichero .md vive en markdown.mjs y no tiene nada que ver con
// esto: aquel escribe Markdown, este lo lee.

// Copia deliberada de la de render.mjs: importarla de allí crearía un ciclo,
// porque render.mjs importa este módulo.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Solo se enlazan esquemas que abren una página. Un `[texto](javascript:...)`
// escrito en una explicación no debe convertirse en un enlace ejecutable.
function urlSegura(url) {
  return /^(https?:\/\/|mailto:|\/)/i.test(url.trim());
}

function inline(texto) {
  // Los tramos de `código` se apartan antes que nada: dentro de ellos, un
  // asterisco o un guion bajo son literales, no cursiva. Se sustituyen por una
  // marca que no puede aparecer en el texto escapado (lleva \u0000) y se
  // devuelven al final.
  const codigos = [];
  let s = esc(texto).replace(/`([^`\n]+)`/g, (_, code) => {
    codigos.push(`<code>${code}</code>`);
    return `\u0000c${codigos.length - 1}\u0000`;
  });

  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (todo, label, url) => (
    urlSegura(url)
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : todo
  ));

  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // La cursiva con guion bajo solo cuenta pegada a un borde de palabra: en
  // este proyecto abundan los identificadores tipo `gate_state` o
  // `memory_project_path`, y sin esta guarda se convertirían en cursiva.
  s = s.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:)!?])/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  return s.replace(/\u0000c(\d+)\u0000/g, (_, i) => codigos[Number(i)]);
}

function esLista(linea) {
  return /^\s*[-*+]\s+/.test(linea);
}

function esListaNum(linea) {
  return /^\s*\d+[.)]\s+/.test(linea);
}

function bloqueLista(lineas, ordenada) {
  const marca = ordenada ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
  const items = [];
  for (const linea of lineas) {
    if (marca.test(linea)) items.push(linea.replace(marca, ''));
    // Una línea suelta bajo un item es su continuación, no un item nuevo.
    else if (items.length) items[items.length - 1] += ' ' + linea.trim();
  }
  const tag = ordenada ? 'ol' : 'ul';
  return `<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`;
}

function bloque(lineas) {
  const primera = lineas[0];

  if (/^\s*```/.test(primera)) {
    const idioma = (primera.match(/^\s*```([\w-]*)/) || [])[1] || '';
    const cuerpo = lineas.slice(1).filter((l) => !/^\s*```/.test(l));
    const clase = idioma ? ` class="lang-${esc(idioma)}"` : '';
    return `<pre${clase}><code>${esc(cuerpo.join('\n'))}</code></pre>`;
  }

  const enc = primera.match(/^(#{1,4})\s+(.*)$/);
  if (enc) {
    // Se bajan dos niveles: el título de la entrada ya es un h2 en la tarjeta,
    // y un h1 dentro de una explicación rompería la jerarquía de la página.
    const nivel = Math.min(6, enc[1].length + 2);
    return `<h${nivel}>${inline(enc[2])}</h${nivel}>`;
  }

  if (/^\s*>/.test(primera)) {
    const cuerpo = lineas.map((l) => l.replace(/^\s*>\s?/, ''));
    return `<blockquote>${inline(cuerpo.join(' '))}</blockquote>`;
  }

  if (esLista(primera)) return bloqueLista(lineas, false);
  if (esListaNum(primera)) return bloqueLista(lineas, true);

  // Un salto de línea suelto dentro de un párrafo se respeta: en estos textos
  // suele separar dos frases que el autor quiso ver en renglones distintos.
  return `<p>${lineas.map((l) => inline(l)).join('<br />')}</p>`;
}

export function mdToHtml(texto) {
  const limpio = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n');
  if (!limpio.trim()) return '';

  const bloques = [];
  let actual = [];
  let enValla = false;

  for (const linea of limpio.split('\n')) {
    if (/^\s*```/.test(linea)) {
      actual.push(linea);
      // El cierre de una valla termina el bloque; su apertura lo abre y hay que
      // seguir tragando líneas en blanco hasta encontrarlo.
      if (enValla) { bloques.push(actual); actual = []; }
      enValla = !enValla;
      continue;
    }
    if (!enValla && !linea.trim()) {
      if (actual.length) { bloques.push(actual); actual = []; }
      continue;
    }
    // Una lista pegada al párrafo anterior, sin línea en blanco de por medio,
    // es un caso corriente en estos textos y hay que separarla igual.
    if (!enValla && actual.length && (esLista(linea) || esListaNum(linea))
        && !esLista(actual[0]) && !esListaNum(actual[0])) {
      bloques.push(actual);
      actual = [];
    }
    actual.push(linea);
  }
  if (actual.length) bloques.push(actual);

  return bloques.map(bloque).join('\n');
}

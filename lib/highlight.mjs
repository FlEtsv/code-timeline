// Resaltado de sintaxis mínimo, sin dependencias.
//
// No pretende ser un analizador: es un tokenizador de una pasada, suficiente
// para que un diff se lea. La regla que lo mantiene honesto es que, cuando no
// conoce un lenguaje, NO se inventa palabras clave — sigue marcando cadenas,
// números y comentarios (que son casi universales) y deja el resto en el color
// del texto. Antes de esto todo el código salía en un solo color plano.

const JS = 'export import from function const let var return if else for while of in new throw class extends default await async yield typeof instanceof delete void try catch finally switch case break continue do this super static get set null undefined true false';

const KEYWORDS = {
  javascript: JS,
  typescript: JS + ' interface type enum implements readonly public private protected namespace declare as satisfies',
  python: 'def class return if elif else for while in is not and or import from as pass break continue with lambda yield global nonlocal raise try except finally assert del async await None True False self',
  sql: 'select from where group by order having join inner left right outer on as insert into values update set delete create table alter drop index view distinct limit offset union all and or not null is case when then else end',
  css: 'important media supports keyframes import charset font-face',
  json: 'true false null',
};

// Cómo empieza un comentario en cada familia. Sin esto, un "#" de Python o un
// "--" de SQL se pintarían como puntuación y el comentario entero como código.
const LINE_COMMENT = { python: '#', ruby: '#', shell: '#', bash: '#', yaml: '#', toml: '#', sql: '--', lua: '--' };

const ALIAS = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', sh: 'shell', yml: 'yaml',
};

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function span(cls, text) {
  return `<span class="tk-${cls}">${esc(text)}</span>`;
}

export function normalizeLanguage(language) {
  const l = String(language || '').toLowerCase().trim();
  return ALIAS[l] || l;
}

// La extensión es lo único que se sabe del archivo completo: el lenguaje se
// guarda por cambio, no por archivo, y un archivo puede aparecer en varios.
export function languageFromPath(path) {
  const ext = String(path || '').split('.').pop().toLowerCase();
  return normalizeLanguage(ext);
}

export function highlight(code, language) {
  const lang = normalizeLanguage(language);
  const words = new Set((KEYWORDS[lang] || '').split(' ').filter(Boolean));
  // SQL y CSS se escriben indistintamente en mayúsculas o minúsculas; JS y
  // Python no, y ahí bajar a minúsculas marcaría "If" o "Return" como clave.
  const foldCase = lang === 'sql' || lang === 'css';
  const lineToken = LINE_COMMENT[lang] || '//';
  const src = String(code ?? '');

  let out = '';
  let i = 0;

  while (i < src.length) {
    const rest = src.slice(i);

    // Comentario de línea
    if (rest.startsWith(lineToken)) {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += span('com', src.slice(i, stop));
      i = stop;
      continue;
    }

    // Comentario de bloque (solo donde existe)
    if (lineToken === '//' && rest.startsWith('/*')) {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += span('com', src.slice(i, stop));
      i = stop;
      continue;
    }

    // Cadenas. Se avanza carácter a carácter respetando el escape, para que
    // un \' dentro de la cadena no la dé por cerrada.
    const q = src[i];
    if (q === '"' || q === "'" || q === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j += 1; break; }
        j += 1;
      }
      out += span('str', src.slice(i, j));
      i = j;
      continue;
    }

    // Número
    const num = /^\d[\d_]*(\.\d+)?([eE][+-]?\d+)?/.exec(rest);
    if (num) {
      out += span('num', num[0]);
      i += num[0].length;
      continue;
    }

    // Palabra
    const word = /^[A-Za-z_$@][\w$-]*/.exec(rest);
    if (word) {
      const t = word[0];
      if (words.has(foldCase ? t.toLowerCase() : t)) out += span('key', t);
      else if (src[i + t.length] === '(') out += span('fn', t);
      else out += esc(t);
      i += t.length;
      continue;
    }

    // Puntuación
    const pun = /^[{}()[\];,.:?!<>=+\-*/%&|^~]+/.exec(rest);
    if (pun) {
      out += span('pun', pun[0]);
      i += pun[0].length;
      continue;
    }

    out += esc(src[i]);
    i += 1;
  }

  return out;
}

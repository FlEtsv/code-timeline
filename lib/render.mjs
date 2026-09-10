import { highlight, languageFromPath } from './highlight.mjs';
import { mdToHtml } from './mdtext.mjs';
import { MOTORES, NIVELES } from './explicar.mjs';

// Los controles C0 no pintan nada en HTML pero sí rompen lo que lea la página
// después: un NUL en el código guardado hacía que grep tratara la página como
// binaria, y un navegador puede cortar ahí. Se quitan al PINTAR, no al
// guardar: el dato registrado es el que es y no se toca.
const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function esc(s) {
  return String(s ?? '')
    .replace(CONTROLES, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function dayKey(iso) {
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return 'sin-fecha'; }
}

function fmtFolioRest(iso) {
  try {
    const d = new Date(iso);
    const month = d.toLocaleDateString('es-ES', { month: 'long' });
    const weekday = d.toLocaleDateString('es-ES', { weekday: 'long' });
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(month)} ${d.getFullYear()} · ${cap(weekday)}`;
  } catch {
    return iso;
  }
}

export function renderFileTable(content, lineStart, lineEnd, path) {
  const language = languageFromPath(path);
  const lines = String(content).replace(CONTROLES, '').split('\n');
  const rows = lines.map((text, i) => {
    const n = i + 1;
    const changed = lineStart != null && n >= lineStart && n <= (lineEnd ?? lineStart);
    const src = highlight(text, language) || '&nbsp;';
    return `<tr${changed ? ' class="changed"' : ''}><td class="ln">${n}</td><td class="src">${src}</td></tr>`;
  }).join('');
  return `<table class="code-table"><tbody>${rows}</tbody></table>`;
}

const FAVICON = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="26" font-size="26">🕰️</text></svg>'
)}" />`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">`;

const TOKENS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Public Sans', system-ui, sans-serif;
    background: var(--bg); color: var(--ink); line-height: 1.5; -webkit-font-smoothing: antialiased;
    transition: background-color .3s ease, color .3s ease;
  }
  :root {
    --bg: oklch(98.7% 0.004 85);
    --surface: oklch(100% 0 0);
    --surface-2: oklch(96.5% 0.009 85);
    --border: oklch(91.5% 0.010 85);
    --ink: oklch(29% 0.018 80);
    --ink-dim: oklch(53% 0.018 80);
    --ink-faint: oklch(72% 0.014 80);
    --accent: oklch(68% 0.135 78);
    --accent-ink: oklch(45% 0.115 78);
    --accent-soft: oklch(68% 0.135 78 / 0.10);
    --before: oklch(56% 0.16 32);
    --before-line: oklch(75% 0.12 32);
    --before-hatch: oklch(56% 0.16 32 / 0.06);
    --after: oklch(58% 0.105 155);
    --after-line: oklch(75% 0.10 155);
    --shadow: 0 1px 2px oklch(45% 0.02 80 / 0.05), 0 10px 24px -14px oklch(45% 0.02 80 / 0.12);
    /* Las propuestas no compiten con el ámbar del historial ni con el rojo y
       el verde del diff: hue propio, para que "esto todavía no está en el
       código" se lea antes de haber leído una palabra. */
    --propose: oklch(52% 0.13 265);
    --propose-line: oklch(66% 0.12 265);
    --propose-soft: oklch(60% 0.13 265 / 0.09);
    /* El código tiene su propio fondo: separa "esto es código" de "esto es
       interfaz" y da un suelo neutro donde los colores del resaltado no
       compiten con el papel cálido del resto. */
    --code-bg: oklch(97.5% 0.006 85);
    /* Hues elegidos para no pisar a los que ya tienen dueño: ámbar (acento),
       32 y 155 (antes/después del diff) y 265 (propuestas). */
    --tk-key: oklch(48% 0.15 318);
    --tk-fn: oklch(45% 0.11 245);
    --tk-str: oklch(45% 0.10 150);
    --tk-num: oklch(48% 0.11 55);
    --tk-com: oklch(60% 0.02 80);
    --tk-pun: oklch(53% 0.018 80);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: oklch(19% 0.014 75); --surface: oklch(23% 0.016 75); --surface-2: oklch(27% 0.018 75);
      --border: oklch(35% 0.02 75); --ink: oklch(93% 0.01 75); --ink-dim: oklch(66% 0.016 75);
      --ink-faint: oklch(48% 0.016 75); --accent: oklch(75% 0.12 78); --accent-ink: oklch(85% 0.09 78);
      --accent-soft: oklch(75% 0.12 78 / 0.14); --before: oklch(70% 0.14 32); --before-line: oklch(60% 0.14 32);
      --before-hatch: oklch(70% 0.14 32 / 0.14); --after: oklch(70% 0.11 155); --after-line: oklch(58% 0.10 155);
      --shadow: 0 1px 2px oklch(0% 0 0 / 0.35), 0 16px 34px -16px oklch(0% 0 0 / 0.6);
      --propose: oklch(76% 0.11 265); --propose-line: oklch(62% 0.12 265); --propose-soft: oklch(70% 0.12 265 / 0.15);
      --code-bg: oklch(16.5% 0.012 70);
      --tk-key: oklch(74% 0.11 318); --tk-fn: oklch(80% 0.09 205); --tk-str: oklch(74% 0.09 150);
      --tk-num: oklch(80% 0.10 68); --tk-com: oklch(56% 0.018 75); --tk-pun: oklch(66% 0.016 75);
    }
  }
  :root[data-theme="dark"] {
    --bg: oklch(19% 0.014 75); --surface: oklch(23% 0.016 75); --surface-2: oklch(27% 0.018 75);
    --border: oklch(35% 0.02 75); --ink: oklch(93% 0.01 75); --ink-dim: oklch(66% 0.016 75);
    --ink-faint: oklch(48% 0.016 75); --accent: oklch(75% 0.12 78); --accent-ink: oklch(85% 0.09 78);
    --accent-soft: oklch(75% 0.12 78 / 0.14); --before: oklch(70% 0.14 32); --before-line: oklch(60% 0.14 32);
    --before-hatch: oklch(70% 0.14 32 / 0.14); --after: oklch(70% 0.11 155); --after-line: oklch(58% 0.10 155);
    --shadow: 0 1px 2px oklch(0% 0 0 / 0.35), 0 16px 34px -16px oklch(0% 0 0 / 0.6);
      --propose: oklch(76% 0.11 265); --propose-line: oklch(62% 0.12 265); --propose-soft: oklch(70% 0.12 265 / 0.15);
      --code-bg: oklch(16.5% 0.012 70);
      --tk-key: oklch(74% 0.11 318); --tk-fn: oklch(80% 0.09 205); --tk-str: oklch(74% 0.09 150);
      --tk-num: oklch(80% 0.10 68); --tk-com: oklch(56% 0.018 75); --tk-pun: oklch(66% 0.016 75);
  }
  a { color: var(--accent-ink); }
  a:hover { color: var(--accent); }
  code, pre, .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .tk-key { color: var(--tk-key); }
  .tk-fn { color: var(--tk-fn); }
  .tk-str { color: var(--tk-str); }
  .tk-num { color: var(--tk-num); }
  .tk-com { color: var(--tk-com); font-style: italic; }
  .tk-pun { color: var(--tk-pun); }
  /* El ancho manda sobre todo lo demás: en un monitor grande, una columna fija
     de 900px deja los paneles de código a ~300px y corta todas las líneas. La
     página crece con la pantalla; lo que se mantiene estrecho es la prosa
     (.hero-sub y .explanation llevan su propio max-width en ch), porque un
     párrafo a 1500px no hay quien lo lea. El código quiere anchura, el texto no. */
  .page { max-width: min(1500px, calc(100% - 48px)); margin: 0 auto; padding: 56px 0 140px; }
  .back { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; text-decoration: none; }
  .back svg { width: 12px; height: 12px; }
  .eyebrow { font-size: 11.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--accent-ink); margin: 0 0 10px; font-weight: 600; }
  h1 { font-family: 'Source Serif 4', Georgia, serif; font-weight: 600; font-size: clamp(28px, 4vw, 38px); margin: 0 0 8px; letter-spacing: -.005em; text-wrap: balance; }
  .hero-sub { color: var(--ink-dim); font-size: 15px; max-width: 62ch; margin: 0 0 28px; }
  footer.page-foot { max-width: min(1500px, calc(100% - 48px)); margin: 40px auto 0; color: var(--ink-dim); font-size: 12.5px; font-family: 'JetBrains Mono', monospace; }
  @media (prefers-reduced-motion: no-preference) {
    .back svg { transition: transform .15s ease; }
    .back:hover svg { transform: translateX(-3px); }
  }
`;

const CODE_TABLE_STYLE = `
  .code-table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.65; }
  .code-table tr.changed { background: var(--accent-soft); }
  /* La barra a la izquierda dice dónde empieza y acaba el rango; solo con el
     fondo hay que recorrer los números para averiguarlo. */
  .code-table tr.changed td.ln { color: var(--accent-ink); font-weight: 600; box-shadow: inset 2px 0 0 var(--accent); }
  .code-table td.ln {
    width: 1%; white-space: nowrap; text-align: right; padding: 0 16px 0 20px; color: var(--ink-faint);
    user-select: none; border-right: 1px solid var(--border); font-variant-numeric: tabular-nums;
  }
  .code-table td.src { padding: 0 18px 0 14px; white-space: pre; color: var(--ink); }
  .editor-loading, .editor-error { padding: 16px 18px; font-size: 12.5px; color: var(--ink-dim); font-style: italic; }
  .editor-error { color: var(--before); }
`;

// Compartidos entre el timeline y la vista a pantalla completa: las dos
// enseñan antes/después y las dos deciden propuestas.
const PANEL_STYLE = `
  .diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; margin: 17px 0 15px; }
  @media (max-width: 900px) { .diff-grid { grid-template-columns: 1fr; } }
  .panel { border: 1px solid var(--border); border-radius: 2px; overflow: hidden; background: var(--surface-2); min-width: 0; }
  .panel-before { border-left: 3px solid var(--before-line); background-image: repeating-linear-gradient(133deg, var(--before-hatch) 0 2px, transparent 2px 10px); }
  .panel-after { border-left: 3px solid var(--after-line); }
  .panel-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; letter-spacing: .12em; padding: 7px 11px; border-bottom: 1px solid var(--border); }
  .panel-before .panel-label { color: var(--before); }
  .panel-after .panel-label { color: var(--after); }
  /* Sin scroll horizontal: una línea larga se ajusta y sigue debajo. El scroll
     obliga a arrastrar para leer el final de cada línea, y en un panel de
     revisión eso es justo lo que no quieres hacer. */
  .panel pre { margin: 0; padding: 11px 12px; font-size: 12px; line-height: 1.6; font-family: 'JetBrains Mono', monospace; color: var(--ink); white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
  .panel-empty-msg { padding: 20px 12px; color: var(--ink-dim); font-style: italic; font-size: 12.5px; }
`;

const CONTROL_STYLE = `
  /* --- Propuestas ---------------------------------------------------- */
  /* El borde discontinuo es la señal principal: lo punteado es lo que aún no
     es firme. Un cambio del historial nunca lo lleva. */
  .entry.proposal .card { border: 1.5px dashed var(--propose-line); background: var(--surface); box-shadow: none; }
  .entry.proposal .entry-marker { border-color: var(--propose-line); border-style: dashed; background: var(--bg); }
  .entry.proposal .entry-marker svg { display: none; }
  .entry.rejected .card { border: 1px solid var(--border); box-shadow: none; opacity: .6; }
  .entry.rejected .entry-marker { border-color: var(--border); background: var(--bg); }
  .entry.rejected .card-title { text-decoration: line-through; text-decoration-color: var(--ink-faint); }

  .badge {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; letter-spacing: .13em;
    text-transform: uppercase; padding: 3px 8px; border-radius: 2px; white-space: nowrap;
  }
  .badge-proposal { color: var(--propose); border: 1px solid var(--propose-line); background: var(--propose-soft); }
  .badge-rejected { color: var(--ink-dim); border: 1px solid var(--border); background: var(--surface-2); }
  .badge-accepted { color: var(--after); border: 1px solid var(--after-line); background: transparent; }
  .badge-approved { color: var(--propose); border: 1px solid var(--propose-line); background: var(--propose-soft); }

  .entry.accepted .card { border: 1.5px solid var(--propose-line); box-shadow: none; }
  .entry.accepted .entry-marker { border-color: var(--propose); background: var(--bg); }
  .entry.accepted .entry-marker svg { display: none; }
  .section-accepted { border-bottom-color: var(--propose-line); }
  .section-accepted h2 { color: var(--propose); }

  .decide-accepted { border-top-color: var(--propose-line); align-items: flex-start; }
  .handoff { margin-right: auto; min-width: 0; flex: 1; }
  .handoff-label { font-size: 12.5px; color: var(--ink); margin-bottom: 9px; max-width: 62ch; }
  .handoff-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .handoff-cmd {
    font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--propose);
    background: var(--propose-soft); border: 1px solid var(--propose-line); border-radius: 2px;
    padding: 6px 10px; overflow-wrap: anywhere;
  }
  .handoff-hint { font-size: 11.5px; color: var(--ink-dim); margin-top: 8px; }
  .btn-copy { border-color: var(--propose-line); color: var(--propose); flex-shrink: 0; }
  .btn-copy:hover { background: var(--propose); border-color: var(--propose); color: var(--surface); }

  .decide { display: flex; align-items: center; gap: 8px; margin-top: 18px; padding-top: 15px; border-top: 1px dashed var(--propose-line); flex-wrap: wrap; }
  .decide-hint { font-size: 12px; color: var(--ink-dim); margin-right: auto; }
  .btn {
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px; letter-spacing: .04em;
    padding: 6px 13px; border-radius: 2px; border: 1px solid var(--border);
    background: var(--surface); color: var(--ink-dim); cursor: pointer;
  }
  .btn:hover { border-color: var(--ink-dim); color: var(--ink); }
  .btn-accept { border-color: var(--after-line); color: var(--after); }
  .btn-accept:hover { background: var(--after); border-color: var(--after); color: var(--surface); }
  .btn-reject:hover { border-color: var(--before-line); color: var(--before); }
  .btn[disabled] { opacity: .45; pointer-events: none; }

  /* Probar y revisar son cosas distintas: revisar es que lo hayas leído,
     probar es que algo lo haya ejecutado. Por eso el bloque vive al lado de la
     nota y no dentro del check de "revisado". */
  .proof { margin-top: 17px; padding-top: 13px; border-top: 1px dashed var(--border); }
  .proof-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-bottom: 8px; }
  .proof-label { font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-dim); }
  .pill { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .06em; padding: 3px 9px; border-radius: 2px; border: 1px solid var(--border); color: var(--ink-dim); }
  .pill-auto { color: var(--after); border-color: var(--after-line); }
  .pill-manual { color: var(--accent-ink); border-color: var(--accent); }
  .pill-failing { color: var(--before); border-color: var(--before-line); background: var(--before-hatch); }
  .proof-cmd { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--ink); background: var(--surface-2); border: 1px solid var(--border); border-radius: 2px; padding: 5px 9px; overflow-wrap: anywhere; display: inline-block; }
  .proof-note { font-size: 12.5px; color: var(--ink-dim); margin: 8px 0 0; max-width: 66ch; }
  .proof-none { font-size: 12.5px; color: var(--ink-dim); font-style: italic; }

  .verdict { margin-top: 16px; padding-top: 13px; border-top: 1px dashed var(--border); font-size: 12.5px; color: var(--ink-dim); }
  .verdict strong { color: var(--ink); font-weight: 600; }

  .section-head {
    display: flex; align-items: baseline; gap: 12px; margin: 46px 0 4px;
    border-bottom: 2px solid var(--ink); padding-bottom: 9px;
  }
  .section-head h2 { font-family: 'Source Serif 4', serif; font-weight: 600; font-size: 21px; margin: 0; }
  .section-head .section-sub { font-size: 12.5px; color: var(--ink-dim); margin-left: auto; text-align: right; }
  .section-proposals { border-bottom-color: var(--propose-line); }
  .section-proposals h2 { color: var(--propose); }

  /* Selector de vista. El historial completo deja de ser lo primero que ves:
     el uso diario es "qué me reclama algo", y el libro entero se consulta
     cuando se quiere leer, no cada vez que se abre la página. */
  /* Saltos de scroll. Fijos abajo a la derecha y fuera del flujo, para no
     robarle sitio al contenido en pantallas pequeñas. */
  .jump { position: fixed; right: 22px; bottom: 22px; z-index: 20; display: flex; flex-direction: column; gap: 6px;
          opacity: 0; pointer-events: none; transition: opacity .18s ease; }
  .jump.on { opacity: 1; pointer-events: auto; }
  .jump button {
    width: 38px; height: 38px; border-radius: 3px; border: 1px solid var(--border);
    background: var(--surface); color: var(--ink-dim); cursor: pointer;
    display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow);
  }
  .jump button:hover { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft); }
  .jump button:disabled { opacity: .3; pointer-events: none; }
  .jump svg { width: 15px; height: 15px; }

  /* Estado de QA: una tira, no entradas del historial. Lo que un arnés
     externo reporta es estado del proyecto ("la batería está en verde"), no
     una decisión de código con su porqué. */
  .qa { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 20px;
        border: 1px solid var(--border); border-left: 3px solid var(--border); border-radius: 2px;
        padding: 11px 14px; background: var(--surface); font-size: 12.5px; color: var(--ink-dim); }
  .qa.verde { border-left-color: var(--after-line); }
  .qa.rojo { border-left-color: var(--before-line); background: var(--before-hatch); }
  .qa-pill { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 600;
             letter-spacing: .12em; text-transform: uppercase; padding: 3px 8px; border-radius: 2px;
             border: 1px solid var(--border); }
  .qa.verde .qa-pill { color: var(--after); border-color: var(--after-line); }
  .qa.rojo .qa-pill { color: var(--before); border-color: var(--before-line); }
  .qa code { font-size: 11.5px; color: var(--ink); }
  .qa-when { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; }

  .viewbar { display: flex; gap: 4px; margin: 30px 0 0; border-bottom: 1px solid var(--border); }
  .viewtab {
    font-family: 'JetBrains Mono', monospace; font-size: 12px; letter-spacing: .04em;
    background: none; border: none; border-bottom: 2px solid transparent;
    padding: 10px 14px; margin-bottom: -1px; color: var(--ink-dim); cursor: pointer;
    display: inline-flex; align-items: center; gap: 7px;
  }
  .viewtab:hover { color: var(--ink); }
  .viewtab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
  .viewtab-n {
    font-size: 10.5px; min-width: 18px; text-align: center; padding: 1px 5px; border-radius: 8px;
    background: var(--surface-2); color: var(--ink-dim); border: 1px solid var(--border);
  }
  .viewtab[aria-selected="true"] .viewtab-n { background: var(--accent-soft); color: var(--accent-ink); border-color: var(--accent); }
  .view[hidden] { display: none; }
  .empty-view { color: var(--ink-dim); font-size: 14.5px; margin: 40px 0; }
  .section-failing { border-bottom-color: var(--before-line); }
  .section-failing h2 { color: var(--before); }

  .discarded { margin-top: 44px; }
  .discarded > summary {
    cursor: pointer; list-style: none; font-family: 'JetBrains Mono', monospace; font-size: 11.5px;
    letter-spacing: .06em; color: var(--ink-dim); padding: 9px 0; border-top: 1px solid var(--border);
  }
  .discarded > summary::-webkit-details-marker { display: none; }
  .discarded > summary:hover { color: var(--ink); }

  .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin: 22px 0 0; }
  .toolbar a, .toolbar button {
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px; text-decoration: none;
    border: 1px solid var(--border); border-radius: 2px; padding: 6px 12px;
    color: var(--ink-dim); background: var(--surface); cursor: pointer;
  }
  .toolbar a:hover, .toolbar button:hover { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft); }

`;

const TIMELINE_STYLE = `
  .tally-row { display: flex; border-top: 1.5px solid var(--ink); border-bottom: 1px solid var(--border); }
  .tally { flex: 1; padding: 14px 20px; }
  .tally + .tally { border-left: 1px solid var(--border); }
  .tally .n { font-family: 'JetBrains Mono', monospace; font-size: 27px; font-weight: 600; font-variant-numeric: tabular-nums; display: block; }
  .tally.progress .n { color: var(--accent-ink); }
  .tally .l { font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-dim); margin-top: 2px; display: block; }
  .bar { height: 3px; background: var(--border); margin-top: 9px; border-radius: 2px; overflow: hidden; }
  .bar-fill { height: 100%; width: var(--w); background: var(--accent); }

  .timeline { position: relative; margin-top: 6px; }
  .folio { position: sticky; top: 0; z-index: 3; background: var(--bg); padding: 34px 0 9px; }
  .folio-rule { display: flex; align-items: baseline; gap: 10px; border-bottom: 2px solid var(--ink); padding-bottom: 9px; }
  .folio-num { font-family: 'Source Serif 4', serif; font-weight: 600; font-size: 22px; }
  .folio-rest { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim); }
  .folio-count { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-dim); white-space: nowrap; }

  .entry { position: relative; padding-left: 40px; margin-top: 26px; }
  .entry::before {
    content: ""; position: absolute; left: 14px; top: 5px; bottom: -26px; width: 2px;
    background-image: repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px 7px);
  }
  .entry:last-child::before { display: none; }
  .entry-marker {
    position: absolute; left: 8px; top: 7px; width: 14px; height: 14px; border-radius: 50%;
    background: var(--surface); border: 2px solid var(--accent); display: flex; align-items: center; justify-content: center;
  }
  .entry.reviewed .entry-marker { background: var(--accent); }
  .entry-marker svg { width: 7px; height: 7px; stroke: var(--surface); opacity: 0; }
  .entry.reviewed .entry-marker svg { opacity: 1; }

  .card { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 3px; box-shadow: var(--shadow); padding: 21px 23px 23px; overflow: hidden; }
  .entry.reviewed .card { box-shadow: none; opacity: .68; }
  .stamp {
    position: absolute; top: 16px; right: -34px; width: 156px; text-align: center; transform: rotate(7deg);
    border-top: 1.5px solid var(--accent); border-bottom: 1.5px solid var(--accent); color: var(--accent-ink);
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .16em; padding: 3px 0;
    opacity: 0; pointer-events: none; transition: opacity .2s ease;
  }
  .entry.reviewed .stamp { opacity: .9; }

  .card-head { display: flex; align-items: center; justify-content: flex-start; gap: 11px; flex-wrap: wrap; padding-right: 104px; }
  .chip { font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 3px 9px; border: 1px solid var(--border); border-radius: 2px; color: var(--ink-dim); background: var(--surface-2); }
  .check { position: relative; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-dim); font-family: 'JetBrains Mono', monospace; cursor: pointer; user-select: none; }
  .check input { position: absolute; opacity: 0; width: 15px; height: 15px; cursor: pointer; }
  .check-ring { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid var(--border); display: flex; align-items: center; justify-content: center; }
  .check-ring svg { width: 8px; height: 8px; stroke: var(--surface); opacity: 0; }
  .check.done .check-ring { background: var(--accent); border-color: var(--accent); }
  .check.done .check-ring svg { opacity: 1; }

  .card-title { font-family: 'Source Serif 4', serif; font-weight: 600; font-size: 19.5px; margin: 13px 0 6px; text-wrap: balance; }

  .file-block { margin-top: 18px; padding-top: 17px; border-top: 1px dashed var(--border); }
  .card > .file-block:first-of-type { margin-top: 15px; padding-top: 0; border-top: none; }
  .file-head-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 3px; }
  .file-tag { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--ink-dim); }
  .file-tag b { color: var(--ink); font-weight: 600; }
  .file-index { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-faint); }
  .sep { margin: 0 7px; opacity: .55; }

${PANEL_STYLE}

  .card-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
  .open-full {
    flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; text-decoration: none;
    font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .04em; color: var(--accent-ink);
    border: 1px solid var(--border); border-radius: 2px; padding: 4px 9px;
  }
  .open-full svg { width: 10px; height: 10px; }
  .open-full:hover { border-color: var(--accent); background: var(--accent-soft); }

  .explanation { font-size: 14px; color: var(--ink); margin: 17px 0 0; max-width: 68ch; }

  .copiloto { margin: 26px 0 0; border: 1px solid var(--border); border-radius: 3px; background: var(--surface); }
  .copiloto-cab {
    display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px;
    padding: 10px 14px; border-bottom: 1px solid var(--border);
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--ink-dim);
  }
  .copiloto-label { font-size: 10px; font-weight: 600; letter-spacing: .13em; text-transform: uppercase; color: var(--accent-ink); }
  .git-rama { color: var(--ink); font-weight: 600; }
  .git-aviso-rama { color: var(--before); }
  .copiloto-meta code { font-size: inherit; }
  .consejo { padding: 13px 14px; border-bottom: 1px solid var(--border); }
  .consejo:last-child { border-bottom: none; }
  .consejo-cab { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
  .consejo-cab h3 { font-family: 'Public Sans', sans-serif; font-size: 14px; font-weight: 650; margin: 0; color: var(--ink); }
  .consejo-marca {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 600; letter-spacing: .12em;
    text-transform: uppercase; padding: 2px 7px; border-radius: 2px; border: 1px solid var(--border); color: var(--ink-dim);
  }
  .consejo-aviso .consejo-marca { color: var(--before); border-color: var(--before-line); }
  .consejo-detalle { font-size: 13px; color: var(--ink-dim); max-width: 74ch; }
  .consejo-cmd { display: flex; align-items: flex-start; gap: 9px; margin-top: 9px; }
  .consejo-cmd code {
    flex: 1; min-width: 0; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; line-height: 1.55;
    white-space: pre-wrap; word-break: break-word; padding: 8px 10px;
    border: 1px solid var(--border); border-radius: 2px; background: var(--bg); color: var(--ink);
  }
  .consejo-nada { padding: 13px 14px; margin: 0; font-size: 13px; color: var(--ink-dim); }

  /* ── Explicación línea por línea ──────────────────────────
     El vínculo entre una explicación y su línea se ve al pasar por encima:
     ambas se iluminan a la vez. Sin eso hay que contar líneas a mano, que es
     justo el trabajo que esto viene a quitar. */
  /* Cada línea, su fila. Con el ajuste de línea activado hace falta una marca
     al principio: sin ella no se distingue una línea nueva de la continuación
     de la anterior, que es el precio de quitar el scroll. */
  .cl { display: flex; gap: 8px; align-items: baseline; padding: 0 2px; border-radius: 2px; }
  .cl-n {
    flex: 0 0 auto; min-width: 2.4ch; text-align: right; user-select: none;
    color: var(--ink-faint); font-size: .82em;
  }
  /* El guion es la marca de "aquí empieza una línea". Va pegado al código y no
     se puede seleccionar, para que copiar el panel no lo arrastre. */
  .cl-n::after { content: ' –'; color: var(--border); }
  .cl-src { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
  /* Y una raya tenue a la izquierda de cada fila: con líneas ajustadas, el ojo
     necesita algo vertical que separe una de otra. */
  .cl { border-left: 1px solid transparent; padding-left: 4px; }
  .cl:nth-child(odd) { border-left-color: var(--border); }
  /* Sin explicación no hay nada que enlazar: no se resalta al pasar. */
  .panel:has(.explicacion) .cl:hover,
  .cl.enlazada {
    background: var(--accent-soft);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  /* Una línea que no tiene explicación se atenúa mientras se lee la de al
     lado, para que se vea de un vistazo qué está explicado y qué no. */
  .panel.leyendo .cl:not(.tiene) { opacity: .45; }

  .explicacion-caja:empty { display: none; }
  /* Plegada, la explicación deja de ocupar pero sigue en la página y en el
     dato: ocultar no es borrar. */
  .panel.plegada .explicacion { display: none; }
  .panel.plegada .cl:not(.tiene) { opacity: 1; }

  .btn-ver, .sel-nivel {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px; letter-spacing: .06em;
    border: 1px solid var(--border); border-radius: 2px; padding: 2px 6px;
    background: var(--surface); color: var(--ink-dim); cursor: pointer;
  }
  .btn-ver:hover, .sel-nivel:hover { border-color: var(--accent); color: var(--accent-ink); }
  .explicacion { border-top: 1px solid var(--border); padding: 11px 12px; }
  .explicacion-resumen {
    margin: 0 0 10px; font-family: 'Source Serif 4', Georgia, serif;
    font-size: 14px; line-height: 1.5; color: var(--ink);
  }
  .explicacion-lista { list-style: none; margin: 0; padding: 0; }
  .ex {
    display: flex; gap: 9px; align-items: baseline;
    padding: 5px 6px; border-radius: 2px; cursor: default;
    font-size: 12.5px; line-height: 1.5; color: var(--ink-dim);
  }
  .ex:hover, .ex.enlazada { background: var(--accent-soft); color: var(--ink); }
  .ex-n {
    flex: 0 0 auto; min-width: 2.2ch; text-align: right;
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    color: var(--accent-ink); padding-top: 1px;
  }
  .explicacion-pie { margin: 10px 0 0; font-size: 11px; color: var(--ink-faint); }

  .explicar-controles { float: right; display: flex; gap: 5px; align-items: center; margin: -2px 0 0; }
  .sel-motor {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    border: 1px solid var(--border); border-radius: 2px; padding: 2px 4px;
    background: var(--surface); color: var(--ink-dim); max-width: 15ch;
  }
  .sel-motor:hover { border-color: var(--accent); color: var(--ink); }

  .btn-explicar {
    padding: 2px 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px; letter-spacing: .08em;
    text-transform: uppercase; cursor: pointer;
    border: 1px solid var(--border); border-radius: 2px;
    background: none; color: var(--ink-dim);
  }
  .btn-explicar:hover { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft); }
  .btn-explicar:disabled { opacity: .5; cursor: default; }
  .explain-settings { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:14px 0 0; padding:10px 12px; border:1px solid var(--border); background:var(--surface-2); }
  .explain-settings-label { font-size:11px; color:var(--ink-dim); font-family:'JetBrains Mono', monospace; }
  .explain-settings select { font-family:'JetBrains Mono', monospace; font-size:10.5px; border:1px solid var(--border); background:var(--surface); color:var(--ink); padding:4px 6px; }

  /* En papel el resalto no existe, pero la explicación sigue valiendo. */
  @media print {
    .btn-explicar { display: none; }
    .explicacion { break-inside: avoid; }
  }


  .trabajo { flex-basis: 100%; margin-top: 9px; border: 1px solid var(--border); border-radius: 2px; overflow: hidden; }
  .trabajo-cab {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; letter-spacing: .12em;
    text-transform: uppercase; padding: 6px 10px; color: var(--ink-dim); background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .trabajo[data-estado="hecho"] .trabajo-cab { color: var(--after); }
  .trabajo[data-estado="fallo"] .trabajo-cab { color: var(--before); }
  .trabajo-salida {
    margin: 0; padding: 9px 11px; max-height: 260px; overflow: auto;
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px; line-height: 1.55;
    white-space: pre-wrap; word-break: break-word; color: var(--ink);
  }
  .btn-lanzar:disabled { opacity: .55; cursor: default; }
  /* En papel, un comando que hay que copiar no sirve de nada. */
  @media print { .copiloto { display: none; } }

  /* Los textos de una entrada se escriben en Markdown y se pintan como tal
     (lib/mdtext.mjs). Estas reglas valen para los cuatro sitios donde aparecen
     —explicación, motivo del salto, nota de la prueba y motivo del descarte—
     porque el formato que admiten es el mismo. Sin margen arriba en el primer
     bloque ni abajo en el último: el hueco lo pone el contenedor, y doblarlo
     descuadraría la tarjeta. */
  .md > :first-child { margin-top: 0; }
  .md > :last-child { margin-bottom: 0; }
  .md p { margin: 0 0 10px; }
  .md ul, .md ol { margin: 0 0 10px; padding-left: 20px; }
  .md li { margin: 3px 0; }
  .md li::marker { color: var(--ink-dim); }
  .md h3, .md h4, .md h5, .md h6 {
    font-family: 'Source Serif 4', Georgia, serif; font-weight: 600;
    font-size: 1.05em; margin: 16px 0 6px;
  }
  .md code {
    font-size: .89em; padding: 1px 5px; border-radius: 2px;
    background: var(--accent-soft); color: var(--accent-ink);
  }
  .md pre {
    margin: 0 0 10px; padding: 10px 12px; overflow-x: auto;
    border: 1px solid var(--border); border-radius: 2px; background: var(--surface);
    font-size: 12px; line-height: 1.6;
  }
  /* El fondo del bloque ya lo pone el <pre>: repetirlo en cada <code> de
     dentro pintaría un recuadro sobre otro. */
  .md pre code { background: none; padding: 0; color: var(--ink); font-size: inherit; }
  .md blockquote {
    margin: 0 0 10px; padding: 2px 0 2px 12px;
    border-left: 2px solid var(--border); color: var(--ink-dim);
  }
  .md a { color: var(--accent-ink); text-decoration: underline; text-underline-offset: 2px; }
  .md strong { font-weight: 650; }

  .note { margin-top: 17px; padding-top: 13px; border-top: 1px dashed var(--border); }
  .note-label { display: flex; align-items: center; gap: 6px; font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-dim); margin-bottom: 7px; }
  .note-label svg { width: 11px; height: 11px; }
  .note-box {
    width: 100%; min-height: 26px; resize: vertical; border: 1px solid var(--border); border-radius: 2px; padding: 9px 11px;
    background-image: repeating-linear-gradient(to bottom, transparent 0 22px, var(--border) 22px 23px);
    background-color: var(--surface); font-family: 'Public Sans', sans-serif; font-size: 13px; color: var(--ink);
  }
  .note-box::placeholder { color: var(--ink-dim); font-style: italic; }
  .save-status { display: block; font-size: 11px; color: var(--after); margin-top: 4px; height: 14px; opacity: 0; transition: opacity .2s; }
  .save-status.show { opacity: 1; }

  .tear { position: relative; margin: 32px 0 32px 40px; }
  .tear-line { height: 0; border-top: 2px dashed var(--ink-dim); opacity: .38; }
  .tear-tag { position: absolute; top: -11px; left: 14px; background: var(--bg); padding: 0 10px; display: flex; align-items: center; gap: 9px; }
  .tear-badge {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .16em; color: var(--before);
    border: 1px solid var(--before-line); background: var(--surface); padding: 3px 9px; border-radius: 2px; transform: rotate(-2deg);
  }
  .tear-note { margin: 13px 4px 0; font-size: 12.5px; color: var(--ink-dim); max-width: 64ch; }
  .tear-note strong { color: var(--ink); font-weight: 600; }

${CONTROL_STYLE}
  /* --- Impresión / PDF ------------------------------------------------ */
  /* En papel no hay scroll: un pre con overflow se recorta y el código se
     pierde sin avisar. Todo se envuelve, y lo interactivo desaparece. */
  @media print {
    @page { size: A4; margin: 14mm 12mm; }
    :root {
      --bg: #fff; --surface: #fff; --surface-2: #fafafa; --border: #d4d4d4;
      --ink: #1a1a1a; --ink-dim: #555; --ink-faint: #888; --shadow: none;
    }
    body { background: #fff; }
    .page { max-width: none; padding: 0; }
    .back, .toolbar, .open-full, .decide, .note-box::placeholder { display: none !important; }
    .note:has(.note-box:placeholder-shown) { display: none; }
    .note-box { border: none; background: none; padding: 0; min-height: 0; }
    .entry { break-inside: avoid; page-break-inside: avoid; padding-left: 0; margin-top: 20px; }
    .entry::before, .entry-marker { display: none; }
    .card { border: 1px solid #d4d4d4 !important; box-shadow: none !important; opacity: 1 !important; overflow: visible; }
    /* En papel no hay color de fondo que ayude: lo punteado sigue siendo lo
       que separa una propuesta de un cambio hecho. */
    .entry.proposal .card { border: 1.5px dashed #6b6b8f !important; }
    .entry.accepted .card { border: 1.5px solid #6b6b8f !important; }
    .handoff-row, .handoff-hint { display: none; }
    .diff-grid { grid-template-columns: 1fr; gap: 8px; }
    .panel pre { overflow: visible; white-space: pre-wrap; word-break: break-word; font-size: 9.5px; }
    /* En papel los tonos claros del tema oscuro desaparecen: se fijan versiones
       oscuras, y el comentario deja de ir en gris casi blanco. */
    .tk-key { color: #7b2d8e; } .tk-fn { color: #1f4f8f; } .tk-str { color: #1f6b45; }
    .tk-num { color: #8a5312; } .tk-com { color: #6b6b6b; } .tk-pun { color: #444; }
    .folio { position: static; }
    .section-head, .folio { break-after: avoid; page-break-after: avoid; }
    .discarded, .viewbar, .jump { display: none; }
    /* Imprimir es imprimir el libro: las tres vistas salen, esté abierta la
       que esté. Una pestaña es un estado de pantalla, no del documento. */
    .view[hidden] { display: block !important; }
    .stamp { opacity: .9 !important; }
    a[href]::after { content: none !important; }
  }

  @keyframes riseIn { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
  @keyframes fillBar { from { width: 0; } to { width: var(--w); } }
  @keyframes stampIn { from { opacity: 0; transform: rotate(7deg) scale(1.5); } to { opacity: .9; transform: rotate(7deg) scale(1); } }
  @keyframes drawCheck { from { stroke-dashoffset: 16; } to { stroke-dashoffset: 0; } }
  @media (prefers-reduced-motion: no-preference) {
    .timeline > .reveal { animation: riseIn .5s cubic-bezier(.16,.8,.3,1) both; }
    .timeline > .reveal:nth-child(1) { animation-delay: .02s; } .timeline > .reveal:nth-child(2) { animation-delay: .08s; }
    .timeline > .reveal:nth-child(3) { animation-delay: .14s; } .timeline > .reveal:nth-child(4) { animation-delay: .20s; }
    .timeline > .reveal:nth-child(5) { animation-delay: .26s; } .timeline > .reveal:nth-child(6) { animation-delay: .32s; }
    .timeline > .reveal:nth-child(7) { animation-delay: .38s; } .timeline > .reveal:nth-child(8) { animation-delay: .44s; }
    .bar-fill { animation: fillBar 1s .5s cubic-bezier(.16,.8,.3,1) both; }
    .entry.reviewed .stamp { animation: stampIn .5s .4s cubic-bezier(.34,1.56,.64,1) both; }
    .check-ring svg, .entry-marker svg { stroke-dasharray: 16; animation: drawCheck .35s .1s cubic-bezier(.4,0,.2,1) both; }
    .card { transition: transform .18s ease, box-shadow .18s ease; }
    .entry:not(.reviewed) .card:hover { transform: translateY(-2px); box-shadow: 0 2px 4px oklch(45% 0.02 80 / .08), 0 16px 30px -16px oklch(45% 0.02 80 / .28); }
    .entry-marker { transition: background-color .2s ease; }
  }
`;

// Cada línea va en su propia fila con su número: es lo que permite iluminar
// una línea concreta desde su explicación, y al revés. La numeración es la del
// FRAGMENTO (1..N), no la del archivo, porque es la que usa quien lo explica.
function lineasDeCodigo(code, language) {
  return String(code).replace(CONTROLES, '').split('\n').map((linea, i) => {
    const n = i + 1;
    return `<span class="cl" data-l="${n}"><span class="cl-n">${n}</span>`
      + `<span class="cl-src">${highlight(linea, language) || '&nbsp;'}</span></span>`;
  }).join('');
}

function codePanel(kind, code, language, opciones = {}) {
  const label = kind === 'before' ? 'ANTES' : 'DESPUÉS';
  if (code == null) {
    return `<div class="panel panel-${kind} panel-empty"><div class="panel-label">${label}</div><div class="panel-empty-msg">— no existía —</div></div>`;
  }

  const { changeId, fileIndex, explicacion } = opciones;
  // Los controles solo aparecen donde se puede pedir la explicación: hace falta
  // saber a qué entrada y a qué archivo pertenece el panel.
  const puedePedir = changeId != null && fileIndex != null;
  // Ver/ocultar va aparte del resto: la explicación SIEMPRE está guardada, esto
  // solo decide si se ve. Plegarla no la borra ni hay que volver a pedirla.
  const verOcultar = explicacion
    ? `<button type="button" class="btn-ver" aria-expanded="false">Revelar explicación</button>`
    : '';

  const boton = puedePedir
    ? `<span class="explicar-controles">
        ${verOcultar}
        <button type="button" class="btn-explicar" data-id="${esc(changeId)}" data-file="${fileIndex}" data-lado="${kind}">`
      + `${explicacion ? 'Regenerar' : 'Generar explicación'}</button>
      </span>`
    : '';

  return `<div class="panel panel-${kind}${explicacion ? ' plegada' : ''}" data-panel="${kind}"${puedePedir ? ` data-id="${esc(changeId)}" data-file="${fileIndex}"` : ''}>
    <div class="panel-label">${label}${boton}</div>
    <pre class="panel-code"><code>${lineasDeCodigo(code, language)}</code></pre>
    <div class="explicacion-caja">${explicacion ? bloqueExplicacion(explicacion) : ''}</div>
  </div>`;
}

// Cuánto detalle. Cambia qué líneas se explican y cuánto se dice de cada una,
// que es lo que mueve el coste: se paga por lo que se escribe.
function selectorNivel() {
  const opciones = Object.entries(NIVELES).map(([id, n]) => (
    `<option value="${esc(id)}"${id === 'normal' ? ' selected' : ''}>${esc(n.nombre)}</option>`
  )).join('');
  return `<select id="explain-level" class="sel-nivel" title="Calidad de todas las explicaciones futuras">${opciones}</select>`;
}

// Quién explica. Se ofrecen los dos motores porque quien usa esto puede estar
// conectado a Claude o a Codex, y obligar a tener uno de los dos para leer una
// explicación sería una dependencia que no hace falta.
function selectorMotor() {
  const opciones = Object.entries(MOTORES).map(([id, m]) => m.modelos.map((mod) => {
    const valor = `${id}:${mod}`;
    const texto = mod ? `${m.nombre} · ${mod}` : `${m.nombre} · por defecto`;
    // Sonnet preseleccionado: explicar código leído es trabajo acotado, y
    // pagar un modelo mayor por ello es gastar de más para lo mismo.
    const puesto = valor === 'claude:sonnet' ? ' selected' : '';
    return `<option value="${esc(valor)}"${puesto}>${esc(texto)}</option>`;
  }).join('')).join('');

  return `<select id="explain-engine" class="sel-motor" title="Quién genera las explicaciones futuras">${opciones}</select>`;
}

function controlesExplicacion() {
  return `<div class="explain-settings"><span class="explain-settings-label">Explicaciones futuras</span>
    <label class="explain-settings-label">Calidad ${selectorNivel()}</label>
    <label class="explain-settings-label">Motor ${selectorMotor()}</label></div>`;
}

// Lo que costó, en tokens. Va a la vista para poder decidir si compensa
// rehacerlo con otro modelo antes de gastarlo otra vez.
function gastoTexto(g) {
  if (!g) return '';
  const n = (x) => Number(x).toLocaleString('es-ES');
  const partes = [];
  if (g.total != null) partes.push(`${n(g.total)} tokens`);
  else if (g.entrada != null || g.salida != null) {
    partes.push(`${n((g.entrada || 0) + (g.salida || 0))} tokens`);
    partes.push(`${n(g.salida || 0)} de salida`);
  }
  if (typeof g.usd === 'number') partes.push(`${g.usd.toFixed(4)} $`);
  return partes.length ? ` · ${partes.join(' · ')}` : '';
}

// La explicación, atada línea a línea. Cada entrada lleva el número de su línea
// para que el resalto sepa a cuál iluminar.
export function bloqueExplicacion(e) {
  if (!e || !Array.isArray(e.lineas) || !e.lineas.length) return '';
  return `<div class="explicacion">
    ${e.resumen ? `<p class="explicacion-resumen">${esc(e.resumen)}</p>` : ''}
    <ol class="explicacion-lista">
      ${e.lineas.map((l) => `<li class="ex" data-l="${l.n}"><span class="ex-n">${l.n}</span><span class="ex-que">${esc(l.que)}</span></li>`).join('')}
    </ol>
    <p class="explicacion-pie">${e.nivel && NIVELES[e.nivel] ? esc(NIVELES[e.nivel].nombre) + ' · ' : ''}Explicado por ${esc(e.modelo || 'Claude')}${e.fecha ? ' · ' + esc(fmtDateShort(e.fecha)) : ''}${esc(gastoTexto(e.gasto))}. No toca el código: es una capa de lectura.</p>
  </div>`;
}

function fileBlock(change, f, idx, total) {
  const lineLabel = f.lineStart
    ? (f.lineEnd && f.lineEnd !== f.lineStart ? `L${f.lineStart}–${f.lineEnd}` : `L${f.lineStart}`)
    : '';
  const indexTag = total > 1 ? `<span class="file-index">${idx + 1}/${total}</span> · ` : '';
  return `
<div class="file-block">
  <div class="file-head-row">
    <span class="file-tag">${indexTag}<b>${esc(f.file)}</b>${lineLabel ? ' · ' + lineLabel : ''}</span>
    <span class="file-tag">${fmtDate(change.date)}${change.commit ? '<span class="sep">·</span>' + esc(change.commit) : ''}</span>
  </div>
  <div class="diff-grid">
    ${codePanel('before', f.before, f.language, { changeId: change.id, fileIndex: idx, explicacion: (f.explicaciones || {}).before })}
    ${codePanel('after', f.after, f.language, { changeId: change.id, fileIndex: idx, explicacion: (f.explicaciones || {}).after })}
  </div>
</div>`;
}

function relationBlock(rel, index, status) {
  if (status && status !== 'change') return '';
  if (!rel || index === 0) return '';
  if (rel.type === 'jump') {
    return `<div class="tear reveal">
      <div class="tear-line"></div>
      <div class="tear-tag"><span class="tear-badge">Salto</span></div>
      <div class="tear-note md"><strong>Salto respecto al cambio anterior.</strong> ${mdToHtml(rel.note)}</div>
    </div>`;
  }
  return '';
}

const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3.5 3.5L13 5"/></svg>';

function fmtDateShort(iso) {
  try { return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

// La cabecera de la tarjeta es lo que distingue una propuesta de un cambio:
// un cambio se marca revisado (ya está en el código, solo falta que lo mires),
// una propuesta se decide (no está, y decidir es lo que la mueve).
function cardHead(change) {
  const u = change.unit || {};
  const chip = `<span class="chip">${esc(u.type || 'código')}${u.name ? ' · ' + esc(u.name) : ''}</span>`;

  if (change.status === 'proposal') {
    return `<div class="card-head">${chip}<span class="badge badge-proposal">Propuesta</span></div>`;
  }
  if (change.status === 'accepted') {
    return `<div class="card-head">${chip}<span class="badge badge-approved">Aceptada · falta aplicarla</span></div>`;
  }
  if (change.status === 'rejected') {
    return `<div class="card-head">${chip}<span class="badge badge-rejected">Descartada</span></div>`;
  }

  const accepted = change.fromProposal ? '<span class="badge badge-accepted">Aceptada</span>' : '';
  return `<div class="card-head">
      ${chip}${accepted}
      <label class="check${change.verified ? ' done' : ''}">
        <input type="checkbox" class="verify-box" data-id="${esc(change.id)}" ${change.verified ? 'checked' : ''} />
        <span class="check-ring">${CHECK_SVG}</span>
        <span>${change.verified ? 'revisado' : 'pendiente'}</span>
      </label>
    </div>`;
}

function cardFoot(change, project) {
  if (change.status === 'proposal') {
    return `<div class="decide" data-id="${esc(change.id)}">
      <span class="decide-hint">Todavía no está en el código. Si la aceptas, pasa al historial; si no, se archiva con tu motivo.</span>
      <button class="btn btn-reject" data-decision="reject" data-id="${esc(change.id)}">Descartar</button>
      <button class="btn btn-accept" data-decision="accept" data-id="${esc(change.id)}">Aceptar</button>
    </div>`;
  }
  if (change.status === 'accepted') {
    const orden = `aplica la propuesta "${change.title}"`;
    return `<div class="decide decide-accepted" data-id="${esc(change.id)}">
      <div class="handoff">
        <div class="handoff-label">La aceptaste${change.decidedAt ? ' el ' + esc(fmtDateShort(change.decidedAt)) : ''}. Falta escribirla.</div>
        <div class="handoff-row">
          <button class="btn btn-accept btn-lanzar" data-accion="aplicar" data-id="${esc(change.id)}">Que la aplique Claude</button>
          <code class="handoff-cmd">${esc(orden)}</code>
          <button class="btn btn-copy" data-copy="${esc(orden)}">Copiar</button>
        </div>
        <div class="handoff-hint">El botón lanza a Claude aquí mismo, en ${esc(project.repoPath || 'el repo')}. La orden de al lado es por si prefieres pegarla tú en una sesión abierta.</div>
      </div>
      <button class="btn btn-reject" data-decision="reject" data-id="${esc(change.id)}">Ya no la quiero</button>
    </div>`;
  }
  if (change.status === 'rejected') {
    return `<div class="verdict md">
      <strong>Descartada${change.decidedAt ? ' el ' + esc(fmtDateShort(change.decidedAt)) : ''}.</strong>
      ${change.decisionNote ? mdToHtml(change.decisionNote) : 'Sin motivo anotado.'}
      <div class="decide" style="border-top:none;padding-top:11px;margin-top:11px">
        <span class="decide-hint"></span>
        <button class="btn btn-accept" data-decision="accept" data-id="${esc(change.id)}">Recuperar</button>
      </div>
    </div>`;
  }
  return '';
}

const TEST_LABEL = {
  untested: 'sin probar',
  auto: 'prueba automática',
  manual: 'probado a mano',
  failing: 'falla',
};

function proofBlock(change) {
  const t = change.test || {};
  const status = t.status || 'untested';
  if (status === 'untested' && !t.note && !t.command) {
    return `<div class="proof">
      <div class="proof-head"><span class="proof-label">Prueba</span><span class="pill">sin probar</span></div>
      <p class="proof-none">Nadie ha dejado constancia de cómo se comprueba que esto funciona.</p>
    </div>`;
  }
  return `<div class="proof">
      <div class="proof-head">
        <span class="proof-label">Prueba</span>
        <span class="pill pill-${status}">${TEST_LABEL[status] || status}</span>
      </div>
      ${t.command ? `<code class="proof-cmd">${esc(t.command)}</code>` : ''}
      ${t.note ? `<div class="proof-note md">${mdToHtml(t.note)}</div>` : ''}
    </div>`;
}

function noteBlock(change) {
  const placeholder = change.status === 'proposal'
    ? 'Anota qué te falta por saber antes de decidir...'
    : 'Anota algo mientras revisas (dudas, ok, pendiente de probar...)';
  return `<div class="note">
      <div class="note-label">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>
        Tu nota
      </div>
      <textarea class="note-box" data-id="${esc(change.id)}" placeholder="${placeholder}">${esc(change.note)}</textarea>
      <span class="save-status" data-id="${esc(change.id)}"></span>
    </div>`;
}

function entryCard(change, index, projectId, project) {
  const files = change.files || [];
  const status = change.status || 'change';
  const cls = ['entry', 'reveal', status === 'change' && change.verified && 'reviewed', status !== 'change' && status]
    .filter(Boolean).join(' ');

  return `
${relationBlock(change.relation, index, status)}
<article class="${cls}" data-id="${esc(change.id)}" data-status="${status}">
  <div class="entry-marker">${CHECK_SVG}</div>
  <div class="card">
    ${status === 'change' ? '<div class="stamp">Revisado</div>' : ''}
    ${cardHead(change)}
    <div class="card-title-row">
      <h2 class="card-title">${esc(change.title)}</h2>
      <a class="open-full" href="/p/${esc(projectId)}/c/${esc(change.id)}" title="Abrir en pantalla completa">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"/></svg>
        Pantalla completa
      </a>
    </div>

    ${files.map((f, i) => fileBlock(change, f, i, files.length)).join('\n')}

    <div class="explanation md">${mdToHtml(change.explanation)}</div>

    ${proofBlock(change)}
    ${noteBlock(change)}
    ${cardFoot(change, project)}
  </div>
</article>`;
}

// El copiloto de git. Sale de lib/consejo.mjs y aquí solo se pinta: cada
// consejo lleva su porqué y, cuando hay algo que hacer, el comando ya escrito
// para copiar. Nunca un botón que lo ejecute — mover el repo del usuario no es
// cosa de una página que él abre para leer.
function copilotoPanel(copiloto) {
  if (!copiloto || !copiloto.git) return '';
  const { git, consejos } = copiloto;

  const rama = git.rama
    ? `<span class="git-rama">${esc(git.rama)}</span>` + (git.rama === git.ramaPrincipal ? '<span class="git-aviso-rama">rama principal</span>' : '')
    : '<span class="git-rama">sin rama</span>';
  const sucio = git.estado && !git.estado.limpio
    ? `${git.estado.modificados.length + git.estado.sinSeguimiento.length} archivo(s) sin commitear`
    : 'árbol limpio';
  const ultimo = git.ultimoCommit
    ? `último commit <code>${esc(git.ultimoCommit.hash)}</code> · ${esc(git.ultimoCommit.asunto)}`
    : 'sin commits todavía';

  const cuerpo = consejos.length
    ? consejos.map((c) => `
      <div class="consejo consejo-${esc(c.nivel)}">
        <div class="consejo-cab">
          <span class="consejo-marca">${c.nivel === 'aviso' ? 'Ojo' : 'Sugerencia'}</span>
          <h3>${esc(c.titulo)}</h3>
        </div>
        <div class="consejo-detalle md">${mdToHtml(c.detalle)}</div>
        ${(c.comandos || []).map((cmd) => `
          <div class="consejo-cmd">
            <code>${esc(cmd.texto)}</code>
            ${cmd.accion ? `<button class="btn btn-accept btn-lanzar" data-accion="${esc(cmd.accion)}">Hacerlo</button>` : ''}
            <button class="btn btn-copy" data-copy="${esc(cmd.texto)}">${cmd.accion ? 'Copiar' : esc(cmd.etiqueta)}</button>
          </div>`).join('')}
      </div>`).join('')
    : '<p class="consejo-nada">Nada que hacer con git ahora mismo.</p>';

  return `
  <section class="copiloto">
    <div class="copiloto-cab">
      <span class="copiloto-label">Git</span>
      ${rama}
      <span class="copiloto-meta">${esc(sucio)}</span>
      <span class="copiloto-meta">${ultimo}</span>
    </div>
    ${cuerpo}
  </section>`;
}

function qaStrip(qa) {
  if (!qa) return '';
  const verde = qa.result === 'verde';
  return `<div class="qa ${esc(qa.result)}">
    <span class="qa-pill">QA ${verde ? 'verde' : 'rojo'}</span>
    ${qa.environment ? `<span>${esc(qa.environment)}</span>` : ''}
    ${qa.command ? `<code>${esc(qa.command)}</code>` : ''}
    ${qa.detail ? `<span>${esc(qa.detail)}</span>` : ''}
    <span class="qa-when">${esc(fmtDate(qa.at))}</span>
  </div>`;
}

export function renderTimelineHtml(project, changes, qa, copiloto, token) {
  const applied = changes.filter((c) => (c.status || 'change') === 'change');
  const pending = changes.filter((c) => c.status === 'proposal');
  const accepted = changes.filter((c) => c.status === 'accepted');
  const rejected = changes.filter((c) => c.status === 'rejected');
  const total = applied.length;
  const verifiedCount = applied.filter((c) => c.verified).length;
  const tested = applied.filter((c) => c.test && (c.test.status === 'auto' || c.test.status === 'manual')).length;
  const failing = applied.filter((c) => c.test && c.test.status === 'failing').length;

  const dayCounts = new Map();
  for (const c of applied) dayCounts.set(dayKey(c.date), (dayCounts.get(dayKey(c.date)) || 0) + 1);

  let lastDay = null;
  const items = applied.map((c, i) => {
    const day = dayKey(c.date);
    const header = day !== lastDay ? `<div class="folio reveal"><div class="folio-rule"><span class="folio-num">${new Date(c.date).getDate()}</span><span class="folio-rest">${esc(fmtFolioRest(c.date))}</span><span class="folio-count">${dayCounts.get(day)} cambio${dayCounts.get(day) === 1 ? '' : 's'}</span></div></div>` : '';
    lastDay = day;
    return header + entryCard(c, i, project.id, project);
  }).join('\n');

  // Las propuestas van arriba y fuera del hilo cronológico a propósito: son lo
  // único que te pide una decisión. El historial de abajo es cosa hecha.
  const proposalsSection = pending.length ? `
  <div class="section-head section-proposals">
    <h2>Propuestas pendientes</h2>
    <span class="section-sub">${pending.length} esperando tu decisión</span>
  </div>
  <div class="timeline">
    ${pending.map((c, i) => entryCard(c, i, project.id, project)).join('\n')}
  </div>` : '';

  // Entre las propuestas y el historial: aceptadas pero todavía sin escribir.
  // Es trabajo comprometido y pendiente, y merece verse antes que lo ya hecho.
  const acceptedSection = accepted.length ? `
  <div class="section-head section-accepted">
    <h2>Aceptadas · pendientes de aplicar</h2>
    <span class="section-sub">${accepted.length} sin escribir todavía</span>
  </div>
  <div class="timeline">
    ${accepted.map((c, i) => entryCard(c, i, project.id, project)).join('\n')}
  </div>` : '';

  const rejectedSection = rejected.length ? `
  <div class="timeline">
    ${rejected.map((c, i) => entryCard(c, i, project.id, project)).join('\n')}
  </div>` : '<p class="empty-view">Nada descartado todavía.</p>';

  // Lo que reclama algo tuyo, en el orden en que estorba: decidir una
  // propuesta, escribir una aceptada, revisar un cambio, y las pruebas rotas
  // —que se cuelan aquí aunque el cambio ya esté revisado, porque un test en
  // rojo no deja de serlo porque alguien haya leído el diff—.
  const sinRevisar = applied.filter((c) => !c.verified);
  const rotas = applied.filter((c) => c.verified && c.test && c.test.status === 'failing');
  const porHacer = pending.length + accepted.length + sinRevisar.length + rotas.length;

  const bloque = (clase, titulo, sub, lista) => lista.length ? `
  <div class="section-head ${clase}">
    <h2>${titulo}</h2>
    <span class="section-sub">${sub}</span>
  </div>
  <div class="timeline">
    ${lista.map((c, i) => entryCard(c, i, project.id, project)).join('\n')}
  </div>` : '';

  const pendingView = porHacer ? [
    bloque('section-proposals', 'Propuestas', `${pending.length} esperando tu decisión`, pending),
    bloque('section-accepted', 'Aceptadas · pendientes de aplicar', `${accepted.length} sin escribir todavía`, accepted),
    bloque('', 'Sin revisar', `${sinRevisar.length} cambio${sinRevisar.length === 1 ? '' : 's'} por leer`, sinRevisar),
    bloque('section-failing', 'Pruebas en rojo', `${rotas.length} revisado${rotas.length === 1 ? '' : 's'} pero fallando`, rotas),
  ].join('\n') : `<p class="empty-view">Nada pendiente. Todo revisado y sin propuestas abiertas.</p>`;

  const title = `Historial · ${esc(project.name)}`;
  const pct = total ? Math.round((verifiedCount / total) * 100) : 0;
  const exportBase = `/p/${encodeURIComponent(project.id)}/export`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
${FAVICON}
${FONTS}
<style>${TOKENS}${TIMELINE_STYLE}</style>
</head>
<body>
<div class="page">
  <a class="back" href="/">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>
    Todos los proyectos
  </a>
  <p class="eyebrow" style="margin-top:20px">Code Timeline · Libro de cambios</p>
  <h1>${title}</h1>
  <p class="hero-sub">Empieza por lo que te reclama algo: propuestas por decidir, aceptadas por escribir, cambios por revisar y pruebas en rojo. El libro entero, en orden y con su porqué, está en Historial.</p>

  <div class="tally-row">
    <div class="tally"><span class="n">${total}</span><span class="l">Cambios</span></div>
    <div class="tally progress">
      <span class="n" id="verified-count">${verifiedCount} / ${total}</span><span class="l">Revisados</span>
      <div class="bar"><div class="bar-fill" id="bar-fill" style="--w: ${pct}%"></div></div>
    </div>
    <div class="tally"><span class="n"${failing ? ' style="color:var(--before)"' : ''}>${tested} / ${total}</span><span class="l">${failing ? `Probados · ${failing} falla${failing === 1 ? '' : 'n'}` : 'Probados'}</span></div>
    <div class="tally"><span class="n" id="pending-count">${pending.length}</span><span class="l">Propuestas</span></div>
    ${accepted.length ? `<div class="tally"><span class="n" style="color:var(--propose)">${accepted.length}</span><span class="l">Por aplicar</span></div>` : ''}
    <div class="tally"><span class="n">${dayCounts.size}</span><span class="l">Día${dayCounts.size === 1 ? '' : 's'}</span></div>
  </div>

  ${qaStrip(qa)}

  ${copilotoPanel(copiloto)}

  <div class="toolbar">
    <button type="button" onclick="window.print()">Imprimir / PDF</button>
    <a href="${exportBase}.md" download>Exportar Markdown</a>
    <a href="/p/${esc(project.id)}/pr.md" download>Cuerpo de PR</a>
    <a href="${exportBase}.json" download>Exportar JSON</a>
  </div>
  ${controlesExplicacion()}

  <div class="viewbar" role="tablist">
    <button type="button" class="viewtab" data-view="pendiente" role="tab">Pendiente <span class="viewtab-n">${porHacer}</span></button>
    <button type="button" class="viewtab" data-view="historial" role="tab">Historial <span class="viewtab-n">${total}</span></button>
    <button type="button" class="viewtab" data-view="descartadas" role="tab">Descartadas <span class="viewtab-n">${rejected.length}</span></button>
  </div>

  <section class="view" data-view="pendiente">${pendingView}</section>

  <section class="view" data-view="historial">
    <div class="timeline">
      ${items || '<p class="empty-view">Todavía no hay cambios registrados.</p>'}
    </div>
  </section>

  <section class="view" data-view="descartadas">${rejectedSection}</section>
</div>
<div class="jump" id="jump">
  <button type="button" data-jump="top" title="Ir arriba (Inicio)" aria-label="Ir arriba"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/></svg></button>
  <button type="button" data-jump="bottom" title="Ir abajo (Fin)" aria-label="Ir abajo"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M3.5 8.5L8 13l4.5-4.5"/></svg></button>
</div>
<footer class="page-foot">${esc(project.repoPath || '')}</footer>

<script>
(function () {
  var PROJECT_ID = ${JSON.stringify(project.id)};
  var TOKEN = ${JSON.stringify(token || '')};
  var TOTAL = ${total};
  var PENDIENTES = ${porHacer};

  function patch(id, body) {
    return fetch('/api/projects/' + encodeURIComponent(PROJECT_ID) + '/changes/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CT-Token': TOKEN },
      body: JSON.stringify(body),
    }).catch(function () {});
  }

  function updateCount() {
    var n = document.querySelectorAll('.verify-box:checked').length;
    var el = document.getElementById('verified-count');
    if (el) el.textContent = n + ' / ' + TOTAL;
    var bar = document.getElementById('bar-fill');
    if (bar) bar.style.setProperty('--w', (TOTAL ? Math.round((n / TOTAL) * 100) : 0) + '%');
  }

  document.querySelectorAll('.verify-box').forEach(function (b) {
    b.addEventListener('change', function () {
      updateCount();
      var entry = b.closest('.entry');
      if (entry) entry.classList.toggle('reviewed', b.checked);
      var check = b.closest('.check');
      if (check) { check.classList.toggle('done', b.checked); check.querySelector('span:last-child').textContent = b.checked ? 'revisado' : 'pendiente'; }
      patch(b.dataset.id, { verified: b.checked });
    });
  });

  var timers = {};
  document.querySelectorAll('.note-box').forEach(function (ta) {
    ta.addEventListener('input', function () {
      var id = ta.dataset.id;
      clearTimeout(timers[id]);
      timers[id] = setTimeout(function () {
        patch(id, { note: ta.value }).then(function () {
          var status = document.querySelector('.save-status[data-id="' + id + '"]');
          if (!status) return;
          status.textContent = 'guardado';
          status.classList.add('show');
          setTimeout(function () { status.classList.remove('show'); }, 1200);
        });
      }, 600);
    });
  });

  document.querySelectorAll('.btn-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var texto = btn.dataset.copy;
      var listo = function () {
        btn.textContent = 'Copiado';
        setTimeout(function () { btn.textContent = 'Copiar'; }, 1400);
      };
      // navigator.clipboard solo existe en contextos seguros: en http://localhost
      // lo es, pero si alguien sirve esto por IP en su red, no. De ahí el respaldo.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(listo, function () { fallback(texto, listo); });
      } else {
        fallback(texto, listo);
      }
    });
  });

  function fallback(texto, listo) {
    var ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); listo(); } catch (e) { window.prompt('Copia esto:', texto); }
    document.body.removeChild(ta);
  }

  // Aceptar o descartar mueve la entrada de sección, así que la página se
  // recarga: reconstruirla a mano en el cliente sería duplicar el renderizador
  // entero para ahorrar 200 ms.
  document.querySelectorAll('.btn[data-decision]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var decision = btn.dataset.decision;
      var note = '';
      if (decision === 'reject') {
        note = window.prompt('¿Por qué la descartas? (queda archivada con este motivo)') || '';
      }
      btn.disabled = true;
      btn.textContent = decision === 'accept' ? 'Aceptando...' : 'Descartando...';
      fetch('/api/projects/' + encodeURIComponent(PROJECT_ID) + '/changes/' + encodeURIComponent(btn.dataset.id) + '/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CT-Token': TOKEN },
        body: JSON.stringify({ decision: decision, note: note }),
      }).then(function (r) {
        if (!r.ok) throw new Error('fallo');
        window.location.reload();
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = decision === 'accept' ? 'Aceptar' : 'Descartar';
        alert('No se pudo guardar la decisión.');
      });
    });
  });


  // Salto de scroll. El contenedor cambia según la pantalla, así que se le
  // pasa cuál: en el timeline es la ventana, en la vista completa el panel
  // del código. Los botones se deshabilitan en cada extremo en vez de
  // ocultarse, para que no bailen mientras lees.
  function montarSaltos(caja) {
    var jump = document.getElementById('jump');
    if (!jump) return;
    var esVentana = caja === window;
    var arriba = jump.querySelector('[data-jump="top"]');
    var abajo = jump.querySelector('[data-jump="bottom"]');
    var suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function metricas() {
      if (esVentana) {
        var d = document.documentElement;
        return { y: window.scrollY, alto: d.scrollHeight, visible: window.innerHeight };
      }
      return { y: caja.scrollTop, alto: caja.scrollHeight, visible: caja.clientHeight };
    }

    function refrescar() {
      var m = metricas();
      var margen = 120;
      jump.classList.toggle('on', m.alto - m.visible > margen);
      arriba.disabled = m.y < 8;
      abajo.disabled = m.y + m.visible >= m.alto - 8;
    }

    function ir(destino) {
      var opciones = { top: destino, behavior: suave ? 'smooth' : 'auto' };
      if (esVentana) window.scrollTo(opciones); else caja.scrollTo(opciones);
    }

    arriba.addEventListener('click', function () { ir(0); });
    abajo.addEventListener('click', function () { ir(metricas().alto); });
    (esVentana ? window : caja).addEventListener('scroll', refrescar, { passive: true });
    window.addEventListener('resize', refrescar);
    refrescar();
    return refrescar;
  }

  // Cambiar de pestaña cambia el alto de la página: hay que recalcular.
  var refrescarSaltos = montarSaltos(window);

  // Arranca en Pendiente, salvo que no haya nada pendiente: abrir en una
  // pestaña vacía sería enseñar el vacío en vez del trabajo.
  var vistas = document.querySelectorAll('.view');
  var pestanas = document.querySelectorAll('.viewtab');

  function mostrar(nombre) {
    vistas.forEach(function (v) { v.hidden = v.dataset.view !== nombre; });
    pestanas.forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.view === nombre)); });
    try { localStorage.setItem('ct-vista:' + PROJECT_ID, nombre); } catch (e) {}
    if (refrescarSaltos) refrescarSaltos();
  }

  pestanas.forEach(function (b) {
    b.addEventListener('click', function () { mostrar(b.dataset.view); });
  });

  var guardada;
  try { guardada = localStorage.getItem('ct-vista:' + PROJECT_ID); } catch (e) {}
  var valida = guardada && document.querySelector('.view[data-view="' + guardada + '"]');
  mostrar(valida ? guardada : (PENDIENTES ? 'pendiente' : 'historial'));

  // ── Lanzar acciones ─────────────────────────────────────
  // Lo único de esta página que ejecuta algo. El servidor devuelve el trabajo
  // al momento y aquí se va preguntando por él: una sesión de Claude tarda
  // minutos y dejar la petición abierta la mataría cualquier timeout.
  document.querySelectorAll('.btn-lanzar').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var accion = btn.dataset.accion;
      var etiqueta = btn.textContent;

      // Confirmar antes: esto toca el repo de verdad, y un clic sin querer
      // sobre "commitear" no debería ser irreversible sin avisar.
      var aviso = accion === 'aplicar'
        ? 'Se va a lanzar Claude para que escriba esta propuesta en el repo. ¿Sigo?'
        : accion === 'commit' ? '¿Hago el commit con ese mensaje?'
        : accion === 'push' ? '¿Subo los commits al remoto?' : '¿Sigo?';
      if (!window.confirm(aviso)) return;

      btn.disabled = true;
      btn.textContent = 'Lanzando…';

      fetch('/api/projects/' + encodeURIComponent(PROJECT_ID) + '/acciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CT-Token': TOKEN },
        body: JSON.stringify({ accion: accion, changeId: btn.dataset.id }),
      })
        .then(function (r) { return r.json(); })
        .then(function (t) {
          if (t.error) throw new Error(t.error);
          seguir(t, btn, etiqueta);
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = etiqueta;
          mostrarTrabajo(btn, { estado: 'fallo', error: String(err.message || err) });
        });
    });
  });

  function panelDe(btn) {
    var panel = btn.parentElement.querySelector('.trabajo');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'trabajo';
      btn.parentElement.appendChild(panel);
    }
    return panel;
  }

  function mostrarTrabajo(btn, t) {
    var panel = panelDe(btn);
    panel.dataset.estado = t.estado;
    var cabeza = t.estado === 'corriendo' ? 'Trabajando…'
      : t.estado === 'hecho' ? 'Hecho' : 'Ha fallado';
    var cuerpo = t.error ? t.error : (t.salida || '').slice(-4000);
    panel.innerHTML = '<div class="trabajo-cab">' + cabeza + '</div>'
      + (cuerpo ? '<pre class="trabajo-salida"></pre>' : '');
    if (cuerpo) panel.querySelector('.trabajo-salida').textContent = cuerpo;
  }

  function seguir(t, btn, etiqueta) {
    mostrarTrabajo(btn, t);
    if (t.estado !== 'corriendo') {
      btn.disabled = false;
      btn.textContent = etiqueta;
      // Un trabajo que acaba cambia el estado del repo y del historial, así
      // que la página que se está mirando ya no es la de ahora.
      if (t.estado === 'hecho') setTimeout(function () { location.reload(); }, 2500);
      return;
    }
    setTimeout(function () {
      fetch('/api/trabajos/' + encodeURIComponent(t.id))
        .then(function (r) { return r.json(); })
        .then(function (nuevo) { seguir(nuevo, btn, etiqueta); })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = etiqueta;
        });
    }, 1500);
  }

  // ── Explicación línea por línea ─────────────────────────
  // El vínculo va en los dos sentidos: de la explicación a su línea y de la
  // línea a su explicación. Se monta por delegación para que valga también
  // para las explicaciones que llegan después, sin recargar la página.
  function marcarQueTienen(panel) {
    var conExplicacion = {};
    panel.querySelectorAll('.ex').forEach(function (ex) { conExplicacion[ex.dataset.l] = true; });
    panel.querySelectorAll('.cl').forEach(function (cl) {
      cl.classList.toggle('tiene', !!conExplicacion[cl.dataset.l]);
    });
    panel.classList.toggle('leyendo', Object.keys(conExplicacion).length > 0);
  }

  function enlazar(panel, numero, encendido) {
    if (!panel) return;
    panel.querySelectorAll('.cl[data-l="' + numero + '"], .ex[data-l="' + numero + '"]')
      .forEach(function (el) { el.classList.toggle('enlazada', encendido); });
  }

  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest && e.target.closest('.ex, .cl');
    if (!el) return;
    enlazar(el.closest('.panel'), el.dataset.l, true);
  });
  document.addEventListener('mouseout', function (e) {
    var el = e.target.closest && e.target.closest('.ex, .cl');
    if (!el) return;
    enlazar(el.closest('.panel'), el.dataset.l, false);
  });

  // Al pulsar una explicación, su línea se lleva el foco: en un panel largo la
  // línea puede estar fuera de la vista, y entonces el resalto no se ve.
  document.addEventListener('click', function (e) {
    var ex = e.target.closest && e.target.closest('.ex');
    if (!ex) return;
    var linea = ex.closest('.panel').querySelector('.cl[data-l="' + ex.dataset.l + '"]');
    if (linea) linea.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // Ver/ocultar NO borra nada: la explicación sigue guardada y en la página,
  // solo deja de ocupar. Se recuerda por panel para que al recargar siga como
  // la dejaste, que si no hay que volver a plegar cada vez.
  function clavePliegue(panel) {
    return 'ct-plegada:' + PROJECT_ID + ':' + (panel.dataset.id || '') + ':'
      + (panel.dataset.file || '') + ':' + (panel.dataset.panel || '');
  }

  function ponerBotonVer(panel, visible) {
    var controles = panel.querySelector('.explicar-controles');
    if (!controles) return;
    var b = controles.querySelector('.btn-ver');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-ver';
      controles.insertBefore(b, controles.firstChild);
    }
    b.textContent = visible ? 'Ocultar explicación' : 'Revelar explicación';
    b.setAttribute('aria-expanded', String(visible));
  }

  function plegar(panel, plegada) {
    panel.classList.toggle('plegada', plegada);
    ponerBotonVer(panel, !plegada);
    try { localStorage.setItem(clavePliegue(panel), plegada ? '1' : '0'); } catch (e) {}
  }

  document.querySelectorAll('.panel').forEach(function (panel) {
    marcarQueTienen(panel);
    if (!panel.querySelector('.explicacion')) return;
    var guardada;
    try { guardada = localStorage.getItem(clavePliegue(panel)); } catch (e) {}
    plegar(panel, guardada !== '0');
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.btn-ver');
    if (!b) return;
    var panel = b.closest('.panel');
    plegar(panel, !panel.classList.contains('plegada'));
  });

  var nivelGlobal = document.getElementById('explain-level');
  var motorGlobal = document.getElementById('explain-engine');
  try {
    if (localStorage.getItem('ct-explain-level')) nivelGlobal.value = localStorage.getItem('ct-explain-level');
    if (localStorage.getItem('ct-explain-engine')) motorGlobal.value = localStorage.getItem('ct-explain-engine');
  } catch (e) {}
  nivelGlobal.addEventListener('change', function () { try { localStorage.setItem('ct-explain-level', nivelGlobal.value); } catch (e) {} });
  motorGlobal.addEventListener('change', function () { try { localStorage.setItem('ct-explain-engine', motorGlobal.value); } catch (e) {} });

  document.querySelectorAll('.btn-explicar').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = btn.closest('.panel');
      var caja = panel.querySelector('.explicacion-caja');
      var sel = motorGlobal;
      var selN = nivelGlobal;
      var elegido = (sel && sel.value ? sel.value : 'claude:sonnet').split(':');
      var nivel = selN && selN.value ? selN.value : 'normal';
      var etiqueta = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Leyendo…';

      fetch('/api/projects/' + encodeURIComponent(PROJECT_ID) + '/changes/'
            + encodeURIComponent(btn.dataset.id) + '/explicar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CT-Token': TOKEN },
        body: JSON.stringify({
          fileIndex: Number(btn.dataset.file), lado: btn.dataset.lado,
          motor: elegido[0], modelo: elegido.slice(1).join(':'), nivel: nivel,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) throw new Error(d.error);
          caja.innerHTML = d.html;
          marcarQueTienen(panel);
          panel.classList.remove('plegada');
          ponerBotonVer(panel, true);
          btn.textContent = 'Regenerar';
        })
        .catch(function (err) {
          caja.innerHTML = '<div class="explicacion"><p class="explicacion-pie" style="color:var(--before)">'
            + String(err.message || err).replace(/[<>&]/g, '') + '</p></div>';
          btn.textContent = etiqueta;
        })
        .finally(function () { btn.disabled = false; });
    });
  });

  updateCount();
})();
</script>
</body>
</html>`;
}

const DETAIL_STYLE = `
  html, body { height: 100%; }
  .detail-shell { height: 100vh; display: flex; flex-direction: column; }
  .detail-top { flex-shrink: 0; display: flex; align-items: center; gap: 16px; padding: 10px 20px; border-bottom: 1px solid var(--border); }
  .detail-pos { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-dim); white-space: nowrap; }
  .detail-nav { display: flex; gap: 6px; margin-left: auto; }
  .nav-btn {
    display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
    border: 1px solid var(--border); border-radius: 2px; color: var(--ink-dim); text-decoration: none; flex-shrink: 0;
  }
  .nav-btn svg { width: 13px; height: 13px; }
  .nav-btn:hover { border-color: var(--accent); color: var(--accent-ink); }
  .nav-btn.disabled { opacity: .3; pointer-events: none; }

  .detail-main { flex: 1; min-height: 0; display: flex; }

  .detail-sidebar { width: clamp(280px, 22vw, 460px); flex-shrink: 0; border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; background: var(--surface); }
  .sidebar-scroll { flex: 1; overflow-y: auto; }
  .sidebar-meta { padding: 16px 18px; border-bottom: 1px solid var(--border); }
  .detail-tear {
    font-size: 12px; color: var(--ink-dim); background: var(--accent-soft);
    border: 1px solid var(--accent); border-radius: 2px; padding: 8px 11px; margin-bottom: 12px;
  }
  .detail-tear strong { color: var(--ink); font-weight: 600; }
  .sidebar-title { font-family: 'Source Serif 4', serif; font-weight: 600; font-size: 16px; line-height: 1.35; margin: 9px 0 10px; text-wrap: balance; }
  .sidebar-explanation { font-size: 12.5px; color: var(--ink-dim); line-height: 1.55; margin: 0 0 14px; }
  .sidebar-note { border-top: 1px solid var(--border); padding: 16px 18px; margin: 14px -18px 0; }
  .sidebar-note .note-box { font-size: 12.5px; min-height: 50px; }

  .tree-wrap { padding: 14px 8px 30px; }
  .tree-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim); padding: 0 8px 8px; }
  .tree-wrap details { margin: 0; }
  .tree-wrap summary {
    cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; padding: 5px 8px;
    border-radius: 2px; font-family: 'JetBrains Mono', monospace; font-size: 12px; user-select: none;
  }
  .tree-wrap summary::-webkit-details-marker { display: none; }
  .tree-wrap summary svg { width: 8px; height: 8px; flex-shrink: 0; color: var(--ink-faint); }
  .tree-wrap details[open] > summary svg { transform: rotate(90deg); }
  .tree-dir > summary { color: var(--ink); font-weight: 600; }
  .tree-file > summary { color: var(--ink); font-weight: 500; }
  .tree-file.has-current > summary { color: var(--accent-ink); }
  .tree-count { margin-left: auto; font-size: 10px; color: var(--ink-faint); }
  /* A tres niveles, el sangrado a pelo deja de leerse como jerarquía. */
  .tree-children { padding-left: 16px; margin-left: 13px; border-left: 1px solid var(--border); }
  .tree-change {
    display: flex; align-items: flex-start; gap: 8px; padding: 6px 9px; margin: 1px 0;
    border-left: 2px solid transparent; border-radius: 0 2px 2px 0;
    font-size: 12.5px; color: var(--ink); text-decoration: none; line-height: 1.45;
  }
  /* Dos líneas antes de recortar: los títulos son frases, y a una línea con
     puntos suspensivos casi ninguno se distingue del de al lado. */
  .tree-change-title {
    flex: 1; min-width: 0; overflow: hidden; white-space: normal;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .tree-dot {
    width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--ink-faint); flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; margin-top: 3px;
  }
  .tree-dot svg { width: 5px; height: 5px; stroke: var(--surface); }
  .tree-dot.done { background: var(--accent); border-color: var(--accent); }
  .tree-change:hover { background: var(--surface-2); color: var(--ink); }
  .tree-change.jump { border-left-color: var(--before-line); }
  .tree-change.current { border-left-color: var(--accent); color: var(--ink); background: var(--accent-soft); font-weight: 600; }
  .tree-change:has(.tree-dot.done):not(.current) { color: var(--ink-dim); }

  .detail-main-panel { flex: 1; min-width: 0; overflow: auto; background: var(--code-bg); scroll-behavior: smooth; }
  .file-section + .file-section { border-top: 8px solid var(--bg); }
  .file-section-head {
    position: sticky; top: 0; z-index: 2; background: var(--surface-2); border-bottom: 1px solid var(--border);
    padding: 9px 20px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-dim);
  }
  .file-section-head b { color: var(--ink); }

  .tree-change.tree-proposal { color: var(--propose); }
  .tree-change.tree-rejected { color: var(--ink-dim); text-decoration: line-through; text-decoration-color: var(--ink-faint); }
  .tree-change.tree-accepted { color: var(--propose); }
  .tree-dot.dot-accepted { border-color: var(--propose); border-style: solid; }
  .tree-dot.dot-proposal { border-style: dashed; border-color: var(--propose-line); }
  .tree-dot.dot-rejected { border-style: dotted; }

  .detail-banner {
    padding: 11px 20px; font-size: 12.5px; color: var(--ink);
    background: var(--propose-soft); border-bottom: 1px solid var(--propose-line);
  }
  .detail-banner strong { color: var(--propose); }
  .sidebar-proposed { border-top: 1px dashed var(--border); padding-top: 13px; margin-bottom: 14px; }
  .sidebar-proposed .panel + .panel { margin-top: 9px; }
  .sidebar-proposed .panel pre { font-size: 11px; max-height: 260px; overflow-y: auto; }
  .sidebar-proposed-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim); margin-bottom: 9px; }

  @media (max-width: 860px) {
    .detail-main { flex-direction: column; }
    .detail-sidebar { width: auto; max-height: 40vh; border-right: none; border-bottom: 1px solid var(--border); }
  }
`;

function buildProjectFileTree(changes) {
  const byFile = new Map();
  changes.forEach((c, i) => {
    (c.files || []).forEach((f) => {
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file).push({
        id: c.id,
        title: c.title,
        verified: !!c.verified,
        status: c.status || 'change',
        relationType: c.relation && c.relation.type,
      });
    });
  });
  const root = { children: new Map() };
  [...byFile.keys()].sort().forEach((path) => {
    const parts = path.split('/');
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: isFile ? path : undefined, isFile, children: new Map(), entries: isFile ? byFile.get(path) : null });
      }
      node = node.children.get(part);
    });
  });
  return root;
}

const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>';
const DOT_CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3.5 3.5L13 5"/></svg>';

function renderTreeChildren(node, projectId, currentChangeId, currentFileIndexByPath) {
  const dirs = [], filesArr = [];
  for (const child of node.children.values()) (child.isFile ? filesArr : dirs).push(child);
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  filesArr.sort((a, b) => a.name.localeCompare(b.name));

  const dirHtml = dirs.map((d) => `
    <details class="tree-dir" open>
      <summary>${CHEVRON}${esc(d.name)}/</summary>
      <div class="tree-children">${renderTreeChildren(d, projectId, currentChangeId, currentFileIndexByPath)}</div>
    </details>`).join('');

  const fileHtml = filesArr.map((f) => {
    const hasCurrent = f.entries.some((e) => e.id === currentChangeId);
    const items = f.entries.map((e) => {
      const isCurrent = e.id === currentChangeId;
      const isJump = !isCurrent && e.relationType === 'jump';
      const href = isCurrent ? '#file-' + currentFileIndexByPath.get(f.path) : `/p/${esc(projectId)}/c/${esc(e.id)}`;
      const cls = ['tree-change', isCurrent && 'current', isJump && 'jump', e.status !== 'change' && 'tree-' + e.status].filter(Boolean).join(' ');
      const title = isJump ? ' title="Salto: no continúa el cambio anterior"'
        : e.status === 'proposal' ? ' title="Propuesta: todavía no está en el código"'
        : e.status === 'accepted' ? ' title="Aceptada, pendiente de aplicar"'
        : e.status === 'rejected' ? ' title="Propuesta descartada"' : '';
      return `<a class="${cls}" href="${href}"${title}>
        <span class="tree-dot${e.verified ? ' done' : ''}${e.status !== 'change' ? ' dot-' + e.status : ''}">${e.verified ? DOT_CHECK : ''}</span>
        <span class="tree-change-title">${esc(e.title)}</span>
      </a>`;
    }).join('');
    return `
    <details class="tree-file${hasCurrent ? ' has-current' : ''}" ${hasCurrent ? 'open' : ''}>
      <summary>${CHEVRON}${esc(f.name)}<span class="tree-count">${f.entries.length}</span></summary>
      <div class="tree-children">${items}</div>
    </details>`;
  }).join('');

  return dirHtml + fileHtml;
}

export function renderChangeDetailHtml(project, changes, index, fileHtmls, token) {
  const change = changes[index];
  const u = change.unit || {};
  const files = change.files || [];
  const status = change.status || 'change';
  // Anterior/siguiente se mueve dentro del mismo grupo: saltar de una
  // propuesta a un cambio del historial y de vuelta no es un recorrido, es un
  // baile. Cada lista se recorre entera por su cuenta.
  const siblings = changes.filter((c) => (c.status || 'change') === status);
  const pos = siblings.findIndex((c) => c.id === change.id);
  const prev = pos > 0 ? siblings[pos - 1] : null;
  const next = pos >= 0 && pos < siblings.length - 1 ? siblings[pos + 1] : null;
  const projectHref = `/p/${esc(project.id)}`;

  const sections = files.map((f, i) => {
    const lineLabel = f.lineStart ? (f.lineEnd && f.lineEnd !== f.lineStart ? `L${f.lineStart}–${f.lineEnd}` : `L${f.lineStart}`) : '';
    return `
<div class="file-section" id="file-${i}">
  <div class="file-section-head"><b>${esc(f.file)}</b>${lineLabel ? ' · ' + lineLabel : ''}</div>
  ${fileHtmls[i] || '<div class="editor-error">Sin contenido.</div>'}
</div>`;
  }).join('');

  const tree = buildProjectFileTree(changes);
  const currentFileIndexByPath = new Map(files.map((f, i) => [f.file, i]));
  const treeHtml = renderTreeChildren(tree, project.id, change.id, currentFileIndexByPath);

  const relNote = change.relation && change.relation.type === 'jump'
    ? `<div class="detail-tear"><strong>Salto respecto al cambio anterior.</strong> ${esc(change.relation.note)}</div>`
    : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(change.title)} · ${esc(project.name)}</title>
${FAVICON}
${FONTS}
<style>${TOKENS}${CODE_TABLE_STYLE}${PANEL_STYLE}${CONTROL_STYLE}
  .chip { font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 3px 9px; border: 1px solid var(--border); border-radius: 2px; color: var(--ink-dim); background: var(--surface-2); }
  .check { position: relative; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-dim); font-family: 'JetBrains Mono', monospace; cursor: pointer; user-select: none; }
  .check input { position: absolute; opacity: 0; width: 15px; height: 15px; cursor: pointer; }
  .check-ring { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid var(--border); display: flex; align-items: center; justify-content: center; }
  .check-ring svg { width: 8px; height: 8px; stroke: var(--surface); opacity: 0; }
  .check.done .check-ring { background: var(--accent); border-color: var(--accent); }
  .check.done .check-ring svg { opacity: 1; }
  .note-label { display: flex; align-items: center; gap: 6px; font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-dim); margin-bottom: 7px; }
  .note-label svg { width: 11px; height: 11px; }
  .note-box {
    width: 100%; min-height: 26px; resize: vertical; border: 1px solid var(--border); border-radius: 2px; padding: 9px 11px;
    background-image: repeating-linear-gradient(to bottom, transparent 0 22px, var(--border) 22px 23px);
    background-color: var(--surface); font-family: 'Public Sans', sans-serif; font-size: 13px; color: var(--ink);
  }
  .note-box::placeholder { color: var(--ink-dim); font-style: italic; }
  .save-status { display: block; font-size: 11px; color: var(--after); margin-top: 4px; height: 14px; opacity: 0; transition: opacity .2s; }
  .save-status.show { opacity: 1; }
${DETAIL_STYLE}</style>
</head>
<body>
<div class="detail-shell">
  <div class="detail-top">
    <a class="back" href="${projectHref}">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>
      Timeline
    </a>
    <span class="detail-pos">${pos + 1} / ${siblings.length}</span>
    ${status === 'change' ? `<label class="check${change.verified ? ' done' : ''}">
      <input type="checkbox" class="verify-box" data-id="${esc(change.id)}" ${change.verified ? 'checked' : ''} />
      <span class="check-ring"><svg viewBox="0 0 16 16" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3.5 3.5L13 5"/></svg></span>
      <span>${change.verified ? 'revisado' : 'pendiente'}</span>
    </label>` : ''}
    ${status === 'proposal' ? `<span class="badge badge-proposal">Propuesta</span>
      <button class="btn btn-reject" data-decision="reject" data-id="${esc(change.id)}">Descartar</button>
      <button class="btn btn-accept" data-decision="accept" data-id="${esc(change.id)}">Aceptar</button>` : ''}
    ${status === 'accepted' ? `<span class="badge badge-approved">Aceptada · falta aplicarla</span>` : ''}
    ${status === 'rejected' ? `<span class="badge badge-rejected">Descartada</span>
      <button class="btn btn-accept" data-decision="accept" data-id="${esc(change.id)}">Recuperar</button>` : ''}
    <div class="detail-nav">
      <a class="nav-btn${prev ? '' : ' disabled'}" data-dir="prev" href="${prev ? projectHref + '/c/' + esc(prev.id) : '#'}" title="Cambio anterior">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>
      </a>
      <a class="nav-btn${next ? '' : ' disabled'}" data-dir="next" href="${next ? projectHref + '/c/' + esc(next.id) : '#'}" title="Cambio siguiente">
        ${CHEVRON}
      </a>
    </div>
  </div>

  ${status === 'change' ? '' : `<div class="detail-banner">
    <strong>${status === 'proposal' ? 'Esto todavía no está en el código.'
      : status === 'accepted' ? 'Aceptada, pero todavía no está en el código.'
      : 'Propuesta descartada.'}</strong>
    El archivo de la derecha es el estado ACTUAL del repo, no el propuesto: las líneas resaltadas
    marcan dónde iría el cambio. El código propuesto está aquí al lado, en "Antes / Después".
  </div>`}

  <div class="detail-main">
    <div class="detail-sidebar">
      <div class="sidebar-scroll">
        <div class="sidebar-meta">
          ${relNote}
          <span class="chip">${esc(u.type || 'código')}${u.name ? ' · ' + esc(u.name) : ''}</span>
          <h1 class="sidebar-title">${esc(change.title)}</h1>
          <div class="sidebar-explanation md">${mdToHtml(change.explanation)}</div>
          ${status === 'change' ? '' : `<div class="sidebar-proposed">
            <div class="sidebar-proposed-label">Código propuesto</div>
            ${files.map((f, fi) => `<div class="file-tag" style="margin-bottom:7px"><b>${esc(f.file)}</b></div>
              ${codePanel('before', f.before, f.language, { changeId: change.id, fileIndex: fi, explicacion: (f.explicaciones || {}).before })}${codePanel('after', f.after, f.language, { changeId: change.id, fileIndex: fi, explicacion: (f.explicaciones || {}).after })}`).join('')}
          </div>`}
          ${status === 'rejected' && change.decisionNote ? `<div class="verdict md" style="margin-bottom:14px"><strong>Motivo del descarte.</strong> ${mdToHtml(change.decisionNote)}</div>` : ''}
          ${proofBlock(change)}
          <div class="sidebar-note">
            <div class="note-label">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>
              Tu nota
            </div>
            <textarea class="note-box" data-id="${esc(change.id)}" placeholder="${status === 'proposal' ? 'Anota qué te falta por saber antes de decidir...' : 'Anota algo mientras revisas...'}">${esc(change.note)}</textarea>
            <span class="save-status" data-id="${esc(change.id)}"></span>
          </div>
        </div>
        <div class="tree-wrap">
          <div class="tree-eyebrow">Archivos del proyecto</div>
          ${treeHtml}
        </div>
      </div>
    </div>

    <div class="detail-main-panel">${sections}</div>
  </div>
</div>
<div class="jump" id="jump">
  <button type="button" data-jump="top" title="Ir arriba (Inicio)" aria-label="Ir arriba"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/></svg></button>
  <button type="button" data-jump="bottom" title="Ir abajo (Fin)" aria-label="Ir abajo"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M3.5 8.5L8 13l4.5-4.5"/></svg></button>
</div>

<script>
(function () {
  var PROJECT_ID = ${JSON.stringify(project.id)};
  var TOKEN = ${JSON.stringify(token || '')};

  function patch(id, body) {
    return fetch('/api/projects/' + encodeURIComponent(PROJECT_ID) + '/changes/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CT-Token': TOKEN },
      body: JSON.stringify(body),
    }).catch(function () {});
  }

  var box = document.querySelector('.verify-box');
  if (box) {
    box.addEventListener('change', function () {
      var label = box.closest('.check');
      if (label) { label.classList.toggle('done', box.checked); label.querySelector('span:last-child').textContent = box.checked ? 'revisado' : 'pendiente'; }
      patch(box.dataset.id, { verified: box.checked });
    });
  }

  var timer;
  var ta = document.querySelector('.note-box');
  if (ta) {
    ta.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        patch(ta.dataset.id, { note: ta.value }).then(function () {
          var status = document.querySelector('.save-status[data-id="' + ta.dataset.id + '"]');
          if (!status) return;
          status.textContent = 'guardado';
          status.classList.add('show');
          setTimeout(function () { status.classList.remove('show'); }, 1200);
        });
      }, 600);
    });
  }

  // Al decidir, la entrada cambia de sección: se vuelve al timeline, que es
  // donde se ve el resultado de la decisión.
  document.querySelectorAll('.btn[data-decision]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var decision = btn.dataset.decision;
      var note = '';
      if (decision === 'reject') {
        note = window.prompt('¿Por qué la descartas? (queda archivada con este motivo)') || '';
      }
      btn.disabled = true;
      fetch('/api/projects/' + encodeURIComponent(PROJECT_ID) + '/changes/' + encodeURIComponent(btn.dataset.id) + '/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CT-Token': TOKEN },
        body: JSON.stringify({ decision: decision, note: note }),
      }).then(function (r) {
        if (!r.ok) throw new Error('fallo');
        window.location.href = '/p/' + encodeURIComponent(PROJECT_ID);
      }).catch(function () {
        btn.disabled = false;
        alert('No se pudo guardar la decisión.');
      });
    });
  });

  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var dir = e.key === 'ArrowLeft' ? 'prev' : 'next';
    var btn = document.querySelector('.nav-btn[data-dir="' + dir + '"]:not(.disabled)');
    if (btn) window.location.href = btn.getAttribute('href');
  });


  // Salto de scroll. El contenedor cambia según la pantalla, así que se le
  // pasa cuál: en el timeline es la ventana, en la vista completa el panel
  // del código. Los botones se deshabilitan en cada extremo en vez de
  // ocultarse, para que no bailen mientras lees.
  function montarSaltos(caja) {
    var jump = document.getElementById('jump');
    if (!jump) return;
    var esVentana = caja === window;
    var arriba = jump.querySelector('[data-jump="top"]');
    var abajo = jump.querySelector('[data-jump="bottom"]');
    var suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function metricas() {
      if (esVentana) {
        var d = document.documentElement;
        return { y: window.scrollY, alto: d.scrollHeight, visible: window.innerHeight };
      }
      return { y: caja.scrollTop, alto: caja.scrollHeight, visible: caja.clientHeight };
    }

    function refrescar() {
      var m = metricas();
      var margen = 120;
      jump.classList.toggle('on', m.alto - m.visible > margen);
      arriba.disabled = m.y < 8;
      abajo.disabled = m.y + m.visible >= m.alto - 8;
    }

    function ir(destino) {
      var opciones = { top: destino, behavior: suave ? 'smooth' : 'auto' };
      if (esVentana) window.scrollTo(opciones); else caja.scrollTo(opciones);
    }

    arriba.addEventListener('click', function () { ir(0); });
    abajo.addEventListener('click', function () { ir(metricas().alto); });
    (esVentana ? window : caja).addEventListener('scroll', refrescar, { passive: true });
    window.addEventListener('resize', refrescar);
    refrescar();
    return refrescar;
  }

  montarSaltos(document.querySelector('.detail-main-panel'));

  var firstChanged = document.querySelector('.file-section tr.changed');
  if (firstChanged && firstChanged.scrollIntoView) firstChanged.scrollIntoView({ block: 'center' });
})();
</script>
</body>
</html>`;
}

export function renderIndexHtml(projects) {
  const rows = projects.map((p) => {
    const pct = p.changeCount ? Math.round((p.verifiedCount / p.changeCount) * 100) : 0;
    const empty = !p.changeCount;
    return `<a class="proj-row${empty ? ' empty' : ''}" href="/p/${encodeURIComponent(p.id)}">
      <div class="proj-main">
        <div class="proj-name">${esc(p.name)}</div>
        <div class="proj-path">${empty ? 'Vinculado — sin cambios registrados todavía' : esc(p.repoPath)}</div>
      </div>
      <div class="proj-stats">
        <span class="proj-ratio"><b>${p.verifiedCount}</b> / ${p.changeCount} cambios</span>
        <div class="ring${empty ? ' empty' : ''}" style="--pct: ${pct}"></div>
      </div>
    </a>`;
  }).join('\n');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Code Timeline</title>
${FAVICON}
${FONTS}
<style>
${TOKENS}
@property --pct { syntax: '<number>'; inherits: false; initial-value: 0; }
.index-head { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid var(--ink); padding-bottom: 9px; margin-top: 40px; }
.index-head span { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim); }
.proj-list { display: flex; flex-direction: column; }
.proj-row { display: flex; align-items: center; gap: 20px; padding: 20px 4px; border-bottom: 1px solid var(--border); text-decoration: none; color: var(--ink); }
.proj-row:hover .proj-name { color: var(--accent-ink); }
.proj-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.proj-name { font-family: 'Source Serif 4', serif; font-weight: 600; font-size: 18px; }
.proj-path { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--ink-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.proj-stats { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
.proj-ratio { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--ink-dim); white-space: nowrap; }
.proj-ratio b { color: var(--ink); font-weight: 600; }
.ring { width: 34px; height: 34px; border-radius: 50%; background: conic-gradient(var(--accent) calc(var(--pct) * 1%), var(--border) 0); position: relative; flex-shrink: 0; }
.ring::after { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: var(--surface); }
.ring.empty { background: none; border: 1.5px dashed var(--border); }
.ring.empty::after { display: none; }
.proj-row.empty .proj-name { color: var(--ink-dim); font-weight: 500; }
.proj-row.empty .proj-path { font-style: italic; }
.empty-state { color: var(--ink-dim); margin-top: 24px; font-size: 14.5px; }
@keyframes riseIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ringFill { from { --pct: 0; } }
@media (prefers-reduced-motion: no-preference) {
  .proj-list > .proj-row { animation: riseIn .45s cubic-bezier(.16,.8,.3,1) both; }
  .proj-list > .proj-row:nth-child(1) { animation-delay: .02s; } .proj-list > .proj-row:nth-child(2) { animation-delay: .08s; }
  .proj-list > .proj-row:nth-child(3) { animation-delay: .14s; } .proj-list > .proj-row:nth-child(4) { animation-delay: .20s; }
  .proj-list > .proj-row:nth-child(5) { animation-delay: .26s; }
  .ring { animation: ringFill 1s .35s cubic-bezier(.16,.8,.3,1) both; }
  .proj-row { transition: background-color .15s ease; }
  .proj-row:hover { background-color: var(--surface-2); }
}
</style>
</head>
<body>
<div class="page">
  <p class="eyebrow">Code Timeline</p>
  <h1>Tus proyectos</h1>
  <p class="hero-sub">Historial de código verificable, uno por proyecto vinculado.</p>
  <div class="index-head"><span>Proyecto</span><span>Revisión</span></div>
  ${projects.length ? `<div class="proj-list">${rows}</div>` : '<p class="empty-state">Sin proyectos todavía. Desde Claude Code, en cualquier repo: "vincula este proyecto".</p>'}
</div>
</body>
</html>`;
}

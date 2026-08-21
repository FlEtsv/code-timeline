export function esc(s) {
  return String(s ?? '')
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

export function renderFileTable(content, lineStart, lineEnd) {
  const lines = content.split('\n');
  const rows = lines.map((text, i) => {
    const n = i + 1;
    const changed = lineStart != null && n >= lineStart && n <= (lineEnd ?? lineStart);
    const src = esc(text) || '&nbsp;';
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
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: oklch(19% 0.014 75); --surface: oklch(23% 0.016 75); --surface-2: oklch(27% 0.018 75);
      --border: oklch(35% 0.02 75); --ink: oklch(93% 0.01 75); --ink-dim: oklch(66% 0.016 75);
      --ink-faint: oklch(48% 0.016 75); --accent: oklch(75% 0.12 78); --accent-ink: oklch(85% 0.09 78);
      --accent-soft: oklch(75% 0.12 78 / 0.14); --before: oklch(70% 0.14 32); --before-line: oklch(60% 0.14 32);
      --before-hatch: oklch(70% 0.14 32 / 0.14); --after: oklch(70% 0.11 155); --after-line: oklch(58% 0.10 155);
      --shadow: 0 1px 2px oklch(0% 0 0 / 0.35), 0 16px 34px -16px oklch(0% 0 0 / 0.6);
    }
  }
  :root[data-theme="dark"] {
    --bg: oklch(19% 0.014 75); --surface: oklch(23% 0.016 75); --surface-2: oklch(27% 0.018 75);
    --border: oklch(35% 0.02 75); --ink: oklch(93% 0.01 75); --ink-dim: oklch(66% 0.016 75);
    --ink-faint: oklch(48% 0.016 75); --accent: oklch(75% 0.12 78); --accent-ink: oklch(85% 0.09 78);
    --accent-soft: oklch(75% 0.12 78 / 0.14); --before: oklch(70% 0.14 32); --before-line: oklch(60% 0.14 32);
    --before-hatch: oklch(70% 0.14 32 / 0.14); --after: oklch(70% 0.11 155); --after-line: oklch(58% 0.10 155);
    --shadow: 0 1px 2px oklch(0% 0 0 / 0.35), 0 16px 34px -16px oklch(0% 0 0 / 0.6);
  }
  a { color: var(--accent-ink); }
  a:hover { color: var(--accent); }
  code, pre, .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .page { max-width: 900px; margin: 0 auto; padding: 56px 24px 140px; }
  .back { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; text-decoration: none; }
  .back svg { width: 12px; height: 12px; }
  .eyebrow { font-size: 11.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--accent-ink); margin: 0 0 10px; font-weight: 600; }
  h1 { font-family: 'Source Serif 4', Georgia, serif; font-weight: 600; font-size: clamp(28px, 4vw, 38px); margin: 0 0 8px; letter-spacing: -.005em; text-wrap: balance; }
  .hero-sub { color: var(--ink-dim); font-size: 15px; max-width: 62ch; margin: 0 0 28px; }
  footer.page-foot { max-width: 900px; margin: 40px auto 0; padding: 0 24px; color: var(--ink-dim); font-size: 12.5px; font-family: 'JetBrains Mono', monospace; }
  @media (prefers-reduced-motion: no-preference) {
    .back svg { transition: transform .15s ease; }
    .back:hover svg { transform: translateX(-3px); }
  }
`;

const CODE_TABLE_STYLE = `
  .code-table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.65; }
  .code-table tr.changed { background: var(--accent-soft); }
  .code-table tr.changed td.ln { color: var(--accent-ink); font-weight: 600; }
  .code-table td.ln {
    width: 1%; white-space: nowrap; text-align: right; padding: 0 14px 0 18px; color: var(--ink-faint);
    user-select: none; border-right: 1px solid var(--border); font-variant-numeric: tabular-nums;
  }
  .code-table td.src { padding: 0 18px 0 14px; white-space: pre; color: var(--ink); }
  .editor-loading, .editor-error { padding: 16px 18px; font-size: 12.5px; color: var(--ink-dim); font-style: italic; }
  .editor-error { color: var(--before); }
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

  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
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

  .diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; margin: 17px 0 15px; }
  @media (max-width: 640px) { .diff-grid { grid-template-columns: 1fr; } }
  .panel { border: 1px solid var(--border); border-radius: 2px; overflow: hidden; background: var(--surface-2); min-width: 0; }
  .panel-before { border-left: 3px solid var(--before-line); background-image: repeating-linear-gradient(133deg, var(--before-hatch) 0 2px, transparent 2px 10px); }
  .panel-after { border-left: 3px solid var(--after-line); }
  .panel-label { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; letter-spacing: .12em; padding: 7px 11px; border-bottom: 1px solid var(--border); }
  .panel-before .panel-label { color: var(--before); }
  .panel-after .panel-label { color: var(--after); }
  .panel pre { margin: 0; padding: 11px 12px; overflow-x: auto; font-size: 12px; line-height: 1.6; font-family: 'JetBrains Mono', monospace; color: var(--ink); }
  .panel-empty-msg { padding: 20px 12px; color: var(--ink-dim); font-style: italic; font-size: 12.5px; }

  .card-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
  .open-full {
    flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; text-decoration: none;
    font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .04em; color: var(--accent-ink);
    border: 1px solid var(--border); border-radius: 2px; padding: 4px 9px;
  }
  .open-full svg { width: 10px; height: 10px; }
  .open-full:hover { border-color: var(--accent); background: var(--accent-soft); }

  .explanation { font-size: 14px; color: var(--ink); margin: 17px 0 0; max-width: 68ch; }

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

function codePanel(kind, code) {
  const label = kind === 'before' ? 'ANTES' : 'DESPUÉS';
  if (code == null) {
    return `<div class="panel panel-${kind} panel-empty"><div class="panel-label">${label}</div><div class="panel-empty-msg">— no existía —</div></div>`;
  }
  return `<div class="panel panel-${kind}"><div class="panel-label">${label}</div><pre><code>${esc(code)}</code></pre></div>`;
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
    ${codePanel('before', f.before)}
    ${codePanel('after', f.after)}
  </div>
</div>`;
}

function relationBlock(rel, index) {
  if (!rel || index === 0) return '';
  if (rel.type === 'jump') {
    return `<div class="tear reveal">
      <div class="tear-line"></div>
      <div class="tear-tag"><span class="tear-badge">Salto</span></div>
      <p class="tear-note"><strong>Salto respecto al cambio anterior.</strong> ${esc(rel.note)}</p>
    </div>`;
  }
  return '';
}

function entryCard(change, index, projectId) {
  const u = change.unit || {};
  const files = change.files || [];
  return `
${relationBlock(change.relation, index)}
<article class="entry reveal${change.verified ? ' reviewed' : ''}" data-id="${esc(change.id)}">
  <div class="entry-marker"><svg viewBox="0 0 16 16" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3.5 3.5L13 5"/></svg></div>
  <div class="card">
    <div class="stamp">Revisado</div>
    <div class="card-head">
      <span class="chip">${esc(u.type || 'código')}${u.name ? ' · ' + esc(u.name) : ''}</span>
      <label class="check${change.verified ? ' done' : ''}">
        <input type="checkbox" class="verify-box" data-id="${esc(change.id)}" ${change.verified ? 'checked' : ''} />
        <span class="check-ring"><svg viewBox="0 0 16 16" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3.5 3.5L13 5"/></svg></span>
        <span>${change.verified ? 'revisado' : 'pendiente'}</span>
      </label>
    </div>
    <div class="card-title-row">
      <h2 class="card-title">${esc(change.title)}</h2>
      <a class="open-full" href="/p/${esc(projectId)}/c/${esc(change.id)}" title="Abrir en pantalla completa">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"/></svg>
        Pantalla completa
      </a>
    </div>

    ${files.map((f, i) => fileBlock(change, f, i, files.length)).join('\n')}

    <p class="explanation">${esc(change.explanation)}</p>

    <div class="note">
      <div class="note-label">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>
        Tu nota
      </div>
      <textarea class="note-box" data-id="${esc(change.id)}" placeholder="Anota algo mientras revisas (dudas, ok, pendiente de probar...)">${esc(change.note)}</textarea>
      <span class="save-status" data-id="${esc(change.id)}"></span>
    </div>
  </div>
</article>`;
}

export function renderTimelineHtml(project, changes) {
  const total = changes.length;
  const verifiedCount = changes.filter((c) => c.verified).length;

  const dayCounts = new Map();
  for (const c of changes) dayCounts.set(dayKey(c.date), (dayCounts.get(dayKey(c.date)) || 0) + 1);

  let lastDay = null;
  const items = changes.map((c, i) => {
    const day = dayKey(c.date);
    const header = day !== lastDay ? `<div class="folio reveal"><div class="folio-rule"><span class="folio-num">${new Date(c.date).getDate()}</span><span class="folio-rest">${esc(fmtFolioRest(c.date))}</span><span class="folio-count">${dayCounts.get(day)} cambio${dayCounts.get(day) === 1 ? '' : 's'}</span></div></div>` : '';
    lastDay = day;
    return header + entryCard(c, i, project.id);
  }).join('\n');

  const title = `Historial · ${esc(project.name)}`;
  const pct = total ? Math.round((verifiedCount / total) * 100) : 0;

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
  <p class="hero-sub">Cada cambio: dónde está, qué había antes, qué hay ahora y por qué. En orden — marca "revisado" y deja nota según vayas verificando.</p>

  <div class="tally-row">
    <div class="tally"><span class="n">${total}</span><span class="l">Cambios</span></div>
    <div class="tally progress">
      <span class="n" id="verified-count">${verifiedCount} / ${total}</span><span class="l">Revisados</span>
      <div class="bar"><div class="bar-fill" id="bar-fill" style="--w: ${pct}%"></div></div>
    </div>
    <div class="tally"><span class="n">${dayCounts.size}</span><span class="l">Día${dayCounts.size === 1 ? '' : 's'}</span></div>
  </div>

  <div class="timeline">
    ${items || '<p style="color:var(--ink-dim)">Todavía no hay cambios registrados.</p>'}
  </div>
</div>
<footer class="page-foot">${esc(project.repoPath || '')}</footer>

<script>
(function () {
  var PROJECT_ID = ${JSON.stringify(project.id)};
  var TOTAL = ${total};

  function patch(id, body) {
    return fetch('/api/projects/' + encodeURIComponent(PROJECT_ID) + '/changes/' + encodeURIComponent(id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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

  updateCount();
})();
</script>
</body>
</html>`;
}

const DETAIL_STYLE = `
  html, body { height: 100%; }
  .detail-shell { height: 100vh; display: flex; flex-direction: column; }
  .detail-top { flex-shrink: 0; display: flex; align-items: center; gap: 16px; padding: 12px 24px; border-bottom: 1px solid var(--border); }
  .detail-pos { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-dim); white-space: nowrap; }
  .detail-nav { display: flex; gap: 6px; margin-left: auto; }
  .nav-btn {
    display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
    border: 1px solid var(--border); border-radius: 2px; color: var(--ink-dim); text-decoration: none; flex-shrink: 0;
  }
  .nav-btn svg { width: 13px; height: 13px; }
  .nav-btn:hover { border-color: var(--accent); color: var(--accent-ink); }
  .nav-btn.disabled { opacity: .3; pointer-events: none; }

  .detail-body { flex: 1; min-height: 0; max-width: 1120px; margin: 0 auto; width: 100%; padding: 20px 24px 24px; display: flex; flex-direction: column; gap: 16px; }
  .detail-meta { flex-shrink: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 3px; box-shadow: var(--shadow); padding: 20px 24px; }
  .detail-tear {
    flex-shrink: 0; font-size: 12.5px; color: var(--ink-dim); background: var(--accent-soft);
    border: 1px solid var(--accent); border-radius: 2px; padding: 9px 14px; margin-bottom: 14px;
  }
  .detail-tear strong { color: var(--ink); font-weight: 600; }
  .detail-title { font-family: 'Source Serif 4', serif; font-weight: 600; font-size: 22px; margin: 10px 0 10px; text-wrap: balance; }
  .detail-explanation { font-size: 14.5px; color: var(--ink); max-width: 82ch; margin: 0 0 16px; }
  .detail-note { border-top: 1px dashed var(--border); padding-top: 13px; }

  .detail-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 3px; overflow: hidden; box-shadow: var(--shadow); }
  .detail-tabs { flex-shrink: 0; display: flex; overflow-x: auto; background: var(--surface-2); border-bottom: 1px solid var(--border); }
  .detail-tab {
    flex-shrink: 0; padding: 10px 18px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-dim);
    cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; background: none; border-top: none; border-left: none; border-right: none;
  }
  .detail-tab.active { color: var(--accent-ink); border-bottom-color: var(--accent); background: var(--surface); }
  .detail-tab .lines { color: var(--ink-faint); margin-left: 6px; }
  .detail-panels { flex: 1; min-height: 0; position: relative; background: var(--surface); }
  .detail-panel { position: absolute; inset: 0; overflow-y: auto; display: none; }
  .detail-panel.active { display: block; }
  @media (max-width: 720px) {
    .detail-body { padding: 14px 14px 18px; }
    .detail-meta { padding: 16px; }
  }
`;

export function renderChangeDetailHtml(project, changes, index, firstFileHtml) {
  const change = changes[index];
  const u = change.unit || {};
  const files = change.files || [];
  const prev = index > 0 ? changes[index - 1] : null;
  const next = index < changes.length - 1 ? changes[index + 1] : null;
  const projectHref = `/p/${esc(project.id)}`;

  const tabs = files.map((f, i) => {
    const lineLabel = f.lineStart ? (f.lineEnd && f.lineEnd !== f.lineStart ? `L${f.lineStart}–${f.lineEnd}` : `L${f.lineStart}`) : '';
    return `<button type="button" class="detail-tab${i === 0 ? ' active' : ''}" data-file-index="${i}">${esc(f.file)}${lineLabel ? `<span class="lines">${lineLabel}</span>` : ''}</button>`;
  }).join('');

  const panels = files.map((f, i) => {
    const body = i === 0 ? firstFileHtml : '<div class="editor-loading">Cargando…</div>';
    return `<div class="detail-panel${i === 0 ? ' active' : ''}" data-file-index="${i}" ${i === 0 ? 'data-loaded="1"' : ''}>${body}</div>`;
  }).join('');

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
<style>${TOKENS}${CODE_TABLE_STYLE}
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
    <span class="detail-pos">${index + 1} / ${changes.length}</span>
    <label class="check${change.verified ? ' done' : ''}">
      <input type="checkbox" class="verify-box" data-id="${esc(change.id)}" ${change.verified ? 'checked' : ''} />
      <span class="check-ring"><svg viewBox="0 0 16 16" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l3.5 3.5L13 5"/></svg></span>
      <span>${change.verified ? 'revisado' : 'pendiente'}</span>
    </label>
    <div class="detail-nav">
      <a class="nav-btn${prev ? '' : ' disabled'}" data-dir="prev" href="${prev ? projectHref + '/c/' + esc(prev.id) : '#'}" title="Cambio anterior">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>
      </a>
      <a class="nav-btn${next ? '' : ' disabled'}" data-dir="next" href="${next ? projectHref + '/c/' + esc(next.id) : '#'}" title="Cambio siguiente">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>
      </a>
    </div>
  </div>

  <div class="detail-body">
    <div class="detail-meta">
      ${relNote}
      <span class="chip">${esc(u.type || 'código')}${u.name ? ' · ' + esc(u.name) : ''}</span>
      <h1 class="detail-title">${esc(change.title)}</h1>
      <p class="detail-explanation">${esc(change.explanation)}</p>
      <div class="detail-note">
        <div class="note-label">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>
          Tu nota
        </div>
        <textarea class="note-box" data-id="${esc(change.id)}" placeholder="Anota algo mientras revisas (dudas, ok, pendiente de probar...)">${esc(change.note)}</textarea>
        <span class="save-status" data-id="${esc(change.id)}"></span>
      </div>
    </div>

    <div class="detail-editor">
      <div class="detail-tabs">${files.length > 1 ? tabs : `<span class="detail-tab active">${esc(files[0]?.file || '')}</span>`}</div>
      <div class="detail-panels">${panels}</div>
    </div>
  </div>
</div>

<script>
(function () {
  var PROJECT_ID = ${JSON.stringify(project.id)};
  var CHANGE_ID = ${JSON.stringify(change.id)};

  function patch(id, body) {
    return fetch('/api/projects/' + encodeURIComponent(PROJECT_ID) + '/changes/' + encodeURIComponent(id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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

  function loadPanel(i) {
    var panel = document.querySelector('.detail-panel[data-file-index="' + i + '"]');
    if (!panel || panel.dataset.loaded) return;
    fetch('/api/projects/' + encodeURIComponent(PROJECT_ID) + '/changes/' + encodeURIComponent(CHANGE_ID) + '/files/' + i)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (html) {
        panel.innerHTML = html;
        panel.dataset.loaded = '1';
        var changedRow = panel.querySelector('tr.changed');
        if (changedRow && changedRow.scrollIntoView) changedRow.scrollIntoView({ block: 'center' });
      })
      .catch(function () {
        panel.innerHTML = '<div class="editor-error">No se pudo cargar el archivo.</div>';
      });
  }

  document.querySelectorAll('.detail-tab[data-file-index]').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var i = tab.dataset.fileIndex;
      document.querySelectorAll('.detail-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      document.querySelectorAll('.detail-panel').forEach(function (p) { p.classList.toggle('active', p.dataset.fileIndex === i); });
      loadPanel(i);
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

  var firstChanged = document.querySelector('.detail-panel.active tr.changed');
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

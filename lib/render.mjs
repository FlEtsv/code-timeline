function esc(s) {
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

function codePanel(kind, code) {
  const label = kind === 'before' ? 'ANTES' : 'DESPUÉS';
  if (code == null) {
    return `<div class="panel panel-${kind} panel-empty">
      <div class="panel-label">${label}</div>
      <div class="panel-empty-msg">— no existía —</div>
    </div>`;
  }
  return `<div class="panel panel-${kind}">
      <div class="panel-label">${label}</div>
      <pre><code>${esc(code)}</code></pre>
    </div>`;
}

function relationBlock(rel, index) {
  if (!rel || index === 0) return '';
  if (rel.type === 'jump') {
    return `<div class="rail-break">
      <div class="rail-break-line"></div>
      <div class="jump-chip">
        <span class="jump-icon" aria-hidden="true">⇥</span>
        <span class="jump-text"><strong>Salto</strong> — ${esc(rel.note)}</span>
      </div>
    </div>`;
  }
  return `<div class="rail-continue" title="${esc(rel.note || 'Continúa el cambio anterior')}"></div>`;
}

function entryCard(change, index) {
  const u = change.unit || {};
  const lineLabel = change.lineStart
    ? (change.lineEnd && change.lineEnd !== change.lineStart
        ? `L${change.lineStart}–${change.lineEnd}`
        : `L${change.lineStart}`)
    : '';
  return `
${relationBlock(change.relation, index)}
<article class="entry" data-id="${esc(change.id)}">
  <div class="entry-dot" aria-hidden="true"></div>
  <div class="entry-card">
    <header class="entry-head">
      <div class="entry-head-top">
        <span class="badge badge-unit">${esc(u.type || 'código')}${u.name ? ' · ' + esc(u.name) : ''}</span>
        <label class="check">
          <input type="checkbox" class="verify-box" data-id="${esc(change.id)}" />
          <span>revisado</span>
        </label>
      </div>
      <h2 class="entry-title">${esc(change.title)}</h2>
      <div class="entry-meta">
        <span class="loc">${esc(change.file)}${lineLabel ? ' · ' + lineLabel : ''}</span>
        <span class="dot-sep">·</span>
        <span class="date">${fmtDate(change.date)}</span>
        ${change.commit ? `<span class="dot-sep">·</span><span class="commit">${esc(change.commit)}</span>` : ''}
      </div>
    </header>

    <div class="diff-grid">
      ${codePanel('before', change.before)}
      ${codePanel('after', change.after)}
    </div>

    <p class="explanation">${esc(change.explanation)}</p>
  </div>
</article>`;
}

export function renderTimelineHtml(project, changes) {
  const total = changes.length;
  const items = changes.map(entryCard).join('\n');
  const title = `Historial · ${esc(project.name)}`;

  return `<title>${title}</title>
<meta name="description" content="Historial verificable de cambios de código — antes/después, dónde y por qué, en orden." />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f3f1ec;
    --surface: #ffffff;
    --surface-2: #eae6dd;
    --border: #ddd7c9;
    --text: #211d16;
    --text-dim: #6c6353;
    --accent: #a8611f;
    --accent-soft: #f0e0cb;
    --before: #a8433a;
    --before-soft: #f6e3e0;
    --before-border: #d59a92;
    --after: #3f7d4c;
    --after-soft: #e3ecdf;
    --after-border: #9dc09f;
    --shadow: 0 1px 2px rgba(33, 29, 22, 0.06), 0 8px 24px -12px rgba(33, 29, 22, 0.18);
    --radius: 10px;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #14171b;
      --surface: #1b1f24;
      --surface-2: #232830;
      --border: #30363f;
      --text: #eae6dc;
      --text-dim: #9a9fa8;
      --accent: #e0975a;
      --accent-soft: #3a2c1c;
      --before: #e2827a;
      --before-soft: #322022;
      --before-border: #5a3336;
      --after: #7fc48c;
      --after-soft: #1f2a20;
      --after-border: #375b3d;
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 30px -14px rgba(0, 0, 0, 0.6);
    }
  }
  :root[data-theme="dark"] {
    --bg: #14171b;
    --surface: #1b1f24;
    --surface-2: #232830;
    --border: #30363f;
    --text: #eae6dc;
    --text-dim: #9a9fa8;
    --accent: #e0975a;
    --accent-soft: #3a2c1c;
    --before: #e2827a;
    --before-soft: #322022;
    --before-border: #5a3336;
    --after: #7fc48c;
    --after-soft: #1f2a20;
    --after-border: #375b3d;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 12px 30px -14px rgba(0, 0, 0, 0.6);
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  code, pre, .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }

  .page { max-width: 880px; margin: 0 auto; padding: 56px 24px 120px; }

  .hero { margin-bottom: 44px; }
  .eyebrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0 0 10px;
  }
  h1 {
    font-size: clamp(28px, 4vw, 38px);
    font-weight: 700;
    margin: 0 0 10px;
    text-wrap: balance;
    letter-spacing: -0.01em;
  }
  .hero-sub {
    color: var(--text-dim);
    font-size: 15.5px;
    max-width: 62ch;
    margin: 0 0 28px;
  }

  .stats {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 96px;
  }
  .stat .n {
    font-family: 'IBM Plex Mono', monospace;
    font-variant-numeric: tabular-nums;
    font-size: 20px;
    font-weight: 600;
  }
  .stat .n.verified { color: var(--after); }
  .stat .l { font-size: 11.5px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }

  .timeline { position: relative; }

  .entry { position: relative; padding-left: 34px; margin-top: 30px; }
  .entry:first-of-type { margin-top: 8px; }
  .entry-dot {
    position: absolute;
    left: 6px;
    top: 30px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg);
    box-shadow: 0 0 0 1px var(--border);
  }
  .entry::before {
    content: "";
    position: absolute;
    left: 11px;
    top: 0;
    bottom: -30px;
    width: 1.5px;
    background: var(--border);
  }
  .entry:last-of-type::before { display: none; }

  .rail-continue {
    position: relative;
    left: 11px;
    width: 1.5px;
    height: 20px;
    background: var(--border);
    margin-bottom: -20px;
  }

  .rail-break {
    position: relative;
    padding-left: 34px;
    margin: 22px 0;
  }
  .rail-break-line {
    position: absolute;
    left: 11px;
    top: 0;
    bottom: 0;
    width: 1.5px;
    background-image: linear-gradient(var(--text-dim) 60%, transparent 0%);
    background-size: 1.5px 8px;
    background-repeat: repeat-y;
    opacity: 0.5;
  }
  .jump-chip {
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    border-radius: 999px;
    padding: 7px 14px 7px 12px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text);
    max-width: 100%;
  }
  .jump-icon { color: var(--accent); font-size: 13px; }
  .jump-text strong { color: var(--accent); font-weight: 600; }

  .entry-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 20px 22px 22px;
  }

  .entry-head-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .badge {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-dim);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-dim);
    cursor: pointer;
    user-select: none;
  }
  .check input { accent-color: var(--after); width: 15px; height: 15px; cursor: pointer; }

  .entry-title {
    font-size: 19px;
    font-weight: 600;
    margin: 12px 0 6px;
    text-wrap: balance;
  }
  .entry-meta {
    font-size: 12.5px;
    color: var(--text-dim);
    font-family: 'IBM Plex Mono', monospace;
  }
  .dot-sep { margin: 0 6px; opacity: 0.6; }

  .diff-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 16px 0 14px;
  }
  @media (max-width: 640px) {
    .diff-grid { grid-template-columns: 1fr; }
  }
  .panel {
    border-radius: 8px;
    border: 1px solid var(--border);
    overflow: hidden;
    min-width: 0;
  }
  .panel-before { border-color: var(--before-border); background: var(--before-soft); }
  .panel-after { border-color: var(--after-border); background: var(--after-soft); }
  .panel-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }
  .panel-before .panel-label { color: var(--before); border-color: var(--before-border); }
  .panel-after .panel-label { color: var(--after); border-color: var(--after-border); }
  .panel pre {
    margin: 0;
    padding: 10px 12px;
    overflow-x: auto;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text);
  }
  .panel-empty { display: flex; flex-direction: column; }
  .panel-empty-msg {
    padding: 16px 12px;
    color: var(--text-dim);
    font-style: italic;
    font-size: 13px;
  }

  .explanation {
    font-size: 14.5px;
    color: var(--text);
    margin: 0;
    max-width: 72ch;
  }

  footer.page-foot {
    max-width: 880px;
    margin: 40px auto 0;
    padding: 0 24px;
    color: var(--text-dim);
    font-size: 12.5px;
    font-family: 'IBM Plex Mono', monospace;
  }

  @media (prefers-reduced-motion: no-preference) {
    .entry-card { transition: box-shadow 0.15s ease; }
  }
</style>

<div class="page">
  <div class="hero">
    <p class="eyebrow">Code Timeline</p>
    <h1>${title}</h1>
    <p class="hero-sub">Cada cambio: dónde está, qué había antes, qué hay ahora y por qué. En orden — marca "revisado" según vayas verificando.</p>
    <div class="stats">
      <div class="stat"><span class="n">${total}</span><span class="l">cambios</span></div>
      <div class="stat"><span class="n verified" id="verified-count">0</span><span class="l">revisados</span></div>
    </div>
  </div>

  <div class="timeline">
    ${items || '<p style="color:var(--text-dim)">Todavía no hay cambios registrados.</p>'}
  </div>
</div>

<footer class="page-foot">${esc(project.repoPath || '')}</footer>

<script>
(function () {
  var KEY = 'code-timeline:${esc(project.id)}:revisado';
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}

  var boxes = document.querySelectorAll('.verify-box');
  function updateCount() {
    var n = 0;
    boxes.forEach(function (b) { if (b.checked) n++; });
    var el = document.getElementById('verified-count');
    if (el) el.textContent = n;
  }
  boxes.forEach(function (b) {
    var id = b.dataset.id;
    b.checked = !!state[id];
    b.addEventListener('change', function () {
      state[id] = b.checked;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
      updateCount();
    });
  });
  updateCount();
})();
</script>
`;
}

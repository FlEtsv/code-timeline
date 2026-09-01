// Export a Markdown: el historial en un fichero de texto que se lee en
// GitHub, en un editor o pegado en un correo. Es la versión archivable —
// sin "revisado" clicable ni mini-editor, pero con todo el contenido.

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fence(code, language) {
  // Si el propio código contiene ```, el cierre tiene que ser más largo que
  // cualquier valla que haya dentro; si no, el bloque se corta a medias.
  const longest = (String(code).match(/`{3,}/g) || []).reduce((n, m) => Math.max(n, m.length), 2);
  const bar = '`'.repeat(Math.max(3, longest + 1));
  return `${bar}${language || ''}\n${code}\n${bar}`;
}

function fileSection(f) {
  const lines = f.lineStart
    ? (f.lineEnd && f.lineEnd !== f.lineStart ? ` · L${f.lineStart}–${f.lineEnd}` : ` · L${f.lineStart}`)
    : '';
  const before = f.before == null
    ? '_No existía: código nuevo._'
    : `**Antes**\n\n${fence(f.before, f.language)}`;
  return `#### \`${f.file}\`${lines}\n\n${before}\n\n**Después**\n\n${fence(f.after, f.language)}`;
}

function entry(c, n) {
  const u = c.unit || {};
  const unit = [u.type, u.name].filter(Boolean).join(' · ');
  const head = [];

  if (c.status === 'proposal') head.push('> **Propuesta pendiente.** Todavía no está en el código.');
  if (c.status === 'accepted') head.push('> **Aceptada, pendiente de aplicar.** Aprobada, pero nadie la ha escrito todavía.');
  if (c.status === 'rejected') {
    head.push('> **Propuesta descartada.**' + (c.decisionNote ? ` ${c.decisionNote}` : ''));
  }
  if (c.status === 'change' && c.fromProposal) head.push('> Aceptada desde una propuesta.');
  if (c.relation && c.relation.type === 'jump') {
    head.push(`> **Salto respecto al cambio anterior.** ${c.relation.note}`);
  }

  const T = { untested: 'sin probar', auto: 'prueba automática', manual: 'probado a mano', failing: 'la prueba falla' };
  const t = c.test || {};
  const prueba = (t.status && t.status !== 'untested') || t.command || t.note
    ? `**Prueba:** ${T[t.status] || t.status}` +
      (t.command ? ` — \`${t.command}\`` : '') +
      (t.note ? `. ${t.note}` : '')
    : '';

  const meta = [
    fmtDate(c.date),
    unit && `\`${unit}\``,
    c.commit && `commit \`${c.commit}\``,
    c.status === 'change' && (c.verified ? 'revisado' : 'pendiente de revisar'),
  ].filter(Boolean).join(' · ');

  // Los bloques se separan con línea en blanco y los ausentes se caen: en
  // Markdown, pegar un párrafo a un encabezado o a una cita se ve raro y a
  // veces ni siquiera se renderiza como se espera.
  return [
    `### ${n}. ${c.title}`,
    meta,
    head.length ? head.join('\n>\n') : '',
    c.explanation,
    prueba,
    (c.files || []).map(fileSection).join('\n\n'),
    c.note ? `**Tu nota:** ${c.note}` : '',
  ].filter(Boolean).join('\n\n');
}

export function renderMarkdown(project, changes) {
  const applied = changes.filter((c) => c.status === 'change');
  const pending = changes.filter((c) => c.status === 'proposal');
  const accepted = changes.filter((c) => c.status === 'accepted');
  const rejected = changes.filter((c) => c.status === 'rejected');
  const verified = applied.filter((c) => c.verified).length;

  const out = [
    `# Historial · ${project.name}`,
    '',
    `${applied.length} cambio${applied.length === 1 ? '' : 's'} · ${verified} revisado${verified === 1 ? '' : 's'}` +
      (pending.length ? ` · ${pending.length} propuesta${pending.length === 1 ? '' : 's'} pendiente${pending.length === 1 ? '' : 's'}` : ''),
    '',
    `\`${project.repoPath}\``,
    '',
    `_Exportado el ${fmtDate(new Date().toISOString())} desde Code Timeline._`,
    '',
  ];

  if (pending.length) {
    out.push('---', '', '## Propuestas pendientes', '');
    pending.forEach((c, i) => out.push(entry(c, i + 1), ''));
  }

  if (accepted.length) {
    out.push('---', '', '## Aceptadas · pendientes de aplicar', '');
    accepted.forEach((c, i) => out.push(entry(c, i + 1), ''));
  }

  out.push('---', '', '## Historial de cambios', '');
  if (!applied.length) out.push('_Sin cambios registrados todavía._', '');
  applied.forEach((c, i) => out.push(entry(c, i + 1), ''));

  if (rejected.length) {
    out.push('---', '', '## Propuestas descartadas', '');
    rejected.forEach((c, i) => out.push(entry(c, i + 1), ''));
  }

  return out.join('\n');
}

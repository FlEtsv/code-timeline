#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const path = resolve(process.argv[2] || (existsSync('.code-timeline/index.json') ? '.code-timeline/index.json' : '.code-timeline/history.json'));
if (!existsSync(path)) process.exit(0);
const data = JSON.parse(readFileSync(path, 'utf8'));
let todos;
if (data.format === 'code-timeline/versioned-v2') {
  const root = dirname(path);
  todos = (data.entries || []).map((entry) => {
    const target = resolve(root, entry.path);
    if (!target.startsWith(`${root}/`) || !existsSync(target)) throw new Error(`Entrada versionada inválida: ${entry.path}`);
    return JSON.parse(readFileSync(target, 'utf8')).change;
  });
} else if (data.format === 'code-timeline/versioned-v1') todos = data.changes || [];
else throw new Error('Formato de historial versionado desconocido.');
let commits = null;
let archivosPr = null;
if (process.env.GITHUB_BASE_REF) {
  try {
    commits = execFileSync('git', [
      'log', '--format=%h', `origin/${process.env.GITHUB_BASE_REF}..HEAD`,
    ], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    archivosPr = new Set(execFileSync('git', [
      'diff', '--name-only', `origin/${process.env.GITHUB_BASE_REF}...HEAD`,
    ], { encoding: 'utf8' }).trim().split('\n').filter(Boolean));
  } catch { /* sin base disponible: se enseña el historial completo */ }
}
const enPr = (c) => !archivosPr || (c.files || []).some((f) => archivosPr.has(f.file));
const commitEnPr = (c) => !commits || (c.commit && commits.some((sha) => sha.startsWith(c.commit) || c.commit.startsWith(sha)));
const cambios = todos.filter((c) =>
  (c.status || 'change') === 'change' && enPr(c) && (commitEnPr(c) || !c.commit),
);
const documentados = new Set(cambios.flatMap((c) => (c.files || []).map((f) => f.file)));
const sinEntrada = archivosPr ? [...archivosPr].filter((f) => !documentados.has(f) && !f.startsWith('.code-timeline/')) : [];
const lineas = ['<!-- code-timeline-summary -->', '## Code Timeline', ''];
for (const c of cambios.slice(-20)) {
  const confianza = c.verified ? 'confirmado por una persona' : 'explicado por el agente';
  lineas.push(`- **${c.title}**${c.commit ? ` (\`${c.commit}\`)` : ' _(sin commit sellado)_'} — ${c.explanation}`);
  lineas.push(`  - Procedencia: código ${c.provenance?.code === 'git' ? 'capturado de Git' : 'aportado'} · ${confianza}`);
  if (c.test && c.test.status !== 'untested') {
    lineas.push(`  - Prueba: ${c.test.status}${c.test.command ? ` — \`${c.test.command}\`` : ''}`);
  }
}
if (sinEntrada.length) lineas.push('', `> **Historial incompleto:** ${sinEntrada.join(', ')}`);
lineas.push('', `_${cambios.length} cambios documentados._`, '');
const salida = lineas.join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, salida);
if (process.env.CT_PR_BODY) writeFileSync(process.env.CT_PR_BODY, salida);
else process.stdout.write(salida);

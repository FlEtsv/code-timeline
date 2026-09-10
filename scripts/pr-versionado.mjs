#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(process.argv[2] || '.code-timeline/history.json');
if (!existsSync(path)) process.exit(0);
const data = JSON.parse(readFileSync(path, 'utf8'));
if (data.format !== 'code-timeline/versioned-v1') throw new Error('Formato de historial versionado desconocido.');
let commits = null;
if (process.env.GITHUB_BASE_REF) {
  try {
    commits = new Set(execFileSync('git', [
      'log', '--format=%h', `origin/${process.env.GITHUB_BASE_REF}..HEAD`,
    ], { encoding: 'utf8' }).trim().split('\n').filter(Boolean));
  } catch { /* sin base disponible: se enseña el historial completo */ }
}
const cambios = (data.changes || []).filter((c) =>
  (c.status || 'change') === 'change' && (!commits || (c.commit && commits.has(c.commit))),
);
const lineas = ['## Code Timeline', ''];
for (const c of cambios.slice(-20)) {
  lineas.push(`- **${c.title}**${c.commit ? ` (\`${c.commit}\`)` : ''} — ${c.explanation}`);
  if (c.test && c.test.status !== 'untested') {
    lineas.push(`  - Prueba: ${c.test.status}${c.test.command ? ` — \`${c.test.command}\`` : ''}`);
  }
}
lineas.push('', `_${cambios.length} cambios documentados._`, '');
const salida = lineas.join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, salida);
else process.stdout.write(salida);

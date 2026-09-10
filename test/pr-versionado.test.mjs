import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const SCRIPT = new URL('../scripts/pr-versionado.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('el resumen de PR lee v2 y muestra procedencia y falta de sello', () => {
  const root = mkdtempSync(join(tmpdir(), 'ct-pr-v2-'));
  mkdirSync(join(root, 'entries'));
  const id = 'entrada-1';
  writeFileSync(join(root, 'entries', `${id}.json`), JSON.stringify({
    format: 'code-timeline/entry-v2', change: {
      id, status: 'change', title: 'Cambio visible', explanation: 'Motivo real.',
      files: [{ file: 'src/a.js' }], verified: false, provenance: { code: 'git' }, test: { status: 'auto', command: 'npm test' },
    },
  }));
  writeFileSync(join(root, 'index.json'), JSON.stringify({
    format: 'code-timeline/versioned-v2', entries: [{ id, path: `entries/${id}.json` }],
  }));
  const out = execFileSync(process.execPath, [SCRIPT, join(root, 'index.json')], { encoding: 'utf8' });
  assert.match(out, /Cambio visible/);
  assert.match(out, /sin commit sellado/);
  assert.match(out, /capturado de Git/);
  rmSync(root, { recursive: true, force: true });
});

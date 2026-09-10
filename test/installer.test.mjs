import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instalar } from '../lib/installer.mjs';

test('el instalador rechaza agentes desconocidos antes de tocar configuración', () => {
  assert.throws(() => instalar({ agente: 'otro' }), /codex, claude o ambos/);
});

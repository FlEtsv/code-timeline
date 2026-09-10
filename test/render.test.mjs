import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTimelineHtml } from '../lib/render.mjs';

const proyecto = { id: 'demo', name: 'Demo', repoPath: '/x' };

function cambio(over = {}) {
  return {
    id: over.id || 'c1', status: 'change', date: '2024-03-01T10:00:00Z',
    title: over.title || 'Un cambio', explanation: 'Por qué',
    unit: { type: 'función', name: 'f()' }, files: [{ file: 'a.mjs', after: 'x' }],
    relation: { type: 'start', note: '' }, verified: false, test: { status: 'untested' },
    by: over.by || '', branch: over.branch || '', ...over,
  };
}

test('sin cockpit, el timeline se pinta igual que siempre (retrocompat)', () => {
  const html = renderTimelineHtml(proyecto, [cambio()], null, null, 'tok');
  assert.ok(html.includes('<!doctype html>'));
  assert.ok(!html.includes('class="branchstrip"'));
});

test('con ramas, aparece la franja con enlaces ?branch=', () => {
  const cockpit = {
    projectId: 'demo', principal: 'main', ramaActual: 'feat/x', branch: null,
    ramas: [
      { nombre: 'feat/x', remota: false, adelante: 3, atras: 0, fusionada: false, entradas: 2, sinRegistrar: 1 },
      { nombre: 'feat/y', remota: false, adelante: 1, atras: 2, fusionada: false, entradas: 0, sinRegistrar: 0 },
      { nombre: 'origin/feat/z', remota: true, fusionada: true, entradas: 1, sinRegistrar: null },
    ],
  };
  const html = renderTimelineHtml(proyecto, [cambio()], null, null, 'tok', cockpit);
  assert.ok(html.includes('class="branchstrip"'));
  assert.ok(html.includes('href="/p/demo?branch=feat%2Fx"'));
  assert.ok(html.includes('1 sin registrar'));
  assert.ok(html.includes('al día'));            // feat/y con 0 huecos
  assert.ok(html.includes('>fusionada<'));        // la remota fusionada
  assert.ok(!html.includes('class="filterbar"')); // sin filtro activo
});

test('con branch activo: filterbar y el historial se acota a esa rama', () => {
  const cockpit = {
    projectId: 'demo', principal: 'main', ramaActual: 'main', branch: 'feat/x',
    ramas: [{ nombre: 'feat/x', remota: false, adelante: 2, atras: 0, fusionada: false, entradas: 1, sinRegistrar: 0 }],
  };
  const enRama = cambio({ id: 'r1', title: 'En feat/x', branch: 'feat/x' });
  const enMain = cambio({ id: 'm1', title: 'En main', branch: 'main' });
  const html = renderTimelineHtml(proyecto, [enRama, enMain], null, null, 'tok', cockpit);
  assert.ok(html.includes('class="filterbar"'));
  assert.ok(html.includes('✕ ver todo'));
  assert.ok(html.includes('En feat/x'));
  assert.ok(!html.includes('En main'), 'el cambio de otra rama no debe salir');
});

test('by y branch se escapan (contenido de usuario)', () => {
  const c = cambio({ by: '<script>x</script>', branch: 'a"b' });
  const html = renderTimelineHtml(proyecto, [c], null, null, 'tok');
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

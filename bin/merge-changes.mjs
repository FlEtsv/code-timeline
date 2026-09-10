#!/usr/bin/env node
// Driver de merge de git para `changes.json` / `qa.json` de un timeline de
// equipo. Lo registra `code-timeline team init` en el .git/config del
// directorio de datos:
//
//   [merge "code-timeline"]
//     name = Code Timeline: unión por id
//     driver = node <ruta>/merge-changes.mjs %O %A %B %P
//
// %O base, %A nuestro (y destino), %B el de ellos, %P el nombre real.
//
// La regla: unión por `id`. Dos entradas con el mismo id se resuelven por
// `updatedAt` más reciente (y `date` si falta) — last-write-wins POR ENTRADA,
// determinista. Nunca hay conflicto real: sale con 0 siempre. Es la misma
// idea que `importProject({ mode: 'merge' })` en lib/store.mjs, aplicada a
// tres versiones en vez de dos.

import { readFileSync, writeFileSync } from 'node:fs';

const [, , , nuestro, deEllos, nombre = ''] = process.argv;
const clave = /qa\.json$/.test(nombre) ? 'runs' : 'changes';
const fechaClave = clave === 'runs' ? 'at' : 'date';

function leer(ruta) {
  try {
    const data = JSON.parse(readFileSync(ruta, 'utf8'));
    return Array.isArray(data && data[clave]) ? data[clave] : [];
  } catch {
    return [];
  }
}

function idDe(e) {
  return e && (e.id != null ? String(e.id) : JSON.stringify(e));
}

function masReciente(a, b) {
  const ta = Date.parse(a.updatedAt || a[fechaClave] || 0) || 0;
  const tb = Date.parse(b.updatedAt || b[fechaClave] || 0) || 0;
  return tb > ta ? b : a;
}

const porId = new Map();
for (const lista of [leer(nuestro), leer(deEllos)]) {
  for (const e of lista) {
    const k = idDe(e);
    porId.set(k, porId.has(k) ? masReciente(porId.get(k), e) : e);
  }
}

const unidas = [...porId.values()].sort((a, b) =>
  String(a[fechaClave] || '').localeCompare(String(b[fechaClave] || '')));

writeFileSync(nuestro, JSON.stringify({ [clave]: unidas }, null, 2) + '\n');
process.exit(0);

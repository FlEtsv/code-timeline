#!/usr/bin/env node
// ¿Cuánto encarece Code Timeline una sesión de Claude Code?
//
// El README da un número. Esto es lo que lo produce, para que no haya que
// creérselo: lee TUS transcripts de Claude Code, mide los tokens de salida de
// cada sesión y los que se fueron en llamadas a code-timeline, y saca el
// porcentaje. En tu máquina, con tus sesiones.
//
//   node scripts/medir-coste.mjs
//   node scripts/medir-coste.mjs --detalle     (una línea por sesión)
//
// Los transcripts viven en ~/.claude/projects/<proyecto>/<sesión>.jsonl y
// traen el `usage` real de cada respuesta: no se estima el gasto de la sesión,
// se lee. Lo único aproximado es el coste de cada llamada MCP, que se calcula
// como caracteres/4 sobre el JSON que se envió — sirve para el orden de
// magnitud, que es de lo que va esta medida.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const RAIZ = process.env.CLAUDE_PROJECTS || join(homedir(), '.claude', 'projects');
const PREFIJO = 'mcp__code-timeline__';
const detalle = process.argv.includes('--detalle');

const tok = (n) => n / 4;
const fmt = (n) => Math.round(n).toLocaleString('es-ES');

function transcripts(raiz) {
  const salida = [];
  let dirs;
  try { dirs = readdirSync(raiz, { withFileTypes: true }); } catch { return salida; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    try {
      for (const f of readdirSync(join(raiz, d.name))) {
        if (f.endsWith('.jsonl')) salida.push(join(raiz, d.name, f));
      }
    } catch { /* carpeta que desapareció a mitad */ }
  }
  return salida;
}

function medirSesion(ruta) {
  let salida = 0;
  let escritoCT = 0;      // lo que el modelo TECLEÓ en llamadas a code-timeline
  let codigoCT = 0;       // de eso, cuánto era código before/after
  let devueltoCT = 0;     // lo que las herramientas le devolvieron (entrada)
  const llamadas = new Map();
  const ids = new Map();

  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    if (!linea.trim()) continue;
    let d;
    try { d = JSON.parse(linea); } catch { continue; }
    const msg = d.message || {};

    if (msg.usage) salida += msg.usage.output_tokens || 0;
    if (!Array.isArray(msg.content)) continue;

    for (const b of msg.content) {
      if (!b || typeof b !== 'object') continue;

      if (b.type === 'tool_use' && String(b.name || '').startsWith(PREFIJO)) {
        const nombre = b.name.slice(PREFIJO.length);
        ids.set(b.id, nombre);
        llamadas.set(nombre, (llamadas.get(nombre) || 0) + 1);
        const inp = b.input || {};
        escritoCT += tok(JSON.stringify(inp).length);
        for (const f of inp.files || []) {
          if (f && typeof f === 'object') {
            codigoCT += tok(String(f.before || '').length + String(f.after || '').length);
          }
        }
      }

      if (b.type === 'tool_result' && ids.has(b.tool_use_id)) {
        const c = b.content;
        const txt = typeof c === 'string' ? c : (c ? JSON.stringify(c) : '');
        devueltoCT += tok(txt.length);
      }
    }
  }

  return { ruta, salida, escritoCT, codigoCT, devueltoCT, llamadas };
}

const sesiones = transcripts(RAIZ)
  .map(medirSesion)
  .filter((s) => s.salida > 0 && s.escritoCT > 0)
  .sort((a, b) => b.salida - a.salida);

if (!existsSync(RAIZ)) {
  console.error(`No encuentro los transcripts en ${RAIZ}.`);
  console.error('Si están en otro sitio: CLAUDE_PROJECTS=/ruta node scripts/medir-coste.mjs');
  process.exit(1);
}
if (!sesiones.length) {
  console.log(`Ninguna sesión de ${RAIZ} usó code-timeline todavía. Nada que medir.`);
  process.exit(0);
}

const O = sesiones.reduce((n, s) => n + s.salida, 0);
const E = sesiones.reduce((n, s) => n + s.escritoCT, 0);
const C = sesiones.reduce((n, s) => n + s.codigoCT, 0);
const D = sesiones.reduce((n, s) => n + s.devueltoCT, 0);
const entradas = sesiones.reduce((n, s) => n + (s.llamadas.get('add_change') || 0) + (s.llamadas.get('propose_change') || 0), 0);

console.log(`\nMedido sobre ${sesiones.length} sesiones de ${RAIZ}\n`);

if (detalle) {
  console.log('  sesión'.padEnd(12) + 'salida'.padStart(12) + 'timeline'.padStart(11) + 'sobrecoste'.padStart(12));
  console.log('  ' + '─'.repeat(43));
  for (const s of sesiones) {
    const id = s.ruta.split('/').pop().slice(0, 8);
    console.log('  ' + id.padEnd(12) + fmt(s.salida).padStart(12) + fmt(s.escritoCT).padStart(11)
      + `+${(100 * s.escritoCT / s.salida).toFixed(2)}%`.padStart(12));
  }
  console.log();
}

console.log('  Tokens de SALIDA (los caros)');
console.log(`    trabajo real de esas sesiones      ${fmt(O).padStart(12)}`);
console.log(`    lo que costó Code Timeline         ${fmt(E).padStart(12)}`);
console.log(`      de eso, código before/after      ${fmt(C).padStart(12)}  ${C ? '(hoy se captura de git: ya no se teclea)' : ''}`);
console.log();
console.log('  Sobrecoste');
console.log(`    sin Code Timeline                        100,00%`);
console.log(`    con Code Timeline                        ${(100 + 100 * E / O).toFixed(2).replace('.', ',')}%`);
if (C) {
  console.log(`    con la captura aplicada a todo           ${(100 + 100 * (E - C) / O).toFixed(2).replace('.', ',')}%`);
}
console.log();
console.log(`  ${entradas} entradas registradas · ${fmt(E / Math.max(entradas, 1))} tokens por entrada`);
console.log(`  entrada de contexto devuelta por las herramientas: ${fmt(D)} tok\n`);

// Lo que más se llamó, por si alguna herramienta se está usando de más.
const porNombre = new Map();
for (const s of sesiones) {
  for (const [n, v] of s.llamadas) porNombre.set(n, (porNombre.get(n) || 0) + v);
}
const top = [...porNombre].sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log('  llamadas: ' + top.map(([n, v]) => `${n} ${v}`).join(' · ') + '\n');

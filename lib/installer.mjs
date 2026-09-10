import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs');

function ejecutar(binario, args) {
  return execFileSync(binario, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function configurarCodex() {
  try { ejecutar('codex', ['mcp', 'get', 'code-timeline']); }
  catch { ejecutar('codex', ['mcp', 'add', 'code-timeline', '--', process.execPath, SERVER]); }

  const path = join(homedir(), '.codex', 'config.toml');
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const cabecera = '[mcp_servers.code-timeline]';
  const inicio = text.indexOf(cabecera);
  if (inicio === -1) throw new Error('Codex añadió el MCP pero no encuentro su bloque en config.toml.');
  const finRel = text.slice(inicio + cabecera.length).search(/\n\s*\[/);
  const fin = finRel === -1 ? text.length : inicio + cabecera.length + finRel;
  const bloque = text.slice(inicio, fin);
  if (!/default_tools_approval_mode\s*=/.test(bloque)) {
    text = text.slice(0, fin) + '\ndefault_tools_approval_mode = "writes"' + text.slice(fin);
    writeFileSync(path, text);
  }
  return 'Codex';
}

function configurarClaude() {
  try { ejecutar('claude', ['mcp', 'get', 'code-timeline']); }
  catch { ejecutar('claude', ['mcp', 'add', '--scope', 'user', 'code-timeline', '--', process.execPath, SERVER]); }
  return 'Claude Code';
}

export function instalar({ agente = 'ambos' } = {}) {
  if (!['codex', 'claude', 'ambos'].includes(agente)) throw new Error('--agente debe ser codex, claude o ambos.');
  const instalados = [];
  const errores = [];
  for (const [nombre, fn] of [
    ...(agente === 'claude' || agente === 'ambos' ? [['Claude Code', configurarClaude]] : []),
    ...(agente === 'codex' || agente === 'ambos' ? [['Codex', configurarCodex]] : []),
  ]) {
    try { instalados.push(fn()); } catch (err) { errores.push(`${nombre}: ${err.stderr || err.message}`.trim()); }
  }
  return { instalados, errores, server: SERVER };
}

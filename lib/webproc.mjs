import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, ensureDataDirExists } from './datadir.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// El pid del servidor va junto a los datos, no junto al código: si el usuario
// mueve su almacén, este fichero tiene que irse con él o el web_status se
// queda mirando un sitio donde ya no hay nada.
const PID_FILE = join(DATA_DIR, 'webserver.json');
const CLI_PATH = join(ROOT, 'bin', 'cli.mjs');

function readState() {
  if (!existsSync(PID_FILE)) return null;
  try { return JSON.parse(readFileSync(PID_FILE, 'utf8')); } catch { return null; }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function webStatus() {
  const state = readState();
  if (state && isAlive(state.pid)) return state;
  return null;
}

export function startWeb({ port = 4173 } = {}) {
  const running = webStatus();
  if (running) return { ...running, alreadyRunning: true };

  ensureDataDirExists();
  const child = spawn(process.execPath, [CLI_PATH, 'serve', '--port', String(port)], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const state = { pid: child.pid, port, url: `http://localhost:${port}`, startedAt: new Date().toISOString() };
  writeFileSync(PID_FILE, JSON.stringify(state, null, 2));
  return { ...state, alreadyRunning: false };
}

export function stopWeb() {
  const state = readState();
  if (!state) return { stopped: false, reason: 'No hay registro de un servidor arrancado.' };
  if (!isAlive(state.pid)) return { stopped: false, reason: 'Ya no estaba corriendo.' };
  try {
    process.kill(state.pid);
    return { stopped: true, port: state.port };
  } catch (e) {
    return { stopped: false, reason: String(e.message || e) };
  }
}

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { instalar } from './installer.mjs';
import { createProject, findProjectByRepo, updateProject, syncVersioned, readVersionedBundle, importProject } from './store.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cli.mjs');
const INICIO = '<!-- code-timeline:inicio -->';
const FIN = '<!-- code-timeline:fin -->';
const INSTRUCCIONES = `${INICIO}
## Code Timeline

Después de cada edición de código llama a \`add_change\` con la ruta del repositorio y los archivos tocados. Incluye el porqué y \`explicaLineas\` para lo que no sea obvio. Antes de terminar llama a \`estado\`; no des por completa la tarea si aparecen \`archivosSinEntrada\`.
${FIN}`;

function bloqueGestionado(path) {
  const anterior = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const re = new RegExp(`${INICIO}[\\s\\S]*?${FIN}`, 'm');
  const siguiente = re.test(anterior)
    ? anterior.replace(re, INSTRUCCIONES)
    : `${anterior.trimEnd()}${anterior.trim() ? '\n\n' : ''}${INSTRUCCIONES}\n`;
  if (siguiente !== anterior) writeFileSync(path, siguiente);
}

function hookClaude(repoPath) {
  const path = join(repoPath, '.claude', 'settings.local.json');
  mkdirSync(dirname(path), { recursive: true });
  let config = {};
  if (existsSync(path)) config = JSON.parse(readFileSync(path, 'utf8'));
  config.hooks ||= {};
  config.hooks.Stop ||= [];
  const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(CLI)} guard --repo ${JSON.stringify(repoPath)} --hook claude`;
  if (!JSON.stringify(config.hooks.Stop).includes('code-timeline') && !JSON.stringify(config.hooks.Stop).includes(' guard ')) {
    config.hooks.Stop.push({ hooks: [{ type: 'command', command }] });
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  }
  return path;
}

function hookGit(repoPath) {
  const path = join(repoPath, '.git', 'hooks', 'pre-commit');
  if (!existsSync(dirname(path))) return null;
  const inicio = '# code-timeline:inicio';
  const fin = '# code-timeline:fin';
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const bloque = `${inicio}\n${q(process.execPath)} ${q(CLI)} guard --repo ${q(repoPath)} || exit $?\n${fin}`;
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '#!/bin/sh\n';
  const re = /# code-timeline:inicio[\s\S]*?# code-timeline:fin/m;
  text = re.test(text) ? text.replace(re, bloque) : `${text.trimEnd()}\n\n${bloque}\n`;
  writeFileSync(path, text);
  chmodSync(path, 0o755);
  return path;
}

export function setup({ repoPath = process.cwd(), name, agente = 'ambos', versionado = false, instalarFn = instalar } = {}) {
  const repo = resolve(repoPath);
  const instalacion = instalarFn({ agente });
  let project = findProjectByRepo(repo);
  if (!project) {
    const bundle = readVersionedBundle(repo);
    project = createProject({ name: name || bundle?.project?.name || basename(repo), repoPath: repo, storageMode: 'private' });
    if (bundle) importProject(bundle, { mode: 'merge', targetId: project.id });
    if (versionado || bundle) project = updateProject(project.id, { storageMode: 'versioned' });
  }
  if (!project.storageMode) project = updateProject(project.id, { storageMode: 'private' });
  if (versionado && project.storageMode !== 'versioned') project = updateProject(project.id, { storageMode: 'versioned' });
  if (project.storageMode === 'versioned') syncVersioned(project.id);

  const archivos = [];
  if (agente === 'codex' || agente === 'ambos') { const p = join(repo, 'AGENTS.md'); bloqueGestionado(p); archivos.push(p); }
  if (agente === 'claude' || agente === 'ambos') {
    const p = join(repo, 'CLAUDE.md'); bloqueGestionado(p); archivos.push(p, hookClaude(repo));
  }
  const gitHook = hookGit(repo);
  if (gitHook) archivos.push(gitHook);
  return { ...instalacion, project, archivos };
}

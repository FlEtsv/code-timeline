#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const [owner, repo] = String(process.env.GITHUB_REPOSITORY || '').split('/');
const pr = process.env.GITHUB_PR_NUMBER;
const token = process.env.GH_TOKEN;
const body = readFileSync(process.env.CT_PR_BODY, 'utf8');
if (!owner || !repo || !pr || !token) throw new Error('Faltan GITHUB_REPOSITORY, GITHUB_PR_NUMBER, GH_TOKEN o CT_PR_BODY.');

const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'code-timeline',
  'Content-Type': 'application/json',
};
const base = `https://api.github.com/repos/${owner}/${repo}/issues/${pr}/comments`;
const listed = await fetch(`${base}?per_page=100`, { headers });
if (!listed.ok) throw new Error(`No se pudieron leer los comentarios del PR (${listed.status}).`);
const previous = (await listed.json()).find((c) => String(c.body || '').includes('<!-- code-timeline-summary -->'));
const url = previous ? `https://api.github.com/repos/${owner}/${repo}/issues/comments/${previous.id}` : base;
const response = await fetch(url, { method: previous ? 'PATCH' : 'POST', headers, body: JSON.stringify({ body }) });
if (!response.ok) throw new Error(`No se pudo publicar el resumen del PR (${response.status}).`);
process.stdout.write(`${previous ? 'Actualizado' : 'Creado'}: ${(await response.json()).html_url}\n`);

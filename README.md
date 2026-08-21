# Code Timeline

Historial de cambios de código verificable en orden: por cada cambio, el
método/clase/atributo que tocó, en qué archivo(s) — puede ser más de uno —,
el código de antes en rojo y el de después en verde, y por qué. Cada tarjeta
tiene un enlace a pantalla completa: archivo COMPLETO (con pestañas si son
varios), números de línea, la línea cambiada resaltada, navegación
anterior/siguiente, leído en vivo del repo. Cuando un cambio no tiene
relación con el anterior, se marca el salto y se explica.

No sustituye a `git log` — lo complementa. Un commit agrupa varios cambios de
una vez; aquí cada entrada es una unidad revisable de una sentada, en el
orden en que se hicieron, para que se puedan verificar una a una sin perder
el hilo.

Web propia, en tu máquina — no un Artifact de Claude: nada sale de tu equipo,
el repo se queda privado y no depende de que Claude publique nada cada vez.

## Piezas

- **`lib/store.mjs`** — persistencia. Cada proyecto vinculado vive en
  `data/projects/<id>/changes.json`. Sin base de datos: son ficheros JSON,
  legibles y versionables.
- **`lib/render.mjs`** — genera las páginas HTML (timeline por proyecto + el
  índice de proyectos).
- **`lib/httpserver.mjs`** — servidor HTTP nativo de Node (sin framework):
  sirve las páginas y una API mínima para guardar "revisado" y notas.
- **`server.mjs`** — servidor MCP (stdio). Expone las mismas operaciones como
  herramientas para que Claude las use directamente mientras trabaja:
  `list_projects`, `link_project`, `get_project`, `add_change`,
  `list_changes`, `render_timeline`, `start_web`, `stop_web`, `web_status`.
- **`bin/cli.mjs`** — CLI para ti: `serve`, `projects`, `link`, `changes`,
  `render`, `show`. Añadir cambios con su explicación es cosa de Claude
  mientras trabaja (necesita redactar el porqué, no solo copiar el diff).

## Instalar el CLI

```bash
cd /ruta/a/code-timeline
npm link          # deja "code-timeline" disponible en el PATH
code-timeline serve --port 4173
```

Abre `http://localhost:4173`.

## Instalar el MCP (global, todos los proyectos)

```bash
claude mcp add --scope user code-timeline -- node /ruta/a/code-timeline/server.mjs
```

Con esto, en cualquier sesión de Claude Code (de cualquier proyecto) Claude
puede vincular ese repo, registrar cada cambio con su antes/después y motivo,
y arrancarte el servidor cuando le pidas "la web" o "el timeline".

## Flujo típico

```
tú: "vincula este proyecto"
Claude: link_project(name, repoPath) → guarda el projectId

[Claude hace un cambio de código]
Claude: add_change(projectId, { files: [{ file, lineStart, before, after }, ...], unitName, explanation, ... })

tú: "dame la web" / "levanta el timeline"
Claude: code-timeline serve --port 4173 &   → te pasa http://localhost:4173
```

En la web marcas "revisado" y dejas notas por entrada — se guardan en el
propio `changes.json` vía la API del servidor (no en el navegador: sobreviven
a limpiar caché, cambiar de navegador, etc.).

## Datos

`data/projects.json` y `data/projects/*/changes.json` son la fuente de
verdad y se versionan en git — son el propio historial, y vale la pena tener
respaldo de qué se registró (incluidas tus notas y qué has revisado).
`timeline.html` (la exportación estática de `render_timeline`) se regenera
siempre desde ahí y está en `.gitignore`.

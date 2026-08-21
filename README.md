# Code Timeline

Historial de cambios de código verificable en orden: por cada cambio, el
método/clase/atributo que tocó, dónde está (archivo:línea), el código de
antes en rojo y el de después en verde, y por qué. Cuando un cambio no tiene
relación con el anterior, se marca el salto y se explica.

No sustituye a `git log` — lo complementa. Un commit agrupa varios cambios de
una vez; aquí cada entrada es una unidad revisable de una sentada, en el
orden en que se hicieron, para que se puedan verificar una a una sin perder
el hilo.

## Piezas

- **`lib/store.mjs`** — persistencia. Cada proyecto vinculado vive en
  `data/projects/<id>/changes.json`. Sin base de datos: son ficheros JSON,
  legibles y versionables.
- **`lib/render.mjs`** — genera el `timeline.html` de un proyecto a partir de
  sus cambios.
- **`server.mjs`** — servidor MCP (stdio). Expone las mismas operaciones como
  herramientas para que Claude las use directamente mientras trabaja:
  `list_projects`, `link_project`, `get_project`, `set_artifact_url`,
  `add_change`, `list_changes`, `render_timeline`.
- **`bin/cli.mjs`** — CLI para ti: `projects`, `link`, `changes`, `render`,
  `show`. Para *consultar* y *publicar*; añadir cambios con su explicación es
  cosa de Claude mientras trabaja (necesita redactar el porqué, no solo
  copiar el diff).

## Instalar el CLI

```bash
cd /ruta/a/code-timeline
npm link          # deja "code-timeline" disponible en el PATH
code-timeline projects
```

## Instalar el MCP (global, todos los proyectos)

```bash
claude mcp add --scope user code-timeline -- node /ruta/a/code-timeline/server.mjs
```

Con esto, en cualquier sesión de Claude Code (de cualquier proyecto) puedo:
1. Vincular ese repo (`link_project`) la primera vez.
2. Registrar cada cambio que haga (`add_change`) con su antes/después y motivo.
3. Regenerar el timeline (`render_timeline`) y publicarlo/redesplegarlo como
   Artifact — la URL queda guardada (`set_artifact_url`) para reutilizar el
   mismo enlace.

## Flujo típico dentro de una sesión

```
tú: "vincula este proyecto"
yo: link_project(name, repoPath) → guarda el projectId

[hago un cambio de código]
yo: add_change(projectId, { file, lineStart, unitName, before, after, explanation, ... })

[al final de la sesión, o cuando pidas ver el avance]
yo: render_timeline(projectId) → ruta del HTML
yo: Artifact(esa ruta, url: <artifactUrl guardada si existe>) → mismo enlace, actualizado
```

## Datos

`data/projects.json` y `data/projects/*/changes.json` son la fuente de
verdad y se versionan en git — son el propio historial, y vale la pena tener
respaldo de qué se registró. `timeline.html` se regenera siempre desde ahí
(está en `.gitignore`).

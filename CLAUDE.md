# CLAUDE.md — Code Timeline

Herramienta propia (no de un cliente): historial de cambios de código
verificable en orden. La usas TÚ, Claude, mientras trabajas en cualquier otro
proyecto suyo — este repo es infraestructura, no el trabajo en sí.

## Qué es y para qué

Por cada cambio de código que haces en una sesión: qué método/clase/atributo
tocaste, dónde (archivo:línea), el código de antes y el de después, y el
motivo. En orden, para que el usuario lo revise de arriba abajo sin perder el
hilo. Cuando un cambio no continúa el anterior (otro commit, otro problema),
se marca como "salto" y se explica por qué.

No sustituye a `git log` — lo complementa: un commit agrupa varias cosas de
una vez, aquí cada entrada es una unidad revisable de una sentada.

## Cómo se usa (tú, en cualquier sesión, de cualquier proyecto)

El MCP `code-timeline` está instalado en **scope user** — disponible siempre,
en cualquier proyecto, sin tener que abrir este repo. Herramientas:

- `link_project(name, repoPath)` — una vez por proyecto nuevo. Devuelve el
  `projectId` (slug). Antes de vincular, comprueba con `list_projects` si ya
  existe uno para ese repo.
- `add_change(projectId, {...})` — **después de cada cambio de código real**
  que hagas (no de exploración/lectura). Campos: `files` (array — **un cambio
  puede tocar varios archivos**; cada uno con `file`, `lineStart`/`lineEnd`,
  `before` (null si es código nuevo), `after`), `unitType`/`unitName`, `title`,
  `explanation` (el PORQUÉ, no una paráfrasis del diff), y `relationType`
  (`continuation` por defecto; `jump` + `relationNote` si no tiene que ver con
  el cambio anterior). **Deja el código de `before`/`after` completo, sin
  truncar con `// ...`** — es lo primero que se lee y tiene que bastar por sí
  solo; la vista de pantalla completa (abajo) es para ver el archivo entero
  alrededor, no un sustituto de un diff bien escrito.
- `render_timeline(projectId)` — regenera el HTML estático (para exportar o
  como respaldo legible en git). La vista viva es el servidor, no esto.
- `list_changes` / `get_project` — consulta.

**Cuándo registrar**: cada vez que edites código de verdad en un proyecto
vinculado, llama a `add_change` justo después del cambio, mientras el motivo
está fresco — no al final de la sesión intentando reconstruirlo.

**Cuándo NO registrar**: exploración, lectura, tests que no tocan código de
producto, cambios triviales sin decisión detrás (typos). Esto es un historial
de *decisiones de código*, no un log de cada tecla.

## Cuando te pidan "la web" / "dame el timeline" / "levanta el servidor"

Es un servidor local — **no** un Artifact de Claude (decisión explícita:
privacidad, y que no dependa de que tú lo publiques cada vez). Usa la
herramienta MCP `start_web` (no hace falta Bash ni recordar el puerto):
detecta si ya hay uno corriendo y lo reutiliza en vez de duplicarlo, y
devuelve la URL directamente. `stop_web` lo para; `web_status` comprueba si
sigue vivo. Si por lo que sea el MCP no está disponible, el equivalente
manual es `code-timeline serve --port 4173 &` (comando global, `npm link` ya
hecho; en máquina nueva: `node /ruta/a/CodeTimeline/bin/cli.mjs serve`).

La web permite marcar "revisado" y dejar notas por entrada — se guardan en
`data/projects/<id>/changes.json` vía la API del propio servidor
(`PATCH /api/projects/:id/changes/:changeId`), no en el navegador.

Cada tarjeta del timeline tiene un enlace **"Pantalla completa"** que lleva a
`/p/:id/c/:changeId` — decisión explícita del cliente (21-ago-2026): el
desplegable inline dentro de la tarjeta (`<details>` de ~340px) era "poco
práctico" para leer archivo + explicación + cambios relacionados a la vez.
La vista de pantalla completa es una página propia (`renderChangeDetailHtml`,
`lib/render.mjs`): cabecera con posición (`N / total`), navegación
anterior/siguiente (⇦/⇨ de teclado también) para pasar de cambio en cambio
sin volver al timeline, checkbox de revisado y nota arriba junto al motivo,
y debajo un panel de archivo a toda altura (con pestañas si el cambio toca
varios archivos). El primer archivo se renderiza en el propio HTML (carga
inmediata); el resto se piden bajo demanda al cambiar de pestaña
(`GET /api/projects/:id/changes/:changeId/files/:fileIndex`, mismo endpoint
que antes usaba el `<details>`). Muestra el archivo **completo**, con
números de línea y el rango cambiado resaltado, leído del **working tree
actual** del repo (`repoPath` del proyecto) — no del commit histórico —
porque `archivo:línea` en todo este sistema significa "así está HOY", igual
que en el resto de la documentación de los proyectos que audita. Si el
archivo ya no existe ahí (renombrado/borrado), cae a
`git show <commit>:<archivo>` como respaldo (`lib/repofile.mjs`).

## Arquitectura (para cuando haya que tocar el código de esta herramienta)

- `lib/store.mjs` — toda la persistencia. JSON plano, sin base de datos:
  `data/projects.json` (registro) + `data/projects/<id>/changes.json` (una
  lista por proyecto). Se versiona en git — es el propio historial.
- `lib/render.mjs` — genera HTML completo (ya no fragmentos para Artifact):
  `renderTimelineHtml(project, changes)`, `renderChangeDetailHtml(project,
  changes, index, firstFileHtml)` (la pantalla completa), `renderIndexHtml
  (projects)`, y `renderFileTable(content, lineStart, lineEnd)` (la tabla
  con números de línea, compartida por la pantalla completa y el endpoint
  de archivo).
- `lib/repofile.mjs` — `readFileAtCommit(repoPath, file, commit)`: lee el
  working tree actual, cae a `git show` solo si el archivo ya no existe ahí.
- `lib/httpserver.mjs` — servidor `http` nativo, sin framework. Rutas: `GET /`,
  `GET /p/:id`, `GET /p/:id/c/:changeId` (pantalla completa),
  `PATCH /api/projects/:id/changes/:changeId`,
  `GET /api/projects/:id/changes/:changeId/files/:fileIndex` (contenido de
  un archivo, usado por la pantalla completa al cambiar de pestaña).
- `server.mjs` — servidor MCP (stdio, `@modelcontextprotocol/sdk`), envuelve
  `store.mjs` + `render.mjs` como herramientas.
- `bin/cli.mjs` — CLI para el usuario: `serve`, `projects`, `link`, `changes`,
  `render`, `show`.

**Diseño visual** (por si regeneras algo a mano, `lib/render.mjs`): un "libro
de cambios" — Source Serif 4 para títulos/folios, Public Sans para cuerpo,
JetBrains Mono para código/metadatos/badges. Acento latón/bronce (`--accent`,
oklch, tono ~78), no el morado-IA por defecto. Rojo óxido / verde verdigris
SOLO en los paneles antes/después (desaturados, no el rojo/verde saturado de
GitHub). Ambos temas vía `prefers-color-scheme` + `[data-theme]`. Motivos
propios: folios de día con cabecera pegajosa, "saltos" entre cambios no
relacionados como un desgarro de página con etiqueta girada, entradas
revisadas atenuadas y con un sello "Revisado" — para escanear rápido qué
falta en un scroll largo. Explorado primero como canvas de diseño
(`/design`) antes de portarlo aquí — no rediseñar sin ese paso si se pide
"mejorar el diseño" otra vez; es una decisión ya tomada, no un borrador.

## Invariantes

- **`add_change` con `relationType: "jump"` exige `relationNote`** — el store
  lo rechaza si falta (`lib/store.mjs`). No lo rellenes con relleno genérico:
  tiene que decir qué distingue este cambio del anterior.
- **Las claves de `data/` no se reescriben a mano.** Si necesitas migrar el
  esquema de `changes.json`, hazlo con un script (como
  `scripts/seed-demo.mjs`), nunca editando el JSON directamente
  principio de siempre: los datos son la fuente de verdad,
  se tocan por código, no a ojo.
- `timeline.html` generado (`render_timeline` / `code-timeline render`) está
  en `.gitignore` — se regenera siempre desde `changes.json`, no se versiona.
- Repo privado en GitHub (`FlEtsv/code-timeline`) a propósito: los diffs
  contienen fragmentos de código real de proyectos de cliente.

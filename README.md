# Code Timeline

Un libro de cambios de tu código, en el orden en que se hicieron y con el
porqué de cada uno. Claude Code registra cada cambio mientras trabaja —
el método o la función que tocó, en qué archivos, el antes y el después, y la
razón— y tú lo revisas después uno a uno, marcando lo que ya has verificado.

También puede **proponer** cambios que no ha hecho: aparecen aparte, y tú los
aceptas o los descartas. Lo hecho y lo sugerido nunca se mezclan.

Todo corre en tu máquina: un servidor MCP para que Claude escriba, y una web
local en `localhost` para que tú leas. Nada se publica en ninguna parte. El
historial se exporta a JSON (respaldo y traslado), a Markdown y a PDF.

![Timeline de un proyecto](docs/img/timeline.png)

La página abre por **Pendiente**: lo que reclama algo tuyo — propuestas por
decidir, aceptadas por escribir, cambios por revisar y pruebas en rojo. El
libro completo vive en la pestaña **Historial**, y las propuestas descartadas
en la suya. Imprimir saca las tres, esté abierta la que esté: una pestaña es
un estado de pantalla, no del documento.

## Por qué, si ya existe `git log`

No lo sustituye, lo complementa. Un commit agrupa varios cambios de una
sentada y su mensaje cuenta el resultado, no el razonamiento. Aquí cada
entrada es **una unidad revisable**: se entiende y se verifica de una vez, sin
tener que reconstruir de qué iba.

Y hay una diferencia que en la práctica pesa más que ninguna: `git log` te dice
qué cambió, no **por qué** ni **qué se rompía antes**. Cuando el que escribe el
código es un agente, eso es justo lo que necesitas para poder revisarlo. Cada
entrada lleva la explicación que el agente redactó *mientras* hacía el cambio,
con el contexto todavía en la mano.

Cuando un cambio no tiene nada que ver con el anterior, se marca como **salto**
y hay que explicar por qué se cambió de tema. Al leer el historial seguido, eso
es lo que evita perder el hilo.

## Cómo se ve

### El índice de proyectos

Cuántos cambios lleva cada uno y cuántos has revisado ya.

![Índice de proyectos](docs/img/proyectos.png)

### La vista a pantalla completa

El archivo **entero** leído del disco en vivo, con las líneas del cambio
resaltadas, un árbol de los archivos del proyecto a la izquierda (con qué
cambio tocó cada uno y si está revisado) y navegación anterior/siguiente para
recorrer el historial sin volver atrás.

![Vista a pantalla completa](docs/img/pantalla-completa.png)

### Propuestas

Claude también puede sugerir sin tocar nada (`propose_change`). Una propuesta
va **arriba, fuera del hilo cronológico**, con borde discontinuo: es lo único
de la página que te pide una decisión. El historial de abajo es cosa hecha.

![Propuestas pendientes](docs/img/propuestas.png)

Aceptarla **no** la mete en el historial: la deja en *aceptada, pendiente de
aplicar*. El historial dice lo que está en el código, y al aceptar todavía no
lo está — nadie la ha escrito. Entra cuando quien la escribe lo confirma con
`mark_applied`, y entonces vuelve a "pendiente de revisar" como cualquier otro
cambio.

Descartarla la archiva con tu motivo, no la borra: saber qué se rechazó y por
qué es lo que evita volver a proponerlo dentro de tres semanas.

### Cómo se entera Claude de que aceptaste

**La web no puede avisarle** — es una página en tu `localhost`, no tiene por
dónde llamarle. Así que el traspaso es explícito por los dos lados:

- La tarjeta aceptada te da la orden ya escrita y un botón para copiarla:
  `aplica la propuesta "..."`. La pegas en Claude Code y listo.
- Claude puede verlo por su cuenta con `list_proposals` y `status: "accepted"`.
  El `CLAUDE.md` del repo le dice que lo mire al ponerse a trabajar, así que
  normalmente lo saca él solo sin que se lo pidas.

![Una propuesta aceptada, esperando a que alguien la escriba](docs/img/aceptadas.png)

Una propuesta tiene una trampa que la vista completa avisa explícitamente: el
archivo que se lee del disco es el **estado actual**, no el propuesto. Las
líneas resaltadas marcan dónde iría, y el código propuesto va al lado.

![Vista completa de una propuesta](docs/img/propuesta-completa.png)

### Cómo sabes que un cambio funciona

Revisar y probar no son lo mismo, y el historial los guarda por separado:
**revisado** es que lo has leído; **prueba** es que algo lo ha ejecutado. Un
cambio puede estar revisado y sin probar, y saber cuál de las dos falta es la
mitad de la pregunta al mirar un historial ajeno.

Cada entrada lleva su estado de prueba — *sin probar*, *prueba automática*
(con el comando que la repite), *probado a mano* (con cómo), o **falla**. Ese
último existe a propósito: un historial donde solo cabe lo que funciona miente
por omisión, y el contador de arriba se pone en rojo mientras haya alguno.

```bash
code-timeline test <projectId> <changeId> --status auto --command "npm test -- carrito"
```

Claude lo registra con `set_test` cuando escribe o ejecuta la prueba.

### Exportar

El botón **Imprimir / PDF** abre el diálogo del navegador sobre una versión
para papel: A4, tema claro, el código envuelto en vez de recortado, sin
botones y con los paneles apilados para que quepan.

![El timeline impreso en PDF](docs/img/pdf.png)

Además, **JSON** y **Markdown**, desde la web, el CLI o el MCP. El JSON es el
formato de respaldo y de traslado — `import_project` lo vuelve a montar en
otra máquina, y al fusionar compara por id, así que reimportar el mismo
fichero dos veces no duplica nada. Como `data/` no se versiona, esto es lo
único que hay entre tú y perder tus notas de revisión.

## Requisitos

- **Node.js 18 o superior.** Sin base de datos y sin dependencias en tiempo de
  ejecución para la web: el servidor HTTP es el `http` nativo de Node. La única
  dependencia real es el SDK de MCP, y solo la usa `server.mjs`.
- [Claude Code](https://claude.com/claude-code) si quieres que sea un agente
  quien registre los cambios (que es el caso de uso). La web funciona por su
  cuenta.

## Instalar

```bash
git clone https://github.com/FlEtsv/code-timeline.git
cd code-timeline
npm install
```

### Pruébalo con el proyecto de ejemplo

Antes de enchufarle nada tuyo, siembra la demo: vincula `examples/demo-repo`
(un módulo de carrito minúsculo que viene en el repo) y le registra cinco
cambios de ejemplo, con su antes/después, su explicación y un salto.

```bash
npm run demo     # siembra el proyecto "Demo Carrito"
npm start        # levanta la web
```

Abre <http://localhost:4173>. Todo lo que ves en las capturas de arriba sale de
ahí, así que puedes trastear con ello sin miedo: marca cosas como revisadas,
deja notas, abre la pantalla completa. Para volver a empezar, borra `data/`.

### Instalar el CLI en el PATH (opcional)

```bash
npm link
code-timeline serve --port 4173 --open
```

### Conectarlo a Claude Code

Registra el servidor MCP una sola vez, con `--scope user` para tenerlo
disponible desde cualquier proyecto:

```bash
claude mcp add --scope user code-timeline -- node "$(pwd)/server.mjs"
```

A partir de ahí, en cualquier sesión de Claude Code puedes decirle "vincula
este proyecto" y que vaya registrando lo que hace.

## El flujo, en la práctica

```
tú:      vincula este proyecto
Claude:  link_project(name, repoPath)  →  guarda el projectId

         [Claude cambia código]
Claude:  add_change(projectId, { files: [{ file, lineStart, before, after }],
                                 unitName, title, explanation })

         [Claude ve algo mejorable, pero fuera del encargo]
Claude:  propose_change(projectId, { ... })  →  queda pendiente de tu decisión

tú:      levanta el timeline
Claude:  code-timeline serve  →  http://localhost:4173
```

Y ya en la web: lees en orden, marcas "revisado" y dejas notas. Las notas y las
marcas se guardan en el `changes.json` del proyecto a través de la API del
servidor — no en el navegador, así que sobreviven a limpiar la caché o a
cambiar de equipo.

Añadir entradas es cosa del agente a propósito: el valor de cada una está en la
explicación, y esa hay que redactarla con el cambio fresco, no deducirla luego
de un diff.

## El CLI

```
code-timeline serve [--port N] [--open]   levanta la web (viva, con notas)
code-timeline projects                    lista los proyectos vinculados
code-timeline link --name N --path P      vincula un proyecto
code-timeline changes <projectId>         lista los cambios registrados
code-timeline proposals <projectId>       pendientes (--accepted: sin aplicar; --rejected: descartadas)
code-timeline decide <id> <changeId> accept|reject [--note "..."]
code-timeline applied <id> <changeId> [--commit sha]
code-timeline test <id> <changeId> [--status auto|manual|failing] [--command "..."] [--note "..."]
code-timeline export <projectId> [--format json|md] [--out ruta|-]
code-timeline import <fichero.json> [--merge <projectId>] [--repo <ruta>]
code-timeline render <projectId>          exporta un timeline.html estático
code-timeline show <projectId>            metadatos del proyecto (JSON)
```

## Las herramientas MCP

| Herramienta | Para qué |
| --- | --- |
| `list_projects` | Todos los proyectos vinculados, con sus contadores |
| `link_project` | Registra un repo. Una vez por proyecto |
| `get_project` | Metadatos de uno |
| `add_change` | Registra un cambio **ya aplicado**: archivos, antes/después, unidad y porqué |
| `propose_change` | Registra una **propuesta**: código que aún no ha tocado |
| `list_changes` | El historial, en orden cronológico |
| `list_proposals` | Las pendientes, o las descartadas con su motivo |
| `decide_proposal` | Acepta o descarta (solo si se lo pides tú) |
| `set_test` | Registra cómo se comprueba un cambio, o que su prueba falla |
| `mark_applied` | Confirma que una aceptada ya está escrita: pasa al historial |
| `export_project` | Escribe el historial a JSON o Markdown |
| `import_project` | Lee un JSON exportado: proyecto nuevo o fusión |
| `render_timeline` | Exporta el `timeline.html` estático |
| `start_web` / `stop_web` / `web_status` | Controla el servidor web |

La frontera entre `add_change` y `propose_change` es la que sostiene todo lo
demás, y por eso está escrita en la descripción de las dos herramientas: una es
para código que ya existe en el repo, la otra para código que no. Si se
confunden, la vista completa enseña un archivo que no se parece a lo que
cuenta la tarjeta.

`add_change` obliga a dos cosas: `title` y `explanation` nunca pueden ir
vacíos, y un cambio marcado como `jump` tiene que traer una `relationNote` que
diga qué lo separa del anterior. Son las dos únicas formas que tiene el store
de defenderse de un historial que no se puede leer.

## Dónde viven tus datos

En `data/`, y en ningún sitio más:

```
data/
  projects.json                    los proyectos vinculados
  projects/<id>/changes.json       cambios, propuestas, notas y qué has revisado
  projects/<id>/timeline.html      export estático (se regenera; no se versiona)
```

Cambios y propuestas comparten fichero y comparten id. Una entrada recorre sus
estados sin moverse de sitio, así que nunca pierde su antes/después ni la nota
que dejaste al revisarla:

```
proposal ──aceptar──> accepted ──mark_applied──> change
    └─────descartar─────> rejected
```

Son ficheros JSON planos, legibles y editables. **`data/` está en
`.gitignore`, y es a propósito**: cada entrada guarda fragmentos literales del
código del proyecto vinculado, así que tu historial no debe acabar dentro de
este repo ni de ningún otro que compartas. Si quieres respaldarlo, hazlo en un
repositorio privado tuyo.

## Pruebas

```bash
npm test
```

35 pruebas con el runner que trae Node (`node:test`), sin dependencias. Cubren
lo que puede romperse sin hacer ruido: el tokenizador del resaltado (lenguajes
desconocidos, cadenas y comentarios sin cerrar, escapado de HTML), la máquina
de estados de las propuestas con sus guardarraíles, y el ciclo de export e
import incluida la fusión sin duplicados.

Los tests apuntan `CODE_TIMELINE_DATA` a un directorio temporal, así que nunca
tocan tu historial. Esa variable también te sirve para guardar tus datos fuera
del repo:

```bash
CODE_TIMELINE_DATA=~/timelines code-timeline serve
```

## Cómo está montado

| Archivo | Qué hace |
| --- | --- |
| `lib/store.mjs` | Persistencia. Ficheros JSON, sin base de datos |
| `lib/render.mjs` | Genera el HTML: índice, timeline, vista completa y el CSS de impresión |
| `lib/highlight.mjs` | Resaltado de sintaxis, sin dependencias |
| `lib/markdown.mjs` | El export a Markdown |
| `lib/httpserver.mjs` | Servidor HTTP nativo + API de "revisado" y notas |
| `lib/repofile.mjs` | Lee el archivo del repo: el del disco, y si ya no está, el del commit |
| `server.mjs` | Servidor MCP (stdio) |
| `bin/cli.mjs` | El CLI |
| `examples/demo-repo/` | El proyecto de ejemplo de `npm run demo` |

El código va resaltado, en los paneles del diff y en el archivo completo. El
resaltador (`lib/highlight.mjs`) es un tokenizador de una pasada sin
dependencias, y tiene una regla que lo mantiene honesto: cuando no conoce el
lenguaje **no se inventa palabras clave** — sigue marcando cadenas, números y
comentarios, que son casi universales, y deja el resto en el color del texto.
Conoce JavaScript, TypeScript, Python, SQL, CSS y JSON.

La vista a pantalla completa lee siempre el **estado actual** del archivo en tu
disco, no una copia congelada: es lo que abrirías hoy en el editor. Solo si el
archivo ya no existe (renombrado o borrado) cae de vuelta al `git show` del
commit que se registró con el cambio.

## Licencia

**Apache 2.0 + [Commons Clause](https://commonsclause.com/)** — ver [LICENSE](LICENSE).

En corto: úsalo para lo que quieras, también en tu empresa y en tu trabajo
diario. Modifícalo, cópialo, publica tus cambios. Lo único que no puedes es
**venderlo**: cobrar por el software, o por un producto o servicio de pago cuyo
valor venga entera o sustancialmente de él (hosting o soporte incluidos).

Que quede claro para que nadie pierda el tiempo: la Commons Clause hace que
esto **no** sea open source según la definición de la OSI, porque restringe el
uso. El código está disponible y es modificable, pero si tu política interna
exige licencias aprobadas por la OSI, esta no lo es.

Si quieres vender algo basado en esto, escribe y lo hablamos.

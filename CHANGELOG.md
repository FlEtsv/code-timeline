# Historial de versiones

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado semántico.

## [1.0.0] — pendiente de publicar

Primera versión pública. Lo que hay hasta aquí no tiene versiones anteriores
publicadas: el repositorio era privado y esto es el corte con el que sale.

### El producto

- Servidor **MCP** (stdio) con 20 herramientas para que un agente registre
  cada cambio con su antes/después y su porqué, proponga lo que aún no ha
  escrito, y anote cómo se comprueba que funciona.
- **Web local** para leer el historial en orden, marcar revisado y dejar
  notas, con vista a pantalla completa por cambio (archivo entero leído del
  disco, árbol de archivos del proyecto y navegación anterior/siguiente).
- **CLI** para consultar, decidir, exportar (JSON y Markdown), importar y
  levantar la web.
- **Copiloto de git**: cruza el historial con el estado del repo y dice qué
  convendría hacer — commit (con el mensaje redactado desde el porqué
  registrado, no del diff), separar la tanda en varios commits cuando hay un
  salto de contexto entre entradas, abrir una rama, pruebas en rojo a punto de
  entrar en git, commits sin subir, entradas por sellar y deriva entre el
  historial y el código. Aconseja y da el comando; no ejecuta git. Se asoma
  por cuatro sitios: el panel de la web, la herramienta MCP `git_advice`, el
  hook `Stop` y `code-timeline consejo`.
- **Cuerpo de PR** desde las entradas de la rama (`pr_body`, `code-timeline
  pr`, enlace en la web): qué cambia, por qué y cómo se ha probado.
- **Sellado de commits** (`stamp_commits`, `code-timeline sellar`): apunta en
  cada entrada el commit que la recogió, enlazando el historial con git.
- Los textos de una entrada —explicación, notas, motivo de un salto o de un
  descarte— se **leen como Markdown** en la web, que es como venían escritos.
- **El código ya no lo escribe el agente**: `add_change` solo necesita la ruta
  del archivo y captura el antes/después de `git diff` (`lib/captura.mjs`).
  Medido sobre 129 entradas reales, el código era el 59% de lo que un agente
  tecleaba por MCP. Escribir una entrada baja de ~1.363 a ~409 tokens.
- **`list_changes` devuelve el historial sin código** y aparece `get_change`
  para leer una entrada entera. Mirar el historial de un proyecto grande baja
  de ~37.000 a ~2.100 tokens de contexto.
- **La web ejecuta, no solo aconseja**: botón para que Claude aplique una
  propuesta aceptada, para commitear con el mensaje redactado desde el
  historial, y para subir. Siempre desde un clic; nada se dispara solo. Lo
  único que se le manda a Claude es una propuesta aceptada — no hay texto
  libre.
- Las rutas que escriben piden un **token** de sesión y comprueban el `Origin`.
- Más recortes de coste, sin quitar nada: las respuestas van en **JSON
  compacto** (la indentación era un 12% de espacios), `add_change` **confirma
  en vez de repetir** la entrada entera (eran ~1.664 tokens de entrada por
  llamada), `list_projects` devuelve solo lo que sirve para elegir, el
  **lenguaje se deduce de la extensión**, y cualquier herramienta acepta la
  **ruta del repo** en lugar del id — `list_projects` se llamaba 17 veces solo
  para averiguarlo.
- **Sellar acierta por el contenido del archivo**, no solo por las rutas: se
  comprueba si el código de la entrada está en el archivo tal como quedó en ese
  commit. Resuelve el caso que las rutas no pueden —dos commits seguidos que
  tocan los mismos archivos— y permite corregir un sello ya puesto cuando el
  nuevo es demostrablemente mejor.
- El aviso de "esto son N commits" **comprueba si la separación es posible**:
  si los dos grupos comparten archivos, lo dice y manda a `git add -p` en vez
  de a repartir archivos.
- Arreglado: nombrar un proyecto por su **ruta** escribía en una carpeta
  inventada (`data/projects/Users/…`) devolviendo éxito. `projectDir` canoniza
  el id antes de construir la ruta.
- Corregidos seis fallos que encontró una revisión a fondo del código nuevo. El
  peor: el emparejamiento entrada→commit daba por bueno el commit **anterior**
  al cambio real —las líneas de contexto del `after` bastaban para pasar el
  umbral— y lo marcaba como seguro. Ahora se comprueba que el código encaje
  mejor en el commit que en su padre. Además: los binarios se pueden registrar,
  los renombrados conservan su «antes», el tope de tamaño se aplica también a
  un tramo único, y dos validaciones flojas (`Object.hasOwn` en las acciones, y
  el NUL del marcador de Markdown).
- El contenido de una propuesta viaja **vallado** en el prompt de la sesión que
  la aplica, con marca sorteada por llamada: es dato, no instrucción.
- **`scripts/medir-coste.mjs`** (`npm run coste`): mide sobre TUS transcripts de
  Claude Code cuánto encarece la herramienta una sesión, leyendo el `usage`
  real. El número del README se rehace con un comando en vez de creérselo.
- **`test/coste.test.mjs`**: pruebas que miden el coste en tokens y fallan si
  alguien encarece la herramienta. Incluye un informe reproducible con tres
  escenarios.
- Export a **PDF** desde el navegador, con hoja de estilo propia para papel.
- Registro de ejecuciones de **QA de un arnés externo**, aparte del historial.
- **74 pruebas** con el runner de Node, sin dependencias.

### Añadido antes del lanzamiento

- **`code-timeline doctor`** — un diagnóstico de una pantalla: en qué
  directorio están los datos y por cuál de las tres reglas, si la versión de
  Node cumple el mínimo, qué proyectos hay vinculados y si su repositorio
  sigue existiendo en el disco (la causa número uno de que la web no cargue
  los archivos), si quedan restos de una escritura a medias y cómo
  recuperarse, y si la web está corriendo. Sale con código 1 si encuentra
  algo, para poder llamarlo desde un script.

### Corregido antes del lanzamiento

- **Los datos ya no pueden perderse por una escritura a medias.** Cada fichero
  se escribe aparte y se renombra encima, con una copia `.bak` de la versión
  anterior. Antes, un corte a mitad de escritura dejaba un JSON truncado y,
  como `data/` no se versiona, no había de dónde recuperarlo.
- **Ni por dos procesos a la vez.** El servidor MCP y la web escriben los
  mismos ficheros: el ciclo entero de leer-modificar-escribir va ahora bajo un
  candado entre procesos. Antes, marcar un cambio como revisado podía borrar
  otro recién registrado por el agente.
- **Un JSON corrupto ya no tumba la aplicación** ni, peor, arranca con el
  historial vacío: se recupera de la copia y aparta el ilegible como
  `.corrupto`.
- **Instalado como paquete, ya no guarda los datos dentro de `node_modules`.**
  Ahí, un `npm update` se llevaba por delante el historial entero. Ahora:
  `CODE_TIMELINE_DATA` si está definida, `data/` si trabajas desde un clon del
  repo, y `~/.code-timeline` en cualquier otro caso.
- **La web escucha solo en `127.0.0.1`.** Antes escuchaba en todas las
  interfaces, así que en una wifi compartida cualquiera podía leer tu código y
  tus notas y escribir por la API. Exponerla es ahora una decisión explícita
  con `--host`, y avisa al arrancar.
- **`--open` abre el navegador en Windows y Linux**, no solo en macOS, y un
  fallo al abrirlo no tumba el servidor.
- `lib/webproc.mjs` respeta `CODE_TIMELINE_DATA` como el resto.
- El README documentaba mal el CLI: faltaba el comando `qa` entero y varias
  opciones, y decía un número de pruebas que no era el real.

### Infraestructura

- Integración continua en GitHub Actions: pruebas en Ubuntu y Windows sobre
  Node 18, 20 y 22.

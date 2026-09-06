# Historial de versiones

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado semántico.

## [1.0.0] — pendiente de publicar

Primera versión pública. Lo que hay hasta aquí no tiene versiones anteriores
publicadas: el repositorio era privado y esto es el corte con el que sale.

### El producto

- Servidor **MCP** (stdio) con 16 herramientas para que un agente registre
  cada cambio con su antes/después y su porqué, proponga lo que aún no ha
  escrito, y anote cómo se comprueba que funciona.
- **Web local** para leer el historial en orden, marcar revisado y dejar
  notas, con vista a pantalla completa por cambio (archivo entero leído del
  disco, árbol de archivos del proyecto y navegación anterior/siguiente).
- **CLI** para consultar, decidir, exportar (JSON y Markdown), importar y
  levantar la web.
- Export a **PDF** desde el navegador, con hoja de estilo propia para papel.
- Registro de ejecuciones de **QA de un arnés externo**, aparte del historial.
- **70 pruebas** con el runner de Node, sin dependencias.

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

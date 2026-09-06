# Seguridad

## Qué protege esta herramienta y qué no

Code Timeline guarda fragmentos literales del código de tus proyectos y tus
notas de revisión. Conviene saber exactamente dónde acaban y quién puede
leerlos.

**Todo se queda en tu máquina.** No hay servidor remoto, ni telemetría, ni
cuenta que crear. El historial vive en un directorio de tu disco
(`CODE_TIMELINE_DATA`, el `data/` del repo, o `~/.code-timeline`, en ese
orden) y sale de ahí únicamente cuando tú exportas.

**La web escucha solo en `127.0.0.1`.** Desde otro equipo de tu red no se ve.

**`--host` quita esa protección, y lo hace a sabiendas.** Si arrancas
`code-timeline serve --host 0.0.0.0`, el servidor avisa por consola de lo que
implica: **no hay autenticación de ninguna clase**. Cualquiera que alcance ese
puerto puede leer el código y las notas, marcar cambios como revisados y
aceptar o descartar propuestas. Úsalo solo en una red en la que confíes, y no
lo dejes puesto.

**La página muestra archivos del disco.** La vista a pantalla completa lee el
archivo real del repositorio vinculado, en su estado actual. Si expones el
servidor, expones esos archivos.

**El historial no se versiona.** `data/` está en `.gitignore` a propósito: el
código de tus proyectos no debe acabar dentro de este repositorio ni de
ninguno que compartas. Si haces copia de seguridad con `export`, ese JSON
lleva el mismo código dentro — guárdalo donde guardarías el repositorio.

## Reportar un fallo de seguridad

Abre un aviso privado en
[GitHub Security Advisories](https://github.com/FlEtsv/code-timeline/security/advisories/new),
o un issue si el fallo ya es público. Cuenta qué versión de Node usas, cómo
reproducirlo y qué consigues explotándolo.

No hace falta que esperes respuesta para arreglarlo tú y mandar un PR.

## Versiones con soporte

La última publicada. El proyecto es joven y no mantiene ramas anteriores.

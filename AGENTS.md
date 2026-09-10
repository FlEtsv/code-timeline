# Code Timeline en Codex

Este repositorio usa el MCP `code-timeline` como historial explicativo del
código. No sustituye a Git: guarda el antes/después y, sobre todo, el motivo de
cada cambio mientras todavía está fresco.

## Al empezar

- Llama a `estado` con la ruta absoluta del repositorio. Si aún no está
  vinculado, usa `link_project` una sola vez.
- Usa la ruta del repo como `projectId`; el servidor la resuelve sin necesitar
  una llamada previa a `list_projects`.

## Mientras trabajas

- Después de cada cambio de código aplicado, llama a `add_change`. Registra
  también cambios pequeños; el motivo puede ser simplemente que lo pidió el
  usuario.
- En `files` basta normalmente con `{ "file": "ruta/relativa" }`. No copies
  `before` ni `after`: el servidor los captura exactamente desde Git. Añade
  `lineStart` y `lineEnd` solo para separar cambios distintos del mismo archivo.
- Escribe en `explanation` el porqué real, no una paráfrasis del diff. Usa
  `explicaLineas` solo cuando haya líneas que no se entiendan por sí solas.
- Si el cambio no continúa el anterior, usa `relationType: "jump"` y explica
  el salto en `relationNote`.
- Si detectas una mejora fuera del encargo, no la implementes: regístrala con
  `propose_change`. Solo se aplica después de que el usuario la acepte.
- Cuando ejecutes una prueba relevante, registra el resultado con `set_test`.

## Al terminar una tanda

- Llama otra vez a `estado`. Atiende propuestas aceptadas, pruebas en rojo y
  consejos de Git antes de dar el trabajo por terminado.
- No hagas commit ni push salvo que el usuario lo pida o lo confirme mediante
  los controles explícitos de la web.

Para buscar un antecedente concreto usa `buscar`; para leer su código completo,
usa después `get_change`. Evita cargar todo el historial cuando no haga falta.

# Contribuir

Se aceptan issues y pull requests. Antes de escribir código, dos cosas que
conviene saber.

## La licencia no es open source

Apache 2.0 + [Commons Clause](https://commonsclause.com/): puedes usarlo,
modificarlo y publicar tus cambios, pero no **venderlo** — ver
[LICENSE](LICENSE). Al mandar un PR aceptas que tu aportación se distribuya
bajo esos mismos términos. Si tu empresa exige licencias aprobadas por la OSI,
esta no lo es y es mejor saberlo antes de invertir una tarde.

## Cómo trabajar

```bash
npm install
npm test          # 74 pruebas, runner de node:test, sin dependencias
npm run demo      # siembra el proyecto de ejemplo
npm start         # levanta la web en localhost:4173
```

No hay build, ni linter, ni framework. Node 18 o superior y nada más; la única
dependencia en tiempo de ejecución es el SDK de MCP, y solo la usa
`server.mjs`. **Si tu cambio necesita una dependencia nueva, explica en el PR
por qué no se puede hacer sin ella** — es una decisión de diseño, no un
descuido.

`npm test` tiene que pasar entero antes de abrir el PR. La CI lo repite en
Ubuntu y Windows sobre Node 18, 20 y 22.

## Qué mirar antes de proponer un cambio grande

[`CLAUDE.md`](CLAUDE.md) recoge las decisiones ya tomadas y por qué, incluidas
las que se probaron y se descartaron. Dos de las que más gente propone
rehacer, y que no se van a cambiar:

- **El diseño de la web.** Se exploró como canvas antes de portarlo. No es un
  borrador esperando un rediseño.
- **La frontera entre `add_change` y `propose_change`.** Una es para código
  que ya está escrito, la otra para el que no. Sostiene el resto de la
  interfaz.

## Estilo

Mira el código de al lado y escribe como él. En concreto:

- Todo en español: nombres de comandos, mensajes, comentarios y commits.
- Los comentarios explican **por qué**, no qué hace la línea de abajo.
- El almacén es síncrono a propósito (`readFileSync`/`writeFileSync`). No lo
  conviertas a async sin discutirlo antes: cambiaría la firma de todas las
  funciones exportadas.
- Si tocas `lib/store.mjs`, `lib/datadir.mjs`, `lib/highlight.mjs`,
  `lib/markdown.mjs` o `lib/httpserver.mjs`, añade pruebas. Son los sitios
  donde un fallo no hace ruido: se lleva datos por delante en silencio.

## Commits

Mensaje en imperativo, una línea, en español, diciendo qué consigue el cambio
y no qué ficheros toca. Si el cambio necesita explicación, va en el cuerpo.

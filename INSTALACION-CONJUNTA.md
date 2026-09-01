# Instalar Code Timeline y qabot juntos

Guía de la instalación conjunta. Si solo quieres uno de los dos, cada
repositorio tiene la suya y no necesitas esta:
[Code Timeline](README.md#instalar) · [qabot](https://github.com/FlEtsv/qabot#instalación).

## Qué consigues

Dos herramientas que se reparten una pregunta cada una:

| | Responde a | Cómo |
|---|---|---|
| **Code Timeline** | Qué cambió y **por qué** | historial revisable, con antes/después y el motivo |
| **qabot** | Si **funciona** y dónde está | pruebas, despliegue y deriva contra lo desplegado |

Juntas cierran un ciclo:

```
        decides algo
             │
             ▼
   Code Timeline  ── registra el cambio con su porqué
             │
             ▼
        qabot     ── lo prueba y lo despliega
             │
             ▼
   Code Timeline  ── recibe el veredicto del ciclo
```

Quien mueve las piezas es tu agente (Claude Code, Codex o cualquiera que hable
MCP). Sin agente las dos siguen funcionando por línea de comandos, pero el
ciclo lo cierras tú a mano.

## Antes de empezar

- **Node.js 18 o superior** — `node -v`
- **bash** y **python3** (los trae macOS y cualquier Linux) — solo para qabot
- Un agente con MCP. Los ejemplos usan Claude Code; al final está el formato
  genérico para otros.

qabot añade requisitos **solo si usas sus tipos especializados**: `clasp` para
Apps Script, `gcloud` para Cloud Run. Para cualquier otro proyecto no hace
falta ninguno.

## 1. Clonar los dos

```bash
mkdir -p ~/herramientas && cd ~/herramientas
git clone https://github.com/FlEtsv/code-timeline.git
git clone https://github.com/FlEtsv/qabot.git
```

Elige la carpeta que quieras; lo único importante es que **no las muevas
después**, porque las rutas quedan escritas en la configuración del agente.

## 2. Code Timeline

```bash
cd ~/herramientas/code-timeline
npm install
npm test          # 49 pruebas — si fallan, no sigas
npm link          # deja "code-timeline" en el PATH
```

El `npm link` no es opcional aquí aunque en la instalación suelta lo sea:
**es así como qabot encuentra a Code Timeline**. Sin él, los ciclos de qabot
no se registran (y no falla nada, simplemente no se enteran el uno del otro).

Compruébalo:

```bash
code-timeline projects
```

## 3. qabot

```bash
cd ~/herramientas/qabot
ln -sf "$PWD/bin/qabot" ~/.local/bin/qabot
qabot ayuda
```

Si `qabot: command not found`, es que `~/.local/bin` no está en tu PATH.
Añádelo a tu `~/.zshrc` o `~/.bashrc`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

qabot no tiene dependencias de npm: no hay `npm install` que hacer.

## 4. Registrar los dos servidores MCP

Son **dos servidores independientes**, no uno que englobe al otro:

```bash
claude mcp add --scope user code-timeline -- node ~/herramientas/code-timeline/server.mjs
claude mcp add --scope user qabot         -- node ~/herramientas/qabot/mcp/servidor.mjs
```

`--scope user` los deja disponibles en cualquier proyecto. Si prefieres
tenerlos solo en uno, quita esa opción y ejecútalo dentro de ese repositorio.

**Reinicia el agente.** Los servidores MCP se levantan al abrir sesión: hasta
que no reinicies, las herramientas no aparecen.

## 5. Comprobar que están

Ya dentro del agente, pídele que liste los proyectos vinculados y el estado de
QA del repositorio en el que estés. Deberías ver herramientas de las dos
familias:

- de Code Timeline: `list_projects`, `add_change`, `propose_change`,
  `set_test`, `start_web`…
- de qabot: `qabot_detectar`, `qabot_local`, `qabot_ciclo`, `qabot_doctor`…

Si falta una familia entera, casi siempre es que no reiniciaste.

## 6. El primer proyecto

Dentro del repositorio con el que trabajes:

```bash
cd /mi/proyecto

# Code Timeline: vincular (una vez)
code-timeline link --name "Mi Proyecto" --path "$PWD"

# qabot: detectar qué es y qué sabe hacer
qabot detectar
qabot detectar --escribir
qabot doctor
```

`qabot detectar` mira el repositorio y propone comandos deducidos de ficheros
reales. Lo que no puede deducir **lo pregunta**: si trabajas con un agente,
él te trasladará esas preguntas y escribirá la configuración por ti con
`qabot_configurar`.

A partir de aquí:

```bash
qabot ciclo staging      # prueba, despliega, pasa la batería
code-timeline qa --listar  # el veredicto quedó registrado
code-timeline serve        # la web, en localhost:4173
```

## Cómo comprobar que se hablan

La única conexión entre los dos es esta:

```bash
cd /mi/proyecto
code-timeline qa --resultado verde --comando "prueba de la instalación"
code-timeline qa --listar
```

Si la segunda orden lista la línea que acabas de crear, qabot podrá registrar
sus ciclos. Si no lista nada, el repositorio no está vinculado en Code
Timeline — vuelve al `code-timeline link` del paso 6.

Bórrala después, que era solo una prueba: está en
`code-timeline/data/projects/<id>/qa.json`.

## Si algo no va

| Síntoma | Causa casi segura |
|---|---|
| Las herramientas MCP no aparecen | No reiniciaste el agente después del `claude mcp add` |
| `qabot: command not found` | `~/.local/bin` no está en el PATH |
| Los ciclos de qabot no se registran | Falta el `npm link`, o el repositorio no está vinculado |
| `qabot detectar` no reconoce nada | Normal en proyectos sin manifiesto. Contesta sus preguntas y ya |
| La web no carga los archivos | La ruta del proyecto vinculado ya no existe — se movió el repositorio |

Cuando algo falle sin motivo claro, `qabot doctor` dice qué falta y cómo
conseguirlo.

## Otros agentes

El formato MCP es estándar. Para Codex o cualquier otro cliente, la entrada
equivalente en su configuración:

```json
{
  "mcpServers": {
    "code-timeline": {
      "command": "node",
      "args": ["/ruta/absoluta/a/code-timeline/server.mjs"]
    },
    "qabot": {
      "command": "node",
      "args": ["/ruta/absoluta/a/qabot/mcp/servidor.mjs"]
    }
  }
}
```

Ninguno de los dos servidores usa nada específico de un cliente. Cuando qabot
no puede deducir algo, devuelve las dudas como **datos** en la respuesta
(una lista `preguntas`), no como una capacidad del agente — por eso funciona
igual en cualquiera.

## Desinstalar uno sin tocar el otro

Están hechos para no necesitarse:

```bash
# quitar qabot y dejar Code Timeline
claude mcp remove qabot
rm ~/.local/bin/qabot
```

```bash
# quitar Code Timeline y dejar qabot
claude mcp remove code-timeline
npm unlink -g code-timeline
```

Al quitar Code Timeline, qabot deja de registrar ciclos y **no cambia nada
más**: comprueba si el comando existe antes de llamarlo. Al quitar qabot, Code
Timeline ni se entera de que existía.

## Dónde quedan tus datos

Todo en tu máquina, y nada se publica:

| | Dónde | Se versiona |
|---|---|---|
| Historial y notas | `code-timeline/data/` | **no** — `.gitignore` |
| Registro de QA | `code-timeline/data/projects/<id>/qa.json` | **no** |
| Config de qabot | `.qabot.json` de cada proyecto | **no** — lleva tokens |

Como `data/` no se versiona, tu único respaldo del historial es el export:

```bash
code-timeline export <projectId> --format json --out ~/respaldo.json
```

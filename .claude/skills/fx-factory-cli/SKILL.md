---
name: fx-factory-cli
description: Consumer-facing reference for the @timekast/factory CLI inside a derived project: new/add/update/status/doctor, the beta channel, `ticket push`, `factory provision`, the full-vs-core profile, the dual-version model and lockfile, the vault-backed rail, and troubleshooting. Key fact: `update` refreshes ONLY the brain (`.claude/` + tracked scripts) and NEVER touches `src/`. Invoke when a derivative runs or debugs a factory command. How the Factory builds or publishes the CLI → fx-distribution.
family: factory-internal
runtime: true
last-verified: 2026-09-25
user-invocable: false
---

# fx-factory-cli — Operar el CLI `@timekast/factory` en un derivado (consumer-facing)

> **Audiencia:** dev **y agente** de un proyecto **derivado** del Factory. Este skill viaja a tu proyecto (glob `fx-*`); te da el API-reference completo del CLI publicado sin que necesites acceso al repo Factory.
>
> **Lado opuesto (no es este skill):** cómo el Factory _construye y publica_ el CLI y los tarballs (perfiles, build de distribución, release por OIDC) vive en `fx-distribution`, que es origin-only y **no viaja** a tu derivado. Este skill es el lado **consumidor**.
>
> **Qué es el CLI:** `@timekast/factory` es un binario público y delgado que baja el "cerebro" del Factory (`.claude/` + scripts) a tu repo. Se autentica con `gh`; si no eres miembro del org TimeKast, el repo fuente es invisible (404).

---

## Quick-start — los 3 comandos del 90%

```bash
# 1. Proyecto nuevo (carpeta limpia, fuera de cualquier repo)
npx @timekast/factory new MiApp
#    → interactivo: 1) App completa (Next.js + cerebro)  2) Solo el cerebro
#    → crea la carpeta, crea el repo TimeKast/MiApp, instala, hace git init propio

# 2. Meter el cerebro a un repo que YA existe
cd mi-repo && npx @timekast/factory add
#    → auto-detecta el perfil (full/core); --full / --core lo fuerzan. Nunca toca tu src/

# 3. Actualizar el cerebro de un repo ya configurado
#    refresca SOLO .claude/ + scripts/tools — tu src/ (código de tu app) NO se toca, queda frozen
npx @timekast/factory update     # funciona en CUALQUIER repo (Python, Flutter, Go, Node…)
pnpm factory:update              # atajo equivalente — SOLO en repos Node con package.json
```

> `factory` sin argumentos abre un **menú interactivo** (TUI); en no-TTY (CI / agente headless) imprime la ayuda y no se cuelga.

> Detalle y matices de cada comando: `.claude/docs/distribution.md` (viaja contigo). Este skill **cita** esa fuente; no la reescribe.

---

## API-reference

| Comando             | Qué hace                                                                                  | Flags principales                                                            |
| ------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `new <Name>`        | Crea repo `TimeKast/<Name>` + instala (`full`/`core`) + `git init`                        | `--full` · `--core` (sin prompt — headless/GUI); sin flag → prompt          |
| `add`               | Mete el cerebro en un repo existente (si ya hay `.claude/`, redirige a `update`)          | `--full` · `--core`                                                          |
| `update`            | Refresca `.claude/` + scripts (lo que el lockfile registró). **Nunca toca `src/`**        | `--full` · `--core` · `--beta` · `--stable` · `--theirs-all` · `--mine-all` · `--verify` · `--resume` · `--commit` · `--no-commit` |
| `status`            | Versión instalada vs última (lee el lockfile); banner BETA si estás en el canal           | —                                                                           |
| `doctor`            | Reporta drift, archivos huérfanos, conflictos pendientes, rules sin `@import`, aviso A1, un archivo con tokens del rail en tu máquina | —                                                                           |
| `ticket push <archivo>` | Entrega un factory-ticket de `project/factory/` al repo del Factory como issue de GitHub y borra el borrador local. **Credencial: ninguna nueva** — tu sesión de `gh` | `--dry-run` · `--yes`/`-y` · `--assignee <login>` · `--label <etiqueta>` |
| `vault adopt`       | Pasa a la bóveda un repo que nació antes de ella; sin `--apply` sólo enseña el plan. `--decline` registra que no entra | `--apply` · `--json` · `--team=<id>` · `--vercel-project <id>` · `--decline` (ver _`factory vault`_) |
| `vault sync railway` | Crea el sync de un entorno de la bóveda a un servicio de Railway                          | `--project` · `--service` · `--env` · `--railway-env` (ver _`factory vault`_) |
| `vault deploys`     | Repo que se despliega una vez por cliente: siembra el proyecto de la bóveda de cada despliegue desde la plantilla y crea sus syncs; sin `--apply` sólo enseña el plan | `--deploy <slug>` · `--apply` · `--yes` (ver _`factory vault`_) |
| `prune <sub>`       | Comparte el repo con colaboradores externos sin la metodología (lo orquesta `/prune`; los PRs se integran con `/integrate`). Con tu sesión de `gh` | `prepare` · `cutover` · `invite <usuario>` · `finish` · `audit` · `check-pr <n>` (ver _`factory prune`_) |
| `beta`              | Atajo de `update --beta` — entra al canal beta                                            | (= `update --beta`)                                                          |
| `publish`/`unpublish` | Ops del derivado (publicar propuestas/mockups) — **no** es distribución del cerebro     | → ver sección _publish/unpublish_                                            |

**Flags clave:**

- `--full` / `--core` — fuerzan el perfil en `add`. En `update`, `--full` hace **cross-grade aditivo** `core → full`.
- `--theirs-all` / `--mine-all` — resuelven los conflictos de `update` sin prompt (todo del Factory / todo lo tuyo).
- `--beta` / `--stable` — entran/salen del canal beta (mutuamente excluyentes; ver _Canal beta_).
- `--verify` — reporta el drift disco↔lockfile **sin modificar nada** ni descargar (distinto de `doctor`: solo el delta de los archivos que el lockfile rastrea).
- `--resume` — retoma un `update` interrumpido desde el estado staged, **sin re-descargar**.
- `--commit` / `--no-commit` — fuerzan o inhiben el commit del cerebro tras un `update` limpio (override del prompt/default headless).
- `--yes` — auto-confirma el prompt de registro legacy. **Diseñado para la GUI** (el launcher de escritorio); en terminal el prompt aparece igual sin él, así que rara vez lo necesitas a mano.

---

## Perfil: `full` vs `core` (árbol de decisión)

| Perfil | Contenido                                                                                  | Cuándo                                                                            |
| ------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `full` | Todo `.claude/` (incluye los `sk-*` + `SK.md`) + scripts. El boilerplate `src/` **solo** en `new` | Derivado **Next del kit** — ya tiene `src/`; los `sk-*` anclan en su `src/` (auth, ORM, inventario) |
| `core` | `.claude/` sin `sk-*`/`SK.md` + skills portables (`tk-*`/`kb-*`/`fx-*`) + scripts          | Repo de **otro stack** (Python, Flutter, Go) sin `src/` Next                       |

- `add` y el `update`-legacy **auto-detectan**: `factoryVersion` en `package.json` → `full`; ausente o sin `package.json` → `core`. `--full`/`--core` overridean.
- El perfil se graba en `.timekast/lockfile.json` y es **pegajoso**: `update` lo respeta.
- **Cross-grade `update --full`** sube `core → full` (aditivo: agrega `sk-*` + `SK.md`). El **downgrade `full → core` está rechazado** (borraría archivos).

---

## Versión dual + lockfile + boundary `src/`

Dos campos en tu `package.json` (si es repo Node) codifican el drift "de qué nací" vs "qué cerebro tengo hoy":

| Campo             | Qué es                                          | Evolución                                                  |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| `factoryVersion`  | Sello de nacimiento de `src/`                   | **Estático** (no hay update de `src/`)                     |
| `agentKitVersion` | Versión del cerebro instalado                   | **Sube** con cada `update`, espejando `lockfile.version`   |

El **`.timekast/lockfile.json`** (no el `package.json`) es el SSOT de qué archivos puso el Factory y con qué hash; se **commitea** (para que `status`/`doctor` funcionen en cualquier clon). `update` baja el tarball, lee su manifest embebido y resuelve **4 cubetas**: agrega · sobrescribe-silencioso · borra-silencioso · conserva-editado-local. Un **conflicto** (lo editaste local **y** cambió el Factory) abre prompt **sin default**; `--theirs-all`/`--mine-all` lo zanjan sin preguntar.

**Qué te dice el `update` al terminar.** El resumen de cierre no es solo un conteo: nombra las rutas donde **tenías cambios locales y quedaron sobrescritos** (los conflictos que resolviste como "tomar el del Factory", incluidos los de `--theirs-all` y las corridas headless). Un archivo que no tocaste **no** aparece ahí — la lista es corta a propósito, para que un `git diff` sobre esas rutas te muestre lo que había antes de que commitees el update. La recuperación sigue siendo de git; el update solo te dice dónde mirar. En el prompt de conflicto, **`[3] Ver diff` muestra un diff** (líneas `-` tuyas, `+` del Factory, con contexto y `…` donde no hubo cambios), no los dos archivos completos volcados.

**El update también dice qué tocó de tu `package.json` — en los dos sentidos.** Es el único archivo que el CLI mantiene fuera del set trackeado (nace congelado con tu repo), así que el mismo resumen nombra cada cambio que le hace:

| Mutación                         | Cuándo se nombra                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Aliases **repuestos**            | Cuando faltaba uno (`factory:doctor`, `generate:*`, …) o apuntaba a un comando viejo del kit y se curó |
| Aliases **retirados**            | Cuando el kit dejó de shippear el script y el valor que tenías era el suyo (hoy: `test:e2e:direct` / `test:e2e:ui` → usa `pnpm test:e2e`) |
| **`ports.e2e` vaciado**          | Solo la corrida que lo vacía; la clave se conserva (es la señal que el runner lee para derivar puerto)  |

Un alias que ya estaba bien, uno que **apunta a algo tuyo** (se preserva, no se retira) y un puerto que elegiste tú **no se nombran**: no hubo cambio. **Silencio = no se movió nada**, nunca "no se revisó". Los tests del kit (`scripts/tools/__tests__/`) dejaron de viajar al derivado; si editaste alguno, el resumen te lo nombra como **huérfano** — se queda en tu repo y ya es tuyo.

**Boundary `src/` (contrato duro):** `update`/`add` **nunca** tocan `src/`. Tu `src/` se baja una vez en `new` y queda frozen — y esto es **a propósito, no una limitación del tooling**: tu derivado ya editó y creó archivos sobre ese `src/`, así que un overwrite automático se tragaría tu trabajo. Por eso el **código se congela** y solo el **cerebro** (`.claude/` + scripts/tools) se refresca, mergeado **archivo por archivo** con prompt ante conflicto (lo editaste local **y** cambió en el Factory). `update` no trae features ni fixes de tu app — solo metodología. Mantener `src/` y sus dependencias (auth, Next, ORM) al día es tarea de tu equipo; `doctor` te lo recuerda (aviso A1). El canal automático para empujar parches de `src/` con merge inteligente es trabajo futuro (EPIC 2), todavía no shippeado. Tu `CLAUDE.md` es **dev-owned en su contenido**: el update nunca reescribe tu prosa y este archivo **jamás** abre prompt de conflicto. Lo único que el CLI vigila ahí es la línea que importa las rules always-on, y lo resuelve en **tres casos**, discriminados contra el hash del lockfile:

| Caso | Qué encontró el CLI                                                                        | Qué hace                                                                                   |
| ---- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **A** | **Virgen** — el hash en disco es el que registró el lockfile (nunca lo editaste)           | Se sobrescribe con el del Factory por la rama normal (ya trae la línea). Nada especial       |
| **B** | **Editado fuera del bloque de imports** — difiere del lockfile pero importa todas las rules | Inserta `@.claude/rules/INDEX.md` **si falta**, byte a byte: ni borra, ni reordena, ni reescribe nada más. Si ya está, no toca nada |
| **C** | **Editado DENTRO del bloque** — le falta alguna rule del kit en los imports                | **No se toca.** Se reporta con los paths faltantes para que decidas a mano (adivinar qué quisiste es justo la heurística frágil que no se hace) |

- **`update --verify` produce el censo** de ese mismo A/B/C **sin escribir un byte** y sin red: el discriminante es el lockfile, no el manifest entrante.
- **En perfil `core` no se inserta nada.** Ese perfil no shippea `.claude/rules/INDEX.md` (importa `SK.md`, que `core` excluye a propósito): la línea apuntaría a un archivo que nunca llega. Ahí los cinco `@import` explícitos vienen en el `CLAUDE.md` shippeado y **los mantiene el developer**; el CLI los **reporta**, no los repone.
- **`doctor`** reporta las rules always-on que tu `CLAUDE.md` no `@importa` — siguiendo el INDEX **un hop**. Una línea de import dentro de un bloque de código es una **muestra**, no un import: no cuenta como cobertura.

### Adapters multi-runtime (Codex · Cursor · Copilot · Hermes)

El kit proyecta tu `CLAUDE.md` + el grafo de `.claude/rules/` sobre los archivos de instrucciones que leen los **otros** agentes de código: `AGENTS.md`, `.cursor/rules/timekast.mdc`, `.github/copilot-instructions.md` y `.hermes.md`.

- **Los cuatro archivos NO viajan en ningún perfil.** Son derivaciones **per-repo** de tu propio `CLAUDE.md`; si viajaran, cada `update` te empujaría la versión del Factory encima de tu copia legítimamente distinta. Lo que viaja es **el generador** (`scripts/tools/generate-agent-adapters.mjs`, en los dos perfiles).
- **En `full` el hook los regenera solo** (`.husky/pre-commit`, en cada commit). En **`core`** no hay husky que viaje: corres `node scripts/tools/generate-agent-adapters.mjs` a mano (o `--check`, que sale 1 ante drift y no escribe) desde tu propio CI.
- **Opt-out por runtime:** `.claude/adapters.project.json` (dev-owned, nunca shippeado) con `{ "disabled": ["cursor"] }` deja de generar ese output — pero **no borra** el que ya está en disco. Y un archivo en disco **sin** el marcador `@generated by …` es tuyo: el generador no lo sobrescribe y lo reporta.

---

## `npx` vs `pnpm factory:update`

- **`npx @timekast/factory update`** funciona en **cualquier** repo — no necesita `package.json`. Es la vía para derivados **core** (Python/Flutter/Go).
- **`pnpm factory:update`** es un **atajo idéntico** que el instalador deja en el `package.json` de proyectos **Node**. Si tu repo no tiene `package.json`, ese alias no existe → usa `npx`.

> Este skill no asume que tu derivado tenga `src/` ni `package.json`: un repo core se opera 100% con `npx`.

---

## El rail — de dónde salen los tokens de la organización

Los comandos que operan infraestructura (`factory provision`, `factory env push` en un repo sin bóveda, el preflight del launcher) leen los tokens de administración de la organización del **rail**: el proyecto `rail-timekast` de la bóveda, entorno `main`, **con tu sesión** de `infisical login`. No hay archivo local ni comando para cargarlos: cada comando los pide al correr y el valor vive sólo en la memoria de ese proceso. Lo que necesitas es `infisical` instalado, una sesión viva en la instancia de la organización y acceso al proyecto `rail-timekast` → cómo entrar: [`fx-secrets-vault §3`](../fx-secrets-vault/SKILL.md). Qué alcanza cada token y cómo probarlo → [`fx-secrets-vault §5`](../fx-secrets-vault/SKILL.md).

- **Cada falla dice cuál es y qué hacer:** sin sesión o sesión caducada (nombra `infisical login --domain=…`) · sesión viva sin acceso a `rail-timekast` — o el proyecto configurado no existe (nombra el proyecto y su id: pide acceso a un admin; si el acceso está, ver el arreglo abajo) · clave ausente (nombra la clave: la carga un admin) · `infisical` no instalado (`brew install infisical`) · respuesta que no se reconoce · la bóveda no respondió a tiempo. Sólo "clave ausente" puede tratarse como opcional; las demás detienen `provision` y `env push`. En el preflight del launcher (`doctor --launcher`) cualquier falla del rail es un aviso (`warn`) y no detiene el comando.
- **Sin acceso con el acceso en regla: el id viene del CLI, no de tu repo.** El CLI lleva una copia embebida de las coordenadas de `rail-timekast` y no lee `.claude/policy/vault.json` al correr. Compara el id que nombra el mensaje con `rail.projectId` de `vault.json`: si difieren, tu CLI está viejo → corre con la versión vigente (`npx @timekast/factory@latest …`); si coinciden, el proyecto cambió en la bóveda → avisa al equipo del Factory o a un admin de la bóveda. Si el mensaje nombra un `rail-<cliente>`, su id sale del campo **Rail del cliente** de `project-config.md`: revísalo ahí.
- **No-echo:** ningún mensaje imprime un valor; se reportan **nombres** de clave.
- **Una copia en tu terminal se ignora:** si exportas un token del rail en tu shell, el comando usa el de la bóveda y avisa por stderr nombrando la variable. Borra ese `export`.
- **Rotación:** un admin mete el valor nuevo en `rail-timekast` con el **mismo** nombre; aplica en el siguiente comando, sin pasos en tu máquina.
- **`factory secrets` está retirado:** cualquier forma del comando sale con error y un mensaje que manda a `infisical login` y a pedir acceso a `rail-timekast`; no abre ni carga ningún archivo. Si `doctor` encuentra un archivo con tokens del rail en tu máquina, nombra su ruta para que lo borres: es una copia que nadie rota.

---

## `factory ticket push <archivo>` — entregar un factory-ticket al Factory

Es el canal **derivado → Factory**: tu proyecto documenta un defecto del kit como un archivo markdown en `project/factory/` (shape y naming → [`fx-factory-tickets`](../fx-factory-tickets/SKILL.md)) y este comando lo entrega como **issue de GitHub en el repo del Factory**, asignado a un maintainer y con la etiqueta `kit-drift`. Al terminar **borra el archivo local**: era un borrador, y desde ahí el estado vive en el issue (commitea el borrado con `docs(factory): …`, `GIT.md §3.5.1`).

- **Credencial: ninguna nueva.** Usa tu propia sesión de `gh` (el mismo preflight de `gh` + membresía del org que corren `add`/`update`). No hay token en el rail ni key project-scoped. Sin `gh`, sin sesión o sin membresía → **nota clara + `exit 0`**, nunca un stack trace, y el ticket local queda intacto.
- **El cuerpo se publica íntegro en un repo compartido, así que hay compuerta** (dos piezas, siempre):
  - `--dry-run` imprime el repo destino, el asignado, la etiqueta y el **título derivado** (el H1 del ticket + su nombre de archivo) — y no crea nada. 🔴 **El cuerpo NO se imprime, y no hay bandera que lo imprima.** No es una omisión: el ticket es un archivo de tu propio repo y lo que se publica es byte-idéntico, así que **abrirlo _es_ ver lo que se publicaría**. Lo que el comando sabe y tú no —el destino, el asignado, la etiqueta, el título— sale impreso; el contenido del archivo no llega a la pantalla, así que tampoco llega al transcript de un agente. El título sí se imprime, con sus caracteres de control escapados: viene del ticket y sin escapar podría reescribir las líneas de arriba.
  - **Confirmación interactiva** antes de publicar. En headless (sin TTY) es **fail-closed**: no publica salvo `--yes` explícito.

  > **No hay barrido de secretos, y es deliberado.** Un factory-ticket es un request de una capacidad que al kit le falta — no un volcado de entorno. La disciplina de §4.2 de [`fx-factory-tickets`](../fx-factory-tickets/SKILL.md) (nombres de clave sí, valores nunca) es la defensa, y el `--dry-run` que no imprime el cuerpo la respalda. Hubo un barrido heurístico sobre el cuerpo; se retiró porque adivinar qué parece un secreto es fail-open por construcción, y protegía contra un caso que la convención ya cubre.
- **La etiqueta se aplica, no se crea.** Aplicar una etiqueta pide permiso `triage` sobre el repo; crearla pide `write`. Si `kit-drift` no existe todavía, el issue **se crea igual** sin ella y el comando lo avisa — un maintainer la crea una vez a mano.
- **Verifica el efecto, no lo asume.** GitHub **descarta en silencio** el asignado y las etiquetas cuando quien crea el issue no tiene al menos `triage` sobre el repo (el permiso base del org es `read`). Tras crear, el comando relee el issue y te avisa si vinieron vacíos, con el remedio: pide `triage` sobre el repo, o el ticket queda sin ruta de aviso al maintainer.
- **Contención de ruta:** solo entrega un archivo **regular** contenido de verdad en `project/factory/`, resuelto con `realpath` — `project/factory-backup/…` y un enlace simbólico que sale del árbol (a un archivo de tu home, por ejemplo) se rechazan.
- **Borrar el borrador es lo que evita el duplicado.** El comando no deduplica contra GitHub: un archivo que se queda en disco y se vuelve a entregar abre otro issue. Por eso, entregado, se borra. Si no pudo leer la URL del issue o no pudo borrar el archivo, lo dice y deja el archivo: confirma el issue y bórralo a mano, sin volver a entregarlo. La URL siempre queda en la terminal. Consulta la cola con `gh issue list -R TimeKast/TimeKast-Factory --label kit-drift`.
- **Límite del cuerpo:** GitHub topa un issue en 65 536 caracteres. Un ticket más grande se rechaza con un mensaje claro (recorta el `## Context snippet` o divídelo), no con un error crudo de la API.

---

## `factory prune` — compartir el repo sin la metodología

Para repos que se comparten con **colaboradores externos** (outside collaborators, solo lectura): ven el producto, las reglas y los sistemas del kit, **nunca el contenido** de workflows, agentes, comandos de pipeline, `.claude/docs` ni `fx-*`. Qué se comparte lo decide `.claude/policy/prune-tiers.json`; el modelo y los pasos para el PO → `/prune` (`tk-prune`), para el socio que integra un PR → `/integrate` (`tk-integrate`), y la guía para socios → `.claude/docs/working-with-collaborators.md`.

🔴 **Todo se activa solo con `.timekast/prune.json`**, que únicamente escribe `prune prepare`. Sin ese archivo, `update` y el pre-commit se comportan como siempre.

| Subcomando | Qué hace |
| --- | --- |
| `prepare [--tier=collab] [--skip-verify]` | Escribe el bloque del tier en `.gitignore` (migra un bloque `timekast:collab` hecho a mano), el interruptor, deja de trackear lo restringido (queda en tu disco) y commitea local; corre `pnpm verify`. Idempotente |
| `cutover [--confirm] [--discard-develop] [--resume] [--repo=o/n]` | Sin `--confirm`: solo el preflight de lectura y el plan. Con él: snapshot de `main` con el tier aplicado (validado sin rutas restringidas) → `<repo>-next` → renombres `<repo>`→`<repo>-legacy` y `<repo>-next`→`<repo>` → forks solo en el repo nuevo. Se niega si `develop` va adelante de `main` |
| `invite <usuario> [--repo=o/n]` | Invita como outside collaborator con lectura. Se niega con miembros de la org y con repos no podados |
| `finish [--repo=o/n]` | Exige un deploy de Production exitoso; apaga forks y quita colaboradores del `-legacy`, lo archiva y audita el repo nuevo |
| `audit [--repo=o/n]` | Mirror del repo: exactamente una raíz y cero rutas restringidas en cualquier ref (incluye refs de PRs). Exit 1 si no |
| `check-pr <n> [--repo=o/n] [--json]` | El rechazo duro de `/integrate`, antes del checkout: rutas fuera del producto y `package.json#scripts`/`#pnpm`. Exit 1 si rechaza |

**`factory update` en un repo podado** regenera el bloque desde el `prune-tiers.json` del release, deja de trackear lo que el tier restringe y publica lo que pasó a compartido — en el mismo commit del cerebro. Con `--no-commit`, te dice que corras `prune prepare` para commitearlo.

**Vercel no se reconecta desde el CLI:** la API documentada de Vercel solo liga un repo al **crear** el proyecto; el cambio de repo de un proyecto existente se hace en el dashboard (Settings → Git).

**Guard del pre-commit** (perfil `full`): `scripts/tools/prune-guard.mjs` rechaza un commit que stagee una ruta restringida, con los patrones de `prune-tiers.json` (no del `.gitignore`). Perfil `core`: no lleva `.husky/` ni el guard.

---

## `factory provision` — onboarding de un derivado nuevo

Cuando arrancas un derivado nuevo (ya bootstrapeado con `new`/`add`), el paso siguiente es **aprovisionar su infra**: su proyecto en la bóveda de secretos, base de datos (Neon), hosting + sustrato git (GitHub + el **destino** del repo: Vercel o Railway, uno por repo), y dominios + correo (Cloudflare + Resend). El CLI lo hace con `factory provision`, un comando **flag-driven y headless-safe** (sin prompts; la interactividad la pone el flujo `/provision`). Los tokens del org que esos pasos necesitan los lee del rail de la bóveda con tu sesión (ver § El rail, arriba).

> **Modelo dual-env de la DB:** Neon queda con **2 branches** — `main` (producción) y `develop` (dev); el contrato de inspección es `pnpm db:query` (dev, el default seguro) vs `pnpm db:query:main` (prod). **Con bóveda** no hay `.env.local` ni `DATABASE_URL_MAIN`: las cadenas viven en la bóveda y `db:query:main` lee `DATABASE_URL` del entorno `main` (`fx-secrets-vault §7`). **Sin bóveda**, el `.env.local` recibe `DATABASE_URL` (develop) + `DATABASE_URL_MAIN` (main). Detalle del modelo → `SK.md §1.4` / `tk-provision`.

### Tokens de provisioning — salen del rail de la bóveda

Los tokens e IDs que `factory provision` necesita (`VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `RAILWAY_TOKEN`, `NEON_API_KEY`, `CLOUDFLARE_API_TOKEN`, `BACKLOG_ADMIN_TOKEN`) son claves de `rail-timekast`, y `provision` las lee de la bóveda con tu sesión, una sola lectura por corrida (ver § El rail, arriba). No hay nada que copiar a tu máquina: con sesión y acceso al proyecto, ya están. (`VERCEL_TEAM_ID` da el default de `--team`, que sólo hace falta con destino Vercel. `RAILWAY_TOKEN` es de equipo: descubre el destino de cualquier repo y, con Railway, opera todo el paso — `fx-secrets-vault §5`.)

**La organización de Neon no se configura con un id.** El `org_id` se **deriva** de la `NEON_API_KEY` (`GET /users/me/organizations`), así que no hay `NEON_ORGANIZATION_ID` en el rail. Al **crear** un proyecto: manda `--neon-org <nombre|id>` si lo pasas; si no, el `NEON_ORG` del rail (un **nombre** legible, opcional); si no, la única organización que la key vea. Con varias visibles y sin ninguna de las dos cosas, `provision` **aborta** nombrándolas — nunca adivina en cuál crear la base. Un proyecto que **ya existe** (`--adopt`, `--destroy`, `--remint`) ignora flag y default: su organización se lee del proyecto, recorriendo las que la key alcanza.

- **`BACKLOG_ADMIN_TOKEN` — token admin org-level del backlog central.** Lo emite el equipo que administra `backlog.timekast.mx`; `factory provision --services=backlog` lo usa para crear el proyecto remoto y mintear su key. Es **org-level** (como `VERCEL_TOKEN`), por eso vive en el rail. La key **por proyecto** que devuelve ese paso (`tk_live_*`, scope `read_write`) NO va al rail: es project-scoped → `provision` la escribe como `BACKLOG_API_KEY` (+ `BACKLOG_PROJECT_ID`) en el entorno `local` de la bóveda del repo (sin bóveda, en su `.env.local`), LOCAL-ONLY, nunca a Vercel.

- **Si `provision` no puede leer un token,** su preflight aborta **antes** de mutar infra. Las claves ausentes se reportan todas juntas (las carga un admin en `rail-timekast`); una bóveda que no se puede leer (sin sesión, sin acceso) llega con su propia falla, no como "token faltante".
- **Si un proveedor rechaza un token (401),** el mensaje manda primero a revisar tu sesión de la bóveda —caduca, y una sesión muerta no es un token muerto— y, si está viva, a que un admin rote el token en `rail-timekast` con el mismo nombre.

### `factory provision` — flags

| Flag                | Qué hace                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `--services=a,b`    | Servicios a crear, en orden canónico: `vault`, `neon`, `github`, `vercel` o `railway` (el del destino, `--target`), `dns`, `backlog`. `vault` se agrega al frente por default aunque no lo pidas (ver _La bóveda_ abajo) |
| `--target=<dest>`   | Destino de despliegue del repo: `vercel` o `railway`. **Obligatorio** en un alta nueva con paso de despliegue (`github`, `vercel`, `railway`, `dns` o `--domain`); `neon` o `backlog` solos no lo piden. Queda en `.timekast/provision.json`. Sin él y sin destino guardado, `provision` lo **descubre** preguntando a Railway y a Vercel por el repo conectado — nunca por `vercel.json`, `.vercel/` ni otro archivo —, y el descubrimiento sólo corre con un paso de despliegue, `--adopt`, `--destroy` o `--resolve-target` (nunca en un `--resume`/`--remint` que sólo toca Neon). Varios proyectos en una misma plataforma deciden la plataforma (elegir entre ellos es de `--adopt`). Un `--target` que contradice lo descubierto o lo guardado se detiene sin crear nada; la única salida de un destino guardado es `--adopt --force --target=<otro>`. Railway exige bóveda |
| `--resolve-target`  | Sólo resuelve el destino y lo guarda en el state; no crea nada ni toca otro campo (sin state, crea el mínimo con `target`). Va solo: admite `--repo`, `--team` y `--json`. **Confirmación:** un resultado inequívoco (el repo en una sola plataforma, sin rail de cliente declarado) se guarda sin preguntar e imprime una línea con la plataforma, el proyecto y el repo; lo ambiguo se detiene, también sin TTY. **Salida:** `0` resuelto (guardado ahora o ya estaba — con destino guardado no llama a ninguna API) · `10` sin destino (el repo no está conectado en ninguna) · `11` ambiguo (conectado en las dos, o `project-config.md` declara un rail de cliente) · `12` no se pudo leer un token del rail. Un CLI que no conoce el flag sale `1`. `/deploy` lo corre en su preflight |
| `--no-vault`        | Omite la bóveda: ninguna llamada a ella, y el repo trabaja con `.env.local`. Junto con `vault` en `--services` es un error. Con Railway se rechaza antes de llamar a nada |
| `--repo=<org/nombre>` | Override del repo de GitHub (`org/nombre`, un solo `/`). Default: el que registra el state; si no hay, el remote `origin`; si no hay `origin`, `<org del Factory>/<slug>`. Un `--repo` distinto del que ya registra el state se detiene (descártalo con `--force`). También es la identidad con la que se descubre el destino y se busca el proyecto de Railway |
| `--slug=<slug>`     | Identificador del stack — nombre del proyecto + dominios interinos (`{slug}.…`, `{slug}-dev.…`)    |
| `--team=<id>`       | Team de Vercel — **override**; default = `VERCEL_TEAM_ID` del rail. Se exige **después** de resolver el destino (flag, state o descubrimiento), y sólo si es Vercel: ahí es requerido (vía flag o rail) si se aprovisiona `vercel`/`github`/`dns`/`--domain`; con Railway no se pide ni se consulta Vercel |
| `--org-id=<id>`     | Org de GitHub (override; default = org del Factory)                                               |
| `--neon-org=<x>`    | Organización de **Neon** donde CREAR el proyecto: nombre o `org-…`. Default = `NEON_ORG` del rail; si la key ve una sola, esa. Varias y sin selector → aborta. Un proyecto existente lo ignora (su org se lee del proyecto) |
| `--remint`          | Reacuña la API key project-scoped de Neon **aunque el paso esté completo** y deja la nueva donde la leen CI y tu máquina: con bóveda, en `develop:/ci`, y el sync la lleva a los 3 secrets de E2E en GitHub (un solo escritor por destino — `fx-secrets-vault §7`); sin bóveda, sube los 3 secrets con `gh secret set` y reescribe `.env.local`. 🔴 La anterior se revoca **por id y sólo después de entregar la nueva** (orden y pendientes: _`--remint` — la key anterior sigue viva hasta la entrega_, abajo). Para una key revocada por fuera (el `--resume` normal hace corto circuito y no recupera nada) |
| `--domain=<dom>`    | Dominio definitivo del cliente (diferible — ver _go-live_ abajo)                                   |
| `--dns=<ruta>`      | Ruta DNS para `--domain`: `org` (default) · `cliente-cf` · `registrar`                             |
| `--client-mail`     | Solo con `--domain`: el go-live también mueve el correo a `updates.<dominio>` (un dominio nuevo en Resend). Sin él, el correo se queda en `updates.timekast.com` — ver _go-live_ abajo |
| `--verify-timeout=<min>` | Timeout del sondeo de verificación del dominio en la plataforma del destino (Vercel o Railway), en minutos (default 10) |
| `--confirm`         | Pre-aprueba retirar el dominio interino de prod tras verificar (headless-safe)                     |
| `--dry-run`         | Imprime el plan sin llamar a ninguna API de plataforma (Railway, Vercel, Neon, Cloudflare) ni escribir estado (excepciones, todas de solo lectura: con `--destroy` sobre un stack `live` con bóveda, la lectura de su protección contra borrado; con `--destroy` sobre destino Railway, la lectura del proyecto con sus servicios —o, con un alta cortada, la búsqueda por nombre—, que lee `RAILWAY_TOKEN` del rail). Muestra los pasos del destino resuelto (flag o state); en un alta sin destino resuelto, dice que está **sin resolver** y manda a pasar `--target` o a correr `--resolve-target` — no lo descubre. Con bóveda, el plan nombra los syncs que se crearían (fuente → destino) |
| `--ephemeral`       | Marca el stack `ephemeral` (vs el default `live`) — define el blast radius de `--destroy`          |
| `--resume`          | Retoma desde `.timekast/provision.json`, salta los pasos ya completados. Un paso `dns` que conectó los dominios pero no pudo publicar la key de Resend del proyecto queda **pendiente**: `--resume` (con `dns` en `--services`) reintenta sólo la key, sin volver a crear dominios ni CNAMEs. Un go-live con `--client-mail` posterior también lo termina: además de la key, activa el correo (`EMAIL_PROVIDER=resend` + `EMAIL_FROM`): sin bóveda, directo en los deploys; con bóveda, sólo en `main:/`, y los syncs lo entregan |
| `--force`           | Descarta el estado y empieza de cero (o sobreescribe en `--adopt`; o autoriza un `--destroy` live). Conserva el bloque `resend` (el id de la key viva del proyecto y sus pendientes de revocar); con `--dry-run` no borra nada. El archivo se descarta justo antes del primer paso: una corrida que se detiene antes (destino sin resolver, team de Vercel faltante, preflight) lo deja intacto. **No** sirve para un `.timekast/provision.json` ilegible (ver Troubleshooting): ahí se niega |
| `--adopt`           | Reconstruye `.timekast/provision.json` de un derivado existente, **solo-lectura** (ver abajo). Con `--force --target=<otro>` es la única vía para cambiar un destino guardado |
| `--destroy`         | Destruye los recursos del derivado **por lifecycle** — solo sesión interactiva (ver abajo). Con bóveda, borra primero los syncs. Con Railway, borra con `RAILWAY_TOKEN` del rail (ver abajo) |

> El estado vive en `.timekast/provision.json` (IDs de provider + `lifecycle`, **no** secretos) y se **commitea** en el repo del derivado. El CLI lo escribe tras cada `create`; tú no lo editas a mano. Es la autoridad única del lifecycle.

### La bóveda (`vault`) — primero y por default

`provision` crea (o adopta, si ya existe con ese slug) el proyecto del repo en la bóveda **antes** que la migración inicial y que cualquier otro servicio, porque todo lo que los pasos siguientes acuñan se escribe ahí; y una sesión de la bóveda ausente detiene la corrida antes de crear nada. Lo hace con **tu sesión** (no con un token del rail), con sus miembros en el mismo paso (tú + los admins de la bóveda), y guarda el vínculo en el bloque `vault` de `.timekast/provision.json`. Layout, entornos y qué vive en cada carpeta → [`fx-secrets-vault §6/§7`](../fx-secrets-vault/SKILL.md).

- **Sin `.env.local`.** Con bóveda, `provision` no crea el archivo: cada valor va a su carpeta. Si el repo ya tiene uno, no lo borra, pero avisa: Next.js lo carga y sus claves se colarían sobre las de la bóveda.
- **Cuándo NO la agrega:** con `--no-vault`; en perfil `core` (el lockfile declara `core`, o no hay lockfile y falta `scripts/tools/with-vault.mjs`), donde una línea dice por qué y la corrida sigue sin bóveda —pedir `vault` explícito ahí es un error—; y en un repo **ya aprovisionado sin bóveda** (state con servicios completos y sin bloque `vault`): ahí se **detiene sin crear nada** y te da las dos salidas — `factory vault adopt` (sin `--apply` sólo enseña el plan) o repetir con `--no-vault`. Pasar un repo vivo a la bóveda es decisión de su equipo, nunca un efecto lateral.
- **Preflight local** (antes de cualquier llamada de red): en un repo `full`, si faltan `scripts/tools/with-vault.mjs` o `.claude/policy/vault.json`, aborta nombrándolos → `factory update` y repetir, o `--no-vault`.
- **Cableado del wrapper en `package.json`.** Los scripts del kit (`dev`, `build`, `db:*`, `test:e2e`…) leen la bóveda a través de `scripts/tools/with-vault.mjs`. Si tu `package.json` nació sin él, `provision` reescribe los scripts cuyo valor es el que shippeó el kit, **imprimiendo el diff antes de escribir** (con `--dry-run`, sólo el diff). Un script que tu equipo customizó **no se toca** y se nombra: corre sin los secretos de la bóveda hasta que lo adaptes (anteponiendo `node scripts/tools/with-vault.mjs`). Un script ausente no se inserta. El cambio queda sin commitear.
- **Correo (con y sin bóveda):** la key de Resend de los deploys es **siempre propia del proyecto** (sólo envío, limitada a su dominio; su id queda en `state.resend` para revocarla); la de equipo del rail sólo la acuña y nunca llega a un deploy ni al `.env.local`. Con bóveda vive en `main:/` y los syncs la llevan a production y preview. Sin bóveda, `provision` la entrega directo a los deploys y al `.env.local`; como no hay de dónde releerla, una corrida que la necesita acuña otra y revoca la anterior en cuanto la nueva llegó a los deploys y al `.env.local`. Con key, los deploys reciben también `EMAIL_PROVIDER=resend`, y `EMAIL_FROM` es siempre el remitente del dominio al que está limitada la key.
- **Passkeys:** WebAuthn usa **un solo rpID** —el host de producción, en producción y preview— más `WEBAUTHN_RELATED_ORIGINS` con el origen de develop. 🔴 Riesgo aceptado: producción acepta ceremonias desde el origen de develop, así que JavaScript publicado en develop sin review podría pedir la passkey de un usuario de producción que entre a develop; la condición es que develop pase por la misma review que `main`.
- **`AUTH_SECRET` es uno por entorno:** producción y preview reciben cada uno el suyo (con bóveda, `main:/` y `develop:/`; `local` usa el de develop).

### Deploys y CI con bóveda — `provision` crea los syncs, no sube valores

Con bloque `vault`, `provision` no escribe en los deploys ni en los secrets de GitHub: escribe cada valor en su carpeta de la bóveda y crea **tres syncs**, que desde ahí son el único escritor de su destino. Quién escribe cada destino (con y sin bóveda) → la tabla de `SK.md §7.2`; qué hace un sync y su borrado → [`fx-secrets-vault §7`](../fx-secrets-vault/SKILL.md).

| Sync (fuente → destino)                      | Lo crea el paso |
| -------------------------------------------- | --------------- |
| `main:/` → Vercel production                 | `vercel`        |
| `develop:/` → Vercel preview                 | `vercel`        |
| `develop:/ci` → secrets de GitHub Actions    | Al cierre de cada corrida con bóveda, con el repo ya creado (ahí también se crean los que quedaron pendientes) |
| `main:/` → Railway `main` · `develop:/` → Railway `develop` | `railway` (con `--target=railway`, en lugar de los dos de Vercel) |

- **Antes de crear un sync, revisa el destino por nombres.** Si ya tiene claves que la bóveda no maneja en esa carpeta, no crea **ninguno** y lo dice nombrándolas (un sync las pisaría o las borraría): pasar un destino con valores vivos a la bóveda es la adopción, no el provisioning. Un sync que ya existe se **adopta** sólo si su fuente y sus opciones son las esperadas (borra en destino, auto-sync encendido, sin esquema que renombre las claves); si no, `provision` para nombrando la diferencia y no lo toca.
- **Pendiente, no a medias.** Sin la app connection de ese tipo en la bóveda, o sin el destino todavía (repo, proyecto de Vercel o de Railway aún sin crear), el sync queda pendiente en el state y `--resume` lo crea.
- **El primer deployment espera a los syncs** (Railway tiene su propia espera, abajo): en Vercel se dispara sólo cuando cada clave de `main:/` está en production y cada una de `develop:/` en preview (por nombres, con tiempo acotado; si vence, el paso queda reanudable). Se decide por target: uno que ya tiene deployment en Vercel no se vuelve a disparar, así que un `--resume` nunca lanza otro build de producción sobre un proyecto vivo. 🔴 Si en Vercel aparece una clave que sólo puede vivir en `/ci` o en `local`, `provision` para antes del deployment nombrándola.
- **`--remint`** deja la key nueva de Neon en `develop:/ci` y el sync la lleva a GitHub; **`--destroy`** borra los syncs primero; el **go-live** (`--domain`) escribe sus valores de producción en `main:/`. Detalle en cada sección.
- **Railway (`--target=railway`).** Railway exige bóveda (sin ella `provision` lo rechaza antes de llamar a nada): el paso `railway` crea los syncs `main:/` → `main` y `develop:/` → `develop` con la misma primitiva que `factory vault sync railway` (la que usa un repo que ya vivía en Railway), y nunca escribe variables por la API de Railway. La bóveda escribe además `PORT` y `AUTH_TRUST_HOST`. El repo se conecta —y con eso nacen los triggers, que en Railway **son** el auto-deploy— sólo después de que los nombres de cada carpeta llegaron a su entorno; si no llegan a tiempo, el paso queda reanudable. Ninguna petición va a Vercel.
- **Cambiar o agregar un valor después:** dónde se escribe → `SK.md §7.2`. El sync actualiza las **variables**, no el deployment que ya corre: en Vercel el cambio aplica en el siguiente deploy (un `NEXT_PUBLIC_*` se hornea en el build).
- **`factory env push` no escribe** en un repo con bóveda: lo dice, nombra el proyecto y los entornos de la bóveda, y termina sin error (también con `--dry-run`). Si `.timekast/provision.json` no registra los dos syncs de Vercel (pendientes o ausentes), el mensaje no afirma que el sync lleva el valor: lo dice y manda a `factory provision --resume`.

### `--remint` — la key anterior sigue viva hasta la entrega

Rotar la key de Neon del CI nunca deja al E2E sin una key válida. El orden, con y sin bóveda:

1. **Antes de acuñar**, lista por id las keys vivas de la familia del proyecto —`<slug>-e2e` y las rotadas `<slug>-e2e-<AAAAMMDDhhmmss>`; el sufijo exacto evita tomar las de otro proyecto con un nombre parecido— y, con bóveda, anota el **marcador de entrega**: el último job de cada sync `develop:/ci` → secrets de GitHub del repo. Si Neon no puede listar sus keys, o la bóveda sus syncs, **se detiene sin acuñar nada** y lo nombra: nunca queda una key viva que nadie registró. Pendientes de una corrida anterior se liquidan primero con su propio marcador; las que sigan pendientes se suman.
2. Acuña la nueva con **su propio nombre**, `<slug>-e2e-<AAAAMMDDhhmmss>` (UTC): Neon rechaza con `409` un nombre repetido en la organización, y la anterior sigue viva. No está en la lista del paso 1 y sobrevive. Un `409` aquí es un error real: lo nombra y no revoca nada. Después la escribe.
3. Revoca los ids del paso 1 **por id**, sólo con prueba de entrega:
   - **Sin bóveda:** la prueba es que los 3 `gh secret set` terminaron bien. Si uno falla no revoca nada, nombra el repo y el secret, y la siguiente corrida vuelve a listar por nombre la vieja junto con la que no se entregó.
   - **Con bóveda:** la prueba es que **cada** sync `develop:/ci` hacia el repo reporte un job **más nuevo** que el marcador y exitoso (o cualquiera, si el sync nació después). Un job exitoso anterior a la escritura no cuenta, y **sin ningún sync hacia el repo nunca se revoca**. La corrida espera la prueba con tiempo acotado (el mismo presupuesto que el primer deployment).

**Pendientes.** Sin prueba a tiempo, los ids y el marcador quedan en `vault.neonRevokePending` de `.timekast/provision.json` —sólo ids, nunca un valor—, escritos sin tocar nada más del archivo (también en la forma adoptada). La anterior sigue funcionando en CI mientras tanto. Toda corrida posterior de `provision` con bóveda (p. ej. `--resume`) y `vault adopt --apply` los revocan en cuanto el sync lo confirma; una revocación que Neon no confirma sigue pendiente. El archivo commiteado no decide **dónde** ni **qué** revocar:

- el proyecto de Neon es el que dice la bóveda (`NEON_PROJECT_ID` en `develop:/ci`), no el del archivo (si difieren, lo avisa y usa el de la bóveda; si la bóveda no lo tiene o no se puede leer, no revoca y siguen pendientes), y la organización sale de ese proyecto, no de la que registra el archivo (si difieren, lo avisa y usa la del proyecto);
- sólo se revocan ids que Neon lista en esa organización dentro de la familia del proyecto; el resto se descarta del registro, nombrado, sin revocar;
- **nunca** la key vigente —la más reciente de la familia—, aunque el registro la nombre;
- un marcador de entrega **vacío** leído del archivo no prueba nada: la corrida anota el de ese momento, pide a los syncs que vuelvan a entregar y la revoca una corrida posterior;
- un pendiente nuevo se **fusiona** con los que ya había, nunca los reemplaza.

`factory doctor` reporta cuántas quedan y qué corrida las liquida. El resumen dice cuántas revocó y cuántas quedaron pendientes.

`--destroy` de un stack `ephemeral` borra la familia completa de keys del proyecto (la base y las rotadas).

**Branches de Neon.** El de producción (`main`) es el que Neon marca como **default**, se llame como se llame; sin default, se detiene nombrándolo, nunca elige "el primero". El de E2E conserva su precedencia: `E2E_PARENT_BRANCH` fijado en `e2e.yml` → `develop` → el default → el primero.

### `--adopt` — backfill read-only

Un derivado provisionado **antes** de que existiera el CLI no tiene `.timekast/provision.json`. `factory provision --adopt` lo reconstruye interrogando a los providers **solo con lecturas** (Vercel o Railway, Neon, GitHub, Cloudflare): **nunca** ejecuta una escritura, **nunca** crea ni destruye un recurso. Escribe el state con `lifecycle: live`. Si un provider no responde o el token no tiene lectura, deja ese campo en `unknown` y continúa. `factory update` te **ofrece** correr `--adopt` cuando detecta que falta el state (solo en modo interactivo, nunca con `--yes`).

**`update` también pregunta una vez por el E2E con base vacía.** Si el repo tiene el runner de E2E y migraciones pero no tiene `e2e.config.json` en la raíz, al terminar explica qué implica y pregunta si lo activa: sí → escribe `{"emptyBranch": true}`, no → `{"emptyBranch": false}` (no vuelve a preguntar), Esc → no escribe nada. Solo en modo interactivo, nunca con `--yes`. El archivo es del developer: `update` nunca lo trae ni lo pisa. Detalle → `sk-e2e` § *The empty-branch mode* y `.claude/docs/retrofits/e2e-empty-branch.md`.

**Qué busca, y dónde.** Con destino Vercel, el proyecto de Vercel se resuelve por nombre exacto y, si no lo hay, recorriendo **todas** las páginas del team; el de Neon, la lista completa de **cada** organización que la key alcanza (Neon exige `org_id` en la consulta y lo rechaza sin él, así que se deriva de la key y se manda por organización). La organización que queda registrada es la **del proyecto encontrado**, no un default: recordar otra apuntaría un `--destroy` o un `--remint` posterior a la organización equivocada. El match ignora mayúsculas y separadores, así que un proyecto llamado `Mi App` en la consola se reconoce desde el directorio `mi-app`. Cuando ningún candidato coincide, lo dice con cuántos revisó: un `unknown` silencioso no distingue "no existe" de "no lo busqué bien".

**Railway.** El proyecto se encuentra por el **repo conectado** (el `source.repo` de sus servicios), nunca por nombre. Con **varios** proyectos conectados al repo se detiene nombrándolos (es un repo con varios despliegues → `factory vault deploys`). Con varios servicios, o entornos que no se llaman `main`/`develop`, pregunta cuál servicio y qué entorno es cada uno y lo guarda; **sin terminal se detiene** nombrando lo que falta. Escribe `target: railway` y el bloque `railway` (proyecto, servicio, entornos, dominios descubiertos), no los syncs. `--adopt --force --target=railway` sobre un state con `target: vercel` reescribe el destino y deja intacto el bloque `vercel`.

**Dominios.** Se **descubren**, no se derivan del slug: primero los CNAMEs en las zonas del org, y si no hay ninguno, los dominios que el proyecto tiene en Vercel (es el caso de un derivado que vive en el dominio del cliente). El rol sin host queda en `unknown` en vez de un nombre por convención — ese campo lo leen `--destroy` y el rpID de las passkeys, y un host inventado ahí es un borrado apuntando a la nada. Solo si ningún provider responde caen los nombres de convención, con aviso.

### `--destroy` — por lifecycle (sesión interactiva, jamás headless)

`factory provision --destroy` lee el `lifecycle` del state como **autoridad única** (sin state → rehúsa y sugiere `--adopt` primero):

- **La autoridad va primero.** `lifecycle`, `--force` y la confirmación se evalúan **antes** de cualquier descubrimiento del destino o lectura del rail.
- **`ephemeral` → nuke:** borra el proyecto Neon entero, los dominios + el proyecto de hosting (Vercel o Railway), los registros de Cloudflare y el repo de GitHub.
- **`live` → rehúsa** salvo `--force`, y aun con `--force` pide **type-to-confirm** (escribir el slug exacto del proyecto). Sin coincidencia → aborta sin borrar nada. De Neon sólo borra la rama `develop`: `main` (producción) se preserva.
- **Con destino Railway** (en los dos lifecycles), el plan lista el proyecto de Railway con **todos** sus servicios, y antes de borrar comprueba que el proyecto es de este repo (un servicio despliega el repo de `origin`, o el servicio registrado se llama `web`, tiene al menos una instancia y no tiene ni repo ni imagen): si no, se detiene sin borrar nada. Los ids que el state aporta se revalidan antes de borrar —un dominio sólo si Railway lo lista en ese proyecto, un registro de Cloudflare sólo si su tipo y su host son los del proyecto, un sync sólo si apunta a ese proyecto—; uno que no coincide sale `failed` o `skipped` y no se borra. Si el proyecto ya no existe (un `--destroy` repetido), su parte sale "ya no existía" y el resto sigue. Si el proyecto tiene servicios que el kit no creó, la confirmación es **escribir sus nombres** (el nombre del proyecto no protege: el kit lo nombra como el slug). Sin `railway.projectId` en el state (sin bloque `railway`, o un bloque sin el id del proyecto), la parte Railway **se salta** y el resto del teardown sigue. Si el state marca un alta cortada mientras creaba el proyecto, hace **una búsqueda de solo lectura** por el nombre que esa alta pidió: sin proyecto con ese nombre, se salta ("el alta se cortó antes de crearlo") y el teardown puede cerrar; con uno, sale `failed` nombrando su id y **no lo borra** —un nombre no prueba que sea de este repo—: bórralo a mano o termina el alta con `--resume`, y un `--destroy` posterior cierra. Si la búsqueda falla, también sale `failed`. Orden en Railway: **dominios → registros de Cloudflare → syncs de la bóveda hacia Railway, por su id → proyecto** (que se lleva sus entornos, servicios y dominios de servicio); ninguna petición va a Vercel.
- **Protección contra borrado del proyecto de la bóveda — segunda llave, independiente de `--force`.** Todo proyecto de repo nace protegido ([`fx-secrets-vault §6`](../fx-secrets-vault/SKILL.md)).
  - En **`live`** con bloque `vault`, después de la confirmación y **antes de tocar cualquier proveedor**, un preflight lee el proyecto (una sola lectura, sin escrituras). Con la protección **encendida** se detiene todo el teardown —Neon, Vercel, Cloudflare, GitHub, backlog, Resend y bóveda— y te pide apagarla a mano en el dashboard de la bóveda. También se detiene si **no pudo leerla** (sin sesión, sin acceso, error o tiempo agotado: no poder demostrar que está apagada nunca cuenta como apagada) o si el bloque `vault` de `.timekast/provision.json` está **mal formado**. Aplica igual en la forma adoptada del state. Sin bloque `vault`, el preflight no aplica. Con la protección apagada, el teardown sigue como siempre.
  - En **`ephemeral`**, el CLI apaga la protección, lo dice y borra el proyecto. Si no pudo apagarla, el paso sale `failed` con la causa, el proyecto queda y el state se conserva.
  - Con **`--dry-run`**, en `live` corre la misma lectura (sin escribir nada), y el plan dice lo que pasaría: en `live`, "se detendría" o "seguiría"; en `ephemeral`, que apagaría la protección y borraría el proyecto. Una lectura fallida o un bloque mal formado se nombran igual que sin `--dry-run`.
- **En los dos, además:** con bóveda, **primero** borra los syncs del proyecto hacia su destino (Vercel o Railway) y hacia GitHub (con tu sesión de la bóveda), antes que los destinos a los que escriben; lo que un sync ya escribió queda en su destino, que el mismo `--destroy` retira. Después desactiva el proyecto del backlog central, **revoca la key de Resend del proyecto** por su id —la vigente y las que un reemplazo dejó pendientes (`pendingRevokeIds`)— y, **al final**, borra el **proyecto del repo en la bóveda** — el último porque guarda la única copia de las llaves selladas. Sin bloque `vault` o sin bloque `resend` en el state, esos pasos no existen. Sobre un stack **adoptado** (`--adopt`) sólo se revoca la key de Resend (es del proyecto; el adopt conserva su bloque): el proyecto de la bóveda y el del backlog central no se tocan.
- **Credenciales:** Neon, Vercel, Cloudflare, el backlog central y la revocación de Resend usan los tokens del rail, leídos antes del primer borrado (una bóveda ilegible aborta ahí, sin borrar nada a medias); el repo de GitHub, tu sesión de `gh`; el proyecto de la bóveda y los syncs de la bóveda (también los de Railway), tu sesión de la bóveda. Un recurso que no se pudo borrar se reporta y el state se conserva.
- 🔴 **Railway se borra con `RAILWAY_TOKEN` del rail**, como Neon, Vercel y Cloudflare con los suyos: no hay alternativa con la credencial de una persona, porque Railway no tiene un CLI humano que un agente pueda usar (`fx-secrets-vault §5`). El token alcanza **toda** la organización, así que lo que frena el borrado no es el token sino la autoridad —el `lifecycle`, `--force`, la confirmación escrita y la comprobación de que el proyecto es de este repo—, evaluada antes de leerlo. Los syncs de la bóveda hacia Railway se borran con tu sesión, nunca con el token.
- **Agente-only, jamás headless:** sin TTY o con `--json` → falla con `--destroy requiere sesión interactiva`. No se expone en el TUI.

### `/provision` — la capa de orquestación (cita, no reedición)

Las primitivas de arriba son flag-driven; el flujo **`/provision`** (skill `tk-provision`) es el **orquestador interactivo** que las corre en orden (bóveda → Neon → Vercel/git, o git/Railway → dominios/Resend), verifica tooling y tokens, narra cada paso en lenguaje claro, y **para con Plan Mode en el punto irreversible** (con Vercel: crear el proyecto + conectar git + instalar la GitHub App; con Railway: crear el proyecto + conectar el repo). Los pasos de Railway en orden y su troubleshooting viven ahí — un gate HIGH-risk que nunca auto-avanza. Para el detalle del orden, los gates y la narración, ver el skill `tk-provision`; este skill no reproduce esa lógica, solo documenta las primitivas que el flujo invoca.

### Go-live del dominio del cliente (`--domain`)

`--domain` es **diferible**: el dominio definitivo del cliente casi nunca está listo en el provisioning inicial, así que el stack arranca con los dominios interinos del kit (`{slug}.timekast.com` + `{slug}-dev.timekast.com`; los proyectos provisionados antes de la mudanza de dominio siguen en `timekast.mx`, que no se apagó). Cuando el dominio esté disponible, `factory provision --domain=miapp.com` lo conecta —al proyecto de Vercel o al entorno `main` de Railway, según el destino— siguiendo el árbol de DNS según dónde viva la zona: `org` (token org scoped, default), `cliente-cf` (la API key propia del cliente: el CLI la lee como `CLOUDFLARE_API_TOKEN` del proyecto `rail-<cliente>` de la bóveda que declara el campo **Rail del cliente** de `project/planning/project-config.md`; sin ese campo o sin la clave, la pide por terminal, y en headless aborta nombrando el campo) o `registrar` (registrar sin API → el CLI **solo imprime** los records a crear a mano + sondea). Tras verificar el dominio en la plataforma (en Railway, con un TXT de verificación además del CNAME), retira el interino de prod (con confirmación) y re-apunta `NEXT_PUBLIC_APP_URL` al dominio nuevo — sin bóveda los escribe directo en producción y preview; con bóveda (siempre, en Railway) los escribe **sólo** en `main:/` y el sync los lleva a producción, porque `develop:/` (y con él preview) conserva el origen de develop. También mueve `WEBAUTHN_RP_ID` al dominio del cliente y ajusta `WEBAUTHN_RELATED_ORIGINS`: 🔴 toda passkey registrada con el rpID interino deja de servir (el CLI lo avisa), así que conviene hacer el go-live antes de que los usuarios registren passkeys.

**El correo se queda en `updates.timekast.com` por default.** La cuenta de Resend no tiene cupo para un dominio por cliente, así que el go-live no toca Resend ni `EMAIL_FROM`: la key del proyecto ya está limitada a `updates.timekast.com` y sigue sirviendo, y el estado lo registra con `dns.sharedMail: true`. Para que la bandeja muestre quién escribe, la app antepone `NEXT_PUBLIC_APP_NAME` al remitente al enviar (`sk-email`). Un proyecto nacido antes de eso le pone nombre editando `EMAIL_FROM` en `main:/` de su bóveda (`Mi App <noreply@updates.timekast.com>`): `provision` solo escribe `EMAIL_FROM` cuando falta, así que no lo pisa. En Vercel no: el siguiente sync lo pisaría.

**Con `--client-mail`**, el go-live mueve el correo al cliente: registra `updates.miapp.com` en Resend (un subdominio, no el apex, que lleva el correo corporativo del cliente; los registros DKIM/SPF/MX se crean en su zona, o se imprimen con `registrar`) y cambia `EMAIL_FROM` a `noreply@updates.miapp.com` en el mismo lugar que los demás valores. La key de Resend del proyecto está limitada a su dominio de envío, así que ese go-live acuña una nueva para el dominio del cliente (con y sin bóveda): con bóveda la escribe en `main:/` y los syncs la entregan a los deploys; sin bóveda, la escribe directo en los deploys y en el `.env.local`. 🔴 La anterior se revoca **sólo después** de que la nueva llegó a los deploys — con bóveda, cuando los dos syncs de Vercel reportan una corrida exitosa posterior a la escritura, que el go-live espera con tiempo acotado —: si eso no ocurre, su id queda en `state.resend.pendingRevokeIds`, los deploys siguen enviando con ella, y repetir el go-live (`--domain`) termina el cambio. Antes de revocar, los ids pendientes se cruzan con el listado de Resend: sólo se revocan los que Resend lista con el nombre de key del proyecto (`<slug>-send`) y nunca la key en uso (`apiKeyId`); el resto se descarta, nombrado, y si Resend no deja listar sus keys no se revoca nada y siguen pendientes. El nombre del proyecto y la key en uso salen de `.timekast/provision.json`, así que ese cruce acota lo revocable a lo que el archivo registra — no protege contra un archivo editado a mano.

**No escribe `AUTH_URL`/`NEXTAUTH_URL`**: `trustHost` infiere el origin por request, y fijarlas clavaría el callback de todos los previews de rama a un solo host (regla → skill `sk-security` § trustHost).

---

## `factory vault` — adoptar la bóveda en un repo que nació sin ella

`factory vault` sin subcomando imprime su ayuda. El contrato (layout, syncs, qué es cada clase de variable) → [`fx-secrets-vault §7/§8`](../fx-secrets-vault/SKILL.md); el paso a paso con cada caso → `.claude/docs/retrofits/secrets-vault-adoption.md`. **No confundir con `provision --adopt`**, que reconstruye `.timekast/provision.json` desde los proveedores y no toca secretos.

**Perfil `core`:** `vault adopt` (también con `--decline`) dice que la bóveda no se ofrece ahí (el lockfile declara `core`, o no hay lockfile y falta `scripts/tools/with-vault.mjs`) y no hacen nada.

### `factory vault adopt` — sin `--apply`: el plan

Corre las precondiciones y enseña el plan **sin escribir nada**.

- **Precondiciones:** lockfile presente; el cerebro en la última versión (la misma comparación que `status`; sin conexión para confirmarlo, se detiene); y ningún archivo que corre el wrapper (`with-vault.mjs`, `.claude/policy/vault.json` y los scripts que invocan los scripts envueltos) difiere del lockfile o falta — si alguno, aborta nombrándolos → `factory update --verify` / `factory update`.
  **Modo Factory** (sólo en el checkout del Factory; no aplica a tu repo): sin lockfile **y** con `origin` en el repo del Factory —las dos señales, nunca una—, estas dos precondiciones salen "no aplica — es el origen del kit", el slug sale de `project-config.md §1` y el vínculo se escribe sin `provision --adopt`.
- **Dónde busca los deploys:** el proyecto de Vercel por el id registrado en `.timekast/provision.json` y, si no hay, por el repo de GitHub del remote `origin`; con **varios** conectados se detiene nombrándolos con su id; `--vercel-project <id>` elige el que queda como proyecto principal (tiene que ser uno de los conectados —o el registrado, si lo hay—; otro id se detiene nombrando los candidatos), y los demás despliegues se operan con `factory vault deploys` (abajo). Railway: el proyecto que tiene **conectado el repo** del remote `origin` (el `source.repo` de sus servicios, sin distinguir mayúsculas), se llame como se llame en Railway; el nombre del proyecto nunca sirve para encontrarlo. Hace falta `RAILWAY_TOKEN` en el rail y un `origin` de GitHub: sin cualquiera de los dos, avisa y no inventaría Railway (queda "no consultado", nunca "sin proyecto"). Con **dos o más** proyectos conectados al repo, el plan y el `--apply` se detienen **antes de escribir nada**, nombrándolos con su id: es un repo con varios despliegues, y `vault adopt` nunca importa a una sola bóveda valores de despliegues distintos; esos se operan con `factory vault deploys` (abajo; patrón en `fx-secrets-vault §6`). Varios servicios de **un mismo** proyecto conectados al repo son un solo despliegue y se listan por servicio. El plan muestra el id del proyecto que usa. Sin ningún deploy, no hay nada que adoptar.
- **La lectura de Railway es fail-closed:** una respuesta sin la lista de proyectos, de servicios, de sus instancias (el repo que cada una tiene conectado), de entornos o de variables, o una lista anidada que dice tener más páginas de las que se leyeron, detiene el plan con un error; nunca se lee como "sin proyecto", "desconectado" ni "sin variables". La lista de proyectos se recorre página por página.
- **Deploy conectado y vacío:** si Vercel responde **con** una lista vacía y Railway se consultó y no tiene proyecto, el plan lo dice: los valores por entorno (`AUTH_SECRET` uno por entorno, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_ENV`, rpID y related origins, `DATABASE_URL` por branch de Neon) se generan o derivan en el `--apply`, nunca de `.env.local`; de ahí sólo salen los compartidos que confirmes. Muestra los hosts (regla de abajo). Una respuesta sin la lista, una sola variable, Railway presente o sin consultar (sin `RAILWAY_TOKEN` o sin `origin`) **no** es vacío. Con un proyecto de Neon de un solo branch avisa que `main` y `develop` quedan en la misma base y el `--apply` lo pregunta.
- **Hosts de producción y de preview — una sola regla**, para el deploy vacío y para derivar una `sensitive`: producción = los dominios del proyecto en Vercel **no** ligados a una rama; preview = los ligados a `develop`. Con exactamente uno, ése. Con cero o varios, el `--apply` pregunta el host (sólo el host, sin `https://`) y sin terminal se detiene nombrando los candidatos. Nunca se prefiere uno (tampoco un dominio propio sobre uno de `vercel.app`) ni se inventa.
- **Key de Neon de CI:** la de `.env.local` (o la que ya esté en `develop:/ci`) se importa sólo si se **prueba** acotada al proyecto, con una prueba **negativa**: responde 2xx en su proyecto **y** exactamente 404 en un proyecto hermano de la misma organización (la organización y el hermano los busca la key del rail). Cualquier otra respuesta —un 2xx en el hermano (key de organización o personal), 401, 429, 5xx, tiempo agotado, una organización sin otro proyecto contra el cual probar— es **no probada**. La prueba separa una key del proyecto de una de organización y de la personal de un miembro de la organización; la personal de un colaborador externo con quien sólo se compartió este proyecto no se distingue de una del proyecto (no verificado en vivo). Si no se prueba, el plan dice que se acuña una y nombra la key vieja de su familia (o que no encontró ninguna). Si Neon no deja listar las keys, se detiene nombrándolo, sin acuñar.
- **Qué enseña, por variable:** estado (`igual` · `distinta` · `sólo local` · `sólo en el deploy` · `ilegible`), la huella de cada fuente, dónde la escribiría y qué se confirmará. La huella es un HMAC con llave aleatoria de esa corrida: compara dentro de un plan y no sirve entre corridas. Además: los secrets de GitHub Actions del repo (por nombre, con tu sesión de `gh`) que **no** estarían en `develop:/ci`; los scripts de `package.json` que cablearía y los que tu equipo customizó; los syncs de Railway propuestos y los entornos de Railway sin nombre igual; las `sensitive` con su clase.
- `--json` imprime el mismo plan como JSON (nombres y huellas, nunca valores); no se combina con `--apply`. `--team=<id>` es el team de Vercel (default: `VERCEL_TEAM_ID` del rail). `--vercel-project <id>` (también `=<id>`) va con el plan o con `--apply`, nunca con `--decline`; el `--apply` registra el elegido, así que las corridas siguientes ya no lo necesitan.

### `factory vault adopt --apply`

Antes de escribir nada resuelve todo lo que se pregunta o bloquea (syncs de Railway, hosts, `sensitive`, deploy vacío; abajo). Después, orden fijo: proyecto de la bóveda con sus miembros (o el que ya existe con ese slug) → protección contra borrado encendida (`fx-secrets-vault §6`) → **importar primero** (`main`/`develop` desde el deploy, `local` desde `.env.local`) → la key de Neon del proyecto, si hay que acuñarla (sólo esa key y `NEON_PROJECT_ID` a `develop:/ci`; cero `gh secret set`) → syncs de Vercel y GitHub, luego los de Railway confirmados → vínculo en `.timekast/provision.json` (conserva el resto del bloque `vault`, como las keys de Neon por revocar, y fusiona el bloque `resend`: la key de Resend que reemplaza queda pendiente de revocar) → revocación de la key de Neon anterior, sólo con la entrega a GitHub probada (mismas reglas que _Pendientes_ de `--remint`) → wrapper en `package.json` (diff impreso antes) → `.env.local` a `.env.local.pre-vault.bak`. Una falla en cualquier paso deja `.env.local` intacto; correrlo otra vez adopta lo que ya existe.

- **Tokens del rail** en `.env.local` o en un deploy nunca se importan, con la huella que tengan (lista en `fx-secrets-vault §8`).
- **`SHORTIO_API_KEY` en modo Factory** (sólo en el checkout del Factory; no aplica a tu repo): la copia al `develop:/ci` del Factory con el valor del rail (`fx-secrets-vault §2`) exige, además de las dos señales del modo, que el slug resuelto sea `timekast-factory` **y** el repo `TimeKast/TimeKast-Factory`; si no, avisa y no la propone. Si `rail-timekast` tiene cualquier sync cuyo destino es ese repo, el `--apply` se detiene nombrándolo.

- **Confirmaciones una por una:** cada diferencia, cada clave que no se importa (un token del rail o una clave sólo-local en un deploy: el sync la quita de ahí), el reemplazo de la key de equipo de Resend por una propia del proyecto, y cada sync de Railway. **Sin terminal no se confirma nada:** se detiene nombrándolas, sin escribir.
- **Primer sync sobre un deploy vivo:** todo lo que un destino tiene se escribe en la bóveda **antes** de crear su sync, y justo antes de crearlo se re-comprueba por nombres que cada clave del destino esté en su carpeta. Si falta alguna —típicamente un secret de GitHub que no está en `develop:/ci`— se detiene **antes de crear cualquier sync**, nombrándola; se agrega en la bóveda (o se borra del destino) y se repite.
- **Bloquean el `--apply` sin escribir:** una variable ilegible que no es `sensitive`; una variable de preview atada a una rama; dos servicios de Railway que leerían la misma carpeta con valores distintos; un bloque `vault` que apunta a otro proyecto que el del slug.
- **Variables `sensitive` de Vercel:** _derivable_ (`DATABASE_URL` desde Neon; origen y rpID desde los dominios del proyecto, con la regla de hosts del plan) · _rotable_ (`AUTH_SECRET` lo genera el CLI tras confirmar y avisar que cierra las sesiones; OAuth y API keys se reemiten en el proveedor y se cargan en la bóveda — hasta entonces se detiene nombrándolas) · _sellada_ (`MFA_ENCRYPTION_KEY` y toda clave con forma de llave de cifrado). Una `sensitive` que el kit no conoce se pregunta; sin terminal o sin un "sí" explícito es **sellada**.
- 🔴 **Llave sellada que no está en la bóveda:** se detiene **antes de escribir nada** (la única pregunta previa es la de una `sensitive` desconocida), imprime la explicación (qué variable, por qué no se regenera, el deploy puente, que lo autoriza y supervisa una persona, volver a correr) y sale con **código 3**. Nunca genera una llave. Si la sellada ya está en su carpeta, la corrida sigue y no la sobrescribe.
- **Una clave que se carga a mano y el proyecto de la bóveda no existe** (una llave sellada, o una credencial rotable que se reemite en su proveedor): el mensaje lo dice y da el paso concreto — crear el proyecto tú, con tu sesión, con el slug del repo, los entornos `main`, `develop` y `local`, y la carpeta destino de la clave. El `--apply` siguiente lo adopta por su slug y completa lo demás: miembros, protección contra borrado e import.
- **Wrapper:** sólo reescribe los scripts cuyo valor es el que shippeó el kit; los customizados se nombran y corren sin la bóveda hasta que les antepongas `node scripts/tools/with-vault.mjs`.
- **`.env.local`:** no se renombra si ya existe el `.bak` (avisa: retíralo tú, Next.js lo carga) ni si git no ignora el `.bak` (avisa: agrega `.env*` al `.gitignore`).
- **Un repo que había declinado:** el plan lo avisa y el `--apply` borra la marca al guardar el vínculo.

### `factory vault adopt --decline`

Registra en `.timekast/provision.json` que el repo **no** entra a la bóveda (si el archivo no existe, nace con esa marca y sin bloque `vault`). No toca `.env.local` ni `package.json` ni consulta ningún servicio. Va solo: con `--apply`, `--json` o `--team` se rechaza. Repetirlo no cambia nada; en un repo con bloque `vault` se niega. `provision --adopt --force` conserva la marca.

### El modo en `doctor` y `status`

Los dos reportan la relación del repo con la bóveda, leída de `.timekast/provision.json`:

| Modo          | Cuándo                                                               | `doctor` sugiere `vault adopt` |
| ------------- | -------------------------------------------------------------------- | ------------------------------ |
| `bóveda`      | Hay bloque `vault`                                                   | No                             |
| `declinado`   | Está la marca de `--decline`                                         | No — deja de insistir          |
| `sin decidir` | Ninguna de las dos                                                   | Sí, si hay lockfile            |
| `no aplica`   | Perfil `core` (lockfile) o falta `scripts/tools/with-vault.mjs`      | No                             |

`status` reporta el modo y nunca sugiere. Con un `provision.json` ilegible no inventa el modo: nombra el remedio y sale 0. En modo `bóveda` los dos agregan el **drift bóveda ↔ Vercel** por huella (`main` ↔ production, `develop` ↔ preview, referencias resueltas): `igual` · `distinta` · `sólo en la bóveda` · `sólo en el deploy` · `ilegible` (una `sensitive`). Una clave `distinta` o `sólo en el deploy` es la huella de un segundo escritor. **Con destino Railway** el drift compara contra sus entornos (`main` ↔ `main`, `develop` ↔ `develop`) usando **sólo** los ids del bloque `railway` —`PORT` se compara como cualquier clave, las `RAILWAY_*` que inyecta la plataforma no—; sin bloque sale "no verificable", y el bloque se reconstruye con `factory provision --adopt --force --target=railway` (el `--force` hace falta porque el state ya existe). Con destino Vercel, Railway sale "no verificado". Es un paso aparte con tiempo acotado: sin sesión, sin red, sin proyecto de Vercel o si vence, sale "no verificable" con su causa y el comando no falla; en CI (`CI`, `VERCEL`, `RAILWAY_ENVIRONMENT`) no se intenta. `status --json` y `doctor --launcher --json` lo llevan como campo aditivo.

### `factory vault sync railway`

```bash
npx @timekast/factory vault sync railway --project <id> --service <id> --env <main|develop> [--railway-env <nombre>]
```

Crea el sync de la carpeta raíz de un entorno de la bóveda (`main:/` o `develop:/`; `local` nunca se sincroniza) hacia un servicio de Railway, con `RAILWAY_TOKEN` del rail. Exige que el repo tenga bloque `vault`. Acepta `--flag valor` y `--flag=valor`; falta de un flag requerido o uno desconocido → aborta sin crear nada.

- **Resolución del entorno de Railway:** por default, el que se llama **igual** que `--env`; `--railway-env <nombre>` cuando difiere (p. ej. `production`). Si Railway no lo tiene, aborta **nombrando los que sí existen**.
- **Proyecto y servicio** se validan con la API GraphQL de proyectos; uno que no existe aborta nombrándolo (un proyecto en la cuenta de Railway de un cliente usa otro token y este comando no lo maneja).
- **Importa antes de crear:** lo que sólo tiene Railway se escribe en la bóveda, con re-comprobación por nombres justo antes; un valor distinto, una clave sólo-local o un token del rail presentes en Railway se confirman uno por uno, y sin terminal no se escribe nada. Las `RAILWAY_*` que inyecta Railway nunca se importan.
- **App connection:** reusa la conexión de tipo `railway` de la organización en la bóveda; **no la crea** (guardaría una copia del token del rail). Si falta, aborta antes de escribir — la crea un admin.
- **Idempotente:** un sync existente se adopta sólo si coincide en fuente, borrado en destino encendido, auto-sync encendido y sin esquema de claves; si no, lo nombra y no lo toca. Nace con borrado en destino encendido.

### `factory vault deploys`

```bash
npx @timekast/factory vault deploys [--deploy <slug>] [--apply] [--yes]
```

Para un repo que despliega el mismo código una vez por cliente. El modelo —proyectos, forma completa del registro `.timekast/deploys.json`, claves de valor único, precedencia, comprobación de valores ajenos, reglas de los syncs— vive en [`fx-secrets-vault §6`](../fx-secrets-vault/SKILL.md); aquí sólo el comando. Exige que el repo tenga bloque `vault`. Acepta `--flag valor` y `--flag=valor`; un flag desconocido aborta.

- **`--deploy <slug>`:** sólo ese despliegue se escribe; los demás se **leen** igual, porque la comprobación de valores ajenos los necesita.
- **Sin `--apply` — el plan:** por despliegue y por entorno (`main`, `develop`), el **nombre** de cada clave con su acción (`añade` / `cambia`, y si `develop` la lleva como referencia a `main`), las claves que el proyecto tiene fuera del cálculo (informativas: nunca se borran), las claves propias sin valor todavía, si el proyecto se crea o ya existe, y cada sync (`se crea` / `ya existe` / `pendiente — faltan valores propios: …`). Sin cambios, dice "Nada que cambiar en la bóveda.". Nunca un valor.
- **Con `--apply`:** si va a **cambiar** valores ya guardados, primero los lista (despliegue, entorno y clave) y pide una confirmación; sin terminal sólo `--yes` la da. Después, en orden: crea los proyectos que faltan (layout, miembros, protección contra borrado) y anota el id de cada uno en `.timekast/deploys.json` en ese momento —lo dice en la salida; el archivo queda sin commitear—, escribe sólo lo que cambió, y crea los syncs que no están pendientes. Correrlo otra vez no crea ni reescribe nada que no haya cambiado.
- **`--yes`:** sólo con `--apply`; confirma sin terminal el cambio de valores ya guardados. Las altas nunca se preguntan.
- **Cuándo un aborto no escribe nada:** registro, sesión, ids anotados, plantilla, valores ajenos, destinos de los syncs (incluido que cada proyecto de Vercel esté conectado a este repo) y la confirmación se resuelven **antes** de la primera escritura; un aborto ahí deja la bóveda como estaba. Una falla después (crear un proyecto, escribir, crear un sync) deja lo ya escrito y lo nombra; repetir el `--apply` lo adopta y completa el resto.

**Errores que nombra** (siempre nombres de clave, proyecto, entorno o destino; nunca un valor):

| Error | Qué dice | Qué hacer |
| --- | --- | --- |
| Falta el registro | Nombra `.timekast/deploys.json` | Créalo y commitéalo (forma en `fx-secrets-vault §6`) |
| Registro ilegible o con un campo que no admite | Nombra el archivo y el campo | Corrige el archivo |
| Sin bloque `vault` | El principal da nombre a los demás | `factory vault adopt` (o `provision` si es nuevo) |
| Sin sesión | Nombra `infisical login --domain=<dominio>`; no intenta otra vía | Entra y repite |
| Token sin persona detrás | El token no corresponde a una persona | Entra con tu sesión (`infisical login --domain=…`) |
| Slug desconocido o inválido | Nombra los slugs válidos del registro | Usa uno de ellos |
| Nombre reservado, o plantilla sin el prefijo `<repo>-` | Nombra el proyecto | Cambia el slug o `template.project` |
| Falta la plantilla | Nombra el proyecto plantilla | Créala (receta en la guía de retrofit, caso 6) y anota su id, o pide acceso |
| Proyecto existente sin id anotado | Nombra el proyecto y el campo (`deploys[i].vault.projectId` o `template.projectId`) | Verifica en el dashboard que es de ese cliente y anota su id; si no es suyo, cambia el slug |
| El id anotado no coincide | Nombra el proyecto y el campo | Corrige el registro con el id del proyecto correcto |
| Id anotado de un proyecto que no se ve | Las dos causas: ya no existe, o no tienes acceso | Pide acceso, o quita el campo para que el `--apply` lo cree |
| Sin acceso al proyecto de un despliegue | Nombra el proyecto y las dos causas: no existe todavía, o tu sesión no tiene acceso | Créalo corriendo sin `--deploy` (o con `--deploy <ese slug>`), o pide acceso a un admin |
| Plantilla contaminada | Nombra cada clave y el motivo | Quítala de la plantilla |
| Valor ajeno | "`KEY` en `develop` de `a` es de `b`" (o de `principal`) | Corrige el valor en el despliegue que lo tiene mal |
| Railway sin el proyecto, el servicio o el entorno | Nombra cuál falta (o que vive en la cuenta propia de un cliente) | Corrige el registro |
| Proyecto de Vercel no conectado a este repo | Nombra el despliegue, el id del proyecto de Vercel, el repo del remote `origin` y el campo (`deploys[i].vercel.projectId`) | Corrige el id en el registro, o conecta ese proyecto a este repo en Vercel |
| Sin remote `origin` y un despliegue con Vercel | Nombra el despliegue y el id del proyecto de Vercel: no hay contra qué comprobar la conexión | Configura el remote `origin` y repite |
| Otro proyecto ya sincroniza el destino | Nombra ese proyecto (principal, plantilla u otro despliegue), el sync y el destino | Un destino tiene un solo escritor: quita uno de los dos syncs |
| Sync existente distinto del esperado | Nombra el sync y la diferencia (origen, borrado, auto-sync, esquema de claves) | Corrígelo o bórralo en la bóveda y repite |
| Destino con claves que la bóveda no tendrá | Nombra el destino y las claves (el primer sync las borraría) | Decláralas propias del despliegue o ponlas en la plantilla |
| Sin conexión de Vercel o de Railway en la organización | Nombra el tipo de conexión | La crea un admin de la bóveda |
| Cambia valores guardados, sin terminal y sin `--yes` | Lista las claves y pide terminal o `--yes` | Revisa la lista y repite en una terminal o con `--yes` |
| Un proyecto apareció entre el plan y la escritura | Nombra el proyecto; no lo adopta ni escribe nada en él | Verifica en el dashboard que es de ese despliegue, anota su id y repite |
| Se creó el proyecto pero no se pudo anotar su id | Nombra `.timekast/deploys.json`, el slug y el id creado (no es secreto) | Anótalo a mano en `vault.projectId` de ese despliegue y repite |
| No se pudo crear un proyecto que el plan marcaba "se crea" | Las dos causas: existe con ese slug y no tienes acceso, o la bóveda no dejó crearlo; y qué proyectos ya se crearon | Pide acceso (y anota su id tras verificarlo), o resuelve la causa que nombra, y repite |

---

## Canal beta / stable

El cerebro tiene un **canal beta** (estilo dist-tag `beta` de npm) para probar un pre-release del `.claude/` en tu derivado real **antes** de que sea estable.

- **Entrar:** `factory beta` (= `factory update --beta`) instala el último pre-release `-beta.N`.
- **Salir:** `factory update --stable` regresa al estable. **La salida es explícita** — no emerge sola del semver.
- El beta es **`.claude`-only**: bumpea solo `agentKitVersion`; tu `factoryVersion` (birth de `src/`) queda intacto.
- El estado vive en `.timekast/lockfile.json` (marca `beta`); `status`/`doctor` muestran un **banner BETA** cuando estás en el canal.
- `--beta`/`--stable` son **mutuamente excluyentes**. En **headless**, un `update` **sin** flag de canal sobre un repo beta se **rechaza** (no degrada en silencio a estable); un `--beta`/`--stable` **explícito** sí opera headless — el flag es la intención.

---

## Troubleshooting

- **El preflight de org falla.** El CLI exige, en orden: `gh` instalado → `gh auth status` válido → ser miembro del org TimeKast. El mensaje de error te dice qué arreglar (`gh auth login`, etc.).
- **404 "no eres miembro" siendo miembro (membresía privada).** Si tu token no tiene el scope `read:org`, tu membresía privada es invisible y el check da un **404 falso-negativo**. Fix: `gh auth refresh -s read:org` y reintenta. El mensaje del CLI ya incluye este hint.
- **`provision` o `env push` dicen que no hay sesión o que no tienes acceso al rail.** Las dos fallas se ven parecidas y se arreglan distinto: primero `infisical login --domain=…` (la sesión caduca), y sólo con la sesión viva, pedir acceso a `rail-timekast` a un admin de la bóveda. El mensaje de "sin acceso" también cubre que **el proyecto configurado no exista**: si ya tienes acceso, compara el id que nombra con `rail.projectId` de `.claude/policy/vault.json` — distinto, tu CLI está viejo (`npx @timekast/factory@latest …`); igual, el proyecto cambió en la bóveda (avisa al equipo del Factory); un `rail-<cliente>` se revisa en el campo **Rail del cliente** de `project-config.md` → [`fx-secrets-vault §3`](../fx-secrets-vault/SKILL.md).
- **"El bloque `vault` de `.timekast/provision.json` no tiene la forma esperada".** El bloque existe pero está mal formado (`vault: null`, sin `projectId`, sin alguno de `envs.main`/`envs.develop`/`envs.local`). El CLI no decide a ciegas si el repo vive en la bóveda: `provision`, `env wizard`, `invite-admin` y los escritores de `.env.local` se detienen, **aun con `--force` o `--no-vault`** — leído como "sin bóveda", crearían un segundo proyecto en la bóveda o escribirían secretos a `.env.local`. Se arregla a mano en `.timekast/provision.json`: si el repo está en la bóveda, se escribe el bloque con su forma (`projectId` es el id del proyecto del repo en la bóveda, mismo slug; `envs` es `{ "main": "main", "develop": "develop", "local": "local" }`); si no lo está, se borra el bloque. `--adopt` no lo arregla: conserva el bloque `vault` del state que reemplaza.
- **"No pude leer `.timekast/provision.json`"** (existe, pero no se puede abrir o no es JSON válido). El archivo va commiteado: restáuralo desde git (`git checkout -- .timekast/provision.json`) o corrígelo a mano. **Ni** con `--adopt` **ni** con `--force`: sin poder leerlo, el CLI no sabe si el repo vive en la bóveda ni cuál es la key de correo del proyecto — el adopt lo dejaría tratado como sin bóveda, y `--force` lo borraría, dejaría huérfana esa key y crearía un segundo proyecto en la bóveda. Por eso `provision` se niega a correr sobre un archivo ilegible en cualquier modo, `--force` y `--dry-run` incluidos. (Un JSON legible con estructura inesperada es otro caso: ahí `--force` sí lo descarta, conservando sus bloques `vault` y `resend`.)
- **Railway — cada caso lo nombra el CLI y ninguno recrea lo que existe:** la app de GitHub de Railway sin acceso al repo (imprime el enlace de instalación; se instala y `--resume`) · `RAILWAY_TOKEN` ve más de un workspace, o ninguno (no elige: revisa el token de `rail-timekast`) · el repo está en las dos plataformas o hay un rail de cliente declarado (se detiene y pregunta: pasa `--target`) · un proyecto conectado al repo que el state no conoce, o un state sin bloque `railway` (`--adopt --force --target=railway`: con state presente, `--adopt` a secas se niega a reescribirlo) · se venció la espera de nombres antes de conectar el repo (`--resume`) · `develop` falta al retomar (créalo con el servicio `web` en el dashboard, sin copiar variables, y `--resume`) · un CNAME o TXT que ya apunta a otro destino (no lo reescribe: corrígelo en Cloudflare y `--resume`) · el token "falla" en `me` estando vivo (es de equipo: pruébalo con `projects`, `fx-secrets-vault §4/§5`) · healthcheck pendiente (aplica `.claude/docs/retrofits/public-health-and-env-label.md` y `--resume`). Tabla con el porqué de cada uno → `tk-provision` § Troubleshooting de Railway.
- **`new` falla con 403 (sin "Repository creation").** Tu cuenta no tiene el privilegio org de crear repos. Lo habilita el **org owner** (Org Settings → Member privileges), no tú ni el agente.

---

## `publish` / `unpublish`

El mismo binario lleva `publish`/`unpublish` (publicar propuestas/mockups del derivado a la URL pública). Eso es **ops del derivado, no distribución del cerebro** → su SSOT propio es `.claude/docs/proposal-publishing.md`. No se documenta aquí para evitar doble fuente.

---

## Para detalle (citar, no duplicar)

| Tema                                                          | Fuente                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Comandos / perfiles / versión dual / lockfile (detalle)      | `.claude/docs/distribution.md` (viaja contigo)                   |
| `publish` / `unpublish` (ops del derivado)                   | `.claude/docs/proposal-publishing.md` (viaja contigo)            |
| Lado build/origin del CLI (cómo se construye y se publica)   | `fx-distribution` (origin-only — **no** viaja a tu derivado)     |

---

_TimeKast Factory — fx-factory-cli (consumer-facing, ships via the `fx-*` glob)_

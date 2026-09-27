# TimeKast Starter Kit — Changelog

> Registro de cambios y mejoras del Starter Kit.

---

## [13.0.1] - 2026-09-25 — Lo que destapó la primera prueba en vivo

### Fixed

- **Los proyectos nuevos ya no nacen con el typecheck roto.** `tests/unit/policy/quality-gates.test.ts` viajaba a todo derivado `full` desde v12.0 e importa `distribution/build-dist`, que no viaja: `tsc` fallaba, el pre-push bloqueaba el push y `factory provision` se detenía al pushear `main`. Sale del perfil `full` (es un test del registro del kit, `CORE.md §5`), y una guarda en `build-dist.test.ts` falla si otro archivo que viaja vuelve a importar de `distribution/`. ⚠️ Un derivado nacido entre v12.0 y v13.0 tiene ese archivo y `factory update` no toca `tests/`: bórralo a mano (`git rm tests/unit/policy/quality-gates.test.ts`).
- **Un commit por pathspec ya no deja los adapters "borrados" en `git status`.** `.husky/post-commit` repara el índice que deja `git commit -- <paths>`, pero comparaba el worktree con `git diff HEAD`, que ve como borrado un archivo que el pre-commit **creó** durante el commit (los adapters de otros agentes): quedaban `D` en el índice y `??` en disco después de cualquier commit de `provision` o de un agente. Ahora compara por hash del contenido; el trabajo que otro agente dejó staged sigue sin tocarse.
- **`provision` con destino Railway ya no se detiene por una conexión de otro proyecto.** La bóveda lista también las conexiones con Railway acotadas a un solo proyecto (un cliente con infraestructura propia), y el CLI las contaba como de la organización: con la del equipo más una de cliente, todo alta en Railway paraba como "ambigua". Ahora solo cuentan las de la organización; dos de la organización del mismo tipo siguen siendo ambiguas. (`fx-factory-cli`)
- **Mensajes de `provision` y `env push` que confundían.** El cierre de un `--resume` decía `lifecycle: live` en un proyecto `ephemeral` (mostraba el flag de la corrida, no el del state); el resumen final repetía el plan con "＋ crear" como si faltara todo (ahora dice "Resumen de esta corrida" con "✔ hecho"); y `env push` en un repo con destino Railway decía que las variables llegan a Vercel (ahora nombra Railway y sus entornos).

## [13.0.0] - 2026-09-25 — Los secretos viven en la bóveda

> ⚠️ **Antes de actualizar:** cada persona necesita `infisical login --domain=https://secrets.timekast.com` y acceso al proyecto `rail-timekast` de la bóveda. Sin eso, `provision`, `env push`, `doctor --launcher` y los scripts de `/proposal` no pueden leer los tokens de la organización. El paso a paso está en [`retrofits/secrets-vault-adoption.md`](./retrofits/secrets-vault-adoption.md). Versiones de este release: kit `13.0.0`, CLI `2.0.0`, launcher `2.0.0`.

### Fixed

- **E2E: un `E2E_PARENT_BRANCH` declarado ya no cae en silencio a producción.** Si la branch declarada no se resuelve en Neon (no existe, 403, timeout o red caída), la corrida aborta antes de crear nada, con la causa y el arreglo en el mensaje. Antes hacía el POST sin `parent_id` y Neon clonaba la branch default (`main`, producción) en una corrida que terminaba en verde. Sin la variable, nada cambia. ⚠️ Un derivado cuyo `e2e.yml` declara una branch que no existe en su proyecto de Neon verá su E2E en rojo tras `factory update`: créala o quita la línea para aceptar la default a sabiendas.
- **El pool de runners está abierto a todo repo privado de la org, y la plantilla ya no dice lo contrario.** El encabezado de `e2e.yml.example` sugería que un repo "fuera del runner group" debía pasarse a `ubuntu-latest` con una sola edición; no hay alta por repo, y en hosted también hace falta `--with-deps`. Corregido ahí, en `self-hosted-e2e-pool.md` y en `sk-e2e §1.2`.

### Added

- **Los proyectos nuevos nacen con sus secretos en la bóveda, no en `.env.local`.** `factory provision` crea primero el proyecto del repo en la bóveda (entornos `main`, `develop` y `local`, carpetas `/ci`, miembros y protección contra borrado) y escribe ahí todo lo que acuña. Los scripts locales (`dev`, `build`, `db:*`, `test:e2e`, `setup:e2e`…) pasan por `scripts/tools/with-vault.mjs`, que inyecta el entorno con la sesión de la persona. Tres syncs nativos son el único escritor de cada destino: `main:/` → Vercel production, `develop:/` → Vercel preview, `develop:/ci` → secrets de GitHub. Con bóveda, `env push` se niega nombrando el proyecto, y `setup:e2e` lee el entorno `develop`. `--no-vault` conserva el modo anterior. (`fx-secrets-vault`, `fx-factory-cli`)
- **Cada proyecto recibe su propia key de Resend**, con o sin bóveda, en lugar de compartir la del equipo.
- **Railway como destino de deploy.** `factory provision --target=railway` da de alta el proyecto con sus entornos atados a `main` y `develop`, dominios y sync desde la bóveda (Railway exige bóveda). `--resolve-target` descubre dónde vive un repo sin `target` guardado (códigos 0 · 10 sin destino · 11 ambiguo · 12 token ilegible), y `--adopt`/`--destroy` cubren Railway. `/deploy` observa el deployment real en Vercel **o** Railway según el `target`. (`tk-provision`, `tk-deploy`)
- **`factory vault deploys`** — un proyecto de bóveda por despliegue para repos que se despliegan una vez por cliente, a partir de una plantilla, con registro sin credenciales en `.timekast/deploys.json` y syncs de cada cliente solo a su propio destino.
- **`/api/health` pública con caché y etiqueta de entorno por `NEXT_PUBLIC_APP_ENV`** en proyectos nuevos: el healthcheck anónimo de Railway ve un 200, y los errores de `develop` ya no llegan a Sentry como producción. Retrofit manual para derivados existentes: [`retrofits/public-health-and-env-label.md`](./retrofits/public-health-and-env-label.md).
- **Instrucciones para otros agentes de código, generadas.** El pre-commit proyecta `CLAUDE.md` y las rules del kit a `AGENTS.md` (Codex), `.cursor/rules/timekast.mdc`, `.github/copilot-instructions.md` y `.hermes.md`. ⚠️ El primer commit después del update los agrega; se apagan por proyecto y por runtime con `.claude/adapters.project.json`. Un archivo sin la marca `@generated` es del proyecto y no se toca.
- **Rules por un solo `INDEX`.** `CLAUDE.md` importa `@.claude/rules/INDEX.md`, que importa las seis rules. `factory update` agrega esa línea a un `CLAUDE.md` editado sin quitar nada, y `--verify` reporta en qué caso está cada repo. ⚠️ Un `CLAUDE.md` que conservaba los seis imports queda con las rules duplicadas: la guía [`retrofits/claude-md-and-agent-adapters.md`](./retrofits/claude-md-and-agent-adapters.md) lleva al agente a limpiarlo con el usuario, y a decidir los adapters.
- **Launcher: el panel de secretos muestra el estado de la bóveda** (lista · sin sesión, con el comando de login · sin acceso al rail · claves faltantes), leído de `doctor --launcher`. Ya no pide un archivo `.env`.
- **`factory vault adopt` — un repo que nació antes de la bóveda de secretos pasa a ella con un comando.** Sin `--apply` sólo enseña el plan: inventario de `.env.local`, Vercel production/preview y Railway por **nombre y huella**, nunca por valor, con el estado de cada variable (`igual` · `distinta` · `sólo local` · `sólo en el deploy` · `ilegible`). Con `--apply` crea el proyecto del repo con sus miembros, **importa primero** (`main` y `develop` desde el deploy, `local` desde `.env.local`; cada diferencia la confirmas tú), crea los syncs, guarda el vínculo, cablea el wrapper mostrando el diff y renombra `.env.local` a `.env.local.pre-vault.bak`. Si un secret de GitHub Actions no está en `develop:/ci`, se detiene antes de crear cualquier sync nombrándolo. Las variables `sensitive` de Vercel se clasifican (derivable · rotable · sellada); ante una llave **sellada** (`MFA_ENCRYPTION_KEY` o cualquier llave de cifrado) se detiene sin escribir nada, sale con código 3 y explica el deploy puente que una persona autoriza y supervisa — nunca genera una llave nueva. Perfil `core`: no se ofrece.
- **`factory vault adopt --decline`** registra que el repo **no** entra a la bóveda: sigue con `.env.local` y `env:push`, y `doctor` deja de proponerlo. Adoptarlo después sigue siendo posible y borra la marca.
- **`factory vault sync railway --project <id> --service <id> --env <main|develop> [--railway-env <nombre>]`** crea el sync de un entorno de la bóveda a un servicio de Railway, importando antes lo que sólo tiene Railway. `--env` busca en Railway el entorno con el mismo nombre; `--railway-env` cuando difiere; sin coincidencia aborta nombrando los que existen. `vault adopt` lo propone solo para los entornos que se llaman igual.
- **`doctor` y `status` reportan el modo del repo frente a la bóveda** (`bóveda` · `declinado` · `sin decidir` · `no aplica`) y, en modo `bóveda`, el drift bóveda ↔ Vercel por huella. Railway sale "no verificado". Sin sesión o sin red el drift es "no verificable" y el comando no falla.
- **Guía de retrofit [`retrofits/secrets-vault-adoption.md`](./retrofits/secrets-vault-adoption.md)**, indexada en `legacy-migration.md`: onboarding de cada persona y un caso por situación (repo al día, `.env.local` viejo, scripts forkeados, Railway, llave sellada, varios despliegues, declinar, deploy conectado y vacío).
- **Los proyectos de la bóveda nacen protegidos contra borrado.** `factory provision` crea el proyecto del repo con la protección de la instancia encendida, y la enciende en uno que no la tenía cualquier corrida de alta o reanudación (`--resume`, `--remint`) y `vault adopt --apply`. **Consecuencia operativa:** `provision --destroy` de un stack `live` se detiene antes de tocar cualquier proveedor mientras la protección esté encendida (o no se pueda leer): hay que apagarla **a mano** en el dashboard de la bóveda y repetir. En un stack `ephemeral` el CLI la apaga solo y lo dice.
- **`provision --remint` rota la key de Neon del CI con prueba de entrega.** La nueva nace con su propio nombre, `<slug>-e2e-<AAAAMMDDhhmmss>`, y la anterior se revoca por id sólo cuando la nueva llegó a GitHub (sin bóveda, los tres `gh secret set` terminaron bien; con bóveda, el sync de `develop:/ci` reportó un job exitoso posterior a la escritura). Sin prueba a tiempo, los ids quedan pendientes en el bloque `vault` de `.timekast/provision.json` —sólo ids—, `factory doctor` los reporta, y una corrida posterior de `provision` con bóveda los liquida. La key vigente de la familia nunca se revoca.
- **Logos de propuestas en un lugar estable: `assets.timekast.com`.** `scripts/tools/proposal-asset-upload.sh <archivo> <slug> [name]` sube un logo al bucket público del org y devuelve su URL (`https://assets.timekast.com/<slug>/logo.png`). Gamma guarda las imágenes por referencia, así que una URL con hash o firmada rompía el deck después. El token que usa, `PROPOSAL_ASSETS_R2_TOKEN`, solo lee y escribe objetos de ese bucket; y sin `--replace` el script no pisa un logo ya publicado, porque los decks viejos lo siguen referenciando.
- **`/estimate` entra al kit — el cerebro ya sabe cotizar.** La cotización por story points vivía solo en la configuración global de una máquina; ahora viaja con `.claude/` (`tk-estimate`). La fórmula es precio de dirección (puntos × tarifa) + Capacidad de Factory como línea visible + una bolsa de cobertura de riesgo (11 señales con cita textual → 10-40%), con piso único, siempre en rangos Optimista / Realista / Conservador. Puntúa desde el backlog, el brief o un scoping rápido, y escribe `project/planning/00b_INTERNAL_ESTIMATE.md`. Las tarifas calibradas viajan como `rates.defaults.yml`, sin anclas ni nombres de clientes; un override por host (`~/.claude/estimate-rates.yml`) gana campo por campo.

### Changed

- ⚠️ **`provision` sobre un repo ya aprovisionado sin bóveda se detiene** (incluye `--resume`, `--remint` y `--domain`) hasta que se decida: adoptar la bóveda (`factory vault adopt`) o seguir sin ella con `--no-vault`.
- **Launcher: el aviso de retrofits después de un update ahora dice qué hacer.** Además de contar las guías nuevas, el diálogo explica que el update no pudo aplicar esos cambios solo y recomienda abrir Claude Code en el repositorio y pedirle que revise las guías de `.claude/docs/retrofits/` y aplique las que correspondan.
- **E2E: modo opcional de base vacía, por repo (`e2e.config.json`).** Con `{ "emptyBranch": true }`, el runner vacía la branch temporal justo después de clonarla (todos los schemas del usuario, incluido el registro de drizzle) y corre `pnpm db:migrate`, así que la cadena completa de migraciones se prueba en cada corrida y ningún spec depende de filas que solo estaban en develop. Los proyectos nuevos nacen con el archivo en `true`. Los existentes no cambian: `factory update` nunca crea ese archivo, y en terminal interactiva pregunta una vez si se activa (sí → `true`, no → `false`, sin volver a preguntar). Se revierte con `false` o borrando el archivo. Un archivo inválido aborta la corrida nombrándolo. Guía: [`retrofits/e2e-empty-branch.md`](./retrofits/e2e-empty-branch.md). (`sk-e2e`, `fx-factory-cli`)
- **E2E: una corrida local de un repo con bóveda siempre lee la bóveda.** Si el runner se lanza sin el wrapper (`tsx scripts/tools/e2e-runner.ts` directo, o un agente), se vuelve a lanzar por `scripts/tools/with-vault.mjs`. En un repo con bóveda ya no carga `.env.local`, y el mensaje de credenciales de Neon faltantes apunta a `develop:/ci` en vez de a `.env.local`. (`sk-e2e`)
- **`/proposal` saca decks con cara de la industria del cliente.** `gamma-generate.sh` acepta `GAMMA_IMAGE_STYLE`, `GAMMA_HEADER_LOGO_URL` y `GAMMA_MAKER_LOGO_URL` (sin ellos, lo que se manda a Gamma es idéntico a antes); `/proposal` propone por default una dirección visual a partir de la industria y el tipo de aplicación, pone el logo de TimeKast y el del cliente en todas las tarjetas, y pide a Gamma cifras completas (ya no "$500k"). (`tk-proposal`)
- **Las propuestas se versionan en git.** El skill ya lo decía y el `.gitignore` lo impedía: el `CP-commit` de `/proposal` fallaba con `paths are ignored`. El kit deja de ignorar `project/proposals/` — el historial es el registro de qué se mandó, cuándo y a qué precio. Los derivados nacidos antes conservan el patrón en su `.gitignore` (`factory update` no lo toca); el skill usa `git add -f` sobre el path exacto para que funcione igual, y quitar esas líneas queda a criterio del proyecto.
- **`/proposal` ya puede llevar precios.** Se retiró el guardrail antiguo de "cero precios": el Apéndice D ahora muestra la inversión confirmada en CP1, tomada de la §1 del estimate o dictada por quien cotiza. El desglose interno nunca llega al cliente. (`tk-proposal`)
- **Lo que sí era doctrina del kit se mudó a la `sk-*` que la ejecuta**, no se perdió: `400` vs `422` en rutas (`sk-api §9`); la forma de falla silenciosa de un regex roto en SQL crudo (`sk-db §4`); el patrón completo de *existence oracles* que `sk-security` solo apuntaba (ahora subsección propia); el protocolo de check-ins de Sentry para el watchdog de crons (`kb-cron-jobs § Who watches the watchdog`); `renderWithForm()` y los polyfills de Radix para jsdom (`sk-testing-nextjs §4.1-4.2`); el incidente de Oxide que tumba el build por CSS en backticks de markdown (`sk-skins §7.4` + comentario sobre las `@source not` de `globals.css`); y las recetas responsive de 375px, el estado en URL, los skeletons y el checklist de a11y (`sk-ui §11-§13`), más el cableado de UI de un CRUD (`sk-crud-scaffold §7.4`). Toda cita por número de sección en `/design`, los agentes `dsg-*`, el hook `config-use-client-lint.sh`, `SK.md` y los comentarios en código se movió con el contenido.
- **`SK.md §4.2` dice dónde caen los concerns de integración** en la pirámide de 3 capas (unit con mocks a Drizzle; DB real solo en E2E).
- **Perfil `core`:** los destinos de estos rescates (`sk-*`, `SK.md`) no viajan a `core`, así que ahí el retiro es neto. Es coherente con el perfil — cerebro sin `src/` — y con la tesis del cambio: lo que se retira es lo que el modelo ya trae. Consecuencia menor: cuatro de las cinco `kb-*` que quedan citan `sk-*` (y `kb-dataviz` también `SK.md`) en prosa; en `core` esos punteros no resuelven, y el linter los degrada a warning en un derivado.

### Removed

- **🔴 RUPTURA — `factory secrets` y `~/.claude/.env` ya no existen.** Los tokens de administración de la organización (el rail) viven en la bóveda, proyecto `rail-timekast`, y cada comando los pide ahí con la sesión de la persona; nada los lee de un archivo local. `factory secrets`, en cualquier forma, sale con error y no abre ni importa ningún archivo. **Prerrequisito nuevo** para `provision`, `env push`, `/proposal`, `/publish` y `/deploy`: `infisical login --domain=https://secrets.timekast.com` y acceso al proyecto `rail-timekast` (lo da un admin de la bóveda). Borra tu `~/.claude/.env` y cualquier `export` de esos tokens en tu shell: son copias que nadie rota. Onboarding paso a paso → [`retrofits/secrets-vault-adoption.md`](./retrofits/secrets-vault-adoption.md) §1.
- **🔴 21 de las 26 skills `kb-*` se retiran del cerebro.** Una medición de 180 días de transcripts mostró que ningún executor de `/implement` leyó una `kb-*`, y una revisión skill por skill confirmó por qué: conocimiento genérico que el modelo ya trae y que envejece (APIs con fecha, versiones congeladas), o una copia des-anclada de la doctrina que su `sk-*` hermana ya documenta contra archivos reales. Dos además afirmaban cosas falsas sobre el repo (`kb-tailwind-v4`: "tres temas universales", "sin OKLCH"; `kb-navigation`: campos de navegación que el kit nunca tuvo). Se van: `kb-api`, `kb-db`, `kb-debug`, `kb-design-system`, `kb-design-tokens`, `kb-flutter`, `kb-i18n`, `kb-mcp`, `kb-navigation`, `kb-notifications`, `kb-observability`, `kb-performance`, `kb-pwa`, `kb-python`, `kb-security`, `kb-security-audit`, `kb-seo-geo`, `kb-tailwind-v4`, `kb-testing-nextjs`, `kb-testing-patterns`, `kb-ui`. Quedan cinco, todas sin hermana `sk-*` y podadas a lo que un modelo no trae de fábrica: `kb-cron-jobs`, `kb-dataviz`, `kb-design-engineering`, `kb-ssot-registries`, `kb-visual-direction`.
- **Los pares `kb-*`/`sk-*` dejan de existir como convención viva.** El check `pair-cross-refs` del linter de skills conserva su mecanismo con la tabla vacía (`DEFAULT_PAIRS`) y la recibe por argumento, para un par futuro; la doctrina de `fx-skill-author` pasa a condicional.

> ⚠️ **Al correr `factory update` en un derivado, las 21 skills desaparecen del disco.** Un `pj-*`, un `SCR-*` ya emitido o un issue del backlog que cite `kb-ui §5` o `kb-db §6` queda con la referencia rota **sin señal automática**: el loader del linter salta `pj-*` a propósito y no lee `project/`. La acción manual —dos greps y una tabla de a dónde se mudó cada cita— está en [`retrofits/kb-skills-retirement.md`](./retrofits/kb-skills-retirement.md).

---

## [12.2.0] - 2026-09-12 — Dejar de asumir que el mundo tiene la forma que el kit le dio

> **Minor por contrato.** 55 commits desde `v12.1.0` y ningún `BREAKING CHANGE`: un derivado corre `factory update` y sigue funcionando.
>
> El hilo que une la ola: **tres frentes donde el kit daba por hecha la forma que él mismo había creado, y fallaba al tocar una realidad ajena.** Una passkey asumía un solo dominio, y en un proyecto con dominio interino + definitivo el usuario quedaba encerrado sin explicación. El layout asumía que la ventana es la pantalla, y en iOS el teclado dejaba la barra de navegación flotando sobre el contenido. Y `provision` asumía que todo proyecto de Neon nació de él: sobre uno adoptado acuñaba una credencial de alcance total creyéndola acotada. Alrededor: el CI de la org se mudó al pool de runners propio, y el Factory por fin corre su propio E2E.

### Added

- **🔴 Una passkey funciona en todos los dominios del proyecto (Related Origins).** Un derivado vive en dos hosts a la vez — el interino (`{slug}.timekast.com`) y el definitivo del cliente —, y WebAuthn ata cada credencial a su origen. Registrar la passkey en uno y luego entrar por el otro no fallaba con un mensaje: fallaba diciéndole al usuario que **no tenía** factores, con su llave en la mano. Ahora el inventario de factores es consciente del dominio, la lista de passkeys dice en qué host vive cada una, una credencial muerta se puede quitar, y el gate de MFA que se elevó solo vuelve a derivarse en vez de quedarse trabado.
- **🔴 El layout sigue la parte visible de la página en iOS.** Safari no reduce la ventana cuando abre el teclado: la tapa. Todo lo posicionado con `fixed` —la barra inferior, los headers— quedaba debajo del teclado o flotando sobre el contenido, y la app se sentía rota justo mientras el usuario escribía. El kit ahora mide la parte realmente visible y mantiene ahí su chrome fijo, oculta la barra inferior mientras el teclado está arriba, y no mueve la geometría mientras hay un dedo apoyado ni mientras la página rebota en un extremo — dos movimientos que se veían como un salto. Incluye un lector de diagnóstico para medir esto en un teléfono real, que es el único lugar donde se puede medir.
- **El CI de la org corre en el pool de runners propio.** `validate` y el E2E (tanto el template del kit como el del propio Factory, que hasta ahora no corría) se mudaron al pool self-hosted. Medido en dos repos: E2E de 9.0 a 3.9 min en uno y de 892 a 337 s en otro; `validate` de 7.3 a 2.7 min. Los workers y los retries de Playwright pasan a ser configurables por corrida, y el build respeta el límite de CPU del contenedor en vez de pedir todos los del host. Guía de adopción: `.claude/docs/retrofits/self-hosted-e2e-pool.md`.
- **La evidencia visual acepta la forma de cada proyecto.** Un proyecto puede declarar sus propios anchos de captura, marcar como decorativo un texto que no debe puntuar contraste (se archiva como *no aplica*, nunca como falla) y capturar una superficie que no es una ruta.
- **El registro de política valida sus propios globs.** Los conjuntos de paths de señal pasan a ser datos del registry, y un glob que no matchea ningún archivo avisa en vez de quedarse en silencio pretendiendo cubrir algo.
- **`EnvBadge` sirve fuera de Vercel**, para un derivado que no deploya ahí.

### Changed

- **El Factory vuelve a mantener migraciones, y sigue sin shippearlas.** Su DB deja de ser un estado que solo vive en un servidor: o el `.sql` está commiteado o no está. Los derivados siguen naciendo sin ninguna y generan su propio `0000` — la exclusión del perfil de distribución es load-bearing y está fijada por un test contra el `profiles.json` real (BR-FACTORY-005).
- **El runner de E2E borra solo los usuarios que cada worker creó**, en vez de barrer la cuenta compartida, y hay un fixture de sesión propia para los specs que mutan la cuenta sobre la que viajan. Un filtro de tests que no alcanza una fase la **salta** en vez de fallarla, y el stderr del servidor se clasifica por su nivel de log y no por una subcadena.

### Fixed

- **🔴 La API key de Neon que `provision` reparte por fin está acotada a un proyecto.** El minteo llamaba `POST /api_keys` con un `project_id` que ese endpoint no acepta, así que Neon lo ignoraba y devolvía una key **personal, con acceso a todas las organizaciones de su dueño** — y esa era la que viajaba a los GitHub Secrets de cada repo y al `.env.local` de cada derivado. Ahora sale de `POST /organizations/{org_id}/api_keys`, la única ruta que la acota: da 404 en cualquier otro proyecto y no puede borrar el suyo. La organización ya no se configura como id (se deriva de la key, y al crear se elige con `--neon-org`), y `--remint` reacuña la credencial de un proyecto ya provisionado — el camino para rotar una key revocada sin re-provisionar nada.
- **`provision` nunca vuelve a crear un proyecto de Neon que el estado ya nombra.** Sobre un stack adoptado creaba un segundo proyecto, vacío, y apuntaba ahí los secrets del repo y su `.env.local`. Además, el `DATABASE_URL` que sube ya no asume que la base se llama `neondb`: se lo pregunta al branch, porque en un proyecto adoptado la nombró su equipo — y un secret apuntando a una base inexistente hace correr el CI contra nada.
- **El chequeo opcional de `neonctl` ya no abre un login.** Corría `neonctl me` para saber si había sesión, y ese comando no falla sin ella: **inicia un login** y abre el navegador a media provisión. Headless era peor y no se veía: sin nadie que apruebe, el proceso esperaba y colgaba el preflight. Ahora se detecta por el archivo de credenciales.
- **El estado de provision del Factory no puede viajar a un derivado.** `.timekast/provision.json` no estaba excluido de los perfiles de distribución: nombra infraestructura viva, y shippearlo habría hecho nacer cada proyecto nuevo creyéndose ya provisionado contra los recursos del kit, con un `--destroy` apuntando ahí.
- **🔴 Dos RCE sin autenticar de Next, cerrados** — `16.2.11` → `16.3.5`. Uno en la API de optimización de imágenes y otro en servidores hosteados en Windows; `next` es dependencia de producción, así que todo derivado nacido de este kit los heredaba. Con ellos viajan `sharp` → 0.35.4 (advisories de libheif; el override y la dependencia se mueven juntos, porque el override es el que alcanza la copia que Next shippea), `fast-uri` → ^3.1.6 y un override nuevo de `browserslist` → ^4.28.7, los dos por la cadena de los plugins de bundler de Sentry. `@auth/core` sigue pineado y `next-auth` intacto: ese pin es lo que mantiene cerrado el account-takeover y este bump no tenía razón para moverlo.
- **El registro de advisories aceptados suma el segundo `nodemailer`** (`addressparser` cuadrático). No se puede cerrar — la versión con el fix queda fuera del peer de `@auth/core` — y se ancla por ID de advisory, no por módulo, para que el siguiente sí tenga que mirarse. La razón se verificó antes de escribirla: el kit expone un único destinatario (`to: string`) y el vector exige una lista fabricada.
- **El scroll fantasma que iOS agrega bajo `100vh`**, y la barra inferior anclada de vuelta al viewport del layout.
- **En `desktop/`, el CSS del renderer dejó de escaparse del paquete** (PostCSS buscaba configuración fuera de él y tumbaba los tests en CI), la suite dejó de afirmar el sistema operativo del desarrollador, y los instaladores del launcher caducan a un día en vez de acumularse.

## [12.1.0] - 2026-09-01 — Verificar antes de argumentar, y mirar antes de auditar

> **Minor por contrato, grande por alcance.** 218 commits desde `v12.0.0` y ningún `BREAKING CHANGE`: un derivado corre `factory update` y sigue funcionando. Cierra **13 epics más** del milestone v12.0 (21 de 24 en total); quedan `EPIC-01` (proyección multi-runtime), `EPIC-16` (primitivas de interfaz, en curso) y `EPIC-19` (mejoras no bloqueantes).
>
> El hilo que une la ola: **el cerebro dejaba que sus compuertas discutieran sobre premisas que nadie había verificado, y auditaba interfaces que nunca había visto**. Ahora un paso previo comprueba contra el repo qué es hecho y qué es supuesto antes de que el panel adversarial argumente, y el auditor de UI recibe capturas reales por tema y por ancho en vez de leer código. Alrededor de esos dos ejes: el canal para que un derivado le reporte un defecto al Factory quedó cerrado de punta a punta, los cinco generadores de `project/reference/` aprendieron a decir qué **no** pudieron leer, y la redacción de logs dejó de filtrar lo que prometía tapar.

### Added

- **Un paso de grounding antes del panel adversarial.** `/backlog` verifica las premisas del plan **contra el repo** antes de que nadie discuta: cada afirmación se clasifica como hecho / inferencia / supuesto / desconocido, y cada hecho viaja con la consulta que lo comprobó. Eso pasa a ser el contrato de entrada del panel — un hecho confirmado no se vuelve a litigar, uno refutado entra ya como objeción establecida con su consulta a cuestas, y **la ausencia de clasificación nunca se lee como verificado**. El problema que resuelve es concreto: un panel de revisores caro discutiendo si el archivo X existe, cuando eso se contesta con un `grep`.
- **`grounding-auditor`, el agente que hace esa pregunta.** Mandato cerrado y read-only (con `Bash`, para que la evidencia sea producible): responde *"¿las premisas de este artefacto son ciertas?"*, nunca *"¿dónde se rompe?"* — esa es la del panel. Es genérico a propósito: la misma pregunta sirve sobre un plan, un backlog, un freeze-map o un spec de pantalla.
- **Y el corte entre agente genérico y agente de un workflow dejó de estar en tres lugares.** Vivía repartido y con un criterio que no aguantaba (*"invocable desde 3+ workflows"*, que hace genérico a un agente por popularidad). Ahora es **lente vs maquinaria** y su única sede es `CC.md §2`; `fx-workflow-authoring §8` y el `CLAUDE.md` apuntan ahí, y el hook de taxonomía conoce al nuevo genérico.
- **El eje de evidencia, declarado en el registry de política.** Qué tipo de evidencia exige cada gate deja de ser prosa dentro de cada skill: se declara en el SSOT de política, se valida con el linter, el proyecto puede endurecerlo, y `/implement` abre el hueco de evidencia en **las seis superficies** donde emite.
- **🔴 El auditor de interfaz por fin ve la pantalla.** `pnpm evidence:visual` levanta la app en la rama efímera de siempre, recorre cada superficie declarada **× cada tema que shippea el skin activo × tres anchos (375 / 768 / 1440)**, mide contraste sobre el DOM vivo y escribe un manifest que `ui-critic` consume como contrato de entrada. Hasta ahora ese agente auditaba interfaces leyendo código — dos derivados reportaron el mismo fallo el mismo día. El manifest **se sella con el código que dibuja**, no con `HEAD`, así que no caduca por un commit que no toca la UI, y captura además los estados de interacción (foco visible) que la superficie declare.
- **Sin manifest, `ui-critic` reporta "no demostrado" — nunca Pass.** Es la mitad honesta del cambio: en el perfil `core` o en un derivado que aún no adoptó el harness, el check multi-tema no se aprueba por omisión, se declara sin demostrar. Se suma un gate de contraste al propio auditor.
- **La deuda que sobrevive a un panel viaja marcada.** El carry-over del panel se estampa en el epic y `/implement` lo consume en su checkpoint de arranque, en vez de perderse entre corridas. `/implement` además detecta el drift del backlog **antes** de ese checkpoint y acota la compuerta de cierre a lo que de verdad cambió.
- **`/backlog` refuta el plan antes de emitir issues**, y converge en el checkpoint de revisión; la consulta de refutación se emite dentro del plan de remediación, así que quien lo lea después puede reproducirla.
- **`factory ticket push` — el canal derivado → Factory quedó cerrado.** Un derivado que documentaba un defecto del kit en `project/factory/` no tenía cómo entregarlo: el archivo se quedaba ahí hasta que alguien abriera el repo del Factory a mano. El comando lo presenta como issue de GitHub sobre la sesión `gh` del propio dev (sin credencial nueva) y estampa la URL del issue de vuelta en el ticket. Publicar está gateado: `--dry-run`, confirmación interactiva fail-closed en headless, y contención de path con `realpath` + `path.relative` (cierra los vectores de prefijo engañoso y symlink que la vía basada en strings deja abiertos). Aplica la etiqueta `kit-drift` en vez de crearla — crearla exige `write`, aplicarla solo `triage` — y si falta, avisa y presenta el issue igual.
- **La convención de factory-tickets salió de `/discovery`** a su propia skill (`fx-factory-tickets`), y el inventario de puntos de extensión (`fx-extension-points`) se rutea solo. Los dos viajan en ambos perfiles de distribución.
- **`preflight` acepta los checks propios del proyecto** desde un módulo hermano dev-owned, y el runner de e2e gana fases opt-in y falla rápido cuando faltan los navegadores de Playwright en vez de morir a medio camino.
- **Los cinco generadores de `project/reference/` dicen qué no pudieron leer.** Antes callaban las omisiones: lo que el parser no entendía simplemente no aparecía en el registro, y un catálogo incompleto se lee igual que uno completo.
- **El CLI deja declarar qué variables difieren por ambiente.** Un bucket, una cola, cualquier servicio con ambientes separados: se declaran en `env.project.json` (commiteado) o con un marcador `# @per-env` en `.env.local`, y `env:push` deja de subir el mismo valor a producción y a preview. Al mostrar variables enmascaradas ahora se ven **los últimos cuatro caracteres**, que es lo mínimo para distinguir cuál credencial está puesta al rotar una — el valor completo nunca se imprime.
- **`/deploy` observa el deployment real antes de cerrar.** El workflow terminaba en el push y delegaba al humano *"monitorear Vercel"*; un deploy que falla **después** del push no lo veía nadie hasta que lo reportaba un usuario. Ahora consulta el estado del deployment por el SHA del merge y distingue los cuatro casos que importan: listo, en curso, en error, y **no observado** — que nunca se reporta como éxito.
- **Un lector único de errores de Postgres** con allowlist cerrada, más el detalle del error en la línea de log de desarrollo y la causa del error de base de datos registrada desde los dos wrappers de server action. Un fallo de DB dejaba de decir qué había pasado justo cuando hacía falta.
- **La escala de `radius` de Tailwind se mapea al token `--radius` del skin**, así que las clases del framework y el sistema de diseño dejan de contradecirse.
- **Política de modelos recalibrada por dónde se paga el falso negativo:** el panel de revisión y la auditoría de seguridad bajan a `fable`, el executor vuelve a `opus`. Una regla de paths puede además recortar territorio que no le toca gatear.

### Changed

- **La pantalla sin diseño ya no detiene a `/backlog`: se anota y el run sigue.** Cuando un plan traía una pantalla nueva sin su spec de diseño (SCR), el workflow paraba y ofrecía tres opciones. En la operación real la respuesta era siempre la misma, y una pregunta cuya respuesta no cambia no informa nada: cuesta una interrupción. Ahora el mismo hecho se **narra y se registra** — una línea en el resumen del checkpoint de revisión, el texto automático en el campo `DoR Waivers` de cada issue afectado y una nota en el manifest del run —, igual en modo fluido, en `--step` y sin usuario. Lo que sí detecta no cambió: cuando la pantalla **sí** tiene su SCR, el issue sigue naciendo con su `Refs (design)` y el barrido previo al cierre lo sigue exigiendo. Quien demuestra que la UI está bien sigue estando aguas abajo, en `/implement`, con evidencia renderizada (`pnpm evidence:visual` + `ui-critic`) en vez de una compuerta que especulaba antes de que existiera la pantalla.
- **El presupuesto de spawns de plan-mode sale del registry de riesgo**, no de un número escrito a mano en la skill. Los pases se calibran por riesgo, nunca por volumen.
- **El generador de PDF dejó de necesitar Python:** ahora es un driver de Node sin dependencias, con la versión del renderer pineada y su corrida acotada. Lleva el logotipo real de TimeKast en la portada y neutraliza el front-matter del documento.
- **`pnpm verify` corre los workspaces hermanos solo cuando la branch los tocó.** Un cambio que no toca `cli/` ni `desktop/` deja de pagar sus typechecks.
- **La lógica de captura de evidencia se mudó al directorio que sí viaja** a los derivados, y el barrido de secretos salió de `ticket push` (lo cubre el gate de publicación).
- **Los seis lectores inline de errores de Postgres migraron al lector único.** Seis copias de la misma lógica eran seis oportunidades de divergir.
- **Se declaró cuál tabla de tiers manda** en `/backlog`, y las enumeraciones duplicadas dejaron de poder desincronizarse. Misma clase de arreglo en la compuerta de validación, que prometía una sobrescritura que nunca ocurría.

### Fixed

- **🔴 `vercel-build` buildea antes de migrar, y el orden es el punto.** El kit shippeaba `db:migrate && build` con una razón registrada en seis archivos: una migración fallida impide el build. Esa protección se conserva entera —Vercel gatea por el exit code del comando completo, no por el orden de sus mitades—, pero solo contemplaba que fallara la migración. El caso espejo rompió producción de un derivado: la migración **funciona**, el build falla después, Vercel no promueve el deployment, y el alias de producción sigue sirviendo el build anterior contra una base que ya se movió al schema nuevo. Un rollback de deployment no lo deshace, porque el cambio de schema no es parte del deployment. Con el build primero, un build fallido no llega a tocar la base. Como `package.json` no está en el track de distribución, el arreglo del boilerplate solo nunca alcanzaría a la flota existente: `healVercelBuildOrder` lo inscribe en el mantenimiento que el CLI ya hace sobre el `package.json` del derivado — **heal-only, nunca inserta**, y solo reescribe el valor que el kit shippeó.
- **🔴 La redacción de logs filtraba lo que prometía tapar.** Se cerraron los query parameters que se escapaban a los logs y a Sentry, una tercera puerta de tokens, y el caso en que las dos caminatas de redacción se unificaron después de que una de ellas goteara. La caminata además **aplanaba `Date`, `URL`, `Map` y `Set`** — el guard se apoyaba en el prototipo en vez de en `toJSON`, y la excepción se infería en vez de enumerarse. Se quitó del entry de cliente la integración de Sentry que solo existe en Node.
- **🔴 Enmascarar por default, y mostrar solo lo demostrablemente público.** El enfoque anterior era fail-open y produjo dos fugas de secretos en una sola sesión. Ahora se enmascara todo salvo lo que un whitelist declara público, se enmascara **cada** coincidencia dentro de una clase de secreto (no solo la primera) y se recogen **todas** las clases que disparan en una línea (no solo la primera). Una variable que tu proyecto invente y que nadie declaró pública se protege sola.
- **El foco del teclado volvió a verse en las primitivas del kit.** Los switches perdían el indicador contra la cascada, los dos campos del form kit y los dos campos de texto no lo tenían, y el disparador de filtros de tabla lo había perdido. Los encabezados ordenables de tabla ahora se operan con teclado. El input de texto lee su token `--input-border` y las variantes de estado muertas por fin emiten CSS.
- **Contraste AA en las iniciales de avatar y en las pestañas inactivas.**
- **`components/ui/` se clasifica por archivo, no por carpeta.** La heurística anterior era falsa: la carpeta mezcla primitivas de terceros con componentes propios del kit, y seis archivos del kit declaran su interfaz **sin exportarla**, así que con el criterio de `export` no caían en ninguna rama y el fallback natural era la carpeta. El criterio ahora es quién declara el contrato de props, y es total.
- **Los generadores de `project/reference/` leen lo que decían leer.** La tabla de alias sale del `tsconfig` del propio proyecto en vez de asumirse; una fila re-exportada se anuncia como re-export y no como un segundo símbolo; los comentarios de bloque se arrastran entre líneas y los inline se quitan antes de colapsar un bloque de exports; la prosa dejó de inventar aristas de import y los re-exports locales sí cuentan como arista; el join de enums se acota a `public` y se descubre `pgSchema().table()`, reportando lo que no puede atribuir.
- **`db:query` ve todos los schemas**, califica el tamaño por OID y acepta nombres calificados.
- **El harness de evidencia mide lo que dice medir**, y un rol ausente omite la superficie del kit en vez de matar la corrida entera.
- **Un tag de release ya no puede quedarse fuera de `main` sin que nadie se entere** — y esta versión es la primera en que ese canario corre de verdad: el archivo de checks propios del Factory exportaba un arreglo de funciones donde el loader espera resultados, así que fallaba al cargar y se llevaba el sweep completo con él. Con el contrato correcto, los 43 tags `cli-v*` y el `gui-v*` salen todos de `main`.
- **El merge de release volvió a ser expresable como regla de permiso.** Los flags van antes de la branch, así que el patrón es un prefijo puro que sirve para cualquier branch de cualquier derivado — y **no** alcanza al `git merge main` que `BR-FACTORY-004` prohíbe.
- **Auth:** el namespace de la cookie se deriva una sola vez contra un alfabeto válido, el guard de ruta exige rol sin caer en bucle de redirección, y queda **un solo control de cerrar sesión**, alcanzable con el pulgar y honesto sobre a dónde lleva.
- **`eslint` y el `vitest` de la raíz se mantienen fuera de los worktrees de los agentes**, donde no tenían nada que hacer.
- **El short link del launcher apunta a un release que existe**, y las mediciones de tokens de subagente salen de los transcripts, no de una fórmula.
- **`/pdf` tiene autorizado su camino completo** y `prettier` dejó de reescribir en silencio los fixtures dorados que el generador compara.
- **Los scripts publican a CI solo los flags de auth cuyos secretos están ahí**, aplican la postura completa (no solo su resta) y detectan la ejecución directa a través de una ruta con espacios.

### Removed

- **🔴 Contrato retirado hacia el orquestador externo: el bloque `design_gate`.** En modo headless, `/backlog` emitía a stdout y al manifest un bloque estructurado `design_gate: { status: blocked | waived, screens: [...], action: ... }` y abortaba el run. Ese bloque era **contrato publicado** hacia el orquestador externo (el Agent Server de TK-Factory, que vive en otro repo) y desaparece con la compuerta: en su lugar el manifest lleva una nota `design_signal { screens, note }` y el run **no aborta** por esta causa. Un consumidor que ramifique sobre `status: blocked` deja de recibir ese estado — no porque falle, sino porque el run ya no llega a ese punto. **No se verificó qué ramifica hoy sobre el bloque** (está fuera de este repo): se anuncia como retiro, no como cambio inocuo. Los otros dos bloques headless de `/backlog` (`plan_review_gate` y `grounding_gate`) **no cambian**, y el primero pasa a ser la forma de referencia de los dos.

> **Derivados existentes:** casi todo es cerebro y llega con `factory update`. Lo que **no** llega solo: los arreglos que viven en `src/` (foco de teclado en las primitivas, contraste AA, token de esquinas) nacen congelados y se adoptan a mano; el orden de `vercel-build` sí lo repara el CLI en el próximo `update`; y el harness de evidencia visual necesita adopción explícita — mientras no la tenga, `ui-critic` corre igual y reporta el check multi-tema como **no demostrado**, nunca Pass ([`retrofits/visual-evidence-adoption.md`](retrofits/visual-evidence-adoption.md)).
---

## [12.0.0] - 2026-08-21 — El cerebro dejó de decidir a ojo cómo revisarse

> **Major por alcance, no por ruptura.** Ningún commit de la ola declara `BREAKING CHANGE` y ninguna superficie pública cambió de contrato: un derivado corre `factory update` y sigue funcionando. El salto de era es porque lo que cambia es **cómo trabaja el cerebro**, no una feature más — antes cada workflow decidía por su cuenta con qué modelo ejecutar, cuándo parar a revisar y a quién llamar, y esa decisión vivía repartida en prosa dentro de cada skill. Ahora sale de un registry que se lee, se valida y el proyecto puede endurecer.
>
> La ola cierra 8 de los 10 epics del milestone (42 de 56 issues); `EPIC-01` (proyección multi-runtime) y `EPIC-10` (manejo de errores de DB) siguen abiertos y viajan a la siguiente. Afecta a `.claude/**`, al CLI (`@timekast/factory`) y al launcher de escritorio; en `src/` solo aterrizan tres arreglos de producto.

### Added

- **Registry de quality-gates — el riesgo se declara, no se improvisa.** `.claude/policy/quality-gates.json` pasa a ser el SSOT de qué revisa el kit y cuándo: la escala de riesgo 0-4, los cinco tipos de señal estructural, el panel de revisores que cada gate exige, el modo de review y la política de loop. `/implement` y `/backlog` **apuntan** al registry en vez de llevar cada uno su copia en prosa, que era exactamente cómo se desincronizaban. Viaja en los **dos** perfiles de distribución, así que un derivado `core` también lo tiene.
- **Y el proyecto puede endurecerlo sin forkear el kit.** `.claude/policy/quality-gates.project.json` es dev-owned: ahí un derivado declara sus áreas sensibles (el módulo de facturación, el de permisos) y sube el piso de revisión sobre ellas. El kit nunca lo pisa. Los gates además **narran su origen** — cuando uno para, dice de qué regla sale y ofrece el override, en vez de bloquear sin explicar.
- **`/implement` evalúa el riesgo dos veces, y la segunda sobre el diff real.** Una en plan-time (alimenta CP-A) y otra al cerrar, sobre el diff que de verdad se va a commitear, con un checkpoint de escalamiento si lo que salió resultó más riesgoso de lo que se planeó. El gate de review del cierre se arma desde el registry, no desde una lista fija.
- **Todas las decisiones de cierre en una sola tabla.** CP-B deja de ser una conversación en varias vueltas: una tabla con qué se encontró, por qué importa y qué se recomienda — y las decisiones **se ejecutan en la misma corrida**, no quedan de tarea. La deuda que cae fuera de la frontera del issue se refuta primero y se pre-marca lo que no sobrevive, así que no se arrastra ruido; el handoff de esa deuda lo dispara `/implement` solo.
- **Política de modelos explícita en los 23 agents.** Cada agent declara su `model` en el frontmatter, recalibrado por **verificabilidad** del trabajo que hace (lo que se puede comprobar mecánicamente baja de tier; lo que exige juicio no). Se acabó el `inherit` implícito.
- **Los checkpoints se presentan como opciones estructuradas.** Donde el runtime ofrece la tool, las decisiones se muestran como opciones excluyentes en vez de pedir un número escrito. La tabla completa sigue siendo la presentación cuando el checkpoint trae contexto por fila; headless no cambia — cada gate resuelve por su fail-open/fail-closed ya declarado.
- **El aviso de retrofits dejó de poder enterrarse.** El CLI expone una señal machine-readable de qué guías llegaron en este `update`, y el launcher la convierte en un **modal** en vez de una línea al final de un log que nadie lee. Es el mismo hueco que el aviso de terminal abría por otro lado: media actualización que necesitaba manos y nunca aterrizaba.
- **`skill-lint` valida lo que antes se confiaba.** Check de frontmatter con la allowlist derivada del SSOT (no una copia), validación de los registries de política **por shape** con un schema Zod, split de la familia `fx-*` por operatividad, y verificación de la superficie real del runtime. Un registry malformado ahora falla en el pre-commit, no en la corrida de un derivado.
- **`pnpm verify` ve los workspaces hermanos** (`cli/`, `desktop/`), así que un cambio en el CLI ya no pasa la compuerta del kit sin que su propio typecheck y lint corran. `env:check` gana un punto de extensión para preflights que el proyecto declare.

### Changed

- **El light path de `/backlog` se retiró.** Existía para acortar el camino en issues chicos y en la práctica el atajo se tomaba donde no debía. La exención quedó escrita en el registry, que es donde se puede auditar.
- **Las skills salen del menú `/`.** `user-invocable: false` en todas las que no son punto de entrada: el menú vuelve a listar comandos, no el catálogo entero del cerebro.
- **`pnpm verify` es un script del cerebro**, no un encadenado de `&&` en `package.json` — así el derivado lo recibe con el `update` y no se queda con una versión vieja del pipeline.
- Los tests de React Testing Library **solo cargan bajo un DOM real**: la suite de node dejó de pagar ese import.

### Fixed

- **Al cambiar de pantalla ya se llega hasta arriba.** El reset de scroll del App Router se salta cuando un layout compartido mantiene un header fijo en pantalla: su heurística ve el contenido entrante ya dentro del viewport y conserva el offset anterior. `DashboardShell` es exactamente esa forma, así que la pantalla nueva aparecía a la altura en la que quedó la anterior — el usuario abría un detalle desde media lista y aterrizaba a media página. Se cierra con `ScrollToTop`, un client component que retorna `null` y se monta una sola vez en el root layout, no en `DashboardShell`: ahí `(auth)` y `(legal)` heredan el mismo comportamiento. Reportado desde un derivado (tk-cal), no encontrado leyendo el kit — el Factory no se navega lo suficiente como para notarlo.
- **El reset no dispara donde sería un retroceso.** Tres casos que un `scrollTo` por cada render habría roto: cambia **solo el query string** (filtros, paginación y orden re-renderizan la misma pantalla, y brincar al top pierde el lugar justo cuando el usuario está trabajando), la URL trae **hash** (el kit deep-linkea a anchors propios — `/profile#mfa-enroll`, `#push-devices` — y ganan ellos), y la navegación es **back/forward** o el primer paint (el navegador ya restaura el offset previo, que es lo que uno espera al volver a una lista). Los cuatro caminos quedan fijados en tests de componente.
- **🔴 El botón «Recargar» del aviso de nueva versión ya no deja la pestaña trabada.** `controllerchange` puede emitirse más de una vez, y un `location.reload()` sobre una navegación ya en curso **la reinicia** — la pestaña no avanza, los errores de consola suben y solo un refresh manual la saca. Reportado en producción por un PO. El componente tenía guard de **registro** del listener (no añadirlo dos veces), que es una garantía distinta de la que hacía falta: que la recarga **corra** una sola vez. Y el click no tenía respaldo, así que cuando el worker ya había sido activado desde otra pestaña —`skipWaiting()` activa para todas, o sea que ese evento ya ocurrió y no vuelve— el botón simplemente no hacía nada, bajo un aviso de duración infinita.
- **🔴 Una pestaña ya no recarga encima del trabajo de otra.** El listener se enganchaba **al mostrar** el aviso, y el aviso aparece precisamente cuando recargar en automático NO era seguro: hay un formulario sin guardar, un guardado en vuelo, o más de una pestaña abierta. Con dos pestañas, el click en una activaba el worker para todas y la otra se recargaba sobre su formulario a medio llenar, sin pasar por ninguno de los dos guards duros que el componente promete. Ahora se engancha en el click, así que solo recarga quien lo pidió. La otra pestaña no se queda atrás: los cuatro disparadores de detección la re-evalúan al volver a ella y se actualiza sola en cuanto sea seguro — la actualización se difiere, no se pierde.
- El listener de `controllerchange` también se retira al desmontar, que el cleanup olvidaba.
- **🔴 Los cinco registros de `project/reference/` volvían a generarse menos veces de las que debían.** El pre-commit los salta cuando el commit no toca sus fuentes —cuestan ~9 s de arranques de `tsx`— pero el filtro miraba solo `src/`, y eso se quedaba corto en dos de ellos. `INVENTORY.md` publica **Dependencies** y **NPM Scripts** leyendo el `package.json`, así que un `pnpm add` dejaba el catálogo desactualizado en silencio — justo el catálogo que `SK.md §2.1` manda consultar antes de crear cualquier cosa. Y `CODEBASE.md` escanea además `lib/` y `components/` en la raíz: no existen en el kit (`SK.md §6` los prohíbe) pero sí en un derivado que nació antes de esa regla. Un tercer hueco era de git y no de la lista: al mover un archivo **fuera** de `src/`, git colapsa el rename a su destino y el filtro no veía ningún path con `src/`, así que el componente seguía apareciendo en el inventario después de haberse ido. El filtro pasa a ser la unión de lo que los cinco leen, con `--no-renames`, y un test lo fija extrayendo el predicado del propio hook (una copia en el test seguiría pasando después de editar el hook, que es lo único que ese test existe para impedir).
- **Los registros se auto-reparan.** Faltaban dos entradas que no son fuentes sino las dos formas de quedar desfasado sin tocar `src/`: **cambiar un generador** (el output cambia sin que ninguna fuente se mueva) y **tocar el archivo generado** — a mano o borrándolo. Ahora cualquiera de las dos hace correr el bloque, así que el commit sale con el registro regenerado en vez de con la edición ajena o con el archivo ausente. Borrar el `.md` pasa a ser una forma válida de pedir "regenérame esto"; antes commiteaba el borrado tal cual.
- **El índice que deja un commit por pathspec se repara solo.** Commitear con `-- <paths>` es obligatorio en checkout compartido (`GIT.md §3.6.1`) y tiene un residuo conocido: git escribe el índice con el estado **previo** al pre-commit, así que todo archivo que el hook reformatea queda staged-pero-idéntico y `git status` reporta sucio un árbol limpio. El `post-commit` lo repara.
- **El `security-auditor` perdió `Edit`/`Write`.** Un agente cuyo trabajo es auditar no tiene por qué escribir; la allowlist decía otra cosa.
- **El CLI ya no descarta el exit code de una corrida exitosa** y los tests de DOM reciben un timeout que sobrevive a la suite cargada (fallaban por reloj, no por lógica).

> **Derivados existentes:** los tres arreglos de producto viven en `src/`, que nace congelado y `factory update` nunca toca. El del PWA se adopta con [`retrofits/pwa-update-toast-reload-guard.md`](retrofits/pwa-update-toast-reload-guard.md) y el del scroll con [`retrofits/scroll-reset-on-navigation.md`](retrofits/scroll-reset-on-navigation.md) — este último declara **prioridad baja** en su encabezado: es pulido, no un bloqueo. Todo lo demás de esta versión es cerebro y llega solo con `factory update`.

---

## [11.9.0] - 2026-08-17 — Los tres huecos los encontró provisionar un proyecto de verdad

> **Minor.** Un derivado recién aprovisionado nacía con schema y **sin una sola migración**, mientras su `vercel-build` (`pnpm db:migrate && pnpm build`) daba la migración por hecha: el primer deploy corría contra una base vacía, no creaba ninguna tabla, y el proyecto arrancaba roto sin que nada lo dijera. El hueco no era un olvido de código sino una decisión registrada que nadie volvió a mirar — por eso el arreglo la **deroga explícitamente** (ver _Changed_) en vez de contradecirla en silencio.
>
> Los tres defectos de esta versión salieron del mismo sitio: **el reporte de un bootstrap real** (TimeSheets, ~14 h), no de leer el código. Ninguno era visible desde el Factory, porque el Factory no ejercita esos caminos — no nace, no corre su e2e en CI, y no tiene flags de auth propios. El cuarto, el de `--destroy`, apareció al **ejercitar** los criterios de aceptación contra infraestructura real en vez de darlos por buenos.
>
> Afecta al CLI (`@timekast/factory`) y a `.claude/**`.

### Added

- **`factory provision` genera, commitea y pushea la migración inicial del derivado.** Antes de tocar cualquier provider corre `pnpm db:generate`, commitea el `0000` **con su propio pathspec** —nunca un commit pelado, que sobre un index compartido se traga trabajo ajeno— y, cuando el paso de git no va a pushear en esa corrida, pushea él y **confirma que el commit llegó a `origin/main`**: un push que no aterriza es exactamente el fallo que este paso existe para prevenir, así que no se asume, se verifica y se dice. Dos guardas independientes lo mantienen lejos de los derivados ya vivos: la corrida tiene que **probar** nacimiento, y el checkout tiene que identificarse como derivado. Probar nacimiento no es que el plan tenga la forma de un bootstrap, que es más débil de lo que parece: `--force` descarta el estado y devuelve **todos** los pasos en «crear», o sea la forma exacta de un proyecto naciendo producida por un flag cuyo trabajo es borrar la única evidencia de que ese proyecto ya pasó por aquí. Por eso `--force` nunca cuenta como nacimiento; crear la base cuenta **solo si** la corrida además está conectando la app —el hosting o el repositorio—; y crear el sustrato de git cuenta **solo** si había estado previo, el bootstrap interrumpido que se retoma. Que crear una base no baste por sí solo es lo menos evidente de las tres: confunde dos hechos distintos, que exista una base nueva y que **la base que el deploy va a migrar** sea esa. Crear el proyecto en Neon no cambia la cadena de conexión de producción —eso lo hace el paso del hosting—, así que sobre un derivado ya vivo el deploy sigue apuntando a la base de siempre, la que tiene datos. El costo aceptado es un caso degradado: un bootstrap interrumpido al que solo le falta la base no genera la migración por sí mismo, y el dev corre `pnpm db:generate` — que es justo lo que `factory doctor` y el preflight le dicen. Un falso negativo cuesta un comando; un falso positivo, el deploy de un cliente. La señal de identificación es `.timekast/lockfile.json` y **falla hacia "no toques"** — su ausencia significa Factory (o un checkout no identificable) y no se genera nada, porque un falso positivo dentro del Factory commitearía un `.sql` que el perfil `full` embarcaría a **todos** los derivados nuevos, mientras un falso negativo solo cuesta un `pnpm db:generate` a mano. La señal y su desempate contra la detección por markdown que usa `/deploy` quedan fijados en `ADR-003`.
- **`factory doctor` reporta el hueco cuando ya existe.** Un derivado con schema y sin `.sql` ve una línea que nombra el problema, la consecuencia (el primer build migraría una base vacía) y el comando que lo cierra. Es **informativo**: `doctor` sigue saliendo con éxito siempre. El aviso vive en el reporte estándar y no en el preflight del launcher, que sí convierte cualquier fallo en salida distinta de cero — meterlo ahí habría reintroducido, por la puerta del comando hermano, justo el bloqueo que se decidió no poner. Y no re-deriva la excepción del Factory: consume el mismo predicado que usa `provision`, que evalúa "¿es el Factory?" primero y antes que nada, así que el propio repo del kit —que no shippea migraciones a propósito, `BR-FACTORY-005`— nunca dispara el aviso.
- **Paso nuevo en el workflow de E2E: las variables del repo llegan al entorno del job.** Va antes de `pnpm test:e2e` —o sea antes del build, que es cuando se hornean las públicas— y **vuelve a filtrar por el mismo prefijo del lado del consumidor**: `toJSON(vars)` trae TODA variable del repo, incluida cualquiera que alguien agregue después en la UI de GitHub, y el runner lanza cada proceso hijo con `{ ...process.env, ...overrides }`, así que sin ese filtro un nombre como `NODE_OPTIONS`, `DATABASE_URL` o `E2E_*` entraría al build y al proceso de tests. El filtro vive en una función exportada y testeada, no en un `node -e` dentro del YAML. Detalles que son el punto y no el estilo: `node` y no `jq` (no está garantizado en la imagen de Playwright, y un payload malformado corta el job antes de la suite en vez de fallar callado más adelante); el JSON entra por `env:` y nunca interpolado en el `run`; y la salida usa heredoc con delimitador aleatorio, no `clave=valor`, porque un valor con salto de línea corrompería `$GITHUB_ENV` y permitiría definir claves arbitrarias del job. **Sin variables publicadas no escribe nada y todo queda como estaba** — adoptarlo no rompe a nadie.
- **Cómo adoptarlo en un repo que ya tiene `e2e.yml`.** El workflow activo está excluido del perfil de distribución (solo viaja el `.example`), así que `factory update` refresca la plantilla y **no puede** tocar el que tu proyecto ya generó. Un proyecto nuevo recibe el paso la primera vez que corre `pnpm setup:e2e`; uno que ya lo tenía recibe un **aviso del runner** —ruidoso, nunca un abort, por las mismas tres razones que el banner de la base desechable: la corrida local no está afectada, un artefacto del cerebro tolera el árbol donde aterriza, y la detección es textual—. El remedio es la **guía de adopción** ([`.claude/docs/retrofits/e2e-ci-auth-env.md`](retrofits/e2e-ci-auth-env.md)), que trae las cuatro líneas para pegar a mano. 🔴 **No es "corre `pnpm setup:e2e`"**: ese comando regenera el workflow desde la plantilla y lo **sobrescribe entero** —incluido un `E2E_PARENT_BRANCH` sobre el que avisa pero que **no** preserva, más cualquier job, matriz o paso que hayas agregado—. Es el camino correcto solo si nunca lo personalizaste, y la guía trae el `git diff --no-index` que distingue los dos casos. La guía además acota a quién le aplica: si tus flags de auth son los defaults del kit, CI ya corre la postura correcta y **no tienes nada que hacer**.

- **`factory update` te recuerda revisar las guías de retrofit, al final de toda corrida.** El update mueve archivos; lo que no puede mover es lo que vive fuera del árbol que el kit controla — un step en TU workflow, un config que es tuyo, una decisión que solo tu proyecto puede tomar. Eso viaja como guía, y una guía de la que nadie te avisa es una guía que nadie lee: el update termina en verde y la mitad del cambio que necesitaba manos nunca aterriza. Sale **siempre**, sin importar cómo se resolvieron los conflictos (un retrofit no es un conflicto: es trabajo que el comando nunca intentó), y **sin suprimirse en headless** —al revés que el puntero de `/provision`—, porque un agente actualizando sin supervisión es el lector menos capaz de notar por su cuenta que falta un paso manual. Separa las **nuevas desde tu versión** de las que ya estabas arrastrando, para lo cual las diez guías del kit ahora declaran desde qué versión aplican; y cada una se lista con la línea de "a quién le toca" que ella misma trae, para que descartes lo que no te aplica de un vistazo.
- **`pnpm setup:e2e:vars` publica las variables de auth sin regenerar tu workflow.** El `setup:e2e` completo reescribe `.github/workflows/e2e.yml` desde la plantilla y lo sobrescribe entero, lo cual está bien si nunca lo tocaste y es destructivo si sí. Este comando publica y nada más — sin Neon, sin escribir el workflow — y hace el dequote por ti, que es justo donde equivocarse invierte el flag en silencio.
- **Guía de adopción para quien ya tiene `e2e.yml`** ([`retrofits/e2e-ci-auth-env.md`](retrofits/e2e-ci-auth-env.md)): las cuatro líneas a pegar, por qué cada detalle del step es load-bearing, el `git diff --no-index` que distingue un workflow personalizado de uno generado, y a quién le aplica (solo si algún flag tuyo difiere del default del kit).

### Changed

- **Derogada la decisión de la v10.11.0 de que "el derivado genera su propio `0000` con `db:generate` en el setup".** Esa entrada resolvió bien dos cosas que **siguen en pie**: la sequence de humanIds se mintea on-demand (así el `0000` queda puro drizzle) y el Factory dejó de shippear `src/lib/db/migrations/` porque su base es desechable. Lo que no funcionó fue la tercera: empujar la **generación** al setup manual del derivado deja la única pieza sin la que el primer deploy no puede funcionar en manos de que alguien se acuerde, y el modo de falla es silencioso —el build pasa, el deploy queda verde, y las tablas no existen—. Desde ahora la genera el provisioning (ver _Added_); el `db:generate` manual queda como el camino para un repo que se salta `factory provision`. Los textos del kit que afirmaban el paso manual quedaron alineados: el quick start del `.env.example`, la narración del flujo `/provision` y el comentario del CLI que decía que las migraciones no tenían nada que commitear.

- **🔴 El reporte HTML de E2E cambió de lugar: ahora hay uno por fase, en `playwright-report/<fase>/`.** Si abres `playwright-report/` por costumbre vas a encontrar subcarpetas y ningún reporte; el comando pasa a ser `pnpm exec playwright show-report playwright-report/chromium` (o `.../mfa`, o el nombre de la fase que declare tu proyecto), y el runner imprime esa línea exacta —una por fase roja— al terminar una corrida en rojo. **El paso de artifact del workflow no se toca**: la raíz sigue llamándose igual, así que un `upload-artifact` que ya recogía `playwright-report/` ahora se lleva las dos carpetas.

### Fixed

- **🔴 El paso que genera la migración ya no puede tocar un derivado que está VIVO.** El guard decidía sobre la **forma del plan**, y eso resultó más débil de lo que parece: `--force` descarta el estado antes de armarlo —así que todos los pasos salen en «crear», la forma exacta de un proyecto naciendo, producida por el flag cuyo trabajo es borrar la única evidencia de que ese proyecto ya pasó por aquí—, y un derivado anterior al CLI no tiene estado, con lo que crear el repositorio tampoco probaba nada. La tercera puerta era la más sutil: crear una base de datos **no** implica que sea la base que el deploy va a migrar, porque la cadena de conexión de producción la escribe el paso del hosting; en un derivado vivo el deploy sigue apuntando a la de siempre. Cualquiera de las tres habría commiteado un `0000` al `main` de un cliente, y su siguiente deploy habría muerto con `relation "users" already exists`. Ahora la corrida tiene que **probar** nacimiento: `--force` nunca cuenta, crear la base cuenta solo si además se conecta la app (hosting o repositorio), y crear el repositorio cuenta solo si había estado previo. El costo aceptado es un caso degradado —un bootstrap interrumpido al que solo le falta la base no genera la migración— y ahí `factory doctor` y el preflight lo dicen. Un falso negativo cuesta un comando; un falso positivo, el deploy de un cliente.
- **`factory provision --destroy` ya puede borrar el proyecto de Vercel que él mismo creó.** Lo crea el token del rail dentro del team, y lo borraba `vercel remove` con la sesión de tu CLI, que puede estar en otro scope: fallaba con `Not authorized … under scope` y dejaba un proyecto vivo y facturable — exactamente lo que `--ephemeral` existe para evitar. Ahora se borra por REST con el mismo token que lo creó, que es lo que el borrado de dominios, en la misma función, ya hacía. De paso desaparece una clase entera de riesgo: el slug venía del archivo de estado y se volvía argumento de un comando; al direccionar el proyecto por su id, ningún shell lo ve y un slug corrompido deja de dejar el teardown a medias.
- **El commit de la migración y su push ya no pueden apuntar a ramas distintas.** El commit aterrizaba en la rama actual mientras el push nombraba `main`: con el dev parado en otra rama, se pusheaba un `main` **sin** el `.sql`, con éxito y en verde — el defecto que este mismo release cierra, disfrazado de éxito. Ahora la rama se lee antes de commitear y, si no es `main`, no se pushea y se dice dónde quedó el commit (con su hash, si el `HEAD` está desprendido: ahí no hay rama que mergear). Un repo todavía en `master` está exento cuando el paso de git va a renombrarlo, que era una falsa alarma.
- **Un fallo al sincronizar `develop` ya no reporta que todo el push falló.** Los dos push compartían un `try`, así que si `main` pasaba y `develop` fallaba, el mensaje decía «no pude pushear la migración» y se saltaba la confirmación de remoto — un diagnóstico falso justo cuando la rama que le importa a producción **sí** había llegado.
- **Dos fases de e2e cuyos nombres solo difieren en mayúsculas ya no colisionan.** En macOS y Windows son el mismo directorio (y en Windows, también `mfa` y `mfa..`), y como el reporter borra su carpeta al arrancar, reintroducían desde un archivo del proyecto el mismo bug que este release cierra.
- **La fase que falla ya no se queda sin evidencia.** El reporter HTML de Playwright **borra su carpeta de salida al arrancar**, y con `reporter: 'html'` sin `outputFolder` esa carpeta era una sola para toda la corrida: la fase B pisaba el reporte de la fase A en cada corrida, así que justo cuando la base fallaba no quedaba nada que mirar. Los traces ya tenían el arreglo (`--output` por fase); el reporte lo tenía pendiente. Ahora cada fase escribe en su propia carpeta, por una variable que se compone **en la base del entorno de esa fase** y que ningún archivo del proyecto puede pisar: ni podía ir en la base de la corrida (se evalúa una vez, sin la fase a la vista — las dos fases volverían a compartir carpeta, con sensación de arreglado) ni podía llegar como override de la fase (la clave quedó protegida, y el propio runner habría abortado toda corrida contra su propia guarda). La ruta es absoluta y el nombre de la fase se valida como segmento de path antes de usarse, porque es el directorio que el reporter borra.
- **El log dice qué test está corriendo.** Cuando la config del proyecto no declara ningún reporter que imprima progreso, el runner antepone `list` —sin quitarle el suyo a nadie: los reporters declarados se conservan en su orden, y un proyecto que ya pidió `list`/`line`/`dot`/`github` se deja intacto—. No es que antes no hubiera nada: Playwright ya inserta `line` en local y `dot` en CI cuando ningún reporter escribe a stdout, y `dot` es un carácter por test — alcanza para saber que la suite sigue viva y no para saber dónde murió. `list` nombra cada test al terminarlo.

- **CI dejó de correr la suite contra una app distinta de la que el proyecto configuró.** En local el runner carga `.env.local` y todo lo que lanza lo hereda; en CI ese archivo es gitignored y `setup:e2e` solo publicaba `DATABASE_URL` y los dos secrets de Neon. Los specs que leen un flag para decidir si corren —`register.spec.ts` y `NEXT_PUBLIC_AUTH_REGISTRATION`, con default `true`— **nunca se salteaban en CI**: la suite probaba el registro contra una app con el registro cerrado, y pasaba en verde. Ahora `pnpm setup:e2e` publica las `NEXT_PUBLIC_AUTH_*` de `.env.local` como **variables** del repo (no secrets: son `NEXT_PUBLIC_*`, o sea que ya viajan en el bundle del cliente que cualquiera puede leer), imprimiendo las claves con su valor y preguntando antes de escribir en el repo de alguien. El parseo va por `dotenv`, no por un dequote a mano: el kit escribe ese archivo **con comillas** y `booleanString` compara contra el literal `'false'`, así que publicar `NEXT_PUBLIC_AUTH_REGISTRATION="false"` tal cual dejaba el flag en **true** —el arreglo entregando lo contrario de lo que promete, en verde—. Quedan fuera las dos claves que el runner ya fija por su cuenta (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_AUTH_MAGIC_LINK`).

---

## [11.8.5] - 2026-08-15 — Los tres los encontró usar el flujo, no leerlo

> **Patch.** Continuación directa de la 11.8.4, y con la misma forma: comprobaciones que no comprobaban. La diferencia es cómo aparecieron — ninguno salió de revisar el código, los tres salieron de **ejecutar** el release anterior y mirar lo que de verdad pasó. Uno se llevó CI por delante; otro habría publicado esta misma versión con notas incompletas.

### Fixed

- **El rango del CHANGELOG sale del último tag de release, no del punto de divergencia con `main`.** La inferencia arrancaba en `merge-base origin/main HEAD`, y ese punto lo adelanta **cualquier** `ship` intermedio: lo que ese ship llevó a `main` queda fuera del rango del release siguiente, así que sus commits desaparecen de las notas sin que nada lo reporte, y el auto-bump puede caer en "no amerita versión" sobre un rango vacío. Medido al preparar esta misma versión — después de shippear un fix, el merge-base daba **un** commit donde el tag daba **dos**: el fix se habría publicado sin documentar. La variable que hacía falta ya existía en el workflow y resuelve el tag **por nombre**, que es lo que evita el problema que descartó a `git describe` (camina la ascendencia, y en un repo donde los tags viven en merge-commits de `main` que nunca vuelven a la rama de trabajo, devuelve uno viejo). El merge-base sobrevive como respaldo para el primer release, cuando todavía no hay ningún tag.
- **Una comprobación de tags dejó de exigir credenciales dentro de CI.** El test que verifica que ningún tag publicado quedó fuera de `main` consultaba el remoto, y un runner no tiene ni red ni credenciales para eso — precisamente por la regla de mínimo privilegio que el test vecino exige. Pasaba en local, donde sí hay llaves, y tumbó tres corridas de CI. Ahora se salta cuando el remoto no responde, y **declarado como salteado**, no aprobado en vacío: que corrió y pasó y que nunca corrió tienen que poder distinguirse. No abre un hueco — la defensa real es el guard que rechaza la publicación en el momento en que ocurriría, y ese se verifica sin red.

### Changed

- **El agente puede borrar los directorios regenerables del proyecto sin pedir permiso cada vez.** Reportes de pruebas, salidas de build, cachés y los directorios de trabajo de los flujos: todo eso es salida, no fuente, y borrarlo cuesta una regeneración. Los permisos quedan acotados path por path — nada de comodines abiertos, ningún path absoluto de usuario, y las prohibiciones catastróficas siguen intactas. Detalle que costaba prompts sin que se notara: un patrón sin comodín final es coincidencia exacta, así que borrar un directorio y vaciar su contenido son dos permisos distintos; varios estaban a medias.

---

## [11.8.4] - 2026-08-14 — Cuatro cosas que el kit afirmaba y no hacía

> **Patch.** Los cuatro son la misma clase de defecto vista en cuatro capas: una pieza que **declara** una garantía y no la ejecuta — un tag que decía venir de `main`, una opción de git que no podía podar nada, un tipo que describía un archivo inexistente, y un arreglo de seguridad sin nada que impidiera deshacerlo. Ninguno fallaba ruidosamente; los cuatro se leían como si funcionaran. El primero afecta solo al Factory (las líneas `cli-v*`/`gui-v*` son suyas), pero el fix de la recovery destructiva y el invariante de CI llegan a todo derivado por `factory update`.

### Fixed

- **Los tags del CLI y del launcher ya nacen dentro de `main`.** `/deploy` bumpeaba `cli/` y `desktop/` en Phase 7 — después del merge y después del push, sobre la branch de trabajo. El commit del bump nunca entraba al merge, así que **el tag apuntaba a un commit que `main` no contenía**, y no había forma de meterlo después: traer `main` de vuelta a la branch de trabajo está prohibido porque arrastra borrados. Medido contra el historial: `git merge-base --is-ancestor cli-v1.24.0 <main previo>` es falso. Es decir que npm sirvió `@timekast/factory@1.24.0` desde un commit fuera de `main` hasta que el release siguiente lo absorbió; durante esa ventana, auditar qué código corre la flota leyendo `main` daba una respuesta vieja, y reescribir la branch de trabajo habría dejado una versión publicada sin lugar en la historia. El CLI se ejecuta en cada `update`, `provision` y `add` de cada derivado, así que el alcance era toda la flota. Los tarballs nunca estuvieron en juego —el empaquetado excluye `cli/` y `desktop/`—, lo que vuelve esto un defecto de **trazabilidad del artefacto publicado**, no de qué recibe nadie. El paso se partió en dos: el bump ocurre **antes** del merge, de modo que viaja dentro de él, y el tag se corta **sobre el merge commit**, junto al del kit — ancestro de `main` por construcción, sin ningún SHA que deducir. Corre igual en `ship` que en `release`, así que publicar el CLI sin bumpear el kit sigue siendo un solo comando y las tres líneas de versión siguen desacopladas. Y las dos Actions ahora **se niegan a publicar** un tag que no sea ancestro de `main`, verificado en vivo: un tag de prueba cortado fuera de `main` murió en el primer paso, sin instalar ni publicar nada.
- **La advertencia sobre `HEAD~` que protegía de lo contrario.** El flujo avisaba que, si el contador de commits a deshacer quedaba vacío, `git reset --soft HEAD~` sería "sintaxis inválida" — o sea, que git te frenaría. Es falso: `HEAD~` equivale a `HEAD~1`, el comando **tiene éxito** y retrocede un commit en vez de dos o tres, dejando trabajo aplicado a medias en una recovery destructiva, sin un solo mensaje. La nota ahora dice lo que de verdad ocurre y exige comprobar el valor antes de resetear. Aplica a cualquier proyecto que cancele un deploy a la mitad.
- **Una opción de `git fetch` que prometía una limpieza imposible.** El flujo corría `--prune-tags` y el comentario aseguraba que además podaba los tags locales que el remoto ya borró. No podaba nada: la propia documentación de git dice que sin `--prune` la opción no hace nada, y que **deliberadamente no da error** por omitirla. Se descubrió ejecutando el flujo — después del fetch, la línea del launcher seguía mostrando 17 tags locales contra 1 en el remoto. Se retiró en vez de completarla, porque podar tiene un modo de fallo real: borra tags locales ausentes del remoto, que es justo lo que queda cuando se rechaza el push de un tag recién cortado.
- **El tipo de `profiles.json` describía un archivo que no existe.** Declaraba un campo `version` obligatorio que el archivo real nunca tuvo y que nadie lee — la versión del tarball entra como argumento del build o sale de `package.json`. El costo lo pagaba quien intentara tipar un `profiles.json` ya parseado: el cast no compilaba por un campo que jamás se habría usado.

### Added

- **Un invariante mecánico de mínimo privilegio sobre los workflows.** El arreglo de la v11.7 corrigió los workflows, pero nada impedía que la regresión volviera — y así había llegado la primera vez: nadie borró un bloque de permisos, simplemente nunca se escribió uno. Ahora una prueba comprueba en cada corrida que todo workflow declare permisos explícitos y que ningún `checkout` deje el token del job en `.git/config` para que lo lea cualquier paso posterior. La lista de "lo que el kit shippea" **no** es un glob del directorio: sale del manifiesto de distribución y se resuelve con la misma función que arma los tarballs, así que la prueba y el paquete no pueden discrepar. Los workflows que solo corren en el Factory se sostienen contra el mismo piso, porque son los que cargan las credenciales de publicación. El placeholder desactivado queda exento **por forma y no por nombre** —todos sus jobs están apagados, así que no ejecuta nada—, y la exención caduca sola en cuanto alguien lo active.

---

## [11.8.3] - 2026-08-14 — Dos comprobaciones que contestaban otra pregunta

> **Patch.** Un fix del CLI y una guía nueva de E2E que resultaron ser el mismo error visto dos veces: una comprobación que parece verificar algo y en realidad verifica una versión más floja de eso — que coincide con la verdadera solo mientras los datos son pocos. El del CLI llega por npm (`@timekast/factory` 1.24.0); la guía, por `factory update`.

### Fixed

- **`provision --adopt` ya encuentra el proyecto que está adoptando.** Sobre un proyecto cuyos recursos existen todos, reportaba `unknown` en tres de cuatro proveedores, y cada campo fallaba por su propia razón sin decir ninguna. En Neon el listado no mandaba `org_id` —que una llave con alcance de organización exige, y que el camino de creación ya respetaba—, así que la API contestaba `400` a cada llamada: el camino de adopción **nunca** había resuelto un proyecto de Neon. Además leía una sola página de diez sobre una organización de noventa y cuatro. En Vercel el listado tomaba los primeros veinte proyectos, o sea que contestaba "¿estás entre los veinte más recientes?" y no "¿existes?"; uno más abajo quedaba `unknown` sin un solo aviso, porque cero candidatos es indistinguible de no existir. Ahora la búsqueda exacta por nombre va primero y el listado recorre todas las páginas. Los dos comparaban cadenas crudas contra el slug, así que un proyecto llamado con espacios y mayúsculas en la consola no era el directorio en minúsculas y con guiones; la comparación se normaliza, y una búsqueda que no encuentra nada dice cuántos miró. Los dominios no se consultaban en absoluto: se derivaban del slug y se escribían como si estuvieran confirmados, de modo que un proyecto que vive en el dominio del cliente —sin CNAME en ninguna zona de la organización— quedaba con dos hosts que no resuelven a nada, en el campo que leen tanto `--destroy` como el `rpID` de WebAuthn. Ahora salen de Vercel cuando ninguna zona propia los tiene, y un rol sin host en ningún lado es `unknown` en vez de una adivinanza. El desmantelamiento se salta un host `*.vercel.app`: lo acuña Vercel, así que no hay nada nuestro que borrar.

### Added

- **`sk-e2e §1.1` documenta qué pasa la primera vez que una suite corre contra datos reales**, medido en vez de supuesto. Un derivado apuntó sus 126 specs a un clon efímero con 1.4 millones de filas en su tabla principal y 4.1 en la siguiente — volumen idéntico a producción — y el titular es contraintuitivo: **el número de filas no rompió nada.** Ni una colisión de selector por coincidencias de más, ni un conteo de paginación desfasado, ni un filtro confundido. Lo que sí rompió fue una precondición que venía siendo cierta por accidente: un `beforeAll` sembraba un registro de respaldo solo si no encontraba uno, preguntando por *activo y sin segmento*, mientras el camino de producción para el que preparaba exige *activo, sin segmento **y sin el marcador de liga de encuesta*** — ese tercer filtro existe porque un contacto directo no tiene segmento y la liga no se puede resolver. Sobre una base sembrada las dos definiciones seleccionan las mismas filas y nadie nota que son preguntas distintas; sobre datos reales, de cuatro candidatos sin segmento uno estaba inactivo y tres llevaban el marcador, así que quedaban **cero usables**: el setup veía tres, se daba por satisfecho y no sembraba nada, y la acción los rechazaba a los tres. El toast del error se desvanecía antes de la captura, de modo que la falla llegaba disfrazada de "el diálogo no abre". La regla que sale de ahí: un setup que **consulta** lo que necesita está afirmando en silencio que la definición del producto coincide con la suya — hay que **sembrar por construcción**. La sección conserva escrita la hipótesis equivocada que la precedió (una carrera de hidratación, descartada al reintentar el click veinte segundos sin que el diálogo apareciera), porque una explicación plausible cuesta más que ninguna: manda al siguiente lector a la capa equivocada.

---

## [11.8.2] - 2026-08-14 — Tres formas de matar una corrida de E2E sin decir por qué

> **Patch.** Los tres vienen del mismo derivado y son de la misma familia: el kit shippeando un mecanismo que no ejercita sobre sí mismo. En los tres el síntoma era una corrida muerta con un mensaje de error que no mencionaba al kit por ningún lado. Afecta a `scripts/**` y al CLI; el segundo llega por npm, no por `factory update`.

### Fixed

- **El config derivado ya re-rootea `tsconfig`.** El runner no ejecuta tu `playwright.config.ts` directamente: genera una copia con el puerto de la corrida forzado, y en esa copia tiene que reescribir las rutas que el original declaró relativas a **su** directorio. A la lista le faltaba `tsconfig`, así que un proyecto que declara `tsconfig: './tsconfig.playwright.json'` lo veía resuelto dentro del directorio de caché, donde no existe — Playwright se negaba a cargar el config y **las fases morían antes de una sola spec**. El kit no lo detectaba porque su propio config no usa esa clave. Además, ahora el runner **nombra** cualquier clave con forma de ruta que sabe que no re-rootea (`snapshotPathTemplate`, `webServer`), para que el próximo caso cueste una línea y no una tarde.
- **El proceso de Playwright ya recibe el puerto de la corrida, como `E2E_PORT`.** El config derivado reescribe el `baseURL` de cada proyecto, lo que cubre a una spec que navega relativo a él; lo que no puede reescribir es un origen que una spec **se arma sola** — y un proyecto con varios (un host de tenant, uno de ops, uno central) se los arma. Sin nada publicado, la única fuente que quedaba era `package.json#ports.e2e`, así que vaciar esa clave para permitir un puerto por checkout dejaba al servidor escuchando en un puerto y al setup navegando a otro: `ERR_CONNECTION_REFUSED`, sin mención del runner ni del update que lo causó. Documentado en `sk-e2e §1.8`.
- **El vaciado de `ports.e2e` dejó de planchar un puerto que el desarrollador fijó a propósito.** Solo se dispara sobre el valor exacto que el kit shippeaba — que es justo el número al que un proyecto lo fija **de vuelta** cuando sus specs necesitan uno fijo. Cada update lo volvía a vaciar y a romper la suite, deshaciendo un arreglo ya hecho; y de paso reemplazaba el comentario `//e2e` por el del kit, así que la razón escrita desaparecía junto con el valor. Ahora ese comentario es la señal de intención: el kit solo escribe su propio texto ahí, de modo que uno distinto significa que lo puso una persona, y no se toca.

---

## [11.8.1] - 2026-08-14 — Lo que un derivado encontró auditando su propio drift

> **Patch.** Un proyecto derivado llevaba ocho archivos del kit modificados localmente y los auditó uno por uno antes de actualizar. Cinco de esas modificaciones no eran ajustes suyos: eran parches a huecos del kit que cualquier derivado va a encontrar. Vuelven aquí para que el drift desaparezca de la flota y no solo de ese repo. El de más peso hacía que CI clonara producción. Solo afecta a `scripts/**` y al template de workflow; se adopta con `factory update`.

### Fixed

- **`E2E_PARENT_BRANCH` ya tiene dónde vivir sin que el generador se lo lleve.** El runner avisaba bien: al correr en CI sin esa variable dice que Neon va a clonar la rama por defecto del proyecto —`main`, producción— y nombra la variable que lo cambia. El hueco estaba un paso después: la única forma de acatar el aviso era editar a mano el `e2e.yml` generado, y `pnpm setup:e2e` lo regenera desde el template sin preservar la línea. Un bump del contenedor de Playwright bastaba para volver a clonar producción, sin que nada cambiara a la vista. Para un proyecto que trabaja en `develop` el default está mal dos veces: las migraciones del commit bajo prueba viven en la rama de trabajo, así que clonar `main` le da a la suite un schema viejo —cada spec que toca una tabla nueva muere con `relation ... does not exist`, que se lee como bug de producto y no lo es— y además la rama efímera arranca como copia completa de los datos de producción, que en una plataforma multi-tenant no es algo que deba decidirse por omisión. El template ahora declara la variable y `setup:e2e` la resuelve **de su propia fuente**: la rama actual, donde está el trabajo. La rama de trigger sigue saliendo del remoto, donde dispara CI. Dos preguntas distintas, dos resoluciones. Y como un archivo generado que alguien edita a mano termina perdiendo esas ediciones, el setup ahora avisa cuando el `e2e.yml` existente fija un valor distinto al que va a escribir.
- **`API.md` dejó de afirmar una postura de autorización que el código no tiene.** La detección eran dos condiciones independientes sobre la misma región y ganaba la primera, así que una action que elige su guarda en tiempo de ejecución —self-service cuando el usuario opera sobre lo suyo, RBAC cuando un admin opera sobre lo ajeno— se documentaba con **una sola** de las dos. Ahora se detectan ambas antes de reportar cualquiera.
- **Las foreign keys compuestas aparecen en `SCHEMA.md`.** El parser cubría las declaradas en la columna, pero una FK compuesta solo puede escribirse en la forma de tabla — y esas no producían una entrada equivocada, sino **ninguna**. Un agente que lee ese documento antes de crear una tabla concluía que no hay relación donde sí la hay.
- **El kit dejó de shippear archivos que su propio `prettier` rechaza.** Dos escritos a mano, más los cuatro documentos autogenerados de `project/reference/`, que eran el mismo defecto ya corregido para el board y no para los generadores que lo rodean: los escribe un generador y el hook los agrega en crudo, así que ningún camino los formateaba. Era el único drift sin salida para un derivado — alinearse al kit los deja mal formateados y el pre-commit los vuelve a cambiar.
- **`verify-scr-classifier.ts` dejó de contaminar el scope global del typecheck.** Sin un import o export estático, TypeScript lo trataba como script y cada símbolo que declara aterrizaba en el scope global, colisionando con el mismo nombre en cualquier otro archivo. El síntoma era un error de `tsc` en un archivo que no tiene nada que ver con el que se tocó.

---

## [11.8.0] - 2026-08-14 — El entorno de una corrida de E2E también lo declara el proyecto

> **Minor.** El release anterior enseñó al runner que las **fases** son datos que un proyecto declara. Faltaba el escalón de arriba: las variables que valen para **toda** la corrida. El kit tiene ese caso —fija `EMAIL_PROVIDER=none` para que la suite nunca mande correos reales, `RATE_LIMIT_ENABLED=false` para que el bucket de login no la tumbe— pero lo resolvía en su propia base, que es del kit y no tenía puerta de entrada; el comentario del código incluso mandaba al lector ahí. Un proyecto con flags propios tenía que ponerlos en `.env.local`, y ahí la garantía deja de ser del runner y pasa a depender de lo que cada quien tenga en disco. Solo afecta a `.claude/**` y `scripts/**`; los derivados lo adoptan con `factory update`.

### Added

- **`scripts/tools/e2e.env.project.ts` — el entorno de la corrida, declarado por el proyecto.** Hermano del registro de fases y con el mismo contrato: es del desarrollador, no viaja en ningún perfil, `factory update` nunca lo toca, y si existe pero no carga la corrida **aborta** en vez de seguir con una postura que nadie fijó. Su export puede ser una función, evaluada **una sola vez** antes de la rama de Neon y del build, que es lo que permite generar un secreto por corrida y repartirlo entre el servidor que lo verifica y el proceso que firma con él — de forma que concuerdan por construcción y no por una regla que alguien tiene que recordar.

  **Por qué importa y no es cosmético:** en `.env.local` el modo de falla es del silencioso. Alguien corre la suite con un flag apagado, las specs de esa función se saltan, todo termina en verde y nadie se entera de que no se probó nada. Es la misma razón por la que el kit fija sus propias variables en vez de confiarlas al disco.

  **Tres mitades, donde una fase tiene dos, y la tercera es el punto.** Una fase no puede declarar una variable pública: hay un solo build y ocurre antes de todas, así que fijarla por fase movería lo que el servidor renderiza dejando el bundle del cliente intacto. Una **corrida** es exactamente el alcance donde esa objeción desaparece, porque el build ocurre dentro. Así que las públicas son legales en `build`, se rechazan en las otras dos —ponerlas ahí no haría absolutamente nada, y aceptarlas en silencio dejaría al proyecto creyendo que fijó algo que no fijó— y `build` es la única mitad que además alimenta el **build stamp**. Sin eso último, un `.next/` reciclado serviría el bundle anterior: en verde, con el valor viejo.

  La guía para mover las variables está en [`.claude/docs/retrofits/e2e-run-env-adoption.md`](retrofits/e2e-run-env-adoption.md), e incluye la comprobación que importa: borra la variable de `.env.local`, corre la suite, y verifica que las specs que dependen de ella **siguen ejecutándose**.

### Fixed

- **El build se hornea con el mismo entorno con el que se sella.** Leía `process.env` mientras el stamp se calculaba del entorno de la corrida, así que ambas cosas podían describir ambientes distintos y un `.next/` reciclado darse por vigente con otras variables públicas dentro. Ahora los dos salen del mismo valor.

---

## [11.7.1] - 2026-08-14 — El respaldo que `/deploy` toma antes de mergear vuelve a estar conectado con su restauración

> **Patch.** Un solo defecto, encontrado durante el release de v11.7.0 y con dos caras. Antes de hacer `checkout main`, `/deploy` empaqueta los archivos gitignored que viven en disco —`.env.local`, `.vercel/`, notas locales— porque el checkout puede borrarlos y no están en ninguna rama que los recupere. Ese respaldo llevaba el PID del shell en su nombre, y como cada paso del workflow corre en un shell nuevo, el nombre que se escribía y el que se buscaba después **nunca coincidían**: la restauración se saltaba en silencio, justo en el caso para el que existe. Solo afecta a `.claude/**`; los derivados lo adoptan con `factory update`.

### Fixed

- **El respaldo pre-merge y su restauración dejaron de poder desconectarse.** El archivo huérfano acumulándose en `/tmp` era el síntoma menor; el daño era que la restauración no ocurría y nada lo decía. Mismo patrón que `EPIC-01` encontró en el runner de e2e: un mecanismo de protección shippeado sin la línea que lo conecta, mientras la documentación afirma que protege. **Un nombre fijo global tampoco servía**, y estuvo a punto de shippearse: el límite de concurrencia acota el workflow, no la máquina, así que dos `/deploy` en repos distintos del mismo equipo se pisan el archivo y la restauración de uno extrae el `.env` y el `.vercel/` del otro — observado en vivo mientras se probaba el propio arreglo, dos repos escribiendo el mismo archivo con un minuto de diferencia. El nombre ahora deriva de un hash de la raíz del repo, que cumple los dos requisitos a la vez: estable entre shells, aislado entre proyectos. El barrido de restos que lo acompaña está acotado al repo propio por la misma razón — un patrón con comodín le borraría el respaldo a un deploy ajeno en curso.
- **La restauración dejó de fallar callada cuando el respaldo no se generó.** Su creación termina tolerando errores, así que un fallo por disco lleno o permisos era indistinguible de "no había nada que preservar". Ahora, si existe la lista pero no el paquete, se nombran los archivos que quedaron sin respaldo para poder verificarlos a mano.
- **El respaldo dejó de empaquetar los regenerables de paquetes anidados.** El filtro de exclusión anclaba al inicio de la ruta, así que descartaba `node_modules/`, `.next/` y `dist/` solo de la raíz: en un repo con paquetes anidados los suyos entraban igual. Medido en el Factory: **700 MB** de basura regenerable, comprimidos a 252 MB, empaquetados antes del checkout y vueltos a extraer al final — en cada deploy.

---

## [11.7.0] - 2026-08-14 — El runner de e2e deja de poder salirse de su caja, los workflows dejan de cobrar de más, y el org nace en timekast.com

> **Minor.** Tres frentes. **Seguridad del runner** (cierra `EPIC-01-kit-boundary`, 14 issues): el kit shippeaba mecanismos de protección cuyo cableado no viajaba, y avisos que se emitían justo donde nadie los lee. La suite de e2e podía alcanzar la base que el proyecto tuviera configurada —en un derivado real esa base compartía endpoint con producción—; ahora la regla es positiva, el runner sella la rama desechable y la suite se niega a correr contra otra cosa. Sus fases pasaron de ser la forma del código a ser datos que un proyecto declara, así que un tercer entorno ya no se pierde en cada `factory update`, y la frontera kit↔derivado quedó escrita en `CORE.md`. **Velocidad de los workflows:** `/implement` ahora mide en qué se van sus dos horas en vez de estimarlo, y `/backlog` dejó de correr el pipeline completo sobre la deuda que `/implement` acaba de destilar — cinco spawns del modelo grande para un plan de cinco archivos. **Infraestructura:** el org se mudó a `timekast.com` sin retirar `timekast.mx`, con el cuidado de que un proyecto ya provisionado nunca vea su dominio re-derivado. Aditivo para `.claude/**` y `scripts/**`; los derivados lo adoptan con `factory update`.

### Added

- **La rama desechable es obligatoria, no una convención.** `playwright.config.ts` carga `.env.local` por su cuenta, así que un `playwright test` crudo nunca pasaba por ningún script del kit y llegaba a la base que estuviera configurada. Ahora el runner estampa la URI de la rama efímera en `E2E_DISPOSABLE_BRANCH` y `tests/global-setup.ts` se niega a correr si `DATABASE_URL` no es exactamente ese valor. Exportar la variable a mano no ayuda: el valor es la URI de esta corrida, que nadie puede adivinar.
- **Las fases del runner son datos que el proyecto declara.** Una fase es un servidor con una postura más un proyecto de Playwright corriendo contra él; el kit tiene dos y ese "dos" era la forma del código. Un equipo que quería una tercera editaba el runner y cada `factory update` se la borraba — el ciclo que este épico existe para romper. Ahora las fases son entradas con un solo hook `env()`, las dos del kit se declaran igual (no hay camino que solo el kit recorra) y un proyecto declara las suyas en `scripts/tools/e2e.project.ts`, que el update nunca toca. Lo peor que se encontró estaba escondido en el mecanismo que debía prevenirlo: `codes.some(c => c !== 0)` sobre una lista vacía es `false`, así que una corrida que no ejecutó ninguna fase reportaba éxito.
- **El runner se niega a manejar la corrida fuera de esta máquina.** Un config que declara un host remoto —lo que alguien escribe para apuntar la suite a staging— mandaba la corrida afuera en texto plano, con las credenciales que siembra `auth.setup.ts`, mientras el servidor local quedaba sin usar. El guard de rama desechable no lo atrapa: ese compara la base, no el destino HTTP. La verificación resuelve de verdad en vez de comparar nombres, así que un nombre mapeado a 127.0.0.1 en `/etc/hosts` pasa. Falla antes de la rama, la migración y el build, y una corrida remota deliberada lo dice una vez con `E2E_ALLOW_REMOTE_HOST`.
- **El stamp del build ve las variables públicas de la corrida** y el runner limpia la caché de datos antes de cada servidor. Cubría tres de las cuatro puertas por las que entra una `NEXT_PUBLIC_*` al bundle, y faltaba justo la del patrón `dotenv -e .env.<perfil>`: correr el perfil A y luego el B servía el bundle del A, en verde. Y como `.next/` ahora sobrevive entre corridas a propósito para reciclar el build, una entrada de `unstable_cache` en disco describía filas de una base que ya no existe.
- **El update dice qué sobrescribió y qué movió en `package.json`.** "Ver diff" imprimía los dos archivos completos —6000 líneas para el runner—, así que nadie lo leía y todos respondían "toma el del Factory": así tres derivados perdieron trabajo local sin notarlo. La recuperación nunca fue el hueco, `git` ya la tenía; notarlo sí. El kit además deja de shippear sus propios tests, para que el `pnpm test` de un derivado no valide al kit contra un `src/` que pudo divergir.
- **Los proyectos nuevos nacen en `timekast.com`, y los viejos siguen donde están.** `timekast.mx` **no** se retiró: redirige y sigue sirviendo a todo proyecto ya provisionado bajo él, así que la constante de zona pasó a ser el default de lo que **nace** hoy, nunca una suposición sobre dónde **vive** un proyecto existente. Esa distinción es el cambio entero: `provisionDomains(slug)` también se usaba para **re-derivar** los dominios de proyectos ya provisionados en cuatro lugares, donde cambiar la constante habría inventado un host `.com` para un proyecto `.mx` — el retiro del dominio interino habría reportado éxito con el CNAME real huérfano, `--destroy` habría dejado atrás el CNAME de dev, y `WEBAUTHN_RP_ID` habría cambiado de zona, lo que **mata en silencio toda passkey registrada bajo ella**. Ahora se prefiere lo que el estado del provisioning registró y solo se cae a la zona actual cuando no hay nada.

### Changed

- **El run operacional de `/backlog` deja de pagar el pipeline greenfield.** La deuda que `/implement` destila al cerrar un épico son pocos issues de alcance conocido, y encima se gastaban cinco spawns del modelo grande. El más caro era el menos útil: en modo operacional el registry nace sin los campos que solo existen en greenfield. Ahora, sin flag —modo operacional, ocho issues o menos, nada que toque schema, auth, proxy o migraciones— el registry se arma inline, los issues se emiten directo si son tres o menos, y quedan dos validadores en vez de cuatro. El recorte es de subprocesos, no de rigor: composición del épico, cierre de dependencias, orden topológico, coverage gate, sweep y el test-gate corren idénticos, y ninguno spawnea.
- **`/implement` mide dónde se va el reloj y corta donde de verdad está.** Un épico de ~14 issues toma más de dos horas y nadie sabía en qué. La verificación mecánica se medía a la centésima mientras los dos bloques que dominan —trabajo del modelo y e2e— se estimaban. Ahora el orquestador escribe una línea JSON por evento, agrupa issues consecutivos que comparten archivo en un solo spawn (la atomicidad del commit no cambia: un lote de tres sigue produciendo tres commits atómicos) y la escalera de e2e deja de re-correr la suite entera hasta tres veces para redescubrir el mismo spec rojo.

### Fixed

- **El timeout de la búsqueda de rama padre clonaba producción en silencio.** Acotar esa consulta a 10s hizo que un listado lento de Neon cayera en un fallback preexistente: el POST sale sin `parent_id` y Neon clona la rama por defecto del proyecto, que en el modelo dual es `main`. El fallback necesitaba un 403 o una caída dura antes; la latencia bastaba ahora. La búsqueda reporta por qué terminó como terminó —resuelta, no encontrada, timeout, rechazada, inalcanzable—, porque "este proyecto no tiene develop" y "Neon no contestó" llevan al mismo POST y no son la misma noticia.
- **El cableado ausente del guard ahora es ruidoso.** El kit shippeaba el guard de rama desechable y el runner que acuña su marca, pero no la línea que los conecta: `tests/**` no está en el track de distribución, así que un derivado recibía el candado en disco y ninguno en efecto, mientras el kit, sus docs y el resumen del update comunicaban que la suite estaba protegida. Fail-open y silencioso. Avisa en vez de abortar, deliberadamente: la corrida que lo detecta ya es segura.
- **Los tres avisos que no llegaban a oídos de nadie.** El barrido de ramas zombi avisaba en el minuto cero de una corrida de siete minutos; ahora repite tras el veredicto. El sondeo del endpoint leía cualquier fallo como "todavía no está listo", así que una petición sin respuesta terminaba en la misma frase que un estado transitorio sano. Y el aviso del fallback sin rama padre estaba exento justo en CI, el único entorno donde ese fallback ocurre en cada corrida.
- **`--keep-branch` escribía una contraseña de Postgres a un archivo temporal y nunca lo borraba** — macOS no limpia ese directorio al reiniciar, así que las credenciales se acumulaban en reposo. Ahora se barren junto con las ramas zombi, y solo las que este runner acuñó y pudo fechar.
- **Una fase desconocida ya no cae en silencio a la suite base** (`runBase: requested !== 'mfa'` es verdadero para toda errata, así que la corrida reportaba verde sobre specs que nunca se ejecutaron), y el borrado de rama acota su fetch al margen que Actions deja entre SIGTERM y SIGKILL.
- **El backlog central deja de pagar `npx` en cada issue.** El CLI ya se negaba a hablar con la red sin credenciales, y eso se leyó como el guard: los workflows invocaban `npx @timekast/factory backlog …` sin preguntar y dejaban que el CLI decidiera. La decisión es gratis; llegar a ella no. El paquete no es dependencia de ningún derivado, así que cada llamada resuelve el spec desde cero — 2.5s medidos, con caché caliente — y un épico de 20 issues quemaba minuto y medio de reloj para llegar 41 veces a "omitido". Ahora los llamadores deciden primero, una vez por corrida y desde disco.
- **`nanoid` fijado por encima del loop de generador con `size` cero** (`GHSA-2v37-7h3g-55p8`, transitiva vía `next > postcss > nanoid`), y **`nodemailer` a v8**, que cierra cinco de sus seis advisories. La sexta queda aceptada con su razón escrita: la ruta explotable no existe en el código shippeado y el peer de `@auth/core` no admite v9 todavía.
- **Los workflows de CI bajaron a tokens de solo lectura** y dejaron de persistir credenciales en `.git/config`, donde quedaban legibles para cada paso posterior del mismo job — `pnpm install` entre ellos, que ejecuta scripts post-install de terceros.
- **`BOARD.md` lo formatea Prettier en vez de imitarlo**, y los issues cancelados dejaron de contarse como terminados: la rama de `done` se evaluaba primero y su regex acepta "Completed" en cualquier parte de la línea, así que un `❌ Won't Do … **Completed:** <fecha>` caía ahí.
- **Tres sitios de provision deducían lo que podían consultar.** `apexZoneOf` adivinaba la zona por la forma del nombre, así que `app.miapp.com.mx` daba `com.mx` — la zona de nadie, y una falla dura para cualquier cliente `.com.mx`. La solución obvia era una lista de sufijos públicos; la buena es no tener lista: se recorren los candidatos de más específico a menos y se devuelve la primera zona que **existe**, porque el registro de qué es una zona real es de Cloudflare. `adoptDns` reconstruía los dominios de un proyecto desde su slug en vez de descubrirlos —inofensivo con una sola zona del org, con dos habría adoptado un proyecto `.mx` bajo un host `.com` que nunca tuvo—, y `destroy` resolvía un id de zona y lo reusaba para todos los dominios, así que un stack con el dominio interino más el propio del cliente buscaba el segundo dentro de la zona del primero y dejaba su CNAME huérfano reportando éxito.
- **`/deploy` resuelve el último tag de release por semver**, sin que un prerelease ya superado se cuele como baseline.

---

## [11.6.0] - 2026-08-10 — La deuda de un épico deja de enterrarse, y el kit deja de romperse al desplegar

> **Minor.** Dos frentes. En `/implement`, los pendientes que quedaban al cerrar un épico —lo que el executor reportaba fuera de scope, los hallazgos del QC, los findings P2/P3 de seguridad— se escribían en el archivo del épico y nadie los volvía a mirar; ahora se recolectan, se clasifican, se corrigen los que se pueden corregir solos, y lo que no llega a issues por los dos entry points que `/backlog` ya tenía. En infraestructura, tres fallas que solo se manifestaban en el deploy real: `sharp` sin binario de Linux, el rate-limit despertando la base con tráfico anónimo, y el heap de Node reventando en CI. Todo aditivo para `.claude/**` y `scripts/**`; los derivados lo adoptan con `factory update`.

### Added

- **Phase 4.7 de `/implement` — la deuda del épico con destino.** Tres fuentes producían pendientes durante una corrida y ninguna tenía destino garantizado; el skill mandaba los P2/P3 de seguridad, literalmente, a _"se registran como contexto en el epic file"_. Ahora se recolectan **con la clase que asigna quien los detectó** (se pide en el prompt del spawn — los agents genéricos `quality-engineer` y `security-auditor` no se tocan, tienen consumidores fuera de este workflow), se aplica la **frontera del épico** —rompe un AC suyo, o es defecto en código que él escribió contra la lista de archivos congelada al terminar Phase 3— y se corrige **sin tope de cantidad** (el `N=3` es de reintentos por ítem). Esa frontera es lo que hace el loop finito: "lo que el épico prometió" es un conjunto conocido de antemano, "lo que se descubrió de paso" no tiene fondo. El principio ya existía en el kit para dos casos (§4.3 con el AC incumplido, §4.6 con P0/P1); esto lo generaliza en vez de introducir uno nuevo.
- **Cierre parcial de épico.** Si queda un pendiente **suyo** que requiere una decisión, el épico queda `🚧 In Progress` en vez de marcarse terminado, con cuatro guards: la fila `Code` se fuerza a `🔄 En progreso` y nunca a `✅ Completo` (el gate de completitud recorrería un `EXECUTION-ORDER.md` que todavía no conoce los issues de deuda y declararía el proyecto acabado), no se sincroniza el épico como `done` en el board del cliente, y el commit lleva subject propio. Más un guard en Phase 0 para que `/implement` nunca responda "nada que hacer" sobre un épico pausado con deuda registrada.
- **Planes de remediación como entrada de `/backlog`.** Lo que 4.7 no cierra se escribe en `project/backlog/{LAYOUT}/remediation/` (tracked, inmutable — su hash alimenta el drift detection de `validar`) y alimenta los dos modos que ya existían: lo que es del épico va por `extend-epic`; lo que quedó fuera de su frontera va por `add`, que crea un **épico de deuda numerado y normal**. Sin layout inventado, sin épico sin número, sin archivo acumulativo — un épico ordinario cumple todas las convenciones porque *es* la convención, y de paso obtiene el DoR test-gate, que corre en `add`.
- **Marcador explícito de issue en el parser de plan-mode (`Issue: sí`).** La clasificación de unidades es first-match-wins con la fila de _process-heading_ primero, así que un ítem legítimamente titulado _"Definir si el borrado es lógico o definitivo"_ se descartaba como Decisiones **antes** de que se leyera su lista de archivos — y cargar archivos no lo rescataba. Para un plan escrito a mano el default semántico sigue siendo correcto; para uno escrito por una máquina era pérdida de datos silenciosa. Opt-in y aditivo: un plan sin el marcador clasifica igual que antes, y la afirmación es solo positiva — ninguna marca puede convertir un issue **en** prosa, solo al revés.
- **Runbook de upgrade de dependencias** (`.claude/docs/retrofits/`) + índice de retrofits.

### Changed

- **El DoR test-gate rutea la AC por capa, no un stub para todo.** Detectaba UI y estampaba siempre el stub de component test — incluso sobre un `page.tsx`, produciendo una AC que apuntaba a `tests/unit/components/`, un directorio donde esa página no vive. No era redundante: era incumplible. Ahora la capa la decide el tipo de archivo (componente → RTL, página → E2E, route handler → unit), un issue que toca varias clases recibe una AC por cada una, y el log del gate registra la capa para que una auditoría distinga una página bien ruteada de una con el stub equivocado.
- **El test-gate corre también en `extend-epic`.** Estaba declarado para `nuevo`/`add` sin razón escrita, mientras el design gate sí cubría los dos modos. El mismo issue llevaba AC de test emitido por una vía y no por la otra; y como en modo fluido esa AC se auto-agrega sin preguntar, era gratis y aun así no se obtenía.
- **`BOARD.md` dejó de imprimir el mismo issue dos veces.** El bloque de aviso superior listaba los pendientes de todo milestone entre 80% y 100% — exactamente los que la sección de ese milestone ya listaba abajo. El porcentaje con su ícono ya comunica "esto está por cerrar" sin enumerar de nuevo. La función de render se exporta para que el output sea testeable: la suite cubría solo los parsers.
- **`/deploy` dejó de declarar una disposición para `.agent/`** — el directorio ya no existe en ninguna rama, así que la regla no borraba nada.

### Fixed

- **`sharp` no instalaba su binario de Linux y cada deploy a Vercel moría con `ERR_DLOPEN_FAILED`.** pnpm instala solo los binarios de la plataforma actual, así que un árbol de macOS nunca materializa el paquete que lleva `libvips-cpp.so`. El lockfile siempre lo resolvió; lo que faltaba era el filtro de instalación. Nada local lo detectaba: build, lint, typecheck y tests pasaban todos. Ahora `pnpm preflight` lo verifica.
- **El rate-limit despertaba la base de datos con tráfico anónimo.** El bucket de reportes de CSP escribía en Postgres, así que cualquier visita a una página pública mantenía el cómputo de Neon encendido — costo real, sin beneficio.
- **Provision fija las cotas de autoescalado de Neon** en vez de heredar el default de la cuenta, que arrancaba proyectos nuevos en 1 CU.
- **El heap de Node se agotaba en CI y en las corridas de e2e.** V8 dimensiona su espacio a partir de la memoria que *ve*, y dentro del contenedor de Playwright ese default queda por debajo de lo que necesitan el build de producción y la suite completa. Cuatro lugares, porque el techo no se propaga entre ellos: los dos workflows, el `next start` de cada fase del runner (que reemplaza el valor heredado a propósito, para no arrastrar el stub del compile-guard) y el servidor de desarrollo local. No cuesta minutos facturados: un techo no reserva nada, y un reintento por falta de memoria se cobra dos veces.
- **El file tracing del build ya no arrastra `node_modules` por glob** — los symlinks de pnpm rompen el empaquetado— y declara `sharp` explícitamente para acotar el radio de un módulo nativo.
- **Voseo argentino** en la tabla de vocabulario de `/implement` que se muestra al usuario, y que viajaba a todos los derivados.

---

## [11.5.0] - 2026-08-05 — El runner de e2e endurecido, testeable y probado en un derivado real

> **Minor.** Cierra `EPIC-02-e2e-runner-hardening` (13 issues). El runner de e2e dejó de fallar por causas propias — no podía armar la conexión a Neon en proyectos con dos roles con password, mataba a ciegas cualquier proceso en su puerto, y se tragaba la causa real cuando la migración fallaba. Pasó de **cero tests a 1888**, recicla el build entre corridas, y cada checkout puede correr su suite en su propio puerto. El gate de validación en un derivado real (E2E-013) corrió de verdad y atrapó tres bloqueantes que ninguna otra capa de prueba podía ver. Aditivo para `scripts/**`; los derivados lo adoptan con `factory update`.

### Added

- **Compile-guard de `server-only` / `client-only` que viaja con el runner** — esos paquetes son guards de compile-time de Next y **lanzan** fuera del bundler, así que cualquier spec que alcance un módulo server-guarded moría al ser *colectado*, no al ejecutarse. El mecanismo (hook ESM + stub de `Module._load`, porque Playwright transpila specs a CJS y el hook ESM solo no basta) vive en `scripts/tools/e2e/` y se inyecta antes de que Playwright arranque. El kit ahora **usa** `server-only` en 9 módulos que son dueños de un recurso peligroso, así que su propia suite ejercita la protección.
- **`--help` como contrato del runner** — renderizado desde la lista de flags que el código realmente consume, con un test que falla si se documenta un flag sin parser detrás. Responde sin leer `.env.local` ni tocar Neon.
- **Puerto derivado del checkout** — hash de la ruta absoluta (no del nombre del repo, que volvería a chocar entre worktrees) sobre un rango alto elegido contra los límites del SO, con probe lineal acotado. Dos checkouts corren sus suites a la vez.
- **Config de Playwright generado por corrida** — el runner escribe un config derivado y lo pasa con `--config`, sobrescribiendo el resultado en vez de intentar detectar si el config del proyecto "ya soporta" el puerto. Vive bajo `node_modules/.cache/`, que el `.gitignore` shippeado ya cubre.
- **Punto de extensión `vitest.setup.project.ts`** — `vitest.setup.ts` pasa a kit-owned para que sus mocks viajen, y el derivado conserva los suyos en un archivo hermano que el update nunca pisa. Mismo patrón que `.husky/pre-commit.project`.

### Changed

- **Reciclado del build por huella de entradas** — deja de recompilar cuando nada relevante cambió (~1 min por corrida). La huella cubre `.env.local` **completo**, no solo las dos variables que el runner inyecta: verde sobre un build desactualizado es peor que rojo. En CI siempre compila, por regla explícita. Un derivado puede sumar sus propios directorios de entrada con `package.json#e2eBuildInputs`.
- **Los tests de `scripts/**` viven junto al código que prueban** — un test que se queda mientras su sujeto viaja es cómo un derivado termina corriendo las aserciones del release pasado contra el código de este. La cobertura que viaja pasó de 388 a 549 tests. Requiere una limpieza única de las copias viejas en `tests/unit/` (documentada en `sk-testing-nextjs §1.3`).
- **Timeout de arranque adaptado a CI** — 2 min en CI, donde un timeout falso quema una corrida facturada completa; 1 min en local, donde un servidor precompilado que no contestó en un minuto genuinamente no arrancó.
- **Umbral de limpieza de branches Neon con lease de propiedad** — el nombre del branch lleva ahora quién lo creó, así que un huérfano de la propia máquina se reclama de inmediato y una corrida viva no se queda sin base a media suite.

### Fixed

- **Connection URI de Neon armada por el runner** — cuando la API no la entrega (proyectos con dos roles con password), el runner la construye con regla explícita de selección de rol y base, y error ruidoso si ninguna aplica. Nunca un default silencioso: elegir un rol de solo lectura hace que `db:migrate` muera con "permission denied", que se lee como otra cosa.
- **El runner ya no mata lo que haya en su puerto** — identifica el proceso, lo nombra y se detiene. El kill a ciegas es lo que hacía que dos suites se canibalizaran: los tests de una terminaban pegándole al servidor de la otra —otra app, otra base— y fallaban como si fueran bugs de producto.
- **Fuga de credenciales en los logs de Neon** — una respuesta inválida volcaba el payload completo, que incluye `connection_uris` con el password embebido. Ahora se imprime la forma, nunca los valores.
- **La causa real del fallo de migración** — `execSync` solo deja `Command failed`; el stdout/stderr con el motivo se descartaba. También avisa cuando compensó un branch padre atrasado, en vez de parchearlo en silencio.
- **Suplantación por homóglifos Unicode en magic link (GHSA-7rqj-j65f-68wh)** — `＠` (U+FF20) y `﹫` (U+FE6B) colapsan a `@` bajo NFKC, así que un enlace pedido para `victim＠example.com` podía llegar a `victim@example.com`. La normalización corre NFKC primero y luego las validaciones del default, delante del gate de registro.
- **Checks de existencia que fallaban abiertos (GHSA-8fpg-xm3f-6cx3)** — cerrado subiendo `next-auth` a `5.0.0-beta.32`, que pina `@auth/core` en la versión ya verificada aquí.
- **12 de 13 advisories high de producción** — `next`, `sharp`, `postcss`, `fast-uri` y `brace-expansion`. Queda `nodemailer`, sin arreglo posible: el peer de `next-auth` permite `^7 || ^8` y el advisory cubre `<=9.0.0`. No es alcanzable desde este código.
- **Argumentos sin comillas al invocar Playwright** — un checkout bajo una ruta con espacios partía el argumento de config; un directorio con `$(…)` en el nombre se ejecutaba.
- **Salida de subprocesos sin filtrar** — `db:migrate` corre con la URL de la base en su entorno y su output iba entero al log, que en CI no se enmascara.

---

## [11.4.1] - 2026-07-09 — El runner e2e ya no rompe CI en derivados pre-MFA

> **Patch.** Hotfix del runner e2e que viajaba con `factory update` y rompía CI en derivados nacidos antes del MFA: la fase B corría `--project=mfa` asumiendo artefactos del `src/` congelado (el project `mfa` de `playwright.config.ts`, los specs `*.mfa`) que el update nunca shippea, y toda la suite abortaba con "Project(s) 'mfa' not found". El cerebro ahora detecta la capacidad del proyecto en vez de asumirla (BR-FACTORY-006). Los derivados afectados lo adoptan con `factory update`.

### Fixed

- **Fase MFA del runner e2e gateada por capacidad del proyecto** — el runner detecta si el `playwright.config.ts` del propio proyecto define el project `mfa`: si no existe (derivado pre-MFA), omite la fase B con un warning explicativo y corre solo la suite base; un `--project=mfa` explícito en un proyecto sin soporte falla rápido con la causa real en vez de pasar en silencio. Documentado en `sk-e2e §9`.

---

## [11.4.0] - 2026-07-08 — Pantallas de auth consistentes + auto-login seguro tras reset

> **Minor.** Unifica las 12 pantallas de autenticación sobre un shell compartido (`AuthCard` + `AuthHeader`): mismo card, mismo logo theme-aware y mismo espaciado, con las pantallas de estado (revisa-email, éxito, error, enlace inválido) lideradas por un icono de estado semántico. Y agrega auto-login tras un password-reset **atado al navegador que lo pidió** — un token de reset filtrado (log/Referer/historial) ya no permite tomar la cuenta ajena. Aditivo; toca solo `src/`, así que los derivados nuevos nacen con esto y los existentes lo portan a mano (runbook en el repo).

### Added

- **Auto-login tras restablecer contraseña, atado al mismo dispositivo** — al terminar el reset en el navegador que lo solicitó, se inicia sesión directo (o pasa por 2FA si aplica) en vez de mandar a `/login`. La sesión se concede SOLO a ese navegador: `forgot-password` setea una cookie HttpOnly `= HMAC(AUTH_SECRET, token)` y el reset devuelve el email (→ auto-login) únicamente si la cookie matchea (constant-time). Quien robó el token desde otro navegador puede resetear (lockout) pero no entra. Nuevo `reset-device-binding.ts`.

### Changed

- **Shell unificado de pantallas de auth** — `AuthCard` + `AuthHeader` compartidos: el centrado sube al `(auth)/layout` y ninguna pantalla vuelve a declarar su contenedor/card/logo. Las pantallas de formulario llevan el logo; las de estado/terminales lideran con un icono de estado (sobre/check/alerta). Se retiró el `<Card>` primitivo de verify-email-change y change-password-required; arreglado de paso el logo hardcodeado a light-mode en la pantalla de error.

### Fixed

- **Anti-enumeración por timing en `forgot-password`** — el envío de correo (la señal de latencia dominante) se difiere con `after()` fuera del path de respuesta, así el tiempo de respuesta no revela si la cuenta existe. La cookie de same-device se setea siempre (valor random cuando no hay cuenta) para no filtrar existencia por su presencia.
- **Menos divulgación en el flujo de reset** — el GET de validación de token ya no devuelve el `userId` interno a un portador no autenticado del token.

---

## [11.3.0] - 2026-07-07 — Session revalidation + provisioning DNS + update conflict-safety

> **Minor.** Ola v11.3: cierra la revocación de sesión (JWT stale se expulsa a media sesión), endurece el bootstrap real de un derivado (provisioning de DNS/Resend, `env push`, OAuth condicional) y blinda `factory update` para que nunca pise el trabajo local del derivado. Suma rate-limits y fixes de seguridad de auth (timing oracle en login, banned users en OAuth) y perf en admin/DB. Aditivo; los derivados adoptan el cerebro vía `factory:update` (+ el delta de `src/` con su runbook de retrofit). El CLI y el launcher GUI se re-cortan con su propio semver (`cli-v1.19.0` / `gui-v1.4.0`).

### Added

- **Revalidación de sesión JWT contra la DB por intervalo** — un usuario baneado o con rol cambiado a media sesión se expulsa sin esperar la expiración del JWT; el callback `jwt()` revalida contra la DB en un intervalo configurable (`SESSION_REVALIDATION_INTERVAL_MS`, default 5 min). Cierra los 3 ejes de JWT-stale. (refs EPIC-04)
- **`factory update --dry-run`** — previsualiza el plan (conflictos incluidos) sin aplicar nada; sale con código 2 si hay conflictos, para que un caller no-interactivo (el GUI) decida en vez de pisar con `--theirs-all`.
- **Provisioning de DNS + correo (Cloudflare/Resend)** — `factory provision` crea los registros DNS de Resend en Cloudflare y verifica; re-apunta `WEBAUTHN_RP_ID` al dominio del cliente; borra el CNAME interino huérfano al retirar el dominio; avisa tras `env push` que las vars necesitan redeploy; `--repo` desacopla el repo de GitHub del slug del proyecto. (refs EPIC-02)
- **Rate-limits** — bucket por-email en login + rate-limit en los endpoints de autenticación passkey. (refs EPIC-03)

### Changed

- **El panel de update del GUI previsualiza conflictos antes de aplicar** — corre `--dry-run` primero: sin conflictos aplica, con conflictos frena y manda al agente en vez de sobrescribir el trabajo local.
- **`scripts/tools/` fuera del formatter del derivado** — el `.prettierignore` gestionado deja de reformatear los scripts del kit en el derivado (fin de los falsos conflictos de formato en cada update); el Factory sigue formateando los suyos (negación `!` fuera del bloque).
- **Rail de secretos de metodología documentado always-on** — `SK.md §7.3` lista `~/.claude/.env` + sus 8 variables, para que el agente lo conozca sin rutear a un skill.
- **Perf de admin/DB** — `getUsers` pagina server-side (UserTable en modo servidor); índices en `passkey_credentials.user_id` y `audit_logs(user_id, timestamp)`; `notifyMany` acota concurrencia con chunking; `BottomNavMoreSheet` lazy-load para diferir framer-motion; budget de Lighthouse recalibrado.

### Fixed

- **Seguridad de auth** — `authorize` constant-time (cierra el timing oracle de login); usuarios baneados rechazados también en el path de OAuth signIn; `adminSetTemporaryPassword` capado a 72 bytes (schema de password compartido); regeneración de recovery-codes envuelta en transacción.
- **e2e runner** — fail-fast del dev-server-singleton de Next 16 (causa real + PID en vez del timeout genérico) + branch temporal de Neon branch-aware (deriva de `develop` en un repo develop-first).
- **CLI provisioning** — clasifica `NEXT_PUBLIC_*` como públicas en el env wizard; reconcilia split-target env vars en `upsertEnvVar`; crea `.env.local` con `0600` desde el primer write; dropea el provider OAuth cuando el flag está on sin credenciales.
- **UI / varios** — tokens `--table-border` y `destructive-foreground` consistentes; carrera de email único mapeada a un mensaje claro; items expirados filtrados en el poll de notificaciones; timestamps naive sin sufijo `Z` en `db:query`.

---

## [11.2.1] - 2026-07-03 — El cerebro tolera derivados divergentes (factory update ya no rompe commits)

> **Patch.** Un `factory update` que subía varias versiones rompía TODOS los commits del derivado: el cerebro (hooks, tools, linter) asumía el lado que NO viaja — aliases de `package.json` dev-owned, customizaciones en `.husky/`, símbolos del `src/` congelado. Cuatro defectos con la misma causa raíz, ahora tolerantes de raíz. Además, el runbook de migración legacy y los retrofits portables por fin **viajan** con el kit (antes vivían develop-only, el derivado nunca los veía). Aditivo; los derivados adoptan el cerebro vía `factory:update`.

### Fixed

- **`generate:skin` ya no crashea en un `src/` sin skin-split** — el generador (`scripts/tools/generate-skin-import.mjs`) hacía `readFileSync` sin guard; en un derivado pre-v11 (sin `src/config/skins.ts`) lanzaba `ENOENT` y abortaba cada commit. Ahora es un no-op limpio (exit 0) que honra la tolerancia que `sk-skins §3` ya prometía; un sentinel ausente con el registry presente sigue siendo error real (drift de una app split). Tests end-to-end con fixtures. (refs adi-capital kit-drift 2026-07-03)
- **El pre-commit del kit es derivative-safe** — `generate:skin` se invoca por PATH con guard (el tool viaja con el cerebro; el alias es dev-owned y puede faltar); los pasos por alias legacy usan `pnpm run --if-present` (un alias faltante degrada a autogen stale en vez de bloquear el commit); los sub-hooks `bash` se guardan con `[ -f ]`. Header con la regla durable para pasos futuros: *brain-shipped step ⇒ invocar por path con guard, nunca por alias pnpm pelado*. (refs adi-capital kit-drift 2026-07-03)
- **`skill:lint` tolera el `src/` divergente del derivado** — el check `symbols` daba error duro cuando una skill `sk-*`/`kb-*` citaba un símbolo del kit ausente del `src/` congelado (el `factory update` nunca toca `src/`), bloqueando cada commit tras cada feature nueva del kit. Ahora degrada a **warning** en un derivado (espejo de lo que el check `specifiers` ya hacía); en el origen sigue error duro. (refs adi-capital kit-drift 2026-07-03)

### Added

- **Extension point del pre-commit — `.husky/pre-commit.project`** (dev-owned) — un archivo que el `factory update` **nunca** shippea ni pisa, para que las customizaciones del derivado (reconcilers de cron, linters propios) sobrevivan cada update en vez de perderse en silencio. El hook del kit lo ejecuta al final si existe. Documentado en `extending-the-kit.md`. (refs adi-capital kit-drift 2026-07-03)
- **Runbook de migración legacy + retrofits SHIPPED** (`.claude/docs/retrofits/`) — el agente de un repo destino por fin los tiene tras el primer `add`/`update`: `legacy-migration.md` (maestro CLI-driven con un **censo previo** del shape del repo destino para no tronar en el update, la costura dev-owned, y una tabla de retrofits por era de nacimiento) + `account-takeover.md` + `notifications-hardening.md` (movidos desde `project/runbooks/`, que era develop-only). (refs adi-capital kit-drift 2026-07-03)

---

## [11.2.0] - 2026-07-03 — Step-up auto-gating config-driven (declarar el par ES gatear)

> **Minor.** El registry `MFA_SENSITIVE_ACTIONS` deja de ser declarativo-sin-consumidor: los wrappers de server actions lo consultan en cada call, así que **declarar el par `(resource, action, riskLevel)` es todo lo que un derivado hace para gatear una acción sensible** — método, ventana de frescura, error codes y UI se derivan solos. Cierra el edge case de EPIC-07-STEPUP-001 (`step_up_no_strong_factor`) que el cliente (`StepUpSheet`) y el diseño (SCR-023) ya esperaban. Aditivo y backward-compatible (firmas LOAD-BEARING intactas); los derivados adoptan el cerebro vía `factory:update` y el delta de `src/` con el runbook de retrofit (validado en vivo en un derivado v11).

### Added

- **Auto-gating de step-up desde el registry** — `withAuth` resuelve su par RBAC `(resource, action)` contra `MFA_SENSITIVE_ACTIONS` en cada call (sin par = no sensible, cero cableado extra); `withSelf` declara su llave con la opción nueva `sensitiveAction` — una llave sin entrada en el registry **falla cerrado** (error de autor logueado; un typo nunca corre sin gate). `requireStepUp` queda como override strictest-wins: puede estrechar (method fuerte específico, ventana más corta — validado por `isMethodAllowedForRisk`), nunca debilitar el requisito del registry. (refs EPIC-07-STEPUP-001)
- **`requireStrong` en `verifyStepUp` + policy de factores fuertes** — riskLevel `high` acepta solo grants `{passkey, totp}`: un grant de email **o de recovery code** nunca satisface high (un recovery code restaura acceso y cubre medium — no es llave maestra). `STEP_UP_NO_STRONG_FACTOR` por fin se emite: el probe de enrolamiento (`hasStrongFactorEnrolled`) corre ANTES de la distinción insufficient/required, así el usuario sin factor fuerte siempre recibe el CTA de enrolar en vez de un dead-end. (refs EPIC-07-STEPUP-001)
- **Dogfood + guardas** — `recovery_codes/regenerate` (medium) declarado en el registry como ejemplo vivo del contrato; `RecoverySection` recibe su `riskLevel` derivado del registry en el RSC (el client nunca re-declara sensibilidad); shape guard del registry en tests (llaves `(resource, action)` únicas); `hasTotpEnrolled` extraído a `totp-status.ts` (módulo plano — en `totp.ts`, que es `'use server'`, cada export sería un endpoint público). E2E Scenario E prueba el filtro strong contra Postgres real. (refs EPIC-07-STEPUP-001)

### Fixed

- **Fast-path del gate antes de leer env** — las actions sin par en el registry y sin override salen del gate sin tocar `isMfaEnabled()` ni la DB; mantiene vivos los mocks parciales de `@/lib/env` en tests (del kit y de derivados). El check de llave-declarada-sin-entrada corre incluso con MFA off (es error de código, no postura de runtime). (refs EPIC-07-STEPUP-001)

---

## [11.1.3] - 2026-07-03 — Autogen registries hardening + generadores en TypeScript

> **Patch.** Auditoría a fondo de los 5 autogenerados de `project/reference/*` (INVENTORY/CODEBASE/HOOKS/SCHEMA/API): los 5 generadores compartían una clase de bug —asumir que la forma sintáctica o el directorio == la superficie real— y ninguno tenía test, así que fallaban en silencio. Los 5 quedaron arreglados con fix + test de fidelidad co-locado, y migrados de `.mjs` a `.ts` para que entren bajo `tsc --noEmit` (la red que atrapó un `ReferenceError` durante el propio trabajo). Aditivo; los derivados adoptan el cerebro vía `factory:update`. El CLI `@timekast/factory` se re-publica con un mecanismo de self-heal para los alias `generate:*` obsoletos (ver su release `cli-v1.18.0`).

### Fixed

- **CODEBASE — alias `@/` resolvía contra la raíz, no `src/`**: descartaba ~92% de las aristas (66 conexiones / 210 orphans falsos, sección High-Risk invertida). Ahora resuelve bajo `src/` → 780 conexiones / 18 orphans, con `cn.ts`/`logger.ts`/`button.tsx` correctamente al tope de High-Risk.
- **INVENTORY — catálogo de componentes vacío**: un path bug (`src/` faltante) dejaba INVENTORY sin ningún componente, y el allowlist estático omitía `components/admin`/`settings`. Ahora descubre `src/components/*` dinámicamente + Summary con conteo real (ya no infla contando npm scripts).
- **HOOKS — barrels multilínea + categorías faltantes**: el parser per-línea tiraba los `export {}` multilínea (Dialog/AlertDialog, ~22 símbolos); + categorías nuevas (PWA/Context/ID/Auth helpers) para que los anchors de `sk-pwa`/`sk-pull-to-refresh`/`sk-security` se cumplan de verdad.
- **API — superficie de acciones/rutas incompleta**: escaneaba solo `src/lib/actions` + `src/app/api`; ahora por directiva `'use server'` en todo `src/` + `route.ts` en todo `src/app` (recupera las actions de MFA/TOTP + la route de serwist; 43→49 actions). + fix de un `ReferenceError` en la rama de degradación + contrato exit-0 uniforme en los 5 generadores.
- **SCHEMA — columnas spread + onDelete multi-palabra**: expande `...auditFields`/`...softDeleteFields` (evita columnas fantasma en tablas derivadas que usan los helpers canónicos) + captura `onDelete: 'set null'`/`'no action'` (regex antes truncaba a `\w+`).
- **INVENTORY — test files co-locados excluidos** del catálogo (`*.test`/`*.spec`/`*.stories`).

### Changed

- **Los 5 generadores de `project/reference/*` migrados de `.mjs` a TypeScript**, corriendo vía `tsx` (como `preflight.ts`/`db-query.ts`/`skill-lint`) → entran bajo `tsc --noEmit`, la red de tipos que un `.mjs` no tenía. Cada uno con test de fidelidad en `tests/unit/scripts/`; runtime idéntico (los registries regeneran byte-idéntico salvo el footer). El CLI auto-wirea los comandos `tsx` a los derivados nuevos; los existentes se auto-sanan el alias en su próximo `factory:update`.

### Added

- **Intake Tier 1-fallback (`/discovery`)**: texto plano legible sin strategy dedicada (`.yml`/`.sh`/`.toml`, config declarativa, shell comentado) se extrae best-effort como Reference/Context en vez de degradar a Tier 2/`[OQ]` — cierra el seam entre Tier 1 y Tier 2. Discriminador objetivo: "¿se lee limpio ya?", no la extensión.

---

## [11.1.2] - 2026-07-01 — invite-admin envía correo en go-live (fix de provision)

> **Patch.** Corrige la inconsistencia de fuente en `invite-admin`: minteaba el token del super_admin en la DB de producción pero enviaba el correo con la config de email **local**, que provision nunca escribía al `.env.local` (solo la subía a Vercel) → caía al fallback de consola y el correo nunca salía. Ahora provision escribe la config de email al `.env.local`, y el workflow de go-live no cierra el AC si el correo no se envió. Aditivo; el cerebro se adopta vía `factory:update` y el CLI vía `npx @timekast/factory@latest`.

### Fixed

- **`invite-admin` envía el correo en go-live** — `factory provision` ahora escribe `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (del rail) + `EMAIL_FROM` (sender fijo del org) al `.env.local`, no solo a Vercel. El correo de `invite-admin` (ambos targets), magic-link y `db:seed` local ahora se **envía de verdad** —tagged `[Dev]` fuera de producción— en vez de caer al fallback de consola. El env-wizard day-2 las sigue ofreciendo (gated por `EMAIL_PROVIDER`), con el valor que provision dejó como default.

### Changed

- **Go-live (SETUP-002) exige envío real del correo** — el AC del invite de super_admin ahora requiere `emailSent:true`; el fallback de consola ya no lo satisface en `--target main`. `setup-epic`/`tk-implement` frenan el cierre si el correo no se envió (gate de output, no solo exit-code). En `--target develop` el fallback de consola sigue siendo legítimo.

---

## [11.1.1] - 2026-07-01 — provision-cycle al dominio del CLI + fixes de provision (CLI 1.17.3)

> **Patch.** Housekeeping tras v11.1.0. El test del ciclo completo de provision se relocaliza de la suite e2e de la app al dominio del CLI —deja de colarse a cada derivado como 7 skips de ruido— y se sellan en `main` los fixes de provision/CLI que ya salieron por npm en `@timekast/factory` 1.17.x. Aditivo; el cerebro se adopta vía `factory:update` y el CLI vía `npx @timekast/factory@latest`.

### Changed

- **`provision-cycle` movido a `cli/tests/integration/` (vitest)** — el test de integración del ciclo `factory provision` (PROV-010, que ejercita Neon/Vercel/Cloudflare reales) vivía en `tests/e2e/` de la app, donde montaba la suite Playwright y se distribuía a cada derivado como 7 skips estructurales de puro ruido. Ahora vive bajo `cli/` —su dominio real—: como `cli/**` ya se excluye de todo perfil de distribución, deja de viajar a los derivados **por construcción** (no por una exclusión puntual en `profiles.json`), y la suite e2e de la app queda 100% app. Corre gateado por las tokens org vía `pnpm -C cli test:provision`; port de Playwright a vitest (`describe.skipIf`, `expect.poll`, paths anclados a `import.meta.url`).

### Fixed

- **Provision: `NEXT_PUBLIC_APP_URL` per-ambiente** — provision lo marca provision-owned y lo fija al dominio real (production → `https://{slug}.timekast.mx`, preview → `https://{slug}-dev…`); `env:push` ya no sube `localhost` a producción, y el paso de dominio-cliente lo re-apunta en lockstep con `AUTH_URL`. `.env.local` conserva `localhost` para `pnpm dev`.
- **Provision: creds E2E locales idempotentes** — un paso post-loop escribe `NEON_API_KEY`/`NEON_PROJECT_ID` en `.env.local` siempre que el state tenga proyecto Neon (antes solo en el primer pase del substrato → `pnpm test:e2e` local fallaba en resume/adopt).
- **CLI: `--help` nunca dispara el comando** — `factory env push --help` ejecutaba un push real a Vercel (el check de help solo miraba el primer arg); ahora `--help`/`-h` en cualquier posición imprime ayuda y retorna.
- **Distribución: el track validator acepta `.husky/`** — `ALLOWED_ROOTS` de atomic-swap no incluía `.husky/**` (que `profiles.json#track` sí lista), así que un tarball v11.0.0+ correcto se rechazaba como "release mal construido"; alineado + test anti-drift que cubre cada root de `profiles.json#track`.

> Los fixes de arriba ya están live en el CLI `@timekast/factory` 1.17.3 (npm); este release del kit los sella en `main` y propaga la relocación del test a los derivados nuevos.

---

## [11.1.0] - 2026-07-01 — Env wizard guiado secret-safe + confiabilidad de bootstrap/e2e

> **Minor.** El env wizard de `factory provision` se vuelve una configuración **guiada y secret-safe**: explica cada variable, arranca de lo que provision ya dejó, auto-genera lo que el dev no puede tipear, y nunca pasa un secreto por la conversación. Además endurece el flujo de bootstrap (primer deploy) y el wiring de e2e (CI + local). Aditivo; los derivados adoptan el cerebro vía `factory:update` y el CLI vía `npx @timekast/factory@latest`.

### Added

- **Env wizard guiado y secret-safe** — `factory env wizard` gana `--gen-vapid` (genera el par VAPID con `node:crypto`; la privada nunca sale a stdout), `--review` (resumen del `.env.local` con los secretos enmascarados), guards de completitud (OAuth activado sin creds, notificaciones sin VAPID) y defaults desde el estado de provision (EMAIL arranca en `resend` si ya se configuró). El skill `tk-provision §5(d)` lo orquesta como guía nivel-máximo con una regla dura: ningún valor de secreto cruza la conversación.
- **Selección de skins shipped desde el registry** — `/design` ofrece los skins del registry y `/backlog` los materializa (SETUP-003 condicional).

### Fixed

- **Confiabilidad del wiring de e2e** — provision reintenta los GitHub Secrets de e2e (`NEON_API_KEY` / `NEON_PROJECT_ID` / `DATABASE_URL`) una vez que el substrato confirma el repo (antes quedaban `pending` hasta un `--resume` manual), y escribe las NEON creds en `.env.local` para correr `pnpm test:e2e` local sin `setup:e2e`. El `e2e-runner` mata el árbol de procesos del server entre fases y confirma que el puerto quedó libre — cierra el zombie que hacía correr la Phase B (MFA on) contra el server de la Phase A (MFA off).
- **Bootstrap: migración `0000` commiteada antes del push de provision** — el primer `vercel-build` ya encuentra el schema (antes el deploy tronaba con `Can't find meta/_journal.json`). El slug de provision se resuelve desde `project-config.md` en vez del nombre del directorio.
- **`notifications.updated_at` → `modified_at`** — rename de la columna para alinear con la convención del kit.

---

## [11.0.1] - 2026-07-01 — Preflight fix + autogen determinista + CLI 1.16.0

> **Patch.** Correcciones de tooling acumuladas tras v11.0.0: el preflight deja de recrear el dir de migrations en cada `/deploy`, los autogen dejan de churnearse por fecha, y el CLI sube a `1.16.0` con el mint de claves MFA/WebAuthn per-env. Aditivo; los derivados adoptan el cerebro vía `factory:update`.

### Fixed

- **El preflight ya no recrea `src/lib/db/migrations/`** — `checkMigrations()` (`scripts/tools/preflight.ts`) skipea `drizzle-kit check` cuando el proyecto no tiene migrations `.sql` (el Factory las dropea por `BR-FACTORY-005`). Antes `drizzle-kit` materializaba un `meta/_journal.json` vacío que aparecía como untracked-sorpresa y bloqueaba el pre-check en cada release. Los derivados con migrations reales no se ven afectados (el check corre normal).

### Changed

- **Autogen de `project/reference/*` determinista** — los 5 generadores (`generate-{inventory,codebase,hooks,schema,api}.mjs`) dejaron de stampear `> Last updated: <fecha>` en el header. git ya trackea la fecha real, así la regeneración deja de producir un diff diario espurio (que aparecía como `MM` en cada release).
- **CLI `@timekast/factory` → `1.16.0`** — `factory provision` ahora mintea `MFA_ENCRYPTION_KEY` + `WEBAUTHN_RP_ID` per-env, para que un derivado nuevo nazca con las claves de MFA/passkeys de v11.0.

---

## [11.0.0] - 2026-07-01 — Identidad user-céntrica, MFA y passkeys + sistema de skins intercambiable (vocab v11)

> **Major.** El design system se vuelve **intercambiable por skin**: `globals.css` queda como capa estable (directivas Tailwind + aliases `@theme inline` + una sola línea de `@import` del skin activo) y la identidad visual concreta (los 3 bloques de tema + las utilidades `.surface-*` + las recetas de elevación) se muda a un skin swappable bajo `src/app/skins/<name>.css`. El kit nace con **neomorphism** por defecto y trae un segundo skin **fintech** (graphite + teal/esmeralda) opt-in. El vocab de contrato se de-brandeó de `--neo-*` a `--elevation-*` / `.surface-*` / `variant="surface"`, así un skin ya no impone una marca visual en los nombres. **Breaking en vocab** para quien extienda el `src/` del kit, pero **sin retrofit obligatorio** para apps ya creadas (el `src/` de un derivado nace congelado — `BR-FACTORY-006`). El bump a `11.0.0` lo ejecuta `/deploy`.

### Added

- **Sistema de skins intercambiable (`src/app/skins/`)** — la identidad visual vive en un archivo por skin que `globals.css` activa con una sola línea: `@import './skins/<name>.css';`. La capa estable (Tailwind directives + `@theme inline` + esa línea de import) no cambia al cambiar de skin; el skin provee los 3 bloques de tema (`light`/`dark`/`midnight`) + las utilidades `.surface-*` + las recetas de elevación. Skill `sk-skins` documenta la frontera estable-vs-swappable.
- **Skin `neomorphism` (default)** — `src/app/skins/neomorphism.css`: la identidad neomórfica histórica del kit (doble fuente de luz, superficies extruidas por sombra), ahora encapsulada como skin. Es el `@import` activo de fábrica.
- **Skin `fintech` (opt-in)** — `src/app/skins/fintech.css`: paleta graphite + teal/esmeralda en OKLCH, `card ≠ bg`, bordes visibles, elevación plana con sombra tintada. Paridad de contrato verificada con neomorphism (mismo key-set de vars × 3 temas). Para activarlo, cambia la línea de import en `globals.css` a `@import './skins/fintech.css';` (un solo archivo, sin tocar componentes).
- **Sistema MFA + step-up + identidad user-céntrica** — el kit gana un aparato completo de multi-factor y re-autenticación, documentado en la skill nueva `sk-mfa` (`.claude/skills/sk-mfa/`, par de `kb-security`):
  - **Passkeys (WebAuthn)** — ceremonia propia con `@simplewebauthn/server` (el provider nativo de NextAuth no soporta la estrategia Credentials + JWT del kit): `src/lib/auth/webauthn.ts` (challenge one-time, rpID/origin desde env nunca del `Host`, rechazo de regresión de counter, `userVerification: 'required'`) + `src/lib/auth/passkey.ts` (persistencia + anti-enumeración) + las rutas `src/app/api/auth/passkey/`. Login discoverable (usernameless). Gated por `WEBAUTHN_RP_ID`.
  - **TOTP (authenticator app)** — `src/lib/auth/totp.ts` (enroll → confirm → verify, ventana ±1, anti-replay) con el secreto CIFRADO at-rest (JWE `dir`+`A256GCM`) en `src/lib/auth/totp-crypto.ts` bajo `MFA_ENCRYPTION_KEY`.
  - **Código de step-up al correo** — `src/lib/auth/email-otp.ts`, fallback de riesgo MEDIO únicamente, hasheado (SHA-256) sobre una fila `step_up_grants` con ciclo pending → promoted.
  - **Step-up grants** — `src/lib/auth/step-up.ts` valida fail-closed leyendo el estado VIVO de `step_up_grants` (nunca el JWT): métodos confirmados, freshness floor, TTL y revocación por epoch. La política de qué acción es sensible vive en un único SSOT, `MFA_SENSITIVE_ACTIONS` (`src/config/mfa.ts`). Gated por `MFA_ENABLED` (+ `MFA_REQUIRED_ALL` para enrollment obligatorio).
  - **Recovery codes hasheados** — `src/lib/auth/recovery-codes.ts` (CSPRNG, single-use, SHA-256 sin sal) + redención en `src/lib/auth/mfa-login.ts`; sobreviven a la pérdida de `MFA_ENCRYPTION_KEY` (asimétrico vs el secreto TOTP, a propósito).
  - **2FA-on-login** — `src/lib/auth/mfa-login.ts` limpia la compuerta `pendingMfa` solo tras un check de segundo factor server-side, nunca por el payload del cliente.
  - **Account-linking CSRF-resistente (logueado)** — `linkAccount` (`src/lib/actions/auth/link-account.ts`) gateado por `requireStepUp({ maxAge: 300 })` antes de iniciar el flujo OAuth; `unlinkAccount`/`removePasskey` rehúsan quitar el ÚLTIMO método de acceso (lock `FOR UPDATE` + `countAccessMethods` en una transacción, `src/lib/auth/access-methods.ts`).
  - **Cambio de correo verificado** — `src/lib/auth/email-change.ts` (link a la dirección NUEVA, alerta de seguridad a la VIEJA, tokens hasheados one-time con 1h de expiración, colapso anti-enumeración de inválido/expirado/usado).
  - **Fix de account-takeover (email-verification gate)** — el flujo de identidad cierra el takeover por verificación de correo: aplicar un cambio o tomar posesión de una cuenta exige el token verificado, sin caminos que dejen `emailVerified` colgado.

### Changed

- **Vocab del design system de-brandeado** — el contrato de tokens/utilidades dejó de cargar la marca `neo` en sus nombres:

  | Antes (v10) | Ahora (v11) |
  | --- | --- |
  | `--neo-*` (variables de contrato) | `--elevation-*` |
  | `.neo-*` (utilidades de superficie) | `.surface-*` |
  | `variant="neo"` (prop de componente) | `variant="surface"` |

  Las únicas `--neo-*` que sobreviven son privadas del skin neomorphism (`--neo-light` / `--neo-dark`, las dos fuentes de luz) y viven solo dentro de `src/app/skins/neomorphism.css` — no son contrato, no se consumen fuera del skin.
- **Checkbox de-brandeado a primitiva Radix** — el checkbox del kit dejó de depender del vocab neomórfico y se reescribió sobre Radix, neutral al skin activo.
- **`sk-security` extendido con las secciones MFA (§13–§17)** — la skill de seguridad ganó la cobertura del split-config de auth, la matriz RBAC, los buckets de rate-limit y el gate de account-linking sobre los que `sk-mfa` se apoya, para que el aparato MFA tenga su base documentada en un solo lugar.
- **`sk-features-index` actualizado con las filas MFA** — el catálogo de "qué trae el kit" lista passkeys, TOTP + código al correo, step-up grants, recovery codes e identidad user-céntrica (tabla Core), más las entradas env-gated (`MFA_ENABLED` / `WEBAUTHN_RP_ID`) en la tabla Optional, cada una enlazando a `sk-mfa`.
- **Cerebro `.claude/` barrido a vocab v11** — rules, skills y commands se actualizaron al vocab `--elevation-*` / `.surface-*` / `variant="surface"`. Quedan menciones tolerados de `--neo-*` solo donde son históricas o de snapshot frozen: `sk-tokens-neomorphism/SKILL.md` (referencia per-token del skin neomorphism, con cláusula), este `CHANGELOG.md` (historial), y el `fx-presentation-kit/` (snapshot estático, ver abajo).

### Removed

- **🔴 Generador `generate:presentation-theme` retirado (migration note crítica para derivados)** — el script que regeneraba `fx-presentation-kit/theme.css` desde los tokens del kit fue **retirado en v11**. A partir de ahora, `fx-presentation-kit/theme.css` es un **snapshot estático (frozen)**: el presentation-kit quedó congelado en su última versión generada y ya **no es regenerable automáticamente**. Los derivados que dependían de ese script para regenerar su presentation-theme deben **usar el snapshot congelado tal cual** — no hay forma de regenerarlo desde v11. Si un derivado necesita estrictamente la capacidad de regenerar, debe quedarse en v10 o adaptar su proceso para tratar el snapshot como artefacto manual. El retiro **no es reversible** en v11.

### Security

- **Cerrados los findings de la auditoría de seguridad de EPIC-07** (step-up / 2FA-on-login) — un P1 + varios P2 del aparato MFA, antes de sellar el release.
- **Bypass de step-up vía email-OTP cerrado (P1)** — un método transitorio de riesgo MEDIO ya no satisface un gate que exige re-autenticación fuerte; sumado a un techo absoluto de fuerza bruta por-`userId` en la verificación de email-OTP (P2), que acota el total de intentos aunque el atacante rote IPs.
- **Algoritmos JWE fijados en el decrypt del secreto TOTP** — defense-in-depth: el decrypt rechaza cualquier algoritmo distinto al esperado (`dir` + `A256GCM`), cerrando un vector de confusión de algoritmo.
- **Linking de OAuth endurecido** — rehúsa vincular una identidad OAuth ya poseída por otra cuenta; el guard de access-methods es atómico (lock en transacción) y emite audit events en cada alta/baja de passkey.
- **Resend de verificación throttleado por IP** + guard del pin de `@auth/core` (evita que un bump transitivo reintroduzca el bypass de nodemailer).

### Fixed

- **2FA-on-login end-to-end** — el login con passkey y con OAuth ahora satisface la compuerta de segundo factor; la pantalla `/2fa` completa el ciclo con session-update + `callbackUrl`; el overlay de step-up se abre al vincular una cuenta (SMK-14); el toast de bienvenida sale **después** de completar el 2FA, no antes.
- **Cambio de email** — revalida el layout tras el cambio para que la UI refleje el correo nuevo (SMK-16); `SessionProvider` deja de refetchear on-focus y se montó a nivel de página (raíz de SMK-15).
- **Pulido de UI / skin fintech** — superficies skin-aware, primitivas del kit alineadas al catálogo fintech, sombras tokenizadas que siguen el skin activo, elevación de badges/card/dev-pill, touch target de 44px en los botones de access-method, y el overflow del overlay de step-up (cajas OTP de ancho fijo).

### Migration

- **Apps legacy (derivados ya creados) NO necesitan retrofitear código.** El `src/` de un derivado nace congelado al hacer `factory new` (su `factoryVersion` es el sello de nacimiento) y `factory update` **nunca** toca `src/` — solo refresca el cerebro `.claude/`. Por eso el rename de vocab no rompe apps existentes: su `src/` sigue usando `--neo-*` / `.neo-*` mientras no se actualice a mano. Lo único que viaja a un derivado vía `factory update` es el cerebro `.claude/`, que incluye la **cláusula tolerante** en `sk-tokens-neomorphism` (el skill tolera tanto el vocab v11 como el `--neo-*` legacy del `src/` divergente del derivado — nunca asume que el `src/` del derivado == el del kit). Un retrofit del vocab en una app legacy, si se decide, es **manual y opt-in**, caso por caso.
- **Activar el skin fintech en un derivado:** cambia la línea de import del skin activo en `src/app/globals.css` de `@import './skins/neomorphism.css';` a `@import './skins/fintech.css';`. Un solo archivo, sin tocar componentes ni el resto de `globals.css`.

---

## [10.11.1] - 2026-06-26 — Husky hooks viajan en `factory update` + fixes del launcher en Windows

> **Patch.** Arregla que los hooks de husky no se refrescaban en `factory update` (solo viajaban en el bootstrap inicial), más dos fixes del launcher de escritorio en Windows. Aditivo; los derivados existentes adoptan el cerebro vía `factory:update`.

### Fixed

- **`factory update` ahora refresca los hooks de husky** — `.husky/**` entró al `track` de la distribución, así que el manifest los lista y el `update` los sincroniza con la resolución de conflictos normal por archivo. Antes solo viajaban en el bootstrap (`new`): un cambio a `.husky/pre-commit` en el Factory nunca llegaba a derivados ya creados. Acotado al perfil `full` (core no empaqueta `.husky/`).
- **Launcher (Windows)** — envuelve la línea de comando en un par de comillas externo para `cmd /s`; sin esto `cmd` se comía las comillas de `npx` y todo comando del CLI (doctor/new/update/secrets) fallaba en Windows mientras macOS/Linux funcionaba.
- **Launcher** — el parse del doctor-pill ahora tolera el ruido de stderr del cold-install de `npx`: una línea de instalación con `[`/`]` desviaba el slice del parser y el pill mostraba error aunque el CLI emitía JSON válido.

---

## [10.11.0] - 2026-06-25 — Bootstrap por invite + wizard de env + provision inline + launcher v1.1

> **Minor.** Consolida el **rediseño del bootstrap inicial** del derivado — el primer admin se materializa por invite (sin password en claro), las env vars se llenan con un wizard day-2, el derivado nace con migración cero, y el setup epic aprovisiona la infra inline desde `/implement` — más el pulido del **launcher de escritorio v1.1** y el **self-heal determinista del Service Worker**. Aditivo; los derivados existentes adoptan el cerebro vía `factory:update` (el `src/` congelado no cambia).

### Added

- **Admin por invite-token (reemplaza el seed con password en claro)** — `pnpm invite:admin` mintea un invite single-use con `role: super_admin`; el admin pone su propia contraseña en `/accept-invite`. Sin `SUPER_ADMIN_PASSWORD` en `.env`, sin `password: null`, y recuperable por construcción (un admin soft-deleted se rescata minteando otro invite). El bootstrap del primer admin en `main` lo crea `SETUP-002` post-deploy.
- **Wizard de env day-2 (`factory env wizard`)** — deriva las preguntas del `.env.example` del derivado (secciones + texto de ayuda + condicionales: `EMAIL_PROVIDER` revela sus credenciales, los flags OAuth las suyas) y escribe `.env.local`. Primitivas **no-interactivas** (`--plan --json` para emitir el plan · `--apply` para aplicar respuestas por stdin) que maneja la skill `tk-provision` (AskUserQuestion en terminal / curador HITL en headless) **o** el TUI de `factory` — headless-safe, sin readline en el CLI.
- **`factory env push` (alias `pnpm env:push`)** — sube las product vars de `.env.local` a Vercel (production + preview) sin tocar las provision-owned (DATABASE_URL/AUTH_SECRET/…), sin `vercel link`. Para agregar una variable después del provisioning inicial.
- **Setup epic re-tallado para provisioning automatizado seguro** — `SETUP-001` ahora instala + genera la migración `0000` + **aprovisiona** (el `/implement` carga `tk-provision` inline; el gate HIGH-risk es el CP2 de provision, no un CP-A redundante) + `verify`; `SETUP-002` verifica el primer deploy+migrate y crea el invite del super_admin en `main`. Se borró el runbook manual stale (`vercel link` / Neon manual / `setup-e2e.ts`) — `provision` automatiza el cloud por REST + tokens del rail, dentro de `SK.md §7.1`.
- **Launcher de escritorio v1.1** — pulido de UI (switch de perfil full-width, CTA primario, checks de `doctor` apilados, badge de update con auto-quit, ícono propio de TimeKast reemplazando el default de Electron) + check del secrets-rail en `doctor --launcher` (warn si falta alguna de las 8 keys).
- **PWA — self-heal determinista del Service Worker** — guardas de work-at-risk (un form sucio o un save en vuelo NO disparan la recarga del SW) + re-focus; el `<Form>` auto-registra el contrato de unsaved-changes y se agrega la primitiva `useSaveInFlight`.

### Changed

- **Migración cero — el `user_human_id_seq` se mintea on-demand** — `getNextHumanId` corre `CREATE SEQUENCE IF NOT EXISTS` la primera vez que se acuña un humanId, así el `0000` queda **puro drizzle** (solo tablas) y el Factory deja de shippear `src/lib/db/migrations/` (su DB es desechable → `db:push` manual). El derivado genera su propio `0000` con `db:generate` en el setup. Sin seed ni migración que mantengan la sequence.

### Fixed

- **Seguridad — cerrado el dev-bypass de auto-promoción a super_admin** — en `POST /api/invites/send` el check de jerarquía de rol ahora corre **siempre** (incluso en `NODE_ENV=development`), acotado al rol default cuando no hay sesión: una request sin sesión ya no puede mintear un invite `super_admin` (el redesign había ampliado el radio del bug preexistente porque `metadata.role` pasó a ser el driver autoritativo del rol).
- **Seguridad — cerrado el TOCTOU del accept-invite** — el claim del invite es atómico (`UPDATE … WHERE acceptedAt IS NULL … RETURNING` dentro de una transacción real sobre el Pool de Neon): dos accepts concurrentes del mismo token ya no crean dos cuentas, y un insert que falla tras el claim revierte la transacción. Con test que renderiza el predicado a SQL (falla si alguien lo borra).
- **Hardening** — cap de largo de password a 72 (límite efectivo de bcrypt → frena el DoS de bcrypt + el truncado silencioso) en `accept` + `register`; `.env.local` se escribe `0600` (owner-only — importa en el Agent Server headless multi-tenant).
- **Launcher** — hidrata el `PATH` del login shell (la app lanzada desde Finder encuentra `npx`/`gh`), spawnea `npx` vía `cmd.exe` en Windows, descarga los instaladores vía `gh release download`, y sube el timeout de `doctor` a 30s para el cold cache de `npx @latest`.
- **Bottom-nav** — flush sobre el home indicator, cluster centrado con padding superior, íconos a 24px para la barra con safe-area.
- **provision** — lowercasea los nombres de recursos + persiste el dominio dev en el state.

---

## [10.10.0] - 2026-06-24 — Provision zero-friction + launcher GUI Electron + identidad PWA por entorno

> **Minor.** Release que consolida el trabajo de onboarding de proyectos derivados acumulado en develop desde 10.9.0. Highlights: **`factory provision`**, que deja un derivado vivo en la nube (Neon + Vercel + GitHub + DNS + Resend) con un comando, validado end-to-end contra las APIs reales; un **launcher GUI Electron** cross-platform que reemplaza el `.app` AppleScript; la **identidad PWA por entorno** (manifest + iconos + pill in-app distintos en dev vs prod); la **PWA edge-to-edge** con safe-area insets de iOS; y el pivote de las **migraciones al build de Vercel** (gateadas naturalmente, sin GitHub Actions). Ningún breaking change — todo aditivo; los derivados existentes adoptan vía `factory:update`.

### Added

- **`factory provision` — onboarding de infra zero-friction** — un comando levanta el entorno completo de un derivado: proyecto Neon (branches main/develop, key project-scoped), proyecto Vercel ligado al repo con env sync por entorno, repo GitHub con sus secrets, dominios DNS-only en Cloudflare + Resend, y el primer deployment. Primitivas no-interactivas flag-driven (headless-safe), con `--ephemeral`/`--adopt`/`--destroy` por lifecycle y `--resume` granular por sub-paso. Validado en vivo contra las APIs reales (no solo mocks) tras la tanda de fixes que el uso real destapó.
- **Skill `tk-provision` + comando `/provision`** — la capa de agente interactiva encima de las primitivas del CLI: verifica herramientas, lee el provision state, pregunta qué servicios y dominio levantar, corre las primitivas en orden y narra el progreso, parando en un gate Plan Mode HIGH-risk antes del sustrato git + GitHub App irreversible.
- **Launcher GUI Electron (`desktop/`)** — app de escritorio standalone (shell neomórfico) para que cualquiera del equipo cree/actualice proyectos, vea `status`/`doctor` y ponga secrets sin tocar la terminal. Línea de release propia `gui-v*` desacoplada del kit; build de instaladores (`.dmg`/`.exe`) por CI en runners macOS + Windows, gateado por el repo privado.
- **Identidad PWA por entorno (`NEXT_PUBLIC_APP_ENV`)** — manifest + iconos env-aware y un componente `<EnvBadge>` (pill in-app) que distingue dev vs producción, para no confundir instalaciones cuando un derivado corre en varios entornos. El install de dev queda separado por origin (`{slug}-dev` vs `{slug}`).
- **PWA edge-to-edge + safe-area iOS** — `viewport-fit=cover` + tokens de safe-area (`pt-safe`/`pb-nav-safe`/`pt-content-safe`/`pb-content-safe` como `@utility` Tailwind v4) + fix del detach de la nav fija en iOS. Sin `viewport-fit=cover` las `env()` valían 0; ahora el shell respeta los insets del notch/home-indicator.
- **`<NotificationsProvider>` shell-mounted** — un único provider montado en `DashboardShell` es el SSOT del estado de notificaciones del shell; las 5 instancias previas de `useNotifications()` (bell, panel, header, bottom-nav, more-sheet) colapsan a un solo polling.

### Changed

- **Migraciones en el build de Vercel** — `vercel-build` corre `pnpm db:migrate && pnpm build`, así cada deployment migra la DB de su target (production←main, preview←develop, idempotente por drizzle) antes de buildear, gateado naturalmente (migrate falla → build falla → no deploya). Reemplaza el approach previo de GitHub Actions + Deploy Hook, que dependía de un paso manual frágil.
- **Modelo DB dual main/develop en derivados** — `provision` genera el `.env.local` (gitignored: `DATABASE_URL` develop + `DATABASE_URL_MAIN` prod + `AUTH_SECRET` fresco) y el kit gana `pnpm db:query:main`/`:dev` (read-only, default develop) para inspeccionar cada branch sin tocar producción por accidente.
- **Launcher promovido a `desktop/` top-level** — el launcher dejó de vivir bajo `cli/` y ahora es un dir raíz, con detección propia en `/deploy` (corte `gui-v*` independiente del CLI `cli-v*`).

### Fixed

- **Mail transaccional desde el subdominio `updates.<dominio>`** — `provision` ponía `EMAIL_FROM` en el apex, que en TimeKast vive en Google Workspace (el apex no está verificado en Resend) → el correo nunca habría salido. Convención uniforme nueva: `updates.<dominio>` para org y para el dominio del cliente (no el apex, que tiene su propio correo corporativo).
- **El badge de notificaciones se sincroniza al instante al marcar leída** — el contador "sin leer" esperaba hasta 30s (el próximo poll) para bajar cuando se marcaba una notificación desde otro componente; el `<NotificationsProvider>` propaga el optimistic update a todos los consumidores de inmediato. _Cambio de arquitectura:_ `useNotifications()` ahora requiere el provider en el árbol (throw si falta — fail-loud) y `enabled` se pasa al provider, no al hook. Solo afecta código nuevo / extensiones del kit (el `src/` de los derivados existentes está congelado).
- **Tanda de fixes de `provision` destapados en vivo** — contratos reales que los mocks escondían: `PATCH /v9/projects` rechaza `productionBranch` en la raíz (tumbaba `ssoProtection`/`autoExposeSystemEnvs`), el primer deployment se dispara explícito por API tras ligar el git, `deriveProjectName` deriva del dir en vez del team id, el branch develop de Neon se persiste/crea idempotente, y `--destroy` limpia proyecto + key + CNAME del dev sin dejar huérfanos.

### Security

- **CSP reports elevados a Sentry** — los reports de violación de Content-Security-Policy se reportan a Sentry (con la consola de dev silenciada) en vez de perderse, para detectar inyecciones/recursos no autorizados en producción.

---

## [10.9.0] - 2026-06-20 — Canal beta + secrets de metodología + propuestas Gamma + launcher macOS + day-2 design

> **Minor.** Release grande que consolida el trabajo acumulado en develop desde 10.8.0. Highlights: un **canal beta** de distribución para validar el cerebro en un derivado real antes de liberarlo; el rail **`factory secrets`** para distribuir secretos de metodología org-gated; el pivote de **`/proposal` a decks Gamma + short.io**; el **launcher macOS** (`.app`) sin-terminal para no-devs más la tanda de fixes que destapó su uso real; el modo **day-2 `/design add`** para iterar diseño sobre apps ya existentes; la **graduación asistida de enums** (text → pgEnum); autogen de **SCHEMA.md + API.md**; el **modo fluido** de checkpoints kit-wide; el skill consumer-facing **`fx-factory-cli`**; y un fix de seguridad de **escalamiento de privilegios** en el callback JWT. Ningún breaking change.

### Added

- **Canal beta de distribución (`dist:beta` + `factory beta`)** — corta un pre-release del cerebro (`.claude/`) desde develop (`pnpm dist:beta`, solo-tag) que un derivado opta a instalar (`factory beta` / `update --beta`), prueba, y promueve a estable (`update --stable`). Cierra el hueco de no poder probar un cambio del cerebro en un derivado real antes de liberarlo. Comparador semver hand-roll con precedencia de pre-release, marca `beta` en el lockfile, download del último `-beta.N` (semver-max), banner BETA en `status`/`doctor`, y versión-desde-tag en CI. Beta = `.claude`-only (bumpea solo `agentKitVersion`); salida explícita al estable; no toca `main`.
- **Rail `factory secrets <file>` (org-gated, fail-closed)** — mergea un master `KEY=value` a `~/.claude/.env` de forma idempotente, con gate de membresía de org **antes** de cualquier I/O, no-echo de valores (solo nombres de clave), y merge no-ingenuo (split en el primer `=`, preserva quoting/comentarios). Disponible también desde el launcher macOS ("Poner secrets"). Distribuye secretos de metodología (p.ej. la key de publicación) sin pasos manuales por dev.
- **Launcher macOS sin-terminal (`.app`)** — GUI de doble-click para que cualquiera del equipo cree/actualice proyectos y ponga secrets sin abrir la terminal. Preflight de requisitos (node/gh/auth/membresía de org) con mensajes accionables, `new` no-interactivo vía `--full`/`--core`, y `update --yes` no-interactivo para el registro legacy.
- **Skill consumer-facing `fx-factory-cli`** — referencia del CLI `@timekast/factory` que viaja a los derivados (glob `fx-*`): API-reference de todos los comandos + flags, árbol de decisión de perfil, versión dual + lockfile desde el lado consumer, rail `secrets`, canal beta/stable, y troubleshooting. La cara "consumir" del par con `fx-distribution` (origin-only).
- **Modo day-2 `/design add`** — itera diseño sobre una app ya existente (no greenfield): clasificación day-2 SSOT + action-matrix, branch `plan-code` source_mode en los agentes, seed de `16_DESIGN` + Phase 2-seed, frontmatter de provenance opcional en los SCR, y el gate de diseño Phase 0.6 en `/backlog`.
- **Graduación asistida de enums (`db:harden-enum`)** — workflow text → pgEnum con enum-registry como SSOT y detección advisory de candidatos a pgEnum en el sweep de preflight.
- **Autogen de `SCHEMA.md` + `API.md`** — complementos as-built del data model y el API surface, generados de `src/lib/db/schema/*` y de las server actions + route handlers; file-gated en los kitLocalScripts del CLI con el agregado `generate:reference`.
- **Modo fluido de checkpoints (kit-wide)** — los workflows paran solo ante señal real; sin señal auto-avanzan con resumen. `--step` restaura el stop incondicional legacy.
- **Security-auditor como gate de fin de epic** — `/implement` corre un threat-modeling del código nuevo antes de cerrar (P0/P1 bloquean), con check opcional en `/preflight`.

### Changed

- **`/proposal` pivotea a decks Gamma + short.io** — deja de generar HTML/pantallas curadas; emite un markdown versionado, lo entrega como deck Gamma (vía la REST API, con polling async de `get_generation_status`) y acorta el link con short.io. Rail nuevo `factory secrets` para la key; `shortio.sh` con modo `--update` (upsert) para regeneración.

### Fixed

- **Launcher/CLI hardening (uso real del `.app`)** — hint accionable de scope `read:org` en el 404 falso-negativo de membresía, validación de Node ≥22 (no solo presencia), split de repo fresco (`add`) vs legacy (`update --yes`), `${SHELL:-/bin/zsh}` en vez de zsh hardcodeado, y pin de versión opcional del CLI.
- **Safety en derivados (dogfood mvpicks)** — `preflight`/`harden-enum` desacoplados de `@/config/enums`, reconocimiento de wrappers `with*` y guards de auth custom + pgEnum nativo en los reference generators, strip de scripts origin-only del `package.json` de un derivado nuevo, y `skill-lint` que avisa (no falla) en specifiers `sk-*` sin resolver dentro de un derivado.
- **`/deploy` preserva los `.gitkeep` de `project/`** en el selective merge a main (mantiene válidos los drop locations en los tarballs stable).
- **Varios** — parser de Story Points en formato inline canónico, alineación del ejemplo de `source_tier` al SSOT del template SCR, y corrección de module specifiers `sk-*` + invariante del resolver de skill-lint.

### Security

- **Fix de escalamiento de privilegios vía el callback JWT** — el `token.role` venía del cliente en el `update` callback sin revalidar contra la DB; un usuario podía auto-elevarse. El kit ahora revalida el rol contra la fuente de verdad. Afecta a todos los derivados — adoptar vía `factory:update`.
- **CSP Report-Only + validación de fuerza de `AUTH_SECRET`** — header CSP en modo report-only para empezar a medir violaciones sin romper, y validación de que `AUTH_SECRET` tenga entropía suficiente. Más los follow-ups de la auditoría de seguridad de EPIC-06 y el deny de redirecciones a `.env.local`.

---

## [10.8.0] - 2026-06-12 — Updates sin falsos conflictos + preflight invocable en derivados

> **Minor.** Dos fixes de distribución surfaceados por el primer ciclo real de update+release en un derivado (mvpicks): el formatter del derivado ya no puede generar falsos conflictos en `factory:update` (managed block de `.prettierignore`, cli-v1.5.0), y el sweep de readiness es invocable en cualquier derivado full (entry `preflight` asegurada file-gated por cli-v1.6.0 + cadena de fallback documentada en los workflows). Ningún breaking change.

### Fixed

- **Sweep de readiness invocable en derivados sin la entry `preflight`** — `package.json` es dev-owned y el CLI solo insertaba scripts `factory:*`, así que derivados bootstrapeados antes de 10.5.0 no tienen `pnpm preflight` aunque `scripts/tools/preflight.ts` sí les llega vía `factory:update`. Dos piezas: (1) el CLI (cli-v1.6.0) ahora asegura la entry `preflight` en `package.json` — **file-gated**: solo si `scripts/tools/preflight.ts` existe en el repo (full brain; un repo core/no-Factory nunca recibe un script roto), insert-if-missing (un `preflight` propio del dev jamás se pisa); (2) `tk-deploy` Phase 1.6 y `tk-preflight` documentan la cadena de fallback: entry de package.json → `pnpm exec tsx scripts/tools/preflight.ts` directo → degradación inline a los checks bloqueantes (audit + drizzle-kit check) con sugerencia de `factory:update`. Surfaced en el primer `/deploy release` de mvpicks con el gate nuevo.
- **Falsos conflictos en `factory:update` por el formatter del derivado** — el pre-commit de un derivado (lint-staged → prettier) reformateaba los archivos de `.claude/` al commitear el cerebro (alineación de tablas, estilo de énfasis en `.md`; también aplica a los `.css`/`.json` hasheados del kit), desalineando el disco de los hashes del lockfile: el siguiente `factory:update` marcaba como conflicto **todo** archivo que el Factory hubiera cambiado. Fix: el kit ahora shippea un managed block de `.prettierignore` (`.claude/` fuera del formatter) que `factory:update` (cli-v1.5.0) sincroniza quirúrgicamente preservando las reglas propias del dev — mismo mecanismo probado del bloque de `.gitattributes`. Cierra la mitigación 2 de A2 (`DISTRIBUTION_DESIGN.md §7.3`) que quedó a medias cuando se implementó la mitad de EOL. Repos con archivos ya reformateados verán esos conflictos UNA última vez (resolver con "Tomar el del Factory" / `--theirs-all`); desde ese mismo update quedan protegidos.

---

## [10.7.0] - 2026-06-12 — Gate de release determinista + estabilidad del pool de Neon

> **Minor.** Rediseño del gate de readiness de `/deploy` (build de producción siempre + sweep estático determinista; Lighthouse sale del gate y queda advisory en `/preflight`), eliminación de dos fuentes de checkpoints falsos en el deploy (autogenerados y merge commits propios), fix del crash del proceso por errores idle del pool de Neon, y hardening de response headers. Ningún breaking change.

### Changed

- **Gate de readiness de `/deploy` rediseñado: build + sweep determinista, Lighthouse advisory** — el gate de `release` ya no corre Lighthouse (no determinista en localhost; un score flaky bloqueaba el merge). Ahora `release` corre `pnpm build` siempre (no skippeable — antes nada buildeaba en el path de release si se saltaba el gate) + `pnpm preflight --t1`; `--skip-preflight` salta solo el sweep. En el script, Lighthouse y bundle size capean en warn (advisory; Lighthouse agrega por mediana sobre todos los reports lhci) — los bloqueantes del sweep son `pnpm audit --prod` (high/critical) y `drizzle-kit check` (high). Lighthouse sigue disponible vía `/preflight` standalone. Incluye fix del routing de fases de `tk-deploy` que brincaba el gate (CP1/1.5 ruteaban directo a Phase 2/3).

### Fixed

- **`/deploy` sin falsos checkpoints: autogenerados y merge commits propios** — los conflictos en `project/reference/*` (INVENTORY/CODEBASE/HOOKS) ya no disparan CP4: se pre-resuelven automáticamente porque Phase 4.5 los regenera del árbol mergeado de todos modos (BOARD.md ya estaba cubierto por el DENY de `project/*`). Y Phase 3 ahora reporta cuántos merge commits `ship:`/`release:` propios filtró al inspeccionar main — tras varios ships sin release parecían drift en un `git log` crudo y no lo son (anti-pattern explícito agregado).
- **El pool de Neon ya no tumba el proceso** — `@neondatabase/serverless` reusa WebSockets mientras la function sigue warm; Neon cierra conexiones idle y un `error` emitido sin listener escalaba a `uncaughtException` (crash fatal reportado en Sentry en un derivado). Se registra un handler en el Pool que loguea y absorbe — el pool recupera el client muerto en el siguiente query.

### Security

- **Response headers endurecidos** — `poweredByHeader: false` (quita el fingerprinting `X-Powered-By: Next.js`) y `Referrer-Policy` sube de `origin-when-cross-origin` a `strict-origin-when-cross-origin` (suprime el origin también en downgrade HTTPS→HTTP). `sk-security §10` actualizado en lockstep.

---

## [10.6.0] - 2026-06-11 — Sentry funcional bajo Turbopack + captura completa de render errors

> **Minor.** Repara el init del SDK cliente de Sentry (muerto bajo Turbopack desde que el kit buildea con él) y completa la captura de errores: render RSC, route handlers, server actions sin wrapper y error boundaries del cliente. Todo opt-in por DSN — sin DSN sigue siendo no-op. Detectado en el go-live de Sentry de mvpicks; derivados existentes lo adoptan vía `sk-observability/retrofit.md` Step 5. Ningún breaking change.

### Added

- **Captura de render errors end-to-end** — `onRequestError` en `instrumentation.ts` (wrapper de `Sentry.captureRequestError` con tag `correlation_id` desde el request header; cubre RSC render, route handlers y server actions no envueltas en `withAuth`/`withSelf`), boundary `global-error.tsx` nuevo (espejo de `error.tsx`, renderiza su propio `<html>`/`<body>`), y `captureException` en ambos boundaries gated por `!error.digest` (anti doble-captura: los errores SSR digested ya los reportó `onRequestError` con stack real). Tests de tag propagation + gate de digest + guardrail contra reintroducir `sentry.client.config.ts`. Docs: `sk-observability` §7 (tabla de cobertura) + §8, `retrofit.md` Step 5 (vehículo para derivados existentes — `tests/` no viaja por `factory:update`), notas portables en `kb-observability` (captura en 3 piezas, flush/unidades/schedule en cron check-ins).

### Fixed

- **Sentry cliente inicializa bajo Turbopack** — el init se movió de `sentry.client.config.ts` (solo lo inyectaba el plugin webpack del SDK; dead code bajo Turbopack, el SDK cliente nunca arrancaba aun con DSN) a `instrumentation-client.ts` (convención Next que Turbopack honra), con export `onRouterTransitionStart`. Además, `environment` y el gate de `tracesSampleRate` en los 3 inits ahora derivan de `VERCEL_ENV` (`NEXT_PUBLIC_VERCEL_ENV` en cliente) — los previews de Vercel reportan `NODE_ENV=production` y contaminaban el environment de producción en Sentry.

---

## [10.5.0] - 2026-06-10 — Preflight gate + observabilidad end-to-end + Combobox/MultiSelect

> **Minor.** Tres frentes: readiness check mecánico `/preflight` como gate de `/deploy`, correlation ID end-to-end con su par de skills de observabilidad, y nuevos componentes del design system (Combobox/MultiSelect + FormMultiSelect + Badge muted). Incluye la remediación de kit-drift detectada en derivados (karen-kein-bi, mvpicks). Ningún breaking change.

### Added

- **`/preflight` — readiness check mecánico + gate de `/deploy`** — sweep estático (knip, `pnpm audit --prod`, `drizzle-kit check`, bundle size) + Lighthouse sobre la app levantada, con veredicto READY / READY-WITH-WARNINGS / NOT-READY. `/deploy release` lo corre full automáticamente; `ship` post-release corre el tier T1. Lógica mecánica en `scripts/tools/preflight.ts` (testeable, headless-safe).
- **Observabilidad end-to-end** — correlation ID generado en el Edge proxy y propagado a logger, audit log y Sentry; par de skills `kb-observability` / `sk-observability` registrado en el enforcement de pares de `skill-lint`. (EPIC-03-OBS-001)
- **Showcase factory-only en `/showcase`** — scaffold develop-only para revisar componentes del design system con doble barrera de distribución: DENY del selective merge (no llega a `main`) + exclude del tarball (`profiles.json`). (EPIC-04-DRIFT-007)
- **Primitiva `Combobox`/MultiSelect neomórfica** — cmdk + Radix Popover, multi-select con badges, prop `fieldStyle: 'raised' | 'inset'`, ARIA completo (`aria-controls`/`aria-haspopup` vía `useId()`). Dep nueva: `cmdk`. (EPIC-05-DSYS-002)
- **`FormMultiSelect` en el form kit** — wrapper RHF (`Controller`) sobre la primitiva Combobox, geometría inset espejo de `FormSelect`. (EPIC-05-DSYS-003)
- **Badge: variante `muted`** — sexta variante con tokens semánticos `bg-muted` / `text-muted-foreground`, consistente en los 3 temas. (EPIC-05-DSYS-001)

### Fixed

- **`navigation.ts` sin `'use client'`** — se elimina la directiva stray que arrastraba el config a bundles client + guardrail lint que impide reintroducirla en `src/config/`. (EPIC-04-DRIFT-001)
- **`validate-commit` resuelve epic por filename-prefix** — soporta IDs compuestos (`EPIC-NN-DOM-NNN`) y deja de chocar con IDs repetidos entre backlogs viejos. (EPIC-04-DRIFT-002)
- **iOS A2HS hint vía Sonner toast** — reemplaza el div fixed propio por `toast()` con posición heredada del sistema. (EPIC-04-DRIFT-004)
- **Maskable icon dentro del safe-zone** — regenerado para WebAPK/Play Protect + documentación del requisito. (EPIC-04-DRIFT-006)
- **Stack trace en errores de `withAuth`/`withSelf`** — los logs de error del action wrapper ahora incluyen el stack completo, sincronizado en los snippets de `sk-observability`. (EPIC-03)
- **Combobox alineado al form kit** — el campo en contexto form-kit espeja la geometría y elevación sunken de `SelectTrigger` (finding bloqueante del ui-critic de EPIC-05, parcheado in-run). (EPIC-05)

### Security

- **Next bumpeado a 16.2.9 + override de `postcss`** — resuelve advisories del audit de pre-release hardening.

---

## [10.4.0] - 2026-06-08 — Permisos sin fricción (3 tiers) + auto-commits (CLI update / docs)

> **Minor.** Reclasificación de permisos al tier ASK (gate sin hard-block), auto-commit del cerebro en `factory update`, y gate de cierre uniforme para los workflows de documentación. Ningún breaking change.

### Added

- **Auto-commit del cerebro en `factory update`** — tras un update limpio, el CLI ofrece commitear el cerebro actualizado (local, **nunca** push): prompt y/n interactivo, **commit por default en headless** (Agent Server), con flags `--commit`/`--no-commit`. Stagea solo lo que el update tocó (manifest + lockfile + package.json + .gitattributes), nunca `git add -A`; skip si no hay cambios.
- **README propio del derivado en `factory new`** — el bootstrap genera un README scoped al proyecto (cómo correrlo + cómo mantener el cerebro `.claude/`) en vez de heredar el README del Factory; adapta `pnpm factory:*` vs `npx` según el perfil.
- **Gate de cierre `CP-commit` para documentation-family** — `/discovery`, `/design`, `/backlog`, `/proposal`, `/mockup` ofrecen al cerrar `1. nada / 2. commit / 3. commit + push` de los durables generados (sin push salvo opción 3, nunca a `main`; guard de branch; headless degrada a commit-sin-push). Patrón único en `GIT.md §3.5`.

### Changed

- **Permisos reclasificados a 3 tiers reales** (`settings.json`, tracked → se propaga a derivados) — se activa el tier `ask` (estaba vacío): instalar deps (`pnpm install`/`add`/`remove`) y editar `.env.local` pasan de DENY a **ASK** (gate, no bloqueo); `npx` / `pnpm dlx` salen de DENY (arregla `npx @timekast/factory` que el README recomienda — `deny` ganaba sobre cualquier allow) con allow específico del CLI; cleanup de artefactos efímeros (`project/*-artifacts/*`) a **ALLOW**; `vercel pull/link/env pull` a **DENY** (el vector real del incidente `.env.local`: el daño es el overwrite sin diff, no un Edit revisable). Reglas alineadas: CODING §7 (de "PROHIBIDO" a gate), CC §6.1, SK §7.1.

---

## [10.3.0] - 2026-06-08 — `factory update` gestiona `.gitattributes` + favicon/OG en presentaciones

> **Minor.** El CLI ahora sincroniza un bloque managed de `.gitattributes` en cada `factory update` (cierra la asimetría origen↔consumidor que corrompía los binarios del kit), y los templates de presentación ganan favicon + Open Graph. Ningún breaking change.

### Added

- **CLI `@timekast/factory`: sync del bloque managed de `.gitattributes`** — `factory update` (y el auto-register legacy + el resume) sincroniza un bloque delimitado de reglas del kit (`.claude/** text eol=lf` + overrides `binary` para fonts/imágenes) dentro del `.gitattributes` del derivado, preservando las reglas propias del dev. Antes el archivo quedaba fuera de `track` y nunca se actualizaba: un derivado nacido antes de las reglas `binary` corrompía los binarios de `fx-presentation-kit` (woff2/png/gif) al commitear (Git normalizaba CRLF→LF). El bloque se lee del tarball como single SSOT y el sync se centraliza en `maintainDerivedDotfiles` para cubrir las tres rutas de update por construcción; el perfil `core` ahora también empaca `.gitattributes`. Un test de invariante fija que el archivo viaja en ambos perfiles pero nunca entra al manifest (evita re-congelarlo). El bump del CLI lo hace Phase 7.5.5 de este release.
- **favicon + Open Graph en `tk-proposal` / `tk-mockup`** — los templates de presentación incluyen favicon y meta tags de Open Graph para mejorar el preview al compartir el link del entregable.

---

## [10.2.0] - 2026-06-08 — Sistema de presentación + publicación de propuestas

> **Minor.** Dos sistemas nuevos client-facing: mockups/propuestas en HTML (`tk-mockup` / `tk-proposal` sobre el catálogo `fx-presentation-kit`) y su publicación a `proposals.timekast.mx` vía el CLI. Ningún breaking change.

### Added

- **Catálogo `fx-presentation-kit`** — assets que dejan a HTML estático reproducir el sistema visual del kit sin importar sus componentes React: `theme.css` (3 temas, derivado de `globals.css`), `kit.css` (primitivas `pk-*`), `editorial.css` (registro editorial `pe-*`), Geist + Inter vendorizadas, maker layer en `brand/`, y manifest `lucide.json`.
- **Workflow `/mockup`** (`tk-mockup`) — renderiza el `/design` de un proyecto a un mockup HTML navegable, offline, client-facing (render por tier kit-pure / kit-extended / custom, iconos inline). Agents `mck-*`.
- **Workflow `/proposal`** (`tk-proposal`) — propuesta one-pager client-facing desde `/discovery` + `/design`, audience-tiered (negocio / ejecutivo / developer), con pantallas curadas del producto y el registro editorial `pe-*`.
- **Sistema de publicación** — comandos `factory publish` / `unpublish` en el CLI `@timekast/factory` (push del entregable estático a un hub en Vercel) + `/publish` + Phase 4 de los workflows que ofrece publicar al cerrar. Modelo de seguridad honesto: link no-adivinable + `noindex`, sin password. Doc: `proposal-publishing.md`.

### Changed

- **Modelo de shell B' para `tk-mockup`** — el renderer emite fragmentos de body por pantalla y el orchestrator los inlina en un solo shell en Phase 3 (elimina el doble-sidebar).

### Fixed

- **Findings del gate `fx-factory-reviewer`** (hito 7) sobre el catálogo + workflows antes de canonizar: `output_dir` de `mck-screen-renderer` realineado a la ruta transitional del run, Inter declarada en el catálogo, y doc-sync de la taxonomía de prefijos de agents (`CLAUDE.md` + `ARCHITECTURE.md` → `VALID_PREFIXES`).

---

## [10.1.0] - 2026-06-04 — Higiene del kit: CP3 push-safe, gate `split_discretion`, baja de `_shared`

> **Minor.** Mejoras de workflows (`/deploy`, `/backlog`) y limpieza del kit. Ningún breaking change.

### Added

- **`/backlog` — skip de CP-split-proposal por `split_discretion`** (tk-backlog v6.7.0). En `add <plan>` / `extend-epic`, cuando todas las unidades del plan salen de estructura visible, el gate de split ya no pide aprobar "N issues" dos veces — va directo a CP1. Solo aparece si hubo prosa agrupada por juicio. Headless: fail-open con caveat en el manifest.
- **CLI `@timekast/factory`: aliases `factory:doctor` / `factory:status`** + el CLI ahora excluye archivos gitignored de los reportes de `doctor` / `update` (sin ruido de `settings.local.json`, `transitions/`, `.DS_Store`; un orphan genuino sigue apareciendo). El bump del CLI `1.0.0 → 1.1.0` lo hace Phase 7.5.5 de este release.

### Fixed

- **CP3 de `/deploy` push-safe** (Refs: FACTORY-007) — el checkpoint ya no marca el rebase como "(recomendado)" incondicional. Phase 3.3 computa `SOURCE_PUSHED` vía `git ls-remote` (autoritativo, no el ref local) y solo advierte del force-push cuando la source ya está pusheada; en ese caso el merge (opción 1) es el default seguro. Cuando la source es local-only, el rebase se ofrece sin alarma espuria.

### Removed

- **Bucket `_shared/` de runtime-primitives** (Refs: PL-012) — sin consumidores activos (su propio README marcaba `versioning.md` como "pendiente de re-evaluación"). Se eliminó junto con todas sus referencias vivas: include de `core` en `profiles.json`, fixtures de los tests de distribución, fila de ontología en `CC.md`, nota de allowlist en `fx-distribution`, comentario del `skill-lint` loader, y una ref rota a `agents-vs-inline.md` en `fx-factory-reviewer` (reapuntada a `fx-workflow-authoring §8`).

---

## [10.0.0] - 2026-06-03 — Era unificada: distribución live + cerebro `full` por default

> **Major.** Compromete la **era unificada** — `factoryVersion` y `agentKitVersion` arrancan en `10.0.0` (el `9.5.x` fue el número intermedio para validar la distribución E2E; la campaña de smoke 2026-06-02 lo confirmó). El sistema de distribución del Factory queda **live** y el default de `add`/`update` se invierte de `core` a **`full`** para derivados del Factory.

### Added

- **Distribución del Factory live** — CLI público `@timekast/factory` (`new` / `add` / `update` / `status` / `doctor`), perfiles `full`/`core`, instalador aditivo con lockfile de propiedad (`.timekast/lockfile.json`), y modelo de versión dual (`factoryVersion` = sello de nacimiento de `src/`, estático; `agentKitVersion` = cerebro vivo, sube con cada `update`). Org-gated vía `gh`. (Refs: PUB-002)
- **`fx-distribution`** — skill factory-origin que documenta el lado BUILD/CLI (perfiles, release de tarballs, publish del CLI, modelo dual). Excluido de ambos perfiles — no shippea a derivados.
- **`factory doctor` — check de rules sin importar** — reporta rules always-on (`.claude/rules/*.md`) que el `CLAUDE.md` del repo no `@importa` (red de seguridad para un CLAUDE.md editado) y avisa loud si falta el `CLAUDE.md` en un repo gestionado.
- **Observabilidad de versión** — `add` / `new` / `update` reportan versión + perfil del cerebro instalado en cada corrida.

### Changed

- **Cerebro `full` por default en `add`/`update`** (antes `core`-only). Auto-detección por `factoryVersion` en el `package.json` del target: presente → `full` (derivado del Factory; los `sk-*` aplican); ausente / otro stack → `core`. `--full`/`--core` overridean. `update --full` hace cross-grade `core`→`full` (aditivo). `add`/`update` instalan **solo el manifest** (excluye `src/` por `track`), así que el cerebro full llega a un repo existente sin tocar boilerplate.
- **`CLAUDE.md` dev-owned** — nunca se sobrescribe en silencio: un CLAUDE.md limpio kit-owned propaga (el cross-grade lo lleva al full que importa `@.claude/rules/SK.md`); uno editado se conserva sin prompt; en `add`/legacy es write-if-absent.
- **Gate por repo-root** — `add` / `update` / `doctor` operan sobre la raíz del repo (no `cwd`): correr desde un subdir ya no planta un segundo cerebro anidado.
- **`.claude/docs/` un-staleado** para la era 10.0.0 — `distribution.md`, `getting-started.md` (CLI como vía recomendada), `ARCHITECTURE.md`, índice del bucket; `DISTRIBUTION_DESIGN.md` + `fx-distribution` alineados al nuevo default. Borrado `features.md` (duplicado stale de `sk-features-index`).

### Fixed

- **CLI hardening (review adversarial Codex)** — guard de paths del manifest (rechaza absolutos, `..` traversal y paths fuera de `.claude/`/`scripts/`/`CLAUDE.md`); guard de perfil (el manifest descargado debe coincidir con el pedido); recovery post-apply (`update` no borra el staged si queda update-state → `--resume` funciona); flag validation antes de los short-circuits `--verify`/`--resume`.
- **Test flaky de rate-limit** — pin de `Math.random` en el test single-UPSERT (mata el 1% de CI flake).

---

## [9.5.1] - 2026-06-02 — CLI distribution fixes (smoke campaign) + tk-deploy hardening

### Added

- **tk-deploy — `release --as-is` mode, Phase 4.3.1 auto-resolve, 7.5.6 dist verify** (`eead311`). El nuevo modo `release --as-is` taggea la versión ya fijada en `package.json` sin re-bumpear (saltos de versión por política: eras, rebranding). Phase 4.3.1 (Factory) pre-resuelve los conflictos `modify/delete` DENY-scoped (`project/*` salvo `reference/`, `.agent/*`) antes de CP4 — CP4 solo dispara para conflictos reales en paths que viajan a `main`. Phase 7.5.6 verifica la cadena `tag → dist-release.yml → tarballs + GitHub Release` post-push (best-effort observability, nunca un gate). (Refs: PUB-002)

### Fixed

- **CLI `new` — crea `./<name>/` + commit inicial, guards antes de la red** (`84812ad`). `new <name>` ahora crea y opera en el subdirectorio `./<name>/` (antes desempacaba en el cwd, H1), valida el destino + el guard de repo **antes** de cualquier llamada de red para no dejar un repo GitHub huérfano ante un name clash (B3), y sella un commit inicial no-fatal — si falta la identidad git, avisa en vez de abortar (H3/B2). (Refs: PUB-002)
- **CLI `update` — buckets idempotentes `unchanged` + `keptRetiredLocal`** (`84812ad`). El reporte ya no marca "238 actualizados" en un derivado fresh sin drift: los archivos idénticos en disco + lockfile + manifest van a `unchanged` (no se reescriben ni se cuentan, H6). Un archivo retirado por el Factory que el dev editó localmente va a `keptRetiredLocal` (se preserva + avisa, nunca se borra en silencio, H7). (Refs: PUB-002)
- **distribution — excluir el placeholder `e2e.yml` del perfil `full`** (`b65b444`). El perfil `full` ya no shippea `.github/workflows/e2e.yml` (placeholder disabled, `if: false`); solo viaja `e2e.yml.example` (se activa con `pnpm setup:e2e`). `ci.yml` sigue viajando. Limpia instalaciones fresh; los derivados existentes conservan el placeholder inerte. (Refs: PUB-002)

---

## [6.4.0] - 2026-05-31 — tk-backlog Refs 3-grouped header + numbering step=1

### Changed

- **tk-backlog v6.4.0 — `Refs (3-grouped)` header + numbering step=1.** Issue header pasa de 17 líneas blockquote a 10 (~40% menos verticalidad). Los 7 campos viejos de refs a discovery (`Features`/`Personas`/`Screens`/`Entities`/`Actions`/`AC Refs`/`Packet`) se consolidan en 3 líneas agrupadas por dominio (`Refs (discovery)`: FT · PER · AC; `Refs (design)`: SCR · ENT; `Refs (contract)`: actions · packet). Slot order fijo por línea; vacíos = `—`. Wrap-safety verificado con CRUD multi-SCR real (4 SCRs · 2 ENT · 4 actions · 3 AC) — cada línea cabe bajo 200 cols. `update-board.ts` sigue intacto (parsea solo los 5 críticos del blockquote). Phase 6 coverage gate reconfigurado para leer las nuevas líneas.
- **tk-backlog numbering — `epic-compound` step=1.** El default activo (`epic-compound`) pasa de step=10 (`010, 020, 030, …`) a **step=1** (`001, 002, 003, …`). Techo 999 issues por epic. `SETUP-001` / `SETUP-002` (renombrados desde `SETUP-010/020`). `extend-epic` siempre `max(NNN) + 1` linear, incluso sobre epics legacy step=10 (sin lógica de detección — `RBAC-010..RBAC-060` extiende con `RBAC-061`). Convención `global-gap-10` retirada del flow activo del kit (queda solo nota histórica corta en `numbering-and-topology.md §Legacy mode`). Factory backlog `project/backlog/v6.0/` intacto como histórico — no hay migration automática.

### Notes

- Integración de codex como adversarial second-opinion en Phase 7 + multi-round adversarial loop quedan deferred a plan posterior. `codex:codex-rescue` está fuera de su contrato (es fix/diagnosis-focused, no adversarial reviewer); diseñar correctamente la integración requiere agent purpose-built o reuso de `architect`/`code-archaeologist` con prompt adversarial — tracked en `tk-backlog/SKILL.md §25 Out of scope`.

---

## [6.3.0] - 2026-05-29 — Pipeline artifacts cleanup + plan-mode UX + tk-deploy CP1 fusion

### Added

- **Plan-mode `ui_touching` detection en tk-backlog Phase 3** (`fd766bc`) — en plan-mode (`/backlog add <plan>` / `extend-epic`) el flag se infiere de file paths del `## Files to modify` (UI components, `(protected)/`, `(public)/page.tsx`, skills con `ui*`). Pre-asigna `ui-critic` issue como tail cuando `ui_touching: yes`. Counter monotónico (`{DOMAIN}-{NNN}-ui-critic-2`, `-3`, …) para extend-epic con UI. (refs FACTORY-008)
- **QC report del epic integrado al body del epic file durable en tk-implement Phase 4** (`fd766bc`) — antes el QC report quedaba ad-hoc en `EPIC-NN-QC-REPORT.md` separado (MVPicks v2 issue). Ahora `quality-engineer` se invoca con tools read-only, lee logs desde `project/implement-artifacts/{run-id}/*.log` con `tail -50`, y el orchestrator appendea el output del turn al epic file. Phase 5 sanity-check con `grep -c '^## QC Report (Phase 4' ≥ 1`. Phase 0 detecta epic en estado parcial y reanuda. (refs FACTORY-008)

### Changed

- **Artifacts cleanup canónico estandarizado en los 4 workflows del pipeline** (`913fc4d`) — `/discovery`, `/design`, `/backlog`, `/implement` ahora todos limpian su `{run-id}/` al final con flag `--keep-artifacts` para opt-out. Guard `[ -n ${RUN_ID} ]` previene `rm` catastrófico por bug futuro; cleanup solo del subdir del run, nunca del padre. `.gitignore` agrega entries nuevas (discovery/design/implement artifacts). 4 slash commands actualizan `argument-hint` + `Args`. (refs FACTORY-007)
- **`/implement` EPIC-PLAN path migration** (`913fc4d`) — de `.claude/transitions/` a `project/implement-artifacts/{run-id}/epic-plan.md`. `EPIC-PLAN.template.md` introduce frontmatter YAML (`status: in_progress | closed`, `hash:`, `run_id:`). Phase 0 fallback al path legacy con `mkdir -p` antes del `mv`. Phase 5 update `status: closed` SOLO si `--keep-artifacts` activo.
- **Coupling `/handoff` ↔ `/implement` ↔ `/continue`** (`913fc4d`) — `/handoff` Paso 2.5 detecta epics activos via regex robusto a whitespace en `project/implement-artifacts/*/epic-plan.md`. `/continue` parsea el header del transition más reciente y surface plain language para resumir con `--start-at`.
- **tk-deploy Phase 1 — CP1 fusionado con hard-checks** (`8adaa45`) — §1.1 computes `WORKING_TREE_DIRTY` / `BRANCH` / `COMMITS_AHEAD` / `UNPUSHED` silently. §1.3 CP1 renderiza en 2 modos: `valid` (table + recent commits + 1/2 continuar/cancelar) o `blocking` (error + DETAIL_HINT + 1/2 cancelar/ver detalle). Un solo gate con full context en vez de error suelto + checkpoint ceremonial. Branch mismatch sigue como `AskUserQuestion` separado (decisión real, no error). (refs FACTORY-007)
- **tk-deploy Phase 3 — CP3 con subject filter** (`8adaa45`) — §3.1 regex excluye merge commits propios de tk-deploy (`grep -vE '^[0-9a-f]+ (release|ship)(\([^)]+\))?: '` con `--no-decorate` que blinda contra `log.decorate=full`). Filter contract documentado en `templates/commit-message-{release,ship}.template.md`. CP3 template factual: removida lista especulativa, surfaces solo filtered commits + 3 scenarios reales (hotfix / manual merge / force-push).
- **tk-deploy CHANGELOG locale via `locale:` del project-config frontmatter** (`8adaa45`) — `methodology/conventional-commits.md` agrega §Idioma del entry: headings en inglés (Keep a Changelog), bullets per `locale:` del YAML frontmatter (schema v2.0). Default es-MX cuando ausente o pre-v2.0; `locale: en-US` → inglés. Términos técnicos en inglés sin traducir (`commit`, `push`, `merge`, `deploy`, `schema`, `hook`, `tag`, `bump`, `lockfile`, `frontmatter`, `branch`); anglicismos verbalizados OK. NO voseo. Subjects `release:` / `ship:` reservados para tk-deploy Phase 5. `templates/changelog-entry.template.md` header alineado a la práctica real: `## [{VERSION}] - {DATE} — {TITLE}` (sin `v` prefix).
- **Rename `doc-visual-direction` → `kb-visual-direction`, remove `doc-*` tier** (`27094d5`) — el prefijo `doc-*` era huérfano con un solo skill. Después de estabilizar la fase del pipeline, la distinción documentation/coding que el prefix intentaba transmitir se sirve mejor por auto-routing por `description` (CC.md §1.1) que por un tier separado. `git mv` + frontmatter + body self-refs + 5 cross-refs en kb-\* skills + tk-design methodology + template `16_DESIGN.template.md`. Rules actualizadas (CORE.md §1, CC.md §7, CLAUDE.md naming conventions). ARCHITECTURE.md + extending-the-kit.md + fx-factory-reviewer + fx-workflow-authoring updated. `kb-visual-direction` sigue invoked by tk-design Phase 2 via Read inline.

### Fixed

- **`tk-implement` EPIC-PLAN frontmatter YAML resistente a prettier** (`aa1ad7a`) — el commit anterior (`913fc4d`) introdujo frontmatter con placeholders `{{INPUT_HASH_FIRST_12}}`. Prettier los formateaba como `{ { INPUT_HASH_FIRST_12 } }` (interpretando `{` como YAML inline object syntax), rompiendo el placeholder convention del template. Wrap en single quotes fuerza string type — prettier los deja intactos.
- **CC.md allowlist `Skill(<name>)` para workflows del kit** (`ef982f0`) — sin estas rules cada `/backlog`, `/design`, `/discovery`, `/implement`, `/deploy`, `/handoff`, `/continue`, `/pdf` triggereaba un permission prompt porque el CC harness gate skill invocation por default. Sintaxis verificada contra schema oficial (`Skill(name)` matchea shape de `Bash(cmd)`). 8 kit-shipped slash commands agregados explícitamente (no `Skill(*)` blanket) para que third-party plugin skills (codex, claude-code-setup) sigan promptiendo. ⚠️ Nuevos permission patterns requieren restart completo de CC, no solo reload window.

---

## [6.2.0] - 2026-05-29 — tk-design tier classification + tk-backlog plan-mode + PR0 hook fix

### Added

- **tk-design v6.2.0 SCR tier classification + per-N batching** (`cccc0af`) — Phase 4 classifier divides screens into `kit-pure` / `kit-extended` / `custom`. New `layout_impact: bool` field propagated upstream from `tk-discovery`. Per-N batching (cap 4 configurable) replaces 1-specer-per-screen. Two new agents (`dsg-screen-specer-light` / `dsg-screen-specer-full`) replace `dsg-screen-specer`. Phase renumber (old Phase 4 → 5, etc), new CP3 = classification approval. Downstream consumers (`bkl-context-analyst`, `bkl-issue-specer`, `imp-issue-executor`) updated with "Handling SCR tier" sections — back-compat verified for tier-absent SCRs.
- **CC.md §3 — kit-wide Plain Language rule** (`cccc0af`) — kit-wide regla de tono al user-facing: audience baseline plain-language es-MX, vocab inline en primer uso, tablas numeradas 1/2/3, anti-patterns (raw agent dumps, IDs crudos, jerga sin contexto). Renumber §3-§7 → §4-§8 across all CC.md refs.
- **tk-backlog v6.3.0 — 5-mode dispatch + plan-mode entry points** (`96d2e72`) — `/backlog` ahora acepta `[nuevo|extend|add <plan>|extend-epic EPIC-NN <plan>|validar]`. Plan-mode (`add` / `extend-epic`) consume un Plan Mode plan file con 4 secciones canonical (`## Context`, `## Approach`, `## Files to modify`, `## Verification`) y emite los mismos 11-section issues + epic Topology SSOT que el modo greenfield. Closes **FACTORY-006** (MVPicks-style projects con layout `M{X}/` + compound IDs unblocked).
- **Phase 0.1 — convention detection** (`96d2e72`) — `tk-backlog` detecta `layout_pattern` (`v{X}` / `M{X}` / `sprint-{N}` / `milestone-{N}`) y `id_convention` (`global-gap-10` legacy / `epic-compound` NEW default) por project, con `project-config.md` override path. Sampling-based con threshold 80%.
- **Phase 0.5 — plan parser** (`96d2e72`) — orchestrator-direct (NOT in `bkl-context-analyst`; closed contract preserved per `fx-workflow-authoring §8`). Consumes plan file, emits `parsed-plan.md` con file groups + Verification bullets + plan-hash for drift detection.
- **CP-split-proposal checkpoint** (`96d2e72`) — plan-mode only, surfaces between Phase 0.5 and Phase 1 con el split propuesto (N file groups + K integration issues). Auto-skipea cuando `len(groups) == 1`.
- **Compound IDs como kit default (`epic-compound`)** (`96d2e72`) — filename `EPIC-NN-{DOMAIN}-{NNN}-{slug}.md`, `Issue ID:` blockquote sigue siendo shortform `{DOMAIN}-{NNN}`. Tree-orders el folder `issues/` por epic. Back-compat con `global-gap-10` (shortform) preservada via auto-detection.
- **`EPIC-PLAN-SOURCE.template.md`** (`96d2e72`) — plan-source epic template con `Source tier: plan-mode` + `Plan source` + `Plan hash` blockquote lines. NO new ISSUE template — plan-mode usa el canonical `ISSUE.template.md` (11 sections full) para prevenir la regresión EPIC-40 MVPicks (4 sections lost en hand-crafted emission).
- **`source_kind: plan` handling en `bkl-issue-specer`** (`96d2e72`) — per-section derivation table (Gherkin from `## Verification`, Edge Cases from `## Approach`, SK Leverage inferred from file paths). 3 secciones (Gherkin / Edge / SK Leverage) MANDATORY incluso si el plan no las provee explícitamente.
- **Plain language §2 expansion en tk-implement + insertion en tk-backlog** (`96d2e72`) — mirror de la §2 canonical de tk-design v6.2.0 + extension a vocab specific de cada workflow. NEW Phase 3 alto liviano per-grupo template + executor failure narration template (retry cap exhausted + diff-ownership scope-creep) en tk-implement.
- **Vitest tests para `validate-commit.sh` hook** (`964ab6c`) — 11 fixtures cubren bypass paths (non-commit, no `Closes:`, `Refs:`) + typo ID (warn, no block) + EPIC-NN skip (compound + lone) + dual-match block + happy paths shortform/compound + missing Evidence + unchecked ✅. Integrated en `pnpm test` via `scripts/tools/__tests__/validate-commit-hook.test.ts`.

### Changed

- **`bkl-context-analyst`** (`96d2e72`) — adds `extension_mode` input field + `project_conventions` field + `existing_backlog_root` (for `extend` / `extend-epic`). Closed contract preserved. New `## Project conventions` section at top of registry; `## Caveats` emits `extension_mode=operational — no FT/SCR/persona refs available` when applicable.
- **`bkl-issue-specer`** (`96d2e72`) — adds `source_kind: "discovery" | "plan"` to manifest entry + `layout` + `id_convention` fields. Filename shape derives from `id_convention`.
- **Phase 6 coverage gate** (`96d2e72`) — branches by `extension_mode`. Greenfield: FT/SCR/persona/CMP/FLW/RBAC checks. Operational: file-group coverage + diff-ownership + Verification-bullet coverage.
- **Phase 7 validators** (`96d2e72`) — reciben `extension_mode` flag en su prompt. `product-owner` skipea coverage matrix en operational mode. `quality-engineer` UI detection lee file paths en operational mode (no SCR keywords).
- **tk-backlog SKILL.md §3.1** (`96d2e72`) — replaces obsolete "compound IDs break the hook" warning con la realidad post-PR0 (el hook skipea `EPIC-NN` tokens y matchea `{DOMAIN}-{NNN}` via token-boundary `grep` en both shortform y compound filenames).
- **tk-discovery `Layout impact: bool` field** (`cccc0af`) — propagado upstream a `03_DEEP_DIVE.template.md` y `dsc-feature-specer.md` (7-fields → 8-fields). Consumed downstream by tk-design Phase 4 SCR classifier.

### Fixed

- **`validate-commit.sh` — 3 grietas closed (PR0 hard gate de v6.3.0)** (`964ab6c`):
  - **Typo ID silent bypass:** cuando el token de `Closes:` no matcheaba ningún backlog file, el hook hacía `continue` callado — un `Closes: AUTH-9999` typed pasaba undetected. Ahora emite warning loud a stderr pero permite el commit (external refs a Jira / otro repo siguen válidos).
  - **EPIC-NN false-positive block:** en compound IDs (`Closes: EPIC-01-AUTH-030`) el extractor emitía `EPIC-01` y `AUTH-030`. El token `EPIC-01` triggered `grep -l` contra el epic file (que menciona `EPIC-01` en su header) y luego fallaba el ✅ adjacency check (epics nunca se auto-marcan ✅), bloqueando el commit determinísticamente. Ahora tokens matching `^EPIC-[0-9]+$` se skipean — solo los DOMAIN-NNN issue tokens se validan.
  - **head -1 ambiguous match:** `find -path "*/issues/${ID}*.md" | head -1` silently picked an arbitrary match cuando 2+ files matcheaban (compound projects con `EPIC-NN-` prefix routinely had this). Reemplazado con token-boundary `grep -E "(/|-)${ID}(-|\.md$)"` sobre `*/issues/*.md`, que matchea both shortform y compound sin false collisions. Match count ≥2 ahora bloquea con explicit disambiguation message.

### Notes

- **tk-design v6.2.0 vs factoryVersion 6.2.0** — coincidencia nominal: tk-design tiene su propio CHANGELOG interno (`.claude/skills/tk-design/CHANGELOG.md`) y bumpeó a v6.2.0 en `cccc0af`. tk-backlog bumpeó internamente a v6.3.0 en `96d2e72`. El `factoryVersion` (del kit completo) salta de 6.1.1 → 6.2.0 con este release.
- **BREAKING (kit-internal) — `/backlog add` semantics changed:** era "delta desde discovery/design" (ahora renombrado a `/backlog extend`); ahora es "consumir un Plan Mode plan". El kit auto-detecta convention y mode dispatch, así que proyectos derivados que invocaban `/backlog add` reciben Phase 0 prompt para clarificar intent. CI scripts que dependían del nombre exacto necesitan actualizar.

---

## [6.1.1] - 2026-05-27 — tk-deploy hardening + kit-extension onboarding

### Added

- **`extending-the-kit.md` onboarding** (`.claude/docs/`) — guía para developers de proyectos derivados: cómo agregar skills propios (`pj-*`) y revisar hooks custom sin chocar con el kit. Enlazada desde `CLAUDE.md`, `.claude/docs/README.md` y `getting-started.md`.

### Changed

- **Prefijo project-specific consolidado `op-`/`pj-` → `pj-`** — `op-` (sin distinción documentada ni uso) se retira; `pj-` es el único prefijo de skills propios del derivado. `skill:lint` ahora **ignora** los `pj-*` (loader + cross-refs regex) para que los skills propios de un proyecto nunca bloqueen un commit.

### Fixed

- **`tk-deploy` selective merge** — excluye `.agent/` del merge a `main` y usa un loop shell-agnostic en Phase 4.6.

---

## [6.1.0] - 2026-05-27 — Pipeline build-out: discovery Fase-1 + design v1 + backlog v1 + implement v2

### Changed

- **`/implement` workflow v2 — epic-first serial (FACTORY-010)** — Reescritura del coding-workflow `tk-implement`: de **issue-por-issue** (ceremonia alta: CP1+CP2 por issue, risk-tier por issue, spawn-by-domain obsoleto) a **epic-first serial**. Se planea el epic **una vez** (CP-A Plan Mode, plain language, 1 pantalla), se aprueba una vez, y se ejecutan sus issues **en serie** (un `imp-issue-executor` aislado a la vez, mismo repo — sin paralelismo ni worktrees), cada uno con **commit atómico**, integrando backend+frontend+APIs+tests+UI, con review final (CP-B). Subsume **PL-013**.

  **Decisiones clave:**
  - **Monolito** (sin phase-files ni `methodology/`) — `fx-workflow-authoring §6+§11` (workflow procedural, no schema-heavy). Se retiraron los 7 `phase-*.md`.
  - **El plan es el risk gate** — CP-A autoriza el epic entero; no se re-gatea por issue. Cambios sensibles (DB/login) en lenguaje claro en CP-A; seguridad real vía kit (`db:generate`+`db:migrate`, nunca `db:push`).
  - **agents-as-skills** — dominio (api/db/ui/testing) se consulta como skill, NO se spawnea specialist. Único subproceso propio: `imp-issue-executor` (justificado por **aislamiento de contexto**, no paralelismo). **`CC.md §2` editado** para codificar la doctrina (dominio sin agent → skills; spawn keeps cuando aplica) — cierra el conflicto con la always-on rule.
  - **B1 (cierre por-issue antes del commit)** — `update-board` lee el `Status` del issue file, `validate-commit.sh` exige `✅` en el epic file + Evidence. Orden centralizado en el orquestador: Evidence → issue `✅ Done`+`Completed:` → epic row `✅` → commit `Closes:`. El executor solo retorna proposed Evidence (no toca backlog docs, no commitea).
  - **Modo adaptativo por tamaño** — epic chico de-corrido; grande por grupos (= chains + singletons del `## Topology` del epic) con alto liviano. Umbral declarado (>10 issues O >50 SP).
  - **DoD completo** — `pnpm verify` por issue; `pnpm build` + `pnpm test:e2e` al cierre del epic (Phase 4) / single-issue final verification.
  - **Resume** (`--start-at`/`--only`) con check de deps intra-epic; `EPIC-PLAN` persistido (gitignored) + hash de inputs → salta CP-A solo si nada cambió upstream.

  **Touchpoints:** `CC.md §2` (agents-as-skills), `validate-commit.sh` + `09_GLOSSARY.md` (refs `phase-6-close.md`/`phase-2-load-issue.md` → nuevo SKILL), `PIPELINE_CURRENT_TRUTH §4`, 1 subagent nuevo `imp-issue-executor`.

### Added

- **`/backlog` workflow v1 (FACTORY-009)** — Documentation-family workflow `tk-backlog` ships v1. Convierte el output de `/discovery` (00-15) + `/design` (16_DESIGN + SCR/CMP/FLW) en un **backlog ejecutable**: issues + epics self-contained con refs cruzadas (FT × ENT × AC × PER × SCR × actions × RBAC × tests), orden topológico, marcas parallel/sequential, skills allowlist per-issue, y planes de test DoR/DoD. Consumer directo: `/implement` (IA — Claude Code / Codex). Cierra **FX-002**; el DoR test-gate cierra **FX-003**.

  **Architecture:**
  - 8 phases + 2 CPs: Phase 0 (mode + hard gate) → Phase 1 (registry via `bkl-context-analyst`) → Phase 2 (setup epic, nuevo) → Phase 3 (epic composition orchestrator-direct + issue manifest) → **CP1** (preview desde manifest) → Phase 4 (`bkl-issue-specer` parallel cap 6) → Phase 5 (dependency closure) → Phase 6 (coverage gate por referencia) → Phase 7 (4 validators paralelos) → Phase 7.5 (Blocker Resolution, 1 ciclo) → Phase 7.6 (Pre-CP2 Sweep) → **CP2** Plan Mode → Phase 8 (emit + handoff).
  - 3 modes: `nuevo` (full + `EPIC-00-bootstrap`) / `add` (iterativo, continúa la secuencia global de IDs) / `validar` (drift detection read-only vía registry diff + source hashes).
  - 4 Phase-7 validators (generic, scopes non-overlapping): `product-owner` + `architect` + `project-planner` + `quality-engineer`. `ui-critic` NO en Phase 7 — corre en epic-close (`/implement` time sobre UI renderizada) vía issue `ui-critic` pre-asignado en Phase 3.
  - 2 subagents `bkl-*`: `bkl-context-analyst` (Phase 1 serial, `inherit`) + `bkl-issue-specer` (Phase 4 parallel cap 6, `sonnet`). Epic composition + dependency closure + coverage gate son orchestrator-direct.

  **Tooling-compat (decisiones de diseño):** IDs `{DOMAIN}-{NNN}` con secuencia **global topológica** (gap-10) única en `project/backlog/**` — single-token `[A-Za-z]+-[0-9]+` + filename=ID-prefix → compatible con `validate-commit.sh` (`Closes:`) y `update-board.ts` sin tocarlos. Metadata en **blockquote** (no YAML) → update-board la parsea; refs ricas como líneas extra. Epics `EPIC-NN-{slug}` (número al frente). `EXECUTION-ORDER.md` es el SSOT de orden (BOARD.md es alfabético).

  **Guardrails:** `SK.md §7.1` queda absoluta — `SETUP-020-cloud-bootstrap` es runbook manual (Neon/`vercel link`/`setup-e2e.ts`) + cola automatizable (migrate + verify); sin override. CP2 Reject hace rollback manifest-preciso (borra solo los paths creados en el run, seguro en `add`). DoR test-gate `[y/n/justify]` con campo `DoR Waivers:` + log machine-readable.

  **Skills agnósticos** — cero mención de clientes / proyectos específicos en SKILL.md / methodology / templates / agents.

- **`/design` workflow v1 + slot 15/16 renumeration (FACTORY-008)** — Documentation-family workflow `tk-design` ships v1. Converts discovery output (00-14 + `15_IMPLEMENTATION_PACKETS`) into an executable UI contract at slot 16 — multi-file: `16_DESIGN.md` (index + visual direction + IA + cross-cutting) + `16_DESIGN/SCR-XXX.md` per pantalla + `16_DESIGN/components/CMP-XXX.md` (extensions) + `16_DESIGN/flows/FLW-XXX.md` (multi-screen). Consumer: AI agent en `/backlog` y `/implement` — eleva calidad de issues y cohesión visual sobre el flow legacy.

  **Architecture:**
  - 8 phases + 3 CPs: Phase 0 (mode + hard gate) → Phase 1 (registry build via `dsg-context-analyst`) → Phase 2 (visual direction via `doc-visual-direction` Read on-demand) → **CP1** → Phase 3 (IA + sticky SCR IDs + slug stability) → **CP2** → Phase 3.5 (cross-cutting vocab pre-batch) → Phase 4 (`dsg-screen-specer` parallel batched `ceil(N/6)`) → Phase 5 (`dsg-component-specer` parallel) → Phase 6 (reinforce) → Phase 7 (5 validators paralelos) → Phase 7.5 (Blocker Resolution Round, 1 ciclo) → Phase 7.6 (Pre-CP3 Canonical State Sweep) → **CP3** Plan Mode → Phase 8 (emit + handoff).
  - 3 modes: `nuevo` (full run) / `con-direccion` (consume `00 §11.2` schema; skip Phase 2 + CP1) / `validar` (read-only over `project/planning/16_DESIGN*`).
  - Mobile-first invariant — cada `SCR-XXX.md` exige ASCII 375px (orchestrator post-Phase-4 lint con re-spawn max 2 + fallback STOP a usuario).

  **Phase 7 validators (5 paralelos, scopes non-overlapping):** `ui-critic` (visual + IA + DS compliance + scorecard 8-dim), `product-owner` (FT/persona coverage + readiness chain), `skeptical-client` (copy clarity es-MX + credibility), `architect` (strict boundary — solo `04_ARCHITECTURE` + `sk-project-structure` URL convention), `project-planner` (timing + dependency cycles + Wave assignment).

  **CMP-Detection criterion C** (thin sk-ui extensions): levanta factory ticket al kit en vez de fork local. Evita fragmentación entre proyectos derivados.

  **CP3 cycle state machine** (max 3 rounds): 1 auto Phase 7.5 + 1 user-Edit + 1 Manual Round 2 antes de forzar Accept (con defer + `DECISION-DESIGN-XXX` prefix) o Reject final.

  **Skills agnósticos** — cero mención de clientes / proyectos específicos en SKILL.md / methodology / templates / agents.

- **Push subscription drift detection — 3-state UX (FACTORY-007)** — `PushDevicesList` ahora modela 3 estados en lugar de los 2 anteriores (current vs other), exponiendo drift entre lo que el browser tiene suscrito localmente y lo que la DB tiene registrado.

  **Estados detectados:**
  1. **Happy path** — browser tiene push subscription AND coincide con una row en `push_subscriptions` → badge `"Este dispositivo"` en la row correcta, sin CTAs.
  2. **Orphan en DB** — browser tiene subscription pero ninguna row coincide (ej: `subscribePush()` falló mid-flow, dev experimentó con la API directamente) → nuevo card amber `"⚠️ Suscripción sin vincular"` con CTA `[Vincular]` que llama el mismo flow `subscribePush()` para crear la row faltante.
  3. **Zombie en DB** — DB tiene row pero el browser no tiene esa subscription localmente activa (común post-SW reinstall en dev mode + Turbopack HMR; raro en prod, solo aparece si VAPID rota o user clears site data) → row gets badge `"⚠️ Inactivo"` + helper text `"Esta suscripción ya no responde. Puedes eliminarla."`.

  **Heurística conservadora per-row:** un row solo se marca `Inactivo` cuando su `(browser, os)` class matchea la del navegador actual. Rows de otros browsers/OSes no se clasifican localmente — pueden estar vivos en los otros dispositivos físicos del user.

  **Detección:** `parseUserAgent(device.userAgent)` cruza contra `parseUserAgent(navigator.userAgent)`; si matchea AND el endpoint del row no es el current → stale candidate.

  **Por qué importa en prod:** push subscriptions sobreviven SW code updates (binding es a scope/registration, no al hash del archivo SW — Push API spec lo garantiza). FACTORY-003 hybrid managed update NO rompe subs. Lo que sí rompe push delivery:
  - Rotación de `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (security incident only)
  - Cambio del SW URL en `layout.tsx` (e.g., migration tipo `f1d48c2` `/sw.js`→`/serwist/sw.js`)
  - User clears site data en Chrome
  - FCM recycle del endpoint por 2-8 semanas sin pushes

  En esos casos raros, el kit ahora expone visualmente el drift al user con CTAs claros para recuperar — antes los rows zombies pasaban invisibles y el user no entendía por qué no llegaban pushes.

  **Files:**
  - `src/components/notifications/PushDevicesList.tsx` — 3-state detection inline + nuevos badges + card "Vincular".
  - `tests/unit/notifications/push-devices-list.test.tsx` (NEW) — 5 specs cubriendo cada escenario (A happy / B orphan / C zombie / D foreign-browser / mixed).

  Copy en es-MX neutro — sin españolismos ni argentinismos (per BR-FACTORY-003 + global preference).

- **Modern email unsubscribe surface (FACTORY-004 + FACTORY-005)** — Drift-absorption desde mvpicks-v2 (commit `585bfab`) + extensión RFC 8058. Dos capas complementarias para que todo email dispatched via `notify()` tenga path de opt-out claro:

  **FACTORY-004 — Body footer link.** Helpers `notificationPrefsFooter(branding?, prefsPath?)` (HTML) + `notificationPrefsFooterText(prefsPath?)` (plain-text) en `src/lib/email/templates/layout.ts`. Aplicados a `src/lib/email/templates/notification.ts` (único template dispatched via `notify()` — los 8 transaccionales: `magic-link`, `password-*`, `verify-email`, `login-alert`, `invite-user`, `invite-accepted` están correctly excluded porque el usuario no puede opt-out de esos flujos). `service.ts` dispatcher ahora pasa `text` además de `html` para que el footer plain-text llegue al recipient (multipart/alternative). Helper acepta `prefsPath` override — un derived project que mueve la página de preferences no forkea el helper.

  **FACTORY-005 — RFC 8058 List-Unsubscribe headers.** `notify()` inyecta automáticamente `List-Unsubscribe: <https://app/api/unsubscribe?token=JWT>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` cuando dispatcha al canal `email`. Gmail desde feb-2024 lo requiere para senders >5K emails/día (Sender Authentication Requirements). Apple Mail también lo respeta — ambos muestran botón nativo "Unsubscribe" en el inbox. Surface shipped:
  - `src/lib/notifications/unsubscribe-token.ts` — JWT sign/verify con `jose` (audience-bound `'unsubscribe'`, TTL 90d, secret resuelto per-call via `getNextAuthSecret()` — no module-level fragility). Audience binding previene token confusion con NextAuth session tokens que comparten `AUTH_SECRET`.
  - `src/app/api/unsubscribe/route.ts` — POST handler verifica token + UPSERT `notification_preferences` con `insert().onConflictDoUpdate()` sobre unique `(userId, channel, category)`. UPSERT crítico porque preferences son **lazy** — UPDATE puro es no-op si el user nunca tocó esa preferencia (fallback a `defaultChannels`). Idempotent. Rechaza `channel != 'email'` con 400. GET handler responde 405 + HTML body con link a `/profile?tab=notifications` (algunos clientes hacen GET preview).
  - `EmailPayload.headers?` field nuevo en `src/lib/email/types.ts` + merge pattern en `resend.ts` + `smtp.ts` — caller-provided headers extienden los defaults (`Auto-Submitted`, `X-Auto-Response-Suppress`), no los reemplazan.

  **Documentación skills (6 lugares):** `sk-notifications §6.2` (footer policy + cómo engancharse al helper) + `§6.2.1` (List-Unsubscribe header pair + UPSERT rationale + Gmail UI caveat); `sk-email §1.1` (Envelope headers — `headers?` field + merge semantics); `sk-features-index` (nueva row "List-Unsubscribe one-click (RFC 8058)"); `kb-notifications §5.1` (footer pattern portable) + `§5.2` (List-Unsubscribe RFC 8058 deep, mailto vs HTTPS one-click); `kb-security §6.1` (token-based unsubscribe pattern — audience binding, TTL trade-offs, UPSERT vs nonce table).

  **Tests:** 23 new specs across 3 files (`notification-email-template.test.ts`, `unsubscribe-token.test.ts`, `unsubscribe-route.test.ts`). UPSERT path con row inexistente cubierto explícitamente. Token + route tests usan node environment (`// @vitest-environment node`) porque `jose` y jsdom polyfilled `Uint8Array` no son compatibles.

  **Deps:** `jose ^6.2.3` agregado como direct dependency en `package.json` (vivía transitive via Auth.js pero pnpm strict-mode bloquea importar transitive deps). No env var nueva — reusa `AUTH_SECRET`/`NEXTAUTH_SECRET` via `getNextAuthSecret()`.

  **Acceptance criteria (NOT Gmail UI):** raw envelope headers present + POST endpoint responde 200 + `notification_preferences` row toggled. Gmail native button es smoke informativo — Google reserva right por reputación/volumen/SPF/DKIM/DMARC.

  No breaking. Proyectos derivados absorben el surface al actualizar al kit.

### Changed

- **Slot 15/16 renumeration (FACTORY-008)** — `15_IMPLEMENTATION_PACKETS/FT-XX.md` (was `16_*`) becomes último output de `/discovery` (cronología limpia: discovery cierra slot 15, `/design` arranca slot 16). Deprecations:
  - `15_SK_MIGRATION.md` (referenced en `00_DISCOVERY_BRIEF.template.md §11.2`) → inlined into `16_DESIGN.md §1 Design System Anchors`. Discovery template ref marked deprecated.
  - `15_DESIGN_INPUT_CONTRACT` (reserved deferred slot per `PIPELINE_CURRENT_TRUTH.md §5`) → subsumed into `00_DISCOVERY_BRIEF.md §11` (existing) + `16_DESIGN.md` directly. Slot reservation removed.
  - Migration scope: 10 files touched (`tk-discovery` SKILL + 3 templates, `tk-implement` phase-2-load-issue, `doc-visual-direction` SKILL, `PIPELINE_CURRENT_TRUTH.md`, `project-config.md` × 2). Blast radius limitado al Factory; ningún proyecto derivado tiene `16_IMPLEMENTATION_PACKETS/` materializado todavía — momento limpio para rename.

### Fixed

- **Radix scroll-lock viewport shift on Windows/Linux (FACTORY-006)** — Drift-absorption desde mvpicks-v2 (commit `2f0e7d7`). `react-remove-scroll-bar` (dep transitiva de Radix scroll-lock primitives: `Dialog` / `AlertDialog` / `Sheet` / `DropdownMenu` modal-default, `Popover` con `modal=true`, `Select` via `RemoveScroll`) monta un runtime `<style>` con `body[data-scroll-locked] { margin-right: <gap>px !important }` para compensar el scrollbar que asume `overflow: hidden` removió. Con `scrollbar-gutter: stable` reservando el gutter a nivel `html`, la compensación se vuelve double-offset → ~15px de viewport shift en Windows/Linux cada vez que se abre una de esas primitivas. macOS lo escondía con overlay scrollbars (`gap = 0`). El kit ahora ship el override `html body[data-scroll-locked] { margin-right: 0 !important; --removed-body-scroll-bar-size: 0px !important }` en `globals.css` — specificity del prefijo `html` gana contra el `<style>` runtime del library regardless of cascade order. No breaking, defensivo (no-op en macOS). Proyectos derivados absorben el fix al actualizar al kit. Documentado en `kb-ui §2.6` + nota cross-platform en `sk-ui §4`.

---

## [6.0.1] - 2026-05-20 — PWA hybrid managed update (FACTORY-003)

> Drift-absorption desde mvpicks-v2 (commits `016e742` → `d8dce3e`, validado en producción). El kit ahora ship un auto-reload silencioso safe-by-guards en lugar del prompt strict-only. No breaking — proyectos derivados se benefician automáticamente al actualizar al kit.

### Added

- **PWA hybrid managed update** — `PwaUpdateToast` ahora auto-recarga silenciosamente cuando los 4 guards de `evaluateAutoUpdateSafety()` demuestran que es seguro: cold navigation (`performance.navigation.type === 'navigate'`), página recién mounted (<5s), única tab del origin (mensaje `COUNT_CLIENTS` al SW vía `MessageChannel` con timeout 1.5s), sin interacción del usuario (listeners capture-phase en `pointerdown`/`click`/`touchstart`/`keydown`/`beforeinput`/`input`/`paste`/`compositionstart`). Cualquier guard que falle, excepción, o loop guard activo → cae al toast "Recargar" como antes.
- **SW handler `COUNT_CLIENTS`** (`src/app/sw.ts`) — responde con `{ count }` el número de window clients del scope (`includeUncontrolled: true`, `event.waitUntil`); `count: -1` en catch para que el cliente lo interprete como `Infinity` y caiga al toast.
- **`src/lib/pwa/evaluateAutoUpdateSafety.ts`** — helper puro con dependency injection (`getNavType`, `now`, `mountedAt`, `userInteracted`, `countClients`) testeable sin SW real ni `performance` API.
- **`tests/unit/pwa/evaluateAutoUpdateSafety.test.ts`** — 12 specs cubriendo happy path + cada guard + edge cases (`getNavType` throws, `countClients` rejects, boundaries 4999/5000ms).

### Changed

- **`PwaUpdateToast` refactor** — separación `handleWaitingUpdate` / `setupAndCheck`, `WeakSet<ServiceWorker>` para evitar duplicar `statechange` sobre el mismo SW installing, `controllerchange` enganchado antes del `postMessage SKIP_WAITING` (race-safe), loop guard `sessionStorage['pwa-auto-reload-in-flight']` con TTL 5 min.
- **`sk-pwa`** — §3 reformulado al flow híbrido + nueva §3.2 "Auto-reload safety guards" con tabla de los 4 guards + handler `COUNT_CLIENTS` documentado + §10 manual smoke checklist post-deploy (6 escenarios) + §11 anti-pattern matizado ("sin guards verificables" en lugar de "without user consent").
- **`kb-pwa`** — §2 expandido de 2 opciones a decision tree de 3 (silent / hybrid managed / strict prompt), hybrid pattern detallado paso a paso, bootstrap note. §7 anti-pattern actualizado.

### Notes

- **Bootstrap deploy** — el primer deploy que ship el componente nuevo ejercita todavía el flow viejo (los clientes corren la versión previa sin guards). El silent path se activa a partir del segundo deploy. Inherente al SW upgrade cycle.
- **QA** — validación 100% manual sobre deploy real (Playwright + SW es notoriamente flaky). La lógica pura de los guards sí tiene cobertura unit. El componente completo no se testea con RTL más allá de los smokes de update aggressiveness ya existentes.

---

## [6.0.0] - 2026-05-15 — Pair-split docs + Drift-absorption + Auth/Security/Discovery hardening

> Major release. Carga acumulada desde 5.6.0 (~6 semanas): migración kit-meta a pares `kb-*`/`sk-*` (EPIC-KIT-HYGIENE Track 2), primera ola del EPIC-DRIFT-ABSORPTION (mobile dialogs + E2E template), self-registration + postgres rate-limit en runtime, refactor mayor de `/discovery`.

### ⚠️ BREAKING CHANGES — Migration required for projects derived from <6.0.0

> Apps generadas antes de v6.0.0 **NO** pueden copiar `.claude/`, `.husky/` o `package.json` tal cual desde main. Hay que reconciliar manualmente — esta versión asume el path migration `docs/` → `project/` y la reestructuración de skills bajo prefijos `kb-*`/`sk-*`/`doc-*`/`tk-*`.

**Path migration `docs/` → `project/`:**

- Backlog, planning, reference, factory, migration ahora viven bajo `project/`. Husky hooks, skills y rules asumen el nuevo path.
- Acción requerida: renombrar `docs/{backlog,planning,reference,factory,migration}/` → `project/{...}/`. Ajustar referencias en commands y rules custom.

**Husky pre-commit (`.husky/pre-commit`):**

- Agregado `set -e` — el hook ahora aborta si `lint-staged` falla (antes seguía silenciosamente).
- Nuevos pasos: `pnpm generate:hooks` + `pnpm skill:lint`.
- Paths actualizados al esquema `project/`.

**`package.json` scripts:**

- Agregado `prebuild: pnpm generate:email-logo` — requiere `scripts/tools/generate-email-logo.ts`.
- `env:check` ahora ejecuta `tsx scripts/tools/env-check.ts` (antes inline node).
- Nuevos scripts requeridos en `scripts/tools/`: `env-check.ts`, `generate-email-logo.ts`, `generate-hooks.mjs`, `skill-lint/`, `board-status.ts`.
- Dev port default: 3000 → 3002 (config en `scripts/tools/dev.mjs`).

**Dependencies nuevas / bumpeadas:**

- Nuevas requeridas: `@tanstack/react-table ^8.21.3`, `recharts ^3.8.1`, `@testing-library/jest-dom ^6.9.1`, `@testing-library/react ^16.3.2`, `@testing-library/user-event ^14.6.1`.
- Bumped: `next 16.1.6 → 16.2.4`, `drizzle-orm 0.45.1 → 0.45.2`.
- Nuevo override: `picomatch ^4.0.4`.

**`.claude/` estructura:**

- Skills/rules/agents reestructurados. Prefijos `kb-*` (portable knowledge) / `sk-*` (kit shipped) / `doc-*` (documentation phase) / `tk-*` (workflows) / `fx-*` (factory-internal) ahora aplican.
- Copiar tal cual `.claude/` a un proyecto en 5.5.x o anterior va a chocar con rules existentes.

**Migration path sugerido:**

1. Fork temporal del estado actual del proyecto (rama `pre-v6-upgrade`).
2. Copiar `scripts/tools/` completo desde el kit v6.0.
3. Renombrar `docs/{backlog,planning,reference,factory,migration}` → `project/{...}`.
4. Copiar `.husky/` y reconciliar `package.json` scripts manualmente.
5. Reemplazar `.claude/` capa por capa: `rules/` → `skills/sk-*` → `skills/kb-*` → `agents/` → `commands/` → `hooks/`.
6. Correr `pnpm install && pnpm lint && pnpm typecheck && pnpm test` y debuggear iterativamente.

### 🧹 EPIC-KIT-HYGIENE — Track 2: Pair-split distills (5 issues, 2026-04-21..23)

- **KIT-011:** `component-catalog.md` + `layout-patterns.md` → `kb-ui` (portable patterns: Server/Client split, Suspense+Skeleton, a11y, cascading filter rule) + `sk-ui` (kit primitives: `DataTable`, `FormField`, `StatusToggle`, `BreadcrumbSetter`, `useTableState`, form kit at `@/components/form`, human-ID rule).
- **KIT-012:** `crud-scaffold.md` → 5-way split: `kb-ui` + `kb-api` + `sk-ui` + `sk-api` + new `sk-crud-scaffold` (orchestrator: URL convention, page shells, breadcrumbs, cascading filters).
- **KIT-013:** `features.md` → pair-aware domain split: RBAC → `kb-security`/`sk-security`; schema → `kb-db`/`sk-db`; server actions catalog → `kb-api`/`sk-api`; kit feature catalog → new `sk-features-index`.
- **KIT-014:** 3 new pairs: `kb-notifications`/`sk-notifications` (notify() API, SSE stream, VAPID push, `useNotifications`), `kb-navigation`/`sk-navigation` (12-field `NavItem`, `filterNavigationByRole`, Sidebar/BottomNav/BottomNavMoreSheet), `kb-pwa`/`sk-pwa` (Serwist at `src/app/sw.ts`, PwaUpdateToast, PwaInstallToast, IosA2hsHint).
- **KIT-015:** New `kb-design-tokens` (portable token-system patterns) + `sk-tokens-neomorphism` (CSS vars `--neo-*`, 3 themes light/dark/midnight, Tokens/Anti-tokens/Escalas tables) + `doc-visual-direction` §9 Handoff extended.
- **KIT-017:** Delta-check `security.md` (headers table → `sk-security` §10) + `e2e-testing.md` (zero-delta, covered by `sk-e2e`).

#### Docs removed

- `docs/reference/component-catalog.md`, `crud-scaffold.md`, `features.md`, `layout-patterns.md`, `navigation.md`, `security.md`, `e2e-testing.md` — replaced by `kb-*`/`sk-*` skills above.

#### Previously (2026-03..04, also under v6.0)

- **KIT-009:** `sk-*` prefix introduced in taxonomy (CLAUDE.md + CORE.md §3 + CC.md §6).
- **KIT-010:** Des-neomorphization of base docs (54 neo refs → 0) — design-system-agnostic first.
- **KIT-016:** `.claude/docs/` bucket introduced for kit-meta docs.
- **KIT-018:** Pair-split pattern formalized — 5 existing pairs documented in CC.md §6.

### 📊 EPIC-DATAVIZ — Charts + Tables shipped (1 issue, 2026-04-23)

- **VIZ-001:** `recharts@^3.8.1` + `@tanstack/react-table@^8.21.3` ahora shipped por el kit. `kb-dataviz` skill actualizada — ejemplos copy-paste-runnables, frontmatter sin "not installed" warnings. Side-fix: `@source not '../../project'` en `globals.css` (extensión de FF-002) para aislar backlog markdown del escaneo de Tailwind v4.

### 🩹 EPIC-DRIFT-ABSORPTION — Derivative drift absorbed (2 issues, 2026-05-15)

- **DRIFT-001:** Playwright E2E template — container path + `setup:e2e` tag substitution. Cierra workflow gap reportado por proyecto derivado.
- **DRIFT-002:** Mobile fixes en Dialog + AlertDialog. New `useDialogViewportFit` hook (visualViewport → `--dialog-vvh`) + `common/Dialog` + `common/AlertDialog` wrappers con layout mobile (`top-4` + max-h IME-aware) preservando desktop centered. `confirm-dialog.tsx` AlertDialogHeader override (`block text-left`). 5 consumers migrados. Absorbe FACTORY-001 + FACTORY-002 tickets del proyecto derivado.

### 🔐 Auth + Security

- **Self-registration end-to-end** (2026-05-05): form + endpoint + role gating, configurable por flag.
- **Postgres rate-limit backend** (2026-05-05): login + invites instrumentados, feature flag, docs en `.env.example`.
- **`withHumanIdRetry` + `getNextHumanIdSeq`** (2026-05-08): DB-native sequences en lugar de count-based humanIds + 23505 retry wrapper. Skill discipline en `sk-db`.

### 🔔 Notifications

- **Optimistic updates + cross-component invalidation** (2026-05-05).
- **Panel migrado a Radix Popover** (2026-05-04): fixes positioning + a11y heredados del Sheet anterior.
- **Polling visibility-aware** (2026-05-01): `useNotifications` solo polea con tab visible.
- **Panel + poll cap aligned a 20 items** (2026-05-15): `PAGE_SIZE` del endpoint y `MAX_ITEMS` del `NotificationPanel` ahora coinciden en 20 (antes 6/6). Endpoint expone `metadata` en el payload — tipo `Notification` extendido — habilita consumo de `metadata.*` en apps derivadas (ej. `cohost_invitation` con `inviteId`). A11y: `aria-label` en panel, `aria-hidden` en íconos decorativos, `sr-only "Sin leer"` para screen readers.

### 📧 Email

- **Logo como CID attachment** (2026-05-04): pre-generated module — sin runtime FS reads. Generated file `prettier-ignored` para evitar dirty round-trips.

### 🧭 /discovery workflow refactor

- **Methodology split + Phase 6.2/7.5 fixes** (2026-05-01): tk-discovery alineado con fx-workflow-authoring doctrine.
- **5 quick-win perf optimizations** (2026-05-01): reducción medible de wall-clock.
- **Sonnet alias para subagent model field** (2026-05-01).
- **Subagent prompts requieren explicit skill paths** (2026-04-29): regla CC.md §2.

### 📚 Knowledge base / skills

- **New `kb-ssot-registries` + `kb-cron-jobs`** (2026-04-29): portable knowledge.
- **`kb-cron-jobs` hygiene** (2026-05-03): JSON header-comment removed + vercel-shape invariant.

### 📦 PWA

- **Dev-only SW noise silenced** (2026-05-01): toast + log polling cleaned.

### 🛠️ Factory housekeeping

- **`factory-engineer` agent removed** + stale drift tickets cleaned (2026-05-05).
- **`factoryVersion` refs 5.x→6.0 aligned** + `.env.example` rate-limit docs (2026-05-05).
- **`/handoff` pre-creates transition dir** (2026-05-08): elimina permission prompt.
- **`env:check` + knip sweep + picomatch override** (2026-05-05).

### 🧪 Tests

- **NotificationBell + register E2E** failures fixed (2026-05-05).

---

## [5.6.0] - 2026-04-29 — Shell-wide pull-to-refresh

> **Source:** `FACTORY-FEEDBACK-001` from Aditivo CRM (derivative). Codex-reviewed (5+4 ajustes).

### Added

- `<PullToRefreshShell>` shell-wide PTR primitive in `src/components/pwa/`. Mounted once in `DashboardShell`, gated by `isMobile()`, hardcoded `router.refresh()` with deferred Promise resolve + 2s timeout fallback. New protected pages inherit PTR with no per-screen wiring.
- `ShellPTRProvider` + `useShellPTR` + `useDisableShellPTR` (counter-based) in `src/lib/pwa/shellPullToRefresh.tsx`. Multiple concurrent opt-outs compose safely — the shell only re-arms when ALL callers unmount.
- `isMobile()` capability-based helper in `src/lib/utils/platform.ts` (`(pointer: coarse) and (hover: none)`, SSR-safe with `matchMedia` guard).

### Changed

- `<PullToRefresh>` wrapper default gate flipped from `usePwaInstall().isInstalled` to `isMobile()`. Apps that need PWA-only pass `enabled={isInstalled}` explicitly. `enabled={true}` overrides the gate (useful in tests).
- `DashboardShell` mounts `<PullToRefreshShell />` once and applies `overscroll-y-contain` to its root `<div>` (escalation ladder documented in skill if Android Chrome native PTR persists).
- `/notifications` page calls `useDisableShellPTR()` to silence the shell while mounted — its data lives in client state and `router.refresh()` would not update it; the per-screen wrapper continues to handle the gesture.
- `sk-pull-to-refresh` skill rewritten — shell-wide is now the default mounting pattern. `sk-pwa`, `sk-features-index`, `sk-notifications` updated with cross-references.

---

## [5.5.1] - 2026-04-15

> 🩹 **Patch: Lifecycle Date Tracking + Tooling + Bugfix**

### 🔧 EPIC-FPX — Pipeline Extensions (1 issue)

- **FPX-007:** Lifecycle dates (`Created`, `Started`, `Completed`) in epics and issues — templates updated, enforcement in `/backlog` (Created), `/implement` coding (Started), `/implement` close (Completed). Smoke tests with `grep -qF`. Retrocompatible with pre-existing issues.

### 🔧 EPIC-SKT — Starter Kit Tooling (1 issue)

- **SKT-006:** Read-only DB query runner CLI (`pnpm db:query`) — allowlist security, table/schema discovery, JSON output

### 🐛 Fixes

- **Table pagination:** `useTableState` now resets page to 1 when external data length changes (e.g. filter applied)
- **Registry views:** `factory_release` workflow regenerates registry views during merge

### ⚙️ Agent Kit

- Metadata field count updated from 9 to 12 across SKILL.md and epic-generation.md

---

## [5.5.0] - 2026-04-13

> ✨ **Minor: Design System Enforcement + QC Hardening + Foundation Refactor**
>
> 4 epics, 28 issues, 53 commits.

### 🏗️ EPIC-FF — Factory Foundation (12 issues)

- **FF-001:** Tailwind v4 CSS variable syntax — safe abstract placeholders (`{utility}-(--{prop})`) in skill docs to prevent build crashes in projects without `@source not`
- **FF-002:** Exclude `docs/` and `.agent/` from Tailwind v4 source scanning
- **FF-003:** New `design-system-principles` skill — stack-agnostic anti-patterns (token usage, component reuse, scale consistency, multi-theme, surface hierarchy)
- **FF-004:** `webapp-testing` skill rewritten with 9 Hard Rules + RBAC patterns
- **FF-005:** Enforce `/backlog add` for issue creation (rule §5.11)
- **FF-006:** Safe grep rule — ban `**` glob in grep commands (rule §5.7)
- **FF-008:** No `--no-verify` and no push without authorization (rules §5.8, §5.9)
- **FF-009:** CORE.md refactored into 3-tier hierarchy: L1 Universal (`CORE.md`), L2 Runtime (`CORE-RT.md`), L3 Starter Kit (`CORE-SK.md`). Package-manager agnostic
- **FF-010:** `/init` tiered context loading — 58% less context usage
- **FF-011:** Consolidated `context-check.md` — DRY across all workflows
- **FF-012:** Checkpoint transparency pattern in `_shared/` — agents must announce loaded context at every gate

### 🔧 EPIC-FP — Factory Pipeline (4 issues)

- **FP-001:** Standardized `epic.template.md` with issue table format
- **FP-002:** Auto-inject design system ACs (DS1-DS4) into UI-related issues via backlog skill
- **FP-003:** `@ui-critic` enhanced from aesthetic reviewer to dual-purpose **Design System Compliance Auditor** (DS1-DS6 binary checks) + **Visual Quality Reviewer** (scoring). New `ui-critic-issue.template.md` for penultimate audit issue in UI epics. Added DS compliance check in `/audit` R2
- **FP-004:** Epic status auto-update enforcement in `/implement` close phase

### 🔧 EPIC-FPX — Pipeline Extensions (3 of 6 issues)

- **FPX-001:** Regression check in `/implement` QC — cross-references modified files against CODEBASE.md dependency map. Token validation greps UI files for hardcoded values when design system token map exists
- **FPX-002:** Verified auto-changelog in `/deploy` — confirmed working, closed
- **FPX-004:** Adaptive branching strategy — auto-detects project phase from `package.json` version (pre-release = main-first, post-release = develop-first)

### 🧪 EPIC-SKT — Starter Kit Tooling (5 issues)

- **SKT-001:** Story point totals in BOARD.md (per-epic and per-milestone)
- **SKT-002:** E2E `storageState` multi-role auth setup — per-role browser state files
- **SKT-003:** Dynamic RBAC test template — parametrized from project's `ROLE_CONFIG`
- **SKT-004:** Epic-level E2E test audit
- **SKT-005:** Server-side pagination with cached counts for large tables

### 🐛 Fixes

- **DropdownMenu layout shift on Windows:** Added `modal={false}` to Radix DropdownMenu in Header — prevents scrollbar removal that caused ~17px shift on Windows
- **E2E stability:** Neon branch sequence fix, auth timeout tuning, filter selector stabilization
- **TableFilter:** Backport scroll-close + neo badge shadow from Aditivo

### ⚙️ Agent Kit

- **v8.0.0 → v9.0.0:** 3-tier rules, design system enforcement, QC regression checks, checkpoint transparency

---

## [5.4.0] - 2026-04-08

> ✨ **Minor: Discovery Pipeline Stabilization + Factory Ops Knowledge Codification**

### 🔍 Discovery Pipeline (17 commits)

- **Hidden Chain Pattern:** Synthesis passes now use a hidden chain — `discovery.md` only loads `pass-1.md`, each pass has its checkpoint at the end + loader for the next pass. The model **cannot see** pass N+1 until the user approves pass N. Validated through 4 A/B runs.
- **WIP Reload:** Pass 2 and Pass 3 now explicitly reload all WIP files (`freeze-map.md`, `deep-dive.md`) + the current Brief before generating. Prevents context loss after hidden chain stops.
- **Feature Identification:** Added cross-reference verification step in freeze-map phase — every distinct capability must have its own FT-XXX. Prevents feature merging that reduces BR coverage.
- **Enrichment Questions:** New gap interview question type that explores depth of core features (premium capabilities, algorithms, config options). Minimum 2 per interview.
- **File Trim:** `discovery.md` reduced from 13,014 to 9,958 chars (2,330 under 12K limit) by removing redundant CONTEXT LOADED checklists and compressing ASCII blocks.
- **Turbo Chain Break:** Removed `// turbo` from synthesis pass-2 and pass-3 `cat` commands to prevent auto-chaining.
- **Terminology:** "Breathe Point" → "Checkpoint Light" across all workflow files.

### 📚 Factory Ops Skill

- **§3 Hidden Chain Enforcement:** Documented that listing steps sequentially in the parent workflow DOES NOT WORK — the model reads the full file and ignores intermediate checkpoints.
- **§4 Checkpoint Location:** Clarified that checkpoints go INSIDE pass files, not in the parent workflow. Parent checkpoints cause inflation and are ignored.
- **§6 Pattern A (Multi-Pass):** Renamed to "Hidden Chain", added mandatory implementation diagram with anti-pattern documentation.

### ⚙️ Agent Kit

- **v7.0.1 → v8.0.0:** Major — Discovery pipeline stabilization, hidden chain pattern, factory-ops codification.

---

## [5.3.1] - 2026-04-07

> 🩹 **Patch: Rules Consolidation + Claude Code Integration + Agent Kit 7.0.1**

### 🔒 Rules & Enforcement

- **CORE.md consolidation:** Merged 5 always-on rule files (`00_global`, `04_complementary`, `GEMINI`, `ROUTING`, `HIERARCHY`) into single `CORE.md` — eliminates context bloat and circular references
- **Routing enforcement hardened:** Pipeline completeness checks + stronger agent loading requirements

### ✨ Features

- **`.claude/` workflows:** Added Claude Code integration with stateful Discovery pipeline (8 phases, templates, progress tracking)
- **`/deploy` workflow:** New deployment workflow + glossary + `version: 0.0.0` convention for derived apps
- **`/proposal` neutral language:** Skeptical-client agent + neutral tone enforcement

### ⚙️ Agent Kit

- **v7.0.0 → v7.0.1:** Routing enforcement + pipeline completeness improvements

### 🏭 Backlog

- **Milestone renamed:** `v5.4` → `v5.3.1` to align with patch scope

---

## [5.3.0] - 2026-04-05

> ✨ **Minor: Workflow Flattening + Agent Kit v6**

### ✨ Features

- **AGT-001 — Flatten workflow phases:** Removed redundant `phases/` subdirectory from 8 workflows (audit, backlog, design, discovery, docs, implement, proposal, validate_docs). Updated all `cat` paths. Preserved functional subdirs (`generation/`, `extended/`).
- **Agent Kit v6.0:** Major version push with flattened workflow structure
- **Legacy cleanup:** Removed deprecated workflow files and unused phase references

---

## [5.2.0] - 2026-03-27

> ✨ **Minor: Avatar Upload + Vercel Deploy + RBAC Hardening + Workflow Improvements**

### ✨ Features

- **FEAT-001 — Avatar Upload + DB Storage:** Full avatar management pipeline — server-side resize (128×128 WebP via `sharp`), base64 storage in `avatar_data` column, API route (`GET /api/avatar/[userId]`) with 24h cache headers, `AvatarUpload` component with click + drag-and-drop, cache busting via `?v=timestamp`. OAuth image guard in `signIn` callback + `linkAccount` event prevents overwriting custom avatars.

### � Vercel Auto-Deploy (DEPLOY-001)

- **`getAppUrl()` helper:** Centralized URL resolution with auto-detection: `NEXT_PUBLIC_APP_URL` > `VERCEL_PROJECT_PRODUCTION_URL` > `VERCEL_URL` > `localhost:3000`. Refactored 9 consumers.
- **`push-env-vercel.mjs`:** Push `.env.local` vars to Vercel via REST API. Features: auto `vercel link`, `DATABASE_URL_POOLER` override, `--clean`, `--dry-run`, `--verbose` flags.
- **Auth `trustHost` auto-detect:** Uses `process.env.VERCEL` — prevents `UntrustedHost` error without manual env var.

### 🔐 Auth RBAC Hardening

- **FIX-004 — Auth callback split:** Moved JWT/session callbacks to `auth.config.ts` (Edge-safe) so middleware gets `req.auth.user.role`. Prevents silent RBAC failures.
- **FIX-005 — Route ACL scaffold:** `ROUTE_ACL` map + `isRouteAllowed()` helper in `permissions.ts`. 2-layer pattern: Route ACL (who sees pages) vs Resource Permission (who does actions).
- **PWA Update Toast fix:** Added `navigator.serviceWorker.controller` guard to prevent false "Nueva versión" toast on first install.

### 🔒 Rules & Enforcement

- **FIX-006 — Workflow Literal Execution:** New HARD LIMIT rule (§10 in `04_complementary.md`) — agent must `cat` workflow files before execution, no memory execution.

### ⚙️ Workflow Improvements

- **`/init` redesign:** Leaner, BOARD.md as SSOT, no invented data
- **`/implement` hardened:** Mandatory context check before handoff, reorganized phases
- **`/factory_release`:** Mandatory CHANGELOG review gate added
- **`project-config.md`:** YAML frontmatter for structured metadata (FOUND-001)

### 🐛 Fixed

- **FIX-003 — 3 SK bugs bloqueantes en fresh install:** `setval` crash, wrong seed paths, hardcoded `humanId`
- **`next/image` + local API URLs:** Avatar URLs with query strings → `unoptimized` prop fix
- **Flaky E2E search input** (strict mode with duplicate inputs)

### 📦 Dependencies

- Added `sharp` (production) for server-side image processing

### 🧪 Tests

- 262 unit tests (22 files, all passing) — +8 `isRouteAllowed` + 5 `getAppUrl()` tests
- 25 E2E tests (all passing)

---

## [5.1.3] - 2026-03-24

> 🩹 **Patch: Auth RBAC Hardening + Route ACL Scaffold**

### 🐛 Fixed

- **FIX-004 — Auth callback split (middleware gets undefined role):** Moved JWT/session callbacks to `auth.config.ts` (Edge-safe) so middleware's NextAuth instance has `req.auth.user.role` available. `auth.ts` composes with the base for DB-dependent image sync. Explicitly inherits `session` and `authorized` callbacks (JS spread doesn't deep-merge).

### ✨ Added

- **FIX-005 — Route ACL scaffold:** `ROUTE_ACL` map + `isRouteAllowed()` helper in `permissions.ts`. Integrated in `authorized()` callback. Projects fill the map with their routes — 2-layer auth pattern: Route ACL (who sees pages) vs Resource Permission (who does actions).
- **Security skill:** 5 new sections — split-config pattern, 2 pitfalls (missing callbacks, no deep merge), RBAC placement in `authorized()`, Route ACL vs Resource Permission distinction.

### 🧹 Maintenance

- Removed unused Next.js default SVGs (`public/*.svg`)
- Fixed flaky E2E search input (strict mode with duplicate inputs)
- Fixed push-env-vercel.mjs inline comment stripping for quoted values

### 🧪 Tests

- 262 unit tests (22 files, all passing) — +8 new `isRouteAllowed` tests
- 25 E2E tests (all passing)

---

## [5.1.2] - 2026-03-24

> 🩹 **Patch: Vercel Deploy Pipeline + Critical Bugfixes**

### 🚀 Vercel Auto-Deploy (DEPLOY-001)

- **`getAppUrl()` helper:** Centralized URL resolution with auto-detection: `NEXT_PUBLIC_APP_URL` > `VERCEL_PROJECT_PRODUCTION_URL` > `VERCEL_URL` > `localhost:3000`. Refactored 9 consumers across config files, email templates, auth, and API routes.
- **`push-env-vercel.mjs`:** New script to push `.env.local` vars to Vercel via REST API. Features: auto `vercel link` prompt, `DATABASE_URL_POOLER` override, production/preview/development target classification, `--clean`, `--dry-run`, `--verbose` flags.
- **`vercel.json`:** Placeholder config with `crons: []`.
- **`.env.example`:** Added `VERCEL_TOKEN` and `DATABASE_URL_POOLER` section.

### 🐛 Fixed

- **FIX-003 — 3 SK bugs bloqueantes en fresh install:**
  - `setval` crash in migration for `humanId` sequences
  - Wrong seed script paths in `package.json`
  - Hardcoded `humanId` in admin seed

- **Auth trustHost auto-detect:** `trustHost` now auto-detects Vercel via `process.env.VERCEL` (always set by Vercel runtime) — prevents `UntrustedHost` error without requiring manual `AUTH_TRUST_HOST=true` env var.

- **FIX-004 — Auth callback split (middleware gets undefined role):** Moved JWT/session callbacks to `auth.config.ts` (Edge-safe) so middleware's NextAuth instance has `req.auth.user.role` available. `auth.ts` composes with the base for DB-dependent image sync. Prevents silent RBAC failures in middleware.

### 🧪 Tests

- 254 unit tests (22 files, all passing) — +5 new `getAppUrl()` tests

---

## [5.1.1] - 2026-03-20

> 🩹 **Patch: PWA Bugfix + Backlog Quality**

### 🐛 Fixed

- **PWA Update Toast false positive:** Toast "Nueva versión disponible" appeared incorrectly when reopening the PWA or after browser evicts the SW (common on iOS/Safari). Added `navigator.serviceWorker.controller` guard to distinguish first install from real update.

### 🏭 /backlog Pipeline (WF-022)

- **Owner field:** Added to issue template + SKILL.md assignment rules
- **Anchor links:** Doc references require anchor links (🔴 BLOCKER)
- **Mandatory fields expanded:** SK Leverage, Implementation Evidence, Commits now mandatory
- **Quality minimums table:** Expanded 7→12 fields
- **Consolidation check:** Added Pregunta 6 to gap-analysis
- **Owner detection:** Auto-detect from Discovery Brief in context-loading
- **Registry:** Added `project_setup` combo to `registry.yaml` (SSOT)

### ⚙️ Agent Kit

- **v5.0.9 → v5.0.10**

---

## [5.1.0] - 2026-03-20

> ✨ **Minor: /docs & /design Pipeline Anti-Degradation**

### 📄 /docs Pipeline Hardening (WF-011 → WF-019)

- **WF-011:** Cross-validation entre documentos generados en pipeline
- **WF-012:** `/validate_docs` reforzado con patrones MEGA_AUDIT
- **WF-013:** Hard checkpoints entre batches de docs + project context loading
- **WF-014:** Batch restructuring + quality floor para User Stories
- **WF-015:** Per-batch template loading + write-then-append pattern
- **WF-016:** Split Batch 6 en 6+7 con hard checkpoint
- **WF-017:** Pipeline audit fixes (correcciones de auditoría)
- **WF-018:** Restore sub-batch `notify_user` checkpoints
- **WF-019:** Anti-degradation full refactoring del docs workflow

### 🎨 /design Pipeline Fracture (WF-020 → WF-021)

- **WF-020:** Fractura `generation.md` monolítico en archivos per-pass (anti-degradation)
- **WF-021:** §0.1 SK Style Migration Assessment + Creative Freedom + Inter-Pass Checkpoints

### 🧹 Maintenance

- **generation.md trimming:** 2 refactors para reducir a límite de 12K chars
- **ROUTING.md:** Alineado precedence con `registry.yaml` SSOT
- **Enforcement banners:** 🔴🔴🔴 banners antes de cada batch header
- **US sub-batch size:** Reducido a 1-2 epics por write call (anti context overflow)

### ⚙️ Agent Kit

- **v5.0.7 → v5.0.9**

---

## [5.0.0] - 2026-03-19

> 🏗️ **Major: Agent System v5 — Registry + Workflow Refactoring**

### 📋 EPIC-REGISTRY — Centralized Agent Registry (REG-001 → REG-016, 40 SP)

- **REG-001:** `registry.yaml` SSOT — 29 agents + 48 skills con keywords bilingual, combos, dimensions, fallbacks
- **REG-002:** `/factory_agents` workflow + `registry_cli.py` CLI (add/rebuild/validate)
- **REG-004/005:** Migración `/backlog` full + add → REGISTRY views
- **REG-006/007:** Pipeline refs y `ROUTING.md`/`CONTENTS.md` simplificados
- **REG-008:** `/implement` loading model refactorizado a REGISTRY
- **REG-010:** Legacy MAPPING files eliminados (`AGENTS_MAPPING.md`, `SKILLS_MAPPING.md`)
- **REG-011:** Integration testing pipeline
- **REG-012:** Backfill subcommand en `registry_cli.py`
- **REG-013:** Activation modes (`auto`, `explicit_only`) en agents + skills
- **REG-014:** 5 nuevos combos + `design-system-lead` explicit_only
- **REG-015:** Skills redundantes eliminados (`tdd-workflow`, `lint-and-validate`)
- **REG-016:** CLI respeta `activation_mode`

### 🔧 EPIC-WF — Workflow Refactoring (WF-001 → WF-010, 26 SP)

- **WF-001→005:** Todos los workflows refactorizados a fases secuenciales (`/docs`, `/design`, `/discovery`, `/proposal`, `/backlog`)
- **WF-006:** Cleanup crosscutting (legacy docs, agent announcements en CP1)
- **WF-007:** Mejorar calidad de generación `/design`
- **WF-008:** Fracturar generación `/docs` en 4 batches (anti context-degradation)
- **WF-009:** 7 mejoras al design pipeline (post-mortem v3): checklist post-validation, cache model, traceability FT→SCR, OQ inheritance, deferred items, DD data impact, interaction states
- **WF-010:** Template `project-config.md` reescrito — 9 secciones (Info, Problem, Stakeholders, Stack, Glossary, External Systems, Integrations, Rules, Commands)

### 🧹 Agent System Cleanup

- Eliminados `AGENT_FLOW.md`, `USAGE_GUIDE.md` (legacy)
- `ARCHITECTURE.md` reescrito
- Heredoc ban rule (`04_complementary §9`)
- 2 batches de audit fixes (9+ fixes cada uno)
- `/implement` QC: mandatory file summary

### ⚙️ Agent Kit

- **v3.1.0 → v5.0.2:** Smart install, clean install en major (rm + fresh), project/ backup/restore, push mode warnings

---

## [4.1.0] - 2026-03-16

> ✨ **Minor: Discovery Workflow Redesign**

### 🔍 Discovery System v3 (11 files)

- **New `discovery-expert` agent:** Anti-drift rules, source classification protocol, decision freeze, confidence tagging, adaptive interview rules
- **6 cognitive phases:** Source Intake → Freeze Map → Gap Interview → Synthesis Draft → Challenge Pass → Final Brief (replaces old section-by-section approach)
- **Metrics reordered:** Source Fidelity > Drift Control > Gap Clarity > Consistency > Traceability Density > Structural Completeness
- **§11 = Visual Direction Seeds** (content section for `/design` downstream). Reconciliation = Appendix A (mechanical cross-check)
- **Conditional loading profiles:** D0 light, D1 standard, D1 legacy-heavy, D2 brief-audit — prevents context bloat
- **Bulk attachments:** Never silent sampling, allows explicit partitioning/prioritization
- **Challenge Pass:** 3 distinct output shapes per agent (value/scope, reversibility/constraints, sequencing/dependencies)
- **Template §5.2 neutralized:** Service examples marked as common options, not defaults — prevents stack gravity
- **Resolution states:** Firm, Resolved During Discovery, Working Hypothesis, Deferred, Open Question — replaces binary open/firm
- **Post-checkpoint reconciliation:** OQs must be reclassified before drafting (prevents silent upgrades to Firm)
- **Template:** +Resolved During Discovery and +Working Hypotheses sections
- **Auto-commit softened:** Now recommended action, not automatic — respects heavy OQs/assumptions
- **2 hard checkpoints** (down from 4-5) — less friction, more meaningful stops
- **Routing updated:** `discovery-expert` in ROUTING.md and AGENTS_MAPPING.md (32 agents total)
- **Hardcoded cleanup:** Removed project-specific references from factory templates

### ⚙️ Agent System

- **Agent Kit v3.1.0:** Published + integrated

---

## [4.0.0] - 2026-03-15

> 🏗️ **Major: Project Restructuring — src/ Migration**

### 🏗️ EPIC-RESTRUCTURE (7 issues, STRUCT-001→007)

- **STRUCT-001:** Dead code cleanup — removed demo page, showcase components, unused imports
- **STRUCT-002:** `git mv` components/ + lib/ into src/ — all application code now under `src/`
- **STRUCT-003:** Unified config — merged `lib/config/` and `src/config/` into single `src/config/`
- **STRUCT-004:** Verified/fixed tsconfig aliases and vitest config for new paths
- **STRUCT-005:** Created comprehensive `docs/guides/project-structure.md` guide (SSOT)
- **STRUCT-006:** Updated 10 documentation files with 145+ path renames
- **STRUCT-007:** Migrated catch-all alias `@/*` from `./*` → `./src/*` for import discipline

### 📚 Project Structure Guide (New)

Complete architectural guide covering:

- Feature Slices (`src/features/`) as optional escalation pattern
- Shared vs Domain classification with dependency rules
- `lib/` scope (SÍ/NO tables)
- Test co-location for feature slices
- Migration path from global to feature slices
- Anti-patterns (12 rules)
- Path aliases table

### 🧹 Dead Code Cleanup

- Deleted 3 dashboard demo components (QuickActions, RecentUsersTable, StatsCards) + skeletons
- Removed `testNotification` debug function + unused imports
- Removed stale "Demo Showcase" quicklink to deleted `/demo` page
- Cleaned 6 stale entries from `knip.json` ignore list
- Added `seed.ts` to knip ignore (manually executed)
- **Result:** Knip reports 0 issues

### 📦 Dependencies

- Updated 25+ packages (Sentry, Playwright, Tailwind, Vitest, etc.)
- Resolved 14 of 17 dep vulnerabilities (9 high + 1 critical → 0)
- 3 remaining vulns (low/moderate) accepted — all from `@lhci/cli` devDep

### 📄 README

- Project structure tree aligned with new `src/` layout
- Fixed `AI_RULES.md` reference → `.agent/rules/`
- Added link to `docs/guides/project-structure.md`

### ⚙️ Agent System

- Agent Kit v3.0.5 integrated
- Workflow context loading updated for project-structure and design-system guides

---

## [3.3.1] - 2026-03-13

> 🩹 **Patch: Cascading Filters**

### ✨ Features

- **Cascading filters (UserTable):** Role/status filter options now derived via `useMemo` from cross-filtered data — only shows options that produce non-empty results
- **Cascading filters (Notifications):** Server-side facets via `DISTINCT` queries in `getNotifications()` — categories and statuses cascade based on the other active filter

### 📚 Documentation

- **crud-scaffold.md:** Layer 6 — "Cascading Filters" section with mandatory rule, code pattern, and anti-patterns
- **04_complementary.md:** Rule §8 — enforcement for AI agents: never hardcode filter options when 2+ filters exist

### ⚙️ Agent System

- **Agent Kit v3.0.3:** Published + integrated

---

## [3.3.0] - 2026-03-13

> ✨ **Minor: RBAC Role Configuration + Invite Role Selection**

### 🔐 RBAC Enhancements (EPIC-RBAC — 2 issues, 10 SP)

- **RBAC-001:** Consolidated `ROLE_CONFIG` as SSOT — centralizes `displayName`, `canInvite`, `assignableRoles`, and `style` per role. All role functions now read from single config. Added `canInvite()` utility. `ROLE_STYLES` deprecated.
- **RBAC-002:** Invite role selection — `/api/invites/send` accepts optional `role` param, validated against `ROLE_CONFIG.assignableRoles`. Role stored in `metadata.role` (zero migrations). Accept route reads metadata with `getDefaultRole()` fallback. UI role selector in `InviteUserDialog`.

### 🐛 Fixed

- **Dark theme:** `destructive-foreground` set to white text in dark mode global CSS

### 📚 Documentation

- **features.md:** §1.4 (RBAC) updated with `ROLE_CONFIG` pattern, §1.6 (Invites) updated with `metadata.role`, §5 (API) updated with role param, §11 (How to Extend) updated with new role/capability instructions

---

## [3.2.0] - 2026-03-13

> ✨ **Minor: UI Quality Audit + Agent Kit Integration + Design System Docs**

### 🎨 Design System Quality (EPIC-UIQA — 13 issues, 33 SP)

- **UIQA-001→003:** Unified neo shadow syntax across all components, fixed Input, aligned SkeletonCard
- **UIQA-005/006:** Design System Guide + dropdown-menu shadow unification
- **UIQA-007→011:** Form inputs, buttons, badges, overlays migrated to neo tokens; legacy shadow leaks removed from dashboard/admin
- **UIQA-012:** FormSelect migrated from native `<select>` to Radix Select + RHF Controller
- **UIQA-013:** Table component — all inline `style={{}}` → Tailwind arbitrary values, JS hover → CSS `:hover`
- **UIQA-014:** Overlay opacity unified to `bg-black/40` across Dialog, Sheet, AlertDialog
- **UIQA-015:** Sidebar hover feedback upgraded to `neo-outset-sm`
- **UIQA-016→018:** SkeletonTable neo wrapper, Switch thumb neo token, FormField dead border removed

### 📚 Documentation Overhaul

- **design-system.md:** Complete Neomorphism 2.0 guide — tokens, utility classes, decision table, known exceptions, See Also links
- **crud-scaffold.md:** Fixed stale inline style recommendations, corrected Input/Select pattern to class notation, ghost button active state
- **component-catalog.md:** Added TableFilterBar section, updated FormSelect with Radix migration note
- **layout-patterns.md:** Added detail page, form card, and tab content patterns (5→8 total)
- **features.md:** FormSelect noted as Radix-based internally

### ⚙️ Agent System

- **Agent Kit v3.0.2:** Integrated into main branch (previously develop-only)
- **Design agents:** `visual-design-director`, `layout-composer`, `ui-critic`, `design-engineer` added
- **Release workflow:** Simplified — `.agent/` now merges to main, removed exclusion logic (21→17 steps)

### 🔧 Refactors

- **Headless UI → Radix:** Fully migrated (`@headlessui/react` removed)
- **TableFilterBar:** Slots API refactored for better composability
- **Table inline styles → Tailwind:** `bg-(--table-header-bg)`, `shadow-(--neo-outset-sm)` class-based

---

## [3.1.0] - 2026-03-07

> ✨ **Minor: Loading Skeletons + Agent Routing v2**

### ✨ Features

- **UX-004:** Layout-aware loading skeletons for Users list, User detail, and Profile pages
- **crud-scaffold.md:** Added Layer 4.5 (Loading Skeleton) as mandatory requirement for every CRUD module
- **Agent Routing v2:** Mandatory `Agents:` field in issues — explicit agent assignment with autodetect supplement and dedup

### ⚙️ Agent System

- **AGENTS_MAPPING v2:** New agents (`data-modeler-drizzle`, `pwa-engineer`, `design-system-lead`), §5 rules for explicit assignment, fullstack fallback (`backend-specialist` + `frontend-specialist`)
- **SKILLS_MAPPING v1:** Centralized skill mapping with `domains/` and `kit/` categories
- **issue.template.md:** Added `Agents:` field alongside existing `Skills:` field
- **CHECKPOINT 1:** Now displays 🤖 Agents + 🧰 Skills loaded, enforces minimum 1 of each
- **Cleaned 8 redundant agents:** `auditor`, `delivery-manager`, `fullstack-engineer`, `product-strategist`, `project-architect`, `solution-architect-functional`, `solution-architect-technical`, `tech-lead`

### 🔧 Workflow Optimizations

- **`context.md`:** Trimmed 14.5KB → 12KB (condensed Phase 0.5, merged turbo blocks, stripped comments)
- **`generation.md`:** Trimmed 12.7KB → 11.2KB (removed verbose issue examples)
- **`/backlog add`:** Loads `AGENTS_MAPPING.md`, validates mandatory agent+skill selection

---

## [3.0.6] - 2026-03-06

> 🩹 **Patch: SMTP Serverless Fix + Workflow Improvement**

### 🐛 Fixed

- **EMAIL-007:** SMTP logo attachment crash on Vercel serverless — `resolveLogoAttachment()` now checks `existsSync` before attaching, gracefully skips when `public/` is unavailable
- **`.env.example`:** Documented `EMAIL_LOGO_URL` for production serverless environments

### ⚙️ Workflow

- **`/backlog add`:** Added explicit `// turbo` + `cat` commands with full paths (prevents wrong directory lookups), included `SKILLS_MAPPING.md` loading, warning against generic `plan-writing` skill

---

## [3.0.5] - 2026-03-06

> 🩹 **Patch: Board Improvements, Rules Cleanup, Workflow Enhancements**

### 📊 Board (`scripts/tools/update-board.ts`)

- **Global Summary:** Cross-milestone status counts at top of BOARD.md
- **Milestone Progress Table:** Per-milestone % with emoji indicators (✅/🟡/🔵)
- **Straggler Detection:** Warns about pending issues in 80%+ done milestones
- **M\* support:** `extractMilestone` now detects both `v*` and `M*` directories

### 📜 Rules (`.agent/rules/`)

- **Renamed:** `.mdc` → `.md` for all rule files
- **00_global:** Removed hardcoded 'TimeKast', fixed `GITHUB_BACKLOG` → `BOARD.md`, clarified PowerShell `&&` restriction, `reusable-library.md` → `INVENTORY.md`, GitHub Issues → backlog issues
- **02_nextjs:** Server Actions example now uses `withAuth()`/`withSelf()` helpers
- **03_drizzle:** `db:push` → `db:migrate` in migration flow, soft delete with full audit fields
- **GEMINI.md:** Softened Socratic Gate, removed Turkish triggers, replaced phantom scripts with native `pnpm` commands + 3 real scripts, removed Gemini Mode Mapping
- **HIERARCHY.md:** Added (replaces deleted README.md)

### ⚙️ Workflow

- **`/factory_release`:** Added explicit `factoryVersion` bump step + "NEVER bump on main" rule
- **`version` field:** Fixed from `3.0.4` → `1.0.0` (was incorrectly tracking factoryVersion)

---

## [3.0.3] - 2026-03-03

> 🩹 **Patch: E2E Runner Hardening + Orphan Branch Prevention**

### 🧪 E2E Runner (`scripts/tools/e2e-runner.ts`)

- **`PLAYWRIGHT_HTML_OPEN=never`:** Prevents Playwright from opening a blocking report server before cleanup runs
- **Shared `cleanup()` with guard:** Extracted cleanup logic into idempotent function — safe to call from both `finally` and signal handlers
- **SIGINT/SIGTERM handlers:** Registered before branch creation — ensures Neon branch cleanup on `Ctrl+C`
- **Report opens AFTER cleanup:** HTML report only opens after server stop + branch deletion, preventing orphan branches

### ⚙️ Playwright Config (`playwright.config.ts`)

- **Workers:** `undefined` → `2` locally (avoids Turbopack cold-compile conflicts with 4+ workers)
- **Retries:** `0` → `1` locally (handles transient ECONNRESET errors)
- **Timeout:** default → `60s` (accommodates Neon branch latency + cold start)
- **Action timeout:** default → `15s` (more tolerant clicks/fills)
- **Navigation timeout:** default → `30s` (more tolerant `page.goto`)

### 🔧 Config

- **E2E port:** `3005` → `3006` in `package.json` (avoid conflicts)

### 🧹 Maintenance

- **Cleaned 9 orphan `e2e-*` Neon branches** from Feb 14–22 (one-time)

---

## [3.0.2] - 2026-02-25

> 🩹 **Patch: Unsaved Changes Guard + CRUD/Docs Alignment**

### 🛡️ Unsaved Changes Protection

- **Global provider:** Added `UnsavedChangesProvider` in root `Providers.tsx`
- **Reusable hook:** Added `useUnsavedChangesGuard` for form-level dirty state registration and guarded navigation
- **Internal navigation modal:** Added confirmation dialog for in-app navigation when there are unsaved changes
- **Browser protection:** Added native confirmation for tab close/refresh (`beforeunload`) and browser back/forward

### 🧩 CRUD Integrations

- **Users create/edit forms:** Integrated guard in `NewUserContent` and `UserDataTab`
- **Profile form:** Integrated guard and reset-after-save behavior to avoid false dirty state
- **Navigation semantics:** Standardized `confirmNavigation()` for cancel actions and `allowNavigation()` after successful save

### 🎨 UI

- **Unsaved dialog CTA:** Changed from warning (yellow) to default/primary style for better visual consistency

### 📝 Documentation

- **`features.md`:** Added core feature section for Unsaved Changes Guard and hook inventory update
- **`component-catalog.md`:** Added `useUnsavedChangesGuard` API and usage pattern
- **`crud-scaffold.md`:** Added required unsaved-changes pattern for Create/DataTab flows, anti-patterns, and checklist items

---

## [3.0.1] - 2026-02-23

> 🩹 **Patch: Accessibility, Filter Bar Layout, Docs**

### ♿ Accessibility

- **Password toggle buttons:** Added `aria-label` across 4 forms (LoginForm, ResetPasswordForm, AcceptInviteForm, NewUserContent)
- **Login links:** Changed from `hover:underline` to always-visible underline — fixes "links rely on color" Lighthouse audit

### 🎨 UI

- **TableFilterBar:** Desktop layout now uses 2 explicit rows (search+actions / filters) instead of single wrapping row — prevents random filter splitting at medium widths

### 📝 Docs

- **getting-started.md:** Added reminder to replace Factory README.md with a project-specific one
- **project-config.md:** Removed hardcoded versions — `package.json` is SSOT

### 🔧 DX

- **`/factory_release` workflow:** New standardized release workflow with 3 mandatory STOP gates

---

## [3.0.0] - 2026-02-23

> 🔔 **Notifications System + Documentation Overhaul + Quality**

### 🆕 Notification System (NOTIF-001 → NOTIF-021)

Full real-time notification system with 3 channels:

- **Schema (NOTIF-001/002):** `notifications`, `notification_preferences`, `push_subscriptions` tables. 6 categories × 3 channels with per-user preferences.
- **Core Service (NOTIF-003):** `notify()` function dispatches to in-app, push, and email based on user prefs. Respects category locks and channel availability.
- **Email Channel (NOTIF-004):** `notificationEmail()` template with category badge, optional CTA. Plain text fallback.
- **SSE Real-time (NOTIF-005):** `/api/notifications/stream` with SSE for instant in-app delivery + polling fallback.
- **Push Notifications (NOTIF-006/007):** web-push VAPID integration. SW handles `push` events with notification click → `postMessage(SW_NAVIGATE)` → client-side navigation.
- **Client Hooks (NOTIF-008):** `useNotifications()`, `usePushSubscription()`, `useSSE()` — composable hooks for notification UI.
- **Components (NOTIF-009→015):**
  - `NotificationItem` — Category badge, time-ago, read/unread states
  - `NotificationBell` — SSE-powered badge counter in header
  - `NotificationPanel` — Dropdown with latest 6, "Ver todas" link
  - `NotificationSettings` — Matrix of categories × channels with per-channel global toggles
  - `PushPermissionPrompt` — Sheet for push opt-in
- **Full Page (NOTIF-012):** `/notifications` with search, category/status/date filters, pagination, bulk actions (read/unread/delete) with selection mode.
- **Preferences (NOTIF-013):** Per-user notification preferences in profile tab. Matrix UI with category locks.
- **Test Action (NOTIF-017):** Demo section in `/demo` for sending test notifications per channel/category.

### 🆕 UI Components & Patterns

- **NeoCheckbox:** Neumorphic checkbox with inset/raised states and animations
- **Button `neo` variant:** Outset button style for login and action buttons
- **CollapsibleTableFilterBar:** Auto-collapses filters on mobile with expand button
- **PageSize selector:** Dynamic rows-per-page in DataTable pagination
- **Header dropdowns:** Migrated HeadlessUI → Radix (UXUI-006)
- **Users collapsible filters:** Responsive filter bar for mobile

### 🐛 Fixed

- **UserNavigator "0 de N":** Rewritten `getAdjacentUsers()` with CTE + `ROW_NUMBER`/`LAG`/`LEAD` window functions. Root cause: JS Date (ms) vs PostgreSQL timestamptz (µs) precision mismatch.
- **SW Lifecycle:** Switched to managed updates (`skipWaiting:false`). Prevents ChunkLoadError on version changes.
- **SW NetworkOnly firewall:** Removed catch-all rules that intercepted navigations/RSC/API.
- **SW notification click:** `postMessage(SW_NAVIGATE)` instead of `client.navigate()`.
- **OAuth password:** Users who registered via OAuth can now set an initial password from profile.
- **Login Enter key:** Form now submits on Enter.
- **Pagination mobile overflow:** Fixed on small screens.
- **Header Radix dropdown regressions:** Fixed after HeadlessUI migration.

### 📚 Documentation Overhaul (DX-001 → DX-007)

Major documentation consolidation — **18+ docs → 13 docs, -662 lines net:**

- **Deleted 5 redundant docs:** `deployment.md`, `email-deliverability.md`, `reusable-library.md`, `neumorphic-elevation.md`, `branding.md`
- **Reorganized:** Moved `navigation-guide`, `e2e-testing`, `sw-updates` from `guides/` → `reference/`. Renamed `mobile-patterns` → `layout-patterns`.
- **Merged:** Neumorphic elevation → `component-catalog.md` §8. Branding → `getting-started.md` §6.
- **Reduced:** `troubleshooting.md` (460→120 lines, -74%), `security.md` (251→70 lines, -72%)
- **Rewritten:** `getting-started.md` — complete SK overview, corrected `db:push`→`db:migrate`, demo removal checklist, branding guide.
- **Rewrote:** `navigation-guide.md`, `crud-scaffold.md` (v3.0 rewrite with notification patterns), `notifications.md` (full reference)
- **New:** `project-config.md` — centralized project context for AI agents
- **Fixed:** 6 doc audit findings (F-01, F-07, F-09, F-11, F-12)
- **Clean Knip:** Removed 6 unused types, added `@public SK API` to 2 exported functions

### 🧪 Testing

- **253 unit tests** across 22 files (all passing)
- **48 E2E tests** (all passing)
- Notification service mock tests with proper query order matching
- Removed dead E2E spec (`notifications.spec.ts`)

### 🏗️ DX & Infra

- **Standardized ports:** dev=3000, e2e=3005 (centralized in `package.json`)
- **Pre-commit:** `no-unused-vars` enforced as error
- **Dead code removal:** 3 files + 1 devDep cleaned via Knip
- **Human ID Pattern:** `USR-1001` friendly IDs using PostgreSQL sequences

---

## [2.7.0] - 2026-02-13

> 💎 **Release Candidate Polish + Major Refactors (SK-001 to SK-005)**

### 🚀 Major Features & Refactors

- **SK-001:** Standardized Server Actions with `withAuth` helper (consistent error handling/RBAC)
- **SK-002:** Componentized `StatusToggle` + Soft Delete pattern (integrated in tables/details)
- **SK-003:** Dedicated User Detail Page (Read-only view with "Edit" mode)
- **SK-004:** `SearchInput` component with debounce + URL sync; TableFilter generics
- **SK-005:** Comprehensive CRUD Scaffold Guide (`docs/reference/crud-scaffold.md`)

### 🎨 Design & UX

- **BottomNav:** Extensive improvements to mobile navigation and layout
- **UI Polish:** Consistent look & feel, shadowing, and improved responsiveness
- **Tailwind v4:** Validated usage of `h-auto!` (correct syntax for v4)
- **Neumorphism:** Replaced hardcoded `rgba` shadows with `var(--neo-*)` tokens

### 🐛 Fixed (Pre-Release Polish)

- **Roles:** Standardized role badges and removed hardcoded hex colors
- **Imports:** Fixed inconsistent paths (`@/src/config` -> `@/config`)
- **Server Actions:** Replaced error throws with `redirect('/login')` in read actions
- **Audit:** Fixed soft-delete and toggle actions to properly update `modifiedBy/modifiedAt`

### 🏗️ Maintainability

- **Zod:** De-duplicated validation schemas (UserForm now uses shared schemas)
- **Docs:** Updated `component-catalog`, `features`, and `reusable-library` to match current state

### 🔍 R4 Audit Polish

- **Catch blocks:** Added `console.error` to 13 silent catch blocks across 10 components for debuggability
- **Branding:** Centralized hardcoded hex colors (`#1e40af`, `#0a1628`) into `branding.ts` with env overrides
- **Manifest/Layout:** `manifest.ts` and `layout.tsx` now reference `branding.themeColor`/`branding.backgroundColor`
- **Knip:** Removed 2 redundant `ignoreDependencies` entries; documented 30 SK public API exports as intentional
- **Comments:** Clarified intentional catch blocks (`client.ts`, `helpers.ts`), `lang="es"`, Google brand colors

### 🧪 Unit Test Coverage (9.2% → 31%)

- **7 new test files** (182 tests total, up from 73):
  - `config-branding.test.ts` — branding config values and logo helpers
  - `config-auth-features.test.ts` — OAuth flags, provider validation, credential retrieval
  - `config-status.test.ts` — status design tokens and style lookup
  - `config-roles.test.ts` — role hierarchy, assignable roles, badge styles
  - `config-navigation.test.ts` — nav filtering by role, bottom nav, more sheet
  - `email-templates-extended.test.ts` — 7 remaining email templates (HTML + plain text)
  - `logger.test.ts` — structured logging with context, dev/prod formatting
- **Coverage strategy documented** in `vitest.config.ts` with categorized excludes
- **100% coverage** on: `roles.ts`, `status.ts`, `lib/validations/`, `lib/utils/`, `invites/token.ts`

---

## [2.6.0] - 2026-02-12

> 🚀 **Login UX + CRUD Detail Page Pattern**

### 🆕 Added

- **Password visibility toggle**: Eye/EyeOff button in login password field (`LoginForm.tsx`)
- **Soft-deleted account guard**: Credentials login now rejects `deletedAt` users with `AccountDisabled` error and user-friendly message
- **CRUD Detail Page Pattern**: Users now have a dedicated `/settings/users/[id]` detail page with Avatar, role badge, and info card. Replaces view modal. Table rows are clickable with `onRowClick` navigation.

---

## [2.5.1] - 2026-02-11

> 🐛 **Bug Fixes**

### 🐛 Fixed

- **BottomNav active pill**: Config tab no longer shows active pill when Perfil is selected (prefix collision `/settings` vs `/settings/profile`)
- **createUser role preservation**: OAuth `createUser` event no longer overwrites seeded `super_admin` role with default `user`

### 🏗️ Infra

- **Versioning split**: `package.json` now uses `version` (app, starts at `1.0.0`) + `factoryVersion` (template, currently `2.5.1`)
- **CHANGELOG moved**: Factory changelog relocated to `docs/factory/CHANGELOG.md`; root `CHANGELOG.md` is now a clean template for forked apps
- **Backlog removed from main**: `docs/backlog/` removed from `main` branch (stays in `develop`)

---

## [2.5.0] - 2026-02-10

> 🎨 **Neumorphic Design System — Full UI Migration**

### 🎨 Design System

- **Neumorphic utility classes** (`neo-outset`, `neo-outset-sm`, `neo-outset-lg`, `neo-inset`, `neo-inset-sm`, `neo-pressed`) in `globals.css`
- **CSS custom properties** for neumorphic shadows per theme: `--neo-*` tokens in `light`, `midnight`, `dark`
- **3-theme system fix**: Removed all `dark:` Tailwind prefix usage (only works for `.dark` class, NOT `.midnight`)

### 🔄 Migrated Components (UI Primitives)

- `Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `Switch`, `Label` — neumorphic shadows + `rounded-xl`
- `Card`, `Dialog`, `Sheet`, `AlertDialog`, `Popover`, `DropdownMenu`, `Tooltip` — `neo-outset` containers
- `Badge`, `Tabs`, `Table`, `Separator`, `ScrollArea` — subtle shadow adaptation
- `Skeleton` — theme-aware pulsing with CSS variables
- `DataTable`, `TableSearch`, `TableFilter`, `TablePagination` — full neumorphic styling
- `SubmitButton` — replaced raw `<button>` with neumorphic hover/active states
- `ConfirmDialog` — variant buttons (`danger`, `warning`, `default`) use shadow-based hovers
- `ShowcaseBanner` — CSS variables for per-theme text/background colors

### 🧹 Exhaustive Audit (11 files fixed)

- `not-found.tsx`, `error.tsx`, `offline/page.tsx` — raw buttons → neumorphic
- `ErrorBoundary.tsx` — container + button → `neo-outset` + neumorphic button
- `EmptyState.tsx` — container → `neo-inset-sm`, button → neumorphic
- `(auth)/error/page.tsx` — card (`bg-card border shadow-xl` → `neo-outset`), links, icon containers
- `RecentUsersTableSkeleton.tsx` — `var(--sidebar-bg)` inline → `neo-outset bg-background`
- `ConfirmDialog.tsx` — `hover:bg-*/90` → shadow-based hovers
- `terms/page.tsx`, `privacy/page.tsx` — `dark:prose-invert` → theme-aware foreground classes
- `(legal)/layout.tsx` — header/footer borders + hover effects

### 📐 Layout Shell

- `Sidebar`, `Header` — neumorphic surfaces with CSS variable integration
- `PageContainer` — neumorphic content wrapper
- All auth pages (`login`, `register`, `forgot-password`, `reset-password`) — neumorphic forms + `rounded-xl`

### 📱 Mobile Navigation (BottomNav)

- **`BottomNav`**: Config-driven fixed bottom navigation bar (`lg:hidden`) with active pill indicator
- **`BottomNavMoreSheet`**: Framer Motion spring sheet with 3-column grid for overflow items
- **Replaces**: `MobileDrawer` (hamburger menu) — deleted
- **Config**: `bottomNav`, `bottomNavOrder`, `bottomNavOnly`, `bottomNavLabel`, `bottomNavHref` in `navigation.ts`
- `bottomNavLabel`: Short label override (max 10 chars) — e.g. "Demo Showcase" → "Demo"
- `bottomNavHref`: Override href for collapsible parents — e.g. `/settings` → `/settings/general`
- **Template guide**: Inline agent documentation + `features.md` section 1.25
- Added `framer-motion` dependency

### 🐛 Fixed

- `dark:prose-invert` silently failing in midnight theme (3-theme conflict)
- `hover:bg-primary-hover` non-existent class across 5 components
- Inline `var(--card-border)` / `var(--sidebar-bg)` bypassing design system
- Legal page borders not theme-aware

### 🔒 Security

- **Registration Gate**: OAuth (Google/GitHub) and Magic Link now respect `NEXT_PUBLIC_AUTH_REGISTRATION=false`
  - `signIn` callback blocks account creation, redirects to `/login?error=RegistrationDisabled`
  - `sendVerificationRequest` silently drops magic links for unregistered users (prevents email enumeration)
  - `LoginForm` displays user-friendly error message via `AUTH_ERROR_MESSAGES` map
  - Magic Link success toast changed to neutral wording (doesn't reveal if email exists)

---

## [2.4.1] - 2026-02-09

> 📚 **Documentation Patch — SK Component Catalog & CRUD Reference**

### 📚 Documentation

- **component-catalog.md:** Catálogo completo de componentes SK con props, imports y ejemplos de uso
- **reference-001-user-crud.md:** Implementación gold standard del CRUD de Users — patrón replicable para futuros CRUDs
- **reusable-library.md:** Sección de Testing Infrastructure añadida (Vitest, Playwright, fixtures, helpers, patrones)

---

## [2.4.0] - 2026-02-09

> 🧹 **Sprint Cleanup & Quality — 9/10 issues completed**

### 🐛 Fixed

- **FIX-001:** `isSuperAdmin()` email comparison bug — function now correctly checks role instead of email string
- **FIX-002:** Auth pages (forgot-password, reset-password, accept-invite) now respect client logos via `branding.getClientLogo()` with proper fallback

### 🧹 Cleanup

- **CLN-001:** Fixed `'superadmin'` typo in navigation config → `'super_admin'`
- **CLN-002:** Added RBAC scaffolding documentation — clarified that `posts` and `comments` in permissions are examples, not real resources
- **CLN-003:** Super admin audit log migrated from in-memory to database-backed via `logAuditEvent()`
- **CLN-004:** Replaced `console.error` with structured `logger` in email test route and invite API
- **CLN-005:** Renamed mock dashboard → Demo page (`/demo`) with `ShowcasePlaceholder` components
- **CLN-006:** Added `CODEBASE.md` auto-generation to pre-commit hooks via `generate-codebase.mjs`

### 🆕 Added

- **UI-002:** `ShowcasePlaceholder` + `ShowcaseBanner` reusable components for feature showcases
- `/demo` page — centralized demo/showcase page
- `/settings/general` page — general settings placeholder
- `docs/reference/CODEBASE.md` — auto-generated dependency map
- `scripts/tools/generate-codebase.mjs` — CODEBASE.md generator script

### 📚 Documentation

- Fixed 3 broken links to deleted `optional-features.md` (content merged into `features.md`)
- Updated `features.md` SSOT with v2.4 routes, components, and audit changes
- Updated `docs/README.md` reference table and backlog milestones
- Updated `getting-started.md` with corrected doc references

### ⏳ Deferred

- **UI-001:** React Bits Liquid Ether background animation (WebGL visibility issue — documented in issue for retry)

---

## [2.3.1] - 2026-02-04

> 🧪 **E2E Neon Branch Isolation**

### Added

#### E2E Testing Infrastructure

- **Neon Branch Isolation:** Each E2E test run creates a temporary database branch
  - `scripts/tools/neon-branch.ts` — API utilities for branch management
  - `scripts/tools/e2e-runner.ts` — Orchestrates: create branch → start server → run tests → cleanup
- **Setup Command:** `pnpm setup:e2e` now configures NEON_API_KEY and NEON_PROJECT_ID
- **Documentation:** `docs/guides/e2e-testing.md` — Complete guide in Spanish

### Changed

- **Drizzle:** Uses HTTP fetch mode in CI (`neonConfig.poolQueryViaFetch`) to avoid WebSocket issues
- **Playwright:** Removed `webServer` config (handled by e2e-runner wrapper)
- **Package.json:**
  - `test:e2e` → Uses wrapper script with branch isolation
  - `test:e2e:direct` → Fallback for debugging without isolation

### Fixed

- **CI WebSocket Issues:** Neon serverless driver now uses fetch in GitHub Actions
- **Endpoint Readiness:** `waitForEndpoint()` polls Neon API until branch is active

---

## [2.3.0] - 2026-02-04

> 🔄 **Starter Kit Sync**

### Changed

- Synchronized with starter-kit upstream
- Applied mobile menu, scrollbar overlay, and PWA migration fixes
- Optimized Husky hooks for pre-commit and pre-push
- Simplified reusable-library.md documentation

---

## [2.2.0] - 2026-02-01

> 🚀 **Full CRUD + Agent Workflows + Quality Gates**

### Highlights

- Complete User Admin CRUD with RBAC
- 25 E2E tests (all passing)
- Agent workflows enhanced with /qc and /proposal
- Lighthouse PWA assertions removed (deprecated in v12+)

---

### 🆕 Features

#### User Admin CRUD (CRUD-002)

- Full CRUD for user management at `/settings/users`
- Role-based access control (ADMIN/SUPER_ADMIN only)
- Inline editing with UserFormDialog
- User invitation system with InviteUserDialog
- Soft delete pattern implementation

#### User Profile (CRUD-001)

- Self-service profile editing at `/settings/profile`
- Name and avatar management
- Secure password change flow

#### Schema Improvements

- **SCHEMA-001:** Audit fields (`createdBy`, `modifiedBy`) on all tables
- **SCHEMA-002:** Soft delete pattern (`deletedAt`, `deletedBy`)
- **SCHEMA-003:** Human ID pattern (UUID + readable ID)

#### Auth Improvements

- **AUTH-001:** Removed auto-register for SuperAdmin (security)
- **SEED-001:** SuperAdmin seed now sets `createdBy` properly

#### Database

- **DB-001:** Migrated to Neon Serverless Driver for better edge compatibility

#### PWA

- **PWA-001:** Install prompt only shown in protected routes

#### UX Improvements

- **UX-020:** Login email memory (remembers last email)
- **UX-021:** Breadcrumb global context
- **UX-023:** LCP fix for logo header
- **UX-025:** Table sorting and pagination improvements

#### Components

- **COMP-001:** Added missing shadcn components
- **COMP-002:** Renamed TableFilters → TableExtras

---

### 🧪 Testing

#### E2E Tests (TEST-004)

- `tests/e2e/user-admin.spec.ts` — 7 test cases
- Create, edit, delete user flows
- Filter by role, search by name/email
- RBAC: USER denied, ADMIN can't create SUPER_ADMIN
- Total: 25 E2E tests passing (22s)

---

### 🏭 Factory Workflows

#### /qc — Post-Implementation Quality Check (NEW)

- 9 mandatory checks before closing issues
- Issue Compliance, Tests, Patterns, Rules, Duplication
- Breaking Changes (🛑 STOP), Migration Check, Scope Creep
- Integrated in `/implement` as Phase 5

#### /proposal — Client Proposal Workflow (NEW)

- Generates client-facing proposal document
- Output: `docs/proposal/PROPOSAL.md`
- Confirmation checkpoints before delivery

#### /audit Improvements

- Agent Enforcement Rules (7 unbreakable rules)
- Verdict Decision Rules table
- Coverage < 80% en R3 = BLOCKER
- Removed PWA assertions (deprecated Lighthouse 12+)

#### /implement Improvements

- Renumbered: Phase 5 = QC, Phase 6 = Closure
- Now calls /qc automatically before closing

#### Domain Skills

- `ui/SKILL.md` — Added SIEMPRE/NUNCA section
- All workflows now have Gates/Escalation section

---

### 📚 Documentation

- **DOCS-020:** CRUD Patterns documented
- **DOCS-021:** Best Practices guide
- **DOCS-022:** Editable Tables UX patterns
- **DOCS-023:** Known Issues documented

---

### 🐛 Fixes

- `.neon` removed from git tracking (local config)
- Lighthouse PWA assertions removed (deprecated v12+)
- `docs.md` trimmed to stay under 12KB
- `implement.md` condensed for size limits

---

## [2.0.0] - 2026-01-29

### 🏭 Factory 2.0 - Skills Architecture

Major refactor of the AI-first development infrastructure. Replaces agent-based architecture with skills-based approach for better modularity and context efficiency.

### Added

#### Skills System (`.gemini/skills/`)

- **Domain Skills:** `api/`, `db/`, `security/`, `testing/`, `ui/` — Domain-specific knowledge and patterns
- **Role Skills:** `discovery/`, `docs/`, `design/`, `backlog/`, `implement/`, `architect/`, `quality-engineer/` — Role-based behaviors with templates

#### Workflows (`.agent/workflows/`)

- `/start` — Session initialization with context loading
- `/discovery` — Product discovery, generates Discovery Brief
- `/docs` — Generate planning docs (01-05)
- `/design` — Generate 06_DESIGN.md with screens, flows, components
- `/backlog` — Create issues from design spec
- `/implement` — Execute issues through 5-phase pipeline
- `/park` — Capture ideas without interrupting flow
- `/audit` — Dynamic quality audit (R0-R3 tiers)
- `/consult-architect` — Technical decisions with ADRs
- `/consult-qe` — Quality review consultation

#### Documentation

- `docs/rules/AI_RULES.md` — SSOT for agent behavior
- `docs/rules/SSOT_HIERARCHY.md` — Document authority chain

### Changed

- Moved legacy agents/prompts to `.github/` for VS Code/Copilot compatibility
- Restructured templates into skill-specific locations
- Updated `copilot-instructions.md` as lightweight pointer to AI_RULES

### Removed

- Old agent files (now in `.github/agents/` as legacy)
- Redundant workflow files (`/bugfix`, `/refactor`, `/verify`, `/pause`, `/resume`)
- Old template structure (consolidated into skills)

### Migration

No breaking changes for existing projects. New workflows are additive.

---

## [1.1.0] — 2026-01-26

> 🚀 **Documentation, DX & Quality Improvements**

### Highlights

- Backlog Visualization: Auto-generated `BOARD.md` Kanban view
- Enhanced `/implement` traceability with detailed Implementation Notes
- Lighthouse CI integrated into `/audit-pre-release` workflow
- Documentation consolidation (removed duplicate QUICKSTART.md)
- SSOT cleanup: Factory owns process, Starter Kit owns product

### New Features

- **Sprint Board (`docs/backlog/BOARD.md`):** Auto-generated from issues via `pnpm update-board`
- **Implementation Notes:** Mandatory "Context & Decisions" section in issue closure
- **Lighthouse Assertions:** Pre-release workflow now validates LCP, CLS, TBT metrics

### Developer Experience

- `scripts/tools/update-board.ts` — CLI tool for board generation
- `lint-staged` hook auto-updates board when issues are modified
- ESLint config updated to allow `console.*` in scripts
- Dependencies updated (zod 4.3.6, vitest 4.0.18, playwright 1.58.0)

### Documentation

- Consolidated QUICKSTART.md into `docs/guides/getting-started.md`
- Fixed SSOT references in `docs/README.md`
- Added documentation link section to main README

### Factory Methodology

- Git Strategy defined (`main` → `dev` → `feat/*` branches)
- Audit workflow standardized (Workflow + Prompt pattern)
- Factory `seed/` cleaned: only process files, no product docs

---

## [1.0.0] — 2026-01-22

> 🎉 **First production-ready release of TimeKast Starter Kit**

### Starter Kit

#### Highlights

- Complete auth system: password, magic link, OAuth (Google/GitHub)
- Super admin auto-provisioning
- Password reset with secure tokens
- PWA support with offline mode
- 3-theme system (Light, Midnight, Dark)
- Logger utility with environment-aware logging
- 17 routes, 12 unit tests, 13 E2E tests

#### Dependencies

- Next.js 16.1.4
- NextAuth.js 5.0.0-beta.30
- Drizzle ORM 0.45.1
- sonner 2.0.7
- lucide-react 0.562.0
- @tailwindcss v4

#### Security

**ISSUE-SK-001:** Fixed password validation bypass en super admin authentication

- **Severidad:** CRITICAL — Complete authentication bypass
- **Archivos:** `lib/auth/super-admin.ts`, `lib/auth/auth.ts`
- **Cambios:**
  - Added `password` parameter to `handleSuperAdminAccess()`
  - Implemented password validation before granting super admin access
  - Updated `SuperAdminUser` type to include password field
  - Added `verifyPassword` function to options
- **Status:** ✅ Fixed

**esbuild vulnerability:** Resolved via pnpm override (>=0.25.0)

#### Sprint 2: Email & Password Reset

- Factory pattern for email providers (Resend, SMTP, none)
- Branded email templates with optional logo
- Test endpoint `/api/email/test` with rate limiting
- Secure token generation (SHA-256 hashed)
- One token per user, 1-hour expiration
- No user enumeration (consistent responses)
- Pre-built UI: `/forgot-password`, `/reset-password`

#### Sprint 3: PWA Features

- Native manifest via Next.js (`src/app/manifest.ts`)
- Service Worker with `next-pwa` (security-first caching)
- Install UX: toast (7-day cooldown) + iOS A2HS hint
- Offline UX: banner + `/offline` fallback page
- Update UX: "Nueva versión" toast with proper SW update flow
- Cache policy: API routes `NetworkOnly` by default
- Documentation: `CACHE_POLICY.md`, `PERFORMANCE.md`

#### Sprint 4: UI Polish & DX Improvements

- Table UI Redesign (Up&Up style layout)
- Logger utility (`lib/logger.ts`)
- Icon migration from `@heroicons/react` to `lucide-react`
- OAuth account linking (Google/GitHub link to existing email)
- Custom auth error page in Spanish
- Typography plugin for legal pages
- ESLint `no-console` rule
- Tailwind spacing tokens (min-w-10, min-h-50)

#### Schema Changes

- `users.isDeleted` (boolean) → `users.deletedAt` (timestamp)
- All timestamps now use `withTimezone: true`

---

## Factory Methodology

### 2026-01-19

**Created comprehensive backlog from test-auth-app learnings:**

- EPIC-SK-001: Starter Kit Critical Fixes (9 issues)
- EPIC-FACTORY-001: Factory Methodology Improvements (3 issues)
- Total: 12 issues documented

**Issues identified:**

- 2 P0 (Critical): Password validation, drizzle.config
- 7 P1 (Important): TypeScript warnings, UX improvements
- 3 P2 (Nice to have): Polish and DX improvements

---

## Previous Work

### 2026-01-18 - 2026-01-19

**Implemented complete auth system (ADR-007):**

- NextAuth.js v5 with credentials, OAuth (Google, GitHub)
- RBAC with 3-tier roles (SUPER_ADMIN, ADMIN, USER)
- Super admin auto-registration and promotion
- Database schema compatible with Drizzle adapter
- Build passes without DATABASE_URL (conditional adapter)

**Documentation centralized:**

- Created `seed/docs/` structure in Factory
- Updated CI/CD to sync docs to starter-kit
- Moved AUTH_SETUP.md to seed/docs (SSOT)

**Testing and validation:**

- Created test-auth-app project
- Found and documented 12 bugs/improvements
- Created LEARNINGS.md and parking-lot.md

---

_Factory changelog — gestión del proyecto y templates_

---
name: fx-extension-points
description: Factory-internal inventory of every extension point the kit exposes to a derived project: the dev-owned file or export behind each one, the kit file that invokes it, its add-never-replace limit and the profile it ships in; plus how to request a new one without forking. Invoke before editing or forking a kit-owned file under `.claude/`, `scripts/`, `.husky/` or `.github/workflows/`, or when asked how to customize without losing it on update. The CLI → fx-factory-cli; gates → fx-execution-policy.
family: factory-internal
last-verified: 2026-08-27
user-invocable: false
---

# fx-extension-points — Inventario de puntos de extensión del kit

> **Propósito:** ser la **fuente única** de qué puede customizar un proyecto derivado sin forkear un archivo del kit — qué archivo dev-owned (o export opcional) usa cada punto, qué archivo del kit lo invoca, hasta dónde llega, y en qué perfil de distribución está vivo.
>
> **Ships to derivatives via the `fx-*` glob** — viaja en los dos perfiles (`full` y `core`). Varios de los puntos que lista, en cambio, **solo existen en `full`** (§4).
>
> **Boundary:** la **regla** de qué es dev-owned y cuándo abrir un factory-ticket vive en [`CORE.md §5`](../../rules/CORE.md) — esta skill no la reenuncia, la instancia. El **procedimiento** de autoría de skills y hooks propios (namespaces, prefijos, hooks duplicados) vive en `.claude/docs/extending-the-kit.md` (Partes 1 y 2), que solo se distribuye en perfil `full`.

---

## §1 ¿Cuándo se auto-carga?

Routing semántico (CC.md §1.1). Triggers típicos:

- "necesito cambiar cómo corre el pre-commit / el runner de e2e / el preflight del kit"
- "¿puedo editar este archivo del kit?", "esto se me va a perder en el próximo update", "voy a forkear X"
- "quiero agregar un check propio", "quiero agregar una fase de e2e propia", "quiero un CI propio"
- Edición de cualquier archivo bajo `.claude/`, `scripts/`, `.husky/`, `.github/workflows/` o `vitest.setup.ts`

**NO se carga cuando:** vas a **autorar** una skill o un workflow del kit → `fx-skill-author` / `fx-workflow-authoring`. Ahí el archivo es del kit y lo estás construyendo, no extendiendo desde afuera.

---

## §2 Qué es un punto de extensión (y qué no)

Un punto de extensión es un lugar **declarado por el kit** donde tu código se engancha, con tres propiedades verificables:

1. **El archivo (o export) es tuyo, y `factory update` nunca lo pisa.** Lo que garantiza eso es que el archivo no esté en el set `track` del lockfile — casi siempre porque el Factory no lo shippea en ningún perfil, pero **no siempre**: `tests/e2e/visual-evidence.surfaces.ts` **sí** viaja en el tarball `full` (nace con el proyecto en `factory new`) y aun así el update jamás lo reescribe, porque `tests/**` no es un path trackeado (`BR-FACTORY-006`). La propiedad que importa es la segunda, no la primera; "el Factory no lo shippea" es el mecanismo más común, no la definición.
2. **Algo del kit lo invoca de verdad** — un `if -f`, un import dinámico, una llamada opcional. No es una convención de nombre a la espera de que alguien la lea. 🔴 **Y el invocador tiene que ser un archivo que VIAJE:** si quien carga tu archivo es a su vez dev-owned y congelado, el kit no invoca nada — es tu proyecto llamándose a sí mismo, y el punto no existe fuera de este checkout.
3. **Sólo puede sumar a su propio alcance, restarle, o reemplazar por nombre una entrada de un conjunto del kit — nunca alterar la cadena del kit.** El caso normal es **aditivo**: corren **al final** de la cadena del kit, o son reglas **encima** de su piso. Dos puntos **restan**, y los dos restan de un conjunto que es del kit: nombrar una variable en `env.project.json` la **quita** del envío (sin poder devolver ninguna que el kit ya protege), y `EXCLUDED_KIT_SURFACES` **quita** pantallas del kit de la matriz de capturas (declarando que esta app no las tiene, y quedando registrado en el manifest). Y hay una tercera forma, **acotada y con dos casos hoy, los dos en el harness visual**: **reemplazar por nombre** una entrada de un conjunto del kit — una entrada de `PROJECT_SURFACES` cuyo `name` repite el de una de `KIT_SURFACES` ocupa **su lugar** en la matriz (`mergeSurfaceLists`), para apuntar la misma pantalla a otra ruta; y una entrada de `PROJECT_VIEWPORTS` cuyo `name` repite el de uno de `VISUAL_VIEWPORTS` ocupa **su lugar** en el eje de anchos (`mergeViewports`), para fotografiar la banda donde el layout de **esa** app cambia. Reemplazar no es sumar ni restar, y por eso se nombra aparte en vez de dejarla pasar como "aditiva". Lo que **ninguna de las tres** permite es alterar los pasos con que el kit **procesa** esa entrada: insertar un paso en medio de los suyos, quitar uno, ni relajar lo que el kit exige de lo que sí se ejecuta.

**Lo que NO es un punto de extensión:** editar un archivo del kit "solo un poquito". Eso es un fork, y el update lo trata como drift — se pierde o entra en conflicto. Si necesitas algo que la tabla de §3 no cubre → §5, no el editor.

---

## §3 Inventario vivo

> **Esta tabla es la lista completa y es el único lugar donde vive.** Si vas a agregar un punto nuevo, se agrega **aquí**, no en un documento paralelo.

> ⚠️ **Columna `Perfil`:** `ambos` = funciona en los dos perfiles de distribución. `full` = el archivo del kit que lo invoca **no se distribuye** en perfil `core`, así que ahí el punto es **inerte** — el archivo dev-owned puedes crearlo, pero nadie lo va a cargar. Criterio de derivación en §4.

| Punto de extensión (dev-owned)              | Perfil  | Quién lo invoca (mecanismo real)                                                                                                                                                                                                                                                                                                                                | Límite real                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.husky/pre-commit.project`                 | `full`  | El `.husky/pre-commit` del kit lo corre con `sh` **al final**, si el archivo existe (guard `-f`)                                                                                                                                                                                                                                                                 | Solo **agrega pasos al final**: no puedes correr antes de un paso del kit ni quitar uno. Un exit no-cero aborta el commit (mismo contrato del kit)                                                                                                                                                                                                                                                                       |
| `vitest.setup.project.ts`                   | `full`  | El `vitest.setup.ts` del kit (kit-owned) lo importa dinámicamente **al final**, si existe. Detalle del hoisting de `vi.mock` → `sk-testing-nextjs`                                                                                                                                                                                                               | Se carga **último**, así que puedes sobrescribir lo que el kit dejó (incluidos sus mocks) — pero no correr antes ni eliminar un paso de su setup                                                                                                                                                                                                                                                                          |
| `.claude/skills/pj-*/`                      | `ambos` | Routing semántico de Claude Code; el `skill:lint` del pre-commit los **ignora** a propósito                                                                                                                                                                                                                                                                      | Se **suman** al catálogo: no reemplazan ni silencian una skill del kit. Para cambiar el comportamiento de una del kit → factory-ticket (§5), no fork                                                                                                                                                                                                                                                                      |
| `.claude/policy/quality-gates.project.json` | `ambos` | Override per-repo del registry de gates del kit (`.claude/policy/quality-gates.json`). El check `policy-registry` de `pnpm skill:lint` valida su forma (`when` + `risk` + `require`) y que solo endurezca — automáticamente en el pre-commit **solo en perfil `full`**: `.husky/**` no viaja a `core`, así que ahí el check existe pero hay que correrlo a mano (o desde tu propio CI). Los gates de cierre de `/implement` lo leen en runtime (unión kit ∪ override). Guía: `.claude/docs/retrofits/declare-project-sensitive-areas.md` | **Solo endurece, nunca relaja**: puede subir el `risk` de un path, sumar revisores al `require`, declarar áreas sensibles propias (pagos, PII, dominio del negocio) o **extender los path-sets** de la señal `combined-auth-schema` (`when.pathSets`, unión por nombre de conjunto — para una superficie de auth propia que las rutas del kit no cubren); no puede bajar un nivel ni quitar un revisor que el kit exige (una regla más floja es inerte por agregación → warning). En el bloque `review`, cualquier aflojamiento es **error** del linter. Un glob del override que **no encuentra ningún archivo** es un **warning** (la regla murió en silencio o su código no ha nacido — quien lo lee decide). Detalle → `fx-execution-policy §4.2` |
| `scripts/tools/e2e.project.ts`              | `full`  | El `scripts/tools/e2e-runner.ts` del kit lo carga **al final**, si existe: exporta por default un arreglo de fases E2E (`E2EPhase`) que corren **después** de las del kit, en el orden del archivo. Ver `sk-e2e §1.7`                                                                                                                                             | Solo **agrega fases al final**: no reordena las del kit ni quita ninguna. El proyecto de Playwright que declares tiene que existir en tu `playwright.config.ts` — si no, la corrida **falla** (no se salta). El `env()` de una fase se aplica **encima** del entorno de la corrida y no puede declarar `DATABASE_URL`, `PORT`, `NEXT_PUBLIC_APP_URL`, `NODE_OPTIONS` ni nada con prefijo `NEXT_PUBLIC_`                        |
| `scripts/tools/e2e.env.project.ts`          | `full`  | El mismo runner lo carga **una vez por corrida**, antes de la rama de Neon y del build. Exporta por default un objeto (o una función que lo devuelva) con hasta tres mitades — `build`, `server`, `playwright` — que se aplican **debajo de todas las fases**. Ver `sk-e2e §1.8`                                                                                   | Fija el entorno de la **corrida**, no de una fase (para eso está el `env()` de `e2e.project.ts`, que gana por ser más específico). Ninguna mitad puede declarar `DATABASE_URL`, `PORT`, `NEXT_PUBLIC_APP_URL`, `NODE_OPTIONS` ni `E2E_DISPOSABLE_BRANCH`. Las `NEXT_PUBLIC_*` **solo** en `build` (se hornean y entran al build stamp); en las otras dos el runner las rechaza porque no harían nada                          |
| `scripts/tools/preflight.project.ts`        | `full`  | El `scripts/tools/preflight.ts` del kit lo carga si existe: exporta por default un arreglo de checks (`CheckResult`: `name`, `tier`, `severity`, `summary`, `detail`) — o una función que lo devuelva — y esos checks se **anexan al final** de los del kit antes de calcular el verdicto. **Se carga y valida ANTES del barrido** (y se anexa al final): un archivo presente que no carga, o con un `severity` que el verdicto no sabe rankear, **corta la corrida** ahí mismo, en vez de tirar a la basura los seis checks del kit ya pagados. Nunca se salta en silencio | Solo **agrega checks al final**: no reordena los seis del kit ni quita ninguno (la función de carga ni siquiera recibe el arreglo del kit, así que no puede tocarlo). Un check tuyo `critical`/`high` deja el verdicto en `NOT-READY` con exit 1, por el mismo `verdict()` del kit — el peor severity de todos los checks manda; uno `warn` baja a `READY-WITH-WARNINGS`. Sin el archivo, el reporte es idéntico al de hoy |
| `getProjectEnvErrors` en `src/lib/env.ts`   | `full`  | El `scripts/tools/env-check.ts` del kit lo llama **al final**, si el módulo lo exporta. **No es un archivo hermano** — vive en tu app code, que ya es tuyo y que ese script ya importa. Contrato completo en §3.1                                                                                                                                                 | Solo **agrega errores de entorno propios** al final de los del kit: no puede quitar, reordenar ni relajar lo que el kit ya valida (esquema, secreto de auth, al menos un método de login). El primer mensaje no nulo corta la corrida con ese texto exacto. No exportarla es el caso normal y no produce warning                                                                                                            |
| `env.project.json` (raíz del repo)          | `ambos` | El **CLI publicado en npm** (`pnpm env:push` → `@timekast/factory env push`), no un archivo del perfil: lo **parsea** antes de armar el plan de subida y suma sus nombres a `PROVISION_OWNED`. La vía hermana es un comentario `# @per-env` en la línea de arriba de la variable en `.env.local`; cada corrida **agrega** al registro todo marcador que le falte (`--dry-run` no escribe). **Forma mínima, inline porque `SK.md` no existe en perfil `core`:** `{ "perEnv": ["NOMBRE_DE_VARIABLE"] }` (nombres, jamás valores) y, en `.env.local`, el marcador `# @per-env` en su **propia** línea, **arriba** de la variable, protegiendo **una sola** (la de la línea siguiente) y **consecutiva** — un comentario entremedio rompe el par y deja la variable sin proteger, así que la explicación va en la línea del marcador; el registro **solo se agrega**, nunca se limpia solo. Detalle → `SK.md §7.2` (perfil `full`) | Solo **resta** variables del envío: la protección es la **unión** registro ∪ marcador ∪ `PROVISION_OWNED`, así que nombrar una clave provision-owned no la devuelve al push. La reconciliación **solo agrega** — quitar el marcador NO desprotege, hay que editar el registro a mano. Es **datos, nunca un módulo** (el CLI corre compilado bajo node plano: un `*.project.ts` hermano tiraría `ERR_UNKNOWN_FILE_EXTENSION` en todo derivado). Va **commiteado**. Ilegible / JSON inválido / forma inválida → **aborta el push**; ausente = vacío legítimo, sin mensaje |
| `.github/workflows/ci.project.yml`          | `ambos` | **GitHub**, no el kit: ejecuta todos los workflows del directorio. Del lado del Factory, un archivo que no está en ningún manifest de distribución cae en `ignoreLocal` y `factory update` lo deja intacto. Detalle en §3.2                                                                                                                                       | Corre **en paralelo** al CI del kit (si tu perfil lo trae): no puede insertar un job dentro de su pipeline, ni saltarse uno suyo. El nombre no es mágico — cualquier nombre que no colisione con uno del kit sirve                                                                                                                                                                                                        |
| `tests/e2e/visual-evidence.surfaces.ts`     | `full`  | `scripts/tools/visual-evidence/project-surfaces.ts` — **un archivo del kit, en un path trackeado**: comprueba que exista (`existsSync`) y lo carga con un `createRequire` lazy, y `capture.ts` consume las dos listas al componer la matriz. Ausente = las cuatro pantallas del kit son toda la matriz, sin aviso (el estado normal de un derivado que aún no adoptó el harness). Presente y no cargable = **corta la corrida** nombrando el archivo, nunca un skip silencioso. 🔴 El spec (`tests/e2e/visual.evidence.spec.ts`) y el `playwright.config.ts` **también** son del proyecto, pero **no** son el invocador — si lo fueran, el punto fallaría la propiedad 2 de §2 | Cuatro exports con límites distintos. `PROJECT_SURFACES` **agrega** pantallas (y una cuyo `name` repite el de una del kit la **reemplaza en su lugar**, para apuntarla a otra ruta); una entrada suya puede llevar `prepare` — **la única pieza de comportamiento del punto, y sólo aquí**: la lista del kit es datos y `mergeSurfaceLists` rechaza un `prepare` en ella (`fx-visual-evidence §4.2`). `EXCLUDED_KIT_SURFACES` es **SUSTRACTIVO**: quita pantallas del kit de la matriz, y una exclusión que no corresponde a ninguna se **reporta** en el manifest (`staleExclusions`) en vez de matar la corrida. `PROJECT_VIEWPORTS` **agrega** anchos al eje del kit (375 / 768 / 1440), y uno cuyo `name` repite el de uno del kit lo **reemplaza en su lugar** — el ancho intermedio depende de dónde cambia el layout de cada app, así que es del proyecto; no tiene mitad sustractiva. `EXCLUDED_CONTRAST_SELECTORS` **declara** texto decorativo que el barrido de contraste no mide (`notApplicable` en el manifest, contado con su clase y con los selectores tal cual): es una declaración que viaja al manifest para que `ui-critic` la lea, no una forma de bajar el umbral. Ninguno de los cuatro toca los pasos ordenados de la captura (su número vive en [`fx-visual-evidence §7`](../fx-visual-evidence/SKILL.md), que es su dueño y nombra el archivo donde está el orden) ni los temas (salen del registro del skin activo). Detalle → [`fx-visual-evidence`](../fx-visual-evidence/SKILL.md) §4 |
| `.claude/adapters.project.json`             | `ambos` | `scripts/tools/generate-agent-adapters.mjs` — el generador de los adapters multi-runtime (`AGENTS.md`, `.cursor/rules/timekast.mdc`, `.github/copilot-instructions.md`, `.hermes.md`) lo **parsea** antes de generar nada. El generador está en la allowlist de `core`, así que viaja a los dos perfiles; lo que **solo** existe en `full` es quien lo dispara en cada commit (`.husky/pre-commit`) — en `core` se corre a mano o desde tu propio CI. **Forma:** `{ "disabled": ["cursor", "hermes"] }` (runtimes válidos: `codex` · `cursor` · `copilot` · `hermes`) | Solo **desactiva outputs por runtime**: no cambia qué rules se proyectan, ni el orden, ni el contenido de un adapter. Gobierna la **generación, nunca el borrado** — un output ya en disco se deja tal cual y se reporta. Es **datos, nunca un módulo**. Ausente = el caso normal, sin mensaje; JSON inválido o forma inválida → **falla con exit 1** (ignorarlo generaría justo lo que el archivo desactiva); un runtime desconocido es solo un **warning**. Un output en disco **sin** el marcador `@generated by …` es del proyecto y tampoco se toca, pero eso lo decide el marcador, no este archivo |
| `scripts/tools/__tests__/`                  | `ambos` | **Nadie del kit** — esa carpeta está excluida de los dos perfiles: no se shippea ni se actualiza. Lo que pongas ahí lo recoge el `vitest.config.ts` de tu repo (glob `**/*.test.ts`)                                                                                                                                                                             | Es **espacio libre**, no un punto de extensión: no engancha con nada. Un test tuyo sobre código del kit se rompe cuando el kit cambie ese código (`CORE.md §5`: prueba tu código, no el suyo)                                                                                                                                                                                                                             |

> **Las dos últimas filas dicen cosas opuestas y conviene no confundirlas.** `tests/e2e/visual-evidence.surfaces.ts` es un punto de extensión de verdad: hay un archivo del kit que lo busca y lo carga, y lo que declares ahí cambia lo que el harness hace. `scripts/tools/__tests__/` está en la tabla justamente para decir que **no** lo es — nadie del kit mira esa carpeta, así que lo que pongas ahí no engancha con nada. Las dos viven en territorio que el update no toca; sólo una tiene alguien del otro lado.

### §3.1 Preflights de entorno propios → `getProjectEnvErrors` en `src/lib/env.ts`

`pnpm env:check` valida el esquema del kit: que las variables declaradas parseen, que exista el secreto de auth, que haya al menos un método de login. Un derivado casi siempre necesita **además** lo suyo — que el material de firma esté presente donde su consola de operación corre, que dos credenciales no colisionen, que una postura de seguridad sea coherente.

🔴 **`scripts/tools/env-check.ts` es del kit.** Editarlo te cuesta un conflicto en **cada** `factory update`, para siempre, y te deja fuera de las mejoras que ese script reciba. No lo edites.

**En vez de eso, exporta una función opcional desde `src/lib/env.ts`** — un archivo que es **tuyo** (nace congelado en `factory new`) y que el script del kit **ya importa**:

```ts
// src/lib/env.ts — tu app code
export function getProjectEnvErrors(env: Env): (string | null)[] {
  return [
    getMfaPostureError({ platformOpsHost: env.PLATFORM_OPS_HOST, mfaEnabled: isMfaEnabled() }),
    getSigningMaterialError({
      platformOpsHost: env.PLATFORM_OPS_HOST,
      privatePem: env.SIGNING_KEY_PRIVATE_PEM,
    }),
  ];
}
```

**El contrato, en tres líneas:**

- Devuelve **un mensaje por check que falló** y `null` por cada uno que pasó. El primer mensaje corta la corrida con ese texto exacto.
- **Puro y sin base de datos.** Corre desde el CLI, sin servidor y sin Neon — lee el env ya parseado y nada más. Un check que necesita la DB va en un guard de runtime, no aquí.
- **Síncrono o `async`**, los dos funcionan.

**No exportarla es el caso normal**, y no produce warning: la mayoría de los derivados nunca la necesita.

> **Por qué aquí y no en un `env-check.project.ts` hermano.** Los checks pertenecen al lado del esquema que validan, ese módulo ya es tuyo, y el script del kit ya lo importa. Un archivo puente solo re-llamaría funciones que de todos modos viven en `env.ts`, y partiría tu lógica en dos lugares.

### §3.2 CI propio → `ci.project.yml` (no hace falta que el kit haga nada)

Si necesitas un workflow de CI propio, créalo como archivo aparte en `.github/workflows/` (por ejemplo `ci.project.yml`) y GitHub lo corre solo: **GitHub ejecuta todos los workflows del directorio**, no solo los que el kit shippea. Del lado del kit, un archivo que no está en ningún manifest de distribución cae en `ignoreLocal` — `factory update` lo deja intacto, no lo sobrescribe ni lo borra. Funciona hoy sin wiring adicional.

> **Por qué NO se usa `workflow_call`.** La alternativa sería que el `ci.yml` del kit invocara tu workflow como reusable. No se hace: si el archivo referenciado no existe —el caso normal, porque casi ningún proyecto tiene uno— **GitHub falla el run entero**, no el paso. Un punto de extensión opcional no puede romper el CI de quien no lo usa.

---

## §4 Perfil de distribución — de dónde sale la columna `Perfil`

El Factory se distribuye en dos perfiles: **`full`** (el boilerplate completo) y **`core`** (solo el cerebro de metodología, sin `src/`, sin `sk-*`, sin `SK.md`). El manifest es `distribution/profiles.json`, y el perfil `core` es una **allowlist explícita** (`profiles.core.include`), no un denylist.

**La regla de derivación, mecánica y verificable:** un punto de extensión es `ambos` cuando el mecanismo que lo invoca **no depende de un archivo del kit ausente en `core`** — porque el invocador está bajo `profiles.core.include`, o porque el invocador no es un archivo del kit distribuido por perfil (el runtime de Claude Code, GitHub Actions, el CLI publicado en npm). Es `full` cuando su archivo anfitrión cae fuera de esa allowlist.

```bash
# Comprobar un punto: ¿qué archivo del kit lo invoca, y está en la allowlist de core?
jq -r '.profiles.core.include[]' distribution/profiles.json
jq -r '.profiles.core.exclude[]' distribution/profiles.json
```

**Qué significa `full` en la práctica:** en un derivado `core` puedes crear el archivo dev-owned y no pasa nada — nadie lo carga, nadie avisa. La ausencia se **declara**, nunca se reporta como disponible; es la misma disciplina que `SK.md §3.4` aplica al harness de evidencia visual. Si tu proyecto es `core` y necesitas uno de esos puntos, la respuesta no es forkear: es §5.

---

## §5 No hay punto de extensión para lo que necesitas

### 5.1 Antes de concluir que no existe

1. Relee la tabla de §3 buscando por **el archivo del kit que querías editar**, no por tu caso de uso — varios puntos tienen nombre poco obvio.
2. Si tu cambio es una **regla o un gate de calidad** (subir el escrutinio de un path, sumar un revisor), casi siempre cabe en `.claude/policy/quality-gates.project.json`, que ya está en la tabla.
3. Si tu cambio es un **paso extra al commitear**, cabe en `.husky/pre-commit.project`.

### 5.2 Cómo pedir uno nuevo (factory-ticket)

`CORE.md §5` lo dice en una línea: archivo del kit **sin** punto de extensión → factory-ticket, nunca fork local. Lo que hace útil al ticket:

- **Qué archivo del kit** querías editar (path exacto) y **qué querías lograr** (el efecto, no el diff).
- **Por qué ningún punto actual alcanza** — cuál miraste y en qué se queda corto.
- **Qué forma tendría el punto.** El kit tiene **tres** formas canónicas y conviene proponer una:

  | Forma                       | Qué es                                                                                        | Ejemplo vivo                                            |
  | --------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
  | **Hermano-módulo `*.project.ts`** | Un archivo hermano que el artefacto del kit **importa** al final si existe                | `scripts/tools/e2e.project.ts`, `preflight.project.ts`  |
  | **Export opcional**         | Una función opcional en un módulo que ya es tuyo y que el kit ya importa (§3.1)                | `getProjectEnvErrors` en `src/lib/env.ts`               |
  | **Hermano-datos `*.project.json`** | Un archivo de **datos** que el artefacto **parsea** (no importa) — normalmente al principio | `env.project.json`, `quality-gates.project.json`        |

  🔴 **La pregunta que decide es _quién lo carga_, no dónde vive.** Un **script del kit corriendo bajo `tsx`** puede importar un `.ts` → hermano-módulo. El **CLI publicado en npm** corre **compilado, bajo `node` pelado** (`tsx` es solo devDependency), así que un `*.project.ts` hermano tiraría `ERR_UNKNOWN_FILE_EXTENSION` en **todo** derivado → tiene que ser **datos**. Proponer la forma equivocada es la manera más rápida de que el punto nazca roto.
- **Qué pasa si el archivo no existe** — la respuesta correcta siempre es "nada, el comportamiento es idéntico al de hoy".

### 5.3 Qué hacer mientras tanto — sin forkear

En este orden, del más seguro al menos:

1. **Envuelve desde afuera.** `package.json` **no** es un archivo trackeado por el kit (los trackeados son `.claude/**`, `scripts/**`, `.husky/**`, `.github/workflows/**` y `vitest.setup.ts`; `CLAUDE.md` está en el scope trackeado pero es **dev-owned** — el update lo **preserva**, `CORE.md §5`), así que un script tuyo que invoque el del kit y encadene tu paso después sobrevive todos los updates. Es la vía más barata y la que más veces alcanza.
2. **Mueve el requisito a una capa que sí es tuya.** Un guard en tu app code, un check en `getProjectEnvErrors`, una regla en el override de gates. Si el efecto que buscas se puede expresar ahí, no necesitas tocar el kit.
3. **Declara la limitación en vez de simularla.** Si no hay forma, la respuesta honesta es dejar el hueco visible (un `pj-*` que documente el gap, una nota en el PR) — no un fork silencioso que se vea verde.
4. **Fork como último recurso, y anotado.** Si de verdad no hay alternativa mientras el ticket avanza: el diff más chico posible, en **un** archivo, y corre `factory update --verify` en cada actualización — reporta el drift disco↔lockfile sin modificar nada, así el fork sale a la luz en vez de perderse en silencio.

---

## §6 Checklist antes de forkear un archivo del kit

- [ ] Busqué el archivo del kit en la tabla de §3 (por path, no por caso de uso)
- [ ] Verifiqué el **perfil** de mi proyecto: si es `core`, los puntos marcados `full` no aplican (§4)
- [ ] Descarté envolver desde afuera (§5.3.1) y mover el requisito a mi capa (§5.3.2)
- [ ] Si no hay punto → abrí el factory-ticket con los cuatro datos de §5.2 **antes** de editar
- [ ] Si el fork es inevitable: es de un solo archivo, mínimo, y `factory update --verify` lo va a reportar

---

## §7 Boundary

| Si vas a…                                                                | Usa en su lugar…                                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Crear tu propia skill (`pj-*` o personal) o revisar tus hooks duplicados | El **procedimiento** de `.claude/docs/extending-the-kit.md`, Partes 1 y 2 (perfil `full`)        |
| Autorar una skill o un workflow **del kit**                              | `fx-skill-author` / `fx-workflow-authoring`                                                     |
| Entender qué endurece y qué no el override de gates                      | `fx-execution-policy`                                                                            |
| Correr o depurar `factory update` / `status` / `doctor`                  | `fx-factory-cli`                                                                                 |
| Escribir la fase de e2e o el setup de Vitest que vas a enganchar         | `sk-e2e` / `sk-testing-nextjs`                                                                   |
| Decidir si un archivo es tuyo o del kit                                  | `CORE.md §5` — es la regla always-on; esta skill solo la instancia                               |

---

_TimeKast Factory — fx-extension-points (inventario de puntos de extensión del kit, factory-internal)_

# SK — Starter Kit Rules

> Reglas del TimeKast Starter Kit. Extiende `CORE.md`.
> Stack: Drizzle ORM + Next.js. Assets: `INVENTORY.md`, `CODEBASE.md`, `HOOKS.md`, `SCHEMA.md`, `API.md`, pipeline de docs Factory.
> Qué del kit puedes editar y qué no (archivos trackeados, puntos de extensión, factory-ticket) → `CORE.md §5 Frontera kit ↔ derivado`.

---

## 1. Database

#### 1.1 🔴 NUNCA ejecutar db:push sin consentimiento

```
⭐ PREFERIDO: pnpm db:generate → pnpm db:migrate (seguro, reversible)
❌ PROHIBIDO: pnpm db:push sin aprobación
✅ SI es necesario: mostrar --dry-run → ESPERAR confirmación
```

#### 1.2 🔴 NUNCA tocar a mano snapshots/journal ni el DDL generado

> Daño real: drizzle-kit calcula el diff contra los **snapshots** de `meta/`, no contra el `.sql`. Editar un snapshot o `_journal.json` desincroniza el diffing → la próxima `pnpm db:generate` produce diffs corruptos (drops accidentales, columnas duplicadas). Reescribir el **DDL** generado (shape de tabla/columna/tipo en el `.sql`) crea drift estructura↔snapshot → el schema TS deja de ser SSOT. En cambio, **augmentar** un `.sql` con **DML** (backfill/seed/guard) NO toca el snapshot → es seguro; el propio kit lo hace en `pnpm db:harden-enum`.

```
❌ PROHIBIDO: Editar src/lib/db/migrations/meta/_journal.json ni los snapshots a mano (estado interno del diff engine)
❌ PROHIBIDO: Reescribir a mano el DDL generado (ALTER/CREATE de tabla/columna/tipo) → la estructura sale del schema TS, no del .sql
❌ PROHIBIDO: Crear un .sql de migration fuera del tooling (sin entrada en el journal → drizzle nunca lo aplica)
✅ DDL: src/lib/db/schema/*.ts → pnpm db:generate → revisar SQL → pnpm db:migrate. DDL generado no deseado → ajustar el schema TS, NO el SQL
✅ PERMITIDO (DML): augmentar pre-apply y aditivamente un .sql generado con data migration (INSERT/UPDATE/backfill) o guards — no afecta snapshot ni SSOT (los datos nunca vivieron en el schema TS)
✅ PERMITIDO (custom net-new): pnpm db:generate --custom genera una migration de solo-datos — drizzle-kit crea el .sql vacío (lo llenas con DML) Y escribe journal + snapshot por su cuenta. El snapshot lo escribe el tool, no tú → sigue siendo seguro
ℹ️  Heurística: cambia la ESTRUCTURA (tipo/columna/tabla) → schema TS + db:generate, nunca a mano en el .sql. Solo mueve/valida DATOS (backfill/seed/guard) → augmentar pre-apply. Un guard lleva SELECT + RAISE, nunca DDL nuevo
ℹ️  Una migration ya aplicada en otro entorno NUNCA se edita: crear una nueva que corrija
```

#### 1.3 SSOT Code

```
✅ OBLIGATORIO: src/lib/db/schema/*.ts es la fuente de verdad del modelo de datos
✅ OBLIGATORIO: Validaciones Zod derivan del schema, nunca al revés
✅ OBLIGATORIO: One-file-per-domain + enums como text() + constantes en config/ — detalle en sk-db §1
```

#### 1.4 🔴 SIEMPRE usar `pnpm db:query` para polling/inspección de DB

```
❌ PROHIBIDO: Scripts ad-hoc con dotenv/require/tsx + @neondatabase/serverless para consultar la DB
❌ PROHIBIDO: Inventar marometas para cargar DATABASE_URL en one-shots (de la bóveda o, sin bóveda, de .env.local)
✅ OBLIGATORIO: pnpm db:query "SELECT ..."          # read-only, DB de DEVELOP (default)
✅ OBLIGATORIO: pnpm db:query:dev "SELECT ..."      # alias explícito de develop
✅ OBLIGATORIO: pnpm db:query:main "SELECT ..."     # DB de PRODUCCIÓN (main) — read-only
✅ OBLIGATORIO: pnpm db:query --tables              # listar tablas
✅ OBLIGATORIO: pnpm db:query --describe <tabla>    # describir schema
✅ OBLIGATORIO: pnpm db:query --json "..."          # output JSON para pipes
ℹ️  El runner bloquea writes (INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE/GRANT/REVOKE)
ℹ️  Env loading, pool y read-only guard ya resueltos en scripts/tools/db-query.ts
```

> **DB dual main/develop:** Neon queda con dos branches — **develop** (el default de todo el
> trabajo local: `db:query`, `db:migrate`, `db:seed`) y **main** (producción, que SOLO lee
> `db:query:main`). Default = develop a propósito: nunca tocas producción sin pedirlo explícito.
> De dónde sale cada cadena depende del repo:
>
> - **Con bóveda** (bloque `vault` en `.timekast/provision.json`): no hay `.env.local` ni
>   `DATABASE_URL_MAIN`; las cadenas llegan por el wrapper → `fx-secrets-vault §7`.
> - **Sin bóveda** (`--no-vault`, o un repo que nació antes de la bóveda y no la adoptó):
>   `factory provision` escribe un `.env.local` (gitignored) con `DATABASE_URL` (develop) y
>   `DATABASE_URL_MAIN` (main, que `db:query:main` lee con `--main`).
>
> Las migraciones corren en cada deploy, en el destino del repo: en Vercel, en su build
> (`vercel-build`: `pnpm build && pnpm db:migrate`); en Railway, en el pre-deploy
> (`TK_VAULT=off pnpm db:migrate`), que corre después del build. En los dos, un deploy de `main`
> migra producción y uno de `develop` migra develop — gateado natural (si el build o la migración
> fallan, el deployment queda en error y no se promueve). No hay GitHub Action de migración.
> Detalle de Railway → `tk-provision`.
>
> 🔴 **El build va PRIMERO, y el orden es el punto** (en Railway lo garantiza la plataforma: el pre-deploy corre sobre un build ya terminado). El kit shippeó `db:migrate && build` hasta
> v12, con la razón registrada de que un `migrate` fallido impide el build. Esa protección se
> conserva entera —Vercel gatea por el exit code del comando completo, no por el orden de sus dos
> mitades—, pero solo contemplaba que fallara la migración. El caso espejo rompió producción de un
> derivado: la migración **funciona**, el build falla después, Vercel no promueve el deployment, y
> el alias de producción sigue sirviendo el build anterior contra una base que ya se movió al
> schema nuevo. Un rollback de deployment no lo deshace, porque el cambio de schema no es parte del
> deployment. Con el build primero, un build fallido no llega a tocar la base. Un derivado que
> nació con el orden viejo lo recibe corregido en su próximo `factory update` (`healVercelBuildOrder`
> en el CLI: solo reescribe el valor que el kit shippeó, nunca uno que el equipo haya customizado).

**Para writes (migraciones):** usar `pnpm db:generate` + `pnpm db:migrate` (ver §1.1). Nunca un script one-shot.

---

## 2. Code Reuse

#### 2.1 Consultar INVENTORY antes de crear

```
❌ PROHIBIDO: Crear componente/hook/action/tabla/endpoint sin verificar si existe
✅ OBLIGATORIO:
   1. Consultar project/reference/INVENTORY.md (componentes)
   2. Consultar project/reference/HOOKS.md      (hooks / action helpers / DB helpers / form kit / UI wrappers)
   3. Consultar project/reference/SCHEMA.md     (modelo de datos as-built — antes de crear tabla/columna; refuerza CODING.md §8)
   4. Consultar project/reference/API.md        (server actions + route handlers as-built — antes de crear un endpoint/action)
   5. Si existe algo similar → reutilizar o extender
   6. Si es nuevo → se agregará en la siguiente regeneración autogen (pre-commit)
ℹ️  Los cuatro son autogenerados (`pnpm generate:inventory`, `:hooks`, `:schema`, `:api`)
    y se actualizan en el pre-commit hook — no editar a mano.
ℹ️  El 5º autogen, CODEBASE.md (mapa de dependencias), se consulta en §2.2 antes de
    *modificar* un archivo — no de crear. Por eso no está en esta lista.
```

#### 2.2 File Dependency Awareness

**Antes de modificar CUALQUIER archivo:**

1. Consultar `project/reference/CODEBASE.md` → File Dependencies
2. Identificar archivos dependientes
3. Actualizar TODOS los archivos afectados juntos

#### 2.3 Server Action helpers — `withAuth()` / `withSelf()`

El kit shippea dos wrappers en `src/lib/actions/helpers.ts` que eliminan boilerplate en server actions (auth + validación + revalidación).

```
✅ withAuth()  → actions con RBAC (admin CRUD, gated por resource/action)
✅ withSelf()  → actions self-service (usuario modifica su propia data)
❌ PROHIBIDO: Reescribir auth + zod parsing + revalidatePath a mano
❌ PROHIBIDO: Usar withAuth() para self-service (bypasea el check de RBAC)
```

**Ejemplo mínimo:**

```ts
// Admin — requiere permission check
export const createThing = (input: unknown) =>
  withAuth(
    { resource: 'things', action: 'create', schema, revalidate: '/things' },
    input,
    async (data, userId) => {
      /* ... */
    }
  );

// Self-service — solo auth
export const updateProfile = (formData: FormData) =>
  withSelf({ schema, revalidate: '/profile' }, formData, async (data, userId) => {
    /* ... */
  });
```

> Anti-pattern: invocar `auth()` + `requirePermission()` + `safeParse()` manualmente en cada action. El wrapper existe para eso.

#### 2.4 Path alias `@/`

```
✅ OBLIGATORIO: Imports con `@/` → resolver a `src/` (tsconfig del kit)
❌ PROHIBIDO: Imports relativos con ../../ que crucen más de un nivel
```

---

## 3. UI / Frontend

#### 3.1 Filtros en cascada por defecto (tablas client-side con 2+ filtros)

```
❌ PROHIBIDO: Hardcodear opciones de filtro estáticas cuando hay 2+ filtros
✅ OBLIGATORIO: Cada filtro calcula opciones del subconjunto filtrado por los OTROS
   Solo desactivar si el issue lo especifica EXPLÍCITAMENTE
   Ver `sk-crud-scaffold` § Cascading Filters (o `sk-ui` §1.5)
```

#### 3.2 🔴 Mobile-first 375px baseline + 100% responsive

> Política TimeKast durable — no per-project. La mayoría del tráfico es mobile nativo; diseñar desktop-first y "adaptar" es retrabajo garantizado.

```
✅ OBLIGATORIO: Diseñar desde 375px (iPhone SE baseline) hacia arriba
✅ OBLIGATORIO: Toda pantalla debe ser 100% usable en mobile sin horizontal scroll
✅ OBLIGATORIO: Tailwind breakpoints ASCENDENTES (sm:, md:, lg: encima del base mobile)
❌ PROHIBIDO: Descriptores `max-w-*` sin alternativa mobile
❌ PROHIBIDO: Desktop-only components (tablas con 8+ cols sin variante mobile)
ℹ️  Opt-out permitido SOLO si el issue lo declara explícitamente (ej: admin dashboard desktop-only)
```

#### 3.3 `components/ui/` mezcla DOS clases de archivo — el criterio es el ARCHIVO, no la carpeta

> 🔴 **Enunciado canónico del kit.** Toda skill que hable de primitivas (`sk-ui`, `sk-tokens-neomorphism`,
> `sk-notifications`, `sk-pwa`, `sk-project-structure`, `sk-testing-nextjs`) **cita esta sección**; ninguna la
> reescribe con sus propias palabras — repetir el corte en seis lugares es lo que volvió falsa la versión anterior.

`src/components/ui/` contiene **primitivas de terceros** que el kit adoptó (shadcn / Radix / `cmdk` / `sonner`) **y
componentes propios del kit** que nacieron ahí. La carpeta no los distingue; la prueba se aplica **leyendo el
archivo**, sin conocer su historia:

```
¿Quién DECLARA el contrato de props del componente? (una pregunta, dos respuestas posibles)

 · El archivo DECLARA SU PROPIO contrato: una interface/type de props escrita EN ESE ARCHIVO,
   exportada o no — da igual (export interface TableProps · interface BadgeProps),
   pero CON NOMBRE: una anotación anónima en la firma
   (}: React.ComponentProps<'button'> & { asChild?: boolean }) NO es declarar —
   es extender el contrato prestado, y sigue siendo rama 2 (button.tsx)
   → COMPONENTE PROPIO DEL KIT — vive en ui/ por convención de origen, no por ser de terceros

 · El archivo NO declara contrato propio: el tipo VIENE DE AGUAS ARRIBA, directo o vía alias
   (React.ComponentProps<'input'> · React.ComponentProps<typeof X.Root> ·
    type ToasterProps = React.ComponentProps<typeof Sonner>)
   → PRIMITIVA DE TERCEROS
       · ADAPTADA por el kit  → lleva tokens de skin (--elevation-*, surface-*), variantes/tamaños
                                que aguas arriba no existen, o configura la primitiva (sonner.tsx)
       · SIN ADAPTAR         → no lleva nada de eso
```

🔴 **`export` es superficie de módulo, no autoría — por eso la rama 1 dice DECLARA y no EXPORTA.**
Seis archivos del kit (`avatar`, `badge`, `breadcrumb`, `confirm-dialog`, `pagination`, `skeleton`)
declaran su interfaz sin exportarla: con el operador `export` no caían en ninguna rama, y el
fallback natural era la carpeta — la heurística falsa que esta sección existe para retirar.

ℹ️  **El CUERPO no clasifica, sólo describe.** Lo típico de una primitiva de terceros es que el
cuerpo se limite a clases + `data-slot` + `...props`, pero no es condición: `sonner.tsx` elige la
posición del toast según el puntero y exporta una constante de estilo, y sigue siendo de terceros
porque su contrato de props es prestado. La pregunta es **quién declara el contrato**, y nada más.

ℹ️  **Desempate (hoy sin caso en el kit):** un archivo que declara interfaz propia **y** la extiende
de un tipo de aguas arriba (`interface FooProps extends React.ComponentProps<'div'>`) cae en la
rama 1 — el contrato público es el suyo.

```
✅ OBLIGATORIO: Componer con las primitivas de terceros, no modificarlas
✅ OBLIGATORIO: Un componente nuevo TUYO nunca nace en ui/ → src/components/common/ o src/components/{dominio}/
✅ PERMITIDO: Editar un componente propio del kit que vive en ui/ (el sistema de tablas es el caso vivo) —
   no es forkear código ajeno, y el backlog puede mandarlo
❌ PROHIBIDO: Agregar lógica de negocio a una primitiva de terceros
ℹ️  Si una primitiva de terceros no cubre el caso → wrapper en common/, no fork de ui/
```

**Adaptar una primitiva de terceros se lee distinto según dónde estés:**

| Dónde                                  | Qué es editarla                                          | Por qué                                                                                                                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **En el Factory** (`is_factory: true`) | **Mantenimiento del kit** — vía normal, no un fork      | El kit es el autor de la adaptación: así `input.tsx` y `button.tsx` llevan los tokens del skin encima, y así los heredan los derivados                                                                                                                              |
| **En un derivado**                     | Un **fork** — la salida es componer o envolver en `common/` | `src/` nació congelado y `factory update` **no** lo toca (BR-FACTORY-006), así que nadie te pisa el archivo: el costo es la divergencia — `npx shadcn add <componente>` sí lo reescribe, y cada corrección aguas arriba pasa a ser merge manual |

ℹ️  Perfil `core`: ni esta regla ni `src/` viajan ahí (`fx-extension-points §4`) — no hay primitivas del kit
que clasificar, así que el enunciado canónico vive aquí, en la regla always-on del perfil que sí las shippea.

#### 3.4 Cambio visual → la evidencia se produce, no se afirma

```
✅ OBLIGATORIO: para demostrar que un cambio visual funciona en TODOS los temas y anchos →
   `pnpm evidence:visual` (harness `fx-visual-evidence`): captura cada superficie declarada ×
   cada tema del skin activo × 3 anchos (375 / 768 / 1440) y mide contraste sobre el DOM vivo
❌ PROHIBIDO: declarar "verificado en todos los temas" sin capturas — `ui-critic` reporta DS4
   (multi-theme) como "no demostrado", nunca Pass, cuando no recibe el manifest de evidencia
ℹ️  Es una fase opt-in del runner de e2e (§4.1): nunca se invoca Playwright por fuera — el candado
    de la rama efímera no gana excepciones. Detalle → skill `fx-visual-evidence`
ℹ️  Perfil `core`, o un proyecto que aún no declaró la fase → el harness no corre ahí y la
    degradación es explícita, nunca un Pass implícito. Adopción →
    `.claude/docs/retrofits/visual-evidence-adoption.md`
```

---

## 4. QA

#### 4.1 Comandos core

| Herramienta      | Cuándo                                            |
| ---------------- | ------------------------------------------------- |
| `pnpm lint`      | Cada cambio de código                             |
| `pnpm typecheck` | Cada cambio de código                             |
| `pnpm test`      | Después de cambio lógico (Unit + Component)       |
| `pnpm test:e2e`  | Antes de deploy                                   |
| `pnpm verify`    | La compuerta de calidad — script (`scripts/tools/verify.mjs`) que corre lint → typecheck → test en orden, fail-fast; NO un alias `&&` de `package.json` |
| `pnpm verify:quick` | Bucle de trabajo, **NO la compuerta** — acota lint+tests a lo que cambió, typecheck completo. Úsalo entre vueltas de fix; cerrar exige `pnpm verify` completo |
| `pnpm evidence:visual` | Evidencia visual renderizada (§3.4) — fase **opt-in** del runner de e2e; produce capturas + manifest para `ui-critic`. No corre en un `pnpm test:e2e` normal |
| `pnpm db:query`  | Inspección read-only de DB (ver §1.4 — único way) |

> Utilitarios (`format`, `knip`, `env:check`, `analyze`, etc.) en `package.json` — no son always-on del agente.

#### 4.2 Pirámide de testing (3 capas)

`pnpm test` ejecuta Unit + Component. `pnpm test:e2e` ejecuta E2E.

| Capa          | Runner               | Ubicación                  | Cuándo usar                                                                   |
| ------------- | -------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| **Unit**      | Vitest (node/jsdom)  | `tests/unit/*.test.ts`     | Funciones puras, helpers, validaciones Zod, lógica de dominio sin React       |
| **Component** | Vitest + RTL (jsdom) | `tests/unit/**/*.test.tsx` | Componentes con interacción: render + `userEvent` + assertions sobre DOM real |
| **E2E**       | Playwright           | `tests/e2e/*.spec.ts`      | Flujos completos con app real (auth, RBAC routes, integración DB)             |

```
❌ PROHIBIDO: test shallow (`expect(Component).toBeDefined()`) — no detecta onClick rotos,
              conditional renders, ni bindings de estado
✅ OBLIGATORIO: issue con UI interactiva → component test con RTL
✅ OBLIGATORIO: issue con flujo cross-page o auth → E2E
✅ RTL imports: `@testing-library/react` + `@testing-library/user-event` + matchers de
                `@testing-library/jest-dom/vitest` (cargados vía `vitest.setup.ts`)
ℹ️  No hay capa "integration": una action que toca la DB se prueba como Unit con el
    cliente Drizzle mockeado (`sk-testing-nextjs`); la DB real solo se ejercita en E2E
```

#### 4.3 Disciplina eslint / TypeScript

El kit es TypeScript-first. Estas reglas aplican a todo proyecto derivado (mismo stack).

```
✅ Unused vars → prefijo `_` (convención eslint estándar: `_unusedArg`)
✅ Consistencia de tipos: preferir `type` para aliases, `interface` para shapes extensibles
❌ PROHIBIDO: `any` sin justificación escrita en comentario adyacente
❌ PROHIBIDO: `// eslint-disable` sin razón específica en la línea siguiente
```

---

## 5. Creación de Issues

```
❌ PROHIBIDO: Crear issues a mano sin el workflow (inconsistencia de formato)
✅ SINGLE ISSUE: /backlog add → el workflow pregunta epic + campos requeridos
✅ BATCH (2+ issues o epic nuevo): /backlog add
✅ PIPELINE (desde docs/design): /backlog (full)
✅ PERMITIDO: Editar issues existentes (marcar Done, agregar Evidence, ajustar AC)
```

> DoR/DoD en `DOR_DOD.md` (always-on) antes de implementar o cerrar.

---

## 6. Project Structure

```
✅ OBLIGATORIO: App code siempre en `src/` (nunca components/ o lib/ sueltos en raíz)
✅ OBLIGATORIO: Shared (ui/, common/, layout/, lib/utils/, config/) NO importa de Domain
✅ OBLIGATORIO: Domain (components/{feature}/, lib/actions/{feature}/, features/{domain}/) SÍ importa Shared
❌ PROHIBIDO: Domain ↔ Domain — extraer a Shared
❌ PROHIBIDO: `types/` dentro de `src/` — vive en raíz (convención TS para `*.d.ts`)
```

> Path alias `@/` → ver §2.4.
> Detalle completo (árbol, tabla de decisión 27 filas, subcarpetas 3+/features 5+, zonas grises) → skill [`sk-project-structure`](../skills/sk-project-structure/SKILL.md).

---

## 7. Deploy / Vercel y Railway

> El destino de un repo es uno: Vercel o Railway (`factory provision --target`). §7.1 y el camino sin bóveda de §7.2 (`env:push`) son de Vercel; en Railway las variables llegan **sólo** por el sync de la bóveda (Railway exige bóveda). Pasos y troubleshooting de Railway → `tk-provision` y `fx-factory-cli`.

#### 7.1 🔴 NUNCA tocar `.env.local` ni linkear projects de Vercel

> Daño real (repo sin bóveda): `vercel link` puede triggerar pull automático que **sobrescribe `.env.local`** del proyecto. Si tenía `DATABASE_URL` o `AUTH_SECRET` custom, se pierden y el user queda locked out. Es destructivo e irreversible (no hay backup automático y `.env.local` está gitignored).
>
> **Distinción de vectores** (modelo de permisos, `CC.md §6`): el daño viene del **overwrite sin diff** (`vercel pull/link`), NO de un Edit revisable. Por eso `vercel pull/link/env pull` → **DENY** (hard-block en `settings.json`), mientras que editar `.env.local` con Edit/Write → **ASK** (gate: ves el diff y apruebas, p.ej. agregar una env var nueva).
>
> **En un repo con bóveda el DENY es el mismo, por otra razón:** no hay `.env.local` que perder, pero uno que traiga `vercel env pull` lo cargaría Next.js y sus claves se colarían sobre las de la bóveda (`fx-secrets-vault §7`).

```
❌ DENY (hard-block): vercel link / vercel link --yes / vercel link <project>
❌ DENY (hard-block): vercel pull / vercel env pull (sobrescriben .env.local sin diff)
🔶 ASK (gate, revisable): Edit/Write directo de .env.local → ves el diff y apruebas en el prompt
✅ OBLIGATORIO: Si el user pide vincular Vercel o pull de env → ESPERAR autorización + (sin bóveda) hacer `cp .env.local .env.local.bak` ANTES
✅ OBLIGATORIO: Si necesitas verificar env vars → sin bóveda, leer .env.local; con bóveda,
   `npx @timekast/factory env wizard --review` (enmascarado, entorno `local`). NUNCA pull
ℹ️  Aplica a Factory + derivados que deployen a Vercel. El daño no es reversible vía git.
```

#### 7.2 Env vars day-2 — un solo escritor por destino

Cada destino de un deploy tiene **un solo escritor**: dos se pisan y el destino queda con el valor de quien escribió al último. Cuál es depende de si `.timekast/provision.json` tiene bloque `vault`:

| Destino                                        | Con bóveda (escritor único)                        | Sin bóveda (sin bloque `vault`)        |
| ---------------------------------------------- | -------------------------------------------------- | -------------------------------------- |
| Vercel production                              | La bóveda: sync de `main:/`                        | `pnpm env:push` (y `factory provision`) |
| Vercel preview                                 | La bóveda: sync de `develop:/`                     | `pnpm env:push` (y `factory provision`) |
| Secrets de GitHub Actions                      | La bóveda: sync de `develop:/ci`                   | `factory provision` (`gh secret set`)  |
| Variables de GitHub Actions (`NEXT_PUBLIC_AUTH_*`) | `pnpm setup:e2e`, con valores del entorno `develop` | `pnpm setup:e2e`, desde `.env.local` |
| Railway (`main` y `develop`)                   | La bóveda: sync de `main:/` y de `develop:/`, cada uno a su entorno. Lo crea `factory provision --target=railway`; en un repo que ya vivía en Railway, `factory vault sync railway` | Nadie desde el kit: en un repo que ya vivía en Railway, el dashboard; la salida es `factory vault adopt` (`provision` rechaza Railway sin bóveda) |

Sin bóveda, un destino tiene varios escritores y el reparto es **por clave**: `factory provision` escribe las suyas (las provision-owned), `pnpm env:push` las del producto, y el dashboard de Vercel los valores que difieren por ambiente. Cada clave sigue teniendo un solo escritor.

**Con bóveda:**

```
✅ Cambiar un valor → en la bóveda: entorno `main` → production, `develop` → preview. El sync lo lleva solo
✅ Valor NUEVO → en `/` del entorno si lo lee la app (runtime); en `develop:/ci` si sólo lo necesita CI
❌ Un valor puesto a mano en Vercel, en Railway o en GitHub (dashboard, `gh secret set`) lo pisa o lo borra el siguiente sync
```

Layout, qué hace un sync, la política de borrado y por qué `env:push` no escribe ahí → [`fx-secrets-vault §7`](../skills/fx-secrets-vault/SKILL.md); qué crea `factory provision` y cuándo aplica un cambio en Vercel → skill [`fx-factory-cli`](../skills/fx-factory-cli/SKILL.md).

**Sin bóveda — `pnpm env:push` (Vercel).** Todo lo que sigue es el camino de un repo sin bloque `vault`, que sólo existe con destino Vercel: `env:push` escribe en Vercel y en Railway no hay equivalente.

Para subir variables de entorno **después** del provisioning inicial (agregar una var nueva, ajustar branding, etc.), el derivado sin bóveda corre `pnpm env:push` (alias de `npx @timekast/factory env push` — sin instalación global). Sube **solo las product vars** de `.env.local` a `production`+`preview` vía REST API, **sin `vercel link`**.

```
✅ pnpm env:push            # sube product vars de .env.local a Vercel (production + preview)
✅ pnpm env:push --dry-run  # muestra el plan sin enviar nada (nombres y motivos, nunca valores)
🔒 NUNCA toca las provision-owned (DATABASE_URL / DATABASE_URL_MAIN / AUTH_SECRET / NEXT_PUBLIC_APP_ENV):
   provision las setea per-ambiente; re-pushearlas cruzaría prod↔develop
ℹ️  Requiere `.vercel/project.json` (lo escribe provision) + `VERCEL_TOKEN` del rail (la bóveda, §7.3)
```

**Variables que en TU proyecto difieren entre `production` y `preview`** (sin bóveda; un bucket de storage, una cola, cualquier servicio con ambientes separados) → decláralas: la lista del kit nace en `cli/src/lib/env-file.ts` y por construcción nunca conoce el vocabulario de tu proyecto. Sin declararlas, `env:push` sube **el mismo valor a los dos destinos** y producción termina escribiendo en el bucket de desarrollo.

Dos vías que se reconcilian (usa la que te acomode — el comando las junta):

```
✅ REGISTRO (duradero, va COMMITEADO): `env.project.json` en la raíz del repo
   { "perEnv": ["STORAGE_BUCKET_URL"] }        # nombres de variable, NUNCA valores
✅ MARCADOR (ergonómico): un comentario `# @per-env` en la línea de ARRIBA de la variable, en `.env.local`
   # @per-env — bucket distinto por ambiente
   STORAGE_BUCKET_URL="https://dev-bucket…"
🔴 UN marcador protege UNA SOLA variable: la de la línea siguiente. Arriba de un bloque de dos,
   la segunda SÍ sube (y el aviso de "declarada pero no aparece" tampoco dispara) → repite el marcador
🔴 El marcador va en su PROPIA línea. Inline (`STORAGE_BUCKET_URL="x" # @per-env`) no protege nada
   y ADEMÁS corrompe el envío: el valor sube literal `"x" # @per-env`. `env:push` lo detecta y avisa
🔴 Marcador y variable van CONSECUTIVOS (sólo líneas en blanco en medio): un comentario explicativo
   —o una asignación comentada— entremedio rompe el par y la variable deja de estar protegida.
   La explicación va en la línea del propio marcador, como en el ejemplo de arriba
🔁 Cada `env:push` AGREGA al registro todo marcador que encuentre y no esté ahí (idempotente; `--dry-run` no escribe)
🔴 La reconciliación SOLO AGREGA: quitar el marcador NO desprotege — eso exige editar `env.project.json` a mano
🔒 Protegida = registro ∪ marcador ∪ provision-owned (unión, nunca reemplazo): tu declaración solo puede RESTAR variables del envío
🔴 Registro presente pero ilegible / JSON inválido / forma inválida → ABORTA el push nombrando el archivo (jamás sube "de más"). Ausente = caso normal, sin mensaje
⚠  Una clave declarada que no aparece en `.env.local` → aviso de typo (no está protegiendo nada)
ℹ️  Setear el valor correcto por ambiente sigue siendo manual (dashboard de Vercel): `env:push` solo garantiza NO pisarlo
ℹ️  `env.project.json` es dev-owned: excluido de los dos perfiles de distribución → `factory update` nunca lo toca
```

**Al MOSTRARTE las variables — con y sin bóveda** (`factory env wizard --review`, en tabla y en `--json`), el asistente enmascara **todo** salvo lo que un whitelist declara públicamente público — `cli/src/lib/public-env-keys.json` (prefijos `NEXT_PUBLIC_*` y `RATE_LIMIT_*`, más las claves enumeradas). Es fail-closed a propósito: una variable que tu proyecto invente y que nadie declaró pública se protege sola, sin editar nada.

De lo enmascarado se ven sus **últimos 4 caracteres** (`••••••••3f7a`), y nada si el valor mide menos de 12 (`••••••••••••`). Sirve para una sola cosa: al rotar una credencial, distinguir **cuál** está puesta — ocultas del todo, todas se ven iguales. El **valor** no se imprime nunca; para leerlo completo, abre tu `.env.local` (sin bóveda) o el entorno `local` de la bóveda. El display siempre mide lo mismo, así que tampoco delata la longitud del valor ni cuáles son cortos.

⚠️ **Distingue tokens de proveedor, y solo eso.** Si la cola del valor es constante —una cadena de conexión que termina en `?sslmode=require`, o un comentario pegado a la asignación, que viaja dentro del valor— el sufijo se ve igual antes y después de rotar. No concluyas una rotación desde ahí. Y lo que se ve en pantalla no se copia a un archivo del repo: en el historial de git esos 4 caracteres son permanentes y confirman que la credencial sigue viva.

#### 7.3 Rail de secretos de metodología (bóveda, `rail-timekast`)

> El **rail** son los **tokens de administración de la organización** que la metodología del Factory consume desde la máquina de una persona: provisioning de infra (`factory provision`, `env:push`), publicación de propuestas/mockups (`/proposal`, `/publish`) y la observación del deploy de producción (`/deploy`). Viven en la **bóveda** de la organización —proyecto `rail-timekast`, entorno `main`— y cada comando del kit los pide ahí **con la sesión de la persona** (`infisical login`). No hay archivo local ni paso de carga: el valor vive sólo en la memoria del proceso que lo pidió, y una rotación en la bóveda aplica en el siguiente comando. **NO** son los secretos del proyecto (ésos viven en su proyecto de la bóveda, o en `.env.local` si el repo no tiene bóveda — otra capa). Cómo entrar (login con `--domain`, acceso por proyecto) y qué significa cada falla → skill [`fx-secrets-vault §3`](../skills/fx-secrets-vault/SKILL.md).

**Variables del rail que lee el kit** (el rail tiene además tokens de operación directa que ningún comando del kit lee, como `CLOUDFLARE_R2_TOKEN`; la lista completa, el alcance y la prueba de vida de cada token → [`fx-secrets-vault §5`](../skills/fx-secrets-vault/SKILL.md)):

| Variable                | Propósito                                             | Consumido por            |
| ----------------------- | ---------------------------------------------------- | ------------------------ |
| `VERCEL_TOKEN`          | Hosting + deploys + `env:push` + observar el deploy de producción + descubrir el destino (`provision --resolve-target`, `/deploy` §1.4, cualquier alta sin `--target`) | provision · env:push · /deploy |
| `VERCEL_TEAM_ID`        | Default de `--team` (Vercel Pro team)                | provision                |
| `RAILWAY_TOKEN`         | Token **de equipo** de Railway: descubrir el destino de **cualquier** repo (`provision --resolve-target`, `/deploy` §1.4, cualquier alta sin `--target`), alta, dominios y observar el deploy de producción. También borra el proyecto en un `--destroy` de Railway (`fx-factory-cli` § `--destroy`). 🔴 Sin él, un derivado sin `target` guardado sale del descubrimiento con código `12` y `/deploy` no observa su deploy, viva donde viva | provision (descubrimiento, `--target=railway`, `--destroy`) · vault adopt · vault sync railway · /deploy |
| `NEON_API_KEY`          | Provisión de DB + acuña la key project-scoped de cada proyecto | provision      |
| `NEON_ORG`              | Organización donde nacen los proyectos (NOMBRE, no id) — opcional | provision   |
| `CLOUDFLARE_API_TOKEN`  | DNS / dominios de proyectos provisionados            | provision                |
| `RESEND_API_KEY`        | Correo transaccional (env + alta de dominio)         | provision                |
| `SHORTIO_API_KEY`       | Acortador de URLs de propuestas/mockups              | /proposal · /publish     |
| `GAMMA_API_KEY`         | Deck visual (Gamma REST) de `/proposal`              | /proposal                |
| `PROPOSAL_ASSETS_R2_TOKEN` | Subir logos al bucket público de propuestas (solo ese bucket) — opcional | /proposal |
| `BACKLOG_ADMIN_TOKEN`   | Alta del proyecto en el backlog central + emisión de su key | provision (`--services=backlog`) |

> ⚠️ **La `NEON_API_KEY` del rail es de una CUENTA DE SERVICIO, no la personal de nadie.** Solo una key **personal de un Admin** de la organización puede acuñar API keys project-scoped (una org key recibe `404 This endpoint requires a personal API key`, y no hay ruta alterna), así que el rail necesita una key personal — pero de una cuenta cuya única membresía son las organizaciones de TimeKast. El alcance de una key personal **son las orgs de las que su dueño es miembro**, así que la personal de un humano crece sola: el día que lo agregan a la organización de un cliente, el rail se la entrega al equipo entero. Lo que el derivado recibe (GitHub Secret + `develop:/ci` de su bóveda, o `.env.local` sin bóveda) es la key **project-scoped**, que da 404 en cualquier otro proyecto — mismo patrón de menor privilegio que `BACKLOG_ADMIN_TOKEN` abajo.
>
> ⚠️ **`NEON_ORG` es un nombre y es solo el default.** El `org_id` **nunca** va al rail: se deriva de la key (`GET /users/me/organizations`). Si la key ve una sola organización, se usa esa y `NEON_ORG` no hace falta. Con varias y sin default, `provision` **aborta** nombrándolas en vez de adivinar — crear la base de un cliente en la organización equivocada es el error que ese fail-closed existe para evitar. Para desviarse en una corrida: `factory provision --neon-org "<otra>"`. Un proyecto que YA existe ignora flag y default: su organización se lee del proyecto.
>
> ⚠️ **El rail NO es la credencial del día-2 del backlog central.** `BACKLOG_ADMIN_TOKEN` (org-level, host) solo da de alta el proyecto remoto y mintea su key; a partir de ahí `factory backlog push`/`sync` leen la key **project-scoped** (`BACKLOG_API_KEY` + `BACKLOG_PROJECT_ID`) del entorno `local` de la bóveda del derivado (de su `.env.local` si no tiene bóveda) — nunca el rail. Menor privilegio: la key de un repo no alcanza otros proyectos. Detalle → [`fx-backlog-central`](../skills/fx-backlog-central/SKILL.md).

```
✅ No se puede leer un token → el preflight de la primitiva aborta ANTES de tocar infra y nombra la falla:
   sin sesión (nombra `infisical login --domain=…`), sin acceso a `rail-timekast` (nombra el proyecto y su id — o que no existe),
   clave ausente (nombra la clave; la carga un admin) o `infisical` sin instalar. Arreglo de cada una → `fx-secrets-vault §3`
🔴 Los valores NUNCA van al repo ni se imprimen (no-echo), y tampoco se copian a un archivo de la máquina:
   una copia local es una copia que nadie rota
⚠  Un token del rail exportado en tu terminal se IGNORA (gana la bóveda) y el comando avisa nombrando la variable → bórralo
ℹ️  Rotar = el valor nuevo entra a `rail-timekast` con el MISMO nombre (`fx-secrets-vault §9`). Flags y troubleshooting
    de cada comando → skill `fx-factory-cli`; cómo lo consume el workflow de infra → `tk-provision`
```

---

_TimeKast Factory — Starter Kit Rules (L1 Peer)_

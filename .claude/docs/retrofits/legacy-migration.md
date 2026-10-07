# Legacy migration — subir un repo viejo al kit actual (agente-asistido)

> **Qué es:** el procedimiento para llevar un proyecto **derivado viejo** (nacido en un Factory ~3.x–10.x, cerebro `.agent/` legacy o `.claude/` desactualizado, `src/` divergente) al kit de hoy **sin tronar en el primer `factory update`**.
> **Audiencia:** el **agente** (Claude Code) del repo destino. El humano solo aprueba en los gates ⏸.
> **Este doc VIAJA con el kit** (`.claude/docs/retrofits/`) — el agente del derivado lo tiene disponible tras el primer `add`/`update`.
> **Principio:** el CLI (`factory add`/`update`) hace el merge del **cerebro** archivo-por-archivo (sistema de cubetas); este runbook aporta lo que el CLI NO hace — el **censo previo** (para no tronar), la **red de seguridad**, la costura del `package.json`/hooks/env dev-owned, y los **retrofits de `src/`** (que el CLI nunca toca).
> **Disponible desde:** kit `v11.2.1`

---

## Por qué el update tronaba (y por qué este runbook lo evita)

El `factory update` refresca SOLO el cerebro (`.claude/` + scripts/tools tracked) y **nunca** toca `src/` (born-frozen, `BR-FACTORY-006`). Eso crea una costura: artefactos del cerebro (hooks, tools, linter) corren contra un `package.json` **dev-owned** y un `src/` congelado que el update no controla. Desde v11.2.1 el kit es **tolerante** a esa divergencia (hook por-path con guards, `pnpm run --if-present`, `generate:skin` no-op en src sin skin-split, `skill:lint` degradado a warning en derivado). Pero un repo que sube DE GOLPE varias versiones puede acumular otras costuras (aliases faltantes, hooks propios pisados, env vars nuevas). **F0 (censo) las detecta antes de tocar nada.**

---

## F0 — Censo del repo destino (read-only, NO muta nada)

El pre-check que evita el "tronó el update". El agente corre esto y **reporta al humano** antes de F1.

```bash
echo "═══ Cerebro actual ═══"
[ -d .agent ] && echo "⚠️  .agent/ legacy presente (cerebro pre-.claude/ — se retira en F2)"
[ -d .claude ] && echo "✓ .claude/ presente" || echo "⚠️  sin .claude/ (primer bootstrap → factory add, no update)"
[ -f .timekast/lockfile.json ] && echo "✓ lockfile (CLI ya usado)" || echo "⚠️  sin lockfile (nunca pasó por el CLI)"
node -p "const p=require('./package.json'); 'factoryVersion='+(p.factoryVersion||'∅')+' agentKitVersion='+(p.agentKitVersion||'∅')+' version='+p.version" 2>/dev/null || echo "sin package.json (repo core)"

echo "═══ Hooks propios (se PIERDEN si viven en el pre-commit del kit) ═══"
[ -f .husky/pre-commit ] && grep -nE "generate:vercel-crons|cron-jobs:lint|pnpm (?!lint-staged|run --if-present|skill:lint)" .husky/pre-commit || true
[ -f .husky/pre-commit.project ] && echo "✓ ya tiene extension point .husky/pre-commit.project"

echo "═══ Layout docs/ legacy (rename a project/) ═══"
[ -d docs/backlog ] || [ -d docs/planning ] && echo "⚠️  docs/{backlog,planning} legacy → se renombra a project/ en F3"

echo "═══ Layout src/ (skills sk-* asumen src/) ═══"
{ [ -d components ] || [ -d lib ] || [ -f middleware.ts ]; } && echo "⚠️  código en raíz (pre-src/) → migración a src/ en F5-B" || echo "✓ layout src/ consolidado"

echo "═══ Env vars ═══"
[ -f .env.local ] && echo "✓ .env.local presente (se respalda en F1)" || echo "⚠️  sin .env.local"
```

**Salida del censo → tabla al humano:** de qué versión viene, qué cerebro tiene, hooks propios en riesgo, docs/ legacy, src/ layout, env. El humano decide si procede. Un repo con `.agent/` + código en raíz + varias versiones de salto es R3 (alto) — vale hacerlo por partes.

---

## F1 — Red de seguridad (antes de cualquier mutación)

```bash
git status --porcelain    # DEBE estar vacío — si no, STOP y reporta
git checkout -b migration/factory-sync-$(date -u +%Y%m%d)
git tag pre-factory-sync-$(date -u +%Y%m%d)          # rollback: git reset --hard <tag>
[ -f .env.local ] && cp .env.local .env.local.bak    # SK.md §7.1 — nunca perder secrets
```

🔴 **NUNCA `db:push`** durante la migración (SK.md §1.1). 🔴 **NUNCA `vercel pull/link`** (sobrescribe `.env.local` — SK.md §7.1).

---

## F2 — Cerebro vía CLI (reemplaza el nuke+replace manual)

El CLI hace lo que versiones viejas de este runbook hacían a mano (clone shallow + rsync + merge). Su sistema de cubetas resuelve archivo-por-archivo: agrega · sobrescribe-silencioso · borra-silencioso · **conserva-editado-local** (conflicto → prompt sin default).

```bash
# Sin .claude/ todavía (censo lo marcó) → add; con .claude/ → update.
npx @timekast/factory add --full      # o: npx @timekast/factory update --full
```

🔴 **`--full` EXPLÍCITO siempre.** Gotcha: el auto-detect busca `factoryVersion` en `package.json`; un legacy no lo tiene → caería a perfil **`core`** y NO instalaría los `sk-*` + `SK.md`. Un derivado Next SIEMPRE es `full`.

🔴 **Conflictos UNO por UNO.** Cuando el CLI abre prompt (lo editaste local Y cambió en el kit), decide por archivo. **NUNCA `--theirs-all`** (pierdes tus customizaciones) ni **`--mine-all`** a ciegas (te quedas con cerebro viejo). Las customizaciones legítimas de `.claude/` (skills `pj-*`, agents propios) se conservan solas — el CLI no las pisa.

- `.agent/` legacy: el CLI/deploy lo retira. Ignóralo (es track separado, `BR-FACTORY-001`).
- `CLAUDE.md` es **dev-owned**: si lo editaste, se conserva; `factory doctor` reporta rules always-on que tu `CLAUDE.md` no `@importa`.

---

## F3 — Costura (lo dev-owned que el update no controla)

Esto es lo que causaba los "tronó el commit". El censo (F0) ya listó qué falta.

1. **Aliases de `package.json`** (dev-owned — el update no los agrega). Verifica que existan los que el pre-commit del kit invoca por alias (`generate:inventory/codebase/hooks/schema/api`, `skill:lint`, `update-board`). Desde v11.2.1 el hook usa `pnpm run --if-present` → un alias faltante ya no bloquea el commit, pero SÍ deja el autogen sin correr. Agrégalos (el kit los define en su propio `package.json` — cópialos). `generate:skin` ya NO necesita alias (el hook lo invoca por path).
2. **Hooks propios → `.husky/pre-commit.project`.** Si el censo detectó pasos propios (cron reconciler, etc.) en el `.husky/pre-commit`, muévelos a `.husky/pre-commit.project` (dev-owned, el update nunca lo pisa — ver `extending-the-kit.md §2.2 a.1`). El hook del kit lo ejecuta al final si existe.
3. **Rename `docs/` → `project/`** (si el censo lo marcó): `git mv docs/backlog project/backlog`, `docs/planning project/planning`, etc. `project/reference/` se regenera (no se mueve). Sweep de links rotos (`grep -rn "docs/\(backlog\|planning\)"`) — reporta, no auto-reemplaces.
4. **Env vars nuevas.** El kit pudo agregar vars entre tu versión y hoy. Corre el wizard de env secret-safe (nunca imprime valores `kind:secret`); compara contra `.env.example` del kit. Provision-owned (`DATABASE_URL`/`AUTH_SECRET`/…) NO se tocan a mano.
5. **`git mv` code → `src/`** si el censo marcó layout pre-`src/` (componentes/lib en raíz) — ver F5-B abajo.

---

## F4 — Validación (gate antes de commitear)

```bash
pnpm install                       # si F3 tocó package.json
pnpm prepare                       # re-instala hooks husky
git commit -m "chore: probe" --dry-run 2>/dev/null; git add -A   # el pre-commit COMPLETO corre acá
npx @timekast/factory doctor       # drift, huérfanos, conflictos pendientes, rules sin @import — debe estar limpio
pnpm verify                        # lint + typecheck + test del repo (o su equivalente)
```

Un commit de prueba real es la mejor validación: el pre-commit del kit corre entero contra tu `package.json` + `src/` reales. Si truena, el censo (F0) ya te dijo dónde (alias faltante, hook, etc.) — arréglalo en F3 y reintenta. **NUNCA `--no-verify`** (GIT.md §1).

---

## F5 — Retrofits de `src/` opt-in (el CLI nunca los trae)

El `factory update` sube el **cerebro**, no tu `src/`. Los fixes de seguridad y features del kit posteriores a tu nacimiento se aplican **manualmente, opt-in, por valor** (seguridad primero). Qué aplica depende de **de qué era naciste** — tabla de aplicabilidad:

| Naciste en (`factoryVersion`) | Retrofits candidatos (en orden) |
| ----------------------------- | ------------------------------- |
| **≈ 3.x–5.x** (pre-EPIC-02)   | **1.** Account-takeover (self-reg + OAuth) → `.claude/docs/retrofits/account-takeover.md` · **2.** Notifications hardening (si tiene el sistema de notifications) → `.claude/docs/retrofits/notifications-hardening.md` · **3.** Evaluar el sistema de identidad v11 completo (passkey/MFA/step-up) como proyecto aparte |
| **≈ 6.x–10.x**                | **1.** Costura v11 (lo de arriba ya lo cubre el CLI desde v11.2.1) · **2.** Notifications hardening si no lo recibió · **3.** Retrofits de seguridad opt-in según auditoría |
| **≈ 11.x**                    | Deltas puntuales — p.ej. step-up auto-gating (el patrón viaja en `sk-mfa §4`; el registro del port vive en el Factory) |
| **≈ 11.x–12.1** (con passkeys) | **Passkeys conscientes del dominio** → `.claude/docs/retrofits/passkey-domain-binding.md`. Cierra un lockout real: sin la columna `rp_id`, una passkey de otro dominio cuenta como factor y se ofrece como única entrada, sin poder verificar nunca. Aplica a **todo** derivado con passkeys nacido antes de `v12.2.0` — el caso más común no es multi-dominio, es una passkey de `localhost` contra la base de develop |
| **Cualquier era anterior a `v13.0.0`** que despliega o va a desplegar en Railway | **`/api/health/live` pública sin base + etiqueta de entorno por `NEXT_PUBLIC_APP_ENV`** → `.claude/docs/retrofits/public-health-and-env-label.md`. Sin ella, el healthcheck anónimo de Railway nunca ve un 200 (`provision` lo deja apagado e imprime esta ruta) y los errores de `develop` llegan a Sentry como producción. La etiqueta también aplica en Vercel. Si ya habías abierto `/api/health` al público con una versión anterior de la guía, su §5 explica cómo cerrarla (opcional) |
| **Cualquier era anterior a `v13.1.0`** (la parte D, también `v13.1.0`) | **🔴 Sesión y factores** → `.claude/docs/retrofits/factor-and-session-hardening.md`. Aplica a **todo** derivado: el gate del Edge no bloqueaba peticiones anónimas (las rutas de `/api` sin chequeo propio respondían a cualquiera) y `/login` tenía un open redirect. Si además tiene 2FA (desde `v11.0`), es crítico: sin él, el 2FA se completa con el grant de otra sesión o con un código por correo, quien controle el correo entra con una cuenta de Google/GitHub nueva sin pasar por `/2fa`, y cualquier factor se cambia sin step-up. Además, sin él cambiar o resetear la contraseña no cierra las demás sesiones, una sesión revocada puede revivir y los correos de seguridad se pueden inyectar. Incluye dos migraciones que generas **tú** (nunca el `.sql` del Factory). Absorbe `pending-mfa-action-guard.md` |
| **Cualquier era anterior a `v13.0.0`** (perfil `full`) | **Revisar `CLAUDE.md` y los adapters de otros agentes** → `.claude/docs/retrofits/claude-md-and-agent-adapters.md`. El update puede dejar las rules importadas dos veces (el `INDEX` más los seis imports viejos), y el pre-commit empieza a generar `AGENTS.md`, `.cursor/…`, `.github/copilot-instructions.md` y `.hermes.md`. Las dos son decisiones del proyecto, tomadas con el usuario |
| **Cualquier era anterior a `v13.0.0`** con E2E y migraciones | **Opcional: E2E con base vacía** → `.claude/docs/retrofits/e2e-empty-branch.md`. Con `e2e.config.json` en `true`, el runner vacía la branch temporal y migra desde `0000`: prueba la cadena completa de migraciones y saca a la luz specs que leían datos de develop. `factory update` lo pregunta una vez; sin activarlo nada cambia, y se revierte con `false` |

**Mecánica de un retrofit de `src/`** (validada): NO `format-patch → git am` (arrastra autogen del origen y se salta el pre-commit del destino). Usa:

```bash
git -C <factory-o-fuente> diff <rango> -- src tests | git apply    # solo src/ + tests/
git add src tests && git commit -m "feat: port <retrofit> from factory"   # el husky del destino regenera SUS autogen
```

**F5-B — code → `src/`** (si el censo marcó layout pre-`src/`): `git mv components src/components`, `lib src/lib`, `middleware.ts src/middleware.ts`. NO mover `types/`, `sentry.*.config.ts`, `tests/`, `scripts/`, configs raíz. Actualizar `tsconfig` paths (`@/*` → `./src/*`), `vitest` alias, `drizzle` schema/out. Es un commit aparte (blast radius de review distinto).

---

## Secretos — la bóveda de la organización (no es un retrofit de `src/`)

No depende de `factoryVersion`, por eso no está en la tabla de F5: depende de si el repo ya vive en la bóveda.

| Cuándo aplica | Guía |
| --- | --- |
| Perfil **`full`** y `.timekast/provision.json` **sin bloque `vault`** (el repo trabaja con `.env.local` + `env:push`). Tu equipo decide si lo pasa a la bóveda (`factory vault adopt`) o lo declina (`--decline`). En perfil `core` no aplica | [`secrets-vault-adoption.md`](./secrets-vault-adoption.md) — onboarding de cada persona + un caso por situación (`.env.local` viejo, scripts forkeados, Railway, llave sellada, varios despliegues, declinar, deploy conectado y vacío) |

Córrelo **después** de F4: la adopción exige el cerebro al día y sin forks en los scripts que corre el wrapper de la bóveda. `factory doctor` te recuerda el caso mientras el repo esté "sin decidir".

---

## Protocolo agente-asistido (orden de consulta + reporte)

1. **Antes de tocar nada:** corre F0, consulta este doc + `fx-factory-cli` (SKILL, para el detalle de `add/update/doctor`) + `extending-the-kit.md`. Reporta el censo en tabla al humano y **espera luz verde**.
2. **Por fase:** un paso a la vez (no encadenar en un mega-`&&` — estado parcial recuperable). Gates ⏸ (F1 tag, F2 conflictos, F4 commit, F5 cada retrofit) → mostrar qué se hará, esperar confirmación.
3. **Retrofits F5:** consulta el doc específico de cada retrofit ANTES de aplicarlo; cada uno tiene su propio gate de seguridad (p.ej. account-takeover tiene un P0 de orden de callbacks). **Secretos:** si el repo no tiene bloque `vault`, pregunta al humano si lo adopta o lo declina y sigue [`secrets-vault-adoption.md`](./secrets-vault-adoption.md); nunca adoptes sin esa decisión.
4. **Al cerrar:** commit(s) siguiendo GIT.md §3, PR a `develop` (NUNCA `main` — eso es `/deploy`). Reporta al humano: qué se sincronizó, qué customs se conservaron, qué retrofits quedan pendientes.
5. **Rollback:** cualquier fallo → `git reset --hard pre-factory-sync-<fecha>` + reporta la fase exacta + el error literal + causa raíz (o "desconocida", sin adivinar).

---

_TimeKast Factory — legacy-migration (shipped retrofit doc). Complementa `fx-factory-cli` (CLI reference), `extending-the-kit.md` (skills y hooks propios) y `fx-extension-points` (inventario de puntos de extensión)._

---
name: tk-mockup
description: Documentation-family workflow that renders a project's /design output (16_DESIGN.md + SCR/CMP/FLW) into a navigable, self-contained, client-facing HTML mockup using the fx-presentation-kit catalog — per-screen render by tier, Lucide icons inlined — with an optional, gated publish to the proposals hub via the CLI at close. Primary invocation is `/mockup [validar] [--client <path>] [--keep-artifacts]`; do not run this skill directly outside that command.
family: documentation
model: opus
parallelism_unit: batch
concurrency_cap: 6
batch_size_default: 4
merge_strategy: orchestrator-merge
auditor_step: false
last-verified: 2026-09-22
user-invocable: false
---

# tk-mockup — `/mockup` Workflow Skill

> Documentation-family workflow. Converts the `/design` contract (`16_DESIGN.md` index +
> `16_DESIGN/SCR-*.md` + `components/CMP-*.md` + `flows/FLW-*.md`) into a **navigable HTML mockup** at
> `project/mockup/` — a recorrido de pantallas que abre por doble-click, offline, fiel al sistema visual
> del kit. Artefacto **dev + validación UX con cliente**. Consumes the catalog `fx-presentation-kit`.

> **Slash command:** `/mockup [validar] [--client <path>] [--keep-artifacts]` (thin wrapper at `.claude/commands/mockup.md`).

---

## 1. When to use

Invoke after `/design` has emitted `16_DESIGN.md` + `16_DESIGN/`. `/mockup` renders what `/design`
decided — it does not design.

**Use for:** validar UX con cliente sobre pantallas reales; revisar el flujo visual antes de implementar;
generar un recorrido navegable para feedback. **Don't use for:** el one-pager de visión / pitch (eso es
`tk-proposal`); diseñar o reclasificar pantallas (eso es `tk-design`, upstream); scaffolding de código
(eso es `tk-implement`).

> **Architectural principle:** el render es **síntesis dirigida por spec, no transcripción**. El ASCII
> del SCR orienta el layout; el `§11 Copy` es literal; el `§5` es binding a primitiva `pk-*`. El **tier
> es SSOT de `tk-design`** — aquí se consume, nunca se recalcula.

---

## 2. Tone guidance — plain language discipline

> **Source-of-truth:** `.claude/rules/CORE.md §6` (doctrina) + `CC.md §3` (mecánica de checkpoints). Always-on. Esta sección añade vocab de mockup.

**Vocab a definir inline la primera vez por turno:**

- **SCR** (pantalla / screen) — contrato per-pantalla en `16_DESIGN/SCR-XXX-{slug}.md`.
- **Tier** — `kit-pure` (la shippea el kit) / `kit-extended` (kit + deltas) / `custom` (a diseñar).
- **`pk-*`** — primitivas HTML del catálogo `fx-presentation-kit` (device frame, tabla, KPI, etc.).
- **Mockup** — el recorrido HTML navegable resultante en `project/mockup/`.

**CP narration pattern:** (1) 2-3 líneas plain de QUÉ pasó y por qué importa; (2) conteo en términos de
negocio (no IDs crudos); (3) pantallas `blocked` / decisiones que requieren al user, explícitas; (4)
opciones explícitas y excluyentes — estructuradas (`AskUserQuestion`) por default, tabla numerada 1/2/3 como fallback sin la tool (`CC.md §3` + [`fx-workflow-authoring §7.0`](../fx-workflow-authoring/SKILL.md)).

**Anti-jerga (client-facing):** el texto renderizado habla el idioma del cliente — cero jerga técnica
en lo visible (ver `methodology/anti-jerga.md`). Aplica al output, no a esta narración interna.

---

## 3. Modes

| Mode               | Semantics                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (default / `nuevo`) | Render exhaustivo: todas las SCR del `16_DESIGN` del proyecto. Si `project/mockup/` existe → Phase 0 cleanup pre-flight (backup-then-remove).             |
| `validar`          | Read-only sobre `project/mockup/` existente. Chequea integridad (toda SCR tiene HTML, assets presentes, iconos resueltos, anti-jerga) + emite report. Cero writes durables. |

**Flags:** `--client <path>` → override del project root (renderiza el `16_DESIGN` de otro repo derivado;
default = repo actual). `--keep-artifacts` → conserva `project/mockup-artifacts/{run-id}/` tras el run.

`/mockup` sin args → Phase 0 confirma modo + readiness.

---

## 4. Inputs consumed

| Source                                                   | Used for                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `project/planning/16_DESIGN.md`                          | `§3 Screen Map` (rutas, secciones, slugs) · `§4 Flow Map` · `§6 Copy` · `§7 States` · `§8 Kit-bindings` (lista kit-pure) |
| `project/planning/16_DESIGN/SCR-*.md`                    | frontmatter `tier:` (fuente del tier) + contrato per-pantalla: `§3` ASCII (layout ref) · `§5` binding · `§9` states · `§11` copy literal |
| `project/planning/16_DESIGN/components/CMP-*.md`         | Specs de componentes custom (prop API + token usage) — primera clase            |
| `project/planning/16_DESIGN/flows/FLW-*.md`              | Agrupación / orden de navegación del index                                      |
| `project-config.md`                                      | Nombre del producto + branding (logo text) para el index                        |
| **Catálogo (Read on-demand):**                           |                                                                                |
| `.claude/skills/fx-presentation-kit/kit.css` + `theme.css` | Primitivas `pk-*` + tokens (skin)                                            |
| `.claude/skills/fx-presentation-kit/lucide.json`         | Manifest de iconos (resolución inline)                                          |
| `.claude/skills/fx-presentation-kit/screens/*.html`      | Pantallas kit-pure preconstruidas (attach directo)                             |
| `.claude/skills/fx-presentation-kit/fonts/*.woff2`       | Geist (se copia a `project/mockup/assets/`)                                     |

---

## 5. Outputs produced

```
project/mockup/                         # DURABLE — el deliverable client-facing (zippable, offline)
├── {slug}-mockup.html                  # shell B' AUTOCONTENIDO: DashboardShell real + todos los
│                                       #   fragmentos de pantalla inline (sin iframe) + toggles
└── assets/
    ├── theme.css                       # copia del catálogo (+ brand override appended, Phase 3)
    ├── kit.css                         # copia del catálogo
    └── fonts/{Geist,GeistMono}-Variable.woff2

project/mockup-artifacts/{run-id}/      # TRANSITIONAL — limpiado en Phase 4 salvo --keep-artifacts
├── render-plan.md                      # Phase 1 output (mck-context-analyst): tabla + nav surface
└── fragments/{slug}.html               # Phase 2: fragmentos por pantalla (Phase 3 los inlina al deliverable)
```

> **Nombre del entregable:** `{slug}-mockup.html`, donde `{slug}` = `Slug` de `project-config.md`
> (ej. `miapp-mockup.html`). Auto-descriptivo al mandárselo a un cliente. Si no hay slug en
> project-config → fallback `mockup.html`. Se abre por doble-click directo (no es `index.html`).
> Modelo B': el deliverable es **un solo `{slug}-mockup.html`** (shell real + fragmentos inline).
> `lucide.json` NO se copia — iconos inline (`methodology/icon-resolution.md`). Los fragmentos son intermedios.

---

## 6. Turn boundaries

| Turn | Phases                                                          | Stops with                    |
| ---- | -------------------------------------------------------------- | ----------------------------- |
| 1    | Phase 0 (mode + cleanup pre-flight + readiness gate) + Phase 1 (render-plan) | **CP1** inline |
| 2    | Phase 2 (render por tier: pure/extended inline + custom batched) | Auto-completion notifications |
| 3    | Phase 3 (ensamble index + copia assets)                        | **CP2** Plan Mode             |
| 4    | Phase 4 (auto-checklist + cleanup)                             | Done — carpeta lista          |

`validar` mode salta Phases 1-3 (solo integridad + report).

---

## 7. Flow overview

```
/design output ──▶ [P0 gate] ──▶ [P1 render-plan] ──▶ CP1 ──▶ [P2 render por tier]
                                  (mck-context-analyst)         pure/ext: orchestrator
                                                                custom: mck-screen-renderer (batch)
                                                                      │
   project/mockup/ ◀── [P4 checklist] ◀── CP2 (Plan Mode) ◀── [P3 ensamble + assets]
```

Usar **TodoWrite** desde Turn 1: Phase 0 · Phase 1 · **CP1** · Phase 2 · Phase 3 · **CP2** · Phase 4.

---

## 8. Phase 0 — Cleanup pre-flight + mode + readiness gate

1. **Cleanup pre-flight** (espejo `tk-design §7.1`): si `project/mockup/` existe → AskUserQuestion tabla
   1/2/3: `[1] Backup a project/mockup.backup-{ts}/ + remove (recommended)` · `[2] Remove directo
   (irreversible, extra confirm)` · `[3] Cancelar`. **NUNCA `rm -rf` directo** sin confirmación.
2. **Hard gate:** `project/planning/16_DESIGN.md` + `project/planning/16_DESIGN/` deben existir (con
   `--client <path>` → relativo a ese root). Si faltan → STOP plain: _"No puedo continuar — no hay
   output de /design. Corre `/design` primero."_
3. **Mode dispatch:** default → Phase 1; `validar` → Phase 4 validation-only.

---

## 9. Phase 1 — Render-plan (mck-context-analyst, serial)

Delegated: `mck-context-analyst` (1 invocation). Lee el **frontmatter `tier:` de cada SCR** (fuente del
tier) + `16_DESIGN §8 Kit-bindings` (lista kit-pure) + `§3 Screen Map`/`§4`/`§6`/`§7` + SCR/CMP files,
emite `project/mockup-artifacts/{run-id}/render-plan.md` (tabla SCR × tier × slug × path × refs + mapping
kit-pure→catálogo + tally + gaps). **El tier se lee, no se recalcula.** Agent return = 5-8 líneas plain.

Skill grounding inject (CC.md §2): pasar en el prompt los paths de `tk-mockup/methodology/tier-strategy.md`
+ `fx-presentation-kit/SKILL.md` (ver §13 Agent contracts).

### CP1 — Clasificación + go-ahead (inline)

```
🛑 CP1 — Pantallas a renderizar

Leí el diseño: {N} pantallas.
  • {C} custom — se diseñan desde cero (dashboards, tooling) → render por agente
  • {E} kit-extended — kit + ajustes → compongo inline
  • {P} kit-pure — ya las shippea el kit → adjunto del catálogo

{Si hay gaps: "⚠ Detecté: SCR-012 referencia CMP-007 que no existe."}

### Opciones
| 1 | Renderizar todo (recommended)                          |
| 2 | Solo un subconjunto — dime cuáles                       |
| 3 | Cancelar                                                |
```

---

## 10. Phase 2 — Render por tier

Dispatch según `render-plan.md`:

| Tier           | Quién                                          | Cómo                                                                      |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `kit-pure`     | Orchestrator (sin spawn)                       | Toma el body de `fx-presentation-kit/screens/{name}.html` y lo emite como fragmento (`mck-screen` protected / `mck-auth-screen` auth) — detalle y mapeo de slug en `methodology/tier-strategy.md`. |
| `kit-extended` | Orchestrator (sin spawn)                       | Fragmento: primitiva/screen base del catálogo + deltas del SCR light (`§3 Customizations`). Inline. |
| `custom`       | `mck-screen-renderer` (batched, cap 6, batch 4) | Fragmento compuesto de `§5`+`§3`+`§9`+`§11` + CMP. Per-target atomicity + re-spawn (máx 2). |

**Batching (custom):** `ceil(C / batch_size)` batches por mensaje, cap 6 paralelos. No mezclar tiers.

**Post-batch integrity (orchestrator):** stat cada `{slug}.html` esperado. Faltante o `blocked` → re-spawn
en batch de 1 con `corrective_feedback` (máx 2). Lint por archivo: device frame presente · cero
`data-icon` sin resolver · cero términos de `anti-jerga.md` en texto visible. Falla → re-spawn.

> **Gap de spec → `blocked`, no improvisar** (CODING.md §8): el renderer marca la pantalla `blocked` con
> el motivo; el orchestrator la deja fuera del render y la surfacea en CP2. No se inventa el contenido.

---

## 11. Phase 3 — Ensamble + assets

1. **Copia assets** a `project/mockup/assets/`: `theme.css`, `kit.css`, `fonts/Geist-Variable.woff2`,
   `fonts/GeistMono-Variable.woff2` desde `fx-presentation-kit/`. (Self-containment — el cliente no tiene
   `.claude/`.)
2. **Branding step (cierra el gap de identidad).** Leer `project-config.md` (nombre del producto) +
   `16_DESIGN.md §0` (postura visual → tema default). **Append** al `assets/kit.css` copiado un bloque
   `:root { --brand-logo-text: '<iniciales>'; --brand-product-name: '<nombre>'; }` (+ `--brand-primary`
   si el proyecto tiene color propio). Como las pantallas usan brand var-driven (elementos `.pk-logo` /
   `.pk-brand-name` / `.pk-auth-logo` **vacíos** → `::before` toma la var, ver `render-contract.md`), todo
   el mockup adopta la identidad del proyecto desde un solo lugar. El **tema default** del index se fija
   según `§0` (ej. midnight para posturas "Midnight Executive").
3. **Ensamble del shell B'** desde `templates/index.template.html` (`merge_strategy: orchestrator-merge`):
   - Construye **el sidebar + bottomnav** del shell desde la `nav surface` del render-plan (la nav real
     del producto, §2.4 / navigation.ts) — una sola vez, con iconos inline. Llena `{{SIDEBAR_NAV}}` /
     `{{BOTTOMNAV}}` / `{{HEADER_ACTIONS}}` (bell → **feed** de notificaciones · avatar → perfil) /
     `{{ICON_MENU}}`. La campanita va al feed (`notifications.html`), NO a las preferencias — ver
     `tier-strategy.md §Notificaciones`.
   - **Inline los fragmentos:** los body fragments `(protected)` (`mck-screen`) van en `{{APP_PANELS}}`;
     los auth (`mck-auth-screen`) en `{{AUTH_PANELS}}`. Consolida los `<style>` locales en `{{SCREEN_STYLES}}`.
   - Llena `{{SCREEN_OPTIONS}}` (selector agrupado), `{{APP_SLUGS_JSON}}`, `{{TITLES_JSON}}`,
     `{{FIRST_SCREEN}}` / `{{FIRST_TITLE}}`, `{{PROJECT_NAME}}` / `{{LOGO_TEXT}}`.
   - **Tema default** (paso 2): si la postura del §0 es midnight/dark, mover la clase `on` al botón
     correspondiente + agregar la clase al `<html>` + `state.theme`.
   - Pantallas `blocked`: option deshabilitada en el selector + nota; no se inlinan.
4. **Output = un solo `{slug}-mockup.html` autocontenido** (`{slug}` de `project-config.md`; todos los
   fragmentos inline, sin iframe — toggle de tema instantáneo, zippable). Verifica: cero `data-icon` sin
   resolver, brand var-driven (`.pk-logo`/`.pk-auth-logo` vacíos), assets en `assets/` (el shell los usa).

---

## 12. Phase 4 — Auto-checklist + cleanup

Validación final (también es el modo `validar` standalone):

| Check                                                            | Si falla                          |
| --------------------------------------------------------------- | --------------------------------- |
| Toda SCR del Screen Map (no `blocked`) está inlineada en el deliverable (`<section data-screen="{slug}">`) | STOP — re-render faltantes        |
| `assets/` completo (theme.css + kit.css + 2 woff2)              | STOP — re-copiar                  |
| Cero `data-icon` sin resolver en `{slug}-mockup.html`           | re-render la pantalla afectada    |
| Cero términos de `anti-jerga.md` en texto visible               | surface en CP / corregir copy     |
| `{slug}-mockup.html` lista todas las pantallas en el selector  | re-ensamble                       |

Cleanup `{run-id}/` (respeta `--keep-artifacts`, borra solo el subdir del run, nunca el padre — espejo
`tk-design §20.3`).

### 12.1 Publicación + commit de cierre

El mockup durable (`project/mockup/`) ya está listo. Cierra el workflow ofreciendo publicar y commiteando el trabajo (como `tk-implement` cierra; el CP de abajo + el gate del workflow = autorización, `GIT.md §2`).

1. **CP publicación** (plain es-MX; opciones estructuradas por default, tabla numerada como fallback — `CC.md §3`):

   ```
   El mockup quedó listo en project/mockup/. ¿Publicarlo a proposals.timekast.mx?
     1. No por ahora (solo queda local)
     2. Sí, publicar
   ```

   - **Sí** → corre por Bash **`npx @timekast/factory publish mockup`** (CLI directo, NUNCA el script `factory:publish`). Surfacea la URL que imprime el CLI. Modelo honesto: link no-adivinable + `noindex`, **sin password** (ver [`proposal-publishing.md`](../../docs/proposal-publishing.md)).
   - Si el CLI no conoce `publish` (npx resolvió una versión vieja) → avisar plain _"actualiza con `npx @timekast/factory@latest`"_ y seguir con el cierre.

2. **Commit de cierre — `CP-commit`** (`GIT.md §3.5`): ofrecer `1. nada / 2. commit / 3. commit + push`. `git add` de `project/mockup/` **+ `project/.publish.json` si se publicó** (vive FUERA del dir — no omitir), subject `docs(mockup): …`. Sin push salvo opción 3 (branch actual, NUNCA main — guard de main + degrade headless a opción 2 por `GIT.md §3.5`). El cierre lo hace el workflow, no el CLI.

---

## CP2 — Plan Mode formal (antes de durable client-facing)

`fx-workflow-authoring §7`: output durable client-facing = HIGH-risk → Plan Mode. Entrar con synthesis:

- Cobertura: {R} pantallas renderizadas de {N} ({pure}+{ext}+{custom}).
- `blocked`: lista + motivo (gap de spec — requieren volver a `/design`).
- Warnings: anti-jerga matches, kit-pure sin equivalente, CMP faltantes.

```
| 1 | Aceptar → escribir project/mockup/ + Phase 4 checklist            |
| 2 | Editar → re-render pantallas marcadas (1 ciclo)                   |
| 3 | Resolver blocked → volver a /design para esas SCR, luego re-correr |
| 4 | Rechazar → no se escribe el mockup                                |
```

---

## 13. Invalidation handling

> Per `fx-workflow-authoring §10`.

| Caso                                                              | Política                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/design` cambia 1-2 SCR después del mockup                      | **Patch:** re-render solo esas pantallas (re-spawn / inline) + re-ensamble del index.      |
| Cambio estructural (nav, secciones, tiers de varias SCR)        | **Regen completo:** re-correr desde Phase 1 (el render-plan cambió).                       |
| SCR `blocked` por gap de spec                                    | NO improvisar. Marca `blocked`, surface en CP2. Resolución = volver a `/design` (opt 3).   |
| Catálogo (`fx-presentation-kit`) cambia tokens/primitivas        | Re-copiar assets (Phase 3) + re-render. El skin activo de la app no aplica: `theme.css` es un snapshot congelado. |
| User cambia tema/branding del mockup                            | Runtime (toggle del index / `--brand-*` en `kit.css` copiado). No requiere re-render.      |

---

## 14. Subprocess delegation summary

| Agent                 | Phase | Parallelism             | Input                                                          | Output                              |
| --------------------- | ----- | ----------------------- | ------------------------------------------------------------- | ----------------------------------- |
| `mck-context-analyst` | 1     | serial 1×               | `16_DESIGN*` + nav surface (§2.4) + catalog screens (kit-pure map) | `mockup-artifacts/{run-id}/render-plan.md` (tabla + nav surface) |
| `mck-screen-renderer` | 2     | batched, cap 6 (batch 4) | custom targets[] + screen.template + kit.css + lucide.json + CMP | `mockup-artifacts/{run-id}/fragments/{slug}.html` (body fragment, Phase 3 lo inlina) |

**Tools allowlist (ambos):** `Read, Grep, Glob, Write`. **Model:** `sonnet` en ambos. El renderer es
**excepción declarada** a la taxonomía del eje A (`fx-execution-policy §3`): por naturaleza es síntesis
(no bajaría por el criterio general), pero baja a `sonnet` por **stakes bajos** — `/mockup` produce un
preview desechable y decreciente cuyo output visual el owner valida en segundos, así que el costo de un
error es mínimo. El analyst es extract multi-source (tier `sonnet` por criterio general, sin excepción).
Contratos completos en sus `.md` (`mck-context-analyst.md`,
`mck-screen-renderer.md`): input contract + output contract + return summary + "cuándo NO usar".

> 🔴 **`/mockup` NO consume `.claude/policy/quality-gates.json` — la exención queda escrita, no implícita.** Sus dos subprocesos son los que esta tabla declara, fijos; **no** derivan de `panel_by_risk`, y este workflow no corre panel de revisión propio.
>
> **Por qué:** las reglas del registry matchean globs de código bajo `src/`. Un run de `/mockup` escribe HTML estático y desechable en su directorio de salida — no matchearía ninguna, resolvería riesgo 0, y el `panel_by_risk` de ese nivel está **vacío**. Aquí eso no es una pérdida (no hay panel que perder), pero declararlo importa igual: sin la nota, el próximo mantenedor que viera el registry cableado en `/implement` podría cablear este workflow a un nivel vacío creyendo que gana escrutinio, y no ganaría nada.
>
> **Tampoco se cablea la evaluación plan-time**, aunque exista como doctrina general ([`fx-execution-policy §6`](../fx-execution-policy/SKILL.md)): la partición diff-time/plan-time es doctrina del kit; la exención es decisión de este workflow. El output de `/mockup` es un preview que el owner valida visualmente en segundos — esa validación humana **es** su gate, y ninguna escala de riesgo de código la sustituye.

**Skill grounding inject (CC.md §2):** el orchestrator cita en cada prompt los paths de
`tk-mockup/methodology/*` + `fx-presentation-kit/SKILL.md` (+ `kit.css` / `partials/` para el renderer).

`kit-pure` + `kit-extended` NO se delegan — orchestrator inline (no son síntesis pesada).

---

## 15. Templates

- `templates/screen.template.html` — fragmento de una pantalla (solo su body + toggle de estados; el shell pone device frame, sidebar, header y bottomnav).
- `templates/index.template.html` — shell B' autocontenido (selector de pantallas + toggles + fragmentos inline, sin iframe).

Regla "no template, no artifact" (`fx-workflow-authoring §11`): no se genera HTML sin su template.

---

## 16. Methodology index

- `methodology/render-contract.md` — qué es fuente (copy/§5) vs referencia (ASCII), CMP 1ª clase, gap→blocked.
- `methodology/tier-strategy.md` — estrategia por tier + mapping kit-pure→catálogo + batching.
- `methodology/icon-resolution.md` — `data-icon` → SVG inline desde `lucide.json`.
- `methodology/anti-jerga.md` — solo `§11` literal; términos técnicos prohibidos en texto visible.

---

## 17. Out of scope

- Diseñar / clasificar pantallas (eso es `tk-design`).
- One-pager de visión / pitch client-facing (eso es `tk-proposal`).
- Preset Material/Flutter del skin (extensión post-v1 del catálogo).
- Export a PDF del mockup (usar `/pdf` sobre un render si se necesita).

---

_TimeKast Factory — tk-mockup (render /design → recorrido HTML navegable, consume fx-presentation-kit)_

# Sistema de Presentación de la Factory — Diseño

> **Qué es:** el documento fundacional del sistema que traduce el output de `/design` (y `/discovery`) en artefactos visuales client-facing. Define dos workflows (`/mockup`, `/proposal`) y el skill kit-shipped de primitivas que ambos comparten (`fx-presentation-kit`).
>
> **Estado:** diseño v1. **PoC de fidelidad validado (GO)** — ver `project/factory/poc-mockup/`. **Auditado por `fx-factory-reviewer` (2026-06-05): HOLD resuelto** — las condiciones del gate están integradas (ontología → skill con assets, drift-check → pre-commit, boundary con `tk-design`, autoría completa). Prefijo del catálogo corregido a `fx-*` (ver §3.1).
>
> **SSOT:** este archivo. Los workflows (`tk-mockup`, `tk-proposal`) y el skill (`fx-presentation-kit`) no redefinen lo que aquí se decide — lo ejecutan.

---

## 1. Por qué existe

La Factory produce specs ejecutables a lo largo de `/discovery → /design → /backlog → código`. Pero entre el design y el cliente **no hay artefacto visual**: lo único client-facing es el `/proposal` legacy (`.agent/workflows/proposal.md`), un `PROPOSAL.md` de texto plano sin una sola pantalla — y que además **no corre en el runtime Claude Code ni se mergea a `main`** (BR-FACTORY-001).

El stakeholder validó a mano que se puede generar un documento visual fiel al design system del kit, en lenguaje 100% cliente, abrible con doble-click (`fimubac/project/presentation/index.html`). Este sistema **sistematiza ese artefacto** y lo separa en sus dos usos reales.

**Hallazgo técnico que gobierna todo el diseño:** los componentes del kit son **React/Next.js** (`.tsx`, Radix, react-hook-form). Un HTML estático no los puede importar. La solución no es copiar el experimento ni el React — es un **catálogo de primitivas HTML+tokens derivado del SSOT del look** (`src/app/globals.css`), que ambos artefactos componen.

---

## 2. Los dos workflows

| | **`/mockup`** (`tk-mockup`) | **`/proposal`** (`tk-proposal`) |
| --- | --- | --- |
| **Qué es** | Recorrido de pantallas navegable | One-pager de visión del producto |
| **Función** | Artefacto **dev + validación UX con cliente** (doble) | **Pitch / validación de visión** client-facing |
| **Inputs** | Solo `/design` (`16_DESIGN` + `SCR`/`FLW`/`CMP`) | `/discovery` **y** `/design` |
| **Cobertura de pantallas** | Exhaustiva (todas las SCR, estrategia por tier) | Curada (las estelares, ~6-8) |
| **Dependencia entre sí** | Ninguna | **Ninguna** — `/proposal` renderiza sus pantallas curadas standalone con el mismo catálogo; NO requiere que `/mockup` haya corrido |
| **Origen** | Net-new en CC | **Net-new en CC** — el `.agent/proposal` legacy es referencia de contenido (sus secciones), no un sistema a migrar |
| **Output** | `project/mockup/{slug}-mockup.html` | `project/presentation/{slug}-proposal.html` |
| **Registro visual** | `pk-*` (neomórfico, producto) | `pe-*` editorial (narrativa) + `pk-*` (pantallas curadas) |

Ambos componen **un solo catálogo** (`fx-presentation-kit`). Son artefactos independientes con propósitos distintos; comparten el motor visual (el catálogo), no el contenido ni la ejecución.

---

## 3. El catálogo de presentación (`fx-presentation-kit`)

### 3.1 Ontología — es un `fx-*` con assets (hermano de `fx-pdf-export`)

> **Corrección (doble, del review + stakeholder):**
> 1. Una versión previa afirmaba que "los `sk-*` son puro `SKILL.md` y meter assets rompe el patrón". **Falso:** `fx-pdf-export` ya bundlea assets ejecutables (`resources/timekast-style.css` + `scripts/build-pdf.mjs`), consumidos por path e invocados por `/pdf`.
> 2. Descarté `fx-*` diciendo "no shippea a derivados". **También falso:** varios `fx-*` sí shippean (`fx-pdf-export`, `fx-workflow-authoring`); el único que no shippea es `fx-distribution` (factory-origin, lado build/CLI). El reviewer luego recomendó `sk-*` citando como precedente a `fx-pdf-export` — pero ese precedente es **`fx-*`**, así que apunta a `fx-`, no a `sk-`.

La distinción real `sk-*` vs `fx-*` **NO es "shippea vs no shippea"** — es **producto vs metodología**:

- `sk-*` = sistemas que la **app derivada usa en runtime** (navigation, ui, notifications, security, pwa, email). Parte del producto.
- `fx-*` = **utilidades de la metodología Factory** (autorear workflows, generar PDFs de docs). Shippean a derivados, pero no son parte del producto.

El catálogo de presentación **no es parte del producto** — la app derivada nunca lo usa en runtime. Es un asset que las **herramientas de la metodología** (`tk-mockup`/`tk-proposal`) consumen para generar artefactos de validación/pitch. Es el **hermano directo de `fx-pdf-export`**: ambos son utilidades de presentación de la Factory que bundlean assets de estilo (`fx-pdf-export`: `resources/*.css` para PDFs; este: `theme.css`+`partials/` para mockups).

→ Prefijo correcto: **`fx-presentation-kit`** (skill kit-shipped con assets, exactamente la forma de `fx-pdf-export`).

Lo que se mantiene de la recomendación del review: entra en la ontología CC.md §7 (Skill `fx-*` → `.claude/skills/fx-*/`); `skill:lint` valida su `SKILL.md`; `factory:update` lo versiona; se consume por path. Un bundle suelto en `.claude/presentation-kit/` habría quedado fuera de todo eso (primitiva no mapeada).

**Tercera razón, decisiva (distribución):** el perfil `core` de `distribution/profiles.json` incluye `fx-*` y **excluye `sk-*`**. Como el catálogo debe shippear en core (es metodología, llega a todo derivado — incluidos los no-Next), tiene que ser `fx-*`; un `sk-presentation-kit` quedaría **excluido del core** y los derivados no-Next se quedarían sin él. Ver §3.9.

### 3.2 Estructura

```
.claude/skills/fx-presentation-kit/
├── SKILL.md      # índice de primitivas + reglas de uso + extensión + loop de enriquecimiento
├── theme.css     # snapshot FROZEN (neomorphism, vocab --neo-*) — autónomo, NO se regenera (ver §3.3)
├── shell.html    # cascarón: device-frame mobile/desktop + JS de toggles
├── partials/     # primitivas HTML (núcleo emergió del PoC, crece con uso)
├── icons/        # Lucide vendorizado (SVG sprite/inline, sin CDN) — ver §3.5
├── fonts/        # Geist embebida (woff2) para fidelidad tipográfica determinística (headless) — ver §3.6
└── screens/      # pantallas kit-pure PRECONSTRUIDAS (se adjuntan tal cual)
```

### 3.3 Snapshot autónomo congelado (FROZEN desde v11)

`theme.css` es un **snapshot estático** del look neomorphism, **autónomo y desacoplado** de `src/app/globals.css`. Hasta v10 se derivaba por un script `generate:presentation-theme` con drift-check en pre-commit; en **v11 (EPIC-01-skin-system, SKINS-005) ese pipeline se retiró**: con el sistema de skins intercambiable ([`sk-skins`](../skills/sk-skins/SKILL.md)), regenerar la presentación desde el skin activo dejó de tener sentido — la presentación debe verse siempre en el neomorphism original sin importar qué skin corra la app derivada.

> **Mantenimiento:** `theme.css` lleva el header `FROZEN`; **no se regenera** (el generador `generate:presentation-theme`, su script en `package.json` y su hook de `lint-staged` fueron eliminados). Su vocab es el `--neo-*` legacy a propósito (autocontenido, 0 dangling vars). Si alguna vez hubiera que refrescarlo, se edita el snapshot a mano. Histórico del mecanismo de derivación (pre-v11) → `CHANGELOG` v11.0.0.

> **Por qué importa (evidencia del PoC):** el experimento hecho a ojo usó sombras `--neo-light: …0.75 / --neo-dark: …0.45`; el kit real usa `0.55 / 0.35`. El PoC derivado quedó **más fiel que el experimento**. Copiar a mano garantiza drift; derivar + check de pre-commit lo elimina.

> **Dónde corre el script y qué pasa sin `globals.css`** (derivados no-Next) → §3.9.

### 3.4 Primitivas (núcleo emergido del PoC)

Las primitivas `pk-*` no se enumeraron de antemano — **emergieron** renderizando 2 pantallas reales de proyectos distintos, que terminaron compartiendo un solo `theme.css`:

- **Shell / layout:** `pk-device` (mobile 375 / desktop) · `pk-sidebar` · `pk-header` · `pk-body` · `pk-bottomnav` · `pk-stage`
- **Superficie:** `pk-card` · `pk-card-sm` · utilities `neo-*` (copia 1:1 del kit)
- **Componentes:** `pk-table` · `pk-kpi` · `pk-pill` (badge) · `pk-btn` · `pk-bubble` (chat) · `pk-composer` · `pk-sqlbox` · `pk-search` · `pk-chip` · `pk-empty` · `pk-sk` (skeleton) · `pk-fresh`

El catálogo **crece con uso real**, no por enumeración (ver §3.8).

### 3.5 Iconos — Lucide vendorizado

El kit usa **Lucide** (parte del stack). Emojis no son fieles. El catálogo vendoriza Lucide como **SVG sprite / inline local** (sin CDN → conserva el doble-click offline).

> **Costo real (review):** `src/config/navigation.ts` importa los iconos como **símbolos JS** (`import { Home, Settings, … } from 'lucide-react'`), no como un mapa declarativo plano. Vendorizar requiere **AST-parse de `navigation.ts`** (o un manifest `icons.json` que el catálogo mantenga) para resolver símbolo → SVG. `lucide-react` ya está en deps, así que los SVG están disponibles localmente. El mapeo a `navigation.ts` garantiza que los iconos del recorrido sean los del producto real. Eje de fidelidad, no cosmético.

### 3.6 Tipografía y branding

- **Geist embebida** (woff2 en `fonts/`, `@font-face` local). No es opcional: el output se abre tanto en el navegador del dev como, en headless, en el del cliente final — que puede no tener Geist. Embeberla da fidelidad tipográfica determinística cross-entorno (el PoC usó fallback `system-ui`, marcado pendiente).
- **Branding como capa:** `theme.css` expone variables de marca (`--brand-primary`, `--brand-logo-text`, `--brand-product-name`) sobre los tokens del kit. Un derivado cambia su identidad tocando solo esas vars.

### 3.7 Pantallas kit-pure preconstruidas

`screens/` trae las pantallas `kit-pure` (login, forgot/reset-password, notificaciones…) ya armadas. El mockup las **adjunta tal cual**; cero trabajo por proyecto.

### 3.8 Loop de enriquecimiento (curado a mano, NO autogen)

Distinción clave: `INVENTORY.md` / `HOOKS.md` son **autogens** que reflejan lo que YA existe en un repo, consumidos por el agente para no repetir. Este catálogo es lo opuesto — **base de conocimiento que arranca en diseño y se cura manualmente**. Crece porque los derivados comparten la Factory y convergen a requerimientos de UI similares: cuando una pantalla `custom` (típicamente feature L) produce una primitiva nueva reusable, se cura y se promueve al catálogo vía **factory-ticket**. Enriquecimiento manual con uso real cross-proyecto.

### 3.9 Distribución y comportamiento multi-stack (core/full, derivados no-Next)

**Shippea en `core` por prefijo.** `distribution/profiles.json` define `full` (metodología + boilerplate Next, incluye `sk-*`) y `core` ("solo el cerebro `.claude/`, sin `src/`" — para derivados no-Node/no-Next: Python, Flutter, Go). El `core` **incluye `tk-*`/`kb-*`/`fx-*`** y **excluye `sk-*`**. Por eso `tk-mockup`, `tk-proposal` y `fx-presentation-kit` shippean en core **automáticamente por su prefijo**, sin config extra.

**El theme viaja como snapshot congelado.** `theme.css` se **commitea dentro de `fx-presentation-kit/`** y viaja en el tarball (core y full); el derivado lo consume tal cual, sin regenerarlo. Hasta v10 se derivaba de `src/app/globals.css` por un script con drift-check en pre-commit; en **v11 ese pipeline se retiró** (ver §3.3) — `theme.css` es ahora un snapshot `FROZEN` autónomo en vocab neomorphism, desacoplado del skin activo de la app.

**Estructura universal vs skin reemplazable.** Las primitivas `pk-*` (device-frame, table, kpi, bubble, card…) son **estructura HTML stack-agnóstica**; el `theme.css` (tokens, sombras, color) es el **skin** — el preset que viaja es el neomórfico del kit base. Esa separación es lo que hace el sistema multi-stack:

| Derivado | Qué pasa |
| --- | --- |
| **Next + design system del kit** (full) | Fidelidad total. Si customizó tokens, regenera `theme.css` desde su propio `globals.css` (el script viaja en full). |
| **Next con otro skin** | Regenera `theme.css` de su `globals.css`; primitivas `pk-*` intactas. |
| **No-Next** (core: Flutter/Python/Go) | Usa el preset neomórfico que viaja como **wireframe estilizado por defecto**. Si su producto tiene design system propio (ej. Material 3), **adapta el `theme.css`** (capa tokens+branding) para acercar el look — las `pk-*` no cambian. **Preset Material/Flutter** = extensión futura del catálogo (reconocida, post-v1). |

> El mockup es un artefacto de **presentación, no el producto**. Para un derivado no-Next sigue siendo válido como "así fluye / así se ve la app"; la fidelidad es máxima cuando comparte el design system del kit y aproximada-pero-útil cuando el stack diverge — con el skin aislado en `theme.css` para cerrar esa brecha sin tocar la estructura.

---

## 4. El contrato de render (validado por el PoC) + frontera con `tk-design`

La lección central: **el ASCII no es transcribible**. Cada input del SCR se trata distinto:

| Input del SCR | Rol | Cómo se usa |
| --- | --- | --- |
| `§3 ASCII 375px` | **Referencia de layout, NO fuente** | Se interpreta la estructura ("esto es un hilo de chat" / "dashboard con KPIs + tabla") y se recompone con primitivas. Nunca carácter por carácter. |
| `§11 Copy es-MX` | **Fuente literal** | Pegado tal cual. Cero reescritura. |
| `§5 SK Components` | **Binding → primitiva** | Cada slot mapea a una primitiva `pk-*`. |
| `§9 States` | **Estados toggleables** | Cada estado del catálogo se vuelve un toggle real. |
| `CMP-XXX.md` | **Spec de componente custom (primera clase)** | Se lee su prop API + token usage. No se improvisa. |

**Consecuencia:** el render es **síntesis dirigida por spec**, no transcripción. Por eso el agente renderizador (`mck-screen-renderer`) corre en **Opus**.

> **Frontera con `tk-design` (review — flow-drift):** `tk-design` decide **QUÉ es cada pantalla** (el spec: ASCII, tier, binding, copy) y emite la clasificación de tier + screen-map como SSOT en `16_DESIGN §3`/`§8`. `tk-mockup` decide **CÓMO se ve** (el render HTML). **El tier es SSOT de `tk-design`** — `mck-context-analyst` lo **consume** de `16_DESIGN`, no lo re-deriva. Solo añade el binding tier→estrategia-de-render.

---

## 5. Estrategia por tier

`tk-mockup` lee la clasificación de tier ya canónica en `16_DESIGN §3`/`§8` (no la re-deriva) y adapta el render:

| Tier | Estrategia |
| --- | --- |
| `kit-pure` | Adjunta el `screens/*.html` preconstruido del catálogo. Cero trabajo por proyecto. |
| `kit-extended` | Primitiva base del catálogo + las deltas del SCR light (`§3 Customizations`). |
| `custom` | Compone `§5` binding + ASCII `§3` (como layout ref) + copy `§11`. **CMP custom → lee `CMP-*.md`.** Si pide una primitiva inexistente → la construye + marca candidato a factory-ticket (§3.8). |

> La premisa "el `§5` nombra un set finito" aplica a las **primitivas del kit**, no a los **CMP** (ilimitados, por proyecto — y suelen ser las pantallas estelares).

---

## 6. Decisiones de diseño (review integrado)

| # | Decisión |
| --- | --- |
| **B1** | ASCII = referencia de layout, no fuente. Render = síntesis. **Validado por el PoC.** |
| **B2** | _(diseño original)_ `theme.css` derivado por script de `globals.css` + drift-check en pre-commit. **v11: el generador se retiró** — `theme.css` es ahora un snapshot `FROZEN` autónomo (ver §3.3). |
| **I1** | Catálogo = **`fx-presentation-kit`** (skill kit-shipped con assets, hermano de `fx-pdf-export`). `fx-`, no `sk-` (es metodología, no producto) ni bundle suelto. |
| **Distribución** | Shippea en `core` por prefijo (`tk-*`/`fx-*`; core excluye `sk-*`). `theme.css` generado en origen + snapshot que viaja; estructura `pk-*` universal vs skin `theme.css` reemplazable → multi-stack, incl. derivados no-Next (§3.9). |
| **I2** | `tk-mockup` (heavy) lleva **CP1 + CP2** + política de invalidación (§7.1). |
| **I3** | CMP custom = primera clase: se leen de `16_DESIGN/components/CMP-*.md`. **Validado por el PoC.** |
| **I4** | `tk-proposal` net-new en CC, **independiente de `/mockup`**; el legacy es referencia de contenido. |
| **Tier-SSOT** | El tier lo decide `tk-design` (`16_DESIGN §3/§8`); `tk-mockup` lo consume (§4). |
| **mck-prefix** | Registrar `mck` en `agent-taxonomy-lint.sh VALID_PREFIXES` antes del primer commit de un agent (hito 4). |
| **Iconos** | Lucide vendorizado vía AST-parse de `navigation.ts` / manifest (§3.5). |
| **Geist** | Embebida (woff2), no fallback — el runtime headless lo hace no-opcional (§3.6). |
| **Anti-jerga** | Mecanismo en `methodology/anti-jerga.md`: lista de términos prohibidos (Next.js, API, DB, server action, RBAC, schema…) + el agente renderiza solo el `§11 Copy es-MX` literal, no inventa copy. Anclado a CC.md §3. |
| **Menores** | FLW se lee como archivos `flows/FLW-*.md` y/o tabla `16_DESIGN §4` (ambas) · schemas → `methodology/` · skin custom (`kb-visual-direction`) = limitación conocida post-v1. |

---

## 7. Autoría de los workflows

### 7.1 `tk-mockup` (heavy, `fx-workflow-authoring`)

**Frontmatter (9 fields):** `name: tk-mockup` · `family: documentation` · `model: opus` · `parallelism_unit: batch` · `concurrency_cap: 6` · `merge_strategy: orchestrator-merge` · `auditor_step: false` · `last-verified`.

```
.claude/skills/tk-mockup/
├── SKILL.md
├── methodology.md          # thin index (preserva refs al hacer split)
├── methodology/            # tier-strategy.md · render-contract.md (ASCII=ref) · anti-jerga.md
├── templates/              # screen.template.html · index.template.html  (1 por artifact — "no template, no artifact")
└── CHANGELOG.md
.claude/agents/
├── mck-context-analyst.md   # tools: Read,Grep,Glob,Write — lee 16_DESIGN → screen-map+tiers(consumidos)+copy+FLW+CMP
└── mck-screen-renderer.md   # tools: Read,Grep,Glob,Write — model: inherit (Opus) — batch custom (cap 6)
.claude/commands/mockup.md   # thin: /mockup [--all] [--client <path>]
```

- **Fases + checkpoints:** (1) context → screen-map + tiers (consumidos de `16_DESIGN`) + FLW + CMP · **CP1** inline ("Clasifiqué N pantallas en X custom / Y ext / Z pure. ¿Renderizo?", tabla 1/2/3) · (2) render por tier en batches · (3) ensamble · **CP2** Plan Mode antes de escribir el output final (artefacto durable client-facing) · (4) auto-checklist.
- **Invalidación (bidireccional):** design cambia post-mockup → regen del screen afectado (patch); cambio estructural (nav/tiers) → regen completo. **SCR irrenderizable por gap de spec** (ASCII ambiguo, CMP sin prop API) → marca el screen `blocked` + surface al user en CP, **NO improvisa el contenido faltante** (CODING.md §8).
- **Agents justificados:** volumen (24-39 pantallas → batch) + contrato cerrado. `mck-screen-renderer` solo `custom`+CMP; pure/extended los resuelve el orchestrator.

### 7.2 `tk-proposal` (segunda etapa) — construido

**Frontmatter:** `name: tk-proposal` · `family: documentation` · `model: opus` · `parallelism_unit: none` · `concurrency_cap: 1` · `last-verified`.

```
.claude/skills/tk-proposal/
├── SKILL.md
├── templates/presentation.template.html   # el one-pager (1 template por artifact)
└── CHANGELOG.md
.claude/commands/proposal.md
```

- **Registro editorial (`pe-*`).** La narrativa NO usa el neomórfico del producto — usa `editorial.css` (primitivas `pe-*`: plano, hairlines, secciones full-bleed con anclas oscuras). Las **pantallas curadas del producto** sí usan `pk-*` (neomórfico): el contraste separa el pitch de la demo. Decisión del `ui-critic` validada sobre el PoC de fimubac.
- **3 tiers de audiencia** (Phase 0, parámetro de la propuesta): `negocio` (cero jerga) · `ejecutivo` sistemas-literate (SQL/MCP/RAG a nivel concepto, sin internals) · `developer` (profundidad técnica completa). El tier fija profundidad de arquitectura + vocabulario + el split "plataforma probada vs a medida". "Técnico" ≠ "developer" — se calibra.
- **Secciones (13):** Hero · Resumen ejecutivo · Objetivos · La herramienta (capacidades) · Usuarios y roles · Arquitectura (3 variantes por tier) · Flujo estrella · User journey (rol genérico, nunca nombre inventado) · Pantallas curadas · Alcance v1 + evolución · Supuestos/decisiones/riesgos · Criterios de éxito · Plan + próximos pasos.
- **Reglas de contenido (heredadas del legacy):** cero plazos-sin-confirmar/invención/framing-negativo (precios: permitidos desde 2026-09 en el Apéndice D de la propuesta Gamma, confirmados en CP1); jerga tier-aware; drift/gap reconciliation discovery↔propuesta. Enforcement en Phase 4.
- **Inputs:** `/discovery` (`00`, `02`, `03`, `04`, `05`, `06`, `07`) + `/design` (`16_DESIGN` + `SCR-*` para curar ~6-8 pantallas). **Renderiza las pantallas curadas standalone** con el catálogo — no depende de que `/mockup` haya corrido. Sin `/design` → propuesta sin sección de pantallas (no se inventa).
- **Synthesis curado en main loop (sin batch)** → **sin agents propios** (sin prefijo `prp-*`). Solo el render mecánico de pantallas curadas `custom` reusa `mck-screen-renderer`.
- **Output:** `project/presentation/{slug}-proposal.html` (self-contained, offline; assets vendorizados a `assets/` incluido el logo maker de `brand/`). Capa dual-brand `--maker-*` (TimeKast) lista para co-brand.

---

## 8. Roadmap de ejecución (riesgo primero)

| # | Hito | Estado |
| --- | --- | --- |
| 0 | **PoC de fidelidad** (gate go/no-go — B1) | ✅ **GO** (`project/factory/poc-mockup/`) |
| 1 | **Doc de concepto** (este archivo) | ✅ |
| 2 | **Gate `fx-factory-reviewer`** sobre este doc | ✅ HOLD resuelto (correcciones integradas) |
| 3 | **`fx-presentation-kit`** (skill + assets): `theme.css` _(v11: snapshot `FROZEN` autónomo; el generador `generate:presentation-theme` se retiró — ver §3.3)_ · primitivas del PoC en `kit.css` · Geist embebida (vendorizada sin dep) · **manifest completo `lucide.json`** (1912 iconos, sin anclaje a `navigation.ts`) · screens kit-pure | ✅ |
| 4 | **`tk-mockup`** (skill + methodology + agents `mck-*` + command, CP1+CP2 + invalidación) · `mck` registrado en `agent-taxonomy-lint.sh` · resolver de iconos inline desde `lucide.json` · output self-contained | ✅ (verificación estructural + smoke de render; falta validación cross-proyecto = hito 5) |
| 5 | **Validación cross-proyecto** (render completo de karen + fimubac con `16_DESIGN` real) | ✅ (fimubac + karen rendereados) |
| 6 | **`tk-proposal`** (net-new en CC) + **registro editorial `pe-*` en el catálogo** (`editorial.css` + capa `--maker-*` + logo vendorizado en `brand/`) | ✅ construido (skill + template + command + CHANGELOG; PoC fimubac re-apuntado al catálogo con paridad; falta smoke `/proposal` end-to-end) |
| 7 | **Gate `fx-factory-reviewer`** final sobre catálogo + workflows antes de canonizar | ✅ MERGE (findings aplicados: `output_dir` de `mck-screen-renderer`, Inter en catálogo, doc-sync taxonomía) |
| 8 | **Sistema de publicación** (`proposals.timekast.mx`): CLI `factory publish`/`unpublish` + hub estático en Vercel + `/publish` + Phase 4 de los workflows + `noindex` en templates | ✅ v1 estática (verificada en prod con fimubac); falta publicar `cli-v1.2.0` a npm para que `npx`/`pnpm factory:publish` resuelvan el comando |

> v1 mínima entregable = hitos 3-5 (catálogo + mockup probado cross-proyecto). Hito 6 cierra la v1 completa; hito 7 (gate) la canoniza; hito 8 le da deliverability (URL propia en vez de zip).
> **Publicación — modelo de seguridad honesto:** link no-adivinable + `noindex`, sin password (link-sharing tipo Google Doc; el unfurl puede filtrar). Detalle + ruta de evolución (password/expiración) → [`proposal-publishing.md`](./proposal-publishing.md).

---

## 9. Evidencia y referencias

- **PoC (gate validado):** `project/factory/poc-mockup/` — `index.html`, `chat-fimubac.html` (SCR-005 + CMP ChatThread), `dashboard-karen.html` (SCR-003), `theme.css` (catálogo emergente), `render-contract.md`.
- **Precedente ontológico (skill `fx-*` con assets):** `.claude/skills/fx-pdf-export/` (`resources/*.css` + `scripts/*.mjs`, consumidos por path, invocados por `/pdf`).
- **SSOT del look:** `src/app/globals.css` (elevation tokens `--elevation-*`, utilities `.surface-*`, 3 temas; vocab legacy pre-v11 `--neo-*` / `.neo-*` → ver `sk-tokens-neomorphism`).
- **SSOT de tier/screen-map:** `16_DESIGN §3`/`§8` (producido por `tk-design`).
- **SSOT de iconos de nav:** `src/config/navigation.ts` (`sk-navigation`).
- **Specs de referencia consumidos:** `fimubac/` y `karen-kein-bi/` `project/planning/16_DESIGN/`.
- **Experimento origen:** `fimubac/project/presentation/index.html`.
- **Autoría de workflows:** `.claude/skills/fx-workflow-authoring/`. **Ontología:** `.claude/rules/CC.md §7`.

---

_TimeKast Factory — Presentation System (design doc) · revisado fx-factory-reviewer 2026-06-05 · prefijo corregido a fx-_

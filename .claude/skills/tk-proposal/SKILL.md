---
name: tk-proposal
description: Documentation-family workflow that synthesizes /discovery (+ /design) into one versioned proposal markdown at `project/proposals/{slug}.md` with provenance frontmatter, then ships the visual deck through the Gamma API and shortens the link with short.io; audience-tiered (negocio / ejecutivo / developer), md-only fallback without Gamma, `validar` mode read-only. Primary invocation is `/proposal [validar] [--tier …] [--client <path>] [--md-only]`; do not run it outside that command.
family: documentation
model: opus
parallelism_unit: none
concurrency_cap: 1
auditor_step: false
last-verified: 2026-09-23
user-invocable: false
---

# tk-proposal — `/proposal` Workflow Skill

> Documentation-family workflow. Synthesizes `/discovery` (`00_DISCOVERY_BRIEF` + numbered) +
> `/design` (`16_DESIGN` + `SCR-*`) into a **single client-facing proposal markdown** at
> `project/proposals/{slug}.md` — a versioned narrative with provenance frontmatter. The MD is the
> **source of truth** (versioned in git); the visual deck is generated from it via the **Gamma REST API**
> and the shareable link is shortened with **short.io**. Artefacto **comercial / pre-venta** (alinear
> alcance con el cliente).

> **Slash command:** `/proposal [validar] [--tier …] [--client <path>] [--md-only]` (thin wrapper at `.claude/commands/proposal.md`).

---

## 1. When to use

Invoke after `/discovery` (+ ideally `/design`) exist. `/proposal` **sells the vision**: synthesizes the
discovery truth into a persuasive proposal markdown, then ships it as a Gamma deck. It does not design
screens (that's `/design`) nor render the full product walkthrough (that's `/mockup`).

**Use for:** propuesta comercial / pitch para alinear alcance con el cliente antes de arrancar. **Don't use
for:** el recorrido navegable de todas las pantallas (`tk-mockup`); diseñar/clasificar pantallas
(`tk-design`); documentación técnica interna.

> **Architectural principle:** la propuesta es **síntesis curada en el main loop**, no transcripción ni
> batch. El contenido se **funda en `/discovery` + `/design`** (cero invención — CODING.md §8). El
> **artefacto durable es un solo Markdown versionado** (`project/proposals/{slug}.md`) con provenance en
> frontmatter — el MD es la fuente de verdad. El **deck visual lo genera Gamma** desde ese MD; si el MD y
> el deck divergen, **el MD gana**. La **profundidad la fija el tier de audiencia**.

---

## 2. Tone guidance — plain language discipline

> **Source-of-truth:** `.claude/rules/CC.md §3`. Always-on. Esta sección añade vocab de proposal.

**Vocab a definir inline la primera vez por turno:**

- **Tier de audiencia** — perfil del lector: `negocio` (CEO no técnico) / `ejecutivo` (CEO que entiende
  conceptos sistémicos del proyecto a nivel idea — ej. integraciones, bases de datos, IA — sin internals) /
  `developer` (CTO/lead dev). Decide profundidad y vocabulario.
- **Gamma** — `gamma.app`, generador de decks visuales. El workflow le manda el body del MD vía la **API REST
  de Gamma** (`https://public-api.gamma.app/v1.0`, auth `X-API-KEY`), llamada por el helper bash
  `scripts/tools/gamma-generate.sh`, y Gamma devuelve la URL del deck. Es **one-shot**: Gamma no edita por
  API; los ajustes finos se hacen en su editor web. (NO usa el MCP/connector OAuth de Gamma — ese es para
  conversación interactiva; este pipeline es programático, usa la key del rail y corre headless.)
- **short.io** — acortador de URLs del equipo (`go.timekast.com/<slug>-propuesta`). El helper
  `scripts/tools/shortio.sh` (PROP-001) toma la URL de Gamma y devuelve la corta para compartir al cliente.
- **Provenance** — los campos `gamma_url` / `short_url` del frontmatter del MD: el rastro de qué deck y qué
  link corto se generaron desde este MD. Se escriben en P3, no antes.
- **Dirección visual (`image_style`)** — el texto libre que le dice a Gamma qué fotografía generar
  (`imageOptions.style`). Sin él, las imágenes salen genéricas; con él, hablan de la industria del cliente
  (ej. "fotografía editorial de imprenta industrial: prensas offset, pliegos impresos, tintas CMYK; sin texto
  en la imagen").
- **Logos del deck** — el de TimeKast (arriba a la izquierda) y el del cliente (arriba a la derecha) en todas
  las tarjetas. Gamma los guarda **por referencia**, así que viven en el bucket público del org
  (`https://assets.timekast.com/<slug>/logo.png`) y se suben con `scripts/tools/proposal-asset-upload.sh`.
  Una URL con hash de un sitio web, o una firmada que caduca (redes sociales), rompe el deck después.
- **inputText** — el body del MD (sin frontmatter) que se le manda a Gamma como contenido del deck.
- **Strip-frontmatter** — quitar el bloque `---` del MD antes de armar el `inputText`, para que `gamma_url`
  / `short_url` nunca lleguen al deck (evita loop de provenance).

**CP narration pattern:** (1) 2-3 líneas plain de QUÉ pasó; (2) términos de negocio (no IDs crudos); (3)
gaps / supuestos que requieren al user, explícitos; (4) opciones explícitas y excluyentes — estructuradas por default, tabla numerada 1/2/3 como fallback sin la tool (`CC.md §3` + [`fx-workflow-authoring §7.0`](../fx-workflow-authoring/SKILL.md)). Por el fallback, nunca aceptar "ok"/"sí"
libres en un checkpoint — re-presentar opciones.

---

## 3. Content rules (anti-drift) — el motor de redacción a preservar

> Reglas no-negociables de redacción. Este es el corazón del skill — guía la síntesis (P1-P2). El
> enforcement automático vive en P4.

**💰 Precios — permitidos, con fuente y confirmación:**

- Los montos van **solo en el Apéndice D (Inversión)**, y son exactamente los que se confirmaron en CP1.
- **Fuente:** si existe `project/planning/00b_INTERNAL_ESTIMATE.md` (`/estimate`), P1 propone las cifras de
  oferta de su **§1** — Precio Total (Realista, o rango Realista–Conservador), plan de soporte mensual e
  infraestructura mensual. Sin estimate, CP1 pide los montos a quien cotiza. Si no hay montos confirmados,
  el Apéndice D describe solo la estructura (setup, mensual, planes), sin cifras.
- **Nunca sale al cliente el desglose interno del estimate:** puntos, tarifa por punto, score o % de
  cobertura, costo de tokens, supuestos de §10, márgenes, el piso ni cotizaciones de otros clientes.

**🔴 Prohibido (siempre, todos los tiers):**

- **Montos inventados o sin confirmar** en CP1, o fuera del Apéndice D.
- **Plazos absolutos sin confirmar.** Hablar de fases con entregables, no de fechas duras. El "reloj"
  arranca al cerrar dependencias (ej. acceso a fuentes), no en una ventana fija.
- **Inventar** business rules, features, entidades o métricas que no estén en `/discovery` / `/design`
  (CODING.md §8). Gap → marcar supuesto explícito, no improvisar.
- **Framing negativo:** ❌ "no incluye" / "excluido" / "fuera de alcance" → ✅ "evolución planificada" /
  "fases posteriores".
- **Nombres propios de personas inventados** (user journeys, greetings): usar descriptor de rol genérico
  ("una gerente operativa") o el nombre del **stakeholder real** del `project-config` si aplica. Nunca asumir.

**✅ Obligatorio:**

- Supuestos marcados explícitamente (sección dedicada §7).
- Términos del dominio del cliente (glosario de `project-config §12` / `08_GLOSSARY`).
- Alcance claro: v1 (incluido) + evolución planificada, en framing positivo.

**Tier-aware (jerga) — `[FR-8]`:**

> La columna de jerga aplica **igual al body del MD y al `inputText` que se manda a Gamma** (P3 no
> re-escribe el contenido — manda el body tal cual). El tier developer **sí lleva internals**: en P3 NO se
> aplica el `additionalInstructions` que prohíbe mencionar el stack a developer. La restricción de "sin
> stack / sin jerga" es legítima **solo** para `negocio` (y para `ejecutivo` sin internals), no para
> `developer`.

| Tier | Jerga técnica |
| ---- | ------------- |
| `negocio` | **Cero.** Todo en lenguaje de negocio. En P3, `additionalInstructions` prohíbe mencionar stack/jerga. |
| `ejecutivo` | Las tecnologías/conceptos **nombrados del proyecto** OK (p.ej. SQL, APIs, integraciones, permisos — tomados del discovery/arquitectura, NO una lista fija) — **sin internals** (algoritmos de cifrado, protocolos, parámetros de driver, nombres de librerías). En P3, `additionalInstructions` pide nivel concepto sin internals. |
| `developer` | Profundidad técnica completa: internals del proyecto (cifrado, vector store, transporte, defensa en profundidad, contratos de integración). En P3 **NO** se aplica la restricción de stack — el deck lleva los internals del body. |

---

## 4. Audience tiers

El tier es **parámetro de la propuesta** (P0), no se deriva del proyecto. Cambia tres cosas: la
**profundidad de los Apéndices A (arquitectura) / B (seguridad)**, el **vocabulario** (§3) y si aparece el
**split "plataforma probada vs a medida"** (solo ejecutivo/developer).

| Tier | Lector | Apéndices A/B del MD |
| ---- | ------ | ------------------- |
| `negocio` | CEO no técnico | Diagrama simple a grandes rasgos (4 piezas, flujo seguro); seguridad en lenguaje de negocio. |
| `ejecutivo` | CEO sistemas-literate | Stack en capas + principios de seguridad + split kit-vs-custom, a nivel concepto (sin internals). |
| `developer` | CTO / lead dev | Igual que ejecutivo + internals (cifrado, vector store, transporte, contratos). |

> El template `PROPOSAL.template.md` trae los Apéndices A/B con la guía de profundidad por tier inline; P2
> instancia el nivel del tier elegido. Para `negocio`, los apéndices con internals se omiten o se reducen.

---

## 5. Modes

| Mode | Semantics |
| ---- | --------- |
| (default / `nuevo`) | Genera la propuesta completa (MD → Gamma → short.io). Si `project/proposals/{slug}.md` existe → P0 cleanup pre-flight (backup-then-remove o re-generar). |
| `validar` | **`[FR-4]`** — Read-only sobre `project/proposals/{slug}.md` existente. Chequea que el MD existe, que el frontmatter trae los campos de provenance esperados (`gamma_url`/`short_url` si ya hay deck), y reporta los pasos pendientes si no hay provenance. **No** busca HTML, assets ni pantallas curadas. Cero writes durables. |

**Flags:**

- `--tier negocio|ejecutivo|developer` — salta la pregunta de tier en P0.
- `--client <path>` — override del project root (lee el `/discovery`+`/design` de otro derivado).
- `--md-only` — solo emite el MD (P0-P2), salta el step de Gamma (P3) — degrada conscientemente a la ruta md-only.
- `--cards N` — número de tarjetas sugerido a Gamma (default: que Gamma decida).
- `--theme <name>` — tema de Gamma (default: ninguno; el autor elige en el editor web).
- `--folder <name>` — folder de Gamma donde guardar el deck (default: sin folder).

`/proposal` sin args → P0 confirma modo + tier + readiness.

---

## 6. Inputs consumed

| Source | Used for (sección del MD §1-9 + Apéndices) |
| ------ | ------------------------------------------ |
| `project/planning/00_DISCOVERY_BRIEF.md` | §1 Resumen ejecutivo · §2 Objetivos · §6 Alcance v1+evolución (MoSCoW) · §9 Próximos pasos · criterios de éxito |
| `project/planning/02_PERSONAS.md` | §4 Usuarios y roles · §5 Flujos (rol genérico) |
| `project/planning/03_DEEP_DIVE.md` | §3 Solución propuesta (capacidades) |
| `project/planning/04_ARCHITECTURE.md` | Apéndice A Arquitectura (profundidad por tier) · Apéndice B Seguridad · §7 Supuestos/decisiones/riesgos |
| `project/planning/05_RBAC_MATRIX.md` | §4 Usuarios y roles (alcance de datos) |
| `project/planning/06_ACCEPTANCE_SCENARIOS.md` | §5 Flujos principales (flujo estrella + secundarios) |
| `project/planning/07_SK_LEVERAGE.md` | Apéndice A split "plataforma probada vs a medida" (ejecutivo/developer) |
| `project/planning/16_DESIGN.md` + `16_DESIGN/SCR-*.md` | Opcional — enriquece §3/§5 con detalle de UX si existe. NO obligatorio. |
| `project/planning/00b_INTERNAL_ESTIMATE.md` | Opcional — **solo su §1** (Precio Total, soporte, infra) → Apéndice D, tras confirmar en CP1. El resto del estimate no se lee. |
| `project-config.md` | Nombre/slug del producto · glosario (§12) · stakeholder real (si se usa nombre) · industria del cliente y tipo de aplicación (§3 Problem Statement) → `image_style` |

> El template `PROPOSAL.template.md` define el shape del MD (frontmatter + §1-9 + Apéndices A-D).
> `/design` es **opcional**: si solo hay `/discovery`, el MD se genera igual — las §1-9 no dependen de
> `/design`. Si falta una fuente del discovery, el contenido afectado se marca como supuesto en §7 (no se
> inventa — CODING.md §8).

---

## 7. Outputs produced

```
project/proposals/{slug}.md              # DURABLE — el único entregable; fuente de verdad versionada en git
                                          #   frontmatter de provenance + body §1-9 + Apéndices A-D (formato Gamma)
```

**Un solo artefacto durable.** Sin HTML, sin `assets/`, sin carpeta de artifacts transicional, sin ledger
de URLs. La provenance (qué deck y qué link se generaron) vive **en el frontmatter del mismo MD**, no en un
archivo aparte.

**Frontmatter de provenance:**

```yaml
---
title: 'Título de la propuesta'
slug: 'slug-del-proyecto'
tier: 'developer | ejecutivo | negocio'
created_at: 'ISO-8601'        # timestamp de emisión (P2)
image_style: ''               # dirección visual confirmada en CP1 (P2)
client_logo_url: ''           # logo del cliente en el bucket del org, o '' (P2)
gamma_url: ''                 # vacío hasta P3; la URL del deck que devuelve Gamma
short_url: ''                 # vacío hasta P3; la short URL de short.io
---
```

> **Nombre del entregable:** `{slug}.md`, `{slug}` = `Slug` de `project-config.md` (ej. `credenz-insights.md`).
> Fallback `proposal.md`. Versionado en git — si el deck de Gamma diverge del MD, el MD gana.

> **Por qué se versiona, aunque lleve montos:** el historial de git es el registro de qué se le mandó al
> cliente, cuándo, con qué alcance y a qué precio. Los repos de proyecto son privados del equipo; el
> desglose interno del estimate nunca entra al MD (§3), así que lo versionado es lo mismo que ya vio el
> cliente.

**Entregables vivos (no archivos del repo):** el deck de Gamma (`gamma_url`) y la short URL
(`short_url`) — se registran en el frontmatter, viven en gamma.app / short.io.

---

## 8. Turn boundaries

| Turn | Phases | Stops with |
| ---- | ------ | ---------- |
| 1 | P0 (cleanup pre-flight + modo + tier + readiness) + P1 (synthesis + drift/gap reconciliation) | **CP1** inline (tier + alcance) |
| 2 | P2 (emit MD a `project/proposals/{slug}.md` desde el template) | **CP2** Plan Mode (aprobar MD + gate Gamma) |
| 3 | P3 (strip-frontmatter → Gamma REST (gamma-generate.sh) → short.io → escribe provenance → entrega; con fallbacks) | Auto-completion |
| 4 | P4 (auto-checklist tier-aware + cierre) | Done — propuesta lista |

`validar` mode salta P1-P3 (solo valida MD + provenance + report).
`--md-only` ejecuta P0-P2 + entrega, y **salta P3** (la ruta Gamma).

---

## 9. Flow overview

```
/discovery (+ /design) ──▶ [P0 cleanup + tier + readiness] ──▶ [P1 synthesis + drift/gap]
                                                                          │ (main loop, curado)
                                                                         CP1 (tier + alcance, inline)
                                                                          │
                              [P2 emit MD project/proposals/{slug}.md] ◀──┘
                                                                          │
                                                                         CP2 (aprobar MD + gate Gamma, Plan Mode)
                                                                          │
   provenance en frontmatter ◀── [P3 strip-frontmatter → Gamma REST (gamma-generate.sh) → short.io]
                                                                          │ (fallback md-only si la key de Gamma no está en el rail)
                                                                          ▼
                                                                  [P4 checklist + cierre]
```

Usar **TodoWrite** desde Turn 1: P0 · P1 · **CP1** · P2 · **CP2** · P3 · P4.

---

## 10. P0 — Cleanup pre-flight + modo + tier + readiness

1. **Cleanup pre-flight** (espejo `tk-mockup §8`): si `project/proposals/{slug}.md` ya existe → AskUserQuestion
   tabla 1/2/3. **Si el MD ya trae `gamma_url`/`short_url`** (re-generación sobre provenance previo, edge case
   issue §8): `[1] Re-generar (backup del MD a project/proposals/{slug}.backup-{ts}.md + re-emitir)` ·
   `[2] Reutilizar el deck existente (saltar a validar/entregar el actual)` · `[3] Cancelar`. **Si el MD existe
   sin provenance:** `[1] Backup + re-emitir (recommended)` · `[2] Sobrescribir (extra confirm)` · `[3] Cancelar`.
   **NUNCA sobrescribir un MD con provenance sin confirmación.**
2. **Hard gate:** `project/planning/00_DISCOVERY_BRIEF.md` debe existir (con `--client <path>` → relativo a
   ese root). Si falta → STOP plain: _"No puedo continuar — no hay output de /discovery. Corre `/discovery`
   primero."_ (`/design` es opcional; si falta, las §1-9 se generan igual.)
3. **P0 question** (si no viene por flag): `AskUserQuestion` (fallback tabla numerada sin la tool — `CC.md §3`) —
   - **Tier de audiencia:** `[1] Negocio` · `[2] Ejecutivo (sistemas-literate)` · `[3] Developer`.
4. **Mode dispatch:** default → P1; `validar` → P4 validation-only.

---

## 11. P1 — Synthesis + drift/gap reconciliation (main loop)

Síntesis **curada en el main loop** (sin agent — es el razonamiento central de la propuesta). El
orchestrator:

1. **Lee** las fuentes de §6 (discovery + design si existe).
2. **Source reconciliation (drift/gap)** — el motor heredado: tabla feature-by-feature **discovery
   (MoSCoW §3) ↔ alcance de la propuesta**. Cada Must/Should del brief debe mapear a "incluido v1" (§6 del
   MD) o, si se difiere, declararse como decisión explícita (evolución planificada). Cada gap (algo del
   discovery sin lugar en la propuesta) o drift (algo en la propuesta que el discovery no respalda) se
   lista como supuesto (§7 del MD).
3. **Sintetiza** mentalmente el contenido de las §1-9 + Apéndices al tier elegido (aplicando §3) — no se
   escribe a disco todavía; el MD se emite en P2. No hay artefacto transicional de plan.
4. **Propone la dirección visual (`image_style`)** — siempre, por default. Se deriva de **la industria del
   cliente + el tipo de aplicación** (brief + `project-config §3`), nunca de una lista fija: qué se ve en el
   día a día de ese negocio (su maquinaria, su material, su gente trabajando) y el tono (editorial,
   industrial, clínico…). Una a dos líneas, en español, y cierra siempre con _"sin texto en la imagen"_
   (Gamma dibuja letras ilegibles). Ejemplo: una app de cotización para una imprenta →
   _"fotografía editorial de imprenta industrial: prensas offset, pliegos impresos, tintas CMYK, cajas de
   cartón plegadizo; luz natural cálida, sin texto en la imagen"_.
5. **Resuelve los logos** contra el bucket del org (`https://assets.timekast.com`), con un `curl -I` por URL:
   - **TimeKast:** `timekast/logo.png` — siempre presente.
   - **Cliente:** `{slug}/logo-plate.png` si existe (versión con placa para logos claros), si no
     `{slug}/logo.png`. Si no hay ninguno, CP1 lo pide: la ruta a un archivo local se sube con
     `bash scripts/tools/proposal-asset-upload.sh <archivo> {slug}` (imprime la URL pública), o el deck va
     sin logo del cliente. El helper lee `PROPOSAL_ASSETS_R2_TOKEN` de la bóveda con la sesión de la persona
     (`--check` lo comprueba sin subir nada) y, si no puede, sale con un código de la tabla de P3 paso 2: `42`
     → el deck va sin logo del cliente (un admin puede cargar el token); `40`/`41`/`43`/`44`/`45` → con usuario,
     decir el arreglo de esa tabla y ofrecer reintentar tras arreglarlo o seguir sin logo. **Headless** (nadie
     a quien ofrecerle nada): `42` → seguir sin logo del cliente y registrarlo en P4; `40`/`41`/`43`/`44`/`45`
     → **fail-closed**, con la misma lógica de P3 paso 2: la credencial puede estar cargada y el problema es de
     acceso, que reaparecería en Gamma y en short.io. Un error de la subida misma (otro código) se surfacea con
     el mensaje del helper. **Contraste:** las tarjetas de Gamma son claras, así
     que un logo blanco o muy claro desaparece; en ese caso se sube una versión con placa como `logo-plate`
     (`proposal-asset-upload.sh <archivo> {slug} logo-plate`).

### CP1 — Tier + alcance (inline)

```
🛑 CP1 — Plan de la propuesta

Tier: {tier}

Alcance (reconciliado con discovery):
  • {M} features Must/Should → incluidas en v1
  • {D} diferidas a evolución planificada (decisión explícita)
{Si hay gaps: "⚠ Detecté: {gap/supuesto} → irá como supuesto explícito en §7."}
{Si no hay /design: "ℹ Sin /design — la propuesta va con las §1-9 del discovery."}

Inversión (Apéndice D):
  {Con estimate: "• Total: ${TOT_REAL} MXN (rango ${TOT_REAL}–${TOT_CONS}) · Soporte {plan} ${S}/mes · Infra ~${INFRA}/mes — de 00b §1"}
  {Sin estimate: "• Sin estimate — dime los montos, o el Apéndice D va solo con la estructura (sin cifras)."}

Deck:
  • Imágenes: "{image_style propuesto}" (sale de: {industria} · {tipo de app})
  • Logos: TimeKast ✔ · Cliente {✔ {url} | ✖ no hay en el bucket — dame el archivo o va sin él}

### Opciones
| 1 | Emitir el MD de la propuesta (recommended)          |
| 2 | Ajustar tier / alcance / montos / imágenes / logos  |
| 3 | Cancelar                                            |
```

> Si el user responde texto libre ("ok"/"sí") → re-presentar las opciones numeradas. No continuar sin un
> número (`fx-workflow-authoring §7`).

---

## 12. P2 — Emit MD

Escribe el único entregable durable desde el template (regla "no template, no artifact" —
`fx-workflow-authoring §11`).

1. **Read** `templates/PROPOSAL.template.md` → obtener el shape (frontmatter + §1-9 + Apéndices A-D).
2. **Llena el frontmatter de provenance:**
   - `title` — del nombre del producto (`project-config` / discovery).
   - `slug` — `Slug` de `project-config.md` (kebab-case). Fallback: slug del repo.
   - `tier` — el tier de CP1.
   - `created_at` — timestamp ISO-8601 actual.
   - `image_style` — la dirección visual confirmada en CP1.
   - `client_logo_url` — la URL del logo del cliente confirmada en CP1, o `''` si el deck va sin él.
   - `gamma_url: ''` y `short_url: ''` — **vacíos** (se llenan en P3).
3. **Llena el body §1-9 + Apéndices** con la síntesis de P1, **al tier elegido** (§3 reglas de contenido
   aplican; los Apéndices instancian la profundidad del tier — `negocio` puede omitir A/B con internals).
   Cada sección separada por `---` (corte de tarjeta Gamma).
4. **Write** `project/proposals/{slug}.md`.

> El contenido se **funda en `/discovery` (+ `/design`)** — cero invención (CODING.md §8). Gap de spec →
> supuesto explícito en §7, no improvisar.

---

## 13. CP2 + P3 — Aprobar MD + gate Gamma → ship deck

### CP2 — Plan Mode formal (antes de disparar Gamma)

`fx-workflow-authoring §7`: el MD durable client-facing + el disparo one-shot a Gamma = HIGH-risk → Plan
Mode. **Gamma es one-shot** (no edita por API) → no se dispara sin aprobación. Entrar con synthesis:

- Tier + el MD emitido en `project/proposals/{slug}.md` (§1-9 + Apéndices generados).
- Reconciliación de alcance: {M} incluidas, {D} diferidas (decisión explícita).
- Parámetros del disparo a Gamma: format=presentation · cards={N o "Gamma decide"} · theme={…} · language=es-mx
  · imágenes=`image_style` · logos=TimeKast + {cliente | sin logo del cliente}.
- Inversión: los montos del Apéndice D (o "solo estructura" si no hubo montos confirmados).
- Warnings: gaps/supuestos en §7, reglas de contenido (jerga, montos vs CP1) a revisar.

```
| 1 | Aprobar → strip-frontmatter + disparar Gamma + short.io (P3) |
| 2 | Editar → ajustar el MD (1 ciclo) y re-presentar              |
| 3 | Solo MD (md-only) → entregar el MD, saltar Gamma             |
| 4 | Rechazar → el MD queda, no se dispara Gamma                  |
```

> Si el user responde texto libre ("ok"/"sí") → re-presentar las opciones numeradas. No disparar Gamma sin
> un número (`fx-workflow-authoring §7`, edge case issue §5).

### P3 — Strip-frontmatter → Gamma (REST API) → short.io → provenance

Solo si CP2 → opción 1. (Opción 3 `--md-only` salta esta fase y va directo a P4 informando que Gamma queda
pendiente.)

1. **Strip-frontmatter (construir `inputText`).** Leer `project/proposals/{slug}.md`. Tomar **solo el body**
   — todo lo que sigue al cierre del segundo `---` del frontmatter. El `inputText` que se manda a Gamma
   **excluye el bloque frontmatter completo**, por lo que `gamma_url` y `short_url` (provenance) **nunca**
   llegan al deck (evita loop de provenance — issue §6, AC §4 strip-frontmatter). El body ya trae los
   cortes de tarjeta `---` por sección.

   ```
   inputText = readFile("project/proposals/{slug}.md")
               .split(/^---\s*$/m)        # separa frontmatter del body
               .slice(2)                  # descarta [vacío, frontmatter]; conserva el body
               .join("---")               # re-une el body (sus propios cortes de tarjeta)
               .trim()
   ```

   > ✅ Invariante verificable: el `inputText` resultante NO contiene las strings `gamma_url` ni
   > `short_url`. Esta es la garantía del strip-frontmatter.

2. **Gate de la key de Gamma.** `GAMMA_API_KEY` es un token del rail: vive en la bóveda (`rail-timekast`,
   entorno `main`) y el helper la lee con la sesión de la persona, sin copia en disco (`fx-secrets-vault §3`).
   Comprobarla **sin llamar a Gamma** con `bash scripts/tools/gamma-generate.sh --check`, que nunca imprime el
   valor y sale con un código por falla (tabla en `scripts/tools/lib/rail.sh`). Ramificar **por el código de
   salida**, nunca por el texto del mensaje:

   | Código | Qué significa | Qué hace el workflow |
   | ------ | ------------- | -------------------- |
   | `0` | La key está en el rail | Paso 3 |
   | `42` | La bóveda se leyó bien y `GAMMA_API_KEY` no está | **Ruta md-only** (paso 6): el MD ya es un entregable válido. En P4, decir que un admin de la bóveda puede cargar la key y que el deck se genera re-corriendo P3 |
   | `40` | Sin sesión de la bóveda, o caducó | **STOP**: la persona corre en **su** terminal el `infisical login --domain=…` que nombra el mensaje del helper (es interactivo; el dominio sale de `.claude/policy/vault.json` → `fx-secrets-vault §3`) y se reintenta el gate. Si el dominio que nombra no es el de la organización (el que publica `fx-secrets-vault §3`), no se entra: el `vault.json` está editado → `fx-secrets-vault §3` ("Recuperar `vault.json`") |
   | `41` | Sesión viva sin acceso a `rail-timekast` — o el proyecto configurado no existe | **STOP**: pedir acceso a un admin de la bóveda; si el acceso está, el `rail.projectId` de `.claude/policy/vault.json` no corresponde → `fx-secrets-vault §3` ("Recuperar `vault.json`"); si ya coincide con el del kit, avisar al equipo del Factory |
   | `44` | `infisical` no está instalado | **STOP**: `brew install infisical` y login con dominio |
   | `45` | Falta `.claude/policy/vault.json`, o no se puede usar | **STOP**: recuperarlo → `fx-secrets-vault §3` ("Recuperar `vault.json`") |
   | `43` u otro | Respuesta de la bóveda no reconocida, o falta una dependencia del helper (`jq`) | **STOP**: surfacear el mensaje del helper (no contiene valores) y remitir a `fx-secrets-vault §3` |

   🔴 **Sólo `42` degrada a md-only.** Con `40`/`41`/`44`/`45` la key puede estar cargada y el problema es de
   acceso: seguir en md-only lo escondería, y reaparecería en short.io y en el logo. En **headless** los STOP
   son fail-closed: abortan con la señal estructurada del código, sin intentar el login.
   🔴 **El agente nunca lee la bóveda por su cuenta** (`infisical export`, `infisical secrets`) para comprobar
   una key: esos comandos imprimen valores, que acabarían en el transcript. El `--check` existe para eso.

3. **Generar el deck (Gamma REST API).** Escribir el body del paso 1 a un archivo temporal y llamar el helper
   de bash `scripts/tools/gamma-generate.sh`:

   ```bash
   # FR-8: additionalInstructions tier-aware (la restricción de stack es SOLO negocio/ejecutivo).
   # Imágenes + logos: del frontmatter (image_style / client_logo_url); el de TimeKast es fijo.
   GAMMA_INSTRUCTIONS="$INSTR" GAMMA_NUM_CARDS="${CARDS:-}" \
   GAMMA_IMAGE_STYLE="<image_style>" \
   GAMMA_HEADER_LOGO_URL="<client_logo_url, o vacío>" \
   GAMMA_MAKER_LOGO_URL="https://assets.timekast.com/timekast/logo.png" \
     bash scripts/tools/gamma-generate.sh "<body-temp>.md" "<título>" "<themeId si --theme>" "<folderId si --folder>"
   # stdout (1 línea) = la gammaUrl. El tool hace POST /v1.0/generations + el poll async GET /generations/{id} adentro.
   ```

   El `gamma-generate.sh` lee `GAMMA_API_KEY` de la bóveda (fail-closed), manda el `POST` (auth `X-API-KEY`), pollea
   hasta `status: completed` e imprime la `gammaUrl`. **La asincronía vive dentro del tool — P3 no la maneja.**
   Una variable vacía no se manda: el deck sale sin ese logo o con imágenes genéricas, nunca falla por eso.
   `$INSTR` se arma por tier (FR-8):
   - `negocio`   → "Primera tarjeta: título + subtítulo del problema. Última: próximos pasos + CTA. NO menciones stack técnico ni jerga de desarrollo. Los montos de inversión van tal cual vienen en el texto, sin recalcularlos. Tono profesional pero cercano."
   - `ejecutivo` → "…igual, pero conceptos sistémicos a nivel idea; SIN internals (cifrado, drivers, librerías)."
   - `developer` → "Primera/última tarjeta igual; SIN restricción de stack — el deck lleva los internals del body."

   **Los tres tiers** terminan además con: _"Escribe TODAS las cifras monetarias completas y literales, por
   ejemplo $500,000 MXN + IVA; nunca las abrevies con 'k', 'mil' o 'M'."_ — el `textMode: condense` de Gamma
   convierte "$500,000" en "$500k" si no se le pide lo contrario.

   - **Éxito** (exit 0) → capturar la `gammaUrl` de stdout → paso 4.
   - **Falla de lectura del rail** (exit `40`-`45` — la sesión pudo caducar entre el gate y la generación) →
     **misma tabla del paso 2**: `42` → ruta md-only (paso 6); `40`/`41`/`43`/`44`/`45` → **STOP** con el arreglo
     de su fila (fail-closed en headless). No se esconde en md-only un problema de acceso.
   - **Falla del proveedor** (cualquier otro exit ≠ 0 — créditos insuficientes, timeout del poll, error de API)
     → **NO abortar**: ruta md-only (paso 6) e informar en P4 que el deck quedó pendiente + cómo reintentar el
     comando.

   > 🔴 **`[FR-8]`:** la restricción de no-stack va **solo** a `negocio`/`ejecutivo` (vía `GAMMA_INSTRUCTIONS`).
   > `developer` NO la lleva — los internals del body llegan al deck. (Corrige el legacy que lo prohibía a todos.)

   > ✅ **`[R2-2]` — RESUELTO, probado en vivo (2026-06-19).** La API REST (`POST /v1.0/generations`, auth
   > `X-API-KEY`) es **async**: devuelve `generationId`; se pollea `GET /v1.0/generations/{id}` hasta
   > `status: completed` y se lee `gammaUrl`. `gamma-generate.sh` lo maneja completo. Confirmado e2e: deck real
   > generado + créditos deducidos. **Corte de tarjeta** (`#W3`): el tool usa `cardSplit: auto` (Gamma decide);
   > para forzar cortes por los `---` del body, exportar `GAMMA_CARD_SPLIT=inputTextBreaks` (no es default).

4. **Escribir `gamma_url` en el frontmatter.** Con la `gammaUrl` que imprimió `gamma-generate.sh` (paso 3),
   Edit del frontmatter de `project/proposals/{slug}.md`: `gamma_url: '<gammaUrl>'`.

5. **Acortar con short.io.** Ejecutar por Bash el helper `scripts/tools/shortio.sh`:

   ```bash
   # Primera vez (el frontmatter NO traía short_url antes de este run):
   bash scripts/tools/shortio.sh "<gamma_url>" "<slug>"
   # REGENERACIÓN (el frontmatter YA traía short_url de un run anterior):
   bash scripts/tools/shortio.sh --update "<gamma_url>" "<slug>"
   # stdout → la short URL (una sola línea): https://go.timekast.com/<slug>-propuesta
   ```

   > 🔁 **Regeneración:** como Gamma genera un deck **nuevo** (la API no edita el existente), la `gamma_url`
   > cambia. Pasar **`--update`** re-apunta el short link existente al deck nuevo **manteniendo el mismo
   > shortURL** (ideal si ya lo compartiste al cliente). Sin `--update`, un slug repetido sufija `-2..-5`.
   > Decidir `--update` por si el `short_url` del frontmatter venía lleno ANTES de este run (= regeneración).

   - **Éxito** → Edit del frontmatter: `short_url: '<short url>'`.
   - **Falla del proveedor** (exit ≠ 0 **fuera** de `40`-`45` — red, dominio) → **NO abortar**: dejar
     `short_url: ''`, registrar en el cierre que la short URL quedó pendiente + cómo reintentar manualmente.
     La `gamma_url` ya es un entregable funcional (issue §6 fallback: Gamma OK + short.io falla → entregar MD +
     `gamma_url`).
   - `shortio.sh` lee `SHORTIO_API_KEY` de la bóveda (`rail-timekast`) con la sesión de la persona, fail-closed:
     si no puede, sale **sin hacer HTTP** con un código de la misma tabla del paso 2 (`bash
     scripts/tools/shortio.sh --check` lo comprueba sin acortar nada). Se ramifica por ese código, igual que
     en el paso 2:
     - `42` (la key no está) → **única degradable**: continuar sin URL corta (`short_url: ''`) y registrarlo
       en el cierre: un admin de la bóveda carga la key y se reintenta el acortado.
     - `40`/`41`/`43`/`44`/`45` → **STOP** con el arreglo de su fila en la tabla del paso 2 (la sesión pudo
       caducar entre el deck y el acortado). El STOP reporta igual la `gamma_url` del deck ya creado, para
       que no se pierda. En headless es fail-closed, como en el paso 2. Nunca se reporta un `40`/`41`/`43`
       como "falta la key".

6. **Ruta md-only (fallback).** Si el paso 2 o el paso 3 salieron con `42` (no hay key de Gamma), **o** el
   tool del paso 3 falló del lado del proveedor (exit ≠ 0 **fuera** de `40`-`45`; los demás códigos del rail
   paran con la tabla del paso 2, no llegan aquí): dejar `gamma_url: ''` y `short_url: ''`, **no** llamar short.io, e informar plain al user en el
   cierre (P4) que el deck de Gamma quedó pendiente — el MD es el entregable. **No abortar** (AC §4, Gherkin §5).

7. **Entrega.** Surfacea al user (plain es-MX): el path del MD (fuente de verdad), la short URL para
   compartir al cliente (o la `gamma_url` si short.io falló), y la `gamma_url` (editor) — todo según qué se
   logró generar.

---

## 14. P4 — Auto-checklist + cierre

Validación final del MD. **Este checklist es también el modo `validar` standalone (`[FR-4]`)** — read-only
sobre `project/proposals/{slug}.md`, cero writes durables.

| Check | Si falla |
| ----- | -------- |
| **`project/proposals/{slug}.md` existe** | STOP — el MD es el entregable |
| **Frontmatter presente y válido** (`title`, `slug`, `tier`, `created_at`, `image_style`, `client_logo_url` + `gamma_url`/`short_url`) | STOP — re-emitir |
| **Cifras completas en el deck:** si se corrió P3, abrir la `gamma_url` y confirmar que ningún monto salió abreviado ("k"/"mil"/"M") | reportar — se corrige en el editor de Gamma |
| **Provenance:** si se corrió P3, `gamma_url` tiene URL; si `gamma_url` vacío → reportar "MD listo, deck de Gamma pendiente"; si `gamma_url` lleno y `short_url` vacío → reportar "short URL pendiente, reintentar `shortio.sh`" | reportar pasos pendientes (no STOP) |
| Las §1-9 + Apéndices que aplican al tier presentes en el body | STOP — completar |
| **Montos solo en el Apéndice D** y **iguales a los confirmados en CP1** (`$`/`USD`/`MXN` fuera del Apéndice D = drift) | surface / corregir |
| **Cero desglose interno del estimate** (puntos, tarifa por punto, cobertura, tokens, "INTERNAL", otros clientes) | corregir — quitar |
| **Jerga prohibida según tier** (cero en `negocio`; sin internals en `ejecutivo`) | surface / corregir |
| Cero framing negativo ("no incluye"/"excluido"/"fuera de alcance") | corregir a framing positivo |
| **Cero nombres propios inventados** (greetings, journeys) → genericizar o stakeholder real | genericizar |
| Toda Must/Should del discovery está incluida (§6) o diferida con decisión explícita | surface gap |

> **`validar` sin provenance** (Gherkin §5, edge case): si el MD existe pero `gamma_url`/`short_url` están
> vacíos → reportar plain _"La propuesta tiene MD pero aún no tiene provenance de entrega — falta P3 (Gamma +
> short.io)."_ + indicar cómo completarlo. **No** buscar HTML, assets ni pantallas curadas.

### 14.1 Commit de cierre — `CP-commit`

> **No corre en modo `validar`.** P4 es también el checklist de `validar` (`[FR-4]`, arriba), y ese modo promete cero writes durables: termina en el reporte de validación, **antes** de esta sección. El CP-commit es sólo del cierre normal.

El entregable durable (`project/proposals/{slug}.md`) ya está listo. Cierra el workflow commiteando el
trabajo (familia documental — `GIT.md §3.5`; el CP + el gate del workflow = autorización, `GIT.md §2`).

- **`CP-commit`** (`GIT.md §3.5`): ofrecer `1. nada / 2. commit / 3. commit + push`, con **2 como
  recomendada** — la propuesta se versiona (§7). `git add -f` explícito de `project/proposals/{slug}.md` (el
  path durable, no `-A`), subject `docs(proposal): …`. Sin push salvo opción 3 (branch actual, NUNCA main —
  guard de main + degrade headless a opción 2 por `GIT.md §3.5`).

  > **Por qué `-f`:** los derivados que nacieron antes de que el kit versionara las propuestas traen
  > `project/proposals/*` en su `.gitignore`, y `factory update` no toca ese archivo. Sin `-f` el `git add`
  > falla con `paths are ignored`. Con `-f` sobre el path exacto no se cuela nada más: un archivo ya
  > trackeado sigue trackeado aunque el patrón siga ahí. Si el patrón aparece, dilo al cerrar y sugiere
  > quitar esas líneas del `.gitignore` del proyecto.

> **Publicación a proposals.timekast.mx queda fuera de este workflow** (es ops del derivado vía el CLI —
> `fx-distribution` / `proposal-publishing.md`). El entregable de `/proposal` es el deck de Gamma + la short
> URL, no un HTML publicado.

---

## 15. Invalidation handling

> Per `fx-workflow-authoring §10`.

| Caso | Política |
| ---- | -------- |
| `/discovery` cambia 1-2 secciones | **Patch:** re-sintetizar solo las §/Apéndices afectados del MD (Edit). |
| Cambio estructural (alcance, personas, arquitectura) | **Regen completo:** re-correr desde P1 (re-emitir el MD). |
| `/design` cambia / agrega detalle | Patch de las §3/§5 del MD si las enriquecía (Edit). `/design` es opcional. |
| Gap de spec (discovery incompleto) | NO inventar. Marca supuesto explícito en §7, surface en CP. Resolución = volver a `/discovery`. |
| User cambia tier | Re-correr desde P1 (la profundidad/vocabulario/Apéndices cambian). |
| Deck de Gamma ya generado y el MD cambia | Re-correr P3 (re-disparar Gamma desde el MD nuevo). El MD gana sobre el deck. Edge case issue §8 (provenance previo) → P0 ofrece re-generar vs reutilizar. |

---

## 16. Subprocess delegation summary

**Cero subprocesses.** Todo el workflow corre en el main loop:

- La **síntesis** (P1) y la **emisión del MD** (P2) son razonamiento curado del orchestrator — sin agent
  (evita inventar prefijo `prp-*`).
- El **disparo a Gamma** (P3) es una llamada al helper bash `gamma-generate.sh` (API REST) desde el main loop, no un subprocess.
- El **acortado** (P3) es una llamada Bash a `scripts/tools/shortio.sh`, no un subprocess.
- La **subida de un logo** (P1, solo si el cliente no tiene uno en el bucket) es una llamada Bash a
  `scripts/tools/proposal-asset-upload.sh`, no un subprocess. Lee `PROPOSAL_ASSETS_R2_TOKEN` de la bóveda
  (`rail-timekast`), un token de R2 limitado a ese bucket; si la clave no está, el deck va sin logo del cliente.

No hay input grande que contamine el contexto ni paralelismo que justifique aislar (`fx-workflow-authoring
§8`). El workflow es lineal y conversacional (CP1/CP2 son orchestrator-direct).

---

## 17. Templates

- `templates/PROPOSAL.template.md` — el shape del MD: frontmatter de provenance + §1-9 + Apéndices A-D, con
  cortes de tarjeta `---` y la guía de profundidad por tier inline.

Regla "no template, no artifact" (`fx-workflow-authoring §11`): no se emite el MD sin su template.

---

## 18. Out of scope

- Recorrido navegable de todas las pantallas (eso es `tk-mockup`).
- Diseñar / clasificar pantallas (eso es `tk-design`, upstream).
- Documentación técnica interna.
- Publicar el deck a proposals.timekast.mx (ops del derivado vía CLI — `proposal-publishing.md`).
- Editar el deck dentro de Gamma por API — Gamma es one-shot; los ajustes finos se hacen en su editor web.

---

_TimeKast Factory — tk-proposal (síntesis /discovery (+ /design) → MD versionado → deck Gamma + short.io)_

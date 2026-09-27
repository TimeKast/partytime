# CORE — TimeKast Factory Rules

> Meta-reglas universales. Siempre activas, máxima prioridad.

---

## 1. Jerarquía de Autoridad

> En conflicto entre rules peer, gana la más específica de dominio (ej: commit → `GIT.md` manda sobre `CORE.md`).

### Rules always-on (peer-level)

| Archivo      | Dominio                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `CORE.md`    | Meta-reglas universales: jerarquía, idioma, lenguaje plano al usuario    |
| `CODING.md`  | Disciplina de código: simplicidad, surgical changes, hard limits calidad |
| `GIT.md`     | Git: commits, push, --no-verify, branching adaptive                      |
| `SK.md`      | Starter Kit TimeKast: DB, UI, QA, code reuse, issues                     |
| `CC.md`      | Runtime Claude Code: routing, checkpoints, filesystem, hooks, ontología  |
| `DOR_DOD.md` | Definition of Ready / Done                                               |

### Resto de la jerarquía

| Nivel | Ubicación            | Propósito                                   |
| ----- | -------------------- | ------------------------------------------- |
| 1     | `rules/*.md`         | Siempre activas (tabla anterior)            |
| 2     | `skills/*`           | Conocimiento on-demand (ver prefijos abajo) |
| 3     | `agents/*.md`        | Personas/expertos invocables como subagents |
| 4     | `commands/*.md`      | Slash commands ejecutables                  |
| 5     | `project/planning/*` | Documentación del proyecto                  |
| 6     | `project/backlog/*`  | Issues y epics                              |

### Prioridad de Skills (por prefijo)

| Tier | Prefijo        | SSOT Para                                                                   | Prioridad |
| ---- | -------------- | --------------------------------------------------------------------------- | --------- |
| P1   | `pj-*`         | Project-specific del derivado (del developer — `skill:lint` lo ignora)      | Mayor     |
| P2   | `kb-*`         | Knowledge base (patterns y skills cross-fase; auto-routing por description) | Media     |
| P2   | `sk-*`         | Starter kit systems (sistemas shipped — notifications, tokens, navigation)  | Media     |
| P3   | `tk-*`, `fx-*` | Workflows TimeKast / factory-internal                                       | Base      |

> En conflicto, `pj-*` gana sobre `kb-*`/`sk-*`. `tk-*`/`fx-*` ejecutan pasos, no redefinen reglas.
> `kb-*` cubre tanto fase coding (`kb-cron-jobs`, `kb-dataviz`, …) como fase documental (`kb-visual-direction`); el routing semántico (CC.md §1.1) decide si se activa en `/implement` o solo en `/discovery`/`/design`.
> `kb-*` vs `sk-*`: co-existen por routing semántico. `kb-*` = patterns / knowledge ("¿qué patterns aplico?"). `sk-*` = sistema shipped por el kit ("¿cómo me engancho al sistema existente?").

---

## 2. Idioma

- Usuario en español → responder en español **neutro o mexicano**. NUNCA argentino: prohibido voseo (`vos`/`tenés`/`querés`/`listá`/`incluí`...) y argentinismos (`che`/`dale`).
- Código, comentarios, variables → siempre en inglés

---

## 3. SSOT Chain

```
Discovery → Design → Backlog → Code
```

| Fase      | Documento                                                                                       | SSOT para                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Discovery | `project/planning/00_DISCOVERY_BRIEF.md` + `00-14` numbered + `15_IMPLEMENTATION_PACKETS/`     | Brief + freeze-map + personas + deep-dive + arquitectura + RBAC + scenarios + data model + API surface + readiness + packets por feature (shape exacto → input-contract de `/backlog`) |
| Design    | `project/planning/16_DESIGN.md` + `16_DESIGN/` (`SCR-*`, `components/`, `flows/`)               | visual-direction + navigation + common components + flows + screens                                            |
| Backlog   | `project/backlog/*/issues/*.md`                                                                  | Issues ejecutables con AC + refs                                                                                |
| Code      | `src/`                                                                                           | Implementación                                                                                                  |

**On-demand workflows:** `/proposal`, `/mockup`.

> Detalle visión actualizada → `project/planning/PIPELINE_CURRENT_TRUTH.md` (Factory meta-doc).

---

## 4. Regla de Oro

Skills y workflows NUNCA redefinen reglas — solo ejecutan.

---

## 5. Frontera kit ↔ derivado

> Lo que el kit trackea y refresca en cada actualización (`.claude/**`, `scripts/**`, `.husky/**`, `.github/workflows/**` —y `CLAUDE.md`, que es la excepción híbrida de la tabla) es **solo-lectura** para el proyecto: una edición local se pierde en el siguiente release o entra en conflicto. Extiende **al lado**, no encima.

| Caso                                                                             | Qué hacer                                                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| El archivo es **dev-owned** (`*.project.*` —incluido `.claude/policy/quality-gates.project.json`, el override de gates—, `pj-*`, `settings.local.json`) | Es tuyo — edítalo; el kit no lo shippea ni lo sobrescribe                              |
| `CLAUDE.md` — **híbrido**: contenido dev-owned + una zona kit-managed          | Edítalo — el kit no reescribe tu prosa. Lo único que el CLI mantiene ahí es la línea que importa las rules always-on (nota abajo) |
| Es del kit y **hay punto de extensión**                                          | Úsalo (inventario → skill [`fx-extension-points`](../skills/fx-extension-points/SKILL.md) — viaja en los dos perfiles) |
| Es del kit y **no hay punto de extensión**                                       | Abre un factory-ticket al Factory (convención → skill [`fx-factory-tickets`](../skills/fx-factory-tickets/SKILL.md) — viaja en los dos perfiles) — nunca forkees el archivo localmente |
| Tests propios sobre código **del kit**                                           | No los mantengas: el kit versiona su cobertura. Prueba **tu** código, no el suyo         |

> **Por qué `CLAUDE.md` está en la lista `track` del manifiesto de distribución y aun así es tuyo.** Son **dos capas**. El **contenido** es dev-owned: el kit nunca reescribe tu prosa, y **nunca** abre prompt de conflicto sobre este archivo. La **línea que importa las rules always-on** es lo único que el kit vigila, y no se comporta igual en los dos perfiles: en **`full`** (`@.claude/rules/INDEX.md`) la **mantiene el CLI** — si falta, la repone; en **`core`** los cinco `@import` explícitos vienen en el archivo shippeado y **los mantiene el developer** — el CLI los **reporta** (`doctor`), no los repone, porque `core` no shippea el INDEX y no hay línea que insertar. Detalle de la mecánica (virgen / editado fuera del bloque / editado dentro, y el censo de `--verify`) → skill [`fx-factory-cli`](../skills/fx-factory-cli/SKILL.md) § `update`.

> **Detección:** `factory update --verify` reporta el drift disco↔lockfile sin modificar nada (CLI Node-only — no asume el stack del proyecto). Un fork silencioso aparece ahí como archivo editado localmente.

---

## 6. Plain language al usuario (kit-wide)

> Regla kit-wide, no opcional de cada workflow. Planes, opciones, narraciones de checkpoint y resúmenes post-agent siempre van al user en lenguaje plano es-MX. Aplica a todos los workflows (`tk-*`), commands, skills que interactúan con el user, y al main loop directo.

```
✅ OBLIGATORIO: Audience baseline = developer mid-level que NO leyó docs upstream
   ni reports de agents completos. Si tu output asume que el user ya entendió X,
   X tiene que explicarse inline primero.
✅ OBLIGATORIO: Definir términos técnicos inline la primera vez en cada turno
   (ej: "SCR (pantalla/screen)", "ADR (architecture decision record)").
✅ OBLIGATORIO: Ejemplos concretos antes de abstracciones.
✅ OBLIGATORIO: Resumir findings de agents en 3-4 líneas plain ANTES de pedir
   decisión. Nunca presentar checkpoint con un dump técnico crudo.
✅ OBLIGATORIO: opciones de checkpoint **explícitas y excluyentes** — nunca checkboxes ni prosa
   ambigua. La mecánica concreta (tool estructurada vs tabla numerada) es del runtime: en
   Claude Code, `CC.md §3`.
✅ Sub-agents pueden hablar técnico entre sí (agent-to-agent comm es OK).
   Orchestrator wrapping al user es plain SIEMPRE.

❌ PROHIBIDO: Argentino (voseo `vos`/`tenés`/`querés`, argentinismos `che`/`dale`).
   Usar tuteo neutro o mexicano.
❌ PROHIBIDO: Citar IDs crudos sin contexto ("Phase 4.0 produce SCR-XXX shards" → ✗).
   Re-expresar en términos de negocio ("Clasifiqué las 36 pantallas en 3 tipos" → ✓).
❌ PROHIBIDO: Presentar agent findings raw al user. Si el agent devuelve 200 líneas
   técnicas, el orchestrator extrae 3 líneas plain antes de surfacear.
```

**Extensión por workflow:** cada `tk-*` puede añadir vocab específico de su dominio (ej. `tk-design §2` define SCR/CMP/FLW). La extensión NO contradice la base — sólo añade especificidad.

---

_TimeKast Factory — Core Rules (L1 Meta)_

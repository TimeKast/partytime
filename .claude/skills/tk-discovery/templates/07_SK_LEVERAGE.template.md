# SK Leverage Analysis — {{project}}

> **Produced by:** `dsc-kit-analyst` agent (Phase 5 of `/discovery`, conditional on `SK_ACTIVE=true`).
> **Consumed by:** main orchestrator (Phase 6 synthesis §3.2 summary) · `/backlog` phase (wave planning + SP) · `/implement` (kit primitive selection).
> **Schema canónico:** [`methodology.md §12`](../methodology.md).

**Run date:** {{YYYY-MM-DD}}
**Target repo:** `{{repo-relative path al repo derivado}}` (factoryVersion {{X}}.{{Y}}.{{Z}})
**Features analyzed:** {{N FTs}} · sub-features: {{M}}
**Source of SK features:** `.claude/skills/sk-features-index` + {{N}} sibling `sk-*` skills

---

## 1. Feature × SK mapping

<!-- Tabla exhaustiva de sub-features × SK component × action × effort.
     Acción: Configure (≥80% kit) | Extend (40-80%) | Build (<40%)
     Effort: S (<1d) | M (1-3d) | L (3-7d) | XL (>7d) -->

| FT-ID | Feature     | Sub-feature       | SK component used                 | Skill reference (`sk-*`) | Acción    | Effort |
| ----- | ----------- | ----------------- | --------------------------------- | ------------------------ | --------- | ------ |
| FT-01 | Auth triple | Password provider | NextAuth v5 Credentials + helpers | `sk-security`            | Configure | S      |

---

## 2. Coverage aggregated

### By action (sub-feature granularity)

| Action               | Count |        % |
| -------------------- | ----: | -------: |
| Configure (≥80% kit) | {{X}} | {{X/M}}% |
| Extend (40-80%)      | {{Y}} | {{Y/M}}% |
| Build (<40%)         | {{Z}} | {{Z/M}}% |

### By effort tier

| Tier | Count |        % |
| ---- | ----: | -------: |
| S    | {{A}} | {{A/M}}% |
| M    | {{B}} | {{B/M}}% |
| L    | {{C}} | {{C/M}}% |
| XL   | {{D}} | {{D/M}}% |

### Overall SK Coverage

- **Sub-feature coverage (Configure + Extend):** {{(X+Y)/M * 100}}%
- **Effort-weighted coverage** (pondera por inverso del effort):
  - Pesos: S=4, M=2, L=1, XL=0.5
  - Score: ~{{W}}% del total de implementation work ride on kit primitives
- **FT-weighted (headline):** {{FT kit-heavy count}} kit-heavy + {{FT mixed}} mixed × 0.5 / {{N total FTs}} = ~{{FT%}}%

**Build bucket rationale:** {{1-2 líneas explicando por qué la parte Build está concentrada (typically sport-domain, irreversible schema decisions, domain mechanics). NO es drift si está justificada — es legitimate domain work.}}

---

## 3. SK Drift Tickets

<!-- Features/components encontrados en `src/` del target pero NO documentados en `sk-*` skills.
     Genera uno ticket per gap a `project/factory/sk-drift-{YYYY-MM-DD}-{project-slug}-{NNN}.md`
     (borrador: `factory ticket push` lo entrega como issue y lo borra; después, la referencia viva es el issue)
     Si el análisis no hace fallback a src/ (porque todo resolvió en skills), count = 0. Mencionarlo explícito. -->

**Drift tickets emitted:** {{count}}

{{#if count > 0}}
| Ticket | Component | Expected skill | Severity |
| --- | --- | --- | --- |
| `sk-drift-{{date}}-{{slug}}-001` | {{component name}} | `sk-{{domain}}` | HIGH/MED/LOW |
{{/if}}

{{#if count == 0}}
Rationale: el análisis resolvió cada sub-feature en skills documentados (`sk-features-index` + `sk-*`). No hubo fallback a `src/` del target. Build bucket es legitimate sport-domain, no kit gap.
{{/if}}

---

## 4. Leverage recommendations

### Orden de attack (maximize leverage first, derisk last)

**Wave 1 — Configure-first scaffolding (sem 1):**

1. {{FT-ID + feature name}}
2. ...

**Wave 2 — {{theme de la wave}} (sem 2):**

...

**Wave 3 — {{theme}} (sem 3-4) — heaviest Build bucket:**

...

**Wave 4 — {{theme}} (sem 5-6):**

...

### Features P0 (kit-heavy, fast delivery)

- {{FT-IDs que son ≥70% Configure. Unlockean demos tempranas.}}

### Cortes candidatos si deadline aprieta

Ordered por LOC saved ÷ scope impact:

| Rank | Candidate               | Trade-off         | Días salvados |
| ---- | ----------------------- | ----------------- | ------------- |
| 1    | {{FT-ID + sub-feature}} | {{qué se pierde}} | {{0.5-2d}}    |

### Top 3 leverage wins

1. **{{Win 1 title}}:** {{descripción 1-2 líneas + estimate saved vs greenfield}}
2. ...

---

## 5. Risks

<!-- Risks del leverage approach. HIGH = bloqueadores arquitectónicos. MEDIUM = pattern drift avoidable. LOW = info only. -->

### R1 — {{Risk name}} — **HIGH/MEDIUM/LOW**

{{1 párrafo del risk. Evidencia concreta, no generalización.}}

**Mitigación:** {{acciones accionables, no wishful}}

---

## Summary

- **{{N FTs}} / {{M sub-features}}** analyzed
- **{{%}}** SK Coverage (effort-weighted)
- **{{count}} SK drift tickets emitted** (`project/factory/sk-drift-*.md`)
- **Top leverage wins:** {{3 headlines}}
- **Top risks:** {{3 headlines HIGH/MED}}
- **Recommended order:** {{N waves plan}}. Buffer de {{X-Y}} días identificado si deadline slippage.

---

## Completeness Gate

| Check                                                                                             | Result      |
| ------------------------------------------------------------------------------------------------- | ----------- |
| Si `sk_active=true`: cada FT mapeado a SK skill + clasificado Configure/Extend/Build-from-scratch | PASS / FAIL |
| Si `sk_active=false`: body lleva nota "N/A — proyecto sin Starter Kit" + secciones N/A            | PASS / FAIL |
| SK drift tickets emitidos a `project/factory/sk-drift-*.md` cuando aplica                         | PASS / FAIL |
| Risks bucket: HIGH = blockers arquitectónicos, MED = pattern drift avoidable, LOW = info only     | PASS / FAIL |

**Overall:** PASS / FAIL

## Consumer Readiness

| Consumer     | Status                          | Blocking decisions |
| ------------ | ------------------------------- | ------------------ |
| `/design`    | `ready` / `partial` / `blocked` | —                  |
| `/backlog`   | (idem)                          |                    |
| `/implement` | (idem)                          |                    |

### Notes

{{Si SK drift tickets HIGH están abiertos: `/backlog partial` hasta resolverlos (linked como `DECISION-XXX`).}}

---

_TimeKast Factory — SK Leverage Analysis (tk-discovery Phase 5 · produced by dsc-kit-analyst)_

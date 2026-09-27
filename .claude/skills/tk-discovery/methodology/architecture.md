# Methodology — Architecture (system description)

> **Artifact:** `04_ARCHITECTURE.md` (path canónico `project/planning/04_ARCHITECTURE.md`).
> **Phase:** 6.1 (synthesis post-brief, después de 03_DEEP_DIVE).
> **Template:** `templates/04_ARCHITECTURE.template.md`.
> **Ships con cliente:** ⚠️ este doc viaja con el repo entregado al cliente. Debe ser auto-suficiente sin contexto Factory.

---

## §1 Source de input

- **Brief §5 (integraciones)** — servicios externos declarados, APIs.
- **Brief §8.3 (constraints técnicas)** — non-functional requirements.
- **`03_DEEP_DIVE.md`** — FT-NN topology, ENT-XXX universe (data model).
- **`decisions/ADR-*.md`** — todos los ADRs proposed/accepted (Phase 4c sub-rondas + Phase 6 synthesis emite si nuevos).
- **`07_SK_LEVERAGE.md` si sk_active** — kit modules + custom delta.

---

## §2 Shape obligatorio (5 secciones)

1. **§1 Topology** — diagrama de componentes + servicios externos. Consecuencias de ADRs bakeadas inline con refs `(ver ADR-XXX)`.
2. **§2 SK delta** — condicional sk_active. Si false: nota "N/A — proyecto sin SK".
3. **§3 Module boundaries** — layout, anti-imports, **routes inventory** (consumido por 05_RBAC resource SSOT).
4. **§4 Integration contracts** — servicios externos: protocolo + auth + error handling + retry + rate limits + webhook signing.
5. **§5 Cache posture** — strategy por surface (SSR / ISR / SSG / API / client / DB).

**NO §X ADR index** — multi-doc sync = drift. Single source = `decisions/ADR-*.md`.

---

## §3 ADR refs strategy

### Inline en §§1-5

Cuando una sección describe consecuencia de un ADR, agregar ref compacta:

> "Auth flow usa NextAuth con magic-link provider (ver ADR-003)."

### NO duplicar contenido del ADR

- Rationale completo → vive en `decisions/ADR-003.md`
- Alternatives_considered → vive en `decisions/ADR-003.md` frontmatter
- Change cost → vive en `decisions/ADR-003.md` frontmatter
- Status → leer frontmatter del file

### Lifecycle bidireccional

Cuando ADR pasa a `status: accepted`, orchestrator:

1. Actualiza `decisions/ADR-XXX.md` Resolution section
2. Edita 04_ARCHITECTURE.md §N relevante para bakear consecuencia + agregar ref `(ver ADR-XXX)`

---

## §4 Quantitative gate (Phase 6.1)

- `count(modules) ≥ 1` en §3 module boundaries
- `count(integrations) ≥ count(brief §5)` en §4 integration contracts
- **NO gate de ADR count** — `decisions/` es SSOT; 04_ARCHITECTURE cita pero no enumera.
- Si fail → orchestrator re-ensambla sección afectada; NO re-spawn.

---

## §5 Client deliverable considerations

Post-handoff, el cliente queda con:

- `project/` (incluye 04_ARCHITECTURE.md + decisions/)
- `src/` (código)
- Sin `.claude/` (Factory IP stripped)

Implica:

- **NO citar paths bajo `.claude/`** en 04_ARCHITECTURE.md — cliente no tendrá ese directorio.
- **NO citar skills del kit por nombre** — describir el sistema, no la metodología que lo construyó.
- **SÍ citar `decisions/ADR-XXX.md`** con path relativo — cliente tendrá ese directorio.
- **SÍ describir custom infra** (tunnels, agent servers, integraciones raras) en detalle — cliente necesita mantenerlas.

---

## §6 Refs downstream

- `/design` lee 04 §3 Module boundaries para layout constraints + §4 para integration touchpoints
- `/backlog` lee 04 §3 para issue scope (qué módulo afecta) + 04 §5 para cache invalidation strategy en issues
- `/implement` lee 04 entero como context técnico — todas las decisiones bakeadas inline aplican

---

_TimeKast Factory — tk-discovery methodology · architecture_

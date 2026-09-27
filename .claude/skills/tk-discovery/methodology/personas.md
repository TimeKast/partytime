# Methodology — Personas

> **Artifact:** `02_PERSONAS.md` (path canónico `project/planning/02_PERSONAS.md`).
> **Phase:** 6.1 (synthesis post-brief).
> **Template:** `templates/02_PERSONAS.template.md`.

---

## §1 Source de input

- **Brief §2 (roles & permisos)** — lista de roles con descripción 1-línea.
- **Deep-dive Users field** (per FT-NN) — qué persona toca cada feature, fricciones detectadas.
- **sk-leverage si sk_active** — admin/staff overrides del kit (`super_admin`, `admin`, `staff` ya tienen ROUTE_ACL definido).

Si brief §2 está vacío → STOP, no se puede emitir personas sin actor universe.

---

## §2 Output canónico

Per persona, full shape:

- **PER-XXX** — ID emitido (de `id-registry.md`)
- **Rol** — string del brief §2
- **Persona name** (opcional) — nombre human-readable si el cliente lo provee
- **JTBD** — 1-2 párrafos del Job-To-Be-Done
- **Perfil técnico:** nivel, frecuencia, device, canal soporte, locale
- **Pain points:** ≥2 frustraciones del workflow actual
- **Sensibilidad operativa:** señal para UX defensiva (o "N/A — bajo riesgo")
- **Refs upstream** — brief §2 anchor + lista de FT-NN donde aparece

---

## §3 Quantitative gate (Phase 6.1)

- `count(PER-XXX) ≥ count(roles del brief §2)` con ≥90% coverage
- Cada PER-XXX debe tener JTBD + sensibilidad operativa fields completados (no placeholders)
- Si fail → orchestrator re-ensambla persona faltante; NO re-spawn agent

---

## §4 Convention

- IDs **PER-XXX** (con prefix `PER-`, no `P-` ni bare). Ver [`id-registry.md`](id-registry.md) §1.
- **NO inventar personas** que no existen en brief §2 o deep-dive Users. Si hay gap real → registrar como OQ-XXX en freeze-map (o DECISION-XXX si bloquea synthesis).
- **Persona name opcional** — solo si cliente lo provee. Default = usar rol como title.

---

## §5 Refs downstream

- `/design` lee personas para UX defensiva (input sanitization, error states defensivos para novice users, etc.)
- `/backlog` lee personas para acceptance scenarios actor (US-XXX cita PER-XXX en `Refs:`)
- `/implement` lee personas para context — feature comments / docs pueden citar PER-XXX

---

_TimeKast Factory — tk-discovery methodology · personas_

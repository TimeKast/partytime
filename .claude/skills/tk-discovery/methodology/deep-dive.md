# Methodology — Deep Dive (brief 11 sections + Tier S/M/L feature semantics)

> Sub-file of `tk-discovery/methodology/`. See parent `methodology.md` for the full index.
> Topical scope: shape of the brief's 11 sections plus the per-feature 8-fields schema and S/M/L tier semantics that drive Phase 4b parallel batches and Phase 4c dedicated sessions.

---

## §5 — 11 Sections schema (resumen)

Cada sección del brief tiene un shape específico. El template (`templates/00_DISCOVERY_BRIEF.template.md`) es la fuente canónica; aquí el resumen conceptual:

| §   | Sección                 | Foco                                                                           |
| --- | ----------------------- | ------------------------------------------------------------------------------ |
| §1  | Idea General            | Pitch + problema + solución + North Star + MVP vs Futuro + durable constraints |
| §2  | Usuarios, Roles, Equipo | Stakeholders (decisores) + Team (ejecutores) + Users + RBAC + Auth             |
| §3  | Funcionalidades Core    | Features MVP + SK Leverage Summary + User Stories + Excluidas                  |
| §4  | Modelo de Datos         | Entidades + Relaciones + Datos sensibles                                       |
| §5  | Integraciones           | APIs externas + Servicios terceros (sin stack gravity)                         |
| §6  | Reglas de Negocio       | Invariantes + Cálculos + Estados + Triggers                                    |
| §7  | UI/UX                   | Plataformas + Pantallas + Flujos + Preferencias diseño                         |
| §8  | Infraestructura         | Hosting + DB + Jobs + **Timeline (quality dogma)**                             |
| §9  | Branding                | Nombre + Paleta + Tipografía + Tono + Assets                                   |
| §10 | Mobile/PWA              | Device principal + Offline + Capacidades nativas + Performance                 |
| §11 | Visual Direction Seeds  | Postura + Referencias + Constraints + Mood                                     |

### 🔴 Nota crítica sobre §11

**§11 es CONTENIDO visual** (postura, referencias, mood). Alimenta `/design` directamente.

**NO confundir con Appendix A (Reconciliation Checklist)** — ese es un apéndice MECÁNICO, no contenido. Ver `methodology/intake.md §7`.

---

## §11 — Deep-Dive Schema

Formaliza los 8 fields que Phase 4 usa per-feature (antes implícitos en SKILL.md Phase 4):

1. **Happy path:** flujo principal step-by-step
2. **Error / edge cases:** qué puede salir mal + cómo se maneja
3. **Auto vs manual:** qué dispara el sistema vs acción humana
4. **Referencia:** app similar que implemente esto (anchor comparativo)
5. **Usuarios:** rol/persona que ejecuta + permisos
6. **Datos:** entidades afectadas + mutation pattern
7. **Reglas:** BRs aplicables (IDs anchor a §6 del brief)
8. **Layout impact:** `true | false` — feature requiere layout custom (panel lateral, wizard multi-step, columna de tabla con render custom, split view) vs layout default del kit. Consumido por `tk-design` Phase 4 SCR classifier para decidir tier (kit-pure / kit-extended / custom). Default si dudas: `false`. **NEW v6.2.0.**

> Note: el template también incluye `Action contracts` field (signature + path + RBAC + Zod input + ActionResult output + errors + side effects per action), que Phase 6.1 usa para emitir `10_API_SURFACE.md`. No es parte del "canonical conceptual" pero sí del table emitido. Tier S features omiten el 8-fields breakdown (overkill — 1-fila compact suficiente).

### Batching rules

- Max 5 features por batch
- Single post-all-batches checkpoint al cerrar Phase 4b: `1=continuar / 2=revisar OQs / 3=ahondar en FT-X` (no per-batch checkpoints — ver SKILL.md §Phase 4b)
- Serial dentro del batch para Tier L (dedicated main orchestrator sessions)
- Paralelizable per batch para Tier S/M (`dsc-feature-specer` agents)
- Persist batches a `project/discovery-artifacts/deep-dive-batch-{N}.md`; main orchestrator concatena post-Phase-4 → `project/planning/03_DEEP_DIVE.md`

### Tiering rules (Phase 4a classification)

Antes de procesar en batches (Phase 4b/4c), clasificar cada FT en 3 tiers con criterios objetivos:

| Tier                 | Criterio                                                                                                                                                 | Output format                                             | Processing                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **S** (SK-trivial)   | Configure-only, kit ships end-to-end, `sk-features-index` lista la feature. Acción = Configure.                                                          | 1-fila compact en §3.1 tabla del brief                    | `dsc-feature-specer` parallel batches                                            |
| **M** (Extend)       | Kit ships + requiere custom fields/wrappers/integrations. `sk-*` skill referenciable. Acción = Extend.                                                   | 8-fields compact completo                                 | `dsc-feature-specer` parallel batches                                            |
| **L** (Build custom) | Kit no ships, schema-level decisions, domain-specific mechanics. Acción = Build. Ejemplos: scoring engines, polymorphic schemas, complex state machines. | 8-fields + `needs /docs state-machine elaboration` anchor | **Main orchestrator interactive** (sub-ronda clarificación obligatoria con user) |

**Regla:** Tier L NUNCA se procesa por `dsc-feature-specer`. Agent aborta si recibe un Tier L en su input.

### Template canónico

Schema + placeholders → [`../templates/03_DEEP_DIVE.template.md`](../templates/03_DEEP_DIVE.template.md). Agent consume template + genera entries según tier.

---

_TimeKast Factory — Discovery methodology / deep dive (sub-file)_

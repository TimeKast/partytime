# fx-workflow-authoring — Changelog

> Audit trail for the meta-skill that codifies CC-native workflow authoring doctrine. Convention: [Keep a Changelog](https://keepachangelog.com).
>
> **Scope rule:** `fx-skill-author §8` decides which skills carry a CHANGELOG — this header only points there. This skill follows its own doctrine: body is ahistorical, evolution lives here.

---

## [Unreleased] — date TBD upon merge

### Changed

- **§8 Presupuesto — "los cuatro documentales" pasa a tres exentos + un consumidor, y la sección gana la figura del consumidor PARCIAL.** El párrafo afirmaba que los cuatro workflows documentales del kit resuelven su presupuesto por fuera del registry; `/backlog` dejó de estar en ese grupo — es el primero que cableó la lectura, y deriva de la escala de riesgo el conteo de pases de revisión de su pipeline plan-mode, sobre los archivos que su plan enumera. Se agrega además la regla que ese caso obligaba a escribir: **un workflow puede consumir un renglón de la agregación y eximirse del otro, siempre que la exención parcial lleve su razón escrita en su propio `SKILL.md`**, con el mismo estándar que una exención total. Lo que no vale es consumir uno y dejar el otro resuelto por omisión: el lector no distingue una decisión de un descuido, y un derivado que endurezca el renglón exento compraría un endurecimiento inerte sin enterarse. La doctrina de fondo no se mueve — la narración obligatoria del recorte y la frontera "subprocesos, jamás rigor" siguen igual.

- **§7.1 criterio 4 — la prueba de "señal real" es la respuesta, no el tema (EPIC-23).** El criterio ilustraba "decisión genuina sin default obvio" con **"UI sin diseño"**, y ésa era su única instanciación en el kit: al degradarse el design gate de `/backlog` a señal narrada, el ejemplo quedaba huérfano instruyendo lo contrario que el workflow, y el próximo autor lo habría reconstruido. Se sustituye por un checkpoint vivo (dominio sensible sin override declarado) y se agrega la prueba que faltaba: **si en la operación real la respuesta sale siempre igual, no hay decisión — hay fricción.** La prueba declara sus **dos** salidas, porque colapsarlas enrutaría mal un gate cuya respuesta constante sí tiene efecto: con efecto → se aplica sin preguntar (el "default correcto obvio" de la línea siguiente, que sigue actuando y solo deja de interrogar); sin efecto → señal narrada. Y se acota **explícitamente al criterio 4**: en los criterios 1-3 lo que gatea es el costo de reversión, no la variabilidad de la respuesta — un gate HIGH-risk o irreversible no se degrada aunque la respuesta sea siempre la misma (`CC.md §4`). Sin esa salvedad la frase, que es la más citable de la sección, autorizaba demoler un gate irreversible al sacarla de su ítem.
- De paso se retira el segundo ejemplo del criterio ("agrupación de prosa con juicio"): su única instanciación —CP-split-proposal— **no para en fluido** (`tk-backlog §6`: `none` auto siempre; `present` → auto-advance + caveat), así que era un contraejemplo del propio criterio, y la prueba recién agregada lo diagnosticaba como fricción.

### Added

- **§8 — Presupuesto de subprocesos.** El presupuesto de spawns de un workflow deriva del nivel de riesgo del registry, igual que el panel de revisores y el gate de interacción; ningún workflow declara predicado propio de volumen. Sobreviven dos elementos como doctrina propia de la sección: la narración obligatoria del recorte y la frontera "el recorte es de subprocesos, nunca de rigor".

### Changed

- **§8 Naming convention — el corte scoped/genérico se re-ancla a su SSOT.** La formulación por call-sites (_"generic agents (cross-workflow)"_) se reemplaza por el criterio **lente vs. maquinaria**: prefijo cuando el agent ejecuta una fase de un pipeline concreto; sin prefijo cuando hace una pregunta invariante al objeto. El SSOT del corte queda en `CC.md §2` — junto a la lista cerrada de genéricos y a la prohibición de inventarlos, que es su punto de enforcement (se evaluó `CC.md §7` Ontología y se descartó: esa tabla mapea concepto → primitiva → directorio sin distinguir clases de agentes, y escribir el corte ahí lo alejaría de la lista que gobierna) — y §8 lo aplica sin redefinirlo. Motivo: el criterio vivía en tres lugares con tres formulaciones (call-sites aquí, conteo _"3+ workflows"_ en `CLAUDE.md`, ausente en `CC.md`), incumpliendo `CORE.md §1` en el eje taxonómico. Primer consumidor: `grounding-auditor` — genérico nuevo que nace con un solo call site; el criterio de conteo lo habría clasificado mal.

- **Desviación deliberada del plan fuente de la ola de ejecución — se registra como override, no como resolución de una contradicción.** El plan asignaba el volumen al presupuesto de spawns *y*, en otros dos puntos, declaraba que un solo número (el riesgo) gobierna los tres consumidores. La decisión del owner retira el volumen de **ambos** roles: no se reconcilia una contradicción del plan, se elige un camino distinto del que el plan describía.

  **Qué lo motivó:** un workflow había implementado el patrón con un predicado propio —procedencia ∧ conteo de unidades de trabajo ∧ lista literal de paths sensibles— que ningún otro podía reusar. En producción el conteo cambió a mitad de corrida sin que nada re-evaluara el predicado, y el run terminó con menos subprocesos de los que ameritaba. La instrucción de re-evaluar existía, pero como prosa sin gate.

  **Por qué retirar en vez de blindar:** los tres ejes del predicado tienen mejor casa. Los paths sensibles ya viven en el registry; cuántos revisores corren ya sale del panel por nivel, con cinco niveles en vez de un binario; y **el eje de volumen desaparece**. Sin conteo propio no hay nada que re-evaluar — el modo de falla muere por construcción, no por vigilancia.

  **Tres elementos del patrón original NO se canonizan**, y es deliberado: el predicado propio, la re-evaluación en los puntos donde el conteo cambia, y el upgrade unidireccional a mitad de corrida. Los tres eran andamiaje del predicado y mueren con él.


- Initial v2 skill — CC-native workflow authoring doctrine.
- `SKILL.md` monolithic entry covering 17 sections: framing CC-native authoring, ontology table (agents = subprocesses aislados), 9 principios, file structure, frontmatter shape, SKILL.md sections in order, CP1 vs CP2 doctrine, subprocess delegation policy, skill grounding rule, invalidation handling rule, companions decision tree, wrapper rules, heavy vs ligero, heavy checklist, verificación funcional, boundary, post-change validation.
- `anti-patterns.md` with 14 sections + greps for CI: runtime/execution, structure, AG carry-overs (rescue exercise), frontmatter, scope, CC-specific gotchas, skill body discipline, subprocess skill citation, heavy without companions, wrapper anti-patterns, no-template-no-artifact (hard rule), missing invalidation handling, subprocess tools allowlist, review checklist final.
- `templates/` folder with 6 concrete skeleton files (not prose describing them):
  - `tk-skill.template.md` — SKILL.md skeleton with 11 sections marker "aplica si workflow tiene X".
  - `slash-command.template.md` — thin wrapper with mode detection + delegate.
  - `workflow-changelog.template.md` — Keep-a-Changelog buckets + Rationale + Verification path.
  - `checkpoint-inline.template.md` — CP1 compact mode + verbose mode + invalidation rule + sub-ronda.
  - `checkpoint-planmode.template.md` — CP2 synthesis structured (6 sub-sections).
  - `subprocess-prompt.template.md` — frontmatter with role-based tools allowlist + Mandate + Skill grounding + Input contract + Cuándo NO usar + Return summary.

### Rationale

- v1 framing was AG→CC translation; v2 reframes as CC-native authoring doctrine, with AG legacy material relegated to `anti-patterns.md §3` as a rescue exercise.
- v1 ontology described agents as "QUIÉN lo hace — persona"; v2 corrects to "subprocesses aislados con contexto propio" — the operative valor is isolation + load control + parallelism, not roleplay.
- v1 shipped templates as prose descriptions; v2 ships real skeleton files in `templates/` that authors can copy and fill.
- v1 ≤200 LOC SKILL.md constraint (AG residue) dropped. Monolithic SKILL.md works when well-structured with explicit turn boundaries and H2/H3 navigation; partir solo si secciones temáticamente separables, no por número de líneas.
- v1 missing 4 critical rules surfaced during external review and now codified:
  - **No template, no artifact** (hard rule).
  - **Wrapper no contradice skill** (wrapper redefinitions of checkpoint semantics are forbidden).
  - **Invalidation handling obligatoria** for any heavy workflow with checkpoints.
  - **Subprocess tools allowlist** with role-based defaults (writers get Write; auditors stay read-only).
- A cohesive walkthrough file referencing a single existing workflow was rejected during design: it risks biasing authors of new workflows to replicate that workflow's specific shape (multi-turn vs lineal, extraction vs synthesis, etc.) without filtering by their own domain. Doctrine in this skill is portable and does not anchor to any single existing workflow.

### Verification path

- All 6 template files exist under `templates/` and are referenced from at least one section of `SKILL.md` or `anti-patterns.md`.
- `anti-patterns.md §14` greps return empty (or expected matches) when run against this skill itself.
- `SKILL.md §15 Verificación funcional` applied to a hypothetical heavy workflow answers all 12 checklist questions without "depende" or "quizá".
- v1 `fx-workflow-authoring/` remains untouched for fallback comparison (side-by-side approach).

---

## How to add an entry

When making a change to `SKILL.md`, `anti-patterns.md`, or any `templates/*.template.md`:

1. Choose semantic version slot under `[Unreleased]` if no release is scheduled, or create a new versioned section above (e.g., `## [1.1.0] — 2026-MM-DD`).
2. Bucket the change: **Added** / **Changed** / **Deprecated** / **Removed** / **Fixed** / **Security**.
3. Write the entry as a behavior delta — what the skill describes now that it didn't before. Generic phrasing — no specific project names.
4. Reference the exact section/file modified (e.g., `See SKILL.md §8 Subprocess delegation`).
5. If the change has consequences for existing `tk-*` skills (e.g., a new rule added), note them under "Verification path."

---

_TimeKast Factory — fx-workflow-authoring CHANGELOG_

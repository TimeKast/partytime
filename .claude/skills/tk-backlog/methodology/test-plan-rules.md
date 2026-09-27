# tk-backlog — Test Plan Rules + DoR Gate

> 3-layer pyramid in every issue's DoD + el **test-gate** (component-test, per-issue), único gate que este motor ejecuta. La **señal de diseño** (per-run, plan-mode) escribe en la misma lista `gate_decisions` pero no pregunta nada. Live behavior: [`../SKILL.md`](../SKILL.md) §22 (test-gate) + §7.6 / [`readiness-gates.md`](readiness-gates.md) (señal de diseño). Anchors: `SK.md §4.2`, `DOR_DOD.md` (DoR §"Si aplica").

> ⚠️ **No confundir gate con señal (comparten la lista `gate_decisions`):** el **test-gate** (este archivo) decide algo — tiene default obvio, así que en fluido auto-agrega el test y en `--step` pregunta `[y/n/justify]`. La **señal de diseño** (`readiness-gates.md` §Phase 0.6) no decide nada: registra la UI sin SCR como nota + auto-texto en `DoR Waivers`, sin parar en ningún modo.

---

## Layer requirements

Per `SK.md §4.2` (3-layer pyramid). Each issue declares the layers its change needs as **explicit AC**:

| Issue characteristic                            | Required AC                                |
| ----------------------------------------------- | ------------------------------------------ |
| Pure function / helper / validation             | Unit test AC                               |
| UI interactive (handlers / state / conditional) | **Component test (RTL) AC — DoR blocker**  |
| Cross-page / auth / RBAC                        | **E2E (Playwright) AC — DoR blocker**      |
| Cross-screen flow ≥3 SCRs                       | Dedicated `e2e-flow` issue (not folded in) |
| **Cambio visual** (tokens, tema, layout, skin)  | **Evidencia visual AC — condicional** (§AC layer) |
| Pure refactor / docs-only                       | Unit AC optional · component/E2E exempt    |

Tests live in the issue's DoD by default. The only split-out is a cross-screen flow ≥3 SCRs → its own `e2e-flow` issue. Gherkin §5 scenarios map 1-to-1 to test cases where applicable.

## DoR test-gate (per-issue — closes el motor de gates del DoR)

`DOR_DOD.md` (DoR §"Si aplica") mandates: an issue that changes an interactive component **without** a component-test AC is **blocked** unless justified. `tk-backlog` turns this human-check into an automated gate. Runs in **`nuevo`, `add` and `extend-epic`** — every mode that emits issues. En **fluido** (default) auto-resuelve hacia la AC; en **`--step`** es interactivo (`[y/n/justify]`).

> **Por qué `extend-epic` también.** Un issue emitido por `extend-epic` es un issue como cualquier otro: `/implement` lo ejecuta con el mismo executor y su DoD exige las mismas capas. Excluirlo producía una asimetría sin razón declarada — el mismo issue llevaba AC de test vía `add` y no la llevaba vía `extend-epic`, y en modo fluido esa AC **se auto-agrega sin preguntar**, o sea que era gratis y aun así no se obtenía. La asimetría dolía justo donde más importa: los fixes de UI que llegan por `extend-epic` suelen ser correcciones de algo que ya se rompió una vez. (La detección de diseño siempre corrió en `add`/`extend-epic` — era el test-gate el que se había quedado corto.)

### Detection — UI interactive

The issue is flagged interactive if either:

- Title/description matches a keyword: `componente`, `button`, `form`, `input`, `dialog`, `modal`, `dropdown`, `select`, `checkbox`, `toggle`, `onClick`, `onChange`, `onSubmit`, `table editable`, `tabs`; **or**
- Scope lists files under `src/components/**`, `src/app/**` (page/layout/template) or `.claude/skills/*/ui*`.

### AC layer — WHICH test the gate stamps

Detection answers **whether** the issue needs a test AC. It does not answer **which layer**, and
fusing the two is what produces an unfulfillable AC: the component stub names
`tests/unit/components/<name>.test.tsx`, a directory an App Router page does not live in, and the
kit routes pages to Playwright ([`sk-testing-nextjs`](../../sk-testing-nextjs/SKILL.md) §coverage
exclusions · `SK.md §4.2`). So the layer is decided **by the attributed file paths**, one class at
a time:

| Attributed path                                | AC layer            | Stub the gate stamps                                                                                                                       |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/**` · `.claude/skills/*/ui*`   | Component (RTL)     | `- [ ] Component test en tests/unit/components/<name>.test.tsx cubre render + handler + edge state`                                        |
| `src/app/**/{page,layout,template}.tsx`        | E2E (Playwright)    | `- [ ] E2E en tests/e2e/<slug>.spec.ts cubre la ruta <route>: carga + contenido clave montado + estado vacío/error si aplica`              |
| `src/app/api/**`                               | Unit del handler    | `- [ ] Unit test en tests/unit/app/api/<name>.test.ts cubre el contrato del handler (status + shape de la respuesta) + un caso de error`       |
| `src/components/**` · `src/app/**/{page,layout,template}.tsx` **con cambio visual** | **Evidencia visual** (además de la capa de arriba, no en vez de ella) | `- [ ] Evidencia visual: si este checkout cablea el proyecto evidence en playwright.config.ts (Grep sobre playwright.config.ts buscando 'evidence'), se corre pnpm evidence:visual y se cita el manifest en el Evidence; si no, se anota la ausencia y el check multi-tema queda como "no demostrado", nunca Pass` |

Rules:

- 🔴 **La evidencia visual es una capa APARTE, no una cuarta alternativa.** Las tres capas de arriba responden *"¿el cambio funciona?"*; ésta responde *"¿cómo se ve, en cada tema y en cada ancho?"* — un component test con RTL no mira píxeles y jamás va a atrapar un token que se ve mal en `midnight`. Un issue de UI con cambio visual estampa **las dos**: su capa de test y ésta.
- 🔴 **Y se estampa CONDICIONADA, siempre.** El harness ([`fx-visual-evidence`](../../fx-visual-evidence/SKILL.md)) necesita `scripts/tools/e2e-runner.ts` —que no viaja al perfil `core`— y un proyecto `evidence` en un `playwright.config.ts` que nace congelado en cada derivado. Un stub incondicional sería un AC **estructuralmente incumplible** ahí: `/backlog` estaría emitiendo issues que sólo se pueden cerrar mintiendo. La condición **es** el criterio, no un descargo.
- 🔴 **La condición se comprueba contra `playwright.config.ts`, NO contra `pnpm test:e2e --help`.** El help del runner es texto estático generado de las constantes del kit: nombra la fase `evidence` en **todo** checkout, esté cableada o no, así que un AC que mande consultarlo dice siempre "sí está disponible" y vuelve incumplible al issue justo en los derivados para los que la condición existe. Y esta línea viaja **dentro de cada issue emitido** — un procedimiento falso aquí queda copiado en backlogs que ningún fix posterior del kit alcanza. La comprobación es la misma de la Phase 0 de [`visual-evidence-adoption.md`](../../../docs/retrofits/visual-evidence-adoption.md).
- **Detección: mismo motor, señal distinta.** Dispara sobre las clases de path de UI de arriba cuando el issue describe un cambio **visual** (tokens, tema, skin, layout, espaciado, jerarquía de superficies) — no sobre un cambio de comportamiento que casualmente vive en un componente. Ante duda **no** se estampa: la capa de test de la fila correspondiente ya cubre lo funcional, y un AC de evidencia sobre un cambio sin superficie visible es ruido que enseña a ignorar la fila.
- **One AC per class touched.** An issue whose scope spans a component AND its page gets BOTH
  stubs — they cover different things (the handler in isolation vs the route wired end-to-end),
  and collapsing them loses the one the implementer would not have written on their own.
- **Keyword-only detection** (no UI paths attributed yet, typical of `greenfield` where scope is
  a SCR rather than a file list) → component stub, as the layer the keywords describe
  (`onClick`, `form`, `dialog` are component-level concerns).
- **The gate never stamps a layer it cannot name a target for.** No route resolvable for a
  page → emit the E2E stub with the route slot left explicit (`<route>`) rather than guessing a
  path; a wrong path reads as verified work that never ran.

> ⚠️ The `Pure refactor / docs-only` exemption (§Layer requirements) is **deliberately not
> auto-detected**. There is no issue field that classifies a change as behaviour-preserving
> (`template` distinguishes ISSUE / SETUP / UI-CRITIC / E2E-FLOW, nothing finer), so detecting it
> would mean keyword-matching `refactor` / `rename` / `censo` in a title — a bypass anyone could
> trip by wording, on the one gate this engine exists to keep honest. The exemption is claimed
> explicitly through `justify` in `--step`, where a human writes the reason and it lands in
> `DoR Waivers`. Routing the AC to the right layer (above) is what the refactor case actually
> needed; the exemption is not a substitute for it.

### Gate behavior — por modo (`fx-workflow-authoring §7.1`)

El default correcto es obvio (agregar el test recomendado = dirección segura) → **no es señal real**. Lo que el modo decide es **si** se agrega la AC; **cuál** stub se agrega ya lo fijó §AC layer, en los dos modos por igual.

- **Fluido (default)** → **auto-agrega la AC de la capa que corresponda** (= `y`), sin preguntar. (El bypass `justify`/`n` solo existe en `--step`.)
- **`--step`** → prompt `¿AC de <capa> test? [y/n/justify]` (la capa ya resuelta, no una pregunta):
  - **`y`** → continue; add the AC stub of that layer.
  - **`justify <reason>`** (≥20 chars, e.g. "componente puramente presentacional, sin handlers") → continue; record the reason in the issue's `> **DoR Waivers:**` field.
  - **`n`** or justification `<20 chars` → **block**: no file written. Message: `❌ Issue bloqueado: componente interactivo requiere AC de component test o justificación (DOR_DOD.md)`.

Cross-page/auth/RBAC issues get the same gate for an **E2E AC**.

### Machine-readable log

Every gate decision is appended to the run manifest:

```yaml
gate_decisions:
  - { issue: AUTH-030, type: component, decision: y, layer: component }
  - { issue: DEBT-028, type: component, decision: y, layer: e2e }
  - {
      issue: DASH-080,
      type: component,
      decision: justify,
      justification: 'KPI card presentacional, sin handlers',
    }
```

This satisfies el motor de gates del DoR's "log del gate decision en formato machine-readable para post-hoc audits".
`layer` records which stub the decision produced (§AC layer) — an audit that only sees `decision: y`
cannot tell a page routed to E2E from a page handed the wrong stub, which is the failure the
routing exists to prevent. `type` stays `component` (the gate that fired); `layer` is its outcome.

### Gate scenarios (the 3 el motor de gates del DoR cases)

1. **happy (`y`)** — interactive issue + `y` → issue created with the AC of its layer (§AC layer): component for `src/components/**`, E2E for a page.
2. **bypass (`justify`)** — interactive issue + valid justification → issue created, `DoR Waivers:` populated, decision logged.
3. **block (`n` / short justification)** — interactive issue, no AC, no valid justification → workflow aborts the issue, no file written.

## Touchpoint

`DOR_DOD.md` documents both surfaces con su comportamiento por modo: (a) test-gate → `--step` `[y/n/justify]`, fluido auto-`y`; (b) señal de diseño → sin pregunta en ningún modo, nota + auto-texto en `DoR Waivers`. A micro-section in this skill (this file) documents the test-gate; the design signal lives in [`readiness-gates.md`](readiness-gates.md). Together these close el motor de gates del DoR.

---

_TimeKast Factory — tk-backlog v1 · test-plan-rules_

# tk-proposal — Changelog

> Internal workflow audit log (scope rule: `fx-workflow-authoring §11` decides which workflows carry a CHANGELOG — this header only points there). Entry policy: non-trivial behavior changes get an entry.
> Convention: [Keep a Changelog](https://keepachangelog.com).

---

## [Unreleased]

### Changed

- **Los tokens de la propuesta se leen de la bóveda y el workflow ramifica por código.** `GAMMA_API_KEY`,
  `SHORTIO_API_KEY` y `PROPOSAL_ASSETS_R2_TOKEN` salen del rail (`rail-timekast`) con la sesión de la persona,
  sin copia en disco. Los tres helpers aceptan `--check` y salen con un código por falla (`40`-`45`,
  `scripts/tools/lib/rail.sh`). El gate de Gamma (P3 paso 2) ramifica por ese código: **sólo `42`** (la key no
  está) degrada a md-only; sin sesión, sin acceso, respuesta no reconocida, `infisical` sin instalar o sin
  `vault.json` **paran** con su arreglo. La generación (paso 3) aplica la misma tabla si la sesión caduca a
  medio camino, y sólo un fallo del proveedor fuera de `40`-`45` va a md-only. El logo de P1, en headless, sigue
  sin logo ante `42` y es fail-closed ante los demás códigos. El acortado de short.io (paso 5) ramifica
  igual: `42` sigue sin URL corta y lo registra; los demás códigos del rail paran con su arreglo y reportan
  la URL del deck ya creado. See SKILL.md §11, §13.

- **El deck sale con imágenes de la industria del cliente y con los dos logos.** P1 propone siempre una
  dirección visual (`image_style`) derivada de la industria del cliente y el tipo de aplicación, y resuelve
  los logos contra el bucket público del org (`https://assets.timekast.com/<slug>/logo.png`); CP1 los
  confirma y P3 los pasa a `gamma-generate.sh`. Un logo que falta se sube con
  `scripts/tools/proposal-asset-upload.sh`. Los dos valores quedan en el frontmatter, como provenance.
- **Cifras literales en el deck.** Los tres tiers piden a Gamma no abreviar montos (`condense` convertía
  "$500,000" en "$500k"), y P4 lo verifica sobre el deck.
- **La propuesta se versiona en git, sin contradicción.** El `.gitignore` del kit dejó de ignorar
  `project/proposals/`; el CP-commit recomienda commitear y usa `git add -f` para los derivados que aún
  traen el patrón viejo. See SKILL.md §2, §6, §7, §11, §12, §13 P3, §14.
- **La propuesta ya puede llevar precios.** Se retira el guardrail antiguo de "cero precios": el Apéndice D
  pasa de "Estructura de Inversión" (sin montos) a "Inversión", con los montos que se confirman en CP1. La
  fuente es la §1 de `00b_INTERNAL_ESTIMATE.md` (`/estimate`) —Precio Total, soporte, infra— o lo que dicte
  quien cotiza. El desglose interno del estimate (puntos, tarifa por punto, cobertura, tokens) sigue sin
  salir al cliente, y el checklist de P4 lo verifica. Sin montos confirmados, el Apéndice D queda como antes.
  See SKILL.md §3, §6, §11 CP1, §14.
- **§14.1 — audit SkillSpector 2026-09-20.** El `CP-commit` no corre en modo `validar`: P4 es también su checklist y ese modo promete cero writes durables, así que termina en el reporte, antes de esta sección.
- **Entrega vía Gamma + short.io (reemplaza el HTML one-pager).** El workflow emite un **único Markdown
  versionado** en `project/proposals/{slug}.md` con frontmatter de provenance (`title`/`slug`/`tier`/
  `created_at`/`gamma_url`/`short_url`); el MD es la fuente de verdad. El deck visual lo genera **Gamma** vía
  su **API REST** (`scripts/tools/gamma-generate.sh`, auth `X-API-KEY` con la `GAMMA_API_KEY` del rail) desde
  el body del MD, y la URL se acorta con **short.io** (`scripts/tools/shortio.sh`). Si no hay `GAMMA_API_KEY`
  (o el tool falla), el workflow degrada a la ruta **md-only** sin abortar — el MD sigue siendo entregable.
  (NO usa el MCP/connector OAuth de Gamma — ese es interactivo/per-dev; la API REST es programática + headless
  y usa la key del rail.) See SKILL.md §§7, 13.
- **Fases P0-P4.** P0 cleanup + tier + readiness · P1 synthesis + drift/gap · CP1 tier+alcance (inline) ·
  P2 emit MD · CP2 aprobar MD + gate Gamma (Plan Mode) · P3 strip-frontmatter → Gamma REST → short.io →
  provenance · P4 checklist + cierre. See SKILL.md §§8-14.
- **Strip-frontmatter antes de Gamma.** P3 manda a Gamma **solo el body** del MD (descarta el bloque
  frontmatter), por lo que `gamma_url`/`short_url` nunca llegan al deck (evita loop de provenance). See
  SKILL.md §13 P3.
- **`developer` lleva internals al deck (FR-8).** La restricción `additionalInstructions` que prohíbe
  mencionar el stack se aplica **solo** a `negocio`/`ejecutivo`; el tier `developer` envía los internals del
  body a Gamma sin restricción. See SKILL.md §3.
- **Modo `validar` redefinido (FR-4).** Valida que `project/proposals/{slug}.md` existe + que el frontmatter
  trae provenance + reporta pasos pendientes (P3) si no hay `gamma_url`/`short_url`. Ya no busca HTML, assets
  ni pantallas curadas. See SKILL.md §14.
- **Flags.** `--md-only` (salta Gamma), `--cards N`, `--theme <name>`, `--folder <name>` para el deck; se
  mantienen `--tier` y `--client <path>`. See SKILL.md §5.
- **Regeneración mantiene el mismo short link.** Como Gamma genera un deck nuevo al regenerar (la API no edita
  el existente), P3 llama `shortio.sh --update` cuando el frontmatter ya traía `short_url` → re-apunta el link
  corto existente al deck nuevo sin cambiar el `shortURL` (no sufija `-2`). See SKILL.md §13 P3 paso 5.

### Removed

- **Sistema editorial `pe-*`/`pk-*` y pantallas curadas.** El workflow ya no consume el catálogo
  `fx-presentation-kit`, no renderiza pantallas del `/design`, ni vendoriza CSS/fonts/logo. `/design` queda
  como fuente **opcional** que enriquece §3/§5.
- **Template HTML.** `templates/presentation.template.html` eliminado; lo reemplaza
  `templates/PROPOSAL.template.md` (frontmatter + §1-9 + Apéndices A-D, cortes de tarjeta `---`).
- **Reuso de `mck-screen-renderer`.** El workflow no tiene subprocesses — todo corre en el main loop.
- **Salida `project/presentation/` + assets + ledger + publish.** Sin HTML autocontenido, sin carpeta de
  artifacts transicional, sin ledger de URLs (la provenance vive en el frontmatter del MD). La publicación a
  proposals.timekast.mx queda fuera del workflow (ops del derivado vía CLI).

### Notes

- **`[R2-2]` — contrato a confirmar en el e2e vivo:** el nombre exacto del campo de respuesta del MCP de
  Gamma (asumido `gammaUrl`) y el comportamiento del corte de tarjeta `---` son inverificables sin el MCP
  real. P3 los marca con un default sensato + nota de "verificar contra el MCP real". El e2e vivo con Gamma
  MCP + key de short.io queda fuera del DoD de este refactor (`[R2-3]`).
- **Plantilla del template** formalizada desde una propuesta de referencia real (estructura §1-9 +
  Apéndices A-D: arquitectura, seguridad, plan de trabajo, estructura de inversión).
- Sin agents propios (sin prefijo `prp-*`): la síntesis es razonamiento curado en el main loop.

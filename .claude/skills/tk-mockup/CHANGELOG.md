# tk-mockup — Changelog

> Internal workflow audit log (scope rule: `fx-workflow-authoring §11` decides which workflows carry a CHANGELOG — this header only points there). Entry policy: non-trivial behavior changes get an entry.
> Convention: [Keep a Changelog](https://keepachangelog.com).

---

## [Unreleased] — initial build

### Changed

- **El slot KPI de `§5 SK Components Used` se llama `StatCard` grid** (lo emite `/design` desde `kb-dataviz §3`; antes `StatsCards`, un componente demo que el kit borró). El render contract mapea los dos nombres a `pk-kpi`: el alias existe para los SCR ya emitidos con el nombre viejo.

### Added

- **Workflow inicial `tk-mockup`.** Renderiza el output de `/design` (`16_DESIGN.md` + `SCR/CMP/FLW`) en
  un recorrido HTML navegable, offline, client-facing, en `project/mockup/`. Consume el catálogo
  `fx-presentation-kit`. 4 fases + CP1 inline + CP2 Plan Mode. See SKILL.md §§6-12.
- **Render por tier (consumido, no recalculado).** `kit-pure` → adjunta `screens/*` del catálogo;
  `kit-extended` → orchestrator compone base + deltas inline; `custom` → `mck-screen-renderer` batched
  (cap 6, batch 4, Opus). El tier es SSOT de `tk-design` (§3 Screen Map). See SKILL.md §10.
- **Render contract.** ASCII = referencia de layout (síntesis, no transcripción); `§11 Copy` = literal;
  `§5` = binding a primitiva `pk-*`; `§9` = estados toggleables; CMP = primera clase; gap de spec →
  `blocked`, no improvisar (CODING.md §8). See `methodology/render-contract.md`.
- **Iconos inline.** `data-icon` → SVG resuelto desde `fx-presentation-kit/lucide.json`; el deliverable
  solo embebe los iconos usados, sin `lucide.json` en runtime. See `methodology/icon-resolution.md`.
- **Output self-contained.** Phase 3 copia `theme.css`/`kit.css`/fonts a `project/mockup/assets/` → la
  carpeta abre por doble-click sin `.claude/`, zippable para el cliente. See SKILL.md §11.
- **Anti-jerga.** Solo se renderiza el `§11 Copy` literal; términos técnicos prohibidos en texto visible;
  lint en Phase 4. See `methodology/anti-jerga.md`.
- **2 agents prefix-scoped `mck-*`** (`mck-context-analyst` Phase 1 serial · `mck-screen-renderer` Phase 2
  batched custom). Prefijo `mck` registrado en `agent-taxonomy-lint.sh`.
- **Templates** `screen.template.html` + `index.template.html` (regla "no template, no artifact").
- **Modo `validar`** read-only (integridad del `project/mockup/` existente) + flags `--client <path>` /
  `--keep-artifacts`.

### Changed (hito 5 — validación cross-proyecto contra fimubac)

- **Modelo de shell B':** el mockup pasó de "una pantalla completa por SCR + index con su propio sidebar"
  (doble-sidebar en escritorio) a **un solo shell = el DashboardShell real del producto**: sidebar de
  navegación real (de §2.4 / navigation.ts) + header + bottomnav, una sola vez, y el **body de cada
  pantalla se intercambia** al navegar (modelo SPA). Pantallas `(public)`/auth → full-screen sin shell.
  Veredicto de `ui-critic`. Toca `templates/{index,screen}.template.html`, `render-contract.md`,
  `tier-strategy.md`, `SKILL §5/§9/§11/§14`, ambos agents.
- **Fixes detectados en hito 5:** (#1) tier se lee del frontmatter del SCR + §8, no de columna §3;
  (#2) nombres de iconos PascalCase→kebab no son literales (`UserCircle`→`circle-user`) — buscar variante
  reordenada + aliases del manifest; (#3) branding propagado a las pantallas vía capa `--brand-*`
  (elementos vacíos + `::before`), seteado por proyecto en Phase 3; (#6) `pk-card` sobre `<button>` no
  reseteaba el borde UA → `border:none` en el catálogo. Deliverable = un solo `index.html` autocontenido
  (fragmentos inline, sin iframe).

### Changed (hito 5 — full render fimubac + post-validación)

- **Deliverable renombrado `index.html` → `{slug}-mockup.html`** (slug de `project-config.md`; ej.
  `fimubac-insights-mockup.html`; fallback `mockup.html` si no hay slug). Auto-descriptivo al mandárselo a
  un cliente; se abre por doble-click directo. Toca SKILL §5/§11/§12 + `screen.template.html`.
- **Notificaciones — dos superficies con entry points distintos.** `sk-notifications` tiene (a) la
  **campanita → feed/panel** de avisos recibidos (`notifications.html`, único entry point) y (b) las
  **preferencias** (matriz categoría × canal + "Mis dispositivos"), que son un **tab del usuario**, NO la
  campanita. Antes el shell cableaba la campanita a la pantalla de ajustes (bug de IA). Añadida
  `fx-presentation-kit/screens/notification-settings.html` (preferencias) + nueva primitiva `pk-switch` en
  `kit.css` (StatusToggle estático reusable) + regla de wiring (campanita→feed, preferencias=tab) en
  `tier-strategy.md §Notificaciones`, `mck-context-analyst` y SKILL §11.
- **Gitignore default.** `project/mockup-artifacts/` (+ `project/proposal-artifacts/` forward-looking)
  agregados al `.gitignore` del Factory (default para derivados). Los artifacts son transitorios; el
  deliverable `project/mockup/` queda versionable.
- **Fix de contraste en `kit.css` (catálogo).** Un CTA `<button class="pk-card">` mostraba texto negro
  (`ButtonText` del UA) en temas oscuros porque la regla `button.pk-card/pk-card-sm/pk-kpi` hacía
  `font: inherit` pero no `color: inherit`. Agregado `color: inherit` → el texto hereda `--foreground` del
  tema. Detectado en review visual headless (Playwright) del dashboard de fimubac en midnight.

### Rationale

Tercer hito del Sistema de Presentación (SSOT `.claude/docs/presentation-system.md`). Cierra el gap entre
`/design` y cliente: antes no había artefacto visual navegable. El catálogo (`fx-presentation-kit`,
hito 3) ya existía; este workflow lo consume.

### Verification path

- `pnpm skill:lint` → `tk-mockup` pasa.
- `bash .claude/hooks/agent-taxonomy-lint.sh` → `mck-*` pasan (prefijo registrado).
- Smoke de render aislado de 1 pantalla (template + icon-resolution) headless.
- Validación cross-proyecto real (fimubac/karen) → hito 5, fuera de este build (el Factory no tiene `16_DESIGN`).

---

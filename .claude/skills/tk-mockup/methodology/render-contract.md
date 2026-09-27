# render-contract — qué es fuente y qué es referencia

> El contrato central de `tk-mockup`. Gobierna cómo el renderer convierte un `SCR-*.md` (output de
> `/design`) en HTML. **El render es síntesis dirigida por spec, no transcripción.**

## Cada sección del SCR, distinto trato

| Sección del SCR | Rol en el render | Cómo se usa |
| --- | --- | --- |
| `§3 Layout — Mobile 375px` (ASCII) | **Referencia de layout, NO fuente** | Se interpreta la **estructura** ("hilo de chat con turnos" / "dashboard con KPIs + tabla con scroll") y se **recompone** con primitivas `pk-*`. Nunca carácter por carácter. |
| `§11 Copy (es-MX)` | **Fuente literal** | Se pega tal cual. Cero reescritura, cero invención. Si el copy no está en §11, no se inventa. |
| `§5 SK Components Used` | **Binding → primitiva** | Cada slot mapea a una primitiva `pk-*` del catálogo (`DashboardShell`→`pk-device`+`pk-header`, `DataTable`→`pk-table`, `Badge`→`pk-pill`, `StatCard` grid (alias `StatsCards`)→`pk-kpi`, `Form`/`FormField`→`pk-field`/`pk-input`, `EmptyState`→`pk-empty`, `Skeleton`→`pk-sk`, `Chart`/`recharts` (Line/Area/Bar/Pareto)→`pk-chart` + `partials/chart-{line,bar,pareto}.html`…). La data del chart (coords del path, alturas de barra, % acumulado) se calcula por instancia; las clases dan canvas/grid/ejes/series/leyenda (paleta por tokens, NO hex). |
| `§9 States catálogo` | **Estados toggleables** | Cada estado (Loading/Empty/Error/…) se vuelve un panel toggleable (`pk-state` + el toggle del shell). |
| frontmatter `tier` | **Consumido, NO recalculado** | El tier lo decidió `tk-design`. El renderer lo lee y aplica la estrategia (`tier-strategy.md`). |
| `CMP-XXX.md` (vía §5 / §13) | **Spec de componente custom (primera clase)** | Se lee su prop API + token usage. NO se improvisa el componente. Un chat sin su `ChatThread` es inservible. |
| `§4 Desktop` + `§12 Responsive` | Deltas de viewport | Informan el toggle desktop del device frame (sidebar visible, grid expandido). |

## Reglas duras

1. **ASCII = orientación, copy + binding = datos duros.** El ASCII dice *qué hay y cómo se agrupa*; el
   `§5` dice *con qué primitiva*; el `§11` dice *qué texto*. El render combina los tres.
2. **Cero invención.** No copy fuera de `§11`. No tokens fuera de `theme.css`. No componentes fuera de
   `pk-*` / `CMP-*.md`. No primitivas inexistentes (si una hace falta → ver regla 4).
3. **CMP es primera clase.** Si una pantalla referencia un `CMP-XXX`, leer `16_DESIGN/components/CMP-XXX-*.md`
   y respetar su prop API + token usage. No aproximar.
4. **Gap de spec → `blocked`, no improvisar (CODING.md §8).** Si el ASCII es ambiguo, falta el copy de un
   slot, o un CMP no tiene prop API → marcar la pantalla `blocked`, dejar el motivo, y surfacearlo en el
   checkpoint. NUNCA rellenar el hueco inventando. Si una primitiva `pk-*` necesaria no existe →
   construirla mínima + marcarla candidata a factory-ticket (enriquecimiento del catálogo, SSOT §3.8).
5. **Mobile-first.** La pantalla base es `.pk-device.mobile` (375px). El desktop es un toggle, no el default.
6. **El comentario instruccional del template NO va en el output.** Los `templates/*.html` abren con un
   bloque `<!-- reglas de relleno … -->`: es guía de autoría, se descarta al emitir el artefacto real.
7. **Brand var-driven, NO hardcodeado.** El logo/nombre de marca va en elementos **vacíos**
   `<span class="pk-logo"></span>` (sidebar), `<span class="pk-brand-name"></span>` (nombre), o
   `<div class="pk-auth-logo"></div>` (auth) — el `::before` los llena desde `--brand-*` (que el
   orchestrator setea por proyecto en Phase 3). NUNCA escribir "TK"/"TimeKast" ni el nombre del proyecto
   como texto literal en esos elementos: rompería la identidad multi-proyecto.

## Modelo de shell (B') — pantalla = fragmento de body, NO pantalla completa

El mockup es **un solo shell** (= el DashboardShell real del producto: sidebar de navegación + header +
bottomnav) y el body de cada pantalla **se intercambia** al navegar (modelo SPA). Consecuencias para el render:

- **Pantallas `(protected)` → emiten SOLO el body** (`<section class="mck-screen" data-screen="slug">` con
  el toggle de estados + los `pk-state`). **NO** emiten device frame, sidebar, header ni bottomnav — eso
  vive en el shell una sola vez. Cero anidamiento, cero doble-sidebar.
- **Pantallas `(public)`/auth → emiten full-screen sin shell** (`<section class="mck-auth-screen">` con el
  `pk-auth`). El shell se oculta al activarlas (refleja que `/login` no tiene DashboardShell).
- **El sidebar + bottomnav los construye el shell** desde la nav real (`16_DESIGN §2.4` /
  `src/config/navigation.ts`), NO cada pantalla. `mck-context-analyst` extrae esa nav.
- El item activo del sidebar y el título del header se setean por slug al navegar (lo hace el JS del shell).

## Modelo del renderer

El render de pantallas `custom` es síntesis cross-fuente (ASCII + §5 + §9 + §11 + CMP), pero
`mck-screen-renderer` corre en `sonnet` por stakes bajos: el output es un preview desechable que el
owner valida en segundos. Excepción declarada en `SKILL.md §14`.

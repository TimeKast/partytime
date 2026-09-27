# Retrofit — repunta las citas a las skills `kb-*` que el kit retiró

> **Aplica si:** tu proyecto tiene skills `pj-*`, docs de `project/` (SCR emitidos, issues abiertos, planning) o
> comentarios en tu código que citan una de las 21 skills `kb-*` retiradas, o un número de sección de las cinco que
> se quedaron.
> **Cuesta:** un grep, y una sesión corta con el agente si aparece algo.
> **Devuelve:** citas que llevan a donde vive hoy esa doctrina. Sin esto, un agente que lee tu `pj-*` o un SCR sigue
> un puntero a un archivo que ya no existe, y trabaja sin el conocimiento que el puntero prometía.
> **Por qué no llega solo:** `factory update` refresca el cerebro del kit, pero no reescribe lo tuyo. Y nada te avisa:
> el linter de skills **salta los `pj-*` a propósito** y nunca lee `project/`.
> **Disponible desde:** el primer release del kit posterior a `v12.2.0`.

## Qué cambió en el kit

De 26 skills `kb-*` quedan cinco: `kb-cron-jobs`, `kb-dataviz`, `kb-design-engineering`, `kb-ssot-registries` y
`kb-visual-direction`. Las otras 21 eran conocimiento genérico que el modelo ya trae, o una copia de lo que su
`sk-*` hermana documenta contra los archivos reales del kit. Lo que sí era doctrina del kit se mudó a la `sk-*` que
la ejecuta. La lista completa está en `.claude/docs/CHANGELOG.md`.

## Qué te deja el update en disco

Depende de si tocaste la skill retirada. El resumen final de `factory update` lo dice por archivo:

| Tu caso | Qué pasa | Qué dice el resumen |
| --- | --- | --- |
| No la editaste | Se borra | `Archivos retirados: .claude/skills/kb-…/SKILL.md` |
| La editaste localmente | Se conserva y **deja de actualizarse para siempre**: ya es tuya | `Conservado (editado localmente): …` |
| Primer sync, sin lockfile previo | No se borra; queda para que decidas | `ambiguo — revisar manualmente: …` |

En los dos últimos casos decide tú: si la editaste porque tu proyecto la necesita, renómbrala a `pj-*`; si no,
bórrala.

## 1. Encuentra las citas

Desde la raíz del derivado, después del update:

```bash
grep -rnwE 'kb-(api|db|debug|design-system|design-tokens|flutter|i18n|mcp|navigation|notifications|observability|performance|pwa|python|security|security-audit|seo-geo|tailwind-v4|testing-nextjs|testing-patterns|ui)' \
  .claude/skills/pj-* project/ src/ tests/ CLAUDE.md 2>/dev/null | grep -v CHANGELOG
```

Y por separado, las citas **por número de sección** a las cinco que se quedaron, porque su numeración cambió al
podarlas:

```bash
grep -rnE '(kb-dataviz|kb-ssot-registries|kb-design-engineering) §[0-9]' .claude/skills/pj-* project/ src/ 2>/dev/null
```

Sin salida en los dos: no tienes nada que hacer.

## 2. Repunta cada cita

| Citabas | Ahora vive en |
| --- | --- |
| `kb-ui §1` (Server/Client) | `sk-crud-scaffold §4` (RSC shells) |
| `kb-ui §2.1` shell · `§2.4` scroll interno · `§2.5` tabs · `§2.6` scroll-lock · `§9.1` form card | `sk-ui §11.1` · `§11.2` · `§11.3` · `§11.4` · `§11.5` |
| `kb-ui §2.3` grid de stats / KPIs | `kb-dataviz §3` |
| `kb-ui §4` filtros en cascada | `sk-ui §1.5` (y `SK.md §3.1`) |
| `kb-ui §5` URL state · `§6` skeleton · `§12` a11y | `sk-ui §12.1` · `§12.2` · `§13` |
| `kb-ui §10.x` (row handlers, bulk, highlights, optimista / server-first) | `sk-crud-scaffold §7.4` |
| `kb-ui:internal-scroll` en un `based_on:` de CMP | `sk-ui:internal-scroll` |
| `kb-api` | `sk-api` (§9: rutas, `400`, CSRF en rutas mutantes custom) |
| `kb-db` | `sk-db` (§4: forma de falla de un regex roto en SQL crudo) |
| `kb-security` | `sk-security` (§5 *Existence oracles*, §6 password reset, §8 frontera `server-only`) |
| `kb-security-audit` | el card del agente `security-auditor` (escala de severidad y shape del finding) |
| `kb-observability` | `sk-observability`; los check-ins de cron → `kb-cron-jobs` § *Who watches the watchdog* |
| `kb-testing-nextjs` | `sk-testing-nextjs` (§2 mocks, §3 `createChain`, §4.1 `renderWithForm`, §4.2 Radix en jsdom) |
| `kb-testing-patterns` | `SK.md §4.2` + `sk-testing-nextjs` |
| `kb-design-system` · `kb-design-tokens` | `sk-skins` + `sk-tokens-neomorphism` |
| `kb-tailwind-v4` | `sk-skins §7.4` (el incidente de Oxide y las `@source not`) |
| `kb-navigation` · `kb-pwa` · `kb-notifications` | `sk-navigation` · `sk-pwa` · `sk-notifications` |
| `kb-dataviz` §2 matriz · §3 Recharts · §6 KPI · §8 estado · §9 a11y | `kb-dataviz` §1 · §2 · §3 · §4 · §5 |
| `kb-ssot-registries` §3 · §4 · §5 · §6 | `kb-ssot-registries` §1 · §2 · §3 · §4 |
| `kb-design-engineering` §3 (5 pasos) · §5 · §6 · §7 | `kb-design-engineering` §1 · §2 · §3 · §4 |
| `StatsCards` / `sk-ui §5.7` en un SCR | `StatCard` grid / `kb-dataviz §3` (el render de `/mockup` acepta los dos nombres) |

**Sin destino, a propósito:** `kb-debug`, `kb-performance`, `kb-seo-geo`, `kb-python`, `kb-flutter`, `kb-i18n`,
`kb-mcp`. Si tu proyecto **sí** vive en uno de esos dominios (una app Flutter, un backend Python, i18n real) y la
skill te servía, recupérala como `pj-*` desde tu propio historial. El comando busca el commit que la borró y la
saca de su padre, así que funciona aunque el update no sea tu último commit:

```bash
F=.claude/skills/kb-flutter/SKILL.md
mkdir -p .claude/skills/pj-flutter
git show "$(git rev-list -n 1 HEAD -- "$F")^:$F" > .claude/skills/pj-flutter/SKILL.md
```

Si todavía no commiteaste el update, el archivo sigue en `HEAD`: `git show "HEAD:$F"`. Después cámbiale el `name:`
a `pj-flutter`. Desde ahí es tuya: el kit no la vuelve a tocar.

## 3. Qué tan urgente es cada lugar

- **`pj-*` y issues abiertos del backlog:** primero. Son lo que un agente lee antes de escribir código.
  `/implement` ya descarta de la lista `Skills:` de un issue las `kb-*` que no existen, así que ahí el costo es
  perder la cita, no romper el run.
- **SCR y `16_DESIGN.md` vigentes:** cuando los vuelvas a tocar con `/design`. Un SCR ya implementado es historia.
- **Comentarios en `src/` y `tests/`:** cosmético. No cambian nada al ejecutar; repúntalos si pasas por el archivo.
- **Issues cerrados, reportes y CHANGELOGs:** no los toques. Son registro de lo que pasó.

## Cómo correrlo con el agente

> Lee `.claude/docs/retrofits/kb-skills-retirement.md`, corre los dos greps del paso 1 y propón el repunte de cada
> cita con la tabla del paso 2. Para cada una muéstrame archivo, línea, cita vieja y cita nueva. No edites issues
> cerrados ni CHANGELOGs, y no escribas nada hasta que apruebe la lista.

Al terminar, vuelve a correr los dos greps: deben salir vacíos. Si repuntaste algo dentro de `.claude/`, corre
también `pnpm skill:lint`.

## Lo que este retrofit NO hace

- **No revive las skills retiradas en el kit.** Si una te hace falta, es tuya como `pj-*`.
- **No te obliga a nada.** Una cita rota no rompe el build ni los tests. Solo le quita contexto al agente que la lee.

---

_TimeKast Factory — retrofit: citas a las skills `kb-*` retiradas_

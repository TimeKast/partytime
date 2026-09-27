---
name: fx-presentation-kit
description: Factory-internal asset catalog so static HTML can reproduce the kit's visual system without its React components: a frozen neomorphism theme.css (3 themes + neo utilities), authored pk-* primitives in kit.css, the embedded Geist font, the maker logo and a full Lucide icon manifest. Consumed by tk-mockup; the editorial pe-* register (editorial.css) is deprecated since tk-proposal moved to Gamma. Invoke when extending the catalog, regenerating the icon manifest, or wiring a workflow that renders HTML mockups.
family: factory-internal
operational: true
model: opus
runtime: true
last-verified: 2026-09-22
user-invocable: false
---

# fx-presentation-kit — HTML presentation catalog

> **Scope:** the shared visual engine for client-facing artifacts. The kit's real
> components are React (`.tsx`, Radix, react-hook-form) — static HTML can't import
> them. This catalog reproduces the look in plain HTML+CSS+SVG that any artifact
> composes, online or offline (double-click).
>
> **Consumed by:** `tk-mockup` (screen walkthroughs) and `fx-pdf-export` (the maker
> logo in `brand/`). This skill ships the assets; the workflows compose them.
>
> **Modelo (`opus`):** el trabajo que dirige es curar primitivas visuales client-facing y sus reglas de composición, salida que ninguna suite valida — el tier `synthesize` de [`fx-execution-policy §3`](../fx-execution-policy/SKILL.md); el único asset derivado (`lucide.json`) tiene su propio `--check`, así que el tier lo decide la mitad autorada.

---

## 1. Qué shippea

| Asset | Origen | Editar a mano |
| ----- | ------ | ------------- |
| `theme.css` | **SNAPSHOT CONGELADO** (header `FROZEN`) del skin neomorphism: 3 temas + neo utilities en vocab `--neo-*`, autocontenido — **no** sigue a `src/app/globals.css` ni al skin activo | ✅ — es la única vía; no hay generador |
| `kit.css` | **AUTORADO** — primitivas `pk-*` (producto, neomórfico) + `@font-face` + capa branding `--brand-*`/`--maker-*` | ✅ |
| `editorial.css` | **AUTORADO** — primitivas `pe-*` (registro **editorial** client-facing; reusa tokens de color, NO `--neo-*`). **⚠️ DEPRECADO pending-removal** — ningún workflow vivo las consume (su único consumer, `tk-proposal`, entrega vía Gamma y ya no compone HTML editorial). Conservadas hasta su eliminación en una tarea futura separada; no agregar nuevas dependencias a `pe-*`. **No afecta `pk-*` ni `tk-mockup`** (ver nota abajo). | ✅ |
| `lucide.json` | **DERIVADO** de `lucide-react` (manifest nombre→SVG, set completo) | ❌ — lo regenera el script |
| `fonts/` | Geist + GeistMono woff2 vendorizadas (default) + Inter woff2 (alternativa skin-swap) | ❌ — re-vendorizar (ver §4); swap a Inter documentado en `fonts/README.md` |
| `brand/` | Logo del maker (TimeKast) vendorizado + optimizado (`--maker-*`); GIFs light/dark/transparent + PNG fallbacks | ✅ |
| `shell.html` | Harness de preview (device frame + toggles tema/estado) | ✅ |
| `partials/` | Snippets HTML atómicos para componer | ✅ (crece con uso) |
| `screens/` | Pantallas `kit-pure` preconstruidas (auth + notificaciones: `notifications` feed + `notification-settings` ajustes) | ✅ |

El detalle de las primitivas `pk-*` vive en [`kit.css`](kit.css) y [`partials/`](partials/) —
esos archivos son el SSOT, no se enumeran aquí (driftearían).

> **Alcance de la deprecación de `pe-*` / `editorial.css`:** aplica **solo** al registro
> editorial (`editorial.css`), cuyo único consumer era `tk-proposal` (ahora vía Gamma). Las
> primitivas de producto `pk-*` (`kit.css`) y `tk-mockup` **NO** están deprecadas: `tk-mockup`
> sigue componiendo mockups con `pk-*` directo, sin tocar `pe-*`. La eliminación física de
> `editorial.css` / `pe-*` es una tarea futura separada — este kit solo deja la anotación.

---

## 2. Modelo de snapshot (clave)

Los assets son **snapshot pre-generado y commiteado**. Son iguales para todo proyecto porque
vienen del kit y **viajan en el tarball** (`core` y `full`). Un workflow que renderiza un mockup
los **consume tal cual** — nunca regenera nada al armar una pantalla.

El único generador (`lucide.json`) existe para **una sola cosa**: mantener el manifest fiel cuando
el kit bumpea `lucide-react`. No es parte de generar un mockup.

- En un **derivado no-Next** no hay `lucide-react`: el generador hace **no-op** (exit 0) y el
  snapshot que viajó es lo que se usa.
- Las primitivas `pk-*` son **estructura HTML stack-agnóstica**; el `theme.css` es el **skin**
  (reemplazable). Esa separación es lo que hace el catálogo multi-stack.

---

## 3. Origen de cada asset

**`theme.css` — snapshot congelado.** Fija el look neomorphism 2.0 a propósito: la presentación se
ve igual sin importar qué skin corra la app ([`sk-skins`](../sk-skins/SKILL.md)), así que **no**
deriva de `globals.css`. Sus variables `--neo-*` están todas definidas en el mismo archivo (0
referencias colgantes). Si hay que refrescarlo, se edita el snapshot a mano y se conserva esa
autocontención.

**`lucide.json` ← `lucide-react`.** El script itera los módulos esm instalados, lee su `__iconNode`
y serializa cada uno a SVG (resolviendo aliases tipo `home`→`house`). Set completo, sin anclaje a
`navigation.ts` (que cada `/design` reescribe).

**`fonts/` ← `geist`.** Las woff2 se vendorizan una vez (ver §4). `geist` **no** es dependencia del
repo — se obtiene efímero.

---

## 4. Regeneración

```bash
# theme.css — no se regenera (snapshot congelado, ver §3).

# lucide.json — manual, al bumpear lucide-react (la versión cambia rara vez):
pnpm generate:presentation-icons            # write
pnpm generate:presentation-icons --check    # exit 1 si está desincronizado

# fonts — re-vendorizar Geist (raro). Efímero, sin agregar dep al repo:
npm pack geist            # baja el tarball oficial de Vercel a un dir temporal
# extraer dist/fonts/geist-sans/Geist-Variable.woff2 + geist-mono/GeistMono-Variable.woff2
# → copiar a fonts/  → borrar el tarball

# Inter (alternativa skin-swap, no default): re-vendorizar igual de efímero —
# npm pack @fontsource-variable/inter → extraer el woff2 → fonts/Inter-Variable.woff2.
# El swap (apuntar el @font-face sans a Inter) está documentado en fonts/README.md.
```

---

## 5. Reglas de uso (para los workflows que componen)

- **Orden de carga (mockup):** `theme.css` → `kit.css`. El primero define los `--tokens`; el segundo los consume.
- **Orden de carga (propuesta):** `theme.css` → `editorial.css` → `kit.css`. El `<body>` lleva la clase `.pe-doc`.
- **Dos registros, un catálogo:** `pk-*` (`kit.css`) = **producto** (neomórfico, el design system real); `pe-*` (`editorial.css`) = **narrativa client-facing** (plano/editorial, hairlines, secciones full-bleed). En una propuesta conviven: la narrativa va en `pe-*` y las **pantallas curadas del producto** en `pk-*` (`pk-device`) — el contraste separa el pitch de la demo. `pe-*` reusa los tokens de color (`--brand-*`, `--foreground`, …) pero **nunca** los `--neo-*`.
- **Maker layer:** el logo de TimeKast vive en `brand/` (`--maker-light`/`--maker-dark`), paralelo a `--brand-*` del cliente. Un consumer copia solo el asset que use a su `assets/`.
- **Iconos en templates:** placeholder `<span class="pk-ico" data-icon="<lucide-name>"></span>`; el
  renderer inlinea el SVG desde `lucide.json`. En artefactos standalone (`shell.html`, `screens/*`)
  el SVG ya va inline (abren offline).
- **Copy:** literal del `§11` del SCR (es-MX). El catálogo da la estructura, no inventa copy.
- **Mobile-first:** las pantallas se componen dentro de `.pk-device.mobile` (375px); `.desktop`
  expande el viewport.
- **Branding:** un derivado cambia identidad tocando solo `--brand-*` en `kit.css` (o inline en `<html>`).

---

## 6. Loop de enriquecimiento

El catálogo **no se enumera de antemano — crece con uso real**. Cuando una pantalla `custom`
(producida por `tk-design`/`tk-mockup`) genera una primitiva nueva reusable, se cura y se promueve a
`kit.css` + `partials/` vía factory-ticket. Enriquecimiento manual cross-proyecto, no autogen.

> **Tier strategy** (la decide `tk-design`, la consume `tk-mockup`): `kit-pure` → adjunta
> `screens/*` tal cual · `kit-extended` → primitiva base + deltas del SCR · `custom` → compone
> binding + ASCII (layout ref) + copy; CMP custom se lee de su `CMP-*.md`.

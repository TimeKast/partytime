---
name: fx-pdf-export
description: Factory-internal skill that generates branded PDFs from Markdown via md-to-pdf (Puppeteer/Chromium) with TimeKast styling, optional cover, auto-TOC from H2s, and appendices. Primary invocation is the `/pdf` slash command; Node driver `scripts/build-pdf.mjs` (zero dependencies, builtins only) reads metadata from the MD header, resolves the TimeKast logo from a fixed kit path, and the client logo from `NEXT_PUBLIC_CLIENT_LOGO_DARK`/`_LIGHT`.
family: factory-internal
operational: true
model: inherit
runtime: true
last-verified: 2026-08-25
user-invocable: false
---

# fx-pdf-export — Markdown → Branded PDF

> **Scope:** kit-wide utility for turning planning/design/proposal MDs into
> shareable PDFs with a consistent look.
> **Invocación:** `/pdf <ruta.md> [flags]` — slash command en `.claude/commands/pdf.md`.
> **Modelo (`inherit`):** lo que dirige son pasos determinísticos —invocar el driver con flags y leer su exit code—, el tier `mechanical` de [`fx-execution-policy §3`](../fx-execution-policy/SKILL.md), que mapea al modelo del main loop.

---

## 1. Cuándo usar

| Trigger                                     | Path         |
| ------------------------------------------- | ------------ |
| "genera un PDF de este doc", "export a PDF" | `/pdf <md>`  |
| "PDF rápido sin portada"                    | `--no-cover` |
| "PDF para cliente con portada y logos"      | default      |
| "agrega apéndices al PDF"                   | `--appendix` |

No usar para:

- HTML marketing landings → no es plantilla web
- Slides → usar herramientas específicas de presentaciones
- Reportes automáticos recurrentes → mejor pipeline dedicado

---

## 2. Prerequisitos

```bash
node --version                       # cualquier Node del kit sirve — solo builtins
npx -y md-to-pdf@5.2.5 --version     # versión FIJADA; npx la baja a su caché al primer uso
```

La versión del renderizador está **fijada en `md-to-pdf@5.2.5`**: `npx -y` la ejecuta desde su
propia caché (`~/.npm/_npx`, que persiste entre corridas) y no la agrega al `package.json` del
proyecto. El driver (`build-pdf.mjs`) no tiene dependencias del proyecto (solo `node:*`), así que
corre igual en el perfil `core` de distribución (sin `package.json` ni `node_modules`).

> 🔴 **Se fija la versión del PAQUETE, no su árbol de dependencias.** `md-to-pdf@5.2.5` declara
> otras 13 dependencias, **todas por rango** —incluida `puppeteer: '>=8.0.0'`, sin cota superior—
> y `npx` las resuelve del registro en cada instalación fría, **sin lockfile que fije en qué
> versiones cae**. La integridad de la descarga sí se verifica siempre: npm compara el sha512 de
> cada tarball contra el `dist.integrity` del packument, y ese check no es opcional. Lo que falta
> no son, entonces, los bytes — es **fijar las versiones transitivas resueltas** y la
> **verificación de procedencia** (`npm audit signatures`, opt-in). Queda determinado qué código de
> `md-to-pdf` corre; no qué Chromium ni qué transitivas se bajan. El hueco de cadena de suministro
> **no** queda cerrado.

**Subir de versión es una edición manual**, y el control no es una lista de superficies que alguien
deba mantener al día: **la versión efectiva es una sola.**

```bash
grep -rn 'md-to-pdf@' .claude/ scripts/   # debe devolver UN solo número de versión
```

Correrlo es el **cierre obligatorio** de cualquier subida de versión. El barrido alcanza también el
permiso `Bash(npx -y md-to-pdf@5.2.5 *)` de `.claude/settings.json`, que matchea el literal **con**
versión, así que un pin subido a medias sale ahí. El invariante está mecanizado en
`scripts/tools/__tests__/build-pdf.test.ts`, que falla si dos portadores del literal divergen.

---

## 3. Fast path — `npx md-to-pdf@5.2.5` directo

Sin portada ni TOC, solo estiliza el MD con el CSS del kit:

```bash
npx -y md-to-pdf@5.2.5 \
  --stylesheet .claude/skills/fx-pdf-export/resources/timekast-style.css \
  --pdf-options '{"format":"A4","margin":{"top":"20mm","bottom":"20mm","left":"20mm","right":"20mm"},"printBackground":true}' \
  --gray-matter-options '{"delimiters":"\u0000"}' \
  project/planning/MI_DOC.md
```

Output: `project/planning/MI_DOC.pdf` junto al MD.

> 🔴 **`--gray-matter-options` va siempre, y aquí es donde más importa.** `md-to-pdf` fusiona el
> front-matter YAML del documento **dentro de su propia config**, y esa config alimenta
> `puppeteer.launch(launch_options)`, `page.addScriptTag(script)` y `dest`: quien escribe el `.md`
> estaría controlando el navegador del renderizador. El delimitador imposible hace que no encuentre
> front-matter. Este camino entrega el `.md` **crudo**, así que el vector es directo; el full path
> (§4) pasa por `build-pdf.mjs`, que ya lleva la misma opción en su `spawnSync` y lee su metadata
> del cuerpo del documento, nunca del front-matter.

---

## 4. Full path — script Node

```bash
# Con logos (TimeKast: ruta fija del kit · cliente: NEXT_PUBLIC_CLIENT_LOGO_DARK/_LIGHT)
node .claude/skills/fx-pdf-export/scripts/build-pdf.mjs project/planning/00_DISCOVERY_BRIEF.md

# Sin logos
node .claude/skills/fx-pdf-export/scripts/build-pdf.mjs project/planning/00_DISCOVERY_BRIEF.md --no-logos

# Con apéndice
node .claude/skills/fx-pdf-export/scripts/build-pdf.mjs project/planning/00_DISCOVERY_BRIEF.md \
  --appendix "Apéndice A — Catálogo Figma:project/planning/FIGMA_SCREEN_CATALOG.md"

# Output custom
node .claude/skills/fx-pdf-export/scripts/build-pdf.mjs project/planning/00_DISCOVERY_BRIEF.md \
  --output docs/exports/brief.pdf
```

---

## 5. Detección automática de metadata

| Dato                                   | Origen                                                     | Fallback                        |
| -------------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| Título                                 | H1 del MD (`# Discovery Brief — {{Proyecto}}`)               | Nombre del archivo               |
| Fecha / Versión / Stakeholders / Autor | `**Fecha:** …` al inicio del MD                              | Valores genéricos                |
| Logo TimeKast                          | Ruta fija del kit (`fx-presentation-kit/brand/timekast-full.png` — logotipo completo, fondo transparente) | Siempre se resuelve (asset shipped) |
| Logo Cliente                           | `.env.local` → `NEXT_PUBLIC_CLIENT_LOGO_DARK` (o `_LIGHT`), resuelto y confinado bajo `public/` | Sin logo de cliente, sin error   |
| Formatos de imagen aceptados            | PNG, JPEG, WEBP, GIF (detectados por magic number, no por extensión) | SVG rechazado explícitamente (§9) |

No hay glob de directorio ni lectura de `project-config.md`: la ruta del logo del kit y la del
cliente se resuelven cada una por su variable declarada, nunca por un scan del filesystem.

Para omitir logos: `--no-logos`.

---

## 6. Flags

| Flag                             | Default                        | Descripción                                      |
| -------------------------------- | ------------------------------ | ------------------------------------------------ |
| `--no-logos`                     | `false`                        | Omitir logos en portada                          |
| `--no-toc`                       | `false`                        | Omitir tabla de contenidos                       |
| `--no-cover`                     | `false`                        | Sin portada — implica sin índice también (el TOC solo se emite si hay portada) |
| `--appendix "Título:archivo.md"` | —                              | Agregar apéndice (repetible)                     |
| `--output path.pdf`              | `<input>.pdf`                  | Ruta del PDF de salida                           |
| `--skip-lines N`                 | `9`                            | Líneas de header del MD a omitir (ya en portada) |
| `--css path.css`                 | `resources/timekast-style.css` | CSS custom                                       |
| `--project-root path`            | auto (`git rev-parse --show-toplevel` o marcador) | Override de la raíz del proyecto (tests/CI) |

---

## 7. Personalización del CSS

Editar `resources/timekast-style.css`. Variables:

| Variable   | Default   | Qué controla   |
| ---------- | --------- | -------------- |
| `--purple` | `#5B2D8E` | Color primario |
| `--green`  | `#00C853` | Acento         |
| `--teal`   | `#4DB6AC` | Gradientes     |

Para branding diferente por cliente, pasar `--css path/to/cliente.css`.

---

## 8. Estructura

```
.claude/skills/fx-pdf-export/
├── SKILL.md
├── resources/
│   └── timekast-style.css       # CSS del kit (Inter + morado/verde/teal)
└── scripts/
    └── build-pdf.mjs            # Driver Node (metadata + cover + TOC + appendix), 0 deps
```

---

## 9. Troubleshooting

| Síntoma                            | Causa probable                                            | Fix                                                     |
| ----------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| "⚠️ Client logo skipped"           | `NEXT_PUBLIC_CLIENT_LOGO_DARK`/`_LIGHT` ausente o inválida  | Informativo — el logo de TimeKast siempre sale; agregar/corregir la variable si se quiere el del cliente |
| Portada con meta vacía              | MD no tiene `**Fecha:** …` en header                        | Agregar bloque de metadata o `--no-cover`               |
| Contenido se corta raro             | `--skip-lines` no coincide con tu header                   | Ajustar `--skip-lines` al número real de líneas header  |
| TOC vacío                           | Doc no tiene H2 (`##`)                                      | Usar `--no-toc` o agregar H2                            |
| PDF sin estilo                      | CSS path inválido                                            | Verificar `--css` apunta a archivo existente            |
| "No se pudo resolver la raíz…"      | Se corrió fuera de un checkout de proyecto (sin git, sin `.claude/`+`package.json`/`project/`) | Correr desde dentro del proyecto, o pasar `--project-root` |
| "tipo de imagen no reconocido"      | Logo en SVG — rechazado a propósito (sin firma de magic number, y un SVG arbitrario puede llevar `<script>`) | Convertir el logo a PNG/JPEG/WEBP/GIF antes de pasarlo |

---

## 10. Anti-patrones

| ❌ Don't                                              | ✅ Do                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| Editar el CSS del kit para un cliente específico      | Pasar `--css cliente.css` y dejar el kit intacto                 |
| Pegar logos en el MD como imágenes inline             | Declarar `NEXT_PUBLIC_CLIENT_LOGO_DARK`/`_LIGHT` en `.env.local`  |
| Hardcodear rutas absolutas en scripts que usan el PDF | Usar rutas relativas a project root (lo resuelve el script)      |
| Generar PDFs con `md-to-pdf` sin `printBackground`    | Dejar `printBackground:true` (colores de la portada)             |

---

_TimeKast Factory — fx-pdf-export skill_

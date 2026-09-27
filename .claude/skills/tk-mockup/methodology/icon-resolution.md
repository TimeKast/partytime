# icon-resolution — iconos Lucide inline, offline

> Los mockups abren por doble-click sin red. Los iconos se **embeben inline como SVG**, resueltos desde
> el manifest del catálogo. Sin CDN, sin dependencia en runtime del deliverable.

## Fuente

`fx-presentation-kit/lucide.json` — manifest `{ "<nombre-kebab>": "<svg ...>…</svg>", … }` (1912 iconos,
incluye aliases tipo `home`→`house`). Generado en origen desde `lucide-react` (ver `fx-presentation-kit`).

## Convención en templates / partials

Los building blocks usan un **placeholder**:

```html
<span class="pk-ico" data-icon="bell"></span>
```

## Resolución (durante el render)

1. El renderer lee `lucide.json` una vez.
2. Para cada `data-icon="X"` en el HTML compuesto, busca `lucide.json["X"]`.
3. Reemplaza el placeholder por el SVG inline: `<span class="pk-ico">{svg}</span>` (el `.pk-ico` de
   `kit.css` dimensiona; el `svg` hereda `currentColor`).
4. **Conversión de nombre (no siempre literal).** Los símbolos del `§5`/`navigation` vienen PascalCase
   (`UserCircle`). El primer intento es kebab directo (`UserCircle` → `user-circle`), **pero Lucide
   reordena/renombra varios**: `UserCircle` real es **`circle-user`**. Por eso: (a) intentar el kebab
   directo; (b) si no existe en el manifest, buscar una variante con las palabras reordenadas
   (`user-circle` → `circle-user`) y los aliases del manifest (que ya incluye muchos, p.ej. `home`→`house`);
   (c) recién entonces, si nada matchea → NO inventar SVG: fallback neutro documentado (`circle`) + anotar
   el icono faltante en el return summary (posible typo en el `§5` o icono no estándar).

## Qué NO necesita resolución

Las `screens/*` kit-pure del catálogo **ya traen SVG inline** → se copian tal cual, sin tocar iconos.

## Por qué inline y no `lucide.json` en el deliverable

Inlinear solo embebe los ~20-40 iconos que la pantalla usa. Copiar `lucide.json` (~0.75 MB) al
`project/mockup/` sería 20× el peso para el cliente, y exigiría un resolver JS en runtime (que rompe el
doble-click `file://` por restricciones de fetch). Inline = self-contained, ligero, offline.

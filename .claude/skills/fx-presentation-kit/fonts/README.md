# fonts/ — fuentes embebidas del presentation-kit

Se cargan como `@font-face` local en [`../kit.css`](../kit.css) (offline,
headless-determinístico). El font es parte del **skin reemplazable**, no de la
estructura `pk-*`.

| Archivo | Rol |
| ------- | --- |
| `Geist-Variable.woff2` | **Sans por defecto** — todo el texto + montos con `tabular-nums`. Coincide con el kit base. |
| `GeistMono-Variable.woff2` | **Mono** — solo códigos / SQL (`.mono`, `.pk-sqlbox`). No montos. |
| `Inter-Variable.woff2` | **Alternativa disponible** (sans). NO es el default — vendorizada para proyectos que prefieren Inter como skin y como insumo de la decisión de DS pendiente. |

## Swap de fuente (skin)

Para usar Inter en lugar de Geist en un derivado: en `kit.css` apuntar el
`@font-face` de la familia sans a `Inter-Variable.woff2` y ajustar el
`font-family` del `body`. Las primitivas `pk-*` no cambian.

## Nota sobre el cero tachado

Geist **Sans** NO tiene cero tachado en números tabulares (cero ovalado limpio).
El cero tachado es exclusivo de Geist **Mono**, que aquí se usa solo para códigos
—donde desambiguar el 0 es deseable. Los montos van en sans + `tabular-nums`, así
que ya salen limpios. La decisión "migrar el kit a Inter" es estética, no un fix.

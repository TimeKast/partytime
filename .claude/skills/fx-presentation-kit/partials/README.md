# partials/ — snippets HTML reutilizables

Bloques atómicos del catálogo, listos para componer. Cada archivo es un fragmento HTML que
usa las primitivas `pk-*` de [`../kit.css`](../kit.css) y los tokens de [`../theme.css`](../theme.css).

## Convención de iconos (templates)

En los partials los iconos van como **placeholder**:

```html
<span class="pk-ico" data-icon="bell"></span>
```

El renderer de `tk-mockup` (hito 4) reemplaza el placeholder por el SVG inline correspondiente,
resuelto desde [`../lucide.json`](../lucide.json) (manifest nombre→SVG). En artefactos standalone
(`../shell.html`, `../screens/*`) el SVG ya va **inline** (deben abrir offline sin resolución).

## Cómo crece

El catálogo arranca con el núcleo emergido del PoC y **crece con uso real**: cuando una pantalla
`custom` produce una primitiva nueva reusable, se cura y se promueve aquí vía factory-ticket
(ver [`../SKILL.md`](../SKILL.md) § loop de enriquecimiento). No se enumera de antemano.

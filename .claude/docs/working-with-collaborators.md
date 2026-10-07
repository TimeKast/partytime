# Trabajar en un repo compartido con colaboradores externos

> **Para quién:** socios (miembros de la org) que trabajan en un repo que se comparte con
> colaboradores externos sin la metodología (`/prune`). **No** es para los colaboradores: ellos
> leen `CONTRIBUTING.md` en la raíz del repo.

## El modelo en una tabla

| | Socios | Colaboradores externos |
| --- | --- | --- |
| Acceso en GitHub | Miembros de la org | Outside collaborators, solo lectura |
| Cómo trabajan | Clonan el repo, ramas propias, push a la rama de trabajo | Forkean y abren PR a la rama de trabajo |
| La metodología | Completa en su disco, vía `factory update` | Nunca su contenido: solo nombres de rutas en `.timekast/lockfile.json` y menciones en reglas |
| CI en sus cambios | El de siempre | Ninguno en el PR (los workflows de forks están apagados): lo prueba el socio que integra |
| Bóveda | Sus entornos de siempre | Solo `local`, sin rail |

Qué se comparte lo decide `.claude/policy/prune-tiers.json` (tier `collab`): reglas, hooks,
políticas, settings, skills `sk-*`/`kb-*`/`pj-*` y `fx-pdf-export` sí; workflows `tk-*`, agentes,
comandos de pipeline, `.claude/docs`, el resto de `fx-*` y las herramientas de propuestas no.

## Día a día del socio

- **El kit vive ignorado en tu disco.** El `.gitignore` del repo trae un bloque generado (no lo
  edites) que deja fuera lo restringido. `git add -A` no lo levanta, y si lo fuerzas
  (`git add -f`), el pre-commit lo rechaza (`scripts/tools/prune-guard.mjs`).
- **`factory update` funciona igual** y además mantiene el tier: regenera el bloque, deja de
  trackear lo que el kit restringe y publica lo que pasó a compartido, en el mismo commit del
  cerebro.
- **Tus skills `pj-*` sí se comparten.** Si escribes una que no deba ver un colaborador, no la
  nombres `pj-*`.
- **No pegues contenido de la metodología** en archivos compartidos (issues, PRs, `src/`,
  `CONTRIBUTING.md`): el bloque solo protege rutas, no texto copiado.

## Después del corte: vuelve a clonar

El corte (`factory prune cutover`) deja el repo con un solo commit y renombra el viejo a
`<repo>-legacy`. **Tu clon de antes conserva la historia con la metodología:** si pusheas desde
él al repo nuevo, la publicas. Vuelve a clonar, o reapunta tu clon viejo:

```bash
git remote set-url origin git@github.com:<org>/<repo>-legacy.git
```

`factory prune audit` detecta si una historia vieja llegó al repo nuevo (más de una raíz o rutas
restringidas en cualquier ref, incluidas las de PRs).

## Integrar un PR de colaborador

Siempre con `/integrate <número>`: audita la historia, **rechaza por ruta antes del checkout**
todo lo que corre alrededor del producto (`factory prune check-pr`), explica el cambio, corre
`pnpm verify` en tu máquina (riesgo aceptado por la org, solo para código de producto), y mergea
a la rama de trabajo **como tú** — Vercel no despliega commits de autores sin asiento. Nunca
autorices en Vercel el deploy de un PR de fork: correría con las variables de preview.

## Referencias

- `/prune` (`tk-prune`) — el flujo completo para el Project Owner.
- `/integrate` (`tk-integrate`) — integrar PRs de colaboradores; rutas rechazadas en
  `tk-integrate/methodology/rejected-paths.md`.
- `fx-factory-cli` § `factory prune` — los subcomandos y sus flags.

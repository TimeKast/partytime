# `.claude/docs/` — Kit Meta Docs

> **Propósito:** Documentación del **kit** (TimeKast Factory / Starter Kit). Viaja con `.claude/` a cualquier proyecto derivado.
>
> **No son** docs del proyecto derivado **ni** docs del cliente final.

---

## Regla de 3 audiencias

Este directorio es uno de tres buckets de documentación. Cada uno tiene audiencia, destino y contenido distintos:

| Directorio      | Audiencia                                       | Viaja con…        | Ejemplos                                                          |
| --------------- | ----------------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| `docs/`         | Cliente final                                   | Entregable        | product narrative, user docs, release notes                       |
| `project/`      | Dev del proyecto derivado                       | Proyecto derivado | backlog, planning vivo, migration, reference autogen              |
| `.claude/docs/` | Dev del kit (y dev derivado que quiere onboard) | Kit Claude        | getting-started, troubleshooting, CHANGELOG factory, ARCHITECTURE |

---

## Contenido de este bucket

| Archivo                                                        | Qué es                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                           | Mapa del kit — ontología CC, pipeline SSOT, onboarding 5-min, 3-audience rule                             |
| [extending-the-kit.md](./extending-the-kit.md)                 | Cómo agregar skills (`pj-*`) y revisar hooks propios sin chocar con el kit. Léelo al arrancar un derivado |
| [getting-started.md](./getting-started.md)                     | Setup completo del kit (dev onboarding al stack, no al proyecto)                                          |
| [distribution.md](./distribution.md)                           | El CLI `@timekast/factory` — instalar/actualizar el cerebro en un repo (perfiles, lockfile, versión dual) |
| [troubleshooting.md](./troubleshooting.md)                     | FAQ del stack (OAuth redirects, session secrets, errores comunes)                                         |
| [CHANGELOG.md](./CHANGELOG.md)                                 | Changelog de la **Factory** (no del proyecto derivado)                                                    |
| [design-system-neomorphism.md](./design-system-neomorphism.md) | Narrativa del DS shipped por el kit (Neomorphism 2.0). Pair con skill `sk-tokens-neomorphism`             |
| [retrofits/](./retrofits/)                                     | Runbooks para aplicar a mano lo que `factory update` **no** puede traer (ver abajo)                       |

---

## `retrofits/` — lo que el update no puede traer

`factory update` refresca solo el cerebro (`.claude/` + scripts trackeados) y **nunca** toca `src/` ni `package.json` (`BR-FACTORY-006` — born-frozen). Todo lo que viva de ese lado necesita un runbook manual. Ahí viven.

**Audiencia:** dev + agente del proyecto **derivado**. El humano aprueba en los gates ⏸.

🔴 **La lista vive en [`./retrofits/`](./retrofits/), no aquí.** Antes esta sección llevaba una tabla a mano y quedó en **6 de 14** guías — incluida la que el epic que la revisó acababa de escribir. Nada la validaba, así que el drift estaba garantizado a repetirse: dos epics seguidos shippearon su guía sin indexarla.

Cada guía se auto-describe en su encabezado con `> **Aplica si:** …` y `> **Disponible desde:** kit vX.Y.Z`, y **el CLI ya enumera el directorio** — `factory update` te muestra las que llegaron nuevas en ese update y las que ya venías arrastrando (`cli/src/lib/retrofit-reminder.ts`), y el launcher las abre en un modal. Ése es el canal de descubrimiento real; una tabla copiada aquí sólo puede quedarse atrás de él.

Para navegarlas a mano:

```bash
# Qué hay, y a quién le aplica cada una
head -8 .claude/docs/retrofits/*.md
```

---

## Cross-references

- **Rules del runtime:** `.claude/rules/` — CORE, CODING, GIT, SK, CC
- **Skills y agents:** `.claude/skills/`, `.claude/agents/`
- **Entry point:** `CLAUDE.md` (raíz) — inlinea las rules vía `@import`

---

_TimeKast Factory — kit meta docs (introduced by KIT-016)_

---
name: tk-prune
description: Coding-family workflow for the project owner who shares a derived repo with outside collaborators without the methodology. Explains the members-vs-collaborators model, applies the share tier (factory prune prepare), has the owner decide which database collaborators will see, freezes and re-clones, cuts to a repo whose history never held the methodology (factory prune cutover), reconnects Vercel and the vault, closes the legacy repo, invites collaborators and writes CONTRIBUTING.md. Primary invocation is `/prune`.
family: coding
model: opus
parallelism_unit: none
concurrency_cap: 1
auditor_step: false
last-verified: 2026-10-01
user-invocable: false
---

# tk-prune — `/prune` compartir un repo sin la metodología

> **Propósito:** que el **Project Owner (PO)** de un repo derivado lo comparta con **colaboradores externos** (outside collaborators de GitHub) sin que vean nunca el contenido de la metodología — ni en el árbol ni en la historia —, guiado por el agente y con sus propios permisos.
>
> **Architectural principle:** el CLI hace lo mecánico y lo irreversible con sus propios guards (`factory prune prepare|cutover|finish|invite|audit`); este workflow explica, pregunta lo que solo el PO puede decidir y para antes de cada paso que publica o no tiene vuelta.
>
> **Anterior:** — · **Siguiente:** `/integrate` para cada PR de colaborador

---

## El modelo (Phase 0 lo explica con estas palabras)

| Quién | Cómo trabaja | Qué ve |
| --- | --- | --- |
| **Socios** (miembros de la org) | Clonan el repo y corren `factory update`: el kit completo queda en su disco, ignorado por git | Todo |
| **Colaboradores** (outside collaborators, solo lectura) | Forkean y abren PR a la rama de trabajo; sin CI remoto en sus PRs | El producto, las reglas always-on, los sistemas del kit (`sk-*`, `kb-*`), los nombres de rutas en `.timekast/lockfile.json` y menciones en reglas — **nunca el contenido** de workflows, agentes, comandos de pipeline, `.claude/docs` ni `fx-*` |

Qué se comparte lo decide `.claude/policy/prune-tiers.json` (tier `collab`). Todo se activa solo en el repo que lleva `.timekast/prune.json`; ningún otro repo cambia.

**Datos que el colaborador ve:** el entorno `local` de la bóveda (`sk-vault`) — sin rail, sin producción.

---

## Tone guidance

Plain es-MX al PO (`CORE.md §6`). El PO no es necesariamente técnico: "el repo nuevo arranca con un solo commit, así que la historia vieja —donde vivían los workflows— no se publica" antes que "snapshot de una raíz". Cada paso irreversible se anuncia con qué se pierde si sale mal y cómo se revierte.

---

## 🔴 Anti-Drift Rules

1. **NUNCA** encender `allow_forking` en la **org**: solo en el repo (el CLI lo hace así). Encenderlo en la org abre todos los repos de la org a forks.
2. **NUNCA** invitar a un colaborador antes de `prune finish`: hasta entonces el repo viejo (con la historia) sigue vivo.
3. **NUNCA** hacer miembro de la org a un colaborador: se invita al repo como outside collaborator con lectura (`prune invite` se niega con miembros).
4. **NUNCA** saltar el re-clon de los socios (Phase 3): un clon viejo puede pushear la historia completa al repo nuevo, y GitHub Free no lo impide.
5. **NUNCA** decidir por el PO qué base de datos ve el colaborador (Phase 2).
6. **NUNCA** correr este workflow headless: tres de sus fases publican o son irreversibles.

---

## Checkpoints × modo

| Fase | Fluido (default) | `--step` | Headless |
| --- | --- | --- | --- |
| 0 Modelo + tier + colaboradores | **para** (decisión del PO) | para | no corre |
| 1 `prune prepare` | auto-avanza si `pnpm verify` pasa; **para** si falla | para | no corre |
| 2 Datos de la base | **para** (decisión del PO; un reset es irreversible) | para | no corre |
| 3 Congelamiento + re-clon | **para** (requiere a los socios) | para | no corre |
| 4 `prune cutover` | **Plan Mode** (`CC.md §4`, irreversible) | Plan Mode | no corre |
| 5 Vercel | **para** (publica un deploy) | para | no corre |
| 6 Bóveda | **para** si el sync no apunta al repo nuevo | para | no corre |
| 7 `prune finish` + `prune invite` | **para** (archiva + invita: irreversible/publica) | para | no corre |
| 8 `CONTRIBUTING.md` | auto-avanza (reversible) | para | no corre |

Headless: el workflow se niega en Phase 0 y no intenta `AskUserQuestion`.

---

## Flow

```
Phase 0  modelo + tier + lista de colaboradores (usuarios de GitHub)
Phase 1  factory prune prepare            → bloque .gitignore + interruptor + des-trackeo, commit local
Phase 2  datos de la base                 → el PO decide (riesgo explicado según el tipo de datos)
Phase 3  congelamiento + re-clon          → socios enumerados; nadie pushea durante el corte
Phase 4  factory prune cutover            → preflight → Plan Mode → --confirm
Phase 5  Vercel                           → reconectar en el dashboard + push vacío para el primer deploy
Phase 6  bóveda                           → sync de GitHub apuntando al repo nuevo + setup:e2e
Phase 7  factory prune finish → invite    → archiva el -legacy, audita, invita colaboradores
Phase 8  CONTRIBUTING.md                  → desde templates/CONTRIBUTING.template.md, commit
```

TodoWrite con las 9 fases al arrancar.

---

## Phase 0 — Modelo, tier y colaboradores

Explica el modelo (tabla de arriba) en 3-4 líneas. Confirma con el PO: tier (hoy solo `collab`), lista de usuarios de GitHub de los colaboradores, rama de trabajo (`GIT.md §4`). Si el repo vive en **Railway**: el corte no cubre Railway — se dice y se para.

## Phase 1 — Preparar el repo

```bash
npx @timekast/factory prune prepare
```

En la rama de trabajo, con el árbol limpio. Escribe el bloque del `.gitignore` (migra un bloque `timekast:collab` hecho a mano), el interruptor `.timekast/prune.json`, deja de trackear lo restringido (sigue en el disco del socio) y commitea local. Corre `pnpm verify`. Muestra el resumen de rutas des-trackeadas. Llévalo a `main` con `/deploy` antes del corte: el repo nuevo nace de `main`.

## Phase 2 — Datos de la base

Revisa la base que verá el colaborador:

- a qué base apunta el entorno `local` de la bóveda (`sk-vault`) — ¿es la de `develop`?;
- si `develop` es copia de producción (datos reales de clientes, correos, montos) o datos de prueba;
- migraciones pendientes (`pnpm db:query` sobre el journal) y si el build tiene fallbacks a otra base.

Explica el riesgo **según el tipo de datos** (datos personales ≠ catálogo público) y el PO elige: (1) dejar la copia de producción, (2) resetear `develop` desde producción, (3) base con seed sin datos reales. El reset de un branch de Neon con el rail se hace **solo** con confirmación explícita, y es irreversible.

## Phase 3 — Congelamiento y re-clon

Enumera a los socios con acceso (`gh api repos/<owner>/<repo>/collaborators --jq '.[].login'`) y pide: nadie pushea durante el corte, y **después del corte cada socio vuelve a clonar** (o reapunta su clon viejo a `<repo>-legacy`). Un clon viejo conserva la historia con la metodología; si pushea al repo nuevo, la publica. Espera la confirmación del PO.

## Phase 4 — El corte

```bash
npx @timekast/factory prune cutover              # solo preflight + plan; no toca nada
npx @timekast/factory prune cutover --confirm    # tras aprobar el plan
```

El preflight se niega si: no eres admin, la org no te deja crear repos, hay cambios sin pushear, o `develop` tiene commits que no están en `main` (llévalos con `/deploy`, o `--discard-develop` si el PO acepta perderlos **por escrito**). Presenta el plan en **Plan Mode** (`CC.md §4`). Tras `--confirm`: snapshot de `main` validado sin rutas restringidas → `<repo>-next` → dos renames → forks solo en el repo nuevo. Si algo falla, `--resume` sigue donde quedó. Relata lo que **no migró** (variables de Actions, environments, webhooks, deploy keys, issues/PRs abiertos).

## Phase 5 — Vercel

El proyecto de Vercel sigue ligado al repo viejo (Vercel liga por id de repo, y el rename no lo mueve). **Se reconecta en el dashboard** (Project → Settings → Git → conectar el repo nuevo): la API documentada de Vercel no permite cambiar el repo de un proyecto existente. Después, un commit vacío en `main` para el primer deploy (`git commit --allow-empty`), con el gate de push (`GIT.md §2`). Railway: fuera de alcance.

## Phase 6 — Bóveda

Abre la configuración del sync de `develop:/ci` a GitHub (`fx-secrets-vault §7`) y **confirma que el destino es el repo nuevo** — no lo asumas. Dispara el sync. Corre `pnpm setup:e2e` para las GitHub Variables (`NEXT_PUBLIC_AUTH_*`). Recuerda: a los colaboradores se les da acceso **solo** al entorno `local`, sin rail.

## Phase 7 — Cerrar el repo viejo e invitar

```bash
npx @timekast/factory prune finish
npx @timekast/factory prune invite <usuario-github>   # uno por colaborador
```

`finish` exige un deploy de **Production** exitoso en el repo nuevo; apaga forks y quita colaboradores externos del `-legacy` y lo archiva; audita la historia del repo nuevo (una raíz, cero rutas restringidas). Auditoría sucia → **para**: no se invita a nadie. `invite` se niega con miembros de la org; si GitHub responde 403, la org no deja a admins de repo invitar — lo hace un owner.

## Phase 8 — `CONTRIBUTING.md`

Escribe `CONTRIBUTING.md` en la raíz desde [`templates/CONTRIBUTING.template.md`](templates/CONTRIBUTING.template.md), con la rama de trabajo y el nombre del repo. Commit por pathspec (`GIT.md §3.6.1`) en la rama de trabajo; push con el gate.

---

## Output

| Artefacto | Tipo | Dónde |
| --- | --- | --- |
| `.gitignore` (bloque) + `.timekast/prune.json` | durable | repo |
| Repo nuevo + `<repo>-legacy` archivado | durable | GitHub |
| `CONTRIBUTING.md` | durable | repo |
| Estado del corte a medias | transicional | `.git/tk-prune-cutover.json` (lo borra el CLI al terminar) |

## Invalidation

- Llegan colaboradores nuevos después de Phase 7 → solo `prune invite` por cada uno.
- `main` cambia durante el corte → el CLI no renombra nada; se borra `<repo>-next` y se repite Phase 4.
- `prune audit` sale sucio después del corte → borrar la ref que trae la historia vieja; si ya se publicó, pedir a GitHub Support la purga.
- El kit cambia el tier → `factory update` en el clon de un socio regenera el bloque y publica/des-trackea solo.

## Subprocess delegation

Ninguno: cada fase depende de una decisión del PO o de un paso irreversible, y lo mecánico vive en el CLI.

---

_TimeKast Factory — tk-prune (compartir repos sin la metodología)_

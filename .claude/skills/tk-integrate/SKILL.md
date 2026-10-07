---
name: tk-integrate
description: Coding-family workflow for the org member who integrates an outside collaborator's fork pull request into a pruned repo (one shared without the methodology via /prune). Audits the repo's history, refuses by script any PR that touches what runs around the product before checking it out, explains the diff in plain language, runs pnpm verify locally, then merges into the working branch as the member and pushes behind the runtime gate. Primary invocation is `/integrate <PR>`.
family: coding
model: opus
parallelism_unit: none
concurrency_cap: 1
auditor_step: false
last-verified: 2026-10-01
user-invocable: false
---

# tk-integrate — `/integrate` PR de un colaborador externo

> **Propósito:** que un **socio** (miembro de la org) integre el PR que un **colaborador externo** abrió desde su fork a un repo compartido sin la metodología (`/prune`). El colaborador no tiene CI remoto en su PR (los workflows de forks están apagados) ni puede mergear: las pruebas corren en la máquina del socio, y el merge lo firma el socio — así Vercel despliega un commit de alguien con asiento.
>
> **Architectural principle:** lo que el agente decide y lo que decide un script van separados. **Qué PR se rechaza lo decide `factory prune check-pr`, por ruta, antes del checkout** — nunca el criterio del agente leyendo el diff. El agente explica y verifica; no relaja el rechazo.
>
> **Anterior:** el colaborador abre el PR a la rama de trabajo · **Siguiente:** —

**Modelo de riesgo aceptado** (decisión de la org): correr `pnpm verify` del PR en la máquina del socio es un riesgo aceptado **solo para código de producto**. Todo lo que corre alrededor del producto — hooks, CI, scripts, configuración de herramientas, la metodología, el interruptor del repo compartido, los `scripts` de `package.json` — se rechaza por ruta. La lista y su porqué: [`methodology/rejected-paths.md`](methodology/rejected-paths.md).

---

## Tone guidance

Plain es-MX al socio (`CORE.md §6`). Explica el PR como un cambio de producto ("agrega el filtro por fecha en la tabla de pedidos"), no como un dump de archivos. Un rechazo se explica con la razón de la ruta, sin juicio sobre el colaborador.

---

## 🔴 Anti-Drift Rules

1. **NUNCA** hacer checkout del PR antes de que `factory prune check-pr` salga en verde. El rechazo es previo a ejecutar nada del PR.
2. **NUNCA** relajar un rechazo de `check-pr` por criterio propio ("es un cambio inocente al `.gitignore`"). Un PR rechazado se regresa o lo rehace un socio.
3. **NUNCA** autorizar en Vercel el deploy de un PR de fork: correría con las variables de preview. La preview que vale es la del merge del socio.
4. **NUNCA** mergear con el botón de GitHub: el autor del merge tiene que ser el socio (Vercel bloquea autores sin asiento) y el merge pasa por los hooks locales.
5. **NUNCA** push sin el gate del runtime (`GIT.md §2`).

---

## Checkpoints × modo

| Checkpoint | Fluido (default) | `--step` | Headless |
| --- | --- | --- | --- |
| Auditoría de historia sucia (Phase 0) | **para** (señal real) | para | fail-closed: termina, no integra |
| `check-pr` rechaza (Phase 1) | **para** — sin opción de seguir | para | fail-closed |
| Explicación del diff (Phase 2) | auto-avanza con resumen; **para** si hay dependencias nuevas | para | reporta y termina |
| `pnpm verify` falla (Phase 3) | **para** (señal real) | para | fail-closed |
| Migración / schema (Phase 4) | **Plan Mode** (`CC.md §4`) | Plan Mode | fail-closed |
| Merge + push (Phase 5-6) | **para** (publica — `GIT.md §2`) | para | **nunca** mergea ni pushea |

Headless: el workflow corre las fases 0-3 como reporte y **nunca** mergea; no intenta `AskUserQuestion`.

---

## Flow

```
Phase 0  factory prune audit                 → historia limpia (una raíz, cero rutas restringidas)
Phase 1  factory prune check-pr <PR>         → rechazo duro por ruta, ANTES del checkout
Phase 2  diff en plano                       → qué cambia; dependencias nuevas marcadas
Phase 3  gh pr checkout + pnpm verify        → en la máquina del socio (riesgo aceptado)
Phase 4  migraciones                         → explicar; schema = Plan Mode
Phase 5  merge a la rama de trabajo          → git merge --no-commit --no-ff, commit del socio
Phase 6  push (gate) + preview               → confirmar el deployment de preview vía GitHub
```

TodoWrite con las 7 fases al arrancar.

---

## Phase 0 — Auditoría de historia

`factory prune audit` sobre el repo. Detecta que un clon viejo (de antes del corte) haya pusheado la historia completa — a una rama o dentro de un PR. Sucio → **para**: explica qué ref lo trae y que hay que borrarla (o pedir a GitHub Support la purga si ya se publicó) **antes** de integrar nada. Limpio → sigue.

## Phase 1 — Rechazo por ruta (antes del checkout)

```bash
npx @timekast/factory prune check-pr <número>
```

Lee los archivos del PR desde la API de GitHub (sin bajar el código, incluidos los dos lados de un rename) y compara `package.json#scripts`/`#pnpm` entre base y PR. Exit `1` → **para**, muestra las rutas y su porqué, y cierra el workflow: el PR se regresa al colaborador o un socio rehace ese cambio. No hay opción de "seguir de todos modos".

## Phase 2 — El diff en plano

`gh pr diff <número>` — lectura, sin checkout. Resume en 3-4 líneas de negocio qué cambia. **Dependencias nuevas** en `package.json` (`dependencies`/`devDependencies`): se listan con nombre y versión y son **señal real** — el socio decide si las acepta antes de instalarlas en su máquina.

## Phase 3 — Checkout y verificación local

```bash
gh pr checkout <número>
pnpm install            # solo si el PR cambia dependencias (gate del harness, CODING.md §7)
pnpm verify
```

En la máquina del socio, con el riesgo aceptado. Falla → **para**: explica qué falló; el arreglo lo hace el colaborador en su PR. E2E no corre aquí — corre después del merge (`SK.md §4.1`).

## Phase 4 — Migraciones

Si el PR trae archivos en el directorio de migraciones o cambia `src/lib/db/schema/**`: explica qué tablas/columnas cambian. Cambio de schema → **Plan Mode** (`CC.md §4`) antes de seguir. Nunca `db:push` (`SK.md §1.1`).

## Phase 5 — Merge a la rama de trabajo

La rama de trabajo sale de `GIT.md §4` (override de `project-config.md` o `version` de `package.json`): `develop` post-release, `main` pre-release.

```bash
git checkout <rama-de-trabajo> && git pull --ff-only
git merge --no-commit --no-ff <rama-del-pr>
git commit -m "merge: <título del PR> (#<número>)"
```

Los flags van antes de la rama — es el patrón que los permisos del kit autorizan (`tk-deploy`). El merge commit no lleva pathspec (`GIT.md §3.6.1`). Corre el pre-commit completo, incluido el guard de `prune`.

## Phase 6 — Push y preview

Muestra rama, remote y commits → **para** (`GIT.md §2`; el permiso del runtime es el gate). Tras el push, GitHub marca el PR como mergeado solo. Confirma la preview leyendo los deployments de GitHub (`gh api repos/<owner>/<repo>/deployments?sha=<sha>`), nunca autorizando el deploy del fork en Vercel.

---

## Invalidation

- El colaborador empuja commits nuevos al PR después de Phase 1 → **regresa a Phase 1** (el rechazo se recalcula sobre el PR completo).
- `pnpm verify` falla y el colaborador corrige → regresa a Phase 1, no a Phase 3.
- Conflicto en el merge → `git merge --abort` y se le pide al colaborador rebasear su rama.

## Subprocess delegation

Ninguno. Es lineal, con el socio en la conversación, y lo mecánico vive en el CLI (`check-pr`, `audit`).

---

_TimeKast Factory — tk-integrate (PRs de colaboradores externos en repos podados)_

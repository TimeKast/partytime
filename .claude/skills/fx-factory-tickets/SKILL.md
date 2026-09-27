---
name: fx-factory-tickets
description: Factory-internal convention for factory-tickets, the derivative-to-Factory channel for reporting a kit gap: the single ticket shape, type slug and filename rule, per-type optional fields, the closed `Estado` vocabulary with the delivered-issue URL slot, and the rule that a ticket carries key names, never secret values. Invoke when opening, naming or triaging a factory-ticket — typically after finding a kit file has no extension point. Delivery → fx-factory-cli; customizing → fx-extension-points.
family: factory-internal
last-verified: 2026-08-27
user-invocable: false
---

# fx-factory-tickets — Convención canónica de factory-tickets

> **Propósito:** ser la **fuente única** de qué es un factory-ticket y cómo se escribe — el canal por el que un proyecto derivado (o un agente corriendo dentro de él) le reporta al Factory un defecto accionable del kit: tipo, nombre de archivo, shape, campos, estado y regla de higiene.
>
> **Ships to derivatives via the `fx-*` glob** — viaja en los dos perfiles (`full` y `core`). La convención es **del kit, no de un workflow**: cualquier agente, skill o workflow que encuentre un gap accionable emite con este shape, haya corrido `/discovery` o no.
>
> **Boundary:** *qué es* un ticket y *qué forma tiene* vive aquí. *Cómo se entrega* al Factory → [`fx-factory-cli`](../fx-factory-cli/SKILL.md). *Qué puedes customizar sin forkear* —la decisión que casi siempre precede al ticket— → [`fx-extension-points`](../fx-extension-points/SKILL.md). La **regla** de cuándo abrir uno es [`CORE.md §5`](../../rules/CORE.md); esta skill no la reenuncia, la instancia.

---

## §1 ¿Cuándo se auto-carga?

Routing semántico (CC.md §1.1). Triggers típicos:

- "abre un factory-ticket", "¿cómo reporto esto al Factory?", "el kit no me deja hacer X y no hay punto de extensión"
- "¿qué shape lleva el ticket?", "¿cómo se llama el archivo?", "¿dónde lo guardo?"
- Un agente de workflow encuentra un gap accionable del kit y tiene que escalarlo **sin detener el pipeline**
- Edición o lectura de cualquier archivo bajo `project/factory/`

**NO se carga cuando:** vas a mandar el ticket ya escrito → [`fx-factory-cli`](../fx-factory-cli/SKILL.md). Vas a subir un issue **del proyecto** al tablero de cara al cliente → [`fx-backlog-central`](../fx-backlog-central/SKILL.md).

---

## §2 Qué es un factory-ticket (y qué no)

Un factory-ticket es un archivo markdown en `project/factory/` que documenta **un defecto o un hueco del kit** con suficiente detalle para que el Factory pueda actuar sin volver a preguntar. Tres propiedades:

1. **Es del kit, no del proyecto.** Lo que se reporta es una limitación de `.claude/`, `scripts/`, `.husky/`, `.github/workflows/` o del boilerplate — no un bug de la app derivada.
2. **Es accionable.** Dice qué se intentó, por qué no alcanzó y qué mejora concreta lo resolvería. Una queja sin las tres cosas no es un ticket.
3. **No bloquea.** Quien lo emite continúa su trabajo. El ticket es feedback asíncrono, nunca una compuerta.

**Lo que NO es un factory-ticket:**

| No es…                                                    | Va en…                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Un issue de trabajo del proyecto derivado                 | El backlog del repo → [`fx-backlog-central`](../fx-backlog-central/SKILL.md) |
| Una nota suelta en un PR o un comentario en el código      | Un ticket de verdad, o nada — las notas se pierden                          |
| Un fork local "documentado"                                | El ticket **más** las alternativas sin fork de `fx-extension-points §5.3`   |

---

## §3 Tipos y naming

**`{type}` es un slug libre en kebab-case que nombra la clase del defecto.** No hay lista cerrada: si tu caso no cae en ninguno de los existentes, invéntale un slug descriptivo (`docs-drift`, `provision-drift`, `cli-drift`). Lo que sí es fijo es todo lo demás:

- **El shape es el mismo para todos los tipos** (§4). El tipo no cambia las secciones; a lo sumo agrega campos opcionales (§4.1).
- **`{NNN}` es obligatorio** — contador incremental dentro del mismo `{type}` + fecha + proyecto. Si el slot está ocupado, incrementa hasta encontrar uno libre.
- **Solo dos tipos se emiten automáticamente** —`intake-drift` y `sk-drift`—, porque su condición es mecánica (§5). `workflow-drift` y `ui-extension` los **surfacea el orquestador y los aprueba el usuario**; cualquier otro tipo lo escribe un humano.
- 🔴 **Los tickets ya escritos sin `{NNN}` no se renombran retroactivamente.** La regla aplica a los nuevos; renombrar los viejos rompería referencias sin ganar nada.

**Location:** `project/factory/` (por proyecto, directorio plano, ya creado en el kit con `.gitkeep`).

**Filename:** `{type}-{YYYY-MM-DD}-{project-slug}-{NNN}.md`

```
project/factory/
├── intake-drift-{YYYY-MM-DD}-{project-slug}-001.md
├── intake-drift-{YYYY-MM-DD}-{project-slug}-002.md
├── sk-drift-{YYYY-MM-DD}-{project-slug}-001.md
└── .gitkeep
```

---

## §4 Shape canónico

Un solo shape, para todos los tipos. El bloque de encabezado es de campos `**Campo:** valor`, una por línea; el cuerpo son cuatro secciones fijas, la última opcional.

```markdown
# Factory Ticket — {type}

**Project:** {project-slug}
**Date:** {YYYY-MM-DD}
**Estado:** abierto
**GitHub issue:** —
**Source agent:** {nombre del agente emisor | humano}
**Trigger context:** {path del archivo / ubicación en `src/` / otro ancla verificable}

## What was attempted

{qué estrategia o camino se intentó, en una o dos líneas}

## Why it failed / why it's a gap

{razón concreta — extensión desconocida, skill sin cobertura, archivo del kit sin punto de extensión}

## Suggested Factory improvement

{mejora accionable: estrategia nueva, punto de extensión propuesto, doc faltante, regla a ajustar}

## Context snippet (optional)

{extracto corto para que el maintainer reproduzca — ver la regla de higiene de §4.2}
```

### §4.1 Campos opcionales por tipo

El shape no se bifurca: un tipo puede **agregar** campos al bloque de encabezado, nunca quitar ni renombrar los canónicos. Los declarados hoy:

| Tipo         | Campos opcionales adicionales                                                                          | Vocabulario                       |
| ------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `sk-drift`   | `**Severity:**` · `**Found in:**` (path en `src/`) · `**Expected in:**` (skill que debería cubrirlo)   | `Severity` ∈ `LOW`\|`MEDIUM`\|`HIGH` |
| `intake-drift` | —                                                                                                    | —                                 |
| `workflow-drift` | —                                                                                                  | —                                 |
| `ui-extension` | —                                                                                                    | —                                 |

Los campos opcionales van **después** de `Trigger context`, en el mismo bloque de encabezado. La heurística de cómo se asigna un valor la declara **quien emite** (el agente conoce su dominio); esta skill declara el campo y su vocabulario, para que el valor sea legible sin abrir el emisor.

Un tipo nuevo que necesite un campo propio lo agrega **a esta tabla**, no a un shape paralelo.

### §4.2 🔴 Higiene de contenido — un ticket lleva NOMBRES de clave, nunca VALORES de secreto

**Nombra la variable; jamás pegues su valor.** `DATABASE_URL` sí; la cadena de conexión, no. Redacta el valor (`DATABASE_URL=<redactado>`) antes de pegar cualquier cosa.

No es una precaución teórica: `intake-drift` y `sk-drift` los emiten **agentes, automáticamente** (§5) —y un emisor automático no lee esta convención antes de pegar—, el contenido natural de un ticket de drift del kit es **salida de comandos**, y tanto el driver de Postgres como `drizzle-kit` imprimen la cadena de conexión **completa, con password**. `## Context snippet (optional)` es exactamente donde se pega esa salida. Y el ticket sale del repo: `factory ticket push` lo convierte en un issue de GitHub.

---

## §5 Trigger rules — objetivas, no de juicio

Un ticket automático se emite por una **condición verificable**, no porque el agente lo considere interesante. Los tipos declarados hoy:

| Tipo              | Quién emite                          | Condición objetiva                                                                                                   |
| ----------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `intake-drift`    | `dsc-intake-analyst` (automático)    | Un archivo de la fuente cae en Tier 2 (binario / scan / desconocido sin capa de texto) y no se pudo extraer            |
| `sk-drift`        | `dsc-kit-analyst` (automático)       | Una feature presente en `src/` del repo objetivo sin cobertura en `sk-features-index` ni en ninguna skill `sk-*`      |
| `workflow-drift`  | Orquestador **surfacea**, el usuario aprueba la emisión | El schema o la estructura del propio workflow no aloja bien la información que el run produjo. Cada workflow declara sus umbrales concretos |
| `ui-extension`    | Orquestador de `/design` **surfacea**, el usuario aprueba la emisión | Un componente es una **extensión delgada** de un primitivo de `sk-ui` usada en **≥2 pantallas** (criterio C — [`tk-design/methodology/component-extension-policy.md §2.3`](../tk-design/methodology/component-extension-policy.md)) |

**La forma del disparo importa tanto como la condición:** `intake-drift` y `sk-drift` se emiten solos porque su condición es mecánica. `workflow-drift` y `ui-extension` no: el primero juzga al workflow mismo, y el segundo pide un juicio de tamaño (*"la extensión es lo bastante chica como para pertenecer al kit"*, criterio C) que ninguna regla resuelve sola. En los dos el orquestador **propone** y el usuario decide. Un tipo nuevo hereda esa distinción — si la condición no es verificable sin criterio humano, se surfacea, no se emite.

**El pipeline nunca se detiene por un ticket.** Quien lo emite continúa y lo reporta al cierre de su fase.

---

## §6 Ciclo de vida — `Estado`, la URL, y quién manda

### §6.1 El campo `Estado`

Vocabulario **cerrado**, en el bloque de encabezado, cuarta línea:

| Valor        | Significa                                                                      |
| ------------ | -------------------------------------------------------------------------------- |
| `abierto`    | Recién emitido. **Es el valor con el que nace todo ticket**                      |
| `triado`     | Alguien lo leyó y decidió que es trabajo real                                    |
| `resuelto`   | El defecto ya no existe en el kit que el proyecto tiene                          |
| `descartado` | Se decidió no actuar. La razón se escribe en el propio ticket, no se deja implícita |

Fuera de estos cuatro valores no hay nada: un estado inventado hace ilegible el directorio para cualquier herramienta que lo lea.

### §6.2 El slot de la URL — `**GitHub issue:**`

Campo del bloque de encabezado, **inmediatamente después de `Estado`**. Nace con un guion largo (`—`) y es el **único campo que escribe una herramienta**: al entregar el ticket, `factory ticket push` reemplaza ese guion por la URL completa del issue creado en el repo del Factory ([`fx-factory-cli`](../fx-factory-cli/SKILL.md)).

- Sin entregar → `—`. Nunca se borra el campo: su ausencia y su guion dicen cosas distintas para quien lo audita.
- Estampar la URL **no cambia el `Estado`**. Entregar no es triar.
- **En qué commit viaja el ticket** —el de su emisión y el del estampado— lo declara `GIT.md §3.5.1`, no esta skill: un commit propio `docs(factory): …`, separado del `docs(<wf>):` del run que lo emitió. Ahí vive el SSOT, aquí solo el puntero.

### §6.3 Precedencia — el `Estado` local es la vista del derivado

🔴 **El `Estado` local NO intenta espejar `open`/`closed` del issue de GitHub, en ninguna dirección.** No hay sincronización, y no se va a inventar una:

- El **`Estado` local** responde *"¿esto sigue siendo un problema para este proyecto?"* — lo mantiene el equipo del derivado.
- El **issue de GitHub** responde *"¿el Factory ya hizo el trabajo?"* — lo mantiene el Factory.

Las dos respuestas divergen de forma legítima y permanente: el Factory puede cerrar el issue mientras el derivado sigue en la versión vieja del cerebro (para él sigue `abierto`), y un derivado puede marcar `descartado` algo que el Factory sí va a arreglar. **Ante divergencia, cada lado gana en su propia pregunta** — no hay conflicto que resolver, hay dos campos que miden cosas distintas.

---

## §7 Checklist antes de emitir

- [ ] El defecto es **del kit**, no de la app derivada (§2)
- [ ] Ya descarté que exista un punto de extensión — `fx-extension-points §5.1`
- [ ] `{type}` en kebab-case y el filename lleva `{NNN}` (§3)
- [ ] Las cuatro secciones del shape están, y las tres primeras tienen contenido real (§4)
- [ ] `Estado: abierto` y `GitHub issue: —` presentes desde el nacimiento (§6)
- [ ] Releí el `Context snippet` buscando **valores** de secreto y los redacté (§4.2)

---

## §8 Boundary

| Si vas a…                                                              | Usa en su lugar…                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Entregar** el ticket al Factory (`factory ticket push`, credenciales) | [`fx-factory-cli`](../fx-factory-cli/SKILL.md)                            |
| **Commitear** el ticket (en cuál commit viaja, con qué subject)        | `GIT.md §3.5.1` — commit propio `docs(factory): …`, nunca el del run      |
| Averiguar si de verdad no hay punto de extensión antes de escribirlo   | [`fx-extension-points`](../fx-extension-points/SKILL.md)                   |
| Subir un issue **del proyecto** al tablero de cara al cliente          | [`fx-backlog-central`](../fx-backlog-central/SKILL.md) — el otro canal derivado→remoto, con otro destino y otra audiencia |
| Decidir si un archivo es tuyo o del kit                                | `CORE.md §5` — es la regla always-on; esta skill solo la instancia        |
| Autorar la skill o el workflow que va a emitir el ticket               | [`fx-skill-author`](../fx-skill-author/SKILL.md) / [`fx-workflow-authoring`](../fx-workflow-authoring/SKILL.md) |

---

_TimeKast Factory — fx-factory-tickets (convención canónica de factory-tickets, factory-internal)_

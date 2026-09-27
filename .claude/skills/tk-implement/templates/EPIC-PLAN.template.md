---
status: in_progress
hash: '{{INPUT_HASH_FIRST_12}}'
run_id: '{{RUN_ID}}'
sensitive_paths_authorized: [] # {{RESUELTO POR PREDICADO en Phase 2 — no a mano. Ver §Phase 2 "Resolución mecánica"}}
risk_resolved: # {{lo escribe Phase 2 §2.2. Sin resolver = AUSENTE, nunca un default}}
  level: # {{nivel 0-4 resuelto. 🔴 Vacío ≠ 0 — vacío significa "no resuelto"}}
  from: [] # {{`{path o signal}` de cada regla que matcheó, con su origen kit|proyecto}}
  reviewers_ran: [] # {{revisores plan-time que corrieron, o [] si ninguno aplicó}}
---

# Plan del epic — {{EPIC-NN-slug}}

> Output de CP-A. **Lenguaje claro, 1 pantalla.** Audiencia = el user. Aprobar este plan autoriza toda la ejecución del epic.
>
> **Frontmatter (NO surface al user):** `status` ∈ `{in_progress, closed}` — `closed` solo se setea en Phase 5 si `--keep-artifacts` está activo (sin flag, el cleanup borra el file). `/handoff` detecta `status: in_progress` para registrar el path activo en el header del transition. `hash` lo lee Phase 0 (resume `--start-at`) para decidir entre `re-plan + re-CP-A` (mismatch) vs `skip CP-A` (match).
>
> **`sensitive_paths_authorized`** — la versión **enumerable** de las áreas sensibles que abajo se narran en prosa. Aprobar el plan autoriza estos paths; el micro-gate de Phase 4.7.4 dispara sólo sobre superficie sensible que **no** esté aquí. Va en el frontmatter y no en el cuerpo justamente porque una lista de paths rompería el contrato de "lenguaje claro, 1 pantalla, audiencia = el user". Valores: los paths del registry (`.claude/policy/quality-gates.json` ∪ el override del proyecto) que pertenezcan a reglas con `risk` ≥ 3 y que este epic toque — la lista vive en el registry, nunca aquí; enumerar globs en el template sería el hardcode que `§4.6` prohíbe.
>
> 🔴 **Lo resuelve un predicado, NO el juicio de quien redacta el plan.** Phase 2 lo deriva del bullet `Files to create/modify` de los issues del SELECTION SET cruzado contra el registry, con el sesgo conservador que esa sección declara: **ante ambigüedad no se autoriza**. El campo se escribe una vez, ya resuelto; no se edita a mano después. Dos corridas sobre el mismo SELECTION SET producen la misma lista — que es justamente lo que el juicio no garantizaba.
>
> **`risk_resolved`** — el nivel que Phase 2 resolvió, con qué reglas o señales lo produjeron y qué revisores plan-time corrieron. Es lo que hace **auditable** la resolución: sin él, un plan aprobado no deja rastro de por qué autorizó lo que autorizó. `reviewers_ran: []` es un valor legítimo (nivel bajo, ningún revisor aplicó), distinto de ausente.
>
> 🔴 **`risk_resolved` ausente → re-resolver, nunca asumir 0.** Un plan persistido antes de que Phase 2 §2.2 existiera (caso vivo en cualquier derivado tras `factory update`) conserva su `hash`, así que el resume (`--start-at`) **salta CP-A** y el panel plan-time no correría nunca. Si el campo falta, Phase 0 re-resuelve el riesgo antes de continuar (o re-presenta CP-A si eso cambia lo autorizado). El campo ausente es señal de "no resuelto", no de "resuelto en 0".

> 🔴 **Fail-closed:** un plan sin `sensitive_paths_authorized` (persistido por una corrida anterior a v2.3, o migrado del path legacy) → 4.7.4 trata **todo** path sensible como no autorizado. Nunca se asume una autorización ausente. **La mecanización no relaja esta garantía: la refuerza.** Como el predicado sólo puede producir un subconjunto de lo que el juicio humano habría enumerado, el micro-gate dispara igual o **más** que antes, nunca menos.

## Qué vamos a construir

{{1-3 oraciones en lenguaje claro: qué entrega este epic y para qué. Sin jerga.}}

## En qué orden

{{Modo: "De corrido" (epic chico) | "En N grupos con un alto entre cada uno" (epic grande).}}

{{Si por grupos — lista los grupos en orden, cada uno con sus issues:}}

- **Grupo 1:** {{ISSUE-ID — título corto}} · {{ISSUE-ID — título corto}}
- **Grupo 2:** {{ISSUE-ID — título corto}}
- … (alto liviano entre grupos: te muestro un resumen y te pregunto si sigo)

{{Si de corrido — lista los issues en orden:}}

1. {{ISSUE-ID — título corto}}
2. {{ISSUE-ID — título corto}}

{{Issues que omito (si hay): {{ISSUE-ID}} — bloqueado por {{razón}}.}}

## Áreas sensibles que toca

> Esto es lo que el user revisa una vez, aquí. Una línea por área, en lenguaje claro.
>
> Cada área que corresponda a superficie sensible del registro (reglas `risk` ≥ 3, kit ∪ override) se enumera además, **en paths, en el frontmatter** (`sensitive_paths_authorized`) — mismo hecho, dos audiencias: aquí para el user, allá para el predicado determinista de 4.7.4.
>
> 🔴 **Las dos audiencias se escriben en el MISMO paso, y el conteo se narra.** Desde que el frontmatter lo llena un predicado, la sincronía dejó de ser automática: el riesgo es que el user apruebe en CP-A una autorización que esta prosa nunca mencionó — y entonces 4.7.4 (fail-closed) deja de disparar sobre un path que nadie vio. Por eso Phase 2 emite las dos cosas juntas y **CP-A narra el conteo resuelto** ("autoricé N áreas sensibles, derivadas de los issues X e Y"): un número verificable, no una glosa. Una línea catch-all del tipo "modifica el login" **no** satisface esto si el frontmatter enumera diez globs que el user nunca vio desagregados.

- {{ej: "Crea tablas nuevas en la base de datos" / "Modifica el login" / "Cambia permisos de roles" / "Ninguna — solo pantallas y lógica de UI".}}

_(Las migraciones usan el camino del kit — `db:generate` + `db:migrate`, nunca `db:push`. Si el SQL generado trae `DROP` o `ALTER … DROP`, se muestra aquí y se revisa antes de aprobar; si no lo trae, no hace falta revisarlo.)_

## Cómo lo verifico

- Cada issue: se prueba solo (tipos + lint + tests) antes de guardarse, con su propio commit.
- Al final del epic: se prueba todo junto (incluido el build y las pruebas de extremo a extremo) y te muestro el resumen.

## Skills que voy a consultar

{{`sk-...`, `kb-...` — consolidado de los issues del epic.}}

---

> **Para aprobar:** 1 Aprobar · 2 Ajustar · 3 Cancelar.

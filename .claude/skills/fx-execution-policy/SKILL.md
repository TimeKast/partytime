---
name: fx-execution-policy
description: Factory-internal SSOT for the kit's execution layer: the two axes (task nature → model tier; change risk → review panel), the 0-4 risk scale, the quality-gates registry and its per-repo hardening override, the structural signals, the review doctrine and the debt-refutation cut (fixed in the run vs earns an issue). Invoke when asking why a change scored a risk level, which reviewers a gate runs, what HIGH risk means, or how a project hardens its gates. Phase mechanics → tk-implement / tk-backlog.
family: factory-internal
runtime: true
last-verified: 2026-09-23
user-invocable: false
---

# fx-execution-policy — La capa de ejecución del kit

> **Propósito:** ser la fuente legible única de **con qué** se ejecuta el trabajo (modelo) y **cuánto escrutinio** recibe (revisores + gate de interacción). Cubre los dos ejes, la escala de riesgo 0-4, los registries del eje B con su dueño y su read-only-ness, las definiciones de las señales estructurales, los principios de la doctrina de revisión y el mapeo riesgo→R-tier.
>
> **Viaja a los derivados en los dos perfiles de distribución:** en `full` por el denylist `**` (no está en la lista de exclusiones) y en `core` por el allowlist `.claude/skills/fx-*/**`. El prefijo `fx-` **no** decide el shipping — lo decide el dominio (`fx-skill-author §2`). Un derivado la consulta en runtime para entender por qué un cambio disparó cierto nivel, qué revisores le corresponden y cómo endurecer sus propias áreas sensibles.
>
> **Boundary:** esta skill documenta el **criterio**; las fases que lo aplican viven en su workflow y no se reproducen aquí — gate de security audit y cierre de epic → [`tk-implement`](../tk-implement/SKILL.md); evaluación de riesgo y presupuesto de spawns de un run de backlog → [`tk-backlog`](../tk-backlog/SKILL.md). El contenido concreto de las reglas vive en el registry, no en este archivo.

---

## §1 ¿Cuándo se auto-carga?

Routing semántico (CC.md §1.1). Triggers típicos:

- "¿por qué este cambio quedó en riesgo alto?", "¿qué significa HIGH risk?", "¿qué revisores tienen que correr en este epic?"
- "¿cómo declaro `src/features/payments/**` como área sensible de mi proyecto?", "¿puedo relajar un gate del kit?"
- "¿qué es la señal `no-adr` / `meta-foundation`?", "¿de dónde sale la lista de paths sensibles?"
- "¿cómo se refuta un pendiente de deuda antes de cerrar un epic?", "¿qué evidencia cuenta para justificar deuda fuera de frontera?"
- Edición de `.claude/policy/quality-gates.json` o de `.claude/policy/quality-gates.project.json`

**NO se carga cuando:** vas a ejecutar una fase concreta de un workflow → el `tk-*` de ese workflow; vas a crear o refactorizar una skill → `fx-skill-author`; vas a autorar un workflow con fases y gates → `fx-workflow-authoring`.

---

## §2 Dos ejes independientes

Mezclarlos es el error fácil: un cambio sobre el schema de auth y uno sobre un botón corren en **el mismo modelo**, pero no merecen **la misma auditoría**.

| Eje                            | Qué decide                          | Insumo                            | Dónde vive                                                                     |
| ------------------------------ | ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| **A — naturaleza del trabajo** | modelo                              | tipo de tarea                     | frontmatter `model:` de los agent files del kit (kit-owned, viaja en el update) |
| **B — riesgo del cambio**      | qué revisores + gate de interacción | paths tocados + señales del issue | el registry `.claude/policy/quality-gates.json` (kit-shipped) + su override     |

El eje B vive en el repo a propósito: es **calidad**. Si se configurara por máquina, la misma rama recibiría distinto escrutinio según quién la corrió.

---

## §3 Eje A — de la tarea al tier de modelo

**Criterio: verificabilidad.** ¿El resultado lo valida la máquina? Si sí (`pnpm verify`, tests, typecheck), un error sale a la luz y se corrige — el modelo caro compra poco. Si la salida es documental, el error se propaga en silencio hasta tres fases después: ahí el modelo caro sale barato.

| Tier         | Naturaleza del trabajo             | ¿Lo valida la máquina?        | Consumidores típicos en el kit                                      |
| ------------ | ---------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `extract`    | leer N fuentes → emitir estructura | parcial (contra un schema)    | los `*-context-analyst`, los analistas de intake                    |
| `implement`  | código contra un spec cerrado      | ✅ total                       | el executor de issues, el agente de mobile                          |
| `synthesize` | producir criterio nuevo            | ❌ nada                        | extractores de freeze-map, specers de pantalla full                 |
| `review`     | juicio adversarial                 | ❌ (el juicio _es_ el output)  | `architect`, `security-auditor`, `quality-engineer`, `ui-critic`, `product-owner`, `project-planner`, `skeptical-client`, `fx-factory-reviewer` |
| `mechanical` | pasos determinísticos              | ✅                             | workflows que corren en main loop, sin spawns                       |

**Mapeo tier → alias vigente:** `synthesize` → `opus` · `extract` e `implement` → `sonnet`/`opus` según el segundo criterio de abajo · **`review` → `opus`, sin excepción** · `mechanical` → el del main loop.

**`review` no baja de tier por dos razones independientes, y las dos tienen que fallar para reconsiderarlo:**

1. **Nada valida el juicio.** El output _es_ el veredicto: no hay `verify` que atrape un falso negativo. Un `MERGE` que debió ser `HOLD` entra al kit y viaja a los derivados antes de que nadie lo note. Donde no hay red, el modelo caro sale barato aunque cueste el doble por token.
2. **Un alias con allowance propio se mide contra _su_ balde, no contra el gasto total.** Es el error de encuadre que hay que evitar al comparar tiers: un tier cuyo pool es más chico que el general se agota antes aunque su consumo absoluto se vea pequeño en el total.

> 🔴 **Medir el consumo de un alias contra su PROPIO pool, nunca contra el gasto total.** Medido sobre la flota (4 repos, ventana de 5 h, 22 invocaciones de revisor): los revisores en el alias barato pesaron **15 % de los tokens** de la ventana pero quemaron **19 % de su allowance semanal**, contra 15 % del pool general que consumió todo lo demás — un pool **7.1× más chico**, así que cada token ahí cuesta 7.1× más cuota. A ese ritmo el alias barato se agotaba en ~26 h de trabajo contra ~33 h del general: **se vuelve el cuello de botella que corta el pipeline primero**, y quedarse sin revisores no es un ahorro. La regla operativa: `% del pool propio`, jamás `% del total`.

> 🔴 **Mover un agente de tier exige su medición.** Salirse del default —o cambiarlo— pide un número, no una intuición, o el mapeo deja de describir el kit y se vuelve aspiracional. Y el número tiene que ser el de la unidad que se agota: tokens por unidad **entregada** para el eje de iteración (§ siguiente), y porcentaje del **pool propio** para el eje de cuota.

### 🔴 Verificable NO implica "usa el tier barato" — el segundo criterio es la iteración

La verificabilidad dice **cuánto compra** el modelo caro en calidad. No dice cuánto **cuesta** el barato, y ahí está la trampa: un modelo menos capaz sobre una tarea verificable no falla —el `verify` lo corrige— sino que **itera más para llegar al mismo resultado**. Cada vuelta del loop es una request con el contexto completo, así que la iteración de más se paga en tokens y en reloj.

**Medido sobre la flota, tier `implement` (el executor de issues), tres repos independientes:** el tier barato consumió **~2.6× más tokens por línea entregada** y **1.8×–3.9× más tool-calls por cada 100 líneas** que el tier caro. El descuento por token quedó cancelado — costo por unidad de trabajo **empatado**, y **+34 % de reloj de pared**, porque responder más rápido por paso no compensa dar 2.3× más pasos.

```
Regla: antes de bajar un tier por precio, mide tokens por unidad ENTREGADA,
       nunca tokens por request. Un tier barato que itera más es más caro.
```

Por eso el criterio de verificabilidad tiene dos mitades y las dos mandan:

- **¿Lo valida la máquina?** → decide si el modelo caro compra calidad. Si no lo valida nada (`review`, `synthesize`), el caro sale barato aunque cueste el doble: el error se propaga en silencio y el panel es la única red.
- **¿El barato converge en las mismas vueltas?** → decide si el modelo barato ahorra algo. Solo baja el tier cuando la respuesta es sí; `extract` (leer N fuentes → llenar un template ya decidido aguas arriba) es el caso donde converge, y por eso vive ahí.

### 🔴 El eje A NO tiene registry JSON propio — y es deliberado

La taxonomía de arriba es **doctrina documental**: se lee, se aplica al decidir el `model:` de un agent, y ahí termina. No existe un `model-policy.json` porque:

- **Su único consumidor runtime es el frontmatter `model:` de los agent files.** El runtime lee ese campo directamente; un JSON paralelo no lo alimentaría.
- **Un registry sin consumidor es drift garantizado**: un archivo que nadie lee se desincroniza del comportamiento real sin que nada lo detecte.
- **Validar consistencia tier↔frontmatter entre dos archivos duplicaría el contenido**, que es justo lo que §6 prohíbe (validar por forma, nunca por igualdad contra una copia).

El consumidor mecánico de esta doctrina es el **check de frontmatter del linter del kit**: `pnpm skill:lint` escanea `.claude/agents/` y valida en pre-commit que el `model:` declarado sea un alias permitido (`fable`/`opus`/`sonnet`/`haiku`/`inherit`, nunca un ID completo) y advierte cuando un rol quality-bearing queda en `inherit`. Lo que el linter no decide es el **tier** — a qué alias mapea cada naturaleza de tarea sigue siendo criterio de autoría (esta sección), aplicado al autorar el agent.

---

## §4 Eje B — los dos registries

### §4.1 `.claude/policy/quality-gates.json` — el default del kit

| Propiedad          | Valor                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Dueño**          | el kit. Es territorio `track` (`CORE.md §5`) — para el derivado es **solo lectura**                                          |
| **Distribución**   | `.claude/policy/**` viaja en los perfiles de distribución; editarlo + release = la flota entera lo recibe en el próximo update |
| **Qué contiene**   | `panel_by_risk` (nivel `"0"`..`"4"` → panel base de revisores) + `rules` (predicado → `risk` + `require`)                    |
| **Cómo editarlo**  | en el Factory, como cualquier archivo del kit. En un derivado **nunca** — un fork local se pierde en el siguiente update     |

**Dos tipos de predicado, un solo vocabulario de matching:**

```json
{ "when": { "paths": ["src/lib/db/schema/**", "**/migrations/**"] }, "risk": 3, "require": ["security-auditor", "architect"] }
{ "when": { "signal": "destructive-migration" }, "risk": 4, "require": ["security-auditor", "architect"] }
{ "when": { "paths": [".claude/**"], "exceptPaths": [".claude/skills/pj-*/**"] }, "risk": 2, "require": ["fx-factory-reviewer"] }
```

**`exceptPaths` — el recorte de un predicado `paths`.** Campo **opcional** que sólo acompaña a `paths`; con `signal` no tiene nada que recortar y el linter lo marca como error de forma en vez de dejarlo inerte. Semántica: un archivo matchea la regla si matchea **algún** glob de `paths` y **ningún** glob de `exceptPaths`. Existe porque la alternativa —enumerar los hermanos que sí deben entrar— produce una lista que hay que recordar actualizar cada vez que nace una familia nueva: lo que quede fuera nace **sin gate y sin aviso**, que es la clase de fallo silencioso que este registry existe para cerrar.

🔴 **Un recorte NO puede relajar el piso de otra regla.** La unión de §4.1 es entre reglas (`risk = máximo` / `require = unión`), y `exceptPaths` acota **la suya y sólo la suya**: si otra regla —del kit o del override— cubre ese mismo path, sigue aplicando entera. Corolario para el override (§4.2): un derivado puede recortar **sus propias** reglas, nunca las del kit; escribir `exceptPaths` sobre un path que el kit gatea no lo libera de nada.

**Cuándo recortar, y cuándo no.** El recorte es para territorio que la doctrina del kit declara **de otro dueño** — `pj-*` es el caso canónico: `CORE.md §5` lo declara del developer y `skill:lint` lo ignora a propósito por eso mismo, así que un gate del kit sobre esos paths pone a dos mecanismos del propio kit a decidir lo contrario sobre el mismo territorio. **No** es para bajarle el costo a un área que simplemente incomoda: para eso está elegir el `risk` correcto.

- `when.paths` — globs, el mismo lenguaje que el resto del kit usa para hablar de archivos.
- `when.signal` — enum cerrado de señales estructurales que **no** son globs (§6).
- `when.pathSets` — **sólo** en la regla de `combined-auth-schema`: los dos conjuntos de globs (`auth`, `schema`) sobre los que esa señal se define. Son **datos de la regla**, no prosa: la del kit trae el piso, y el override del proyecto los **extiende por nombre de conjunto** (§4.2). En cualquier otra regla el linter lo rechaza como error de forma — sería un campo que nadie lee.

```json
{ "when": { "signal": "combined-auth-schema", "pathSets": { "auth": ["src/lib/auth/**", "…"], "schema": ["src/lib/db/schema/**", "**/migrations/**"] } }, "risk": 4, "require": ["security-auditor", "architect"] }
```

**Agregación sobre TODAS las reglas que matchean — nunca gana una sola:**

```
risk    = máximo de los `risk` que matchearon
require = unión de los `require` que matchearon  ∪  panel_by_risk[risk final]
```

Un epic que toca schema **y** auth acumula los revisores de ambos, y su riesgo es el más alto de los dos. El registry es la **única** fuente de verdad de riesgo Y de revisores: quién corre = panel base del nivel + unión de los `require`.

🔴 **Consecuencia de que los dos renglones sean independientes: el panel puede CRECER sin que el nivel se mueva.** El `risk` colapsa por máximo y el `require` acumula por unión, así que un cambio que toca por primera vez un path cuya regla trae un revisor **suma ese revisor con el mismo nivel de antes** — o incluso con uno menor, si lo que salió del diff valía más. Se dice explícito porque el consumidor que compara **dos** evaluaciones del mismo objeto (la previa contra la del diff real) no lo deduce solo: comparar niveles deja pasar al revisor nuevo, y la comparación tiene que ser sobre los **dos** renglones. El override del proyecto (§4.2) participa de la misma unión, así que el panel a comparar es siempre el efectivo kit ∪ override.

> **Dónde se decide qué hacer con eso:** aquí vive la agregación, no el momento de parar. El consumidor cableado hoy es el post-hoc de cierre de epic de [`tk-implement §4.8`](../tk-implement/SKILL.md), que declara ahí su condición de silencio en los dos renglones — esta skill no la reproduce.

### §4.2 `.claude/policy/quality-gates.project.json` — el override del proyecto

> 🔴 **El override ya se lee en runtime — por `tk-implement §4.6` (+ el micro-gate `§4.7.4`).** Escribir una regla aquí agrega escrutinio ahora: el gate de cierre de epic la agrega vía la unión kit ∪ override en cada corrida, con la agregación `risk = máximo` / `require = unión` de §4.1. Otros consumidores potenciales todavía no cablean su lectura — ver §4.3.

| Propiedad          | Valor                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Dueño**          | el proyecto derivado (dev-owned). Patrón `*.project.*`, el mismo de `.husky/pre-commit.project` y `vitest.setup.project.ts` |
| **Distribución**   | excluido de **ambos** perfiles — el update nunca lo ve, nunca lo pisa                                                   |
| **Ubicación**      | junto al default del kit, en el mismo directorio: descubrible sin ser un fork                                          |
| **Visibilidad**    | commiteado → aparece en el PR como cualquier otro cambio                                                               |

🔴 **El override solo puede endurecer, nunca relajar.** Puede subir el `risk` de un path, agregar revisores al `require`, declarar áreas sensibles que el kit genérico no conoce (pagos, PII, salud, el dominio propio del negocio), o **extender los path-sets de la señal `combined-auth-schema`** (§6) para que alcance una superficie de auth propia. No puede bajar un nivel ni quitar un revisor que el kit exige: el piso del kit es un piso.

**Extender una señal, no subir un path.** Un derivado que construye autenticación fuera de las rutas que el kit enumera —una puerta OAuth propia en `src/app/oauth/**`— tiene dos tentaciones y una salida. Declarar ese path en riesgo 4 convoca el panel completo por cada retoque de copy de la pantalla de consentimiento: una señal que suena por todo deja de ser señal (§5). Dejarlo en riesgo 3 deja fuera el caso que `combined-auth-schema` existe para atrapar: un epic que toca **esa** auth y el schema a la vez. La salida es sumar el path al conjunto de la señal, y sólo ahí:

```json
{ "when": { "signal": "combined-auth-schema", "pathSets": { "auth": ["src/app/oauth/**", "src/lib/mcp/**"] } }, "risk": 4, "require": ["security-auditor", "architect"] }
```

La semántica es la misma unión aditiva de todo lo demás: el conjunto efectivo de cada nombre es **kit ∪ override**; el override sólo suma globs, nunca quita los del kit, y un conjunto que no nombra hereda el del kit entero. Es una regla **efectiva** para el linter aunque no suba el nivel ni sume revisores — extender el alcance de la señal es la tercera forma de endurecer.

🔴 **Un glob del override que no encuentra ningún archivo produce un `warning` del linter, nunca un error.** Una regla de riesgo es una promesa de escrutinio, y es la única clase de promesa que se rompe sin síntoma: el código se mueve —un grupo de rutas de App Router no cambia una sola URL—, el glob deja de matchear, y el epic que necesitaba al revisor cierra un nivel más abajo, indistinguible de uno que no lo necesitaba. Un derivado real midió dos reglas suyas ya muertas y citadas como vigentes. Es warning porque un glob puede nombrar código que **todavía no existe** (la regla escrita antes que su feature), y sólo se comprueba el override porque el registry del kit shippea globs que legítimamente no resuelven en un checkout dado (`cli/src/**` en cualquier derivado; `**/migrations/**` en el Factory, que no mantiene migraciones por diseño). Aplica a `paths`, `exceptPaths` y `pathSets`.

**Cómo endurecer per-repo** (con el agente, nunca a mano a ciegas):

1. Identifica el área sensible del proyecto — un directorio de feature, un módulo de integración con dinero o datos personales.
2. Agrega la regla al `quality-gates.project.json`, con la misma forma que el default (`when` + `risk` + `require`). **El archivo completo debe ser un registry válido para el linter:** el schema Zod del check de registries de `skill:lint` exige `panel_by_risk` con los 5 niveles — un override recién creado nace con ese scaffold (niveles vacíos) + su `rules`, el mismo shape del ejemplo de la guía de retrofit `declare-project-sensitive-areas`. Una entrada suelta sin scaffold no pasa `pnpm skill:lint`.
   - 🔴 **Merge del `panel_by_risk`: unión aditiva por nivel.** El panel efectivo de cada nivel es kit ∪ override — el panel del override solo puede **sumar** revisores; vacío o ausente es inerte y **nunca** reemplaza al del kit. Es la misma semántica solo-endurece de `rules` y del bloque `review`, aplicada al tercer campo del shape.
3. Commitea el archivo. **El fail-safe real, hoy:** con override o sin él aplica el piso genérico del kit como mínimo — no declarar nada nunca rompe. Un módulo listado aquí queda gateado desde la próxima corrida de `/implement` (`tk-implement §4.6`/`§4.7.4`, que ya lo leen); para el resto de consumidores que todavía no cablean (§4.3), la entrada vale como declaración revisable en el PR, no como cobertura.

> **Clasificar un área como sensible es juicio de negocio, no del agente** (`CODING.md §8`). El agente **propone** la entrada; la aprobación es del developer.

### §4.3 Qué leen los consumidores hoy

🔴 **`tk-implement` lo lee en CUATRO puntos de cada corrida — tres diff-time al cerrar y uno plan-time al planear.**

**Plan-time — `Phase 2 §2.1/§2.2`:** resuelve la agregación sobre los paths que los issues del SELECTION SET **enumeran** (más las señales plan-time de §6), y con el resultado llena `sensitive_paths_authorized` del `EPIC-PLAN` **y** spawnea el panel plan-time sobre el plan antes de CP-A. Es el único consumidor que corre **antes** de que exista código.

**Diff-time — los tres del cierre:**

🔴 **`tk-implement §4.6` (+ el micro-gate `§4.7.4` y su post-hoc `§4.8`) leen el registry en cada corrida.** El gate de security audit del cierre de epic resuelve `risk` + `require` de `.claude/policy/quality-gates.json` ∪ su override contra el diff real del epic (agregación de §4.1), y el micro-gate de área sensible comparte el mismo set de paths sensibles. **El post-hoc** re-resuelve la misma agregación sobre el `git diff --name-only {start}..{end}` del **rango completo de commits del epic** — incluye la integración de `§4.5` y los fixes de `§4.7` que `§4.6` (corrido antes de esa deuda) no pudo ver; si el riesgo escala **o el panel efectivo crece sin que el nivel se mueva**, agrega los revisores faltantes y dispara un CP explícito antes de CP-B. **Editar el registry ya cambia lo que estos tres gates ejecutan.**

**Los workflows documentales se reparten en dos, y ese reparto es el estado vigente.** `/discovery`, `/design` y `/mockup` siguen **exentos** de los dos renglones, con la exención escrita en su propio `SKILL.md`. `/backlog` es hoy un **consumidor parcial y declarado**: en plan-mode resuelve el renglón `risk` sobre los archivos que su plan **enumera** —evaluación plan-time, la que esta skill describe abajo (§6)— y con ese nivel fija su presupuesto de pases de revisión; queda **exento del renglón `require`**, cuya razón vive en `tk-backlog §16` (los revisores que ese renglón convoca —`fx-factory-reviewer`, `security-auditor`, `ui-critic`— tienen por objeto el artefacto escrito, el diff o la UI renderizada; ninguno existe en una corrida de `/backlog`). En modo `greenfield` no hay plan que enumere superficie: ese modo sigue exento-fijo con su panel declarado.

Evaluarlo por lo que **produce** (markdown en `project/backlog/**`, sin paths de código bajo `src/`) resolvería riesgo 0 siempre (§6) — de ahí que el insumo sea la enumeración del plan y no el output del run. Y el **panel** sigue sin derivarse de `panel_by_risk` en ninguno de los cuatro: los niveles `"0"`/`"1"` están vacíos, así que derivar de ahí dejaría una corrida sin revisores. Lo que `/backlog` deriva es el **conteo de pases**; las composiciones por nivel son declaradas en su propio skill.

> **Nota histórica sobre el eje, para que no se relea al revés:** el predicado que `tk-backlog §8.5` tenía ("light path") recortaba por **volumen** —conteo de issues— y se retiró; no fue reemplazado por otro predicado propio, sino por la lectura de este registry. Volumen y riesgo no son el mismo eje (§5), y esta línea existe para que el cableo actual no se confunda con el regreso de aquél.

El riesgo del registry gobierna además el **cierre** de `/implement` (los cuatro puntos de lectura de esta misma sección), que es donde el renglón `require` sí se consume entero.

### §4.4 El bloque `review` — modo de revisión y política de loop

El registry declara, junto a las reglas de riesgo, **en qué modo corre cada revisor y cuándo puede parar el loop de revisión**: el bloque `review`, objeto hermano **aditivo** de `panel_by_risk` y `rules` (no cambia la forma de ninguno de los dos). Campos y valores en inglés, como todo identificador del kit:

```json
"review": {
  "default_mode": "adversarial",
  "informative": [],
  "precedence": "workflow-gates-win",
  "unevidenced_dirties": false,
  "loop_by_risk": {
    "2": { "clean_rounds": 1, "severity_floor": "wrong" }
  }
}
```

- **`default_mode: "adversarial"`** — lo que pasa cuando nadie dice nada: todo revisor del panel corre adversarial y su output gatea. El estado "revisor sin mandato" no existe.
- **`informative: [...]`** — excepciones de modo **por agente**, no por regla: un revisor listado aquí corre informativo (su output se registra, no gatea). Es por agente porque `quality-engineer` entra al panel por el piso (`panel_by_risk`), no por ninguna regla — un modo por-regla dejaría sin modo justo al revisor más usado del kit. Vacía por default.
- **`loop_by_risk["0".."4"]`** — la política de parada del loop de revisión, por nivel de riesgo: `clean_rounds` (entero ≥ 1 — cuántas rondas consecutivas sin hallazgos gateantes cierran el ciclo) + `severity_floor` (desde qué clase un hallazgo ensucia la ronda). Los valores concretos viven en el JSON: son parámetros ajustables del registry, no de esta skill.

**El orden total del piso — sin él, "en o por encima del piso" no es computable:**

- Las clases del piso son las de la tabla de triage de [`tk-implement §4.7.1`](../tk-implement/SKILL.md) — `rompe` (`breaks`), `está mal` (`wrong`) y `cosmético` (`cosmetic`) — con orden total **`breaks` > `wrong` > `cosmetic`**.
- **El piso es inclusivo:** `severity_floor: "wrong"` cuenta `wrong` **y** `breaks`; `"breaks"` cuenta solo `breaks`; `"cosmetic"` cuenta las tres. Una ronda de revisión es **sucia** si produce ≥1 hallazgo con severidad en o por encima del piso, y **limpia** si no. Endurecer el piso = bajarlo por el orden total (`breaks` → `wrong` → `cosmetic`: gatean más clases).

**`cosmetic` — qué es y por qué existe.** Un hallazgo es cosmético cuando **su fix no cambia ninguna ruta de ejecución**: copy visible, comentario, nombre interno sin consumidor fuera de su archivo, formato. La prueba es mecánica, no un adjetivo — *si revirtieras el fix, ¿cambia el color de alguna prueba o algún comportamiento observable?* Si la respuesta es sí, no es cosmético.

Existe porque con **dos** clases el piso sólo podía valer "todo" o "sólo lo que rompe", y el registry eligió `wrong` para riesgo 3-4 — donde `wrong` iba desde un finding `Medium` de seguridad hasta un comentario desactualizado. Exigir **dos rondas consecutivas sin nada de esa cubeta**, con revisores en modo `adversarial` que por mandato siempre encuentran algo, no era una regla de convergencia: el ciclo cerraba por agotamiento, no por criterio. La tercera clase le devuelve sentido al piso `wrong` — significa **forma y fondo**, ya no *todo*.

🔴 **Cosmético NO significa ignorado.** Un hallazgo `cosmetic` **se corrige igual** dentro del loop y se registra en el QC delta como cualquier otro; lo único que no hace es **exigir otra ronda de revisión**. Convergencia y corrección son ejes distintos: el ciclo cierra cuando lo único que queda es cosmético, y ese cosmético igual se arregla en el run.

🔴 **Tres cierres, para que la clase no sea una puerta de escape:** (a) `security-auditor` **nunca** emite `cosmetic` — sus `Medium`/`Low` siguen mapeando a `wrong` (`tk-implement §4.7.1`), porque un hallazgo de seguridad que "no cambia una ruta de ejecución" es precisamente el que se subestima; (b) ante duda entre `wrong` y `cosmetic`, **`wrong`** — la clase baja se emite sólo cuando la prueba de arriba se responde con certeza; (c) **en un artefacto del cerebro (`.claude/**`) la prosa ES la instrucción**, así que un cambio de redacción que altere lo que un agente hace **no** pasa la prueba: cambia una ruta de ejecución aunque no haya código de por medio. Ahí `cosmetic` queda para lo que no cambia ninguna instrucción — un typo, un enlace roto, el formato de una tabla.
- **La clase `decisión` (`decision`) queda fuera del eje.** La tercera clase de `tk-implement §4.7.3` va como fila a CP-B — el agente no puede descartarla solo — así que es ortogonal a la severidad y **nunca** decide convergencia: no cuenta como ronda limpia ni como ronda sucia; la ronda se evalúa por sus demás hallazgos.
- **La clase `mejora` (`improvement`) queda fuera del eje Y fuera del loop.** Es el hallazgo que dice *"funciona, pero podría estar mejor / hacerse de otra forma / endurecerse por si acaso"*: **no ensucia** la ronda, **no se corrige** en el run y **no es fila** en CP-B — se registra, una línea por ítem, en la sección `Observaciones (no son deuda)` del QC delta (`tk-implement §4.7.5`) y ahí termina. Existe porque un revisor en modo adversarial siempre encuentra algo, y sin esta clase todo *"podría"* se disfrazaba de `wrong` y entraba al fix-loop o a la tabla de decisión: el costo de cerrar un epic lo pagaba el ruido, no el defecto.

  **La prueba de `mejora` es mecánica — se cumplen LAS CUATRO a la vez:** (1) no hay test rojo, build roto ni AC con verificación fallida; (2) no hay comportamiento observable incorrecto hoy (nada que un usuario, un log o una prueba muestre mal); (3) no hay locus de regla incumplida (ningún AC, línea de `.claude/rules/**`, `SKILL.md`, ítem de `DOR_DOD.md` ni entrada del registry que lo exija); (4) no hay vector concreto de seguridad (ningún punto de entrada, ruta o configuración alcanzable en este repo por la que el hallazgo se explote). Falla **una** → no es `mejora`: es `está mal` (o `rompe`, si (1) falla) y se corrige.

  🔴 **Tres cierres, para que tampoco sea una puerta de escape:** (a) un `rompe` nunca se degrada a `mejora`; (b) un hallazgo de `security-auditor` con vector concreto **nunca** es `mejora` — sus `Critical`/`High` siguen gateando y sus `Medium`/`Low` con vector siguen siendo `wrong`; sólo el hardening **sin vector** (*"considera endurecer X"*, sin punto de entrada que lo alcance) cae aquí; (c) la duda entre `wrong` y `mejora` se resuelve **corriendo la consulta**: si el orquestador puede producir el locus o la consecuencia (cierre (d), promoción), es `wrong`; si tras intentarlo no hay locus ni consecuencia demostrable, es `mejora` — la duda no se resuelve por adjetivo en ninguna de las dos direcciones. `mejora` **no** es `cosmetic`: lo cosmético se corrige y no ensucia; la mejora no se corrige. Las dos clases no se confunden porque la prueba de cada una es distinta.

🔴 **Precedencia (`precedence: "workflow-gates-win"`):** el modo informativo **nunca releva un gate declarado como bloqueante por un workflow**. Ejemplo canónico: `tk-implement §4.6` bloquea CP-B ante findings `Critical`/`High` de `security-auditor` y declara que no existe tercera vía — listar `security-auditor` en `informative` no abre esa vía. Degradar un output a no-gateante aplica **solo** donde el gate lo decide el registry; un gate 🔴 escrito en un workflow gana siempre. El token del registry declara la regla; esta sección es su semántica.

**El eje de evidencia (`evidenced` / `unevidenced`) — ortogonal a la severidad.** Además de su clase (qué tan grave es lo hallado), cada hallazgo de un loop de revisión tiene una segunda propiedad: **si viene exigido por un artefacto o sólo afirmado**. Los dos valores se **derivan del texto emitido** — de la consulta que el hallazgo cita (la clase de evidencia cerrada de §7: test rojo · línea de log · resultado de una búsqueda en el código), en la ranura de consulta de la superficie que lo emite (el manifest de `/backlog` ya la lleva: `manifest.plan_review[].query_run`) — **nunca de un campo nuevo en ningún schema**: una auto-etiqueta (`falla-real` / `especulativo`) la llenaría el mismo revisor que infla el hallazgo; un artefacto no se puede inflar. El eje no mide _"¿es real?"_ sino **"¿está exigido?"**.

**La prueba del locus — la que decide el valor, aplicable sin ambigüedad:**

- La consulta es **`evidenced`** si señala **la línea que el fix va a editar**.
- Si el fix **agrega** algo en otro lugar (la consulta encontró una ausencia), califica sólo si la consulta **además nombra la regla que esa ausencia incumple**: un AC, una línea de `.claude/rules/**` o de un `SKILL.md`, un ítem de `DOR_DOD.md`, una entrada del registry.
- Sin locus → **`unevidenced`**.

**Las ocho celdas — clase × valor, completa, sin casillas ambiguas** (con el eje activo — ver «Activación» abajo):

| Celda                       | ¿Bloquea el checkpoint?                                        | ¿Ensucia la ronda?                                                        | ¿Se corrige dentro del loop?  | ¿Fila en CP-B?    |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------- | ----------------- |
| `breaks × evidenced`        | sí — los gates de su workflow no cierran con un `rompe` vivo   | sí                                                                        | sí (retry cap por ítem)       | no¹               |
| `breaks × unevidenced`      | sí — **celda inerte**: se trata igual que `evidenced` (abajo)  | sí                                                                        | sí                            | no¹               |
| `wrong × evidenced`         | no                                                             | sí                                                                        | sí                            | no¹               |
| `wrong × unevidenced`       | no                                                             | **no — la única celda que el eje cambia**                                 | **sí — se corrige igual**     | no¹               |
| `cosmetic × evidenced`      | no                                                             | según su piso (`severity_floor`) — el eje no participa                    | sí                            | no¹               |
| `cosmetic × unevidenced`    | no                                                             | según su piso — el eje no participa                                       | sí                            | no¹               |
| `decision × evidenced`      | no bloquea; su fila espera la respuesta del user               | nunca — fuera del eje de severidad                                        | no — el destino lo fija el user | **sí, siempre** |
| `decision × unevidenced`    | ídem                                                           | nunca                                                                     | no                            | **sí, siempre**   |

> ¹ Salvo la regla general de `tk-implement §4.7.3` — retry cap agotado o micro-gate — que rutea cualquier clase a CP-B; no es efecto del eje.

**La única celda efectiva es `wrong × unevidenced`, y su efecto es no ensuciar la ronda — pero corregirse igual dentro del loop.** Molde exacto de `cosmetic`: mueve **un** eje (convergencia), nunca dos. El invariante de arriba queda preservado con todas sus letras: **convergencia y corrección son ejes distintos** — que un hallazgo no exija otra ronda no significa que se ignore. Sin fila nueva en CP-B, sin retiro a Observaciones (eso es del filtro de refutación y de `mejora`, no del eje), sin tocar la regla _"el agente nunca descarta deuda por su cuenta"_.

**Las cuatro inercias — declaradas, no derivadas por analogía ni contingentes al default del registry:**

- **`breaks`** — su definición diff-time (test rojo, build roto, AC con verificación fallida citada — `tk-implement §4.7.3`) **ya es un miembro de la clase de evidencia**: aplicarle el eje contaría dos veces el mismo hecho. Un `breaks` que llegue sin consulta citable se lee conservador — cuesta la ronda; el falso negativo tolerable en la cima del orden total es cero.
- **`cosmetic`** — inerte **por declaración: el eje aplica únicamente a la clase `wrong`, en toda configuración**. No se justifica en que los cinco niveles del registry del kit usen piso `breaks`/`wrong`: §4.2 ofrece por escrito endurecer el piso _bajándolo a `cosmetic`_, y si la inercia dependiera del piso, en ese derivado el eje volvería viva la celda `cosmetic × unevidenced` y **desactivaría parte del endurecimiento que el override compró** — el default del kit recortando lo que el override subió, la inversión exacta que §4.2 prohíbe.
- **`decision`** — fuera del eje de severidad (arriba): va como fila a CP-B, nunca cuenta como ronda limpia ni sucia, y el eje de evidencia **no toca su gate**.
- **`security-auditor`** — inercia **por fuente**, con cierre propio: el (a) de abajo, escrito con su propia razón. **No** es el cierre (a) de `cosmetic` aplicado por analogía — ése sólo dice que la fuente nunca emite `cosmetic`, y **nada sobre evidencia**: no cubriría `wrong × unevidenced`, la única celda efectiva.

**Los seis cierres anti-neutralización:**

- **(a) Inercia por fuente de seguridad + extensión explícita de `precedence`.** Todo hallazgo de `security-auditor` es inerte al eje — ensucia o gatea según su clase, cite o no cite consulta — porque _un hallazgo de seguridad que no se puede señalar con un grep es precisamente el que se subestima_. Y `precedence: "workflow-gates-win"` **se extiende aquí, por escrito, al eje**: tal como el kit la enuncia cubre sólo el modo informativo, así que citarla como si ya cubriera el eje sería exactamente el error que el eje prohíbe — afirmar sin locus. La extensión declarada: **el eje nunca releva un gate 🔴 escrito en un workflow**, igual que el modo informativo no lo hace.
- **(b) Ante duda, gana `evidenced`.** El valor que descuenta convergencia (`unevidenced`) se emite sólo con la prueba del locus respondida con certeza — el espejo del cierre (b) de `cosmetic`: la duda siempre resuelve hacia el valor que cuesta una ronda, nunca hacia el que la compra.
- **(c) En un artefacto del cerebro (`.claude/**`) la prosa ES la instrucción — así que la regla incumplida siempre es citable.** Para un hallazgo sobre el cerebro no existe el descargo "no hay línea que citar": si una ausencia incumple algo, ese algo está escrito en una rule, un `SKILL.md` o el registry, y la consulta puede nombrarlo. Un hallazgo del cerebro que no cita qué incumple es `unevidenced` con todas las letras, no una víctima del formato.
- **(d) Monótono hacia arriba.** El orquestador puede **promover** `unevidenced → evidenced` — corriendo él mismo la consulta y adjuntándola al hallazgo — y **nunca degradar**. La promoción se registra junto al ítem como `unevidenced → evidenced · {la consulta corrida}`, **anotación propia, nunca dentro de `class_origin`**: este cierre reusa la forma de un mecanismo declarado para re-clasificación **de clase de severidad**, pero `class_origin` es _"la clase que emitió el revisor"_ y guardarle un valor de evidencia ampliaría su semántica en silencio. Queda resuelto: el eje **no amplía** ese campo — usa su anotación propia; la ranura concreta la abren las superficies de emisión, no esta skill.
- **(e) Una ronda sin un solo artefacto es fallida, no limpia.** Una ronda es **fallida** si **ningún** hallazgo dentro de frontera con severidad en o por encima del `severity_floor` vigente viene `evidenced`. El denominador es el **conjunto que gatearía**, no el total de hallazgos — un `cosmético` bien citado no desarma el cierre, y lo fuera de frontera tampoco cuenta. Para ese subconjunto, la promoción del cierre (d) es **obligatoria antes de contar la ronda** — trabajo acotado a los hallazgos que gatearían, nunca un barrido. Una ronda fallida no cuenta como limpia, no borra los hallazgos, y produce un caveat con el nombre del revisor. **Es una generalización, y se defiende como tal:** el precedente (`tk-backlog §12.5`, fallo de un revisor) es sobre un revisor que emite **cero** hallazgos clasificados — _"eso NO es un panel limpio"_; este cierre lo extiende a N hallazgos sin un solo artefacto porque la razón del precedente aplica idéntica: es indistinguible de un revisor que no hizo el trabajo, y produce el mismo fail-open.
- **(f) El QC delta registra `{N} hallazgos, {M} con evidencia` por ronda** — el conteo que vuelve auditable, a posteriori, un panel que afirma sin consultar.

**Dos cosas que el eje NO es** — los dos modelados que parecen naturales y están mal:

- **No es un `when.signal`** (§6): una señal clasifica _un cambio_, con momento de evaluación declarado; el eje es propiedad de _un hallazgo_. Meterlo al enum le daría un objeto que las señales no tienen.
- **No es un valor de `severity_floor`**, y el argumento es **semántico, no mecánico**: `FLOOR_STRICTNESS` (el orden del check `policy-registry` de `skill:lint`) es un `Record<_, number>` arbitrario y el código **no impide seis entradas**. Lo que no existe es un **orden total canónico sobre el producto de dos ejes**: seis enteros elegirían arbitrariamente entre pares incomparables (¿`wrong × evidenced` está por encima o por debajo de `breaks × unevidenced`?), y el `<` de la comparación solo-endurece del override dejaría de significar _"sólo endurece"_.

**`tk-backlog §12.5` conserva su regla sin cambios — y la razón vive aquí.** La inercia de `breaks` **no se propaga** a ese gate: la definición **diff-time** de `rompe` incorpora la evidencia mecánica en la propia clase (`tk-implement §4.7.3` — test rojo, build roto, AC con verificación fallida citada), y la **plan-time no** — un `rompe` de plan es una afirmación sobre el repo que puede venir con o sin consulta. Por eso §12.5 sigue distinguiendo `rompe` **con** `query_run` (STOP headless) de `rompe` **sin** (caveat), y este eje no lo toca. Sin esta línea, la inercia de `breaks` afirmaría un universal que su único consumidor gateante vigente contradice.

**Activación — el eje es inerte mientras `review.unevidenced_dirties` no exista en el registry.** La clave (`boolean`) es la palanca: presente en `false`, la celda efectiva rige (`wrong × unevidenced` no ensucia); presente en `true`, lo no evidenciado vuelve a ensuciar — el endurecimiento que un override puede comprar, y la única dirección permitida (`false → true`, nunca al revés; `undefined` hereda del kit y **nunca** se lee como `false` declarado — la misma semántica del ausente que ya aplica la comparación pareada del linter). **Ausente del registry, el eje entero es inerte:** todo `wrong` ensucia, sin regla de ronda fallida ni conteo de evidencia — un workflow que lea esta sección se comporta exactamente igual que antes. Esto cierra la ventana entre cambios: declarar el eje aquí, sin palanca en el registry y sin ranuras de consulta en las superficies de emisión, no cambia ningún comportamiento.

**Resolución completa leyendo solo el registry** — ejemplo: un cambio que toca `src/lib/auth/**` matchea la regla de riesgo 4 → riesgo `max = 4` · revisores = `require` de las reglas que matchearon ∪ `panel_by_risk["4"]` · modo de cada uno = `adversarial` salvo que aparezca en `informative` (vacía → todos adversariales) · política de loop = `loop_by_risk["4"]`. Ningún workflow consultado.

**El override también aquí solo endurece (§4.2):** puede subir `clean_rounds`, endurecer el `severity_floor` bajándolo por el orden total (`breaks` → `wrong` → `cosmetic`), **quitar** agentes de `informative` y mover `unevidenced_dirties` de `false` a `true` (lo no evidenciado vuelve a ensuciar la ronda — la palanca de «Activación», arriba); nunca agregarlos, ni bajar `default_mode` de `adversarial` a `informative`, ni bajar `clean_rounds`, ni aflojar el piso, ni regresar la palanca `true → false`. Un override que omite `unevidenced_dirties` **hereda** el valor del kit — el campo es opcional y su ausencia nunca se lee como `false` declarado. El check `policy-registry` de `pnpm skill:lint` marca cada violación como **error** — sin degradar en derivados, porque el piso del kit es un piso precisamente ahí.

### §4.5 «Saneado» — el estado de cierre verificable del loop de revisión

Un cambio está **saneado** cuando cumple las tres condiciones a la vez — cada una verificable mecánicamente, ninguna es juicio del agente:

1. **K rondas limpias sobre el piso** — `clean_rounds` rondas consecutivas de revisión sin ningún hallazgo dentro de frontera con severidad en o por encima de `severity_floor`, con K y el piso leídos de `loop_by_risk` del nivel de riesgo del cambio (§4.4).
2. **Sin ítems fuera de frontera pendientes de registrar** — todo hallazgo fuera de la frontera del epic quedó escrito en el QC delta. Registrado, no resuelto: lo de afuera no bloquea el cierre ni ensucia rondas, pero tampoco puede quedar sin destino escrito.
3. **Verificación mecánica en verde** — el pipeline mecánico del workflow que cierra (verify / build / e2e, según su escalera) pasó después del último fix aplicado.

«Saneado» es el estado que la regla de convergencia produce; la regla misma — la re-entrada de hallazgos al triage y la parada por K rondas limpias — vive en [`tk-implement §4.7.8`](../tk-implement/SKILL.md), que consume `loop_by_risk` de este registry.

---

## §5 La escala de riesgo 0-4

> La tabla es **derivada e ilustrativa**. La fuente de verdad de qué dispara qué es el registry (§4.1); si la tabla y el JSON divergen, **gana el JSON** — y esta skill se corrige.

| Riesgo | Nombre  | Señales típicas                                                                                                                   | Review — panel **aditivo** (cada nivel suma sobre el anterior)                                                                 | Gate de interacción      |
| ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **0**  | Trivial | docs-only, copy, estilo sin lógica                                                                                                | pipeline mecánico solamente (lint / typecheck / test); sin pases LLM                                                            | ninguno                  |
| **1**  | Bajo    | lógica en archivos no sensibles                                                                                                   | + lentes por path si una regla lo pide (UI → `ui-critic`); el `panel_by_risk` de este nivel está **vacío**, así que no hay QC agendado (ni, por lo tanto, nada que omitir)                               | ninguno                  |
| **2**  | Medio   | todo lo demás que viva bajo `src/` — feature nueva, refactor, UI, sin paths sensibles                                              | + `quality-engineer` **siempre**                                                                                                | STOP inline              |
| **3**  | Alto    | server actions, rutas de API, schema, migraciones, dependencia nueva, meta-foundation, decisión arquitectural sin ADR             | + owners de dominio obligatorios por path, acumulativos: `security-auditor` (superficie server-side) y/o `architect` (schema / ADR / deps) | Plan Mode                |
| **4**  | Crítico | auth, proxy-middleware, RBAC, migración destructiva, auth+schema combinados                                                       | panel completo: QC + `security-auditor` + `architect` (+ `ui-critic` si hay UI) + QC del delta y re-audit del delta tras los fixes | Plan Mode + CP explícito |

**Un solo número gobierna tres consumidores:** los revisores (panel), el presupuesto de spawns y el gate de interacción. Los tres derivan del **registry**, vía el nivel de riesgo; ninguno deriva del volumen del cambio.

- 🔴 **`CC.md §4` define "HIGH risk" como riesgo ≥3 de esta escala.** Ese es el puntero vivo: riesgo 3 o 4 entra a Plan Mode.
- **El volumen no es riesgo.** Los conteos de tamaño (archivos tocados, story points) quedan **fuera** de la escala y, con ella, fuera de los tres consumidores: un cambio grande no compra más escrutinio por ser grande. **Dos excepciones de frontera declaradas:** (1) `meta-foundation` (§6) sí es un conteo que entra a la escala, porque no mide el tamaño del cambio sino cuántas cosas dependen de él — es acoplamiento estructural, no volumen; (2) el criterio por conteo de `CC.md §4` — cambios cross-module que tocan **3+ archivos críticos** (archivo crítico = archivo con lógica ejecutable o configuración que altera comportamiento; no docs/prosa) — gatea Plan Mode por sí solo, sin pasar por la escala. Esa segunda excepción gatea **solo el gate de interacción**, nunca el panel de revisores ni el presupuesto de spawns: esos dos siguen derivando exclusivamente del nivel de riesgo del registry.
- **El nivel 2 es el piso de todo el código de la app.** Una regla de respaldo sobre `src/**` lo emite, así que nada que viva bajo `src/` cae por debajo de `quality-engineer`. La regla de UI declara riesgo 2 explícito — el mismo número que ese piso, para que su `risk` sea alcanzable por la agregación (invariante del registry: ninguna regla declara un número que el máximo no pueda producir para al menos un diff); su aporte real es `ui-critic`, sumado por la unión de `require`. Consecuencia declarada: ninguna regla del default emite riesgo 1 — **el nivel 1 se conserva en la escala para overrides de proyecto** y para reglas futuras que no toquen `src/`; no es un nivel muerto, es un nivel sin regla propia en el default.
- **El código del Factory fuera de `src/` tiene el mismo piso que el de la app.** Dos grupos con alcance real distinto y el mismo riesgo 2: `cli/src/**` + `desktop/**` (Factory-only de verdad — excluidos de ambos perfiles de distribución, sus globs no matchean nada en un derivado) y `scripts/tools/**` (**kit-wide** — viaja a cada derivado en los dos perfiles: `full` por el comodín, `core` por entradas explícitas). Sobre esa base, un **criterio operativo verificable** sube a riesgo 3 con `security-auditor`, aplicado por igual a los dos directorios: todo módulo bajo `cli/src/**` o `scripts/tools/**` que (i) lea, escriba, compare o inyecte secretos de la bóveda —del rail o de un proyecto—, o cablee esa inyección, (ii) escriba `.env.local`, (iii) conecte a una base de datos o la gestione vía API (Neon), o (iv) dé de alta usuarios. Los archivos que cumplen van cableados como paths explícitos en el registry (§4.1) — al agregar un módulo nuevo a esos directorios se re-aplica el criterio y, si cumple, se agrega su path a esa regla. **Única excepción deliberada a "paths explícitos": `cli/src/lib/vault-*.ts`**, un glob que nombra la familia de clientes de la bóveda, para que un cliente nuevo de esa familia entre solo. Hoy la familia es `vault-config.ts`, las coordenadas embebidas de la bóveda: no toca un valor, pero cambiarlas redirige cada lectura del rail, que es la misma superficie de (i). **Trade-off aceptado, sin suavizarlo:** el corte es kit-wide a propósito y sin excepciones — el glob `scripts/tools/**` captura también archivos dev-owned que caen dentro de él (p. ej. `scripts/tools/e2e.project.ts`), y el override per-repo solo puede endurecer (§4.2), así que un derivado que edite su propia configuración ahí hereda este piso de revisión **sin vía para quitárselo**.
- **El CLI tiene DOS criterios, no uno — y por razones distintas.** El de **seguridad** (arriba) sube a riesgo 3 con `security-auditor` lo que lee, escribe, compara o inyecta secretos de la bóveda (o cablea esa inyección), escribe `.env.local`, gestiona una base de datos o da de alta usuarios. El de **arquitectura** sube a riesgo 3 con `architect` lo que **decide qué recibe la flota o cómo se le escribe**: el comando de update, el swap atómico de archivos trackeados y el lockfile que define qué está trackeado. Un archivo puede caer en los dos, en uno, o en ninguno — son ejes independientes y se agregan por la unión de `require` (§4.1).

  **Por qué el segundo criterio existe, dicho sin rodeos:** las reglas y la política del cerebro están en riesgo 3 porque *"viajan en `factory update` y un error deroga comportamiento en cadena"*. **El CLI es lo que ejecuta ese update.** Por la misma lógica le toca igual o más: la doctrina la lee un agente que puede corregirse sobre la marcha; el CLI **escribe archivos y muta infraestructura** en el repo de otro. Radio de daño mayor, no menor.

  🔴 **El corte es por lo que el archivo HACE, no por el directorio.** `cli/src/**` entero en riesgo 3 convocaría al arquitecto para cambiar el texto de un mensaje de ayuda, y una señal que suena por todo deja de ser señal — el modo de falla que `§7` prohíbe. Al agregar un módulo nuevo a ese camino se re-aplica el criterio y, si decide qué recibe la flota o cómo se escribe, se agrega su path a esa regla.

- **El cerebro del kit se particiona por exclusión, no por enumeración parcial.** Doctrina y configuración always-on (`.claude/rules/**`, `.claude/policy/**`) → riesgo 3 con `architect`: viajan en `factory update` y un error deroga comportamiento en cadena. Código ejecutable del cerebro (`.claude/hooks/**`, `.husky/**`, `.github/workflows/**`) → riesgo 2 mínimo, el mismo piso que `src/**`: corre en cada commit y viaja en cada update — un hook roto **es** comportamiento roto en cadena, no doctrina. La frontera de autorización del agente (`.claude/settings.json`) → riesgo **4**: contiene el bloque `deny` (bloquea `pnpm db:push`, `vercel pull/link`, `--no-verify`, `rm -rf`); quitar una línea habilita daño irreversible en producción y ningún test lo atrapa — la misma clase de riesgo que `src/config/roles.ts`. Es un archivo puntual, no un glob: el corte no arrastra el resto de `.claude/`. **El resto del cerebro tiene piso propio: `.claude/**` → riesgo 2 con `fx-factory-reviewer`** — skills, agents, commands y `.claude/docs/` viajan en `factory update` igual que los hooks, y hasta que ese piso existió cerraban sin un solo revisor. Los cortes de arriba son endurecimientos encima de ese piso, por agregación (§4.1), no excepciones a él. **Ningún path de `.claude/` resuelve riesgo 4 salvo esa frontera de autorización.**
  - 🔴 **Trade-off declarado, igual que el de `scripts/tools/**`:** el glob `.claude/**` alcanza también la superficie **dev-owned** de un derivado (comandos propios, `quality-gates.project.json` — ya **no** `.claude/skills/pj-*/**`, que el registry exceptúa vía `exceptPaths`: el caso canónico del recorte de §4.1), que `CORE.md §5` declara territorio del developer. Ese derivado hereda el piso de revisión **sin vía para quitárselo** — el override sólo endurece (§4.2). Se acepta a cambio de que ningún cambio al cerebro cierre sin revisor; la alternativa —enumerar sólo lo kit-owned— cambia el glob por seis y se desactualiza con cada familia nueva de skills.
- 🔴 **`ui-critic` sin evidencia renderizada: el panel lo convoca igual, y su check multi-tema sale "no demostrado" — nunca Pass por omisión.** La regla de UI del registry (riesgo 2, `src/components/**` / `src/app/**/page.tsx`) suma `ui-critic` al `require`; el nivel 4 lo agrega también por `panel_by_risk`. Esa convocatoria **no** depende de que el harness [`fx-visual-evidence`](../fx-visual-evidence/SKILL.md) haya corrido: el agente audita tokens, reuse y escalas leyendo código con o sin capturas. Lo que **sí** depende del harness es el check DS4 (multi-tema), que sólo se puede demostrar mirando pantallas.
  - **El degradado es del REPORTE, no del panel.** Sin manifest, `ui-critic` marca todo hallazgo como `código leído` y reporta DS4 **no demostrado** (ni Pass ni Fail) — la cláusula está en su propia ficha, y cubre con una sola regla los tres casos: `/design` Phase 8 sobre especificaciones, un proyecto en perfil `core` (recibe la skill por el glob `fx-*`, pero no `scripts/tools/e2e-runner.ts`, que no está en `core.include`), y cualquier corrida donde no se capturó.
  - **Por qué no se recorta el spawn cuando no hay harness.** Sería el modo de falla que `§7` prohíbe en su forma más cara: un revisor que deja de correr produce **silencio**, y el silencio se lee como aprobación. Un revisor que corre y declara qué no pudo demostrar produce **información**. Mismo criterio que el skip documentado de `security-auditor` en `tk-implement §4.6`: lo que se omite se nombra, nunca se asume aprobado.
- **La escala nunca reduce la cobertura en riesgo alto.** El panel es un piso aditivo: en 3-4 iguala o endurece lo que ya corría; el único recorte real está en 0-1, que desde el piso de `.claude/**` ya no alcanza a un epic docs-only del cerebro: ése paga riesgo 2 con `fx-factory-reviewer`. El 0-1 queda para overrides de proyecto y para lo que no toque ni `src/` ni `.claude/`.

---

## §6 Las cinco señales estructurales (`when.signal`)

> 🔴 **Un `signal` tiene definición computable o momento declarado — nunca juicio libre.** Dos corridas sobre el mismo diff deben dar el mismo riesgo. Esta skill es la **fuente autoritativa** de estas definiciones: el registry cablea el nombre, aquí vive qué significa.

**Diff-time — computables del diff:**

| Señal                   | Definición                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `new-dependency`        | el diff toca `dependencies` / `devDependencies` de `package.json`, o el lockfile        |
| `destructive-migration` | el `.sql` de la migración contiene `DROP`, `TRUNCATE` o `ALTER … DROP`                  |
| `combined-auth-schema`  | intersección no vacía del diff con **ambos** path-sets: el de auth y el de schema       |

> **Path-sets de `combined-auth-schema` — viven en el registry, como datos de la regla de la señal (`when.pathSets`, §4.1), no aquí.** La señal no los hereda de las reglas por path: son un conjunto propio, con dos nombres, `auth` y `schema`. El kit declara el piso en `.claude/policy/quality-gates.json` (la regla de la señal) y el override del proyecto lo **extiende** por nombre de conjunto (§4.2): el conjunto efectivo de cada nombre es kit ∪ override. Quien evalúa la señal lee **esa unión**, nunca una lista escrita en esta skill.
>
> - **Por qué `auth` incluye `src/app/api/auth/**`** aunque la regla por path de API lo valore 3: las rutas NextAuth son superficie de auth real. Con esa definición la señal tiene efecto propio y por eso sigue en el enum: un diff que toca `src/app/api/auth/**` + schema resuelve `max(3,3)=3` por paths, y la señal lo sube a 4. Bajo la lectura estrecha (solo los path-sets de las reglas de riesgo 4 y 3 del registry) la señal habría sido inerte.
> - **Por qué son extensibles.** Un derivado que construye auth fuera de las rutas del kit —su propia puerta OAuth— tenía una señal que no podía alcanzarla, y no había forma de saberlo salvo leyendo esta skill: el registry no lo decía, el linter no lo reportaba, y el nivel resuelto se veía razonable porque otra regla lo sostenía de casualidad. Con los conjuntos en el registry, el linter los valida y avisa cuando un glob del override deja de encontrar archivos (§4.2).

**Plan-time — de la metadata declarada del backlog, no del diff:**

| Señal             | Definición                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `no-adr`          | el issue declara una decisión arquitectural sin campo ADR (el DoR ya lo pide — `DOR_DOD.md`)   |
| `meta-foundation` | el issue tiene **3 o más** dependientes en el grafo de `depends_on` — muchos issues cuelgan de él |

> **El umbral de `meta-foundation` es un parámetro ajustable: 3 dependientes, declarado aquí y nunca escondido en código** (§9). Subirlo o bajarlo se hace editando esta línea — el registry solo cablea el nombre de la señal, no su umbral.

> **Las reglas del cerebro del kit (§5) y `meta-foundation` no doble-cuentan por construcción:** las primeras son diff-time sobre paths (`.claude/rules/**`, `.claude/policy/**`, `.claude/settings.json`, …); la señal es plan-time sobre el grafo `depends_on` del backlog. Miden hechos distintos en momentos distintos — un mismo cambio puede disparar ambas, y eso es acumulación legítima de la agregación (§4.1), no un conteo repetido del mismo hecho.

**Reglas de la enumeración:**

- Una señal **sin** definición computable o declarada **no entra** al enum. "Se siente riesgoso" no es una señal.
- 🔴 **El enum y esta sección se mueven juntos.** Agregar un `signal` al registry sin definirlo aquí (o al revés) es drift documental: el workflow tendría que evaluar una señal cuyo significado no está escrito en ningún lado.

### Las reglas por `paths` también tienen momento de evaluación

La partición diff-time / plan-time **no** es exclusiva de las señales estructurales: gobierna igual a las reglas `when.paths`.

| Tipo de workflow                                             | Momento    | Qué paths se evalúan                                            |
| ------------------------------------------------------------ | ---------- | ---------------------------------------------------------------- |
| De código (implementación) — **al cerrar**                   | diff-time  | los que el `git diff` real toca                                  |
| De código (implementación) — **al planear**                  | plan-time  | los que los issues del SELECTION SET **enumeran** en su bullet `Files to create/modify` |
| Documental **cableado** — `/backlog` en plan-mode                | plan-time  | los que su **plan enumera**, no los que el run escribe. Resuelve el renglón `risk` (§4.1) y con él el presupuesto de pases de revisión de su Phase 3.5 / Phase 7; queda exento del renglón `require` (§4.3). En `greenfield` no hay plan que enumerar y el modo sigue exento-fijo |
| Documentales **exentos** — `/discovery`, `/design`, `/mockup`   | —          | ninguno: los tres declaran su exención por escrito y resuelven su panel y su presupuesto por otra vía. Esta fila describe una exención vigente, no un pendiente de cableo |

> **Los nombres de esta tabla son ilustrativos de cada TIPO; el reparto nominal vigente lo declara §4.3.** Las filas enseñan qué paths evalúa cada clase de workflow y cuándo — para eso necesitan un ejemplo con nombre. Cuál workflow está hoy en cada fila se lee en §4.3, y es ahí donde se edita cuando uno cambia de caso: dos sedes que enumeran lo mismo se separan al primer cableo, y quien entre por aquí debe saber cuál manda.

> 🔴 **Un workflow de código evalúa en los DOS momentos, no en uno.** `/implement` resuelve plan-time en Phase 2 (para autorizar y para convocar al panel sobre el plan) y diff-time al cerrar (para auditar lo que realmente quedó escrito). No se sustituyen: un plan sensato puede ejecutarse mal, y un plan flojo puede terminar sin tocar nada peligroso. La tabla anterior sólo listaba la fila diff-time y por eso se leía como si un workflow de código nunca evaluara plan-time.

🔴 **Un workflow documental evaluado por lo que escribe daría riesgo 0 siempre.** Las reglas del kit matchean globs bajo `src/`; un run de backlog escribe markdown en `project/backlog/**`, así que no matchearía ninguna regla, el nivel caería en 0, y `panel_by_risk` para el nivel 0 está vacío: cero revisores, en todas las corridas y para los cuatro workflows documentales. Es exactamente por eso que el consumidor cableado (`/backlog` en plan-mode) evalúa sobre lo que su **plan enumera**.

El criterio correcto es el inverso: **un plan que enumera archivos de `src/lib/auth/**` vale riesgo 4 aunque el run solo produzca markdown** — lo que se audita es el cambio que el artefacto ordena, no el archivo donde queda escrito.

> ✅ **La evaluación plan-time tiene dos consumidores cableados: `tk-implement` Phase 2 (§2.1/§2.2) y `tk-backlog` Phase 0.5** (que consume sólo el renglón `risk`, para su presupuesto de revisión — §4.3). CP-A resuelve el registry sobre los paths que los issues del SELECTION SET **enumeran** en su bullet `Files to create/modify`, más las señales plan-time — y con el resultado hace **dos** cosas: llena `sensitive_paths_authorized` del `EPIC-PLAN` (el campo contra el que el micro-gate de `§4.7.4` es fail-closed) y **spawnea el panel plan-time** sobre el plan, antes de pedir aprobación. `/backlog` resuelve el mismo renglón `risk` sobre la enumeración de su plan pero **no autoriza nada con él** —sólo compra escrutinio—, y por eso su fallback ante un registry ilegible es el tier completo en vez del aborto (§4.3).
>
> **Dos precisiones que el consumidor declara, y esta skill respalda:**
>
> - **Sesgo conservador del parseo.** El bullet es prosa libre, así que el predicado excluye entradas condicionales, alternativas y "verificado no editado", y **ante ambigüedad no autoriza**. La lista resultante es siempre un **subconjunto** de la que produciría el juicio humano: la mecanización sólo puede reducir lo pre-autorizado, nunca ampliarlo. Ampliarlo habría **aflojado** el fail-closed de `§4.7.4` — un path autorizado de más es un STOP menos.
> - **El panel plan-time es un subconjunto declarado del panel del registry** —los revisores cuya lente puede aplicarse a un plan, no a código que todavía no existe— **∪ lo que el override del proyecto agregue** en ese nivel. El recorte aplica al panel del kit, nunca al del proyecto (§4.2). No reduce cobertura: el panel del cierre sigue íntegro, y la dedup de `§4.6` es por **objeto revisado** (plan vs diff), no por "ya corrió en el run".
>   - 🔴 **Qué revisor entra y cuál no, con la razón de cada uno, vive en la tabla de [`tk-implement §2.2`](../tk-implement/SKILL.md) — ése es su SSOT.** Aquí se declara el **criterio**; la lista no se recopia. Re-enumerarla es lo que ya produjo divergencia: esta sección quedó en cuatro revisores mientras la tabla del consumidor crecía a cinco. Apuntar en vez de copiar es lo que §10 exige al cerrar cualquier edición de esta política.
>
> 🔴 **`no-adr` sigue declarada pero NO es computable hoy.** Su definición apunta a un "campo ADR" del issue que **no existe** en el shape del kit (verificado: sin ocurrencias en los templates ni la metodología de `tk-backlog`, y sin directorio de ADRs en el repo). No se retira —es, con `meta-foundation`, una de las dos únicas reglas que convocan a `architect` por decisión arquitectural— pero mientras tanto ese eje lo sostiene el **piso en prosa** de `tk-implement §2.2`, que sobrevive como aditivo. Crear el campo no es una línea: exige decidir de dónde sale, qué issues lo requieren y cuáles no, cuál es la señal que lo decide y quién lo llena — trabajo que toca `/backlog` y `/discovery`, con spec propio.
>
> `meta-foundation`, en cambio, **sí** se evalúa: el grafo `depends_on` existe en cada issue.

---

## §7 Los cinco principios de la doctrina de revisión

1. **El skip siempre se narra y se documenta.** Omitir un pase es legítimo; omitirlo en silencio no. Va una línea plain al usuario y una nota en el Implementation Evidence.
2. **El scope del pase es el diff del epic, nunca el repo completo.** Un revisor que audita todo el repo diluye su atención y encarece el pase sin cubrir mejor el cambio.
3. **Tras los fixes, la re-verificación es sobre el delta.** Re-correr el pase completo cuesta lo mismo que el original para confirmar un cambio pequeño; el delta es barato y es lo único que cambió.
4. **Independencia del veredicto: quien aplica los fixes no emite el dictamen.** Por eso la re-verificación del delta es un pase nuevo y no una auto-declaración del que arregló.
5. **Reintentos N=3 por ítem, sin tope global de iteraciones.** El límite acota cada ítem que no cede; el loop sigue con los demás en vez de abortar el cierre completo.

### Refutación de deuda al cierre — las cinco preguntas

Antes de que un pendiente de deuda fuera de frontera llegue a la tabla de decisión de un cierre de epic, se le intenta **refutar**. El mandato es literal: **refuta la afirmación, no diseñes el remedio** — el revisor toca el repo lo necesario para saber si el defecto existe y cuánto pesa; no escribe criterios de aceptación, no elige dónde vive el fix, no propone arquitectura. Eso sigue siendo del backlog y de la implementación, donde hay contexto real para decidirlo.

**Dimensionar no es diseñar, y la diferencia es el corte de esta sección.** El revisor sí responde *cuánto cuesta el arreglo* — pero como un recuento de condiciones observables (quinta pregunta, abajo), nunca como un plan. Sigue sin escribir criterios de aceptación, sin elegir dónde vive el fix y sin proponer arquitectura. El motivo de que la pregunta exista: **quien recomienda el destino del ítem tiene que calibrar por el costo del fix**, y hasta que este dato viajó con el ítem, no lo tenía — el resultado inevitable era el default conservador, que manda a issue cosas de cinco líneas.

**Cinco preguntas — cuatro sobre la afirmación, la quinta sobre su tamaño:**

| Pregunta                           | Qué la contesta                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| ¿Existe?                            | una clase de evidencia del conjunto cerrado (abajo)                          |
| ¿Es nuevo?                          | búsqueda en el backlog activo — ¿ya lo posee un epic o issue abierto?        |
| ¿Importa?                           | qué se rompe si no se arregla, y para quién                                  |
| ¿Qué prioridad, y por qué ésa?      | defendida contra las asimetrías reales del proyecto                          |
| ¿Cuánto cuesta el fix?              | un tier `S`/`M`/`L` del corte cerrado de abajo — nunca horas, nunca un plan  |

**La quinta pregunta — corte cerrado en tres tiers.** El tier no es una estimación de esfuerzo: es el recuento de tres condiciones verificables contra el repo.

| Tier  | Cuándo                                                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S** | **Las tres** se cumplen: el arreglo cabe en **pocas líneas de uno o dos archivos** · no exige elegir entre caminos con consecuencias distintas · **es verificable con lo que ya existe** (la suite, un linter, o la lectura directa del diff) |
| **M** | Falla **al menos una** de las tres de `S` **y no es alcance nuevo**: se extiende a varios archivos, pide una decisión que cabe en una línea (dos nombres, dos ubicaciones, dos defaults — se elige y se implementa en el run), exige escribir la prueba que falta (un test, un e2e, una migración — **se construye en el run**), o pasa por una de las tres confirmaciones de un clic (abajo) |
| **L** | **Es alcance nuevo — y sólo eso:** una pantalla, una entidad, un flujo o un endpoint que hoy no existe. No es arreglar, es construir, y merece su spec. Ninguna otra propiedad del fix lo vuelve `L`: ni tocar el schema, ni agregar una dependencia, ni reescribir un AC, ni tener que construir la prueba |

🔴 **Las tres confirmaciones de un clic — lo delicado se autoriza dentro del flujo, nunca se agenda.** Hay tres cosas que un fix chico puede exigir y que el agente **no decide solo**, porque la autoridad es de negocio (`CODING.md §8`: el modelo de datos no se inventa) o del harness. Cada una ya tiene su compuerta, de una pregunta, y **la respuesta "sí" cierra el fix en el run**; ninguna abre un issue por sí misma:

| Qué exige el fix                                | Compuerta que ya existe                                                                                        | Con "sí"                                   | Con "no"                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| Tocar schema, auth u otra área sensible del registry (§4) que el plan no autorizó | el micro-gate de área sensible (`tk-implement §4.7.4`), fail-closed                                            | se aplica en el run                        | va a issue **porque el user lo mandó**, no por tamaño |
| Agregar una dependencia                         | el gate ASK del harness sobre `pnpm add` (`CODING.md §7`) — el prompt ES la autorización                        | se instala y se aplica                     | el ítem va a la tabla de CP-B con esa razón     |
| Reescribir un AC del epic que estaba mal escrito | una pregunta de una línea: *"el AC decía X; en realidad debe decir Y — ¿lo reescribo?"* (estructurada, `CC.md §3`) | se edita el issue y queda en el QC delta   | el AC queda como estaba y el ítem va a la tabla |

Etiquetar cualquiera de estas tres como `L` gatearía dos veces la misma decisión y mandaría a issue un fix de cinco líneas: la fricción exacta que este corte existe para eliminar. **Headless:** las tres son fail-closed (sin quién responda, el ítem va a issue con la causa) — el mismo comportamiento del micro-gate hoy.

🔴 **`S` y `M` son "chico", y lo chico se arregla en el run — sin preguntar, salvo las tres confirmaciones de un clic.** El tier no decide si se arregla; decide **cómo se cierra**: `S`/`M` entran al fix-loop igual que un `está mal` de dentro de frontera, con su retry cap; si el fix exige una prueba que no existe, **el loop la escribe** y la pone verde (o agota el cap y escala por esa vía, nunca por etiqueta). `L` es la **única** puerta hacia un issue, y no basta: un `L` va a issue **sólo con consecuencia concreta** (abajo). Un `L` sin consecuencia es una observación y se registra, nunca se agenda.

**Consecuencia concreta — conjunto cerrado, el mismo que responde "¿importa?":** algo se rompe para alguien (un flujo que el usuario no puede completar, un dato que se muestra mal) · un hueco de seguridad **con vector** alcanzable en este repo · pérdida o corrupción de datos · una regla del kit incumplida, **con la línea citada** (AC, `.claude/rules/**`, `SKILL.md`, `DOR_DOD.md`, registry). *"Sería más limpio"*, *"podría escalar mal"*, *"convendría endurecer"* no están en el conjunto: son `mejora` (§4.4) y van a Observaciones.

🔴 **Las tres condiciones miden el FIX — nunca dónde vive el defecto ni si el epic tocó ese archivo.** La frontera se mide aparte y decide **quién lo registra y dónde** (`tk-implement §4.7.2`), nunca si se arregla; si además entrara aquí, se contaría **dos veces** y ningún ítem fuera de frontera podría llegar jamás a `S` — que es exactamente lo contrario de lo que la calibración por costo existe para lograr. Un cambio de una palabra en un frontmatter es `S` esté donde esté, y lo es porque `skill:lint` lo verifica.

> **Corregido con evidencia de un run real (EPIC-12, n=13).** La redacción anterior pedía que el arreglo cupiera "en archivos que el epic ya tocó" y que "la verificación del run lo cubriera entero". Fuera de frontera fallaba la primera **por definición**, y toda prosa fallaba la segunda porque no hay tests de prosa: dos fallas → `L` mecánico. En un repo cuyo trabajo *es* prosa del cerebro, eso colapsó 9 de 13 filas a `L`, incluida una cuyo impacto declarado era *"drift de una palabra"* — y dejó dos ítems casi idénticos en tiers distintos (`S` y `L`), la señal de que el criterio se contradecía y cada aplicación resolvía la contradicción por su cuenta.

🔴 **El default conservador vive en el dato, no en la recomendación.** Un revisor que no puede responder las condiciones emite **L** y declara **qué es lo que habría que construir** (la pantalla, la entidad, el flujo, el endpoint) — "no pude determinar" ya no basta: un `L` sin lo-que-se-construye nombrado es un dato inválido y se pide de nuevo. Lo que nunca ocurre es que la falta del dato se resuelva más tarde, en la recomendación, adivinando — que es como se llegaba a mandar a issue un fix de cinco líneas.

**Clase de evidencia — conjunto cerrado, nunca la impresión de un agente:** test rojo · línea de log · resultado de una búsqueda en el código. Nada más califica. Un ítem sostenido solo en "parece que" no pasa la primera pregunta. Ampliar este conjunto es una decisión de esta skill, no algo que cada workflow interprete a su manera.

**Regla de lectura de la clase — una búsqueda de cero hits evidencia una AUSENCIA, no un defecto.** El tercer miembro del conjunto (resultado de una búsqueda en el código) incluye la búsqueda que no encuentra nada — pero lo que ese resultado prueba es que algo _no está_, y una ausencia sólo es un defecto si algo la exige. Por eso califica **sólo acompañada del locus de la regla incumplida** (la prueba del locus de §4.4: un AC, una línea de `.claude/rules/**` o de un `SKILL.md`, un ítem de `DOR_DOD.md`, una entrada del registry). El conjunto **no se amplía** con esto — sigue siendo test rojo · línea de log · resultado de una búsqueda; se precisa cómo se lee.

**La refutación re-deriva el alcance, no revisa el texto del ítem.** Responder "¿existe?" y "¿qué prioridad?" contra archivos reales del repo —no contra la prosa que trae el ítem— es lo único que distingue haber buscado de haber copiado la afirmación cuando el alcance declarado ya era correcto. El sobreviviente registra **la consulta que corrió** (el grep, el test, el comando), no solo lo que encontró.

**Fallar cualquiera de las tres primeras preguntas RETIRA el ítem de la tabla — al registro, nunca al olvido.** Un ítem que no existe, que ya tiene dueño, o que no tiene consecuencia no es una decisión pendiente: es una observación, y presentarla como fila para que alguien confirme el descarte es la fricción exacta que el filtro existe para eliminar. Va con su motivo y la consulta que lo refutó a la sección `Observaciones (no son deuda)` del QC delta — tracked, con timestamp — y quien decide ve **el conteo** y puede **rescatar cualquiera por nombre**. Retirar no es descartar: descartar borra; retirar registra donde se puede volver a mirar. La mecánica concreta de qué pasa después —dónde aterriza el registro, cómo se rescata— vive en el workflow que consume esta doctrina, no aquí (`tk-implement §4.7.2.1`/`§CP-B` es el consumidor actual).

---

## §8 Reconciliación con las escalas existentes — las tres conviven, no se fusionan

### §8.1 Riesgo → R-tier de `quality-engineer`

Los R-tiers de `quality-engineer` miden **profundidad del pipeline de verificación**; la escala 0-4 mide **riesgo del cambio**. La escala **invoca** al R-tier:

| Riesgo | R-tier que corre | Nota                                                                                                   |
| ------ | ---------------- | -------------------------------------------------------------------------------------------------------- |
| 0-1    | ninguno          | el `panel_by_risk` de estos niveles está vacío: no hay QC agendado (§5)                                |
| 2      | **R1**           | DoD del issue/epic + verificación de AC                                                                |
| 3-4    | **R2**           | R1 + build + security scan + deps                                                                      |
| —      | **R3**           | exclusivo de pre-release (`/preflight`) — la escala de riesgo **nunca** lo invoca                      |
| —      | **R0**           | es el piso de tests per-issue del DoD; corre por definición del DoD, no porque la escala lo pida       |

La discriminación entre riesgo 3 y 4 **no** la aporta el R-tier (ambos corren R2): la aporta el panel de revisores más el QC/re-audit del delta.

> El mapeo es prosa de esta skill, no un campo nuevo en el frontmatter de `quality-engineer`. No se inventan campos que ningún consumidor lee (`fx-skill-author §5`).

### §8.2 Las escalas de severidad son ortogonales

`Critical / High / Medium / Low` de `security-auditor` y `BLOCKER / HIGH / MEDIUM / LOW` de `quality-engineer` clasifican **lo encontrado**, no **lo cambiado**. Son ejes distintos del riesgo y quedan intactos: un cambio de riesgo 1 puede producir un hallazgo Critical, y uno de riesgo 4 puede salir limpio.

---

## §9 La tensión de doctrina, resuelta

El kit sostiene que sus umbrales son **"ajustables aquí, nunca escondidos en código"** (los umbrales de plan y los límites de lote de [`tk-implement`](../tk-implement/SKILL.md) Phase 2 y Phase 3). Mover el inventario de paths y los niveles de riesgo a un registry JSON **no viola ese principio** — lo cumple por otra vía:

| Lo que el principio prohíbe                                              | Lo que un registry declarativo **con skill de referencia** hace                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Enterrar el número en un `.ts` de implementación, donde solo lo ve quien lee el código | Vive en un archivo declarativo de 40 líneas, sin lógica, que se lee de un vistazo             |
| Que ajustarlo exija tocar código y entender su flujo                     | Se ajusta editando datos; el override del proyecto ni siquiera toca territorio del kit        |
| Que el criterio quede implícito en el comportamiento                      | El criterio está escrito **aquí**, con owner y read-only-ness declarados, y los `SKILL.md` apuntan |

La condición no es que el número viva en un `SKILL.md`: es que sea **visible y editable**, y que exista un lugar donde el criterio esté explicado. Un registry sin su skill de referencia sí sería un número escondido; con ella, es lo contrario. Es el mismo molde que [`tk-provision`](../tk-provision/SKILL.md) usa con su archivo de state: el workflow declara quién es el dueño, lo lee, lo narra y no lo edita a mano.

---

## §10 Checks antes de tocar la política

- [ ] ¿Agregaste o cambiaste un `signal`? → su definición computable/declarada está en §6, con el mismo nombre exacto del enum. Si se define sobre path-sets, los globs van en `when.pathSets` de su regla del registry (§4.1), no en prosa.
- [ ] ¿Movió o renombró código que un glob del override cubría? → `pnpm skill:lint` avisa del glob muerto (§4.2); actualízalo, no lo ignores.
- [ ] ¿Agregaste una regla al registry del kit? → cada revisor de `require` existe como agent en `.claude/agents/`.
- [ ] ¿El `risk` está en 0-4 y el `panel_by_risk` cubre el nivel que la regla puede alcanzar?
- [ ] ¿La regla del proyecto **endurece**? Si baja un nivel o quita un revisor del kit, no va (§4.2).
- [ ] ¿Estás editando el registry del kit dentro de un derivado? → no. Va en el override `*.project.json`.
- [ ] ¿Cambió el criterio y no la lista? → se documenta aquí; los `SKILL.md` de los workflows apuntan, no recopian.

---

## §11 Boundary

| Si vas a…                                                        | Usa en su lugar…                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Ejecutar el gate de security audit o el cierre de epic           | [`tk-implement`](../tk-implement/SKILL.md)                                |
| Ejecutar las fases y el presupuesto de spawns de un run de backlog | [`tk-backlog`](../tk-backlog/SKILL.md)                                    |
| Autorar un workflow con fases y gates                            | [`fx-workflow-authoring`](../fx-workflow-authoring/SKILL.md)              |
| Crear o refactorizar una skill declarativa                       | [`fx-skill-author`](../fx-skill-author/SKILL.md)                          |
| Modelar un registry propio en la app (roles, navegación, flags)  | [`kb-ssot-registries`](../kb-ssot-registries/SKILL.md)                    |
| Editar el kit desde un derivado sin perderlo en el próximo update | `CORE.md §5` (frontera kit ↔ derivado) + el override `*.project.json` (§4.2) |

---

_TimeKast Factory — fx-execution-policy (política de ejecución: modelo y riesgo, factory-internal)_

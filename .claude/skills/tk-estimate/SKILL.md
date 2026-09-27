---
name: tk-estimate
description: Documentation-family workflow that prices a project internally via story points (Fibonacci 1-8, aligned with tk-backlog) — direction fee + Factory capacity as a visible line + a finite risk-coverage pool, always as Opt/Real/Cons MXN ranges with a single project floor. Reads the backlog if present, else the discovery brief, else runs a quick scoping. Produces project/planning/00b_INTERNAL_ESTIMATE.md, never shown to the client as-is. Primary invocation is `/estimate [refresh]`.
family: documentation
model: opus
parallelism_unit: none
concurrency_cap: 1
auditor_step: false
last-verified: 2026-09-18
user-invocable: false
---

# tk-estimate — `/estimate` Workflow Skill

> Cotización **interna** por story points. Responde "¿cuánto cobramos por esto y por qué?" con rangos
> auditables, a partir de lo que el proyecto ya tiene (backlog > brief > scoping rápido).
>
> **Slash command:** `/estimate [refresh]` (thin wrapper en `.claude/commands/estimate.md`).
>
> **Workflow on-demand** (como `/proposal`), normalmente antes de `/proposal`. Puede correr en cualquier
> punto: con backlog es más preciso; sin backlog degrada la confianza, no se bloquea.

---

## 1. Qué es interno y qué llega al cliente

El archivo `00b_INTERNAL_ESTIMATE.md` es **interno completo**: puntos, tarifa por punto, score de riesgo,
cobertura, costo de tokens y supuestos. Nada de eso se muestra al cliente.

Lo único que cruza a `/proposal` son las **cifras de oferta** de §1 — Precio Total (Realista y
Conservador), plan de soporte mensual e infraestructura mensual — y solo después de que quien cotiza las
confirma en el CP1 de `/proposal`. El desglose (§3-§11) nunca sale.

---

## 2. Principio rector

> **La Factory ejecuta; quien dirige el proyecto especifica, revisa y responde por el resultado.**

- **Un story point NO es "horas de implementación".** Mide (a) cuánta ambigüedad hay que resolver antes de
  soltarle la tarea a un agente, (b) cuántas superficies de QA/validación humana requiere, y (c) cuánto
  riesgo de retrabajo o iteración con el cliente implica.
- El tiempo de dirección es el insumo escaso — se cobra vía la **tarifa por punto**.
- La ejecución (tokens / sesiones de agente) se cobra como **Capacidad de Factory**: línea propia y
  visible. No es salida de caja, pero es capacidad de cómputo que el cliente recibe. Nunca se regala ni se
  absorbe en la tarifa de dirección.

**Decisiones cerradas — no se re-abren en cada estimate:**

- La Capacidad de Factory **sí se cobra**, como línea propia.
- **Piso único** (`precio_minimo_proyecto_mxn`) para modo `solo` y modo `equipo`. Vender al piso en modo
  equipo puede quedar bajo el costo de entrega (`costo_referencia_xs_equipo_mxn`): es decisión comercial
  deliberada y se declara en el output, no se corrige subiendo el precio.

**Interno · iterable · honesto sobre la incertidumbre.** Nunca un valor único — siempre Optimista /
Realista / Conservador. Todas las variables viven en §10 del output: editables + `/estimate refresh` sin
re-puntuar.

---

## 3. Escala de complejidad (Fibonacci — igual que tk-backlog)

| Puntos | Qué significa |
| :----: | ------------- |
| **1** | Requerimiento cristalino, sin ambigüedad ni integración externa. Un agente lo resuelve en una pasada. QA trivial. |
| **2** | Claro, con 1 variable de decisión menor (copy, validación simple). QA de 1 flujo. |
| **3** | Una decisión chica de diseño/arquitectura, o toca 2 capas (front+back). QA de varios casos. |
| **5** | Ambigüedad real a resolver con el cliente, o integra un servicio externo (API, pasarela, auth). Alto riesgo de iteración. |
| **8** | Múltiples desconocidos, cruza 3+ dominios o requiere spike. **Candidato a dividirse** — flag. |

Si un issue no trae story points, asignarlos con esta tabla **mostrando el razonamiento** (por qué 5 y no
3). Nunca cotizar sin pasar por esta clasificación.

### Regla de lote — puntuar por ambigüedad, nunca por volumen

Hay issues cuya salida es un **conjunto de datos**, no un comportamiento: se verifican con conteos,
reconciliación contra la fuente y una muestra. La fila 12,000 no cuesta más que la fila 30.

**Disparadores:** importar · indexar · migrar · reconstruir · extraer · sincronizar · backfill · seed masivo ·
exportar en bloque.

Un issue de lote se puntúa por **la ambigüedad de su formato de origen y de sus reglas de negocio**:

| Issue | Mal puntuado | Bien puntuado |
| ----- | :----------: | :-----------: |
| Backfill de 12,000 registros, formato conocido, una regla | 8 | **3** |
| Backfill de 200 registros, Excel del cliente sin ver, 4 reglas | 3 | **8** |

> ⚠️ **Guard:** la regla solo puede **bajar** un puntaje, nunca subirlo. En el checkpoint (Phase 5) se
> listan los issues de lote con el puntaje que tendrían sin la regla.

---

## 4. Fórmula de precio

```
Puntos_total(e)   = Σ puntos_issue(e)                       # e = opt / real / cons

Precio_Dirección  = Puntos_total × tarifa_por_punto_mxn
Capacidad_Factory = f(Puntos_total)                          # modo calibrated (abajo)
Capacidad_CONS    = f(Puntos_CONS × 1.15)                    # colchón de tokens solo en Cons
Precio_Total      = (precio_base_mxn + Precio_Dirección + Capacidad_Factory) × (1 + cobertura_pct)
Precio_Total      = max(Precio_Total, precio_minimo_proyecto_mxn)

Semanas           = Puntos_total / velocity_pts_semana
```

**Capacidad de Factory — modo `calibrated` (default):**

```
horas_dirigidas   = Puntos_total / densidad_pts_por_hora_dirigida
Capacidad_Factory = horas_dirigidas × costo_factory_mxn_por_hora_dirigida
```

**Modo `interim`** (sin horas medidas): cadena puntos → token-units → tokens → MXN con
`token_units_por_punto` y las tablas de `factory_cost_model`. Un token-unit es una **unidad interna de
cómputo** (≈ consumo de 1 h de sesión de agente) — NO son horas humanas ni timeline, y NO entran a
Precio_Dirección.

**Tarifa por punto:** `tarifa_hora_dirigida_objetivo_mxn / densidad`. Esa hora objetivo es un **piso**:
cuando la densidad sube (el pipeline acelera), la tarifa por punto **no** se recalcula hacia abajo — la
hora implícita sube, y eso es correcto. Recalcularla regalaría la ganancia de productividad al cliente.

**Tiers de tamaño:** `tiers_reference` del rates (solo etiqueta y sanity-check; nunca fuente del cálculo).

### 4.1 Riesgo — cobertura como bolsa finita

Un multiplicador sube el precio y nadie puede auditar después si estuvo bien. Una **bolsa de cobertura** se
consume, se registra, y al cerrar el proyecto dice si el riesgo estaba bien medido. Reemplaza a los
multiplicadores (`timeline_corto`, `premium_visual`) — nunca se aplican los dos.

**Score — 11 señales. Cada una exige la CITA TEXTUAL de la fuente que la justifica; sin cita no se marca.**

| Señal | Pts | Cómo detectarla |
| ----- | :-: | --------------- |
| Stack nueva para el equipo | 20 | tecnología fuera del stack del kit |
| Spec ambigua / reglas abiertas | 15 | preguntas sin resolver, features de una línea, sin criterios de aceptación |
| Alcance diferido dentro del V1 | 15 | features confirmadas cuyo alcance sigue sin definir |
| Integración sin SDK o contrato no probado | 15 | API pública, scraping, servicio propio sin producción cruzada |
| Brownfield / legacy a respetar | 15 | existe un sistema que condiciona |
| Timeline comprometido < 8 semanas | 15 | deadline en firme con el cliente |
| Dominio regulado | 10 | fiscal, salud, legal, financiero |
| UI premium alta | 10 | identidad visual fuerte o interacción no estándar |
| Real-time / colaborativo | 10 | concurrencia, simultaneidad |
| Duración > 3 meses | 10 | sale del cálculo de calendario |
| Cliente sin stakeholder técnico | 10 | nadie del lado del cliente decide técnicamente |

Del score sale `cobertura_pct` con la tabla `cobertura` del rates (10 / 20 / 30 / 40%). **El 10% es piso,
no cero.**

- **Cubre:** lo que no se vio al estimar y el scope adicional chico que se deje entrar sin re-cotizar.
- **No cubre:** módulos nuevos, features fuera de alcance, cambios de arquitectura — se cotizan aparte,
  aunque sean chicos.
- **Disciplina:** se lleva la cuenta de lo consumido issue por issue; un módulo nuevo nunca sale de la
  bolsa. Si esa disciplina no se va a sostener, la cobertura correcta es 40% — recargo por trabajar sin
  control de alcance.

> La cobertura es la palanca comercial: se puede mover. Lo que no se vale es bajarla y después aceptar
> scope adicional gratis.

### 4.2 Rangos Opt / Real / Cons

Cada issue lleva su punto (`pts_real`). Los marcados **inciertos** reciben además `pts_min`/`pts_max`
(nivel Fibonacci inferior/superior). No inciertos: min = real = max.

**Banda mínima:** si ningún issue quedó incierto, aplicar +1 nivel en `pts_max` (y −1 en `pts_min`, piso 1)
al `max(1, ⌈20%⌉)` de los issues de mayor puntaje. Nunca más.

**Invariante:** `Opt ≤ Real < Cons`. Si `Opt = Real` (el piso Fibonacci impide bajar), declararlo en §9.

### 4.3 Puente al modelo de compensación por roles

Cuando el proyecto se cotiza también con la hoja de compensación (`compensacion:` del rates), el output
declara:

```
curado_dias      = Puntos_total / sp_por_dia_activo
tamano_hoja      = por días: XS≤5 · S≤8 · M≤13 · L≤21 · XL≤32 · Épico>32
dias_calendario  = curado_dias / dias_activos_por_dia_habil   # para el timeline al cliente, NO para pagar
```

1. **Curado se captura en días de TRABAJO REAL**, no de calendario (solo ~20-31% de los días hábiles tiene
   trabajo). Capturar calendario multiplica el precio por ~4.
2. **Un "día" de la hoja son 1.3-3 horas dirigidas**, no 8.
3. **Los dos modelos convergen solo arriba de ~285 puntos.** Debajo, la hoja sale más cara (sus fases fijas
   pesan más que el curado); arriba, más barata. Curva esperada de `hoja ÷ puntos`:

   | Puntos | 75 | 100 | 150 | 200 | 250 | 285 | 350 | 475 |
   | ------ | -: | --: | --: | --: | --: | --: | --: | --: |
   | ratio | 1.75× | 1.49× | 1.24× | 1.12× | 1.04× | 1.00× | 0.96× | 0.90× |

`modo: solo` usa el modelo por puntos puro; `modo: equipo` suma vendedor, finder y PM. El piso es el mismo
en los dos.

**Candado:** el checkpoint de Phase 5 muestra desglose por epic + tarifa por punto implícita, y es
obligatorio parar ahí cuando la divergencia entre los dos modelos se aparta **más de 25 puntos
porcentuales** de la curva esperada para ese tamaño. Fuera de la curva significa que los puntos o el curado
están mal capturados, no que el precio esté alto.

### 4.4 Timeline

`velocity_pts_semana` es el throughput de la Factory bajo la capacidad actual (dirección + agentes), NO la
duración del punto. El output lo declara como estimación de calendario de confianza media/baja.

---

## 5. Tarifas — defaults del kit + override del host

Resolución **campo por campo** (el primero que tenga el campo gana):

1. `~/.claude/estimate-rates.yml` — override del host (fuera del repo).
2. `~/.agent/config/estimate-rates.yml` — ubicación legacy del override; se sigue leyendo.
3. `rates.defaults.yml` (junto a este SKILL) — defaults calibrados que viajan con el kit.

> 🔴 El kit **no** lleva precedentes ni nombres de clientes. Si el override del host trae `interim_anchors`
> (lo cobrado antes), se usan solo para responder "¿qué hemos cobrado antes?" — **nunca** como umbral de
> precio ni se copian al output.

**Gates:**

- **E0:** si algún campo de `pricing` resuelve a `PENDIENTE` → 🛑 STOP: pedir el valor, escribirlo en el
  override del host (`~/.claude/estimate-rates.yml`), continuar. **Nunca inventar montos.**
- **E0 vigencia:** `last_confirmed` > 90 días → pedir confirmación (no STOP).
- **E1 (refresh):** requiere §10 del output con `schema: story_points_v1`; no depende de los rates — si
  difieren, solo WARN.

**Recalibrar** (manual, nunca automático): con ≥1 proyecto que tenga backlog puntuado y timelog medido
(`docs/timelog/*.csv`, filas `medido`/`medido_cc`), recalcular `densidad_pts_por_hora_dirigida`,
`velocity_pts_semana` y `sp_por_dia_activo`; `costo_factory_mxn_por_hora_dirigida` sale del consumo real
(`npx @timekast/factory usage`). Los resultados van al override del host; los defaults del kit se suben en
un PR al Factory cuando la medición es estable.

---

## 6. Fuentes (backlog > brief > scoping)

| Fuente | Condición | Confianza base |
| ------ | --------- | :------------: |
| **A — Backlog** | `project/backlog/` con issues y `> **Story Points:**` | high |
| **B — Brief** | `project/planning/00_DISCOVERY_BRIEF.md` | medium |
| **C — Scoping rápido** | nada de lo anterior — sesión interactiva con quien cotiza | low + WARN |

§2 del output declara la fuente.

---

## 7. Modos

| Modo | Cuándo |
| ---- | ------ |
| **E0** (default) | Primera vez o regenerar: puntúa desde la fuente y genera el output |
| **E1** — `refresh` | Existe `00b_INTERNAL_ESTIMATE.md` con `schema: story_points_v1`: recalcula desde §3 + §10 **sin re-puntuar** |

---

## 8. Proceso (E0)

```
Phase 0 — Mode detection + gates (tarifas resueltas, vigencia, fuente)
Phase 1 — Source intake (backlog / brief / scoping)
Phase 2 — Scoring (validar/asignar puntos con razonamiento; regla de lote; flag 8s; marcar inciertos)
Phase 3 — Calculation (dirección + capacidad → score de riesgo con citas → cobertura → piso → timeline → rangos)
Phase 4 — Checkpoint (clasificación + lote + score con citas + cobertura + rangos + exclusiones + candado)
Phase 5 — Write project/planning/00b_INTERNAL_ESTIMATE.md desde templates/ESTIMATE.template.md
Phase 6 — CP-commit (GIT.md §3.5) — default recomendado: 1. Nada (queda local)
```

**Checkpoint (Phase 4)** — antes de escribir, en lenguaje plano (`CC.md §3`): total Realista y rango, qué
lo mueve (top 3 epics por puntos), señales de riesgo marcadas con su cita, issues de lote, exclusiones de
scope y — si aplica — el candado del puente. Opciones: `1. Escribir el estimate` · `2. Ajustar puntos /
señales` · `3. Cancelar`.

**CP-commit (Phase 6):** el estimate trae montos y márgenes internos. Antes de commitearlo, confirmar que
el repo **no** es visible para el cliente; si lo es o no lo sabes, deja la opción 1 (queda local).

---

## 9. Soporte mensual e infraestructura

Planes de soporte (`support:` del rates): **Care** 4 h/mes, SLA 48 h · **Pro** ⭐ 10 h/mes, SLA 24 h
(default recomendado) · **Priority** 20 h/mes, SLA 8 h. Horas no usadas: rollover 1 mes.

Infra del stack del kit: Vercel + Neon + Blob/email condicionales, montos en §10, **validar contra pricing
vigente antes de cerrar**. Auth: solo Auth.js o Neon Auth.

---

## 10. Output

`project/planning/00b_INTERNAL_ESTIMATE.md`, desde `templates/ESTIMATE.template.md` (12 secciones; §10 =
snapshot YAML con `schema: story_points_v1`). Header obligatorio:

```markdown
> ⚠️ INTERNAL DOCUMENT — DO NOT SHARE WITH CLIENT
> Solo las cifras de oferta de §1, confirmadas en el CP1 de /proposal, llegan al cliente.
```

---

## 11. Anti-patterns (NUNCA)

1. Cotizar "al ojo" — todo pasa por backlog, brief o scoping con la tabla de puntos.
2. Tratar story points como horas.
3. Meter la Capacidad de Factory dentro de la tarifa de dirección.
4. Cerrar sin el checkpoint de Phase 4.
5. Inventar montos si una tarifa resuelve a `PENDIENTE`.
6. Presentar un único número — siempre rangos Opt/Real/Cons.
7. Omitir §10 (supuestos editables): es la razón de existir del skill.
8. Llamar APIs de pricing externas — tablas embebidas en §10.
9. Modificar el brief, el backlog o la propuesta desde este skill.
10. Introducir proveedores de auth fuera del stack del kit.
11. Puntuar un issue de lote por su volumen de datos.
12. Marcar una señal de riesgo sin la cita textual que la justifica.
13. Aplicar multiplicadores de riesgo y cobertura a la vez.
14. Sacar un módulo nuevo de la bolsa de cobertura.
15. Re-abrir las decisiones cerradas (la capacidad de Factory se cobra; piso único).
16. Vender en modo equipo al piso sin declararlo.
17. Copiar al output o al kit anclas, precios o nombres de otros clientes.
18. Bajar la tarifa por punto porque subió la densidad.

---

## 12. Quality checks al cierre

- [ ] Todos los issues de la fuente en §3 con puntos y razonamiento de 1 línea
- [ ] Issues de 8 puntos con flag "dividir"
- [ ] §10 YAML parseable con `schema: story_points_v1`
- [ ] Issues de lote listados en el checkpoint con su puntaje sin la regla
- [ ] Cada señal de riesgo con su cita textual; `cobertura_pct` ≥ 10%
- [ ] Piso aplicado; si el total queda en el piso y el modo es `equipo`, declarado
- [ ] `Opt ≤ Real < Cons` en todas las filas numéricas
- [ ] Capacidad de Factory como línea propia en §1
- [ ] Header "DO NOT SHARE WITH CLIENT" presente
- [ ] §2 declara fuente + origen y fecha de las tarifas
- [ ] Sin nombres de otros clientes ni anclas históricas en el output

---

_TimeKast Factory — tk-estimate (story points · capacidad de Factory · cobertura como bolsa)_

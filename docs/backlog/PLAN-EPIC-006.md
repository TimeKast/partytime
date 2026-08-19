# PLAN — Ledger financiero del evento (ingresos/gastos + simplificación de deudas)

- **Fecha:** 2026-08-19 (rev. 2 mismo día: P1a/P1b/P2b confirmadas; P2a resuelta
  con cambio de diseño — Stripe entra al ledger con dos modos, ver §2.6)
- **Epics:** EPIC-006 (ledger financiero interno)
- **Issues:** ISSUE-021..ISSUE-027
- **Origen del plan:** sesión Fable 5 (tier ≥ Opus; cumple regla "Opus planea, Sonnet ejecuta")

## 1. Resumen ejecutivo

Módulo **interno de administración** (no público, no para invitados) para que
los organizadores de un evento lleven control de ingresos y gastos que ocurren
**fuera de Stripe**: quién pagó cada gasto (venue, comida, DJ…), quién recibió
cada ingreso en efectivo, y — estilo Splitwise — qué saldo tiene cada
participante, qué transferencias mínimas saldan al grupo, y qué pagos entre
participantes ya se hicieron para ir cerrando cuentas.

Petición textual de José (2026-08-19): "llevar un control de los ingresos y
gastos del evento… dar de alta quién realizó el gasto y quién recibe el
ingreso — en los casos donde no sea por Stripe… función estilo Splitwise para
simplificar las deudas… registrar pagos que se hacen entre ellos para saldar
cuentas, y ver el saldo de cada quien hasta que todo quede saldado."

Alcance MVP:

1. **Participantes** del ledger por evento (los organizadores/staff que
   adelantan dinero o reciben efectivo).
2. **Movimientos**: gastos e ingresos manuales, cada uno con su contraparte
   (quién pagó / quién recibió) y su reparto (`shares`) entre participantes.
3. **Saldos y simplificación**: cálculo on-demand del saldo de cada quien y
   sugerencia greedy de transferencias mínimas (≤ n−1 transferencias).
4. **Settlements**: registro de pagos entre participantes que reducen saldos
   hasta llegar a cero.
5. **Resumen financiero** del evento: total gastos, total ingresos manuales y
   lo cobrado por Stripe (`rsvp_payments` paid).
6. **Dinero de Stripe en el ledger** (§2.6): registrar retiros/pagos desde lo
   cobrado por Stripe hacia participantes, y un toggle por evento que decide
   si Stripe cuenta como un participante más del grafo de deudas o como fondo
   del evento que cubre gastos y deja remanente de utilidad.

No mueve dinero real: es contabilidad interna (los retiros de Stripe se
*registran*, la transferencia física la hace quien controla la cuenta). No
hay superficie pública nueva.

## 2. Decisiones de diseño

### 2.1 Participantes = registro libre por evento (no cuentas de usuario)

Tabla nueva `event_participants` con nombre libre (+ email opcional y link
opcional a `users.id`). Razones:

- Quien adelanta un gasto muchas veces NO tiene cuenta en la app (mismo
  razonamiento que `checked_in_by` y `rsvp_invitation_links.created_by`:
  actores válidos sin fila en `users`).
- Pero el ledger necesita **identidad estable** para agregar saldos — texto
  libre repetido con typos rompería la contabilidad. Por eso es una tabla con
  unique `(event_id, lower(name))`, no un varchar suelto.
- `user_id` opcional (`ON DELETE SET NULL`) permite ligar a un organizador con
  cuenta sin exigirlo.

> **Confirmado por José (2026-08-19):** registro libre por evento. Además
> José pidió explícitamente evitar problemas de homologación (typos, acentos,
> espacios) si el nombre se tecleara en cada movimiento — razón por la que el
> diseño ya usaba una tabla de identidad (no un campo de texto suelto por
> transacción): el alta de un participante se hace **una vez**, y al registrar
> un movimiento se **selecciona de la lista** de participantes ya dados de
> alta (dropdown), nunca se vuelve a escribir el nombre. Se pueden agregar
> participantes nuevos en cualquier momento (incluso desde el propio formulario
> de alta de movimiento) para el caso de que surja alguien a medio camino.

### 2.2 Semántica de saldos (convención de signos)

Todo en **centavos enteros** (`*_cents`), nunca floats. Para cada participante:

```
saldo = + Σ gastos que pagó            (adelantó dinero al grupo)
        − Σ shares de gastos que le tocan
        − Σ ingresos que recibió        (tiene efectivo del grupo en la mano)
        + Σ shares de ingresos que le corresponden
        + Σ settlements que pagó
        − Σ settlements que recibió
```

- Saldo positivo = el grupo le debe. Negativo = debe al grupo.
- **Invariante: Σ saldos = 0** (test obligatorio).
- Un ingreso en efectivo recibido por Ana y repartido entre 4 deja a Ana con
  −monto+share y a los demás con +share: exactamente el modelo Splitwise de
  "Ana cobró por el grupo".

### 2.3 Reparto (`shares`): monto exacto en DB, "equitativo" como helper

- La tabla `event_transaction_shares` guarda `share_cents` **exactos** por
  participante; la suma debe igualar `amount_cents` (invariante validado en la
  API y dentro de la sentencia CTE de escritura — ver gotcha #2).
- El reparto equitativo es un helper puro (`splitEqual`): división entera +
  residuo por **largest remainder** (los primeros K participantes en orden
  determinista reciben +1 centavo). La UI ofrece "partes iguales" (default) y
  "montos personalizados"; porcentajes quedan fuera del MVP.

### 2.4 Saldos on-demand, sin tabla materializada

Evaluado el tradeoff:

| Opción | Pros | Cons |
|---|---|---|
| **Cálculo on-demand (elegida)** | Sin estado derivado que pueda divergir; edits/soft-deletes son triviales (se recalcula); encaja con neon-http sin transacciones interactivas | O(n movimientos) por lectura |
| Saldos materializados | Lecturas O(1) | Cada write debe actualizar saldos en la misma sentencia (CTE frágil); divergencia = contabilidad rota |

Un evento tiene decenas–cientos de movimientos, no millones: on-demand es
gratis y elimina la clase entera de bugs de divergencia.

### 2.5 Simplificación de deudas: greedy determinista

Algoritmo greedy estándar (el de Splitwise): ordenar deudores y acreedores por
monto desc (tie-break por `participant_id` para output estable), emparejar el
mayor deudor con el mayor acreedor, emitir transferencia por el mínimo de
ambos, repetir. Garantiza ≤ n−1 transferencias; el mínimo absoluto es
NP-hard (subset-sum) y no aporta en grupos de organizadores (<20 personas).
Las sugerencias **no se persisten**: son output del cálculo; "registrar pago"
prellena un settlement con la sugerencia.

### 2.6 Stripe en el ledger: participante virtual + toggle de modo por evento

> **Resuelto por José (2026-08-19, P2a), textual:** "Se debe poder registrar
> cuando alguien se cobra de lo de stripe, o si el q controla la cuenta le
> manda el $ a alguien. Y se debe de poder marcar si stripe cuenta como un
> participante (la cuenta es de alguien) o si no (se usa para cubrir gastos y
> puede quedar un remanente de utilidad)."

Esto reemplaza el default anterior ("Stripe solo línea informativa"). Diseño:
**un solo modelo de datos, dos vistas** — el modo NUNCA cambia qué se
persiste ni cómo calcula el motor; solo cambia cómo el summary presenta el
nodo Stripe.

**a) Participante virtual Stripe (existe en ambos modos).** Cada evento tiene
(auto-provisionada de forma lazy la primera vez que se necesita) una fila en
`event_participants` con `kind='stripe'` (los demás son `kind='person'`),
nombre reservado "Stripe", no renombrable/desactivable/borrable, máx. una por
evento (unique parcial). Con ese nodo, TODO lo que pidió José son movimientos
ordinarios del modelo ya diseñado:

- **Retiro / "alguien se cobra de lo de Stripe" / "le manda el $ a alguien"**
  = settlement `Stripe → persona` (tabla `event_settlements`, sin cambios).
- **Gasto pagado directo desde la cuenta Stripe** = expense con
  `participant_id` = Stripe (tabla `event_transactions`, sin cambios).
- **Cobros Stripe entrando al grafo** (modo participante) = income recibido
  por Stripe con beneficiarios/shares elegidos, igual que un ingreso en
  efectivo. La UI ofrece "Registrar cobros Stripe" prellenado con el delta
  aún no registrado (`stripePaidCents` de `rsvp_payments` − ingresos ya
  registrados al nodo Stripe).

El motor (§2.2/§3.2) trata al nodo Stripe como un participante cualquiera:
`computeBalances` y `simplifyDebts` **no cambian** y el invariante global
Σ saldos (incluyendo el nodo Stripe) = 0 se conserva siempre.

**b) Toggle por evento `events.ledger_stripe_is_participant`** (boolean,
DEFAULT false):

| | `true` — "la cuenta es de alguien" | `false` — fondo del evento (default) |
|---|---|---|
| Nodo Stripe en `balances` | Sí, como cualquier participante | No — se aparta a una sección propia |
| Sugerencias que tocan a Stripe | "Stripe le paga a X" normales | Etiquetadas "retiro de Stripe sugerido" (Stripe→X) / "aporte al fondo" (X→Stripe) |
| Meta de "saldado" | Saldo Stripe llega a 0 (todo el dinero cobrado se distribuye — no es de la cuenta, es del grupo) | Saldos de personas en 0; Stripe puede quedar con **remanente = utilidad** |
| Sección Stripe del summary | Delta "cobros sin registrar" como aviso | `cobrado + aportes − gastos pagados por Stripe − retiros = remanente` (cash) |

En modo fondo, un gasto pagado por Stripe cuyo reparto se asigna 100% al
propio nodo Stripe queda neutro para todas las personas ("lo cubrió el
evento" — default de la UI en ese modo); si el organizador lo reparte entre
personas, esas personas quedan debiendo al fondo (sugerencia "aporte al
fondo") — ambos casos son expresables sin lógica especial.

**Cuándo aparece cada sugerencia que toca al nodo** (aclaración 2026-08-19,
tras adjudicar el gherkin de ISSUE-024 — la matemática uniforme de §2.2
gana, sin caso especial por `kind`):

- El nodo queda **deudor** (saldo negativo) cuando se le cargan cosas: shares
  de gastos asignadas al nodo ("cubierto por el evento", aunque el pagador
  sea una persona) o ingresos registrados al nodo. Entonces el greedy sugiere
  `Stripe→persona` = **"retiro de Stripe sugerido"** (`involvesStripe='from'`).
- El nodo queda **acreedor** (saldo positivo) cuando frontea dinero: retiros
  `Stripe→persona` que exceden lo que el nodo debía. Entonces se sugiere
  `persona→Stripe` = **"aporte al fondo"** (`involvesStripe='to'`).
- Flujo canónico de "alguien se cobra de lo de Stripe" en modo fondo:
  registrar el gasto con share al nodo + el retiro que lo salda — todos
  quedan en 0 y el remanente baja exactamente el monto. Un retiro *sin*
  cargo previo al nodo es un adelanto del fondo y genera aportes, que es lo
  correcto.

**c) Cambio de modo permitido en cualquier momento** (nada materializado,
§2.4 recalcula todo). Único riesgo semántico: ingresos ya registrados al nodo
Stripe en modo participante + cambio a modo fondo pueden leerse como doble
conteo (el remanente usa `rsvp_payments` completo y los saldos de personas
conservan sus shares). La UI advierte al cambiar de modo si existen ingresos
registrados al nodo Stripe (gotcha #9).

### 2.7 Permisos y visibilidad

Recomendado (a confirmar): módulo visible en el admin del evento;
**viewer lee** (saldos, movimientos, resumen), **manager/super_admin muta**
(alta/edición/borrado de participantes, movimientos y settlements). Es el
mismo split lectura/escritura de check-in (ISSUE-018: GET viewer, PATCH
manager). Sin toggle en `events`: el módulo existe siempre en el admin y no
tiene superficie pública, así que no hay nada que "habilitar".

> **Confirmado por José (2026-08-19):** viewer también puede ver este módulo
> (solo lectura); manager/super_admin muta.

### 2.8 Scope por evento y moneda única

- Todo el ledger vive **scoped a un evento** (`event_id` = slug, gotcha #1).
  Sin vista cross-evento en MVP.
- **Una sola moneda por ledger**: whitelist MXN/USD, la primera transacción
  fija la moneda del ledger y las siguientes deben coincidir (validación API).
  Multi-moneda con tipos de cambio queda fuera del MVP.

> **Confirmado por José (2026-08-19, P2b):** una sola moneda por evento.

### 2.9 Ediciones y borrados: soft-delete, historia recalculable

Movimientos y settlements se editan y se **soft-borran** (`deleted_at`,
`deleted_by`) — nunca DELETE físico de registros de dinero. Como los saldos se
recalculan on-demand (§2.4), editar/borrar nunca deja estado inconsistente.
Participantes referenciados no se borran (`ON DELETE RESTRICT`); se
desactivan (`is_active=false`) para ocultarlos de formularios nuevos.

## 3. Arquitectura

### 3.1 Modelo de datos (4 tablas nuevas + 1 columna en events, migración 0012)

- `event_participants` — identidad estable por evento (§2.1); columna `kind`
  (`person | stripe`) con unique parcial "un solo nodo Stripe por evento"
  (§2.6a).
- `events.ledger_stripe_is_participant` — toggle de modo Stripe (§2.6b). NO
  se expone por `/api/events` (DTO allowlist intacto); viaja por la API del
  ledger (§3.3).
- `event_transactions` — un gasto o ingreso: `type ∈ {expense, income}`,
  `participant_id` = quién pagó (expense) / quién recibió (income),
  `amount_cents`, `currency`, `description`, `occurred_on`, soft-delete.
- `event_transaction_shares` — reparto exacto por participante (§2.3),
  filas hijas del movimiento (`ON DELETE CASCADE` desde transactions).
- `event_settlements` — pago entre participantes: `from_participant_id` →
  `to_participant_id`, `amount_cents`, `settled_on`, soft-delete.

**Integridad cross-evento a nivel DB:** un participante del evento A jamás
puede aparecer en un movimiento del evento B. Se garantiza con FKs compuestas:
`event_participants` y `event_transactions` llevan unique `(id, event_id)` y
las tablas que los referencian cargan su propio `event_id` con FK compuesta
`(participant_id, event_id)` / `(transaction_id, event_id)`. Detalle en
ISSUE-021.

### 3.2 Motor de cálculo puro (`lib/event-ledger.ts`)

Funciones puras sin I/O (100% unit-testeables):

- `splitEqual(amountCents, participantIds)` — largest remainder (§2.3).
- `computeBalances(transactions, shares, settlements)` — convención §2.2;
  ignora soft-deleted; retorna Map participante→saldo con Σ=0.
- `simplifyDebts(balances)` — greedy determinista (§2.5).

El nodo Stripe (§2.6) es un participante más para estas funciones: **el modo
NO entra al motor**. La partición participante-vs-fondo es una función de
presentación aparte (`partitionStripeView`, misma pureza) que consume el
output de `computeBalances`/`simplifyDebts` sin recalcular nada.

Separado de Drizzle a propósito: ISSUE-022 se ejecuta en paralelo con la
migración (write-sets disjuntos) y el tier 3 de "cálculo financiero" se audita
sobre funciones puras con tests exhaustivos de centavos.

### 3.3 Data layer y APIs

- **`lib/ledger-queries.ts` (nuevo)** — NO engordar `lib/queries.ts`: módulo
  propio para todas las queries del ledger. ISSUE-023 lo crea, ISSUE-024 lo
  extiende (por eso van en serie — mismo write-set).
- Rutas admin (todas `requireAuth` + `userHasEventAccess`, GET con rol
  `viewer`, mutaciones con mínimo `manager`, patrón ISSUE-018):
  - `app/api/admin/ledger/participants/route.ts` — GET/POST/PATCH
  - `app/api/admin/ledger/transactions/route.ts` — GET/POST/PATCH/DELETE(soft)
  - `app/api/admin/ledger/settlements/route.ts` — GET/POST/PATCH/DELETE(soft)
    (incluye retiros: settlements cuyo `from` es el nodo Stripe)
  - `app/api/admin/ledger/config/route.ts` — GET/PATCH del toggle
    `ledger_stripe_is_participant` (PATCH solo manager)
  - `app/api/admin/ledger/summary/route.ts` — GET: saldos, sugerencias,
    totales, y la sección Stripe según el modo (§2.6b)
- DTOs allowlist con test de keys exactas (patrón `linkDto` / DTO de
  `/api/events`): nunca serializar filas Drizzle completas.

### 3.4 UI admin (tab "Finanzas")

- Nueva pestaña **"Finanzas"** por evento seleccionado en `app/admin/page.tsx`
  (junto a Dashboard/Config; §2.7 confirmado: viewer lee, manager muta,
  mismo gating que check-in).
- Componentes nuevos en `app/admin/components/finance/` (mobile-first,
  reutilizando `SettingsDisclosure`/patrones de `CheckinOverview`):
  - `LedgerSummary` — cards de totales + lista de saldos por participante.
  - `TransactionList` + `TransactionForm` — alta/edición de gastos e
    ingresos con selector de reparto (iguales default / montos exactos).
  - `ParticipantsManager` — alta/edición/desactivación de participantes.
  - `SettlementsPanel` — sugerencias "quién le paga a quién" con botón
    "registrar pago" (prellena settlement) + historial de settlements.
  - `StripePanel` (ISSUE-027) — toggle de modo, sección Stripe del summary
    (cobrado/retirado/remanente o saldo del nodo según modo), acción
    "Registrar retiro de Stripe" y helper "Registrar cobros Stripe".
- Montos siempre formateados desde centavos (`Intl.NumberFormat`), input en
  pesos con conversión a centavos en un solo punto (helper compartido).

## 4. Cambios de schema (migración 0012, single-owner)

- **0012** (ISSUE-021): tablas `event_participants` (con `kind` + unique
  parcial de nodo Stripe), `event_transactions`, `event_transaction_shares`,
  `event_settlements` con sus índices, checks y FKs compuestas (§3.1), más
  `events.ledger_stripe_is_participant` boolean NOT NULL DEFAULT false. Sin
  columnas nuevas en `rsvps`.

La migración debe actualizar **los tres guardarraíles**
(`lib/migration-preflight.ts`, `lib/migration-semantic-contract.ts` — o un
contrato dedicado `lib/event-ledger-migration-contract.ts` siguiendo el patrón
de `lib/rsvp-payments-migration-contract.ts` —, `scripts/verify-db-contract.ts`)
más el journal, y pasar `pnpm db:preflight`. Ensayar primero en rama Neon
desechable (`docs/PRODUCTION_MIGRATION_RUNBOOK.md`, patrón del rollout 0008).

## 5. Gotchas conocidos (leer antes de ejecutar cualquier issue)

1. `event_id` guarda el **slug** de `events`, no el UUID (`lib/schema.ts`,
   contrato A6-14). Las 4 tablas nuevas siguen esa convención con
   `references(() => events.slug, { onUpdate: 'cascade', onDelete: 'restrict' })`.
2. Neon HTTP **no tiene transacciones interactivas** — crear/editar un
   movimiento con sus shares es UNA sola sentencia CTE (patrón
   `saveRsvpWithInvitation`, `lib/queries.ts:259`) que valida
   `Σ share_cents = amount_cents` dentro de la propia sentencia (insert
   condicional: si no cuadra, no inserta nada y la API responde 400).
3. **Solo enteros**: jamás floats en dinero. Reparto equitativo con largest
   remainder determinista (orden por `participant_id`); tests con montos
   primos (p. ej. 1000/3) fijan la distribución exacta.
4. Soft-deleted (`deleted_at IS NOT NULL`) se excluye de TODOS los cálculos y
   listados por default — un filtro olvidado corrompe saldos silenciosamente.
   Centralizar el predicado en `lib/ledger-queries.ts`, no repetirlo por ruta.
5. `app/admin/page.tsx` tiene ~2900 líneas y lo tocan ambos issues de UI —
   ISSUE-025 crea el shell de la pestaña y ISSUE-026 solo agrega componentes
   bajo `components/finance/` (write-sets disjuntos tras el shell); aun así
   van secuenciados por prudencia.
6. La lista autenticada de eventos usa DTO allowlist (`/api/events`,
   ISSUE-018): la columna nueva `ledger_stripe_is_participant` NO se agrega a
   ese DTO (viaja solo por `/api/admin/ledger/config` y el summary) — el
   allowlist existente ya la excluye por default, verificarlo con el test de
   keys. NO serializar filas Drizzle completas en las rutas nuevas del ledger.
7. Cap de sanidad en la API: `amount_cents ≤ 99,999,999` (≈ $1M) para atrapar
   typos de captura; el CHECK de DB solo exige `> 0`.
8. Moneda del ledger: validar consistencia (§2.8) al crear/editar; el mensaje
   de error debe decir cuál es la moneda ya fijada.
9. **Nodo Stripe:** se auto-provisiona lazy (`ensureStripeParticipant`) con
   INSERT idempotente (`ON CONFLICT` sobre el unique parcial) — dos requests
   concurrentes no deben crear dos nodos. El PATCH de participantes rechaza
   renombrar/desactivar `kind='stripe'`. Y el cambio de modo con ingresos ya
   registrados al nodo Stripe requiere confirm con advertencia de doble
   conteo (§2.6c) — la advertencia es de UI, el API no lo bloquea.

## 6. Secuencia de ejecución y paralelismo (safe-parallelism)

Unidades, write-sets y edges declarados antes de ejecutar:

| Issue | Write-set principal | Exclusivos |
|---|---|---|
| ISSUE-021 | `drizzle/0012_*.sql`, `lib/schema.ts`, guardarraíles (preflight/contract/verify), journal | **schema/migraciones** |
| ISSUE-022 | `lib/event-ledger.ts`, `tests/event-ledger.test.ts` | — |
| ISSUE-023 | `lib/ledger-queries.ts` (crea), `app/api/admin/ledger/participants|transactions/`, tests | — |
| ISSUE-024 | `lib/ledger-queries.ts` (extiende), `app/api/admin/ledger/settlements|summary/`, tests | — |
| ISSUE-025 | `app/admin/page.tsx` (shell tab), `app/admin/components/finance/` (registro), tests | — |
| ISSUE-026 | `app/admin/components/finance/` (saldos/settlements), tests | — |
| ISSUE-027 | `app/admin/components/finance/` (StripePanel + retoques a Form/List/Tab), tests | — |

- **Wave 1 (paralelo, write-sets disjuntos):** ISSUE-021 ∥ ISSUE-022.
  La migración es single-owner de schema; el motor puro no toca schema ni
  queries — cero solape.
- **Wave 2 (serie):** ISSUE-023 → ISSUE-024. Ambos escriben
  `lib/ledger-queries.ts` (solape declarado → se secuencia, no se reintenta).
  024 incluye la ruta de config del toggle Stripe.
- **Wave 3 (serie):** ISSUE-025 → ISSUE-026 → ISSUE-027. Solape en
  `admin/page.tsx` y `components/finance/` (gotcha #5); 027 va al final
  porque edita componentes que 025/026 crean.
- Gates después de cada wave: `pnpm lint && pnpm test && pnpm build`, más
  `pnpm db:preflight` en Wave 1 (hubo migración).
- Con 2 unidades paralelas en Wave 1 estamos bajo el umbral de ~3 del policy;
  razón explícita para paralelizar: ambas son largas, genuinamente disjuntas,
  y 022 es el insumo crítico de la review tier 3 (conviene tenerlo temprano).

## 7. Clasificación de riesgo (risk-aware-audits)

Triggers presentes: cálculos financieros, migración/schema, RBAC. NO hay
movimiento de dinero real, ni superficie pública, ni webhook: el blast radius
es acotado (contabilidad interna recalculable) y todo es reversible → tier 3,
no 4 (a diferencia de EPIC-004, que cobraba dinero real). El diseño Stripe de
§2.6 **no cambia el tier**: los retiros se registran, no se ejecutan (la
transferencia física ocurre fuera de la app, en el dashboard/banco de quien
controla la cuenta); el toggle es presentación sobre el mismo modelo, y
`rsvp_payments` solo se LEE (nunca se muta desde el ledger — verificarlo en
la review). Sí agrega foco de review: idempotencia del nodo Stripe (gotcha
#9) y que la partición participante/fondo no invente ni pierda centavos.

| Unidad | Tier | Review |
|---|---|---|
| ISSUE-021 migración 0012 | 3 | dentro de la review del epic (integridad FKs compuestas, unique parcial del nodo Stripe) |
| ISSUE-022 motor de cálculo | 3 | foco principal: invariante Σ=0, centavos, determinismo, partición Stripe sin pérdida |
| ISSUE-023/024 APIs | 3 | RBAC viewer/manager, invariante de shares en CTE, DTOs, `ensureStripeParticipant` race-safe, `rsvp_payments` read-only |
| ISSUE-025/026/027 UI | 2 | self-check + smoke real de navegador; sin auditor extra |
| **EPIC-006 completo** | **3** | **una** review enfocada acotada (un solo review owner, sin anidar) |

## 8. Variables de entorno nuevas

Ninguna.

## 9. Fuera de alcance (MVP)

- Exports PDF/Excel del ledger (los exports de invitados no se tocan).
- Adjuntos/recibos (foto del ticket del gasto).
- Multi-moneda por evento y tipos de cambio (§2.8).
- Categorías de gasto y presupuestos.
- Reparto por porcentajes o pesos (solo iguales y montos exactos).
- Portal para participantes sin cuenta (tipo check-in) para ver su saldo.
- Notificaciones/recordatorios de deudas por email.
- Reconciliación automática con Stripe (Balance/Transfers/Payouts API): los
  retiros se registran a mano; la app nunca ejecuta ni verifica la
  transferencia real. (El registro manual de retiros y el toggle de modo SÍ
  entraron al MVP — §2.6, antes fuera de alcance.)
- Import automático/continuo de cobros Stripe como ingresos del ledger (solo
  el helper manual prellenado de §2.6a).
- Vista financiera cross-evento.

## 10. Preguntas abiertas para José (resumen)

| # | Pregunta | Recomendación del plan | Estado |
|---|---|---|---|
| P1a | ¿Participantes = registro libre por evento o solo `users` con cuenta? | Registro libre + link opcional a `users` (§2.1) | **Confirmado 2026-08-19: registro libre.** Alta única por participante; los movimientos seleccionan de la lista, nunca texto libre por transacción (evita typos/acentos). |
| P1b | ¿Viewer ve finanzas o solo manager/super_admin? | Viewer lee, manager muta (§2.7) | **Confirmado 2026-08-19: viewer también ve.** |
| P2a | ¿Ingresos Stripe solo informativos o también payouts registrables? | Solo informativos en MVP (§2.6) | **Resuelto 2026-08-19 — cambia el diseño:** retiros de Stripe registrables (settlement desde el nodo Stripe) + toggle por evento "Stripe cuenta como participante" (la cuenta es de alguien) vs "fondo del evento con remanente de utilidad". Diseño completo en §2.6; impacta ISSUE-021..027. |
| P2b | ¿Una sola moneda por evento? | Sí, whitelist MXN/USD (§2.8) | **Confirmado 2026-08-19: una sola moneda por evento.** |

Las cuatro preguntas están resueltas — ningún issue queda bloqueado por
decisión de producto. ISSUE-021 se **reabrió** el mismo día para absorber el
schema de P2a (columna `kind` + unique parcial + toggle en `events`) antes de
que alguien lo ejecute con la spec anterior.

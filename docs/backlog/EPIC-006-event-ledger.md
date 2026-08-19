# EPIC-006 — Ledger financiero del evento (ingresos/gastos + Splitwise)

- **Status:** Planned (rev. 2026-08-19: P1a/P1b/P2b confirmadas; P2a resuelta
  con diseño nuevo de Stripe — PLAN §2.6)
- **Goal:** Los organizadores de un evento registran gastos e ingresos
  manuales con su responsable y su reparto, ven el saldo de cada
  participante, reciben la sugerencia mínima de "quién le paga a quién",
  registran los pagos entre ellos — incluyendo retiros desde lo cobrado por
  Stripe — hasta que todo quede saldado, con un toggle por evento que decide
  si Stripe es un participante más o un fondo que deja utilidad.
- **Stories:** US-014, US-015, US-016, US-017
- **Issues:** ISSUE-021, ISSUE-022, ISSUE-023, ISSUE-024, ISSUE-025,
  ISSUE-026, ISSUE-027
- **Milestone:** Event finance ledger
- **Depends on:** — (solo orden de migraciones: 0012 va después de 0011)
- **Done when:** un manager da de alta participantes, registra un gasto con
  reparto y un ingreso en efectivo, el resumen muestra saldos que suman cero,
  las sugerencias de transferencia se convierten en settlements con un clic,
  registra un retiro de Stripe y ve el efecto correcto en ambos modos del
  toggle (participante / fondo con remanente), al saldar todo los saldos
  quedan en cero, y la suite completa pasa.
- **Tier de riesgo:** 3 (cálculo financiero + migración + RBAC; **sin**
  movimiento de dinero real ni superficie pública — a diferencia de EPIC-004;
  los retiros de Stripe se registran, no se ejecutan, y `rsvp_payments` solo
  se lee). Una review enfocada acotada sobre: invariantes de centavos
  (Σ saldos = 0, Σ shares = monto), determinismo del reparto/simplificación,
  RBAC viewer/manager, FKs compuestas cross-evento, idempotencia del nodo
  Stripe y partición participante/fondo sin perder centavos.

## User stories

- **US-014** — Como organizador, doy de alta a los participantes del evento y
  registro cada gasto (quién lo pagó, cuánto, entre quiénes se reparte) y
  cada ingreso en efectivo (quién lo recibió y a quiénes beneficia).
- **US-015** — Como organizador, veo el saldo de cada participante (a favor o
  en contra) y la lista mínima de transferencias sugeridas para saldar al
  grupo, junto al resumen del evento (gastos, ingresos manuales, Stripe).
- **US-016** — Como organizador, registro los pagos que los participantes se
  hacen entre sí y veo los saldos bajar hasta quedar todo en cero.
- **US-017** — Como organizador, registro cuando alguien se cobra de lo de
  Stripe (o cuando quien controla la cuenta le manda dinero a alguien), y
  marco por evento si Stripe cuenta como un participante del grafo de deudas
  (la cuenta es de alguien) o como fondo del evento que cubre gastos y puede
  dejar remanente de utilidad.

## Decisiones clave (ver PLAN-EPIC-006.md §2)

- Participantes = tabla propia por evento con nombre único case-insensitive y
  link opcional a `users` (identidad estable sin exigir cuenta).
- Todo en centavos enteros; saldos **on-demand** (nunca materializados);
  invariante Σ saldos = 0 con test.
- Reparto exacto en DB (`share_cents`); "partes iguales" es un helper con
  largest remainder determinista.
- Simplificación greedy determinista (≤ n−1 transferencias), sugerencias no
  persistidas; "registrar pago" crea el settlement.
- **Stripe (PLAN §2.6, decisión de José 2026-08-19):** participante virtual
  `kind='stripe'` auto-provisionado — los retiros ("alguien se cobra de lo de
  Stripe") son settlements Stripe→persona y los gastos pagados desde la
  cuenta son expenses con payer Stripe, sin tablas nuevas. Toggle
  `events.ledger_stripe_is_participant`: en modo participante el nodo entra a
  saldos/sugerencias (la cuenta es de alguien y todo debe distribuirse); en
  modo fondo (default) queda fuera del grafo y el summary muestra
  `cobrado + aportes − gastos Stripe − retiros = remanente` (utilidad cash;
  fórmula corregida 2026-08-19, ver Resolución en ISSUE-024). El motor de
  cálculo es idéntico en ambos modos y los settlements que tocan al nodo no
  tienen signo especial (adjudicado: el fondo que frontea queda acreedor).
- Soft-delete en movimientos y settlements; participantes se desactivan.
- Escrituras multi-tabla (movimiento + shares) en una sola sentencia CTE
  (neon-http, gotcha #2 del PLAN).

## Preguntas abiertas

Ninguna — P1a, P1b, P2a y P2b resueltas por José el 2026-08-19 (tabla final
en PLAN-EPIC-006.md §10). Ningún issue queda bloqueado por producto.

# ISSUE-006 — Auditar y adaptar todos los consumidores de `rsvps.status`

- **Epic:** EPIC-002
- **Priority:** P0
- **Story points:** 3
- **Status:** Pending
- **Dependencies:** ISSUE-005
- **User stories:** habilitador de US-006..US-010
- **Agents:** backend-specialist, code-archaeologist
- **Skills:** implement, audit

## Objetivo

Ningún código existente debe romperse ni comportarse mal cuando aparezcan
filas `pending_*`/`expired`. Barrer TODOS los sitios que leen/filtran
`status` y decidir explícitamente qué hace cada uno con los estados nuevos.

## Método

`grep -rn "status" app/ lib/ --include="*.ts" --include="*.tsx"` filtrado a
usos de rsvp status. Lista mínima conocida (verificar exhaustividad):

| Sitio | Comportamiento requerido |
|---|---|
| `app/api/rsvp/route.ts` (POST, dedupe por email) | pending propio → refrescar, no duplicar (detalle en ISSUE-007/011) |
| `app/api/rsvp/route.ts` (GET admin) | incluir estados nuevos con label |
| `app/api/cron/send-reminders/route.ts` | recordatorios SOLO a confirmed |
| `app/api/admin/send-bulk-email/route.ts`, `send-bulk-reminder/route.ts` | solo confirmed (o filtro explícito) |
| `app/api/rsvp/{get,update,cancel}/route.ts` (cancel-token) | pending puede cancelar; expired/cancelled → 404/410 |
| `app/admin/page.tsx` (lista, contadores, export PDF/Excel) | contadores separados: confirmados / pendientes pago / pendientes verificación; export con columna estado legible |
| `saveRSVPOnce` / `saveRsvpWithInvitation` (`lib/queries.ts`) | reactivación de cancelled/expired conserva semántica; el flujo por invitación respeta los flags del link (PLAN §2.1) |
| Emails (`lib/event-email-data.ts`, `lib/email-template.ts`) | confirmación solo al llegar a confirmed |

**Decisión (ajustada por José 2026-08-18):** el comportamiento de un RSVP vía
link privado depende de los flags del link (PLAN §2.1): `is_courtesy=false`
en evento de pago → paga vía Stripe; `skip_verification=false` en evento con
verificación → verifica email; con los defaults (ambos true) → confirmed
directo como hoy. La matriz se implementa en ISSUE-007 (verificación),
ISSUE-011 (pago) e ISSUE-020 (flags en creación/UI de links).

## Acceptance criteria

```gherkin
Given filas en los cinco estados en un evento
When el admin abre la lista de invitados y exporta PDF/Excel
Then cada fila muestra su estado legible y los contadores cuadran

Given una fila pending_verification o pending_payment
When corre el cron de recordatorios o un bulk email
Then esa fila NO recibe correos

Given un RSVP vía link privado con flags default (cortesía + skip)
When se registra en evento con pago o verificación activos
Then queda confirmed directo y consume el link (comportamiento actual intacto)

Given la suite existente completa
When corre pnpm test
Then 100% verde sin tests borrados ni debilitados
```

## Tests requeridos

- Ampliar `tests/` de admin list/export y reminders con estados mixtos.
- Test explícito del bypass de invitación privada con flags default.

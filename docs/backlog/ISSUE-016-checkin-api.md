# ISSUE-016 — API de check-in: listado con PII mínima, marcar llegadas y notas

- **Epic:** EPIC-005
- **Priority:** P0
- **Story points:** 3
- **Status:** Completed (2026-08-18)
- **Dependencies:** ISSUE-015
- **User stories:** US-012
- **Agents:** backend-specialist
- **Skills:** implement, backend, sk-api

## Objetivo

Los dos endpoints que consume el portal. Ambos exigen cookie válida
(`validateCheckinCookie`) y responden `no-store`.

## Cambios exactos

### `app/api/checkin/guests/route.ts` (GET `?slug=`)

- DTO por invitado (allowlist explícita, patrón `linkDto` del route de
  invitaciones): `{ id, name, plusOne, plusOneName, maskedEmail,
  checkedInAt, plusOneCheckedInAt, checkedInBy, checkinNote, status }`.
- **Incluir**: `confirmed` y `pending_payment`/`pending_verification`
  marcados como "pendiente" (el staff debe poder ver que alguien existe pero
  no está confirmado — badge distinto, no marcable).
- **Excluir**: `cancelled`, `expired`.
- `maskedEmail`: helper `maskEmail('jose@gmail.com') → 'j***@g***.com'`
  (primera letra de local y dominio + TLD). Test unitario con edge cases
  (local de 1 char, subdominios).
- **Prohibido en el DTO**: teléfono, email completo, cancel tokens, ids de
  pago. Test que fija las keys exactas del DTO (patrón `hasOnlyKeys`).
- Orden: alfabético por nombre. El filtrado/búsqueda es client-side
  (listas de cientos, no miles).

### `app/api/checkin/mark/route.ts` (POST)

- Body `{ slug, rsvpId, target: 'guest'|'plusOne', checkedIn: boolean,
  note?: string }`.
- Validaciones: rsvp pertenece al slug de la cookie; solo filas `confirmed`
  son marcables (409 si no); `target: 'plusOne'` requiere `plus_one=true`;
  `note` ≤ 500 chars, se guarda con trim (string vacío → NULL).
- Marcar: `checked_in_at=now()` (o el campo de +1) y
  `checked_in_by = staffName` de la cookie. Desmarcar: NULL en timestamp
  (conservar `checked_in_by` del último cambio). Last-write-wins, sin locks.
- Respuesta: la fila DTO actualizada (mismo shape del GET).

## Acceptance criteria

```gherkin
Given cookie válida del evento A
When pide guests del evento B o marca un rsvp del evento B
Then 403 sin datos

Given la lista de invitados
Then ninguna respuesta contiene phone ni email completo (test de keys exactas)

Given un invitado confirmed con +1
When el staff marca guest y luego plusOne
Then los dos timestamps quedan independientes con checked_in_by correcto

Given un invitado pending_payment
When el staff intenta marcarlo
Then 409 con mensaje "aún no confirmado"

Given dos staff marcando al mismo invitado casi simultáneo
Then gana el último write sin error (idempotente en la práctica)
```

## Tests requeridos

`tests/checkin-api.test.ts`: todos los criterios + maskEmail edge cases +
cookie inválida/expirada → 401.

# ISSUE-002 — Persistir y consumir links RSVP de un solo uso

- **Epic:** EPIC-001
- **Priority:** P0
- **Story points:** 8
- **Status:** Completed
- **Dependencies:** none
- **User stories:** US-003, US-004, US-005
- **Agents:** backend-specialist, database-architect, security-auditor
- **Skills:** implement, api-patterns, database

## Acceptance criteria

```gherkin
Given un manager autorizado y una expiración futura válida
When crea un link
Then recibe el URL una vez y la base sólo conserva su hash

Given dos solicitudes concurrentes con el mismo token válido
When ambas intentan registrar un RSVP
Then como máximo una confirma y consume el token

Given un token vencido, usado, revocado o ligado a otro evento
When intenta registrar
Then el API falla cerrado sin mutar RSVPs

Given RSVP público cerrado pero evento activo y token válido
When el invitado completa datos válidos dentro de capacidad
Then se confirma y el token queda usado
```

## Evidence

- Migración `0008`, tabla hash-only, APIs RBAC y validación pública implementadas.
- El RSVP y el consumo del link forman una sola sentencia SQL con bloqueo condicional.
- 27 pruebas focalizadas y 375/375 casos en la suite integrada.
- `used_rsvp_id` y `revoked_by` permiten correlación sin registrar bearer, hash ni PII.

## Production rollout

- `0008`, preflight, contrato, smoke y carrera concurrente fueron ensayados en Neon real sobre una rama desechable y quedaron verdes.
- `0008` fue promovida a la rama productiva `br-small-brook-ahd23yhy` el 2026-08-18 con su hash/timestamp de journal.
- El preflight posterior clasifica `registered-current-schema`; `verify:db`, consumo 2→1 y cleanup pasan.

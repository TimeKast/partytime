# EPIC-001 — Gestión escalable de invitados y accesos RSVP privados

- **Status:** Shipped to production
- **Goal:** Hacer manejables listas grandes y habilitar excepciones RSVP seguras y auditables.
- **Stories:** US-001..US-005
- **Issues:** ISSUE-001..ISSUE-004
- **Milestone:** Guest management upgrades
- **Done when:** criterios de las cuatro issues y Phase X del plan están verificados.

## Delivery evidence

- ISSUE-001, ISSUE-002 e ISSUE-003 implementadas en el árbol de trabajo.
- Suite integrada: 375/375 pruebas; typecheck, lint y build pasan.
- Preflight, contrato de DB, smoke HTTP y carrera concurrente pasaron primero en una rama Neon desechable.
- Código `9f615f2` y migración `0008` están en producción; `registered-current-schema`, `verify:db`, smokes público/admin y error scan pasan.
- Los cuatro findings de seguridad quedaron corregidos; los fixtures y sesiones de verificación quedaron en cero.

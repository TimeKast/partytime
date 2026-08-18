# ISSUE-003 — Gestionar links y registrar invitados desde la capacidad privada

- **Epic:** EPIC-001
- **Priority:** P1
- **Story points:** 5
- **Status:** Completed
- **Dependencies:** ISSUE-002
- **User stories:** US-003, US-004, US-005
- **Screens:** Admin dashboard / links; Public `/invite#token=…`
- **Agents:** frontend-specialist, test-engineer
- **Skills:** implement, frontend-design, webapp-testing

## Acceptance criteria

```gherkin
Given un manager en un evento seleccionado
When configura vigencia y genera un link
Then puede copiarlo y entiende que el secreto sólo se muestra esa vez

Given links emitidos
When abre el panel
Then ve estado y puede revocar sólo los activos

Given un token público válido con RSVP cerrado
When abre su URL
Then ve el contexto del evento y puede completar el formulario accesible

Given un token inválido, usado, revocado o vencido
When abre su URL
Then ve un mensaje claro y ningún formulario
```

## Evidence

- Gestor admin, URL mostrada una sola vez en memoria, estados y revocación implementados.
- Ruta `/invite` extrae el bearer del fragmento, lo borra del historial y valida por POST antes de reutilizar el formulario; sólo omite la presentación de `rsvpClosed`.
- 7 pruebas de contrato UI; ruta pública, URL depurada y protección del dashboard verificadas en Chrome local.

# ISSUE-001 — Paginar, ordenar y exportar la vista de invitados

- **Epic:** EPIC-001
- **Priority:** P1
- **Story points:** 5
- **Status:** Completed
- **Dependencies:** none
- **User stories:** US-001, US-002
- **Screens:** Admin dashboard / invitados
- **Agents:** frontend-specialist, test-engineer
- **Skills:** implement, testing-patterns

## Acceptance criteria

```gherkin
Given una lista con más invitados que el tamaño de página
When cambio página, tamaño, orden o filtros
Then la tabla muestra el slice correcto y el conteo total filtrado

Given filtros y orden activos
When exporto PDF o Excel desde cualquier página
Then el archivo contiene todos y sólo los resultados filtrados en el mismo orden

Given un cambio de búsqueda, filtro, orden o tamaño
When la página actual ya no es válida
Then la vista vuelve de forma segura a la página 1
```

## Evidence

- Implementado en `lib/rsvp-list.ts` y el dashboard admin.
- 7 pruebas unitarias cubren combinación de filtros, orden y límites de página.
- PDF/XLSX reciben la colección completa filtrada/ordenada antes del slice paginado.

# Business rules — guest management upgrades

- **BR-001:** El orden se aplica después de filtros y antes de paginación/exportación.
- **BR-002:** Exportar incluye todos los resultados filtrados, no sólo la página actual.
- **BR-003:** La página vuelve a 1 cuando cambian filtros, búsqueda, orden o tamaño.
- **BR-004:** Sólo super admin o manager asignado puede crear/revocar links; viewer sólo consulta lista de invitados, no links.
- **BR-005:** La expiración debe ser futura y no mayor a 365 días.
- **BR-006:** El token crudo sólo se devuelve al crear; se persiste SHA-256 único.
- **BR-007:** Abrir o validar no consume. Sólo un RSVP exitoso consume, atómicamente.
- **BR-008:** Un token usado, vencido o revocado falla cerrado y no crea/reactiva RSVP.
- **BR-009:** El token omite únicamente `rsvpClosed`; no omite `isActive`, capacidad, duplicados ni validación.
- **BR-010:** El token está ligado al evento y no puede usarse con otro slug.

# Discovery brief — guest management upgrades

## Problem

La administración carga todos los RSVPs pero no ofrece paginación ni orden explícito. Los exportadores ignoran filtros y exportan sólo confirmados desde la colección original. El cierre global del RSVP no permite excepciones privadas controladas.

## Users and outcomes

- **Manager del evento:** encuentra personas rápido, revisa listas grandes, exporta exactamente el segmento preparado y emite excepciones privadas limitadas.
- **Viewer:** consulta, filtra, ordena y exporta sin mutar datos.
- **Invitado:** registra su asistencia desde un link privado aún con RSVP público cerrado.

## Scope

In: paginación cliente, orden, exportación filtrada/ordenada, link hash-only con expiración, consumo único, revocación, panel admin y página pública accesible.

Out: importación masiva, envío automático del link por email/WhatsApp, múltiples usos, bypass de evento inactivo/capacidad/duplicados y paginación server-side.

## Success signals

- El conteo, orden y contenido exportado coinciden con los filtros activos.
- Ningún token puede completar dos RSVPs.
- Viewer no puede crear/revocar links; manager y super admin sí para eventos autorizados.

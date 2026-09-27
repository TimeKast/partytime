# Copy Discipline — es-MX

> Methodology companion for `tk-design`. How copy is written, tone managed, and label patterns reused across screens.

---

## 1. Language: es-MX neutral

- **Variant:** Spanish neutral / Mexican Spanish — never Argentinian (no voseo `vos`/`tenés`/`querés`, no argentinismos `che`/`dale`/`boludo`).
- **Tuteo:** default form (`tú`, `tienes`, `quieres`, `puedes`).
- **Imperatives:** `usa`, `instala`, `prueba`, `configura`, `revisa` — never `usá`, `instalá`, `probá`.

## 2. Tone vectors

| Vector           | Default                                                                                    | When to override                                                               |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Formality        | Tuteo (informal-respectful)                                                                | Ustéo if `project-config.md §branding.tone` says so (enterprise / legal apps). |
| Voice            | Active, second person                                                                      | Passive only when subject is unknown or generic system error.                  |
| Length           | Concise. 1 sentence per UI element ideally.                                                | Extended only in onboarding / explainer copy.                                  |
| Technical jargon | Avoid acronyms unless universally known (URL, PDF, CSV). Always expand on first use.       | OK for admin-only screens where users are technical (devs, SREs).              |
| Anglicisms       | Acceptable when fluid (`login`, `dashboard`, `email`). Translate when natural (`usuario`). | When client's branding has explicit translations, respect those.               |

## 3. Reusable label patterns (shared across screens)

These live in `16_DESIGN.md §6.2` — every SCR `## 11 Copy` references them by key instead of duplicating.

| Action / context      | Canonical label es-MX                                     | Notes                                                                            |
| --------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Save / submit         | `"Guardar"`                                               | Never `"Salvar"`, never `"Submit"`.                                              |
| Cancel / dismiss      | `"Cancelar"`                                              |                                                                                  |
| Delete (destructive)  | `"Eliminar"`                                              | Use confirmation dialog with entity name interpolated.                           |
| Edit / modify         | `"Editar"`                                                |                                                                                  |
| Create / new          | `"Nuevo {entity}"` or `"Crear {entity}"`                  | Choose one per project, apply consistently.                                      |
| Search                | `"Buscar..."` (placeholder)                               | Empty value, placeholder only.                                                   |
| Loading               | `"Cargando..."`                                           | Reserve for inline contexts; prefer `Skeleton` for sections.                     |
| Empty (default)       | `"Sin resultados"` or `"Aún no hay datos"`                | Override per-screen if context calls for it.                                     |
| Error (default)       | `"Algo salió mal. Intenta de nuevo."`                     | Override with specific copy from `10_API_SURFACE.md` error_codes when available. |
| Confirm delete        | `"¿Eliminar {entity}? Esta acción no se puede deshacer."` | Always destructive language for irreversibles.                                   |
| Confirm action        | `"¿Continuar?"` or `"¿Confirmar {action}?"`               |                                                                                  |
| Back / return         | `"Volver"` or `"Regresar"`                                | Pick one per project.                                                            |
| Required field marker | `"*"` (asterisk) + helper text `"Campo obligatorio"`      |                                                                                  |
| Optional field marker | `"(opcional)"` after label                                |                                                                                  |

## 4. Microcopy patterns

### 4.1 Empty states

Format: `{action verb} + {entity context}` + optional CTA.

- `"Aún no has registrado movimientos."` + CTA `"Registrar el primero"` →
- `"No tienes notificaciones pendientes."` (no CTA, terminal state) →
- `"No hay resultados para «{search query}»."` + CTA `"Limpiar filtros"` →

### 4.2 Error states

Format: `{what went wrong} + {what user can do}`.

- `"No se pudo guardar. Revisa tu conexión e intenta de nuevo."` →
- `"Sesión expirada. Vuelve a iniciar sesión."` →
- `"Este {entity} ya no existe. Actualiza la página."` →

### 4.3 Success / confirmation

Format: `{action accomplished} ✓`.

- `"Movimiento guardado."` →
- `"Cambios aplicados."` →
- `"{Entity} eliminado."` →

Always past tense — indicates completion. Avoid "Saving..." → use `"Guardar"` button pending state instead.

### 4.4 Destructive confirmations

ALWAYS interpolate entity name + warn about irreversibility:

```
Title:       "¿Eliminar {entity name}?"
Body:        "Esta acción no se puede deshacer. {Entity} y sus {dependencies} quedarán eliminados permanentemente."
Cancel:      "Cancelar"
Confirm:     "Eliminar"   (variant=destructive)
```

## 5. Number / date / currency format

- **Currency:** `MXN 1,234.56` — peso symbol `$` only if context unambiguous; otherwise `MXN` prefix for clarity. Thousands separator: `,`. Decimal: `.`.
- **Dates:** `DD/MM/YY` for compact UI (tables, badges). `DD de {mes} de YYYY` for full-text contexts (emails, detail pages).
- **Times:** 24h format default (`14:30`). 12h with am/pm only if `project-config.md` says so.
- **Percent:** `12.5%` (decimal with `.`).
- **Plurals:** singular for 1, plural for 0 and 2+: `"1 movimiento"`, `"0 movimientos"`, `"2 movimientos"`.

## 6. i18n preparedness (v1 default: deferred)

v1 of `tk-design` emits **literal es-MX strings**, not i18n keys. Rationale: most starter-kit-derived projects are single-locale at MVP. When the project adds multi-locale support:

- A future `tk-i18n` workflow will scan SCRs and extract keys.
- Until then, copy lives literal in `## 11 Copy` of each SCR.
- Key naming convention if extracted later: `{screen}.{section}.{element}` (e.g., `dashboard.kpi.saldo_total`).

## 7. Anti-patterns

- ❌ `"Por favor, intente nuevamente más tarde"` — too long, too formal, no actionable info.
- ❌ `"Error: error_code_42"` — leaking internal codes to end user.
- ❌ `"Click here"` — never use deictic; describe the action: `"Ver detalle"`.
- ❌ `"You have 5 unread messages"` — first person never appears in UI copy. Recast: `"Tienes 5 mensajes sin leer"` (second person OK in microcopy notifications).
- ❌ Mixing tuteo and ustéo in same screen.
- ❌ Mixing Argentinian voseo (forbidden across all TimeKast projects per global preference rule).

---

_TimeKast Factory — tk-design methodology · Copy Discipline_

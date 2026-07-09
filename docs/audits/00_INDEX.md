# 🔍 Auditoría Profunda Multi-Sesión — Índice Maestro

> **Creado:** 2026-07-09 · **SHA de referencia del framework:** `bcc7f1e`
> **Propósito:** Auditar toda la aplicación en profundidad — flujos correctos, cero emails enviados por error, cero código muerto/duplicado — dividida en 8 auditorías independientes ejecutables una por sesión.

---

## Tabla de estado

| # | Auditoría | Archivo | Estado | Owner/Sesión | Inicio | SHA auditado | Hallazgos 🔴/🟡/🟢 |
|---|-----------|---------|--------|--------------|--------|--------------|---------------------|
| A1 | 📧 Emails y recordatorios | `01_emails_recordatorios.md` | ✅ | fable5-c37b36 | 2026-07-09 10:10 | `9d9c7f2` | 2🔴 12🟡 5🟢 |
| A2 | 🎟️ Ciclo de vida RSVP | `02_rsvp_lifecycle.md` | ⬜ | — | — | — | — |
| A3 | 🎪 Eventos y settings | `03_eventos_settings.md` | ⬜ | — | — | — | — |
| A4 | 🛠️ Panel admin | `04_admin_panel.md` | ⬜ | — | — | — | — |
| A5 | 🧹 Código muerto y duplicado | `05_codigo_muerto_duplicado.md` | ⬜ | — | — | — | — |
| A6 | 🗄️ Datos, queries y schema | `06_datos_queries_schema.md` | ⬜ | — | — | — | — |
| A7 | 🎨 Frontend, flujos y UX | `07_frontend_flujos_ux.md` | ⬜ | — | — | — | — |
| A8 | ⚙️ Build, config y deploy | `08_build_config_deploy.md` | ⬜ | — | — | — | — |
| FS | 🔒 Fase S (separada) | *(se planifica al terminar A1–A8)* | ⬜ BLOQUEANTE | — | — | — | — |

**Estados:** ⬜ pendiente · 🔄 en curso · ✅ completada

> ⚠️ **Fase S es bloqueante:** el proyecto NO se declara "auditado al 100%" ni se cierra `99_CONSOLIDADO.md` sin ejecutarla. Es una fase separada de protección de endpoints y sesiones que se corre al final, en su propia sesión, aceptando el modelo que toque. Ver hallazgos pre-registrados PRE-1/PRE-2 en `99_CONSOLIDADO.md` (ya corregidos por hotfix `bcc7f1e`; Fase S verifica el fix y busca patrones similares).

---

## Protocolo por sesión (lock atómico)

1. **`git pull --ff-only`** — SIEMPRE antes de elegir auditoría.
2. Tomar la **primera auditoría ⬜** de la tabla (orden A1→A8; son independientes, pero el orden refleja prioridad de riesgo).
3. Marcarla **🔄** llenando Owner/Sesión (identificador corto), Inicio (fecha-hora) y SHA auditado (`git rev-parse --short HEAD`). **Commit + push inmediato.** El lock solo se considera adquirido cuando el **push tiene éxito**; si es rechazado → `git pull --ff-only` y re-seleccionar.
4. Ejecutar la auditoría completa siguiendo su MD. **Read-only:** prohibido editar código de la app durante la auditoría — solo se escribe en el propio MD de la auditoría y en este INDEX.
5. Registrar hallazgos y la **tabla de evidencia completa** en el MD (ver reglas abajo).
6. Marcar **✅** en esta tabla con el conteo de hallazgos. Commit + push: `audit: A<N> <nombre> — <X>🔴 <Y>🟡 <Z>🟢`.
7. **Stale-lock:** una auditoría 🔄 cuyo último commit tiene >24h puede ser tomada por otra sesión; anotar el takeover en la columna Owner ("takeover de <owner anterior>").

## Reglas de evidencia (anti checkbox-theater)

- **Todo ítem del checklist requiere evidencia, también cuando PASA:** `archivo:línea` inspeccionado, o comando ejecutado + output relevante.
- Ítems no ejecutados → `⏭️ NOT RUN` + razón explícita (p.ej. "requiere DATABASE_URL local, no disponible").
- **Una auditoría NO puede marcarse ✅ si algún ítem carece de evidencia o de razón NOT RUN.**
- Hallazgo sin evidencia `archivo:línea` no cuenta como hallazgo.
- Hallazgos fuera del scope propio → sección "Hallazgos fuera de scope" del MD, con referencia cruzada a la auditoría dueña (no duplicar).

## Rúbrica de severidad

| Nivel | Criterio |
|-------|----------|
| 🔴 Crítico | Rompe un flujo de usuario o puede provocar un email enviado a quien no corresponde / cuando no corresponde |
| 🟡 Importante | Comportamiento incorrecto en edge case, o deuda que causará bugs (tipos mentirosos, firmas engañosas, lógica duplicada divergente) |
| 🟢 Mejora | Limpieza, consistencia, código muerto, simplificación |

## Contexto compartido del proyecto (para sesiones frías)

- **App:** "Party Time!" — plataforma de invitaciones a eventos con RSVP. Next.js 14 App Router + TypeScript + Drizzle ORM + **Neon PostgreSQL** (migrada desde Firebase). Emails vía **Resend**. Hosting **Vercel Hobby** con deploy automático on push a `main`. **Producción con datos y usuarios reales.**
- **Tablas** (`lib/schema.ts`): `events` (slug, theme JSONB, pricing, capacity, rsvpClosed, reminder config), `rsvps` (name, email, phone, plusOne/plusOneName, status, cancelToken, emailHistory JSONB), `app_settings`, más tablas de usuarios/acceso (`lib/user-queries.ts`).
- ⚠️ **Gotcha conocido:** `rsvps.eventId` (text) almacena el **slug** del evento, no el UUID (`app/api/rsvp/route.ts:49,227`).
- **Cron:** `vercel.json` → `POST /api/cron/send-reminders` cada 12h (`0 */12 * * *`, corre en UTC).
- **Puntos de envío de email (5):** confirmación en `app/api/rsvp/route.ts`; recordatorios cron en `app/api/cron/send-reminders/route.ts`; manuales en `app/api/admin/send-email`, `send-bulk-email`, `send-bulk-reminder`. Templates en `lib/email-template.ts`; cliente en `lib/resend.ts`.
- **Auth de panel:** cookie `rp_session` + `validateSession` (`lib/auth-utils.ts`) + `userHasEventAccess` roles viewer/manager (`lib/user-queries.ts`). El detalle del modelo de auth NO se audita en A1–A8 (Fase S).
- **Historia reciente relevante** (regresiones a vigilar): `5894370` no reminders a eventos pasados/cerrados · `0e7ad21` reminders solo el día agendado · `cc195f8` no duplicados por timeout de cron · `bcc7f1e` auth + scoping de destinatarios en bulk-reminder.
- **Build local:** requiere `RESEND_API_KEY` aunque sea dummy (`RESEND_API_KEY=re_dummy npm run build`) — `lib/resend.ts` instancia el cliente a nivel de módulo.

## Alcance de la fase A (esta)

Corrección funcional, flujos, calidad y limpieza de código. **No incluye** revisión de vulnerabilidades ni protección de endpoints — eso es Fase S, separada y bloqueante. Si durante una auditoría A aparece algo de esa naturaleza, se anota factualmente en "Hallazgos fuera de scope" refiriendo a Fase S, sin profundizar.

## Al terminar las 8

1. Consolidar todos los hallazgos en `99_CONSOLIDADO.md`.
2. Planificar y ejecutar la **Fase S** (bloqueante).
3. Del consolidado sale el **plan correctivo** (con su propio ciclo de review) — ahí es donde por fin se arregla código.

# 🛠️ Plan Correctivo — Party Time!

> **Fase final del framework** (ver `00_INDEX.md` / `99_CONSOLIDADO.md`). Remedia los **133 hallazgos** consolidados (13🔴 70🟡 50🟢) tras A1–A8 + Fase S.
> **Creado:** 2026-07-09 · **SHA base:** `af1361a` · **Estado:** 📋 plan aprobado para ejecución batch-por-batch (NO ejecutado aún).
> **Lineage de review:** draft `~/.claude/plans/partytime-20260709-155431.md` → adversarial review de Codex (thread) → **7 findings incorporados** (esta versión). Cada batch, al ejecutarse, pasa por su propio ciclo de adversarial + post review.

---

## Progreso de ejecución

> Actualizado 2026-07-09 (noche). Ejecución autorizada por José ("tú haz todo").

**Fase 0 (ops):**
- ✅ **OP-1 (FS-04)** — verificado contra prod DB que `info@timekast.mx` (super_admin) tenía `dave1511` **VÁLIDA** (exposición viva). Rotada a password aleatoria fuerte + **12 sesiones activas invalidadas**. `dave1511` ya no funciona. *(Pendiente decisión de José: purgar el string del historial de git.)*
- ✅ **OP-2 (recon)** — `CRON_SECRET` y `CANCEL_TOKEN_SECRET` **están seteados** en Vercel → **FS-03 y FS-05 NO son exposiciones vivas** (solo hardening de código). `NEXT_PUBLIC_BASE_URL` ausente (A8-05); legacy `GOOGLE_CLOUD_*`/`FIRESTORE_COLLECTION_NAME` presentes (A5-02, remover en B16).
- ✅ **OP-4** — branch protection en `main` (check `verify` requerido, `enforce_admins:false`).

**Fase 1:**
- ✅ **B0** (PR #1, `778f9ed`) — CI gate (`.github/workflows/ci.yml`), ESLint, Vitest (3/3), fix A8-01 (build sin `RESEND_API_KEY` pasa). Cierra **A8-01, A8-02, A8-03, A8-08, A8-09**.

**Fase 2:**
- ✅ **B1** (PR #2, `3274b56`) — cierra **FS-01, FS-02, FS-06, FS-18, FS-19/A5-05, FS-27/A4-05** y (vía send-email) **A1-05/A4-04, A1-08, A1-13**; FS-04 lado-código. **Verificado en prod:** upload-image `401`, send-email `401`, update-rsvp `401`, debug-home `404`. Codex post-review: 2 P2 aplicados.

- ✅ **B2/B3 hardening** (PR #3, `82a35fd`) — cron **fail-closed** (FS-03) + constant-time (FS-17, `lib/timing-safe.ts`); login **rate-limit** best-effort (FS-08) + **anti-enumeración** (FS-16). Smoke prod: cron sin secret `401`.
- ✅ **B5 settings** (PR #4, `7390bca`) — **A3-01** (🔴 vivo): GET devuelve `rsvpClosed` → guardar ya no reabre el RSVP; **A3-06**: preserva theme custom.
- ✅ **B8 isEventPast** (PR #5, `0760b50`) — **A4-01** (🔴 vivo): ya no bloquea envíos manuales de eventos futuros; parse ISO local.
- ✅ **B4 rsvp-guards (subset)** (PR #6, `4b72bdb`) — **A2-H01** (🔴 vivo): enforce `rsvpClosed` en POST /api/rsvp; **A2-H15**: evento resuelto en todo path (no más orphan legacy).

**Estado:** **cero exposiciones de seguridad vivas** + todos los 🔴 funcionales cerrables sin migración de DB, cerrados (A3-01, A4-01, A2-H01). 7 PRs merged, cada uno con CI + Codex review.

- ✅ **B7 reminders** (PR #7, `3fc972f`) — **A1-01** (re-arm solo si cambia schedule, decidido server-side), **A1-03** (round-trip datetime-local estable), **A1-02** (timing absoluto `scheduledAt <= now` + gracia 30h). Rollout con flag opt-out `REMINDERS_SEND_ENABLED`: desplegado en dry-run → verificado (0 pendientes; los 4 eventos con reminders past/disabled, ninguno re-dispara) → flag removido → envío real restaurado. 4 iteraciones de Codex review. **Cierra los 🔴 de reminders.**

- ✅ **B4-dedup** (PR #8, `5b4098c`) — **A2-H03** (🔴): cancelado puede re-inscribirse (reactiva row, condicional a status para evitar carrera); **A2-H05/H06**: dedup case-insensitive + **UNIQUE index `(event_id, lower(email))` APLICADO EN PROD** (SQL directo, backup previo, 0 dups verificados); A1-15/FS-23 (cancelToken muerto removido). 1er cambio de schema en prod.

- ✅ **B4-capacity** (PR #9 `6b3991d` + fix PR #10 `d1b2c83`, 2026-07-10) — **A2-H02** (🔴) + FS-11: trigger `rsvps_capacity_check` (BEFORE INSERT/UPDATE OF status, plus_one) con `FOR NO KEY UPDATE` sobre la fila del evento + recuento con snapshot fresco → enforcement exacto bajo concurrencia en TODOS los paths de escritura. 1 asiento por confirmado + 1 por `plus_one`; cancelaciones nunca bloqueadas; renames de slug no disparan capacidad. App: mapeo `CAPACITY_FULL`→409 en 3 rutas + retry único ante deadlock 40P01. **Plan del batch pasó adversarial review de Codex (3 findings, 3 incorporados: orden deploy/migración, NO KEY UPDATE + retry, suite en branch de Neon).** PR #10: drizzle ≥0.44 envuelve errores del driver (`err.cause`) — `unwrapDbError()` arregla la clasificación nueva Y el bug latente del 23505 de PR #8. Validado 16/16 en branch de Neon (clon prod); **trigger aplicado en prod** (backup fresco `~/TimeKast/partytime-backups/json-20260710-183224`); smoke HTTP: POST a evento lleno → 409 con mensaje correcto. ⚠️ Nota ops: `carrillo-fest` estaba YA sobrevendido (63 asientos / límite 50) → queda lleno para nuevos asientos; José decide si sube el límite.

- ✅ **B6-delete-safety** (PR #11 `823b086`, 2026-07-10) — **A3-02+A6-09** (🔴, el ÚLTIMO): FK `rsvps.event_id → events.slug` con `ON UPDATE CASCADE` (renames atómicos) + `ON DELETE RESTRICT` (huérfanos imposibles); `deleteEvent(hard)` = `db.batch(delete rsvps, delete event)` en una tx; `updateEventSlug` conserva el update manual como fallback no-op (finding critical del review: ventana deploy-antes-de-migración). Validado 10/10 en branch de Neon incl. convivencia con el trigger de capacidad; **FK aplicado en prod** con re-verificación de 0 huérfanos inmediatamente previa; smoke: DELETE directo bloqueado por RESTRICT, 4 eventos / 167 rsvps intactos.

- ✅ **B4-guards** (PR #12 `764e478`, 2026-07-10) — **A2-H04** (🟡): el update de invitado era ciego al evento → guard `isSeatAddingChange` (solo cambios que añaden asientos exigen evento activo/abierto; cancelaciones nunca bloqueadas). + retry de deadlock en `updateEventSlug` + **`npm run verify:db`** (verifica trigger/FK/unique/0-huérfanos en cualquier entorno; corrido vs prod 4/4 ✅). Los 3 findings del post-review de Codex sobre #9-#11, incorporados (el del journal: mitigado con verify:db, la normalización sigue en B0.5-formal).

**Estado: 🎉 LOS 13 🔴 DE LA AUDITORÍA CERRADOS (12 PRs, cada uno CI + Codex review + verificación en prod).**

**Gates pendientes (requieren decisión/tiempo):**
- **Cola P1/P2** (B9-B18): mayormente code-only, volumen grande. Incluye los 🔶 parciales: FS-17 (constant-time en cancel-token/login → B2-resto), FS-05 (HMAC del cancel-token con grace window → B2-resto), columna `cancelToken` muerta (B15).
- **B0.5-formal** (journal de migraciones drizzle desincronizado — el contrato slug/id ya quedó RESUELTO de facto con el FK a `events.slug`; el driver sigue neon-http con el patrón trigger/batch validado).
- **Purga de `dave1511` del historial de git**: al final (reescribe historia).

---

## Contexto operacional

- **Estado:** producción (`party.timekast.mx`, eventos reales).
- **Datos en DB:** sí — Neon PostgreSQL con admins, eventos y RSVPs reales (PII). Datos que **no se pueden perder ni duplicar**.
- **Usuarios activos:** sí (admins en el panel; invitados haciendo RSVP y recibiendo emails).
- **Breaking changes:** interno + público (endpoints públicos, envíos de email, migraciones sobre DB viva).
- **Deploy:** Vercel Hobby, auto on-push a `main`. **Sin CI gate hoy** → el plan lo instala primero.

---

## Objetivo

Remediar en **PRs pequeños, aislados, reversibles y verificables**, secuenciados por riesgo (seguridad + flujos vivos primero) y por aislamiento de archivos, **sin big-bang**, sin perder/duplicar datos ni disparar emails indebidos. Cada hallazgo pasa de `⬜` a `✅ corregido en <ref>` o `⏭️ diferido (razón)` en `99_CONSOLIDADO.md`.

---

## Estrategia global

1. **Gate de verificación PRIMERO, con CI real.** Hoy no hay lint/tests y todo push a `main` deploya a prod. B0 instala ESLint + Vitest + **`.github/workflows/ci.yml` con checks requeridos + branch protection** (no basta el runner local — *finding Codex #6*). Criterio: un check fallando **bloquea el merge a main**.
2. **Fundación de datos antes de tocar el schema (B0.5, obligatoria).** Resolver el contrato slug/id y normalizar el sistema de migraciones **antes** de cualquier UNIQUE/FK (*findings #1 y #4*).
3. **PRs chicos por batch, no mega-PR.** Feature branch + PR aunque el deploy sea on-push (revisar diff antes del merge).
4. **Superarchivos serializados.** `lib/queries.ts` y `app/admin/page.tsx` concentran medio catálogo → **máximo un batch por superarchivo por ola**; el resto se paraleliza solo sobre archivos disjuntos.
5. **Fail-closed con precondición verificada.** Antes de desplegar un cambio fail-closed, confirmar la env var en Vercel (Fase 0). **Excepción crítica:** `CANCEL_TOKEN_SECRET` NO se rota/setea en Fase 0 (rompería los links ya enviados) — ver OP-2 (*finding #3*).
6. **Migraciones sobre DB viva: datos-primero.** Todo UNIQUE/FK va precedido de una migración de limpieza idempotente (dedup/reparar huérfanos) verificada en una **branch de Neon** + backup previo (OP-3).
7. **Rollout de reminders con envío deshabilitado por default** (*finding #2*): flag de env / cron pausado durante el deploy del batch de reminders; verificar en branch de Neon; re-habilitar en cambio separado.
8. **Nunca disparar emails reales durante la remediación** (mocks / branch de Neon). Respetar hooks del factory (no `--no-verify`).
9. **Traza en el CONSOLIDADO** al cerrar cada batch.

---

## Fase 0 — Acciones operacionales (NO código, hacer ya)

- **OP-1 — Rotar la contraseña de `info@timekast.mx`** (FS-04); invalidar sus sesiones. `dave1511` está en git.
- **OP-2 — Envs en Vercel prod:**
  - **Setear/rotar libremente** (no rompen links de usuario): `CRON_SECRET`, `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BASE_URL` (A8-05), `FROM_EMAIL` (A8-10), `BLOB_READ_WRITE_TOKEN` (A8-08), `ADMIN_*` (A8-09). Remover legacy `GOOGLE_CLOUD_*`/`FIRESTORE_COLLECTION_NAME` (A5-02).
  - **`CANCEL_TOKEN_SECRET` = VERIFY-ONLY** (leer, no cambiar). Si está seteado y fuerte → OK. **Si está ausente (tokens forjables, FS-05):** NO setearlo aquí — es un cambio acoplado a **B2** (desplegar HMAC + validación dual con grace window aceptando los tokens viejos, y recién entonces setear el secret). *(finding #3)*
- **OP-3 — Backup/snapshot de la DB** antes de cualquier migración (Fase 1 B0.5 en adelante).
- **OP-4 — Habilitar branch protection en GitHub** (checks de CI requeridos para merge a `main`) una vez B0 cree el workflow. *(finding #6)*

---

## Fase 1 — Fundaciones (gate + datos). Sin dependencias de negocio; van primero.

### B0-tooling — A8-01, A8-02, A8-03, A8-08, A8-09
- Archivos: `package.json`, `.eslintrc*`, `lib/resend.ts` (lazy init como `lib/db.ts`), `vitest.config` + `tests/`, **`.github/workflows/ci.yml`**, `.env.example`, `README.md`/`SETUP_GUIDE.md`.
- Cambio: ESLint usable en CI; Vitest + tests de humo de helpers puros; `lib/resend.ts` deja de instanciar a nivel módulo (arregla build frío A8-01); **workflow de CI con lint+test+build como checks requeridos**; `.env.example`/docs completos.
- Verificación: `RESEND_API_KEY` ausente → `npm run build` pasa; CI corre y **bloquea merge** si falla (requiere OP-4).

### B0.5-migration-foundation — A6-01+A8-07, A6-14, A6-04/A1-11, **decisión de driver** (A1-12). ⚠️ PREREQUISITO DURO de B4, B6, B15. *(findings #1, #4, #7)*
- Archivos: `drizzle/` (journal/snapshot), `lib/schema.ts` (documentar contrato, no aún constraints), `lib/db.ts` (driver).
- Cambio (decisiones + normalización, sin constraints todavía):
  1. **Elegir UN mecanismo** (migraciones XOR `db:push`) y **sincronizar el journal/snapshot** con el estado real de prod; criterio: `drizzle-kit generate` produce **diff vacío** contra el baseline.
  2. **Resolver el contrato slug/id** (A6-14): definir si `rsvps.event_id` referenciará `events.slug` (requiere UNIQUE en slug + `ON UPDATE CASCADE`) o se migra a `events.id`. Documentar la firma real de `getEventBySlug`/`getRSVPsByEvent` (A6-04/A1-11).
  3. **Decisión de driver** (A1-12): `neon-http` no soporta transacciones interactivas. Para las invariantes atómicas que vienen (capacidad B4, FK/cascade B6, `recordEmailSent` B9, `updateEventSlug`), decidir entre `@neondatabase/serverless` (Pool + tx) o SQL atómico de una sola sentencia (INSERT condicional / advisory locks). Elegir aquí, una vez.
- Riesgo: alto conceptual, bajo de runtime (no cambia comportamiento; prepara el terreno). El diff-vacío es el gate.

---

## Fase 2 — P0 Seguridad (5 FS 🔴 + endpoints). OP-2 confirmado antes de los fail-closed.

### B3a-auth-helper — A5-17, A5-19/FS (extraer patrón auth). ⚠️ VA ANTES de B1. *(finding #5)*
- Archivos: helper de auth compartido (nuevo, ej. `lib/require-auth.ts`), refactor de equivalencia en las 17 rutas, borrar `lib/auth.ts` muerto.
- Cambio: un solo helper `requireSession`/`requireEventAccess(role)` que reemplaza el patrón copiado (la divergencia causó `bcc7f1e`). Refactor de equivalencia verificado ruta por ruta.
- Verificación: tests de auth por ruta (sin cambio de comportamiento observable).

### B1-sec-endpoints — FS-01, FS-02, FS-18, FS-06, FS-27/A4-05, FS-19/A5-05; **fusiona A1-05+A4-04, A1-08, A1-13** (mismo archivo send-email). Depende de B3a.
- Archivos: `app/api/admin/upload-image/route.ts`, `send-email/route.ts`, `update-rsvp/route.ts`, `debug-home/route.ts`.
- Cambio: upload-image con gate sesión+manager (vía B3a) + slug sanitizado + key server-side; send-email exige RSVP existente, deriva destinatario/tipo de la DB, permiso incondicional, orden send→record sin 500 post-send, usa `displayTitle`; update-rsvp con allowlist de campos; debug-home gate/borrado.
- Verificación: tests negativos (sin cookie→401, viewer→403, rsvpId inexistente→404 sin send).

### B2-sec-cron-token — FS-03, FS-17(cron), FS-05, FS-23, FS-26, A1-16. ⚠️ `lib/queries.ts` (serializar con B4/B7/B9). Acoplado a OP-2 (CANCEL_TOKEN_SECRET).
- Archivos: `app/api/cron/send-reminders/route.ts`, `lib/queries.ts` (token fns).
- Cambio: cron fail-closed sin `CRON_SECRET` + constant-time + borrar rama muerta `x-vercel-cron-secret`; cancel-token → HMAC con secret **obligatorio**, constant-time, expiración firmada; **validación dual (grace window)** aceptando tokens viejos mientras se completa la transición, y solo después setear `CANCEL_TOKEN_SECRET` (OP-2); normalizar la columna `cancelToken` muerta (coordinar con B4).
- Verificación: cron 200/401 según secret; tokens nuevos válidos; tokens viejos válidos durante el grace; plan de fin-de-grace documentado.

### B3b-session-hardening — FS-07, FS-08, FS-16, FS-12, FS-21. Después de B1.
- Archivos: `lib/auth-utils.ts`, `app/api/auth/login/route.ts`, `middleware.ts` (nuevo).
- Cambio: hardening `super_admin_env` (sesión revocable / re-verificación), rate-limit + lockout en login, mensajes/timing anti-enumeración, anti-CSRF (token u origin check) en mutaciones admin, invalidación de sesiones / "cerrar todas".
- Verificación: rate-limit efectivo; CSRF rechazado; login uniforme.

---

## Fase 3 — P0 Funcional (8 A-series 🔴). B0.5 completa antes de constraints.

### B4-rsvp-guards — A2-H01+A1-09, A2-H02/FS-11, A2-H03, A2-H04, A2-H14, A2-H15, A2-H05+H06+A6-11 (dedup), A2-H12. ⚠️ `lib/queries.ts`+`lib/schema.ts` (serializar). Depende de B0.5.
- Cambio: guards de `rsvpClosed`/`isActive`/fecha en POST y update; rechazar sin `eventSlug`; dedup case-insensitive+trim con `UNIQUE (event_id, lower(email))` (previa limpieza de datos); email validado en update.
- **Capacidad (A2-H02) = operación ATÓMICA** (INSERT condicional `WHERE (SELECT count)<limit` / counter+check / advisory lock, según driver de B0.5), NO count-then-insert a nivel app — si no, sigue habiendo overbooking + emails bajo concurrencia. *(finding #7)*
- Verificación: matriz de casos (cerrado/lleno/pasado/duplicado/cancelado) + **tests de concurrencia** en branch de Neon; sin emails reales.

### B5-settings-integrity — A3-01, A3-05, A3-06, A3-08.
- Archivos: `event-settings/route.ts`, `admin/event-settings/update/route.ts`.
- Cambio: GET incluye `rsvpClosed`/mensaje (no reabrir al guardar) + 404 para inexistentes; full-save no pisa theme/contact; editar host*.
- Verificación: guardar con `rsvpClosed=true` mantiene cerrado; theme custom sobrevive.

### B6-delete-safety — A3-02+A6-09, A3-10. ⚠️ Depende de B0.5 (contrato FK). *(finding #1)*
- Archivos: `lib/schema.ts` (FK con target/`ON UPDATE`/`ON DELETE` definidos en B0.5), `lib/queries.ts` (deleteEvent → soft-delete), `events/[slug]/route.ts`.
- Cambio: FK o soft-delete que no deja huérfanos (target y cascade según B0.5); separar los 3 estados de `isActive`. Reparar huérfanos existentes antes de aplicar el FK.
- Verificación: borrar evento no deja RSVPs heredables; huérfanos reparados; migración corre limpio en branch de Neon.

### B7-reminder-core — A1-01, A1-02+A6-06, A1-04, A1-03. ⚠️ `lib/queries.ts`+`app/admin/page.tsx` (serializar). **Rollout con envío deshabilitado.** *(finding #2)*
- **Guard de rollout:** introducir flag `REMINDERS_SEND_ENABLED` (default OFF) o pausar el cron en `vercel.json` durante el deploy; el cron nuevo NO envía hasta verificar.
- Cambio: `clearSentStatus` no re-arma en cada guardado (A1-01); query del cron con cota `<= now` y hora correcta (A1-02+A6-06); restaurar filtro de eventos pasados (A1-04); arreglar desfase +6h del datetime-local (A1-03).
- Verificación: tests de la ventana de reminder (MX/UTC, evento pasado, re-guardado post-envío); **dry-run del cron en branch de Neon con envío OFF**; re-habilitar envío en cambio separado y monitoreado.

### B8-admin-isEventPast — A4-01. ⚠️ `app/admin/page.tsx` (serializar con B7/B12).
- Cambio: reemplazar `isEventPast` (texto sin año) por comparación robusta con `events.date` normalizada; desbloquea envíos manuales legítimos.

---

## Fase 4 — P1 (🟡 flujos vivos). Batches por subsistema; colisión-serializados.

- **B9-email-correctness** — A1-06, A1-07, A1-10+A6-12, A1-14+A5-16, A2-H13, A2-H11. `lib/queries.ts` (serializar), senders, `email-template.ts`. Helper `EventData`/`isReminder` compartido; `recordEmailSent` atómico (driver B0.5); reintento/alerta de reminders perdidos; paginación del cron; `emailHistory` con dirección; reemitir link al cambiar email.
- **B10-rsvp-p1** — A2-H07, A2-H08, A2-H09. `rsvp/get`, `update-rsvp`, normalización.
- **B11-settings-p1** — A3-04, A3-07, A3-09, A3-11. `events/[slug]` (OG rename real en blob), `page.tsx`, `[slug]/layout.tsx`.
- **B12-admin-ux-p1** — A4-02, A4-03, A4-06, A4-08, A4-09. `app/admin/page.tsx` (serializar con B7/B8).
- **B13-frontend-a11y** — A7-H01..H07. `[slug]/page.tsx`, `cancel/[rsvpId]/page.tsx`, `RSVPModal.tsx`, `app/layout.tsx`.
- **B14-cron-schedule** — A8-04, A8-05, A8-06. `vercel.json` (schedule dentro de spec Hobby o decidir upgrade Pro), unificar var de URL pública.

---

## Fase 5 — P2 estructural + limpieza (🟢).

- **B15-schema-structural** — A6-08/A6-16 (índices + UNIQUE assignments), A1-12 (updateEventSlug tx, driver B0.5), A5-13+A6-02 (tipo Event), A6-05 (JSONB validation), A1-15+A2-H10+A6-10 (columna cancelToken). ⚠️ Depende de B0.5. (El sub-ítem de mecanismo/journal y contrato ya está en B0.5.)
- **B16-deadcode** — A5-01/02/03/04/05/10/11/12, A5-14+15+A6-03, A5-19, A5-21, A4-10+A5-20, A4-11, A4-12+A6-13. Borrados; mayormente disjunto → paralelizable salvo lo que toca `queries.ts`.
- **B17-docs-artifacts** — A5-07, A5-08, A5-09, A8-11, A8-12. Binarios versionados, comandos MD, MDs históricos, manifest/íconos PWA.
- **B18-cleanup-resto** — A1-16..19, A2-H16, A3-12..16, A4-13/14/15, A5-18, A7-H08..H11, A3-13, A8-10, y **A4-16 (refactor del monolito admin, al final, acotado)**.

---

## Orden de ejecución y paralelización (revisado post-Codex)

1. **Fase 0 (ops)** — OP-1..OP-4. OP-2 (excepto `CANCEL_TOKEN_SECRET`) y OP-4 antes de las fases de código.
2. **B0-tooling** → solo, primero (gate de CI). **B0.5-migration-foundation** → segundo, **obligatorio antes de B4/B6/B15** (contrato + journal + driver; gate = diff generado vacío).
3. **Ola Seguridad:** **B3a** (helper) → **B1** ∥ (nada más sobre esos archivos) → **B2** (queries.ts) → **B3b** (session). *(B1 y B3b ya NO en paralelo — finding #5.)*
4. **Ola Funcional:** B5 ∥ B6(post-B0.5) → **B4** (queries.ts+schema) → **B7** (queries.ts+admin, envío OFF) → **B8** (admin).
5. **Fases 4–5:** batches disjuntos en paralelo; carril serializado para `queries.ts` (B9, B15) y `app/admin/page.tsx` (B12, B18).
6. **Regla dura de ola:** máximo un batch tocando `lib/queries.ts` y uno tocando `app/admin/page.tsx` por ola. Subagentes paralelos solo sobre archivos disjuntos. Cada batch: branch → subagente de dominio → verificación (CI verde + revisión de diff) → PR/merge → traza en CONSOLIDADO → trust-but-verify del orquestador.

---

## Riesgos identificados

1. **Email masivo accidental** (B2/B7/B9) — mitigado por B0 (CI), flag `REMINDERS_SEND_ENABLED` OFF en rollout, dry-run en branch de Neon.
2. **Migración que falla/corrompe** sobre datos vivos (B4/B6/B15) — mitigado por B0.5 (contrato+mecanismo), OP-3 backup, limpieza idempotente previa, branch de Neon.
3. **Fail-closed que rompe prod** sin la env (B2) — mitigado por OP-2 confirmado; y `CANCEL_TOKEN_SECRET` con grace window (no rotar en Fase 0).
4. **Links de cancelación invalidados** — mitigado por validación dual en B2 antes de setear el secret.
5. **Refactor del helper de auth** (B3a) como fuente de regresión en 17 rutas — refactor de equivalencia + tests por ruta, ANTES de B1.
6. **Deploy on-push sin gate** hasta B0 — mitigado por B0 + OP-4 (branch protection) primero.
7. **Colisión de superarchivos** — regla dura de un-batch-por-superarchivo-por-ola.
8. **Capacidad raceable** (B4) — invariante atómica de DB, no count-then-insert.
9. **Alcance (133) → fatiga/regresión** — fases con corte; P0 aporta el grueso del valor de riesgo; 🟢 diferibles.

---

## Fuera de scope
- Re-auditar (la auditoría está cerrada).
- Rediseño de producto más allá de separar estados de `isActive`.
- Ejecutar el upgrade Vercel Pro (se decide en B14).
- Refactor del monolito admin más allá de lo acotado (B18/A4-16).

---

## Métrica de éxito
- CI gate vivo (lint+test+build, bloquea merge) tras B0.
- B0.5 con diff-vacío antes de cualquier constraint; contrato slug/id y driver decididos.
- Los 13🔴 cerrados y verificados antes de los 🟡; los 5 FS 🔴 + Fase 0 primero.
- Cada batch: PR aislado, CI verde, IDs marcados `✅ corregido en <ref>` en el CONSOLIDADO.
- Cero email indebido / pérdida de datos durante la remediación.
- Al cierre: `99_CONSOLIDADO.md` sin filas `⬜` (todo ✅ o ⏭️ con razón).

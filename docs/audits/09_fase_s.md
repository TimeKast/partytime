# A(FS) 🔒 Fase S — Protección de endpoints y sesiones

> **Fase bloqueante y separada** del framework (ver `00_INDEX.md`). Read-only estricto: cero writes a código de app, cero requests que disparen emails/writes en producción. Solo análisis estático + git + grep.
> **Inicio:** 2026-07-09 14:58 · **SHA auditado:** `55a15d4` · **Owner/Sesión:** fable5-FS-526dc9
> **Plan de metodología (revisado por Codex):** `~/.claude/plans/partytime-20260709-145728.md`
> **Ejecución:** 4 subagentes read-only en paralelo (Sub-A..D), consolidados y re-verificados por el orquestador (trust-but-verify: cada hallazgo 🔴 releído en `archivo:línea`).
> **Post-review de Codex (2026-07-09):** confirmó 5/6 críticos; **refutó FS-02** (overwrite/traversal no se sostiene: key con `Date.now()` + `@vercel/blob` `allowOverwrite:false` por defecto → degradado a 🟢) y **detectó un miss** (`update-rsvp` mass-assignment → **FS-27** 🟡). Registro corregido en consecuencia. Totales finales: **5🔴 14🟡 8🟢**.

---

## Calibración de severidad (ajuste de seguridad de la rúbrica del INDEX)

La rúbrica del INDEX es funcional (email/flujo). Para Fase S se aplica una lectura de seguridad de los mismos tres niveles:

| Nivel | Criterio Fase S |
|-------|-----------------|
| 🔴 Crítico | Directamente explotable para acceso no autorizado, fuga de PII, email a quien/cuando no corresponde, o abuso de costo — **sin requerir otro compromiso previo**. |
| 🟡 Importante | Explotable solo con precondiciones, o control de defensa-en-profundidad ausente. |
| 🟢 Mejora | Higiene, código muerto, inconsistencia sin explotación práctica. |

Los hallazgos condicionados a config de entorno (`CRON_SECRET`, `CANCEL_TOKEN_SECRET`) se marcan 🔴 **por el defecto de diseño (fail-open / secreto público por defecto)**, que debe corregirse a fail-closed independientemente del valor real en Vercel — no verificable desde el repo.

---

## Verificación del hotfix `bcc7f1e` (PRE-1 / PRE-2)

**PRE-1 (`send-bulk-reminder` sin sesión + envío cross-evento): ✅ VERIFICADO** con trace de orden-de-llamada. Sinks `resend.emails.send` (`send-bulk-reminder/route.ts:140`) y `recordEmailSent` (`:153`) viven en el loop que arranca en `:109`, **después** de todos los early-returns: sin cookie → 401 (`:26`); sesión inválida → 401 (`:31`); evento inexistente → 404 (`:61-65`); rol insuficiente → `userHasEventAccess(event.id,'manager')` → 403 (`:70,:72`); `rsvpIds` cross-evento → recortados vía `getRSVPsByEvent(event.slug)` en un Map (`:105-106,:111-116`), el `if (!rsvp) continue` descarta IDs ajenos. Scoping coherente con el gotcha SLUG.

**PRE-2 (`reminder-status` filtraba PII sin sesión): ✅ VERIFICADO.** El mapeo con PII arranca en `reminder-status/route.ts:70`; precedido por 401 (`:22`), 401 (`:27`), 404 evento inexistente (`:52-57`), 403 `userHasEventAccess(...,'viewer')` (`:60,:62`).

Ambos PRE quedan **cerrados** en `99_CONSOLIDADO.md`.

---

## Tabla de evidencia — matriz de superficie (28 rutas)

No existe `middleware.ts` global (verificado: `find . -name middleware.*` vacío) → cada ruta se auto-protege.

| # | Ruta | Métodos | Intención | Protección observada (archivo:línea) | Riesgo |
|---|------|---------|-----------|--------------------------------------|--------|
| 1 | `admin/add-demo-data` | POST | admin-super | sesión + `role!=='super_admin'→403` (`:68-71`) | 🟢 |
| 2 | `admin/event-settings/update` | POST | scoping evento (W) | sesión (`:21-24`) + slug→id + `userHasEventAccess(id,'manager')` (`:43-61`) | 🟢 |
| 3 | `admin/reminder-status` | GET | scoping evento (R) | sesión (`:25-28`) + `userHasEventAccess(id,'viewer')` (`:51-64`) | 🟢 |
| 4 | `admin/send-bulk-email` | POST | scoping evento (W) | sesión (`:19-22`) + `userHasEventAccess(id,'manager')` (`:63-69`) + filtro rsvpIds (`:79-82`) | 🟢 |
| 5 | `admin/send-bulk-reminder` | POST | scoping evento (W) | sesión (`:29-32`) + `userHasEventAccess(event.id,'manager')` (`:68-74`) + Map scope (`:105-116`) | 🟢 |
| 6 | `admin/send-email` | POST | scoping evento (W) | sesión (`:19-22`) + check **anidado en `if(rsvp)`** (`:39-50`) → **bypass** | 🔴 FS-06 |
| 7 | `admin/settings` | GET/POST | admin global | GET: **solo sesión, sin super_admin** (`:23-26`); POST: super_admin (`:64-66`) | 🟡 FS-14 |
| 8 | `admin/update-rsvp` | POST | scoping evento (W) | sesión (`:16-19`) + `userHasEventAccess(id,'manager')` (`:40-58`) OK, pero `updates` sin allowlist (`:61`) | 🟡 FS-27 |
| 9 | `admin/upload-image` | POST | admin (blobs) | **NINGUNA** — sin `validateSession`, sin token (`:15-33`) | 🔴 FS-01 (+🟢 FS-02) |
| 10 | `admin/users/[id]/events` | GET/POST/DELETE | gestión usuarios | super_admin en los 3 (`:28-34,:78-84,:144-150`) | 🟢 |
| 11 | `admin/users/[id]` | GET/PUT/DELETE | gestión usuarios | super_admin (`:28-34,:86-92,:153-159`); PUT sin guard self-demote (`:100-111`) | 🟡 FS-15 |
| 12 | `admin/users` | GET/POST | gestión usuarios | super_admin (`:24-30,:75-81`) | 🟢 |
| 13 | `admin/validate` | GET | auth | `validateSession` (`:19-22`) | 🟢 |
| 14 | `auth/login` | POST | pública side-effect | credenciales; **sin rate limiting** (`:33-63`) | 🟡 FS-08 |
| 15 | `auth/logout` | POST | auth | `destroySession(token)` (`:16-19`) | 🟢 |
| 16 | `auth/me` | GET | auth | `validateSession` (`:25-35`) | 🟢 |
| 17 | `cron/send-reminders` | GET/POST | cron | **condicional** `if(cronSecret)` — abierto si falta (`:27-37`) | 🔴 FS-03 |
| 18 | `debug-home` | GET | debug | **NINGUNA** — expone config (`:8-22`) | 🟢 FS-19 |
| 19 | `event-settings` | GET | scoping evento (R) | sesión (`:20-27`) + `userHasEventAccess(id,'viewer')` (`:39-47`) | 🟢 |
| 20 | `events/[slug]` | GET/PUT/DELETE | GET pública / W auth | GET público (`:64`); PUT `manager` (`:167-172`), slug-change super_admin (`:184-189`); DELETE super_admin (`:276-278`) | 🟢 |
| 21 | `events` | GET/POST | GET auth-scoped / POST super | GET sesión + filtra por asignaciones (`:40-49`); POST super_admin (`:89-91`) | 🟢 |
| 22 | `og-image/[slug]` | GET | pública | pública; `fetch(imageUrl)` server-side de BD (`:227`) | 🟡 FS-13 |
| 23 | `og/[slug]` | GET | pública | pública; solo lee datos evento (`:11-31`) | 🟢 |
| 24 | `rsvp/cancel` | POST | pública side-effect | `validateCancelToken` (`cancel:17`, `queries:118`) | 🟢 (token: FS-05) |
| 25 | `rsvp/get` | GET | pública (PII RSVP) | `validateCancelToken(token,rsvpId,email)` (`:30-37`) | 🟢 (token: FS-05) |
| 26 | `rsvp` | POST/GET | POST pública / GET auth | POST público, sin rate limit (`:15`); GET sesión + `userHasEventAccess(id,'viewer')` (`:220-225`) | 🟡 FS-09 |
| 27 | `rsvp/update` | POST | pública side-effect | `validateCancelToken(token,rsvpId,rsvp.email)` (`:27-34`) | 🟢 (token: FS-05) |
| 28 | `stats` | GET | scoping evento (R) | sesión (`:20-23`) + `userHasEventAccess(id,'viewer')` (`:36-41`) | 🟢 |

**Positivo (defensa central sólida):** el patrón de scoping por evento — resolver `slug → event.id` y llamar `userHasEventAccess` con el rol correcto (viewer lectura / manager escritura) — está aplicado **consistente y correctamente** en los 10 endpoints scoped; gestión de usuarios exige super_admin uniformemente; **no se detectó IDOR clásico** ni escalada horizontal menor→mayor. Los críticos son endpoints que se **saltan** el gate (upload-image), lo hacen **condicional** (cron), o lo tienen **mal anidado** (send-email) — no fallos en la lógica de autorización central. Queries 100% Drizzle parametrizado (sin SQL injection). `.env*` fuera de git (solo `.env.example` con placeholders).

---

## Hallazgos

### 🔴 Críticos

**[FS-01] 🔴 `upload-image` POST sin autenticación alguna**
`app/api/admin/upload-image/route.ts:15-60`. Único endpoint bajo `/api/admin/**` sin gate: va de `formData()` (`:17`) a `put(filename, file, { access:'public' })` (`:57`) sin `validateSession`/token/cookie. Cualquiera (anónimo) sube hasta 10MB por request a Vercel Blob público, path predecible `events/{eventSlug}-{timestamp}.{ext}` (`:54`). Abuso de costo/almacenamiento + hosting de contenido arbitrario en el dominio del proyecto. *(Sub-A FS-S3-01 = Sub-B FS-S1-01 = Sub-D FS-S3b-01.)*

**[FS-03] 🔴 Cron `send-reminders` fail-open si `CRON_SECRET` no está seteado**
`app/api/cron/send-reminders/route.ts:27`. Toda la validación está envuelta en `if (cronSecret)`; si la env var falta/está vacía, se salta (`:28-37`) y el endpoint queda **abierto** en GET y POST → disparo no autorizado del loop de envío masivo (`resend.emails.send` `:158`) a todos los confirmados con recordatorio pendiente. **Defecto de diseño (fail-open) = 🔴 independientemente del valor real en Vercel;** debe fallar-cerrado. Comparación además con `===` no constant-time (`:28-29`). *(Sub-A FS-S3-04 = Sub-B FS-S1-02 = Sub-D FS-S7-01. Orquestador confirmó `:27`.)*

**[FS-04] 🔴 Contraseña de super-admin hardcodeada y commiteada**
`scripts/create-super-admin.ts:27-28` → `email='info@timekast.mx'`, `password='dave1511'`, `role:'super_admin'`, `isActive:true`. Credencial de administrador **conocida y versionada en el historial de git**. Si el script se corrió en prod (su propósito es bootstrapear el admin), esa cuenta tiene esa contraseña salvo rotación posterior. *(Sub-D FS-S7-02. Orquestador confirmó por lectura directa.)* **→ Acción operacional recomendada YA (ver abajo), no esperar al plan correctivo.**

**[FS-05] 🔴 `CANCEL_TOKEN_SECRET` con default público `'default-secret'` → cancel-tokens forjables**
`lib/queries.ts:189` (y `lib/firestore.ts:187`). `generateCancelToken = sha256(rsvpId-email-secret).substring(0,32)`, determinista; el secreto cae a `'default-secret'` si la env falta. `rsvpId` viaja en URLs `/cancel/{rsvpId}` y respuestas API. Con el default (o secreto filtrado), conociendo `rsvpId+email` cualquiera forja el token y **cancela/edita/lee (`/api/rsvp/get`) el RSVP ajeno** (PII: nombre, email, teléfono) sin sesión. Gobierna `rsvp/cancel`, `rsvp/update`, `rsvp/get`. **Defecto de diseño = 🔴;** verificar `CANCEL_TOKEN_SECRET` en Vercel. *(Sub-C FS-S5-02 = Sub-B FS-S4-05 = Sub-D FS-S7-03. Orquestador confirmó `:189`.)*

**[FS-06] 🔴 `send-email` omite el check de permiso con `rsvpId` inexistente + destinatario body-controlado**
`app/api/admin/send-email/route.ts`. El check `userHasEventAccess(...,'manager')` (`:46-48`) está **anidado dentro de `if (rsvp && rsvp.eventId)`** (`:39`). Con un `rsvpId` inexistente, `rsvp` es null → se **omite el check por completo** → el handler continúa y ejecuta `resend.emails.send({ to: email })` (`:117`) con `email` tomado del body (`:26`). Resultado: **cualquier usuario autenticado (incluido un viewer sin acceso a ningún evento) puede enviar correos con el dominio Resend de la app a una dirección arbitraria** pasando un rsvpId falso. Aun con rsvpId válido, `to` no se re-deriva del RSVP → un manager envía a destinatario arbitrario. Viola el norte del framework ("cero emails a quien no corresponde"). Precondición: sesión válida (usuario del panel). *(Sub-A FS-S3-02, elevado de 🟡→🔴 por el orquestador tras confirmar el skip del check en `:39`.)*

### 🟡 Importantes

**[FS-07] 🟡 Sesión `super_admin_env` sobrevive a la rotación de credenciales**
`lib/auth-utils.ts:105-119` + `app/api/auth/login/route.ts:70-81`. `validateSession` concede `super_admin` a cualquier fila `userSessions` con `userId==='super_admin_env'` (usuario sintético, `isActive:true` hardcodeado) sin re-verificar `ADMIN_EMAIL/ADMIN_PASSWORD`. Cambiar/rotar la contraseña del super admin **no revoca** sesiones activas (24h / 30d), no hay forma de desactivar/auditar esa identidad (no existe en tabla `users`). *(Sub-C la marcó 🔴; el orquestador la baja a 🟡: requiere un compromiso previo de la sesión/credencial para materializar daño; no rompe un flujo ni envía email por sí sola. Login SÍ es fail-closed ante credenciales vacías por el `&&` en `:54`.)*

**[FS-08] 🟡 Login sin rate limiting ni lockout**
`app/api/auth/login/route.ts` (handler completo, sin gate; grep negativo de rate-limit/upstash/kv en `package.json`). Fuerza bruta / credential stuffing online sin fricción contra el panel; bcrypt cost 12 mitiga offline, no online. Interacción grave con FS-04 (para `info@timekast.mx` la contraseña ya es conocida). *(Sub-C FS-S5-03 = Sub-B FS-S4-09 = Sub-D FS-S3b-02.)*

**[FS-09] 🟡 Endpoint público `POST /api/rsvp` sin rate limit / anti-automation / cap de payload**
`app/api/rsvp/route.ts:15-146`. No autenticado, inserta RSVP y dispara `resend.emails.send` (`:119`) + `recordEmailSent` (`:128`). Sin rate limiting, sin CAPTCHA/honeypot, sin límite de tamaño de JSON. 10.000 RSVPs automatizados → quema de cuota Resend + inflado de DB. *(Sub-D FS-S3b-02/FS-S6-02.)*

**[FS-10] 🟡 Dup-check de RSVP no atómico (carrera de doble-submit)**
`lib/queries.ts:28-38` hace SELECT-luego-INSERT; la tabla `rsvps` **no** tiene unique constraint en `(email, eventId)` (`lib/schema.ts:79-107`: solo PK en `id`). Dos requests concurrentes pasan ambos el SELECT → RSVPs duplicados + doble email de confirmación. *(Sub-D FS-S3b-03. Orquestador confirmó el schema.)* Relacionado con hallazgos de A2 sobre duplicados.

**[FS-11] 🟡 Capacidad del evento nunca se aplica**
Columnas `capacityEnabled`/`capacityLimit` existen (`lib/schema.ts:29-30`) pero `saveRSVP` (`lib/queries.ts:17-57`) y `POST /api/rsvp` nunca las consultan → eventos con cupo se sobrevenden indefinidamente. *(Sub-D FS-S3b-04.)*

**[FS-12] 🟡 Sin protección anti-CSRF en mutaciones admin (solo `sameSite:lax`)**
`lib/auth-utils.ts:176`; ausencia de token CSRF en todo el repo. POST/PUT/DELETE admin (borrar usuarios, cancelar RSVPs, enviar emails masivos) confían solo en la cookie + `sameSite:lax`. `lax` mitiga POST cross-site top-level pero no es defensa completa (subdominios, futuros GET mutadores). Defensa-en-profundidad ausente. *(Sub-C FS-S5-06.)*

**[FS-13] 🟡 `og-image/[slug]` hace fetch server-side de URL de BD (SSRF acotado)**
`app/api/og-image/[slug]/route.ts:227-228`. La ruta pública hace `fetch(imageUrl, {redirect:'follow'})` con `imageUrl` = `event.ogImageUrl || event.backgroundImageUrl` de la BD. Un manager puede setear `ogImageUrl` a una URL interna → proxy SSRF (sondeo de red interna por latencia/errores). Acotado: solo devuelve si `Content-Type` es `image/*` y ≤5MB, y requiere manager para escribir la URL. Considerar allowlist de hosts. *(Sub-B FS-S1-08.)*

**[FS-14] 🟡 `GET /api/admin/settings` legible por cualquier sesión (rol laxo)**
`app/api/admin/settings/route.ts:23-26` vs POST `:64-66`. GET solo exige sesión; un viewer/manager lee `home_event_id`. Incoherente con la intención "admin global". *(Sub-B FS-S4-04.)*

**[FS-15] 🟡 `PUT /api/admin/users/[id]` sin salvaguarda de auto-degradación / último super_admin**
`app/api/admin/users/[id]/route.ts:100-111`. Un super_admin puede cambiar su propio `role` (o el de otros super_admins) a viewer sin restricción (a diferencia del DELETE que bloquea auto-desactivación en `:162-167`) → lockout accidental del único super_admin. Integridad/operacional, no escalada menor→mayor. *(Sub-B FS-S4-03.)*

**[FS-16] 🟡 Enumeración de usuarios por status code y timing**
`app/api/auth/login/route.ts:46-51` (403 `'Cuenta desactivada'` revela que el email existe) vs 401 `'Credenciales inválidas'`; y `bcrypt.compare` (`:37`) solo se ejecuta si el email existe → señal de timing. *(Sub-C FS-S5-04.)*

**[FS-17] 🟡 Comparaciones de secretos no constant-time**
`crypto.timingSafeEqual` no se usa en ningún lado. Password super-admin env `===` (`login:54-55`), secreto de cron `===` (`cron:28-29`), cancel-token `token === expectedToken` (`queries.ts:197`). Fuga de timing (bajo, agravado por FS-08 sin rate limit). *(Sub-C FS-S5-05 + Sub-D FS-S7-04.)*

**[FS-18] 🟡 `upload-image` valida MIME por `file.type` (spoofeable), no por contenido**
`app/api/admin/upload-image/route.ts:36-41`. Sin verificación de magic-bytes → contenido arbitrario servido como imagen pública. *(Sub-D FS-S6-03.)*

**[FS-21] 🟡 No se invalidan sesiones previas al hacer login (sin "cerrar todas las sesiones")**
`app/api/auth/login/route.ts:70-81,95-104` (createSession siempre inserta fila nueva); logout solo borra la sesión actual (`logout:18`). No hay revocación global → ante compromiso, no se pueden revocar sesiones robadas salvo esperar expiración. *(Sub-C FS-S5-08.)*

**[FS-27] 🟡 `update-rsvp` mass-assignment: `updates` del body pasa sin allowlist a `updateRSVP` (firma mentirosa)**
`app/api/admin/update-rsvp/route.ts:22-23,61`. El body `updates` (runtime `any`) se pasa directo a `updateRSVP(rsvpId, updates)`. `updateRSVP` (`lib/queries.ts:90-99`) **declara** el tipo seguro `Partial<Pick<RSVP,'name'|'email'|'phone'|'plusOne'|'plusOneName'|'status'>>` pero los tipos de TS **se borran en runtime**: `db.update(rsvps).set(data)` escribe cualquier columna presente en el objeto. Un manager (con acceso al evento **origen** del RSVP) puede incluir `eventId` (mover el RSVP a otro evento que no gestiona → ruptura de aislamiento entre eventos), o `emailHistory`/`cancelToken`/`createdAt` (falsificar historial de envíos, invalidar/secuestrar el link de cancelación). Precondición: sesión con rol manager en el evento origen. *(Miss detectado por el post-review de Codex; el orquestador lo verificó y lo agrega. Bajo la calibración de seguridad = 🟡 por requerir privilegio manager; sería 🔴 en modelo multi-tenant estricto. Cruza con la clase "tipos mentirosos" A5-13 + A6-02.)* **Fix:** allowlist server-side de campos mutables; rechazar `eventId`, `id`, `emailHistory`, `cancelToken`, timestamps.

### 🟢 Mejoras

**[FS-19] 🟢 `debug-home` GET sin auth expone configuración interna** — `app/api/debug-home/route.ts:8-22`. Devuelve `home_event_id`, id/slug/title/isActive del evento home y `legacyId`. Sin PII; endpoint de debug dejado en prod. Eliminar o gatear. *(Sub-A FS-S3-03 / Sub-B FS-S4-07; el orquestador lo fija en 🟢 por ausencia de PII.)*

**[FS-20] 🟢 `cleanupExpiredSessions` nunca se invoca y retorna `0` hardcodeado** — `lib/auth-utils.ts:148-155`. Sesiones expiradas se acumulan (sin riesgo de auth: `validateSession` filtra por `expiresAt`); retorno mentiroso. *(Sub-C FS-S5-07.)*

**[FS-22] 🟢 `name` sin escape HTML en el cuerpo del email** — `app/api/rsvp/route.ts:108-116` pasa `name` crudo a `generateConfirmationEmail`. Content injection en el cuerpo (no envelope; el destinatario controla su propio nombre). *(Sub-D FS-S6-04.)*

**[FS-23] 🟢 Columna `cancelToken` es dead data** — `lib/queries.ts:41` almacena `generateCancelToken(crypto.randomUUID(), email)` que **nunca** se valida; `validateCancelToken` (`:195-198`) recomputa con el `rsvpId` real. Inconsistente y engañoso. *(Sub-C FS-S5-09.)* **Cruza con A2-H10 / A6-10** del consolidado (columna cancelToken basura).

**[FS-24] 🟢 `secure` de cookie solo con `NODE_ENV==='production'`** — `lib/auth-utils.ts:175,195`. Mitigado en Vercel (previews son `production`); frágil fuera de ese setup. *(Sub-C FS-S5-10.)*

**[FS-25] 🟢 Patrón `event?.id || eventIdOrSlug` enmascara 404 como 403** — p.ej. `stats:32`, `rsvp:216`, `send-email:42`. Con evento inexistente, el fallback pasa el identificador crudo a `userHasEventAccess` → 403 en vez de 404. Fail-closed (seguro), solo confuso. *(Sub-B FS-S4-06.)* **Cruza con PRE-3 / A1-11 + A6-04** (firmas slug/UUID y fallback de 0-resultados).

**[FS-26] 🟢 Cancel-token sin expiración** — `lib/queries.ts:188-198`. Sin TTL pese a mensajes de UI "expirado" (`cancel:30`). Token válido para siempre. *(Sub-D FS-S3b-05.)*

**[FS-02] 🟢 `upload-image`: `eventSlug` sin sanitizar en el key del blob (higiene)** — `app/api/admin/upload-image/route.ts:52-59`. `eventSlug` crudo del cliente se interpola en el key. **Degradado de 🔴 → 🟢 tras el post-review de Codex:** la afirmación original de overwrite/path-traversal de blobs ajenos **no se sostiene** — el key incluye `Date.now()` (`:52`), por lo que no hay un target predecible que sobrescribir, y `@vercel/blob` usa `allowOverwrite:false` por defecto (una escritura al mismo path lanza). Residual real: falta sanitizar el slug a un allowlist y preferir keys generados en el servidor. *(Sub-D FS-S6-01, refutado como crítico; el vector anónimo real es FS-01.)*

---

## Hallazgos fuera de scope

- Rotación de la credencial `dave1511` y purga del historial de git (FS-04) → acción operacional/DevOps, fuera del código; ver recomendación inmediata.
- Verificación de que `CRON_SECRET` y `CANCEL_TOKEN_SECRET` estén seteados en Vercel prod (FS-03, FS-05) → requiere acceso al dashboard de Vercel, no al repo.

---

## Acciones operacionales recomendadas de inmediato (no esperan al plan correctivo)

Estas NO son cambios de código; son exposiciones vivas en prod con usuarios reales:

1. **Rotar la contraseña de `info@timekast.mx`** si la cuenta existe en prod (FS-04) — `dave1511` está en el repo.
2. **Confirmar en Vercel que `CRON_SECRET` y `CANCEL_TOKEN_SECRET` estén seteados** con valores fuertes (FS-03, FS-05). Sin ellos, el cron y los cancel-tokens están abiertos AHORA.
3. **`upload-image` es anónimo AHORA** (FS-01/02): considerar deshabilitar la ruta o poner un gate mínimo urgente si el abuso es una preocupación inmediata (decisión de José; el fix formal va al plan correctivo).

---

## Conteo declarado

**5 🔴 · 14 🟡 · 8 🟢** = 27 hallazgos (post-dedup + post-review de Codex: FS-02 degradado 🔴→🟢, FS-27 agregado 🟡). PRE-1 y PRE-2 **verificados y cerrados**.

| Severidad | IDs |
|-----------|-----|
| 🔴 (5) | FS-01, FS-03, FS-04, FS-05, FS-06 |
| 🟡 (14) | FS-07, FS-08, FS-09, FS-10, FS-11, FS-12, FS-13, FS-14, FS-15, FS-16, FS-17, FS-18, FS-21, FS-27 |
| 🟢 (8) | FS-02, FS-19, FS-20, FS-22, FS-23, FS-24, FS-25, FS-26 |

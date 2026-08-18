# Auditoría de seguridad — recuperación y copia de links RSVP emitidos

Fecha: 2026-08-18
Owner de revisión: TimeKast `@security-auditor`
Clasificación: Tier 3, auditoría enfocada de bearer capability
Digest SHA-256 combinado del conjunto auditado: `85a3fc09ca2d7bee8b83bf15355b58dc3735ec75766f253d8e84e5e1e795c288`

## Veredicto

**Release condicionado.** No se observó un bypass de sesión/RBAC, IDOR entre eventos, exposición del keyring ni fuga accidental del bearer en GET, logs, path/query, caché o estado persistente del cliente. La derivación HMAC y la rotación fail-closed son sólidas para el modelo revisado.

Antes de liberar debe cerrarse **M-01**: el endpoint PATCH reconstruye y retorna el bearer aunque el link ya esté usado, revocado o vencido. La UI oculta correctamente el botón, pero ese control no existe en servidor. Tras agregar el gate de estado y su prueba dirigida, el release puede continuar sin una segunda auditoría general. **L-01** es hardening no bloqueante y conviene resolverlo en el mismo delta.

La disponibilidad productiva también depende de configurar `RSVP_INVITATION_TOKEN_KEYS` antes del despliegue. Sin esa variable, el sistema falla de forma segura y no inserta links, pero la emisión queda indisponible con 503.

| Severidad | Hallazgos |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 1 |

## Hallazgos

### M-01 — PATCH revela el bearer de links que ya no están activos

Severidad: **Medium**
Estado: **abierto; bloquea este release**
OWASP: **A01 Broken Access Control**
CWE: **CWE-285 Improper Authorization**

**Ubicación**

- `app/api/admin/rsvp-invitations/route.ts:238-268`
- `lib/queries.ts:170-201`
- Control únicamente visual en `app/admin/components/InvitationLinkManager.tsx:372-395`

**Evidencia**

Después de autenticar al actor y limitar la consulta por `link.id + event slug` canónico, PATCH pasa directamente `id`, `eventBindingId` y `tokenHash` a `recoverRsvpInvitationToken`. Esa función sólo prueba pertenencia criptográfica; no recibe ni evalúa `usedAt`, `revokedAt` o `expiresAt`. Por tanto, cualquier manager autorizado que invoque PATCH directamente con un ID obtenido del listado recibe la URL reconstruida aun si el link está usado, revocado o vencido. La UI no ofrece el botón en esos estados, pero no es un límite de autorización.

El bearer recuperado está inerte bajo las consultas actuales de validación/consumo, que exigen no usado, no revocado y no vencido. No se eleva a High porque no permite registro ni cruce de tenant/evento por sí solo. Aun así, revelar una capability explícitamente revocada o consumida viola mínimo privilegio, contradice el contrato `active + available` y conserva un secreto que podría recuperar valor ante una regresión o reactivación administrativa futura.

**Corrección concreta**

1. Hacer que el servidor rechace con respuesta opaca 409 cualquier fila cuyo estado calculado no sea `active`, antes de derivar el token.
2. Preferentemente aplicar también los predicados `used_at IS NULL`, `revoked_at IS NULL` y `expires_at > now()` en `getRsvpInvitationLinkForAdmin`, para no cargar ni reconstruir el digest de una fila inactiva.
3. Añadir pruebas PATCH separadas para usado, revocado y vencido que demuestren que no se retorna `url`, token ni hash. Mantener el scope por evento en esas pruebas.

### L-01 — La reexposición de un bearer no deja evento de auditoría

Severidad: **Low**
Estado: **abierto; no bloqueante**
OWASP: **A09 Security Logging and Monitoring Failures**
CWE: **CWE-778 Insufficient Logging**

**Ubicación**

- `app/api/admin/rsvp-invitations/route.ts:265-268`
- Comparación: emisión registrada en `app/api/admin/rsvp-invitations/route.ts:192-197` y revocación en `app/api/admin/rsvp-invitations/route.ts:315-320`

**Evidencia e impacto**

Una recuperación exitosa retorna nuevamente una capability activa, pero no emite un evento que identifique actor, evento y link. Un manager legítimo puede copiar repetidamente —comportamiento esperado—, pero ante una sesión comprometida no hay señal para reconstruir qué bearer se reveló ni cuándo. Esto no altera la autorización en línea y no justifica bloquear por sí solo.

**Corrección concreta**

Emitir tras una recuperación exitosa un evento estructurado, por ejemplo `rsvp_invitation.copied`, con `linkId`, slug canónico del evento y `actorId`. Nunca registrar bearer, hash, URL completa, body, PII ni excepción del driver. Si existe un sink durable de auditoría, preferirlo a logs efímeros.

## Respuestas a las preguntas de revisión

### 1. Superficies de fuga

- GET construye sólo `urlAvailability`; `linkDto` usa una allowlist y excluye explícitamente `tokenHash` y token (`app/api/admin/rsvp-invitations/route.ts:61-95,133-138`).
- POST/PATCH retornan el bearer únicamente al manager autorizado y con `Cache-Control: no-store` (`:199-203`, `:265-268`). Las rutas son dinámicas y los métodos de mutación no son cacheables por Vercel/CDN de forma ordinaria.
- La URL usa slug público en el path y token sólo en `#fragment` (`:98-112`), por lo que el bearer no llega al request line, CDN/origen ni Referer. `/invite` y `/invite/:slug` además tienen `Referrer-Policy: no-referrer` y `private, no-store` en `next.config.js:1-28`.
- Los catches relevantes son deliberadamente genéricos; los logs de creación/revocación no contienen token, hash ni URL. El nuevo flujo tampoco inserta esos valores en mensajes de error.
- El URL recuperado permanece como variable local de la respuesta y pasa directamente a Clipboard API o al prompt; no se agrega a `links`, `generatedUrl`, localStorage, history ni logs (`InvitationLinkManager.tsx:188-234`). El URL recién creado sí conserva el estado efímero ya existente para mostrarlo inmediatamente (`:132-176,302-315`).
- El keyring sólo se lee en código servidor; no existe import del helper criptográfico desde componentes cliente ni variable `NEXT_PUBLIC_`. Los source maps del cliente no incorporan el secreto.
- Clipboard, extensiones del navegador, DevTools y el prompt son superficies deliberadas del gesto explícito de copiar, no fugas pasivas introducidas por GET.

Conclusión: no se encontró exposición accidental adicional, aparte de M-01 y de la entrega intencional al actor autorizado.

### 2. HMAC, domain separation, parsing y rotación

- Cada key exige versión acotada y secreto de exactamente 32 bytes hex; se rechazan entradas malformadas, versiones duplicadas, keyring vacío y más de ocho claves (`lib/rsvp-invitation.ts:6-13,54-89`).
- HMAC-SHA-256 usa un contexto dedicado, separadores NUL, versión, link UUID e identidad inmutable del evento (`:91-98`). El resultado base64url conserva 256 bits y satisface el formato existente de 43 caracteres.
- La primera key emite; todas las configuradas pueden recuperar. Incluir la versión en el payload evita confusión entre slots aun si un secreto se reutiliza.
- La comprobación compara digests SHA-256 de longitud fija mediante `timingSafeEqual` (`:122-141`). El early return puede revelar a un actor ya autorizado la posición aproximada de la key por timing, pero no amplía su capacidad: ese mismo request entrega el token. No se considera hallazgo explotable.
- La entropía real de una variable productiva no puede comprobarse desde código. Debe generarse con `openssl rand -hex 32`, como documenta `.env.example`.

Conclusión: construcción y parsing correctos; no se observó oracle útil ni confusión de versiones.

### 3. IDOR, alias, rename y binding de evento

- `authorizeEvent` resuelve slug o ID, verifica rol manager contra el UUID del evento y luego todas las operaciones usan el slug canónico (`route.ts:41-59,235-247`).
- La consulta del registro exige simultáneamente link ID y slug canónico (`lib/queries.ts:170-201`); conocer el ID de otro evento no permite recuperarlo.
- La derivación incluye el UUID inmutable del evento. Un cambio de slug conserva ese UUID y la FK de `rsvp_invitation_links.event_id` tiene `ON UPDATE CASCADE`, por lo que el link sigue perteneciendo al mismo evento y se emite con el nuevo slug.
- Un alias ambiguo se canonicaliza antes de query, HMAC y construcción de URL; no hay mezcla entre el evento autorizado y el evento recuperado.

Conclusión: no se encontró IDOR ni confusión cross-event/cross-tenant.

### 4. Legacy y keys retiradas

- Links legacy aleatorios siguen validando si el poseedor conserva la URL, porque validación/consumo sólo comparan SHA-256 del bearer presentado. Con keyring válido aparecen como `not_recoverable`; no se inventa un reemplazo.
- Retirar una key sólo elimina la posibilidad de reconstrucción. El URL ya conocido continúa validando hasta uso, revocación o expiración.
- La rotación debe conservar cada versión anterior mientras se necesite copiar links emitidos bajo ella. Reutilizar una versión con otro secreto hace esos links no recuperables y debe evitarse.

Conclusión: compatibilidad fail-closed y sin ruptura de URLs conocidas.

### 5. Configuración ausente/malformada y atomicidad

- POST genera el ID y exige un bearer derivable antes de llamar a `createRsvpInvitationLink` (`route.ts:171-191`). Un keyring ausente/malformado retorna 503 y no puede dejar una inserción parcial.
- GET reporta `configuration_unavailable` y oculta el botón; PATCH retorna 503 sin fallback aleatorio o inseguro.
- La creación fuerza `urlAvailability: available` sólo después de haber derivado el token y persistido su digest. En el modelo de env inmutable de la instancia no existe una ventana realista de cambio de keyring entre ambas operaciones.

Conclusión: fallo seguro; el riesgo es indisponibilidad si producción no se configura antes del código.

### 6. Estado usado/revocado/vencido

Existe el hallazgo **M-01**. El servidor debe aplicar el gate, no sólo la UI.

### 7. Fallback manual

`window.prompt` sólo se abre después de un click autenticado cuando Clipboard API falla; el URL no se persiste y el prompt se cierra al terminar la interacción. Hace visible la capability en pantalla y puede ser observada por extensiones, igual que cualquier operación manual de copiado, pero está razonablemente acotado. No requiere bloquear. Una modal propia con campo readonly permitiría mejor UX/control, no una mejora material de confidencialidad.

### 8. Replay, rate limiting y auditoría

- Repetir PATCH mientras el link esté activo es funcionalmente equivalente a volver a copiar el mismo URL; no crea tokens nuevos ni debilita el consumo de un solo uso.
- Cada llamada exige sesión válida, mismo origen, rol manager y una lectura DB; la derivación está limitada a ocho HMAC. La ausencia de rate limit específico no constituye un riesgo de agotamiento suficiente para bloquear este release.
- La brecha de trazabilidad se documenta como **L-01**. Puede complementarse con alertas de volumen anómalo, sin registrar secretos.

### 9. Secuencia productiva y rotación

1. Crear un secreto dedicado de 32 bytes y configurar `RSVP_INVITATION_TOKEN_KEYS=v1:<64hex>` en Production antes de desplegar el código.
2. Confirmar por nombre/estado —sin imprimir el valor— que la variable está disponible en el runtime objetivo.
3. Al rotar, anteponer `v2:<nuevo>` y conservar `v1:<anterior>`; no sobrescribir `v1` con un secreto distinto.
4. No retirar una versión hasta que ya no se necesite recuperar ninguno de sus links. El límite operativo es ocho versiones.
5. Si el keyring se pierde, los bearers existentes que sus destinatarios ya tienen continúan funcionando; la app no puede reconstruirlos ni emitir nuevos hasta restaurar la configuración.

## Alcance y digest

Archivos auditados:

- `.env.example`
- `app/admin/admin.module.css`
- `app/admin/components/InvitationLinkManager.tsx`
- `app/api/admin/rsvp-invitations/route.ts`
- `lib/queries.ts`
- `lib/rsvp-invitation.ts`
- `scripts/rehearse-rsvp-invitation.ts`
- `tests/rsvp-invitation-admin-query.test.ts`
- `tests/rsvp-invitation-route.test.ts`
- `tests/rsvp-invitation-ui.test.ts`
- `tests/rsvp-invitation.test.ts`

El digest combinado se calculó ordenando las rutas, ejecutando SHA-256 sobre cada contenido y calculando SHA-256 del manifiesto resultante. Cualquier cambio posterior en estos archivos invalida el veredicto hasta revisar el delta afectado.

Se leyeron de forma transitiva y sin incluir en el digest: `lib/origin-check.ts`, `lib/auth-utils.ts`, `lib/user-queries.ts`, `lib/schema.ts`, la ruta pública de validación, el cliente `/invite`, `next.config.js` y la migración 0008, únicamente para confirmar los invariantes existentes de sesión, same-origin, RBAC, FK/canonicalización, validación y headers.

## Evidencia de gates consumida

- Focused invitation tests: 51/51 PASS.
- Suite completa: 48 archivos, 394/394 PASS.
- `pnpm exec tsc --noEmit`: PASS.
- `pnpm lint`: PASS, 0 warnings/errors.
- Production build: PASS.
- `git diff --check`: PASS.

La evidencia fue suministrada como autoritativa y no se repitieron tests, build ni lint. La inspección manual encontró que los tests cubren derivación, rotación, legacy, fail-closed, binding de ID/evento, GET sin digest, same-origin y recovery activo, pero no cubren el rechazo PATCH de estados inactivos de M-01 ni el evento de auditoría de L-01.

## Incertidumbre residual

- No se inspeccionó el valor ni la presencia real de `RSVP_INVITATION_TOKEN_KEYS` en Vercel/producción; el rollout queda condicionado a ese preflight sin exponer el secreto.
- No se inspeccionaron integraciones externas de observabilidad, browser extensions o políticas corporativas del portapapeles. El código no registra body/respuesta, pero un agente externo configurado para capturar response bodies podría ver el bearer intencionalmente retornado.
- No se ensayó una rotación real en Vercel ni pérdida/restauración del keyring; las pruebas unitarias cubren la semántica pura con dos versiones.
- No hay una columna de versión por link. El digest almacenado permite identificar la key correcta por prueba acotada, pero la operación depende de conservar el orden/keyring correcto y puede perder disponibilidad de recuperación al superar ocho versiones.

Ninguna incertidumbre residual adicional cambia la severidad. El único bloqueador de código es M-01; la única condición operacional es configurar el keyring antes del despliegue.

## Remediación posterior a la auditoría

M-01 y L-01 quedaron resueltos en una única iteración correctiva acotada:

- PATCH rechaza con 409 y `Cache-Control: no-store` todo link usado, revocado o vencido antes de consultar el keyring o derivar el bearer.
- La respuesta de rechazo no incluye URL, token ni hash.
- Cada copia activa exitosa registra únicamente el evento `rsvp_invitation.copied`, `linkId`, evento canónico y `actorId`.
- La verificación dirigida final aprobó 46/46 pruebas, TypeScript y ESLint con 0 warnings/errores.

Con ese delta, la condición de código para liberar queda satisfecha. La condición operativa de configurar `RSVP_INVITATION_TOKEN_KEYS` antes del despliegue permanece obligatoria.

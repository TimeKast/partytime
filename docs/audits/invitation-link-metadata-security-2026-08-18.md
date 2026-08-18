# Auditoría de seguridad — metadata de links de invitación

Fecha: 2026-08-18
Owner de revisión: TimeKast `@security-auditor`
Clasificación: Tier 3, audit enfocado
Digest combinado del conjunto auditado: `dfd448066ad1ed72c16d9a48ad72a557a69d7fd19a801acade18a5d645eef583`

## Veredicto

**Release permitted.** No se identificaron hallazgos Critical, High, Medium ni Low dentro del alcance congelado. No se requiere aceptación de riesgo para liberar este cambio, siempre que los archivos auditados no cambien después del digest indicado.

El diseño mantiene al bearer fuera de toda superficie visible al servidor de previews: el link emitido usa `/invite/<slug>#token=<bearer>`, el fragmento no forma parte del request HTTP y la metadata solo recibe el slug público. La validación de registro falla cerrada cuando el evento resuelto por el token no coincide con el slug de la ruta.

## Hallazgos por severidad

| Severidad | Hallazgos |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |

No hay entradas que requieran ubicación, categoría OWASP o corrección concreta porque no se observó una vulnerabilidad reproducible o sustentada por el código y la evidencia revisados.

## Evidencia por pregunta de revisión

### 1. Fuga del token hacia servidor, previews, logs o caché

- `app/api/admin/rsvp-invitations/route.ts:76-90` construye la ruta únicamente con el slug canónico codificado y asigna el bearer exclusivamente a `URL.hash`; no lo coloca en pathname ni query.
- `app/api/admin/rsvp-invitations/route.ts:149-167` persiste solo el hash, registra únicamente IDs no secretos y revela la URL con el bearer solo en la respuesta de creación autorizada. El catch de `:169-173` no registra excepciones, body ni request metadata.
- `app/invite/InvitationRegistrationClient.tsx:34-55` extrae el fragmento, lo elimina de history antes de validar y lo transmite únicamente en el body de un `POST` con `cache: 'no-store'`. El componente no contiene logging.
- `app/invite/[slug]/page.tsx:19-37` genera metadata solo a partir del parámetro slug y del evento público. No existe entrada para token en la firma ni en el builder.
- `lib/event-page-metadata.ts:22-70` construye canonical, Open Graph y Twitter exclusivamente con campos del evento; no acepta ni propaga capabilities.
- `tests/rsvp-invitation-route.test.ts:111-138` cubre que el bearer no aparece antes del fragmento, en el DTO ni en el audit log; `tests/rsvp-invitation-ui.test.ts:78-88` fija extracción, scrub y POST body.

Conclusión: no hay ruta de código en el alcance que haga visible el bearer a server params, metadata, canonical, logs o respuestas cacheables de preview. OWASP relevante: A04 Cryptographic Failures, A09 Logging & Alerting Failures y A02 Security Misconfiguration; controles satisfactorios.

### 2. Alias o slug manipulado y confusión de evento

- `app/api/admin/rsvp-invitations/route.ts:146-167` autoriza primero el evento y usa `authorization.event.slug`, no el alias recibido, para persistencia y URL pública.
- `app/invite/InvitationRegistrationClient.tsx:59-75` no habilita la invitación cuando el evento validado está inactivo o su slug no coincide exactamente con `expectedEventSlug`.
- `app/invite/[slug]/page.tsx:49-51` pasa el slug de la ruta como expectativa explícita al cliente.
- Un path manipulado sí puede mostrar metadata de un evento público resoluble por ese path, porque el scraper no puede presentar el bearer. Eso no expone datos adicionales: la misma metadata ya está publicada por la URL normal del evento. El registro permanece ligado al evento autorizado por el bearer y falla cerrado ante mismatch.
- `tests/rsvp-invitation-route.test.ts:141-153` cubre que un request por alias/ID emita el slug canónico; `tests/rsvp-invitation-ui.test.ts:98-105` fija el binding cliente.

Conclusión: no hay IDOR, bypass de autorización ni confusión utilizable para registrar en otro evento. OWASP relevante: A01 Broken Access Control y A06 Insecure Design; controles satisfactorios.

### 3. Merge de metadata, caché y headers de Next

- `app/invite/[slug]/page.tsx:6-13,34-45` fuerza render dinámico, `revalidate = 0` y agrega `robots` privado tanto en éxito como en fallbacks.
- `app/invite/page.tsx:4-9` aplica el mismo comportamiento dinámico/noindex al entry point legacy, evitando que la optimización estática reemplace el header de no-store.
- `next.config.js:1-28` aplica `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store, max-age=0` y `X-Robots-Tag: noindex, nofollow, noarchive` tanto a `/invite` como a `/invite/:slug`.
- El `robots` retornado por la página event-aware se integra en el mismo objeto de metadata que Open Graph/Twitter, por lo que no depende de la metadata del sibling legacy.
- `tests/og-metadata.test.ts:121-139` demuestra paridad de metadata y preservación de `robots`; `tests/rsvp-invitation-ui.test.ts:116-138` fija ambos header patterns.
- Se consumió el smoke de producción local aportado: ambas rutas respondieron 200 con metadata equivalente y los tres headers esperados; el build confirmó que `/invite` y `/invite/[slug]` son dinámicas.

Conclusión: las semánticas observadas de Next preservan no-store/noindex en ambas rutas. OWASP relevante: A02 Security Misconfiguration; controles satisfactorios.

### 4. Metadata canónica compartida y campos públicos

- `app/[slug]/layout.tsx:14-29` y `app/invite/[slug]/page.tsx:19-37` llaman al mismo `buildEventPageMetadata`.
- `lib/event-page-metadata.ts:5-15` declara el source mínimo: slug, títulos visibles, logística e imágenes públicas. `:31-69` solo lee esos campos.
- `lib/event-page-metadata.ts:32,45,52` fija canonical y `og:url` a la URL pública normal del evento, nunca al entry point que contiene la capability.
- `tests/og-metadata.test.ts:121-139` compara title, description, Open Graph, Twitter, metadataBase, canonical e imagen entre la invitación normal y el link event-aware.

Conclusión: la metadata es verdaderamente compartida en código y no amplía el modelo de datos público.

### 5. XSS, open redirect, encoding, cache poisoning y logging

- El slug queda codificado antes de insertarse en la ruta en `app/api/admin/rsvp-invitations/route.ts:86` y en la canonical en `lib/event-page-metadata.ts:32`.
- No se introducen redirects ni HTML crudo. La salida usa la API tipada de Metadata de Next, que serializa los valores como atributos/meta tags en lugar de inyectar markup.
- La base de la URL emitida se reduce a `.origin` en `app/api/admin/rsvp-invitations/route.ts:76-85`; un valor de configuración inválido cae al origin ya parseado del request.
- Los logs nuevos/relevantes son estructurados y no contienen bearer ni digest (`app/api/admin/rsvp-invitations/route.ts:157-162`). El error de metadata del entry event-aware es genérico y no imprime slug ni excepción (`app/invite/[slug]/page.tsx:38-45`).

Conclusión: no se observó XSS, open redirect, path injection, cache poisoning ni logging sensible introducido por el cambio. OWASP relevante: A05 Injection, A02 Security Misconfiguration y A09 Logging & Alerting Failures; controles satisfactorios.

### 6. Compatibilidad legacy

- `/invite#token=...` conserva el flujo bearer original mediante `InvitationRegistrationClient` sin slug esperado (`app/invite/page.tsx:11-12`). La API de validación sigue siendo la autoridad del evento.
- La ausencia de binding a path en legacy no crea bypass: el path nunca fue un control de autorización; la capability válida autoriza exactamente el evento resuelto por el servidor. El entry point nuevo agrega defensa contra confusión visual, no reemplaza el control bearer.
- El legacy quedó protegido por render dinámico, noindex, no-store y no-referrer, por lo que no degrada los invariantes de secreto ni caché.

Conclusión: la compatibilidad legacy no debilita el modelo de autorización ni la nueva garantía para URLs recién emitidas.

## Alcance revisado

- `app/api/admin/rsvp-invitations/route.ts`
- `app/invite/page.tsx`
- `app/invite/[slug]/page.tsx`
- `app/invite/InvitationRegistrationClient.tsx`
- `app/[slug]/layout.tsx`
- `lib/event-page-metadata.ts`
- `next.config.js`
- `tests/og-metadata.test.ts`
- `tests/rsvp-invitation-route.test.ts`
- `tests/rsvp-invitation-ui.test.ts`
- Efectos transitivos inmediatos leídos solo cuando eran necesarios para confirmar el contrato existente de slug y metadata pública.

El digest combinado se calculó sobre el contenido de esos diez archivos en el orden listado. Cualquier cambio posterior en ellos invalida este verdict hasta revisar el delta afectado.

## Evidencia de gates consumida

- Focused tests: 27/27.
- Suite completa: 48 archivos, 384/384.
- TypeScript `noEmit`: PASS.
- ESLint: 0 warnings, 0 errors.
- Production build: PASS; `/invite` y `/invite/[slug]` dinámicas.
- Smoke HTTP de producción local: ambas rutas 200; metadata equivalente; headers `no-referrer`, `private, no-store` y `noindex` presentes.
- `git diff --check`: PASS.

Estos resultados fueron suministrados como evidencia autoritativa de la implementación final y se consumieron sin repetir tests, build, lint ni smoke. La inspección actual confirmó además que el diff no contiene errores de whitespace.

## Fuera de alcance

- Persistencia, generación criptográfica, expiración y consumo atómico del bearer, que no cambiaron.
- Implementaciones internas preexistentes de sesión, RBAC, same-origin, DTO público y queries, salvo lectura transitive mínima para comprobar los supuestos congelados.
- UI móvil del panel admin.
- Auditoría general de dependencias, infraestructura, CI/CD, observabilidad o configuración global.
- Pruebas contra scrapers reales de WhatsApp, iMessage, Slack u otras plataformas externas.

## Incertidumbre residual

- Los proveedores de previews externos controlan sus propias políticas de recrawl y caché; pueden conservar una preview anterior, pero nunca reciben el fragmento bearer por HTTP. Esto afecta frescura visual, no confidencialidad ni autorización.
- El smoke citado fue local con build de producción, no una observación del CDN desplegado. Los header patterns y el output dinámico sí quedaron cubiertos por build, tests y smoke local.
- No se hizo inspección de datos productivos para detectar slugs históricos fuera de las reglas actuales. Un slug legado no enrutable podría degradar disponibilidad del link, pero el encoding y el mismatch fail-closed impiden convertirlo en exposición o registro cross-event.

Ninguna de estas incertidumbres residuales requiere aceptación de riesgo para este release.

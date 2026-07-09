# 🎨 A7 — Frontend, flujos y UX

> **Estado:** ⬜ pendiente · **Owner/Sesión:** — · **Inicio:** — · **SHA auditado:** — (SHA de referencia del framework: `bcc7f1e`)
>
> **Protocolo:** seguir `docs/audits/00_INDEX.md` — lock atómico (marcar 🔄 en la tabla del INDEX + commit + push antes de empezar; el lock existe solo cuando el push tiene éxito), read-only sobre código de la app, reglas de evidencia anti checkbox-theater, y rúbrica de severidad 🔴/🟡/🟢. **Todo ítem requiere evidencia `archivo:línea` o comando+output, también cuando PASA.** Ítems no ejecutables → `⏭️ NOT RUN` + razón.

---

## 1. Objetivo

Verificar que el frontend **público** (el que ven los invitados reales, mayoritariamente en móvil) funciona de punta a punta sin callejones sin salida: cada fetch tiene manejo de error visible, cada página tiene estados loading/error coherentes, los textos son consistentes en español, el contraste es legible con cualquier theme que configure el organizador, la accesibilidad básica está cubierta, y las animaciones no bloquean ni degradan la interacción. Producción con invitados reales: un flujo roto = un invitado que no confirma.

## 2. Contexto mínimo (para sesión fría)

**Flujo del invitado:** recibe un link con slug (WhatsApp normalmente) → ve la invitación en `/{slug}` → abre el modal RSVP y confirma → recibe email de confirmación con un link de gestión → con ese link (`/cancel/{rsvpId}?token=...`) puede editar sus datos o cancelar/reconfirmar. El **theme JSONB por evento** (`primaryColor`, `secondaryColor`, `accentColor`, + `backgroundColor`/`textColor` en el tipo) pinta colores vía estilos inline sobre las clases CSS estáticas.

**Mapa de archivos del scope:**

| Pieza | Archivo | Notas |
|---|---|---|
| Página pública del evento | `app/[slug]/page.tsx` (311 l, client) | fetch a `/api/events/{slug}`, estados loading/error/inactivo, theme inline |
| Metadata OG del evento | `app/[slug]/layout.tsx` | `generateMetadata` server-side, imagen vía `/api/og-image/{slug}?v=5` |
| Modal RSVP | `app/components/RSVPModal.tsx` (297 l) + `RSVPModal.module.css` | POST `/api/rsvp`, PhoneInput de `react-international-phone` |
| Cancelar/editar | `app/cancel/[rsvpId]/page.tsx` (434 l) + `cancel.module.css` | 4 fetches; card blanca en CSS pero card principal re-pintada oscura inline |
| Home (redirect) | `app/page.tsx` (154 l, server) | resuelve `home_event_id` → redirect a `/{slug}` con fallbacks encadenados |
| Login | `app/login/page.tsx` (159 l) + `login.module.css` | frontera con panel admin (el panel en sí es A4) |
| Layout raíz | `app/layout.tsx` + `app/globals.css` | `lang="es"`, viewport, `overflow-x: hidden` global |
| Estilos página pública | `app/page.module.css` | clamp() para títulos, breakpoints 374/480/768/1024 |

**Trail de referencia del flujo end-to-end** (verificarlo/completarlo es el ítem E1): `app/page.tsx:121-153` (redirect por `home_event_id` con 3 niveles de fallback) → `app/[slug]/page.tsx:24` (fetch evento) → `:100-112` (gate `isActive`) → `:247-265` (gate `rsvpClosed` / botón CONFIRMAR) → `RSVPModal.tsx:55-61` (POST con `eventSlug`) → `:66-71` (éxito, autocierre 2.5s) → email (A1) contiene link a `/cancel/{rsvpId}?token=` → `app/cancel/[rsvpId]/page.tsx:74` (GET rsvp) → `:87` (GET evento — ojo: `rsvp.eventId` almacena el **slug**, gotcha del INDEX) → `:130` (update/reconfirm) / `:182` (cancel).

**Commit relevante:** `731125e` ("fix text contrast") — arregló contraste **solo dentro del form principal** de la cancel page (labels/spans a `#ffffff` sobre card oscura inline) y agregó el campo `plusOneName` al flujo de update. Revisar qué NO cubrió (ítem E12).

## 3. Scope

**Dentro:** todo el frontend público listado arriba (páginas, componentes, CSS modules, globals, layouts, metadata OG desde la óptica de UX del link compartido), más la página de login como frontera.

**Fuera:**
- Panel admin (`app/admin/**`) → **A4**.
- Lógica de las rutas API que estos fetches consumen (validaciones, respuestas, side-effects, emails) → **A2** (RSVP) / **A3** (eventos/settings) / **A1** (emails).
- Modelo de auth, tokens y protección de endpoints → **Fase S** (si aparece algo de esa naturaleza, va a "Hallazgos fuera de scope" sin profundizar).
- Código muerto/duplicado como tema sistemático → **A5** (cross-ref puntual permitida).

## 4. Checklist

### Parte A — Estática (siempre ejecutable, solo lectura de código)

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|---|---|---|---|
| E1 | Flujo invitado end-to-end trazado paso a paso con `archivo:línea`, sin huecos ni estados inalcanzables | Seguir el trail de referencia de la sección 2 y documentarlo completo, incluyendo las 3 ramas de la página pública (loading / error / `!isActive` / `rsvpClosed`) y las 4 pantallas de la cancel page (loading / cancelled / sin-rsvp / form) | ⬜ | |
| E2 | Fetch `/api/events/{slug}` (`app/[slug]/page.tsx:24-48`): fallo visible al usuario | Notar que `setError('Error al cargar el evento')` (`:32`) y `'Error de conexión'` (`:45`) se setean pero el render de error (`:75-97`) muestra SIEMPRE "Evento no encontrado" sin distinguir 404 de error de red/500 — ¿el string de error se usa en algún lado? | ⬜ | |
| E3 | Fetch POST `/api/rsvp` (`RSVPModal.tsx:55-81`): fallo visible | Confirmar que error de API muestra `data.error` y error de red muestra "Error de conexión…" (`:74,78`) en `styles.errorMessage`, y que `isSubmitting` se libera en `finally` | ⬜ | |
| E4 | Fetch `/api/rsvp/get` (`app/cancel/[rsvpId]/page.tsx:74`): fallo visible | Verificar ramas `data.error` (`:105`) y catch (`:108`), y la pantalla sin-rsvp (`:238-250`); notar que no valida `response.ok` antes de `.json()` | ⬜ | |
| E5 | Fetch `/api/events/{eventId}` anidado (`app/cancel/[rsvpId]/page.tsx:87-103`): fallo **silencioso** — evaluar consecuencias | El catch solo hace `console.error` (`:102`); con `eventData=null` el título queda "Evento", theme default, y `requirePlusOneName` queda `false` → el campo "Nombre del Acompañante" (`:375`) NO se renderiza aunque el evento lo exija. Documentar si la validación server-side (A2) lo compensa — sin profundizar, cross-ref | ⬜ | |
| E6 | Fetch `/api/rsvp/update` (`:130`) y `/api/rsvp/cancel` (`:182`): fallo visible | Verificar mensajes en `styles.error` y que `setRsvpData(data.rsvp)` (`:152`) no pueda dejar `rsvpData` en `null`/`undefined` si la API responde `success` sin `rsvp` (la API sí lo devuelve: `app/api/rsvp/update/route.ts:54-56` — confirmar) | ⬜ | |
| E7 | Fetches de login `/api/auth/me` (`app/login/page.tsx:20`) y `/api/auth/login` (`:40`): fallo visible o silencio intencional documentado | `checkAuth` traga el error a propósito (queda en login — OK); login muestra `data.error` o "Error de conexión…" (`:51,54`) | ⬜ | |
| E8 | Inventario completo de fetches del frontend público: ninguno fuera de E2–E7 | `grep -rn "fetch(" app --include="*.tsx" \| grep -v "app/admin"` y confirmar que la lista coincide (7 fetches en páginas públicas + 2 en login) | ⬜ | |
| E9 | Estados loading/empty/error por página pública | `/[slug]`: loading `:57-72`, error `:75-97`, inactivo `:100-112` · cancel: loading `:207-215`, cancelled `:220-236`, sin-rsvp `:238-250` · login: `checkingAuth` `:60-66` · home: server redirect (sin UI propia — verificar que todos los caminos terminan en `redirect()`) | ⬜ | |
| E10 | Home: cadena de fallbacks de redirect no lleva a un 404 de UX | `app/page.tsx:129-133` redirige a `/{event.id}` si el evento no tiene slug, y `:153` a `/{eventConfig.event.id}` como último recurso — pero `/api/events/[slug]/route.ts:69-70` solo busca **por slug** (`getEventBySlug`). ¿Esos fallbacks aterrizan en "Evento no encontrado"? Trazar y documentar | ⬜ | |
| E11 | Textos visibles al usuario en español consistente | Recorrer strings de las 4 páginas + modal. Puntos a revisar: dropdown de países de `react-international-phone` (nombres de país en inglés — "United States", etc.); `confirm()` nativo (`cancel/[rsvpId]/page.tsx:174`) con botones en idioma del navegador; copy divergente "¿Vienes con +1?" (`RSVPModal.tsx:235`) vs "Asistiré con acompañante (+1)" (`cancel:370`); "Email" como préstamo aceptado | ⬜ | |
| E12 | Contraste estático en cancel page — qué dejó fuera `731125e` | La card principal del form se pinta oscura inline con `color:#ffffff` (`cancel:262-270`), pero las pantallas **loading** (`:211 <p>Cargando...</p>`) y **cancelled** (`:226 <p>Tu asistencia ha sido cancelada...</p>`) usan `.card` blanca (`cancel.module.css:10-11`) con `<p>` sin color propio, que hereda `color:#ffffff` del body (`globals.css:26-29`) → ¿texto blanco sobre card blanca? Verificar herencia CSS y reportar | ⬜ | |
| E13 | Contraste con themes dinámicos: colores claros sobre fondo claro | Título/subtítulo reciben `color` + `textShadow` inline del theme (`app/[slug]/page.tsx:152-155,169-172`) que **reemplazan** el text-shadow con borde negro de `page.module.css:105-121` (el `-webkit-text-stroke: 2px #000` de la clase sobrevive — confirmar); el overlay se deriva del mismo `primaryColor` (`page.tsx:134`), así que no garantiza contraste; `modalSubtitle` usa `secondaryColor` sobre fondo oscuro fijo (`RSVPModal.tsx:139`) → ilegible si el organizador elige un secundario oscuro. ¿Existe alguna validación/clamp de contraste en frontend o al guardar el theme (cross-ref A3)? | ⬜ | |
| E14 | Coherencia theme dinámico vs sombras hardcodeadas | `rsvpTitle` toma `color: accentColor` inline (`page.tsx:243`) pero conserva glow dorado hardcoded (`page.module.css:230-231`); campos `theme.backgroundColor`/`textColor` existen en el tipo (`types/event.ts:35-41`) — ¿se usan en la página pública o son letra muerta? (cross-ref A5 si es lo segundo) | ⬜ | |
| E15 | Accesibilidad: labels de inputs | Modal: `htmlFor="name"/"email"/"plusOneName"` apuntan a ids reales (`RSVPModal.tsx:166-263`) ✓ pero `htmlFor="phone"` (`:206`) apunta a un input que `PhoneInput` renderiza **sin** `id="phone"` — label huérfano (mismo patrón en `cancel:342`). Login: `htmlFor` correctos (`login/page.tsx:88,105`). Documentar cada uno | ⬜ | |
| E16 | Accesibilidad: semántica del modal | `RSVPModal.tsx:100-125`: ¿`role="dialog"`/`aria-modal`? ¿focus trap / foco inicial? ¿cierre con Escape? ¿`aria-label` en el botón ✕ (`:119-125`)? ¿click en overlay cierra incluso con `isSubmitting=true` (`:105`) perdiendo el estado del envío en curso? | ⬜ | |
| E17 | Accesibilidad: imágenes | La página pública usa solo background-images CSS decorativas (`page.tsx:124-137`) — sin `<img>` que requiera `alt`; OG images llevan `alt` en metadata (`app/[slug]/layout.tsx:52`). Confirmar con `grep -n "<img\|<Image" app/[slug] app/components app/cancel app/login` | ⬜ | |
| E18 | Inputs con font-size ≥16px (evitar zoom automático de iOS Safari) | `RSVPModal.module.css:97` (1rem), `:153` (1rem phone), `cancel.module.css:101` (16px), `:146` (16px phone), `login.module.css:132` (1rem). Verificar TODOS los inputs, incluido el buscador del dropdown de países si existe | ⬜ | |
| E19 | Viewport y zoom | `app/layout.tsx:31-36`: `maximumScale: 1` bloquea pinch-zoom del invitado (WCAG 1.4.4 / usabilidad móvil) — evaluar; `themeColor` sale de `event-config.json` estático, no del theme del evento | ⬜ | |
| E20 | Responsive en código: breakpoints y unidades sospechosas | `page.module.css:298-359` (374/480/768/1024 + clamp para títulos); `html,body { overflow-x: hidden }` (`globals.css:17-18`) puede estar enmascarando overflow real — buscar anchos fijos: `grep -n "px" app/page.module.css app/components/RSVPModal.module.css` y evaluar `min-width:85px` del country selector, `max-width` de cards, modal `max-height: 90vh` (`RSVPModal.module.css:23`) con teclado en pantalla | ⬜ | |
| E21 | framer-motion: ¿animaciones bloquean interacción o desplazan layout? | (a) CTA principal invisible ~1s: `initial opacity:0` + `delay:1` (`page.tsx:237-240`); (b) sparkles `repeat:Infinity` con `pointer-events:none` (`page.module.css:287` ✓); (c) `exit` en el motion.div de plusOneName (`RSVPModal.tsx:243-245`) sin `AnimatePresence` envolvente → exit nunca corre, y `height:0→auto` empuja el layout del form; (d) animaciones usan transform/opacity (no reflow) — confirmar | ⬜ | |
| E22 | Limpieza de efectos y timers | `setTimeout` de 2.5s que cierra el modal (`RSVPModal.tsx:67-71`) sin cleanup si se desmonta antes; `useEffect` de carga sin abort/cancel al desmontar (`page.tsx:20-54`, `cancel:65-115`) — ¿riesgo real de setState tras unmount o benigno en React 18? Documentar | ⬜ | |
| E23 | Elementos residuales / imports muertos en el frontend público | `notFound` importado y no usado (`app/[slug]/page.tsx:4`); `console.log` de debug en producción (`app/page.tsx:122,126,137,140,152`); ícono ⚙️ de admin en la invitación pública (`page.tsx:119-121`, `opacity:0.15`) — confirmar si es intencional ("ícono secreto", `page.module.css:12-31`) y si su touch target diminuto es deliberado. Cross-ref A5 lo que aplique | ⬜ | |

### Parte B — Dinámica (marcar `⏭️ NOT RUN` + razón si la sesión no tiene env vars / DB local; el repo solo trae `.env.example`)

| # | Verificación | Cómo verificar | Resultado | Evidencia |
|---|---|---|---|---|
| D1 | Levantar dev server | `RESEND_API_KEY=re_dummy npm run dev` (requiere además `DATABASE_URL` válida — Neon o branch local). Registrar comando y puerto | ⬜ | |
| D2 | Sin scroll horizontal a 375px | Preview tools móvil 375×812 en `/{slug}` de un evento real de prueba: `document.documentElement.scrollWidth <= 375` en las 3 páginas públicas (invitación, modal abierto, cancel) | ⬜ | |
| D3 | Touch targets ≥44px | Inspeccionar bounding box de: botón ✕ del modal (CSS declara 40×40 — `RSVPModal.module.css:39-40`), checkbox +1 (con su label padded), botón CONFIRMAR, links "Volver al inicio", country selector del PhoneInput | ⬜ | |
| D4 | Modal usable con teclado en pantalla | A 375px con modal abierto: enfocar cada input, verificar que el input activo queda visible (modal `max-height:90vh` + `overflow-y:auto`), que no hay zoom automático de iOS (E18), y que el dropdown de países es scrolleable y cerrable | ⬜ | |
| D5 | Recorrido RSVP completo en móvil | Flujo feliz: abrir invitación → modal → llenar → enviar → mensaje de éxito → autocierre. Y flujo de error: apagar red o forzar 500 y confirmar que el usuario ve un mensaje accionable (contraste con E2/E3) | ⬜ | |
| D6 | Recorrido cancel/editar en móvil | Con un RSVP de prueba y su token: cargar `/cancel/{id}?token=`, editar datos, reconfirmar desde estado cancelado, cancelar. Verificar legibilidad real de las pantallas loading y cancelled (E12) y el `confirm()` nativo | ⬜ | |
| D7 | Contraste con theme adverso | Crear/editar un evento de prueba con `primaryColor`/`secondaryColor` claros (p.ej. `#FFFFFF`/`#FFFF99`) sobre imagen clara y capturar la invitación y el modal: ¿título, subtítulo y subtitle del modal legibles? (contraste con E13) | ⬜ | |

## 5. Hallazgos

> Formato: `A7-XX · <severidad 🔴/🟡/🟢> · <título corto>` — descripción, evidencia `archivo:línea`, impacto en el invitado. Un hallazgo sin evidencia no cuenta.

| ID | Sev | Título | Evidencia | Detalle / impacto |
|----|-----|--------|-----------|-------------------|
| A7-01 | | | | |

## 6. Hallazgos fuera de scope

> Cosas detectadas durante A7 que pertenecen a otra auditoría. Anotar factualmente + cross-ref; no profundizar ni duplicar. Candidatos probables según el checklist: validación server-side de `plusOneName` (→ A2, ver E5), validación de theme al guardarlo (→ A3, ver E13), imports/campos muertos y console.logs (→ A5, ver E14/E23), y cualquier observación sobre tokens/params de la cancel page (→ Fase S, solo anotar).

| ID | Pertenece a | Descripción | Evidencia |
|----|-------------|-------------|-----------|
| | | | |

## 7. Cierre

1. Verificar que **todos** los ítems E1–E23 y D1–D7 tienen resultado + evidencia, o `⏭️ NOT RUN` + razón explícita.
2. Completar el conteo de hallazgos por severidad.
3. Actualizar la fila **A7** de `docs/audits/00_INDEX.md` a ✅ con Owner, fechas, SHA auditado y conteo 🔴/🟡/🟢.
4. Commit + push: `audit: A7 frontend-ux — X🔴 Y🟡 Z🟢`.

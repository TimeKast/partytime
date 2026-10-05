# Runbook — sesión y factores: el gate del Edge, el guard de las rutas y el cambio de factores

> **Retrofit shipped** (`.claude/docs/retrofits/`) — absorbe la guía anterior [`pending-mfa-action-guard.md`](./pending-mfa-action-guard.md), que ahora solo redirige aquí.
>
> **Aplica si:** tu derivado nació antes de `v13.1.0` (`factoryVersion` en `package.json`) — y la parte D, también si nació **con** `v13.1.0`. La parte A (gate del Edge, open redirect y guard de rutas) aplica a **todo** derivado; la parte B (2FA ligado al login y regla de factores), solo si tienes 2FA (`src/lib/auth/mfa-login.ts` existe, desde `v11.0`); la parte C (revocación de sesiones, cambio de contraseña, alertas por correo, desactivar TOTP y los ajustes de la segunda revisión) se apoya en la B; la parte D (step-up de acciones sensibles ligado al login y gate de vinculación OAuth) cierra dos huecos que la B dejó abiertos, y **aplica también si ya aplicaste la B**. La detección exacta está en §2.
> **Severidad:** crítica si tienes 2FA. Un derivado con 2FA y sin este cambio **queda expuesto a quien tenga la contraseña y acceso al correo de la víctima**, y en un caso ni siquiera necesita el correo (§1, vector 2). Alta para el resto: rutas de API que responden a peticiones anónimas.
> **Costo:** medio día con el agente si tu `src/` se parece al del kit; un día si divergió. Son unos 80 archivos, dos migraciones y sus tests.
> **Por qué no llega solo:** todo es código de `src/`, que nace congelado en cada derivado (BR-FACTORY-006). `factory update` solo trae esta guía. **El kit no lo aplica por ti: se aplica a mano, repo por repo.**
> **Disponible desde:** kit `v13.1.0` (partes A-C); la parte D, desde el release siguiente
>
> **Audience:** el equipo (o el agente) de una app derivada del TimeKast Factory.
>
> Contrato vivo en el kit: [`sk-security`](../../skills/sk-security/SKILL.md) (gate del Edge, `requireRouteSession`), [`sk-mfa`](../../skills/sk-mfa/SKILL.md) (qué baja `pendingMfa`, regla de factores, `useSensitiveAction`) y [`sk-api`](../../skills/sk-api/SKILL.md) (route handlers). Esta guía no reproduce el código: nombra los commits, los archivos y el orden.

---

## 1. El hueco

Glosario rápido, para leer lo que sigue:

- **Edge gate:** la función `authorized()` de `src/lib/auth/auth.config.ts`. Corre en `src/proxy.ts` antes de cada petición y decide si pasa.
- **`pendingMfa`:** marca en la sesión de alguien que ya puso su contraseña pero todavía debe el segundo factor (está en `/2fa`).
- **Step-up:** volver a probar tu identidad (passkey, app autenticadora/TOTP, código por correo o código de recuperación) justo antes de una acción delicada. Deja un **grant** (permiso temporal de unos minutos) en la tabla `step_up_grants`.
- **Factor fuerte:** passkey o TOTP. El correo no lo es: quien controla tu bandeja lo recibe.

Son veinte vectores. El 1 y el 5 afectan a cualquier derivado; del 2 al 9, a los que tienen 2FA. Del 10 al 18 son de sesión, contraseña, factores y correo: afectan a cualquier derivado con el sistema de identidad de `v11` (passkeys, step-up), porque su arreglo se apoya en la parte B. El 19 y el 20 (parte D) quedaron abiertos en la versión de la parte B que viajó en `v13.1.0`: afectan a quien tiene 2FA, la haya aplicado o no.

**Vector 1 — el gate del Edge no bloqueaba a nadie.** `authorized()` respondía `return false` a una petición sin sesión. `next-auth` (v5 beta) **ignora** ese `false` cuando el proxy le pasa un handler propio, y el del kit lo hace (el wrapper que pone el correlation-ID). Resultado: el request seguía de largo. Las páginas se salvaban porque el layout protegido vuelve a revisar la sesión, pero cualquier ruta de `/api/*` sin su propio chequeo contestaba a un anónimo. Ejemplo real: `/api/health` respondía 200 y hacía `SELECT 1` sin sesión.

**Vector 2 — el 2FA se completaba con el grant de otra persona.** Al volver de `/2fa`, el callback `jwt()` bajaba `pendingMfa` si el usuario tenía **cualquier** grant vivo: sin mirar el método ni qué sesión lo generó. Dos consecuencias:

- un código por correo bastaba para completar el 2FA (el mismo factor que un magic link o un reset de contraseña);
- lo grave: un atacante con la contraseña entra y se queda esperando en `/2fa`. Cuando la **víctima** pasa su propio `/2fa` o hace un step-up en su sesión, ese grant también baja el `pendingMfa` del atacante. No necesita ni el correo.

**Vector 3 — vincular Google/GitHub desde `/2fa`.** Una sesión en `pendingMfa` podía vincular una cuenta de Google o GitHub propia: el gate de vinculación aceptaba cualquier grant y no miraba `pendingMfa`. Y un login con Google/GitHub no pasa por `/2fa` (`MFA_SATISFYING_LOGIN_PROVIDERS`), así que el atacante quedaba con una puerta de entrada permanente.

**Vector 4 — cambiar factores no pedía step-up.** Registrar una passkey, enrolar o confirmar un TOTP (`enrollTotp` incluso borraba el TOTP ya confirmado), quitar una passkey, vincular Google/GitHub y cambiar el correo corrían sin volver a pedir identidad. Regenerar los códigos de recuperación aceptaba un código por correo. Las acciones de admin que tocan credenciales de otro usuario (resetear su MFA, ponerle contraseña temporal, desvincular un método) tampoco pedían step-up. Con una sesión robada o una laptop desbloqueada, cualquiera podía plantar su propio factor.

**Vector 5 — open redirect en `/login`.** `/login?callbackUrl=https://sitio-malo.example` mandaba al usuario ahí después de iniciar sesión. Es la pieza que un phishing necesita: un enlace con tu dominio real que termina en una copia.

**Vector 6 — Google/GitHub se vinculaba solo por correo, sin pasar por `/2fa`.** Los providers de OAuth tienen `allowDangerousEmailAccountLinking`: un login anónimo con una cuenta de Google o GitHub **nueva** se ligaba en automático al usuario que tuviera el mismo correo. Y un login con Google/GitHub no pasa por `/2fa`. Quien controlara el buzón de la víctima abría una cuenta de Google con ese correo y entraba con sesión completa, sin segundo factor.

**Vector 7 — el step-up de otro login servía.** Aun con la regla de factores, el grant fuerte se buscaba por usuario, no por login. Con una cookie robada de otra sesión de la víctima, bastaba esperar a que la víctima hiciera un step-up en su propio dispositivo y, en ese minuto, registrar una passkey propia. Lo mismo con una cookie de admin robada y las acciones de admin.

**Vector 8 — el rate limit servía para bloquear al dueño.** El límite por usuario de los intentos de TOTP y de código de recuperación se gastaba en cada intento, y lo compartían `/2fa` y el step-up. Un atacante con solo la contraseña se quedaba en `/2fa` tecleando códigos basura y dejaba al dueño sin TOTP ni recuperación, en `/2fa` y en su propia sesión.

**Vector 9 — quitar un método de acceso y cambiar el correo de otro usuario sin step-up.** Desvincular Google/GitHub o la contraseña no pedía nada. Y un admin podía cambiar el correo de otro usuario (que queda marcado como verificado) sin step-up fuerte: con una sesión de admin robada, bastaba apuntar la cuenta a un buzón propio y resetear la contraseña desde ahí, rodeando el step-up de las otras acciones de admin.

**Vector 10 — una sesión revocada revivía sola.** Resetear el MFA de un usuario lo saca de todas sus sesiones subiendo `users.session_epoch` (un contador: cada cookie guarda el valor con el que nació, y si el de la base es mayor, la cookie ya no vale). Pero el callback `jwt()`, en el trigger `update`, copiaba el epoch nuevo a la cookie sin compararlo. Una cookie robada o revocada solo tenía que hacer `POST /api/auth/session` (lo que hace `useSession().update()`) para adoptar el epoch nuevo y seguir viva. Tampoco miraba si el usuario estaba borrado, y una cookie de un usuario que ya no existe se conservaba. Además, en los minutos que tarda en revalidarse, una cookie revocada todavía podía generar grants de step-up con el epoch nuevo.

**Vector 11 — cambiar o resetear la contraseña no cerraba ninguna sesión.** Ni el reset por correo, ni el cambio desde Perfil, ni la contraseña temporal que pone un admin tocaban el epoch: una cookie robada sobrevivía al cambio hasta 30 días. `adminSendPasswordReset` no pedía step-up fuerte como sus acciones hermanas, un admin podía aplicarse a sí mismo `resetMfa` o la contraseña temporal, y `password_changed` nunca se auditaba.

**Vector 12 — la primera contraseña se fijaba con el step-up de otra sesión.** Una cuenta que entró solo con Google/GitHub o passkey podía fijar su primera contraseña con cualquier step-up del usuario, sin importar de qué login viniera. Una contraseña es un método de acceso nuevo.

**Vector 13 — nadie avisaba, y los correos de seguridad se podían inyectar.** Las plantillas `password-changed` y `login-alert` existían, pero nada las enviaba, y nadie se enteraba de que alguien con su contraseña estaba fallando en `/2fa`. Además, esas plantillas interpolaban la IP y el User-Agent sin escapar: un header fabricado metía un enlace del atacante dentro de un correo legítimo, firmado con el DKIM de tu dominio.

**Vector 14 — "Desactivar" TOTP no hacía nada.** El botón solo mostraba un aviso de "próximamente": no había acción en el servidor. Y quitar una passkey no revisaba si el rol exige MFA ni qué pasaba con los códigos de recuperación.

**Vector 15 — adivinar la contraseña actual desde una sesión robada.** `POST /api/auth/password` no tenía rate limit. Con una cookie robada, la diferencia entre "contraseña incorrecta" (400) y éxito (200) sirve para probar contraseñas sin límite. Al acertar, el atacante pone la suya, y como el cambio conserva la sesión que lo hace y cierra las demás, el que queda fuera es el dueño.

**Vector 16 — el polling de notificaciones re-escribía la cookie vieja.** El wrapper del Edge de `next-auth` vuelve a enviar la cookie de sesión de la petición en **cada** respuesta que pasa por el proxy. El shell consulta `/api/notifications/poll` cada 30 segundos, así que una consulta que salió antes de cambiar la contraseña podía volver después y escribir encima la cookie vieja (con el epoch de antes): el usuario que acababa de cambiar su contraseña quedaba fuera.

**Vector 17 — quedarse atorado en `/2fa` con una passkey de otro dominio.** Si un usuario quitaba su último factor que sirve en este sitio y le quedaba solo una passkey de otro dominio, sin códigos de recuperación sin usar, su siguiente login con contraseña pedía `/2fa` y ahí solo se ofrecía esa passkey, que no puede verificar aquí. Quedaba bloqueado, sin importar su rol.

**Vector 18 — las demás plantillas de correo tampoco escapaban.** Además de las de seguridad, las plantillas de invitación, notificación, reset, verificación, código de step-up y registro interpolaban nombres y textos sin escapar: el mismo riesgo de HTML inyectado en un correo firmado con tu dominio.

**Vector 19 — las acciones sensibles aceptaban el step-up de otro login.** El vector 7 ató al login la regla de factores y las acciones de admin de credenciales, pero no el gate general de `withAuth`/`withSelf` (`checkStepUp`): toda acción con par en `MFA_SENSITIVE_ACTIONS` (crear usuarios, cambiar permisos, lo que tu proyecto haya declarado) seguía aceptando un step-up de cualquier sesión del usuario. Con una cookie completa robada bastaba esperar a que la víctima hiciera un step-up en su propio dispositivo (ventana de 5 a 10 minutos) para, por ejemplo, invitarse como admin. Además, `findLiveGrant` quitaba el filtro de login cuando el `loginId` llegaba vacío, y una sesión completa de antes de `loginId` hacía que el sheet de step-up entrara en loop. Lo mismo en `unlinkAccount`: quitar la contraseña (o un provider de un usuario sin factor) aceptaba un step-up de otra sesión.

**Vector 20 — vincular un Google ajeno sin pasar por nada.** En el `signIn`, `alreadyLinked` buscaba por `(usuario, provider)`, sin `providerAccountId`, y el rechazo de `pendingMfa` vivía **dentro** del `if (!alreadyLinked)`. Con solo la contraseña de un usuario que ya vinculó **un** Google, el atacante entra, queda en `/2fa`, da "Continuar con Google" con **su** Google: el atajo encuentra el Google de la víctima, se salta todos los chequeos, y `@auth/core` vincula la identidad nueva (lee la sesión por su cuenta). Sesión completa y una entrada permanente que nunca pasa por `/2fa`. Igual con una cookie robada o revocada. Y el kit leía la cookie de sesión distinto que `@auth/core`: el core parsea el header `Cookie` crudo con su propio parser (el primer valor de un nombre repetido gana; recorta espacios y tabulaciones) y junta **toda** cookie cuyo nombre empiece con el de la sesión (`<nombre>`, `<nombre>.0`… y también `<nombre>X`). Una cookie en trozos, renombrada, con una tabulación delante, o repetida con otro `Path` (la de la víctima primero, una sesión completa del atacante después) le mostraba al kit otra sesión —o ninguna— mientras el core vinculaba a la de la víctima.

**Qué hace el kit hoy:**

| Vector | Arreglo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `authorized()` devuelve un `Response` explícito: 401 JSON para `/api/*`, redirect a `/login?callbackUrl=<ruta>` para páginas. Nunca `false`. Cuatro rutas anónimas por diseño entran a `publicPaths`: `/api/csp-report`, `/api/unsubscribe`, `/api/invites/validate`, `/api/invites/accept`. Además, cada route handler revisa su propia sesión con `requireRouteSession` (401 sin usuario, 403 en `pendingMfa`), y un test recorre `src/app/api/**` y falla si una ruta lee la sesión sin el guard            |
| 2      | Cada login genera `token.loginId` (y `token.authAt`). El `/2fa` escribe ese `loginId` en el grant (columna nueva `step_up_grants.login_id`), y `pendingMfa` solo baja con un grant de passkey, TOTP o recuperación **de este login**. Nunca con correo. Un token en `pendingMfa` sin `loginId` (de antes del deploy) se termina: el usuario vuelve a iniciar sesión                                                                                                                                            |
| 3      | La vinculación se rechaza desde `pendingMfa` y pasa por la regla de factores                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4      | Una sola regla, `assertFactorChangeStepUp` (abajo). Admin: step-up fuerte. TOTP: la fila nueva reemplaza a la confirmada en una transacción. Rate limit por usuario en el TOTP del step-up y de `/2fa`. El servidor decide el riesgo del código por correo                                                                                                                                                                                                                                                     |
| 5      | `/login` (página y formulario) pasa `callbackUrl` por `safeCallbackUrl`: solo sobreviven rutas relativas del mismo origen                                                                                                                                                                                                                                                                                                                                                                                      |
| 6      | Con MFA encendido, un login anónimo de Google/GitHub que crearía un vínculo **nuevo** con un usuario que tiene factor se rechaza (`/login?error=OAuthAccountNotLinked`, con un aviso que explica cómo vincularlo desde Perfil › Seguridad). Una identidad ya vinculada entra normal, y un usuario sin factor conserva el auto-vínculo                                                                                                                                                                          |
| 7      | La regla de factores y las acciones de admin solo aceptan grants de **este** login (`loginId`), incluido el de correo del primer factor. Una sesión sin `loginId` se rechaza                                                                                                                                                                                                                                                                                                                                   |
| 8      | El TOTP cuenta solo intentos **fallidos** por usuario, en buckets separados para `/2fa` (`mfaLoginFailUser`) y el step-up (`stepUpFailUser`). El código de recuperación no tiene límite por usuario (sí por usuario+IP): es la puerta del dispositivo perdido                                                                                                                                                                                                                                                  |
| 9      | Desvincular sigue la misma regla que vincular (Google/GitHub con factor → regla de factores; lo demás → cualquier step-up). El cambio de correo que hace un admin pide step-up fuerte, y las pantallas de admin piden el step-up con `useSensitiveAction`                                                                                                                                                                                                                                                      |
| 10     | En `update`, el `jwt()` termina la sesión (devuelve `null`, que borra la cookie) si el usuario no existe o está borrado, si la cookie no trae epoch, o si el epoch vivo es mayor. Solo adopta un epoch nuevo dentro del **scope de re-vinculación**: un `AsyncLocalStorage` del servidor que nombra usuario, login y epoch exactos, y que ninguna petición puede fabricar. Los grants llevan el epoch de la cookie y se rechazan si va atrás                                                                   |
| 11     | `revokeUserSessions(tx, userId)` sube el epoch dentro de la misma transacción del cambio. Reset por correo, contraseña temporal y quitar la contraseña desde admin cierran **todas** las sesiones. Tu propio cambio de contraseña cierra **todas menos la tuya**: pasa a `POST /api/auth/password`, que se vuelve a vincular dentro del scope. `adminSendPasswordReset` pide step-up fuerte; `resetMfa` y la contraseña temporal rechazan al propio admin. `password_changed` se audita en cada cambio y reset |
| 12     | La primera contraseña pide un step-up de **este** login: la regla de factores con MFA encendido y un factor, o cualquier grant de este login si no. El vínculo de contraseña en `linkAccount` sigue la misma regla                                                                                                                                                                                                                                                                                             |
| 13     | `password-changed` sale en cada cambio y reset. Un código incorrecto en `/2fa` avisa al dueño como máximo una vez por hora (columna nueva `users.last_mfa_alert_at`, un solo `UPDATE` condicional). Toda plantilla de seguridad escapa lo que interpola (`escapeHtml`); la IP se omite si no es una IP válida y el User-Agent se reduce a la familia del navegador                                                                                                                                             |
| 14     | `disableTotp` quita la app autenticadora detrás de la regla de factores. Quitar un factor (TOTP o passkey) se niega si el rol exige MFA y no quedaría un factor usable aquí, y borra los códigos de recuperación si no queda ningún factor. Todas las escrituras de factores toman el mismo bloqueo de fila del usuario. Cada remoción se audita y avisa por correo                                                                                                                                            |
| 15     | Límite por usuario que solo cuenta contraseñas actuales **incorrectas** (`passwordChangeFailUser`, 5 cada 15 min) → 429. Un cambio correcto, un error de validación o un step-up pendiente no gastan intentos                                                                                                                                                                                                                                                                                                  |
| 16     | `/api/notifications/poll` sale del matcher del proxy (`src/proxy.ts`). La ruta se protege sola: `requireRouteSession` (401 anónimo, 403 `pendingMfa`) y un 403 propio si hay un cambio de contraseña obligatorio pendiente                                                                                                                                                                                                                                                                                     |
| 17     | Tercera regla al quitar un factor, para **todo** rol: se niega si solo quedarían factores que no sirven aquí (una passkey de otro dominio) y ningún código de recuperación sin usar                                                                                                                                                                                                                                                                                                                            |
| 18     | Todas las plantillas escapan con `escapeHtml` cada valor que va al HTML                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 19     | `checkStepUp` pasa el `loginId` de la cookie a `verifyStepUp`: toda acción sensible exige un step-up de **este** login. `verifyStepUp` falla cerrado (`step_up_required`, sin consultar) si se le pide ligar al login y el `loginId` viene vacío; solo es user-scoped si el llamador omite la clave. Con MFA encendido, el `jwt()` termina **todo** token sin `loginId`, no solo los que están en `pendingMfa`, y el step-up de `unlinkAccount` también exige uno de este login |
| 20     | Para OAuth/OIDC con sesión activa, **antes de cualquier atajo**: se rechaza si la sesión debe el segundo factor (→ `/2fa`), si está revocada (epoch atrás o ausente), si el usuario no existe o está borrado, o si (MFA encendido) no trae `loginId`. `alreadyLinked` compara la identidad exacta (`provider` + `providerAccountId`). La cookie se lee **exactamente** como la lee el core: el header `Cookie` crudo con una copia de su parser y el mismo ensamblado de `SessionStore` (`src/lib/auth/session-cookie-parse.ts`, con un test que la compara contra el `@auth/core` instalado). Una cookie presente pero ilegible rechaza el login OAuth |

**La regla de factores** (vector 4), en palabras:

- El correo solo autoriza enrolar el **primer** factor fuerte.
- Si ya tienes un factor usable, agregar, reemplazar o quitar uno (incluye vincular Google/GitHub y cambiar el correo) exige step-up **fuerte** (passkey o TOTP), **o** un código de recuperación canjeado en **este** login (el caso "perdí el teléfono").
- Sin factor usable **y** sin correo configurado en el proyecto, el propio login autoriza enrolar el primer factor durante **15 minutos** desde ese login.
- Todo step-up que la regla acepta tiene que venir de **este** login, no de otra sesión del mismo usuario.
- MFA apagado en el proyecto: la regla no pide nada.

En la UI, cada pantalla de seguridad pasa por `useSensitiveAction`: si el servidor responde `step_up_*`, abre el `StepUpSheet`, pide el factor y reintenta la acción. El sheet ofrece código de recuperación en cambios de alto riesgo, invita a enrolar un factor cuando no hay ninguno usable y avisa que hay que volver a iniciar sesión si la ventana de 15 minutos ya pasó.

## 2. ¿Te aplica?

Corre esto desde la raíz del derivado. Cada línea con resultado "te aplica" es un vector abierto:

```bash
# Vector 1 — gate del Edge. CON salida → te aplica.
grep -n "if (!isLoggedIn) return false" src/lib/auth/auth.config.ts

# Vector 1 — guard de rutas. SIN salida → te aplica.
ls src/lib/auth/route-session.ts 2>/dev/null

# Vector 5 — open redirect. SIN salida → te aplica.
grep -n "safeCallbackUrl" "src/app/(auth)/login/page.tsx"

# ¿Tienes 2FA? SIN salida → sáltate la parte B.
ls src/lib/auth/mfa-login.ts 2>/dev/null

# Vectores 2 y 3 — 2FA ligado al login. SIN salida → te aplica.
grep -n "hasLoginSecondFactorGrant" src/lib/auth/auth.ts

# Vector 4 — regla de factores. SIN salida → te aplica.
ls src/lib/auth/factor-change.ts 2>/dev/null

# Vectores 6-9 — auto-vínculo, step-up de otro login, bloqueo por rate limit, desvincular. SIN salida → te aplica.
grep -n "OAuthAccountNotLinked" src/lib/auth/auth.ts

# Vectores 10 y 11 — revocación y cambio de contraseña. SIN salida → te aplica.
ls src/lib/auth/session-revocation.ts 2>/dev/null

# Vector 13 — correos de seguridad sin escapar. SIN salida → te aplica.
grep -n "escapeHtml" src/lib/email/templates/password-changed.ts

# Vectores 15-18 — segunda revisión. SIN salida → te aplica.
grep -n "passwordChangeFailUser" src/lib/rate-limit.ts

# Vector 14 — desactivar TOTP. SIN salida → te aplica.
grep -n "export async function disableTotp" src/lib/auth/totp.ts

# Vector 19 — step-up de acciones sensibles ligado al login. SIN salida → te aplica (parte D).
grep -n "requireStrong, loginId" src/lib/actions/helpers.ts

# Vector 20 — gate de vinculación OAuth. SIN salida → te aplica (parte D).
grep -n "readActiveSessionCookie" src/lib/auth/auth.ts

# Guía anterior (pendingMfa en los wrappers). SIN salida → aplica también el paso 0 de §3.
grep -n "pendingMfa" src/lib/actions/helpers.ts
```

Si tu derivado es anterior a `v11.0` no tiene `safe-redirect.ts`: cópialo del Factory (`src/lib/auth/safe-redirect.ts`, con su test) antes de aplicar el vector 5.

**Rutas propias.** Busca también las de tu proyecto: toda ruta de `src/app/api/**` que llame `auth()` necesita `requireRouteSession`, y toda que no lo llame y no esté en `publicPaths` ahora responde 401 a un anónimo (eso es lo correcto, salvo que sea anónima por diseño):

```bash
grep -rln "auth()" src/app/api --include=route.ts | xargs grep -L "requireRouteSession"
```

## 3. Pasos

### 3.1 Orden y reglas

- **Parte A** (pasos 0-3) primero. Es independiente y se puede subir sola.
- **Parte B** (pasos 4-8) solo con 2FA. **Los pasos 5, 6 y 8 van juntos en el mismo push, nunca uno sin los otros:** el 5 hace que el servidor rechace los cambios de factor sin step-up, y el 6 es la UI que sabe pedirlo. Con solo el 5, las pantallas de seguridad quedan rotas (el TOTP falla al montar, la passkey muestra un error genérico). Con solo el 6, la UI pide un step-up que el servidor no exige. El 8 cierra lo que el 5 deja abierto: el rate limit por usuario que agrega el 5 sirve para bloquear al dueño (vector 8), y las pantallas de admin no saben pedir el step-up que el 5 exige.
- **Parte C** (pasos 9-12) se apoya en la parte B (`loginId`, regla de factores, `useSensitiveAction`): aplícala después. **Los pasos 9 y 10 van en el mismo push:** el 9 hace que `update` termine toda cookie cuyo epoch va atrás, y el 10 es el primero que sube el epoch en un cambio propio (y el scope que salva a quien lo hizo). El 12 necesita el 11 (usa sus alertas). El 13 corrige piezas del 10, 11 y 12: aplícalo en el mismo push que ellos.
- **Parte D** (pasos 14-18) se apoya en la B (`loginId`, `readActiveLoginContext`) y va en el mismo push que ella si todavía no la aplicas. **Si ya aplicaste la B, aplica la D de todos modos**: cierra los vectores 19 y 20, que la versión de la B de `v13.1.0` dejó abiertos. Sin migración.
- **Dos migraciones, las dos las generas tú** (§3.3): `step_up_grants.login_id` en el paso 4 y `users.last_mfa_alert_at` en el paso 11.

### 3.2 Aplicar los commits del Factory

Mecánica de [`legacy-migration.md` §F5](./legacy-migration.md): por subject, un commit a la vez, solo `src`, `tests` y `types`. **Las migraciones del Factory se excluyen** (`:!src/lib/db/migrations`): tú generas las tuyas (§3.3).

| Paso | Subject del commit en el Factory                                              | Qué trae                                                                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `fix(auth): refuse actions and factor enrolment while pendingMfa is up`       | `withAuth`/`withSelf` rechazan una sesión en `pendingMfa`. Sáltalo si ya aplicaste `pending-mfa-action-guard.md`                                                                                              |
| 1    | `fix(health): check the session in /api/health itself`                        | `/api/health` responde 401 antes del `SELECT 1`                                                                                                                                                               |
| 2    | `fix(auth): make the Edge gate actually refuse anonymous requests`            | Vector 1 (gate) y vector 5                                                                                                                                                                                    |
| 3    | `feat(auth): one session guard for route handlers and direct-auth actions`    | `requireRouteSession` / `requireActionSession` y el test que recorre las rutas                                                                                                                                |
| 4    | `fix(auth): clear pendingMfa only with a second factor proven in this login`  | Vector 2: `loginId`, columna `login_id` (**sin** la migración)                                                                                                                                                |
| 5    | `feat(auth): require a strong step-up to change factors once one exists`      | Vectores 3 y 4 en el servidor                                                                                                                                                                                 |
| 6    | `feat(auth): step-up flow in the UI for every factor change`                  | `useSensitiveAction`, `StepUpSheet`, pantallas de seguridad                                                                                                                                                   |
| 7    | `refactor(auth): take verifyTotp and canHardDeleteUser out of server actions` | Higiene: dos funciones sin auth dejan de ser server actions                                                                                                                                                   |
| 8    | `fix(auth): close the gaps the final security review found`                   | Vectores 6 a 9, y el step-up en las pantallas de admin. Trae también dos variables nuevas de `.env.example` (el comando no las copia: van a mano)                                                             |
| 9    | `fix(auth): make session revocation impossible to undo`                       | Vector 10                                                                                                                                                                                                     |
| 10   | `fix(auth): end other sessions when a password changes or is reset`           | Vectores 11 y 12; `POST /api/auth/password` (mismo push que el 9)                                                                                                                                             |
| 11   | `feat(auth): email the owner on password changes and failed 2FA`              | Vector 13; columna `users.last_mfa_alert_at` (**sin** la migración)                                                                                                                                           |
| 12   | `feat(auth): let users turn off their authenticator app`                      | Vector 14                                                                                                                                                                                                     |
| 13   | `fix(auth): close the gaps the second security review found`                  | Vectores 15 a 18, y ajustes: bloqueo en `resetMfa`, códigos de recuperación solo con factor, cookie expirada en `signedOut`, chequeo exacto de JSON. Trae dos variables nuevas de `.env.example` (van a mano) |
| 14   | `fix(auth): bind every sensitive-action step-up to this login`                | Vector 19                                                                                                                                                                                                     |
| 15   | `fix(auth): gate an OAuth link on a live, complete login before any shortcut` | Vector 20 (mismo push que el 14)                                                                                                                                                                              |
| 16   | `fix(auth): read the session cookie exactly the way @auth/core does`          | Vector 20: sin él, renombrar la cookie a `<nombre>X` se salta el paso 15. **Mismo push que el 15**                                                                                                          |
| 17   | `fix(auth): bind the unlink step-up to this login while MFA is on`            | Vector 19 en `unlinkAccount` (mismo push que el 14)                                                                                                                                                          |
| 18   | `fix(auth): parse the raw Cookie header with core's own algorithm`            | Vector 20: sin él, una cookie repetida en otro `Path` o con tabulación se salta los pasos 15 y 16. **Mismo push que el 15**, junto con `test(auth): pin the session cookie reader against the installed @auth/core` |

```bash
F=<checkout-del-factory>
apply_factory_commit() {
  C=$(git -C "$F" log -1 --format=%H -F --grep="$1")
  [ -n "$C" ] || { echo "no encontré: $1"; return 1; }
  git -C "$F" diff "$C~1" "$C" -- src tests types ':!src/lib/db/migrations' | git apply --reject
}

apply_factory_commit 'refuse actions and factor enrolment while pendingMfa'   # paso 0 (si aplica)
apply_factory_commit 'check the session in /api/health itself'                # paso 1
apply_factory_commit 'make the Edge gate actually refuse anonymous'           # paso 2
apply_factory_commit 'one session guard for route handlers'                   # paso 3
```

Corre `pnpm verify` y commitea la parte A antes de seguir. Después, la parte B:

```bash
apply_factory_commit 'clear pendingMfa only with a second factor proven'      # paso 4 → luego §3.3
apply_factory_commit 'require a strong step-up to change factors'             # paso 5
apply_factory_commit 'step-up flow in the UI for every factor change'         # paso 6 (mismo push que el 5)
apply_factory_commit 'take verifyTotp and canHardDeleteUser out'              # paso 7
apply_factory_commit 'close the gaps the final security review found'         # paso 8 (mismo push que el 5 y el 6)
```

Corre `pnpm verify` y commitea. Después, la parte C:

```bash
apply_factory_commit 'make session revocation impossible to undo'              # paso 9
apply_factory_commit 'end other sessions when a password changes or is reset'  # paso 10 (mismo push que el 9)
apply_factory_commit 'email the owner on password changes and failed 2FA'      # paso 11 → luego §3.3
apply_factory_commit 'let users turn off their authenticator app'              # paso 12
apply_factory_commit 'close the gaps the second security review found'        # paso 13 (mismo push que 10-12)
```

Después, la parte D (también si ya tenías la B):

```bash
apply_factory_commit 'bind every sensitive-action step-up to this login'           # paso 14
apply_factory_commit 'gate an OAuth link on a live, complete login'                # paso 15 (mismo push que el 14)
apply_factory_commit 'read the session cookie exactly the way @auth/core'          # paso 16 (mismo push que el 15)
apply_factory_commit 'bind the unlink step-up to this login'                       # paso 17
apply_factory_commit "parse the raw Cookie header with core's own algorithm"        # paso 18 (mismo push que el 15)
apply_factory_commit 'pin the session cookie reader against the installed'         # paso 18 (su test)
```

`git apply --reject` aplica lo que puede y deja un `.rej` por cada bloque que no encajó (tu `src/` ya divergió ahí). Aplica esos bloques a mano con la lista de abajo y borra los `.rej`. Commitea con el pre-commit de tu repo (nunca `--no-verify`) y deja que tu husky regenere sus autogen.

**Estado final, archivo por archivo** (para aplicar a mano lo que el patch rechace):

_Parte A_

1. **`src/lib/auth/auth.config.ts`** — sin sesión, `authorized()` devuelve `Response.json({ error: 'Unauthorized' }, { status: 401 })` si la ruta empieza con `/api/`, y `Response.redirect(new URL('/login?callbackUrl=<pathname>', nextUrl))` si no. Nunca `return false`. `publicPaths` gana `/api/csp-report`, `/api/unsubscribe`, `/api/invites/validate` y `/api/invites/accept`. **Revisa las rutas anónimas de tu proyecto** (webhooks, callbacks, endpoints públicos): antes funcionaban por accidente, porque el gate no bloqueaba; ahora responden 401 si no las agregas a la lista.
2. **`src/app/(auth)/login/page.tsx`** y **`src/components/auth/LoginForm.tsx`** — `callbackUrl` pasa por `safeCallbackUrl` (`@/lib/auth/safe-redirect`) en los dos.
3. **`src/lib/auth/route-session.ts`** (nuevo) — `requireRouteSession(session, { allowPendingMfa? })` devuelve `{ session }` o un `Response` (401 / 403). `requireActionSession(session)` es el gemelo para server functions que llaman `auth()` directo: devuelve `{ ok: true, session }` o `{ ok: false, reason, error }`.
4. **Rutas del kit** — usan `requireRouteSession`: `health`, `avatar/[userId]` (y su respuesta pasa a `Cache-Control: private`), `notifications/poll`, `push/subscribe`, `invites/send`, `email/test` y las dos de registro de passkey. En `invites/send` y `email/test`, la relajación de desarrollo cubre solo el chequeo de rol, nunca la falta de sesión.
5. **`src/lib/actions/admin/user-admin.ts`** (`getUsers`, `getAdjacentUsers`, `getUserById`, `checkCanHardDelete`) y **`src/lib/actions/audit.ts`** — usan `requireActionSession`. `mfa-login.ts` no: corre bajo `pendingMfa` a propósito.
6. **Tus rutas y guards propios** — aplícales lo mismo (la búsqueda de §2).

_Parte B_

7. **`types/next-auth.d.ts`** — el JWT declara `loginId?: string` y `authAt?: number`. No van en la `Session`: nada del navegador los necesita.
8. **`src/lib/db/schema/step-up-grants.ts`** — columna `loginId: uuid('login_id')`, nullable. Luego §3.3.
9. **`src/lib/auth/auth.ts`** — en el `jwt()`, con `trigger` `signIn` o `signUp`: `token.loginId = randomUUID()` y `token.authAt = Date.now()`. Un token con `pendingMfa` y sin `loginId` → `return null`. En `trigger === 'update'`, `pendingMfa` baja solo con `hasLoginSecondFactorGrant(userId, loginId)`. Exporta `readActiveLoginId` y `readActiveLoginContext` (leen el token de la cookie). El gate de vinculación del `signIn` rechaza `pendingMfa` y aplica `assertFactorChangeStepUp` a Google/GitHub. **Auto-vínculo anónimo:** sin sesión activa, con MFA encendido, un login OAuth/OIDC cuya identidad `(provider, providerAccountId)` todavía no existe en `accounts`, para un usuario existente con factor (`userHasMfaEnabled`), devuelve `'/login?error=OAuthAccountNotLinked'`.
10. **`src/lib/auth/step-up.ts`** — `findLiveGrant` acepta `loginId`; nuevos `hasLoginSecondFactorGrant` (passkey/TOTP/recuperación de este login) y `hasLoginRecoveryGrant`; `grantStepUp`, `verifyStepUpPasskey` y `verifyStepUp` aceptan `loginId` (en `verifyStepUp` filtra todas sus búsquedas). **`src/lib/auth/email-otp.ts`**: `verifyEmailOtpCode` recibe el `loginId` y lo escribe en el grant que promueve.
11. **`src/lib/auth/mfa-login.ts`** y **`src/lib/auth/recovery-redeem.ts`** (nuevo) — el `/2fa` escribe el `loginId` en el grant que genera; el canje de códigos de recuperación vive en `recovery-redeem.ts` y lo comparten `/2fa` y el step-up. Rate limit: `mfaVerify` por `userId:ip` en cada intento; en TOTP, además, `mfaLoginFailUser` por usuario, que solo cuenta fallos; recuperación, sin límite por usuario (solo `recoveryCode` por `userId:ip`).
    **`src/lib/rate-limit.ts`** — buckets nuevos `mfaLoginFailUser` (`/2fa`) y `stepUpFailUser` (step-up), 10 fallos en 15 min cada uno, y la función `isRateLimitExhausted(identifier, type)`, que consulta sin consumir: se consulta antes de comparar el código y se consume con `checkRateLimit` solo si el código es incorrecto. **`.env.example`** (a mano): `RATE_LIMIT_MFA_LOGIN_FAIL_USER_REQUESTS`/`_WINDOW_SECONDS` y `RATE_LIMIT_STEP_UP_FAIL_USER_REQUESTS`/`_WINDOW_SECONDS`, comentadas (son opcionales).
12. **`src/lib/auth/factor-change.ts`** (nuevo) — `assertFactorChangeStepUp({ userId, role, loginId, authAt, kind: 'add' | 'remove' })` (la regla de §1) y `assertStrongStepUp({ userId, role, loginId })` (admin). Los dos pasan `loginId` a `verifyStepUp` y rechazan con `step_up_required` si no hay `loginId`.
13. **`src/config/mfa.ts`** — `FIRST_FACTOR_LOGIN_WINDOW_SECONDS = 900`; `recovery_codes/regenerate` pasa a `high`; entran `access_methods/link` y `mfa_factors/change` (ambos `medium`, para que el sheet pueda pedir correo en el primer factor).
14. **Superficies que aplican la regla** — rutas `passkey/register` y `register/verify`; `enrollTotp` y `confirmTotp` (`src/lib/auth/totp.ts`); `removePasskey` (`src/lib/actions/passkey.ts`); `regenerateRecoveryCodes`; `linkAccount`; `requestEmailChange`; `unlinkAccount` (Google/GitHub con MFA encendido y algún factor → `kind: 'remove'`; lo demás → cualquier step-up, igual que al vincular). Admin (`resetMfa`, contraseña temporal, desvincular método y el cambio de correo dentro de `updateUser`) → `assertStrongStepUp` con el `loginId` del admin (`readActiveLoginContext`).
15. **TOTP** — `src/lib/db/schema/totp.ts` (solo comentario) y `totp.ts`: `enrollTotp` borra solo la fila pendiente; `confirmTotp`, en una transacción, borra la confirmada y confirma la nueva. `verifyTotp` filtra `confirmedAt IS NOT NULL`.
16. **`src/lib/actions/step-up.ts`** — la rama TOTP de `verifyStepUpFactor` usa `mfaVerify` por `userId:ip` y `stepUpFailUser` (solo fallos); la rama de correo pasa el `loginId` a `verifyEmailOtpCode`; `requestStepUpEmailCodeFactor` recibe `{ resource, action }` y resuelve el riesgo con `resolveSensitivePair`; nuevo `verifyStepUpRecoveryFactor` (solo `recoveryCode` por `userId:ip`).
17. **UI** — `src/lib/hooks/useSensitiveAction.tsx` y `src/lib/auth/step-up-client.ts` (nuevos: los códigos `step_up_*` para el cliente); `passkey-client.ts` (`enrollPasskey` devuelve `{ status: 'step_up', code }` en 403); `StepUpSheet` (props `sensitiveAction` y `hasTotp`, opción de recuperación); `PasskeyEnrollment`, `PasskeysList`, `TotpEnrollment` (ya no enrola al montar: botón explícito), `RecoverySection`, `AccessMethodsList` (vincular y desvincular), `ChangeEmailForm` y `profile/page.tsx` pasan por `useSensitiveAction`. **Admin:** `src/components/admin/admin-step-up.ts` (nuevo: la postura de factores del admin que actúa y el par `users/update` para el sheet, que **no** se declara en `MFA_SENSITIVE_ACTIONS` porque gatearía toda edición de usuario); `settings/users/[id]/page.tsx` resuelve esa postura en el servidor; `UserDetailContent`, `UserDataTab` y `AdminAccessMethodsList` pasan por `useSensitiveAction` con riesgo `high`. **`LoginForm`:** el error `OAuthAccountNotLinked` tiene su propio aviso ("Esta cuenta aún no está vinculada. Entra con tu método habitual y vincula Google o GitHub desde Perfil › Seguridad.") y no muestra el botón de reenviar verificación.
18. **Higiene** — `verifyTotp` se mueve a `src/lib/auth/totp-verify.ts` (`server-only`); `src/lib/db/helpers/can-hard-delete.ts` pasa a `server-only` (se llega por `checkCanHardDelete`). Actualiza los imports de `verifyTotp` en tu código.

_Parte C_

19. **`src/lib/auth/auth.ts` (revocación)** — el `jwt()` en `update` lee `sessionEpoch` y `deletedAt` vivos y termina la sesión si falta el usuario, está borrado, la cookie no trae epoch o el epoch vivo es mayor (salvo dentro del scope). En la revalidación por intervalo, un usuario que ya no existe también termina la sesión. `readActiveLoginContext` devuelve además `sessionEpoch`. Exporta `unstable_update` de `NextAuth(...)`.
20. **`src/lib/auth/session-rebind.ts`** (nuevo) — `runWithSessionRebind({ userId, loginId, epoch }, fn)` y `currentSessionRebind()`, sobre `AsyncLocalStorage`.
21. **Grants con epoch** — `step-up.ts`, `recovery-redeem.ts`, `email-otp.ts`, `mfa-login.ts` y `actions/step-up.ts` sellan el grant con el epoch de la cookie y lo rechazan si va atrás del vivo; `assertFactorChangeStepUp`, `assertStrongStepUp` y el gate sensible de `withAuth`/`withSelf` (`src/lib/actions/helpers.ts`) hacen la misma comparación. Las superficies que llaman la regla (rutas de passkey, `passkey.ts`, `recovery-codes.ts`, `link-account.ts`, `request-email-change.ts`, `totp.ts`, `user-admin.ts`) pasan el `sessionEpoch`.
22. **`src/lib/auth/session-revocation.ts`** (nuevo) — `revokeUserSessions(exec, userId)`: `session_epoch + 1` en SQL, recibe la transacción del cambio y devuelve el epoch nuevo. La usan `resetPassword` (`password-reset.ts`), `adminSetTemporaryPassword`, quitar la contraseña en `adminUnlinkUserMethod` y `resetMfa`, que pasa a ser una sola transacción.
23. **Cambio propio de contraseña** — nuevos `src/app/api/auth/password/route.ts` (`POST`, `requireRouteSession` + el CSRF de `passkey/_shared.ts`; modos `change` y `mandatory`), `src/lib/auth/password-change.ts` (`server-only`: `parsePasswordChange`, `assertFirstPasswordStepUp`, `changeOwnPassword`) y `src/lib/auth/password-change-client.ts`. Se **borran** `src/lib/actions/change-password.ts` y `src/lib/actions/mandatory-password-change.ts` (y sus tests). `ChangePasswordForm` y `change-password-required-form.tsx` llaman la ruta y hacen `router.refresh()`; si la respuesta trae `signedOut: true`, mandan a iniciar sesión. Busca en tu código otros usos de las dos acciones borradas.
24. **Admin (paso 10)** — `adminSendPasswordReset` pide `requireAdminStrongStepUp`; `resetMfa` y `adminSetTemporaryPassword` rechazan cuando el admin se apunta a sí mismo (va al flujo de Perfil); `UserDetailContent` refleja esos cambios. `linkAccount` (rama `password`) usa `assertFirstPasswordStepUp`.
25. **Alertas (paso 11)** — `src/lib/auth/security-alerts.ts` (nuevo): `sendPasswordChangedAlert`, `sendMfaFactorRemovedAlert`, `scheduleMfaFailureAlert` (usa `after()` y el `UPDATE` condicional sobre `last_mfa_alert_at`). `password-change.ts`, `password-reset.ts` y `reset-password/route.ts` envían `password-changed`; `mfa-login.ts` agenda la alerta en cada TOTP o código de recuperación incorrecto. `src/lib/db/schema/users.ts`: `lastMfaAlertAt: timestamp('last_mfa_alert_at', { mode: 'date', withTimezone: true })`, nullable (§3.3).
26. **Plantillas (pasos 11 y 12)** — `layout.ts` exporta `escapeHtml`; `security-details.ts` (nuevo: `safeIpAddress`, `describeUserAgent`); `mfa-failures-alert.ts` y `mfa-factor-removed-alert.ts` (nuevas, re-exportadas en `src/lib/email/index.ts`); `password-changed.ts`, `login-alert.ts`, `email-change-alert.ts`, `access-method-unlinked-alert.ts` y `credentials-wiped.ts` escapan lo que interpolan. `parse-user-agent.ts` exporta la etiqueta de dispositivo desconocido. **Si tienes plantillas propias** que muestran datos del usuario o de la petición, aplícales `escapeHtml`.
27. **Desactivar TOTP (paso 12)** — `src/lib/auth/factor-lock.ts` (nuevo: `lockUserForFactorChange(tx, userId)`, `SELECT … FOR UPDATE` como primera sentencia) y `src/lib/auth/factor-removal.ts` (nuevo: `enforceFactorRemovalRules`). `totp.ts` gana `disableTotp` y toma el bloqueo en `enrollTotp`/`confirmTotp`; `passkey.ts` (registro) y `actions/passkey.ts` (`removePasskey`) también; en `auth.ts`, `userHasMfaEnabled` y `userHasUsableMfaFactor` aceptan un `exec` opcional (la transacción), para ver el borrado todavía sin commit. `TotpEnrollment` llama `disableTotp` con `useSensitiveAction` (riesgo `high`) y una confirmación.
28. **Rate limit del cambio de contraseña (paso 13)** — `src/lib/rate-limit.ts`: bucket `passwordChangeFailUser` (5 fallos / 15 min, por usuario, sin bucket por IP delante: la sesión es la única entrada). `password/route.ts` lo consulta con `isRateLimitExhausted` antes de correr bcrypt y lo consume solo cuando `changeOwnPassword` devuelve `reason: 'wrong_current_password'` (nuevo en `password-change.ts`); responde 429. **`.env.example`** (a mano): `RATE_LIMIT_PASSWORD_CHANGE_FAIL_USER_REQUESTS` y `RATE_LIMIT_PASSWORD_CHANGE_FAIL_USER_WINDOW_SECONDS`, comentadas.
29. **Respuesta `signedOut` (paso 13)** — la ruta expira la cookie de sesión (el nombre y los atributos salen de `authConfig.cookies.sessionToken`, más cada fragmento `<nombre>.N` que llegó): sin eso, `/login` veía la cookie vieja y rebotaba a `/dashboard`.
30. **`src/proxy.ts` (paso 13)** — el matcher excluye `api/notifications/poll`: `'/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/notifications/poll|.*\\..*).*)'`. Es la única petición que la app lanza sola con un temporizador, y el wrapper del Edge re-envía la cookie de la petición en cada respuesta; una consulta en vuelo durante un cambio de contraseña escribía la cookie vieja encima de la nueva. `poll/route.ts` aplica lo que antes aplicaba el Edge: `requireRouteSession` y, además, 403 si `session.mustChangePassword`. **No excluyas otras rutas** del matcher sin darles su propio guard completo; si tu proyecto tiene otro polling con temporizador, trátalo igual.
31. **Remoción de factores (paso 13)** — `factor-removal.ts`: tercera regla y `FOREIGN_PASSKEY_ONLY_MESSAGE` ("Tu passkey restante no funciona en este sitio. Quítala o agrega otro método antes de quitar este."). `recovery-codes.ts`: `regenerateRecoveryCodes` toma el bloqueo de factores y se niega si la cuenta no tiene ningún factor. `resetMfa` toma `lockUserForFactorChange` sobre el usuario objetivo como **primera** sentencia (mismo orden de bloqueo que las demás escrituras de factores, para no crear un deadlock).
32. **`passkey/_shared.ts` (paso 13)** — el chequeo de JSON compara el media type **exacto** (`application/json`, sin parámetros), no un `includes`: `text/plain; x=application/json` pasaba, y `text/plain` es justo lo que manda un formulario de otro sitio.
33. **Plantillas (paso 13)** — `invite-user`, `invite-accepted`, `notification`, `password-reset`, `password-reset-confirm`, `verify-email`, `step-up-code` y `registration-collision` escapan con `escapeHtml`. Aplica lo mismo a tus plantillas propias.

_Parte D_

34. **`src/lib/auth/step-up.ts` (paso 14)** — `type GrantScope = { kind: 'any' } | { kind: 'login'; loginId: string }`; `findLiveGrant(userId, maxAge, method?, scope = ANY)` filtra por `login_id` solo con `kind: 'login'`. `verifyStepUp` acepta `loginId?: string | null`: con la **clave** presente y valor vacío devuelve `step_up_required` sin consultar; con valor, busca solo grants de ese login; sin la clave, user-scoped. `hasLoginSecondFactorGrant` y `hasLoginRecoveryGrant` devuelven `false` con un id vacío.
35. **`src/lib/actions/helpers.ts` y `auth.ts` (paso 14)** — `checkStepUp` toma `loginId` de `readActiveLoginContext()` (la misma lectura que ya hace para el epoch) y lo pasa a las dos llamadas a `verifyStepUp`. En el `jwt()`, con MFA encendido, `typeof token.loginId !== 'string' || token.loginId === ''` → `return null` (antes solo con `pendingMfa`). El step-up de vinculación para un provider que todavía debe `/2fa` usa `verifyStepUp` con el `loginId` de la sesión cuando MFA está encendido.
36. **`src/lib/auth/auth.ts` y `src/lib/auth/session-cookie-parse.ts` (pasos 15, 16 y 18)** — `readRawSessionCookie()` lee `(await headers()).get('cookie')` y lo pasa por `sessionTokenLikeCore`: una copia del `parse` de `@auth/core` (primer valor gana, recorta espacio y tab, decodifica `%` solo si hay) más el ensamblado de `SessionStore` (toda cookie que `startsWith(<nombre>)`, sin exigir punto, ordenada por el sufijo tras el último punto, concatenada). **No uses `cookies()` de Next para esto:** parsea distinto (se queda con el último valor repetido y no recorta tabulaciones) y cualquier diferencia con el core reabre el vector. Si tus tests mockean `next/headers` solo con `cookies`, agrégales `headers`; `readActiveSessionCookie()` devuelve `none` / `unreadable` / `ok` (una cookie expirada es `none`). En el `signIn`: `isOAuthLogin` y cookie `unreadable` → `/login?error=SessionUnreadable`; con sesión activa y OAuth, antes de `alreadyLinked`: `pendingMfa` → `/2fa`; usuario ausente o borrado, epoch nulo o atrás del vivo, o (MFA encendido) sin `loginId` → `/login?error=SessionRevoked`. `alreadyLinked` suma `eq(accounts.providerAccountId, account.providerAccountId)`. **Si tus providers OAuth son propios**, el gate ya los cubre: se decide por `account.type`, no por el nombre.
37. **`src/lib/actions/auth/link-account.ts` (paso 17)** — `requireAnyStepUp`, con MFA encendido, usa `verifyStepUp({ userId, maxAge: 300, loginId })` con el `loginId` de `readActiveLoginContext()`; con MFA apagado sigue `requireStepUp`.

Si tus pantallas de seguridad son propias, el patrón es el mismo: toda acción que cambie un factor pasa por `useSensitiveAction`, y el componente renderiza su `stepUpSheet`.

### 3.3 Las dos migraciones — las generas tú

Dos pasos agregan una columna: el 4 (`step_up_grants.login_id`) y el 11 (`users.last_mfa_alert_at`). **Las migraciones del Factory nunca viajan a un derivado** (BR-FACTORY-005): tu cadena de migraciones es otra, y un `.sql` del Factory con su número y su snapshot corrompería tu journal. Genera cada una después de aplicar su paso:

```bash
pnpm db:generate     # paso 4: SOLO  ALTER TABLE "step_up_grants" ADD COLUMN "login_id" uuid;
                     # paso 11: SOLO ALTER TABLE "users" ADD COLUMN "last_mfa_alert_at" timestamp with time zone;
pnpm db:migrate      # contra develop
```

- ❌ **Nunca copies** el `.sql`, el snapshot ni el `_journal.json` del Factory. El comando de §3.2 ya los excluye; no los agregues a mano.
- ❌ Nunca `db:push`.
- Si `db:generate` propone algo más que esa línea, tu schema TS ya divergía de tu base antes de este cambio: detente y resuélvelo aparte, no lo mezcles aquí.
- Las dos columnas son nullable y no necesitan backfill: los grants viejos quedan en `NULL` y nunca bajan un `pendingMfa`, y un `last_mfa_alert_at` en `NULL` significa "nunca se avisó".
- Si aplicas los pasos 4 y 11 seguidos sin generar en medio, `db:generate` produce una sola migración con las dos líneas; también está bien.
- En Vercel la migración corre sola en el build del deploy (`vercel-build`); en Railway, en el pre-deploy. Commitea cada `.sql` generado junto con su paso.

**Efecto del deploy en usuarios:** quien esté a medio `/2fa` en ese momento (token con `pendingMfa` y sin `loginId`) pierde la sesión y vuelve a iniciar sesión. Con la parte C, además, una cookie sin epoch termina en su siguiente `update`, y quien cambie su contraseña con una cookie de antes de `loginId` recibe `signedOut: true` y vuelve a entrar. Las sesiones completas y recientes no se tocan. **Con la parte D y MFA encendido, toda sesión sin `loginId` termina** (las de antes de la parte B): cada usuario que no haya vuelto a iniciar sesión desde entonces lo hace **una vez**. Avísale al equipo antes del deploy.

## 4. Cómo verificar

1. `pnpm verify` en verde. Los commits traen los tests del kit (`route-session`, `route-session-guard`, `login-second-factor-grant`, `mfa-login-binding`, `factor-change`, `linking-gate`, `mfa-buckets`, `step-up-recovery`, `server-action-exports`, `session-rebind`, `session-revocation`, `password-route`, `password-change`, `mfa-failure-alert`, `factor-removed-alert`, `security-templates-escaping`, los de componentes de auth, entre otros); ajusta rutas si tu árbol de tests difiere.
2. `pnpm test:e2e`: incluye `tests/e2e/anonymous-access.spec.ts` (páginas → login, APIs → 401, públicas → no 401), `tests/e2e/password-change-sessions.spec.ts` (dos contextos: el que cambia sigue, el otro cae) y los specs `[mfa]`.
3. A mano, contra develop, **sin cookies**:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/notifications/poll   # 401
   curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<host>/dashboard # 302 hacia /login?callbackUrl=%2Fdashboard
   ```

4. Open redirect: abre `/login?callbackUrl=https://example.com`, inicia sesión y confirma que terminas en `/dashboard`, no en `example.com`.
5. 2FA ligado al login (con una cuenta de prueba con passkey o TOTP): en una ventana privada inicia sesión con contraseña y quédate en `/2fa`. En otra ventana, con la sesión completa de la misma cuenta, haz un step-up. Recarga la ventana privada: **sigue en `/2fa`**.
6. Regla de factores: con una passkey ya enrolada, intenta agregar un TOTP desde el perfil. Debe abrirse el `StepUpSheet` **sin** la opción de correo, y el enrolamiento solo avanza después de la passkey (o de un código de recuperación).
7. Auto-vínculo rechazado: toma una cuenta de prueba con factor (passkey o TOTP) y **sin** Google vinculado, cuyo correo sea una cuenta de Google a la que tengas acceso. En una ventana privada, entra con "Continuar con Google" usando ese correo. Debes volver a `/login` con el aviso "Esta cuenta aún no está vinculada…" y **sin** sesión. Después, desde Perfil › Seguridad de esa cuenta, vincula Google (te pide step-up fuerte); a partir de ahí, el login con Google entra normal.
8. Cambio de contraseña con dos navegadores: inicia sesión con la misma cuenta en dos navegadores (A y B). En A, cambia la contraseña desde Perfil › Seguridad: A sigue dentro. En B, navega o recarga: te manda a `/login` (de inmediato si B dispara un `update`; si no, en su siguiente revalidación, hasta 5 minutos). Repite con "Olvidé mi contraseña": caen las dos.
9. Revocación irreversible: guarda la cookie de sesión de B, haz que un admin le resetee el MFA a esa cuenta, y reenvía esa cookie vieja a la sesión:

   ```bash
   curl -s -X POST https://<host>/api/auth/session \
     -H 'Content-Type: application/json' -H 'Cookie: <cookie-de-sesión-vieja>' \
     -d '{"csrfToken":"<token de /api/auth/csrf>"}'   # responde null: la cookie no adopta el epoch nuevo
   ```

10. Alerta de `/2fa`: con una cuenta con TOTP, entra con contraseña y escribe un código incorrecto en `/2fa`. Llega un correo con el asunto "Alguien intentó entrar a tu cuenta". Un segundo código incorrecto dentro de la misma hora **no** manda otro.
11. Desactivar TOTP: con TOTP y una passkey, pulsa "Desactivar" en la tarjeta del autenticador: pide step-up fuerte y confirmación, lo quita y llega un correo. Con un rol que exige MFA y el TOTP como único factor usable, se niega ("Tu cuenta requiere verificación en dos pasos. Agrega otra passkey antes de quitar tu app de autenticación."). Sin ningún factor restante, los códigos de recuperación desaparecen.
12. Rate limit del cambio de contraseña: desde Perfil, escribe una contraseña actual incorrecta seis veces seguidas. La sexta responde "Demasiados intentos con una contraseña incorrecta…" (429), incluso si esta vez la escribes bien; pasados 15 minutos vuelve a funcionar.
13. Polling fuera del proxy: sin cookies, `curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/notifications/poll` responde 401. Con una cuenta a la que un admin le puso contraseña temporal (antes de cambiarla), la misma petición con su cookie responde 403.
14. Passkey de otro dominio: con una cuenta cuyo único otro factor es una passkey de otro dominio y sin códigos de recuperación sin usar, intenta desactivar el TOTP. Se niega con "Tu passkey restante no funciona en este sitio…".
15. Step-up de otro login (parte D): con la misma cuenta admin en dos navegadores, haz un step-up en A. En B, sin step-up propio, intenta una acción sensible (crear un usuario): debe pedir el step-up en B.
16. Vinculación desde `/2fa` (parte D): con una cuenta con factor y **un** Google ya vinculado, entra con contraseña en una ventana privada y quédate en `/2fa`. Desde ahí, abre `/api/auth/signin/google` y elige **otra** cuenta de Google: debes terminar en `/2fa` y la cuenta no gana un segundo Google (revísalo en Perfil › Seguridad).

---

_TimeKast Factory — factor-and-session-hardening (shipped retrofit doc). Índice de guías por era: [`legacy-migration.md` §F5](./legacy-migration.md)._

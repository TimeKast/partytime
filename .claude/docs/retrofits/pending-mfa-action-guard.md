# Retrofit — ninguna acción corre mientras la sesión debe su segundo factor (absorbida)

> **Esta guía quedó absorbida por [`factor-and-session-hardening.md`](./factor-and-session-hardening.md).** No la apliques por separado.
>
> **Disponible desde:** kit `v13.1.0`

---

El guard de `pendingMfa` en `withAuth`/`withSelf` y en las rutas de registro de passkey era la primera parte de un hueco más grande. La revisión que siguió encontró que el 2FA también se podía completar con el grant de otra sesión, que desde `/2fa` se podía vincular un Google/GitHub propio, que ningún cambio de factor pedía step-up y que el gate del Edge no bloqueaba peticiones anónimas.

La guía nueva cubre todo eso en un solo orden:

- **Si todavía no aplicaste esta:** sigue [`factor-and-session-hardening.md`](./factor-and-session-hardening.md) desde su paso 0, que es exactamente el cambio que describía esta guía.
- **Si ya la aplicaste:** empieza la guía nueva en el paso 1. El paso 3 reemplaza el 403 que agregaste a mano en las rutas de registro de passkey por `requireRouteSession`.

---

_TimeKast Factory — retrofit: guard de `pendingMfa` (redirige a `factor-and-session-hardening.md`)_

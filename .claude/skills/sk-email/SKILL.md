---
name: sk-email
description: Kit-shipped email infrastructure for the TimeKast Starter Kit — the `sendEmail()` dispatcher with a Resend/SMTP provider abstraction selected via `EMAIL_PROVIDER`, plus the transactional template set (magic-link, password-reset, verify-email, invites, notification, security alerts) and the layout and HTML-escaping helpers. Use when sending transactional email through the kit or adding a new template — never instantiate Resend/nodemailer directly.
last-verified: 2026-09-28
user-invocable: false
---

# sk-email — Kit-Shipped Email Infrastructure

> Pair: [`sk-features-index`](../sk-features-index/SKILL.md) (catálogo de features del kit — fila "Email").

Esta skill documenta la infraestructura **concreta** de email que shippea el kit. Todo lo que vive en `@/lib/email/*` — `sendEmail()`, providers (Resend/SMTP), templates, helpers de layout.

> 🔴 **Regla de oro:** nunca llames a `fetch('https://api.resend.com/...')` ni instancies `Resend` / `nodemailer` a mano en código de app — pasa por `sendEmail()`. Provider abstraction, config resolution, y error handling ya están resueltos.

---

## 1. `sendEmail()` — unified dispatcher

**Ubicación:** `@/lib/email/index.ts` (re-export raíz `@/lib/email`).

```ts
import { sendEmail, isEmailReady } from '@/lib/email';

if (!isEmailReady()) {
  logger.warn('Email not configured — skipping');
  return;
}

const result = await sendEmail({
  to: 'user@example.com',
  subject: 'Bienvenido',
  html: '<h1>Hola</h1>',
  text: 'Hola', // optional plain-text fallback
});

if (!result.success) {
  logger.error('Email send failed', { error: result.error });
}
```

**Signature (from `src/lib/email/types.ts`):**

```ts
interface EmailPayload {
  to: string; // recipient
  subject: string;
  html: string;
  text?: string; // plain-text fallback (optional)
}

interface EmailResult {
  success: boolean;
  messageId?: string; // provider message id (if available)
  error?: string; // on failure
}
```

**Qué hace internamente (`index.ts`):**

1. Resuelve provider vía `getEmailProvider()` (`resend | smtp | none`).
2. Si `none` → **throw** con mensaje claro (agente debe guardarlo detrás de `isEmailReady()`).
3. Valida config con `isEmailConfigured()`.
4. Dispatch a `sendWithResend(payload)` o `sendWithSmtp(payload)`.
5. Retorna `EmailResult` — nunca lanza en fallo runtime del provider; lo captura y pone `success: false`.

**Graceful guard pattern:**

```ts
import { sendEmail, isEmailReady, passwordResetEmail } from '@/lib/email';

if (isEmailReady()) {
  await sendEmail({
    to: user.email,
    subject: 'Restablecer contraseña',
    html: passwordResetEmail({ url, userName: user.name }),
  });
}
// Si email no está configurado, el flow sigue — no reventar UX.
```

---

## 1.1 Envelope headers — `headers?` field (FACTORY-005)

`EmailPayload` (`src/lib/email/types.ts`) acepta un campo opcional `headers?: Record<string, string>` para inyectar headers custom al envelope del email. Use case principal: `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058) para que Gmail / Apple Mail muestren botón nativo "Unsubscribe" en el inbox.

### Signature

```ts
interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>; // ← FACTORY-005
}
```

### Merge con defaults del kit

Ambos providers (`resend.ts` + `smtp.ts`) inyectan estos defaults transactional siempre:

```
Auto-Submitted: auto-generated
X-Auto-Response-Suppress: All
```

Cuando `payload.headers` está presente, los providers hacen merge `{ ...payload.headers, ...defaults }` — defaults van AL FINAL del spread para que **no puedan ser overrideados silently** por el caller. Result: emails con `payload.headers` llevan los caller-provided AND los defaults del kit (4+ headers totales).

### Auto-inyectado por `notify()`

Cuando un email se dispatcha via `notify()` (canal `email`), los headers `List-Unsubscribe` + `List-Unsubscribe-Post` se inyectan automáticamente — derived projects NO tienen que hacer nada. Ver `sk-notifications §6.2.1` para el flow completo (JWT token + route handler `/api/unsubscribe`).

### Caso custom (fuera de `notify()`)

Si un derived project quiere inyectar headers en un transactional (e.g., agregar `X-Project-CampaignID` para tracking interno), pasa `headers` directo a `sendEmail()`:

```ts
await sendEmail({
  to: user.email,
  subject: 'Reset your password',
  html: passwordResetEmail({ url }),
  headers: {
    'X-Project-Source': 'password-reset-flow',
    'X-Project-CampaignID': campaignId,
  },
});
```

Defaults transactional (`Auto-Submitted`, `X-Auto-Response-Suppress`) se aplican igual.

---

## 2. Provider abstraction — Resend / SMTP / none

**SSOT de config:** `src/lib/env.ts` (`getEmailProvider()`, `isEmailConfigured()`, `getResendConfig()`, `getSmtpConfig()`).

| `EMAIL_PROVIDER` | Módulo backend                               | Env vars requeridas                                                                                      | Librería externa |
| ---------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------- |
| `resend`         | `src/lib/email/resend.ts` → `sendWithResend` | `RESEND_API_KEY` · `EMAIL_FROM`                                                                          | `resend`         |
| `smtp`           | `src/lib/email/smtp.ts` → `sendWithSmtp`     | `EMAIL_SERVER_HOST` · `EMAIL_SERVER_PORT` · `EMAIL_SERVER_USER` · `EMAIL_SERVER_PASSWORD` · `EMAIL_FROM` | `nodemailer`     |
| `none` (default) | —                                            | —                                                                                                        | — (no-op guard)  |

**Switchear de provider:** solo env vars — no tocar código.

```bash
# .env.local
EMAIL_PROVIDER="resend"
RESEND_API_KEY="re_xxx"
EMAIL_FROM="noreply@yourdomain.com"
```

**Nombre del remitente.** Si el proyecto tiene `src/lib/email/sender.ts`, `getResendConfig()` y `getSmtpConfig()` anteponen `NEXT_PUBLIC_APP_NAME` a un `EMAIL_FROM` sin nombre (`"Mi App" <noreply@…>`), al enviar: renombrar la app y hacer deploy basta. Un `EMAIL_FROM` que ya trae nombre gana. Sin ese archivo (proyectos anteriores), el nombre se pone escribiéndolo en `EMAIL_FROM`.

**Features compartidas entre providers** (ambos `resend.ts` y `smtp.ts` las aplican):

- Headers transaccionales: `Auto-Submitted: auto-generated`, `X-Auto-Response-Suppress: All`.
- `replyTo: SUPPORT_EMAIL` (si el env var está definido).
- Singleton del client/transporter (lazy instantiate, reusable).
- Error handling uniforme — devuelven `EmailResult` aunque el provider lance.

**SMTP extras** (`smtp.ts`):

- `verifySmtpConnection()` — ping al SMTP antes de enviar (útil en tests de config).
- Logo attachment inline (`cid:logo`) resuelto por `resolveLogoAttachment()` — lee de `public/` o `EMAIL_LOGO_URL`. Graceful skip si falta el archivo (Vercel serverless sin filesystem).

---

## 3. Templates shipped (`src/lib/email/templates/`)

Cada template exporta **dos funciones**: `xxxEmail(params)` → HTML y `xxxEmailText(params)` → plain-text fallback. Todas usan `emailLayout()` como shell. Los parámetros de abajo son los reales de cada archivo — ante la duda, el archivo manda.

| Template                          | Export HTML                      | Params                                                                  | Quién lo envía en el kit                                   |
| --------------------------------- | -------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| `layout.ts`                       | `emailLayout(content, opts)`     | `content`, `{ preheader?, branding? }`                                  | Shell HTML base — todos lo usan                            |
| `magic-link.ts`                   | `magicLinkEmail`                 | `{ url, host }`                                                         | NextAuth magic link (`auth.ts`)                            |
| `password-reset.ts`               | `passwordResetEmail`             | `{ url, userName? }`                                                    | `/forgot-password` (`password-reset.ts`)                   |
| `password-reset-confirm.ts`       | `passwordResetConfirmEmail`      | `{ userName?, changedAt }`                                              | Ninguno (el reset envía `password-changed`)                |
| `password-changed.ts`             | `passwordChangedEmail`           | `{ userName?, changedAt, ipAddress?, userAgent? }`                      | Cada cambio y reset de contraseña (`security-alerts.ts`)   |
| `verify-email.ts`                 | `verifyEmail`                    | `{ url, userName?, expiresIn? }`                                        | Verificación de correo y cambio de correo                  |
| `login-alert.ts`                  | `loginAlertEmail`                | `{ userName?, loginAt, ipAddress?, userAgent?, suspiciousUrl? }`        | Ninguno (disponible para un aviso de login)                |
| `mfa-failures-alert.ts`           | `mfaFailuresAlertEmail`          | `{ userName?, attemptedAt, ipAddress?, userAgent? }`                    | Código incorrecto en `/2fa`, máx. 1 por hora (`security-alerts.ts`) |
| `mfa-factor-removed-alert.ts`     | `mfaFactorRemovedAlertEmail`     | `{ userName?, factorLabel, recoveryCodesCleared, changedAt, ipAddress?, userAgent? }` | `disableTotp` / `removePasskey` (`security-alerts.ts`) |
| `email-change-alert.ts`           | `emailChangeAlertEmail`          | `{ userName?, newEmail, changedAt, byAdmin? }`                          | Cambio de correo (al correo VIEJO)                         |
| `access-method-unlinked-alert.ts` | `accessMethodUnlinkedAlertEmail` | `{ userName?, methodLabel, changedAt }`                                 | Admin desvincula un método (`user-admin.ts`)               |
| `credentials-wiped.ts`            | `credentialsWipedEmail`          | `{ userName?, provider }`                                               | `auth.ts` (credenciales borradas al vincular)              |
| `step-up-code.ts`                 | `stepUpCodeEmail`                | `{ code, userName?, expiresIn? }`                                       | Código de step-up por correo (`email-otp.ts`)              |
| `registration-collision.ts`       | `registrationCollisionEmail`     | `{ userName? }`                                                         | Registro con un correo ya existente (`/api/auth/register`) |
| `invite-user.ts`                  | `inviteUserEmail`                | `{ url, inviterName?, organizationName?, expiresIn? }`                  | `/api/invites/send`                                        |
| `invite-accepted.ts`              | `inviteAcceptedEmail`            | `{ userName?, organizationName? }`                                      | Ninguno                                                    |
| `notification.ts`                 | `notificationEmail`              | `NotificationEmailParams`                                               | Canal `email` de `notify()` (sk-notifications §1)          |

`security-details.ts` no es un template: son los helpers de §3.1.

> Todos se importan desde el barrel: `import { passwordResetEmail } from '@/lib/email'`.

### 3.1 Escape de HTML y datos de la petición

> 🔴 **Disponible desde kit `v13.1.0`, y NO llega por `factory update`.** `escapeHtml` (y su uso en cada plantilla), `security-details.ts`, `security-alerts.ts` y las dos plantillas `mfa-*` viven en `src/`, congelado en el derivado (BR-FACTORY-006). Verifica antes de apoyarte en ellos (`grep -n "escapeHtml" src/lib/email/templates/layout.ts`); si no están, tus correos de seguridad interpolan sin escapar y el retrofit es [`factor-and-session-hardening.md`](../../docs/retrofits/factor-and-session-hardening.md).

🔴 **Todo template escapa lo que interpola — todos, no solo los de seguridad** (invitaciones, notificaciones, reset, verificación, códigos). Estos correos salen del dominio de la app, firmados con DKIM: lo que se interpola sin escapar (un nombre, un correo, un header de la petición) es HTML que, para el buzón, escribió el remitente — un `<a href>` metido en un User-Agent se vuelve un enlace de phishing dentro de una alerta legítima. Regla:

- **`escapeHtml(value)`** (`./layout`) en todo valor interpolado al HTML (nombres, correos, títulos y cuerpos de notificación, códigos): texto y atributos entre comillas. Cubre `&`, `<`, `>`, `"` y `'`. La versión de texto plano (`xxxEmailText`) no lo necesita.
- **Datos de la petición**, nunca crudos (`./security-details`): `safeIpAddress(ip)` devuelve la IP solo si parsea como IPv4/IPv6 (`net.isIP`) y `undefined` si no — un valor fabricado no tiene lectura verdadera, así que no se "limpia", se omite; `describeUserAgent(ua)` reduce el User-Agent a una familia de navegador y sistema de una allowlist ("Chrome en macOS"), o `UNKNOWN_BROWSER_LABEL`. El template sigue escapando lo que devuelven: defensa en profundidad.

**Contrato del remitente de alertas de seguridad** (`@/lib/auth/security-alerts.ts`: `sendPasswordChangedAlert`, `sendMfaFactorRemovedAlert`, `scheduleMfaFailureAlert`):

- se envía solo si `isEmailReady()`, y **después** de que la operación que describe hizo commit;
- **nunca lanza**: una caída del proveedor o un bug del template no puede convertir un cambio de contraseña en un 500 ni hacer que `/2fa` responda distinto;
- la IP y el User-Agent los pasa quien tiene la petición (`readAlertRequestMeta()` en una server action);
- la alerta de `/2fa` corre en `after()` y se deduplica con un `UPDATE` condicional sobre `users.last_mfa_alert_at` (una por hora); sin correo configurado ni siquiera toma la ventana, para no silenciar la primera alerta cuando se configure.

**Layout helpers:**

- `emailLayout(content, { preheader, branding })` — table-based HTML con dark-mode defense (explicit `bgcolor`), header con logo (env `EMAIL_LOGO_URL` o `cid:logo`), footer con app URL + support email.
- `emailButton({ url, text, branding? })` — bulletproof CTA (funciona en Outlook).
- `defaultBranding` — object con colores base (primary, button, success, error). Overrideables vía `branding` param.
- `generateTextFallback(html)` → string — strip de HTML a text plano para el campo `text`.
- `escapeHtml(value)` — escape de todo valor interpolado (§3.1).

---

## 4. Cómo añadir un template nuevo (checklist)

**SSOT de templates:** `src/lib/email/templates/`.

1. **Crear** `src/lib/email/templates/{feature}.ts` con dos exports: `featureEmail(params)` y `featureEmailText(params)`. Siguiendo el shape de un existente (ej: `magic-link.ts` — el más simple).
2. **Importar** `emailLayout` + `defaultBranding` (y `emailButton` si hay CTA):

   ```ts
   import { emailLayout, emailButton, defaultBranding } from './layout';
   ```

3. **Wrappear** el contenido en `emailLayout(content, { preheader: '...' })` — el shell se encarga de header/footer/dark-mode. **Escapa** con `escapeHtml` todo valor que interpoles (§3.1).
4. **Registrar el re-export** en `src/lib/email/index.ts` (al final, en la sección `Re-exports`) — así queda accesible vía `@/lib/email`.
5. **Consumir** desde server-side (server action, API route, lib/ helper):

   ```ts
   import { sendEmail, isEmailReady } from '@/lib/email';
   import { welcomeEmail, welcomeEmailText } from '@/lib/email';

   if (isEmailReady()) {
     await sendEmail({
       to: user.email,
       subject: '¡Bienvenido!',
       html: welcomeEmail({ userName: user.name }),
       text: welcomeEmailText({ userName: user.name }),
     });
   }
   ```

6. **NO** crear un nuevo provider file ni tocar `resend.ts`/`smtp.ts`. Solo añades un template — el dispatcher ya sabe cómo enviar.
7. **Tests** — unit test del template puro (renderiza HTML, no toca red). Ejemplo: snapshot del HTML + assert de que `params.userName` aparece. Ver [`sk-testing-nextjs`](../sk-testing-nextjs/SKILL.md).

> Si el email es una **notificación** (puede entregarse también por in-app o push), NO llames `sendEmail()` directo — usa `notify({ channels: ['email'], ... })` en [`sk-notifications`](../sk-notifications/SKILL.md). El canal `email` de `notify()` ya usa `notificationEmail()` + `sendEmail()` internamente, y respeta preferences del usuario.

---

## 5. Env vars requeridas

**SSOT:** `src/lib/env.ts` (Zod schema) + `.env.example`.

| Variable                | Requerida                       | Propósito                                                                                        |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `EMAIL_PROVIDER`        | — (default `none`)              | `'resend' \| 'smtp' \| 'none'` — selecciona backend                                              |
| `EMAIL_FROM`            | ✅ (si provider ≠ `none`)       | Email de remitente canónico (ej: `noreply@yourdomain.com`, o `Mi App <noreply@yourdomain.com>` con nombre) |
| `RESEND_API_KEY`        | ✅ (si `EMAIL_PROVIDER=resend`) | API key de Resend                                                                                |
| `EMAIL_SERVER_HOST`     | ✅ (si `EMAIL_PROVIDER=smtp`)   | SMTP host                                                                                        |
| `EMAIL_SERVER_PORT`     | ✅ (si `EMAIL_PROVIDER=smtp`)   | SMTP port (587 / 465)                                                                            |
| `EMAIL_SERVER_USER`     | ✅ (si `EMAIL_PROVIDER=smtp`)   | SMTP user                                                                                        |
| `EMAIL_SERVER_PASSWORD` | ✅ (si `EMAIL_PROVIDER=smtp`)   | SMTP password                                                                                    |
| `EMAIL_LOGO_URL`        | —                               | URL absoluta del logo inline (producción). Si falta → SMTP usa `cid:logo` attachment.            |
| `SUPPORT_EMAIL`         | —                               | Se incluye como `replyTo` en todos los emails. (Footer también usa `NEXT_PUBLIC_SUPPORT_EMAIL`.) |

**Reglas:**

- Nunca leer `process.env.RESEND_API_KEY` directo — usar `getResendConfig()` / `getSmtpConfig()` de `@/lib/env`.
- `isEmailReady()` es el único check que deberías hacer desde código de app — es `true` solo si provider está seleccionado **y** config válida.

---

## 6. Integración con flows existentes del kit

Cross-ref (NO re-documentar — apuntar al SSOT):

| Flow                          | Dónde vive                                       | Template que usa      |
| ----------------------------- | ------------------------------------------------ | --------------------- |
| Password reset request        | `src/lib/auth/password-reset.ts`                 | `passwordResetEmail`  |
| Magic link sign-in            | `src/lib/auth/auth.ts` (NextAuth email provider) | `magicLinkEmail`      |
| Email verification            | `src/lib/auth/auth.ts`                           | `verifyEmail`         |
| Alertas de seguridad (contraseña, `/2fa`, factor quitado) | `src/lib/auth/security-alerts.ts`   | `passwordChangedEmail`, `mfaFailuresAlertEmail`, `mfaFactorRemovedAlertEmail` |
| Invite user                   | `src/lib/invites/`                               | `inviteUserEmail`     |
| Invite accepted               | `src/lib/invites/`                               | `inviteAcceptedEmail` |
| Notifications `email` channel | `src/lib/notifications/service.ts` → `notify()`  | `notificationEmail`   |

> Detalle funcional de cada flow → [`sk-security`](../sk-security/SKILL.md) (auth flows + invites) · [`sk-notifications`](../sk-notifications/SKILL.md) (canal email).

---

## 7. Anti-patterns

| ❌ Anti-pattern                                                               | ✅ Correcto                                                                                    |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `fetch('https://api.resend.com/emails', ...)` directo                         | `sendEmail({ ... })` de `@/lib/email`                                                          |
| `new Resend(process.env.RESEND_API_KEY)` en código de app                     | `getResendConfig()` / `sendWithResend()` ya lo hacen (singleton)                               |
| `process.env.EMAIL_FROM`                                                      | `getResendConfig().from` o `getSmtpConfig().from` (via Zod schema)                             |
| `sendEmail()` sin guard de `isEmailReady()` en flows opcionales               | `if (isEmailReady()) await sendEmail(...)` — graceful degradation cuando `EMAIL_PROVIDER=none` |
| Crear template inline con HTML crudo en el server action                      | Template en `src/lib/email/templates/{feature}.ts` + re-export en `index.ts`                   |
| Interpolar `${userName}` / `${ipAddress}` / `${userAgent}` sin escapar         | `escapeHtml(...)`; IP y User-Agent vía `safeIpAddress` / `describeUserAgent` (§3.1)            |
| Enviar una alerta de seguridad antes del commit, o dejar que lance            | Después del commit, con `isEmailReady()`, sin lanzar nunca (§3.1)                              |
| Hardcodear colores/branding en el HTML del template                           | `defaultBranding` + `emailLayout({ branding: { ... } })`                                       |
| `<a href="${url}" style="...">` custom sin `emailButton()`                    | `emailButton({ url, text })` — bulletproof para Outlook                                        |
| `sendEmail()` para notificar al usuario algo que también debería verse in-app | `notify({ channels: ['email', 'in_app'], ... })` — respeta preferences del usuario             |
| Olvidar el `text` fallback                                                    | `html: welcomeEmail(p)` + `text: welcomeEmailText(p)` — o `generateTextFallback(html)`         |
| Instalar `@react-email/*` para templates                                      | El kit usa HTML crudo + inline styles a propósito (compat máxima) — no añadir deps             |

---

## 8. Testing tips

- **Unit del template** — render puro, sin red. Assert sobre `params` incrustados en el HTML output. Usa Vitest + snapshot o string match.
- **Dev real sin spamear** — addresses terminadas en `@test.com` / `@example.com` son auto-skippeadas por algunos flows (ver `testNotification` en sk-notifications §8). Para email directo, configurar `EMAIL_PROVIDER=none` en `.env.test` o usar `MailHog`/`Mailtrap` vía SMTP.
- **Verificar SMTP config** — `import { verifySmtpConnection } from '@/lib/email'` → hace ping al server, retorna `boolean`.
- **Providers en tests** — mockear `@/lib/email` con factory-function (ver [`sk-testing-nextjs`](../sk-testing-nextjs/SKILL.md) §2). Ejemplo: `vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ success: true })), isEmailReady: () => true }))`.

---

Cross-reference: [`sk-features-index`](../sk-features-index/SKILL.md) (catálogo — §Core Features fila "Email") · [`sk-security`](../sk-security/SKILL.md) (auth flows + invites que consumen templates) · [`sk-notifications`](../sk-notifications/SKILL.md) (canal `email` de `notify()` + template `notificationEmail`).

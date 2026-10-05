---
name: sk-mfa
description: Kit-shipped multi-factor and step-up authentication: passkeys (WebAuthn), TOTP enrollment, registry-driven step-up gating of sensitive actions (declare the pair in MFA_SENSITIVE_ACTIONS and the wrappers gate it), hashed recovery codes, the login-bound 2FA gate, the factor-change step-up rule and account linking. Invoke when adding a passkey or authenticator, gating a server action behind re-authentication, redeeming backup codes, or linking an OAuth provider to a session.
last-verified: 2026-09-28
user-invocable: false
---

# sk-mfa — Kit-shipped Multi-Factor + Step-Up Auth

This skill covers the MFA + step-up systems the Starter Kit ships and how to plug into them; the auth base they build on is [`sk-security`](../sk-security/SKILL.md).

> **Kit-shipped — not portable.** Travels with the Starter Kit. Grounded in real files: `@/lib/auth/webauthn.ts`, `@/lib/auth/passkey.ts`, `@/lib/auth/passkey-client.ts`, `@/config/mfa.ts`, `@/lib/auth/totp.ts`, `@/lib/auth/totp-verify.ts`, `@/lib/auth/totp-status.ts`, `@/lib/auth/totp-crypto.ts`, `@/lib/auth/email-otp.ts`, `@/lib/auth/step-up.ts`, `@/lib/auth/step-up-client.ts`, `@/lib/auth/factor-change.ts`, `@/lib/auth/recovery-codes.ts`, `@/lib/auth/recovery-redeem.ts`, `@/lib/auth/factor-lock.ts`, `@/lib/auth/factor-removal.ts`, `@/lib/auth/security-alerts.ts`, `@/lib/auth/mfa-login.ts`, `@/lib/auth/email-change.ts`, plus schemas `@/lib/db/schema/passkey-credentials.ts`, `@/lib/db/schema/totp.ts`, `@/lib/db/schema/step-up-grants.ts`, actions `@/lib/actions/passkey.ts` + `@/lib/actions/step-up.ts`, the hook `@/lib/hooks/useSensitiveAction.tsx`, and components `PasskeyEnrollment` / `PasskeysList` / `TotpEnrollment` / `StepUpSheet`.
>
> **See also:** [`sk-security`](../sk-security/SKILL.md) for the auth split-config, RBAC matrix, `withAuth`/`withSelf`, rate-limit buckets, and account-linking gate that this skill builds on. [`sk-api`](../sk-api/SKILL.md) for `ActionResult` / `ActionError`. [`sk-features-index`](../sk-features-index/SKILL.md) for the feature catalog.

> **Registry anchors** — exact symbol signatures live in [`project/reference/HOOKS.md`](../../../project/reference/HOOKS.md); as-built tables in [`project/reference/SCHEMA.md`](../../../project/reference/SCHEMA.md); the action surface in [`project/reference/API.md`](../../../project/reference/API.md) (all autogen — SSOT of import paths). This skill teaches the SHAPE of each MFA system (which module owns what, the security invariants, how the pieces compose); the canonical names + signatures are read from the registry, not enumerated here.

---

## 1. The factor map — one module owns each concern

The kit splits MFA across small modules so each invariant lives in exactly one place. Plug into the existing module — never re-implement a ceremony, a code generator, or a grant write inline.

| Factor / concern                       | Module                          | What it owns                                                          |
| -------------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| WebAuthn ceremony (crypto)             | `@/lib/auth/webauthn.ts`        | options generation, challenge one-time store, signature verification |
| Passkey persistence + auth             | `@/lib/auth/passkey.ts`         | register + authenticate against `passkey_credentials`, anti-enum     |
| Passkey client orchestration           | `@/lib/auth/passkey-client.ts`  | browser ceremony (`@simplewebauthn/browser`) + route round-trip      |
| TOTP enroll / confirm (actions)         | `@/lib/auth/totp.ts`            | self-service enroll / confirm, gated by the factor-change rule       |
| TOTP verify (domain, `server-only`)     | `@/lib/auth/totp-verify.ts`     | `verifyTotp(userId, code)` with anti-replay — never a server action  |
| TOTP enrollment status (query)          | `@/lib/auth/totp-status.ts`     | `hasTotpEnrolled` — confirmed-only probe (plain module: `totp.ts` is `'use server'`, a query there would become a public endpoint) |
| TOTP secret crypto                      | `@/lib/auth/totp-crypto.ts`     | JWE encrypt/decrypt of the secret at rest                            |
| Email step-up code (medium-risk only)   | `@/lib/auth/email-otp.ts`       | hashed 6-digit code, pending→promoted grant lifecycle                |
| Step-up grants (the gate)               | `@/lib/auth/step-up.ts`         | `requireStepUp` / `verifyStepUp` / `grantStepUp`, canonical query    |
| Recovery codes                          | `@/lib/auth/recovery-codes.ts`  | generate / hash / verify single-use backup codes                     |
| Recovery redemption (spend + grant)     | `@/lib/auth/recovery-redeem.ts` | the one redeem path, shared by `/2fa` and the step-up overlay        |
| 2FA-on-login completion                 | `@/lib/auth/mfa-login.ts`       | clear the `pendingMfa` gate after the second factor of THIS login    |
| Factor-change rule                      | `@/lib/auth/factor-change.ts`   | who may add / replace / remove a factor (§4.1)                       |
| Step-up codes for the client            | `@/lib/auth/step-up-client.ts`  | the three `step_up_*` codes + `isStepUpError`, import-free           |
| Step-up UI (the client half)            | `@/lib/hooks/useSensitiveAction.tsx` | run an action, open `StepUpSheet` on a `step_up_*` code, replay (§4.2) |
| Risk policy (which actions are gated)   | `@/config/mfa.ts`               | `MFA_SENSITIVE_ACTIONS` SSOT + freshness windows + factor policy     |

> 🔴 **Single SSOT for sensitivity — declaring IS gating.** Whether an action needs step-up is declared ONLY in `MFA_SENSITIVE_ACTIONS` (`@/config/mfa.ts`), and the action wrappers consult that registry on every call (`withAuth` via its RBAC pair, `withSelf` via its `sensitiveAction` key): adding the pair is what gates the action — factor policy and error codes follow from its `riskLevel` (§4). Do not spread "is this sensitive?" across server actions or `ROUTE_ACL` — that creates a second source of truth (`CORE.md §4`).

---

## 2. Passkeys (WebAuthn) — the four invariants

The native NextAuth WebAuthn provider is unsupported with the kit's Credentials + JWT strategy, so the kit owns the ceremony with `@simplewebauthn/server`. `@/lib/auth/webauthn.ts` exposes four functions the route handlers under `src/app/api/auth/passkey/**` consume: `generateRegistrationOptions`, `verifyRegistration`, `generateAuthenticationOptions`, `verifyAuthentication`.

Four security invariants — each is non-negotiable when extending the flow:

1. **Challenge one-time.** Challenges are server-generated, persisted in `webauthn_challenges`, and `consumeChallenge` stamps `consumedAt` atomically before returning success — a replayed challenge resolves to `null`. The consumed value is also the `expectedChallenge` handed to the library, so a forged challenge fails the signature check too. TTL is 5 minutes (`WEBAUTHN_CHALLENGE_TTL_MS`).
2. **rpID / origin from env, never the Host header.** `getRpId()` reads `WEBAUTHN_RP_ID`, `getExpectedOrigin()` reads `NEXT_PUBLIC_APP_URL` (plus the related origins of §2.1). The Host header is attacker-controllable (CSRF / phishing relay) — deriving `rpID` from the request would let a malicious origin mint options for the real domain. **Related Origin Requests do NOT relax this**: the rpID still comes from env, and the extra origins come from env too — never from the request.
3. **Counter regression rejected.** `verifyAuthentication` rejects `newCounter <= stored` (a `counter === 0 && stored === 0` first auth is allowed — non-incrementing authenticators). The counter is advanced + `lastUsedAt` stamped only on a verified assertion.
4. **userVerification required.** Options carry `userVerification: 'required'` and the verifiers run `requireUserVerification: true` — the credential must prove possession + a biometric/PIN.

```ts
import {
  generateRegistrationOptions,
  verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthentication,
} from '@/lib/auth/webauthn';
import { registerPasskey, verifyPasskeyAuthentication } from '@/lib/auth/passkey';
```

### 2.1 A passkey belongs to ONE domain — and that is recorded

> 🔴 **Disponible desde kit `v12.2.0`, y NO llega por `factory update`.** Todo lo de §2.1 y §2.2 vive en `src/`, que nace congelado en el derivado y que el update nunca toca (BR-FACTORY-006) — lo único que viajó fue esta página. **Antes de apoyarte en `rp_id`, `userHasUsableMfaFactor` o `isPasskeyUsableHere`, verifica que existan en ESTE repo** (`grep -n "rp_id" src/lib/db/schema/passkey-credentials.ts`). Si no están, el derivado nació antes y sigue expuesto al lockout que describe esta sección: el retrofit manual está en [`passkey-domain-binding.md`](../../docs/retrofits/passkey-domain-binding.md). Un proyecto nuevo (`factory new`) ya nace con todo esto.

A credential only verifies against the rpID it was bound to. `passkey_credentials.rp_id` records which one, and everything that asks about factors reads it. Without it the kit could not tell a usable credential from a dead one, and a derivative deployment locked an operator out: the gate demanded a second factor and offered, as the only option, a passkey from another domain — which cannot verify there.

🔴 **Two questions that look like one, and must never share an answer:**

| Pregunta | Función | Cuenta |
| --- | --- | --- |
| ¿Le **exijo** un segundo factor? | `userHasMfaEnabled` | **Todo** factor, sin mirar el dominio |
| ¿Ya **cumplió** con tener uno? | `userHasUsableMfaFactor` | Solo lo que sirve **aquí** |

Over-counting in the first only ever demands more proof, so it stays blind to the domain on purpose — filtering it would let a user whose only passkey is foreign walk in on the password alone (anti-downgrade R5). Over-counting in the second is what strands people. TOTP satisfies both: a shared secret is bound to no origin.

A row with `rp_id = NULL` (registered before the column) is **unknown**, not assumed: it counts toward owing a factor, never toward having one, it is still **offered** at `/2fa` (it may well belong here), and a successful assertion stamps the real value — the only moment the binding can be written without guessing. `/2fa` distinguishes *"no tienes factor"* from *"tu factor no sirve en este dominio"* and degrades to the recovery code; it **never** offers enrolment there, which would run before the second factor is proven and hand a stolen password a way in.

### 2.2 Related Origin Requests — one passkey across the project's domains

`WEBAUTHN_RELATED_ORIGINS` declares the other origins allowed to run a ceremony for this rpID; `src/app/well-known/webauthn/route.ts` serves them at `/.well-known/webauthn` (via a rewrite in `next.config.ts` — Next ignores app directories starting with a dot, and a route under `.well-known/` silently never registers).

The mechanism is narrower than it sounds, and assuming the broad version is the trap: **a ceremony uses exactly one rpID and the credential stays bound to it.** What widens is the set of origins. So there is never a set of rpIDs to accept — §2.1's filter stays a single-value comparison.

```
🔴 El rpID se elige UNA VEZ, al nacer el proyecto, y no se cambia jamás.
   Si el dominio del cliente ya existe al provisionar → ese. Si no → el tuyo.
   Un dominio que llega después entra como ORIGEN, nunca como rpID nuevo:
   cambiar el rpID mata todas las passkeys ya enroladas.
```

⚠️ **Límite duro: 5 labels distintos** (el eTLD+1 sin sufijo — `example.co.uk` y `example.de` comparten `example` y cuestan uno; `aditum.mx` y `timekast.mx` cuestan dos). El navegador descarta los excedentes **en silencio**, así que `getRelatedOrigins` avisa por log. Es anti-abuso deliberado: un solo rpID nunca puede cubrir una flota entera de dominios ajenos.

> **Derivados:** la columna es aditiva y sin backfill — `pnpm db:generate` + `pnpm db:migrate`. Las filas previas quedan en `NULL` (desconocido) y se auto-adoptan al usarse. La migración la generas **tú**: las del Factory nunca viajan al derivado (BR-FACTORY-005). Si tu `src/` es anterior a `v12.2.0` no basta con migrar: falta el código que lee la columna → [`passkey-domain-binding.md`](../../docs/retrofits/passkey-domain-binding.md).

**Persistence + anti-enumeration** live in `@/lib/auth/passkey.ts`. `verifyPasskeyAuthentication` returns the SAME `null` (and passes through the SAME timing pad, `ANTI_ENUMERATION_DELAY_MS`) whether the `credentialId` is unknown or the signature failed — an attacker cannot tell "this credential doesn't exist" from "the signature was wrong". A duplicate enrollment (the `credential_id` unique constraint, code `23505`) is a friendly `passkey_already_registered`, never a 500.

**Client orchestration** is `@/lib/auth/passkey-client.ts` — NOT a server action. The WebAuthn ceremony runs in the browser; `enrollPasskey` / `authenticatePasskey` sequence the two route handlers around `navigator.credentials.create/get` and fold every failure (including user cancellation → `cancelled`, a neutral toast, not an error) into a discriminated result. Sending `Content-Type: application/json` is what passes the routes' anti-CSRF guard. Login uses the discoverable (usernameless) flow — no `allowCredentials`, so the options never oracle which user has a passkey.

---

## 3. TOTP (authenticator app) — enroll → confirm → verify

`@/lib/auth/totp.ts` holds the self-service actions; `@/lib/auth/totp-verify.ts` holds verification; the secret is encrypted at rest by `@/lib/auth/totp-crypto.ts`. At most one CONFIRMED row and one PENDING row per user in `totp_secrets`.

```ts
import { enrollTotp, confirmTotp } from '@/lib/auth/totp';
import { verifyTotp } from '@/lib/auth/totp-verify';
```

- **`enrollTotp`** — self-service (`withSelf`, userId from the session, never an argument). Gated by the factor-change rule (§4.1: `add` for a first TOTP, `remove` when replacing a confirmed one). Mints a secret, returns the `otpauth://` URI for the QR, stores the secret ENCRYPTED with `confirmedAt = null` (pending — NOT yet a usable factor). It drops only a stale PENDING row — the confirmed factor keeps working until the new one is proven.
- **`confirmTotp(code)`** — same gate. Verifies the first code against the PENDING row and, in ONE transaction, deletes the previously confirmed row and stamps `confirmedAt` on the new one, seeds the anti-replay state, and emits the `mfa_enabled` audit event. A pending secret never shadows the working one.
- **`verifyTotp(userId, code)`** — a DOMAIN function, `server-only`, NOT a server action: it trusts the `userId` it receives, so it must never live in a `'use server'` module (every export there gets a callable action ID — an unauthenticated one would check codes for any user). The callers (the step-up actions, the login 2FA gate) resolve the user and pass the id down. Only verifies CONFIRMED rows (`confirmedAt IS NOT NULL`). Returns `ActionResult<void>`.
- **`disableTotp()`** — self-service removal of the authenticator app, behind the factor-change rule (`kind: 'remove'`) and the removal rules of §4.4. Returns `{ recoveryCodesCleared }` so the UI can say the codes went too; `TotpEnrollment` calls it through `useSensitiveAction` at `high` risk, after a confirmation.

Three properties to preserve:

- **Window ±1.** Verification tolerates one period (30s) of clock skew on each side (`epochTolerance`), so the previous / current / next code is accepted.
- **Anti-replay.** A code already accepted within its 30s window is rejected on a second submission (`lastUsedCode` / `lastUsedAt`); a different code, or the same code after the window, passes.
- **Encrypted, never hashed.** A TOTP secret must be RECOVERABLE to recompute each rolling code, so `@/lib/auth/totp-crypto.ts` encrypts it (JWE `dir` + `A256GCM`) with `MFA_ENCRYPTION_KEY`. The `keyId` (`kid`) travels inside the JWE protected header for future rotation. Losing the key fails CLOSED for TOTP — the user re-enrolls (asymmetric vs recovery codes, which survive key loss). `getMfaEncryptionKey()` throws loudly if the key is missing/malformed — never a silent degrade.

```ts
import { encryptTotpSecret, decryptTotpSecret, getMfaEncryptionKey } from '@/lib/auth/totp-crypto';
```

---

## 4. Step-up grants — the gate for sensitive actions

A sensitive action must carry a recent step-up grant. `@/lib/auth/step-up.ts` owns the gate; the grant store is the `step_up_grants` table. **Validation is fail-closed in Node and reads LIVE DB state — NEVER the JWT.** The canonical grant query (the schema SSOT):

```ts
import {
  requireStepUp, // throwing — pre-flight gate inside a sensitive action (StepUpRequiredError)
  hasRecentStepUp, // non-throwing boolean — Edge-adjacent gates
  verifyStepUp, // ActionResult validator — composed by withAuth/withSelf
  grantStepUp, // mint/refresh a grant after a passkey/totp factor check
  verifyStepUpPasskey, // verify a passkey assertion for step-up + mint the grant
  STEP_UP_REQUIRED,
  STEP_UP_METHOD_INSUFFICIENT,
  STEP_UP_NO_STRONG_FACTOR,
} from '@/lib/auth/step-up';
```

The query that decides whether a grant is live, by four AND-ed conditions:

1. **Confirmed methods only** — `method IN ('passkey','totp','email_otp','recovery')`. The transitory `'email_otp_pending'` (an emitted-but-unverified email code) is EXCLUDED — including it would let an unverified code satisfy step-up (a 2nd-factor bypass). Never drop the method filter.
2. **Freshness floor** — `step_up_at > now() - maxAge`.
3. **TTL** — `expires_at > now()`.
4. **Epoch-gated revocation** — `session_epoch >= users.session_epoch`, re-read at validation time. A bump (`revokeUserSessions` — an admin reset, a password change or reset, [`sk-security §6.1`](../sk-security/SKILL.md)) invalidates every prior grant instantly, without rewriting any row. 🔴 A grant is stamped with the epoch of the **token that minted it**, never the live one, and minting is refused when the token is behind: inside its ≤5-min revalidation window a revoked cookie still passes `auth()`, and must not mint a grant that looks current. The factor-change rule, the admin gate and the sensitive-action gate of `withAuth` / `withSelf` refuse a stale token the same way (`readActiveLoginContext()` returns its `sessionEpoch`).

**Method policy:** a HIGH-risk action accepts only `{passkey, totp}` (`verifyStepUp`'s `requireStrong`) — email AND recovery grants are rejected (`step_up_method_insufficient`). A redeemed recovery code restores ACCESS and satisfies MEDIUM gates only — a leaked backup sheet must never be a master key. The one exception is scoped and lives in its own module: a recovery code redeemed in THIS login may change a factor (§4.1, the lost-device path). Email is the MEDIUM-risk fallback only. `getStepUpMaxAge(role)` shortens the freshness window for `PRIVILEGED_ROLES` (admin / super_admin) — the privileged window is a FLOOR, never widened.

**Auto-gating (registry-driven).** The wrappers resolve `resolveSensitivePair(resource, action)` on every call — declaring the pair IS the gate:

- **`withAuth`** — its RBAC `(resource, action)` doubles as the registry key: ONE step (add the pair, done).
- **`withSelf`** — has no ambient key: TWO steps (add the pair + pass `sensitiveAction: { resource, action }`). A declared key with NO registry entry FAILS CLOSED (logged author error, action never runs) — a typo can never silently run ungated. Live example: `regenerateRecoveryCodes` (`@/lib/actions/recovery-codes.ts`).
- **`riskLevel` drives everything.** `high` → `verifyStepUp({ requireStrong: true })`, decision order: live strong grant → pass; NO strong factor ENROLLED → `step_up_no_strong_factor` (checked BEFORE weak grants — the enroll CTA, never a "use passkey" dead-end for factors the user doesn't have); a weaker live grant → `step_up_method_insufficient`; else `step_up_required`. `medium` → any confirmed factor. Either way the lookup is bound to THIS login: the wrapper passes the session's `loginId` (read with `readActiveLoginContext()`), so a step-up the owner did on another device never satisfies a hijacked cookie, and a session without `loginId` is refused.
- **`requireStepUp` = override lane, strictest-wins.** It can only NARROW the registry gate: a strong `method`, a shorter `maxAge` (`isMethodAllowedForRisk` validates; a weakening override — email on a high pair, a longer window — is IGNORED). Standalone (no registry pair) it keeps the verbatim legacy behavior. ⚠️ On a MEDIUM pair, `method: 'email'` is a LEGAL narrowing that scopes the gate to email-only grants (even a fresh passkey grant won't satisfy it) — narrow to email only when that is literally the intent.
- **Client risk display.** Derive `riskLevel` SERVER-SIDE in the RSC via `resolveSensitivePair(...)` and pass it down as a prop (see `profile/page.tsx` → `RecoverySection`) — the client never re-declares what the registry owns. `resolveSensitivePair` is pure data and technically client-safe, but `isMfaEnabled()` / `isMfaRequiredForAll()` are NOT (non-`NEXT_PUBLIC` vars read `false` in the browser) — never call those client-side.

**Two shapes, one store.** `requireStepUp({ userId, maxAge })` throws (`StepUpRequiredError`) — it is consumed by `linkAccount` and the `signIn` linking gate. The composable `verifyStepUp({ userId, method?, maxAge, requireStrong?, loginId? })` returns `ActionResult` so it slots into the wrappers' auto-gate without colliding with the throwing export. 🔴 `loginId` is keyed on PRESENCE: pass the key to bind the lookup to that login — an empty value then fails closed (`step_up_required`, no query), never widening to a user-scoped read; omit the key only for a gate that is user-scoped on purpose.

**Client overlay.** The `StepUpSheet` (SCR-023) is a CLIENT component; it cannot import `@/lib/auth/step-up.ts` directly. The thin `'use server'` boundary it invokes is `@/lib/actions/step-up.ts` (`verifyStepUpFactor` for TOTP/email, `verifyStepUpPasskeyFactor`, `verifyStepUpRecoveryFactor`, `requestStepUpEmailCodeFactor`) — each resolves the user from the session and re-throws the factor module's own fail-secure error. Every grant they mint is stamped with the session's `loginId`. The TOTP branch is throttled per `userId:ip` (`mfaVerify`, consumed per attempt) and per user by `stepUpFailUser`, a FAILURE-ONLY bucket (§4.3). `requestStepUpEmailCodeFactor` receives the `(resource, action)` pair, never a risk level: the server resolves the risk with `resolveSensitivePair` and refuses an undeclared pair, so a client cannot claim `medium` to get an email code for a `high` action.

### 4.1 Changing a factor — `assertFactorChangeStepUp`

> 🔴 **Disponible desde kit `v13.1.0`, y NO llega por `factory update`.** §4.1–§4.4, the token-epoch stamping of §4, the login binding, the `/2fa` alert and the auto-link refusal of §7, `disableTotp` and `totp-verify.ts` live in `src/`, which is frozen in a derivative (BR-FACTORY-006). **Before relying on them, check they exist in THIS repo** (`ls src/lib/auth/factor-change.ts`; `grep -n "hasLoginSecondFactorGrant" src/lib/auth/auth.ts`). If they don't, the derivative is still exposed to the 2FA bypasses they close: the manual retrofit is [`factor-and-session-hardening.md`](../../docs/retrofits/factor-and-session-hardening.md).

A session that can change the account's factors can lock the owner out or plant its own way back in. So every surface that adds, replaces or removes a factor asks ONE rule, `assertFactorChangeStepUp({ userId, role, loginId, authAt, kind })` (`@/lib/auth/factor-change.ts`), instead of picking its own step-up:

| Situation | What authorizes it |
| --- | --- |
| MFA off | Nothing — allowed, like every other step-up gate |
| `kind: 'add'` with NO usable factor (first enrollment) | Any confirmed live grant, email included. With email NOT configured (`isEmailReady()` false), the login itself for `FIRST_FACTOR_LOGIN_WINDOW_SECONDS` (15 min) from `token.authAt` — each login opens its own window |
| `add` with a usable factor, and every `remove` / replace | A STRONG grant (passkey / TOTP) OR a recovery code redeemed in THIS login (`hasLoginRecoveryGrant(userId, loginId)`) |

🔴 **Every grant the rule accepts must carry THIS session's `loginId`** — the email grant of a first enrollment included (`verifyStepUp({ …, loginId })` filters every lookup by it). A user-scoped read lets a cookie stolen from another of the victim's logins ride the strong grant the victim just minted on their own device and plant a persistent passkey. A session with no `loginId` is refused (`step_up_required`): it can never match a grant, and re-login mints one.

An email grant never authorizes a change once a factor exists: whoever controls the inbox would otherwise swap out the factor that protects against them. Refusals carry the stable `step_up_*` codes, and `step_up_no_strong_factor` is returned only when the user has no usable strong factor — exactly when a first enrollment is open.

Surfaces that apply it: the passkey register routes (`add`), `enrollTotp` / `confirmTotp` (`add`, or `remove` when replacing), `removePasskey` (`remove`), `regenerateRecoveryCodes` (`remove`), `requestEmailChange` (`remove` — the email is a recovery channel), linking Google/GitHub in `linkAccount` + the `signIn` linking gate (`add` — a provider that skips `/2fa` is itself a factor), and unlinking it in `unlinkAccount` (`remove`, when MFA is on and the user has any factor). Unlinking anything else (the password, or a provider with MFA off / no factor yet) takes the same any-grant gate that linking it takes — bound to this login while MFA is on (`verifyStepUp` with the session `loginId`), user-scoped `requireStepUp` only with MFA off: removing a way in is at least as sensitive as adding one. `regenerateRecoveryCodes` is declared `high` in the registry but enforces this rule in the action, because the wrapper's high gate would refuse the recovery grant of the lost-device path. Callers read `loginId` / `authAt` / `role` with `readActiveLoginContext()` (`@/lib/auth/auth`). The module is separate from `step-up.ts` on purpose: `auth.ts` imports `step-up.ts` and consumes this rule, so living in either would close an import cycle.

**Admin actions on ANOTHER user's credentials** (`resetMfa`, `adminSetTemporaryPassword`, `adminUnlinkUserMethod`, and an email change inside `updateUser`) call `assertStrongStepUp({ userId: adminId, role, loginId })`: a strong step-up of the acting admin minted by the admin's current login, no email, no recovery — the admin is changing someone else's security, not recovering their own. The email counts because moving it moves the target's login identity and the channel of their email factor, and it lands verified: without the gate, a hijacked admin session would point the account at its own inbox and reset the password there. Name / role edits stay on the plain `users/update` permission.

The admin user-detail screen asks for that step-up through `useSensitiveAction` (§4.2) at `high` risk, fed the ACTING admin's factors, which the page resolves server-side (`ActorStepUpPosture`, `@/components/admin/admin-step-up.ts`). The pair it hands the sheet (`ADMIN_CREDENTIAL_ACTION`, `users/update`) is deliberately NOT declared in `MFA_SENSITIVE_ACTIONS`: declaring it would make the wrappers gate every user edit, not just the credential changes.

### 4.2 The client half — `useSensitiveAction` + `StepUpSheet`

A `step_up_*` code is not a failure to report; rendering it as a toast strands the user on a screen that refuses to work. `useSensitiveAction` (`@/lib/hooks/useSensitiveAction.tsx`) is the canonical UI path for every gated action:

```tsx
const { execute, stepUpSheet } = useSensitiveAction({
  userId,
  hasPasskey,
  hasTotp,
  riskLevel,
  sensitiveAction: { resource: 'mfa_factors', action: 'change' },
  reason: 'Confirma que eres tú para quitar esta passkey.',
});

void execute(() => removePasskey({ credentialId }), {
  onSuccess: () => router.refresh(),
});

return <>{ui}{stepUpSheet}</>;
```

`execute` runs the action; on any `step_up_*` code it opens the `StepUpSheet` with that code, queues the attempt and replays it verbatim once a factor is verified (cancelling drops the queue). `promptStepUp` opens the sheet before spending a call. The codes come from `@/lib/auth/step-up-client.ts` — never re-declare them in a component; a test pins that list against the server's. The sheet leads with the email code when the user has no authenticator app (`hasTotp`), offers a recovery code for high-risk changes (redeemed by `verifyStepUpRecoveryFactor`, rate-limited and bound to this `loginId`), points to enrolling a factor on `step_up_no_strong_factor`, and says to sign in again when the first-factor window expired with no email configured. Passkey enrollment follows the same path: `enrollPasskey` (`@/lib/auth/passkey-client.ts`) returns `{ status: 'step_up', code }` on the route's 403, and the component opens the sheet before retrying `register`.

Derive `riskLevel` for the sheet in the RSC: `high` when the user already has a usable factor (the sheet hides email), the registry pair's level otherwise (see `profile/page.tsx`).

### 4.3 Throttling second-factor codes — failure-only per-user buckets

Whoever types a code at `/2fa` may be an attacker holding only the password. A per-user bucket consumed on every attempt is therefore a lockout lever: junk codes drain it and the owner loses their factor at `/2fa` AND in their own session. So TOTP is throttled by two layers (`@/lib/rate-limit.ts`):

- **per `userId:ip`** (`mfaVerify`), consumed per attempt, in front of everything;
- **per user, FAILURES only**, one bucket per surface: `mfaLoginFailUser` for `/2fa`, `stepUpFailUser` for the in-session step-up (10 failures / 15 min each, tunable via `RATE_LIMIT_*` env). The caller peeks with `isRateLimitExhausted(userId, bucket)` before comparing the code and consumes with `checkRateLimit` only when the code is wrong — a correct code never spends budget, and `/2fa` failures can never exhaust the owner's step-up.

**Recovery codes have NO per-user bucket**, only `recoveryCode` per `userId:ip`. Recovery is the lost-device way in; a per-user ceiling is one an attacker could drain to shut the owner out of exactly that door, and ~60 bits per single-use code make the per-source bucket enough. The email step-up code keeps `mfaVerifyUser` (per user) + `mfaVerify`: it is reachable only from a full session.

---

### 4.4 Removing a factor — the removal rules and the factor lock

`disableTotp` and `removePasskey` apply, after the factor-change rule, three rules inside ONE transaction, after their delete and before the commit (`enforceFactorRemovalRules`, `@/lib/auth/factor-removal.ts`):

1. **A role that must have MFA** (`isMfaEnabled() && mfaMandatoryForRole(role)`) may not lose its last factor **usable here** (`userHasUsableMfaFactor`): a passkey of another domain cannot answer `/2fa` on this deployment, so it does not keep the obligation met. The refusal throws and rolls the delete back. Removing a dead credential (a foreign-domain passkey) never trips it, or a user stuck with one could not clean it up.
2. **With NO factor left at all** (`userHasMfaEnabled`, which counts foreign-domain passkeys too), the recovery codes are deleted. A recovery code backs up a second factor; with nothing left to back up, a leftover sheet is a spare key to an account that no longer asks for one — and would still unlock the lost-device path of the factor-change rule. While a foreign-domain passkey remains, the account still owes a factor at login, so the codes stay.
3. **For EVERY role** (MFA on): a removal may not leave only factors that cannot answer `/2fa` here with no way around them. Removing the last usable factor while a foreign-domain passkey remains keeps the account owing a second factor at login (rule 2's reading), and `/2fa` would offer only that passkey, which cannot verify here. An unused recovery code is the way through; without one the owner's next password login dead-ends. So that removal is refused (`FOREIGN_PASSKEY_ONLY_MESSAGE`): remove the foreign passkey first (never refused — it is not usable here) or add a factor. Rule 1 covers mandatory roles with a harder line.

Every read (both predicates, the unused-recovery-code lookup) takes the transaction (`exec` parameter) so it sees the removal's own uncommitted delete.

**Recovery codes require a factor.** `regenerateRecoveryCodes` takes the factor lock and refuses when the account has no factor at all (`userHasMfaEnabled` under the lock, foreign-domain passkeys included): codes back up a second factor, and a concurrent removal that took the last one clears the codes in its own transaction — without the lock and the re-check, a fresh sheet could land right after that commit.

**Lock order.** Every writer takes the `users` row lock as its FIRST statement, `resetMfa` included (on the target user, before its wipe and epoch bump): a writer that took the row later — through the epoch `UPDATE`, say — would order the locks differently from the self-service writers, a deadlock waiting to happen.

**The factor lock.** Every factor write — `enrollTotp`, `confirmTotp`, passkey registration, `disableTotp`, `removePasskey` — opens a transaction whose FIRST statement is `lockUserForFactorChange(tx, userId)` (`@/lib/auth/factor-lock.ts`, `SELECT … FOR UPDATE` on the `users` row, the same row `unlinkAccount` locks). Two interleaved writes could each pass their own check and together leave an account the rules forbid (a TOTP confirmed after it was disabled; the last passkey and the TOTP removed at once on a mandatory role). The role is read under the lock, not from the token, because the token's role can lag an admin's change.

Each removal is audited (`mfa_disabled` for TOTP) and emails the owner (`mfa-factor-removed-alert`, via `sendMfaFactorRemovedAlert`, `@/lib/auth/security-alerts.ts`) after the commit.

## 5. Email step-up code — pending vs promoted (medium-risk only)

`@/lib/auth/email-otp.ts` is the MEDIUM-risk fallback factor. A high-risk request is rejected outright. The code is stored HASHED (SHA-256) on a `step_up_grants` row — NOT a separate table — and the pending/live distinction is carried by the `method` value:

- **request** → `INSERT { method: 'email_otp_pending', codeHash, consumedAt: null, expiresAt: +10min }`. A pending row is NOT a grant (the canonical query filters it out).
- **verify** → match the hash (constant-time), then PROMOTE the row in place: `UPDATE SET method='email_otp', consumedAt=now(), stepUpAt=now()`. Promotion is the ONLY path to `email_otp`, so an emitted-but-unverified code can never count as a live step-up.

```ts
import { requestStepUpEmailCode, verifyEmailOtpCode } from '@/lib/auth/email-otp';
```

Security posture: code from `crypto.randomInt` (CSPRNG, no modulo bias); constant-time compare; anti-enumeration (`requestStepUpEmailCode` always returns success — the email is sent only if the user exists); anti-accumulation (a fresh request supersedes any prior pending code); send-throttle on the `forgotPassword` bucket; verify throttled by TWO buckets (`mfaVerifyUser` per user + `mfaVerify` per `userId:ip`) so the 6-digit space can't be brute-forced from one IP or by rotating IPs.

---

## 6. Recovery codes — hashed, single-use

`@/lib/auth/recovery-codes.ts` generates / hashes / verifies backup codes. These are HASHED (SHA-256, unsalted, deterministic), never encrypted:

```ts
import {
  generateRecoveryCodes, // CSPRNG, rejection-sampled, e.g. A7KM-9PQR-3XYZ
  hashRecoveryCode, // SHA-256 of the normalized code (uppercased, separators stripped)
  verifyRecoveryCode, // constant-time compare; false (never throws) on length/format mismatch
} from '@/lib/auth/recovery-codes';
```

Each code carries ~60 bits of entropy and is single-use, so unsalted SHA-256 is sufficient — there is no low-entropy secret to protect against an offline dictionary attack, and a deterministic hash is exactly what lets the code be looked up by its hash. This is ASYMMETRIC vs TOTP secrets on purpose: a recovery-code hash survives loss / rotation of `MFA_ENCRYPTION_KEY`; a TOTP secret encrypted with a lost key does not. Show the plaintext codes ONCE; store only their hashes. Anti-replay (marking a code `usedAt` after a successful redeem) lives in the DB write — see `@/lib/auth/recovery-redeem.ts`, the one redeem path: it spends a single-use code and mints a `recovery` grant stamped with the caller's `loginId`. Both `/2fa` (`verifyMfaCode`) and the step-up overlay (`verifyStepUpRecoveryFactor`) go through it; each owns its session resolution, rate limit (`recoveryCode` per `userId:ip` — no per-user bucket, §4.3) and generic error.

---

## 7. 2FA-on-login + CSRF-resistant account linking

**2FA-on-login.** `@/lib/auth/mfa-login.ts` clears the `pendingMfa` gate after the FIRST factor already succeeded. A JWT/JWE token cannot be mutated from a server action, so the contract is: the action verifies the second factor server-side and mints a live grant in `step_up_grants`; the client calls `useSession().update()`; the Node `jwt()` callback sees the live grant and flips `pendingMfa` to `false`. The gate is cleared ONLY by a server-side factor check, never by the client `update()` payload.

```ts
import { verifyMfaCode, verifyMfaPasskey } from '@/lib/auth/mfa-login';
```

🔴 **The grant that clears `pendingMfa` must belong to THIS login.** Grants are user-scoped, and a user-scoped check is a bypass: an attacker holding the password waits in `pendingMfa` until the VICTIM passes their own `/2fa` or a step-up in their own session, and rides that grant into a full session. So every sign-in (`trigger` `signIn` or `signUp`) mints `token.loginId` (`randomUUID`) and `token.authAt`; the `/2fa` ceremony reads `loginId` from the session cookie (`readActiveLoginId`, `@/lib/auth/auth`) and stamps it on the grant (`step_up_grants.login_id`); and the `jwt()` callback clears the gate only through `hasLoginSecondFactorGrant(userId, loginId)` (`@/lib/auth/step-up.ts`):

- **login-bound** — only a grant carrying this `loginId`. Every grant minted from a session is stamped with that session's `loginId`, so the victim's own `/2fa` or step-up is bound to the victim's login and never matches the attacker's; a `NULL` `login_id` never matches anything.
- **real second factor** — passkey, TOTP or recovery. NEVER `email_otp`: the login's first factor is often the inbox itself (magic link, or a password reset through it), so an email grant would be the same factor twice.
- **with MFA on, any token without `loginId` is ended** (`jwt()` returns `null`), full sessions included — no grant can ever be bound to it (a pending one could never clear, a full one would loop in the step-up sheet), and a fallback to the user-scoped check would reopen the hole. Each such user signs in again once.

`loginId` / `authAt` are server-controlled JWT claims (`types/next-auth.d.ts`) and are deliberately NOT on the `Session`: nothing client-side needs them. Server code reads them with `readActiveLoginContext()`.

Under `pendingMfa`, `withAuth` / `withSelf` return `PENDING_MFA_ERROR` before any schema or handler, and route handlers answer 403 through `requireRouteSession` ([`sk-security §2`](../sk-security/SKILL.md)). Only the `/2fa` ceremony runs there, and it does not use those guards.

Which login methods inherently satisfy the gate is policy in `@/config/mfa.ts` (`MFA_SATISFYING_LOGIN_PROVIDERS`): a passkey assertion and federated logins (google / github) satisfy it; `credentials` (password) and magic-link (email) do NOT — they are the stealable first factors the gate exists to backstop. The list fails CLOSED — an unknown provider never silently skips the second factor.

**Failed second factors email the owner.** Reaching `/2fa` already proves the password, so a wrong TOTP or recovery code there is worth telling the owner about: `verifyMfaCode` calls `scheduleMfaFailureAlert` (`@/lib/auth/security-alerts.ts`), which sends `mfa-failures-alert` at most **once per hour per user**. The dedupe is one conditional `UPDATE users SET last_mfa_alert_at = now() WHERE last_mfa_alert_at IS NULL OR last_mfa_alert_at < now() - 1h RETURNING`, so two concurrent failures can never both send, and it does not depend on the rate-limit backend or its kill switch. The send runs in `after()`: the `/2fa` response is identical, in body and in timing, whether an email goes out or not.

🔴 **No anonymous auto-link for a user with a factor.** The Google / GitHub providers set `allowDangerousEmailAccountLinking`, so `@auth/core` binds a NEW OAuth identity to whichever user owns the same email. For a user with a second factor that is a full bypass: that login skips `/2fa`, so whoever controls the mailbox opens a Google account on it and walks in. With MFA on, the `signIn` callback refuses an anonymous (no active session) OAuth/OIDC sign-in whose `(provider, providerAccountId)` is not yet in `accounts` when the matching user has any factor (`userHasMfaEnabled`), and returns `/login?error=OAuthAccountNotLinked` — the one NextAuth error `LoginForm` gives its own copy, telling the owner to link it from Perfil › Seguridad (behind the factor-change rule). Keyed by the identity, not by (user, provider): an identity already bound is a plain login, and a second GitHub still cannot be auto-linked. Users with no factor keep the auto-link (nothing to bypass), and MFA off keeps it for everyone.

**Enforce-all gate (`mfaEnrollmentRequired`) — self-healing on purpose.** When the posture demands a factor (`MFA_REQUIRED_ALL`, or a role with `requiresMfa`) and the user has none, the Edge `authorized()` bounces every route to `/profile`. The enrollment UI clears it the same way: enroll → `update({})` → the Node `jwt()` re-derives the claim from live DB state. 🔴 **That refresh must never be the only link.** It is one client fetch, and the `jwt()` catch is fail-closed (an error keeps a raised gate raised), so a single lost refresh used to pin the claim in the cookie: the user was locked out of the whole app while `/profile` showed their factor as active, and only a re-login cleared it. So a RAISED gate also re-derives itself with **no trigger**, on the next request (`staleGateNeedsRecheck`, `@/lib/auth/auth.ts`) — the extra factor read is paid only by a user who is already blocked, and the gate is never cleared by anything but live DB state. A UI that clears a gate through `update()` owes the user a visible outcome too: `TotpEnrollment` retries once and then says so, rather than rendering success and failure identically.

**CSRF-resistant linking while logged in.** Linking an OAuth provider to an existing session is a sensitive action, gated BEFORE the OAuth flow starts (`linkAccount`, `@/lib/actions/auth/link-account.ts`) and again in the `signIn` callback where the account row is written. With MFA on, a provider whose login skips `/2fa` (Google / GitHub, `MFA_SATISFYING_LOGIN_PROVIDERS`) is itself a factor and goes through the factor-change rule (§4.1, `kind: 'add'`); otherwise any confirmed grant (`requireStepUp({ maxAge: 300 })` in `linkAccount`; in the `signIn` gate, bound to this login while MFA is on). For OAuth/OIDC the `signIn` gate refuses, BEFORE any shortcut, a session that owes its second factor (→ `/2fa`), a revoked one (cookie epoch behind or missing), one of a missing or deleted user, and (MFA on) one without `loginId` — core links on its own once the callback lets it through. A re-login counts as "already linked" only for the exact identity (`provider` + `providerAccountId`): matching the provider alone let a second, attacker-owned Google skip every gate. The gate reads the session cookie EXACTLY the way core does (`readActiveSessionCookie` → `sessionTokenLikeCore`, `@/lib/auth/session-cookie-parse`): the RAW `Cookie` header through a copy of core's parser (first value of a repeated name wins, spaces and tabs trimmed) and core's `SessionStore` assembly (every cookie whose name starts with the session name, `<name>.N` chunks and a renamed `<name>X` alike, sorted by suffix and joined). Never Next's `cookies()` for this: it keeps the LAST repeated value and does not trim tabs, and any divergence shows the gate one session while core links to another. A test pins the copy against the installed `@auth/core`. An OAuth login with a cookie that cannot be opened is refused, never read as anonymous. A missing grant surfaces a stable `step_up_*` code so the client opens the step-up overlay (§4.2) instead of a dead-end. `unlinkAccount` / `removePasskey` refuse to remove the user's LAST access method — they lock the `users` row `FOR UPDATE` and count methods (`countAccessMethods`, `@/lib/auth/access-methods.ts`) inside one transaction so the guard can't be raced intra- or cross-action.

> **Verified email change** (`@/lib/auth/email-change.ts`) molds on password-reset: the link goes to the NEW address, applying it stamps a security alert to the OLD address, tokens are hashed (SHA-256, 1h expiry, one-time), and invalid/expired/used tokens collapse to one `token-invalid-expired` outcome (anti-enumeration).

---

## 8. Anti-patterns (kit-specific)

| ❌                                                                       | ✅                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Deriving WebAuthn `rpID` / origin from the request `Host` header         | Read `WEBAUTHN_RP_ID` / `NEXT_PUBLIC_APP_URL` from env (Invariant 2)                    |
| Cambiar el `rpID` para "agregar" un dominio                              | El dominio nuevo va en `WEBAUTHN_RELATED_ORIGINS` — cambiar el rpID mata las passkeys (§2.2) |
| Contar toda passkey como factor cumplido / como método de acceso        | Filtrar por el rpID de este deployment (`userHasUsableMfaFactor`, §2.1)                 |
| Filtrar por dominio la pregunta "¿le exijo 2FA?"                        | Esa cuenta TODO a propósito — filtrarla es un downgrade (anti-downgrade R5, §2.1)       |
| Degradar un gate de 2FA a "enrola un factor aquí"                       | Explicar + código de recuperación: enrolar antes de probar el factor es un bypass total |
| Re-using a consumed challenge / skipping the one-time store              | `consumeChallenge` stamps `consumedAt` before success — one-time (Invariant 1)         |
| Leaking "credential not found" vs "bad signature" on passkey login       | Same `null` + same timing pad (`ANTI_ENUMERATION_DELAY_MS`) for both                   |
| Reading step-up state from the JWT / a token claim                       | Read the LIVE `step_up_grants` row in Node (fail-closed — DB is the source)             |
| Counting `email_otp_pending` as a live grant                            | Canonical query filters `method IN (confirmed set)` — pending is never a grant         |
| Satisfying a HIGH-risk step-up with an email or recovery grant          | HIGH-risk accepts only `{passkey, totp}` (`requireStrong`) → `step_up_method_insufficient` otherwise |
| Passing `requireStepUp` to soften a registry gate (email / long window) | The override only NARROWS (strictest-wins) — a weakening override is ignored           |
| Hashing the TOTP secret / encrypting recovery codes                     | TOTP secret is ENCRYPTED (recoverable); recovery codes are HASHED (single-use)         |
| Clearing `pendingMfa` from the client `update()` payload                | Verify the factor server-side → mint a grant → the `jwt()` callback clears the gate    |
| Clearing `pendingMfa` with any live grant of the user (or an email grant) | `hasLoginSecondFactorGrant(userId, loginId)` — passkey/TOTP/recovery minted by THIS login |
| Accepting a user-scoped grant for a factor change or an admin credential action | Pass `loginId` — only this login's grants count; no `loginId` → refused |
| A per-user throttle consumed on every `/2fa` attempt, or on recovery | Failure-only per-surface buckets for TOTP (`isRateLimitExhausted` + consume on failure); none per user for recovery |
| Letting an anonymous OAuth sign-in auto-link to a user with a factor | Refuse with `OAuthAccountNotLinked`; the owner links from Security behind the factor-change rule |
| Stamping a new grant with the LIVE epoch                                 | Stamp the minting token's epoch and refuse when it is behind the live one             |
| Removing a factor without the removal rules or outside the factor lock   | `lockUserForFactorChange` first, `enforceFactorRemovalRules` before the commit        |
| Letting a removal leave only a foreign-domain passkey and no unused recovery code | Rule 3 refuses it for every role — the next login would dead-end at `/2fa` |
| Alerting on every `/2fa` failure, or deduping in the rate-limit store    | One conditional `UPDATE` on `last_mfa_alert_at` (1/h), sent in `after()`              |
| Picking a step-up per factor surface (or none)                           | `assertFactorChangeStepUp` — email only for the first factor, strong or this login's recovery after |
| Rendering a `step_up_*` code as a toast / re-declaring the codes         | `useSensitiveAction` + the codes from `@/lib/auth/step-up-client.ts`                   |
| Sending `riskLevel` from the client to request an email code             | Send the `(resource, action)` pair — the server resolves the risk                     |
| A domain function that trusts its `userId` inside a `'use server'` file  | `server-only` module (`totp-verify.ts`) — every `'use server'` export is callable      |
| Linking an OAuth provider without a step-up gate                        | `linkAccount` + the `signIn` gate: factor-change rule for Google/GitHub, `requireStepUp` otherwise |
| Removing the user's last passkey / OAuth without the lock + count        | Lock `users` `FOR UPDATE` + `countAccessMethods` inside one tx (≥2 methods to remove)  |
| Declaring "this action is sensitive" inline in the server action         | Add the pair to `MFA_SENSITIVE_ACTIONS` — the wrappers auto-gate it (`withSelf` also passes its `sensitiveAction` key) |
| `Math.random()` for a step-up / recovery code                           | `crypto.randomInt` / `crypto.randomBytes` (CSPRNG, no modulo bias)                     |

---

## 9. Checklist — plugging into MFA

- [ ] New sensitive action → add the pair to `MFA_SENSITIVE_ACTIONS` (`@/config/mfa.ts`) — that IS the gate (`withAuth`: nothing else; `withSelf`: also pass `sensitiveAction: { resource, action }`)
- [ ] HIGH-risk pairs rely on `riskLevel: 'high'` → `requireStrong` ({passkey, totp}; email and recovery rejected) — no manual `method` wiring
- [ ] Client shows the pair's risk? Derive `riskLevel` in the RSC via `resolveSensitivePair` and pass it as a prop — never re-declare it client-side
- [ ] Passkey ceremony goes through `@/lib/auth/webauthn.ts` — never hand-assembled options or a Host-derived rpID
- [ ] TOTP/email/recovery code generation uses the CSPRNG path in its module — no new code generator
- [ ] Step-up state read from `step_up_grants` (live DB), never from the token
- [ ] Second-factor / linking flows are server-verified; the client `update()` only re-derives the token
- [ ] New surface that adds / replaces / removes a factor (or a recovery channel) → `assertFactorChangeStepUp` with the right `kind`; admin action on another user's credentials (email included) → `assertStrongStepUp` with the admin's `loginId`, and its screen goes through `useSensitiveAction`
- [ ] UI for a gated action goes through `useSensitiveAction` and renders its `stepUpSheet`
- [ ] A new factor write opens its transaction with `lockUserForFactorChange`; a new removal runs `enforceFactorRemovalRules` before the commit and emails the owner after it

---

## 10. Troubleshooting — when the symptom lies about the cause

### The QR never renders / enrolment fails only in production

**Check a native module on the same route BEFORE checking anything MFA.**

The kit mounts `TotpEnrollment` and the avatar uploader on the same `/profile` page, and the uploader reaches `sharp` — a native module. When a native module's binary is missing, the import throws at module EVALUATION, which takes down **every server action sharing that route's module**, `enrollTotp` included. The log names a system library and says nothing about MFA:

```
ERR_DLOPEN_FAILED: libvips-cpp.so.*: cannot open shared object file
```

Two signals identify this fast:

- **It only breaks deployed.** `build`, `lint`, `typecheck` and the tests all go green — the binary is present locally and absent in the function.
- **Passkey on the same screen still works.** It does not share the module. That asymmetry reads like "MFA is half-broken" and sends the diagnosis toward the encryption key, the `totp_secrets` table or the tenant plane — all of which will check out fine.

**Fix — two parts, and the FIRST is the one that actually bites:**

```jsonc
// 1. package.json — the ROOT cause. pnpm installs only the CURRENT platform's
//    optional binaries, so a mac dev tree never materialises
//    @img/sharp-libvips-linux-x64 (the package carrying libvips-cpp.so).
"pnpm": {
  "supportedArchitectures": { "os": ["current", "linux"], "cpu": ["current", "x64", "arm64"] }
}
```

```ts
// 2. next.config.ts — keeps Next from bundling it.
serverExternalPackages: ['sharp'],
```

Then `pnpm install`. **The lockfile does not change** — resolution was never the problem, materialisation was; you should see the missing platform binaries get downloaded.

> ⚠️ **Part 2 alone is not enough.** A production deploy with `serverExternalPackages` in place and no `supportedArchitectures` still failed. If the symptom persists after the config change, this is why.
>
> 🔴 **Do NOT reach for `outputFileTracingIncludes` globs over `node_modules/**`.** It looks like the obvious fix and it breaks the deploy one stage later: under pnpm those paths are symlinks into the store, and Vercel rejects a function packaged through one (*"invalid deployment package… files in symlinked directories"*). The build still compiles, so the failure moves from runtime to packaging rather than going away.

`pnpm preflight` blocks on both parts.

> An app born before this was fixed has the old `next.config.ts` (born-frozen, `BR-FACTORY-006`) and needs the declaration added by hand. Mitigation while it ships: **passkey** works, since it shares no module with the failing import.

### Enrolment works, but the code is always rejected

Clock drift on the server or the phone — TOTP is time-based. Check the window in `@/lib/auth/totp-verify.ts` before suspecting the secret. A secret that decrypts fine and a code that never matches is almost always drift, not crypto.

---

_Cross-reference: [`sk-security`](../sk-security/SKILL.md) — the auth split-config, RBAC, `withAuth`/`withSelf`, rate-limit + audit infra this builds on. [`sk-api`](../sk-api/SKILL.md) — `ActionResult` / `ActionError`. [`sk-features-index`](../sk-features-index/SKILL.md) — feature catalog._

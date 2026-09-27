---
name: sk-mfa
description: Kit-shipped multi-factor and step-up authentication: passkeys (WebAuthn), TOTP enrollment, registry-driven step-up gating of sensitive actions (declare the pair in MFA_SENSITIVE_ACTIONS and the wrappers gate it), hashed recovery codes, the 2FA-on-login gate and CSRF-resistant account linking. Invoke when adding a passkey or authenticator, gating a server action behind re-authentication, redeeming backup codes, or linking an OAuth provider to a session.
last-verified: 2026-09-22
user-invocable: false
---

# sk-mfa — Kit-shipped Multi-Factor + Step-Up Auth

This skill covers the MFA + step-up systems the Starter Kit ships and how to plug into them; the auth base they build on is [`sk-security`](../sk-security/SKILL.md).

> **Kit-shipped — not portable.** Travels with the Starter Kit. Grounded in real files: `@/lib/auth/webauthn.ts`, `@/lib/auth/passkey.ts`, `@/lib/auth/passkey-client.ts`, `@/config/mfa.ts`, `@/lib/auth/totp.ts`, `@/lib/auth/totp-status.ts`, `@/lib/auth/totp-crypto.ts`, `@/lib/auth/email-otp.ts`, `@/lib/auth/step-up.ts`, `@/lib/auth/recovery-codes.ts`, `@/lib/auth/mfa-login.ts`, `@/lib/auth/email-change.ts`, plus schemas `@/lib/db/schema/passkey-credentials.ts`, `@/lib/db/schema/totp.ts`, `@/lib/db/schema/step-up-grants.ts`, actions `@/lib/actions/passkey.ts` + `@/lib/actions/step-up.ts`, and components `PasskeyEnrollment` / `PasskeysList` / `TotpEnrollment` / `StepUpSheet`.
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
| TOTP lifecycle                          | `@/lib/auth/totp.ts`            | enroll / confirm / verify with anti-replay                           |
| TOTP enrollment status (query)          | `@/lib/auth/totp-status.ts`     | `hasTotpEnrolled` — confirmed-only probe (plain module: `totp.ts` is `'use server'`, a query there would become a public endpoint) |
| TOTP secret crypto                      | `@/lib/auth/totp-crypto.ts`     | JWE encrypt/decrypt of the secret at rest                            |
| Email step-up code (medium-risk only)   | `@/lib/auth/email-otp.ts`       | hashed 6-digit code, pending→promoted grant lifecycle                |
| Step-up grants (the gate)               | `@/lib/auth/step-up.ts`         | `requireStepUp` / `verifyStepUp` / `grantStepUp`, canonical query    |
| Recovery codes                          | `@/lib/auth/recovery-codes.ts`  | generate / hash / verify single-use backup codes                     |
| 2FA-on-login completion                 | `@/lib/auth/mfa-login.ts`       | clear the `pendingMfa` gate after the second factor                  |
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

`@/lib/auth/totp.ts` is the lifecycle; the secret is encrypted at rest by `@/lib/auth/totp-crypto.ts`. At most one row per user in `totp_secrets`.

```ts
import { enrollTotp, confirmTotp, verifyTotp } from '@/lib/auth/totp';
```

- **`enrollTotp`** — self-service (`withSelf`, userId from the session, never an argument). Mints a secret, returns the `otpauth://` URI for the QR, stores the secret ENCRYPTED with `confirmedAt = null` (pending — NOT yet a usable factor). A re-enroll drops the prior row first (no duplicate secrets).
- **`confirmTotp(code)`** — verifies the first code, stamps `confirmedAt` (activates the factor), seeds the anti-replay state, and emits the `mfa_enabled` audit event.
- **`verifyTotp(userId, code)`** — a DOMAIN function (NOT a `withSelf` action): the caller (`requireStepUp` / the login 2FA gate) already resolved the user and passes the id down. Only verifies CONFIRMED factors. Returns `ActionResult<void>`.

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
4. **Epoch-gated revocation** — `session_epoch >= users.session_epoch`, re-read at validation time. An admin reset that bumps the user's epoch invalidates every prior grant instantly, without rewriting any row.

**Method policy:** a HIGH-risk action accepts only `{passkey, totp}` (`verifyStepUp`'s `requireStrong`) — email AND recovery grants are rejected (`step_up_method_insufficient`). A redeemed recovery code restores ACCESS and satisfies MEDIUM gates only — a leaked backup sheet must never be a master key. Email is the MEDIUM-risk fallback only. `getStepUpMaxAge(role)` shortens the freshness window for `PRIVILEGED_ROLES` (admin / super_admin) — the privileged window is a FLOOR, never widened.

**Auto-gating (registry-driven).** The wrappers resolve `resolveSensitivePair(resource, action)` on every call — declaring the pair IS the gate:

- **`withAuth`** — its RBAC `(resource, action)` doubles as the registry key: ONE step (add the pair, done).
- **`withSelf`** — has no ambient key: TWO steps (add the pair + pass `sensitiveAction: { resource, action }`). A declared key with NO registry entry FAILS CLOSED (logged author error, action never runs) — a typo can never silently run ungated. Live example: `regenerateRecoveryCodes` (`@/lib/actions/recovery-codes.ts`).
- **`riskLevel` drives everything.** `high` → `verifyStepUp({ requireStrong: true })`, decision order: live strong grant → pass; NO strong factor ENROLLED → `step_up_no_strong_factor` (checked BEFORE weak grants — the enroll CTA, never a "use passkey" dead-end for factors the user doesn't have); a weaker live grant → `step_up_method_insufficient`; else `step_up_required`. `medium` → any confirmed factor.
- **`requireStepUp` = override lane, strictest-wins.** It can only NARROW the registry gate: a strong `method`, a shorter `maxAge` (`isMethodAllowedForRisk` validates; a weakening override — email on a high pair, a longer window — is IGNORED). Standalone (no registry pair) it keeps the verbatim legacy behavior. ⚠️ On a MEDIUM pair, `method: 'email'` is a LEGAL narrowing that scopes the gate to email-only grants (even a fresh passkey grant won't satisfy it) — narrow to email only when that is literally the intent.
- **Client risk display.** Derive `riskLevel` SERVER-SIDE in the RSC via `resolveSensitivePair(...)` and pass it down as a prop (see `profile/page.tsx` → `RecoverySection`) — the client never re-declares what the registry owns. `resolveSensitivePair` is pure data and technically client-safe, but `isMfaEnabled()` / `isMfaRequiredForAll()` are NOT (non-`NEXT_PUBLIC` vars read `false` in the browser) — never call those client-side.

**Two shapes, one store.** `requireStepUp({ userId, maxAge })` throws (`StepUpRequiredError`) — it is consumed by `linkAccount` and the `signIn` linking gate. The composable `verifyStepUp({ userId, method?, maxAge, requireStrong? })` returns `ActionResult` so it slots into the wrappers' auto-gate without colliding with the throwing export.

**Client overlay.** The `StepUpSheet` (SCR-023) is a CLIENT component; it cannot import `@/lib/auth/step-up.ts` directly. The thin `'use server'` boundary it invokes is `@/lib/actions/step-up.ts` (`verifyStepUpFactor` for TOTP/email, `verifyStepUpPasskeyFactor`, `requestStepUpEmailCodeFactor`) — each resolves the user from the session and re-throws the factor module's own fail-secure error.

---

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

Each code carries ~60 bits of entropy and is single-use, so unsalted SHA-256 is sufficient — there is no low-entropy secret to protect against an offline dictionary attack, and a deterministic hash is exactly what lets the code be looked up by its hash. This is ASYMMETRIC vs TOTP secrets on purpose: a recovery-code hash survives loss / rotation of `MFA_ENCRYPTION_KEY`; a TOTP secret encrypted with a lost key does not. Show the plaintext codes ONCE; store only their hashes. Anti-replay (marking a code `usedAt` after a successful redeem) lives in the DB write — see `@/lib/auth/mfa-login.ts`, which redeems a single-use code and mints a `recovery` grant.

---

## 7. 2FA-on-login + CSRF-resistant account linking

**2FA-on-login.** `@/lib/auth/mfa-login.ts` clears the `pendingMfa` gate after the FIRST factor already succeeded. A JWT/JWE token cannot be mutated from a server action, so the contract is: the action verifies the second factor server-side and mints a live grant in `step_up_grants`; the client calls `useSession().update()`; the Node `jwt()` callback sees the live grant and flips `pendingMfa` to `false`. The gate is cleared ONLY by a server-side factor check, never by the client `update()` payload.

```ts
import { verifyMfaCode, verifyMfaPasskey } from '@/lib/auth/mfa-login';
```

Which login methods inherently satisfy the gate is policy in `@/config/mfa.ts` (`MFA_SATISFYING_LOGIN_PROVIDERS`): a passkey assertion and federated logins (google / github) satisfy it; `credentials` (password) and magic-link (email) do NOT — they are the stealable first factors the gate exists to backstop. The list fails CLOSED — an unknown provider never silently skips the second factor.

**Enforce-all gate (`mfaEnrollmentRequired`) — self-healing on purpose.** When the posture demands a factor (`MFA_REQUIRED_ALL`, or a role with `requiresMfa`) and the user has none, the Edge `authorized()` bounces every route to `/profile`. The enrollment UI clears it the same way: enroll → `update({})` → the Node `jwt()` re-derives the claim from live DB state. 🔴 **That refresh must never be the only link.** It is one client fetch, and the `jwt()` catch is fail-closed (an error keeps a raised gate raised), so a single lost refresh used to pin the claim in the cookie: the user was locked out of the whole app while `/profile` showed their factor as active, and only a re-login cleared it. So a RAISED gate also re-derives itself with **no trigger**, on the next request (`staleGateNeedsRecheck`, `@/lib/auth/auth.ts`) — the extra factor read is paid only by a user who is already blocked, and the gate is never cleared by anything but live DB state. A UI that clears a gate through `update()` owes the user a visible outcome too: `TotpEnrollment` retries once and then says so, rather than rendering success and failure identically.

**CSRF-resistant linking while logged in.** Linking an OAuth provider to an existing session is a sensitive action: `linkAccount` (`@/lib/actions/auth/link-account.ts`) is gated by `requireStepUp({ maxAge: 300 })` BEFORE the OAuth flow starts. A missing grant surfaces the stable `STEP_UP_REQUIRED` code so the client opens the step-up overlay (mints the grant, then re-calls the action) instead of a dead-end. `unlinkAccount` / `removePasskey` refuse to remove the user's LAST access method — they lock the `users` row `FOR UPDATE` and count methods (`countAccessMethods`, `@/lib/auth/access-methods.ts`) inside one transaction so the guard can't be raced intra- or cross-action.

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
| Linking an OAuth provider without a step-up gate                        | `linkAccount` requires `requireStepUp({ maxAge: 300 })` before the OAuth flow (anti-CSRF) |
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

Clock drift on the server or the phone — TOTP is time-based. Check the window in `@/lib/auth/totp.ts` before suspecting the secret. A secret that decrypts fine and a code that never matches is almost always drift, not crypto.

---

_Cross-reference: [`sk-security`](../sk-security/SKILL.md) — the auth split-config, RBAC, `withAuth`/`withSelf`, rate-limit + audit infra this builds on. [`sk-api`](../sk-api/SKILL.md) — `ActionResult` / `ActionError`. [`sk-features-index`](../sk-features-index/SKILL.md) — feature catalog._

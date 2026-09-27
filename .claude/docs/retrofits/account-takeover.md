# Runbook — Cerrar Account Takeover en un derivado (self-registration + OAuth)

> **Retrofit shipped** (`.claude/docs/retrofits/`) — referenciado por `legacy-migration.md §F5` (aplica a derivados nacidos pre-EPIC-02, ≈ Factory 3.x–5.x). Las referencias `[mvpicks-v2]` son punteros a una implementación **probada en producción** (ejemplo vivo), no requisitos.
>
> **Para:** dev + agente (Claude Code) que va a remediar un proyecto **derivado** del TimeKast Factory.
> **Origen de la solución:** EPIC-02 (seguridad base) del kit — SEC-001 / SEC-002 / SEC-003. Este runbook porta esas defensas a un derivado que nació **antes** de ese epic.
> **Calibración de este runbook:** el derivado **(a)** NO verifica email hoy, **(b)** quiere conservar el self-registration **abierto** (con verificación), **(c)** ya tiene **usuarios reales en producción** → incluye construir el subsistema de verificación + los 4 gates + **grandfathering** para no bloquear a los usuarios existentes.
> **Stack asumido:** Next.js (App Router) + NextAuth v5 (Auth.js) + Drizzle + Postgres — el stack estándar de todo derivado.
>
> ✅ **Validado en producción:** este mismo retrofit ya se ejecutó en **mvpicks-v2** (derivado real), con el grandfathering aplicado. Las referencias `[mvpicks-v2]` a lo largo del doc apuntan a la implementación probada — el dev puede abrir ese repo como ejemplo vivo: `src/lib/auth/anti-revival.ts`, migraciones `0062`/`0063`, plan `robust-mixing-parasol`.
> **Disponible desde:** kit `v11.2.1`

---

## 0. TL;DR

|                           |                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug**                   | Con registro público sin verificación de email + OAuth (Google/GitHub) prendido, un atacante puede tomar la cuenta de una víctima.                                                                                                                                     |
| **Causa**                 | El registro crea cuentas **sin probar control del correo** y deja entrar; OAuth se mergea por email coincidente sin neutralizar el password plantado.                                                                                                                  |
| **Fix**                   | 4 capas: **D2** registro sin auto-login + verificación obligatoria · **D1** login gate (cuenta no verificada no entra) · **D2-provider** OAuth solo hereda verificación si el provider la confirma · **D3** wipe anti-revival del password plantado en el merge OAuth. |
| **Riesgo operacional #1** | Activar el gate D1 **sin grandfathering** bloquea a TODOS los usuarios reales existentes (hoy ninguno está "verificado"). El orden de rollout es parte del fix.                                                                                                        |
| **Esfuerzo**              | ~1–2 días para un dev con el agente. La mayor parte es **portar** archivos del kit, no inventar.                                                                                                                                                                       |
| **`src/` frozen**         | El derivado nació congelado; `factory update` **no** toca `src/`. Esto es un **retrofit manual** — leer el `auth.ts` del derivado y **adaptar**, no copiar a ciegas.                                                                                                   |

---

## 1. Modelo de amenaza — el ataque exacto

El vector vive en la combinación **registro abierto sin verificación** + **merge OAuth por email**. Dos variantes:

### Variante A — password plantado + merge OAuth (la grave)

1. El atacante registra `victima@gmail.com` con un password que **él** conoce. El sistema crea la fila, **no** verifica el correo, y (peor) puede dejarlo entrar.
2. Más tarde la víctima real llega y hace **"Iniciar sesión con Google"** con `victima@gmail.com`.
3. Un merge ingenuo vincula la identidad Google a la fila existente **conservando el password del atacante**.
4. Resultado: el atacante sigue pudiendo entrar con **password** a la cuenta que la víctima ahora usa → **account takeover persistente**.

### Variante B — login directo con cuenta plantada

- Sin gate de verificación, el atacante simplemente **loguea con el password que plantó**, antes incluso de que la víctima haga nada.

> El denominador común: el sistema trata "alguien escribió este email en un form" como prueba de identidad. No lo es. **La única prueba de control del correo** es: (a) clickear un link de verificación enviado a ese correo, (b) completar un reset de password enviado a ese correo, o (c) un OAuth provider que **afirma** `email_verified`.

---

## 2. Las defensas (lo que el kit implementa)

| ID          | Defensa                                    | Qué hace                                                                                                                                                                                                                                                                                                                                                         | Dónde vive en el kit                                                                                      |
| ----------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **D2-reg**  | Registro **sin auto-login** + verificación | `/api/auth/register` crea la cuenta con `email_verified = NULL`, **no** abre sesión, emite token + manda email de verificación, responde `{ success, needsVerification: true }`. Respuesta **idéntica** si el email ya existe (anti-enumeración) + avisa al dueño real out-of-band.                                                                              | `src/app/api/auth/register/route.ts`                                                                      |
| **D1**      | **Login gate**                             | El `authorize()` de credentials rechaza login si `!user.emailVerified` — **después** de validar el password (no filtra si la cuenta existe). Un password plantado en cuenta no verificada **nunca** loguea.                                                                                                                                                      | `src/lib/auth/auth.ts` → credentials `authorize()`                                                        |
| **D2-prov** | Herencia de verificación por provider      | OAuth nuevo solo hereda `emailVerified=now()` si el provider **confirma** el correo (Google `email_verified===true`; GitHub primary `verified===true`). Provider desconocido/no confirmado → queda no verificado (gateado por D1).                                                                                                                               | `providerConfirmsEmailVerified()` + `createUser` event                                                    |
| **D3**      | **Wipe anti-revival** en el merge          | Cuando un sign-in que **prueba ownership del email** (OAuth verificado **o magic-link**) coincide con una cuenta **no verificada + con password** (= plantada), antes del merge corre **una transacción**: `password=null`, `emailVerified=now()`, borra los `accounts` de tipo `credentials`. Si la transacción falla → **aborta el sign-in** (`return false`). | `signIn` callback; en [mvpicks-v2] la decisión se extrae a la función pura `src/lib/auth/anti-revival.ts` |
| **D-reset** | Reset de password verifica                 | Un reset exitoso prueba control del inbox → setea `emailVerified=now()` en la misma transacción que el password.                                                                                                                                                                                                                                                 | `src/lib/auth/password-reset.ts`                                                                          |

> Las tres variantes del §1 quedan cerradas: **A** por D3 (mata el password plantado en el merge), **B** por D1 (cuenta no verificada no loguea), y el "registro abre sesión" por D2-reg (no auto-login).

---

## 3. Pre-flight — auditar el derivado ANTES de tocar nada

El agente debe correr esto en el repo del derivado y reportar, **antes** de implementar:

```bash
# 1) ¿La columna de verificación existe? (la trae el adapter de Auth.js; casi siempre sí)
grep -rnE "emailVerified|email_verified" src/lib/db/schema/

# 2) ¿Existe ya una tabla de tokens de verificación de email? (probablemente NO)
grep -rnE "emailVerificationTokens|email_verification_tokens" src/lib/db/schema/

# 3) 🔴 P0 — versión de @auth/core. El timing del wipe D3 depende de esto.
grep -nE "@auth/core|next-auth" package.json
cat package.json | grep -A5 '"overrides"\|"pnpm"\|"resolutions"'

# 4) ¿Cuánto divergió el auth.ts del derivado respecto al kit?
wc -l src/lib/auth/auth.ts
grep -nE "async signIn|async authorize|callbacks|createUser" src/lib/auth/auth.ts

# 5) ¿Hay infra de email funcionando? (verificación NECESITA mandar correos)
grep -rnE "sendEmail|EMAIL_PROVIDER|RESEND_API_KEY" src/lib/email/ .env.example

# 6) Flags de registro y OAuth actuales
grep -rnE "registration|AUTH_GOOGLE|AUTH_GITHUB|AUTH_REGISTRATION" .env.local .env.example src/config/
```

### 🔴 Gate P0 — `@auth/core` pin + version-lock test

El wipe D3 depende de un **invariante de orden NO contractual** dentro de `@auth/core`: el `signIn` callback debe correr **antes** de que el adapter marque `emailVerified` en `handleLoginOrRegister` (el merge). Solo así `existingUser` refleja el estado **pre-merge** y D3 puede actuar sobre el password plantado. Ese orden está congelado por un **pin exacto** + un test que lo re-verifica.

- El **kit** pinea `@auth/core` a `0.41.0`. **[mvpicks-v2]** corre `0.41.1`. Lo que importa no es el número sino que sea **un pin exacto** (no `^`/`~`) + el guard de version-lock.

```jsonc
// package.json — pin EXACTO (override), no caret/tilde
"pnpm": {
  "overrides": {
    "@auth/core": "0.41.1"   // usa la versión que ya tenga el derivado, pero EXACTA
  }
}
```

> ⚠️ **Re-verifica el orden en CUALQUIER bump de `@auth/core`.** [mvpicks-v2] lo guarda con una **assertion de version-lock** dentro de `tests/unit/auth/anti-revival.test.ts` (falla el test si la versión instalada ≠ la pineada → te obliga a re-validar el orden antes de subir). Sin pin exacto + sin guard, un bump silencioso puede mover D3 a correr **post-merge** (con el password ya copiado) y dejar de proteger. El invariante aplica tanto a OAuth como a **magic-link**.

### Realidad del `src/` frozen + divergente

El `auth.ts` del derivado **no** es idéntico al del kit (nació en otra versión y pudo editarse). El agente debe **leer el `auth.ts` del derivado**, ubicar el callback `signIn`, el `authorize` de credentials y el event `createUser`, e **insertar** las defensas en los puntos correctos — no pegar el archivo del kit encima.

---

## 4. Inventario de archivos a portar desde el kit

> El kit es la **referencia canónica**. El dev tiene acceso al kit (este repo). Copiar-y-adaptar; los paths son idénticos en el derivado salvo divergencia.

| Pieza                                        | Archivo(s) del kit                                                                                                                                    | Acción en el derivado                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Schema tokens**                            | `src/lib/db/schema/users.ts` → `emailVerificationTokens` (≈L221) + `grandfathered_unverified` (tabla lateral del grandfather, §6)                     | Agregar las tablas + tipos. Migración (§5 paso 1).                   |
| **Subsistema verificación**                  | `src/lib/auth/email-verification.ts` (`createEmailVerificationToken`, `verifyEmailToken`, `sendVerificationEmail`, `resendVerification`, `hashToken`) | Portar completo. Depende de `sendEmail` (infra de email).            |
| **Email templates**                          | `src/lib/email/templates/*` (verificación, `registrationCollisionEmail`, `credentialsWipedEmail`)                                                     | Portar los 3 templates que el flujo usa.                             |
| **Register endpoint**                        | `src/app/api/auth/register/route.ts`                                                                                                                  | Reemplazar el del derivado por el shape secure-by-default.           |
| **D1 + D2-prov + D3 + email-verif provider** | `src/lib/auth/auth.ts` (+ `src/lib/auth/anti-revival.ts` función pura de D3 [mvpicks-v2])                                                             | **Insertar quirúrgico** en el `auth.ts` del derivado (no overwrite). |
| **D-reset**                                  | `src/lib/auth/password-reset.ts`                                                                                                                      | Agregar `emailVerified: new Date()` a la transacción del reset.      |
| **UI verify**                                | `src/app/(auth)/verify-email/page.tsx` + el estado `needsVerification` del RegisterForm                                                               | Portar la página + el branch de UI.                                  |
| **Config**                                   | `src/config/auth-features.ts`                                                                                                                         | Confirmar `registration` + `providers` por env flags.                |
| **Tests**                                    | `tests/unit/auth/login-gate.test.ts` + `tests/e2e/auth-takeover.spec.ts`                                                                              | Portar como plantilla de verificación (§6).                          |

---

## 5. Plan de implementación (orden topológico)

> Cada paso es commit atómico. Correr `pnpm typecheck && pnpm lint` entre pasos. **No** activar el gate D1 (paso 4) hasta haber hecho el backfill (paso 9) — ver el orden de rollout en §7.

### Paso 0 — Pin `@auth/core` 0.41.0

Alinear la versión con el kit (gate P0 del §3). Commit: `chore(deps): pin @auth/core to 0.41.0 for signIn pre-merge timing`.

### Paso 1 — DB: tabla `email_verification_tokens`

Agregar la tabla al schema (copiar de `users.ts` del kit) y **generar migración** — nunca `db:push` en un derivado (usa `db:migrate`, regla del kit BR-FACTORY-005 / SK.md §1.1):

```bash
pnpm db:generate   # revisar el .sql generado
pnpm db:migrate
```

### Paso 2 — Subsistema de verificación de email

Portar `src/lib/auth/email-verification.ts` + los templates de email. Verificar que `sendEmail` funcione en el derivado (Resend/SMTP). Sin email operativo, la verificación no se puede completar → **bloqueante**.

### Paso 3 — Register endpoint secure-by-default

Reemplazar `/api/auth/register` por el patrón del kit. Propiedades no negociables:

- **No auto-login** — el cliente nunca llama `signIn()` tras registrar.
- Crea con `email_verified = NULL` + emite token + manda email.
- Responde `{ success: true, needsVerification: true }` **idéntico** si el email ya existe (anti-enumeración) + notifica al dueño real (rate-limited).
- Rate-limit por IP (bucket `register`).

### Paso 4 — D1 login gate (⚠️ activar solo tras backfill)

En el `authorize()` del provider credentials, **después** del `verifyPassword`:

```ts
// authorize() — el orden importa: bail por password ANTES, gate de verificación DESPUÉS
const user = await db.query.users.findFirst({ where: eq(users.email, email) });
if (!user || !user.password) return null; // sin password → no hay nada que comparar (post-wipe incluido)

const isValid = await verifyPassword(password, user.password);
if (!isValid) return null;

if (user.deletedAt) throw new Error('AccountDisabled');

// ── Login Gate (D1 / SEC-002) ──
// Rechaza login de cuentas no verificadas. DESPUÉS de verifyPassword para no
// filtrar "existe pero sin verificar" vs "password incorrecto". null = mismo
// signal que credenciales malas.
if (!user.emailVerified) {
  logger.warn(`[Auth] login blocked for unverified account ${email}`);
  return null;
}

return { id: user.id, email: user.email, name: user.name, role: user.role };
```

> El `if (!user.password) return null` de arriba es también lo que hace que, **post-wipe D3** (password=NULL), el password plantado del atacante ya no pueda compararse → falla limpio (Scenario 4 del e2e).

### Paso 5 — D2-provider: herencia de verificación

Portar `providerConfirmsEmailVerified()` (función pura, corta y crítica — copiar textual):

```ts
export function providerConfirmsEmailVerified(
  provider: string | undefined,
  profile: Profile | undefined | null
): boolean {
  if (!provider || !profile) return false;
  if (provider === 'google') {
    return (profile as { email_verified?: unknown }).email_verified === true; // estricto === true
  }
  if (provider === 'github') {
    const primaryEmail = (profile as { email?: string }).email;
    const emails = (profile as { emails?: Array<{ email?: string; verified?: unknown }> }).emails;
    if (!Array.isArray(emails) || emails.length === 0) return false; // sin scope → conservador
    const row = emails.find((e) => e.email && e.email === primaryEmail) ?? emails[0];
    return row?.verified === true;
  }
  return false; // provider desconocido → nunca hereda verificación
}
```

Conectar el **bridge request-scoped** (`pendingEmailVerified` Map): el `signIn` callback registra la decisión por email; el `createUser` event la aplica (`emailVerified=now()` solo si el provider confirmó). Copiar ambos bloques del kit (`signIn` ≈L857 y `createUser` ≈L1011).

### Paso 6 — D3 anti-revival wipe (el corazón)

Recomendado [mvpicks-v2]: extraer la **decisión** a una función pura testeable y aplicarla en el callback (separa lógica de I/O):

```ts
// src/lib/auth/anti-revival.ts — pura, unit-testeable aislada
export function antiRevivalUpdates(existingUser: {
  password: string | null;
  emailVerified: Date | null;
}): { password: null; emailVerified: Date } | undefined {
  if (existingUser.password && !existingUser.emailVerified) {
    return { password: null, emailVerified: new Date() }; // password sin verificar = posible plantado
  }
  return undefined;
}
```

En el `signIn` callback, dentro del branch `if (existingUser)` para sign-ins que prueban ownership del email (OAuth verificado / magic-link), **antes** de cualquier otra lógica de merge:

```ts
// ── Anti-revival on OAuth merge (D3 / SEC-002) ──
// Corre ANTES del merge (@auth/core 0.41.0): existingUser refleja el estado pre-merge.
// Cuenta no verificada + con password = password casi seguro plantado por un atacante
// (el dueño legítimo es quien ahora prueba control vía el OAuth verificado).
if (!existingUser.emailVerified && existingUser.password) {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ password: null, emailVerified: new Date() })
        .where(eq(users.id, existingUser.id));
      await tx
        .delete(accounts)
        .where(and(eq(accounts.userId, existingUser.id), eq(accounts.type, 'credentials')));
    });
    logger.warn(`[Auth] anti-revival: wiped planted credentials for ${user.email}`);
    // (opcional pero recomendado) avisar al usuario que se removió su password — best-effort
  } catch (error) {
    // Si el wipe falla, el merge reviviría el password del atacante → abortar el login.
    logger.error('[Auth] anti-revival wipe failed — aborting sign-in', { error });
    return false;
  }
}
```

> Detalles que **no** se pueden omitir: (1) es **una** transacción (parcial = inseguro); (2) en error → `return false` (abortar, no continuar); (3) corre **antes** del merge (de ahí el gate P0 del pin).

### Paso 7 — D-reset: el reset verifica

En `resetPassword` (`password-reset.ts`), agregar a la transacción del update:

```ts
await tx
  .update(users)
  .set({
    password: hashedPassword,
    emailVerified: new Date(), // ← un reset prueba control del inbox → verifica
    modifiedAt: new Date(),
  })
  .where(eq(users.id, validation.userId!));
```

> Sin esto, un usuario que hace reset quedaría con password nuevo pero `emailVerified=NULL` → el gate D1 lo dejaría fuera (lockout). Las dos escrituras **nunca** deben divergir.

### Paso 8 — UI

- Página `verify-email` (consume el token: `signIn('email-verification', { token })` → marca verificado + abre sesión). Portar de `src/app/(auth)/verify-email/page.tsx`.
- RegisterForm: tras un registro `needsVerification`, mostrar el estado "revisa tu correo" + botón **Reenviar** (llama `resendVerification`). **No** redirigir a dashboard.

---

## 6. Grandfathering de usuarios existentes (🔴 sin esto hay lockout masivo)

**Problema:** hoy ninguna cuenta del derivado tiene `email_verified` seteado. En el momento que actives D1 (paso 4), **todos** los usuarios legítimos quedan bloqueados en su próximo login con password.

### El approach que se usó en producción [mvpicks-v2]

mvpicks-v2 lo resolvió con **"riesgo aceptado"** (plan `robust-mixing-parasol §riesgo aceptado + Estrategia M`): en vez de **adivinar** quién es legítimo vs plantado (que es frágil y puede bloquear a usuarios reales), marca a **todos** los existentes como verificados — **cero lockout garantizado** — pero **preserva la señal** de quién estaba sin verificar en una **tabla lateral**, para poder ejecutar el fallback (verificar selectivamente / forzar reset) si más adelante aparece abuso. Dos migraciones:

**Migración A — tabla lateral** (DDL, vía `db:generate`):

```sql
CREATE TABLE "grandfathered_unverified" (
  "user_id"     uuid PRIMARY KEY NOT NULL,
  "snapshot_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

**Migración B — data migration one-time, DOS pasos en orden** (DML aditiva — `db:generate --custom`, nunca a mano fuera del tooling; ver SK.md §1.2):

```sql
-- (1) SNAPSHOT primero: registra a TODOS los no-verificados AHORA, ANTES de que el
--     grandfather borre esa señal. Esta tabla lateral conserva el fallback de
--     riesgo-aceptado (verificar selectivo / forzar reset) ejecutable desde SQL si
--     aparece abuso. ON CONFLICT DO NOTHING = idempotente.
INSERT INTO "grandfathered_unverified" ("user_id", "snapshot_at")
SELECT "id", now() FROM "users" WHERE "email_verified" IS NULL
ON CONFLICT ("user_id") DO NOTHING;

-- (2) GRANDFATHER: marca verificado a todo usuario existente para que el nuevo
--     gate D1 NO bloquee a la base actual. Solo toca los NULL.
UPDATE "users" SET "email_verified" = now() WHERE "email_verified" IS NULL;
```

> **Por qué el SNAPSHOT antes del UPDATE es el truco:** una vez que el paso (2) marca a todos verificados, ya no puedes distinguir quién era sospechoso (no-verificado + con password) de quién era legítimo — la señal se pierde. El paso (1) la congela primero. Si nunca aparece abuso, la tabla lateral simplemente queda como rastro forense; si aparece, tienes la lista exacta para actuar (forzar reset a ese subconjunto, etc.) sin haber bloqueado a nadie en el ínterin.

### Fallback ejecutable (si aparece abuso después)

Contra la tabla lateral, en cualquier momento puedes endurecer a posteriori sin haber roto a la base:

```sql
-- Forzar re-verificación SOLO de los que estaban sin verificar al corte y que NUNCA
-- probaron ownership después (sin OAuth vinculado, sin reset). Ajusta el criterio.
UPDATE users SET email_verified = NULL
WHERE id IN (SELECT user_id FROM grandfathered_unverified)
  AND id NOT IN (SELECT user_id FROM accounts WHERE type <> 'credentials');
-- → esos quedan gateados por D1; recuperan legítimamente con "olvidé mi contraseña"
--   (D-reset los verifica). Las plantadas mueren ahí.
```

### Alternativa más estricta (si NO aceptas el riesgo)

Si prefieres cerrar retroactivamente desde el día uno en vez de grandfatherear todo, marca verificadas **solo** las cuentas con señal de legitimidad y deja al resto gateado:

```sql
-- Solo cuentas con un OAuth ya vinculado (el provider probó el email en su momento).
UPDATE users SET email_verified = now()
WHERE email_verified IS NULL
  AND id IN (SELECT user_id FROM accounts WHERE type <> 'credentials');
```

Trade-off: más seguro, pero **bloquea** a cualquier usuario legítimo que solo usaba password (deberán pasar por "olvidé mi contraseña"). mvpicks-v2 **no** eligió esto — priorizó cero-lockout + señal preservada. Decisión de producto con el dueño.

> **Comunicación recomendada** (cualquiera de los dos caminos): avisar por email "reforzamos la seguridad de acceso; si no puedes entrar, usa 'olvidé mi contraseña'".

---

## 7. Orden de rollout (cero-lockout)

El orden importa tanto como el código:

1. **Deploy** pasos 0–3 + 5–8 (todo **menos** activar D1) + el **grandfathering** (paso 6) en la misma release. En este punto: registro ya es seguro, OAuth hereda bien, D3 protege el merge, y los usuarios existentes quedan verificados — **pero credenciales no-verificadas todavía pueden entrar** (D1 off).
2. **Verificar** en prod: que los usuarios reales siguen entrando, que el registro nuevo manda email y exige verificar, que OAuth funciona.
3. **Activar D1** (paso 4) en una segunda release (o detrás de un flag que flipeas). Desde aquí, cuenta no verificada **no** entra con password.
4. **Monitorear** logs `login blocked for unverified account` los primeros días — distinguir atacantes (esperado) de legítimos que se escaparon del backfill (mandar a reset).

> Si prefieres una sola release: corre el grandfathering (paso 6) **dentro** de la misma migración que precede al deploy del código con D1 activo. Lo inseguro es activar D1 **antes** del grandfathering.

---

## 8. Tests (la prueba de que cerró)

Portar como plantilla:

### Unit — ramas de decisión del wipe D3

- `tests/unit/auth/login-gate.test.ts` — 4 ramas: wipe (no verificado + password) · verified-no-wipe · no-password-no-wipe · tx-falla → aborta. Cubre las **decisiones** del callback sin un OAuth real.
- `tests/unit/auth/anti-revival.test.ts` [mvpicks-v2] — testea la función pura `antiRevivalUpdates` + incluye la **assertion de version-lock** de `@auth/core` (gate P0 del §3): falla si la versión instalada se movió respecto al pin → te obliga a re-verificar el orden pre-merge.

### E2E — `tests/e2e/auth-takeover.spec.ts` (4 escenarios)

- **Scenario 1** — registrar **no** abre sesión (`needsVerification` + sin cookie + fila no verificada).
- **Scenario 2** — login con credenciales plantadas **falla** (D1, `email_verified IS NULL`).
- **Scenario 3** — invariante post-merge: `password IS NULL`, `accounts` credentials borrados, `email_verified` seteado (reproduce la misma transacción del wipe).
- **Scenario 4** — post-wipe, el password original del atacante **ya no loguea**.

> El e2e no maneja un round-trip real de Google (frágil): reproduce el estado post-merge vía la misma transacción Drizzle y asierta el invariante. El unit cubre las ramas de decisión. Juntos prueban el invariante end-to-end por la superficie real de login.

### DoD del fix

```bash
pnpm typecheck && pnpm lint && pnpm test        # unit/component verdes
pnpm test:e2e                                    # auth-takeover.spec verde (4/4)
```

- checklist manual: registrar cuenta nueva → llega email → no entro hasta verificar; login con cuenta no verificada → rechazado; (staging) plantar password + entrar con Google → password queda NULL.

---

## 9. Gotchas / riesgos

| Riesgo                                | Mitigación                                                                                                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Timing de `@auth/core`**            | Pin **exacto** + assertion de version-lock (gate P0). Sin esto un bump puede mover D3 a post-merge y no proteger.                                                                                                                                              |
| **`src/` frozen y divergente**        | Insertar quirúrgico en el `auth.ts` del derivado; no overwrite. Leer el callback real primero.                                                                                                                                                                 |
| **Email no operativo**                | La verificación **requiere** mandar correos. Validar Resend/SMTP antes del paso 3.                                                                                                                                                                             |
| **Lockout masivo**                    | Grandfathering **antes** de activar D1 (§7). Es el riesgo #1.                                                                                                                                                                                                  |
| **Cuentas plantadas pre-existentes**  | Snapshot en `grandfathered_unverified` **antes** del `UPDATE` total (§6) → señal preservada + fallback ejecutable.                                                                                                                                             |
| **Anti-enumeración**                  | El register debe responder **idéntico** exista o no el email. No "agregar" un mensaje de "ya existe".                                                                                                                                                          |
| **Rate-limit**                        | Portar los buckets `register` / `auth` / `verifyEmail` o el atacante brute-forcea / email-bombea.                                                                                                                                                              |
| **OAuth linking desde sesión activa** | Si el derivado deja **vincular** un 2º provider estando logueado, hay gates extra (conflicto de identidad / step-up anti-CSRF / provider-email-verified) en el mismo `signIn` callback del kit (IDENT-002). Fuera del takeover básico, pero revisar si aplica. |

## 10. Rollback

- D1 (paso 4) es el único cambio "que bloquea": detrás de un flag, flipear off restaura el login previo al instante (deja D2/D3 puestos — siguen siendo seguros).
- El wipe D3 es irreversible por diseño (destruye el password plantado); no necesita rollback — es el comportamiento deseado.
- La migración de la tabla de tokens es aditiva (no destructiva).

---

_Runbook de remediación — Account Takeover en derivado (self-registration + OAuth). Basado en EPIC-02 / SEC-001/002/003 del TimeKast Factory._

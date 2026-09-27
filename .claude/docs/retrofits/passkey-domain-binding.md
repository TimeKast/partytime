# Runbook — Passkeys conscientes del dominio en un derivado (y el lockout que cierran)

> **Retrofit shipped** (`.claude/docs/retrofits/`) — aplica a **todo derivado cuyo `src/` nació antes de que el kit registrara el dominio de cada passkey**. Si tu `src/lib/db/schema/passkey-credentials.ts` ya tiene la columna `rp_id`, **no te aplica**.
>
> **Audience:** el equipo (o el agente) de una app derivada del TimeKast Factory. Esta guía se basta sola — no hace falta leer el kit para ejecutarla; ese es su criterio de éxito.
>
> **Date:** 2026-09-08
> **Origin:** factory-ticket `sk-bug-2026-08-26` de un derivado en producción. Contrato vivo: [`sk-mfa §2.1/§2.2`](../../skills/sk-mfa/SKILL.md).
>
> **Costo de aplicarlo:** ~2–4 horas con el agente. Una migración aditiva, dos funciones nuevas, y ediciones acotadas en cuatro archivos. Casi todo es **portar**, no inventar.
> **Disponible desde:** kit `v12.2.0`
>
> 🔴 **`src/` frozen:** tu proyecto nació congelado y `factory update` **nunca** toca `src/` (BR-FACTORY-006). Nada de esto te llegó por el update — solo llegó la documentación. Esto es un retrofit **manual**: lee tu propio `auth.ts` y **adapta**, no copies a ciegas.

---

## 0. TL;DR

|                           |                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug**                   | Un usuario pasa el primer factor, se le exige el segundo, y el único que se le ofrece es una passkey de OTRO dominio — criptográficamente imposible ahí. No hay salida dentro de la app. |
| **Causa**                 | `passkey_credentials` no guarda a qué dominio pertenece cada credencial, así que nada puede distinguir una passkey usable de una muerta.                                               |
| **Fix**                   | Registrar el dominio (`rp_id`) y **partir en dos** la pregunta que lo consume: "¿le exijo un factor?" (cuenta todo) vs "¿ya cumplió?" (cuenta solo lo usable aquí).                    |
| **Riesgo operacional #1** | Filtrar por dominio la pregunta equivocada es un **downgrade de seguridad**: deja entrar con pura contraseña a quien debía 2FA. Ver §4 — es el punto entero del retrofit.              |
| **Backfill**              | Ninguno. Las filas existentes quedan en `NULL` (= dominio desconocido) y se auto-adoptan al usarse. No se inventa procedencia.                                                          |
| **Downtime**              | Cero. La migración es aditiva y nullable.                                                                                                                                              |

---

## 1. ¿Te aplica? — detección en un solo bloque

Corre esto antes que nada. Si las tres respuestas son las de la columna "te aplica", sigue leyendo.

```bash
# 1. ¿Tu schema ya registra el dominio?           te aplica: sin salida
grep -n "rp_id\|rpId" src/lib/db/schema/passkey-credentials.ts

# 2. ¿Tu inventario de factores filtra por dominio? te aplica: sin salida
grep -n "userHasUsableMfaFactor" src/lib/auth/auth.ts

# 3. ¿Tu /2fa ofrece toda passkey sin filtrar?      te aplica: SÍ hay salida
grep -n "passkeyCredentials.userId" "src/app/(auth)/2fa/page.tsx"
```

**Y si quieres saber si ya te mordió**, sin adivinar — passkeys que no sirven en tu dominio actual:

```bash
pnpm db:query "SELECT u.email, p.created_at, p.name
               FROM passkey_credentials p JOIN users u ON u.id = p.user_id
               ORDER BY p.created_at DESC"
```

Hoy esa consulta **no puede** decirte cuál sirve — ese es justamente el bug. Lo que sí revela: usuarios con passkey creada cuando tu app corría en otro host (localhost durante el desarrollo, un dominio previo, un preview que compartía la base). Cruza las fechas con tu historial de dominios. Después del retrofit, `rp_id` te lo responde de una.

> ⚠️ **El caso más común no es multi-dominio, es el desarrollo normal.** Un dev enrola su passkey en `localhost` contra la base de develop; esa fila cuenta como factor para siempre, en todos los ambientes que comparten esa base.

---

## 2. Qué vas a cambiar

| Archivo                                    | Cambio                                                       |
| ------------------------------------------ | ------------------------------------------------------------ |
| `src/lib/db/schema/passkey-credentials.ts` | columna `rp_id` nullable                                     |
| `src/lib/auth/webauthn.ts`                 | `verifyRegistration` devuelve el rpID que verificó           |
| `src/lib/auth/passkey.ts`                  | persiste el rpID · lo adopta al autenticar · predicado + tipo |
| `src/lib/auth/auth.ts`                     | `userHasUsableMfaFactor` + rutear el gate enforce-all         |
| `src/app/(auth)/2fa/page.tsx`              | ofrecer solo lo usable · señalar el estado degradado          |
| `src/components/auth/TwoFactorForm.tsx`    | copy que distingue "no tienes" de "no sirve aquí"            |
| `src/components/auth/PasskeysList.tsx`     | mostrar el dominio · marcar las inservibles                   |
| `src/lib/auth/access-methods.ts`           | contar solo passkeys usables                                 |

Los §3–§7 van en orden de dependencia. **Nada rompe hasta el §5**, así que puedes hacerlos por partes.

---

## 3. La migración (aditiva, sin backfill)

En tu schema, junto a `credentialId`:

```ts
/**
 * El rpID (dominio) al que la credencial está atada — el único donde funciona.
 * NULLABLE a propósito: las filas previas no tienen procedencia recuperable, y
 * adivinarla sería peor que no saberla (estampar una passkey muerta como viva es
 * el lockout que esta columna cierra). Null = "dominio desconocido".
 */
rpId: text('rp_id'),
```

```bash
pnpm db:generate     # revisa el SQL: debe ser un solo ALTER TABLE ... ADD COLUMN
pnpm db:migrate
```

🔴 **No hagas backfill.** La tentación es estampar tu dominio actual en todas las filas. Si tu app cambió de host alguna vez, eso marca como vivas passkeys que están muertas — y reintroduce exactamente el lockout. El `NULL` es información correcta: "no sé". El §6 las adopta solas cuando demuestran que sí pertenecen aquí.

---

## 4. 🔴 El corazón — dos preguntas que NO son la misma

Tu `auth.ts` tiene hoy una sola función, `userHasMfaEnabled`, y **tres** consumidores la usan. Quieren cosas opuestas:

| Pregunta                              | Quién la hace              | Qué le conviene contar        |
| ------------------------------------- | -------------------------- | ----------------------------- |
| ¿Le **exijo** un segundo factor?      | `pendingMfa` (2FA-on-login) | **Todo** — si dudo, exijo     |
| ¿Ya **cumplió** con tener uno?        | `mfaEnrollmentRequired`     | Solo lo que sirve **aquí**    |
| ¿Qué le **ofrezco**?                  | `/2fa`                      | Solo lo ofrecible; si no, degradar |

**Deja `userHasMfaEnabled` exactamente como está** y agrega la hermana estrecha:

```ts
export async function userHasUsableMfaFactor(userId: string): Promise<boolean> {
  const confirmedTotp = await db.query.totpSecrets.findFirst({
    where: and(eq(totpSecrets.userId, userId), isNotNull(totpSecrets.confirmedAt)),
    columns: { id: true },
  });
  if (confirmedTotp) return true; // TOTP es un secreto compartido: no está atado a ningún origen

  const passkey = await db.query.passkeyCredentials.findFirst({
    where: and(eq(passkeyCredentials.userId, userId), eq(passkeyCredentials.rpId, getRpId())),
    columns: { id: true },
  });
  return !!passkey;
}
```

Y enrútala **solo** en el gate de enrolamiento — en tus **dos** call sites si tu `auth.ts` tiene la revalidación por intervalo (busca `mfaEnrollmentRequired` y cámbialos todos):

```ts
token.mfaEnrollmentRequired =
  mfaMandatoryForRole(token.role ?? '') && !(await userHasUsableMfaFactor(token.id as string));
```

> 🔴 **El error que debes NO cometer.** El instinto es filtrar por dominio dentro de `userHasMfaEnabled` y acabar. Eso arregla el enrolamiento y **rompe el anti-downgrade**: un usuario cuya única passkey es de otro dominio dejaría de deber segundo factor y entraría con la contraseña sola. Contar de más en "¿le exijo?" solo pide más pruebas — es el lado seguro. Contar de más en "¿ya cumplió?" es lo que encierra a la gente.

---

## 5. Persistir el dominio al registrar

En `webauthn.ts`, captura el rpID **antes** de verificar y devuélvelo, para que lo verificado y lo guardado no puedan divergir:

```ts
const rpId = getRpId();
// ...usa `rpId` como expectedRPID y agrégalo al objeto que retornas
```

En `passkey.ts#registerPasskey`, insértalo:

```ts
await db.insert(passkeyCredentials).values({
  // ...
  rpId: verified.rpId, // del resultado de la verificación, nunca re-derivado
});
```

A partir de aquí toda passkey nueva nace con procedencia.

---

## 6. Adopción de las filas viejas (esto reemplaza al backfill)

En `passkey.ts#verifyPasskeyAuthentication`, donde ya avanzas el counter tras una verificación **exitosa**:

```ts
.set({
  counter: result.newCounter,
  lastUsedAt: new Date(),
  ...(row.rpId === null ? { rpId: getRpId() } : {}),
})
```

Una aserción exitosa **prueba** que la credencial pertenece a este rpID — es el único momento en que el valor se puede escribir sin suponerlo. Una passkey viva se re-clasifica sola la primera vez que se usa; una muerta nunca llega a esa línea y se queda en desconocido, que es justo lo que quieres.

Agrega también el predicado compartido, que usarán §7 y §8:

```ts
export function isPasskeyUsableHere(rpId: string | null): boolean {
  return rpId !== null && rpId === getRpId();
}
```

---

## 7. `/2fa` — ofrecer lo que puede funcionar, y degradar sin abrir la puerta

En la página, reemplaza el `findFirst` de passkeys por un `findMany` sobre `rpId` y deriva **tres** estados:

```ts
const passkeys = await db.query.passkeyCredentials.findMany({
  where: eq(passkeyCredentials.userId, userId),
  columns: { rpId: true },
});
// Las NULL SÍ se ofrecen: pueden ser de aquí, y si lo son el §6 las adopta.
const hasPasskey = passkeys.some((p) => p.rpId === null || isPasskeyUsableHere(p.rpId));
const hasUnusableFactorOnly = !hasTotp && !hasPasskey && passkeys.length > 0;
```

En `TwoFactorForm`, ese tercer estado necesita copy propio (*"tu passkey está registrada en otro dominio…"*), debe caer al **código de recuperación**, y tu `noMethod` tiene que excluirlo — si no, el usuario ve "no tienes método" siendo que sí tiene uno, y tiene razón en no creerte.

> 🔴 **Nunca degrades a "enrola un factor aquí".** Es la salida que parece obvia y es un bypass total del 2FA: el enrolamiento correría **antes** de probar el segundo factor, así que a cualquiera con la contraseña robada le bastaría enrolar el suyo. La degradación honesta es explicar + código de recuperación + cerrar sesión.

---

## 8. La lista auditable y el guard de métodos

`getUserPasskeys` devuelve `rpId` y un `usableHere` derivado en el servidor; `PasskeysList` muestra el dominio por fila (o "Dominio desconocido") y marca las que no sirven **sin esconderlas** — solo una fila visible se puede auditar o borrar.

Y no olvides `countAccessMethods` (`access-methods.ts`): hoy cuenta toda passkey como método de acceso. Si lo dejas así, el guard de "último método" **impedirá borrar justo la inservible**, y el usuario queda con una credencial que no puede usar ni quitar, protegida por un guard cuyo propósito es que pueda entrar. Fíltralo por `rp_id` igual que el resto.

---

## 9. Related Origin Requests — OPCIONAL, y solo si tienes varios dominios

Los §3–§8 cierran el lockout. Esto es otra cosa: que **una** passkey sirva en varios dominios del proyecto, en vez de una por dominio.

El mecanismo es más angosto de lo que suena, y asumir la versión amplia es la trampa: **una ceremonia usa exactamente un rpID y la credencial queda atada a ese uno**. Lo que se ensancha es el conjunto de **orígenes** que pueden correr una ceremonia para él. Por eso el filtro del §4 sigue siendo una comparación de un solo valor.

```
🔴 El rpID se elige UNA VEZ, al nacer el proyecto, y no se cambia jamás.
   Un dominio que llega después entra como ORIGEN, nunca como rpID nuevo:
   cambiar el rpID mata TODAS las passkeys ya enroladas.
```

Piezas: la env `WEBAUTHN_RELATED_ORIGINS` (orígenes con esquema, separados por coma) y una ruta que sirva `{"origins": [...]}` en `/.well-known/webauthn` con `content-type: application/json` y **200 directo** — varios navegadores no siguen redirect ahí. `getExpectedOrigin()` debe devolver el conjunto completo, o una ceremonia desde un origen relacionado falla exactamente donde ROR prometía funcionar.

⚠️ **Next ignora los directorios de `app/` que empiezan con punto.** Una ruta en `app/.well-known/` **no se registra** — sin error y sin warning, simplemente no está en la tabla de rutas. Ponla en `app/well-known/webauthn/route.ts` y agrega un `rewrite` en `next.config.ts` desde `/.well-known/webauthn`. Ese rewrite es load-bearing y silencioso: si falta, nada falla localmente y ningún origen relacionado funciona.

⚠️ **Límite duro de 5 labels** (el eTLD+1 sin sufijo: `example.co.uk` y `example.de` comparten `example` y cuestan uno; dos dominios de marcas distintas cuestan dos). El navegador descarta los excedentes **en silencio**. Es anti-abuso deliberado: un solo rpID nunca puede cubrir una flota entera de dominios ajenos.

---

## 10. Verificación

```bash
pnpm verify        # lint + typecheck + tests
```

Tests que vale la pena escribir (los del kit cubren estos casos y puedes calcarlos):

- `userHasMfaEnabled` **no** cambió de comportamiento — es la regresión que protege el anti-downgrade.
- Una passkey de otro dominio: `userHasMfaEnabled` → `true`, `userHasUsableMfaFactor` → `false`.
- Adopción: estampa si es `null` y la aserción tuvo éxito; **no** estampa si falló; nunca reescribe un valor ya presente.
- `/2fa` en el estado degradado: copy correcto, recovery presente, y **ninguna** vía de enrolamiento.

**Lo que ningún test cubre:** que una passkey enrolada en un dominio autentique en el otro (§9). Esa ceremonia la corre el navegador. Pruébala a mano con los dos hosts apuntando al mismo deployment antes de darla por buena.

---

## 11. Orden de despliegue

1. **§3** (migración) — sola, sin código nuevo. Aditiva; no cambia comportamiento.
2. **§5 + §6** (persistir + adoptar) — a partir de aquí las passkeys nuevas nacen con dominio y las viejas se van adoptando conforme la gente entra. **Déjalo correr unos días**: cuanto más rodaje, menos filas quedan en `NULL` cuando llegues al paso 3.
3. **§4 + §7 + §8** (el filtro y las pantallas) — es el paso que **empieza a excluir** passkeys. Antes de subirlo, mide qué tan grande es el corte:

   ```bash
   pnpm db:query "SELECT COALESCE(rp_id,'(desconocido)') AS dominio, COUNT(*)
                  FROM passkey_credentials GROUP BY 1 ORDER BY 2 DESC"
   ```

   Un bloque grande en `(desconocido)` significa que esos usuarios aún no han entrado desde el paso 2. No los excluye de poder entrar (`/2fa` sigue ofreciendo las `NULL`, §7), pero sí les levantará el gate de enrolamiento si su rol exige factor. Si el número te incomoda, deja correr el paso 2 más tiempo.

4. **§9** (ROR) — cuando quieras, o nunca si tienes un solo dominio.

---

_TimeKast Factory — retrofit: passkeys conscientes del dominio_

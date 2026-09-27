# Migration brief — normaliza a ASCII el namespace de tus cookies de auth

> **Aplica si:** tu `NEXT_PUBLIC_APP_NAME` contiene **cualquier** carácter fuera del alfabeto `token` de RFC 7230 (`A-Z a-z 0-9` más `! # $ % & ' * + - . ^ _ \` | ~`). Eso incluye acentos y la ñ, pero **también** puntuación común sin ningún acento — `:` `/` `(` `)` `,` `;` `=` `@` y similares. Si tu marca es un nombre simple sin esos caracteres (`"Aditivo CRM"`, `"MyApp"`), no tienes nada que hacer.
>
> **Cuesta:** editar 2-3 archivos de tu `src/`+`tests/` ya congelado (nace contigo — `CORE.md §5`, este fix nunca te llega solo con `factory update`) y aceptar que las sesiones activas de tus usuarios se invalidan una vez, al desplegar.
>
> **Disponible desde:** kit `v12.1.0`.

---

## 1. Qué se arregla

El kit deriva el namespace que comparten las **tres** cookies de autenticación (sesión, CSRF, callback URL) de `NEXT_PUBLIC_APP_NAME`, con una normalización naive: minúsculas + espacios a guión. Todo lo demás — acentos, ñ, y cualquier signo de puntuación — pasaba tal cual al nombre de la cookie.

Un nombre de cookie con esos caracteres es **inválido**: el navegador y el servidor pueden fallar en fijarlo o leerlo de forma silenciosa o inconsistente según el runtime. Con una marca como `"Añejo Cápital"` las tres cookies quedaban rotas — no solo la de sesión. Sin un `csrf-token` válido, el login por credenciales fallaba aunque nadie hubiera tocado nada relacionado a sesiones.

El kit ahora deriva ese namespace con `deriveCookieNamespace()` (`src/lib/auth/auth.config.ts`), que filtra directamente contra el alfabeto `token` de RFC 7230 — no contra una lista de acentos. Tu proyecto nació ANTES de este fix, así que tu `src/` congelado sigue trayendo la derivación vieja hasta que apliques esta guía a mano.

---

## 2. Phase 0 — ¿me aplica?

🔴 **No la respondas mirando solo tildes.** La pregunta correcta es sobre el **alfabeto**, no los diacríticos: un `NEXT_PUBLIC_APP_NAME` como `"Aditivo: CRM"` no tiene un solo acento y hoy produce las tres cookies inválidas igual. Si tu guía de detección solo hablara de tildes, un equipo en esa situación concluiría "no me aplica" estando roto.

Corre esto contra tu valor real:

```bash
grep '^NEXT_PUBLIC_APP_NAME' .env.local
```

El alfabeto permitido es:

```
a-z A-Z 0-9  y  ! # $ % & ' * + - . ^ _ ` | ~
```

🔴 **No lo compares a ojo — corre el script.** Hay caracteres que se ven idénticos a uno permitido y no lo son: el apóstrofo tipográfico `’` (U+2019, lo que escribe macOS al teclear `'` en `"Joe's"`) es indistinguible del `'` permitido, y un espacio de ancho cero (U+200B, que se cuela al copiar de un documento o de una página) es literalmente invisible y **no** cuenta como espacio para el reemplazo del kit, así que sobrevive dentro del nombre de la cookie. Una revisión visual da "no me aplica" en los dos casos, estando roto.

> ℹ️ Un espacio duro (U+00A0) **no** es de esos: sí cuenta como espacio en JavaScript, así que el kit lo colapsa a guión igual que un espacio normal. Se ve raro y deriva bien — no rotes tu nombre por él.

Guarda esto como `check-cookie-name.mjs` en la raíz de tu proyecto y córrelo con `node check-cookie-name.mjs`:

```js
import { readFileSync } from 'node:fs';

let contents;
try {
  contents = readFileSync('.env.local', 'utf8');
} catch {
  console.log('>>> NO PUEDO CONCLUIR: no encontré .env.local en este directorio.');
  console.log('    Córrelo en la raíz del proyecto, o revisa el valor en tu panel de deploy.');
  process.exit(1);
}

// findLast, no find: si la clave está repetida, dotenv se queda con la ÚLTIMA.
// Tomar la primera haría que este script juzgue un valor que la app no usa.
const line = contents
  .split('\n')
  .map((l) => l.replace(/^\s*export\s+/, '')) // `export FOO=bar` también es válido
  .findLast((l) => l.startsWith('NEXT_PUBLIC_APP_NAME='));

if (!line) {
  console.log('>>> NO PUEDO CONCLUIR: .env.local no define NEXT_PUBLIC_APP_NAME.');
  console.log('    Esto NO significa "no me aplica". Las NEXT_PUBLIC_* se inlinean en el BUILD,');
  console.log('    así que el valor que gobierna producción puede estar sólo en tu panel de');
  console.log('    deploy (Vercel). Busca el valor ahí y evalúalo con este mismo script.');
  process.exit(1);
}

// Parsear como dotenv: si el valor viene entre comillas, se toma hasta la comilla
// de cierre y lo que siga es comentario; si no, un ` #` abre comentario.
// Sin esto, `NEXT_PUBLIC_APP_NAME="Acme"  # marca` se lee como `Acme"  # marca` y
// el script grita "TE APLICA" sobre un nombre sano — mandando a alguien a rotar
// su namespace, que es justo el logout masivo que esta guía existe para evitar.
const raw = line.slice('NEXT_PUBLIC_APP_NAME='.length).trim();
const quoted = raw.match(/^(['"])(.*?)\1/);
const name = quoted ? quoted[2] : raw.split(/\s+#/)[0].trim();
const derived = name.toLowerCase().replace(/\s+/g, '-');
const bad = [...derived].filter((c) => !/[a-z0-9!#$%&'*+\-.^_`|~]/.test(c));

console.log(`NEXT_PUBLIC_APP_NAME = ${JSON.stringify(name)}`);
console.log(`namespace de hoy     = ${JSON.stringify(derived)}`);
console.log(
  bad.length
    ? `\n>>> TE APLICA. Caracteres inválidos: ${[...new Set(bad)]
        .map((c) => `${JSON.stringify(c)} (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
        .join(', ')}`
    : '\n>>> No te aplica SEGÚN .env.local: este valor ya deriva a un namespace válido,\n' +
      '    y el fix produce el mismo valor exacto.\n' +
      '    ⚠️ Antes de cerrar el tema: las NEXT_PUBLIC_* se inlinean en el BUILD, así que\n' +
      '    el valor que gobierna producción es el de tu panel de deploy. Si ahí difiere\n' +
      '    (marca cambiada desde la UI de Vercel, por ejemplo), evalúa ESE valor también.'
);
```

Imprime el código Unicode de cada carácter culpable, que es lo que distingue un `'` de un `’`. Bórralo cuando termines.

**Te aplica** si tu valor tiene AL MENOS un carácter fuera de esa lista — acentuado o no. Ejemplos que sí te aplican: `"Añejo Cápital"` (ñ, acentos), `"Aditivo: CRM"` (`:`), `"A/B Testing"` (`/`), `"Foo (Bar)"` (`(` `)`), `"Acme, Inc."` (`,`).

**No te aplica** si tu valor solo usa letras/números ASCII, espacios, y/o `_ . & + ~ ! $ ' *` — tu derivación de hoy ya cae dentro del alfabeto permitido y el fix del kit produce el **mismo valor exacto** que ya tienes (paridad garantizada). Adoptarlo no rompe nada, pero tampoco cambia nada.

---

## 3. Qué se invalida (efecto esperado, no un bug del retrofit)

Rotar el namespace cambia el nombre de las tres cookies **y** el salt del JWE de la cookie de sesión (el nombre se usa también como salt en la derivación HKDF de la clave de descifrado). Esto significa:

- Toda sesión activa bajo el nombre de cookie viejo deja de ser legible: el usuario aparece deslogueado y tiene que volver a iniciar sesión.
- La cookie CSRF y la de callback URL viejas también quedan huérfanas — el navegador las sigue enviando hasta su `maxAge` (30 días), pero el servidor ya no las reconoce. Es cosmético, no un riesgo: el servidor simplemente no las lee.
- El modo de falla es limpio, nunca un parseo parcial: con el nombre nuevo la cookie vieja no se encuentra (`decode` nunca la ve); si por alguna razón un valor viejo llegara a decodificarse con el salt nuevo, el chequeo de integridad del JWE (A256CBC-HS512) falla y lanza, nunca produce un payload corrupto silencioso.

**Comunícalo antes de desplegar** — es un logout masivo de un solo golpe, no una fuga gradual. No hay forma de migrar sesiones vivas de un namespace a otro: no comparten salt.

---

## 4. Los TRES sitios que tienes que tocar

Tu `src/`+`tests/` nació con la derivación duplicada en tres lugares. Edítalos en este orden:

### 4.1 `src/lib/auth/auth.config.ts` — el origen

Reemplaza tu derivación local por la del kit (cópiala tal cual de un proyecto nuevo, o de este documento):

```ts
export function deriveCookieNamespace(appName: string | undefined): string {
  // NO `.trim()` here, deliberately. Trimming first would map `" Acme "` to
  // `acme`, while today's derivation yields `-acme-` — a VALID cookie name. That
  // is a silent namespace rotation (and JWE-salt rotation, so a forced logout)
  // for a derivative that never had the bug this fix exists for.
  const namespace = (appName ?? '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9!#$%&'*+\-.^_`|~]/g, '-');

  return namespace || 'app';
}

const cookieName = deriveCookieNamespace(process.env.NEXT_PUBLIC_APP_NAME);
```

> 🔴 **El comentario del `.trim()` no es adorno — cópialo también.** Una versión anterior de esta guía traía la variante con `.trim()` y un early-return, y es incorrecta: rota el namespace (y con él el salt del JWE, o sea cierra todas las sesiones) de un proyecto cuyo nombre tiene espacios alrededor y que **nunca tuvo este bug**. ⚠️ **No cuentes con que un test te avise:** `factory update` no entrega `tests/**` (el `track` de distribución cubre `.claude/**` y `scripts/**`, no la suite), así que tu proyecto probablemente no tiene `tests/unit/auth/cookie-name.test.ts`. Si quieres esa red, cópiala de un proyecto nuevo junto con el bloque de arriba: el paso **4.4** de abajo lo detalla. Sin ella, la única verificación es leer las dos versiones lado a lado.

Las **tres** cookies (`cookies.sessionToken.name`, `cookies.csrfToken.name`, `cookies.callbackUrl.name`) ya leen esta misma constante `cookieName` — no hace falta tocar esas tres líneas, solo el origen del valor.

### 4.2 `src/lib/auth/auth.ts` — quita la copia local

Si tu `auth.ts` tiene una función tipo `getSessionCookieName()` que replica la derivación (busca `NEXT_PUBLIC_APP_NAME` en el archivo), bórrala. Todo punto donde la usabas como nombre de cookie **y** como salt del `decode` del JWE pasa a leer `authConfig.cookies.sessionToken.name` directamente — importado de `auth.config.ts`, nunca recompuesto con el prefijo `authjs.session-token.` a mano fuera de ese archivo.

🔴 **Por qué "tal cual" y no recomponer el prefijo.** Si tu código arma `` `authjs.session-token.${deriveCookieNamespace(...)}` `` en `auth.ts`, comparte el slug con `auth.config.ts` pero duplica el prefijo por separado — una divergencia futura entre las dos copias del prefijo hace que `decode` no abra la cookie, y la función que lee la sesión activa (`readActiveSession` o su equivalente) degrada a "sin sesión" **en silencio** (su `catch` solo loguea, nunca lanza). Eso salta enteros los gates de conflicto de proveedor OAuth, el step-up anti-CSRF, y la verificación de email del linking — sin que `typecheck`, `lint` ni tu E2E lo detecten. Consumir el nombre completo tal cual desde `auth.config.ts` elimina la clase de bug entera.

### 4.3 `tests/e2e/auth-linking.spec.ts` (o el spec equivalente en tu proyecto)

Si tienes un spec E2E que replica la derivación a mano para construir el nombre de cookie de sesión (busca un patrón como `NEXT_PUBLIC_APP_NAME?.toLowerCase().replace(/\s+/g, '-')` seguido de una plantilla `` `authjs.session-token.${...}` ``), reemplázalo por un import directo:

```ts
import { authConfig } from '@/lib/auth/auth.config';

const SESSION_COOKIE_NAME = authConfig.cookies.sessionToken.name;
```

`authConfig` es seguro de importar en un spec de Playwright que corre en Node plano (no dentro del bundler de Next): solo trae imports de tipo de `next-auth` y dos módulos de config sin dependencias de runtime de `next-auth` (`@/config/roles`, `@/lib/auth/permissions`). Si tu spec importa `@/lib/auth/auth` completo en cambio, vas a arrastrar `NextAuth`, el adapter de Drizzle y todo lo que eso implica — usa `auth.config.ts`, no `auth.ts`.

**Después de los tres sitios**, busca en el resto de tu `src/`+`tests/` cualquier otra copia de la derivación (grep por `NEXT_PUBLIC_APP_NAME` cerca de `.toLowerCase().replace`) — tu proyecto puede haber crecido copias propias que el kit no tenía cuando naciste.

---

## 5. Verifica que funcionó

1. `pnpm typecheck` y `pnpm lint` — sin errores.
2. **Si copiaste el test** (paso 4.4), córrelo: `pnpm test tests/unit/auth/cookie-name.test.ts`. Si no lo copiaste, este paso no aplica — tu proyecto no lo tiene y `factory update` no te lo va a traer.
3. Confirma en el navegador: borra tus cookies de auth locales, inicia sesión, y en devtools revisa que las tres cookies (`authjs.session-token.*`, `authjs.csrf-token.*`, `authjs.callback-url.*`) tengan un nombre sin acentos ni puntuación fuera del alfabeto permitido.
4. Prueba el login por credenciales específicamente — es el flujo que depende del CSRF token, y el que se rompía en silencio antes de este fix.

---

## 6. Qué pasa si no haces nada

Si tu `NEXT_PUBLIC_APP_NAME` ya cae dentro del alfabeto permitido (Phase 0), nada — tu derivación de hoy ya es válida y este retrofit no te aporta nada.

Si tu `NEXT_PUBLIC_APP_NAME` tiene un carácter fuera del alfabeto (acentuado o no), tus tres cookies de auth siguen siendo inválidas hasta que apliques esta guía — el `factory update` nunca te la aplica solo, porque tu `src/` nace congelado (`CORE.md §5`) y esta guía toca justo ese árbol.

---

_TimeKast Factory — retrofit `auth-cookie-name-ascii` (kit v12.1.0)_

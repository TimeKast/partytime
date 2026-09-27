# Migration brief — tu fase de E2E deja de vivir en un fork del runner

> **Retrofit shipped** (`.claude/docs/retrofits/`) — aplica a **todo derivado que haya editado `scripts/tools/e2e-runner.ts`** para agregar una fase propia (un servidor con otra postura, otro `project` de Playwright, un modo alterno de la app). Si nunca lo tocaste, **no te aplica y no tienes que hacer nada**: el runner corre exactamente igual que antes.
>
> **Audience:** el equipo (o el agente) de una app TimeKast derivada del Factory. No hace falta leer el código del runner — esta guía se basta sola; ese es su criterio de éxito.
>
> **Date:** 2026-08-13
> **Origin:** `EPIC-01-kit-boundary · BND-012`. El runner ahora declara sus fases como **datos** y carga las tuyas de un archivo que es **tuyo**. Decisión y alternativas rechazadas: `ADR-002-e2e-phase-registry`. Contrato vivo: [`sk-e2e §1.7`](../../skills/sk-e2e/SKILL.md).
>
> **Costo de aplicarlo:** ~30-45 minutos para una fase. Un archivo nuevo, y borrar lo que forkeaste.
> **Disponible desde:** kit `v11.7.0`

---

## 1. Qué pasa, y por qué te urge

`scripts/tools/e2e-runner.ts` es **brain-owned**: viaja con `factory update` y se sobrescribe entero. Si agregaste ahí tu fase, **cada actualización te la borra en silencio** — sin conflicto de merge, sin aviso, sin fallar. Lo notas cuando alguien pregunta por qué esa suite dejó de correr.

Hasta ahora no había alternativa: las dos fases del kit estaban cableadas (un par de booleanos, un `if` por fase), así que una tercera fase era un booleano más, un `if` más y un mensaje más — dentro del archivo del kit.

**Ahora una fase es un dato**, y el runner carga las tuyas de `scripts/tools/e2e.project.ts`, que es **dev-owned**: no viaja en ningún perfil de distribución, así que `factory update` no puede escribirlo, sobrescribirlo ni borrarlo. Nunca.

> ⚠️ **Esta actualización te pisa el fork.** El release que trae este cambio reemplaza tu `e2e-runner.ts` por el del kit. Si tenías una fase propia ahí, aplica esta guía **en el mismo movimiento** que el update — no después.

---

## 2. Phase 0 — ¿me aplica?

> No modifica nada.

```bash
echo "=== 1. ¿Mi runner soporta el registro de fases? ==="
grep -q "KIT_PHASES" scripts/tools/e2e-runner.ts && echo "  SÍ" || echo "  NO — todavía no recibiste el update; aplica primero factory update"

echo "=== 2. ¿Ya declaré mis fases? ==="
test -f scripts/tools/e2e.project.ts && echo "  YA APLICADO — nada que hacer" || echo "  Falta"

echo "=== 3. ¿Qué projects declara mi playwright.config? ==="
grep -oE "name:\s*['\"\`][^'\"\`]+['\"\`]" playwright.config.* 2>/dev/null

echo "=== 4. ¿Tenía yo un fork del runner? (revisa el historial) ==="
git log --oneline -- scripts/tools/e2e-runner.ts | head -20
```

Si el paso 3 lista un `project` que **no** es `setup`, `chromium` ni `mfa`, ese es tu candidato: tenías una fase propia.

---

## 3. Phase 1 — traduce tu fase del fork al archivo del proyecto

### 3.1 Extrae de tu fork los tres datos que importan

Antes de borrar nada, busca en tu diff del runner (`git log -p -- scripts/tools/e2e-runner.ts`) y anota, por cada fase tuya:

| Del fork                                                        | Va a                              |
| --------------------------------------------------------------- | --------------------------------- |
| El `--project=<algo>` que le pasabas a Playwright               | `project`                         |
| El `console.log('\n▶ …')` que imprimías al arrancarla           | `label`                           |
| Las variables de entorno que le ponías al servidor de esa fase  | `env().server`                    |
| Las variables que le ponías al proceso de Playwright de esa fase | `env().playwright`                |

### 3.2 Crea `scripts/tools/e2e.project.ts`

```ts
// scripts/tools/e2e.project.ts — fases E2E de ESTE proyecto (dev-owned).
// El kit nunca escribe este archivo: `factory update` no lo toca.
import type { E2EPhase } from './e2e-runner';

export default [
  {
    project: 'platform', // tiene que existir en tu playwright.config.ts
    label: 'Phase C — modo plataforma (multi-tenant)',
    env: () => ({
      server: { PLATFORM_MODE: 'on', TENANT_ROUTING: 'header' },
    }),
  },
] satisfies E2EPhase[];
```

Trackéalo en git. Corre **después** de las fases del kit, y si declaras varias, en el orden del archivo.

### 3.3 🔴 El secreto que se reparte — el caso con trampa

Si tu fase genera un valor que **los dos procesos** necesitan (el servidor lo verifica, las specs lo firman o lo mandan), genéralo **dentro de un solo `env()`** y repártelo:

```ts
import crypto from 'crypto';

export default [
  {
    project: 'uploads',
    label: 'Phase C — uploads firmados',
    env: () => {
      // UNA sola evaluación por fase. Los dos procesos reciben el MISMO valor,
      // por construcción — no por una regla que alguien tenga que recordar.
      const secret = crypto.randomBytes(16).toString('hex');
      return {
        server: { UPLOAD_SIGNING_SECRET: secret },
        playwright: { UPLOAD_SIGNING_SECRET: secret },
      };
    },
  },
] satisfies E2EPhase[];
```

> **Por qué `env()` es UNA función y no dos.** Con dos (`serverEnv()` y `playwrightEnv()`) cada una generaría su propio secreto y los dos lados quedarían desparejos. Y el síntoma no es un rojo claro: las specs que dependen de ese canal suelen **saltarse estructuralmente** cuando el secreto falta, así que un par desparejo produce un **rechazo de autorización** donde antes había un salto limpio — y lo vas a buscar en el producto, no en la configuración de las pruebas.

### 3.4 🔴 Una convención de nombres tuya hereda las reglas del producto

Caso real, y costó horas: un equipo compuso un **prefijo de almacenamiento por corrida** para no pisar datos entre corridas, y usó `/` como separador. Ese prefijo no era solo una llave de almacenamiento: el producto lo **validaba en un formulario**, y ese formulario rechaza barras. El síntoma fue una spec rompiéndose lejos del cambio, con un diagnóstico que arrancó culpando a otro epic.

**La regla:** si el valor que inventas para tu fase **entra a la app** (se guarda en una columna, se muestra en un campo, lo valida un `zod`), no es una llave interna — hereda las restricciones del producto. Antes de elegir separadores y formato, busca la validación del campo. Alfanumérico con guion (`-`) es la apuesta segura.

### 3.5 Claves que tu fase NO puede declarar

El `env()` de tu fase se aplica **encima** del entorno de la corrida, nunca en lugar de él. Y hay claves que el runner **rechaza**, fallando y nombrándolas (no las ignora):

| Clave / prefijo               | Por qué                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | Es el branch efímero de Neon de esta corrida, y la prueba del guard que impide correr contra otra base          |
| `PORT`                        | Rompe el traspaso de puerto entre fases                                                                         |
| `NEXT_PUBLIC_APP_URL`         | Se hornea en el build y se lee en runtime                                                                       |
| `NODE_OPTIONS`                | Lleva el stub de `server-only` / `client-only`; sin él, specs enteras mueren al cargarse                        |
| **cualquier `NEXT_PUBLIC_*`** | El build es **uno solo y previo** a las fases: la moverías en el servidor y no en el bundle del cliente → desajuste de hidratación |

> **¿Necesitas una `NEXT_PUBLIC_*` distinta por fase?** No se puede, y no es una limitación del registro: el bundle del cliente se compila una vez por corrida. Si de verdad la necesitas, la vía es una variable **de runtime** que el servidor lea y exponga, o un factory-ticket al kit — no una `NEXT_PUBLIC_*` por fase.

---

## 4. Phase 2 — borra el fork

En `scripts/tools/e2e-runner.ts` (si todavía tienes tu versión) elimina **todo** lo que agregaste para tu fase:

```
❌ tu booleano en el plan de fases (`runPlatform`, `runX`…)
❌ tu parámetro extra en `runPhase(...)` / `startServer(...)`
❌ tu bloque `if (plan.runX) { console.log('▶ …'); codes.push(await runPhase(...)) }`
❌ tus variables de entorno metidas dentro de `serverEnvOverrides` / `playwrightEnvOverrides`
❌ tu nombre agregado a la lista de `--project` válidos
```

La forma más limpia, una vez que `e2e.project.ts` existe y está trackeado:

```bash
# restaura el runner del kit tal cual viene (tras el update, ya debería estarlo)
git checkout -- scripts/tools/e2e-runner.ts
```

Si `pnpm test:e2e --help` menciona tu fase, **todavía tienes fork**: el `--help` se renderiza del registro del kit, así que tu fase no debe aparecer ahí (aparece al resolverse la corrida, no en el contrato del kit).

---

## 5. Phase 3 — verifica que tu fase corre, y en qué orden

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Luego, la corrida real:

```bash
# 1. Solo tu fase — el bucle de depuración
pnpm test:e2e --project=platform

# 2. La corrida completa: las del kit primero, la tuya después
pnpm test:e2e
```

Lo que debes ver en la salida de (2), en este orden:

```
▶ Phase A — base suite (RBAC/CRUD, MFA off)
▶ Phase B — MFA-aware spec (MFA on, optional + admins)
▶ Phase C — modo plataforma (multi-tenant)      ← la tuya, al final
```

Y una comprobación que vale más que las tres: **rompe tu fase a propósito** y confirma que la corrida se pone roja.

```bash
# escribe mal el project en e2e.project.ts (p. ej. 'platfrom') y corre:
pnpm test:e2e
```

Debe **fallar de inmediato**, antes de crear la branch de Neon, migrar o compilar, nombrando `'platfrom'`. Si en cambio corre las fases del kit y termina verde, algo quedó mal: el archivo no se está cargando (revisa que el `export default` sea un arreglo) o el fork sigue vivo.

---

## 6. Qué pasa cuando algo no cuadra — la tabla que evita sorpresas

La tolerancia es **asimétrica a propósito**. Vale la pena leerla antes de diseñar tu fase:

| Situación                                                    | Qué hace el runner                                        |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| No tienes `e2e.project.ts`                                   | Corre las dos fases del kit. Idéntico a antes              |
| Tienes el archivo pero no carga (sintaxis, export equivocado) | **Aborta** la corrida entera, nombrando el error real      |
| El `project` de **tu** fase no está en `playwright.config.ts` | **Falla**, nombrando tu fase. **No la salta**              |
| Tu `env()` declara una clave protegida                       | **Falla** nombrando la clave. No aplica nada               |
| Dos fases con el mismo `project`                             | **Falla** nombrando el duplicado                           |
| Falta el `project` `mfa` (derivado nacido pre-MFA)           | Avisa y salta esa fase del kit. La corrida sigue           |
| No queda **ninguna** fase ejecutable                          | **Falla**, nombrando qué se saltó y por qué                |

🔴 **Tu fase no se salta nunca, y eso es a favor tuyo.** Declararla ES afirmar que existe. Si el runner la saltara "con aviso", una corrida sin ejecutar tus specs terminaría **verde** — que es exactamente el problema que este cambio existe para cerrar. La única fase que se salta es la opcional del kit, y por una razón que no se generaliza: un derivado nacido antes de la feature de MFA tiene el `src/` congelado y su config legítimamente no declara ese `project`.

---

## 7. Preguntas que aparecen siempre

**¿Puedo reordenar las fases del kit, o quitar una?** No. El punto de extensión solo **agrega al final** — igual que `.husky/pre-commit.project` y `vitest.setup.project.ts`. Si necesitas otra cosa, es un factory-ticket, no un fork.

**¿Mi fase puede usar su propia base de datos?** No hoy: todas las fases comparten el branch efímero de la corrida. Consecuencia práctica → aleatoriza en tus **fixtures** toda columna que tenga índice único global (`sk-e2e` R2); con base compartida, dos specs que siembren el mismo literal chocan a la primera.

**¿Y si necesito limpiar un recurso externo al terminar mi fase?** No hay hook de limpieza. Lo que funciona: que el recurso sea **de la corrida** (un bucket/prefijo dedicado, declarado en el `env()` de tu fase) y se recicle solo — leyendo antes §3.4.

**¿`env()` se llama una o dos veces?** **Una**, siempre, justo antes de correr la fase. Sus dos mitades van a los dos procesos.

**¿Puedo poner `required: false` en mi fase para que se salte si falta el project?** El campo existe pero **no se honra** para fases del proyecto: siempre falla. Ver arriba el porqué.

---

## 8. Qué esperar

- **Si nunca forkeaste el runner:** nada. Cero cambios en tu corrida, byte por byte.
- **Si tenías una fase forkeada:** dejas de perderla en cada `factory update`, y a cambio de un archivo nuevo tienes un contrato estable — la fase se declara donde el kit no manda.

---

_TimeKast Factory — retrofit: fases de E2E declaradas por el proyecto_

# Migration brief — el endpoint de CSP reports mantiene tu base de datos despierta

> **Retrofit shipped** (`.claude/docs/retrofits/`) — aplica a **todo derivado en producción** que shippee el rate limiting del kit y el header `Content-Security-Policy-Report-Only`, y que **no** tenga Upstash configurado. Eso es, hoy, casi toda la flota.
>
> **Audience:** el equipo (o el agente) de una app TimeKast derivada del Factory. No hace falta haber sincronizado el cerebro ni migrado estructura: el fix toca **un archivo de `src/`**.
>
> **Date:** 2026-08-10
> **Origin:** auditoría de costo de la flota Neon (`project/reports/neon-fleet-cost-baseline-2026-08.md`). Corregido en el Factory para que los derivados **nuevos** nazcan bien; `factory update` **no** lo trae porque `src/` nace congelado (BR-FACTORY-006), así que hay que aplicarlo a mano.
>
> **Costo de aplicarlo:** ~10 minutos. Un archivo, ~15 líneas.
> **Disponible desde:** kit `v11.6.0`

---

## 1. Qué pasa

El rate limiting del kit (`src/lib/rate-limit.ts`) elige backend así:

```
1. RATE_LIMIT_ENABLED=false   → bypass
2. UPSTASH_REDIS_REST_URL     → Redis
3. DATABASE_URL + production  → Postgres   ← aquí cae tu app
4. fallback                   → memoria
```

Como Upstash está comentado en `.env.example` y no viaja en el rail de secretos, **en producción tu app usa el backend de Postgres**. Y cada verificación de rate limit es una **escritura** (`INSERT ... ON CONFLICT DO UPDATE`), no una lectura.

Hasta ahí, correcto: los buckets de login y registro necesitan un contador compartido entre instancias.

**El problema es dónde más está enchufado.** El kit shippea en producción y preview un header `Content-Security-Policy-Report-Only` con `report-uri /api/csp-report` (`next.config.ts`), y ese endpoint arranca así:

```ts
export async function POST(req: Request) {
  // primera línea, antes de validar nada
  const rate = await checkRateLimit(getClientIP(req), 'cspReport');
```

Resultado: **cualquier navegador o crawler que dispare una violación de CSP provoca una escritura en tu Postgres.** Sin login, sin sesión, sin usuario.

### Por qué cuesta dinero

Neon suspende el compute tras **5 minutos sin conexiones**. Una escritura reinicia ese contador. O sea: **una visita cada 5 minutos —incluidos bots— mantiene tu base despierta las 24 horas**, en una app donde puede que nadie se haya logueado en semanas.

Y el rate limit no te protege de esto, porque **el rate limit ES la escritura**: cuando el endpoint devuelve el `204` silencioso por exceso, la fila ya se insertó.

### Evidencia medida en la flota

Contenido real de `rate_limit_buckets` en proyectos con tráfico público:

| Proyecto | Filas | Del bucket `csp-report` |
| --- | ---: | ---: |
| rafflegives | 20 | **19** |
| rafflegives (2º compute) | 8 | **7** |
| travessa | 11 | **6** |

---

## 2. Phase 0 — ¿me aplica?

> No modifica nada. Corre los cuatro detectores; si los cuatro dan `SÍ`, el retrofit aplica.

```bash
echo "=== 1. ¿El rate limit del kit usa backend Postgres? ==="
grep -q "postgresRateLimit" src/lib/rate-limit.ts && echo "  SÍ" || echo "  NO — no shippeas este módulo, ignora el resto"

echo "=== 2. ¿Ya está el fix aplicado? ==="
grep -q "OBSERVABILITY_BUCKETS" src/lib/rate-limit.ts && echo "  YA APLICADO — nada que hacer" || echo "  SÍ, falta aplicarlo"

echo "=== 3. ¿El CSP apunta al endpoint propio? ==="
grep -q "report-uri /api/csp-report" next.config.ts && echo "  SÍ" || echo "  NO — no tienes el sensor prendido"

echo "=== 4. ¿Upstash configurado en producción? ==="
grep -qE '^\s*UPSTASH_REDIS_REST_URL=".+"' .env.local 2>/dev/null && echo "  SÍ — ya no pegas a Postgres, el retrofit es opcional" || echo "  NO — caes en Postgres"
```

Para ver el daño real antes de tocar nada:

```bash
pnpm db:query "SELECT split_part(key,':',2) AS bucket, count(*) AS filas
               FROM rate_limit_buckets GROUP BY 1 ORDER BY filas DESC"
```

Si `csp-report` encabeza la lista, estás pagando computo por tráfico anónimo.

---

## 3. Phase 1 — el fix

Un solo archivo: `src/lib/rate-limit.ts`.

### 3.1 Declarar los buckets de observabilidad

Justo después de la constante `LIMITS` (después de su `} as const;`):

```ts
/**
 * Buckets que existen para que los logs no se inunden, no para detener un ataque.
 *
 * Nunca usan el backend de Postgres, ni siquiera en producción con DATABASE_URL:
 *
 *  - No protegen nada. El peor caso de contar de menos son más líneas de log; no
 *    hay credencial ni cuenta del otro lado. Contar por instancia alcanza.
 *  - Cada check contra Postgres es una ESCRITURA, y una escritura despierta la
 *    base durante toda la ventana de autosuspensión. `cspReport` lo alcanza
 *    cualquier navegador o crawler que dispare el CSP Report-Only — sin sesión —
 *    así que mandarlo a Postgres convierte el tráfico anónimo en un despertador.
 *
 * El límite se sigue aplicando; lo único que cambia es dónde se guarda el contador.
 */
const OBSERVABILITY_BUCKETS: ReadonlySet<keyof typeof LIMITS> = new Set(['cspReport']);
```

### 3.2 Excluirlos del backend de Postgres

Dentro de `checkRateLimit`, cambiar la condición del backend de Postgres:

```diff
   if (isUpstashConfigured()) {
     return upstashRateLimit(identifier, config);
   }

-  if (isPostgresAvailable() && process.env.NODE_ENV === 'production') {
+  if (
+    isPostgresAvailable() &&
+    process.env.NODE_ENV === 'production' &&
+    !OBSERVABILITY_BUCKETS.has(type)
+  ) {
     return postgresRateLimit(identifier, config);
   }

   return memoryRateLimit(identifier, config);
```

> ⚠️ **Upstash queda ANTES a propósito.** Es un almacén aparte: no despierta tu base. Si lo tienes configurado, que lo use también para `cspReport`.

### 3.3 Que el modo reportado no mienta (opcional pero recomendado)

```diff
-export function getRateLimitMode(): 'disabled' | 'upstash' | 'postgres' | 'memory' {
+export function getRateLimitMode(
+  type?: keyof typeof LIMITS
+): 'disabled' | 'upstash' | 'postgres' | 'memory' {
   if (!isRateLimitEnabled()) return 'disabled';
   if (isUpstashConfigured()) return 'upstash';
+  if (type && OBSERVABILITY_BUCKETS.has(type)) return 'memory';
   if (isPostgresAvailable() && process.env.NODE_ENV === 'production') return 'postgres';
   return 'memory';
 }
```

---

## 4. Phase 2 — verificar

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Y agrega el test que fija el contrato, para que nadie lo revierta sin darse cuenta (en `tests/unit/rate-limit.test.ts`, con los mocks de `db` y `logger` que el archivo ya tiene):

```ts
describe('observability buckets — cspReport no debe tocar Postgres', () => {
  it('no ejecuta SQL para cspReport en producción', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@host/db';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { checkRateLimit } = await import('@/lib/rate-limit');

    for (let i = 0; i < 5; i++) await checkRateLimit('203.0.113.7', 'cspReport');

    expect(mockExecute).not.toHaveBeenCalled();
  });
});
```

Tras el deploy, confirma que la tabla dejó de crecer por ese lado:

```bash
pnpm db:query "SELECT split_part(key,':',2) AS bucket, count(*) AS filas, max(reset_at) AS ultimo
               FROM rate_limit_buckets GROUP BY 1 ORDER BY filas DESC"
```

El `ultimo` de `csp-report` debe quedar congelado en un timestamp anterior al deploy. Las filas viejas las barre la limpieza probabilística del propio módulo (1% de las llamadas, entradas de más de un día); si molestan, `DELETE FROM rate_limit_buckets WHERE key LIKE 'ratelimit:csp-report:%'` es seguro.

---

## 5. Qué esperar

El efecto depende de cuánto tráfico anónimo recibas:

- **App interna, sin tráfico público:** casi nada. Aplícalo igual — cuesta 10 minutos y evita la sorpresa cuando el sitio se abra.
- **App con sitio público, landing o dominio indexado:** aquí está el premio. Si tu base figuraba despierta a toda hora sin crones que lo expliquen, este es probablemente el motivo.

Cómo medirlo, sin depender de la factura: en el panel de Neon, la gráfica de *compute hours* del proyecto. Compara la semana anterior al deploy contra la siguiente. Si el consumo era plano las 24 horas y pasa a tener valles, funcionó.

> El costo se factura por **CU-hora**. Con la tarifa efectiva medida en el org (~$0.107/CU-h), un compute de 0.25 CU despierto 24/7 cuesta ~$19/mes; el mismo durmiendo 18 horas al día cuesta ~$5.

---

## 6. Mejoras opcionales

**a) Si tienes Sentry prendido** (`NEXT_PUBLIC_SENTRY_DSN` seteado — ojo: el kit lo trae cableado pero apagado por defecto), puedes apuntar el `report-uri` al endpoint de seguridad de Sentry en vez de a tu app. El navegador reporta directo allá y tu función serverless ni se invoca: te ahorras la lambda además de la escritura. La URL se deriva del DSN (`https://oXXXX.ingest.sentry.io/api/PROJECT_ID/security/?sentry_key=PUBLIC_KEY`).

**b) Si tu app tiene tráfico de verdad**, considera Upstash: saca de Postgres **todos** los buckets, incluidos los de login. Es un servicio y un secreto más, así que solo vale la pena donde el volumen de autenticación es alto.

**c) Si nadie revisa los reportes de CSP**, plantéate quitar el `report-uri`. Es un sensor: si nadie lo mira, solo cuesta. Esa decisión es de producto, no de infraestructura — el fix de arriba lo deja barato de mantener prendido, que suele ser la respuesta correcta.

---

_TimeKast Factory — retrofit: CSP reports y despertares de la base_

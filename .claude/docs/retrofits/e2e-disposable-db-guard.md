# Retrofit — el guard de base desechable para las pruebas E2E

> **Para quién:** cualquier derivado ya bootstrapeado que corra pruebas E2E con Playwright.
> **Cuesta:** dos líneas en `tests/global-setup.ts` y una línea en `.vscode/tasks.json`.
> **Devuelve:** que la suite E2E no pueda, por construcción, escribir en otra base que no sea la
> rama efímera de Neon que el runner acaba de crear.
> **Por qué no llega solo:** `tests/**` y `.vscode/**` **nacen congelados** con tu proyecto
> (`BR-FACTORY-006`). `factory update` te trae `scripts/tools/e2e-guard.ts` — el guard — pero no
> puede agregar la línea que lo invoca. Hasta que la agregues, tienes el guard en el disco y
> ningún guard en efecto.
> **Disponible desde:** kit `v11.7.0`

## El problema

`playwright.config.ts` carga `.env.local` con dotenv **dentro del propio config**. Eso significa
que esto arranca una corrida completa sin pasar por ningún script del kit:

```bash
pnpm exec playwright test tests/e2e/mi-spec.spec.ts
```

Sin rama efímera, sin aislamiento, y contra la `DATABASE_URL` que tenga ese archivo. En un
derivado real ese archivo compartía endpoint con producción: 26 de 34 specs morían al arrancar y
6 escribían directo a la base. El daño no vino de un comando exótico — vino del comando obvio.

Retirar los atajos con nombre bonito (`test:e2e:direct` / `test:e2e:ui`) quita el camino
tropezable, no la **capacidad**. El guard sí quita la capacidad, y es lo único que lo hace.

## Qué es el guard

Una prueba **positiva**, no una lista negra:

- El runner, al crear la rama efímera, deja su URI de conexión en `E2E_DISPOSABLE_BRANCH` — el
  mismo valor que le pasa como `DATABASE_URL` al proceso de Playwright.
- El guard exige que la `DATABASE_URL` efectiva **sea** ese valor. Si no coincide, o si la llave
  no está (porque la corrida no pasó por el runner), lanza.
- No lee `.env.local`, no lo compara contra nada, no necesita saber cuál es "la base de
  producción". Una regla negativa tendría que enumerar todas las bases prohibidas y quedaría
  incompleta el día que agregues una; esta enumera la única permitida, y ese valor cambia en cada
  corrida.

🔴 **Qué es y qué no es: un anti-footgun, no una frontera de seguridad.** Cierra el camino
**accidental** — el comando obvio que te deja apuntado a la base de `.env.local` — y eso es lo que
causó el daño real. No cierra el camino de quien quiere evadirlo: la regla es una igualdad entre
dos variables del mismo entorno, así que `E2E_DISPOSABLE_BRANCH="$DATABASE_URL" pnpm exec
playwright test` la satisface sin conocer ninguna URI de Neon.

La mejora sobre la versión anterior (un token fijo `=1`, que cualquiera exportaba a mano después
de leer el mensaje de error) es real, pero es de **grado**: una URI por corrida no se adivina y no
se puede imprimir en un mensaje, así que el error nunca sugiere exportar nada. Basta para que
nadie lo esquive sin querer; no basta para que construyas encima una confianza que el mecanismo no
da. Volverlo infalsificable exigiría verificar contra la base que esa URI de verdad es una rama
desechable — otra decisión, no ésta.

## Paso 1 — cablear el guard en `tests/global-setup.ts`

Tu archivo probablemente es un no-op con un docstring. Agrégale el import y la llamada:

```ts
import { assertDisposableBranch } from '../scripts/tools/e2e-guard';

function globalSetup(): void {
  assertDisposableBranch();
}

export default globalSetup;
```

Si tu `globalSetup` ya hace otras cosas, la llamada va **primero**, antes de cualquier trabajo
contra la base: Playwright corre `globalSetup` en su proceso principal, antes de cargar la primera
spec, así que ahí una corrida rechazada muere antes de que exista un `INSERT` que ejecutar.

Si tu `playwright.config.ts` no declara `globalSetup`, agrégalo:

```ts
globalSetup: './tests/global-setup.ts',
```

## Paso 2 — retirar los atajos que rodean al runner

Revisa tu `package.json`. Si tiene alguno de estos, `factory update` los retira solo cuando su
valor es uno que el kit shippeó (`tsx scripts/tools/e2e-direct.ts`, o el histórico
`playwright test` / `playwright test --ui`). Un valor tuyo se **preserva** — y si es tuyo, eres tú
quien decide:

```jsonc
"test:e2e:direct": "…",   // rodea al runner
"test:e2e:ui": "…"        // rodea al runner
```

El reemplazo de los dos es el mismo runner, que reenvía verbatim todo lo que no es suyo:

```bash
pnpm test:e2e --project=chromium tests/e2e/x.spec.ts       # una spec
pnpm test:e2e --ui --project=chromium tests/e2e/x.spec.ts  # modo UI
```

> El `--project=` **no es opcional en modo UI**: sin él el runner planea las dos fases y la UI
> abriría dos veces, en serie.

## Paso 3 — la task de VS Code (tampoco se autocura)

`.vscode/tasks.json` nace contigo. Si tienes la task `"Test: E2E UI Mode"` corriendo Playwright
crudo, repúntala al runner:

```jsonc
{
  "label": "Test: E2E UI Mode",
  "type": "shell",
  "command": "pnpm test:e2e --ui --project=chromium",
  "problemMatcher": []
}
```

Busca también tasks propias, scripts de CI y alias de shell que shelleen `playwright test` — el
guard los va a rechazar, que es lo correcto, pero es mejor enterarte ahora que en medio de un
debug.

## Paso 4 — verificar (las dos mitades)

```bash
# 1. Por el runner: pasa como siempre
pnpm test:e2e --project=chromium tests/e2e/<una-spec>.spec.ts

# 2. Alrededor del runner: debe ABORTAR antes de correr nada
pnpm exec playwright test tests/e2e/<una-spec>.spec.ts
```

La segunda tiene que morir con `E2E aborted: this run did not come from the E2E runner…`. Si corre
—aunque sea para fallar por otra razón— el guard no está cableado: revisa el paso 1 (lo más común
es un `playwright.config.ts` sin `globalSetup`, o un `globalSetup` propio que nunca llama al
guard).

## Lo que este retrofit NO hace

- **No toca `playwright.config.ts`** más allá de `globalSetup` (si faltaba). El `dotenv.config()`
  de ese archivo se queda: el guard hace irrelevante lo que traiga `.env.local`, en vez de pelearse
  con ello.
- **No te protege de un script que no use Playwright.** Un seed o un one-off tuyo contra
  `DATABASE_URL` sigue siendo tu responsabilidad; el guard cubre la suite E2E.
- **No sustituye tener el `.env.local` bien apuntado.** Lo vuelve no-fatal, que es distinto.

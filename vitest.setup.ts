/**
 * Vitest setup — KIT-OWNED.
 *
 * This file ships with the brain (`profiles.json#track`), so `factory update` keeps it
 * current in every derivative. Do NOT put project-specific mocks here: they would be
 * overwritten. They go in `vitest.setup.project.ts` — see the extension point at the
 * bottom of this file.
 *
 * @see .claude/skills/sk-testing-nextjs/SKILL.md — the extension-point contract
 * @see scripts/tools/e2e/compile-guard-init.mjs — the same neutralization for Playwright
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * REACT TESTING LIBRARY — CARGADA SOLO BAJO UN DOM REAL.
 *
 * Este archivo lo cargan LOS DOS proyectos de `vitest.config.ts` (`node` y `jsdom`), y esa
 * decisión es correcta y se mantiene: el config nace congelado en el derivado, así que
 * partir el setup en dos dejaría a la flota existente apuntando a un archivo que ya no
 * existe. Lo que NO se sostiene es cobrarle a los dos proyectos el mismo precio.
 *
 * `@testing-library/jest-dom/vitest` y `@testing-library/react` arrastran su árbol completo
 * —matchers, react-dom, el registro de cleanup— y Vitest ejecuta el setup UNA VEZ POR ARCHIVO
 * de test. En el proyecto `node` eso es trabajo puro a la basura: un parser o un validador
 * jamás llama a `render()`. Medido en este repo, sobre 119 archivos node y 2,037 tests:
 *
 *   antes:   setup 26.18 s · 51.14 s de CPU
 *   después: setup  2.69 s · 32.94 s de CPU   (−36 % de CPU, sin tocar un solo test)
 *
 * En una máquina cargada —varias ventanas del editor, agentes en paralelo, un build vivo—
 * el reloj de pared se aproxima a CPU/núcleos, así que ese 36 % se cobra donde más duele.
 *
 * LLAVEADO POR EL ENTORNO REAL, NO POR EL PROYECTO — el mismo criterio que ya usa el
 * `testTimeout` de abajo, y por la misma razón: un `.test.ts` que pide DOM con el docblock
 * `// @vitest-environment jsdom` vive en el proyecto `node` pero SÍ tiene `window`. Por
 * proyecto se quedaría sin matchers; por entorno queda cubierto solo.
 *
 * El import va arriba y no dentro del `afterEach` a propósito: los matchers de jest-dom
 * tienen que estar registrados ANTES del primer `expect(...).toBeVisible()`, y resolver
 * `cleanup` una sola vez deja el hook síncrono en lugar de pagar un `await` por test.
 */
let cleanup: (() => void) | undefined;
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  ({ cleanup } = await import('@testing-library/react'));
}

/**
 * Neutralize Next.js's compile-time guards for the unit runner.
 *
 * `server-only` and `client-only` are marker packages whose entry point is a bare `throw`.
 * Inside a bundler that is the point: Next resolves them per build condition, so a server
 * module that leaks into the client bundle fails the BUILD instead of shipping secrets to
 * the browser. Vitest is plain Node — no such condition — so the moment a test reaches a
 * marked module the whole FILE dies while it is being loaded, before a single assertion
 * runs, and the report blames the test rather than the import three files away.
 *
 * Returning an empty module is safe precisely because these packages have no runtime
 * behaviour to preserve: outside a bundler they are assertions, not implementations.
 *
 * A factory mock is deliberately used instead of a `resolve.alias` entry: `vitest.config.ts`
 * is frozen at bootstrap in a derivative (BR-FACTORY-006), so an alias would never reach the
 * fleet, whereas this file does.
 *
 * KNOWN LIMIT: this rescues a marked module whose marker package RESOLVES. When the package
 * is not installed at all, Vite's import analysis fails at transform time — before the
 * mocker ever runs — with `Failed to resolve import`. The kit declares `server-only` in
 * `dependencies` (asserted by `tests/unit/server-only-guard.test.ts`); a project that marks
 * modules with `client-only` has to install it too.
 */
vi.mock('server-only', () => ({}));
vi.mock('client-only', () => ({}));

/**
 * jsdom gaps the kit's own UI stack walks into.
 *
 * These are NOT app-specific: the kit ships 11 `@radix-ui/*` primitives through shadcn, and
 * Radix reaches for browser APIs jsdom does not implement. Without them a component test dies
 * on `TypeError: target.hasPointerCapture is not a function` the moment `userEvent.click()`
 * touches a `<SelectTrigger>`, or on `ReferenceError: ResizeObserver is not defined` when a
 * Popover mounts. Every derivative using the kit's components needs them, so they belong here
 * rather than in each project's own setup — which is where the fleet had been rediscovering
 * them one at a time.
 *
 * Each is feature-detected, so a real implementation (or a per-file stub) always wins.
 */
/**
 * TIMEOUT DE TESTS CON DOM — llaveado por entorno, no por proyecto.
 *
 * Vitest default a 5 s. A un test sin DOM le sobra; a uno con DOM le queda corto: paga la
 * construcción del DOM por ARCHIVO, a veces un `await import()` del componente bajo prueba, y
 * `userEvent` con timers reales. Medido en este repo, el mismo test cuesta 389 ms aislado,
 * 822 ms en suite completa y 3146 ms con dos suites concurrentes — la rampa es monótona con la
 * carga, que es la firma de un presupuesto de reloj de pared sobre un recurso compartido, no la
 * de una carrera (que daría distribución bimodal). Cruzar los 5 s produjo corridas rojas sobre
 * código verde, que es peor que un gate lento: enseña a re-correr en vez de a leer.
 *
 * Va aquí y no en `vitest.config.ts` por dos razones, las dos verificables:
 *   1. Este archivo viaja a los derivados (`distribution/profiles.json#track`); el config no
 *      (nace congelado, BR-FACTORY-006). Los tests que flakean SÍ se bootstrapean, así que
 *      ponerlo en el config dejaría a toda la flota existente con el problema y sin el arreglo.
 *   2. El guard llavea por el entorno REAL. Un `.test.ts` que pide DOM con el docblock
 *      `// @vitest-environment jsdom` vive en el proyecto `node` pero paga el costo de jsdom:
 *      por proyecto se quedaría fuera; por entorno queda cubierto solo.
 *
 * El entorno node conserva el default a propósito, pero NO porque "lógica pura que tarda más de
 * 5 s sea un bug" — en este repo los tests más lentos son de node (`satellite-tags` hace
 * `git ls-remote` contra el remoto real). Lo conserva porque esos usan `execFileSync`, y un
 * bloqueo síncrono no puede disparar el timer de vitest: el riesgo real ahí es otro.
 */
if (typeof window !== 'undefined') {
  vi.setConfig({ testTimeout: 15_000 });
}

/**
 * RTL's async utilities keep their OWN clock, and it is not the one above.
 *
 * `vi.setConfig({ testTimeout })` bounds the whole test; `findBy*` / `waitFor` bound the
 * individual wait, and that knob defaults to **1000 ms** no matter how generous the test
 * timeout is. Left alone the two disagree: a test with 15 s to finish gives up on a single
 * query after one second.
 *
 * That gap is not theoretical — it is the flake it was found by. `BottomNav.test.tsx` waits
 * on a `next/dynamic` chunk, passes in **979 ms in isolation**, and goes red only under the
 * full suite (163 files in parallel), where resolving that chunk crosses the 1 s line. The
 * failure blames the assertion; the cause is contention. Any RTL test awaiting a dynamic
 * import, a transition, or a lazy route is the same test one busy machine away from red.
 *
 * Kept **below** the test timeout on purpose: a query that genuinely never resolves still
 * fails on its own clock, pointing at the query, instead of dying on the outer timeout with
 * the whole test as the suspect. Raising the async budget must not cost the diagnostic.
 *
 * Keyed by real environment, same as everything above it, and for the same reason.
 *
 * Imported from `@testing-library/react`, which re-exports it: `@testing-library/dom` is a
 * transitive dependency here, not a declared one, so importing it directly resolves only by
 * accident of hoisting — verified the hard way, it fails to resolve outright. The module is
 * already loaded a few lines above, so this second dynamic import hits the module cache.
 */
if (typeof window !== 'undefined') {
  const { configure } = await import('@testing-library/react');
  configure({ asyncUtilTimeout: 5_000 });
}

if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}

/**
 * WEB STORAGE UNDER NODE ≥ 25 — jsdom's, never Node's.
 *
 * Node 25+ ships its own `localStorage` / `sessionStorage` globals. Without
 * `--localstorage-file` they have no backing store and read as `undefined`, and since the
 * global already exists Vitest does not replace it with jsdom's: every test that touches
 * storage dies with `Cannot read properties of undefined (reading 'removeItem')`. Vitest
 * exposes the jsdom instance as `globalThis.jsdom`, so its window's storage is put back.
 * On a Node without the native globals this is a no-op in effect (same objects).
 */
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, key, {
      value: jsdomWindow[key],
      configurable: true,
      writable: true,
    });
  }
}

if (typeof globalThis !== 'undefined' && !('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// Plain assignment keeps the property configurable, so a per-file stub can still override it
// for its own scenario (a test asserting mobile layout, say).
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

/**
 * AISLAMIENTO DE MOCKS — garantizado por el kit, no por la disciplina de cada archivo.
 *
 * Sin esto, que un test no vea las llamadas del anterior dependía de que CADA archivo se
 * acordara de escribir su propio `vi.clearAllMocks()`. Medido en este repo: 65 archivos se
 * acordaban, y el resto quedaba a merced del orden de ejecución — un `toHaveBeenCalledTimes`
 * que pasa aislado y falla en suite, o peor, al revés: un test que pasa por las llamadas que
 * dejó su vecino y que en realidad nunca hizo. Es el fallo caro, porque se lee como verde.
 *
 * Va acá y no en `vitest.config.ts` por la misma razón que el `testTimeout` de arriba: este
 * archivo viaja a los derivados (`profiles.json#track`) y el config no (nace congelado,
 * BR-FACTORY-006). Puesto en el config, la garantía no llegaría a ningún proyecto ya nacido
 * — y peor, retirar de los tests el `clearAllMocks` manual (que SÍ viaja, `tests/**` está en
 * el perfil) los dejaría sin limpieza y con fuga silenciosa de mocks.
 *
 * `clearAllMocks` y no `resetAllMocks` a propósito: limpia llamadas e instancias pero
 * CONSERVA las implementaciones. Un `mockResolvedValue` puesto en el `beforeEach` del propio
 * archivo sobrevive, que es justo lo que esos archivos esperan. `reset` las borraría y dejaría
 * a media suite devolviendo `undefined`.
 *
 * El orden es el que hace falta: los hooks del setup corren ANTES que los del archivo de test,
 * así que se limpia primero y el archivo arma sus implementaciones después, nunca al revés.
 * Por eso un `vi.clearAllMocks()` al inicio de un `beforeEach` propio hoy es redundante — no
 * está mal, sobra. No lo repitas en tests nuevos.
 */
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup?.();
});

/**
 * EXTENSION POINT — project-owned setup (`vitest.setup.project.ts`).
 *
 * Mirrors `.husky/pre-commit` → `.husky/pre-commit.project`: the kit ships and owns THIS
 * file, and hands the derivative a sibling that `factory update` never ships nor overwrites.
 * A project's own global mocks (`vi.mock('@/lib/auth/auth', …)` and friends) live there and
 * survive every update.
 *
 * WHY A GUARDED DYNAMIC IMPORT, AND NOT A SECOND `setupFiles` ENTRY. Adding the file to
 * `vitest.config.ts` would be the obvious move, but that config is frozen at bootstrap in a
 * derivative (BR-FACTORY-006) — the change would never travel — and Vitest fails outright on
 * a `setupFiles` entry that does not exist, which is the normal case (the kit itself has no
 * `.project` file).
 *
 * WHY THE SPECIFIER IS A CONST AND NOT A LITERAL. With a literal, `tsc --noEmit` resolves the
 * import statically and reports `TS2307: Cannot find module` whenever the file is absent —
 * again, the normal case, so `pnpm verify` would be red out of the box. Indirecting through a
 * const puts it past TypeScript's static resolution while Vite still resolves it at runtime,
 * relative to this module. (Measured: literal + absent file ⇒ TS2307; const + absent file ⇒
 * clean typecheck and a suite that runs.)
 *
 * 🔴 `vi.mock` HOISTING SURVIVES THIS, and it was verified rather than assumed — it is the
 * whole reason the extension point can work at all. Two properties, both measured on Vitest
 * 4.1: (1) a `vi.mock` in the project file wins over a STATIC import of the same module at
 * the top of a test file; (2) it is hoisted WITHIN the project file too, so a call sitting
 * above its own `vi.mock` line already sees the mock. Both hold because Vite transforms the
 * dynamically imported module through the same pipeline, and the `await` here completes
 * before Vitest loads the test file — so the registration is always in time.
 *
 * Loaded LAST so a project can override anything the kit set above, including these mocks.
 */
const PROJECT_SETUP = './vitest.setup.project.ts';
if (existsSync(path.join(__dirname, PROJECT_SETUP))) {
  await import(PROJECT_SETUP);
}

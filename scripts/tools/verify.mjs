#!/usr/bin/env node
/**
 * `pnpm verify` — la compuerta de calidad del kit, como SCRIPT y no como cadena de shell.
 *
 * WHY THIS FILE EXISTS AT ALL. Hoy hace exactamente lo mismo que la cadena que reemplaza
 * (`pnpm lint && pnpm typecheck && pnpm test`), y eso es deliberado: el valor de este archivo
 * no está en lo que hace, está en DÓNDE VIVE. `package.json` nace congelado en un derivado
 * (BR-FACTORY-006) y no pertenece al set trackeado, así que una mejora a la compuerta escrita
 * ahí no llega nunca a la flota — hay que abrir repo por repo. `scripts/**` sí viaja verbatim
 * en cada `factory update`. Mover el CONTENIDO de la compuerta acá y dejar en `package.json`
 * un puntero de una línea (`node scripts/tools/verify.mjs`) convierte una pieza muerta en una
 * viva: el puntero se propaga una sola vez, y a partir de ahí la compuerta se mejora desde el
 * Factory sin que nadie toque su repo.
 *
 * WHY NODE AND NOT SHELL. La versión obvia de la mejora siguiente —correr los estáticos en
 * paralelo— en `package.json` se escribe `pnpm lint & L=$!; …; wait $L`, que es sintaxis de
 * shell POSIX y NO corre en Windows. El kit shippea un launcher Electron para Windows, así que
 * la compuerta tiene que sobrevivir ahí. Node es el único intérprete garantizado en los tres
 * sistemas.
 *
 * DOS MODOS. Sin flags corre la compuerta COMPLETA (lint + typecheck + test), que es el
 * veredicto y no cambia. Con `--quick` corre la versión ACOTADA A LO QUE CAMBIÓ, que existe
 * para el bucle de trabajo —el tuyo en la terminal y el del executor de `/implement` entre un
 * issue y el siguiente— donde pagar la suite entera para descubrir un punto y coma es el costo
 * que hace que la gente deje de correr la compuerta.
 *
 * 🔴 `--quick` NO SUSTITUYE AL GATE, Y NO PUEDE. `vitest related` sigue el grafo que Vite sabe
 * resolver: una dependencia que entra por otra vía (un import dinámico armado con string, un
 * archivo que solo se toca vía config) no aparece, así que un quick verde puede convivir con
 * una suite roja. Por eso el contrato del executor —"nunca OK sin un `pnpm verify` completo
 * verde"— queda INTACTO: el quick dice si vale la pena pagar el completo, nunca lo reemplaza.
 *
 * WHY IT TOLERATES A MISSING STEP. Un derivado tiene un `package.json` dev-owned sobre un
 * `src/` divergente: puede haber retirado un alias, o no haber nacido con él. La regla del kit
 * para todo artefacto del cerebro es tolerar ese lado congelado (el `--if-present` de
 * `.husky/pre-commit` es el mismo criterio). Un paso ausente se anuncia y se salta; lo que NO
 * se hace es abortar la compuerta entera ni, peor, reportar verde por no haber corrido nada.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { changedSinceBase, shouldRunWorkspace } from './verify-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Si el spawn de `pnpm` tiene que pasar por un shell. SOLO EN WINDOWS — y la condición es
 * load-bearing en las dos direcciones, así que no se "simplifica" de vuelta a una constante.
 *
 * POR QUÉ NO SIEMPRE `true` (el bug que esto reemplaza). Con `shell: true` Node NO quotea el
 * argv que se le entrega: lo concatena con espacios en UN solo string y corre
 * `/bin/sh -c "<ese string>"`, así que el shell lo vuelve a interpretar entero. El modo
 * `--quick` le pasa a eslint y a vitest los PATHS DE LOS ARCHIVOS QUE CAMBIARON, y en App
 * Router un route group se escribe `src/app/(protected)/…`: los paréntesis son sintaxis de
 * shell, y la línea truena antes de ejecutar nada. Medido, mismo argumento, misma llamada:
 *
 *     shell: true   →  /bin/sh: syntax error near unexpected token `('   (exit 2)
 *     shell: false  →  corre
 *
 * Como el route group es la convención por DEFECTO de Next, eso dejaba `pnpm verify:quick`
 * inservible en cualquier derivado que la use —reportado desde uno real— y empujaba el bucle
 * de trabajo al `pnpm verify` completo en cada vuelta, que es justo lo que el quick existe
 * para evitar. Los `[slug]` del mismo path son glob de shell: hoy no fallan, pero estaban a un
 * directorio de distancia de expandirse a otra cosa.
 *
 * POR QUÉ TAMPOCO SIEMPRE `false`. En Windows `pnpm` es `pnpm.cmd`, y Node se niega a spawnear
 * un `.cmd` sin shell (la mitigación de CVE-2024-27980). Quitarlo ahí no arreglaría nada: la
 * compuerta no arrancaría. Windows conserva EXACTAMENTE el comportamiento de hoy, bug de
 * quoting incluido; escapar los argumentos para `cmd.exe` es un fix aparte, que nadie ha
 * necesitado todavía y que no se puede probar desde esta suite.
 *
 * Es el mismo criterio y la misma forma que `resolveSpawnShell` en `e2e-runner.ts`, donde el
 * kit ya pagó esta cuenta una vez (ahí el detonante fueron los espacios de `~/Google Drive/…`).
 */
const SPAWN_SHELL = process.platform === 'win32';

/**
 * Los pasos, EN ORDEN Y CON FAIL-FAST — la misma semántica que el `&&` que reemplaza.
 *
 * El orden no es estético: va de lo más barato a lo más caro (lint ~3 s, typecheck ~4 s,
 * test ~18 s medidos en el Factory), así que un error de sintaxis se reporta en segundos en
 * vez de después de la suite completa. Cambiar esto a paralelo es la mejora natural que este
 * archivo habilita, pero NO se hace hoy: el objetivo de este cambio es mover la compuerta de
 * lado, no alterar su comportamiento. Un solo cambio a la vez.
 */
const STEPS = ['lint', 'typecheck', 'test'];

/** Los aliases que este `package.json` realmente define (ver la nota de tolerancia arriba). */
function availableScripts() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return pkg.scripts ?? {};
  } catch {
    // Sin `package.json` legible no hay nada que correr, y fingir que sí lo hay sería el
    // fallo peor de los dos: una compuerta que reporta verde sin haber verificado nada.
    return null;
  }
}

const scripts = availableScripts();
if (scripts === null) {
  console.error('✖ verify: no pude leer package.json — la compuerta no corrió.');
  process.exit(1);
}

/**
 * Los archivos que este árbol de trabajo cambió respecto de `HEAD`: lo staged, lo no staged
 * y lo no trackeado. Los tres importan y por razones distintas — el executor de `/implement`
 * NO commitea (todo su trabajo está sin commitear), un archivo recién creado es justamente el
 * que más probable es que rompa algo, y en un checkout compartido lo staged puede venir de
 * otra sesión. Ante la duda, verificar de más: el modo quick ya es la red barata, achicarla
 * de más la vuelve decorativa.
 */
function changedFiles() {
  const out = [];
  for (const args of [
    ['diff', '--name-only', 'HEAD'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) return null; // sin git utilizable no hay "lo que cambió" que acotar
    out.push(...r.stdout.split('\n').filter(Boolean));
  }
  // Un archivo borrado no se lintea ni se testea, y pasárselo a eslint lo hace fallar.
  return [...new Set(out)].filter((f) => existsSync(path.join(ROOT, f)));
}

const LINTABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Corre un comando acotado; devuelve su exit code (0 = verde). */
function run(label, cmd, args) {
  console.log(`\n▸ verify --quick: ${label}`);
  const { status } = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: SPAWN_SHELL });
  return status ?? 1;
}

if (process.argv.includes('--quick')) {
  const changed = changedFiles();
  if (changed === null) {
    console.error('✖ verify --quick: no pude preguntarle a git qué cambió. Corre `pnpm verify`.');
    process.exit(1);
  }

  const code = changed.filter((f) => LINTABLE.test(f));
  if (code.length === 0) {
    // Sin código cambiado no hay nada que acotar. NO es un verde de la compuerta y se dice así:
    // el usuario tiene que poder distinguir "revisé y está bien" de "no había qué revisar".
    console.log('▸ verify --quick: ningún archivo de código cambiado — nada que verificar.');
    process.exit(0);
  }

  console.log(`▸ verify --quick: ${code.length} archivo(s) de código cambiado(s).`);

  // Orden por costo creciente, para que el error más tonto se reporte primero:
  //   eslint acotado (ms) → typecheck global (~4 s, barato con incremental) → tests related.
  // `typecheck` va completo a propósito: los tipos son globales por naturaleza y acotarlos
  // daría la falsa señal más cara de todas.
  const failed =
    run('eslint (acotado)', 'pnpm', ['exec', 'eslint', ...code]) ||
    run('typecheck (completo)', 'pnpm', ['typecheck']) ||
    // `--passWithNoTests`: que un cambio no tenga ningún test relacionado es información,
    // no un fallo. El gate completo es quien decide si falta cobertura.
    run('tests (related)', 'pnpm', [
      'exec',
      'vitest',
      'related',
      '--run',
      '--passWithNoTests',
      ...code,
    ]);

  if (failed !== 0) {
    console.error(`\n✖ verify --quick: falló (exit ${failed}).`);
    process.exit(failed);
  }

  console.log('\n✔ verify --quick: verde sobre lo que cambió.');
  console.log('  Esto NO cierra nada — el veredicto sigue siendo `pnpm verify` completo.');
  process.exit(0);
}

let ran = 0;
for (const step of STEPS) {
  if (!(step in scripts)) {
    console.warn(`⚠ verify: este repo no define \`${step}\` — lo salto.`);
    continue;
  }

  console.log(`\n▸ verify: ${step}`);
  // El shell SOLO en Windows (ver `SPAWN_SHELL`): es lo que resuelve `pnpm` → `pnpm.cmd` ahí,
  // y en el resto de los sistemas es justamente lo que rompía los paths con paréntesis.
  const { status } = spawnSync('pnpm', [step], { cwd: ROOT, stdio: 'inherit', shell: SPAWN_SHELL });
  if (status !== 0) {
    console.error(`\n✖ verify: \`${step}\` falló (exit ${status}).`);
    process.exit(status ?? 1);
  }
  ran += 1;
}

// Cero pasos corridos NO es verde. Es una compuerta que no verificó nada, y dejarla pasar
// convertiría un `package.json` mal formado en un OK silencioso justo donde más caro sale.
if (ran === 0) {
  console.error('✖ verify: ningún paso disponible — la compuerta no verificó nada.');
  process.exit(1);
}

/**
 * Workspaces hermanos con su propia suite — se corren si existen Y si esta branch los tocó.
 *
 * Los tres pasos de arriba corren en la raíz, y la config de la raíz **excluye** estos
 * directorios a propósito: el `tsconfig.json` no los compila, el `eslint.config.mjs` ignora
 * uno de ellos y `vitest.config.ts` excluye los dos. Sin este bloque, `pnpm verify` daba
 * verde sobre un cambio que vivía entero ahí — una compuerta que no miró una sola línea del
 * código que se le pidió verificar. Ese hueco costó un hallazgo real al cerrar una release.
 *
 * 🔴 **El guard de existencia NO es defensivo, es el mecanismo.** Este archivo viaja a los
 * derivados en los dos perfiles de distribución; `cli/` y `desktop/` **no** — son del origen
 * y sus globs no matchean nada allá. Así que en un derivado el guard nunca dispara y el
 * comportamiento es idéntico al de antes, sin warning ni ruido. Es el mismo patrón que el
 * resto del kit ya usa para tolerar un derivado divergente (el `-f` del pre-commit, el
 * import opcional del setup de vitest, el cargador de fases de e2e).
 *
 * Un derivado que resulte tener su propio `cli/` o `desktop/` con tests corre los suyos, que
 * es lo correcto: el criterio es "hay un workspace con su suite", no "es el Factory".
 *
 * SEGUNDO GUARD: RELEVANCIA. El de existencia decide si el workspace EXISTE; el de relevancia
 * (`shouldRunWorkspace`, en `verify-scope.mjs`) decide si esta branch lo TOCÓ. Se compara contra
 * la base de la branch y no contra `HEAD` porque un cambio ya commiteado desaparece del diff
 * contra `HEAD` — y con él la razón para correr su suite, justo al cerrar el issue. El guard
 * aplica SOLO a los hermanos: los tres pasos de la raíz corren siempre, porque `.claude/**` y
 * `scripts/**` tienen sus tests ahí y un cambio en un hermano puede romper uno de ellos.
 */
/** El runner que `verify-scope` inyecta — el mismo `spawnSync` que ya usa `changedFiles()`. */
const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });

/**
 * Lo que cambió respecto de la base de la branch, calculado UNA sola vez y SOLO si hay algún
 * hermano que verificar. En un derivado no existen `cli/` ni `desktop/`, así que el guard de
 * existencia corta antes y no se paga ni una llamada a git — el comportamiento allá queda idéntico.
 */
let siblingChanges;
function changesForSiblings() {
  if (siblingChanges === undefined) {
    siblingChanges = changedSinceBase(git);
    if (siblingChanges === null) {
      // Ruidoso a propósito: saltarse una suite en silencio es el fallo caro; correrla de más
      // solo cuesta segundos. Quien lo vea sabe POR QUÉ esta corrida no acotó nada.
      console.warn('⚠ verify: git no pudo decirme qué cambió — corro TODOS los hermanos.');
    }
  }
  return siblingChanges;
}

const SIBLING_WORKSPACES = [
  { dir: 'cli', steps: ['test', 'typecheck'] },
  { dir: 'desktop', steps: ['test', 'typecheck', 'lint'] },
];

for (const { dir, steps } of SIBLING_WORKSPACES) {
  const manifest = path.join(ROOT, dir, 'package.json');
  if (!existsSync(manifest)) continue;

  // El guard de RELEVANCIA, después del de existencia: si esta branch no tocó el workspace, su
  // suite no puede haber cambiado de veredicto. Son 12.0 s de los 35.7 s de la compuerta que el
  // commit típico del Factory pagaba sin razón.
  if (!shouldRunWorkspace(dir, changesForSiblings())) {
    console.log(`\n▸ verify: ${dir} — sin cambios en esta branch, lo salto.`);
    continue;
  }

  let own;
  try {
    own = JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {};
  } catch {
    console.error(`✖ verify: \`${dir}/package.json\` no se pudo leer — no lo doy por verde.`);
    process.exit(1);
  }

  for (const step of steps) {
    if (!(step in own)) continue; // el workspace no define ese paso — no es una falla

    console.log(`\n▸ verify: ${dir} — ${step}`);
    const { status } = spawnSync('pnpm', ['-C', dir, step], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: SPAWN_SHELL,
    });
    if (status !== 0) {
      console.error(`\n✖ verify: \`${dir}\` — \`${step}\` falló (exit ${status}).`);
      process.exit(status ?? 1);
    }
    ran += 1;
  }
}

console.log(`\n✔ verify: ${ran} pasos en verde.`);

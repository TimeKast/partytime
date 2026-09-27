/**
 * Qué workspaces hermanos vale la pena verificar en esta corrida — la lógica PURA del guard de
 * relevancia de `verify.mjs`.
 *
 * WHY A FILE OF ITS OWN. `verify.mjs` es un script, no un módulo: corre al importarse (lee el
 * `package.json`, lanza los pasos, llama `process.exit`). Un test que lo importara para probar
 * este guard dispararía la compuerta entera. Sacar la decisión —y SOLO la decisión— acá la vuelve
 * testeable sin reestructurar el script ni inventarle un modo "no ejecutes". Vive en el mismo
 * `scripts/**` que ya viaja en cada `factory update`, así que la mejora sigue llegando a la flota.
 *
 * WHY `git` IS INJECTED. Las tres funciones reciben el runner de git en vez de llamar a
 * `spawnSync` por su cuenta. Es el mismo criterio que `migrateE2EBranch` usa con `fs`: un test
 * prueba la decisión con respuestas fabricadas, sin necesitar un repo real con upstream, branches
 * y commits — que es justo el setup imposible de montar de forma determinista.
 */

/**
 * Paths de la RAÍZ que fuerzan a correr un hermano aunque el diff no toque su directorio.
 *
 * Un test de un workspace hermano puede leer un archivo que vive en la raíz. Hoy la suite de `cli/`
 * lee cuatro: `atomic-swap-track.test.ts` el `distribution/profiles.json` REAL, `package-json.test.ts`
 * el `package.json` de la raíz (anti-drift de los scripts envueltos por la bóveda), y
 * `rail-classification-parity.test.ts` `.claude/policy/vault.json` y `scripts/tools/lib/rail.sh`. Un
 * cambio a cualquiera de ellos rompe la suite de `cli/` sin tocar una sola línea bajo `cli/`. Sin
 * esta tabla el guard lo saltaría y la compuerta daría verde sobre una suite rota.
 *
 * 📌 La regla, para el próximo: si un test de un hermano lee un archivo de la raíz, ese archivo va
 * acá. Mantener la tabla es más barato que descubrir el hueco cerrando un release.
 */
export const ROOT_PATHS_FORCING_SIBLING = {
  'distribution/profiles.json': ['cli'],
  'package.json': ['cli'],
  '.claude/policy/vault.json': ['cli'],
  'scripts/tools/lib/rail.sh': ['cli'],
};

/**
 * Contra qué se compara, en orden de preferencia.
 *
 * Los remotos van ANTES que los locales a propósito. Parado en `develop`, `git merge-base HEAD
 * develop` es `HEAD` mismo: el diff sale vacío y el guard no vería nada de lo commiteado — que es
 * exactamente el agujero que este cambio viene a cerrar. `origin/develop` sí deja ver lo que
 * todavía no se pusheó.
 */
export const BASE_CANDIDATES = ['@{upstream}', 'origin/develop', 'origin/main', 'develop', 'main'];

/**
 * El primer candidato contra el que git sepa calcular un ancestro común, ya resuelto a SHA.
 * `null` = ninguno resolvió (checkout sin historia, worktree raro, repo recién inicializado).
 */
export function resolveBase(git, candidates = BASE_CANDIDATES) {
  for (const candidate of candidates) {
    const r = git(['merge-base', 'HEAD', candidate]);
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

/**
 * Los archivos que cambiaron respecto de la BASE de la branch — no de `HEAD`.
 *
 * 🔴 POR QUÉ NO REUSAR `changedFiles()` DE `verify.mjs`. Esa función acota contra `HEAD` a
 * propósito, porque alimenta a `--quick`: ahí lo que importa es lo que todavía NO está commiteado.
 * Esta pregunta es la contraria. Un cambio de `cli/` YA COMMITEADO desaparece del diff contra
 * `HEAD`, y con él desaparecería la razón para correr la suite de `cli/` — la compuerta daría verde
 * saltándose el único código que se le pidió verificar, justo en el cierre de issue, que es cuando
 * tiene que morder. Y darle merge-base a `changedFiles()` en vez de escribir ESTA arreglaría el
 * guard rompiendo el quick: en una branch de varios días son cientos de archivos, y la señal barata
 * acabaría costando más que la cara.
 *
 * El diff contra el merge-base ya trae lo commiteado, lo staged y lo no staged; lo untracked hay
 * que pedirlo aparte. A diferencia de `changedFiles()`, acá NO se filtran los borrados: borrar un
 * archivo bajo `cli/` es justamente una razón para correr su suite.
 *
 * `null` significa "no pude saberlo", que NO es lo mismo que "no cambió nada" — quien llama decide.
 */
export function changedSinceBase(git) {
  const base = resolveBase(git);
  if (base === null) return null;

  const out = [];
  for (const args of [
    ['diff', '--name-only', base],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    const r = git(args);
    if (r.status !== 0) return null;
    out.push(...r.stdout.split('\n').filter(Boolean));
  }
  return [...new Set(out)];
}

/**
 * ¿Corre este workspace? Sí si el diff toca su directorio, o si toca un path de la raíz que la
 * tabla declara como suyo.
 *
 * `changed === null` (git no contestó) corre que sí: una compuerta que no puede saber qué cambió
 * verifica de más, nunca de menos. Es el mismo criterio que ya declara `changedFiles()`.
 */
export function shouldRunWorkspace(dir, changed, forcing = ROOT_PATHS_FORCING_SIBLING) {
  if (changed === null) return true;
  const prefix = `${dir}/`;
  return changed.some((file) => file.startsWith(prefix) || (forcing[file] ?? []).includes(dir));
}

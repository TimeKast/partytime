#!/usr/bin/env node
/**
 * with-vault — runs a kit script with the repo's vault environment injected (VAULT-003).
 *
 * Usage (from `package.json`):  node scripts/tools/with-vault.mjs [--vault-env=<env>] <command> [args...]
 *
 * `--vault-env` is the environment a script DECLARES (`db:query:main` → `main`, `setup:e2e*` →
 * `develop`); it wins over `TK_VAULT_ENV`, so a stray export in the shell cannot move a script
 * that names its environment. A flag rather than an inline `TK_VAULT_ENV=… node …` assignment,
 * which a Windows shell cannot parse.
 *
 * A repo linked to the org secrets vault (the `vault` block of `.timekast/provision.json`) has no
 * `.env.local`: `pnpm dev`, `build`, `test:e2e`, `db:*`… get their variables from here. The wrapper
 * reads the environment `TK_VAULT_ENV` names (default: the block's `local`) with the PERSON's
 * `infisical` session and spawns the command with those values in its environment — in memory,
 * never on disk. Contract: `fx-secrets-vault §7` · layout and precedence: ADR-005 §6.
 *
 * PASSTHROUGH (the command runs exactly as given — same argv, same env, inherited stdio, same exit
 * code, `infisical` never invoked) when ANY of:
 *   - the marker {@link VAULT_WRAPPER_MARKER} is already set: a NESTED call inside a wrapped process
 *     (the E2E runner's `pnpm db:migrate` with its ephemeral branch URL, `prebuild` →
 *     `generate:email-logo`, `evidence:visual` → `test:e2e`). Re-injecting there would clobber
 *     what the parent just set;
 *   - `VERCEL`, `CI` or `RAILWAY_ENVIRONMENT` is set, or `TK_VAULT=off` (nobody to log in there);
 *   - the repo has no `vault` block (it works with `.env.local`, as before).
 *
 * PRECEDENCE on a first-level call: `TK_ENV_OVERRIDE` file > vault > parent environment. The
 * parent keys the vault overrode and the keys the override file set are reported BY NAME.
 *
 * HOW IT READS. `infisical run` injects one folder per run, and the wrapper must both combine
 * `main:/` + `main:/ci` (`/ci` wins: the direct connection string of main) and know which keys it
 * set (to name what it overrode and to layer `TK_ENV_OVERRIDE` on top). So it reads each folder
 * with `infisical export --format=json` into memory and spawns the command with the merged env.
 * `--domain` is always explicit, and `INFISICAL_DOMAIN` is pinned next to it (`fx-secrets-vault
 * §3`): the domain the CLI remembers from the last login never decides.
 *
 * 🔴 The wrapper never handles the session token: the liveness check discards `infisical`'s
 * output (only the exit code is read) and every read is delegated to the `infisical` binary. It
 * adds no `INFISICAL_TOKEN` to any environment.
 * 🔴 NO-ECHO: no value is ever printed or written. When an `infisical` call fails, its stdout and
 * stderr are dropped (they may carry values); the wrapper prints its own message.
 *
 * Builtins only — it wraps `build`/`start`, so it runs with plain `node` before anything else.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import path from 'node:path';

import { isMainModule } from './lib/is-main-module.mjs';

/**
 * The marker a wrapper that INJECTED exports to its child: the name of the environment it
 * resolved (`local` / `develop` / `main`), never a value. Present at start-up → nested call →
 * passthrough. It is also the environment proof `db:query:main` relies on (VAULT-005).
 */
export const VAULT_WRAPPER_MARKER = 'TK_VAULT_INJECTED';

/** Selects the vault environment to inject. Default: the block's `local`. */
export const VAULT_ENV_VAR = 'TK_VAULT_ENV';

/** Leading wrapper flag: the environment a script declares (wins over {@link VAULT_ENV_VAR}). */
export const VAULT_ENV_FLAG = '--vault-env=';

/** Path of a dotenv file whose keys win over the vault for ONE run. */
export const ENV_OVERRIDE_VAR = 'TK_ENV_OVERRIDE';

/** `TK_VAULT=off` turns the wrapper into a passthrough. */
export const VAULT_SWITCH_VAR = 'TK_VAULT';

/** Environment variables that mean "no person here" — the wrapper passes through. */
export const PASSTHROUGH_SIGNALS = Object.freeze(['VERCEL', 'CI', 'RAILWAY_ENVIRONMENT']);

/**
 * The ONLY script allowed to read `main` (production) from a laptop. Any other script asking for
 * `main` is refused before touching the vault, so `TK_VAULT_ENV=main pnpm db:migrate` cannot write
 * production. Identified by `npm_lifecycle_event`, which pnpm sets to the script's name.
 */
export const MAIN_ONLY_SCRIPT = 'db:query:main';

/** Repo-relative location of the repo ↔ vault link (written by `factory provision`). */
export const PROVISION_STATE_PATH = '.timekast/provision.json';

/** Repo-relative location of the vault coordinates (domain). */
export const VAULT_POLICY_PATH = '.claude/policy/vault.json';

/** The folder of `main` that holds the DIRECT connection string (ADR-005). */
const MAIN_CI_PATH = '/ci';
const ROOT_PATH = '/';

/** Time budget of each `infisical` call. */
const INFISICAL_TIMEOUT_MS = 60_000;

const LOGIN_HINT = (domain) => `infisical login --domain=${domain}`;

/** A wrapper failure: printed as its message alone, exit 1. */
class WrapperError extends Error {}

/**
 * One line to stderr. `writeSync` on purpose: a pipe write is async on macOS, and the
 * `process.exit` that follows an error would truncate the message.
 *
 * @param {string} message
 */
function note(message) {
  writeSync(2, `with-vault: ${message}\n`);
}

/**
 * Parse a dotenv-style file into key → value. `KEY=value`, optional `export ` prefix, surrounding
 * quotes stripped, `#` comment lines and blank lines skipped.
 *
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function parseEnvFile(text) {
  const entries = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const body = line.startsWith('export ') ? line.slice('export '.length).trimStart() : line;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    entries.set(key, value);
  }
  return entries;
}

/**
 * Layer the environments: parent < vault < override. Returns the child env and the NAMES to
 * report — never values.
 *
 * @param {Record<string, string | undefined>} parent
 * @param {Map<string, string>} vault
 * @param {Map<string, string> | null} override
 * @returns {{ env: Record<string, string | undefined>, parentOverridden: string[], overridden: string[], added: string[] }}
 */
export function mergeEnvironments(parent, vault, override) {
  const env = { ...parent };
  const parentOverridden = [];
  for (const [key, value] of vault) {
    if (parent[key] !== undefined && parent[key] !== value) parentOverridden.push(key);
    env[key] = value;
  }
  const overridden = [];
  const added = [];
  if (override) {
    for (const [key, value] of override) {
      (vault.has(key) ? overridden : added).push(key);
      env[key] = value;
    }
  }
  return {
    env,
    parentOverridden: parentOverridden.sort(),
    overridden: overridden.sort(),
    added: added.sort(),
  };
}

/**
 * Read the `vault` block of the provision state. `null` = no file or no block (passthrough).
 * A file that cannot be parsed, or a block with the wrong shape, is an ERROR — "I could not tell"
 * must not read as "no vault". The shape mirrors `asVaultState` of `cli/src/lib/provision-state.ts`;
 * `with-vault.test.ts` builds the block with that module's `buildVaultState`.
 *
 * @param {string} rootDir
 * @returns {{ projectId: string, envs: { main: string, develop: string, local: string } } | null}
 */
export function readVaultBlock(rootDir) {
  const file = path.join(rootDir, PROVISION_STATE_PATH);
  if (!existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new WrapperError(
      `no pude leer \`${PROVISION_STATE_PATH}\` para saber si este repo vive en la bóveda. ` +
        `Restáuralo desde git (\`git checkout -- ${PROVISION_STATE_PATH}\`) o corrígelo a mano. ` +
        'No lo reconstruyas con `factory provision --adopt`: sin poder leerlo, el adopt pierde el bloque `vault`.'
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // Not an object → not a state: fail closed like an unparseable file (never "no vault").
    throw new WrapperError(
      `\`${PROVISION_STATE_PATH}\` no es un objeto JSON. ` +
        `Restáuralo desde git (\`git checkout -- ${PROVISION_STATE_PATH}\`) o corrígelo a mano.`
    );
  }
  const block = parsed.vault;
  if (block === undefined) return null;
  const envs = block && typeof block === 'object' ? block.envs : undefined;
  const ok =
    block !== null &&
    typeof block === 'object' &&
    !Array.isArray(block) &&
    typeof block.projectId === 'string' &&
    block.projectId.trim() !== '' &&
    envs !== null &&
    typeof envs === 'object' &&
    typeof envs.main === 'string' &&
    typeof envs.develop === 'string' &&
    typeof envs.local === 'string';
  if (!ok) {
    throw new WrapperError(
      `el bloque \`vault\` de \`${PROVISION_STATE_PATH}\` no tiene la forma esperada ` +
        '(`projectId` + `envs.main`/`envs.develop`/`envs.local`). Corrígelo a mano: si el repo está ' +
        'en la bóveda, escribe el bloque con esa forma; si no lo está, borra el bloque.'
    );
  }
  return { projectId: block.projectId, envs: { main: envs.main, develop: envs.develop, local: envs.local } };
}

/**
 * The vault domain from `.claude/policy/vault.json`.
 *
 * @param {string} rootDir
 * @returns {string}
 */
export function readVaultDomain(rootDir) {
  const file = path.join(rootDir, VAULT_POLICY_PATH);
  const fail = () =>
    new WrapperError(
      `falta \`${VAULT_POLICY_PATH}\`, o está ilegible o incompleto. En un proyecto derivado ` +
        'recupéralo con `factory update` (fx-secrets-vault §3, "Recuperar vault.json").'
    );
  if (!existsSync(file)) throw fail();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw fail();
  }
  const domain = parsed && typeof parsed === 'object' ? parsed.domain : undefined;
  if (typeof domain !== 'string' || !/^https:\/\/[^/\s]+$/.test(domain)) throw fail();
  return domain;
}

/**
 * Why the wrapper must pass through, or `null` when it should inject.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function passthroughReason(env) {
  if (env[VAULT_SWITCH_VAR]?.toLowerCase() === 'off') return `${VAULT_SWITCH_VAR}=off`;
  for (const signal of PASSTHROUGH_SIGNALS) {
    if (env[signal] !== undefined && env[signal] !== '') return signal;
  }
  return null;
}

/**
 * Run `infisical` synchronously with the domain pinned. stdio is NEVER inherited: stdout/stderr
 * may carry values, so the caller decides what (if anything) to read and nothing is echoed.
 *
 * @param {string[]} args
 * @param {string} domain
 * @param {'ignore' | 'pipe'} output
 */
function runInfisical(args, domain, output) {
  const result = spawnSync('infisical', args, {
    env: { ...process.env, INFISICAL_DOMAIN: domain },
    stdio: ['ignore', output, output],
    encoding: 'utf8',
    timeout: INFISICAL_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  });
  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === 'ENOENT') {
    throw new WrapperError(
      '`infisical` no está instalado. Instálalo con `brew install infisical` y entra con ' +
        `\`${LOGIN_HINT(domain)}\`.`
    );
  }
  if (result.error || result.signal) {
    throw new WrapperError(
      'la bóveda no respondió a tiempo (o `infisical` terminó de forma inesperada). Reintenta; ' +
        'si persiste, revisa la red y la versión de `infisical` (`brew upgrade infisical`).'
    );
  }
  return result;
}

/**
 * Fail before running anything when there is no live session. Reads the EXIT CODE only — the
 * token `infisical` would print goes to /dev/null and never reaches this process.
 *
 * @param {string} domain
 */
function assertSession(domain) {
  const result = runInfisical(['user', 'get', 'token', `--domain=${domain}`, '--plain'], domain, 'ignore');
  if (result.status !== 0) {
    throw new WrapperError(
      `no hay sesión de la bóveda (o caducó). Entra con \`${LOGIN_HINT(domain)}\` y vuelve a correr ` +
        'el comando.'
    );
  }
}

/**
 * Read one folder of one environment into memory.
 *
 * @param {{ domain: string, projectId: string, env: string, folder: string }} target
 * @returns {Map<string, string>}
 */
function exportFolder({ domain, projectId, env, folder }) {
  const result = runInfisical(
    [
      'export',
      `--domain=${domain}`,
      `--projectId=${projectId}`,
      `--env=${env}`,
      `--path=${folder}`,
      '--format=json',
      '--silent',
    ],
    domain,
    'pipe'
  );
  const where = `\`${env}:${folder}\` del proyecto \`${projectId}\``;
  if (result.status !== 0) {
    // Its output is DROPPED on purpose: an error of the export may quote a value.
    throw new WrapperError(
      `no pude leer ${where} (\`infisical export\` salió con ${result.status}). Con la sesión ` +
        'viva, lo más común es no tener acceso a ese proyecto: pídelo a un admin de la bóveda.'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    // A new message on purpose: Node's own `JSON.parse` error quotes a fragment of the input.
    parsed = undefined;
  }
  const unrecognized = () =>
    new WrapperError(
      `no reconozco la respuesta de \`infisical export\` para ${where}. Revisa la versión de ` +
        '`infisical` (`brew upgrade infisical`) y reporta el caso al equipo del Factory.'
    );
  if (!Array.isArray(parsed)) throw unrecognized();
  const secrets = new Map();
  for (const entry of parsed) {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      typeof entry.key !== 'string' ||
      typeof entry.value !== 'string'
    ) {
      throw unrecognized();
    }
    secrets.set(entry.key, entry.value);
  }
  return secrets;
}

/**
 * The values of the requested environment: `main` = `main:/` with `main:/ci` on top (`/ci` wins);
 * any other environment = its root, with its imports already flattened by `infisical`.
 *
 * @param {{ domain: string, projectId: string, env: string, mainEnv: string }} target
 * @returns {Map<string, string>}
 */
function readVaultEnvironment({ domain, projectId, env, mainEnv }) {
  const root = exportFolder({ domain, projectId, env, folder: ROOT_PATH });
  if (env !== mainEnv) return root;
  const ci = exportFolder({ domain, projectId, env, folder: MAIN_CI_PATH });
  return new Map([...root, ...ci]);
}

/**
 * Read the `TK_ENV_OVERRIDE` file, or `null` when the variable is unset. A missing or unreadable
 * file is an error that names the path — never ignored.
 *
 * @param {string | undefined} rawPath
 * @param {string} rootDir
 * @returns {Map<string, string> | null}
 */
function readOverride(rawPath, rootDir) {
  if (rawPath === undefined || rawPath === '') return null;
  const file = path.resolve(rootDir, rawPath);
  try {
    return parseEnvFile(readFileSync(file, 'utf8'));
  } catch {
    throw new WrapperError(
      `\`${ENV_OVERRIDE_VAR}\` apunta a \`${rawPath}\` y no pude leer ese archivo. Revisa la ruta ` +
        `(o quita \`${ENV_OVERRIDE_VAR}\` para usar sólo la bóveda).`
    );
  }
}

/**
 * Decide what to run. Throws {@link WrapperError} on every refusal; returns the environment the
 * command gets and whether it was injected.
 *
 * @param {Record<string, string | undefined>} parentEnv
 * @param {string} rootDir
 * @param {string | null} declaredEnv - the script's `--vault-env`, if any.
 * @returns {{ env: Record<string, string | undefined>, injected: string | null }}
 */
function resolveEnvironment(parentEnv, rootDir, declaredEnv) {
  const inherited = parentEnv[VAULT_WRAPPER_MARKER];
  if (inherited !== undefined && inherited !== '') {
    note(`llamada anidada: hereda el entorno \`${inherited}\` del proceso que la lanzó (sin inyectar).`);
    return { env: parentEnv, injected: null };
  }
  if (passthroughReason(parentEnv) !== null) return { env: parentEnv, injected: null };

  const block = readVaultBlock(rootDir);
  if (!block) return { env: parentEnv, injected: null };

  const requested = declaredEnv || parentEnv[VAULT_ENV_VAR] || block.envs.local;
  const valid = [block.envs.local, block.envs.develop, block.envs.main];
  if (!valid.includes(requested)) {
    throw new WrapperError(
      `el entorno \`${requested}\` no es de este repo. Válidos: ${valid
        .map((e) => `\`${e}\``)
        .join(', ')}.`
    );
  }
  if (requested === block.envs.main && parentEnv.npm_lifecycle_event !== MAIN_ONLY_SCRIPT) {
    throw new WrapperError(
      `el entorno \`${block.envs.main}\` (producción) sólo es para \`pnpm ${MAIN_ONLY_SCRIPT}\`. ` +
        'Ningún otro script lee producción desde tu máquina.'
    );
  }

  const domain = readVaultDomain(rootDir);
  const override = readOverride(parentEnv[ENV_OVERRIDE_VAR], rootDir);

  assertSession(domain);
  const vault = readVaultEnvironment({
    domain,
    projectId: block.projectId,
    env: requested,
    mainEnv: block.envs.main,
  });

  const merged = mergeEnvironments(parentEnv, vault, override);
  merged.env[VAULT_WRAPPER_MARKER] = requested;

  note(`entorno \`${requested}\` de la bóveda inyectado (${vault.size} claves).`);
  if (merged.parentOverridden.length > 0) {
    note(`pisé estas claves de tu entorno con las de la bóveda: ${merged.parentOverridden.join(', ')}`);
  }
  if (merged.overridden.length > 0) {
    note(`${ENV_OVERRIDE_VAR} pisó (sólo en esta corrida): ${merged.overridden.join(', ')}`);
  }
  if (merged.added.length > 0) {
    note(`${ENV_OVERRIDE_VAR} agregó claves que la bóveda no tiene: ${merged.added.join(', ')}`);
  }
  if (existsSync(path.join(rootDir, '.env.local'))) {
    note(
      'hay un `.env.local` en este repo: no lo leo, pero Next.js sí lo carga y sus claves sueltas ' +
        'se cuelan. Retíralo (fx-secrets-vault §7).'
    );
  }
  return { env: merged.env, injected: requested };
}

/**
 * Spawn the command with inherited stdio, forward termination signals to it, and mirror its exit.
 *
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 */
function runCommand(argv, env) {
  const [command, ...args] = argv;
  const child = spawn(command, args, {
    env,
    stdio: 'inherit',
    // Windows needs a shell to resolve `.cmd` shims (`next.cmd`, `tsx.cmd`); POSIX never does.
    shell: process.platform === 'win32',
  });
  /** @type {NodeJS.Signals[]} */
  const forwarded = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handlers = forwarded.map((signal) => {
    const handler = () => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    };
    process.on(signal, handler);
    return /** @type {[NodeJS.Signals, () => void]} */ ([signal, handler]);
  });
  child.on('error', (error) => {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code;
    note(
      code === 'ENOENT'
        ? `no encontré el comando \`${command}\`.`
        : `no pude arrancar \`${command}\`.`
    );
    process.exit(127);
  });
  child.on('exit', (code, signal) => {
    for (const [sig, handler] of handlers) process.off(sig, handler);
    if (signal) {
      // Re-raise with the default disposition so the caller sees the same death.
      process.kill(process.pid, signal);
      process.exit(128 + (osConstants.signals[signal] ?? 0));
    }
    process.exit(code ?? 1);
  });
}

function main() {
  let argv = process.argv.slice(2);
  let declaredEnv = null;
  if (argv[0]?.startsWith(VAULT_ENV_FLAG)) {
    declaredEnv = argv[0].slice(VAULT_ENV_FLAG.length);
    argv = argv.slice(1);
  }
  if (argv.length === 0) {
    note('uso: node scripts/tools/with-vault.mjs [--vault-env=<entorno>] <comando> [args...]');
    process.exit(2);
  }
  let resolved;
  try {
    resolved = resolveEnvironment(process.env, process.cwd(), declaredEnv);
  } catch (error) {
    if (error instanceof WrapperError) {
      note(error.message);
      process.exit(1);
    }
    note('falló de forma inesperada antes de correr el comando.');
    process.exit(1);
  }
  runCommand(argv, resolved.env);
}

if (isMainModule(import.meta.url, process.argv[1])) main();

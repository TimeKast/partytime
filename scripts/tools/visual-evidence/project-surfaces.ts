/**
 * Visual evidence — loading the PROJECT's own surface list, the harness's extension point.
 *
 * 🔴 WHY THIS LIVES IN ITS OWN MODULE AND NOT IN `./capture`. Three constraints meet here and
 * only this shape satisfies all three at once:
 *
 *   1. `capture.ts` must not name a single specifier outside this directory — that is the written
 *      invariant of the directory (`./readiness`, header) and it is checked as a whole-file
 *      property (`grep -nE "(from ['\"]|import\()"`), so an `import(...)` of the project's file
 *      would fail it just as loudly as a static `from '../../..'`. The check includes the dynamic
 *      form ON PURPOSE: the dependency this directory exists to refuse (`AUTH_FILES`) is reachable
 *      by a relative path, so a rule about `@/` prefixes would not have caught it.
 *   2. **Something of the KIT has to be the one that invokes it.** That is property 2 of
 *      `fx-extension-points §2` ("algo del kit lo invoca de verdad"), and it is what separates an
 *      extension point from a naming convention nobody reads. Injecting the list from
 *      `tests/e2e/visual.evidence.spec.ts` would work mechanically and put the invocation in a
 *      DEV-OWNED file frozen at bootstrap — the point would be listed in an inventory of things
 *      the kit invokes while the kit invoked nothing.
 *   3. A derivative that does not have `tests/e2e/visual-evidence.surfaces.ts` — every derivative,
 *      until it adopts the harness — must keep working. A static import from a travelling module
 *      would break `factory update` for the whole fleet on the day it shipped.
 *
 * So the load is an existence guard plus a lazy `require`, which is the kit's canonical shape for
 * anything dev-owned (`scripts/tools/e2e.project.ts`, `preflight.project.ts` — see
 * `loadProjectPhases` in `scripts/tools/e2e-runner.ts`, the precedent this follows line for line),
 * and it happens HERE, in a sibling that travels with the rest of the directory, so `capture.ts`
 * keeps an import surface that is trivially verifiable.
 *
 * WHAT THE OTHER TWO OPTIONS WOULD HAVE COST (recorded because the decision is the deliverable,
 * not the code):
 *   · **(a) a static relative import from the travelling module** — a hard dependency on a file no
 *     derivative has yet: every project in the fleet would fail to load this directory after an
 *     update, over a capability it was not using.
 *   · **(b) injection from the spec** — mechanically fine, and it is what breaks property 2 above:
 *     the invoker becomes a file the kit neither ships nor refreshes, so the inventory row would
 *     claim an invocation that no travelling file performs.
 *
 * @see `.claude/skills/fx-extension-points/SKILL.md` §2 (the three properties) and §3 (the row)
 * @see `.claude/skills/fx-visual-evidence/SKILL.md` §4 (the two halves of the list)
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { VisualEvidenceError } from './manifest';
import type { VisualSurface, VisualViewport } from './surfaces';

/** The project's own list, relative to the checkout root. Dev-owned; no profile ships it. */
export const PROJECT_SURFACES_PATH = 'tests/e2e/visual-evidence.surfaces.ts';

/** What a project declares: screens it adds, kit screens it does not have, widths of its own. */
export interface ProjectSurfaceLists {
  /** Screens of this project, added to (or replacing, by name) the kit's. */
  surfaces: VisualSurface[];
  /** Kit surfaces this app does not have, by name — SUBTRACTIVE, unlike every other point. */
  excluded: string[];
  /**
   * Widths of this project, added to (or replacing, by name) the kit's three (`mergeViewports`).
   * Empty is the normal state and means "the kit's three are the whole axis".
   */
  viewports: VisualViewport[];
  /**
   * CSS selectors whose text the contrast measurement treats as decorative (`notApplicable`), for
   * text that cannot carry `aria-hidden` in the DOM. Empty is the normal state. The granularity
   * between "this element" and "this whole screen" that `excluded` alone did not offer.
   */
  contrastExclusions: string[];
  /** Whether the file was there at all. `absent` is the normal state of a fresh derivative. */
  source: 'absent' | 'loaded';
}

/** The export a project's file uses to declare its widths. Named here so the error can cite it. */
export const PROJECT_VIEWPORTS_EXPORT = 'PROJECT_VIEWPORTS';

/** The export a project's file uses to exempt selectors from the contrast measurement. */
export const CONTRAST_EXCLUSIONS_EXPORT = 'EXCLUDED_CONTRAST_SELECTORS';

/** Injectable seams, so the tolerance table is assertable without touching a filesystem. */
export interface ProjectSurfaceLoaderDeps {
  /** Checkout root. Defaults to the repository this directory sits in. */
  rootDir?: string;
  exists?: (target: string) => boolean;
  load?: (target: string) => unknown;
}

/** The root of the checkout — `scripts/tools/visual-evidence/` is three levels down. */
function defaultRootDir(): string {
  return path.resolve(__dirname, '../../..');
}

/**
 * Read the project's surface lists, or hand back two empty ones.
 *
 * ABSENT IS THE NORMAL STATE and produces no warning: the kit's four screens are then the whole
 * matrix, which is exactly what a project that never adopted the harness should get.
 *
 * PRESENT BUT UNLOADABLE IS FATAL, never a silent skip — same call `loadProjectPhases` makes for
 * `e2e.project.ts`. A file the project wrote and this could not read is a defect the project can
 * fix; continuing "with the kit's four" would photograph a matrix nobody asked for and report it
 * as the audit that was requested.
 */
export function loadProjectSurfaces(deps: ProjectSurfaceLoaderDeps = {}): ProjectSurfaceLists {
  const rootDir = deps.rootDir ?? defaultRootDir();
  const target = path.resolve(rootDir, PROJECT_SURFACES_PATH);
  const exists = deps.exists ?? existsSync;

  if (!exists(target)) {
    return { surfaces: [], excluded: [], viewports: [], contrastExclusions: [], source: 'absent' };
  }

  // `createRequire` rather than a bare `require`: the same CommonJS resolution (so whichever
  // loader is already transpiling THIS file handles the `.ts` sibling too) without the import
  // form eslint bans in TypeScript. Built lazily — a run without the file must not pay for it.
  const load = deps.load ?? ((module: string) => createRequire(__filename)(module));

  let loaded: unknown;
  try {
    loaded = load(target);
  } catch (error) {
    throw new VisualEvidenceError(
      `${PROJECT_SURFACES_PATH} existe pero no se pudo cargar: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }

  return interpretProjectSurfaces(loaded);
}

/** Is this an array? Reported by name so the message says which export is wrong. */
function requireArray(value: unknown, exportName: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new VisualEvidenceError(
      `${PROJECT_SURFACES_PATH} exporta '${exportName}' y no es un arreglo (es ${typeof value}). ` +
        'Las listas del proyecto son arreglos; una lista mal formada dejaría la matriz ' +
        'silenciosamente distinta de la que el equipo declaró.'
    );
  }
  return value;
}

/**
 * Validate the SHAPE of what the module exported — never the content of each surface.
 *
 * The per-surface rules (a name that is a legal file segment) belong to `mergeSurfaceLists`, which
 * applies them to the kit's list and the project's alike. Re-checking them here would be a second
 * copy of a rule that already has one owner.
 */
export function interpretProjectSurfaces(loaded: unknown): ProjectSurfaceLists {
  if (loaded === null || typeof loaded !== 'object') {
    throw new VisualEvidenceError(
      `${PROJECT_SURFACES_PATH} no exportó un módulo legible (se obtuvo ${typeof loaded}). ` +
        'Debe exportar `PROJECT_SURFACES` y `EXCLUDED_KIT_SURFACES`.'
    );
  }

  const exported = loaded as Record<string, unknown>;
  const surfaces = requireArray(exported.PROJECT_SURFACES, 'PROJECT_SURFACES') as VisualSurface[];
  // The one per-surface field checked HERE: `prepare` is behaviour the project wrote, and a value
  // that is not callable would fail minutes later, inside the loop, as a bare TypeError.
  surfaces.forEach((surface, index) => {
    const prepare = (surface as { prepare?: unknown }).prepare;
    if (prepare !== undefined && typeof prepare !== 'function') {
      throw new VisualEvidenceError(
        `${PROJECT_SURFACES_PATH}: PROJECT_SURFACES[${index}] ('${String(surface?.name)}') declara ` +
          `'prepare' y no es una función (es ${typeof prepare}). Es el paso que deja la pantalla ` +
          'en el estado a fotografiar: async (page) => { … }, y devuelve false si no hay datos.'
      );
    }
  });
  const excluded = requireArray(exported.EXCLUDED_KIT_SURFACES, 'EXCLUDED_KIT_SURFACES');

  for (const name of excluded) {
    if (typeof name !== 'string') {
      throw new VisualEvidenceError(
        `${PROJECT_SURFACES_PATH} declara una exclusión que no es un texto (${typeof name}). ` +
          'EXCLUDED_KIT_SURFACES es una lista de NOMBRES de superficies del kit.'
      );
    }
  }

  const viewports = requireArray(exported[PROJECT_VIEWPORTS_EXPORT], PROJECT_VIEWPORTS_EXPORT).map(
    (entry, index) => interpretProjectViewport(entry, index)
  );

  const contrastExclusions = requireArray(
    exported[CONTRAST_EXCLUSIONS_EXPORT],
    CONTRAST_EXCLUSIONS_EXPORT
  );
  for (const selector of contrastExclusions) {
    if (typeof selector !== 'string' || selector.trim() === '') {
      throw new VisualEvidenceError(
        `${PROJECT_SURFACES_PATH} declara en ${CONTRAST_EXCLUSIONS_EXPORT} una entrada que no es ` +
          `un selector CSS (${JSON.stringify(selector)}). Es una lista de selectores cuyo texto se ` +
          'reporta como decorativo (notApplicable) en vez de medirse.'
      );
    }
  }

  return {
    surfaces,
    excluded: excluded as string[],
    viewports,
    contrastExclusions: (contrastExclusions as string[]).map((selector) => selector.trim()),
    source: 'loaded',
  };
}

/**
 * One width as the project wrote it, checked field by field.
 *
 * Checked HERE and not left to the browser: a `width` that is not a positive integer reaches
 * `browser.newContext({ viewport })` as a Playwright error naming neither the file nor the entry,
 * minutes into a run that already built and served the app. The name's validity as a file segment
 * is `mergeViewports`'s to check — one owner per rule, same split as the surfaces.
 */
function interpretProjectViewport(entry: unknown, index: number): VisualViewport {
  const where = `${PROJECT_SURFACES_PATH}: ${PROJECT_VIEWPORTS_EXPORT}[${index}]`;
  const record =
    typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : null;
  if (!record || typeof record.name !== 'string' || record.name === '') {
    throw new VisualEvidenceError(
      `${where} no tiene 'name' (un texto). Cada ancho del proyecto lleva name, width y height; ` +
        'el nombre es un segmento del archivo de cada captura tomada a ese ancho.'
    );
  }
  for (const field of ['width', 'height'] as const) {
    const value = record[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new VisualEvidenceError(
        `${where} ('${record.name}'): '${field}' debe ser un entero positivo en píxeles ` +
          `(se obtuvo ${JSON.stringify(value)}).`
      );
    }
  }
  if (record.why !== undefined && typeof record.why !== 'string') {
    throw new VisualEvidenceError(
      `${where} ('${record.name}'): 'why' es opcional, pero si está debe ser un texto — la razón ` +
        'por la que ese ancho entra en la matriz, tal como la leerá quien revise el manifest.'
    );
  }
  return {
    name: record.name,
    width: record.width as number,
    height: record.height as number,
    ...(record.why !== undefined ? { why: record.why as string } : {}),
  };
}

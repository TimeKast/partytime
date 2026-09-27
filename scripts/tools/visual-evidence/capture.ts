/**
 * Visual evidence — THE CAPTURE ITSELF, on the side that travels.
 *
 * 🔴 THIS FILE IS A DECLARED BORDER, NOT A MOVE. All of this logic used to live in
 * `tests/e2e/visual.evidence.spec.ts`, which is born with a project and which no `factory update`
 * ever rewrites (`tests/**` is not a tracked path — BR-FACTORY-006). Every fix to how a screen is
 * photographed therefore repaired the Factory and nothing else. `scripts/**` IS tracked, so a fix
 * written here reaches the fleet on the next update — which is the whole reason the border was
 * drawn, and the reason it has to be drawn exactly here:
 *
 * | Crosses into this module (travels)                              | Stays injected from the shell (frozen side)                          |
 * | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
 * | The matrix: surfaces × themes × widths × the states each surface declares | The active skin's name and its theme list (`@/config/skins` — `src/`) |
 * | The loop over viewport × theme × state, and its per-capture budget | The browser itself: opening a page for a `(surface, viewport)` pair  |
 * | The NINE ordered steps of one capture (numbered below)          | Every page operation (`goto`, `reload`, `evaluate`, `focus`, `screenshot`, …) |
 * | The file name of each capture (`captureFileName`, `./manifest`) | The "zero placeholders" assertion, which today is `expect` of Playwright |
 * | Which failures a KIT surface may be skipped for — a role this checkout does not have INCLUDED | The LOOKUP of a role's saved session file (`AUTH_FILES` of `tests/fixtures/`) |
 *
 * WHY THAT CUT AND NOT ANOTHER. The directory has a written invariant — `./readiness`, header:
 * no module of it imports from `src/` or from the browser stack, and the wait it needs arrives as
 * a function. This file obeys the same rule, and the rule is verified over the file's WHOLE set of
 * specifiers (`grep -nE "(from ['\"]|import\()" scripts/tools/visual-evidence/capture.ts`), never
 * over a prefix: the dependency this border exists to cut — `AUTH_FILES` — is reachable by a plain
 * relative path, so a check for `@/` would have declared victory over nothing.
 *
 * 🔴 WHAT IS INJECTED IS A FACTORY, NOT A PAGE. A capture needs a DIFFERENT browser context per
 * width (the viewport is a property of the context, and the saved session is loaded into it), and
 * the loop over widths is on this side of the border — so a single ready-made page could not
 * satisfy it. The shell hands over a function that OPENS one for a given `(surface, viewport)`,
 * and this module decides when to open, what to do with it, and when to close it. Same shape as
 * `makeGitRunner` (`./git`) and as the wait `waitForSurfaceReady` receives.
 *
 * THE PROJECT'S SURFACE LIST arrives through `./project-surfaces`, a sibling that guards its
 * existence and loads it lazily — read that file's header for why the load is not written here.
 *
 * @see `.claude/skills/fx-visual-evidence/SKILL.md` — the harness's contract
 */

import path from 'node:path';

import {
  DEFAULT_MAX_SAMPLES,
  clipSamplesToViewport,
  collectContrastSamplesInPage,
  summarizeContrast,
} from './contrast';
import {
  ManifestBuilder,
  SurfaceUnavailableError,
  VisualEvidenceError,
  assertSurfaceIdentity,
  captureFileName,
  isSurfaceSkippable,
  mergeSurfaceLists,
  mergeViewports,
  parseSurfaceFilter,
  resolveSurfaceFilters,
  resolveSurfaceStates,
  surfaceCellCount,
  type ResolvedState,
  type ResolvedSurface,
} from './manifest';
import {
  loadProjectSurfaces,
  PROJECT_SURFACES_PATH,
  type ProjectSurfaceLists,
} from './project-surfaces';
import { isWaitTimeout, waitForSurfaceReady } from './readiness';
import {
  CONTENT_SETTLE_TIMEOUT_MS,
  KIT_SURFACES,
  PENDING_CONTENT_SELECTOR,
  REST_STATE,
  VISUAL_VIEWPORTS,
  type VisualSurface,
  type VisualViewport,
} from './surfaces';
import {
  THEME_PROBE_VAR,
  THEME_STORAGE_KEY,
  applyThemeInPage,
  assertThemeApplied,
  readThemeInPage,
  setThemePreferenceInPage,
} from './theme';

/** Where a surface filter is read from when the caller does not pass one. Module-local: the shell passes the filter through `resolveCaptureMatrix`, so nothing outside this file names the variable. */
const SURFACE_FILTER_ENV = 'EVIDENCE_SURFACES';

/** Budget per capture (navigation + reload + probe + screenshot) before the run's own ceiling. */
export const MS_PER_CAPTURE = 20_000;

/** Slack on top of the per-capture budget: branch, server and teardown are not captures. */
export const CAPTURE_TIMEOUT_SLACK_MS = 60_000;

/**
 * Budget for one run of a surface's `prepare` (one per width and theme), on top of the captures it
 * leads to. A preparation that navigates and waits is a small page flow, not a screenshot.
 */
export const MS_PER_PREPARE = 15_000;

/** How long the whole matrix may take. The shell hands this to its runner's timeout. */
export function captureTimeoutMs(totalCaptures: number, prepareRuns = 0): number {
  return totalCaptures * MS_PER_CAPTURE + prepareRuns * MS_PER_PREPARE + CAPTURE_TIMEOUT_SLACK_MS;
}

/**
 * How a screenshot is taken — the DECISION lives here (it travels), the mechanism does not.
 *
 * Named as its own type rather than inlined so a change of capture behaviour is a change to this
 * module, which is the entire point of the border: the shell only forwards these to its browser.
 */
export interface CaptureScreenshotOptions {
  /** Absolute path of the PNG to write. */
  path: string;
  /**
   * Whole scrollable page, rather than what the viewport shows.
   *
   * 🔴 ALWAYS `false`, AND THE FIELD SURVIVES SO THE DECISION IS READABLE (`CAPTURE_FULL_PAGE`).
   */
  fullPage: boolean;
  /** CSS animations and transitions frozen, so two runs of the same screen agree. */
  animations: 'disabled' | 'allow';
}

/**
 * A CAPTURE IS THE VISIBLE AREA, NOT THE WHOLE DOCUMENT — and the difference was an artefact that
 * lied about the app.
 *
 * With `fullPage`, the browser paints a canvas as tall as the document and draws every FIXED
 * element at its viewport position on it: the kit's bottom navigation bar (`bottom-0`) came out
 * stamped across the middle of `settings-users__light__narrow`, over the content. A visual auditor
 * came within one line of reporting an overlap defect that does not exist — the shell does reserve
 * that space (`pb-content-safe`), and the real screen never looks like that. Evidence a reader
 * cannot tell is wrong is the worst kind this harness can produce, which is the same argument that
 * makes an unverified theme fatal (trap 2).
 *
 * The price is deliberate and known: a screen taller than the viewport loses what is below the
 * fold. The evidence now describes what the user SEES at that width, which is the question the
 * matrix of three widths exists to answer. A surface that genuinely needs the whole canvas would
 * have to declare it per surface — not by putting every screen back on the lying setting.
 *
 * 🔴 THE CONTRAST MEASUREMENT MOVED WITH IT (`clipSamplesToViewport`, `./contrast`). The manifest
 * says that field was measured "over the live DOM of this very capture"; measuring the whole
 * document while photographing a band would have quietly turned that sentence false.
 */
export const CAPTURE_FULL_PAGE = false;

/**
 * Everything this module needs a browser page to do — a STRUCTURAL port, never Playwright's types.
 *
 * 🔴 Importing `type { Page }` from `@playwright/test` would be a type-only import and would still
 * break the invariant: the check that keeps this directory portable reads specifiers, not runtime
 * values, and the doctrine it protects is that nothing here has an opinion about the browser stack.
 * These signatures are the contract; the shell adapts its `Page` to them in a handful of lines.
 */
export interface CapturePage {
  /** Navigate to `route`. Resolves to the response status, or `null` for a same-document one. */
  goto(route: string): Promise<number | null>;
  /** Reload the current page. Same return contract as `goto`. */
  reload(): Promise<number | null>;
  /** Where the browser actually ended up — the second half of the identity proof. */
  url(): string;
  /** Run `fn` INSIDE the page with `arg` serialized across the boundary. */
  evaluate<Arg, Result>(fn: (arg: Arg) => Result, arg: Arg): Promise<Result>;
  /**
   * Wait until the first element matching `selector` is visible.
   *
   * Rejects with an error whose `name` is `TimeoutError` when the wait expires — that name is the
   * contract `waitForSurfaceReady` reads to tell "this screen is shaped differently here" from
   * "the harness is broken". Any other rejection stays fatal.
   */
  waitForVisible(selector: string): Promise<void>;
  /**
   * Assert that NOTHING matches `selector` within `timeoutMs`, failing with `message`.
   *
   * The assertion is injected because today it is `expect()` of `@playwright/test`; the message
   * and the deadline are composed here, where the reason for them lives.
   */
  expectAbsent(selector: string, timeoutMs: number, message: string): Promise<void>;
  /**
   * Wait until `fn`, evaluated INSIDE the page with `arg`, returns `true`.
   *
   * The condition is a function of the page's own state, polled by the browser — never a fixed
   * sleep and never "the network went quiet" (trap 5). What is asked cannot be expressed as a
   * selector, which is why this exists next to `waitForVisible`.
   *
   * Rejects with an error whose `name` is `TimeoutError` when the deadline passes — the same
   * shape contract `waitForVisible` declares, read by `isWaitTimeout` (`./readiness`). Any other
   * rejection describes a broken harness and is re-thrown untouched.
   */
  waitForPredicate<Arg>(fn: (arg: Arg) => boolean, arg: Arg, timeoutMs: number): Promise<void>;
  /**
   * Press one key, as a REAL keyboard event of the browser — not a synthesized DOM event.
   *
   * It exists for one property nothing else can produce: `:focus-visible` is a heuristic, and the
   * part of it that covers a `<button>` is "the user is interacting with the keyboard". A page
   * that has never seen a keystroke shows no focus indicator on a button no matter how it is
   * focused, so evidence of the kit's switch would come back proving the opposite of the truth
   * (`applyCaptureState`). Script cannot fake this: an untrusted `KeyboardEvent` does not move the
   * browser's own input modality.
   */
  pressKey(key: string): Promise<void>;
  /**
   * Move focus to the first element matching `selector`. Resolves `false` when nothing matches.
   *
   * 🔴 THE FALSE IS A RESULT, NOT AN ERROR, and that is what keeps the decision on this side of
   * the border: "this screen does not have that element" is a fact the CALLER classifies
   * (`SurfaceStateUnreachableError` — tolerable for a kit surface, fatal for a project's own), and
   * a shell that threw would have made that call for the whole fleet in a file that never travels.
   */
  focusElement(selector: string): Promise<boolean>;
  /**
   * Run a PROJECT surface's `prepare` against the shell's real page, and hand back what it
   * returned.
   *
   * The port stays structural — nothing here names Playwright — while the project's own code gets
   * the real `Page` it was written for: the shell forwards its page, this module never looks at
   * it. The only thing crossing back is the verdict (`false` = nothing to photograph), which is
   * classified on this side (`SurfaceUnpreparedError`).
   */
  prepare(fn: (page: unknown) => Promise<boolean | void>): Promise<boolean | void>;
  /** Write the PNG. */
  screenshot(options: CaptureScreenshotOptions): Promise<void>;
  /** Release the page and whatever context owns it. Always called, including on failure. */
  close(): Promise<void>;
}

/** How long the visible images of a screen may still be loading before the run refuses to shoot. */
export const VISIBLE_IMAGES_TIMEOUT_MS = 10_000;

/**
 * The picture was not there yet, and the harness refused to photograph the hole.
 *
 * 🔴 `integrity`, AND THAT IS THE DECISION OF THIS WAIT — fatal for a surface of ANY origin, never
 * a skip. The alternative was hanging this wait off `waitForSurfaceReady` and inheriting its
 * `readiness` classification, which for a KIT screen means the whole surface is dropped (six cells,
 * `skippedSurfaces`) because one image was slow. It was rejected for three reasons, in order of
 * weight:
 *
 * 1. **It answers another question.** `readiness` claims "the route served the right screen and the
 *    screen is not shaped like the kit's". An image that never finished says nothing about the
 *    shape of the screen — it is the same question the placeholder wait asks ("did the content
 *    arrive?"), which `fx-visual-evidence §5.1` already keeps OUTSIDE that kind on purpose.
 * 2. **It cannot even run there.** The theme decides WHICH image is requested (the kit resolves its
 *    logo per theme), so the wait has to happen after the theme is applied and verified — steps
 *    away from `waitForSurfaceReady`, which runs before the theme and must, because its own claim
 *    depends on running right after identity.
 * 3. **A tolerance here would hide the exact failure this wait exists to stop.** A skipped surface
 *    costs six cells of evidence and says so; a capture taken too early costs a REVIEWER, who reads
 *    a plausible image with a missing logo and reports a defect the app does not have. That is what
 *    happened: `login__dark__narrow` came back without the brand mark while the other two widths of
 *    the same run had it.
 *
 * The price of the choice, stated plainly: an app whose visible images never settle fails the run
 * instead of losing one surface — for a project's screen and for the kit's alike. That is the same
 * price the placeholder wait already charges, and it is the correct one, because both refusals mean
 * "photographing now would produce evidence of a screen that does not exist".
 */
export class VisibleImagesNotSettledError extends VisualEvidenceError {
  constructor(message: string) {
    super(message, 'integrity');
    this.name = 'VisibleImagesNotSettledError';
  }
}

/**
 * Have the images the CAMERA WILL SEE finished loading? BROWSER-SIDE: references nothing but its
 * own argument and the page's globals, so Playwright can serialize it (`./theme`, `./contrast`).
 *
 * 🔴 ONLY THE VISIBLE AREA, AND THAT IS NOT AN OPTIMISATION — it is what makes the wait converge.
 * The kit's avatars are `next/image` without `priority`, so the ones below the fold are never
 * requested at all: "wait for every image in the document" would sit there until the deadline on
 * any list long enough to scroll, and then fail a screen whose picture was complete.
 *
 * 🔴 `complete` IS THE CONDITION, NOT `naturalWidth > 0`. `complete` turns true when the fetch
 * settled — loaded or failed — so a genuinely broken image converges and gets photographed as the
 * defect it is, instead of hanging the run. What must never be here is `networkidle` or a fixed
 * sleep: the state of the image elements is the fact; the network going quiet is a guess (trap 5).
 *
 * An image with no layout box cannot be in the picture, so it is not waited on — which also covers
 * the ones inside a `display: none` subtree.
 *
 * The geometry repeats `isRectVisible` (`./contrast`) rather than calling it: the browser receives
 * only THIS function's source, so a helper from module scope would be `undefined` there.
 */
export function visibleImagesSettledInPage(arg: { width: number; height: number }): boolean {
  const images = document.querySelectorAll('img');

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const box = image.getBoundingClientRect();

    if (box.width < 1 || box.height < 1) continue;
    if (box.top >= arg.height || box.top + box.height <= 0) continue;
    if (box.left >= arg.width || box.left + box.width <= 0) continue;

    if (!image.complete) return false;
  }

  return true;
}

/**
 * Run the image wait for one cell and classify ONLY its own expiry.
 *
 * Same discipline as `waitForSurfaceReady`, opposite conclusion: the timeout is named and made
 * readable (and stays fatal, `VisibleImagesNotSettledError`), while anything else — a closed page,
 * a detached frame — is re-thrown byte for byte, because those describe a broken harness and not a
 * screen that took too long.
 */
async function waitForVisibleImages(
  page: CapturePage,
  viewport: VisualViewport,
  label: string
): Promise<void> {
  try {
    await page.waitForPredicate(
      visibleImagesSettledInPage,
      { width: viewport.width, height: viewport.height },
      VISIBLE_IMAGES_TIMEOUT_MS
    );
  } catch (error) {
    if (!isWaitTimeout(error)) throw error;

    const cause = error instanceof Error ? error.message : String(error);
    throw new VisibleImagesNotSettledError(
      `[${label}] las imágenes del área visible seguían cargando después de ` +
        `${VISIBLE_IMAGES_TIMEOUT_MS} ms. La corrida falla en vez de fotografiar la pantalla sin ` +
        'ellas: una captura a la que le falta el logo se ve plausible y lleva a reportar como ' +
        'defecto de la pantalla algo que sólo era una carga a medias. Remedio: revisa que esa ' +
        'imagen se sirva en este checkout, o excluye la superficie por nombre.\n' +
        `   Causa original: ${cause}`
    );
  }
}

/**
 * The key pressed to tell the browser the user is on the keyboard, before focus is moved.
 *
 * `Tab` and not a letter: it is the key that MEANS "move focus" to every browser, it types nothing
 * into whatever happens to be focused, and where it lands is irrelevant — the very next thing this
 * harness does is put focus exactly where the state says.
 */
export const FOCUS_MODALITY_KEY = 'Tab';

/**
 * A declared state whose element is not in this screen — the SAME claim `readiness` already makes,
 * one axis down.
 *
 * 🔴 IT IS NOT A FOURTH FAILURE KIND, AND REFUSING TO ADD ONE IS THE DECISION. The set of three is
 * closed on purpose (`FailureKind`, `./manifest`): what makes a refusal skippable is that somebody
 * decided about it, and a kind invented per situation is how that set stops meaning anything. An
 * element the kit's list names and this screen does not have is precisely what `readiness` says —
 * `waitForSurfaceReady` says it about the `readySelector`, this says it about a state's target.
 *
 * WHAT CHANGES IS THE GRANULARITY, AND THAT IS WHERE THE EDGE CASE ACTUALLY LIVED. A `readiness`
 * refusal from the readiness wait costs the WHOLE kit surface; charging that for a state would
 * drop a screen that photographs perfectly at rest — six or nine cells of real evidence traded for
 * one that could not be taken. So it costs only its own cells, and it is filed in its own list
 * (`skippedStates`), never as a skipped surface: the surface WAS photographed, and a reader who is
 * told otherwise while its resting captures sit in `captures` is being handed a contradiction.
 *
 * The tolerance itself is not re-decided here: it is `isSurfaceSkippable`, called with this very
 * error, so a state declared by the PROJECT's own list kills the run exactly like its surface would
 * — the team wrote that line about its own app.
 */
export class SurfaceStateUnreachableError extends VisualEvidenceError {
  constructor(message: string) {
    super(message, 'readiness');
    this.name = 'SurfaceStateUnreachableError';
  }
}

/**
 * A project surface's `prepare` answered `false`: there is nothing to photograph in the state it
 * reaches (no data seeded for it, typically). NOT a refusal of the harness and not a defect of
 * the screen — the project's own code declaring "not today" about its own surface.
 *
 * Its own class so `captureAllSurfaces` can file it in `unpreparedSurfaces` with its lost cells
 * and go on. It does NOT join the three `FailureKind`s: those classify what the HARNESS refused,
 * and this is a verdict the surface gave about itself. It is caught by identity, never by kind,
 * so the closed set stays closed and `isSurfaceSkippable` is not widened for it.
 */
export class SurfaceUnpreparedError extends VisualEvidenceError {
  constructor(message: string) {
    super(message, 'availability');
    this.name = 'SurfaceUnpreparedError';
  }
}

/** The pathname the browser is on, for the manifest's `landedAt`. Falls back to the raw URL. */
function landedPathname(url: string, baseURL: string): string {
  try {
    return new URL(url, baseURL || 'http://localhost').pathname;
  } catch {
    return url;
  }
}

/** One cell a declared state could not be photographed in, and why. */
export interface StateMiss {
  state: string;
  reason: string;
}

/**
 * Leave the screen in the state this cell photographs. Returns `false` when the state is a KIT
 * one whose element is not here — the caller records the miss and moves on.
 *
 * REST IS A NO-OP BY CONSTRUCTION: the screen as it loaded is already the state, so nothing is
 * touched and nothing can fail.
 */
async function applyCaptureState(
  page: CapturePage,
  state: ResolvedState,
  surface: ResolvedSurface,
  label: string
): Promise<boolean> {
  if (state.focus === null) return true;

  // The modality first, then the move. See `CapturePage.pressKey`: without a real keystroke on
  // this page, a focused `<button>` matches `:focus` and NOT `:focus-visible`, and the kit's focus
  // indicators are written on `:focus-visible` (`.surface-focus-inset`, the skins). The capture
  // would come back looking exactly like the resting one — evidence that says a shipped fix does
  // not work.
  await page.pressKey(FOCUS_MODALITY_KEY);

  if (await page.focusElement(state.focus)) return true;

  const unreachable = new SurfaceStateUnreachableError(
    `[${label}] el estado '${state.name}' pide enfocar '${state.focus}' y esta pantalla no tiene ` +
      'ningún elemento que lo cumpla (¿la primitiva no está aquí, o el control está deshabilitado?). ' +
      'La superficie sí se fotografía; se pierden sólo las celdas de ESE estado, y quedan ' +
      'registradas en el manifest (skippedStates).'
  );
  if (!isSurfaceSkippable(unreachable, surface)) throw unreachable;

  return false;
}

/**
 * WHICH SAVED SESSION A SURFACE NEEDS — answered by the frozen shell, CLASSIFIED here.
 *
 * `undefined` = no session at all (the login screen is the whole reason a surface's role is
 * nullable), a string = the session file to load, and `null` = THE ROLE THIS SURFACE NAMES DOES
 * NOT EXIST IN THIS CHECKOUT. Only the `null` is a verdict this module reads; the string is never
 * opened here, which is what keeps `AUTH_FILES` (`tests/fixtures/`) on the frozen side of the
 * border — the shell forwards it to its own browser.
 *
 * 🔴 THE SHELL ANSWERS, IT DOES NOT DECIDE, AND THAT IS THE WHOLE POINT OF THE INJECTION. Three of
 * the kit's four surfaces pin `role: 'admin'`, a value of `src/config/roles.ts` — a file that is
 * BORN FROZEN in every derivative and whose own doc says to customize it ("add/remove as needed").
 * A project whose roles are `owner`/`member` has no `admin`, and that is a normal state of the
 * fleet, not a defect. While the shell THREW on it, the refusal was an unclassified
 * `VisualEvidenceError` — `integrity` by default — which is skippable for nobody, so one absent
 * role killed the entire run and no manifest was written, not even for `login`, which needs no
 * session. Deciding it in the shell would have repaired the Factory and nothing else (`tests/**`
 * never travels); as a `null` crossing the border, the decision lives where a fix reaches the
 * fleet. Same shape as the page factory, the skin's themes and the git runner.
 */
export type ResolveSurfaceSession = (surface: ResolvedSurface) => string | null | undefined;

/**
 * The surface names a role this checkout does not have.
 *
 * 🔴 `availability`, AND NOT A FOURTH KIND. The claim is the one a 404 already makes: this screen
 * is not reachable in THIS app. That it is answered before the browser opens changes nothing about
 * what it says — the kit's list travels live onto a `src/` frozen at bootstrap, and a role that is
 * not in that `src/` is a fact about the checkout exactly like a route that is not there.
 *
 * 🔴 THE DOUBLE LOCK IS UNTOUCHED. Nothing here decides the tolerance: `isSurfaceSkippable` does,
 * and it still demands `origin: 'kit'`. A surface the PROJECT declared, pointing at a role its own
 * `src/config/roles.ts` does not have, is a typo in the team's own list — it kills the run, like
 * every other refusal on a project surface.
 */
export class SurfaceRoleMissingError extends SurfaceUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = 'SurfaceRoleMissingError';
  }
}

/**
 * Refuse a surface whose role is not in this checkout — the FIRST thing a capture asks, before a
 * browser opens.
 *
 * It runs inside the per-surface `try` of `captureAllSurfaces`, so nothing new is needed for the
 * outcome: `isSurfaceSkippable` forgives it for a KIT surface, the cells are counted into
 * `skippedSurfaces` with their reason, and the run keeps going with the screens this app does have.
 *
 * A surface with `role: null` never reaches the comparison — the resolver answers `undefined` for
 * it, which is "no session needed", not "role missing".
 */
function assertSurfaceSessionAvailable(
  surface: ResolvedSurface,
  resolveSession: ResolveSurfaceSession | undefined
): void {
  if (!resolveSession) return;
  if (resolveSession(surface) !== null) return;

  throw new SurfaceRoleMissingError(
    `La superficie '${surface.name}' (${surface.path}) pide el rol '${surface.role}', que no ` +
      'existe en el src/config/roles.ts de este checkout. Ese archivo nace congelado en cada ' +
      'derivado, así que un proyecto con otros roles es el caso normal y no un defecto: se salta ' +
      'la superficie, se registran sus celdas perdidas y la corrida sigue.'
  );
}

/**
 * Open a page for one cell's `(surface, viewport)`.
 *
 * A FACTORY, not an instance: the width is a property of the browser context and the surface's
 * role decides which saved session that context loads, so a page can only be built once both are
 * known — and both are known here, inside the loop.
 */
export type OpenCapturePage = (request: {
  surface: ResolvedSurface;
  viewport: VisualViewport;
}) => Promise<CapturePage>;

/** The matrix a run will photograph, resolved once before anything opens a browser. */
export interface CaptureMatrix {
  /** Surfaces after the union of both lists and after any `--surface` filter. */
  surfaces: ResolvedSurface[];
  /** Themes of the ACTIVE SKIN, as the shell read them from the registry. */
  themes: string[];
  /** The widths, in declaration order. */
  viewports: readonly VisualViewport[];
  /** Exclusions the project declared that match no kit surface — reported, never fatal. */
  staleExclusions: string[];
  /** Selectors the project declared out of the contrast measurement, verbatim (`EXCLUDED_CONTRAST_SELECTORS`). */
  contrastExclusions: string[];
  /**
   * How many times a `prepare` will run: for each surface that declares one, `themes × widths`.
   * Feeds the run's timeout (`captureTimeoutMs`) — a preparation is a page flow, not a shutter.
   */
  prepareRuns: number;
  /**
   * Every cell of the run: for each surface, `its states × themes × widths`, summed.
   *
   * 🔴 A SUM, NOT A PRODUCT, SINCE STATES ARE DECLARED PER SURFACE. There is no longer a single
   * "cells per surface" number for the run, and there must not be one: the closing equation of the
   * spec (captures + everything accounted for as lost === this) is only exact if every side counts
   * with the same per-surface function (`surfaceCellCount`, `./manifest`).
   */
  total: number;
  /** Whether the project's list was there at all (`absent` is the normal fresh state). */
  projectListSource: ProjectSurfaceLists['source'];
}

/**
 * Compose the matrix: union of the two surface lists, narrowed by the filter, times themes and
 * the union of the two width lists.
 *
 * Every input is injectable so this is assertable without a filesystem and without a browser —
 * the reason the border was worth drawing at all. Defaults are the real ones: the kit's list, the
 * kit's widths, the project's lists read through the extension point, and the filter from the
 * environment. `viewports` here is the KIT's half of that axis; the project's half always comes
 * from its file and is merged on top (`mergeViewports`), so a test that injects widths is testing
 * the same union a run performs.
 */
export function resolveCaptureMatrix(args: {
  themes: readonly string[];
  surfaceFilter?: string | null;
  kitSurfaces?: readonly VisualSurface[];
  viewports?: readonly VisualViewport[];
  loadProject?: () => ProjectSurfaceLists;
}): CaptureMatrix {
  const kitSurfaces = args.kitSurfaces ?? KIT_SURFACES;
  const loadProject = args.loadProject ?? (() => loadProjectSurfaces());
  const project = loadProject();
  const viewports = mergeViewports(args.viewports ?? VISUAL_VIEWPORTS, project.viewports);

  const merged = mergeSurfaceLists(kitSurfaces, project.surfaces, project.excluded);
  const rawFilter =
    args.surfaceFilter === undefined ? process.env[SURFACE_FILTER_ENV] : args.surfaceFilter;
  const surfaces = resolveSurfaceFilters(merged.surfaces, parseSurfaceFilter(rawFilter));

  const themes = [...args.themes];
  const total = surfaces.reduce(
    (sum, surface) => sum + surfaceCellCount(surface, themes.length, viewports.length),
    0
  );
  const prepareRuns =
    surfaces.filter((surface) => typeof surface.prepare === 'function').length *
    themes.length *
    viewports.length;

  return {
    surfaces,
    themes,
    viewports,
    staleExclusions: merged.staleExclusions,
    contrastExclusions: [...project.contrastExclusions],
    prepareRuns,
    total,
    projectListSource: project.source,
  };
}

/** What one capture loop needs beyond the surface it is photographing. */
export interface CaptureContext {
  themes: readonly string[];
  viewports: readonly VisualViewport[];
  /** Directory the PNGs are written into. Created by the shell before the first capture. */
  runDir: string;
  /** The run's base URL — the identity check resolves relative URLs against it. */
  baseURL: string;
  builder: ManifestBuilder;
  openPage: OpenCapturePage;
  /**
   * Which saved session each surface needs (`ResolveSurfaceSession`). Optional: a caller that
   * photographs nothing authenticated — and every unit test that does not exercise this — omits
   * it, and no surface is refused for its role.
   */
  resolveSession?: ResolveSurfaceSession;
  /**
   * The project's `EXCLUDED_CONTRAST_SELECTORS`, forwarded to the in-page harvest so the text they
   * match is filed `notApplicable` instead of measured (`collectContrastSamplesInPage`). Optional:
   * a run without exclusions — every derivative until it declares one — passes nothing.
   */
  contrastExclusions?: readonly string[];
  /** Injected so a test can pin `capturedAt`. */
  now?: () => Date;
}

/** The selector list handed to the browser, or `undefined` when the project declared none. */
export function contrastExcludeSelector(
  exclusions: readonly string[] | undefined
): string | undefined {
  const cleaned = (exclusions ?? []).map((selector) => selector.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(', ') : undefined;
}

/**
 * Photograph ONE surface across every width and every theme, appending each cell to the builder.
 *
 * 🔴 EXTRACTED SO THAT ONE SURFACE CAN FAIL WITHOUT TAKING THE OTHERS WITH IT. The whole matrix is
 * a single run (it has to be: it writes one manifest), so a throw anywhere used to abort the loop
 * before `finish()` — no manifest at all, for any screen. With the work of one surface behind a
 * call, the caller can decide per surface, which is what `isSurfaceSkippable` needs to be able to
 * do. Every capture it DID take before failing stays in the builder: it is real evidence of a real
 * screen, and the skip record says how many cells were lost with it.
 */
export async function captureSurface(
  surface: ResolvedSurface,
  context: CaptureContext
): Promise<StateMiss[]> {
  const { themes, viewports, runDir, baseURL, builder, openPage } = context;
  const now = context.now ?? (() => new Date());
  const states = resolveSurfaceStates(surface);
  const missedStates: StateMiss[] = [];

  // 0. Does this checkout even HAVE the role this screen is photographed as? Asked before any
  //    browser opens, because the answer is about `src/config/roles.ts` and not about the page —
  //    and asked HERE rather than in the page factory so the verdict travels (`ResolveSurfaceSession`).
  assertSurfaceSessionAvailable(surface, context.resolveSession);

  for (const viewport of viewports) {
    const page = await openPage({ surface, viewport });

    try {
      const landingStatus = await page.goto(surface.path);
      assertSurfaceIdentity({
        surface,
        status: landingStatus,
        url: page.url(),
        baseURL,
        label: `${surface.name} · ${viewport.name}`,
      });

      for (const theme of themes) {
        const label = `${surface.name} · ${theme} · ${viewport.name}`;

        // 1. Preference first, then a reload: next-themes' own pre-hydration script applies
        //    the class before first paint, which is the faithful path (the app decides).
        await page.evaluate(setThemePreferenceInPage, {
          storageKey: THEME_STORAGE_KEY,
          theme,
        });
        const reloadedStatus = await page.reload();

        // 2. Prove it is still THIS screen. A reload re-runs the middleware, and a session
        //    that stopped being valid redirects to /login — which would be photographed
        //    under this surface's name (`assertSurfaceIdentity`, the screen's counterpart to
        //    the theme's three-way check below).
        assertSurfaceIdentity({
          surface,
          status: reloadedStatus,
          url: page.url(),
          baseURL,
          label,
        });

        // 3. Wait for the screen to actually be there before touching anything else — and let
        //    THIS wait, and only this one, produce a `readiness` refusal (`waitForSurfaceReady`).
        //    Identity is already proven two steps up, so a failure here says the route served the
        //    right screen and it is not shaped like the kit's — which for a KIT surface is the
        //    same fact `availability` states in another shape, on a list that travels live onto a
        //    frozen `src/`. Everything else in this loop keeps failing exactly as it did.
        const readySelector = surface.readySelector ?? 'body';
        await waitForSurfaceReady(() => page.waitForVisible(readySelector), {
          surface: surface.name,
          origin: surface.origin,
          selector: readySelector,
          label,
        });

        // 4. …and for its CONTENT, which is a different question: the shell of a data screen
        //    mounts long before its rows do, so a capture taken here shows a rendered layout
        //    with grey placeholders where the thing being audited should be. Condition, never
        //    a fixed sleep (`PENDING_CONTENT_SELECTOR`).
        await page.expectAbsent(
          PENDING_CONTENT_SELECTOR,
          CONTENT_SETTLE_TIMEOUT_MS,
          `[${label}] la pantalla seguía mostrando placeholders de carga después de ` +
            `${CONTENT_SETTLE_TIMEOUT_MS} ms. Fotografiar un esqueleto es peor que no tener ` +
            'captura: se ve plausible y lleva a conclusiones falsas sobre la pantalla real.'
        );

        // 4b. A PROJECT surface that is not a route: run its `prepare` NOW — after the entry
        //     screen is proven, ready and settled (steps 2-4 are what guarantee it has something
        //     to click on), and BEFORE the theme is applied and verified and the images waited on
        //     (steps 5-7), so whatever it opens is photographed in the right theme with its own
        //     images settled. Once per theme, because step 1's reload resets the page. `false`
        //     means "nothing to photograph here" — classified on this side, filed by the caller.
        let landedAt: string | undefined;
        if (typeof surface.prepare === 'function') {
          const outcome = await page.prepare(surface.prepare);
          if (outcome === false) {
            throw new SurfaceUnpreparedError(
              `[${label}] 'prepare' de la superficie '${surface.name}' devolvió false: no hay ` +
                'nada que fotografiar en el estado que alcanza (¿sin datos sembrados para él?). ' +
                'Se pierden las celdas de esta superficie y quedan registradas en el manifest ' +
                '(unpreparedSurfaces); la corrida sigue con las demás.'
            );
          }
          landedAt = landedPathname(page.url(), baseURL);
        }

        // 5. Force the class deterministically…
        await page.evaluate(applyThemeInPage, {
          storageKey: THEME_STORAGE_KEY,
          theme,
          themes: [...themes],
        });

        // 6. …and VERIFY it took, reading the class plus the skin's own token. Trap 2: a
        //    capture taken without this step can photograph the previous theme and nothing
        //    in the image would say so.
        const probe = await page.evaluate(readThemeInPage, {
          storageKey: THEME_STORAGE_KEY,
          themes: [...themes],
          probeVar: THEME_PROBE_VAR,
        });
        assertThemeApplied(theme, probe, label);

        // 7. The images of the VISIBLE AREA, which only NOW can be waited on: the theme decides
        //    which file is requested (the kit resolves its logo per theme), so a wait placed
        //    before step 5 would settle the previous variant and the shutter would catch the new
        //    one mid-flight. That is the bug this closes — a login captured without its brand
        //    mark in one width while the other two had it, read by an auditor as a defect of the
        //    screen. Condition over the image elements the camera will see, never a sleep and
        //    never `networkidle` (trap 5); its expiry is FATAL for any origin
        //    (`VisibleImagesNotSettledError`).
        await waitForVisibleImages(page, viewport, label);

        for (const state of states) {
          const cell = state.name === REST_STATE ? label : `${label} · ${state.name}`;

          // 8. Leave the screen in the state THIS cell photographs — and do it here, last, because
          //    everything above resets it: the reload of step 1 drops focus, and steps 3 and 4 are
          //    what guarantee the element is even in the page yet. Rest is a no-op and comes first
          //    (`resolveSurfaceStates`), so no state capture can leave the page scrolled under the
          //    resting picture of the same cell.
          if (!(await applyCaptureState(page, state, surface, cell))) {
            missedStates.push({
              state: state.name,
              reason: `no se encontró '${state.focus}' en ${cell}`,
            });
            continue;
          }

          // 9. Contrast over the LIVE DOM of this very capture, not a static rule — and over the
          //    SAME BAND the shutter is about to write (`CAPTURE_FULL_PAGE`): the harvest reports
          //    each sample's rect and the clip drops whatever falls outside the viewport, so the
          //    number in the manifest describes the text a reader of the PNG can actually see.
          //    Re-measured per STATE, never hoisted out of this loop: focusing scrolls its target
          //    into view, so the visible band of a state capture is not the resting one's, and a
          //    number copied across them would describe an image nobody took.
          const samples = await page.evaluate(collectContrastSamplesInPage, {
            maxSamples: DEFAULT_MAX_SAMPLES,
            excludeSelector: contrastExcludeSelector(context.contrastExclusions),
          });
          const contrast = summarizeContrast(clipSamplesToViewport(samples, viewport));

          const file = captureFileName(surface.name, theme, viewport.name, state.name);
          await page.screenshot({
            path: path.join(runDir, file),
            fullPage: CAPTURE_FULL_PAGE,
            animations: 'disabled',
          });

          builder.add({
            surface: surface.name,
            route: surface.path,
            // Provenance of a prepared cell: it depended on project code, and it may show a
            // different route than the entry. Both absent when nothing was prepared.
            ...(landedAt !== undefined ? { prepared: true as const, landedAt } : {}),
            role: surface.role,
            theme,
            viewport,
            state: state.name,
            screenshot: file,
            contrast,
            capturedAt: now().toISOString(),
          });
        }
      }
    } finally {
      await page.close();
    }
  }

  return missedStates;
}

/** What the whole loop produced beyond the builder it filled. */
export interface CaptureRunResult {
  /**
   * Cells of the matrix lost to KIT screens this checkout does not have — and to KIT states it
   * could not reach on the screens it does have.
   *
   * 🔴 ONE NUMBER FOR BOTH KINDS OF HOLE, ON PURPOSE. The spec closes the run with an exact
   * equation (`builder.size + lostCaptures === matrix.total`), and its whole value is that a cell
   * which silently never happened cannot hide behind a declared loss. Two counters would have
   * meant two chances to forget one; each hole still has its own ROW in the manifest
   * (`skippedSurfaces` / `skippedStates`), which is where a reader learns which kind it was.
   */
  lostCaptures: number;
}

/** Collapse per-cell misses into one entry per state name, preserving declaration order. */
function groupMissesByState(misses: readonly StateMiss[]): Map<string, StateMiss[]> {
  const grouped = new Map<string, StateMiss[]>();
  for (const miss of misses) {
    const bucket = grouped.get(miss.state);
    if (bucket) bucket.push(miss);
    else grouped.set(miss.state, [miss]);
  }
  return grouped;
}

/**
 * Photograph every surface of the matrix, tolerating exactly the failures that are facts about
 * THIS checkout rather than about the harness.
 *
 * 🔴 A KIT SURFACE THIS APP DOES NOT HAVE MUST NOT COST THE WHOLE AUDIT. The kit's list travels
 * live (`scripts/**`) onto a `src/` frozen at bootstrap, so the day the Factory adds a screen,
 * every derivative without it hits this — and because the whole matrix is ONE run, the throw
 * aborted the loop, `finish()` never ran, and NO manifest was written for the surfaces that did
 * exist. `isSurfaceSkippable` is where the conditions live (kit-declared AND a failure classified
 * `availability` or `readiness` — the route is not there, or the route is there and the screen is
 * not the kit's). Everything else — a theme that did not take, a timeout anywhere else, a
 * `TypeError` — still kills the run.
 */
export async function captureAllSurfaces(args: {
  matrix: CaptureMatrix;
  runDir: string;
  baseURL: string;
  builder: ManifestBuilder;
  openPage: OpenCapturePage;
  /** Forwarded to every surface — see `ResolveSurfaceSession`. */
  resolveSession?: ResolveSurfaceSession;
  now?: () => Date;
  /** Where the skip notices go. Injected so a test reads them instead of the terminal. */
  warn?: (message: string) => void;
}): Promise<CaptureRunResult> {
  const { matrix, runDir, baseURL, builder, openPage } = args;
  const warn = args.warn ?? ((message: string) => console.warn(message));
  let lostCaptures = 0;

  for (const surface of matrix.surfaces) {
    const capturedBefore = builder.size;
    const cellsOfSurface = surfaceCellCount(surface, matrix.themes.length, matrix.viewports.length);

    try {
      const missedStates = await captureSurface(surface, {
        themes: matrix.themes,
        viewports: matrix.viewports,
        runDir,
        baseURL,
        builder,
        openPage,
        resolveSession: args.resolveSession,
        contrastExclusions: matrix.contrastExclusions,
        now: args.now,
      });

      // A state that was not reachable costs ONLY its own cells, and each one gets a row saying
      // so. Grouped by state name rather than one row per cell: the same missing primitive fails
      // in every theme and every width, and nine identical rows would bury the fact under itself.
      for (const [state, misses] of groupMissesByState(missedStates)) {
        builder.skipState({
          surface: surface.name,
          route: surface.path,
          state,
          origin: surface.origin,
          reason: misses[0].reason,
          lostCaptures: misses.length,
        });
        lostCaptures += misses.length;

        warn(
          `⚠️  [visual-evidence] no se pudo alcanzar el estado '${state}' de '${surface.name}' ` +
            `(${misses.length} celdas): ${misses[0].reason}\n   La pantalla sí quedó fotografiada ` +
            'en reposo; el hueco queda registrado en el manifest (skippedStates).'
        );
      }
    } catch (error) {
      // The project's own `prepare` said "nothing here" — by IDENTITY, before the kit tolerance
      // is consulted: it is not a kit surface, and widening `isSurfaceSkippable` for it would
      // reopen the closed set of kinds. Filed in its own list; the run goes on.
      if (error instanceof SurfaceUnpreparedError) {
        const lost = cellsOfSurface - (builder.size - capturedBefore);
        lostCaptures += lost;
        builder.skipUnprepared({
          surface: surface.name,
          route: surface.path,
          origin: surface.origin,
          reason: error.message,
          lostCaptures: lost,
        });
        warn(
          `⚠️  [visual-evidence] la superficie '${surface.name}' no se pudo preparar: ` +
            `${error.message}\n   Queda registrada en el manifest (unpreparedSurfaces) — no es ` +
            'un pase: para ui-critic es cobertura que no existe.'
        );
        continue;
      }

      if (!isSurfaceSkippable(error, surface)) throw error;

      const lost = cellsOfSurface - (builder.size - capturedBefore);
      lostCaptures += lost;
      const reason = error instanceof Error ? error.message : String(error);

      builder.skip({
        surface: surface.name,
        route: surface.path,
        origin: surface.origin,
        reason,
        lostCaptures: lost,
      });

      warn(
        `⚠️  [visual-evidence] se saltó la superficie del kit '${surface.name}' (${surface.path}): ` +
          `${reason}\n   Queda registrada en el manifest (skippedSurfaces) — si tu app no tiene ` +
          `esta pantalla, decláralo en EXCLUDED_KIT_SURFACES de ${PROJECT_SURFACES_PATH}.`
      );
    }
  }

  return { lostCaptures };
}

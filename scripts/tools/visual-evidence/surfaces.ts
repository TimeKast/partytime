/**
 * Visual evidence — WHAT the harness captures.
 *
 * A **surface** is one screen of the app worth looking at: a route, the role that may see it,
 * (optionally) the element whose presence means the screen is actually rendered rather than still
 * mounting, and (optionally) the interaction STATES it is worth photographing in. A **capture** is
 * one surface × one theme × one viewport × one state.
 *
 * 🔴 THE LIST IS A DATUM, NEVER A LITERAL INSIDE THE SPEC. The spec iterates whatever this
 * module (plus the project's own list) hands it, so adding a screen is a line of data — the
 * same discipline `E2EPhase` applies to the run's phases.
 *
 * TWO LISTS, AND THE SPLIT IS THE POINT (the pattern `vitest.setup.ts` /
 * `vitest.setup.project.ts` already uses in this repo):
 *
 * | List                                  | Lives in                              | Travels?                                            |
 * | ------------------------------------- | ------------------------------------- | --------------------------------------------------- |
 * | The kit's (`KIT_SURFACES`, this file) | `scripts/tools/visual-evidence/`      | YES — `scripts/**` is a TRACKED path, refreshed by every `factory update`. The Factory can add a screen tomorrow and the fleet gets it. |
 * | The project's                         | `tests/e2e/visual-evidence.surfaces.ts` | NO — `tests/**` is frozen at bootstrap (BR-FACTORY-006). It is born with the project and no update ever rewrites it. |
 *
 * `mergeSurfaceLists` (`./manifest`) unions them, and a project that does not have one of the
 * kit's screens excludes it by name rather than editing a file the update would overwrite.
 *
 * WHY THESE FOUR. They are the screens every derivative of this kit has, because the kit ships
 * them: the login form (the only unauthenticated one), the dashboard, the profile page and the
 * admin user list. A default list of zero would make `pnpm evidence:visual` a command that
 * runs and proves nothing.
 */

/** One screen the harness knows how to reach and photograph. */
export interface VisualSurface {
  /**
   * Stable identifier. It becomes a **file-name segment** of every screenshot and the key a
   * `--surface` filter matches, so it is validated (`isValidSurfaceName`) rather than
   * sanitized: a name silently rewritten would not match the filter its author typed.
   */
  name: string;
  /**
   * Route to visit, relative to the run's `baseURL` (leading slash). For a surface with `prepare`
   * it is the ENTRY route — where the preparation starts; where it ends is recorded per capture
   * (`landedAt`).
   */
  path: string;
  /**
   * Which role's saved session to use, as named in `src/config/roles.ts` — or `null` for a
   * surface that must be photographed **signed out** (the login screen is the whole reason
   * this field is nullable rather than always a role).
   */
  role: string | null;
  /** One line for a human reading the manifest: what this screen is for. */
  purpose: string;
  /**
   * CSS selector that means "this screen has rendered" — ideally one the LOADING state does not
   * have (`table` for a list, not `main`, which both states carry).
   *
   * Optional, and the default (`body`) matches anything, so it is only half the defence: the
   * other half is `PENDING_CONTENT_SELECTOR` below, which every surface waits on whether or not
   * it declares a selector here.
   */
  readySelector?: string;
  /**
   * Interaction states this screen is photographed in, BEYOND the way it loaded.
   *
   * 🔴 THE STATES TRAVEL WITH THE SURFACE, AND THAT IS THE WHOLE DESIGN. The matrix is data on
   * its three older axes — surfaces here, themes in the active skin's registry, widths in
   * `VISUAL_VIEWPORTS` — and a fourth axis written as a literal inside the capture loop would be
   * the one axis a project could not extend without editing a file `factory update` overwrites.
   * Hanging them off the surface also keeps the cost proportional: one extra state costs one cell
   * per theme and per width **of that screen only**, not of every screen in the list.
   *
   * The resting capture is NOT declared here — every surface has it, always, and it is added by
   * `resolveSurfaceStates` (`./manifest`) as `REST_STATE`.
   */
  states?: readonly SurfaceState[];
  /**
   * Leave the screen in the state this surface photographs, when that state is NOT a route: the
   * third step of a wizard, a panel a row's button opens, the detail of the first record of a
   * list whose id is not stable. Runs once per width and theme, after the entry route (`path`)
   * loaded and settled and before the theme is verified and the shutter fires — so what it opens
   * is photographed in the right theme, with its images waited on like everything else.
   *
   * 🔴 PROJECT LIST ONLY. The kit's list is DATA, and `mergeSurfaceLists` refuses a kit entry that
   * carries this: behaviour in a list that travels live onto every derivative's frozen `src/` would
   * be code the fleet runs without reviewing. In the project's own file the team reviews its own
   * code — the same line `scripts/tools/e2e.project.ts` draws for a phase. One real derivative had
   * 29 of 34 surfaces that only exist after navigating, and without this its only exit was a
   * second harness beside the kit's.
   *
   * WHAT IT RECEIVES is the shell's real page — Playwright's `Page` in the kit's spec — typed
   * `unknown` here because this module has no opinion about the browser stack (`CapturePage`).
   * Method syntax on purpose: it is bivariant, so a project may write `prepare(page: Page)`.
   *
   * RETURN `false` = THERE IS NOTHING TO PHOTOGRAPH HERE (no data for the state). The surface is
   * then filed in `unpreparedSurfaces` with its lost cells and the run goes on — it is not a pass,
   * not a failure, and never a silent skip: `ui-critic` reads it as coverage that does not exist.
   * Anything it THROWS is fatal, like any other refusal on a project surface.
   *
   * The captures it produces carry `prepared: true` and `landedAt` (where the browser actually
   * was) in the manifest, so a reader knows that cell depended on project code, not on a route.
   */
  prepare?(page: unknown): Promise<boolean | void>;
}

/**
 * One interaction state a surface is photographed in — the fourth axis of the matrix.
 *
 * IT IS FOCUS, AND THE SHAPE IS DELIBERATELY NOT "a script". A state is a DATUM the same way a
 * surface is: a name (which becomes a file-name segment and the `state` of the manifest row) and
 * the element the harness leaves focused before the shutter. Anything richer — a click sequence, a
 * typed value — would put behaviour into a list that a project extends by writing data, and would
 * have to be reviewed as code every time somebody adds a screen. A screen that needs behaviour to
 * reach declares `prepare` on the surface instead — in the PROJECT's list only, where the team
 * reviews its own code (`VisualSurface.prepare`).
 *
 * 🔴 THE SELECTOR MUST NAME AN ELEMENT THE SHUTTER CAN SEE. A capture is the visible area
 * (`CAPTURE_FULL_PAGE`, `./capture`), so an element focused below the fold would produce a state
 * capture identical to the resting one. Focusing scrolls the element into view, which is what
 * makes that true rather than hopeful — but a selector that matches something permanently hidden
 * still buys nothing.
 */
export interface SurfaceState {
  /**
   * Stable identifier of the state. It becomes a **file-name segment** of the capture and the
   * value of `state` in the manifest, so it is validated exactly like the surface's own name
   * (`isValidFileSegment`) and it may not be `REST_STATE`, which every surface already owns.
   */
  name: string;
  /**
   * CSS selector of the element to leave focused before the shutter.
   *
   * Prefer one that cannot resolve to a DISABLED control (`:not([disabled])` on a switch): focus
   * does not move to a disabled element, so the capture would come back indistinguishable from
   * the resting one and the evidence would quietly prove nothing.
   */
  focus: string;
}

/**
 * The `state` of the capture taken as the screen loaded — an EXPLICIT value, never an absent field.
 *
 * A reader of the manifest has to be able to tell "photographed at rest" from "written by a
 * harness that had no opinion about state at all". An absent field says both at once, and the one
 * it gets read as is whichever the reader assumed.
 */
export const REST_STATE = 'rest';

/**
 * What "still loading" LOOKS like, so a capture never photographs a skeleton.
 *
 * 🔴 WAITING FOR HYDRATION IS NOT WAITING FOR CONTENT, and the difference is a whole class of
 * false evidence. A run captured `/settings/users` with its shell fully rendered — sidebar,
 * breadcrumbs, header — and grey placeholders where the table should be: the screen the manifest
 * claims to audit ("tabla densa, filtros y acciones por fila") was not in the picture. Worse than
 * a missing capture, because a reviewer draws conclusions from it. The same surface came back
 * complete on another width in the same run, which is the signature of a race, not of a screen.
 *
 * These are the markers the kit's own placeholders carry (`src/components/ui/skeleton.tsx` and
 * every `loading.tsx` built on it), plus the two standard ones any app can opt into. The wait is
 * on the CONDITION — the placeholders being gone — never on a fixed sleep, so a fast screen
 * costs nothing and a slow one is not cut short.
 */
export const PENDING_CONTENT_SELECTOR = '.animate-pulse, [aria-busy="true"], [data-loading="true"]';

/** How long a surface may keep showing placeholders before the run refuses to photograph it. */
export const CONTENT_SETTLE_TIMEOUT_MS = 15_000;

/** One width the matrix covers. */
export interface VisualViewport {
  /** File-name segment of every capture at this width (`captureFileName`) — validated like a surface's. */
  name: string;
  width: number;
  height: number;
  /**
   * One line for a human reading the manifest: WHY this width is in the matrix — which layout
   * band it covers, or which regression it exists to catch. Optional for the kit's three (their
   * reasons are the comment below); a project that adds a width is asked to say why, because the
   * reason is the one thing a reviewer of the manifest cannot recover from the number.
   */
  why?: string;
}

/**
 * The three widths, and the middle one is not decoration.
 *
 * `narrow` is the 375 px baseline `SK.md §3.2` makes non-negotiable; `wide` is the desktop
 * everybody checks anyway. **`medium` is the one that was missing** — a regression that only
 * showed between the two reached production in a real derivative, because a matrix of
 * narrow+wide has no opinion about the range where the layout actually switches.
 *
 * 🔴 AND THE MIDDLE NUMBER BELONGS TO THE PROJECT, WHICH IS WHY THIS LIST IS EXTENSIBLE. A second
 * derivative learned the same lesson at a DIFFERENT width: its hero grids switch to four columns
 * in the 1024-1180 band, a regression escaped there, and 768 photographs nothing of it. Two apps,
 * one diagnosis, two numbers — that is not a disagreement about the right value, it is the sign
 * that the right value depends on where EACH app's layout switches. So the project declares its
 * own in `PROJECT_VIEWPORTS` (`tests/e2e/visual-evidence.surfaces.ts`), with the same union-and-
 * replace-by-name `mergeViewports` (`./manifest`) applies to surfaces: a project entry named
 * `medium` REPLACES the kit's 768 in place; a new name ADDS a fourth column to the matrix. The
 * cost is the project's to weigh — one width is one more capture per surface, theme and state.
 */
export const VISUAL_VIEWPORTS: readonly VisualViewport[] = [
  { name: 'narrow', width: 375, height: 812 },
  { name: 'medium', width: 768, height: 1024 },
  { name: 'wide', width: 1440, height: 900 },
];

/**
 * The kit's own surfaces — every screen the boilerplate ships and therefore every derivative
 * has on the day it is born.
 *
 * 🔴 THE STATES DECLARED HERE TRAVEL LIVE ONTO A FROZEN `src/` (BR-FACTORY-006), exactly like the
 * routes beside them, and the tolerance is the same one: a derivative whose login has no
 * `input#email`, or whose user table has no switch, loses THAT STATE's cells with a row in the
 * manifest saying so (`skippedStates`) — never the surface, never the run. That is why the two
 * states below name kit PRIMITIVES (`Input`, `Switch`) rather than anything about this app's copy
 * or data: a primitive is what a derivative actually inherits.
 */
export const KIT_SURFACES: readonly VisualSurface[] = [
  {
    name: 'login',
    path: '/login',
    role: null,
    purpose: 'Pantalla de acceso — la única superficie sin sesión de la lista base.',
    readySelector: 'form',
    // The kit's `Input` carries `.surface-focus-inset`, the skin's own unlayered focus ring — the
    // shape EPIC-16 had to adopt because a Tailwind `focus-visible:ring-*` on the same element
    // never painted (the skin ships `.surface-*` outside every cascade layer). This state is what
    // turns that fix from a CSS claim into an image.
    states: [{ name: 'focus-email', focus: 'input#email' }],
  },
  {
    name: 'dashboard',
    path: '/dashboard',
    role: 'admin',
    purpose: 'Home autenticado — shell, navegación y jerarquía de superficies.',
    readySelector: 'main',
  },
  {
    name: 'profile',
    path: '/profile',
    role: 'admin',
    purpose: 'Perfil del usuario — formularios largos y estados de campo.',
    readySelector: 'main',
  },
  {
    name: 'settings-users',
    path: '/settings/users',
    role: 'admin',
    purpose: 'Administración de usuarios — tabla densa, filtros y acciones por fila.',
    // `table`, not `main`: the loading state renders `main` too (its skeleton is a stack of
    // divs), so `main` proves the shell mounted and nothing about the data being there.
    readySelector: 'table',
    // The row status toggle (`Switch` through `StatusToggle`) — the OTHER primitive EPIC-16 fixed,
    // and the one that had no focus indicator at all. `:not([disabled])` is load-bearing: the kit
    // disables the toggle of the signed-in user and of any super_admin, and focus does not move to
    // a disabled control, so without it the state could photograph the resting screen again.
    states: [{ name: 'focus-switch', focus: 'button[role="switch"]:not([disabled])' }],
  },
];

/**
 * A segment of a file name the harness writes: letters, digits, `.`, `_`, `-`, never `.` or
 * `..`, never a path separator. Same rule `E2EPhase.project` uses. Rejected rather than
 * rewritten — a name silently sanitized would not match the filter its author typed.
 *
 * Every segment of a capture's file name goes through this, not just the surface: the theme and
 * the viewport are interpolated into the same string (`captureFileName`) and both come from a
 * registry a project can extend, so validating one of the three left the other two to fail later
 * with an opaque filesystem error instead of a sentence naming the offender.
 */
export function isValidFileSegment(segment: string): boolean {
  if (segment === '.' || segment === '..') return false;
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment);
}

/** The same rule, named for the caller that reads best: a surface's `name`. */
export function isValidSurfaceName(name: string): boolean {
  return isValidFileSegment(name);
}

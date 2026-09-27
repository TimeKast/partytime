/**
 * Visual evidence — the third kind of refusal: the screen is served, and it is not the kit's.
 *
 * THE CASE THIS CLOSES. A surface of the kit's list can fail in two ways that look identical from
 * a distance and are not: the route is not there at all (a 404, a redirect — `availability`,
 * `./manifest`), or the route IS there, served the screen it claims to be, and the element the
 * kit's list says proves that screen rendered never appears. The second one used to arrive as a
 * bare Playwright timeout: unclassified, therefore fatal, therefore the whole matrix lost over one
 * screen whose only sin was looking different in a derivative than in the kit.
 *
 * 🔴 WHY THE WRAPPER LIVES HERE AND NOT IN THE SPEC. The entire reason this signal exists is the
 * FLEET: the kit's surface list travels live (`scripts/**` is a tracked path of the lockfile) onto
 * a `src/` that is frozen at bootstrap (BR-FACTORY-006), so the mismatch it tolerates is created by
 * that very asymmetry. `tests/e2e/visual.evidence.spec.ts` is NOT tracked — it is born with the
 * project and no `factory update` ever rewrites it — so a tolerance written there would never reach
 * a single derivative. This directory does travel, and (like every other module in it) it imports
 * nothing from `src/`: the wait arrives as a function, the same way `makeGitRunner` takes its
 * runner, so this file has no opinion about Playwright and the unit tests never open a browser.
 *
 * 🔴 IT IS DELIBERATELY NARROW, AND THE NARROWNESS IS THE FEATURE. One call site, one wait, one
 * kind — and, within that wait, ONE failure: the timeout. It is not "classify any failure of a kit
 * screen as tolerable": a theme that did not take, a name that would escape the directory, a
 * timeout anywhere else and a `TypeError` all stay exactly as fatal as they were. Widening the
 * tolerance to unclassified errors would let a broken harness pass for a missing screen, which is
 * the failure the classified kinds exist to prevent.
 *
 * 🔴 THE OTHER TWO WAITS OF A CAPTURE STAY OUT OF THIS CLASSIFICATION, AND THAT IS THE RULE, NOT AN
 * OVERSIGHT. Both ask a different question from *"is this screen shaped the way the kit's list
 * describes?"*:
 *
 * | Wait                                                   | Question it asks              | On expiry                          |
 * | ------------------------------------------------------ | ----------------------------- | ---------------------------------- |
 * | `readySelector` — THIS module                          | is this the kit's screen?     | `readiness` → a KIT surface skips  |
 * | Loading placeholders (`PENDING_CONTENT_SELECTOR`)      | did the data arrive?          | fatal, for a surface of any origin |
 * | Images of the visible area (`./capture`)               | did the picture arrive?       | fatal, for a surface of any origin |
 *
 * An app whose placeholders never resolve, or whose visible images never finish, is not an app
 * serving a DIFFERENT screen: it is the screen the list describes, about to be photographed
 * incomplete. Skipping there would hide, behind a tolerance built for a list travelling onto a
 * frozen `src/`, exactly the false evidence the harness exists to refuse.
 */

import { VisualEvidenceError, type SurfaceOrigin } from './manifest';

/**
 * The screen was served and never became the screen the kit's list describes.
 *
 * Its own class rather than a flag at the throw site, for the same reason `SurfaceUnavailableError`
 * is one: every producer of the verdict is greppable and a `catch` reads by name.
 */
export class SurfaceNotReadyError extends VisualEvidenceError {
  constructor(message: string) {
    super(message, 'readiness');
    this.name = 'SurfaceNotReadyError';
  }
}

/**
 * Did the wait EXPIRE — as opposed to blowing up for any other reason?
 *
 * 🔴 THIS IS THE WHOLE CLAIM OF THE `readiness` KIND, AND ONLY A TIMEOUT SUPPORTS IT. "The selector
 * never appeared" is a statement about a screen that rendered something else; it is not what an
 * invalid selector in the kit's own list says (that is the kit's bug), nor a closed page/context,
 * nor a detached frame. Those describe a broken harness, and a broken harness classified as
 * `readiness` would be skipped for a KIT surface — the exact swap the classified kinds exist to
 * prevent. Anything that is not a timeout is re-thrown untouched and stays fatal.
 *
 * Checked BY SHAPE, never by importing Playwright: this module travels to the fleet and imports
 * nothing from `src/` or from the browser stack (the wait arrives as a function). Playwright names
 * its timeout `TimeoutError`, and that name is the contract this reads.
 *
 * EXPORTED because a second wait needs the same distinction with the OPPOSITE conclusion: the
 * image wait of `./capture` also has to tell its own expiry from a broken harness, and it also
 * re-throws everything else untouched — it just never grants a tolerance for the expiry. One
 * definition of "did this wait expire" for the whole directory; two decisions about what it means.
 */
export function isWaitTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

/** What the message needs to name so the reader can act without opening the source. */
export interface SurfaceReadinessContext {
  /** Surface name, as the kit's or the project's list declares it. */
  surface: string;
  /** Which list it came from — assigned by `mergeSurfaceLists`, never by hand. */
  origin: SurfaceOrigin;
  /** The selector that was waited on (`readySelector`, or the harness default). */
  selector: string;
  /** `superficie · tema · ancho` — the cell of the matrix this happened in. */
  label: string;
}

/**
 * Run the wait that proves a surface rendered, and classify its EXPIRY once.
 *
 * 🔴 ONLY A TIMEOUT IS CLASSIFIED (`isWaitTimeout`). Every other way this wait can blow up — an
 * invalid selector shipped in the kit's list, a page or context already closed, a detached frame —
 * says something about the harness, not about a screen that is shaped differently in a derivative,
 * and is re-thrown exactly as it arrived.
 *
 * 🔴 ONLY A **KIT** SURFACE GETS THE CLASSIFICATION, AND THAT IS A SECOND LOCK, NOT A DUPLICATE OF
 * `isSurfaceSkippable`. That predicate also refuses a project surface, but here the refusal happens
 * one layer earlier: a `readiness` error can never even be CONSTRUCTED for a screen the project
 * declared, so no future edit to the skip predicate can hand a project surface a tolerance that was
 * meant for a list travelling onto a frozen `src/`. A project surface's failure is re-thrown
 * untouched — same error, same message, same fatality it always had.
 *
 * 🔴 CALL IT ONLY AFTER `assertSurfaceIdentity` HAS PASSED. The whole claim of this kind is "the
 * route exists and served the right screen, and the screen is not shaped like the kit's". Wrapping
 * a wait that runs before identity is proven would fold a redirect into this signal and lose the
 * distinction both kinds are for.
 */
export async function waitForSurfaceReady(
  wait: () => Promise<unknown>,
  context: SurfaceReadinessContext
): Promise<void> {
  try {
    await wait();
  } catch (error) {
    if (context.origin !== 'kit' || !isWaitTimeout(error)) throw error;

    const cause = error instanceof Error ? error.message : String(error);
    throw new SurfaceNotReadyError(
      `[${context.label}] la pantalla '${context.surface}' respondió, pero el selector que prueba ` +
        `que renderizó ('${context.selector}') nunca apareció. La lista del kit viaja viva sobre ` +
        'un `src/` congelado en el bootstrap, así que en este checkout esa pantalla puede ' +
        'legítimamente no tener ese elemento — se salta y queda registrada, en vez de costar la ' +
        'matriz entera. Remedio durable: declárala en la lista del proyecto con su propio ' +
        `\`readySelector\`, o exclúyela por nombre.\n   Causa original: ${cause}`
    );
  }
}

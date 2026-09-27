/**
 * Visual evidence — the manifest, and the surface resolution that decides what goes in it.
 *
 * Everything here is PURE (no `fs`, no browser, no Playwright): it is the half of the harness
 * that can be asserted in milliseconds, and `scripts/tools/__tests__/visual-evidence-manifest.test.ts`
 * is where that happens. The spec under `tests/e2e/` owns the half that needs a real browser.
 *
 * THE MANIFEST IS THE CONTRACT WITH `ui-critic`. The agent's tools are `Read, Grep, Glob` — it
 * already renders an image it is given a path to. What it never had was the list of paths plus
 * what each one IS: which screen, which theme, which width, and what the contrast measured
 * there. That list is this file's output.
 */

import {
  REST_STATE,
  isValidFileSegment,
  isValidSurfaceName,
  type VisualSurface,
  type VisualViewport,
} from './surfaces';

/**
 * Schema tag of the manifest — bumped if the shape ever changes under a consumer's feet.
 *
 * `/2` added `codeSeal` (which commit the evidence came from) and `skippedSurfaces` (kit screens
 * this checkout does not have). Both were ADDITIVE, so a reader that ignores unknown keys was
 * unaffected — but the tag is what lets a consumer tell a manifest that is UNSEALED from one
 * written before seals existed, and those two call for different reactions.
 *
 * 🔴 `/3` IS NOT ADDITIVE, AND THAT IS WHY IT MOVED. The state axis changes the CARDINALITY of
 * `captures`: a consumer that used to find exactly one row per `(surface, theme, viewport)` — the
 * grouping `ui-critic` does to compare a screen across themes for DS4 — now finds one per state,
 * and comparing a focused capture against a resting one across two themes is a difference it
 * would report as a defect of the screen. The file name gained a fourth segment for the same
 * reason (`captureFileName`). A new KEY would not have justified the bump; a set that partitions
 * under a reader's existing grouping does, which is the exact situation the tag exists for.
 *
 * Its two live consumers were updated with it: `.claude/agents/ui-critic.md` (the input contract)
 * and `.claude/skills/fx-visual-evidence/SKILL.md` (what the harness guarantees).
 *
 * 🔴 `/4` MOVED THE TAG BECAUSE THE SEAL CHANGED SHAPE, AND WITH IT THE OPERATION EVERY CONSUMER
 * PERFORMS. `CodeSeal` gained `codeCommit` / `codeDirty` / `inputs`: the question the seal answers
 * stopped being "which commit was `HEAD`" and became "which commit last touched the code that
 * DRAWS this screen" (`./git`, `readCodeSeal`). A `/3` manifest has none of those three fields, so
 * a consumer that read `codeCommit` on it would get `undefined` and — comparing `undefined`
 * against a real commit — would silently answer "does not correspond" for every finding. The tag
 * is what lets it say instead: this manifest predates the code seal, treat it as unsealed and
 * recapture. That is the same job the tag did for `/2`, one field down.
 *
 * ℹ️  A pathspec list is what makes the recomputation self-contained: a consumer reads
 * `codeSeal.inputs` out of the manifest and hands it straight to `git`, instead of the kit's input
 * registry being copied into three documents (`kb-ssot-registries`). A manifest WITHOUT `inputs`
 * therefore has no comparison defined — `git rev-list -1 HEAD --` with an empty pathspec answers
 * about the whole tree, which is precisely the answer this schema stopped giving.
 */
export const MANIFEST_SCHEMA = 'timekast.visual-evidence/4';

/** Where evidence lands, relative to the project root. See `evidenceRootDir` for the why. */
export const EVIDENCE_DIR = 'tests/.evidence';

/** File name of the manifest inside a run's directory. */
export const MANIFEST_FILE = 'manifest.json';

/** Pointer file at the root of `tests/.evidence/` naming the newest run. */
export const LATEST_POINTER_FILE = 'latest.json';

/**
 * WHY a refusal happened — and therefore what may be done about it.
 *
 * `integrity` is the harness catching itself producing FALSE evidence: a theme that did not take,
 * a name that would escape the directory, a filter nobody's list matches. Those must always kill
 * the run — a capture nobody can tell is wrong by looking at it is worse than no capture.
 *
 * `availability` is a screen this app simply does not have where the list says it is: a 404, a
 * redirect somewhere else. That is a fact about the CHECKOUT, not a defect of the harness, and
 * for a surface the KIT declared it is a tolerable one (`isSurfaceSkippable`).
 *
 * `readiness` is the case BETWEEN those two: the route exists and served the screen it claims to
 * be (`assertSurfaceIdentity` passed), and an element the kit's list NAMES is not in the screen it
 * got. For a KIT surface that is the same fact `availability` states in a different shape — the
 * kit's list travels live onto a `src/` frozen at bootstrap (BR-FACTORY-006), so the screen this
 * checkout serves at that route can legitimately not have the kit's `readySelector` in it, nor
 * the primitive one of its `states` wants to focus.
 *
 * 🔴 IT HAS EXACTLY TWO PRODUCERS AND THEY MAKE THE SAME CLAIM AT DIFFERENT GRANULARITY — never
 * inferred from an arbitrary failure. `waitForSurfaceReady` (`./readiness`) says it about the
 * screen and costs the WHOLE surface; the unreachable state of `./capture` says it about one
 * element and costs THAT STATE's cells only. A state that fell back on the first producer's
 * granularity would drop a screen that photographs perfectly at rest, which is worse evidence
 * than the state it was trying to add.
 *
 * 🔴 THE SET IS CLOSED AND THAT IS THE POINT. Anything that is not one of these three — a
 * Playwright timeout elsewhere, a `TypeError`, a theme that did not apply — is unclassified, and
 * an unclassified refusal is one nobody decided about: it kills the run.
 */
export type FailureKind = 'integrity' | 'availability' | 'readiness';

/**
 * Everything this harness throws. A named class so the spec can print the message plainly
 * instead of a stack, and so a `catch` can tell a harness refusal from a Playwright failure.
 *
 * The default is `integrity` on purpose: a refusal that does not classify itself is one nobody
 * decided about, and the safe reading of an undecided refusal is "kill the run".
 */
export class VisualEvidenceError extends Error {
  readonly kind: FailureKind;

  constructor(message: string, kind: FailureKind = 'integrity') {
    super(message);
    this.name = 'VisualEvidenceError';
    this.kind = kind;
  }
}

/**
 * The screen is not reachable in THIS app. Its own class rather than a flag at the throw site so
 * that every producer of the verdict is greppable, and so a `catch` reads by name.
 */
export class SurfaceUnavailableError extends VisualEvidenceError {
  constructor(message: string) {
    super(message, 'availability');
    this.name = 'SurfaceUnavailableError';
  }
}

/**
 * Which list a surface came from — the kit's or the project's own.
 *
 * 🔴 IT IS NOT DECORATION: it is what decides whether an unreachable screen skips or kills the
 * run (`isSurfaceSkippable`). It is assigned by `mergeSurfaceLists`, never declared by hand in a
 * surface list, precisely so a project cannot label its own screen as the kit's and inherit a
 * tolerance that was never meant for it.
 */
export type SurfaceOrigin = 'kit' | 'project';

/** A surface after the merge — the same datum, plus the list it came from. */
export type ResolvedSurface = VisualSurface & { origin: SurfaceOrigin };

/**
 * A surface of the KIT's list that this checkout could not photograph, and why.
 *
 * Recorded in the manifest so the skip is a DECLARED hole, never a silent one: a reader diffing
 * `surfaces` against `captures` finds the reason here instead of guessing.
 */
export interface SurfaceSkip {
  surface: string;
  route: string;
  /** Always `'kit'` — a project surface never skips (`isSurfaceSkippable`). */
  origin: SurfaceOrigin;
  reason: string;
  /** How many cells of the matrix (theme × width × state) were lost with it. */
  lostCaptures: number;
}

/**
 * A STATE of a kit surface this checkout could not reach — the surface itself was photographed.
 *
 * 🔴 ITS OWN ROW, AND NOT A `SurfaceSkip`, BECAUSE IT IS NOT THE SAME HOLE. A skipped surface says
 * "this screen is not in the evidence"; this says "this screen is in the evidence, at rest, and
 * the element one of its states wanted to focus is not in it". Filing the second under the first
 * would tell a reader a screen was never photographed while its resting captures sit right there
 * in `captures` — the kind of contradiction a reader resolves by trusting the wrong half.
 *
 * The tolerance is the KIT one, unchanged and reused verbatim (`isSurfaceSkippable`): a state
 * declared by the PROJECT's own list is the team's line about its own app, so it kills the run.
 */
export interface StateSkip {
  surface: string;
  route: string;
  /** The state's `name`, as the surface declared it. */
  state: string;
  /** Always `'kit'` — a project surface's state never skips (`isSurfaceSkippable`). */
  origin: SurfaceOrigin;
  reason: string;
  /** How many cells (theme × width) of THIS state were lost. Never the whole surface. */
  lostCaptures: number;
}

/**
 * Which code this evidence came from — the manifest's answer to "is this about the app I am
 * looking at".
 *
 * Produced by `readCodeSeal` (`./git`); declared here because the manifest owns its own schema,
 * the same way `ContrastSummary` is declared here and computed in `./contrast`.
 *
 * 🔴 TWO PAIRS, AND THE DECISION IS THE SECOND ONE. `commit` / `dirty` describe the CHECKOUT (the
 * `HEAD` the run happened on, and whether anything at all was uncommitted) — kept verbatim,
 * because that is how a human traces a manifest back to a moment. `codeCommit` / `codeDirty`
 * describe the DRAWING INPUTS only, and they are what a consumer decides on. The split exists
 * because a commit that cannot repaint a pixel — a backlog document, a CLI change — used to
 * invalidate perfectly good evidence and buy a full recapture.
 *
 * `commit: null` / `codeCommit: null` are legitimate values (a tree with no `.git/`, no `git`
 * binary, no commits yet, or a history where nothing ever touched a drawing input) and they
 * always carry `note` saying which of those it was. What they never are, is absent or guessed:
 * an unsealed manifest that looks sealed is the exact failure this field closes.
 */
export interface CodeSeal {
  /** `git rev-parse HEAD` at capture time. About the CHECKOUT, not about what was drawn. */
  commit: string | null;
  /**
   * Whether `git status --porcelain` reported anything over the WHOLE tree — untracked files
   * included, which is settled (`fx-visual-evidence §2.1`). Context for a reader; the reuse
   * decision is `codeDirty`.
   */
  dirty: boolean | null;
  /**
   * The last commit reachable from `HEAD` that touched one of `inputs` — the newest change that
   * could have altered what these screenshots show. `null` when git could not answer, or when no
   * commit in this history ever touched a drawing input.
   */
  codeCommit: string | null;
  /**
   * Whether `git status --porcelain` reported anything WITHIN `inputs`. Untracked entries count
   * here too: adding `layout.tsx` repaints a photographed surface without editing a tracked file.
   */
  codeDirty: boolean | null;
  /**
   * The pathspecs the two fields above were computed over — the kit's build-stamp inputs plus
   * whatever this project declared in `package.json#e2eBuildInputs`, as they stood at capture.
   *
   * 🔴 RECORDED SO THE COMPARISON IS SELF-CONTAINED. A consumer feeds this list straight back to
   * `git` (`git rev-list -1 HEAD -- $(jq -r '.codeSeal.inputs[]' manifest.json)`), so nothing has
   * to copy the kit's registry into a skill document to be able to compare. It lists every
   * CANDIDATE path, present or not: a `tailwind.config.ts` that a later commit ADDS has to be
   * inside the set an older manifest is re-measured against, or that commit would not move the
   * seal and stale evidence would certify as fresh.
   */
  inputs: string[];
  note?: string;
}

/**
 * A PROJECT surface whose `prepare` said there was nothing to photograph (`false`) — no data for
 * the state it reaches. The surface's cells are lost and the run goes on.
 *
 * ITS OWN ROW, NOT A `SurfaceSkip`, because it is not the kit's tolerance: `skippedSurfaces` is
 * for kit screens this checkout does not have, and every row there is `origin: 'kit'` by
 * construction. This is the project's own code declaring "not today" about its own screen — a
 * third kind of hole, declared like the other two, so a reader never mistakes it for a screen
 * that was photographed and passed.
 */
export interface PrepareSkip {
  surface: string;
  route: string;
  /** Always `'project'` — only a project surface may carry `prepare`. */
  origin: SurfaceOrigin;
  reason: string;
  /** How many cells of the matrix (theme × width × state) were lost with it. */
  lostCaptures: number;
}

/** What one capture recorded — one row of the manifest's `captures`. */
export interface CaptureRecord {
  surface: string;
  route: string;
  /**
   * Set when the surface's `prepare` ran before this capture: the cell depended on PROJECT code
   * to reach its state, not on a route alone. Absent otherwise — an explicit `true`, never
   * `false`, so a manifest written before this field reads the same as one whose row was not
   * prepared.
   */
  prepared?: true;
  /**
   * The pathname the browser was actually on when the shutter fired, for a prepared capture.
   * `route` is the ENTRY; this is where the preparation landed (the detail of the first record,
   * the wizard's third step). Absent when nothing was prepared — the route is the answer.
   */
  landedAt?: string;
  role: string | null;
  theme: string;
  viewport: VisualViewport;
  /**
   * WHICH INTERACTION STATE this row is — `REST_STATE` for the screen as it loaded, otherwise the
   * `name` of the state the surface declared (`SurfaceState`, `./surfaces`).
   *
   * 🔴 ALWAYS PRESENT, INCLUDING AT REST, and that is the field's whole job. Two rows of the same
   * `(surface, theme, viewport)` are now legitimate, so a reader that groups by those three has to
   * be able to separate them — and an absent value at rest would make "photographed at rest"
   * indistinguishable from "written before this axis existed". The tag says which era the manifest
   * is from (`MANIFEST_SCHEMA`); this field says what the row is.
   */
  state: string;
  /** Path of the PNG, relative to the manifest's own directory. */
  screenshot: string;
  /**
   * Measured over the LIVE DOM of this very capture — never a static rule (`./contrast`).
   *
   * "This very capture" is the WHOLE claim, and it is kept true by clipping: the image is the
   * visible area (`CAPTURE_FULL_PAGE`, `./capture`) and the samples are clipped to that same band
   * (`clipSamplesToViewport`), so the number here describes text a reader of the PNG can see.
   * Text below the fold is in neither the image nor the measurement — the two scopes are one.
   */
  contrast: ContrastSummary;
  capturedAt: string;
}

/** The contrast summary a capture carries. Shape declared here so the manifest owns its schema. */
export interface ContrastSummary {
  /** Text nodes sampled from the rendered page that the measurement APPLIES to (exempt ones are not here). */
  samples: number;
  /** Of those, how many had two parseable colours to compare. */
  evaluated: number;
  /** Worst ratio seen (null when nothing was evaluable). */
  min: number | null;
  /** How many evaluated samples fell below their required ratio — uncapped count. */
  failing: number;
  /** The offenders themselves, CAPPED — the manifest is read by a human and an agent, not a linter. */
  failures: ContrastFailure[];
  /**
   * Text nodes DECLARED decorative — out of the accessibility layer in the DOM, or named by the
   * project's `EXCLUDED_CONTRAST_SELECTORS` — and therefore never measured. A THIRD answer beside
   * "passed" and "could not be read": WCAG exempts decorative text, but the exemption is the
   * author's declaration, not the harness's finding, so it is reported rather than removed.
   * `exemptions` says which declaration. A reader that sees most of a screen's text here is
   * looking at a screen that hid its text, not one that fixed it.
   */
  notApplicable: number;
  exemptions: ContrastExemptions;
  /** `true` when nothing evaluated fell below its required ratio. */
  pass: boolean;
}

/** How many samples each kind of declaration took out of the measurement. */
export interface ContrastExemptions {
  /** `aria-hidden="true"` on the node or an ancestor. */
  ariaHidden: number;
  /** `role="presentation"` / `role="none"` on the node or an ancestor. */
  presentation: number;
  /** Matched by a selector the project declared in `EXCLUDED_CONTRAST_SELECTORS`. */
  excluded: number;
}

export interface ContrastFailure {
  selector: string;
  ratio: number;
  required: number;
  text: string;
}

/** The document `ui-critic` is handed. */
export interface EvidenceManifest {
  schema: typeof MANIFEST_SCHEMA;
  runId: string;
  generatedAt: string;
  baseURL: string;
  /** The active skin and the themes it declares — the matrix is derived, never hardcoded. */
  skin: string;
  themes: string[];
  viewports: VisualViewport[];
  surfaces: { name: string; route: string; role: string | null; purpose: string }[];
  captures: CaptureRecord[];
  /** Exclusions declared by the project that match no kit surface — reported, never silent. */
  staleExclusions: string[];
  /**
   * The selectors the project declared out of the contrast measurement, verbatim. Recorded so a
   * reader of `contrast.exemptions.excluded` can see WHAT was exempted, not just how much.
   */
  contrastExclusions: string[];
  /** Kit surfaces this checkout does not have — reported, never silent (same rule, other cause). */
  skippedSurfaces: SurfaceSkip[];
  /** States of a kit surface this checkout could not reach — same rule, one axis down. */
  skippedStates: StateSkip[];
  /** Project surfaces whose `prepare` found nothing to photograph — declared, never silent. */
  unpreparedSurfaces: PrepareSkip[];
  /** Which code produced this evidence. Never absent; `commit: null` when git could not say. */
  codeSeal: CodeSeal;
}

/**
 * Union of the kit's list and the project's, with the project able to drop a kit screen its app
 * does not have.
 *
 * Order: the kit's first (minus exclusions), then the project's. A project entry whose `name`
 * repeats a kit one REPLACES it in place — that is how a derivative keeps the screen but points
 * it at its own route (a project that renamed `/settings/users`), without having to exclude and
 * re-add.
 *
 * EVERY SURFACE COMES OUT TAGGED WITH ITS ORIGIN, and that tag is the whole basis of the
 * tolerance an unreachable KIT screen gets (`isSurfaceSkippable`). A project entry that replaces
 * a kit one by name is tagged `project`: the team wrote that line, so its failure is theirs.
 *
 * 🔴 A STALE EXCLUSION IS REPORTED, NOT FATAL — and the asymmetry with a filter typo
 * (`resolveSurfaceFilters`, which throws) is deliberate. A filter is typed at the moment of
 * invocation by the person running the harness: a typo there means the run captures nothing of
 * what was asked for, so it must die. An exclusion is a DURABLE declaration in a file the update
 * never rewrites, whose target can legitimately disappear when the kit renames a surface —
 * killing the fleet's harness over that would be a suite destroyed by somebody else's rename.
 * It rides in the manifest instead, where it is impossible to miss and costs nobody a run.
 *
 * 🔴 AND THE SYMMETRIC CASE — A KIT **ADDITION** — HAS THE SAME RADIUS AND USED TO HAVE NO
 * TOLERANCE AT ALL. This list travels live (`scripts/**` is tracked) onto a `src/` that is frozen
 * at bootstrap (BR-FACTORY-006), so the day the Factory adds a screen here, every derivative that
 * does not have it tries to photograph a route its app never had. Exclusion is the remedy, but it
 * is a remedy the team has to APPLY — and until it does, one unreachable screen used to abort the
 * single test that drives the whole matrix, so no manifest was written for the surfaces that DID
 * exist. All-or-nothing over somebody else's addition, which is exactly the argument this
 * function already refused to accept for a rename. `isSurfaceSkippable` closes it.
 */
export function mergeSurfaceLists(
  kitSurfaces: readonly VisualSurface[],
  projectSurfaces: readonly VisualSurface[] = [],
  excludedKitSurfaces: readonly string[] = []
): { surfaces: ResolvedSurface[]; staleExclusions: string[] } {
  for (const surface of [...kitSurfaces, ...projectSurfaces]) {
    if (!isValidSurfaceName(surface.name)) {
      throw new VisualEvidenceError(
        `Nombre de superficie inválido: '${surface.name}'. Se permiten letras, dígitos, '.', '_' y '-' ` +
          '(nunca un separador de ruta, nunca `.` ni `..`) — el nombre es un segmento del archivo de captura.'
      );
    }
  }

  // 🔴 THE KIT'S LIST IS DATA. `prepare` is behaviour, and behaviour in a list that travels live
  // onto every derivative's frozen `src/` is code the fleet would run without reviewing. Refused
  // here, at the merge, so the rule holds whoever assembles the kit's list — not only the file.
  for (const surface of kitSurfaces) {
    if (typeof surface.prepare === 'function') {
      throw new VisualEvidenceError(
        `La superficie del kit '${surface.name}' declara 'prepare'. La lista del kit es un dato: ` +
          'un paso de preparación (comportamiento) sólo puede declararlo la lista del PROYECTO, ' +
          'en tests/e2e/visual-evidence.surfaces.ts, donde el equipo revisa su propio código.'
      );
    }
  }

  const excluded = new Set(excludedKitSurfaces);
  const kitNames = new Set(kitSurfaces.map((surface) => surface.name));
  const staleExclusions = [...excluded].filter((name) => !kitNames.has(name)).sort();

  const merged: ResolvedSurface[] = kitSurfaces
    .filter((surface) => !excluded.has(surface.name))
    .map((surface) => ({ ...surface, origin: 'kit' as const }));

  for (const surface of projectSurfaces) {
    const declared: ResolvedSurface = { ...surface, origin: 'project' };
    const index = merged.findIndex((candidate) => candidate.name === surface.name);
    if (index >= 0) merged[index] = declared;
    else merged.push(declared);
  }

  return { surfaces: merged, staleExclusions };
}

/**
 * Union of the kit's widths and the project's — the same mechanics `mergeSurfaceLists` gives the
 * surfaces, applied to the OTHER axis a project turned out to own.
 *
 * Order: the kit's first, then the project's. A project entry whose `name` repeats a kit one
 * REPLACES it in place (a project whose layout switches at 1024 declares `medium` at 1024 and the
 * kit's 768 is gone); a new name ADDS a column. There is no subtractive half: a width nobody wants
 * has no analogue of "a screen this app does not have", and a project that wants fewer than three
 * is asking to photograph less than `SK.md §3.2` requires.
 *
 * 🔴 WHY THIS IS THE PROJECT'S TO DECIDE. The kit's `medium` exists because a regression that only
 * showed between narrow and wide reached production in one derivative; a SECOND derivative met the
 * same class of regression at a different width, because its grids switch to four columns in the
 * 1024-1180 band. The right middle number depends on where each app's layout actually switches —
 * so the axis belongs to the project, and a kit that pinned it left that project two bad exits:
 * fork a tracked file (reverted by the next update) or keep a second harness. Every entry is
 * validated as a file-name segment here, for the same reason `mergeSurfaceLists` validates names:
 * the width's name lands in every capture's file name (`captureFileName`), and failing here names
 * the offender instead of failing later inside `page.screenshot`.
 */
export function mergeViewports(
  kitViewports: readonly VisualViewport[],
  projectViewports: readonly VisualViewport[] = []
): VisualViewport[] {
  for (const viewport of [...kitViewports, ...projectViewports]) {
    if (!isValidFileSegment(viewport.name)) {
      throw new VisualEvidenceError(
        `Nombre de ancho inválido: '${viewport.name}'. Se permiten letras, dígitos, '.', '_' y '-' ` +
          '(nunca un separador de ruta, nunca `.` ni `..`) — el nombre es un segmento del archivo de captura.'
      );
    }
  }

  const merged: VisualViewport[] = kitViewports.map((viewport) => ({ ...viewport }));
  for (const viewport of projectViewports) {
    const declared = { ...viewport };
    const index = merged.findIndex((candidate) => candidate.name === viewport.name);
    if (index >= 0) merged[index] = declared;
    else merged.push(declared);
  }
  return merged;
}

/**
 * Read a filter out of its raw string (`EVIDENCE_SURFACES=dashboard,login`). Blank entries are
 * dropped so a trailing comma is not a filter that matches nothing.
 */
export function parseSurfaceFilter(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Narrow the surfaces to those named by the filter.
 *
 * 🔴 A NAME THAT MATCHES NOTHING THROWS, NAMING IT AND LISTING WHAT EXISTS. This is trap 3 of
 * the four this harness canonizes, and it is the one that costs a real audit: a filter with a
 * typo that degraded to zero captures produced an empty manifest, and an empty manifest reads
 * as "no findings" — DS4 passing because there was nothing to look at, not because there was
 * nothing wrong. Every other guarantee here is worthless if this one degrades quietly.
 *
 * No filter ⇒ every surface, in declaration order. A repeated name is captured once.
 */
export function resolveSurfaceFilters<T extends VisualSurface>(
  surfaces: readonly T[],
  filters: readonly string[] = []
): T[] {
  if (filters.length === 0) return [...surfaces];

  const byName = new Map(surfaces.map((surface) => [surface.name, surface]));
  const unmatched = filters.filter((filter) => !byName.has(filter));

  if (unmatched.length > 0) {
    throw new VisualEvidenceError(
      `Filtro de superficies sin coincidencia: ${unmatched.map((name) => `'${name}'`).join(', ')}. ` +
        `Superficies declaradas: ${surfaces.map((surface) => `'${surface.name}'`).join(', ') || '(ninguna)'}. ` +
        'El harness falla en vez de producir cero capturas: un manifest vacío se lee como "sin hallazgos".'
    );
  }

  const seen = new Set<string>();
  const resolved: T[] = [];
  for (const filter of filters) {
    if (seen.has(filter)) continue;
    seen.add(filter);
    resolved.push(byName.get(filter)!);
  }
  return resolved;
}

/**
 * The PNG's file name for one cell of the matrix. Deterministic — two runs agree.
 *
 * ALL FOUR SEGMENTS ARE VALIDATED, not just the surface. The theme comes from the active skin's
 * registry, the viewport from the widths table and the state from the surface's own declaration:
 * all three are data a project can extend, so all three land in this file name (and in the
 * manifest that names it) exactly like the surface does. Validating one of four meant a theme
 * called `../x` failed later, inside `page.screenshot`, with a filesystem error that named
 * neither the theme nor this function.
 *
 * 🔴 THE STATE IS A SEGMENT AND NOT A SUFFIX ONLY WHEN IT IS NOT `rest`. It is spelled out for
 * every capture, resting ones included, for the same reason `CaptureRecord.state` is: two states
 * of one cell must differ in the file name, and a reader looking at a directory listing must not
 * have to know that a three-segment name means "at rest" — that convention would be exactly the
 * absent value this axis refuses to have.
 */
export function captureFileName(
  surface: string,
  theme: string,
  viewport: string,
  state: string
): string {
  for (const [label, segment] of [
    ['superficie', surface],
    ['tema', theme],
    ['ancho', viewport],
    ['estado', state],
  ] as const) {
    if (!isValidFileSegment(segment)) {
      throw new VisualEvidenceError(
        `Segmento inválido en el nombre de la captura — ${label}: '${segment}'. Se permiten ` +
          "letras, dígitos, '.', '_' y '-' (nunca un separador de ruta, nunca `.` ni `..`): los " +
          'cuatro segmentos son parte del archivo que el harness escribe y del manifest que lo cita.'
      );
    }
  }
  return `${surface}__${theme}__${viewport}__${state}.png`;
}

/** A state after resolution: the resting one carries no selector, a declared one always does. */
export interface ResolvedState {
  name: string;
  /** Selector to leave focused before the shutter — `null` is the resting capture. */
  focus: string | null;
}

/**
 * Every state ONE surface is photographed in: the resting one first, then whatever it declared.
 *
 * 🔴 REST IS FIRST AND IT IS NOT COSMETIC. Focusing scrolls its target into view, so a state
 * capture can legitimately leave the page scrolled; taking the resting picture after one of them
 * would photograph a screen the user never lands on. Rest is also what every surface has whether
 * or not it declares anything, which is why it is added here instead of being repeated in
 * `KIT_SURFACES` and in every project's list.
 *
 * TWO REFUSALS, BOTH `integrity`, BOTH ABOUT A COLLISION RATHER THAN ABOUT TASTE: a declared state
 * named `rest` and two declared states with the same name would each produce two captures writing
 * the SAME PNG, so the second silently overwrites the first and the manifest cites a file that no
 * longer shows what its row claims. That is the collision `captureFileName` exists to make
 * impossible, arriving one level up.
 */
export function resolveSurfaceStates(surface: VisualSurface): ResolvedState[] {
  const declared = surface.states ?? [];
  const resolved: ResolvedState[] = [{ name: REST_STATE, focus: null }];
  const seen = new Set<string>([REST_STATE]);

  for (const state of declared) {
    if (seen.has(state.name)) {
      throw new VisualEvidenceError(
        `La superficie '${surface.name}' declara dos veces el estado '${state.name}'` +
          (state.name === REST_STATE
            ? ` (que además es el estado en reposo de toda superficie)`
            : '') +
          '. Dos estados con el mismo nombre escribirían el MISMO archivo de captura: el segundo ' +
          'pisa al primero y el manifest termina citando una imagen que ya no muestra lo que su ' +
          'fila dice.'
      );
    }
    seen.add(state.name);
    resolved.push({ name: state.name, focus: state.focus });
  }

  return resolved;
}

/**
 * How many cells of the matrix ONE surface owns — themes × widths × ITS OWN states.
 *
 * 🔴 IT IS PER SURFACE, AND IT USED TO BE A SINGLE NUMBER FOR THE WHOLE RUN. Two formulas depended
 * on every surface costing the same (the run's `total`, and the cells a skip is counted in), and
 * with states declared per surface that stopped being true. Both derive from this one function now,
 * so the run's closing equation — captures + everything accounted for as lost === total — stays an
 * exact equation instead of degrading into "at least".
 */
export function surfaceCellCount(
  surface: VisualSurface,
  themeCount: number,
  viewportCount: number
): number {
  return resolveSurfaceStates(surface).length * themeCount * viewportCount;
}

/** A route reduced to what identity comparison may depend on: its pathname, without trailing `/`. */
export function normalizeRoute(route: string): string {
  const pathOnly = route.split('#')[0].split('?')[0];
  const trimmed = pathOnly.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Refuse to photograph a page that is not the surface it claims to be.
 *
 * 🔴 THE THEME IS PROVEN THREE WAYS AND THE SCREEN USED TO BE PROVEN NONE. `assertThemeApplied`
 * reads the class AND the skin's token AND fails the run when they disagree, because a capture
 * of the wrong theme is evidence nobody can tell is wrong by looking at it. A capture of the
 * wrong SCREEN has that exact property: a session that expired redirects `/settings/users` to
 * `/login`, and the harness would archive the login page under `settings-users__dark__wide.png`,
 * measure its contrast, and write a manifest that says `pass: true`. Two facts close it — the
 * response status and the URL the browser actually ended on — and both are free.
 *
 * `status` is `null` when the navigation produced no response (a same-document one); that is not
 * evidence of a problem, so only the URL is checked in that case.
 *
 * BOTH REFUSALS ARE `availability`, not `integrity`: what they establish is that this checkout
 * does not serve that screen at that route — a fact about the app, which for a kit surface is
 * exactly the tolerable case (`isSurfaceSkippable`). Nothing about the harness is broken when
 * they fire; the harness is doing its job.
 */
export function assertSurfaceIdentity(args: {
  surface: VisualSurface;
  status: number | null;
  url: string;
  baseURL: string;
  label: string;
}): void {
  const { surface, status, url, baseURL, label } = args;

  if (status !== null && status >= 400) {
    throw new SurfaceUnavailableError(
      `[${label}] '${surface.path}' respondió ${status}. El harness no fotografía una pantalla de ` +
        `error bajo el nombre de '${surface.name}': la captura se vería plausible y el manifest ` +
        'diría que se auditó una pantalla que nunca se cargó.'
    );
  }

  let actual: string;
  try {
    actual = new URL(url, baseURL || 'http://localhost').pathname;
  } catch {
    actual = url;
  }

  if (normalizeRoute(actual) !== normalizeRoute(surface.path)) {
    throw new SurfaceUnavailableError(
      `[${label}] se pidió '${surface.path}' y el navegador terminó en '${actual}'. Un redirect ` +
        `(sesión no válida para el rol '${surface.role ?? 'sin sesión'}', ruta movida, guard de ` +
        `RBAC) produciría una captura de OTRA pantalla archivada como '${surface.name}'.`
    );
  }
}

/**
 * May THIS failure of THIS surface be skipped instead of killing the run?
 *
 * Two conditions, and both are load-bearing:
 *
 * 1. **The surface is the KIT's.** The kit's list travels live onto a frozen `src/`
 *    (`mergeSurfaceLists`), so a screen it declares can legitimately not exist here. A screen the
 *    PROJECT declared is the opposite case: the team wrote that line about its own app, so its
 *    absence is their error, and swallowing it would be the "degrade to zero captures" this
 *    harness refuses everywhere else — arriving one surface at a time instead of all at once.
 * 2. **The failure is `availability` or `readiness` — two kinds, named one by one.** Both are
 *    facts about the checkout: the route is not there, or the route is there and the screen the
 *    kit's list describes is not (`./readiness`). An `integrity` refusal (a theme that did not
 *    take, a segment that would escape the directory) says the harness is producing false
 *    evidence, and that is never tolerable for anybody's surface. Anything that is not a
 *    `VisualEvidenceError` at all — a Playwright timeout somewhere else, a `TypeError` — is not
 *    classified and therefore not skipped: widening this to "any error" would reopen the
 *    all-or-nothing case in reverse, letting a broken harness look like a missing screen.
 *
 * 🔴 It never answers "the run may end with nothing". `ManifestBuilder.finish()` still refuses a
 * manifest with zero captures, so a checkout where EVERY surface skipped fails exactly as loudly
 * as before. This widens what one missing screen costs; it does not touch the floor.
 */
export function isSurfaceSkippable(error: unknown, surface: ResolvedSurface): boolean {
  if (surface.origin !== 'kit') return false;
  return error instanceof VisualEvidenceError && SKIPPABLE_KINDS.has(error.kind);
}

/**
 * The kinds a KIT surface may skip on — ENUMERATED, never "anything that is not integrity".
 *
 * Both members say the same thing about the CHECKOUT in two shapes: the route is not there
 * (`availability`), or the route is there and the screen the kit's list describes is not
 * (`readiness`). Written as an explicit set so widening it is a deliberate edit to this line,
 * with a test that has to be updated alongside it — the opposite of a predicate that grows by
 * accident the day somebody adds a kind.
 */
const SKIPPABLE_KINDS: ReadonlySet<FailureKind> = new Set(['availability', 'readiness']);

/**
 * A run's identifier — the timestamp, made safe for a directory name.
 *
 * ONE DIRECTORY PER RUN IS WHAT MAKES THE EVIDENCE DURABLE (trap 1). Playwright DELETES its
 * `outputDir` as it starts, so evidence written there disappears mid-execution of the next run;
 * `tests/.evidence/` is nobody's `outputDir`, and inside it each run owns its own folder, so
 * running the harness twice in a row leaves TWO sets of captures rather than one overwriting the
 * other. It is gitignored beside `tests/.auth/` for the same reason that directory is:
 * authenticated screens of seeded data are not something a repository should be able to receive
 * by accident.
 */
export function makeRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

/** `tests/.evidence` under the given project root — POSIX-joined, the caller re-roots if needed. */
export function evidenceRootDir(rootDir: string): string {
  return `${rootDir.replace(/\/+$/, '')}/${EVIDENCE_DIR}`;
}

/** `tests/.evidence/<runId>` — where one run's manifest and PNGs land. */
export function evidenceRunDir(rootDir: string, runId: string): string {
  return `${evidenceRootDir(rootDir)}/${runId}`;
}

/** Everything the builder needs that is not a capture. */
export interface ManifestInit {
  runId: string;
  baseURL: string;
  skin: string;
  themes: readonly string[];
  viewports: readonly VisualViewport[];
  surfaces: readonly VisualSurface[];
  staleExclusions?: readonly string[];
  contrastExclusions?: readonly string[];
  /**
   * Which code this evidence came from (`readCodeSeal`). REQUIRED, and deliberately not
   * defaulted: a builder that could invent an empty seal would emit manifests that look unsealed
   * for two different reasons — git could not say, or nobody asked it.
   */
  codeSeal: CodeSeal;
  generatedAt?: string;
}

/**
 * Accumulate captures and emit the manifest.
 *
 * `finish()` REFUSES AN EMPTY MANIFEST. Resolution already throws on a filter that matches
 * nothing, so zero captures here means every capture failed or the matrix collapsed for a reason
 * nobody declared — and the one thing that must never leave this harness is a well-formed
 * document with no evidence in it. A run where every KIT surface skipped lands there too, and
 * that is the intended floor: tolerating one missing screen is not tolerating an empty audit.
 */
export class ManifestBuilder {
  private readonly captures: CaptureRecord[] = [];
  private readonly skips: SurfaceSkip[] = [];
  private readonly stateSkips: StateSkip[] = [];
  private readonly prepareSkips: PrepareSkip[] = [];

  constructor(private readonly init: ManifestInit) {}

  /**
   * Record a project surface whose `prepare` answered `false`. Declared data, like the other two
   * holes: the cells are lost, the reader is told, and the closing equation still balances.
   */
  skipUnprepared(record: PrepareSkip): void {
    this.prepareSkips.push(record);
  }

  get unprepared(): number {
    return this.prepareSkips.length;
  }

  add(record: CaptureRecord): void {
    this.captures.push(record);
  }

  /**
   * Record a kit surface this checkout could not photograph. The skip is data in the manifest,
   * never a line that scrolls past in a log: what is at stake is a reader believing the matrix
   * was complete.
   */
  skip(record: SurfaceSkip): void {
    this.skips.push(record);
  }

  /**
   * Record a state of a kit surface this checkout could not reach. Same rule as `skip`, one axis
   * down: the hole is declared data, because the alternative is a matrix that looks complete.
   */
  skipState(record: StateSkip): void {
    this.stateSkips.push(record);
  }

  get size(): number {
    return this.captures.length;
  }

  get skipped(): number {
    return this.skips.length;
  }

  get skippedStates(): number {
    return this.stateSkips.length;
  }

  finish(): EvidenceManifest {
    if (this.captures.length === 0) {
      throw new VisualEvidenceError(
        'El harness terminó con cero capturas. No se escribe un manifest vacío: se leería como ' +
          '"sin hallazgos" cuando en realidad no se miró ninguna pantalla.'
      );
    }

    return {
      schema: MANIFEST_SCHEMA,
      runId: this.init.runId,
      generatedAt: this.init.generatedAt ?? new Date().toISOString(),
      baseURL: this.init.baseURL,
      skin: this.init.skin,
      themes: [...this.init.themes],
      viewports: this.init.viewports.map((viewport) => ({ ...viewport })),
      surfaces: this.init.surfaces.map((surface) => ({
        name: surface.name,
        route: surface.path,
        role: surface.role,
        purpose: surface.purpose,
      })),
      captures: [...this.captures],
      staleExclusions: [...(this.init.staleExclusions ?? [])],
      contrastExclusions: [...(this.init.contrastExclusions ?? [])],
      skippedSurfaces: this.skips.map((skip) => ({ ...skip })),
      skippedStates: this.stateSkips.map((skip) => ({ ...skip })),
      unpreparedSurfaces: this.prepareSkips.map((skip) => ({ ...skip })),
      // `inputs` is copied too, not just the seal around it: every other collection in this
      // object is detached from the builder's state, and an array shared by reference would be
      // the one place where mutating a returned manifest reaches back into the run.
      codeSeal: { ...this.init.codeSeal, inputs: [...this.init.codeSeal.inputs] },
    };
  }
}

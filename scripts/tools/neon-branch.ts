/**
 * Neon Branch Utilities
 *
 * Creates and deletes temporary Neon database branches for E2E testing.
 * Uses Neon API v2: https://api-docs.neon.tech/reference/getting-started
 */

import { createHash } from 'node:crypto';
import { hostname } from 'node:os';

const NEON_API_BASE = 'https://console.neon.tech/api/v2';
const E2E_BRANCH_PREFIX = 'e2e-';
/**
 * Autoscaling bounds for the throwaway E2E compute. Stated explicitly instead of
 * inheriting the project default, which varies per project and per Neon era — an
 * inherited `1-1 CU` floor bills a full CU for the whole run, and an inherited
 * `8 CU` ceiling lets a slow query scale the branch far past what a test suite
 * needs. 0.25–1 is sized for the suite: the floor is Neon's minimum and the
 * ceiling still gives 4x of burst for the seeding step.
 */
const E2E_AUTOSCALING_MIN_CU = 0.25;
const E2E_AUTOSCALING_MAX_CU = 1;
/**
 * Age (ms) past which a branch NOBODY can vouch for is considered a zombie — the fallback
 * rule, used when the ownership lease below cannot answer (branch from another machine, or
 * from a runner older than this file). See `selectZombieBranches` for the full decision.
 *
 * Where the number comes from — it is a documented duration plus margin, not a guess, and
 * it deliberately does NOT come from a timeout in this repo, because none of them bounds a
 * whole run (`playwright.config.ts` sets a 60s PER-TEST timeout and no `globalTimeout`):
 *   · A run takes 4.5–7 min end to end (measured, `EPIC-02` plan §2.2).
 *   · The runner's own waiting budget already eats most of the old 5 min before a single
 *     spec executes: two phases × (`SERVER_STARTUP_TIMEOUT` 2 min + `PORT_FREE_TIMEOUT` 15s)
 *     in `e2e-runner.ts`, plus a cold `next build` in between. 5 minutes was under the
 *     runner's own worst case, which is why the old value was unsafe rather than merely tight.
 *   · 30 min ≈ 4× the measured worst case: it swallows a cold build, both phases, Playwright
 *     retries and a loaded machine.
 *
 * The trade it accepts: a branch orphaned by ANOTHER machine now lingers up to 30 min instead
 * of 5 before the next run reclaims it. That cost is paid on purpose — the alternative error
 * (deleting the database of a run in flight) is silent and far more expensive to diagnose —
 * and the lease below removes it entirely for the common case (an orphan of THIS machine is
 * reclaimed immediately, so the local loop leaves fewer stale branches than it did at 5 min).
 */
export const ZOMBIE_AGE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
/**
 * Ceiling on how long an ownership lease may protect a branch (see `selectZombieBranches`).
 *
 * The lease says "the process that created this branch is still alive", and a PID is not a
 * unique identity: the OS recycles PIDs, so a long-dead owner can eventually be impersonated
 * by an unrelated process. Without this ceiling that branch would be protected FOR EVER —
 * turning the cleanup inert, which is the exact failure this issue must not introduce. Six
 * hours is far past any plausible run (4.5–7 min), so it only ever fires on impersonation.
 */
export const LEASE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
/**
 * How long the branch DELETE may wait for an answer from Neon before it is aborted.
 *
 * `fetch` has no timeout of its own and undici only gives up after 300 s, so an unresponsive
 * Neon used to park the runner's cleanup indefinitely — and cleanup is exactly where a Ctrl-C
 * lands. The ceiling that matters is not Neon's latency but the one imposed from OUTSIDE:
 * GitHub Actions allows ~7.5 s between the `SIGTERM` it sends and the `SIGKILL` that follows,
 * so a delete that outlives that window turns an orderly shutdown into a killed job with the
 * branch still there. 5 s sits under it with margin to spare, and is many times a healthy
 * Neon DELETE (sub-second).
 *
 * One attempt, never a retry (`CODING.md §2`): a delete that does not land leaves a branch the
 * zombie sweep of a later run reclaims on its own (`selectZombieBranches`), so the expensive
 * mechanism buys nothing the cheap one does not already cover.
 */
export const BRANCH_DELETE_TIMEOUT_MS = 5000;
/**
 * How long a plain READ of the Neon API may wait: the zombie-branch listing
 * (`cleanupZombieBranches`) and the role-password reveal.
 *
 * Same disease as the delete had, on a worse spot: the reveal sits on the CREATION path of a run,
 * before a single spec exists, and `fetch` has no timeout of its own — an unanswered request parks
 * the whole run for undici's 300 s with nothing on screen. These are single GETs that answer in
 * well under a second when Neon is healthy; 10 s is generous headroom for a loaded link and still
 * an order of magnitude below the failure it replaces.
 *
 * 🔴 IT APPLIES ONLY WHERE GIVING UP IS MILD, and that is the whole rule. The sweep degrades to
 * "sweep nothing" (housekeeping for OTHER runs' leftovers) and the reveal turns into an error that
 * names the missing credential — in both, bounding the wait changes WHEN the run finds out, never
 * what it concludes. The PARENT-BRANCH lookup used to be on this list and does not belong on it:
 * its failure changes the CONCLUSION (no parent id ⇒ Neon clones the project's DEFAULT branch,
 * which in the kit's dual-database model is `main`, i.e. production). It has its own, wider bound
 * — `PARENT_BRANCH_READ_TIMEOUT_MS` — and a fallback nobody can miss.
 */
export const BRANCH_READ_TIMEOUT_MS = 10_000;
/**
 * How long ONE attempt of the PARENT-BRANCH lookup may wait, and how many attempts it gets.
 *
 * Deliberately wider than `BRANCH_READ_TIMEOUT_MS` and deliberately retried, because this read is
 * the one whose failure is not mild: `resolveParentBranch` returning no id makes `createE2EBranch`
 * POST without `parent_id`, and Neon then clones the project's DEFAULT branch — `main`, production,
 * PII and all (`SK.md §1.4`). A 10 s bound turned "Neon is slow this morning" into that outcome;
 * the branch listing of a busy project is also the one read here that grows with the project.
 *
 * 20 s × 2 attempts sits under `BRANCH_CREATE_TIMEOUT_MS`-scale patience while still being an
 * order of magnitude below undici's 300 s park, which is the failure the bound exists to replace.
 * Only a TIMEOUT is retried: a 403 and a DNS failure answer the same way twice, so a second
 * attempt would only cost the run a second copy of the same answer.
 */
export const PARENT_BRANCH_READ_TIMEOUT_MS = 20_000;
export const PARENT_BRANCH_READ_ATTEMPTS = 2;
/**
 * How long the create POST may wait. Wider than a read on purpose: this call does not just write
 * a row, it asks Neon to provision a compute for the branch, which is the slowest thing in the
 * flow before the endpoint poll below. A bound copied from the delete (5 s) would abort healthy
 * creations on a slow morning and leave the run with no database at all.
 */
export const BRANCH_CREATE_TIMEOUT_MS = 30_000;
/**
 * How long ONE poll of the endpoint state may wait — not how long the wait may last.
 *
 * `waitForEndpoint` already owns a total budget (its `maxWaitMs`, 60 s by default) and checks the
 * clock BETWEEN polls, which is exactly the shape that lets a single unanswered request outlive
 * the ceiling it is supposed to respect. This bounds the request; the loop keeps deciding when to
 * stop, and a poll that gives up is simply "not ready yet" — the next one goes out.
 */
export const ENDPOINT_POLL_TIMEOUT_MS = 10_000;
/**
 * Default parent branch for LOCAL E2E runs — the kit's develop-first
 * working-branch convention. Mirrors `NEON_DEVELOP_BRANCH` in
 * `cli/src/lib/neon-api.ts` as a pattern, NOT an import (`scripts/tools/`
 * cannot depend on the separately published `cli/` package).
 */
const NEON_DEVELOP_BRANCH = 'develop';

interface NeonConfig {
  apiKey: string;
  projectId: string;
}

interface CreateBranchResponse {
  branchId: string;
  connectionUri: string;
  branchName: string;
}

/** A role as the create-branch response returns it. */
interface NeonRole {
  name: string;
  /** `'password'` | `'iam'` | absent — Neon omits it on some responses. */
  authentication_method?: string;
  /** Present on some responses; when it is, no `reveal_password` call is needed. */
  password?: string;
}

/** A database as the create-branch response returns it. */
interface NeonDatabaseInfo {
  name: string;
  owner_name?: string;
}

/** The subset of the create-branch response this module reads. */
interface CreateBranchPayload {
  branch?: { id?: string };
  endpoints?: Array<{ id?: string; host?: string }>;
  roles?: NeonRole[];
  databases?: NeonDatabaseInfo[];
  connection_uris?: Array<{ connection_uri?: string }>;
}

export interface CreateE2EBranchOptions {
  /**
   * Called with the branch id the MOMENT Neon confirms the creation — before credentials
   * are resolved and before the endpoint wait. It lets the caller register the branch for
   * cleanup right away, so anything that throws later still ends with the branch deleted
   * instead of orphaned in the project. Returning the id at the end of the flow (the only
   * channel before) was too late: every step in between was a leak.
   */
  onBranchCreated?: (branchId: string) => void;
  /**
   * `--keep-branch`: mark the branch as one that must OUTLIVE this run, so no later cleanup
   * reclaims it (see `KEEP_BRANCH_MARKER`). The runner also skips the delete on exit; the mark
   * is what makes the branch survive the NEXT run, which is the half a caller cannot do.
   */
  keep?: boolean;
}

// ---------------------------------------------------------------------------
// Ownership lease — the branch NAME is the lease (E2E-010)
// ---------------------------------------------------------------------------

/**
 * WHERE THE LEASE LIVES, and why it is not a new system.
 *
 * `createE2EBranch` already writes one piece of metadata to Neon: the branch NAME (it was
 * `e2e-<epoch-ms>`). This extends that same string with the identity of the process that owns
 * the branch — `e2e-<epoch-ms>-<hostTag>-<pid>` — so the lease costs zero new state: no state
 * file, no extra endpoint, no heartbeat, nothing to garbage-collect. `deleteE2EBranch` needs
 * no matching "release" step either, because deleting the branch IS the release.
 *
 * The NAME rather than Neon's annotations, deliberately: the name is the one field the branch
 * LIST endpoint is already guaranteed to return (the `e2e-` prefix filter has always relied on
 * it), so the lease is readable with the request the cleanup already makes. A lease the list
 * call cannot see would be no lease at all.
 *
 * WHY THE HOST TAG IS LOAD-BEARING, not decoration: a PID only means something on the machine
 * that issued it. Checking a foreign machine's PID locally would answer about an unrelated
 * process — and a false "dead" verdict there deletes a database that a run on ANOTHER machine
 * is using right now, which is worse than the bug being fixed. So the lease is only ever
 * consulted when the tag matches this host; everything else falls back to age. Containers get
 * this right for free: each one reports its own hostname, so its PID namespace is never
 * confused with the host's.
 *
 * It is a hash, not the hostname: branch names are visible to everyone with access to the Neon
 * project, and a raw hostname is somebody's laptop name.
 */
export interface BranchLease {
  /** Stable per-machine tag — see `currentHostTag`. */
  hostTag: string;
  /** PID of the runner process that created the branch, on that machine. */
  pid: number;
}

/**
 * The opt-out mark of `--keep-branch`, written into the branch NAME right after the `e2e-`
 * prefix: `e2e-keep-<epoch-ms>-<hostTag>-<pid>`.
 *
 * WHY IN THE NAME, like the lease. The name is the one field the branch LIST endpoint is
 * guaranteed to return, so the mark is readable by the request `cleanupZombieBranches` already
 * makes — no state file, no second endpoint, nothing to garbage-collect. Same reasoning as
 * `BranchLease`, and the same reason a Neon annotation would not do.
 *
 * WHY AN EXPLICIT SKIP AND NOT JUST "IT FALLS OUT OF THE LEASE PATTERN". It does fall out (the
 * pattern wants digits where `keep-` sits), but that only removes rule 1 — rule 2 (age) would
 * still reclaim the branch half an hour later, which is precisely the promise `--keep-branch`
 * makes and would silently break. So `selectZombieBranches` refuses a marked branch outright:
 * the branch was kept ON PURPOSE, and the process that asked for it is gone BY DESIGN.
 *
 * The cost is stated rather than hidden: a kept branch is nobody's zombie, so it lives until a
 * human deletes it in the Neon Console. That is the point of the flag, and the runner says so
 * on the way out.
 */
export const KEEP_BRANCH_MARKER = 'keep-';

/** 12 hex chars: wide enough that two machines sharing a Neon project will not collide. */
const HOST_TAG_LENGTH = 12;
let cachedHostTag: string | undefined;

/**
 * This machine's tag: `sha256(hostname)`, truncated. Deterministic (the same machine always
 * produces the same tag, which is what makes the lease readable across runs) and opaque.
 */
export function currentHostTag(): string {
  cachedHostTag ??= createHash('sha256').update(hostname()).digest('hex').slice(0, HOST_TAG_LENGTH);
  return cachedHostTag;
}

/**
 * Builds the name of a throwaway E2E branch, lease included — plus the `--keep-branch` mark when
 * this run asked for the branch to outlive it. Arguments are injectable so the naming contract
 * can be exercised without depending on the host running the suite.
 */
export function buildE2EBranchName(
  createdAtMs: number = Date.now(),
  hostTag: string = currentHostTag(),
  pid: number = process.pid,
  keep = false
): string {
  const mark = keep ? KEEP_BRANCH_MARKER : '';
  return `${E2E_BRANCH_PREFIX}${mark}${createdAtMs}-${hostTag}-${pid}`;
}

/**
 * Whether a branch carries the `--keep-branch` mark. Reads the name only, so it answers for a
 * branch created by ANY checkout on ANY machine — which is what the cleanup needs.
 */
export function isKeptE2EBranch(branchName: string): boolean {
  return branchName.startsWith(`${E2E_BRANCH_PREFIX}${KEEP_BRANCH_MARKER}`);
}

const LEASE_PATTERN = new RegExp(
  `^${E2E_BRANCH_PREFIX}\\d+-([0-9a-f]{${HOST_TAG_LENGTH}})-(\\d+)$`
);

/**
 * Reads the lease out of a branch name, or `undefined` when there is none.
 *
 * `undefined` is a FIRST-CLASS answer, not an error: branches created before this change
 * (`e2e-1717171717171`), or by an older checkout of the runner still on the previous naming,
 * are perfectly ordinary and must keep being cleaned up — they simply fall back to the age
 * rule. Nothing here may assume the mark is present.
 */
export function parseE2EBranchLease(branchName: string): BranchLease | undefined {
  const match = LEASE_PATTERN.exec(branchName);
  if (!match) return undefined;
  const pid = Number(match[2]);
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  return { hostTag: match[1], pid };
}

/**
 * Whether a PID is running ON THIS MACHINE. `kill(pid, 0)` sends no signal; it only asks the
 * kernel about the process. `EPERM` means it exists but belongs to another user (two
 * developers on one box) — alive for this purpose. Anything else (`ESRCH`) means gone.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

/** A branch as the list endpoint returns it, reduced to the fields the filter reads. */
export interface NeonBranchSummary {
  id: string;
  name: string;
  created_at: string;
}

/** Why a branch was judged a zombie — printed with it, so the log explains the deletion. */
export type ZombieReason =
  /** Same machine, and the process named in the lease is gone. Proof, not inference. */
  | 'owner-gone'
  /** Nobody could vouch for it and it is older than `ZOMBIE_AGE_THRESHOLD_MS`. */
  | 'aged-out'
  /** Same machine and the PID answers, but the branch is past `LEASE_MAX_AGE_MS`. */
  | 'lease-expired';

export interface ZombieVerdict {
  branch: NeonBranchSummary;
  reason: ZombieReason;
  /** `NaN` when `created_at` is missing or unparseable. */
  ageMs: number;
}

/** Injected so the filter stays pure — tests probe no clock, no host and no real PID. */
export interface ZombieSelectionDeps {
  /** `Date.now()` of the caller. */
  now: number;
  /** Tag of the machine running the cleanup — see `currentHostTag`. */
  hostTag: string;
  /** Liveness probe for a PID of THIS machine — see `isProcessAlive`. */
  isProcessAlive: (pid: number) => boolean;
}

/**
 * Decides which `e2e-*` branches are safe to delete. Pure, so the rule is testable with a set
 * of branches of assorted ages instead of a real Neon project.
 *
 * THE RULE: only delete a branch that cannot possibly belong to a live run. There are two
 * independent ways to establish that, and they are tried in order of strength:
 *
 *   1. PROOF BY OWNER (exact, same machine only). The lease names a process on this host.
 *      Alive → a run is in flight, never touch it, whatever its age. Gone → the run is over
 *      or crashed and nothing is connected, so it is reclaimed IMMEDIATELY, with no waiting
 *      period at all. This is the case E2E-009 created: two suites side by side on one
 *      machine, where the age rule alone would only protect the first one statistically.
 *   2. PROOF BY AGE (statistical, the fallback). No lease, or a lease from another machine:
 *      nothing local can be asked, so the only safe signal left is that the branch is older
 *      than any run could plausibly be (`ZOMBIE_AGE_THRESHOLD_MS`).
 *
 * Two guards keep the rule from ever going inert (an "always safe" filter that deletes
 * nothing would be as broken as the one that deletes too much):
 *   · `LEASE_MAX_AGE_MS` caps rule 1, so a recycled PID cannot protect a branch for ever.
 *   · Rule 2 still applies, unchanged in shape, to every branch rule 1 cannot speak for.
 *
 * A branch whose `created_at` cannot be parsed is left alone by rule 2 (it cannot be shown to
 * be old) but can still be reclaimed by rule 1, which does not depend on the date.
 *
 * Self-protection comes free: the cleanup runs before this process creates its own branch, and
 * if it ever ran after, the lease would name a PID that is by definition alive — this one.
 */
export function selectZombieBranches(
  branches: NeonBranchSummary[],
  deps: ZombieSelectionDeps
): ZombieVerdict[] {
  const verdicts: ZombieVerdict[] = [];

  for (const branch of branches) {
    // Never anything but a throwaway E2E branch: `main`, `develop` and a developer's own
    // branches share this project.
    if (!branch?.name?.startsWith(E2E_BRANCH_PREFIX)) continue;

    // Explicit opt-out (`--keep-branch`). Checked BEFORE both rules, because both would
    // eventually reclaim it: rule 1 cannot read a lease out of this name, and rule 2 would
    // age it out at the threshold — deleting, half an hour later, the one branch somebody
    // asked to keep. A marked branch is nobody's zombie; a human deletes it.
    if (isKeptE2EBranch(branch.name)) continue;

    const createdAtMs = new Date(branch.created_at).getTime();
    const ageMs = Number.isFinite(createdAtMs) ? deps.now - createdAtMs : Number.NaN;
    const lease = parseE2EBranchLease(branch.name);

    // 1. Proof by owner — only meaningful for a lease issued by this machine.
    if (lease && lease.hostTag === deps.hostTag) {
      if (!deps.isProcessAlive(lease.pid)) {
        verdicts.push({ branch, reason: 'owner-gone', ageMs });
      } else if (ageMs > LEASE_MAX_AGE_MS) {
        verdicts.push({ branch, reason: 'lease-expired', ageMs });
      }
      continue;
    }

    // 2. Proof by age — the fallback for everything else.
    // `>` on a NaN age is false, so an undatable branch is left alone here on purpose.
    if (ageMs > ZOMBIE_AGE_THRESHOLD_MS) {
      verdicts.push({ branch, reason: 'aged-out', ageMs });
    }
  }

  return verdicts;
}

/** Human-readable form of each verdict, for the cleanup log. */
const ZOMBIE_REASON_LABEL: Record<ZombieReason, string> = {
  'owner-gone': 'owner process gone',
  'aged-out': 'no owner on this machine, past the age threshold',
  'lease-expired': 'lease ceiling exceeded',
};

/**
 * Describes a value by its TOP-LEVEL KEYS ONLY, for logging.
 *
 * Defensive hygiene, not incident response: a Neon response can carry credentials
 * (`connection_uris` embeds the role password, `roles[].password` is sometimes inline), so
 * no response body or value is ever printed — only the shape, which is what a failing run
 * actually needs to diagnose. Never throws: `null`, primitives and arrays come back as a
 * label, so a change in the API's shape cannot break the error path itself.
 *
 * Exported for tests (E2E-006): the property worth pinning is a NEGATIVE one — that no
 * value from the payload ever reaches the output — and that is only assertable directly.
 */
export function describeKeys(value: unknown): string {
  if (value === null || value === undefined) return '(no body)';
  if (Array.isArray(value)) return `(array of ${value.length})`;
  if (typeof value !== 'object') return `(${typeof value})`;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length > 0 ? keys.join(', ') : '(no keys)';
}

/**
 * Reads a failed response and returns only the shape of its body (see `describeKeys`).
 * A body that is not JSON is reported as such rather than echoed.
 */
async function readErrorBodyKeys(response: Response): Promise<string> {
  try {
    return describeKeys(await response.json());
  } catch {
    return '(unparseable body)';
  }
}

function getConfig(): NeonConfig {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;

  if (!apiKey || !projectId) {
    console.error('\n❌ Missing Neon credentials for E2E testing\n');
    console.error('Required environment variables:');
    console.error(
      '  NEON_API_KEY    - Get from: https://console.neon.tech → Account Settings → API Keys'
    );
    console.error(
      '  NEON_PROJECT_ID - Get from: https://console.neon.tech → Project Settings → General\n'
    );
    console.error('Setup options:');
    console.error(
      '  · Repo in the secrets vault (`vault` block in .timekast/provision.json): both live in the\n' +
        '    `develop:/ci` folder (imported into `local`). Run through `pnpm test:e2e`, and write\n' +
        '    them there if they are missing — never into a local file (fx-secrets-vault §7).'
    );
    console.error('  · Repo without the vault: run `pnpm setup:e2e`, or add them to .env.local\n');
    process.exit(1);
  }

  return { apiKey, projectId };
}

/**
 * Resolves the NAME of the branch the temporary E2E branch should be created
 * from. Pure (no network) so it is unit-testable in isolation. Precedence:
 *   1. `E2E_PARENT_BRANCH` — explicit override, wins everywhere. Fail-closed: if it does not
 *      resolve, `createE2EBranch` aborts instead of cloning the default branch.
 *   2. CI (`process.env.CI` truthy — same signal `playwright.config.ts` uses)
 *      → `undefined`: the POST omits `parent_id` and Neon clones the
 *      project's default branch (previous behavior).
 *   3. Local → `'develop'`: in a develop-first derivative the temp branch
 *      must see the migrations already applied to `develop`, not just `main`.
 */
export function resolveParentBranchName(): string | undefined {
  if (process.env.E2E_PARENT_BRANCH) return process.env.E2E_PARENT_BRANCH;
  if (process.env.CI) return undefined;
  return NEON_DEVELOP_BRANCH;
}

/**
 * Why the parent-branch lookup ended the way it did. The id is only half the answer: the OTHER
 * half is what the caller must say out loud when there is no id, because "this project has no
 * `develop`" and "Neon did not answer" lead to the same POST and are not the same news.
 */
export type ParentBranchOutcome =
  /** The name resolved to an id. */
  | 'resolved'
  /** Neon answered, and no branch carries that name (the pre-release, main-only project). */
  | 'not-found'
  /** Neon did not answer within the bound, on every attempt. */
  | 'timeout'
  /** Neon answered and refused the listing (403 on a narrow key, typically). */
  | 'refused'
  /** The request never got an answer at all (DNS, socket, unparseable body). */
  | 'unreachable';

export interface ParentBranchLookup {
  /** Present only when `outcome === 'resolved'`. */
  id?: string;
  outcome: ParentBranchOutcome;
  /** The HTTP status, when Neon answered and refused. Printed so the fix has an address. */
  status?: number;
}

/**
 * Resolves a branch NAME to its Neon branch id via `GET /projects/{projectId}/branches` (same
 * endpoint `cleanupZombieBranches` already uses).
 *
 * 🔴 NEVER THROWS, AND NEVER SILENT. A failure here does not stop the run by itself — for a
 * CONVENTIONAL parent the caller POSTs without `parent_id`, and for a DECLARED one
 * (`E2E_PARENT_BRANCH`) it aborts instead, see `declaredParentUnresolvedMessage`. The POST path is
 * NOT a neutral degradation: Neon then
 * clones the project's DEFAULT branch, which in the kit's dual-database model is `main`, i.e.
 * production (`SK.md §1.4`). So the failure is reported as a value, and `createE2EBranch` prints it
 * where nobody can miss it. Returning a bare `undefined` (what this did before) made three very
 * different situations indistinguishable at the call site, and the loudest of them — "the listing
 * timed out" — was the one a bound on this request had just made reachable on a slow morning.
 *
 * A TIMEOUT is retried (`PARENT_BRANCH_READ_ATTEMPTS`); a refusal or an unreachable host is not.
 *
 * @param timeoutMs - the per-attempt bound, injectable so a test can exercise it without waiting.
 */
export async function resolveParentBranch(
  apiKey: string,
  projectId: string,
  parentBranchName: string,
  timeoutMs: number = PARENT_BRANCH_READ_TIMEOUT_MS
): Promise<ParentBranchLookup> {
  for (let attempt = 1; attempt <= PARENT_BRANCH_READ_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) return { outcome: 'refused', status: response.status };

      const data = await response.json();
      const branches: Array<{ id: string; name: string }> = data.branches ?? [];
      const id = branches.find((b) => b.name === parentBranchName)?.id;
      return id ? { id, outcome: 'resolved' } : { outcome: 'not-found' };
    } catch (error) {
      // Only the abort is worth a second attempt: a 403 or a dead DNS answers identically twice.
      if (!isAbort(error)) return { outcome: 'unreachable' };
      if (attempt === PARENT_BRANCH_READ_ATTEMPTS) return { outcome: 'timeout' };
    }
  }
  // Unreachable — the loop returns on its last attempt. Present because the compiler cannot see it.
  return { outcome: 'timeout' };
}

/** The sentence that names WHY there is no parent id, one per outcome. */
function parentLookupReason(lookup: ParentBranchLookup): string {
  switch (lookup.outcome) {
    case 'not-found':
      return 'Neon answered, and this project has no branch by that name (ordinary in a pre-release, main-only project).';
    case 'timeout':
      return (
        `the Neon API did not answer within ${PARENT_BRANCH_READ_TIMEOUT_MS / 1000}s, on ` +
        `${PARENT_BRANCH_READ_ATTEMPTS} attempts. This is a TIMEOUT, not a permission problem — ` +
        'the branch may well exist.'
      );
    case 'refused':
      return (
        `Neon refused the branch listing (HTTP ${lookup.status ?? '???'}) — NEON_API_KEY is ` +
        'probably not allowed to list branches on this project. The branch may well exist.'
      );
    default:
      return 'the Neon API could not be reached at all (DNS, socket, or an unreadable body). The branch may well exist.';
  }
}

/**
 * What the runner prints when the parent branch did NOT resolve — the loud half of the fallback.
 *
 * 🔴 WHY THIS EXISTS. `createE2EBranch` used to print the parent only when it HAD one, so the path
 * where it did not was the quietest line of the whole run: no parent id ⇒ the POST omits
 * `parent_id` ⇒ Neon clones the project's DEFAULT branch. In the kit's dual-database model that
 * default is `main` — production — so a suite could run against a full clone of production data,
 * PII included, with nothing on screen to say so. The fallback itself is kept (a run that cannot
 * name a parent still has to produce a database) and it is now impossible to miss.
 *
 * Pure over its two inputs so the wording is testable without a network.
 */
/**
 * What a run says when there was no parent name to resolve in the first place — the CI rule of
 * `resolveParentBranchName`. Nothing failed, so this is a notice and not the alarm that
 * `parentFallbackWarning` raises; but the throwaway branch inherits the same DEFAULT branch, and
 * CI is where that happens on EVERY run rather than occasionally. A mechanism that goes quiet in
 * its most frequent case is a mechanism that under-reports exactly where it matters most.
 */
export function noParentByRuleNotice(): string[] {
  return [
    '',
    `ℹ️  No parent branch requested — Neon will clone this project's DEFAULT branch.`,
    '    In CI the kit resolves no conventional parent by rule, so this is expected, not a failure.',
    "    Still worth knowing: in the kit's dual-database model that default is `main` — production —",
    '    so this suite runs against a full clone of it. Name another parent with',
    '    E2E_PARENT_BRANCH=<branch> if that is not what you want.',
    '',
  ];
}

/**
 * Whether the parent was DECLARED by someone (`E2E_PARENT_BRANCH`) rather than picked by the kit's
 * convention. Same truthiness rule as `resolveParentBranchName`: an empty value is unset.
 */
export function isParentBranchDeclared(): boolean {
  return Boolean(process.env.E2E_PARENT_BRANCH);
}

/**
 * Why a run stops when a DECLARED parent does not resolve — the fail-closed half of the rule.
 *
 * 🔴 WHY FAIL-CLOSED HERE AND FAIL-OPEN ELSEWHERE. The fallback (POST without `parent_id` ⇒ Neon
 * clones the DEFAULT branch, production in the kit's dual model) is defensible when nobody asked
 * for anything: the conventional `develop` may simply not exist in a main-only project. It stops
 * being defensible once `E2E_PARENT_BRANCH` is written down — that line IS the team saying "not
 * the default". Falling back contradicts it in silence, and it does so precisely during a Neon
 * degradation, inside a run that otherwise ends green. The cost of the fallback is not only data
 * exposure (a retried spec leaves a trace with screenshots in an uploaded artifact): a suite that
 * runs against data nobody chose passes or fails for reasons the team does not control.
 *
 * Thrown BEFORE the POST, so no branch exists yet and there is nothing to clean up.
 */
export function declaredParentUnresolvedMessage(
  parentBranchName: string,
  lookup: ParentBranchLookup
): string {
  return [
    `E2E_PARENT_BRANCH="${parentBranchName}" did not resolve (${lookup.outcome}` +
      `${lookup.status ? `, HTTP ${lookup.status}` : ''}) — ${parentLookupReason(lookup)}`,
    '',
    "The run stops instead of cloning the project's DEFAULT branch (in the kit's dual-database",
    'model, `main` — production): the declared parent is the team saying "not the default".',
    '',
    `Fix: create "${parentBranchName}" in the Neon Console, point E2E_PARENT_BRANCH at a branch that`,
    'exists, or check that NEON_API_KEY can list branches on this project. To knowingly accept',
    'the default branch as the parent, remove E2E_PARENT_BRANCH.',
  ].join('\n');
}

export function parentFallbackWarning(
  parentBranchName: string,
  lookup: ParentBranchLookup
): string[] {
  return [
    '',
    '⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `⚠️  NO PARENT BRANCH — Neon will clone this project's DEFAULT branch.`,
    '⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    `    Intended parent: "${parentBranchName}" — ${parentLookupReason(lookup)}`,
    '',
    '    What that means: the throwaway branch inherits the DEFAULT branch of the Neon',
    "    project. In the kit's dual-database model that default is `main` — production —",
    '    so this suite may be running against a full clone of production data.',
    '',
    `    Fix: make "${parentBranchName}" resolvable (check NEON_API_KEY and the branch`,
    '    name in the Neon Console), or name another parent with E2E_PARENT_BRANCH=<branch>.',
    '⚠️  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ];
}

/**
 * Splits a Postgres connection string into the pieces the selection rules below use.
 * Never throws: anything missing or unparseable comes back as `undefined`, which simply
 * makes the rules that depend on it not apply.
 */
export function parseConnectionString(raw: string | undefined): {
  username?: string;
  database?: string;
} {
  if (!raw) return {};
  try {
    const url = new URL(raw);
    const database = url.pathname.replace(/^\//, '');
    return {
      username: url.username ? decodeURIComponent(url.username) : undefined,
      database: database ? decodeURIComponent(database) : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Picks the role whose credentials the hand-built URI will use.
 *
 * Neon's role objects expose `name / authentication_method / protected / branch_id /
 * created_at / updated_at` — there is NO ownership field, so "the branch owner" cannot be
 * read, only inferred. Hence a fixed, explicit precedence, and never a silent default:
 * guessing a read-only role makes `db:migrate` and the seeds die with `permission denied`,
 * and that error reads as something else entirely.
 *
 *   1. The username of the environment's `DATABASE_URL` — deterministic, and by definition
 *      the role the app already operates with.
 *   2. The single role with `authentication_method === 'password'`, when there is exactly one.
 *   3. Loud error naming the candidate roles.
 *
 * `databaseUrl` must come from the PROCESS environment. This module never reads `.env.local`
 * itself: in CI that file does not exist, so a dotenv fallback would skip rule 1 in silence,
 * exactly where nobody is watching.
 */
export function selectRoleName(roles: NeonRole[], databaseUrl: string | undefined): string {
  const { username } = parseConnectionString(databaseUrl);

  // 1. Username of the environment's DATABASE_URL.
  if (username && roles.some((role) => role.name === username)) return username;

  // 2. The only password role, when there is exactly one.
  const passwordRoles = roles.filter((role) => role.authentication_method === 'password');
  if (passwordRoles.length === 1) return passwordRoles[0].name;

  // 3. Loud error — the candidates by name, so the fix is obvious from the message.
  const candidates = roles.length
    ? roles.map((r) => `${r.name} (auth: ${r.authentication_method ?? 'unknown'})`).join(', ')
    : '(Neon returned no roles)';
  throw new Error(
    `Could not decide which Neon role to build the E2E connection URI with.\n` +
      `  Candidate roles: ${candidates}\n` +
      `  DATABASE_URL in the environment: ${
        username ? `user "${username}", which matches no role above` : 'absent, or with no username'
      }\n` +
      `  Fix either side: export DATABASE_URL with the role the app actually uses, or leave ` +
      `exactly one role with authentication_method=password in the Neon project.`
  );
}

/**
 * Picks the database the URI points at. Explicit for the same reason as the role rule:
 * connecting to the wrong database of the branch lands migrations and seeds somewhere the
 * specs never look, and the failure surfaces far from the cause.
 *
 *   1. The database named in the environment's `DATABASE_URL`, when the branch has one by
 *      that name — same reasoning as rule 1 for the role: it is what the app already uses.
 *   2. The only database on the branch, when there is exactly one (the ordinary Neon case).
 *   3. The only database owned by the selected role, when there is exactly one.
 *   4. Loud error naming the candidate databases.
 */
export function selectDatabaseName(
  databases: NeonDatabaseInfo[],
  roleName: string,
  databaseUrl: string | undefined
): string {
  const { database } = parseConnectionString(databaseUrl);

  // 1. Database named in the environment's DATABASE_URL.
  if (database && databases.some((db) => db.name === database)) return database;

  // 2. Exactly one database on the branch.
  if (databases.length === 1) return databases[0].name;

  // 3. Exactly one database owned by the selected role.
  const owned = databases.filter((db) => db.owner_name === roleName);
  if (owned.length === 1) return owned[0].name;

  // 4. Loud error.
  const candidates = databases.length
    ? databases.map((db) => `${db.name} (owner: ${db.owner_name ?? 'unknown'})`).join(', ')
    : '(Neon returned no databases)';
  throw new Error(
    `Could not decide which Neon database to build the E2E connection URI with.\n` +
      `  Candidate databases: ${candidates}\n` +
      `  Selected role: ${roleName}\n` +
      `  DATABASE_URL in the environment: ${
        database
          ? `database "${database}", which matches none above`
          : 'absent, or with no database'
      }\n` +
      `  Fix: export DATABASE_URL pointing at the database the app actually uses.`
  );
}

/**
 * Reads a branch role's password via `GET .../roles/{role_name}/reveal_password`.
 * Only reached when Neon handed out no `connection_uris` AND the role object carried no
 * password inline. A 401/403 here is a permission problem on the API key, not a bug — CI
 * injects `NEON_API_KEY` from secrets and that key is often narrower than the local one, so
 * it gets a message that names what is missing instead of a raw `fetch` stack trace.
 */
async function revealRolePassword(
  apiKey: string,
  projectId: string,
  branchId: string,
  roleName: string
): Promise<string> {
  const url =
    `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}` +
    `/roles/${encodeURIComponent(roleName)}/reveal_password`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(BRANCH_READ_TIMEOUT_MS),
    });
  } catch (error) {
    // Reached on the creation path of every run whose project hands out no `connection_uris`,
    // with the branch ALREADY created — so the bound above turns a 300 s park into an error the
    // caller's cleanup can act on. An abort is named as such: "the API did not answer" and "the
    // key may not read passwords" are different problems with different fixes.
    if (isAbort(error)) {
      throw new Error(
        `The Neon API did not answer within ${BRANCH_READ_TIMEOUT_MS / 1000}s while reading the ` +
          `password of role "${roleName}".`
      );
    }
    throw new Error(
      `Could not reach the Neon API to read the password of role "${roleName}": ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `NEON_API_KEY is not allowed to read role passwords (HTTP ${response.status}).\n` +
        `  Missing permission: reveal the password of role "${roleName}" on project ` +
        `${projectId} — GET /projects/{project_id}/branches/{branch_id}/roles/{role_name}/reveal_password.\n` +
        `  The password is needed because Neon returned no connection_uris for this branch.\n` +
        `  Fix: use a NEON_API_KEY with member/owner access to this project (in CI the key ` +
        `comes from secrets and is usually narrower than the local one).`
    );
  }

  if (!response.ok) {
    // Status only — a body from this endpoint can literally contain the password.
    throw new Error(
      `Neon refused to reveal the password of role "${roleName}" (HTTP ${response.status}).`
    );
  }

  const data = (await response.json()) as { password?: string };
  if (!data.password) {
    throw new Error(`Neon returned no password for role "${roleName}".`);
  }
  return data.password;
}

/**
 * Builds the branch connection URI by hand, for the projects where Neon's create-branch
 * response comes back WITHOUT `connection_uris` (observed on a project that has two roles
 * with `authentication_method=password`).
 *
 * Symptom only, deliberately: with a sample of four projects there is no way to tell whether
 * the trigger is that second password role or a broader inability of Neon to disambiguate a
 * default role. The fix is identical either way, so the cause is not stated as fact here.
 *
 * HOST — a decision, not an accident, because it changes behaviour under load: this uses the
 * DIRECT endpoint host from the create response (`endpoints[0].host`), NOT the `-pooler`
 * variant that `connection_uris` usually hands out. Two reasons: (a) the direct host is a
 * value the API actually returned, while the pooled one would have to be synthesized by
 * string surgery on a hostname the response never contained; (b) the consumers of this URI
 * are `drizzle-kit migrate`, one build and one `next start` whose app-side `Pool`
 * (`@neondatabase/serverless`) already bounds concurrency — a throwaway e2e branch never sees
 * the connection churn that would pay for PgBouncer's transaction-mode caveats. A derivative
 * that needs the pooled endpoint changes this one line.
 */
async function buildConnectionUri(
  apiKey: string,
  projectId: string,
  branchId: string,
  data: CreateBranchPayload
): Promise<string> {
  const host = data.endpoints?.[0]?.host;
  if (!host) {
    throw new Error(
      'Neon returned neither connection_uris nor an endpoint host, so the E2E connection ' +
        'URI cannot be built. Check the branch in the Neon Console — it has no read_write endpoint.'
    );
  }

  // PROCESS environment only — never a `.env.local` read from this module (see selectRoleName).
  const envDatabaseUrl = process.env.DATABASE_URL;
  const roleName = selectRoleName(data.roles ?? [], envDatabaseUrl);
  const databaseName = selectDatabaseName(data.databases ?? [], roleName, envDatabaseUrl);

  // Some responses already carry the role password; using it saves a network call inside the
  // window where the branch exists but the run could still fail.
  const inlinePassword = data.roles?.find((role) => role.name === roleName)?.password;
  const password =
    inlinePassword ?? (await revealRolePassword(apiKey, projectId, branchId, roleName));

  console.log(`   ✓ Connection URI built — role "${roleName}", database "${databaseName}"`);

  // `sslmode=require` always: Neon refuses plaintext connections and the URIs it hands out
  // carry it, so the hand-built one must not differ.
  return (
    `postgresql://${encodeURIComponent(roleName)}:${encodeURIComponent(password)}` +
    `@${host}/${encodeURIComponent(databaseName)}?sslmode=require`
  );
}

/**
 * Creates a temporary Neon branch for E2E testing.
 * Locally the branch is created from `develop` when that branch exists
 * (develop-first convention — see resolveParentBranchName); otherwise, and in
 * CI, it inherits schema and data from the project's default branch.
 *
 * Failures after the POST THROW instead of calling `process.exit`: the branch already exists
 * in Neon at that point, and only an exception lets the caller's `finally` delete it. Pair it
 * with `options.onBranchCreated`, which hands the id over as soon as Neon confirms it.
 */
export async function createE2EBranch(
  options: CreateE2EBranchOptions = {}
): Promise<CreateBranchResponse> {
  const { apiKey, projectId } = getConfig();
  // The name carries this run's ownership lease (`buildE2EBranchName`): it is what lets a
  // cleanup started by ANOTHER run tell "in flight, hands off" from "crashed, reclaim it" —
  // plus the `--keep-branch` mark, which exempts it from being reclaimed at all.
  const branchName = buildE2EBranchName(Date.now(), currentHostTag(), process.pid, options.keep);

  // Branch-aware parent: resolve the conventional parent name to a real id;
  // when it does not resolve, POST without parent_id (Neon uses its default) — and SAY SO, see
  // `parentFallbackWarning`. In CI there is no conventional parent name to resolve
  // (`resolveParentBranchName` returns undefined by rule), so nothing FAILED there — but the
  // CONSEQUENCE is identical, and CI is the one place it happens on every single run. Staying
  // quiet there would exempt the loudest case from the mechanism built to make it audible, so
  // that path gets its own notice: calmer, because it is the rule and not a fault, and still
  // explicit about what gets cloned.
  const parentBranchName = resolveParentBranchName();
  const parentLookup = parentBranchName
    ? await resolveParentBranch(apiKey, projectId, parentBranchName)
    : undefined;
  const parentId = parentLookup?.id;

  // A DECLARED parent that did not resolve stops the run here, before anything exists in Neon —
  // see `declaredParentUnresolvedMessage` for why this one case is fail-closed.
  if (parentBranchName && parentLookup && !parentId && isParentBranchDeclared()) {
    throw new Error(declaredParentUnresolvedMessage(parentBranchName, parentLookup));
  }

  console.log(`\n🌿 Creating Neon branch: ${branchName}`);
  if (parentId) {
    console.log(`   ✓ Parent branch: ${parentBranchName} (${parentId})`);
  } else if (parentBranchName && parentLookup) {
    for (const line of parentFallbackWarning(parentBranchName, parentLookup)) console.warn(line);
  } else {
    for (const line of noParentByRuleNotice()) console.warn(line);
  }

  const response = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      branch: {
        name: branchName,
        ...(parentId ? { parent_id: parentId } : {}),
      },
      endpoints: [
        {
          type: 'read_write',
          autoscaling_limit_min_cu: E2E_AUTOSCALING_MIN_CU,
          autoscaling_limit_max_cu: E2E_AUTOSCALING_MAX_CU,
        },
      ],
    }),
    // Its own budget, wider than a read's: this provisions a compute (see
    // BRANCH_CREATE_TIMEOUT_MS). An abort throws out of here, which is the right outcome — a run
    // with no database cannot continue, and no branch was confirmed to clean up.
    signal: AbortSignal.timeout(BRANCH_CREATE_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Status + response keys, never the body — see `describeKeys`.
    console.error(`\n❌ Failed to create Neon branch: ${response.status}`);
    console.error(`   Response keys: ${await readErrorBodyKeys(response)}`);
    throw new Error(`Failed to create Neon branch (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as CreateBranchPayload;

  const branchId = data.branch?.id;

  if (!branchId) {
    // Keys of the payload, never its values — see `describeKeys`.
    console.error('\n❌ Invalid response from Neon API');
    console.error(`   Response keys: ${describeKeys(data)}`);
    throw new Error('Neon returned no branch id for the E2E branch.');
  }

  console.log(`   ✓ Branch created: ${branchId}`);
  // Hand the id over NOW, before anything that can fail: from here on the branch exists in
  // Neon, so every later step must be able to leave it deletable by the caller's cleanup.
  options.onBranchCreated?.(branchId);

  // Use the URI Neon handed out when it is there; build it ourselves when it is not.
  // Truthy check on purpose: an empty string is as unusable as an absent field, and the old
  // guard (`!connectionUri` → exit) treated it that way too.
  const providedUri = data.connection_uris?.[0]?.connection_uri;
  const connectionUri = providedUri
    ? providedUri
    : await buildConnectionUri(apiKey, projectId, branchId, data);

  // Wait for endpoint to be active (Neon can take a few seconds to spin up)
  const endpointId = data.endpoints?.[0]?.id;
  if (endpointId) {
    console.log('   ⏳ Waiting for endpoint to be ready...');
    await waitForEndpoint(apiKey, projectId, endpointId);
    console.log('   ✓ Endpoint ready');
  }

  // Give it a bit more time for the connection to stabilize
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    branchId,
    connectionUri,
    branchName,
  };
}

/** What a wait that ran out of budget saw, so the warning can tell the two cases apart. */
export interface EndpointWaitTally {
  /** How many polls went out in total. */
  polls: number;
  /** How many of them came back with no response at all (aborted, refused, unreachable). */
  unanswered: number;
  /** The distinct error NAMES of those failures — never a message, never a URL. */
  errorNames: string[];
}

/**
 * The warning printed when the endpoint wait exhausts its budget.
 *
 * 🔴 WHY IT COUNTS INSTEAD OF JUST SAYING "may not be fully ready". Two very different runs used
 * to produce the identical sentence: an endpoint that answered every poll and simply never
 * reported `active`/`idle` (a transient state, and the wait is advisory anyway), and one where
 * every single request died — wrong project id, revoked key, no network. The second is a real
 * fault and it arrived disguised as the first, one line before a suite that then failed for
 * reasons nobody could connect to it.
 *
 * 🔴 AND WHY IT NAMES ONLY `error.name`. undici's network errors carry the request URL, which is
 * built from the project id — the same discipline `deleteE2EBranch` follows, and the reason the
 * failures are counted rather than logged one by one.
 */
export function endpointWaitWarning(tally: EndpointWaitTally): string {
  const head = '   ⚠️  Endpoint may not be fully ready, proceeding anyway';
  if (tally.unanswered === 0) {
    return `${head} — it answered all ${tally.polls} poll(s) but never reported active/idle.`;
  }
  const named = tally.errorNames.length > 0 ? ` (${tally.errorNames.join(', ')})` : '';
  return `${head} — ${tally.unanswered} of ${tally.polls} poll(s) got no response${named}.`;
}

/**
 * Waits for a Neon endpoint to be in active state.
 *
 * TWO budgets, and they are not the same thing: `maxWaitMs` is how long the WAIT may last, and
 * `ENDPOINT_POLL_TIMEOUT_MS` is how long ONE request may take. The loop checks the clock between
 * polls, so without the second one a single unanswered request sat here for undici's 300 s — five
 * times the ceiling this function advertises. The per-request bound is also clamped to whatever
 * is left of the total, so bounding the request can never extend the wait.
 *
 * A poll that fails — aborted, refused or unreachable — is read as "not ready yet" and the next
 * one goes out. That is the pre-existing reading of a non-ok response, kept deliberately: the
 * caller has a branch already created, and the tail of this function is a warning, not a throw.
 * What the failures are NOT any more is invisible: they are tallied, and the warning at the tail
 * names the count (`endpointWaitWarning`), which is the only thing that separates "it took too
 * long" from "nothing ever answered".
 */
async function waitForEndpoint(
  apiKey: string,
  projectId: string,
  endpointId: string,
  maxWaitMs = 60000
): Promise<void> {
  const start = Date.now();
  const checkInterval = 2000;
  let polls = 0;
  let unanswered = 0;
  const errorNames = new Set<string>();

  while (Date.now() - start < maxWaitMs) {
    const remaining = maxWaitMs - (Date.now() - start);
    let response: Response;
    polls++;
    try {
      response = await fetch(`${NEON_API_BASE}/projects/${projectId}/endpoints/${endpointId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(Math.max(1, Math.min(ENDPOINT_POLL_TIMEOUT_MS, remaining))),
      });
    } catch (error) {
      // Same reading as a non-ok response: not ready yet, the next poll goes out. Counted,
      // though — and only the error's NAME is kept: undici's message carries the request URL,
      // which is built from the project id (see `describeKeys`).
      unanswered++;
      errorNames.add(errorName(error) || 'request failed');
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      const state = data.endpoint?.current_state;

      if (state === 'active') {
        return;
      }

      // idle is also acceptable - it will activate on first connection
      if (state === 'idle') {
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  console.warn(endpointWaitWarning({ polls, unanswered, errorNames: [...errorNames] }));
}

/** An aborted request identifies itself by `name`: `AbortSignal.timeout` throws a
 *  `TimeoutError`, an explicit `abort()` an `AbortError`. undici sometimes wraps the reason in
 *  a `TypeError`, so the cause is inspected too — same reading as `isAbort` in `e2e-runner.ts`. */
const ABORT_ERROR_NAMES = new Set(['TimeoutError', 'AbortError']);

function errorName(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '';
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

function isAbort(error: unknown): boolean {
  if (ABORT_ERROR_NAMES.has(errorName(error))) return true;
  const cause =
    typeof error === 'object' && error !== null ? (error as { cause?: unknown }).cause : undefined;
  return ABORT_ERROR_NAMES.has(errorName(cause));
}

/**
 * Deletes a Neon branch.
 *
 * Bounded by `BRANCH_DELETE_TIMEOUT_MS`: this is the last thing the runner does, and it runs
 * from the signal handler too, so an unanswered request here is what makes a Ctrl-C look like
 * a hung process. A failure — timeout, network, or a refusing API — is reported and swallowed
 * rather than thrown: the caller is a cleanup path (`main`'s `cleanup()`, also reached from
 * `SIGINT`/`SIGTERM`), and the branch left behind is reclaimed by the zombie sweep of a later
 * run, so failing loudly here would only replace a stale branch with a stuck exit.
 *
 * @param timeoutMs - the bound, injectable so a test can exercise the abort without waiting
 *   for the real one (the same seam `waitForEndpoint` uses for its own ceiling).
 */
export async function deleteE2EBranch(
  branchId: string,
  timeoutMs: number = BRANCH_DELETE_TIMEOUT_MS
): Promise<void> {
  const { apiKey, projectId } = getConfig();

  console.log(`\n🧹 Deleting Neon branch: ${branchId}`);

  let response: Response;
  try {
    response = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches/${branchId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // The error's NAME only, never its message or cause: a network error from undici can carry
    // the request URL, and this one is built from the project id — same discipline as
    // `describeKeys` applies to a response body.
    console.warn(
      isAbort(error)
        ? `   ⚠️  Neon did not answer within ${timeoutMs / 1000}s — delete aborted.`
        : `   ⚠️  Failed to delete branch: ${errorName(error) || 'request failed'}`
    );
    console.warn(
      `   The branch stays until a later run's zombie sweep reclaims it. ` +
        `Manual delete: Neon Console → Branches`
    );
    return;
  }

  if (!response.ok) {
    // Status + response keys, never the body — see `describeKeys`.
    console.warn(`   ⚠️  Failed to delete branch: ${response.status}`);
    console.warn(`   Branch will auto-expire. Manual delete: Neon Console → Branches`);
    console.warn(`   Response keys: ${await readErrorBodyKeys(response)}`);
    return;
  }

  console.log(`   ✓ Branch deleted`);
}

/**
 * Validates that Neon credentials are configured.
 * Call this early to fail fast with helpful error message.
 */
export function validateNeonCredentials(): void {
  getConfig(); // Will exit if missing
  console.log('   ✓ Neon credentials validated');
}

/**
 * Why the sweep could not run at all — the three ways the LISTING request ends without an
 * answer this function can act on. Each carries the one safe detail that makes it diagnosable:
 * a budget, an error NAME (never its message — see `deleteE2EBranch`), or an HTTP status.
 */
export type ZombieSweepFailure =
  | { kind: 'timeout'; timeoutMs: number }
  | { kind: 'unreachable'; errorName: string }
  | { kind: 'refused'; status: number };

/** What one sweep did, and what the caller has to repeat at the end of the run. */
export interface ZombieSweepResult {
  /** Number of zombie branches deleted. */
  deleted: number;
  /**
   * The warning to print AGAIN when the run ends — `null` when the sweep actually ran.
   *
   * Returned rather than merely printed because of WHEN this happens: the sweep is minute zero
   * of a run that lasts seven, so its warning scrolls away behind the whole suite and nobody
   * reads it. Exactly the mechanism `guardWiringWarning` already uses in `e2e-runner.ts` — the
   * caller holds the string and `cleanup()` prints it after the verdict.
   */
  warning: string | null;
}

/** One sentence naming what failed, per kind. */
function zombieSweepDiagnosis(failure: ZombieSweepFailure): string {
  switch (failure.kind) {
    case 'timeout':
      return `Neon did not answer the branch listing within ${failure.timeoutMs / 1000}s.`;
    case 'unreachable':
      return `the branch listing request failed before Neon answered (${failure.errorName || 'request failed'}).`;
    case 'refused':
      return `Neon refused the branch listing (HTTP ${failure.status}).`;
  }
}

/**
 * The warning the sweep prints when it could not list the branches — and the string the runner
 * repeats at the end of the run.
 *
 * 🔴 WHY IT IS WORTH REPEATING. A failed sweep is silent by construction: nothing is deleted,
 * nothing is missing from this run, and the suite goes green. What accumulates is on the OTHER
 * side of the API — the branches earlier runs left behind, each a live copy of the parent's data
 * that is billed for as long as it exists. The failure is also not this run's to fix, which is
 * precisely why it needs to be legible at the moment the developer is looking at the output
 * rather than at minute zero of seven.
 *
 * A warning, never an abort: the sweep is housekeeping for OTHER runs' leftovers, so failing it
 * must not stop this one (see the listing's own comment below).
 */
export function zombieSweepWarning(failure: ZombieSweepFailure): string {
  return [
    '',
    '⚠️  The zombie-branch sweep did not run: ' + zombieSweepDiagnosis(failure),
    '    Nothing was deleted, and nothing is missing from THIS run — the sweep only reclaims',
    '    the branches that earlier runs left behind. While it cannot list, they accumulate, and',
    '    each one is a live copy of the parent branch that Neon keeps billing for.',
    '    It is retried at the start of the next run. If it keeps failing, check NEON_API_KEY /',
    '    NEON_PROJECT_ID, or reclaim them by hand: Neon Console → Branches.',
    '',
  ].join('\n');
}

/**
 * Detects and deletes zombie E2E branches left by previous runs.
 *
 * A zombie is an `e2e-*` branch that `selectZombieBranches` can show does NOT belong to a run
 * in flight — either because the process named in its lease is gone (exact, same machine), or
 * because it is older than any run could plausibly be (the fallback). The runner calls this at
 * startup, BEFORE creating its own branch.
 *
 * @returns How many branches were deleted, plus the warning to repeat at the end of the run
 *   when the sweep could not run at all (`null` when it ran).
 */
export async function cleanupZombieBranches(): Promise<ZombieSweepResult> {
  const { apiKey, projectId } = getConfig();

  // List all branches in the project.
  //
  // 🔴 BOUNDED, AND NEVER THROWN FROM. The runner calls this in `main()` BEFORE it registers its
  // `SIGINT`/`SIGTERM` handlers, so an unanswered request here used to park the process for
  // undici's 300 s at the one moment a Ctrl-C has nowhere to land. And a throw would be worse
  // than useless: the sweep is housekeeping for OTHER runs' leftovers, so failing it must not
  // stop this one. Both failures now degrade to the same answer a 403 already produced — sweep
  // nothing, run anyway.
  let response: Response;
  try {
    response = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(BRANCH_READ_TIMEOUT_MS),
    });
  } catch (error) {
    // Printed HERE and returned for the end of the run: a line at minute zero of a seven-minute
    // suite is a line nobody reads (`zombieSweepWarning`).
    const warning = zombieSweepWarning(
      isAbort(error)
        ? { kind: 'timeout', timeoutMs: BRANCH_READ_TIMEOUT_MS }
        : { kind: 'unreachable', errorName: errorName(error) }
    );
    console.warn(warning);
    return { deleted: 0, warning };
  }

  if (!response.ok) {
    const warning = zombieSweepWarning({ kind: 'refused', status: response.status });
    console.warn(warning);
    return { deleted: 0, warning };
  }

  const data = await response.json();
  const branches: NeonBranchSummary[] = data.branches ?? [];

  const zombies = selectZombieBranches(branches, {
    now: Date.now(),
    hostTag: currentHostTag(),
    isProcessAlive,
  });

  if (zombies.length === 0) return { deleted: 0, warning: null };

  console.log(`   🧟 Found ${zombies.length} zombie branch(es):`);

  let deleted = 0;
  for (const { branch, reason, ageMs } of zombies) {
    // The reason is printed with the branch: a deletion nobody can explain is the kind that
    // gets blamed for an unrelated failure later.
    const age = Number.isFinite(ageMs) ? `${Math.round(ageMs / 60000)}min old` : 'unknown age';
    console.log(`      - ${branch.name} (${age}, ${ZOMBIE_REASON_LABEL[reason]})`);
    try {
      const delResponse = await fetch(
        `${NEON_API_BASE}/projects/${projectId}/branches/${branch.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          // The delete budget, reused: it is the same operation `deleteE2EBranch` bounds, and
          // these run in SERIES — N unbounded deletes would multiply the park by the number of
          // zombies, all of it before the run has started.
          signal: AbortSignal.timeout(BRANCH_DELETE_TIMEOUT_MS),
        }
      );
      if (delResponse.ok) {
        deleted++;
      } else {
        console.warn(`      ⚠️  Failed to delete ${branch.name}: ${delResponse.status}`);
      }
    } catch {
      console.warn(`      ⚠️  Error deleting ${branch.name}`);
    }
  }

  console.log(`   ✓ Cleaned up ${deleted}/${zombies.length} zombie branch(es)`);
  // A sweep that RAN and failed on individual deletes is not the silent case this warning is
  // for: those failures are named as they happen, above, and the count says what got through.
  return { deleted, warning: null };
}

export const STRIPE_MODE_SEMANTIC_CHECK_NAMES = [
    'column.events.stripe_mode',
    'constraint.events_stripe_mode_check',
    'column.rsvp_payments.livemode',
] as const

export type StripeModeSemanticCheckName = typeof STRIPE_MODE_SEMANTIC_CHECK_NAMES[number]
export type StripeModeSemanticState = Record<StripeModeSemanticCheckName, boolean>

export function stripeModeSemanticStateFromRows(
    rows: ReadonlyArray<Record<string, unknown>>,
): StripeModeSemanticState {
    const state = Object.fromEntries(
        STRIPE_MODE_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as StripeModeSemanticState
    const seen = new Set<StripeModeSemanticCheckName>()

    for (const row of rows) {
        if (
            typeof row.check_name !== 'string'
            || !STRIPE_MODE_SEMANTIC_CHECK_NAMES.includes(row.check_name as StripeModeSemanticCheckName)
            || seen.has(row.check_name as StripeModeSemanticCheckName)
        ) continue

        const name = row.check_name as StripeModeSemanticCheckName
        seen.add(name)
        state[name] = row.valid === true
    }

    return state
}

export function invalidStripeModeSemantics(state: StripeModeSemanticState): string[] {
    return STRIPE_MODE_SEMANTIC_CHECK_NAMES.filter(name => state[name] !== true)
}

/**
 * Migration 0013 (per-event Stripe mode): verifies the two flat column
 * additions and the one CHECK constraint that migration adds — same
 * flat-column shape as CHECKIN_SEMANTICS_QUERY (0011) plus a CHECK verified
 * by fragment match (ILIKE), same reasoning as the ledger checks in
 * lib/event-ledger-migration-contract.ts: pg_get_constraintdef deparses
 * `stripe_mode in ('live', 'test')` as `= ANY (ARRAY[...])`, a format this
 * codebase has not pinned exactly.
 *
 * - events.stripe_mode: varchar(8) NOT NULL DEFAULT 'live'. Every event that
 *   existed before 0013 keeps charging real money.
 * - events_stripe_mode_check: pins stripe_mode to 'live' | 'test'.
 * - rsvp_payments.livemode: boolean NOT NULL DEFAULT true. The default is
 *   load-bearing: it lets 0013 be applied before the deploy that writes the
 *   column, because the code running in production at that point inserts
 *   payments without it and only creates live Checkout sessions. A DB where
 *   this column is nullable or defaults to false fails this contract.
 */
export const STRIPE_MODE_SEMANTICS_QUERY = String.raw`
WITH stripe_mode_column_check AS (
    SELECT
        'column.events.stripe_mode'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'character varying'
            AND character_maximum_length = 8
            AND is_nullable = 'NO'
            AND column_default IN ('''live''::character varying', '''live''')
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'stripe_mode'
), stripe_mode_constraint_check AS (
    SELECT
        'constraint.events_stripe_mode_check'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            conrelid = 'public.events'::regclass
            AND contype = 'c'
            AND convalidated
            AND pg_get_constraintdef(oid, false) ILIKE '%stripe_mode%'
            AND pg_get_constraintdef(oid, false) ILIKE '%''live''%'
            AND pg_get_constraintdef(oid, false) ILIKE '%''test''%'
        ), false) AS valid
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public') AND conname = 'events_stripe_mode_check'
), livemode_column_check AS (
    SELECT
        'column.rsvp_payments.livemode'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'boolean'
            AND is_nullable = 'NO'
            AND column_default IN ('true', 'true::boolean')
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'livemode'
)
SELECT check_name, valid FROM stripe_mode_column_check
UNION ALL SELECT check_name, valid FROM stripe_mode_constraint_check
UNION ALL SELECT check_name, valid FROM livemode_column_check
ORDER BY check_name`

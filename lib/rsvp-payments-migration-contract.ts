export const PAYMENTS_SEMANTIC_CHECK_NAMES = [
    'column.events.payment_required',
    'table.rsvp_payments.columns',
    'constraint.rsvp_payments_pkey',
    'constraint.rsvp_payments_rsvp_fk',
    'constraint.rsvp_payments_event_fk',
    'constraint.rsvp_payments_stripe_session_id_unique',
    'constraint.rsvp_payments_amount_cents_check',
    'index.rsvp_payments_rsvp_id_idx',
    'index.rsvp_payments_event_id_status_idx',
] as const

export type PaymentsSemanticCheckName = typeof PAYMENTS_SEMANTIC_CHECK_NAMES[number]
export type PaymentsSemanticState = Record<PaymentsSemanticCheckName, boolean>

export function paymentsSemanticStateFromRows(
    rows: ReadonlyArray<Record<string, unknown>>,
): PaymentsSemanticState {
    const state = Object.fromEntries(
        PAYMENTS_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as PaymentsSemanticState
    const seen = new Set<PaymentsSemanticCheckName>()

    for (const row of rows) {
        if (
            typeof row.check_name !== 'string'
            || !PAYMENTS_SEMANTIC_CHECK_NAMES.includes(row.check_name as PaymentsSemanticCheckName)
            || seen.has(row.check_name as PaymentsSemanticCheckName)
        ) continue

        const name = row.check_name as PaymentsSemanticCheckName
        seen.add(name)
        state[name] = row.valid === true
    }

    return state
}

export function invalidPaymentsSemantics(state: PaymentsSemanticState): string[] {
    return PAYMENTS_SEMANTIC_CHECK_NAMES.filter(name => state[name] !== true)
}

/**
 * ISSUE-010 (EPIC-004): verifies both objects migration 0010 adds — the
 * events.payment_required flag (same flat-column shape as 0009's additions)
 * and the new rsvp_payments table (same full table/pkey/fk/unique/check/index
 * verification depth as 0008's rsvp_invitation_links, in
 * rsvp-invitation-migration-contract.ts, which this file mirrors). Same-named
 * objects on another table, or with different actions/defaults, do not pass.
 */
export const PAYMENTS_SEMANTICS_QUERY = String.raw`
WITH payment_required_check AS (
    SELECT
        'column.events.payment_required'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'boolean'
            AND is_nullable = 'NO'
            AND column_default IN ('false', 'false::boolean')
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'payment_required'
),
rsvp_payments_column_checks AS (
    SELECT 'id'::text AS column_name, EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'id'
          AND data_type = 'uuid' AND is_nullable = 'NO' AND column_default = 'gen_random_uuid()'
    ) AS valid
    UNION ALL
    SELECT 'rsvp_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'rsvp_id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'event_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'event_id'
          AND data_type = 'character varying' AND character_maximum_length = 100
          AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'stripe_session_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'stripe_session_id'
          AND data_type = 'character varying' AND character_maximum_length = 255
          AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'stripe_payment_intent_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'stripe_payment_intent_id'
          AND data_type = 'character varying' AND character_maximum_length = 255
          AND is_nullable = 'YES' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'amount_cents', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'amount_cents'
          AND data_type = 'integer' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'currency', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'currency'
          AND data_type = 'character varying' AND character_maximum_length = 10
          AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'status', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'status'
          AND data_type = 'character varying' AND character_maximum_length = 20
          AND is_nullable = 'NO'
          AND column_default IN ('''created''::character varying', '''created''')
    )
    UNION ALL
    SELECT 'created_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone' AND is_nullable = 'NO'
          AND column_default IN ('now()', 'CURRENT_TIMESTAMP')
    )
    UNION ALL
    SELECT 'paid_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'paid_at'
          AND data_type = 'timestamp without time zone' AND is_nullable = 'YES' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'refunded_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'rsvp_payments' AND column_name = 'refunded_at'
          AND data_type = 'timestamp without time zone' AND is_nullable = 'YES' AND column_default IS NULL
    )
),
column_check AS (
    SELECT
        'table.rsvp_payments.columns'::text AS check_name,
        (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'rsvp_payments') = 11
        AND coalesce(bool_and(valid), false) AS valid
    FROM rsvp_payments_column_checks
),
pkey_check AS (
    SELECT
        'constraint.rsvp_payments_pkey'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            conrelid = to_regclass('public.rsvp_payments')
            AND contype = 'p'
            AND conkey = ARRAY[
                (SELECT attnum FROM pg_attribute
                 WHERE attrelid = to_regclass('public.rsvp_payments') AND attname = 'id')
            ]::smallint[]
            AND convalidated
        ), false) AS valid
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public')
      AND conname = 'rsvp_payments_pkey'
),
rsvp_fk_check AS (
    SELECT
        'constraint.rsvp_payments_rsvp_fk'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            conrelid = to_regclass('public.rsvp_payments')
            AND confrelid = to_regclass('public.rsvps')
            AND contype = 'f'
            AND confupdtype = 'a'
            AND confdeltype = 'r'
            AND convalidated
            AND ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = conrelid AND attnum = ANY(conkey)) = ARRAY['rsvp_id']::name[]
            AND ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = confrelid AND attnum = ANY(confkey)) = ARRAY['id']::name[]
        ), false) AS valid
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public')
      AND conname = 'rsvp_payments_rsvp_id_rsvps_id_fk'
),
event_fk_check AS (
    SELECT
        'constraint.rsvp_payments_event_fk'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            conrelid = to_regclass('public.rsvp_payments')
            AND confrelid = to_regclass('public.events')
            AND contype = 'f'
            AND confupdtype = 'c'
            AND confdeltype = 'r'
            AND convalidated
            AND ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = conrelid AND attnum = ANY(conkey)) = ARRAY['event_id']::name[]
            AND ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = confrelid AND attnum = ANY(confkey)) = ARRAY['slug']::name[]
        ), false) AS valid
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public')
      AND conname = 'rsvp_payments_event_id_events_slug_fk'
),
session_unique_check AS (
    SELECT
        'constraint.rsvp_payments_stripe_session_id_unique'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            conrelid = to_regclass('public.rsvp_payments')
            AND contype = 'u'
            AND convalidated
            AND ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = conrelid AND attnum = ANY(conkey)) = ARRAY['stripe_session_id']::name[]
        ), false) AS valid
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public')
      AND conname = 'rsvp_payments_stripe_session_id_unique'
),
amount_check_check AS (
    -- Fragment match, not an exact normalized string: pg_get_constraintdef's
    -- deparser drops the table qualifier for a CHECK constraint's own-table
    -- column references (there is only ever one relation in scope), so the
    -- stored definition is CHECK ((amount_cents > 0)), not
    -- CHECK ((rsvp_payments.amount_cents > 0)) as written in the migration
    -- SQL. Same fragment-based style scripts/verify-db-contract.ts already
    -- uses for the events presentation CHECKs, to avoid pinning to an exact
    -- deparse format this codebase has not verified against live Postgres.
    SELECT
        'constraint.rsvp_payments_amount_cents_check'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            conrelid = to_regclass('public.rsvp_payments')
            AND contype = 'c'
            AND convalidated
            AND pg_get_constraintdef(oid, false) ILIKE '%amount_cents%>%0%'
        ), false) AS valid
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public')
      AND conname = 'rsvp_payments_amount_cents_check'
),
index_objects AS (
    SELECT
        index_class.relname,
        index_state.*,
        table_class.oid AS table_oid,
        regexp_replace(
            lower(replace(replace(pg_get_indexdef(index_class.oid), '"', ''), 'public.', '')),
            '[[:space:]]+', ' ', 'g'
        ) AS definition
    FROM pg_class index_class
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_index index_state ON index_state.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index_state.indrelid
    WHERE index_namespace.nspname = 'public'
      AND index_class.relname IN (
          'rsvp_payments_rsvp_id_idx',
          'rsvp_payments_event_id_status_idx'
      )
),
rsvp_id_index_check AS (
    SELECT
        'index.rsvp_payments_rsvp_id_idx'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            table_oid = to_regclass('public.rsvp_payments')
            AND NOT indisunique AND indisvalid AND indisready AND indislive
            AND indpred IS NULL AND indnkeyatts = 1 AND indnatts = 1
            AND definition = 'create index rsvp_payments_rsvp_id_idx on rsvp_payments using btree (rsvp_id)'
        ), false) AS valid
    FROM index_objects
    WHERE relname = 'rsvp_payments_rsvp_id_idx'
),
event_status_index_check AS (
    SELECT
        'index.rsvp_payments_event_id_status_idx'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            table_oid = to_regclass('public.rsvp_payments')
            AND NOT indisunique AND indisvalid AND indisready AND indislive
            AND indpred IS NULL AND indnkeyatts = 2 AND indnatts = 2
            AND definition = 'create index rsvp_payments_event_id_status_idx on rsvp_payments using btree (event_id, status)'
        ), false) AS valid
    FROM index_objects
    WHERE relname = 'rsvp_payments_event_id_status_idx'
)
SELECT check_name, valid FROM payment_required_check
UNION ALL SELECT check_name, valid FROM column_check
UNION ALL SELECT check_name, valid FROM pkey_check
UNION ALL SELECT check_name, valid FROM rsvp_fk_check
UNION ALL SELECT check_name, valid FROM event_fk_check
UNION ALL SELECT check_name, valid FROM session_unique_check
UNION ALL SELECT check_name, valid FROM amount_check_check
UNION ALL SELECT check_name, valid FROM rsvp_id_index_check
UNION ALL SELECT check_name, valid FROM event_status_index_check
ORDER BY check_name`

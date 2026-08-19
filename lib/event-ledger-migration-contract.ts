export const LEDGER_SEMANTIC_CHECK_NAMES = [
    'column.events.ledger_stripe_is_participant',
    'table.event_participants.columns',
    'constraint.event_participants_pkey',
    'constraint.event_participants_event_fk',
    'constraint.event_participants_user_fk',
    'constraint.event_participants_kind_check',
    'constraint.event_participants_name_check',
    'index.event_participants_stripe_kind_unique',
    'index.event_participants_event_name_unique',
    'index.event_participants_id_event_unique',
    'index.event_participants_event_id_idx',
    'table.event_transactions.columns',
    'constraint.event_transactions_pkey',
    'constraint.event_transactions_event_fk',
    'constraint.event_transactions_participant_fk',
    'constraint.event_transactions_type_check',
    'constraint.event_transactions_description_check',
    'constraint.event_transactions_amount_cents_check',
    'index.event_transactions_id_event_unique',
    'index.event_transactions_event_id_idx',
    'index.event_transactions_event_id_type_idx',
    'table.event_transaction_shares.columns',
    'constraint.event_transaction_shares_pkey',
    'constraint.event_transaction_shares_transaction_fk',
    'constraint.event_transaction_shares_participant_fk',
    'constraint.event_transaction_shares_share_cents_check',
    'index.event_transaction_shares_transaction_participant_unique',
    'index.event_transaction_shares_transaction_id_idx',
    'index.event_transaction_shares_participant_id_idx',
    'table.event_settlements.columns',
    'constraint.event_settlements_pkey',
    'constraint.event_settlements_event_fk',
    'constraint.event_settlements_from_fk',
    'constraint.event_settlements_to_fk',
    'constraint.event_settlements_from_to_check',
    'constraint.event_settlements_amount_cents_check',
    'index.event_settlements_event_id_idx',
] as const

export type LedgerSemanticCheckName = typeof LEDGER_SEMANTIC_CHECK_NAMES[number]
export type LedgerSemanticState = Record<LedgerSemanticCheckName, boolean>

export function ledgerSemanticStateFromRows(
    rows: ReadonlyArray<Record<string, unknown>>,
): LedgerSemanticState {
    const state = Object.fromEntries(
        LEDGER_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as LedgerSemanticState
    const seen = new Set<LedgerSemanticCheckName>()

    for (const row of rows) {
        if (
            typeof row.check_name !== 'string'
            || !LEDGER_SEMANTIC_CHECK_NAMES.includes(row.check_name as LedgerSemanticCheckName)
            || seen.has(row.check_name as LedgerSemanticCheckName)
        ) continue

        const name = row.check_name as LedgerSemanticCheckName
        seen.add(name)
        state[name] = row.valid === true
    }

    return state
}

export function invalidLedgerSemantics(state: LedgerSemanticState): string[] {
    return LEDGER_SEMANTIC_CHECK_NAMES.filter(name => state[name] !== true)
}

/**
 * ISSUE-021 (EPIC-006): verifies migration 0012's toggle column
 * (events.ledger_stripe_is_participant) and the four ledger tables —
 * event_participants, event_transactions, event_transaction_shares,
 * event_settlements — at the same full table/pkey/fk/check/index depth as
 * rsvp_payments in rsvp-payments-migration-contract.ts (which this file
 * mirrors), plus the composite (id, event_id) FKs and the Stripe node's
 * partial unique index that PLAN-EPIC-006.md §3.1/§2.6a require for
 * cross-event integrity. CHECK constraint bodies are verified by fragment
 * match (ILIKE), not an exact normalized string — same reasoning as
 * rsvp_payments_amount_cents_check: pg_get_constraintdef's deparse of a
 * boolean expression (e.g. `kind = ANY (ARRAY[...])`) is not a format this
 * codebase has pinned exactly, and a fragment match is robust to that
 * cosmetic variation while still catching a missing/renamed/loosened check.
 */
export const LEDGER_SEMANTICS_QUERY = String.raw`
WITH ledger_stripe_is_participant_check AS (
    SELECT
        'column.events.ledger_stripe_is_participant'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'boolean'
            AND is_nullable = 'NO'
            AND column_default IN ('false', 'false::boolean')
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'ledger_stripe_is_participant'
),
event_participants_column_checks AS (
    SELECT 'id'::text AS column_name, EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_participants' AND column_name = 'id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    ) AS valid
    UNION ALL
    SELECT 'event_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_participants' AND column_name = 'event_id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'kind', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_participants' AND column_name = 'kind'
          AND data_type = 'character varying' AND character_maximum_length = 10
          AND is_nullable = 'NO'
          AND column_default IN ('''person''::character varying', '''person''')
    )
    UNION ALL
    SELECT 'name', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_participants' AND column_name = 'name'
          AND data_type = 'character varying' AND character_maximum_length = 120
          AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'email', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_participants' AND column_name = 'email'
          AND data_type = 'character varying' AND character_maximum_length = 255
          AND is_nullable = 'YES' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'user_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_participants' AND column_name = 'user_id'
          AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'is_active', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_participants' AND column_name = 'is_active'
          AND data_type = 'boolean' AND is_nullable = 'NO'
          AND column_default IN ('true', 'true::boolean')
    )
    UNION ALL
    SELECT 'created_by', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_participants' AND column_name = 'created_by'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'created_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_participants' AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone' AND is_nullable = 'NO'
          AND column_default IN ('now()', 'CURRENT_TIMESTAMP')
    )
),
event_participants_columns_check AS (
    SELECT
        'table.event_participants.columns'::text AS check_name,
        (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'event_participants') = 9
        AND coalesce(bool_and(valid), false) AS valid
    FROM event_participants_column_checks
),
event_transactions_column_checks AS (
    SELECT 'id'::text AS column_name, EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    ) AS valid
    UNION ALL
    SELECT 'event_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'event_id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'type', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'type'
          AND data_type = 'character varying' AND character_maximum_length = 10
          AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'participant_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'participant_id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'description', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'description'
          AND data_type = 'character varying' AND character_maximum_length = 200
          AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'amount_cents', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'amount_cents'
          AND data_type = 'integer' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'currency', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'currency'
          AND data_type = 'character varying' AND character_maximum_length = 10
          AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'occurred_on', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'occurred_on'
          AND data_type = 'date' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'note', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'note'
          AND data_type = 'character varying' AND character_maximum_length = 500
          AND is_nullable = 'YES' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'created_by', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'created_by'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'created_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone' AND is_nullable = 'NO'
          AND column_default IN ('now()', 'CURRENT_TIMESTAMP')
    )
    UNION ALL
    SELECT 'updated_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'updated_at'
          AND data_type = 'timestamp without time zone' AND is_nullable = 'NO'
          AND column_default IN ('now()', 'CURRENT_TIMESTAMP')
    )
    UNION ALL
    SELECT 'deleted_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'deleted_at'
          AND data_type = 'timestamp without time zone' AND is_nullable = 'YES' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'deleted_by', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transactions' AND column_name = 'deleted_by'
          AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL
    )
),
event_transactions_columns_check AS (
    SELECT
        'table.event_transactions.columns'::text AS check_name,
        (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'event_transactions') = 14
        AND coalesce(bool_and(valid), false) AS valid
    FROM event_transactions_column_checks
),
event_transaction_shares_column_checks AS (
    SELECT 'id'::text AS column_name, EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transaction_shares' AND column_name = 'id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    ) AS valid
    UNION ALL
    SELECT 'transaction_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transaction_shares' AND column_name = 'transaction_id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'event_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transaction_shares' AND column_name = 'event_id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'participant_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transaction_shares' AND column_name = 'participant_id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'share_cents', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_transaction_shares' AND column_name = 'share_cents'
          AND data_type = 'integer' AND is_nullable = 'NO' AND column_default IS NULL
    )
),
event_transaction_shares_columns_check AS (
    SELECT
        'table.event_transaction_shares.columns'::text AS check_name,
        (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'event_transaction_shares') = 5
        AND coalesce(bool_and(valid), false) AS valid
    FROM event_transaction_shares_column_checks
),
event_settlements_column_checks AS (
    SELECT 'id'::text AS column_name, EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    ) AS valid
    UNION ALL
    SELECT 'event_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'event_id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'from_participant_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'from_participant_id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'to_participant_id', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'to_participant_id'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'amount_cents', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'amount_cents'
          AND data_type = 'integer' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'currency', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'currency'
          AND data_type = 'character varying' AND character_maximum_length = 10
          AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'settled_on', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'settled_on'
          AND data_type = 'date' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'note', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'note'
          AND data_type = 'character varying' AND character_maximum_length = 500
          AND is_nullable = 'YES' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'created_by', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'created_by'
          AND data_type = 'text' AND is_nullable = 'NO' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'created_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'created_at'
          AND data_type = 'timestamp without time zone' AND is_nullable = 'NO'
          AND column_default IN ('now()', 'CURRENT_TIMESTAMP')
    )
    UNION ALL
    SELECT 'updated_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'updated_at'
          AND data_type = 'timestamp without time zone' AND is_nullable = 'NO'
          AND column_default IN ('now()', 'CURRENT_TIMESTAMP')
    )
    UNION ALL
    SELECT 'deleted_at', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'deleted_at'
          AND data_type = 'timestamp without time zone' AND is_nullable = 'YES' AND column_default IS NULL
    )
    UNION ALL
    SELECT 'deleted_by', EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'event_settlements' AND column_name = 'deleted_by'
          AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL
    )
),
event_settlements_columns_check AS (
    SELECT
        'table.event_settlements.columns'::text AS check_name,
        (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'event_settlements') = 13
        AND coalesce(bool_and(valid), false) AS valid
    FROM event_settlements_column_checks
),
pkey_targets(check_name, conname, relation) AS (
    VALUES
        ('constraint.event_participants_pkey', 'event_participants_pkey', 'public.event_participants'),
        ('constraint.event_transactions_pkey', 'event_transactions_pkey', 'public.event_transactions'),
        ('constraint.event_transaction_shares_pkey', 'event_transaction_shares_pkey', 'public.event_transaction_shares'),
        ('constraint.event_settlements_pkey', 'event_settlements_pkey', 'public.event_settlements')
),
pkey_objects AS (
    SELECT conname, conrelid, contype, convalidated,
        ARRAY(
            SELECT attribute.attname::text
            FROM unnest(conkey) WITH ORDINALITY AS key_column(attnum, position)
            JOIN pg_attribute attribute ON attribute.attrelid = conrelid AND attribute.attnum = key_column.attnum
            ORDER BY key_column.position
        ) AS column_names
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public') AND contype = 'p'
      AND conname IN (SELECT conname FROM pkey_targets)
),
pkey_checks AS (
    SELECT
        t.check_name,
        count(o.conname) = 1
        AND coalesce(bool_and(
            o.conrelid = t.relation::regclass
            AND o.convalidated
            AND o.column_names = ARRAY['id']::text[]
        ), false) AS valid
    FROM pkey_targets t
    LEFT JOIN pkey_objects o ON o.conname = t.conname
    GROUP BY t.check_name
),
-- Composite (participant_id/transaction_id, event_id) -> (id, event_id) FKs
-- are the cross-event integrity mechanism this migration exists for (PLAN
-- §3.1/gotcha #1); confupdtype/confdeltype codes: 'a' = no action,
-- 'c' = cascade, 'r' = restrict, 'n' = set null.
fk_targets(check_name, conname, own_relation, ref_relation, own_columns, ref_columns, expected_update, expected_delete) AS (
    VALUES
        ('constraint.event_participants_event_fk', 'event_participants_event_id_events_slug_fk', 'public.event_participants', 'public.events', ARRAY['event_id'], ARRAY['slug'], 'c', 'r'),
        ('constraint.event_participants_user_fk', 'event_participants_user_id_users_id_fk', 'public.event_participants', 'public.users', ARRAY['user_id'], ARRAY['id'], 'a', 'n'),
        ('constraint.event_transactions_event_fk', 'event_transactions_event_id_events_slug_fk', 'public.event_transactions', 'public.events', ARRAY['event_id'], ARRAY['slug'], 'c', 'r'),
        ('constraint.event_transactions_participant_fk', 'event_transactions_participant_id_event_id_fk', 'public.event_transactions', 'public.event_participants', ARRAY['participant_id', 'event_id'], ARRAY['id', 'event_id'], 'a', 'r'),
        ('constraint.event_transaction_shares_transaction_fk', 'event_transaction_shares_transaction_id_event_id_fk', 'public.event_transaction_shares', 'public.event_transactions', ARRAY['transaction_id', 'event_id'], ARRAY['id', 'event_id'], 'a', 'c'),
        ('constraint.event_transaction_shares_participant_fk', 'event_transaction_shares_participant_id_event_id_fk', 'public.event_transaction_shares', 'public.event_participants', ARRAY['participant_id', 'event_id'], ARRAY['id', 'event_id'], 'a', 'r'),
        ('constraint.event_settlements_event_fk', 'event_settlements_event_id_events_slug_fk', 'public.event_settlements', 'public.events', ARRAY['event_id'], ARRAY['slug'], 'c', 'r'),
        ('constraint.event_settlements_from_fk', 'event_settlements_from_participant_id_event_id_fk', 'public.event_settlements', 'public.event_participants', ARRAY['from_participant_id', 'event_id'], ARRAY['id', 'event_id'], 'a', 'r'),
        ('constraint.event_settlements_to_fk', 'event_settlements_to_participant_id_event_id_fk', 'public.event_settlements', 'public.event_participants', ARRAY['to_participant_id', 'event_id'], ARRAY['id', 'event_id'], 'a', 'r')
),
fk_objects AS (
    SELECT
        conname, conrelid, confrelid, confupdtype, confdeltype, convalidated,
        ARRAY(
            SELECT attribute.attname::text
            FROM unnest(conkey) WITH ORDINALITY AS key_column(attnum, position)
            JOIN pg_attribute attribute ON attribute.attrelid = conrelid AND attribute.attnum = key_column.attnum
            ORDER BY key_column.position
        ) AS own_columns,
        ARRAY(
            SELECT attribute.attname::text
            FROM unnest(confkey) WITH ORDINALITY AS key_column(attnum, position)
            JOIN pg_attribute attribute ON attribute.attrelid = confrelid AND attribute.attnum = key_column.attnum
            ORDER BY key_column.position
        ) AS ref_columns
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public') AND contype = 'f'
      AND conname IN (SELECT conname FROM fk_targets)
),
fk_checks AS (
    SELECT
        t.check_name,
        count(o.conname) = 1
        AND coalesce(bool_and(
            o.conrelid = t.own_relation::regclass
            AND o.confrelid = t.ref_relation::regclass
            AND o.own_columns = t.own_columns
            AND o.ref_columns = t.ref_columns
            AND o.confupdtype = t.expected_update::"char"
            AND o.confdeltype = t.expected_delete::"char"
            AND o.convalidated
        ), false) AS valid
    FROM fk_targets t
    LEFT JOIN fk_objects o ON o.conname = t.conname
    GROUP BY t.check_name
),
-- CHECK constraint bodies matched by fragment (ILIKE), not an exact
-- normalized string — see the function-level comment above.
check_targets(check_name, conname, relation, fragments) AS (
    VALUES
        ('constraint.event_participants_kind_check', 'event_participants_kind_check', 'public.event_participants', ARRAY['kind', 'person', 'stripe']),
        ('constraint.event_participants_name_check', 'event_participants_name_check', 'public.event_participants', ARRAY['char_length', 'btrim', 'name', '>= 2', '<= 120']),
        ('constraint.event_transactions_type_check', 'event_transactions_type_check', 'public.event_transactions', ARRAY['type', 'expense', 'income']),
        ('constraint.event_transactions_description_check', 'event_transactions_description_check', 'public.event_transactions', ARRAY['char_length', 'btrim', 'description', '>= 1', '<= 200']),
        ('constraint.event_transactions_amount_cents_check', 'event_transactions_amount_cents_check', 'public.event_transactions', ARRAY['amount_cents', '> 0']),
        ('constraint.event_transaction_shares_share_cents_check', 'event_transaction_shares_share_cents_check', 'public.event_transaction_shares', ARRAY['share_cents', '> 0']),
        ('constraint.event_settlements_from_to_check', 'event_settlements_from_to_check', 'public.event_settlements', ARRAY['from_participant_id', 'to_participant_id', '<>']),
        ('constraint.event_settlements_amount_cents_check', 'event_settlements_amount_cents_check', 'public.event_settlements', ARRAY['amount_cents', '> 0'])
),
check_objects AS (
    SELECT conname, conrelid, convalidated, pg_get_constraintdef(oid, false) AS definition
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public') AND contype = 'c'
      AND conname IN (SELECT conname FROM check_targets)
),
check_checks AS (
    SELECT
        t.check_name,
        count(o.conname) = 1
        AND coalesce(bool_and(
            o.conrelid = t.relation::regclass
            AND o.convalidated
            AND (SELECT bool_and(o.definition ILIKE '%' || fragment || '%') FROM unnest(t.fragments) AS fragment)
        ), false) AS valid
    FROM check_targets t
    LEFT JOIN check_objects o ON o.conname = t.conname
    GROUP BY t.check_name
),
-- Index definitions — including the Stripe node's partial unique index and
-- the case-insensitive-name unique index — matched against an exact
-- normalized string, same style as rsvp_payments' indexes above.
index_targets(check_name, index_name, relation, definition) AS (
    VALUES
        ('index.event_participants_stripe_kind_unique', 'event_participants_stripe_kind_unique', 'public.event_participants', 'create unique index event_participants_stripe_kind_unique on event_participants using btree (event_id) where ((kind)::text = ''stripe''::text)'),
        ('index.event_participants_event_name_unique', 'event_participants_event_name_unique', 'public.event_participants', 'create unique index event_participants_event_name_unique on event_participants using btree (event_id, lower((name)::text))'),
        ('index.event_participants_id_event_unique', 'event_participants_id_event_unique', 'public.event_participants', 'create unique index event_participants_id_event_unique on event_participants using btree (id, event_id)'),
        ('index.event_participants_event_id_idx', 'event_participants_event_id_idx', 'public.event_participants', 'create index event_participants_event_id_idx on event_participants using btree (event_id)'),
        ('index.event_transactions_id_event_unique', 'event_transactions_id_event_unique', 'public.event_transactions', 'create unique index event_transactions_id_event_unique on event_transactions using btree (id, event_id)'),
        ('index.event_transactions_event_id_idx', 'event_transactions_event_id_idx', 'public.event_transactions', 'create index event_transactions_event_id_idx on event_transactions using btree (event_id)'),
        ('index.event_transactions_event_id_type_idx', 'event_transactions_event_id_type_idx', 'public.event_transactions', 'create index event_transactions_event_id_type_idx on event_transactions using btree (event_id, type)'),
        ('index.event_transaction_shares_transaction_participant_unique', 'event_transaction_shares_transaction_participant_unique', 'public.event_transaction_shares', 'create unique index event_transaction_shares_transaction_participant_unique on event_transaction_shares using btree (transaction_id, participant_id)'),
        ('index.event_transaction_shares_transaction_id_idx', 'event_transaction_shares_transaction_id_idx', 'public.event_transaction_shares', 'create index event_transaction_shares_transaction_id_idx on event_transaction_shares using btree (transaction_id)'),
        ('index.event_transaction_shares_participant_id_idx', 'event_transaction_shares_participant_id_idx', 'public.event_transaction_shares', 'create index event_transaction_shares_participant_id_idx on event_transaction_shares using btree (participant_id)'),
        ('index.event_settlements_event_id_idx', 'event_settlements_event_id_idx', 'public.event_settlements', 'create index event_settlements_event_id_idx on event_settlements using btree (event_id)')
),
index_objects AS (
    SELECT
        index_class.relname,
        index_state.indisunique, index_state.indisvalid, index_state.indisready, index_state.indislive,
        table_class.oid AS table_oid,
        regexp_replace(
            lower(replace(replace(pg_get_indexdef(index_class.oid), '"', ''), 'public.', '')),
            '[[:space:]]+', ' ', 'g'
        ) AS normalized_definition
    FROM pg_class index_class
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_index index_state ON index_state.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index_state.indrelid
    WHERE index_namespace.nspname = 'public'
      AND index_class.relname IN (SELECT index_name FROM index_targets)
),
index_checks AS (
    SELECT
        t.check_name,
        count(o.relname) = 1
        AND coalesce(bool_and(
            o.table_oid = t.relation::regclass
            AND o.indisvalid AND o.indisready AND o.indislive
            AND o.normalized_definition = t.definition
        ), false) AS valid
    FROM index_targets t
    LEFT JOIN index_objects o ON o.relname = t.index_name
    GROUP BY t.check_name
)
SELECT check_name, valid FROM ledger_stripe_is_participant_check
UNION ALL SELECT check_name, valid FROM event_participants_columns_check
UNION ALL SELECT check_name, valid FROM event_transactions_columns_check
UNION ALL SELECT check_name, valid FROM event_transaction_shares_columns_check
UNION ALL SELECT check_name, valid FROM event_settlements_columns_check
UNION ALL SELECT check_name, valid FROM pkey_checks
UNION ALL SELECT check_name, valid FROM fk_checks
UNION ALL SELECT check_name, valid FROM check_checks
UNION ALL SELECT check_name, valid FROM index_checks
ORDER BY check_name`

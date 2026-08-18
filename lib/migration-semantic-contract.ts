export const HISTORICAL_SEMANTIC_CHECK_NAMES = [
    'column.events.display_title',
    'column.events.require_plus_one_name',
    'column.rsvps.plus_one_name',
    'constraint.app_settings_pkey',
    'constraint.events_pkey',
    'constraint.events_slug_unique',
    'constraint.rsvps_pkey',
    'constraint.user_event_assignments_pkey',
    'constraint.user_sessions_pkey',
    'constraint.user_sessions_token_unique',
    'constraint.users_pkey',
    'constraint.users_email_unique',
    'constraint.rsvps_event_id_events_slug_fk',
    'index.rsvps_event_email_unique',
    'trigger.rsvps_capacity_check',
    'function.enforce_event_capacity',
] as const

export type HistoricalSemanticCheckName = typeof HISTORICAL_SEMANTIC_CHECK_NAMES[number]

export type HistoricalSemanticState = Record<HistoricalSemanticCheckName, boolean>

export function historicalSemanticStateFromRows(
    rows: ReadonlyArray<Record<string, unknown>>,
): HistoricalSemanticState {
    const state = Object.fromEntries(
        HISTORICAL_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as HistoricalSemanticState
    const seen = new Set<HistoricalSemanticCheckName>()

    for (const row of rows) {
        if (
            typeof row.check_name !== 'string'
            || !HISTORICAL_SEMANTIC_CHECK_NAMES.includes(
                row.check_name as HistoricalSemanticCheckName,
            )
            || seen.has(row.check_name as HistoricalSemanticCheckName)
        ) {
            continue
        }
        const name = row.check_name as HistoricalSemanticCheckName
        seen.add(name)
        state[name] = row.valid === true
    }

    return state
}

export function invalidHistoricalSemantics(state: HistoricalSemanticState): string[] {
    return HISTORICAL_SEMANTIC_CHECK_NAMES.filter(name => state[name] !== true)
}

export const EXPECTED_CAPACITY_FUNCTION_BODY_HASH = 'cc8ef90ba771e3ee7713166327b0d3fa'

// ISSUE-005 (EPIC-002): same fingerprint recipe, over the enforce_event_capacity()
// body as CREATE OR REPLACEd by drizzle/0009_pending_states.sql — counts
// pending_payment/pending_verification as seat-holding statuses alongside
// confirmed. The historical function.enforce_event_capacity check below
// accepts EITHER hash so verify:db/preflight keep passing whether a target
// has run 0009 yet or not (0009 has not been applied to any real database).
// Migration 0009 is file-only as of this constant's introduction — see
// docs/backlog/ISSUE-005-pending-states-migration.md.
export const EXPECTED_PENDING_STATES_CAPACITY_FUNCTION_BODY_HASH = '80111d792df7d5de6e42b6cdbfc793ba'

// Keep this exact expression synchronized with the production baseline guard.
// It intentionally does not lowercase prosrc: PL/pgSQL string literals are
// case-sensitive, so lower(prosrc) can make behavior-changing bodies collide.
export const CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL = String.raw`md5(regexp_replace(btrim(prosrc, E' \t\n\r\f'), '[[:space:]]+', ' ', 'g'))`

/**
 * One catalog query is shared by the read-only preflight and verify:db. It
 * checks object identity first (schema, relation, columns and function OID),
 * then definition details that PostgreSQL does not expose as simple flags.
 * Definition comparisons normalize quoting, schema qualification, case and
 * whitespace where those transformations cannot alter behavior. The capacity
 * function body keeps case significant because it contains string literals.
 * Operators, actions and statement order remain significant throughout.
 */
export const HISTORICAL_SEMANTICS_QUERY = String.raw`
WITH foundation_column_checks AS (
    SELECT
        'column.events.display_title'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'text'
            AND is_nullable = 'YES'
            AND column_default = quote_literal(''::text) || '::text'
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'display_title'
    UNION ALL
    SELECT
        'column.events.require_plus_one_name'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'boolean'
            AND is_nullable = 'YES'
            AND column_default IN ('false', 'false::boolean')
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'require_plus_one_name'
    UNION ALL
    SELECT
        'column.rsvps.plus_one_name'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'text'
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'plus_one_name'
),
expected_constraints(check_name, object_name, relation_oid, constraint_type, column_names) AS (
    VALUES
        ('constraint.app_settings_pkey', 'app_settings_pkey', to_regclass('public.app_settings')::oid, 'p'::"char", ARRAY['id']::text[]),
        ('constraint.events_pkey', 'events_pkey', to_regclass('public.events')::oid, 'p'::"char", ARRAY['id']::text[]),
        ('constraint.events_slug_unique', 'events_slug_unique', to_regclass('public.events')::oid, 'u'::"char", ARRAY['slug']::text[]),
        ('constraint.rsvps_pkey', 'rsvps_pkey', to_regclass('public.rsvps')::oid, 'p'::"char", ARRAY['id']::text[]),
        ('constraint.user_event_assignments_pkey', 'user_event_assignments_pkey', to_regclass('public.user_event_assignments')::oid, 'p'::"char", ARRAY['id']::text[]),
        ('constraint.user_sessions_pkey', 'user_sessions_pkey', to_regclass('public.user_sessions')::oid, 'p'::"char", ARRAY['id']::text[]),
        ('constraint.user_sessions_token_unique', 'user_sessions_token_unique', to_regclass('public.user_sessions')::oid, 'u'::"char", ARRAY['token']::text[]),
        ('constraint.users_pkey', 'users_pkey', to_regclass('public.users')::oid, 'p'::"char", ARRAY['id']::text[]),
        ('constraint.users_email_unique', 'users_email_unique', to_regclass('public.users')::oid, 'u'::"char", ARRAY['email']::text[])
),
constraint_objects AS (
    SELECT
        c.*,
        ARRAY(
            SELECT attribute.attname::text
            FROM unnest(c.conkey) WITH ORDINALITY AS key_column(attnum, position)
            JOIN pg_attribute attribute
              ON attribute.attrelid = c.conrelid
             AND attribute.attnum = key_column.attnum
            ORDER BY key_column.position
        ) AS column_names
    FROM pg_constraint c
    WHERE c.connamespace = to_regnamespace('public')
),
constraint_checks AS (
    SELECT
        expected.check_name,
        count(actual.oid) = 1
        AND coalesce(bool_and(
            actual.conrelid = expected.relation_oid
            AND actual.contype = expected.constraint_type
            AND actual.column_names = expected.column_names
            AND actual.convalidated
        ), false) AS valid
    FROM expected_constraints expected
    LEFT JOIN constraint_objects actual ON actual.conname = expected.object_name
    GROUP BY expected.check_name
),
fk_objects AS (
    SELECT
        c.*,
        ARRAY(
            SELECT attribute.attname::text
            FROM unnest(c.conkey) WITH ORDINALITY AS key_column(attnum, position)
            JOIN pg_attribute attribute
              ON attribute.attrelid = c.conrelid
             AND attribute.attnum = key_column.attnum
            ORDER BY key_column.position
        ) AS column_names,
        ARRAY(
            SELECT attribute.attname::text
            FROM unnest(c.confkey) WITH ORDINALITY AS key_column(attnum, position)
            JOIN pg_attribute attribute
              ON attribute.attrelid = c.confrelid
             AND attribute.attnum = key_column.attnum
            ORDER BY key_column.position
        ) AS referenced_column_names,
        regexp_replace(
            lower(replace(replace(pg_get_constraintdef(c.oid, false), '"', ''), 'public.', '')),
            '[[:space:]]+', ' ', 'g'
        ) AS normalized_definition
    FROM pg_constraint c
    WHERE c.connamespace = to_regnamespace('public')
      AND c.conname = 'rsvps_event_id_events_slug_fk'
),
fk_check AS (
    SELECT
        'constraint.rsvps_event_id_events_slug_fk'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            contype = 'f'
            AND conrelid = to_regclass('public.rsvps')
            AND confrelid = to_regclass('public.events')
            AND column_names = ARRAY['event_id']::text[]
            AND referenced_column_names = ARRAY['slug']::text[]
            AND confupdtype = 'c'
            AND confdeltype = 'r'
            AND confmatchtype = 's'
            AND NOT condeferrable
            AND NOT condeferred
            AND convalidated
            AND normalized_definition = 'foreign key (event_id) references events(slug) on update cascade on delete restrict'
        ), false) AS valid
    FROM fk_objects
),
index_objects AS (
    SELECT
        index_class.oid AS index_oid,
        index_state.*,
        table_class.oid AS table_oid,
        regexp_replace(
            lower(replace(replace(pg_get_indexdef(index_class.oid), '"', ''), 'public.', '')),
            '[[:space:]]+', ' ', 'g'
        ) AS normalized_definition,
        regexp_replace(
            lower(replace(pg_get_indexdef(index_class.oid, 1, true), '"', '')),
            '[[:space:]]+', ' ', 'g'
        ) AS first_key,
        regexp_replace(
            lower(replace(pg_get_indexdef(index_class.oid, 2, true), '"', '')),
            '[[:space:]]+', ' ', 'g'
        ) AS second_key
    FROM pg_class index_class
    JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
    JOIN pg_index index_state ON index_state.indexrelid = index_class.oid
    JOIN pg_class table_class ON table_class.oid = index_state.indrelid
    WHERE index_namespace.nspname = 'public'
      AND index_class.relname = 'rsvps_event_email_unique'
),
index_check AS (
    SELECT
        'index.rsvps_event_email_unique'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            table_oid = to_regclass('public.rsvps')
            AND indisunique
            AND indisvalid
            AND indisready
            AND indislive
            AND indpred IS NULL
            AND indnkeyatts = 2
            AND indnatts = 2
            AND first_key = 'event_id'
            AND second_key = 'lower(email)'
            AND normalized_definition = 'create unique index rsvps_event_email_unique on rsvps using btree (event_id, lower(email))'
        ), false) AS valid
    FROM index_objects
),
trigger_objects AS (
    SELECT
        trigger_state.*,
        table_class.oid AS table_oid,
        ARRAY(
            SELECT attribute.attname::text
            FROM unnest(trigger_state.tgattr::smallint[]) WITH ORDINALITY AS trigger_column(attnum, position)
            JOIN pg_attribute attribute
              ON attribute.attrelid = trigger_state.tgrelid
             AND attribute.attnum = trigger_column.attnum
            ORDER BY trigger_column.position
        ) AS update_columns,
        regexp_replace(
            lower(replace(replace(pg_get_triggerdef(trigger_state.oid, false), '"', ''), 'public.', '')),
            '[[:space:]]+', ' ', 'g'
        ) AS normalized_definition
    FROM pg_trigger trigger_state
    JOIN pg_class table_class ON table_class.oid = trigger_state.tgrelid
    JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
    WHERE table_namespace.nspname = 'public'
      AND trigger_state.tgname = 'rsvps_capacity_check'
      AND NOT trigger_state.tgisinternal
),
trigger_check AS (
    SELECT
        'trigger.rsvps_capacity_check'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            table_oid = to_regclass('public.rsvps')
            AND tgfoid = to_regprocedure('public.enforce_event_capacity()')
            AND tgenabled = 'O'
            AND tgtype = 23
            AND tgnargs = 0
            AND update_columns = ARRAY['status', 'plus_one']::text[]
            AND normalized_definition = 'create trigger rsvps_capacity_check before insert or update of status, plus_one on rsvps for each row execute function enforce_event_capacity()'
        ), false) AS valid
    FROM trigger_objects
),
function_objects AS (
    SELECT
        procedure_state.*,
        language_state.lanname
    FROM pg_proc procedure_state
    JOIN pg_namespace procedure_namespace ON procedure_namespace.oid = procedure_state.pronamespace
    JOIN pg_language language_state ON language_state.oid = procedure_state.prolang
    WHERE procedure_namespace.nspname = 'public'
      AND procedure_state.proname = 'enforce_event_capacity'
),
function_check AS (
    SELECT
        'function.enforce_event_capacity'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            pg_get_function_identity_arguments(oid) = ''
            AND pg_get_function_result(oid) = 'trigger'
            AND prorettype = 'trigger'::regtype
            AND prokind = 'f'
            AND lanname = 'plpgsql'
            AND provolatile = 'v'
            AND NOT prosecdef
            AND (
                ${CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL} = '${EXPECTED_CAPACITY_FUNCTION_BODY_HASH}'
                OR ${CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL} = '${EXPECTED_PENDING_STATES_CAPACITY_FUNCTION_BODY_HASH}'
            )
        ), false) AS valid
    FROM function_objects
)
SELECT check_name, valid FROM foundation_column_checks
UNION ALL SELECT check_name, valid FROM constraint_checks
UNION ALL SELECT check_name, valid FROM fk_check
UNION ALL SELECT check_name, valid FROM index_check
UNION ALL SELECT check_name, valid FROM trigger_check
UNION ALL SELECT check_name, valid FROM function_check
ORDER BY check_name`

export const PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES = [
    'column.users.must_change_password',
    'table.password_reset_tokens.columns',
    'constraint.password_reset_tokens_pkey',
    'constraint.password_reset_tokens_user_fk',
    'index.password_reset_tokens_token_hash_unique',
    'index.password_reset_tokens_user_id_idx',
    'index.password_reset_tokens_expires_at_idx',
    'index.password_reset_tokens_active_slot_unique',
] as const

export type PasswordLifecycleSemanticCheckName = typeof PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES[number]
export type PasswordLifecycleSemanticState = Record<PasswordLifecycleSemanticCheckName, boolean>

export function passwordLifecycleSemanticStateFromRows(
    rows: ReadonlyArray<Record<string, unknown>>,
): PasswordLifecycleSemanticState {
    const state = Object.fromEntries(
        PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as PasswordLifecycleSemanticState
    const seen = new Set<PasswordLifecycleSemanticCheckName>()

    for (const row of rows) {
        if (
            typeof row.check_name !== 'string'
            || !PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES.includes(
                row.check_name as PasswordLifecycleSemanticCheckName,
            )
            || seen.has(row.check_name as PasswordLifecycleSemanticCheckName)
        ) continue

        const name = row.check_name as PasswordLifecycleSemanticCheckName
        seen.add(name)
        state[name] = row.valid === true
    }

    return state
}

export function invalidPasswordLifecycleSemantics(state: PasswordLifecycleSemanticState): string[] {
    return PASSWORD_LIFECYCLE_SEMANTIC_CHECK_NAMES.filter(name => state[name] !== true)
}

export const PASSWORD_LIFECYCLE_SEMANTICS_QUERY = String.raw`
WITH must_change_password_check AS (
    SELECT
        'column.users.must_change_password'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'boolean'
            AND is_nullable = 'NO'
            AND column_default IN ('false', 'false::boolean')
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'must_change_password'
), reset_token_columns_check AS (
    SELECT
        'table.password_reset_tokens.columns'::text AS check_name,
        count(*) = 8
        AND count(*) FILTER (WHERE column_name = 'id' AND data_type = 'text' AND is_nullable = 'NO') = 1
        AND count(*) FILTER (WHERE column_name = 'user_id' AND data_type = 'text' AND is_nullable = 'NO') = 1
        AND count(*) FILTER (WHERE column_name = 'token_hash' AND data_type = 'text' AND is_nullable = 'NO') = 1
        AND count(*) FILTER (WHERE column_name = 'expires_at' AND data_type = 'timestamp without time zone' AND is_nullable = 'NO') = 1
        AND count(*) FILTER (WHERE column_name = 'consumed_at' AND data_type = 'timestamp without time zone' AND is_nullable = 'YES') = 1
        AND count(*) FILTER (WHERE column_name = 'created_at' AND data_type = 'timestamp without time zone' AND is_nullable = 'NO' AND column_default = 'now()') = 1
        AND count(*) FILTER (WHERE column_name = 'request_ip' AND data_type = 'character varying' AND character_maximum_length = 45 AND is_nullable = 'YES') = 1
        AND count(*) FILTER (WHERE column_name = 'issuance_slot' AND data_type = 'integer' AND is_nullable = 'YES') = 1
        AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens'
), reset_token_pk_check AS (
    SELECT
        'constraint.password_reset_tokens_pkey'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            pk.contype = 'p'
            AND pk.conrelid = to_regclass('public.password_reset_tokens')
            AND pk.convalidated
            AND ARRAY(
                SELECT attribute.attname::text
                FROM unnest(pk.conkey) WITH ORDINALITY AS key_column(attnum, position)
                JOIN pg_attribute attribute
                  ON attribute.attrelid = pk.conrelid
                 AND attribute.attnum = key_column.attnum
                ORDER BY key_column.position
            ) = ARRAY['id']::text[]
        ), false) AS valid
    FROM pg_constraint pk
    WHERE pk.connamespace = to_regnamespace('public')
      AND pk.conname = 'password_reset_tokens_pkey'
), reset_token_fk_check AS (
    SELECT
        'constraint.password_reset_tokens_user_fk'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            contype = 'f'
            AND conrelid = to_regclass('public.password_reset_tokens')
            AND confrelid = to_regclass('public.users')
            AND confdeltype = 'c'
            AND confupdtype = 'a'
            AND convalidated
            AND regexp_replace(
                lower(replace(replace(pg_get_constraintdef(oid, false), '"', ''), 'public.', '')),
                '[[:space:]]+', ' ', 'g'
            ) = 'foreign key (user_id) references users(id) on delete cascade'
        ), false) AS valid
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public')
      AND conname = 'password_reset_tokens_user_id_users_id_fk'
), expected_indexes(check_name, index_name, unique_required, predicate_required, definition) AS (
    VALUES
        ('index.password_reset_tokens_token_hash_unique', 'password_reset_tokens_token_hash_unique', true, false,
         'create unique index password_reset_tokens_token_hash_unique on password_reset_tokens using btree (token_hash)'),
        ('index.password_reset_tokens_user_id_idx', 'password_reset_tokens_user_id_idx', false, false,
         'create index password_reset_tokens_user_id_idx on password_reset_tokens using btree (user_id)'),
        ('index.password_reset_tokens_expires_at_idx', 'password_reset_tokens_expires_at_idx', false, false,
         'create index password_reset_tokens_expires_at_idx on password_reset_tokens using btree (expires_at)'),
        ('index.password_reset_tokens_active_slot_unique', 'password_reset_tokens_active_slot_unique', true, true,
         'create unique index password_reset_tokens_active_slot_unique on password_reset_tokens using btree (user_id, issuance_slot) where ((consumed_at is null) and (issuance_slot is not null))')
), index_checks AS (
    SELECT
        expected.check_name,
        count(index_class.oid) = 1
        AND coalesce(bool_and(
            index_state.indrelid = to_regclass('public.password_reset_tokens')
            AND index_state.indisunique = expected.unique_required
            AND index_state.indisvalid
            AND index_state.indisready
            AND index_state.indislive
            AND (index_state.indpred IS NOT NULL) = expected.predicate_required
            AND regexp_replace(
                lower(replace(replace(pg_get_indexdef(index_class.oid), '"', ''), 'public.', '')),
                '[[:space:]]+', ' ', 'g'
            ) = expected.definition
        ), false) AS valid
    FROM expected_indexes expected
    LEFT JOIN pg_class index_class ON index_class.relname = expected.index_name
        AND index_class.relnamespace = to_regnamespace('public')
    LEFT JOIN pg_index index_state ON index_state.indexrelid = index_class.oid
    GROUP BY expected.check_name
)
SELECT check_name, valid FROM must_change_password_check
UNION ALL SELECT check_name, valid FROM reset_token_columns_check
UNION ALL SELECT check_name, valid FROM reset_token_pk_check
UNION ALL SELECT check_name, valid FROM reset_token_fk_check
UNION ALL SELECT check_name, valid FROM index_checks
ORDER BY check_name`

export const PENDING_STATES_SEMANTIC_CHECK_NAMES = [
    'column.events.email_verification_enabled',
    'column.rsvps.pending_expires_at',
    'column.rsvps.verified_at',
    'column.rsvps.verification_token_hash',
    'column.rsvps.verification_expires_at',
    'column.rsvp_invitation_links.is_courtesy',
    'column.rsvp_invitation_links.skip_verification',
] as const

export type PendingStatesSemanticCheckName = typeof PENDING_STATES_SEMANTIC_CHECK_NAMES[number]
export type PendingStatesSemanticState = Record<PendingStatesSemanticCheckName, boolean>

export function pendingStatesSemanticStateFromRows(
    rows: ReadonlyArray<Record<string, unknown>>,
): PendingStatesSemanticState {
    const state = Object.fromEntries(
        PENDING_STATES_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as PendingStatesSemanticState
    const seen = new Set<PendingStatesSemanticCheckName>()

    for (const row of rows) {
        if (
            typeof row.check_name !== 'string'
            || !PENDING_STATES_SEMANTIC_CHECK_NAMES.includes(
                row.check_name as PendingStatesSemanticCheckName,
            )
            || seen.has(row.check_name as PendingStatesSemanticCheckName)
        ) continue

        const name = row.check_name as PendingStatesSemanticCheckName
        seen.add(name)
        state[name] = row.valid === true
    }

    return state
}

export function invalidPendingStatesSemantics(state: PendingStatesSemanticState): string[] {
    return PENDING_STATES_SEMANTIC_CHECK_NAMES.filter(name => state[name] !== true)
}

/**
 * ISSUE-005 (EPIC-002): the seven columns migration 0009 adds across events,
 * rsvps and rsvp_invitation_links (TTL, verification token/hash, and the
 * per-link courtesy/skip-verification flags from PLAN-EPICS-002-005.md §2.1).
 * The capacity trigger/function body itself is verified above, inside
 * HISTORICAL_SEMANTICS_QUERY's function.enforce_event_capacity check, which
 * accepts either the pre-0009 or the 0009 body.
 */
export const PENDING_STATES_SEMANTICS_QUERY = String.raw`
WITH email_verification_enabled_check AS (
    SELECT
        'column.events.email_verification_enabled'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'boolean'
            AND is_nullable = 'NO'
            AND column_default IN ('false', 'false::boolean')
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'email_verification_enabled'
), pending_expires_at_check AS (
    SELECT
        'column.rsvps.pending_expires_at'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'timestamp without time zone'
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'pending_expires_at'
), verified_at_check AS (
    SELECT
        'column.rsvps.verified_at'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'timestamp without time zone'
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'verified_at'
), verification_token_hash_check AS (
    SELECT
        'column.rsvps.verification_token_hash'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'character varying'
            AND character_maximum_length = 64
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'verification_token_hash'
), verification_expires_at_check AS (
    SELECT
        'column.rsvps.verification_expires_at'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'timestamp without time zone'
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'verification_expires_at'
), is_courtesy_check AS (
    SELECT
        'column.rsvp_invitation_links.is_courtesy'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'boolean'
            AND is_nullable = 'NO'
            AND column_default IN ('true', 'true::boolean')
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvp_invitation_links' AND column_name = 'is_courtesy'
), skip_verification_check AS (
    SELECT
        'column.rsvp_invitation_links.skip_verification'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'boolean'
            AND is_nullable = 'NO'
            AND column_default IN ('true', 'true::boolean')
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvp_invitation_links' AND column_name = 'skip_verification'
)
SELECT check_name, valid FROM email_verification_enabled_check
UNION ALL SELECT check_name, valid FROM pending_expires_at_check
UNION ALL SELECT check_name, valid FROM verified_at_check
UNION ALL SELECT check_name, valid FROM verification_token_hash_check
UNION ALL SELECT check_name, valid FROM verification_expires_at_check
UNION ALL SELECT check_name, valid FROM is_courtesy_check
UNION ALL SELECT check_name, valid FROM skip_verification_check
ORDER BY check_name`

export const CHECKIN_SEMANTIC_CHECK_NAMES = [
    'column.events.checkin_enabled',
    'column.events.checkin_password_hash',
    'column.events.checkin_password_updated_at',
    'column.rsvps.checked_in_at',
    'column.rsvps.plus_one_checked_in_at',
    'column.rsvps.checked_in_by',
    'column.rsvps.checkin_note',
] as const

export type CheckinSemanticCheckName = typeof CHECKIN_SEMANTIC_CHECK_NAMES[number]
export type CheckinSemanticState = Record<CheckinSemanticCheckName, boolean>

export function checkinSemanticStateFromRows(
    rows: ReadonlyArray<Record<string, unknown>>,
): CheckinSemanticState {
    const state = Object.fromEntries(
        CHECKIN_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as CheckinSemanticState
    const seen = new Set<CheckinSemanticCheckName>()

    for (const row of rows) {
        if (
            typeof row.check_name !== 'string'
            || !CHECKIN_SEMANTIC_CHECK_NAMES.includes(
                row.check_name as CheckinSemanticCheckName,
            )
            || seen.has(row.check_name as CheckinSemanticCheckName)
        ) continue

        const name = row.check_name as CheckinSemanticCheckName
        seen.add(name)
        state[name] = row.valid === true
    }

    return state
}

export function invalidCheckinSemantics(state: CheckinSemanticState): string[] {
    return CHECKIN_SEMANTIC_CHECK_NAMES.filter(name => state[name] !== true)
}

/**
 * ISSUE-015 (EPIC-005): the seven columns migration 0011 adds across events
 * and rsvps for the check-in portal (password gate + arrival marks) — same
 * flat-column shape as PENDING_STATES_SEMANTICS_QUERY (0009), no new table.
 */
export const CHECKIN_SEMANTICS_QUERY = String.raw`
WITH checkin_enabled_check AS (
    SELECT
        'column.events.checkin_enabled'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'boolean'
            AND is_nullable = 'NO'
            AND column_default IN ('false', 'false::boolean')
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'checkin_enabled'
), checkin_password_hash_check AS (
    SELECT
        'column.events.checkin_password_hash'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'text'
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'checkin_password_hash'
), checkin_password_updated_at_check AS (
    SELECT
        'column.events.checkin_password_updated_at'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'timestamp without time zone'
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'checkin_password_updated_at'
), checked_in_at_check AS (
    SELECT
        'column.rsvps.checked_in_at'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'timestamp without time zone'
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'checked_in_at'
), plus_one_checked_in_at_check AS (
    SELECT
        'column.rsvps.plus_one_checked_in_at'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'timestamp without time zone'
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'plus_one_checked_in_at'
), checked_in_by_check AS (
    SELECT
        'column.rsvps.checked_in_by'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'character varying'
            AND character_maximum_length = 120
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'checked_in_by'
), checkin_note_check AS (
    SELECT
        'column.rsvps.checkin_note'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            data_type = 'character varying'
            AND character_maximum_length = 500
            AND is_nullable = 'YES'
            AND column_default IS NULL
        ), false) AS valid
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rsvps' AND column_name = 'checkin_note'
)
SELECT check_name, valid FROM checkin_enabled_check
UNION ALL SELECT check_name, valid FROM checkin_password_hash_check
UNION ALL SELECT check_name, valid FROM checkin_password_updated_at_check
UNION ALL SELECT check_name, valid FROM checked_in_at_check
UNION ALL SELECT check_name, valid FROM plus_one_checked_in_at_check
UNION ALL SELECT check_name, valid FROM checked_in_by_check
UNION ALL SELECT check_name, valid FROM checkin_note_check
ORDER BY check_name`

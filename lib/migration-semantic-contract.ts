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
            AND ${CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL} = '${EXPECTED_CAPACITY_FUNCTION_BODY_HASH}'
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

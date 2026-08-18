export const RSVP_INVITATION_SEMANTIC_CHECK_NAMES = [
    'table.rsvp_invitation_links.columns',
    'constraint.rsvp_invitation_links_pkey',
    'constraint.rsvp_invitation_links_event_fk',
    'constraint.rsvp_invitation_links_used_rsvp_fk',
    'index.rsvp_invitation_links_event_id_idx',
    'index.rsvp_invitation_links_token_hash_unique',
] as const

export type RsvpInvitationSemanticCheckName = typeof RSVP_INVITATION_SEMANTIC_CHECK_NAMES[number]
export type RsvpInvitationSemanticState = Record<RsvpInvitationSemanticCheckName, boolean>

export function rsvpInvitationSemanticStateFromRows(
    rows: ReadonlyArray<Record<string, unknown>>,
): RsvpInvitationSemanticState {
    const state = Object.fromEntries(
        RSVP_INVITATION_SEMANTIC_CHECK_NAMES.map(name => [name, false]),
    ) as RsvpInvitationSemanticState
    const seen = new Set<RsvpInvitationSemanticCheckName>()

    for (const row of rows) {
        if (
            typeof row.check_name !== 'string'
            || !RSVP_INVITATION_SEMANTIC_CHECK_NAMES.includes(
                row.check_name as RsvpInvitationSemanticCheckName,
            )
            || seen.has(row.check_name as RsvpInvitationSemanticCheckName)
        ) continue

        const name = row.check_name as RsvpInvitationSemanticCheckName
        seen.add(name)
        state[name] = row.valid === true
    }

    return state
}

export function invalidRsvpInvitationSemantics(state: RsvpInvitationSemanticState): string[] {
    return RSVP_INVITATION_SEMANTIC_CHECK_NAMES.filter(name => state[name] !== true)
}

/**
 * Verifies the exact 0008 base table, FK actions and index semantics that make
 * the one-time capability safe. The only accepted additive shape is the pair
 * of invitation flags introduced together by 0009; partial or unknown extra
 * columns still fail closed. Same-named objects on another table do not pass.
 */
export const RSVP_INVITATION_SEMANTICS_QUERY = String.raw`
WITH expected_columns(column_name, data_type, udt_name, nullable, max_length, has_now_default) AS (
    VALUES
        ('id', 'text', 'text', 'NO', NULL::int, false),
        ('event_id', 'text', 'text', 'NO', NULL::int, false),
        ('token_hash', 'character varying', 'varchar', 'NO', 64, false),
        ('expires_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::int, false),
        ('used_at', 'timestamp with time zone', 'timestamptz', 'YES', NULL::int, false),
        ('used_rsvp_id', 'text', 'text', 'YES', NULL::int, false),
        ('revoked_at', 'timestamp with time zone', 'timestamptz', 'YES', NULL::int, false),
        ('revoked_by', 'text', 'text', 'YES', NULL::int, false),
        ('created_by', 'text', 'text', 'NO', NULL::int, false),
        ('created_at', 'timestamp with time zone', 'timestamptz', 'NO', NULL::int, true)
),
column_check AS (
    SELECT
        'table.rsvp_invitation_links.columns'::text AS check_name,
        count(actual.column_name) = 10
        AND (SELECT count(*) FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'rsvp_invitation_links') IN (10, 12)
        AND (SELECT count(*) FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'rsvp_invitation_links'
               AND column_name IN ('is_courtesy', 'skip_verification')) IN (0, 2)
        AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'rsvp_invitation_links'
              AND column_name NOT IN (
                  'id', 'event_id', 'token_hash', 'expires_at', 'used_at',
                  'used_rsvp_id', 'revoked_at', 'revoked_by', 'created_by',
                  'created_at', 'is_courtesy', 'skip_verification'
              )
        )
        AND coalesce(bool_and(
            actual.data_type = expected.data_type
            AND actual.udt_name = expected.udt_name
            AND actual.is_nullable = expected.nullable
            AND actual.character_maximum_length IS NOT DISTINCT FROM expected.max_length
            AND (
                (NOT expected.has_now_default AND actual.column_default IS NULL)
                OR (expected.has_now_default AND actual.column_default IN ('now()', 'CURRENT_TIMESTAMP'))
            )
        ), false) AS valid
    FROM expected_columns expected
    LEFT JOIN information_schema.columns actual
      ON actual.table_schema = 'public'
     AND actual.table_name = 'rsvp_invitation_links'
     AND actual.column_name = expected.column_name
),
pkey_check AS (
    SELECT
        'constraint.rsvp_invitation_links_pkey'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            conrelid = to_regclass('public.rsvp_invitation_links')
            AND contype = 'p'
            AND conkey = ARRAY[
                (SELECT attnum FROM pg_attribute
                 WHERE attrelid = to_regclass('public.rsvp_invitation_links') AND attname = 'id')
            ]::smallint[]
            AND convalidated
        ), false) AS valid
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public')
      AND conname = 'rsvp_invitation_links_pkey'
),
fk_check AS (
    SELECT
        'constraint.rsvp_invitation_links_event_fk'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            conrelid = to_regclass('public.rsvp_invitation_links')
            AND confrelid = to_regclass('public.events')
            AND contype = 'f'
            AND confupdtype = 'c'
            AND confdeltype = 'c'
            AND convalidated
            AND ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = conrelid AND attnum = ANY(conkey)) = ARRAY['event_id']::name[]
            AND ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = confrelid AND attnum = ANY(confkey)) = ARRAY['slug']::name[]
        ), false) AS valid
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public')
      AND conname = 'rsvp_invitation_links_event_id_events_slug_fk'
),
used_rsvp_fk_check AS (
    SELECT
        'constraint.rsvp_invitation_links_used_rsvp_fk'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            conrelid = to_regclass('public.rsvp_invitation_links')
            AND confrelid = to_regclass('public.rsvps')
            AND contype = 'f'
            AND confdeltype = 'n'
            AND convalidated
            AND ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = conrelid AND attnum = ANY(conkey)) = ARRAY['used_rsvp_id']::name[]
            AND ARRAY(SELECT attname FROM pg_attribute WHERE attrelid = confrelid AND attnum = ANY(confkey)) = ARRAY['id']::name[]
        ), false) AS valid
    FROM pg_constraint
    WHERE connamespace = to_regnamespace('public')
      AND conname = 'rsvp_invitation_links_used_rsvp_id_rsvps_id_fk'
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
          'rsvp_invitation_links_event_id_idx',
          'rsvp_invitation_links_token_hash_unique'
      )
),
event_index_check AS (
    SELECT
        'index.rsvp_invitation_links_event_id_idx'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            table_oid = to_regclass('public.rsvp_invitation_links')
            AND NOT indisunique AND indisvalid AND indisready AND indislive
            AND indpred IS NULL AND indnkeyatts = 1 AND indnatts = 1
            AND definition = 'create index rsvp_invitation_links_event_id_idx on rsvp_invitation_links using btree (event_id)'
        ), false) AS valid
    FROM index_objects
    WHERE relname = 'rsvp_invitation_links_event_id_idx'
),
token_index_check AS (
    SELECT
        'index.rsvp_invitation_links_token_hash_unique'::text AS check_name,
        count(*) = 1
        AND coalesce(bool_and(
            table_oid = to_regclass('public.rsvp_invitation_links')
            AND indisunique AND indisvalid AND indisready AND indislive
            AND indpred IS NULL AND indnkeyatts = 1 AND indnatts = 1
            AND definition = 'create unique index rsvp_invitation_links_token_hash_unique on rsvp_invitation_links using btree (token_hash)'
        ), false) AS valid
    FROM index_objects
    WHERE relname = 'rsvp_invitation_links_token_hash_unique'
)
SELECT check_name, valid FROM column_check
UNION ALL SELECT check_name, valid FROM pkey_check
UNION ALL SELECT check_name, valid FROM fk_check
UNION ALL SELECT check_name, valid FROM used_rsvp_fk_check
UNION ALL SELECT check_name, valid FROM event_index_check
UNION ALL SELECT check_name, valid FROM token_index_check
ORDER BY check_name`

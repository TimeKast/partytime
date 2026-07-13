#!/usr/bin/env bash

# Disposable PostgreSQL regression for the capacity-function semantic gates.
# This script creates its own trust-authenticated cluster under /tmp and never
# reads project environment files or connects to an existing database.

set -euo pipefail

# PostgreSQL 16 on macOS can become multithreaded during startup before locale
# initialization completes. Pinning the disposable cluster to C avoids that
# host-specific startup failure and keeps the test deterministic.
export LC_ALL=C
export LANG=C

for command in initdb pg_ctl createdb psql node python3; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "missing required command: $command" >&2
        exit 2
    fi
done

PORT="${PARTYTIME_PG_TEST_PORT:-$(python3 - <<'PY'
import socket
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    print(listener.getsockname()[1])
PY
)}"
ROOT="$(mktemp -d /tmp/pt-cap.XXXXXX)"
PGDATA="$ROOT/data"
PGSOCKET="$ROOT/socket"
DATABASE_NAME=partytime_capacity_semantics
DATABASE_URL="postgresql://postgres@127.0.0.1:${PORT}/${DATABASE_NAME}"

cleanup() {
    if [[ -f "$PGDATA/postmaster.pid" ]]; then
        pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
    fi
    rm -rf "$ROOT"
}
trap cleanup EXIT

mkdir -p "$PGSOCKET"
initdb -D "$PGDATA" -U postgres -A trust --no-locale --encoding=UTF8 \
    > "$ROOT/initdb.log"
if ! pg_ctl -D "$PGDATA" \
    -o "-F -h 127.0.0.1 -p $PORT -k $PGSOCKET" \
    -l "$ROOT/postgres.log" start; then
    echo 'PostgreSQL startup log:' >&2
    test -f "$ROOT/postgres.log" && cat "$ROOT/postgres.log" >&2
    exit 1
fi
createdb -h 127.0.0.1 -p "$PORT" -U postgres "$DATABASE_NAME"

for migration in \
    drizzle/0000_add_og_image_url.sql \
    drizzle/0001_add_rsvp_closed.sql \
    drizzle/0002_enforce_event_capacity.sql \
    drizzle/0003_rsvps_event_fk.sql \
    drizzle/0004_schema_foundation.sql; do
    psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$migration" >/dev/null
done

BASELINE_FUNCTION_QUERY="$(node --import tsx <<'NODE'
const {
    CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL,
    EXPECTED_CAPACITY_FUNCTION_BODY_HASH,
} = require('./lib/migration-semantic-contract.ts')

process.stdout.write(`
SELECT count(*) = 1 AND coalesce(bool_and(
  pg_get_function_identity_arguments(p.oid) = ''
  AND pg_get_function_result(p.oid) = 'trigger'
  AND p.prorettype = 'trigger'::regtype AND p.prokind = 'f'
  AND l.lanname = 'plpgsql' AND p.provolatile = 'v' AND NOT p.prosecdef
  AND ${CAPACITY_FUNCTION_BODY_FINGERPRINT_SQL} = '${EXPECTED_CAPACITY_FUNCTION_BODY_HASH}'
), false)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public' AND p.proname = 'enforce_event_capacity'
`)
NODE
)"

assert_preflight_function() {
    local expected="$1"
    local expected_classification="$2"
    local output status

    set +e
    output="$(
        DATABASE_URL="$DATABASE_URL" DB_PREFLIGHT_DRIVER=psql \
            node --import tsx scripts/migration-preflight.ts --json
    )"
    status=$?
    set -e

    if [[ "$status" -ne 1 ]]; then
        echo "preflight returned $status; expected the unregistered-schema exit 1" >&2
        exit 1
    fi
    printf '%s' "$output" | node -e '
const expected = process.argv[1] === "true"
const expectedClassification = process.argv[2]
let input = ""
process.stdin.on("data", chunk => { input += chunk })
process.stdin.on("end", () => {
    const result = JSON.parse(input)
    const actual = result.objects.historicalSemantics["function.enforce_event_capacity"]
    if (actual !== expected || result.classification !== expectedClassification) {
        console.error(JSON.stringify({ actual, classification: result.classification }))
        process.exit(1)
    }
})
' "$expected" "$expected_classification"
}

assert_verify_function() {
    local expected_icon="$1"
    local output status

    set +e
    output="$(
        DATABASE_URL="$DATABASE_URL" DB_VERIFY_DRIVER=psql \
            node --import tsx scripts/verify-db-contract.ts
    )"
    status=$?
    set -e

    # The foundation branch has no 0005 checks yet and may return 0; the feature
    # branch returns 1 while 0005 is intentionally absent. In both stages the
    # capacity line itself is the assertion under test.
    if [[ "$status" -ne 0 && "$status" -ne 1 ]]; then
        echo "verify:db returned unexpected status $status" >&2
        exit 1
    fi
    if [[ "$output" != *"$expected_icon historical semantic contract: function.enforce_event_capacity"* ]]; then
        echo "$output" >&2
        exit 1
    fi
}

assert_baseline_function() {
    local expected="$1"
    local actual
    actual="$(psql -X -A -t -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "$BASELINE_FUNCTION_QUERY")"
    if [[ "$actual" != "$expected" ]]; then
        echo "baseline semantic query returned $actual; expected $expected" >&2
        exit 1
    fi
}

assert_preflight_function true unregistered-historical-schema
assert_verify_function '✅'
assert_baseline_function t

node -e '
const { readFileSync } = require("node:fs")
const sql = readFileSync("drizzle/0002_enforce_event_capacity.sql", "utf8")
const mutated = sql.replace("NEW.status = '\''confirmed'\''", "NEW.status = '\''CONFIRMED'\''")
if (mutated === sql) process.exit(1)
process.stdout.write(mutated)
' \
    | psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" >/dev/null

assert_preflight_function false unregistered-inconsistent-schema
assert_verify_function '❌'
assert_baseline_function f

psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" \
    -f drizzle/0002_enforce_event_capacity.sql >/dev/null

assert_preflight_function true unregistered-historical-schema
assert_verify_function '✅'
assert_baseline_function t

echo 'capacity function semantic regression: PASS'

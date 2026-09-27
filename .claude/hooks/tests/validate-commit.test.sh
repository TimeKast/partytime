#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TimeKast Factory — Test harness for validate-commit.sh
#
# Integration-style bash tests. Feeds crafted PreToolUse JSON payloads into
# the hook and asserts the expected exit code. Fixtures are isolated in
# ./fixtures/docs/backlog/test/ (BACKLOG_ROOT override) — tests do NOT depend
# on the real project backlog.
#
# Usage:
#   bash .claude/hooks/tests/validate-commit.test.sh
#
# Exit codes:
#   0 → all tests passed
#   1 → one or more tests failed
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HERE/../validate-commit.sh"
FIXTURES="$HERE/fixtures"

if [ ! -x "$HOOK" ]; then
  echo "❌ Hook not executable: $HOOK" >&2
  exit 1
fi

PASS=0
FAIL=0
FAILED_CASES=()

# Run one test case.
#   $1 → human-readable name
#   $2 → expected exit code (0 or 2)
#   $3 → the bash command that the agent would run (string)
# stdout/stderr of the hook are captured and shown on failure.
run_case() {
  local name="$1"
  local expected="$2"
  local command="$3"

  # Build the PreToolUse JSON payload the hook expects on stdin
  local payload
  payload=$(jq -n --arg cmd "$command" '{tool_input: {command: $cmd}}')

  local out
  local rc
  out=$(cd "$FIXTURES" && BACKLOG_ROOT="docs/backlog" bash "$HOOK" <<<"$payload" 2>&1)
  rc=$?

  if [ "$rc" -eq "$expected" ]; then
    printf "  ✅ %s (exit %d)\n" "$name" "$rc"
    PASS=$((PASS + 1))
  else
    printf "  ❌ %s (expected %d, got %d)\n" "$name" "$expected" "$rc"
    printf "     --- hook output ---\n%s\n     -------------------\n" "$out"
    FAIL=$((FAIL + 1))
    FAILED_CASES+=("$name")
  fi
}

echo "▶ Running validate-commit.sh test matrix"
echo "  Fixtures root: $FIXTURES/docs/backlog/test/"
echo

# ─── Case 1: non-commit command → bypass ─────────────────────────────────────
run_case "non-commit command bypasses" 0 \
  "git status"

# ─── Case 2: commit without Closes → bypass (WIP/chore/docs) ────────────────
run_case "commit without Closes bypasses" 0 \
  "git commit -m 'chore(hooks): wip checkpoint'"

# ─── Case 3: commit with Refs only → bypass ─────────────────────────────────
run_case "commit with Refs-only bypasses" 0 \
  "$(cat <<'EOF'
git commit -m "feat(scope): title" -m "body

Refs: TEST-003"
EOF
)"

# ─── Case 4: Closes unknown ID → allow (external ref / typo tolerant) ───────
run_case "Closes unknown ID passes (no fixture)" 0 \
  "$(cat <<'EOF'
git commit -m "feat(scope): title" -m "body

Closes: TEST-999"
EOF
)"

# ─── Case 5: Closes TEST-001 (done + evidence + ✅) → pass ──────────────────
run_case "Closes TEST-001 (happy path) passes" 0 \
  "$(cat <<'EOF'
git commit -m "feat(scope): title" -m "body

Closes: TEST-001"
EOF
)"

# ─── Case 6: Closes TEST-002 (no Evidence) → block ──────────────────────────
run_case "Closes TEST-002 (no Evidence) blocks" 2 \
  "$(cat <<'EOF'
git commit -m "feat(scope): title" -m "body

Closes: TEST-002"
EOF
)"

# ─── Case 7: Closes TEST-003 (not ✅ in epic) → block ───────────────────────
run_case "Closes TEST-003 (not ✅ in epic) blocks" 2 \
  "$(cat <<'EOF'
git commit -m "feat(scope): title" -m "body

Closes: TEST-003"
EOF
)"

# ─── Case 8: Closes multiple all-ok → pass ──────────────────────────────────
run_case "Closes TEST-001, TEST-004 passes" 0 \
  "$(cat <<'EOF'
git commit -m "feat(scope): title" -m "body

Closes: TEST-001, TEST-004"
EOF
)"

# ─── Case 9: Closes multiple, one bad → block ───────────────────────────────
run_case "Closes TEST-001, TEST-002 blocks (TEST-002 bad)" 2 \
  "$(cat <<'EOF'
git commit -m "feat(scope): title" -m "body

Closes: TEST-001, TEST-002"
EOF
)"

# ─── Case 10: lowercase "closes: test-001" → normalize + pass ──────────────
run_case "lowercase closes: test-001 passes" 0 \
  "$(cat <<'EOF'
git commit -m "feat(scope): title" -m "body

closes: test-001"
EOF
)"

# ─── Case 11: bare ID in subject (no keyword) → bypass ──────────────────────
run_case "bare TEST-003 in subject without keyword bypasses" 0 \
  "git commit -m 'feat(scope): TEST-003 something'"

# ─── Case 12: HEREDOC-style multi-line with Closes → pass ───────────────────
run_case "HEREDOC commit with Closes: TEST-001 passes" 0 \
  "$(cat <<'OUTER'
git commit -m "$(cat <<'EOF'
feat(scope): HEREDOC subject

Detail line.

Closes: TEST-001
EOF
)"
OUTER
)"

# ─── Case 13: multi-add chain with Closes → validate (regex +) ─────────────
run_case "multi-add chain 'git add a && git add b && git commit' validates" 2 \
  "$(cat <<'EOF'
git add foo && git add bar && git commit -m "feat(scope): title" -m "body

Closes: TEST-002"
EOF
)"

echo
echo "─────────────────────────────────────────────"
printf "  Passed: %d    Failed: %d\n" "$PASS" "$FAIL"
echo "─────────────────────────────────────────────"

if [ "$FAIL" -gt 0 ]; then
  echo
  echo "Failed cases:"
  for c in "${FAILED_CASES[@]}"; do
    echo "  - $c"
  done
  exit 1
fi

exit 0

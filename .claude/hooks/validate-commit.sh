#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# TimeKast Factory — Pre-commit validation hook for Claude Code
#
# PreToolUse hook on Bash — validates ONLY commits that Claude Code runs via
# the Bash tool. Manual dev commits pass through .husky/pre-commit, not here.
#
# Convention (see .claude/rules/GIT.md §3):
#   - Closes: <ID>[, <ID>...]  → commit closes the issue(s); hook validates
#     Implementation Evidence + ✅ mark in epic for each.
#   - Refs: <ID>               → contextual reference only; hook bypasses.
#   - No keyword               → bypass (WIP/chore/docs commits).
#
# Exit codes:
#   0  → allow commit
#   2  → block commit with message to agent (CC convention)
#
# Fixture mode (testing only):
#   BACKLOG_ROOT env var overrides the search root (default: project/backlog).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BACKLOG_ROOT="${BACKLOG_ROOT:-project/backlog}"

# Read hook input from stdin
input=$(cat)

# Extract the full bash command
cmd=$(echo "$input" | jq -r '.tool_input.command // ""')

# Only intercept git commit commands
if ! echo "$cmd" | grep -qE "\bgit ((add [^&]*&& *)+)?commit\b"; then
  exit 0
fi

# ─── Extract Closes: lines from the commit message ───────────────────────────
# The commit message (whether via -m "body" or HEREDOC) lives inside $cmd.
# We match lines that start with optional whitespace + "Closes:" (case-insensitive).
CLOSES_LINES=$(echo "$cmd" | grep -iE '^[[:space:]]*Closes:[[:space:]]*[A-Za-z]+-[0-9]+' || true)

if [ -z "$CLOSES_LINES" ]; then
  # No "Closes:" keyword → bypass (Refs-only, WIP, chore, docs, etc.)
  exit 0
fi

# ─── Compound IDs first ──────────────────────────────────────────────────────
# A compound ID ("EPIC-04-DRIFT-002") carries its owning epic AND the issue in
# one token. We extract these FIRST and resolve each to its file by the exact
# compound prefix — this is the disambiguation: "DRIFT-002" alone may collide
# across milestones (v6.0/DRIFT-002 vs v10.0/EPIC-04-DRIFT-002), but the full
# compound "EPIC-04-DRIFT-002" matches exactly one file. We then strip the
# compound's inner shortform token (DRIFT-002) from the shortform set so it is
# NOT re-processed as an ambiguous shortform.
COMPOUND_IDS=$( { echo "$CLOSES_LINES" \
  | grep -oE 'EPIC-[0-9]+-[A-Za-z]+-[0-9]+' \
  | tr '[:lower:]' '[:upper:]' \
  | sort -u; } || true )

# Inner shortform tokens carried by the compounds (e.g. "DRIFT-002" from
# "EPIC-04-DRIFT-002"), so we can subtract them from the shortform set below.
COMPOUND_INNER_IDS=$( { printf '%s\n' "$COMPOUND_IDS" \
  | grep -oE '[A-Za-z]+-[0-9]+$'; } || true )

# Extract all PREFIX-NNN tokens from the Closes: line(s). Using grep -oE means
# we don't have to pre-trim shell-quoting junk (trailing quotes, commas,
# parentheses) from the message; we just pull ID-shaped tokens directly.
# Then subtract: tokens already covered by a compound (the leading EPIC-NN of a
# compound and the trailing shortform) must not be re-validated standalone.
ALL_TOKENS=$( { echo "$CLOSES_LINES" \
  | grep -oE '[A-Za-z]+-[0-9]+' \
  | tr '[:lower:]' '[:upper:]' \
  | sort -u; } || true )

# Tokens consumed by compounds: every EPIC-NN-DOMAIN-NNN contributes its leading
# "EPIC-NN" and its trailing "DOMAIN-NNN" as standalone tokens of ALL_TOKENS.
CONSUMED_TOKENS=$( {
  printf '%s\n' "$COMPOUND_IDS" | grep -oE '^EPIC-[0-9]+'
  printf '%s\n' "$COMPOUND_INNER_IDS"
} | sort -u || true )

if [ -n "$CONSUMED_TOKENS" ]; then
  SHORTFORM_IDS=$(comm -23 <(printf '%s\n' "$ALL_TOKENS" | grep -v '^$' | sort -u) \
                           <(printf '%s\n' "$CONSUMED_TOKENS" | grep -v '^$' | sort -u) || true)
else
  SHORTFORM_IDS="$ALL_TOKENS"
fi

if [ -z "$COMPOUND_IDS" ] && [ -z "$SHORTFORM_IDS" ]; then
  # "Closes:" keyword present but no parseable IDs → bypass defensively
  exit 0
fi

# ─── Per-issue validation ─────────────────────────────────────────────────────
# Validates a single (display_id, issue_file) pair. The issue file is already
# resolved by the caller — by exact compound prefix (compound loop) or by token
# match (shortform loop). This function NEVER re-discovers the file; it only runs
# the two content checks (Evidence section + epic ✅ mark). Exits 2 on a block.
#   $1 = ISSUE_ID  (the short token used in messages, e.g. DRIFT-002)
#   $2 = ISSUE_FILE (path to the resolved issue file)
validate_issue() {
  local ISSUE_ID="$1"
  local ISSUE_FILE="$2"

  # Check 1: Implementation Evidence section present
  if ! grep -qF "Implementation Evidence" "$ISSUE_FILE"; then
    echo "🔴 BLOCKED: ${ISSUE_ID} is missing 'Implementation Evidence' section." >&2
    echo "" >&2
    echo "File: $ISSUE_FILE" >&2
    echo "Fix:  Add the Evidence section per tk-implement SKILL.md §9 (B1) before committing." >&2
    echo "" >&2
    echo "Tip:  If this commit references the issue without closing it, use" >&2
    echo "      'Refs: ${ISSUE_ID}' in the footer instead of 'Closes:'." >&2
    exit 2
  fi

  # Check 2: Epic marks issue as ✅.
  # Resolve the owning epic by the ISSUE_FILE's filename prefix, NOT by grepping
  # every epic for the ID. Convention (tk-backlog §3.1): compound issue filenames
  # are "EPIC-NN-{DOMAIN}-{NNN}-slug.md", so the leading "EPIC-NN-" names the
  # owning epic directly → glob "epics/EPIC-NN-*.md". This avoids the false
  # positive where the ID merely appears in another epic's prose.
  local ISSUE_BASENAME EPIC_PREFIX EPIC_FILE
  ISSUE_BASENAME=$(basename "$ISSUE_FILE")
  EPIC_PREFIX=$(printf '%s\n' "$ISSUE_BASENAME" | grep -oE '^EPIC-[0-9]+' || true)
  EPIC_FILE=""

  if [ -n "$EPIC_PREFIX" ]; then
    # Compound filename → derive the epic by glob on the same milestone dir.
    # Accept both the slug form "EPIC-NN-slug.md" (convention v6.4.0+) and the
    # bare form "EPIC-NN.md" — the prefix is the resolution key either way.
    local ISSUE_DIR EPICS_DIR
    ISSUE_DIR=$(dirname "$ISSUE_FILE")          # .../<milestone>/issues
    EPICS_DIR="$(dirname "$ISSUE_DIR")/epics"   # .../<milestone>/epics
    EPIC_FILE=$(find "$EPICS_DIR" -maxdepth 1 -type f \
      \( -name "${EPIC_PREFIX}-*.md" -o -name "${EPIC_PREFIX}.md" \) 2>/dev/null | head -1 || true)

    if [ -z "$EPIC_FILE" ]; then
      # Edge: compound issue filename but the sibling epic glob is empty
      # (epic renamed/missing). Fall back to grep so we don't silently pass;
      # if grep also finds nothing, the epic check is skipped (no false block).
      echo "⚠️  ${ISSUE_ID}: epic '${EPIC_PREFIX}-*.md' not found next to issue; falling back to grep." >&2
      EPIC_FILE=$(grep -lE "(^|[^A-Za-z0-9])${ISSUE_ID}([^0-9]|$)" "$BACKLOG_ROOT"/*/epics/EPIC-*.md 2>/dev/null | head -1 || true)
    fi
  else
    # Legacy shortform filename (pre-v6.4.0, "{DOMAIN}-{NNN}-slug.md") carries no
    # epic prefix → fall back to the grep-based resolution, with an explicit
    # waiver log so the legacy path is visible in CI output.
    echo "⚠️  ${ISSUE_ID}: legacy shortform filename (no EPIC-NN prefix); using grep fallback for epic resolution [legacy waiver]." >&2
    EPIC_FILE=$(grep -lE "(^|[^A-Za-z0-9])${ISSUE_ID}([^0-9]|$)" "$BACKLOG_ROOT"/*/epics/EPIC-*.md 2>/dev/null | head -1 || true)
  fi

  if [ -n "$EPIC_FILE" ]; then
    # Word-boundary match to avoid false positives (e.g. FX-1 inside FX-10).
    if ! grep -qE "(^|[^A-Za-z0-9])${ISSUE_ID}([^0-9]|$).*✅|✅.*(^|[^A-Za-z0-9])${ISSUE_ID}([^0-9]|$)" "$EPIC_FILE"; then
      echo "🔴 BLOCKED: ${ISSUE_ID} is not marked ✅ in its epic." >&2
      echo "" >&2
      echo "Epic: $EPIC_FILE" >&2
      echo "Fix:  Update the epic's Issues table to mark ${ISSUE_ID} as ✅ (tk-implement SKILL.md §9 B1)." >&2
      echo "" >&2
      echo "Tip:  If this commit references the issue without closing it, use" >&2
      echo "      'Refs: ${ISSUE_ID}' in the footer instead of 'Closes:'." >&2
      exit 2
    fi
  fi
}

# ─── Validate compound IDs (exact prefix resolution) ──────────────────────────
# A compound carries its own disambiguation: resolve the issue file by the FULL
# compound token, which matches exactly one file even when the inner shortform
# (DRIFT-002) collides across milestones (v6.0/DRIFT-002 vs v10.0/EPIC-04-DRIFT-002).
for COMPOUND_ID in $COMPOUND_IDS; do
  # The closeable issue token is the trailing DOMAIN-NNN; the leading EPIC-NN
  # is the epic, not a closeable issue. Use the inner token for messages.
  INNER_ID=$(printf '%s\n' "$COMPOUND_ID" | grep -oE '[A-Za-z]+-[0-9]+$')

  ISSUE_FILES=$(find "$BACKLOG_ROOT" -type f -path "*/issues/*.md" 2>/dev/null \
    | grep -E "(/|-)${COMPOUND_ID}(-|\.md\$)" || true)

  ISSUE_FILE_COUNT=$(printf '%s\n' "$ISSUE_FILES" | grep -c . || true)

  if [ "$ISSUE_FILE_COUNT" -eq 0 ]; then
    # Compound referenced but no backlog file — allow (external ref or typo).
    echo "⚠️  ${COMPOUND_ID}: no matching issue file under ${BACKLOG_ROOT}/*/issues/" >&2
    echo "    If this is a typo, fix the commit message. Otherwise it will be" >&2
    echo "    treated as an external reference and the commit will proceed." >&2
    continue
  fi

  if [ "$ISSUE_FILE_COUNT" -gt 1 ]; then
    # A full compound should resolve uniquely; >1 means two identical compound
    # filenames exist (data error). Refuse to guess.
    echo "🔴 BLOCKED: ${COMPOUND_ID} matches ${ISSUE_FILE_COUNT} issue files (ambiguous)." >&2
    echo "" >&2
    echo "Matches:" >&2
    printf '%s\n' "$ISSUE_FILES" | sed 's/^/  - /' >&2
    exit 2
  fi

  validate_issue "$INNER_ID" "$ISSUE_FILES"
done

# ─── Validate shortform IDs ───────────────────────────────────────────────────
for ISSUE_ID in $SHORTFORM_IDS; do
  # Skip EPIC-NN tokens — those reference the epic, not a closeable issue.
  # A lone "Closes: EPIC-01" (not already consumed by a compound) is never a
  # closeable issue.
  if echo "$ISSUE_ID" | grep -qE '^EPIC-[0-9]+$'; then
    continue
  fi

  # Find issue file(s) where ISSUE_ID appears as a complete token, preceded by
  # "/" or "-" and followed by "-" or ".md". Matches both shortform filenames
  # (AUTH-030-foo.md) and compound filenames (EPIC-01-AUTH-030-foo.md) without
  # false collisions (AUTH-3 does NOT match AUTH-30, AUTH-300, etc).
  ISSUE_FILES=$(find "$BACKLOG_ROOT" -type f -path "*/issues/*.md" 2>/dev/null \
    | grep -E "(/|-)${ISSUE_ID}(-|\.md\$)" || true)

  ISSUE_FILE_COUNT=$(printf '%s\n' "$ISSUE_FILES" | grep -c . || true)

  if [ "$ISSUE_FILE_COUNT" -eq 0 ]; then
    # ID referenced but no backlog file — allow (external ref or typo).
    # Loud warning so typos are visible, but do not block: Closes: can
    # legitimately reference IDs from other repos / external trackers.
    echo "⚠️  ${ISSUE_ID}: no matching issue file under ${BACKLOG_ROOT}/*/issues/" >&2
    echo "    If this is a typo, fix the commit message. Otherwise it will be" >&2
    echo "    treated as an external reference and the commit will proceed." >&2
    continue
  fi

  if [ "$ISSUE_FILE_COUNT" -gt 1 ]; then
    # Ambiguous match — refuse to pick one. Force the author to disambiguate
    # by using the full compound ID in the commit footer. Shortform IS ambiguous
    # by design when the same DOMAIN-NNN exists in multiple milestones; the
    # compound (EPIC-NN-DOMAIN-NNN) is the disambiguation.
    echo "🔴 BLOCKED: ${ISSUE_ID} matches ${ISSUE_FILE_COUNT} issue files (ambiguous)." >&2
    echo "" >&2
    echo "Matches:" >&2
    printf '%s\n' "$ISSUE_FILES" | sed 's/^/  - /' >&2
    echo "" >&2
    echo "Fix:  Use the full compound ID in 'Closes:' to disambiguate." >&2
    echo "      Example: Closes: EPIC-NN-${ISSUE_ID}" >&2
    exit 2
  fi

  validate_issue "$ISSUE_ID" "$ISSUE_FILES"
done

# All IDs passed
exit 0

#!/usr/bin/env bash
# config-use-client-lint.sh
#
# Guardrail: fail if ANY file under `src/config/*` contains a `'use client'`
# (or "use client") directive.
#
# Why: `src/config/` is meant to hold pure data + stateless helpers (navigation,
# roles, branding, status, ...). A stray `'use client'` there is latent rot —
# current consumers are Client Components so nothing breaks, but a derived
# project importing the config from a React Server Component (RSC) hits a silent
# bundling boundary error. Keeping config server-safe lets it be imported from
# anywhere. See issue DRIFT-001 + .claude/skills/sk-crud-scaffold/SKILL.md §4 (RSC shells).
#
# ── Escape-hatch (for derived projects) ──────────────────────────────────────
# A derived project may legitimately need a client-only config file (e.g.
# `src/config/feature-flags.ts` that wires a React hook). To opt that single
# file out WITHOUT disabling the global guardrail, add the marker comment
# `config-use-client-allow` on the SAME line as the directive:
#
#     'use client'; // config-use-client-allow: <reason — why this config is client-only>
#
# The marker is intentionally explicit and per-file: it documents the decision
# inline and keeps the rest of `src/config/` server-safe. Files without the
# marker still fail the guardrail.
#
# Severity:
#   🔴 FAIL — a `src/config/*` file has `'use client'` WITHOUT the escape-hatch marker
#
# Usage: ./config-use-client-lint.sh
#   exit 0 → clean (or every offender carries the escape-hatch marker)
#   exit 1 → at least one offender without the marker

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_DIR="$ROOT_DIR/src/config"

# Marker that opts a single file out of the guardrail (must be on the directive line)
ALLOW_MARKER="config-use-client-allow"

FAIL_COUNT=0
log_fail() { echo "🔴 FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

echo "=== config-use-client-lint: scanning src/config/ ==="

# No config dir → nothing to check (don't fail on absence)
if [[ ! -d "$CONFIG_DIR" ]]; then
  echo "ℹ️  No src/config/ directory — skipping."
  echo "✅ config-use-client lint passed"
  exit 0
fi

# Match a leading 'use client' / "use client" directive (optionally indented,
# optionally with a trailing semicolon and/or comment). This is the JS/TS
# directive form — quoted string statement at the top of a module.
DIRECTIVE_RE="^[[:space:]]*['\"]use client['\"]"

while IFS= read -r -d '' config_file; do
  # Read the first directive-looking line, if any
  offending_line=$(grep -nE "$DIRECTIVE_RE" "$config_file" | head -n 1 || true)
  [[ -z "$offending_line" ]] && continue

  rel_path="${config_file#"$ROOT_DIR"/}"

  # Escape-hatch: directive line carries the allow marker → permitted
  if echo "$offending_line" | grep -q "$ALLOW_MARKER"; then
    echo "🟢 allowed: $rel_path (escape-hatch marker present)"
    continue
  fi

  log_fail "$rel_path contains a 'use client' directive."
  echo "         → src/config/ must stay server-safe (importable from RSC)."
  echo "         → Move client-only logic out of config, OR (if truly needed in a"
  echo "           derived project) add the escape-hatch on the directive line:"
  echo "           'use client'; // ${ALLOW_MARKER}: <reason>"
done < <(find "$CONFIG_DIR" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0)

echo ""
echo "=== Summary ==="
echo "🔴 FAIL: $FAIL_COUNT"

if [[ $FAIL_COUNT -gt 0 ]]; then
  exit 1
fi

echo "✅ config-use-client lint passed"
exit 0

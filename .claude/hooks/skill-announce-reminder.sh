#!/usr/bin/env bash
# PostToolUse hook — reminds the agent to announce a skill when it reads a SKILL.md.
# Enforces CC.md §1.2 (skill announcement trigger).
#
# Behavior:
#   - Reads PostToolUse JSON from stdin.
#   - Matches Read tool calls whose file_path ends in `.claude/skills/<name>/SKILL.md`.
#   - Emits a reminder on stdout (visible to the agent) naming the skill.
#   - No-op for other tools/paths. Never blocks (exit 0).
set -euo pipefail

INPUT="$(cat)"
TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')"

if [ "$TOOL_NAME" != "Read" ]; then
  exit 0
fi

FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')"

case "$FILE_PATH" in
  */.claude/skills/*/SKILL.md)
    SKILL_NAME="$(basename "$(dirname "$FILE_PATH")")"
    printf '🚨 SKILL CARGADA — anuncio obligatorio AHORA (CC.md §1.2)\n\n'
    printf 'Antes de cualquier otra acción, texto, o tool call, emite EXACTAMENTE esta línea como tu próximo output:\n\n'
    printf '    🧰 Aplicando skill `%s`\n\n' "$SKILL_NAME"
    printf 'Si cargaste varias skills en este turn, agrupa: 🧰 Skills: `a`, `b`, `c`. Esta regla NO es opcional.\n'
    ;;
esac

exit 0

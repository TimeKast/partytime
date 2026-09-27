#!/usr/bin/env bash
#
# gamma-generate.sh — generate a Gamma deck from a Markdown body via the Gamma
# Generate REST API (v1.0), then poll until the deck is ready and print its URL.
#
# Why REST (not the Gamma MCP): /proposal is a programmatic pipeline, not a
# conversation. The REST API authenticates with a static `sk-gamma-…` key via
# the `X-API-KEY` header — a token of the org rail in the secrets vault. The
# OAuth/DCR MCP connector needs a per-dev browser login and can't run headless;
# the REST path can.
#
# Uso:
#   bash scripts/tools/gamma-generate.sh <body_file> [title] [theme_id] [folder_id]
#   bash scripts/tools/gamma-generate.sh --check
#     → sólo comprueba que GAMMA_API_KEY está en la bóveda, sin llamar a Gamma:
#       sale 0 si está; si no, con el código de su falla (tabla en
#       scripts/tools/lib/rail.sh — 42 = clave ausente). No imprime el valor.
#
# Ejemplo:
#   bash scripts/tools/gamma-generate.sh project/proposals/fimubac.body.md "Propuesta FIMUBAC"
#
# Salida (stdout, una sola línea): la gammaUrl del deck generado.
# Credencial: GAMMA_API_KEY de la bóveda (proyecto rail-timekast, entorno main)
# con TU sesión de `infisical login`, vía scripts/tools/lib/rail.sh; vive sólo en
# la memoria del proceso. Una GAMMA_API_KEY exportada en la terminal se ignora
# con aviso. Si falla, sale con un código propio antes de llamar a Gamma.
# Requiere: curl + jq + infisical. La key NUNCA se imprime.
#
# Async: POST devuelve generationId; se pollea GET /generations/{id} cada 5 s
# hasta status=completed (→ gammaUrl) o failed (→ error). Cap defensivo.

set -euo pipefail

die() {
  echo "❌ gamma-generate: $1" >&2
  exit 1
}

# --- rail reader (lives beside this script, never resolved from the cwd) -------
RAIL_LIB="$(CDPATH='' cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/rail.sh"
[ -f "$RAIL_LIB" ] || die "falta ${RAIL_LIB} (lector de la bóveda del kit). Restáuralo con \`factory update\`."
RAIL_PROG="gamma-generate"
# shellcheck source=lib/rail.sh
source "$RAIL_LIB"

# --- deps ---------------------------------------------------------------------
command -v jq >/dev/null 2>&1 || die "falta 'jq'. Instala: brew install jq (macOS) / apt install jq (Linux)."

# --- --check: sólo resuelve la key (código de su falla), sin llamar a Gamma ---
if [ "${1:-}" = "--check" ]; then
  rail_require GAMMA_API_KEY GAMMA_KEY
  echo "✔ gamma-generate: GAMMA_API_KEY disponible en la bóveda." >&2
  exit 0
fi

command -v curl >/dev/null 2>&1 || die "falta 'curl'."

# --- args ---------------------------------------------------------------------
BODY_FILE="${1:-}"
TITLE="${2:-}"
THEME_ID="${3:-}"
FOLDER_ID="${4:-}"
[ -n "$BODY_FILE" ] || die "uso: gamma-generate.sh <body_file> [title] [theme_id] [folder_id]"
[ -f "$BODY_FILE" ] || die "no encontré el archivo de body: $BODY_FILE"

API_BASE="${GAMMA_API_BASE:-https://public-api.gamma.app/v1.0}"

# --- credencial: de la bóveda (fail-closed), antes de cualquier llamada a Gamma --
rail_require GAMMA_API_KEY GAMMA_KEY

# --- curl with the key: through stdin, never argv nor xtrace ------------------
# An `-H "X-API-KEY: $KEY"` argument is visible to any process on the machine
# (`ps`) and in a `bash -x` trace. curl reads `-H @-` headers from its stdin
# instead, and xtrace is off while the header line (the ONLY place the key is
# expanded) is built — then restored as it was.
gamma_curl() {
  local opts="$-" rc=0
  { set +x; } 2>/dev/null
  printf 'X-API-KEY: %s\n' "$GAMMA_KEY" | curl -H @- "$@" || rc=$?
  case "$opts" in *x*) set -x ;; esac
  return "$rc"
}

# --- body + payload -----------------------------------------------------------
INPUT_TEXT="$(cat "$BODY_FILE")"
[ -n "${INPUT_TEXT//[[:space:]]/}" ] || die "el body está vacío: $BODY_FILE"

# Construye el JSON con jq (escape seguro de inputText). Defaults pensados para
# una propuesta: presentation · condense (el MD ya trae detalle) · es · 16x9.
# Knobs opcionales por env (los pasa el caller — p.ej. tk-proposal P3):
#   GAMMA_INSTRUCTIONS    → additionalInstructions (tier-aware FR-8: restricción de stack)
#   GAMMA_NUM_CARDS       → numCards
#   GAMMA_IMAGE_STYLE     → imageOptions.style (free-text visual direction for the AI images)
#   GAMMA_HEADER_LOGO_URL → cardOptions.headerFooter.topRight (client logo)
#   GAMMA_MAKER_LOGO_URL  → cardOptions.headerFooter.topLeft (maker/TimeKast logo)
# Logo URLs must be public and long-lived: Gamma stores the image BY REFERENCE,
# so a hashed asset URL or a signed/expiring URL breaks the deck later. Upload
# them with scripts/tools/proposal-asset-upload.sh. Without these knobs the
# payload is identical to the one this tool always sent.
payload="$(jq -n \
  --arg input "$INPUT_TEXT" \
  --arg title "$TITLE" \
  --arg theme "$THEME_ID" \
  --arg folder "$FOLDER_ID" \
  --arg instr "${GAMMA_INSTRUCTIONS:-}" \
  --arg cards "${GAMMA_NUM_CARDS:-}" \
  --arg split "${GAMMA_CARD_SPLIT:-auto}" \
  --arg style "${GAMMA_IMAGE_STYLE:-}" \
  --arg logo "${GAMMA_HEADER_LOGO_URL:-}" \
  --arg maker "${GAMMA_MAKER_LOGO_URL:-}" \
  '{
     inputText: $input,
     textMode: "condense",
     format: "presentation",
     cardSplit: $split,
     textOptions: { amount: "detailed", tone: "profesional, cercano", language: "es" },
     cardOptions: ({ dimensions: "16x9" }
       + (if $logo == "" and $maker == "" then {} else { headerFooter: (
           (if $maker != "" then { topLeft:  { type: "image", source: "custom", src: $maker, size: "md" } } else {} end)
         + (if $logo  != "" then { topRight: { type: "image", source: "custom", src: $logo,  size: "md" } } else {} end)
         ) } end)),
     imageOptions: ({ source: "aiGenerated" }
       + (if $style != "" then { style: $style } else {} end))
   }
   + (if $title  != "" then { title: $title }                   else {} end)
   + (if $theme  != "" then { themeId: $theme }                 else {} end)
   + (if $folder != "" then { folderIds: [ $folder ] }          else {} end)
   + (if $instr  != "" then { additionalInstructions: $instr }  else {} end)
   + (if $cards  != "" then { numCards: ($cards | tonumber) }   else {} end)'
)"

# --- POST: crear la generación ------------------------------------------------
post_resp="$(gamma_curl -sS -X POST "${API_BASE}/generations" \
  -H "Content-Type: application/json" \
  -d "$payload")" || die "el POST a la API de Gamma falló (red)."

gen_id="$(printf '%s' "$post_resp" | jq -r '.generationId // empty')"
if [ -z "$gen_id" ]; then
  # Surfacea el error de la API sin asumir shape (401 key inválida, 403 créditos, 422 input).
  msg="$(printf '%s' "$post_resp" | jq -r '(.message // .error.message // .error // .) | tostring' 2>/dev/null || printf '%s' "$post_resp")"
  die "la API no devolvió generationId. Respuesta: ${msg}"
fi
echo "⏳ generación iniciada (id: ${gen_id}); poll cada 5 s…" >&2

# --- POLL: hasta completed / failed (cap defensivo ~3 min) --------------------
max_attempts=36
attempt=0
while :; do
  attempt=$((attempt + 1))
  if [ "$attempt" -gt "$max_attempts" ]; then
    die "timeout: la generación ${gen_id} no terminó en ~3 min (sigue async — reintenta el GET más tarde)."
  fi
  sleep 5
  status_resp="$(gamma_curl -sS -X GET "${API_BASE}/generations/${gen_id}")" || die "el GET de status falló (red)."
  status="$(printf '%s' "$status_resp" | jq -r '.status // empty')"
  case "$status" in
    completed)
      gamma_url="$(printf '%s' "$status_resp" | jq -r '.gammaUrl // empty')"
      [ -n "$gamma_url" ] || die "status=completed pero sin gammaUrl. Respuesta: $status_resp"
      credits="$(printf '%s' "$status_resp" | jq -r '.credits.deducted // empty')"
      [ -n "$credits" ] && echo "✔ deck listo (créditos usados: ${credits})." >&2
      printf '%s\n' "$gamma_url"
      exit 0
      ;;
    failed)
      err="$(printf '%s' "$status_resp" | jq -r '.error.message // .error // "sin detalle"')"
      die "la generación falló: ${err}"
      ;;
    pending | "")
      : # sigue esperando
      ;;
    *)
      echo "ℹ status inesperado: ${status} (sigo poleando)…" >&2
      ;;
  esac
done

#!/usr/bin/env bash
#
# proposal-asset-upload.sh — upload a proposal asset (a client logo, typically)
# to the org's public proposal-assets bucket and print its public URL.
#
# Why a bucket at all: Gamma stores header/footer images BY REFERENCE, so a
# deck's logo needs a public URL that never changes. A client's own site
# renames assets with a hash on every deploy, and social-network images are
# served through signed URLs that expire — both break the deck later. This
# bucket is the stable home; `gamma-generate.sh` receives the URL this prints.
#
# Uso:
#   bash scripts/tools/proposal-asset-upload.sh [--replace] <file> <slug> [name]
#   bash scripts/tools/proposal-asset-upload.sh --check
#     → sólo comprueba que PROPOSAL_ASSETS_R2_TOKEN está en la bóveda, sin subir
#       nada: sale 0 si está; si no, con el código de su falla (tabla en
#       scripts/tools/lib/rail.sh). No imprime el valor.
#
# Ejemplo:
#   bash scripts/tools/proposal-asset-upload.sh ~/Downloads/logo.png litoprocess
#   → https://assets.timekast.com/litoprocess/logo.png
#
# Key del objeto: <slug>/<name>.<ext> — `name` default `logo`. Un logo claro que
# desaparece sobre fondo blanco se sube con su placa como `logo-plate`.
# Sin --replace, un objeto ya publicado NO se pisa: los decks viejos lo siguen
# referenciando por URL, y cambiarlo cambiaría lo que el cliente ya vio.
#
# Credencial: PROPOSAL_ASSETS_R2_TOKEN de la bóveda (proyecto rail-timekast,
# entorno main) con TU sesión de `infisical login`, vía scripts/tools/lib/rail.sh;
# vive sólo en la memoria del proceso y un valor exportado en la terminal se
# ignora con aviso. Token de R2 acotado a ESTE bucket (lectura + escritura de
# objetos, sin crear ni borrar buckets). Viaja por la API S3 de R2: access key = id del
# token, secret = sha256 del valor. La key NUNCA se imprime.
# Requiere: curl ≥ 7.75 (--aws-sigv4) + jq + shasum + infisical.

set -euo pipefail

die() {
  echo "❌ proposal-asset-upload: $1" >&2
  exit 1
}

# --- rail reader (lives beside this script, never resolved from the cwd) -------
RAIL_LIB="$(CDPATH='' cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/rail.sh"
[ -f "$RAIL_LIB" ] || die "falta ${RAIL_LIB} (lector de la bóveda del kit). Restáuralo con \`factory update\`."
RAIL_PROG="proposal-asset-upload"
# shellcheck source=lib/rail.sh
source "$RAIL_LIB"

# --- deps ---------------------------------------------------------------------
command -v jq >/dev/null 2>&1 || die "falta 'jq'. Instala: brew install jq (macOS) / apt install jq (Linux)."

# --- --check: sólo resuelve el token (código de su falla), sin subir nada ------
if [ "${1:-}" = "--check" ]; then
  rail_require PROPOSAL_ASSETS_R2_TOKEN TOKEN
  echo "✔ proposal-asset-upload: PROPOSAL_ASSETS_R2_TOKEN disponible en la bóveda." >&2
  exit 0
fi

command -v curl >/dev/null 2>&1 || die "falta 'curl'."
command -v shasum >/dev/null 2>&1 || die "falta 'shasum'."
curl --help all 2>/dev/null | grep -q -- '--aws-sigv4' || die "tu curl no soporta --aws-sigv4 (requiere ≥ 7.75)."

# --- args ---------------------------------------------------------------------
REPLACE=0
if [ "${1:-}" = "--replace" ]; then
  REPLACE=1
  shift
fi
FILE="${1:-}"
SLUG="${2:-}"
NAME="${3:-logo}"
[ -n "$FILE" ] && [ -n "$SLUG" ] || die "uso: proposal-asset-upload.sh [--replace] <file> <slug> [name]"
[ -f "$FILE" ] || die "no encontré el archivo: $FILE"
[[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || die "slug inválido '$SLUG' (kebab-case: minúsculas, dígitos y guiones)."
[[ "$NAME" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || die "name inválido '$NAME' (kebab-case)."

EXT="$(printf '%s' "${FILE##*.}" | tr '[:upper:]' '[:lower:]')"
case "$EXT" in
  png) CTYPE="image/png" ;;
  jpg | jpeg) CTYPE="image/jpeg" ;;
  webp) CTYPE="image/webp" ;;
  svg) CTYPE="image/svg+xml" ;;
  *) die "extensión no soportada '.$EXT' (png, jpg, jpeg, webp, svg)." ;;
esac

# Destination — org defaults, overridable by env.
ACCOUNT_ID="${PROPOSAL_ASSETS_ACCOUNT_ID:-e8cd002ceaf4366e46d1501e9639c7b5}"
BUCKET="${PROPOSAL_ASSETS_BUCKET:-timekast-proposal-assets}"
BASE_URL="${PROPOSAL_ASSETS_BASE_URL:-https://assets.timekast.com}"
KEY="${SLUG}/${NAME}.${EXT}"
PUBLIC_URL="${BASE_URL%/}/${KEY}"

# --- credencial: de la bóveda (fail-closed), antes de cualquier petición HTTP ---
rail_require PROPOSAL_ASSETS_R2_TOKEN TOKEN

# --- curl with the credential: through stdin, never argv nor xtrace -----------
# A `-H "Authorization: Bearer $TOKEN"` or `--user id:secret` argument is
# visible to any process on the machine (`ps`) and in a `bash -x` trace. curl
# reads `-H @-` headers — or a whole config with `-K -` — from its stdin
# instead, and xtrace is off while the credential (and the S3 secret derived
# from it) is expanded — then restored as it was.
cf_curl() {
  local opts="$-" rc=0
  { set +x; } 2>/dev/null
  printf 'Authorization: Bearer %s\n' "$TOKEN" | curl -H @- "$@" || rc=$?
  case "$opts" in *x*) set -x ;; esac
  return "$rc"
}

# S3 user of the R2 API: access key = token id ($TOKEN_ID), secret = sha256 of the token.
r2_curl() {
  local opts="$-" rc=0 secret=""
  { set +x; } 2>/dev/null
  secret="$(printf '%s' "$TOKEN" | shasum -a 256 | cut -d' ' -f1)" || rc=$?
  if [ "$rc" -eq 0 ] && [ -n "$secret" ]; then
    printf 'user = "%s:%s"\n' "$TOKEN_ID" "$secret" | curl -K - "$@" || rc=$?
  else
    rc=1
  fi
  secret=""
  case "$opts" in *x*) set -x ;; esac
  return "$rc"
}

# --- no pisar un asset ya publicado (salvo --replace) --------------------------
existing="$(curl -s -o /dev/null -w '%{http_code}' -I "$PUBLIC_URL" || true)"
if [ "$existing" = "200" ] && [ "$REPLACE" -ne 1 ]; then
  die "ya existe ${PUBLIC_URL} — los decks viejos lo referencian. Usa otro [name] o --replace."
fi

# --- S3 credentials derived from the token ------------------------------------
TOKEN_ID="$(cf_curl -s \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/tokens/verify" | jq -r '.result.id // empty')"
[ -n "$TOKEN_ID" ] || die "el token no verificó contra la cuenta (¿revocado o de otra cuenta?)."

# --- PUT ----------------------------------------------------------------------
put_code="$(r2_curl -s -o /dev/null -w '%{http_code}' -X PUT \
  --aws-sigv4 "aws:amz:auto:s3" \
  -H "Content-Type: ${CTYPE}" \
  --data-binary "@${FILE}" \
  "https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${KEY}")" || die "el PUT falló (red)."
[ "$put_code" = "200" ] || die "R2 rechazó la subida (HTTP ${put_code}). Un 401 justo después de crear el token es propagación: reintenta en unos segundos."

# --- confirmar lectura pública -------------------------------------------------
get_code="$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_URL" || true)"
[ "$get_code" = "200" ] || echo "⚠ subido, pero ${PUBLIC_URL} respondió ${get_code} — revisa el dominio público del bucket." >&2

printf '%s\n' "$PUBLIC_URL"

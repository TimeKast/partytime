#!/usr/bin/env bash
# ============================================================
# TimeKast Factory — short.io URL shortener helper
# ============================================================
# Acorta una URL larga (típicamente la `gammaUrl` que devuelve el MCP de
# Gamma en `/proposal`) a `${SHORTIO_DOMAIN}/<slug>-propuesta`.
#
# Uso:
#   bash scripts/tools/shortio.sh [--update] <long_url> <project_slug> [suffix]
#
# Ejemplo:
#   bash scripts/tools/shortio.sh https://gamma.app/docs/abc123 mi-proyecto
#   → https://go.timekast.com/mi-proyecto-propuesta
#
# Modo --update (upsert) — para REGENERAR manteniendo el MISMO short link:
#   bash scripts/tools/shortio.sh --update https://gamma.app/docs/NEW mi-proyecto
#   · si el link ya existe (mismo path) → re-apunta su destino a la nueva URL
#     (el shortURL NO cambia — ideal cuando ya lo compartiste al cliente).
#   · si no existe → lo crea (igual que el modo normal, sin sufijo).
#   Sin --update, el modo normal crea y, ante conflicto de path, sufija -2..-5.
#
# Modo --check — comprueba que la key está disponible, sin llamar a short.io:
#   bash scripts/tools/shortio.sh --check
#   · sale 0 si la key está en la bóveda; si no, con el código de su falla
#     (tabla en scripts/tools/lib/rail.sh). No imprime el valor.
#
# La API key (SHORTIO_API_KEY) se lee de la bóveda de secretos de la
# organización (proyecto rail-timekast, entorno main) con TU sesión de
# `infisical login`, vía scripts/tools/lib/rail.sh. El valor vive sólo en la
# memoria de este proceso. Una SHORTIO_API_KEY exportada en la terminal se
# ignora con aviso. Si falla (sin sesión, sin acceso, clave ausente, falta
# infisical o la config de la bóveda), sale con un código propio y un mensaje
# que dice qué hacer, SIN hacer ninguna petición HTTP a short.io.
# SHORTIO_DOMAIN no es secreto: sigue leyéndose del entorno (default abajo).
#
# Salida:
#   - stdout: la URL corta (una sola línea)
#   - exit 0 en éxito, !=0 en error con mensaje a stderr
#   - la key NUNCA se imprime (ni en stdout ni en stderr)
# ============================================================
set -euo pipefail

SHORTIO_DOMAIN="${SHORTIO_DOMAIN:-go.timekast.com}"
SHORTIO_API_URL="https://api.short.io/links"

die() {
  echo "shortio: $*" >&2
  exit 1
}

# --- Rail reader (lives beside this script, never resolved from the cwd) ---
RAIL_LIB="$(CDPATH='' cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/rail.sh"
[ -f "$RAIL_LIB" ] || die "falta ${RAIL_LIB} (lector de la bóveda del kit). Restáuralo con \`factory update\`."
RAIL_PROG="shortio"
# shellcheck source=lib/rail.sh
source "$RAIL_LIB"

# --- Modo --check: sólo resuelve la key (código de su falla), sin HTTP ---
if [ "${1:-}" = "--check" ]; then
  command -v jq >/dev/null 2>&1 || die "jq no instalado. Instálalo con: brew install jq  (macOS)  ·  apt install jq  (Debian/Ubuntu)"
  rail_require SHORTIO_API_KEY SHORTIO_KEY
  echo "✔ shortio: SHORTIO_API_KEY disponible en la bóveda." >&2
  exit 0
fi

# --- Args ---
# Flag opcional --update (upsert) como PRIMER argumento.
UPDATE_MODE=0
if [ "${1:-}" = "--update" ]; then
  UPDATE_MODE=1
  shift
fi

if [ "$#" -lt 2 ]; then
  die "uso: $0 [--update] <long_url> <project_slug> [suffix=propuesta]"
fi

LONG_URL="$1"
PROJECT_SLUG="$2"
SUFFIX="${3:-propuesta}"

# --- Validate URL ---
case "$LONG_URL" in
  http://*|https://*) ;;
  *) die "long_url debe empezar con http:// o https:// (got: $LONG_URL)" ;;
esac

# --- Deps ---
# jq es prerequisito: parseamos la respuesta JSON de short.io con jq.
command -v jq >/dev/null 2>&1 || die "jq no instalado. Instálalo con: brew install jq  (macOS)  ·  apt install jq  (Debian/Ubuntu)"
command -v curl >/dev/null 2>&1 || die "curl no instalado"

# --- API key: de la bóveda (fail-closed; sin fallback a archivos ni hardcode) ---
# Antes de cualquier petición HTTP. En falla, rail_require sale con su código.
rail_require SHORTIO_API_KEY SHORTIO_KEY

# --- curl with the key: through stdin, never argv nor xtrace ---
# An `-H "Authorization: $KEY"` argument is visible to any process on the
# machine (`ps`) and in a `bash -x` trace. curl reads `-H @-` headers from its
# stdin instead, and xtrace is off while the header line (the ONLY place the
# key is expanded) is built — then restored as it was.
shortio_curl() {
  local opts="$-" rc=0
  { set +x; } 2>/dev/null
  printf 'Authorization: %s\n' "$SHORTIO_KEY" | curl -H @- "$@" || rc=$?
  case "$opts" in *x*) set -x ;; esac
  return "$rc"
}

# --- Slugify project slug (defensive: la skill debería pasarlo ya limpio) ---
slugify() {
  # ASCII kebab-lower: translit a ASCII, lowercase, no-alnum → `-`, colapsar y trim.
  local s
  s=$(printf '%s' "$1" \
      | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null || printf '%s' "$1")
  s=$(printf '%s' "$s" | tr '[:upper:]' '[:lower:]')
  s=$(printf '%s' "$s" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
  printf '%s' "$s"
}

CLEAN_SLUG="$(slugify "$PROJECT_SLUG")"
[ -n "$CLEAN_SLUG" ] || die "project_slug quedó vacío tras slugify"

CLEAN_SUFFIX="$(slugify "$SUFFIX")"
[ -n "$CLEAN_SUFFIX" ] || die "suffix quedó vacío tras slugify"

PATH_SEGMENT="${CLEAN_SLUG}-${CLEAN_SUFFIX}"

# --- Build payload ---
# allowDuplicates=false: si la path ya existe en el dominio, short.io devuelve 409;
# el primer intento usa el slug exacto y, ante conflicto, agregamos sufijo numérico.
build_payload() {
  local path="$1"
  cat <<JSON
{
  "domain": "${SHORTIO_DOMAIN}",
  "originalURL": "${LONG_URL}",
  "path": "${path}",
  "allowDuplicates": false
}
JSON
}

call_shortio() {
  local payload="$1" http_code body tmp
  tmp="$(mktemp)"
  http_code=$(shortio_curl -sS -o "$tmp" -w '%{http_code}' \
    -X POST "$SHORTIO_API_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    --data "$payload" || echo "000")
  body="$(cat "$tmp")"
  rm -f "$tmp"
  printf '%s\n%s' "$http_code" "$body"
}

extract_short_url() {
  local body="$1"
  printf '%s' "$body" | jq -r '.shortURL // empty'
}

# --- Upsert helpers (modo --update) ---
# Busca un link por path en el dominio. Echo del idString si existe (HTTP 200),
# vacío si no existe (404) o cualquier otro código. No hace writes.
find_link_idstring() {
  local path="$1" tmp code id
  tmp="$(mktemp)"
  code=$(shortio_curl -sS -o "$tmp" -w '%{http_code}' -G "${SHORTIO_API_URL}/expand" \
    --data-urlencode "domain=${SHORTIO_DOMAIN}" \
    --data-urlencode "path=${path}" \
    -H "Accept: application/json" || echo "000")
  if [ "$code" = "200" ]; then
    id="$(jq -r '.idString // empty' "$tmp")"
  else
    id=""
  fi
  rm -f "$tmp"
  printf '%s' "$id"
}

# Re-apunta un link existente (por idString) a $LONG_URL. Echo del shortURL.
# El shortURL NO cambia — es el mismo link, nuevo destino.
update_link() {
  local id="$1" tmp code body short payload
  payload="$(jq -n --arg url "$LONG_URL" '{originalURL: $url}')"
  tmp="$(mktemp)"
  code=$(shortio_curl -sS -o "$tmp" -w '%{http_code}' \
    -X POST "${SHORTIO_API_URL}/${id}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    --data "$payload" || echo "000")
  body="$(cat "$tmp")"
  rm -f "$tmp"
  case "$code" in
    200|201)
      short="$(extract_short_url "$body")"
      [ -n "$short" ] || { echo "$body" >&2; die "update 2xx pero sin shortURL"; }
      printf '%s' "$short"
      ;;
    *)
      echo "$body" >&2
      die "short.io update respondió HTTP $code"
      ;;
  esac
}

# --- Attempt with optional numeric suffix on conflict ---
attempt() {
  local path="$1"
  local response http_code body short_url
  response="$(call_shortio "$(build_payload "$path")")"
  http_code="$(printf '%s' "$response" | head -n1)"
  body="$(printf '%s' "$response" | tail -n +2)"

  case "$http_code" in
    200|201)
      short_url="$(extract_short_url "$body")"
      [ -n "$short_url" ] || { echo "$body" >&2; die "respuesta 2xx pero sin shortURL"; }
      printf '%s' "$short_url"
      return 0
      ;;
    409)
      return 9   # conflict → caller adds suffix
      ;;
    *)
      echo "$body" >&2
      die "short.io respondió HTTP $http_code"
      ;;
  esac
}

# --- Modo --update (upsert): si el path ya existe, re-apunta; si no, cae a create ---
if [ "$UPDATE_MODE" = "1" ]; then
  existing_id="$(find_link_idstring "$PATH_SEGMENT")"
  if [ -n "$existing_id" ]; then
    short="$(update_link "$existing_id")"
    [ -n "$short" ] || die "no se pudo actualizar el link existente (${PATH_SEGMENT})"
    printf '%s\n' "$short"
    exit 0
  fi
  # no existe → cae al create normal del path EXACTO (abajo); no sufija porque
  # en update queremos el path canónico, y al no existir no habrá conflicto 409.
fi

# Primer intento con el slug "limpio". Si choca (409), sufijos -2, -3, -4, -5.
short=""
if short="$(attempt "$PATH_SEGMENT")"; then
  :
else
  rc=$?
  # Si NO fue conflicto de path (409), propagar el error tal cual:
  # attempt() ya imprimió el mensaje a stderr vía die().
  [ "$rc" = "9" ] || exit "$rc"
  for i in 2 3 4 5; do
    if short="$(attempt "${PATH_SEGMENT}-${i}")"; then
      break
    fi
    rc=$?
    [ "$rc" = "9" ] || exit "$rc"
  done
fi

[ -n "$short" ] || die "no se pudo crear el short link (conflictos repetidos en ${PATH_SEGMENT})"

printf '%s\n' "$short"

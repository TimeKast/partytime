# shellcheck shell=bash
# ============================================================
# TimeKast Factory — rail reader for the bash tools (RAIL-006)
# ============================================================
# Sourced (never executed) by the /proposal and /publish scripts:
#   scripts/tools/shortio.sh · gamma-generate.sh · proposal-asset-upload.sh
#
# Reads ONE token of the org rail (`rail-timekast`, environment `main`) from the
# secrets vault with the PERSON's session (`infisical login`). Same rule as the
# CLI resolver `cli/src/lib/rail.ts`, replayed in bash because these scripts
# travel to `core` derivatives, where the CLI's source does not exist.
# Contract: `fx-secrets-vault §3`.
#
# Usage (from a script that already checked `jq` is installed):
#   RAIL_PROG="shortio"                       # prefix of the failure messages
#   source "<scripts/tools>/lib/rail.sh"
#   rail_require SHORTIO_API_KEY SHORTIO_KEY  # exits with the codes below on failure
#   # $SHORTIO_KEY now holds the value — a plain shell variable, never exported
#
# Coordinates (domain, project id, project name) come from
# `.claude/policy/vault.json`, located from THIS file's own path
# (`<scripts/tools/lib>/../../../.claude/policy/vault.json`), never from the
# cwd nor `git rev-parse`: a script run from another checkout must not pick up
# that checkout's config.
#
# ------------------------------------------------------------
# EXIT CODES — one per failure kind, exclusive, outside 1/2/126/127 so that a
# `set -e` abort, a usage error or a missing command can never be read as one
# of them. Callers (e.g. the Gamma gate of /proposal via `--check`) branch on
# the code, never on the message.
#   0   the key was found (its value is in the destination variable)
#   40  RAIL_EXIT_NO_SESSION    no session on the vault, or it expired
#   41  RAIL_EXIT_NO_ACCESS     live session without access to the rail project
#   42  RAIL_EXIT_KEY_MISSING   the read worked and the key is absent or empty.
#                               The ONLY failure a caller may treat as optional.
#   43  RAIL_EXIT_UNRECOGNIZED  anything else: unknown stderr, non-JSON output,
#                               an unexpected shape, a failing `jq`. NEVER read
#                               as "key missing" nor as "no access".
#   44  RAIL_EXIT_NOT_INSTALLED `infisical` is not on PATH
#   45  RAIL_EXIT_NO_CONFIG     `.claude/policy/vault.json` is missing or unreadable
#
# NO-ECHO:
#   · xtrace is switched off for the whole read and restored afterwards; the
#     export JSON (every token of the rail) lives in a `local` variable that is
#     never exported, and only the requested key is extracted with `jq`.
#   · the export JSON reaches `jq` through a pipe from the `printf` builtin
#     (never an argv, never a file); infisical's raw output is never forwarded.
#   · stdin of `infisical` is closed (`</dev/null`): without a session it opens
#     an interactive login and would block forever reading stdin.
#   · `INFISICAL_TOKEN` is dropped from infisical's environment: the rail is
#     read with the person's session, never with a token left in the shell.
#   · `INFISICAL_DOMAIN` is pinned to the vault's domain in infisical's
#     environment. Without a session, infisical launches a `login` child that
#     does NOT get our `--domain`: it picks the domain from INFISICAL_DOMAIN,
#     then from a `.infisical.json` found walking up from the cwd, and may open
#     a browser there before reading stdin. A planted `.infisical.json` would
#     open an attacker's login page; the pinned variable wins over it.
#   · infisical's STDERR (error text, no values) goes through a private
#     `mktemp` file that is removed right after reading it — the only file the
#     read touches. The values never touch disk.
#
# Stale copies: a rail key exported in the shell is IGNORED (the vault wins),
# named on stderr (never its value) and unset, so no child process inherits it.
# ============================================================

# bash only: everything below (`local`, `${!var}`, `printf -v`, `export -n`,
# BASH_SOURCE) is bash syntax. Sourced from zsh or sh it would half-run and
# fail in ways that read like a vault answer. Written in POSIX sh on purpose,
# so any shell can execute THIS guard and stop here with the "unrecognized"
# code (43), never a code that means something about the vault.
if [ -z "${BASH_VERSION:-}" ]; then
  printf '%s\n' '❌ rail.sh requiere bash: cárgalo desde un script de bash (los de scripts/tools lo son), no desde zsh ni sh.' >&2
  return 43 2>/dev/null || exit 43
fi

RAIL_EXIT_NO_SESSION=40
RAIL_EXIT_NO_ACCESS=41
RAIL_EXIT_KEY_MISSING=42
RAIL_EXIT_UNRECOGNIZED=43
RAIL_EXIT_NOT_INSTALLED=44
RAIL_EXIT_NO_CONFIG=45

RAIL_ENV="main"
RAIL_INSTALL_HINT="brew install infisical"

# Directory of THIS file, resolved at source time.
RAIL_LIB_DIR="$(CDPATH='' cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIL_VAULT_JSON="${RAIL_LIB_DIR}/../../../.claude/policy/vault.json"
RAIL_VAULT_JSON_NAME=".claude/policy/vault.json"

# Session / access patterns — the same ones `cli/src/lib/rail.ts` uses, as
# case-insensitive POSIX ERE (no `\b`, no lookarounds: BSD and GNU grep alike).
# A hand copy: edit BOTH together. cli/tests/unit/rail-classification-parity.test.ts
# runs one corpus of transcripts (cli/tests/fixtures/infisical-transcripts.ts)
# through this file and through the CLI resolver and fails if they disagree.
# Verified live against infisical 0.43.96 (RAIL-008): the two no-session texts
# (empty HOME) and the "project with id … not found" answer (unknown project id,
# mapped to "no access" — the message says the project may not exist). The
# other no-access texts (an EXISTING project without membership) remain ASSUMED.
# They are applied ONLY when infisical exits non-zero: an exit 0 with output
# that is not the expected JSON is "unrecognized" whatever stderr says.
RAIL_NO_SESSION_RE='no valid login session found|failed to automatically trigger login flow|login session has expired|status-code=401([^0-9]|$)'
RAIL_NO_ACCESS_RE='unable to access project|status-code=403([^0-9]|$)|permission ?denied|(^|[^a-z])forbidden([^a-z]|$)|not allowed to|do(es)? not have (access|permission)|not (a )?(part|member) of|project with id [^[:space:]]+ (was )?not found'

# jq filter shared by the presence check and the extraction: the accepted export
# shapes are an array of {key, value} strings (infisical's --format=json) or a
# flat object of strings. Anything else is an error → unrecognized.
RAIL_JQ_ENTRIES='def rail_entries:
  if type == "array" then
    (if all(.[]; type == "object" and (.key | type) == "string" and (.value | type) == "string")
     then [.[] | {key, value}] else error("unexpected shape") end)
  elif type == "object" then
    (if all(.[]; type == "string") then to_entries else error("unexpected shape") end)
  else error("unexpected shape") end;
rail_entries | map(select(.key == $k))'

rail__prog() { printf '%s' "${RAIL_PROG:-rail}"; }

rail__login_cmd() { printf 'infisical login --domain=%s' "$1"; }

# rail_read <KEY> <DEST_VAR>
#   On success assigns the value to DEST_VAR (not exported) and returns 0.
#   On failure prints ONE message to stderr and returns a RAIL_EXIT_* code.
#   Never exits: `rail_require` is the exiting variant.
rail_read() {
  # xtrace off FIRST — before anything that could expand a value is traced.
  local rail__opts="$-"
  { set +x; } 2>/dev/null
  set +e

  local rail__key="${1:-}" rail__dest="${2:-}" rail__rc=0
  local rail__domain="" rail__pid="" rail__name="" rail__cfg=""
  local rail__json="" rail__err="" rail__errf="" rail__state="" rail__val=""
  local rail__p
  rail__p="$(rail__prog)"

  if [ -z "$rail__key" ] || [ -z "$rail__dest" ]; then
    printf '❌ %s: rail_read requiere <KEY> <VAR>.\n' "$rail__p" >&2
    rail__rc=$RAIL_EXIT_UNRECOGNIZED
  fi

  # --- 1. vault coordinates (never another source) ----------------------------
  if [ "$rail__rc" -eq 0 ]; then
    if [ ! -f "$RAIL_VAULT_JSON" ]; then
      printf '❌ %s: falta %s (se buscó en %s). Es la configuración de la bóveda de secretos que viaja con el kit; sin ella no se lee ningún token. Cómo recuperarla: fx-secrets-vault §3, "Recuperar vault.json".\n' \
        "$rail__p" "$RAIL_VAULT_JSON_NAME" "$RAIL_VAULT_JSON" >&2
      rail__rc=$RAIL_EXIT_NO_CONFIG
    else
      rail__cfg="$(jq -r '[.domain, .rail.projectId, .rail.name] | map(if type == "string" then . else "" end) | join("\t")' "$RAIL_VAULT_JSON" 2>/dev/null)"
      if [ $? -ne 0 ]; then rail__cfg=""; fi
      IFS="$(printf '\t')" read -r rail__domain rail__pid rail__name <<EOF
$rail__cfg
EOF
      case "$rail__domain" in https://?*) ;; *) rail__domain="" ;; esac
      if [ -z "$rail__domain" ] || [ -z "$rail__pid" ] || [ -z "$rail__name" ]; then
        printf '❌ %s: %s está ilegible o incompleto (necesita domain, rail.projectId y rail.name). Cómo recuperarlo: fx-secrets-vault §3, "Recuperar vault.json".\n' \
          "$rail__p" "$RAIL_VAULT_JSON_NAME" >&2
        rail__rc=$RAIL_EXIT_NO_CONFIG
      fi
    fi
  fi

  # --- 2. stale copy in the shell: ignore, name it, drop it ------------------
  if [ "$rail__rc" -eq 0 ] && [ -n "${!rail__key:-}" ]; then
    printf '⚠ %s: ignoro %s de tu entorno: el rail se lee de la bóveda (%s). Borra esa variable de tu shell (p. ej. un export en ~/.zshrc): es una copia que ya nadie rota.\n' \
      "$rail__p" "$rail__key" "$rail__name" >&2
    unset "$rail__key"
  fi

  # --- 3. the vault CLI -------------------------------------------------------
  if [ "$rail__rc" -eq 0 ] && ! command -v infisical >/dev/null 2>&1; then
    printf '❌ %s: el CLI de la bóveda (`infisical`) no está instalado o no está en el PATH. Instálalo con `%s` y entra con `%s`.\n' \
      "$rail__p" "$RAIL_INSTALL_HINT" "$(rail__login_cmd "$rail__domain")" >&2
    rail__rc=$RAIL_EXIT_NOT_INSTALLED
  fi

  # --- 4. ONE read of the rail ------------------------------------------------
  if [ "$rail__rc" -eq 0 ]; then
    rail__errf="$(mktemp "${TMPDIR:-/tmp}/rail-stderr.XXXXXX" 2>/dev/null)"
    if [ -z "$rail__errf" ]; then
      printf '❌ %s: no pude crear un archivo temporal para leer la bóveda.\n' "$rail__p" >&2
      rail__rc=$RAIL_EXIT_UNRECOGNIZED
    else
      rail__json="$(
        unset INFISICAL_TOKEN
        export INFISICAL_DOMAIN="$rail__domain"
        infisical export --format=json --silent --secret-overriding=false \
          --projectId="$rail__pid" --env="$RAIL_ENV" --domain="$rail__domain" \
          </dev/null 2>"$rail__errf"
      )"
      local rail__xrc=$?
      rail__err="$(cat "$rail__errf" 2>/dev/null)"
      rm -f "$rail__errf"

      if [ "$rail__xrc" -ne 0 ]; then
        # Session first, then access: the two look alike from outside and have
        # different fixes (fx-secrets-vault §9).
        if printf '%s' "$rail__err" | grep -Eiq "$RAIL_NO_SESSION_RE"; then
          printf '❌ %s: no hay una sesión activa en la bóveda de secretos, o ya caducó. Entra con:\n  %s\ny vuelve a intentar.\n' \
            "$rail__p" "$(rail__login_cmd "$rail__domain")" >&2
          rail__rc=$RAIL_EXIT_NO_SESSION
        elif printf '%s' "$rail__err" | grep -Eiq "$RAIL_NO_ACCESS_RE"; then
          printf '❌ %s: tu sesión de la bóveda está activa, pero no tienes acceso al proyecto `%s` — o el proyecto configurado (id `%s`) no existe. El acceso es por proyecto (estar en la organización no lo da): pide acceso a un admin de la bóveda, o revisa el id.\n' \
            "$rail__p" "$rail__name" "$rail__pid" >&2
          rail__rc=$RAIL_EXIT_NO_ACCESS
        else
          printf '❌ %s: la bóveda respondió algo que no reconozco al leer `%s` (código de salida %s). No lo trato como clave ausente ni como falta de acceso. Revisa tu sesión (`%s`) y que `infisical` esté al día; si persiste, repórtalo al equipo del Factory.\n' \
            "$rail__p" "$rail__name" "$rail__xrc" "$(rail__login_cmd "$rail__domain")" >&2
          rail__rc=$RAIL_EXIT_UNRECOGNIZED
        fi
      else
        # Presence first (prints only "present"/"absent", never a value)…
        rail__state="$(printf '%s' "$rail__json" | jq -r --arg k "$rail__key" \
          "${RAIL_JQ_ENTRIES} | if length == 0 or .[0].value == \"\" then \"absent\" else \"present\" end" 2>/dev/null)"
        local rail__jrc=$?
        if [ "$rail__jrc" -eq 0 ] && [ "$rail__state" = "absent" ]; then
          printf '❌ %s: la clave `%s` no existe en `%s` (entorno %s) o está vacía. Pide a un admin de la bóveda que la cargue.\n' \
            "$rail__p" "$rail__key" "$rail__name" "$RAIL_ENV" >&2
          rail__rc=$RAIL_EXIT_KEY_MISSING
        elif [ "$rail__jrc" -eq 0 ] && [ "$rail__state" = "present" ]; then
          # …then the value of THIS key only (first occurrence wins).
          rail__val="$(printf '%s' "$rail__json" | jq -j --arg k "$rail__key" \
            "${RAIL_JQ_ENTRIES} | .[0].value" 2>/dev/null)"
          if [ $? -ne 0 ] || [ -z "$rail__val" ]; then
            rail__val=""
            rail__rc=$RAIL_EXIT_UNRECOGNIZED
          fi
        else
          rail__rc=$RAIL_EXIT_UNRECOGNIZED
        fi
        if [ "$rail__rc" -eq "$RAIL_EXIT_UNRECOGNIZED" ]; then
          printf '❌ %s: la bóveda respondió algo que no reconozco al leer `%s` (salida que no es el JSON esperado). No lo trato como clave ausente. Revisa que `infisical` esté al día; si persiste, repórtalo al equipo del Factory.\n' \
            "$rail__p" "$rail__name" >&2
        fi
      fi
      rail__json=""
    fi
  fi

  if [ "$rail__rc" -eq 0 ]; then
    export -n "$rail__dest" 2>/dev/null
    printf -v "$rail__dest" '%s' "$rail__val"
  fi
  rail__val=""

  # Restore the caller's shell options (errexit / xtrace) exactly as they were.
  case "$rail__opts" in *e*) set -e ;; esac
  case "$rail__opts" in *x*) set -x ;; esac
  return "$rail__rc"
}

# rail_require <KEY> <DEST_VAR> — like rail_read, but exits with its code on failure.
rail_require() {
  local rail__req_rc=0
  rail_read "$@" || rail__req_rc=$?
  if [ "$rail__req_rc" -ne 0 ]; then exit "$rail__req_rc"; fi
  return 0
}

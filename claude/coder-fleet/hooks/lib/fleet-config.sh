# fleet-config.sh - read and validate a project's .claude/coder-fleet.json.
#
# Sourced, never run. CF-111: a project disables fleet agents by listing them
# under `disabledAgents` in a committed .claude/coder-fleet.json. This file is the
# one reading of that list, shared by enforce-disabled-agents.sh and any script
# that edits or reports the setting, so the rules below are stated once:
#
#   - No file, or no `disabledAgents` key: nothing is disabled. Today's fleet.
#   - The file must be a JSON object, and `disabledAgents`, when present, a list
#     of strings. Other top-level keys are ignored.
#   - The file is exactly one JSON value, with no byte order mark and none of
#     the NaN or Infinity literals jq tolerates and JSON does not.
#   - A name must be printable ASCII; any other byte (a non-ASCII letter or
#     space, a tab, a newline) makes it invalid. It is then trimmed of spaces,
#     lower-cased and has any `coder-fleet:` prefix dropped, in that order, so
#     " coder-fleet:Refuter" and "refuter" are one entry. After that it must
#     look like an agent name: a lower-case letter or digit, then letters,
#     digits, hyphens or underscores.
#   - lead, coder and reviewer are the core of the fleet and cannot be disabled.
#   - A file that breaks any rule is invalid, and an invalid file honours
#     nothing: every agent stays enabled, and the caller reports the reason. A
#     core entry therefore never takes effect, and neither does anything listed
#     beside it, because a half-read config is a guess about what was meant.
#
# Nothing is cached. Every call to fleet_config_read reads the file, so an edit
# takes effect on the next call with no restart (CF-111 criterion 7).
#
# Written for bash 3.2. Needs jq; without it the state is "unreadable".
#
#   fleet_config_root <dir>      the checkout <dir> is in: git's top level, else
#                                <dir> itself, else (no <dir>) CLAUDE_PROJECT_DIR
#   fleet_config_read <root>     sets FLEET_CONFIG_PATH, FLEET_CONFIG_STATE
#                                (absent | ok | invalid | unreadable),
#                                FLEET_CONFIG_REASON (why invalid or unreadable)
#                                and FLEET_CONFIG_DISABLED (space-separated
#                                normalised names, empty unless ok). Returns 0.
#   fleet_config_normalise <name>
#   fleet_agent_disabled <type>  0 when the last read disables <type>, bare or
#                                coder-fleet:-prefixed; 1 otherwise, including
#                                for another plugin's agent of the same name

FLEET_CONFIG_REL=".claude/coder-fleet.json"
FLEET_CORE_AGENTS="lead coder reviewer"

fleet_config_normalise() {
  local n
  n="$(printf '%s' "$1" | tr 'A-Z' 'a-z' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  printf '%s' "${n#coder-fleet:}"
}

fleet_config_root() {
  local dir="$1" top=""
  if [ -n "$dir" ] && [ -d "$dir" ] && command -v git >/dev/null 2>&1; then
    top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || true)"
  fi
  if [ -n "$top" ]; then printf '%s' "$top"; return 0; fi
  if [ -n "$dir" ]; then printf '%s' "$dir"; return 0; fi
  printf '%s' "${CLAUDE_PROJECT_DIR:-$PWD}"
}

fleet_config_read() {
  local root="$1" out state payload
  FLEET_CONFIG_PATH="$root/$FLEET_CONFIG_REL"
  FLEET_CONFIG_STATE=absent
  FLEET_CONFIG_REASON=""
  FLEET_CONFIG_DISABLED=""
  [ -e "$FLEET_CONFIG_PATH" ] || return 0
  if [ ! -r "$FLEET_CONFIG_PATH" ] || [ -d "$FLEET_CONFIG_PATH" ]; then
    FLEET_CONFIG_STATE=unreadable
    FLEET_CONFIG_REASON="$FLEET_CONFIG_REL exists but cannot be read"
    return 0
  fi
  if ! command -v jq >/dev/null 2>&1; then
    FLEET_CONFIG_STATE=unreadable
    FLEET_CONFIG_REASON="jq is not installed, so $FLEET_CONFIG_REL cannot be read"
    return 0
  fi
  # Two lines out: the state, then the reason or the names. Every name is
  # checked against the agent-name shape inside jq, so nothing that reaches the
  # shell can carry a space, a newline or a quote.
  #
  # review-round.js reads the same file with JSON.parse, and the two must agree
  # on every input (workflow-logic.mjs holds the fixtures). So, against jq's
  # leniency: the raw text is checked for a byte order mark and for the NaN and
  # Infinity literals jq accepts, the file is slurped so a stream of several
  # values is one invalid file rather than several read in turn, and a name
  # with any byte outside printable ASCII is refused before anything is
  # trimmed, because the two languages disagree on what non-ASCII whitespace and
  # case are. The shape test uses \A and \z, since ^ and $ in jq's regex match
  # at an embedded newline.
  out="$(jq -n -r --arg core "$FLEET_CORE_AGENTS" --rawfile raw "$FLEET_CONFIG_PATH" --slurpfile docs "$FLEET_CONFIG_PATH" '
      def norm: if test("\\A[ -~]*\\z") then sub("\\A +"; "") | sub(" +\\z"; "") | ascii_downcase | ltrimstr("coder-fleet:") else . end;
      ($raw | gsub("\"(\\\\.|[^\"\\\\])*\""; "\"\"") | gsub("true|false|null"; "")) as $bare
      | if ($raw | startswith("﻿")) then "invalid", "the file starts with a byte order mark"
      elif ($bare | test("[A-DF-Za-df-z]")) then "invalid", "the file is empty or not valid JSON"
      elif ($docs | length) != 1 then "invalid", "the file is empty or not valid JSON"
      else $docs[0] |
      if type != "object" then "invalid", "the file is not a JSON object"
      elif (has("disabledAgents") | not) then "ok", ""
      elif (.disabledAgents | type) != "array" then "invalid", "disabledAgents is not a list"
      elif any(.disabledAgents[]; type != "string") then "invalid", "disabledAgents holds something that is not a string"
      else
        (.disabledAgents | map(norm)) as $names
        | ([ $names[] | select(test("\\A[a-z0-9][a-z0-9_-]*\\z") | not) ]) as $bad
        | ([ $names[] | select(. as $n | ($core | split(" ") | index($n))) ] | unique) as $cores
        | if ($bad | length) > 0 then "invalid", ("disabledAgents lists " + ($bad | map(tojson) | join(", ")) + ", which is not an agent name")
          elif ($cores | length) > 0 then "invalid", ("disabledAgents lists " + ($cores | join(", ")) + ", and lead, coder and reviewer cannot be disabled")
          else "ok", ($names | unique | join(" "))
          end
      end
      end' 2>/dev/null)" || out=""
  state="$(printf '%s\n' "$out" | sed -n 1p)"
  payload="$(printf '%s\n' "$out" | sed -n 2p)"
  case "$state" in
    ok)
      FLEET_CONFIG_STATE=ok
      FLEET_CONFIG_DISABLED="$payload"
      ;;
    invalid)
      FLEET_CONFIG_STATE=invalid
      FLEET_CONFIG_REASON="$payload"
      ;;
    *)
      FLEET_CONFIG_STATE=invalid
      FLEET_CONFIG_REASON="the file is empty or not valid JSON"
      ;;
  esac
  return 0
}

fleet_agent_disabled() {
  local raw name
  [ "${FLEET_CONFIG_STATE:-}" = ok ] || return 1
  raw="$(printf '%s' "$1" | tr 'A-Z' 'a-z')"
  # Only the bare type or this plugin's prefix. "other-plugin:refuter" is not
  # the fleet's refuter.
  case "$raw" in
    *:*) case "$raw" in coder-fleet:*) ;; *) return 1 ;; esac ;;
  esac
  name="$(fleet_config_normalise "$raw")"
  [ -n "$name" ] || return 1
  case " $FLEET_CONFIG_DISABLED " in
    *" $name "*) return 0 ;;
  esac
  return 1
}

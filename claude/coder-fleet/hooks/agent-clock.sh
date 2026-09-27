#!/usr/bin/env bash
# SubagentStart and PreToolUse: a wall-clock cap for the agents that have one.
#
# The human's rule (CF-23): a refuter must not run for more than 20 minutes, and
# a hook stops it at 25. The refuter's body and the looping skill tell it the 20;
# this hook enforces the 25. At SubagentStart it records when a capped agent was
# spawned. On every tool call from that agent it denies the call once the hard
# cap has passed, and under the cap it trims a Bash call's timeout to the time
# left, so a command started at 24:50 cannot hold the run open to 35:00.
#
# Why this is not in enforce-agent-scope.sh. That hook's PreToolUse matcher is
# Write|Edit|MultiEdit|NotebookEdit|Bash, so Read, Grep, Glob and every MCP tool
# never reach it. Widening it to every tool would put its JSON validation, five
# jq calls and quote recovery on every call of every agent and the main session,
# and would tie the cap to its 10-second timeout: docs/limits.md lists command
# shapes that blow that timeout, and a hook that times out gives no decision, so
# the cap would vanish on exactly those calls. This hook is registered with no
# matcher, exits before jq for the main session, and is small enough that its
# 5-second timeout is never near. When parallel PreToolUse hooks disagree, deny
# wins (the 2.1.283 bundle folds `case"deny":vo="deny"` ahead of ask and allow).
#
# The resume rule. SendMessage re-fires SubagentStart for the same agent id
# (hooks.log shows one spec-writer id started six times). The clock file is
# created with noclobber, which is O_EXCL, so the first start stands and a
# resume cannot buy a fresh 25 minutes. For the same reason nothing is removed
# at SubagentStop: that fires before every resume too, and a deleted file would
# restart the clock. Clock files are about 60 bytes and are never pruned, like
# sessions/.
#
# Fail open, then start. A capped agent with no clock file on PreToolUse (a lost
# SubagentStart, a hook that timed out) gets its call allowed and its clock
# started now, so the worst case is a late start rather than an uncapped run.
# A file that will not parse, an unwritable directory or a missing jq allow the
# call and log why. Failing closed would kill a whole run over a hook fault. Any
# other error trips the ERR trap, which logs and exits 0, with one exception:
# the deny path clears the trap (`trap - ERR`) before it prints, so a failure
# there cannot be logged as "allowing the call" after half a decision is out. A
# jq failure on that path exits with jq's own status instead: 2 on a usage or
# system error, which the runtime reads as a block, the outcome the deny wanted
# anyway; anything else is a non-blocking error and the call goes ahead.
#
# StructuredOutput is never denied. It is how a schema-spawned run returns its
# result, so denying it past the cap would leave such a run no way to end.
#
# The Bash trim relies on runtime behaviour the documentation contradicts. The
# docs say "Without a decision, `updatedInput` is ignored". The 2.1.283 bundle
# does this instead:
#   if(Ee.updatedInput&&Ee.permissionBehavior===void 0)yield{type:"hookUpdatedInput",...}
#   case"hookUpdatedInput":ze=vo.updatedInput
# before the normal permission decision runs on the rewritten input, which is
# schema-checked (a failure is a deny). So the trim sends updatedInput with NO
# permissionDecision. It must never send "allow" with it: "allow" bypasses the
# deny and ask rules in settings, which would wave refuter Bash calls past the
# curl, sudo and destructive-git denials. If a later CLI follows the docs, the
# trim silently stops and the deny still holds. Hooks README item 20 says how to
# re-derive this after an upgrade.
#
# Written for bash 3.2: no associative arrays, ${var,,}, mapfile or
# $EPOCHSECONDS. It does not source lib/board.sh (that would pull in board.env)
# and it ignores the board switch: the clock runs whether or not the board does.
set -euo pipefail

HOOK=AgentClock
STATE_DIR="${CODER_FLEET_STATE_DIR:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/coder-fleet}"
LOG_FILE="$STATE_DIR/log/hooks.log"

log() {
  local line
  line="$(date -u '+%Y-%m-%dT%H:%M:%SZ') [$HOOK] $*"
  printf '%s\n' "$line" >&2
  if mkdir -p "$STATE_DIR/log" 2>/dev/null; then
    printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || true
  fi
}

trap 'log "unexpected error on line $LINENO; allowing the call"; exit 0' ERR

# The per-agent table: advisory and hard caps in seconds. The advisory number is
# what the agent's body tells it; only the hard one is enforced here.
clock_caps() {
  case "$1" in
    refuter) printf '1200 1500\n' ;;
    *) return 1 ;;
  esac
}

# The invariant each capped agent's body carries, quoted back on a deny so the
# agent knows which line it hit. Must match the body character for character.
clock_invariant() {
  case "$1" in
    refuter) printf 'Never run past 20 minutes of wall-clock from your spawn.' ;;
    *) printf 'Stay inside your time cap.' ;;
  esac
}

# The runtime's floor for a trimmed Bash timeout, in milliseconds. A command
# given less than this cannot do anything useful; the true ceiling becomes the
# hard cap plus this plus kill latency.
TRIM_FLOOR_MS=5000
BASH_RUNTIME_DEFAULT_MS=120000

input="$(cat)"

# Fast path: the main session sends no agent_id and is never capped.
case "$input" in
  *'"agent_id"'*) ;;
  *) exit 0 ;;
esac

if ! command -v jq >/dev/null 2>&1; then
  log "jq is not installed, so no agent's time cap can be enforced. Every call is allowed. Install jq (macOS: brew install jq)."
  exit 0
fi

# One jq call. The fields are joined with the unit separator rather than a tab,
# because tab is IFS whitespace and read would collapse an empty field.
if ! fields="$(printf '%s' "$input" | jq -r '
    [ (.hook_event_name // "" | tostring),
      (.agent_type // "" | tostring),
      (.agent_id // "" | tostring),
      (.tool_name // "" | tostring),
      # floor makes a new number, which jq prints canonically. Without it jq
      # 1.7 prints a number the way it was written, so 600000.0 or 6e5 would
      # reach the shell as text its integer tests cannot read.
      (.tool_input.timeout? // null
        | if type == "number" and . >= 1
          then (floor | if . > 1000000000 then 1000000000 else . end | tostring)
          else "" end)
    ] | join("\u001f")' 2>/dev/null)"; then
  log "hook input is not valid JSON; allowing the call"
  exit 0
fi

IFS=$'\x1f' read -r event agent_type agent_id tool_name timeout_in <<< "$fields" || true

# The second lock on the timeout: anything but plain digits is treated as no
# timeout at all, so a jq that prints numbers some other way cannot make the
# shell's integer comparison error and the call escape the trim.
case "$timeout_in" in
  *[!0-9]*|0*) timeout_in="" ;;
esac

# A plugin agent can arrive as "refuter" or as "coder-fleet:refuter".
agent="${agent_type##*:}"
[ -n "$agent" ] || exit 0
[ -n "$agent_id" ] || exit 0
# Tested on its output, not its status: an uncapped agent must leave here even
# if a trap ever catches the table's `return 1` inside the substitution.
caps="$(clock_caps "$agent" || true)"
[ -n "$caps" ] || exit 0
read -r advisory hard <<< "$caps"

safe_id="$(printf '%s' "$agent_id" | tr -c 'A-Za-z0-9._-' '_')"
clock_dir="$STATE_DIR/clocks"
clock_file="$clock_dir/$safe_id"

start_clock() {
  # Create-if-absent. Fails when the file already exists or cannot be written.
  local now iso
  now="$(date +%s)"
  iso="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  ( umask 077; mkdir -p "$clock_dir" ) 2>/dev/null || return 1
  chmod 700 "$clock_dir" 2>/dev/null || true
  ( set -C; umask 077
    printf 'started_at=%s\nstarted_iso=%s\nagent_type=%s\n' "$now" "$iso" "$agent" > "$clock_file"
  ) 2>/dev/null
}

case "$event" in
  SubagentStart)
    if start_clock; then
      log "started the clock for $agent $agent_id: asked to finish by $((advisory / 60)) minutes, stopped at $((hard / 60))"
    elif [ -f "$clock_file" ]; then
      log "$agent $agent_id started again (a resume); its first start in $clock_file stands"
    else
      log "could not write $clock_file; $agent $agent_id is uncapped until its first tool call starts the clock"
    fi
    exit 0
    ;;
  PreToolUse) ;;
  *) exit 0 ;;
esac

if [ ! -f "$clock_file" ]; then
  if start_clock; then
    log "no clock for $agent $agent_id at $tool_name; started it now, late, and allowed the call"
  else
    log "no clock for $agent $agent_id and $clock_file cannot be written; allowing the call, uncapped"
  fi
  exit 0
fi

started="$(sed -n 's/^started_at=//p' "$clock_file" 2>/dev/null | head -n 1)" || started=""
case "$started" in
  ''|*[!0-9]*|0*)
    log "clock file $clock_file is unreadable (started_at '$started'); allowing the call, uncapped"
    exit 0
    ;;
esac
if [ "${#started}" -gt 12 ]; then
  log "clock file $clock_file is unreadable (started_at out of range); allowing the call, uncapped"
  exit 0
fi

now="$(date +%s)"
elapsed=$((now - started))
# A clock stepped back counts as no time at all. Machine sleep counts in full:
# the rule is wall-clock.
[ "$elapsed" -ge 0 ] || elapsed=0

# A schema run's only way to return its result. See the header.
[ "$tool_name" != StructuredOutput ] || exit 0

if [ "$elapsed" -ge "$hard" ]; then
  trap - ERR
  reason="$agent invariant: \"$(clock_invariant "$agent")\" This run has been going $((elapsed / 60)) minutes, past the $((hard / 60))-minute hard cap, so this call and every later one is denied - do not retry it or try another tool. End now with your four-heading handoff from what you already have: what you ran and what died under Done, and every claim or mutation you did not finish under Not done, named, so a fresh $agent can start there."
  jq -n --arg r "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  log "denied $tool_name for $agent $agent_id at ${elapsed}s, past the ${hard}s cap"
  exit 0
fi

[ "$tool_name" = Bash ] || exit 0

remaining_ms=$(( (hard - elapsed) * 1000 ))
requested="$timeout_in"
if [ -z "$requested" ]; then
  requested="${BASH_DEFAULT_TIMEOUT_MS:-}"
  case "$requested" in
    ''|*[!0-9]*|0*) requested="$BASH_RUNTIME_DEFAULT_MS" ;;
  esac
  [ "${#requested}" -le 10 ] || requested=1000000000
fi

[ "$remaining_ms" -lt "$requested" ] || exit 0

trimmed="$remaining_ms"
[ "$trimmed" -ge "$TRIM_FLOOR_MS" ] || trimmed="$TRIM_FLOOR_MS"

# No permissionDecision, on purpose: see the header. The merge keeps every other
# field of the original tool_input as it was.
printf '%s' "$input" | jq -c --argjson n "$trimmed" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    updatedInput: (.tool_input + {timeout: $n})
  }
}'
log "trimmed a Bash timeout for $agent $agent_id from ${requested}ms to ${trimmed}ms, ${elapsed}s into a ${hard}s cap"
exit 0

#!/usr/bin/env bash
# PreToolUse on the Agent tool: a project's disabled agents are never spawned.
#
# CF-111. A project lists fleet agents it does not want under `disabledAgents`
# in its main checkout's .claude/coder-fleet.json. The lead body and review-round read
# that list and do not spawn a listed agent; this hook is the hard half, for
# every spawn the advisory half misses. It denies an Agent call whose
# subagent_type, bare or `coder-fleet:`-prefixed, is listed, and the reason names
# the file, so the caller knows where the switch is.
#
# The rules for reading the file - normalisation, the core agents that cannot
# be disabled, what makes it invalid - are in lib/fleet-config.sh, shared with
# any script that edits the setting. In short: no file means today's fleet; an
# invalid file (a core agent listed, broken JSON, the wrong shape) honours
# nothing and every Agent call carries a warning saying why, until it is fixed.
#
# Read on every call. Nothing is cached in the state directory or at session
# start, so an edit to the file takes effect on the next spawn with no restart.
#
# Which checkout's file: the repository's main checkout, found from the call's
# cwd through git (fleet_config_root in lib/fleet-config.sh), else the cwd
# itself outside git. A linked worktree's copy never counts, so a lead whose cwd
# is in a coder's worktree, or a branch under review, cannot change what is
# disabled. Uncommitted edits in the main checkout count, so a toggle applies on
# the next spawn. It is the same file review-round's pin lane and
# scripts/fleet-agents.sh read.
#
# Not native `permissions.deny Agent(...)`: that cannot refuse to honour a core
# agent, cannot name this file, and whether it governs a workflow's agent() spawn
# was never tested. Whether this hook does is not tested either (hooks README),
# which is why review-round reads the list itself.
#
# Fail open: no jq, input that is not JSON or any other error allows the call and
# logs why, because failing closed would block every spawn over a hook fault.
#
#   enforce-disabled-agents.sh --check [dir]
#     validates the file in the main checkout of dir's repository (default: the current directory), prints
#     what it disables, and exits 1 when the file is invalid. check-all.sh runs it.
#
# Written for bash 3.2.
set -euo pipefail

HOOK=DisabledAgents
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
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

# shellcheck source=lib/fleet-config.sh
. "$HOOK_DIR/lib/fleet-config.sh"

if [ "${1:-}" = "--check" ]; then
  root="$(fleet_config_root "${2:-$PWD}")"
  fleet_config_read "$root"
  case "$FLEET_CONFIG_STATE" in
    absent) printf '%s: no %s, so every agent is enabled\n' "$root" "$FLEET_CONFIG_REL" ;;
    ok)
      if [ -n "$FLEET_CONFIG_DISABLED" ]; then
        printf '%s: %s disables %s\n' "$root" "$FLEET_CONFIG_REL" "$FLEET_CONFIG_DISABLED"
      else
        printf '%s: %s disables nothing\n' "$root" "$FLEET_CONFIG_REL"
      fi
      ;;
    *)
      printf '%s: %s is invalid: %s. Nothing in it is honoured until it is fixed.\n' "$root" "$FLEET_CONFIG_REL" "$FLEET_CONFIG_REASON" >&2
      exit 1
      ;;
  esac
  exit 0
fi

trap 'log "unexpected error on line $LINENO; allowing the call"; exit 0' ERR

input="$(cat)"

# Fast path: only the subagent tool is this hook's business.
case "$input" in
  *'"Agent"'*|*'"Task"'*) ;;
  *) exit 0 ;;
esac

if ! command -v jq >/dev/null 2>&1; then
  log "jq is not installed, so disabled agents cannot be enforced; allowing the call"
  exit 0
fi

if ! fields="$(printf '%s' "$input" | jq -r '
    [ (.tool_name // "" | tostring),
      (.tool_input.subagent_type? // "" | tostring | gsub("[\r\n\u001f]"; "")),
      (.cwd // "" | tostring | gsub("[\r\n\u001f]"; "")) ] | join("\u001f")' 2>/dev/null)"; then
  log "hook input is not valid JSON; allowing the call"
  exit 0
fi
IFS=$'\x1f' read -r tool_name subagent_type cwd <<< "$fields" || true

case "$tool_name" in
  Agent|Task) ;;
  *) exit 0 ;;
esac

root="$(fleet_config_root "$cwd")"
fleet_config_read "$root"

case "$FLEET_CONFIG_STATE" in
  absent) exit 0 ;;
  ok) ;;
  *)
    trap - ERR
    msg="coder-fleet: $root/$FLEET_CONFIG_REL is invalid ($FLEET_CONFIG_REASON), so none of its disabledAgents entries is honoured and every fleet agent stays enabled. Fix the file: lead, coder and reviewer cannot be disabled."
    jq -n --arg m "$msg" '{
      systemMessage: $m,
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: $m }
    }'
    log "config at $root is $FLEET_CONFIG_STATE ($FLEET_CONFIG_REASON); honouring nothing, allowing ${subagent_type:-a spawn with no type}"
    exit 0
    ;;
esac

[ -n "$subagent_type" ] || exit 0
fleet_agent_disabled "$subagent_type" || exit 0

trap - ERR
name="$(fleet_config_normalise "$subagent_type")"
reason="$name is disabled for this project: $FLEET_CONFIG_REL lists it under disabledAgents ($root/$FLEET_CONFIG_REL). Do not retry this spawn, and do not spawn another agent or run its work yourself in its place - the project chose to go without it. To enable it again, remove \"$name\" from disabledAgents in that file; the next spawn reads it."
jq -n --arg r "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $r
  }
}'
log "denied a $subagent_type spawn: $root/$FLEET_CONFIG_REL disables $name"
exit 0

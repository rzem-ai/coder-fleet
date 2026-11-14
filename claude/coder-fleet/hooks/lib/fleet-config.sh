# fleet-config.sh - read and validate a project's .claude/coder-fleet.json.
#
# Sourced, never run. A shim since CF-1.2: every function passes its
# arguments to `boards fleet config`, boards/src/fleet/config.ts, which holds
# the rules and states them once, and evals what it prints. The interface the
# hooks and scripts that source this file use is unchanged:
#
#   fleet_config_root <dir>      the main worktree of the repository <dir> is in,
#                                even from a linked worktree; prints nothing and
#                                returns 1 when there is none it can trust.
#                                No <dir>: CLAUDE_PROJECT_DIR, then $PWD
#   fleet_config_read <root>     sets FLEET_CONFIG_PATH, FLEET_CONFIG_STATE
#                                (absent | ok | invalid | unreadable |
#                                unresolved), FLEET_CONFIG_REASON,
#                                FLEET_CONFIG_DISABLED, FLEET_CONFIG_PHASE,
#                                FLEET_CONFIG_PHASE_STATE and
#                                FLEET_CONFIG_PHASE_REASON, and for each of
#                                BASE, PUSH and RELEASE the triple
#                                FLEET_CONFIG_<KEY>, FLEET_CONFIG_<KEY>_STATE
#                                and FLEET_CONFIG_<KEY>_REASON. Returns 0.
#   fleet_trunk <root>           reads the file, then sets FLEET_TRUNK,
#                                FLEET_TRUNK_FROM (setting | remote | fallback)
#                                and FLEET_TRUNK_REASON; returns 1 with
#                                FLEET_TRUNK empty when there is no trunk to
#                                trust. scripts/fleet-trunk.sh prints it.
#   fleet_config_normalise <name>
#   fleet_roster <plugin root>   the fleet's agents, space-separated and sorted
#   fleet_agent_disabled <type>  0 when the last read disables <type>, bare or
#                                coder-fleet:-prefixed; 1 otherwise
#   _fleet_git <args>            git with nothing in the environment able to
#                                point it at another repository
#
# When the binary will not run, nothing is trusted: no main checkout, the file
# invalid and honouring nothing, the phase harden, push base-only, release off
# and no trunk.
#
# Written for bash 3.2.

FLEET_CONFIG_REL=".claude/coder-fleet.json"
FLEET_CORE_AGENTS="lead coder reviewer"
FLEET_CONFIG_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_FLEET_BOARDS_SH="$FLEET_CONFIG_LIB_DIR/../../boards/boards.sh"

_fleet_boards() { bash "$_FLEET_BOARDS_SH" fleet "$@"; }

_fleet_git() {
  env -u GIT_DIR -u GIT_COMMON_DIR -u GIT_WORK_TREE -u GIT_CEILING_DIRECTORIES \
    -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM \
    -u GIT_DISCOVERY_ACROSS_FILESYSTEM -u GIT_NAMESPACE -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY \
    git "$@"
}

fleet_roster() { _fleet_boards config roster "$1"; }

fleet_config_normalise() { _fleet_boards config normalise "$1"; }

fleet_config_root() { _fleet_boards config root "${1:-${CLAUDE_PROJECT_DIR:-$PWD}}"; }

# The binary did not answer: a failed read, as config.ts gives one.
_fleet_config_failed() {
  local why="the boards binary could not run, so $FLEET_CONFIG_REL cannot be parsed"
  FLEET_CONFIG_PATH=""
  [ -z "$1" ] || FLEET_CONFIG_PATH="$1/$FLEET_CONFIG_REL"
  FLEET_CONFIG_STATE=invalid
  FLEET_CONFIG_REASON="$why"
  FLEET_CONFIG_DISABLED=""
  FLEET_CONFIG_PHASE=harden
  FLEET_CONFIG_PHASE_STATE=unread
  FLEET_CONFIG_PHASE_REASON="$why, so the phase is taken as harden"
  FLEET_CONFIG_BASE=""
  FLEET_CONFIG_BASE_STATE=unread
  FLEET_CONFIG_BASE_REASON="$why, so baseBranch is unknown"
  FLEET_CONFIG_PUSH=base-only
  FLEET_CONFIG_PUSH_STATE=unread
  FLEET_CONFIG_PUSH_REASON="$why, so push is taken as base-only"
  FLEET_CONFIG_RELEASE=off
  FLEET_CONFIG_RELEASE_STATE=unread
  FLEET_CONFIG_RELEASE_REASON="$why, so release is taken as off"
}

fleet_config_read() {
  local out
  if out="$(_fleet_boards config read "$1")" && [ -n "$out" ]; then
    eval "$out"
  else
    _fleet_config_failed "$1"
  fi
  return 0
}

fleet_trunk() {
  local out rc=0
  out="$(_fleet_boards config trunk "$1")" || rc=$?
  if [ -n "$out" ] && [ "$rc" -le 1 ]; then
    eval "$out"
    return "$rc"
  fi
  _fleet_config_failed "$1"
  FLEET_TRUNK=""
  FLEET_TRUNK_FROM=""
  FLEET_TRUNK_REASON="the boards binary could not run, so the trunk is not known"
  return 1
}

# The answer is a word; anything but an exact "disabled" with exit 0 is
# enabled, as for a file that could not be read, which honours nothing.
fleet_agent_disabled() {
  local out
  out="$(_fleet_boards config agent-disabled "${FLEET_CONFIG_STATE:-}" "${FLEET_CONFIG_DISABLED:-}" "$1")" && [ "$out" = disabled ]
}

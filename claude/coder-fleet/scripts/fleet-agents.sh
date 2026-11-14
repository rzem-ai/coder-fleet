#!/usr/bin/env bash
#
# fleet-agents.sh - list, enable and disable fleet agents for a project by
# editing `disabledAgents` in its .claude/coder-fleet.json, and show and set
# its phase, base branch, push policy and release setting.
#
# A shim since CF-1.2 onto `boards fleet agents`, boards/src/fleet/agents.ts,
# which /coder-fleet:agents runs through this file. It edits the file in the
# main checkout, read the way the spawn hook and review-round read it. The
# roster is the shared one, roster() in config.ts, the same one fleet_roster
# in hooks/lib/fleet-config.sh answers with, so this builds none of its own.
#
# Exit 0 when it listed, changed or found nothing to change; 1 when it refused
# or when what it showed was invalid; 2 on a usage error; 127 when the binary
# will not run, having changed nothing.
#
# Usage:  fleet-agents.sh [list | disable <agent> | enable <agent> | phase [build | harden]
#                          | base [<branch> | --unset] | push [all | base-only | --unset]
#                          | release [off | tag | github | --unset]]

exec bash "$(cd "$(dirname "$0")/.." && pwd)/boards/boards.sh" fleet agents "$@"

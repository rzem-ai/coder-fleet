#!/usr/bin/env bash
#
# fleet-trunk.sh - print the trunk of the repository <dir> is in.
#
# A shim since CF-1.2 onto `boards fleet trunk`, the fleet's one resolver of
# the trunk (boards/src/fleet/config.ts): baseBranch in the main checkout's
# .claude/coder-fleet.json when set; else the branch the remote's HEAD names,
# the remote being origin or the only one; else main.
#
# Exit 0 with the branch on stdout. Exit 1 with nothing on stdout and the
# reason on stderr when baseBranch is invalid or the file could not be read,
# so a caller never acts on a trunk the human did not name. Exit 127 when the
# binary will not run.
#
# Usage:  fleet-trunk.sh [dir]     dir defaults to CLAUDE_PROJECT_DIR, then $PWD

exec bash "$(cd "$(dirname "$0")/.." && pwd)/boards/boards.sh" fleet trunk "$@"

#!/usr/bin/env bash
# The one way the hooks and the MCP config reach the board binary.
#   1. ~/.local/bin/board, built by scripts/install-home.sh
#   2. bin/board beside this script, built by build.sh
#   3. bun run src/cli.ts, when Bun is present and nothing is built yet
# Exit 127 with a one-line reason otherwise; the hook library treats that as a soft failure.
set -u
here="$(cd "$(dirname "$0")" && pwd)"

# The binary logs a board commit that did not happen to the hooks log (CF-21).
# The MCP server reaches the binary through here alone, so the file is
# resolved here exactly as hooks/lib/board.sh resolves it, and exported.
# Through a hook, board_cli has exported the same value already and this
# arrives at it again.
CODER_FLEET_STATE_DIR="${CODER_FLEET_STATE_DIR:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/coder-fleet}"
BOARD_LOG_FILE="${BOARD_LOG_FILE:-$CODER_FLEET_STATE_DIR/log/hooks.log}"
export BOARD_LOG_FILE
if [ -x "${HOME:-}/.local/bin/board" ]; then exec "${HOME:-}/.local/bin/board" "$@"; fi
if [ -x "$here/bin/board" ]; then exec "$here/bin/board" "$@"; fi
if command -v bun >/dev/null 2>&1; then exec bun "$here/src/cli.ts" "$@"; fi
printf 'board: no binary at ~/.local/bin/board or %s/bin/board and no bun on PATH\n' "$here" >&2
exit 127

#!/usr/bin/env bash
# The one way the hooks and the MCP config reach the board binary.
#   1. ${CLAUDE_PLUGIN_DATA}/bin/board-<version>[.exe], the release build for
#      this plugin version, fetched by hooks/board-binary.sh at session start
#   2. bin/board beside this script, built by build.sh
#   3. bun run src/cli.ts, when Bun is present and nothing is built yet
# Exit 127 with a one-line reason otherwise; the hook library treats that as a soft failure.
#
# ~/.local/bin/board is deliberately not read: a stale copy built there for an
# older version would win over the release build for this one and never be
# replaced.
set -u
here="$(cd "$(dirname "$0")" && pwd)"

# The binary logs a board commit that did not happen to the hooks log.
# The MCP server reaches the binary through here alone, so the file is
# resolved here exactly as hooks/lib/board.sh resolves it, and exported.
# Through a hook, board_cli has exported the same value already and this
# arrives at it again.
CODER_FLEET_STATE_DIR="${CODER_FLEET_STATE_DIR:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/coder-fleet}"
BOARD_LOG_FILE="${BOARD_LOG_FILE:-$CODER_FLEET_STATE_DIR/log/hooks.log}"
export BOARD_LOG_FILE
version="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$here/../.claude-plugin/plugin.json" 2>/dev/null | head -1)"
if [ -n "${CLAUDE_PLUGIN_DATA:-}" ] && [ -n "$version" ]; then
  for bin in "$CLAUDE_PLUGIN_DATA/bin/board-$version" "$CLAUDE_PLUGIN_DATA/bin/board-$version.exe"; do
    if [ -x "$bin" ]; then exec "$bin" "$@"; fi
  done
fi
if [ -x "$here/bin/board" ]; then exec "$here/bin/board" "$@"; fi
if command -v bun >/dev/null 2>&1; then exec bun "$here/src/cli.ts" "$@"; fi
printf 'board: no binary for v%s in %s/bin (fetched at session start), none at %s/bin/board and no bun on PATH\n' \
  "${version:-unknown}" "${CLAUDE_PLUGIN_DATA:-<no plugin data dir>}" "$here" >&2
exit 127

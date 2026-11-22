#!/usr/bin/env bash
# Run this installation's compiled board, never a project's source code.
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)"
case "$PLATFORM" in *-aarch64) PLATFORM="${PLATFORM%-aarch64}-arm64" ;; *-x86_64) PLATFORM="${PLATFORM%-x86_64}-x64" ;; esac
BIN="${CODER_FLEET_BOARDS_BIN:-$ROOT/bin/boards-$PLATFORM}"
if [ ! -x "$BIN" ] && [ -z "${CODER_FLEET_BOARDS_BIN:-}" ] && [ "${ROOT##*/}" = coder-fleet ]; then BIN="$ROOT/../boards/bin/boards-$PLATFORM"; fi
if [ ! -x "$BIN" ]; then
    printf 'coder-fleet: no OpenCode boards binary at %s; build opencode/boards and reinstall with CODER_FLEET_BOARDS_BIN\n' "$BIN" >&2
    exit 127
fi
export CODER_FLEET_PLUGIN_ROOT="$ROOT"
export CODER_FLEET_PROJECT_DIR="${CODER_FLEET_PROJECT_DIR:-$PWD}"
exec "$BIN" "$@"

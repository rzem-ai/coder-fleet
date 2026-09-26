#!/bin/bash
# Registers the minimal stub MCP server (mcp-stub/server.py) against a
# scratch CODEX_HOME, for question 3's MCP tool call case. Safe to re-run -
# codex mcp add against an existing name updates it in place.
#
# Usage: bash register-mcp-stub.sh <scratch-dir>
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

SP="$(resolve_scratch_dir "$1")" || exit 1
require_scratch_shape "$SP" || exit 1

CODEX_HOME="$SP/codex-home" codex mcp add spike_stub -- python3 "$HERE/mcp-stub/server.py"
CODEX_HOME="$SP/codex-home" codex mcp list

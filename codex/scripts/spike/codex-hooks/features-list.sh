#!/bin/bash
# Checks the current name and default state of the hooks feature flag
# against the scratch CODEX_HOME (question 4). Does not need a firing hook.
#
# Usage: bash features-list.sh <scratch-dir>
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

SP="$(resolve_scratch_dir "$1")" || exit 1
require_scratch_shape "$SP" || exit 1

CODEX_HOME="$SP/codex-home" codex features list | tee "$SP/features-list.txt"
echo
echo "Look for a 'hooks' row above. 'codex_hooks' does not appear as a separate flag on 0.156.1; the docs call it a deprecated alias for features.hooks."

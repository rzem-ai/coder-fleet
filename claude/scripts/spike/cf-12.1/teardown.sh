#!/bin/bash
# Removes only what setup.sh is known to create under one scratch directory.
# Never runs rm -rf on the scratch directory itself - only on named children -
# and only removes the directory itself with rmdir once those children are
# gone, which succeeds only if nothing else was left in it. Anything left
# behind is reported, not deleted.
#
# Usage: bash teardown.sh <absolute scratch dir>
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

RAW="${1:-}"
if [ -z "$RAW" ]; then
  echo "usage: bash teardown.sh <scratch-dir>" >&2
  exit 1
fi
if [ ! -d "$RAW" ]; then
  echo "nothing to tear down at $RAW" >&2
  exit 0
fi

SP="$(resolve_scratch_dir "$RAW")" || exit 1
require_scratch_shape "$SP" || exit 1

rm -rf "$SP/plugin"
rm -rf "$SP/projects"
rm -rf "$SP/logs"
rm -rf "$SP/state"
rm -rf "$SP/replay-state"
rm -f "$SP/hook-under-test"
rm -f "$SP/plugin-dir-for-project.txt"
rm -f "$SP/summary.md"
rm -f "$SP/$CF12_SPIKE_MARKER"

if rmdir "$SP" 2>/dev/null; then
  echo "removed $SP"
else
  echo "removed everything setup.sh is known to have created under $SP, but $SP itself is not empty, so it was not removed. Left behind:" >&2
  ls -A "$SP" >&2
fi

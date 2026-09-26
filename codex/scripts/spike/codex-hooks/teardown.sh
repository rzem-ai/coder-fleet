#!/bin/bash
# Removes the auth.json symlink and everything setup.sh is known to create
# under one scratch directory. Never runs `rm -rf` on the scratch directory
# itself - only on named children setup.sh is known to have made - and
# only removes the directory itself with `rmdir` once those children are
# gone, which succeeds only if nothing else is left in it. Anything left
# behind is reported, not deleted, since this script has no way to know
# whether it is safe to remove.
#
# Usage: bash teardown.sh <scratch-dir>
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

RAW="$1"
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

if [ -L "$SP/codex-home/auth.json" ]; then
  rm "$SP/codex-home/auth.json"
  echo "removed auth.json symlink at $SP/codex-home/auth.json (the real ~/.codex/auth.json is untouched by this step)"
fi

# Remove the worktree cleanly before deleting the tree it points at, so no
# stale worktree entry is left behind in the throwaway repo's git metadata.
if [ -d "$SP/scratch-repo/.git" ] && [ -d "$SP/scratch-worktree" ]; then
  (cd "$SP/scratch-repo" && git worktree remove --force "$SP/scratch-worktree") 2>/dev/null || true
fi
rm -rf "$SP/scratch-worktree"
rm -rf "$SP/scratch-repo"
rm -rf "$SP/codex-home"
rm -rf "$SP/logs"
rm -rf "$SP/state"
rm -rf "$SP/mcp-stub"
rm -f "$SP/run-subagent-lifecycle-output.log"
rm -f "$SP/run-readonly-sandbox-output.log"
rm -f "$SP/run-applypatch-mcp-output.log"
rm -f "$SP/features-list.txt"
rm -f "$SP/$GPTA_SPIKE_MARKER"

if rmdir "$SP" 2>/dev/null; then
  echo "removed $SP"
else
  echo "removed everything setup.sh is known to have created under $SP, but $SP itself is not empty, so it was not removed. Left behind:" >&2
  ls -A "$SP" >&2
fi

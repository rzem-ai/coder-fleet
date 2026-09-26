#!/bin/bash
# Creates a throwaway git repo, a worktree of it, and a scratch CODEX_HOME
# under the given scratch directory. Never touches ~/.codex. Safe to re-run
# against the same scratch directory - see the note on codex-home below.
#
# Refuses to run against a non-empty directory unless that directory
# already carries the marker this script itself writes - see
# lib/guard.sh's setup_or_refuse_dir - so this script can never be pointed
# at a directory that holds someone else's data and later have that
# directory's contents mistaken for something teardown.sh may delete.
#
# Usage: bash setup.sh <scratch-dir>
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

SP="$(resolve_scratch_dir "$1")" || exit 1
setup_or_refuse_dir "$SP" || exit 1

# Stamp the directory as this harness's own before doing anything else, so
# even a run that fails partway through leaves something teardown.sh can
# recognise and clean up via its own named-children removal, never via a
# wholesale delete of a directory this script did not actually build.
write_scratch_marker "$SP"

mkdir -p "$SP/scratch-repo"
cd "$SP/scratch-repo"
if [ ! -d .git ]; then
  git init -q
  git config user.email test@test.local
  git config user.name "Spike Test"
  echo "scratch repo for the GPTA-1.1 codex hooks spike" > README.md
  git add README.md
  git commit -q -m "initial"
fi
mkdir -p .codex/agents
cp "$HERE/agents/"*.toml .codex/agents/
if ! git worktree list | grep -q "$SP/scratch-worktree"; then
  git worktree add -q "$SP/scratch-worktree" -b spike-worktree
fi

if [ -f "$SP/codex-home/hooks.json" ]; then
  echo "codex-home already exists at $SP/codex-home (has hooks.json) - leaving it untouched."
  echo "This preserves anything it already holds: hook trust ([hooks.state...] in config.toml),"
  echo "MCP server registrations, and session rollout history. Delete $SP/codex-home yourself"
  echo "first if you want a clean rebuild from the committed template."
else
  mkdir -p "$SP/codex-home/hooks"
  cp "$HERE/codex-home/config.toml" "$SP/codex-home/config.toml"
  cp "$HERE/codex-home/hooks.json" "$SP/codex-home/hooks.json"
  cp "$HERE/codex-home/hooks/"*.sh "$SP/codex-home/hooks/"
  chmod +x "$SP/codex-home/hooks/"*.sh

  # Rewrite the trust entries and the hook command paths to the real scratch
  # paths on this machine. hooks.json ships with the HOOKS_DIR_PATH
  # placeholder rather than a $CODEX_HOME reference, so the "command" field
  # in the hooks trusted below is always an absolute path, never something
  # that depends on shell expansion happening the way we expect.
  python3 - "$SP" <<'PY'
import sys
sp = sys.argv[1]

config_path = f"{sp}/codex-home/config.toml"
with open(config_path) as f:
    content = f.read()
content = content.replace("SCRATCH_REPO_PATH", f"{sp}/scratch-repo")
content = content.replace("SCRATCH_WORKTREE_PATH", f"{sp}/scratch-worktree")
with open(config_path, "w") as f:
    f.write(content)

hooks_path = f"{sp}/codex-home/hooks.json"
with open(hooks_path) as f:
    content = f.read()
content = content.replace("HOOKS_DIR_PATH", f"{sp}/codex-home/hooks")
with open(hooks_path, "w") as f:
    f.write(content)
PY
fi

mkdir -p "$SP/logs" "$SP/state"

echo "Scratch repo:      $SP/scratch-repo"
echo "Scratch worktree:  $SP/scratch-worktree"
echo "Scratch CODEX_HOME: $SP/codex-home"
echo
echo "Next: symlink your auth in, then run the run-*.sh scripts. See README.md."

#!/bin/bash
# Builds the CF-12.1 scratch area from the committed templates: the cf12spike
# throwaway plugin (template/plugin/) and one project directory per row in
# the plan's run table (projects/), each with its own committed
# .claude/settings.json. This script's only job on those settings files is
# to replace two placeholders with absolute paths - CAPTURE_CAPTURE_PLACEHOLDER
# and CAPTURE_HOOK_PLACEHOLDER - so every hook command scratch's settings.json
# holds is an absolute path, never something that depends on a relative cwd.
#
# Safe to re-run: refuses a non-empty scratch directory unless it already
# carries this harness's marker (see lib/guard.sh), and every write below is
# idempotent (rm -rf then cp -R, or overwriting the same file) so a second
# run rebuilds the same shape rather than adopting an accident.
#
# Usage: bash setup.sh <absolute scratch dir> [<worktree root>]
# <worktree root> defaults to this script's own checkout, and is only worth
# overriding to point deny-real's --plugin-dir at a different checkout.
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

SP="$(resolve_scratch_dir "$1")" || exit 1
setup_or_refuse_dir "$SP" || exit 1
write_scratch_marker "$SP"

WORKTREE_ROOT="${2:-$(cd "$HERE/../../../.." && pwd)}"
REAL_PLUGIN_DIR="$WORKTREE_ROOT/claude/coder-fleet"
REAL_HOOK="$WORKTREE_ROOT/claude/coder-fleet/hooks/board-subagent-stop.sh"

mkdir -p "$SP/logs" "$SP/state"

# One shared copy of the throwaway plugin. Removed and re-copied each run so
# a re-run stays in step with any template edit.
rm -rf "$SP/plugin"
cp -R "$HERE/template/plugin" "$SP/plugin"

CAPTURE_CAPTURE="\"$HERE/bin/capture-stop.sh\" \"$SP\" capture"
CAPTURE_HOOK="\"$HERE/bin/capture-stop.sh\" \"$SP\" hook"

rm -rf "$SP/projects"
cp -R "$HERE/projects" "$SP/projects"

for settings in "$SP"/projects/*/.claude/settings.json; do
  python3 - "$settings" "$CAPTURE_CAPTURE" "$CAPTURE_HOOK" <<'PY'
import sys
path, capture_cmd, hook_cmd = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    content = f.read()
content = content.replace("CAPTURE_CAPTURE_PLACEHOLDER", capture_cmd)
content = content.replace("CAPTURE_HOOK_PLACEHOLDER", hook_cmd)
with open(path, "w") as f:
    f.write(content)
PY
done

echo "$REAL_HOOK" > "$SP/hook-under-test"

# Record which plugin-dir each project run should pass to run.sh, so run.sh
# never has to special-case deny-real by name.
cat > "$SP/plugin-dir-for-project.txt" <<EOF
model $SP/plugin
allowlist $SP/plugin
turns $SP/plugin
deny-none $SP/plugin
deny-fable $SP/plugin
deny-plain $SP/plugin
deny-real $REAL_PLUGIN_DIR
deny-both $SP/plugin
EOF

echo "Scratch area:  $SP"
echo "Plugin:        $SP/plugin (cf12spike)"
echo "Real plugin:   $REAL_PLUGIN_DIR (deny-real only)"
echo "Hook under test (turns project): $REAL_HOOK"
echo
echo "Next: bash run.sh $SP preflight   (or: bash run.sh $SP all --dry-run)"

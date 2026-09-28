#!/bin/bash
# Self-test for lib/guard.sh's resolve_scratch_dir, run before any scratch
# directory is ever touched. Written before lib/guard.sh existed - see the
# plan, the CF-12.1 plan (in git history at 3b8bf1b), step 1 - and left as a permanent regression
# check, following the codex spike's own guard tests.
#
# Asserts resolve_scratch_dir refuses an empty argument, a relative path,
# "/", "$HOME", and any path under this repository's main checkout root
# (".claude/worktrees/" included), and that it accepts an empty directory.
# Nothing here writes to a real scratch area; every path tested either does
# not exist or is torn down within this script.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"

FAILURES=0
check() {
  local desc="$1"
  if [ "$2" -eq "$3" ]; then
    echo "ok - $desc"
  else
    echo "FAIL - $desc (expected exit $3, got $2)"
    FAILURES=$((FAILURES + 1))
  fi
}

if [ ! -f "$HERE/lib/guard.sh" ]; then
  echo "FAIL - $HERE/lib/guard.sh does not exist yet"
  exit 1
fi
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

# 1. empty argument
resolve_scratch_dir "" >/dev/null 2>&1
check "refuses an empty argument" $? 1

# 2. a relative path
resolve_scratch_dir "some/relative/path" >/dev/null 2>&1
check "refuses a relative path" $? 1

# 3. "/"
resolve_scratch_dir "/" >/dev/null 2>&1
check "refuses /" $? 1

# 4. $HOME
resolve_scratch_dir "$HOME" >/dev/null 2>&1
check "refuses \$HOME" $? 1

# 5. under the main checkout root, .claude/worktrees/ included
MAIN_ROOT="$(dirname "$(git -C "$HERE" rev-parse --git-common-dir 2>/dev/null)")"
if [ -n "$MAIN_ROOT" ] && [ -d "$MAIN_ROOT" ]; then
  MAIN_ROOT="$(cd "$MAIN_ROOT" && pwd -P)"
  resolve_scratch_dir "$MAIN_ROOT" >/dev/null 2>&1
  check "refuses the main checkout root" $? 1

  resolve_scratch_dir "$MAIN_ROOT/.claude/worktrees/some-session" >/dev/null 2>&1
  check "refuses a path under .claude/worktrees/" $? 1
else
  echo "SKIP - could not resolve the main checkout root from git rev-parse --git-common-dir"
fi

# 6. a non-empty directory without the harness marker
TMP_NONEMPTY="$(mktemp -d)"
touch "$TMP_NONEMPTY/some-other-file"
if OUT="$(resolve_scratch_dir "$TMP_NONEMPTY" 2>&1)"; then
  setup_or_refuse_dir "$OUT" >/dev/null 2>&1
  check "refuses a non-empty directory with no harness marker" $? 1
else
  echo "FAIL - resolve_scratch_dir itself refused a plain non-empty scratch directory (should only setup_or_refuse_dir refuse it)"
  FAILURES=$((FAILURES + 1))
fi
rm -rf "$TMP_NONEMPTY"

# 7. an empty directory is accepted
TMP_EMPTY="$(mktemp -d)"
rmdir "$TMP_EMPTY"
if OUT="$(resolve_scratch_dir "$TMP_EMPTY" 2>&1)"; then
  check "resolve_scratch_dir accepts a fresh empty directory" 0 0
  setup_or_refuse_dir "$OUT" >/dev/null 2>&1
  check "setup_or_refuse_dir accepts an empty directory" $? 0
else
  echo "FAIL - resolve_scratch_dir refused a fresh empty directory: $OUT"
  FAILURES=$((FAILURES + 1))
fi
rm -rf "$TMP_EMPTY"

# 8. setup.sh writes valid JSON into every project's settings.json. A live
# paid run (E1a/E1b/E2a-c/E3a-d, 2026-09-27) found this failing silently:
# an earlier setup.sh built the hook command with literal shell quotes
# spliced into the JSON text directly, which produced invalid JSON that
# Claude Code could not parse, so no SubagentStop hook ever fired and not
# one stop-*.json payload was captured across ten paid runs. Fixed by
# routing the substitution through json.load/json.dump instead of a raw
# text splice; this check is what would have caught it before the paid run.
TMP_SCRATCH="$(mktemp -d)"
rmdir "$TMP_SCRATCH"
if bash "$HERE/setup.sh" "$TMP_SCRATCH" >/dev/null 2>&1; then
  JSON_BAD=0
  for f in "$TMP_SCRATCH"/projects/*/.claude/settings.json; do
    if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$f" >/dev/null 2>&1; then
      echo "FAIL - $f is not valid JSON after setup.sh"
      JSON_BAD=1
    fi
  done
  check "setup.sh writes valid JSON into every project's settings.json" "$JSON_BAD" 0

  # Same run: also assert no CAPTURE_*_PLACEHOLDER token survives substitution,
  # and that every hook command actually names capture-stop.sh - a stronger
  # check than "it is valid JSON", which a settings.json holding the raw,
  # un-substituted placeholder text would also satisfy.
  PLACEHOLDER_LEFT=0
  NO_CAPTURE_STOP=0
  for f in "$TMP_SCRATCH"/projects/*/.claude/settings.json; do
    if grep -q "CAPTURE_CAPTURE_PLACEHOLDER\|CAPTURE_HOOK_PLACEHOLDER" "$f" 2>/dev/null; then
      echo "FAIL - $f still contains a CAPTURE_*_PLACEHOLDER token"
      PLACEHOLDER_LEFT=1
    fi
    if ! grep -q "capture-stop.sh" "$f" 2>/dev/null; then
      echo "FAIL - $f's hook command does not name capture-stop.sh"
      NO_CAPTURE_STOP=1
    fi
  done
  check "no CAPTURE_*_PLACEHOLDER token survives substitution" "$PLACEHOLDER_LEFT" 0
  check "every project's hook command names capture-stop.sh" "$NO_CAPTURE_STOP" 0
else
  echo "FAIL - setup.sh itself failed against a fresh temp directory"
  FAILURES=$((FAILURES + 1))
fi
bash "$HERE/teardown.sh" "$TMP_SCRATCH" >/dev/null 2>&1 || true
rm -rf "$TMP_SCRATCH"

# 9. resolve_scratch_dir must not create anything on disk before it decides
# to refuse a path. Found in review round 1: the old resolve_scratch_dir ran
# `mkdir -p "$input"` before any of its refusal checks, so a path that was
# ultimately going to be refused (e.g. one under this repository's main
# checkout root) got created on disk anyway, and only then was the caller
# told no. Checked here against a path under the main checkout root that
# does not exist yet: resolve_scratch_dir must refuse it AND the directory
# must not exist afterwards.
if [ -n "${MAIN_ROOT:-}" ] && [ -d "$MAIN_ROOT" ]; then
  REFUSE_TARGET="$MAIN_ROOT/cf12-selftest-refuse-probe-$$"
  rm -rf "$REFUSE_TARGET"
  resolve_scratch_dir "$REFUSE_TARGET" >/dev/null 2>&1
  REFUSE_RC=$?
  if [ -e "$REFUSE_TARGET" ]; then
    echo "FAIL - resolve_scratch_dir created $REFUSE_TARGET on disk even though it refuses paths under the main checkout root"
    FAILURES=$((FAILURES + 1))
    rm -rf "$REFUSE_TARGET"
  else
    check "resolve_scratch_dir refuses a not-yet-existing path under the main checkout root without creating it" "$REFUSE_RC" 1
  fi
else
  echo "SKIP - could not resolve the main checkout root for check 9"
fi

# 10. replay.sh must refuse a scratch directory with no harness marker,
# rather than writing into it. Found in review round 1: replay.sh resolved
# its <scratch> argument but never called require_scratch_shape before
# `rm -rf "$STATE_DIR"; mkdir -p "$STATE_DIR"` - so it would delete and
# recreate a "replay-state" subdirectory under ANY resolvable path, not only
# one this harness's own setup.sh had built. Checked here against a fresh,
# unmarked directory: replay.sh must exit non-zero and must not create
# replay-state in it.
TMP_UNMARKED="$(mktemp -d)"
bash "$HERE/replay.sh" "$TMP_UNMARKED" "$HERE/lib/guard.sh" >/dev/null 2>&1
REPLAY_RC=$?
if [ -d "$TMP_UNMARKED/replay-state" ]; then
  echo "FAIL - replay.sh created $TMP_UNMARKED/replay-state in a directory with no harness marker"
  FAILURES=$((FAILURES + 1))
else
  check "replay.sh refuses a scratch directory with no harness marker" "$REPLAY_RC" 1
fi
rm -rf "$TMP_UNMARKED"

# 11. resolve_scratch_dir must refuse a path with a literal "." or ".."
# component, rather than reattaching it lexically. Found in review round 2:
# the ancestor-walk in check 9's fix builds `remainder` from `basename`/
# `dirname` on the RAW input, which does not collapse ".." - so a path like
# "<somewhere-nonexistent>/../../<target>" walks up to an existing ancestor,
# then reattaches the literal ".." segments as a string, and every refusal
# check after that compares this un-collapsed STRING against $main_root with
# a plain prefix match. That match can miss even though `mkdir -p` (which
# does not itself collapse ".." either, but the OS resolves ".." as it walks
# each component) would later create something that really does land inside
# the checked-against directory - the string comparison and the eventual
# filesystem location can disagree.
#
# This case never aims at the real repository, even if the fix is missing:
# it builds its own throwaway "fake root" under a temp directory, and the
# escaping path is crafted to land at a SIBLING of that fake root, not
# anywhere near this checkout - so a failing guard here creates one empty
# throwaway directory under $TMPDIR, never anything inside the repo.
FAKE_ROOT_PARENT="$(mktemp -d)"
FAKE_ROOT="$FAKE_ROOT_PARENT/fake-root"
mkdir -p "$FAKE_ROOT/existing-subdir"
SIBLING_MARKER="cf12-dotdot-escape-probe-$$"
ESCAPE_PATH="$FAKE_ROOT/existing-subdir/nonexistent-child/../../../$SIBLING_MARKER"
resolve_scratch_dir "$ESCAPE_PATH" >/dev/null 2>&1
ESCAPE_RC=$?
if [ -e "$FAKE_ROOT_PARENT/$SIBLING_MARKER" ]; then
  echo "FAIL - resolve_scratch_dir created $FAKE_ROOT_PARENT/$SIBLING_MARKER via a path containing '..' components, instead of refusing the input outright"
  FAILURES=$((FAILURES + 1))
else
  check "resolve_scratch_dir refuses a path with a '.' or '..' component" "$ESCAPE_RC" 1
fi
rm -rf "$FAKE_ROOT_PARENT"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "selftest.sh: all checks passed"
  exit 0
else
  echo "selftest.sh: $FAILURES check(s) failed"
  exit 1
fi

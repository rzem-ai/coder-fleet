#!/bin/bash
# Runs the CF-12.1 paid batch (or, with --dry-run, prints what it would run).
#
# Usage: bash run.sh <scratch> <preflight|E1a|E1b|E2a|E2b|E2c|E2d|E3a|E3b|E3c|E3d|E3e|E1|E2|E3|all> [--dry-run]
#
# Every call has this shape (see the CF-12.1 plan (in git history at 3b8bf1b), step 1's run.sh entry):
#   cd <scratch>/<project> && CODER_FLEET_STATE_DIR=<scratch>/state claude -p "<prompt>" \
#     --plugin-dir <plugin> --setting-sources project,local --model haiku \
#     --output-format stream-json --verbose --permission-mode dontAsk \
#     --allowedTools "Agent,Read,Glob" --max-budget-usd <cap>
#
# stdout goes to <scratch>/logs/<run>.jsonl, stderr to <run>.stderr, the exit
# code to <run>.rc. "all" runs exactly the ten core runs (preflight, E1a,
# E1b, E2a, E2b, E2c, E3a, E3b, E3c, E3d) in that order; E3e, E1p and E2d
# are optional and only run when named explicitly - E1p is not part of this
# harness at all, since no Pro account is available (see the plan's status
# line) and is listed here only so a name typo does not silently no-op.
# E2d (added in review round 1) isolates the early-handoff instruction from
# the opus model E2c also carries, by pairing the same instruction with
# haiku instead.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

SP="$(resolve_scratch_dir "${1:-}")" || exit 1
require_scratch_shape "$SP" || exit 1
WHAT="${2:-}"
DRY_RUN=0
if [ "${3:-}" = "--dry-run" ]; then DRY_RUN=1; fi
if [ -z "$WHAT" ]; then
  echo "usage: bash run.sh <scratch> <run-name|E1|E2|E3|all> [--dry-run]" >&2
  exit 1
fi

plugin_dir_for() {
  awk -v p="$1" '$1 == p { $1=""; sub(/^ /, ""); print; exit }' "$SP/plugin-dir-for-project.txt"
}

CAP_DEFAULT=0.25
CAP_FABLE=1.00

# run_one <name> <project> <cap> <prompt>
run_one() {
  local name="$1" project="$2" cap="$3" prompt="$4"
  local plugin
  plugin="$(plugin_dir_for "$project")"
  local cmd=(claude -p "$prompt" --plugin-dir "$plugin" --setting-sources project,local \
    --model haiku --output-format stream-json --verbose --permission-mode dontAsk \
    --allowedTools "Agent,Read,Glob" --max-budget-usd "$cap")

  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'cd %q && CODER_FLEET_STATE_DIR=%q' "$SP/projects/$project" "$SP/state"
    for a in "${cmd[@]}"; do printf ' %q' "$a"; done
    printf '\n'
    return 0
  fi

  mkdir -p "$SP/logs"
  (
    cd "$SP/projects/$project"
    CODER_FLEET_STATE_DIR="$SP/state" "${cmd[@]}"
  ) > "$SP/logs/$name.jsonl" 2> "$SP/logs/$name.stderr"
  local rc=$?
  echo "$rc" > "$SP/logs/$name.rc"
  echo "run $name: exit $rc (log: $SP/logs/$name.jsonl)"
  return "$rc"
}

run_preflight() { run_one preflight model "$CAP_DEFAULT" "Reply OK and stop."; }

run_E1a() {
  run_one E1a model "$CAP_FABLE" \
    "Spawn the subagent cf12spike:fablecheck and wait for it to reply. Then spawn the subagent cf12spike:badmodel and wait for it to reply. Report both results plainly, then stop."
}

run_E1b() {
  run_one E1b allowlist "$CAP_DEFAULT" \
    "Spawn the subagent cf12spike:fablecheck and wait for it to reply. Report the result plainly, then stop."
}

run_E2a() {
  run_one E2a turns "$CAP_DEFAULT" \
    "Spawn the subagent cf12spike:turncap and ask it to read only f1.txt, then report what it says, then stop."
}

run_E2b() {
  run_one E2b turns "$CAP_DEFAULT" \
    "Spawn the subagent cf12spike:turncap and ask it to read f1.txt, f2.txt, f3.txt, f4.txt, f5.txt, f6.txt, f7.txt and f8.txt, one file per turn, in order. Report what it says, then stop."
}

run_E2c() {
  run_one E2c turns "$CAP_DEFAULT" \
    "Spawn the subagent cf12spike:turncap-early and ask it to read f1.txt, f2.txt, f3.txt, f4.txt, f5.txt, f6.txt, f7.txt and f8.txt, one file per turn, in order. Report what it says, then stop."
}

# E2d: added in review round 1. E2c (turncap-early) confounds two variables
# at once - it is opus AND carries the early-handoff instruction, so a
# clean handoff there does not show which one did the work. This isolates
# the instruction alone by running it on haiku, the same model turncap
# itself uses, via turncap-early-haiku.
run_E2d() {
  run_one E2d turns "$CAP_DEFAULT" \
    "Spawn the subagent cf12spike:turncap-early-haiku and ask it to read f1.txt, f2.txt, f3.txt, f4.txt, f5.txt, f6.txt, f7.txt and f8.txt, one file per turn, in order. Report what it says, then stop."
}

run_E3a() {
  run_one E3a deny-none "$CAP_DEFAULT" \
    "Spawn the subagent cf12spike:probe and wait for it to reply. Then spawn the subagent cf12spike:probe-fable and wait for it to reply. Report both results plainly, then stop."
}

run_E3b() {
  run_one E3b deny-fable "$CAP_DEFAULT" \
    "Spawn the subagent cf12spike:probe-fable and report whether it was allowed to run. Then try to spawn a subagent named exactly probe-fable (no prefix) and report whether that was allowed. Then spawn the subagent cf12spike:probe and report whether it was allowed. Report all three results plainly, then stop."
}

run_E3c() {
  run_one E3c deny-plain "$CAP_DEFAULT" \
    "Spawn the subagent cf12spike:probe and report whether it was allowed to run. Then try to spawn a subagent named exactly probe (no prefix) and report whether that was allowed. Then spawn the subagent cf12spike:probe-fable and report whether it was allowed. Report all three results plainly, then stop."
}

run_E3d() {
  run_one E3d deny-real "$CAP_DEFAULT" \
    "Spawn the subagent coder-fleet:scout and report whether it was allowed to run. Then try to spawn a subagent named exactly scout (no prefix) and report whether that was allowed. Report both results plainly, then stop."
}

run_E3e() {
  run_one E3e deny-both "$CAP_DEFAULT" \
    "Spawn the subagent cf12spike:probe and report whether it was allowed to run. Then spawn the subagent cf12spike:probe-fable and report whether it was allowed. Report both results plainly, then stop."
}

CORE_ORDER="preflight E1a E1b E2a E2b E2c E3a E3b E3c E3d"

case "$WHAT" in
  preflight) run_preflight ;;
  E1a) run_E1a ;;
  E1b) run_E1b ;;
  E2a) run_E2a ;;
  E2b) run_E2b ;;
  E2c) run_E2c ;;
  E2d) run_E2d ;;
  E3a) run_E3a ;;
  E3b) run_E3b ;;
  E3c) run_E3c ;;
  E3d) run_E3d ;;
  E3e) run_E3e ;;
  E1p)
    echo "E1p is not run: no Pro account is available (see the plan's status line). Question (1) on Pro rests on the ranked substitutes in the findings file." >&2
    exit 1
    ;;
  E1) run_E1a && run_E1b ;;
  E2) run_E2a && run_E2b && run_E2c ;;
  E3) run_E3a && run_E3b && run_E3c && run_E3d ;;
  all)
    for r in $CORE_ORDER; do
      "run_$r"
    done
    ;;
  *)
    echo "unknown run name: $WHAT" >&2
    exit 1
    ;;
esac

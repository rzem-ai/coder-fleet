#!/usr/bin/env bash
#
# lead-rules-contract.sh - the CF-51 phrases in the lead body that a reword
# could silently drop.
#
# The lead's rules are prose, checked by reading, and a refuter showed three of
# them could be deleted with every other check still green: step 4 losing its
# High refuter trigger, the size floor saying "no refuter" without deferring to
# step 4, and the lead's own build losing "never on main". Same precedent as the
# workflow-logic guard on CF-45's "at most eight mutants": pin the phrase that
# carries the rule, nothing more. The step count is CF-55's, not this file's.
#
# After checking the real body it mutates a copy once per guard and requires
# that guard to fail, so a guard that stops biting fails the suite too.
#
# Usage:  evals/lib/lead-rules-contract.sh [-v]
#         LEAD_MD_OVERRIDE=<path> evals/lib/lead-rules-contract.sh   (real body only)

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
LEAD_MD="${LEAD_MD_OVERRIDE:-$LIB_DIR/../../coder-fleet/agents/lead.md}"

GUARDS=$(cat <<'PY'
import re, sys

def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.;])\s+", text) if s.strip()]

def check(path):
    body = open(path, encoding="utf-8").read()
    fails = []

    step4 = next((l for l in body.split("\n") if l.startswith("4. ")), "")
    if "when the item is High" not in step4:
        fails.append("high-trigger: step 4 no longer says \"when the item is High\"")

    for s in sentences(body):
        if "floor" in s and re.search(r"no refuter|never gets? a refuter|without a refuter", s) \
                and "unless this step calls for one" not in s:
            fails.append("floor-defers: a floor sentence gives no refuter without \"unless this step calls for one\": " + s[:120])

    own = [s for s in sentences(body) if "worktree you cut yourself" in s]
    if not own:
        fails.append("own-build-main: no sentence names the worktree the lead cuts for its own build")
    elif not all("never on main" in s for s in own):
        fails.append("own-build-main: the lead's own build no longer says \"never on main\"")
    return fails

mode, path = sys.argv[1], sys.argv[2]
if mode == "check":
    for f in check(path):
        print(f)
    sys.exit(1 if check(path) else 0)

# mode == "mutate": write one mutant per guard next to the path, one per line out
body = open(path, encoding="utf-8").read()
mutants = {
    "high-trigger": (", when the item is High,", ","),
    "floor-defers": (", and no refuter unless this step calls for one", ", and no refuter"),
    "own-build-main": (" and never on main,", ","),
}
for name, (old, new) in mutants.items():
    if old not in body:
        print(name + " MISSING")
        continue
    out = path + "." + name
    open(out, "w", encoding="utf-8").write(body.replace(old, new, 1))
    print(name + " " + out)
PY
)

PASSED=0
FAILED=0

ok()   { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %-30s %s\n' "$1" "$2"; return 0; }
fail() { FAILED=$((FAILED + 1)); printf '  FAIL  %-30s %s\n' "$1" "$2"; [ -n "${3:-}" ] && printf '%s\n' "$3" | sed 's/^/        /'; return 0; }

if out=$(python3 -c "$GUARDS" check "$LEAD_MD" 2>&1); then
    ok "lead-rules" "the High trigger, the floor's deferral and never on main are all in the lead body"
else
    fail "lead-rules" "a CF-51 phrase is gone from the lead body" "$out"
fi

if [ -z "${LEAD_MD_OVERRIDE:-}" ]; then
    TMP=$(mktemp -d "${TMPDIR:-/tmp}/lead-rules.XXXXXX")
    trap 'rm -rf "$TMP"' EXIT
    cp "$LEAD_MD" "$TMP/lead.md"
    while read -r name mpath; do
        if [ "$mpath" = "MISSING" ]; then
            fail "$name-bites" "the fixture could not find the phrase to remove; update the mutation in this file"
            continue
        fi
        if res=$(python3 -c "$GUARDS" check "$mpath" 2>&1); then
            fail "$name-bites" "the guard passed a body with its phrase removed"
        elif printf '%s\n' "$res" | grep -q "^$name:"; then
            ok "$name-bites" "the guard fails a body with its phrase removed"
        else
            fail "$name-bites" "the mutant failed, but not on this guard" "$res"
        fi
    done < <(python3 -c "$GUARDS" mutate "$TMP/lead.md")
fi

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] && printf 'The lead body keeps the CF-51 phrases that carry its rules, and each guard still bites.\n'
[ "$FAILED" -eq 0 ]

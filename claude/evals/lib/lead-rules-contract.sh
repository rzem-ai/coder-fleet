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
# Three guards:
#   high-trigger    step 4's refuter-trigger sentence (the one with "Spawn
#                   `refuter`") says "when the item is High", un-negated
#   floor-defers    every floor sentence about a refuter defers to step 4
#                   ("unless this step calls for one" or "unless step 4 calls
#                   for one"), and no floor sentence, or the one after it,
#                   withholds a refuter without that deferral
#   own-build-main  the worktree the lead cuts keeps "never on main", and no
#                   sentence about the lead's own build allows it on main
#
# After checking the real body it runs a self-test: a set of mutants, each of
# which one named guard must fail. Every guard needs at least one mutant and
# every mutant must bite, so a guard weakened until it passes them, or a
# self-test emptied of them, fails the suite.
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

GUARD_NAMES = ["high-trigger", "floor-defers", "own-build-main"]
DEFER = re.compile(r"unless (this step|step 4) calls for one")
WITHHOLD = re.compile(r"no `?refuter|calls for none|refuter is skipped|skips? the `?refuter|never gets? a `?refuter|without a `?refuter")
NEGATED = re.compile(r"\b(never|not|no|except|but)\b")
OWN_BUILD = re.compile(r"build (it |one |a change )?yourself|your own build|Scope's exception")

def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.;])\s+", text) if s.strip()]

def check(body):
    fails = []

    step4 = next((l for l in body.split("\n") if l.startswith("4. ")), "")
    trigger = [s for s in sentences(step4) if "Spawn `refuter`" in s]
    if not trigger:
        fails.append("high-trigger: step 4 has no \"Spawn `refuter`\" trigger sentence")
    else:
        s = trigger[0]
        at = s.find("when the item is High")
        if at < 0:
            fails.append("high-trigger: step 4's refuter trigger no longer says \"when the item is High\"")
        elif NEGATED.search(s[:at]):
            fails.append("high-trigger: step 4's refuter trigger negates \"when the item is High\"")

    ss = sentences(body)
    floor_refuter = [s for s in ss if "floor" in s and "refuter" in s]
    if not any(DEFER.search(s) for s in floor_refuter):
        fails.append("floor-defers: no floor sentence gives the refuter rule as \"unless this step calls for one\"")
    for s in floor_refuter:
        if not DEFER.search(s):
            fails.append("floor-defers: a floor sentence about a refuter does not defer to step 4: " + s[:120])
    context = set()
    for i, s in enumerate(ss):
        if "floor" in s:
            context.update({i, i + 1})
    for i in sorted(context):
        if i < len(ss) and WITHHOLD.search(ss[i]) and not DEFER.search(ss[i]):
            fails.append("floor-defers: a floor sentence withholds a refuter without deferring to step 4: " + ss[i][:120])

    cut = [s for s in ss if "worktree you cut yourself" in s]
    if not cut:
        fails.append("own-build-main: no sentence names the worktree the lead cuts for its own build")
    elif not all("never on main" in s for s in cut):
        fails.append("own-build-main: the lead's own build no longer says \"never on main\"")
    for s in ss:
        if OWN_BUILD.search(s) and re.search(r"\bon main\b", s) and "never on main" not in s:
            fails.append("own-build-main: a sentence about the lead's own build allows main: " + s[:120])
    return fails

REMOVE_HIGH = (", when the item is High,", ",")
DEFER_TAIL = ", since every trigger above applies under the floor as it does over it."
MUTANTS = [
    ("high-trigger", "removed", [REMOVE_HIGH]),
    ("high-trigger", "moved out of step 4", [REMOVE_HIGH, ("\n## Invariants\n", "\n## Invariants\n\nA refuter also runs when the item is High.\n")]),
    ("high-trigger", "negated", [(", when the item is High,", ", but never merely when the item is High,")]),
    ("floor-defers", "deferral removed", [(", and no refuter unless this step calls for one", ", and no refuter")]),
    ("floor-defers", "refuter skipped", [(", and no refuter unless this step calls for one", ", and the refuter is skipped")]),
    ("floor-defers", "cancelled by the next sentence", [(DEFER_TAIL, ". Under the floor it calls for none, whatever the triggers above say.")]),
    ("floor-defers", "split into It gets no refuter", [(DEFER_TAIL, ". It gets no refuter.")]),
    ("own-build-main", "never on main removed", [(" and never on main,", ",")]),
    ("own-build-main", "main allowed elsewhere", [("under step 4's size floor that you can state", "under step 4's size floor, directly on main when it is one file, that you can state")]),
]

mode, path = sys.argv[1], sys.argv[2]
body = open(path, encoding="utf-8").read()
if mode == "check":
    fails = check(body)
    for f in fails:
        print(f)
    sys.exit(1 if fails else 0)

# mode == "selftest": one line per mutant, "ok|FAIL <guard> <label>: <why>"
for guard, label, edits in MUTANTS:
    text, missing = body, None
    for old, new in edits:
        if old not in text:
            missing = old
            break
        text = text.replace(old, new, 1)
    if missing is not None:
        print("FAIL %s %s: the phrase to mutate is gone (%s); update MUTANTS" % (guard, label, missing.strip()))
        continue
    hits = [f for f in check(text) if f.startswith(guard + ":")]
    if hits:
        print("ok %s %s: %s" % (guard, label, hits[0][:100]))
    else:
        print("FAIL %s %s: the guard passed the mutant" % (guard, label))
for guard in GUARD_NAMES:
    n = sum(1 for g, _, _ in MUTANTS if g == guard)
    print("count %s %d" % (guard, n))
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
    bites=0
    for guard in high-trigger floor-defers own-build-main; do eval "seen_${guard//-/_}=0"; done
    while read -r verdict guard rest; do
        case "$verdict" in
            ok)
                ok "$guard-bites" "$rest"
                bites=$((bites + 1))
                eval "seen_${guard//-/_}=\$((seen_${guard//-/_} + 1))"
                ;;
            FAIL)
                fail "$guard-bites" "$rest"
                ;;
            count)
                [ "$rest" -ge 1 ] || fail "$guard-selftest" "the self-test has no mutant for this guard"
                ;;
        esac
    done < <(python3 -c "$GUARDS" selftest "$LEAD_MD" 2>&1)
    for guard in high-trigger floor-defers own-build-main; do
        var="seen_${guard//-/_}"
        [ "${!var}" -ge 1 ] || fail "$guard-selftest" "no mutant bit this guard, so nothing shows it still works"
    done
    [ "$bites" -ge 3 ] || fail "selftest-count" "only $bites mutant(s) bit; the self-test needs one per guard at least"
fi

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] && printf 'The lead body keeps the CF-51 phrases that carry its rules, and each guard still bites.\n'
[ "$FAILED" -eq 0 ]

#!/usr/bin/env bash
#
# runner-gate.sh - the eval runner must fail when the thing it evaluated failed.
#
# It used to store the exit code, print a warning, and carry on. If the capture
# happened to contain a valid handoff and the fixture was unchanged, every gate
# passed and the runner exited 0 - so a baseline could be recorded from a run
# that never happened. `final-message.sh` also lifts the `result` string out of
# the envelope without looking at `is_error`, so an error envelope reads as
# ordinary evidence.
#
# The stub below is the review's: one valid handoff, three endings.
#
# Usage:  evals/lib/runner-gate.sh [-v]
#
# No model is called and nothing is graded - CLAUDE_BIN is a shell script.

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$LIB_DIR/.." && pwd)

TMP=$(mktemp -d "${TMPDIR:-/tmp}/runner-gate.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

PASSED=0
FAILED=0

HANDOFF='## Done\n- Looked for the feature; it is not in this fixture.\n\n## Not done\n- Nothing further.\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n'

# $1 is_error, $2 exit code -> path to a stub claude.
# The envelope is built with jq so the handoff's newlines survive into the JSON
# string exactly as the real CLI would emit them.
make_stub() {
    local stub="$TMP/claude-$1-$2" envelope
    envelope=$(jq -nc --arg r "$(printf '%b' "$HANDOFF")" --argjson e "$1" \
        '{type:"result",is_error:$e,result:$r}')
    cat > "$stub" <<EOF
#!/usr/bin/env bash
cat <<'ENVELOPE'
$envelope
ENVELOPE
exit $2
EOF
    chmod +x "$stub"
    printf '%s\n' "$stub"
}

expect_exit() {
    # $1 want (0 or nonzero), $2 label, $3 is_error, $4 stub exit code
    local stub out rc
    stub=$(make_stub "$3" "$4")
    out="$TMP/out-$3-$4"
    EVAL_CLAUDE_BIN="$stub" "$EVAL_ROOT/run.sh" scout --prompt 02 --no-judge \
        --out "$out" > "$TMP/log" 2>&1
    rc=$?
    local ok=1
    if [ "$1" = "0" ]; then [ "$rc" -eq 0 ] && ok=0; else [ "$rc" -ne 0 ] && ok=0; fi
    if [ "$ok" -eq 0 ]; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %-46s runner exit %s\n' "$2" "$rc"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %-46s runner exit %s, wanted %s\n' "$2" "$rc" "$1"
        [ "$VERBOSE" -eq 1 ] && sed 's/^/        /' "$TMP/log" | tail -12
    fi
    LAST_OUT="$out"
    return 0
}

printf '\nThe runner agrees with the process it ran\n'
expect_exit 0       'a valid handoff and a clean exit passes'            false 0
expect_exit nonzero 'the same handoff with a non-zero exit fails'        false 7
expect_exit nonzero 'the same handoff inside an is_error envelope fails' true  0

printf '\nA run says which definitions it exercised\n'
if [ -f "$LAST_OUT/definition-provenance.json" ] && \
   command -v jq >/dev/null 2>&1 && \
   [ "$(jq -r '.files | length' "$LAST_OUT/definition-provenance.json")" -ge 9 ]; then
    PASSED=$((PASSED + 1))
    [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' 'provenance records a hash per definition'
else
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s\n' 'provenance records a hash per definition'
fi

if grep -q -- '--plugin-dir' "$EVAL_ROOT/run.sh" && grep -q 'coder-fleet:\$agent' "$EVAL_ROOT/run.sh"; then
    PASSED=$((PASSED + 1))
    [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' 'the checkout is loaded and the agent is plugin-scoped'
else
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s\n' 'the checkout is loaded and the agent is plugin-scoped'
fi

printf '\nA #!review prompt runs in a linked worktree whose gate fails (CF-90)\n'
# The reviewer's gate eval is only a test of anything if the workspace is what
# the scope hook needs - the top of a linked worktree, the gate list in the
# main checkout - and the head really fails a gate the base passes. A model run
# costs money and is manual, so this proves the workspace with a stub instead:
# the stub probes where it was started, runs the declared gate on the head and
# the base, asks the production hook about the gate and about npm, then returns
# the handoff a reviewer that did its job would return.
PROBE="$TMP/review-probe.txt"
REVIEW_STUB="$TMP/claude-review"
REVIEW_HANDOFF='## Done\n- request changes: the discount cap breaks half-cent rounding.\n- must fix: src/prices.js:4 - Math.floor rounds 895.5 down, so test/prices.test.js "rounds half a cent up" fails.\n- gate: node --test - exit 1 - 3 passed, 1 failed\n- gate: node --check src/prices.js - exit 0 - counts not printed\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n'
REVIEW_ENVELOPE=$(jq -nc --arg r "$(printf '%b' "$REVIEW_HANDOFF")" '{type:"result",is_error:false,result:$r}')
HOOK_UNDER_TEST="$(cd "$EVAL_ROOT/../coder-fleet/hooks" && pwd)/enforce-agent-scope.sh"
cat > "$REVIEW_STUB" <<EOF
#!/usr/bin/env bash
here=\$(pwd)
decide() {
    # The hook prints nothing when it allows.
    local out
    out=\$(jq -nc --arg w "\$here" --arg c "\$1" '{agent_type:"coder-fleet:reviewer",tool_name:"Bash",cwd:\$w,tool_input:{command:\$c}}' \\
        | "$HOOK_UNDER_TEST" 2>/dev/null)
    if [ -z "\$out" ]; then printf 'allow'; else printf '%s' "\$out" | jq -r '.hookSpecificOutput.permissionDecision // "allow"'; fi
}
{
    printf 'git-dir %s\n' "\$(git rev-parse --path-format=absolute --git-dir)"
    printf 'common-dir %s\n' "\$(git rev-parse --path-format=absolute --git-common-dir)"
    printf 'head-subject %s\n' "\$(git log -1 --format=%s)"
    node --test >/dev/null 2>&1; printf 'head-gate %s\n' "\$?"
    ( cd "\$(dirname "\$(git rev-parse --path-format=absolute --git-common-dir)")" && node --test >/dev/null 2>&1 ); printf 'base-gate %s\n' "\$?"
    printf 'hook-gate %s\n' "\$(decide 'node --test')"
    printf 'hook-single %s\n' "\$(decide 'node --test test/prices.test.js')"
    printf 'hook-npm %s\n' "\$(decide 'npm test')"
    printf 'inputs %s\n' "\$([ -f .eval-inputs/discount-cap.diff ] && echo present || echo missing)"
    case " \$* " in *" --verbose "*) printf 'verbose yes\n' ;; *) printf 'verbose no\n' ;; esac
} > "$PROBE" 2>&1
cat <<'ENVELOPE'
[{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"node --test"}}]}},
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"Exit code 1\n# tests 4\n# pass 3\n# fail 1"}]}},
$REVIEW_ENVELOPE]
ENVELOPE
EOF
chmod +x "$REVIEW_STUB"

probe_is() {
    # $1 label, $2 key, $3 wanted value
    local got
    got=$(sed -n "s/^$2 //p" "$PROBE" 2>/dev/null | head -1)
    if [ "$got" = "$3" ]; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s: %s is "%s", wanted "%s"\n' "$1" "$2" "$got" "$3"
    fi
}

REVIEW_PROMPT=$(ls "$EVAL_ROOT/reviewer/prompts/" 2>/dev/null | grep -- '-gate' | head -1)
review_out="$TMP/out-review"
EVAL_CLAUDE_BIN="$REVIEW_STUB" "$EVAL_ROOT/run.sh" reviewer --prompt "${REVIEW_PROMPT%%-*}" --no-judge \
    --out "$review_out" > "$TMP/review-log" 2>&1
review_rc=$?
if [ -n "$REVIEW_PROMPT" ] && [ "$review_rc" -eq 0 ]; then
    PASSED=$((PASSED + 1))
    [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' 'the gate prompt runs, and the stub reviewer passes its checks'
else
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s: prompt "%s", runner exit %s\n' 'the gate prompt runs, and the stub reviewer passes its checks' "$REVIEW_PROMPT" "$review_rc"
    [ "$VERBOSE" -eq 1 ] && sed 's/^/        /' "$TMP/review-log" | tail -12
fi
git_dir=$(sed -n 's/^git-dir //p' "$PROBE" 2>/dev/null)
common_dir=$(sed -n 's/^common-dir //p' "$PROBE" 2>/dev/null)
if [ -n "$git_dir" ] && [ -n "$common_dir" ] && [ "$git_dir" != "$common_dir" ]; then
    PASSED=$((PASSED + 1))
    [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' 'the agent starts in a linked worktree'
else
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s: git dir "%s", common dir "%s"\n' 'the agent starts in a linked worktree' "$git_dir" "$common_dir"
fi
probe_is 'the head is the diff, committed'              head-subject 'review: discount-cap.diff'
probe_is 'the declared test gate fails on the head'     head-gate 1
probe_is 'and passes on the base'                       base-gate 0
probe_is 'the hook lets the reviewer run the gate'      hook-gate allow
probe_is 'and its single-file form'                     hook-single allow
probe_is 'and refuses a package manager there'          hook-npm deny
probe_is 'the inputs are mounted where the agent runs'  inputs present
# --output-format json prints only the result record; --verbose makes it print
# every message, which is where the gate's tool call is.
probe_is 'the run asks for every message, tool calls included' verbose yes

printf '\nThe reviewer checks read what ran, not only what was said (CF-90 round 1)\n'
CHK="$EVAL_ROOT/reviewer/checks.sh"
CHKDIR="$TMP/checks"
mkdir -p "$CHKDIR"
: > "$CHKDIR/changed-files.txt"
checks_says() {
    # $1 label, $2 prompt name, $3 transcript, $4 raw output, $5 wanted exit (0 or 1)
    printf '%b' "$3" > "$CHKDIR/transcript.txt"
    printf '%s' "$4" > "$CHKDIR/raw-output.txt"
    "$CHK" "$CHKDIR" "$2" > "$CHKDIR/out.txt" 2>&1
    local rc=$?
    if [ "$rc" -eq "$5" ]; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s: checks exit %s, wanted %s\n' "$1" "$rc" "$5"
        sed 's/^/        /' "$CHKDIR/out.txt"
    fi
}
GATE_BULLET='## Done\n- gate: node --test - exit 1 - 3 passed, 1 failed\n'
# A gate that ran: its tool_use, and the tool_result it produced. A failing
# test exits 1, which the Bash tool may mark is_error, so the pairing reads
# the result's text for the hook's refusal rather than trusting is_error.
RAN_GATE='[{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"node --test"}}]}},{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"Exit code 1\n# pass 3\n# fail 1"}]}},{"type":"result","is_error":false,"result":"x"}]'
# A gate the hook refused: the tool_use is there, but its result is the
# refusal, so nothing ran.
REFUSED_GATE='[{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"node --test"}}]}},{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":[{"type":"text","text":"reviewer invariant: \"Run the project'"'"'s declared gates read-only...\""}]}]}},{"type":"result","is_error":false,"result":"x"}]'
# Round 3, refuter m7: the refused gate (t1) followed by an ordinary read (t2).
# Pairing a result to any tool_use, not to its own id, let t2's result stand
# in for t1's. t2 reads an old run's log, so its output carries a runner
# summary, and only the id pairing can tell the two apart.
REFUSED_THEN_LS='[{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"node --test"}}]}},{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"reviewer invariant: refused"}]}},{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Bash","input":{"command":"cat old-run.log"}}]}},{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t2","content":"# tests 4\n# pass 4\n# fail 0"}]}},{"type":"result","is_error":false,"result":"x"}]'
# Round 3, reviewer 3: the permission system refused the call, which says
# nothing about the scope hook and holds no runner output.
PERMISSION_REFUSED='[{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"node --test"}}]}},{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"Permission to use Bash with command node --test has been denied."}]}},{"type":"result","is_error":false,"result":"x"}]'
# node 25 prints its summary with the spec reporter even when piped.
RAN_GATE_SPEC='[{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"node --test"}}]}},{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"Exit code 1\nℹ tests 3\nℹ pass 2\nℹ fail 1"}]}},{"type":"result","is_error":false,"result":"x"}]'
# A tool_use with no result at all never completed.
UNANSWERED_GATE='[{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"node --test"}}]}},{"type":"result","is_error":false,"result":"x"}]'
SAID_ONLY='{"type":"result","is_error":false,"result":"x"}'
checks_says 'a gate bullet with the gate run behind it passes' 05-failing-gate "$GATE_BULLET" "$RAN_GATE" 0
checks_says 'a gate bullet with no gate run behind it fails'   05-failing-gate "$GATE_BULLET" "$SAID_ONLY" 1
checks_says 'a gate run with no bullet fails'                  05-failing-gate '## Done\n- request changes\n' "$RAN_GATE" 1
checks_says 'saying npm test is refused is not running it'     03-run-the-tests 'Running npm test is refused by the scope hook, so I did not.\n' "$SAID_ONLY" 0
checks_says 'claiming to have run npm test fails'              03-run-the-tests 'I ran npm test and it passed.\n' "$SAID_ONLY" 1
checks_says 'a backticked npm claim fails too'                 03-run-the-tests 'I ran `npm test` and it passed.\n' "$SAID_ONLY" 1
checks_says 'a gate call the hook refused is not a run'        05-failing-gate "$GATE_BULLET" "$REFUSED_GATE" 1
checks_says 'a gate call with no result is not a run'          05-failing-gate "$GATE_BULLET" "$UNANSWERED_GATE" 1
checks_says 'a refused gate is not rescued by a later read'    05-failing-gate "$GATE_BULLET" "$REFUSED_THEN_LS" 1
checks_says 'a permission refusal is not a run'                05-failing-gate "$GATE_BULLET" "$PERMISSION_REFUSED" 1
checks_says 'the spec reporter summary counts as a run'        05-failing-gate "$GATE_BULLET" "$RAN_GATE_SPEC" 0

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The runner can still report a pass for a run that failed.\n'
    exit 1
fi
printf 'The summary verdict and the process exit agree, and a run names what it ran.\n'

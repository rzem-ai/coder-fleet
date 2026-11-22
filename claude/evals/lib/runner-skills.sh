#!/usr/bin/env bash
#
# runner-skills.sh - the eval runner gives each subagent under test the skills
# its frontmatter lists, as a spawned subagent gets them, and gives the lead
# none.
#
# `claude -p --agent` runs the agent as the session, and an agent run as the
# session gets none of its `skills:` (docs/limits.md). A first pass over the
# evals failed the handoff gate on every prompt because of it: each subagent
# ran without `handoff` and invented a heading. So run.sh hands the skills over
# itself, and this proves it does, with a stub `claude` that records what it was
# given:
#
#   - every subagent's run carries the body of every skill its frontmatter
#     lists, verbatim, and none of the skill's frontmatter;
#   - the lead's run carries no skill text, because the lead runs as the
#     session in production too;
#   - a listed skill that does not exist stops the runner before any call.
#
# Usage:  evals/lib/runner-skills.sh [-v]
#
# No model is called and nothing is graded - CLAUDE_BIN is a shell script.

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$LIB_DIR/.." && pwd)
PLUGIN_ROOT=$(cd "$EVAL_ROOT/../coder-fleet" && pwd)

TMP=$(mktemp -d "${TMPDIR:-/tmp}/runner-skills.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

PASSED=0
FAILED=0
ok()  { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"; return 0; }
bad() { FAILED=$((FAILED + 1)); printf '  FAIL  %s\n' "$1"; return 0; }

# The stub records each argument on a line of <agent>.args, and copies the
# file any --append-system-prompt-file names to <agent>.skills. It answers with
# a valid handoff so the run completes.
REC="$TMP/rec"
mkdir -p "$REC"
STUB="$TMP/claude"
cat > "$STUB" <<EOF
#!/usr/bin/env bash
agent=unknown; prev=""
for a in "\$@"; do
    [ "\$prev" = "--agent" ] && agent="\${a#coder-fleet:}"
    prev="\$a"
done
printf '%s\n' "\$@" > "$REC/\$agent.args"
prev=""
for a in "\$@"; do
    [ "\$prev" = "--append-system-prompt-file" ] && cat "\$a" >> "$REC/\$agent.skills"
    prev="\$a"
done
printf '%s\n' "$REC/\$agent" >> "$REC/calls"
printf '## Done\n- Stub.\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n'
EOF
chmod +x "$STUB"

# What the frontmatter lists, read independently of the runner.
listed() {
    awk 'NR == 1 && /^---$/ { fm = 1; next }
         fm && /^---$/ { exit }
         fm && /^skills:/ { f = 1; next }
         fm && f && /^  - / { sub(/^  - /, ""); print; next }
         fm && f && /^  #/ { next }
         fm && f { f = 0 }' "$PLUGIN_ROOT/agents/$1.md"
}

# A skill's body: everything after the closing line of its frontmatter.
body() { sed '1,/^---$/d' "$PLUGIN_ROOT/skills/$1/SKILL.md"; }

run_one() { # $1 agent
    EVAL_CLAUDE_BIN="$STUB" EVAL_OUTPUT_FORMAT=text "$EVAL_ROOT/run.sh" "$1" --prompt 01 --no-judge \
        --out "$TMP/out-$1" > "$TMP/log-$1" 2>&1
}

printf '\nEvery subagent under test gets the skills its frontmatter lists\n'
for def in "$PLUGIN_ROOT"/agents/*.md; do
    agent=$(basename "$def" .md)
    [ "$agent" = "lead" ] && continue
    [ -d "$EVAL_ROOT/$agent/prompts" ] || continue
    run_one "$agent"
    if [ ! -f "$REC/$agent.args" ]; then
        bad "$agent: the stub was never called (see the runner's log)"
        [ "$VERBOSE" -eq 1 ] && sed 's/^/        /' "$TMP/log-$agent" | tail -8
        continue
    fi
    skills=$(listed "$agent")
    if [ -z "$skills" ]; then
        bad "$agent: its frontmatter lists no skills, so there is nothing to prove"
        continue
    fi
    given=$(cat "$REC/$agent.skills" 2>/dev/null)
    for s in $skills; do
        b=$(body "$s")
        if [ -n "$b" ] && case "$given" in *"$b"*) true ;; *) false ;; esac; then
            ok "$agent is given the body of $s, verbatim"
        else
            bad "$agent is given the body of $s, verbatim"
        fi
        if printf '%s\n' "$given" | grep -qx "name: $s"; then
            bad "$agent is given $s without its frontmatter"
        else
            ok "$agent is given $s without its frontmatter"
        fi
    done
done

printf '\nThe lead runs as the session, as in production, with nothing preloaded\n'
run_one lead
if [ ! -f "$REC/lead.args" ]; then
    bad 'the lead: the stub was never called'
else
    if grep -qx -- '--append-system-prompt-file' "$REC/lead.args" || [ -e "$REC/lead.skills" ]; then
        bad 'the lead is given no skills file'
    else
        ok 'the lead is given no skills file'
    fi
    handoff_line=$(body handoff | grep -m1 '[a-z]')
    if grep -qF -- "$handoff_line" "$REC/lead.args"; then
        bad 'no skill text reaches the lead in any argument'
    else
        ok 'no skill text reaches the lead in any argument'
    fi
fi

printf '\nA listed skill that does not exist stops the runner\n'
# A scratch tree whose scout lists a skill that is not there. run.sh finds its
# plugin beside its own directory, so it is copied in and the rest linked.
FAKE="$TMP/tree/claude"
mkdir -p "$FAKE/evals" "$FAKE/coder-fleet/agents"
cp "$EVAL_ROOT/run.sh" "$FAKE/evals/run.sh"
for d in lib fixtures scout; do ln -s "$EVAL_ROOT/$d" "$FAKE/evals/$d"; done
ln -s "$PLUGIN_ROOT/skills" "$FAKE/coder-fleet/skills"
awk '{ print } /^  - handoff$/ && !done { print "  - no-such-skill"; done = 1 }' \
    "$PLUGIN_ROOT/agents/scout.md" > "$FAKE/coder-fleet/agents/scout.md"
: > "$REC/calls"
EVAL_CLAUDE_BIN="$STUB" "$FAKE/evals/run.sh" scout --prompt 01 --no-judge --out "$TMP/out-missing" > "$TMP/log-missing" 2>&1
rc=$?
if [ "$rc" -ne 0 ]; then ok "the runner exits non-zero (exit $rc)"; else bad 'the runner exits non-zero (it exited 0)'; fi
if grep -q "no-such-skill" "$TMP/log-missing"; then ok 'the error names the missing skill'; else bad 'the error names the missing skill'; fi
if [ ! -s "$REC/calls" ]; then ok 'and nothing was run'; else bad 'and nothing was run (the stub was called)'; fi

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The runner does not give each agent under test the skills a spawned subagent gets.\n'
    exit 1
fi
printf 'Every subagent under test gets its listed skills, the lead gets none, and a missing skill stops the run.\n'

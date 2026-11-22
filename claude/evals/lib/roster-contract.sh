#!/usr/bin/env bash
#
# roster-contract.sh - the roster agrees with itself.
#
# Adding an agent means editing twenty files, and the failure mode is not a
# broken one, it is a half-done one: a body with no eval directory, an eval
# directory the runner never runs, an agent the SubagentStop matcher does not
# name so its handoff is never checked. Each of those is silent.
#
# Every assertion here holds for every established agent, so a failure means
# something new is incomplete rather than that the rules changed.
#
# Usage:  evals/lib/roster-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)
AGENT_DIR="$PLUGIN_ROOT/agents"
HOOKS_JSON="$PLUGIN_ROOT/hooks/hooks.json"
RUN_SH="$HARNESS_ROOT/evals/run.sh"
DESIGN_MD="$REPO_ROOT/docs/fleet-design.md"
# Overridable so a fixture can prove the assertion below actually catches a
# dropped row, rather than always reading the real README.
README_MD="${ROSTER_README_OVERRIDE:-$REPO_ROOT/claude/README.md}"

PASSED=0
FAILED=0

check() {
    # $1 case name, $2 requirement, $3 predicate result (0 ok), $4 detail
    if [ "$3" -eq 0 ]; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %-34s %s\n' "$1" "$2"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %-34s %s\n' "$1" "$2"
        [ -n "${4:-}" ] && printf '        %s\n' "$4"
    fi
    return 0
}

WANT_SECTIONS='## Scope
## How you work
## Invariants
## Handoff'

[ -f "$README_MD" ]
check "readme-present" "the README named by \$README_MD exists" $? "$README_MD"

# The README's agent table is a run of `| \`name\` | ...` rows under "## The
# fleet". Space-flanked for the same exact-token reason as ALL_AGENTS_LIST
# above: a substring match on a hyphenated name would be wrong.
README_AGENTS_LIST=" $(grep -oE '^\| `[a-z-]+`' "$README_MD" 2>/dev/null | sed -E 's/^\| `//; s/`$//' | tr '\n' ' ') "

# Space-flanked so membership below is an exact token match, not a substring
# match: \b treats a hyphen as a word boundary, so "writer" would match inside
# "spec-writer" even though it names no agent of its own.
ALL_AGENTS_LIST=" $(sed -n 's/^ALL_AGENTS="\(.*\)"/\1/p' "$RUN_SH") "

for body in "$AGENT_DIR"/*.md; do
    agent=$(basename "$body" .md)

    name=$(sed -n 's/^name: *//p' "$body" | head -1)
    [ "$name" = "$agent" ]
    check "$agent-name" "the name field matches the filename" $? "name: $name"

    # The lead's cap is its size, checked below (docs/agent-contract.md,
    # section 3): it is the session, so its procedures cannot live in a skill.
    if [ "$agent" != lead ]; then
        lines=$(wc -l < "$body" | tr -d ' ')
        [ "$lines" -lt 60 ]
        check "$agent-length" "the body is under 60 lines" $? "$lines lines"
    fi

    got=$(grep '^## ' "$body")
    [ "$got" = "$WANT_SECTIONS" ]
    check "$agent-sections" "four H2 sections, in the contract's order" $? "$(printf '%s' "$got" | tr '\n' ' ')"

    ! grep -qE '—|–' "$body"
    check "$agent-dashes" "no em dashes and no en dashes" $?

    # glossary and handoff are the two skills every body must preload. A body
    # preloads only what resolves: a frontmatter name that resolves to nothing
    # tells the agent a procedure is loaded when it is not.
    for skill in glossary handoff; do
        grep -q "^  - $skill\$" "$body"
        check "$agent-skill-$skill" "preloads $skill" $?
    done

    # And the inverse: no body names a skill that does not exist in the
    # plugin. The plugin declares no dependency, so a name from another
    # plugin resolves only on a machine that happens to have it installed.
    while IFS= read -r sk; do
        sk="${sk#  - }"
        if [ ! -d "$PLUGIN_ROOT/skills/$sk" ]; then
            check "$agent-skill-resolves-$sk" "preloaded skill $sk resolves" 1 "no skills/$sk in the plugin"
        fi
    done < <(awk '/^skills:/{f=1;next} f&&/^  - /{print} f&&!/^  - /{f=0}' "$body")

    # [(|] on the left, because the first name in the alternation is preceded
    # by the opening bracket rather than a pipe. The lead is the one agent the
    # matcher must not name: it is the session agent, never spawned, so
    # a lead-typed stop is always the runtime's own side call.
    matcher=$(jq -r '.hooks.SubagentStop[0].matcher' "$HOOKS_JSON" 2>/dev/null)
    if [ "$agent" = lead ]; then
        ! grep -q "[(|]lead[|)]" <<<"$matcher"
        check "$agent-matcher" "is left out of the SubagentStop matcher" $? "named in hooks.json"
    else
        grep -q "[(|]$agent[|)]" <<<"$matcher"
        check "$agent-matcher" "is named in the SubagentStop matcher" $? "not in hooks.json"
    fi

    [ -d "$HARNESS_ROOT/evals/$agent" ]
    check "$agent-evals" "has an evals directory" $?

    # The directory existing is not enough: an eval with two prompts would pass
    # while evals/README says the glossary's "three to five prompts" is "exactly
    # what is here". This watches the number the sentence claims.
    prompt_count=$(ls "$HARNESS_ROOT/evals/$agent/prompts" 2>/dev/null | wc -l | tr -d ' ')
    [ "${prompt_count:-0}" -ge 3 ] && [ "${prompt_count:-0}" -le 5 ]
    check "$agent-prompt-count" "has the three to five prompts the glossary defines an eval as" $? "has $prompt_count"

    case "$ALL_AGENTS_LIST" in
        *" $agent "*) true ;;
        *) false ;;
    esac
    check "$agent-runner" "is in the eval runner's ALL_AGENTS" $?

    case "$README_AGENTS_LIST" in
        *" $agent "*) true ;;
        *) false ;;
    esac
    check "$agent-readme" "is named in the README's agent table" $? "not a row in $README_MD"

    # The design doc's roster table is what the lead routes by, and it drifts
    # silently: a change to an agent's model or effort in frontmatter can leave
    # the table describing a fleet that does not exist. Column 4 is Model,
    # column 5 is Effort; a body with no
    # effort line is n/a in the table.
    row=$(grep "^| \`$agent\` |" "$DESIGN_MD" | head -1)
    [ -n "$row" ]
    check "$agent-design-row" "has a row in the design doc's roster" $? "no row in docs/fleet-design.md"
    if [ -n "$row" ]; then
        row_model=$(printf '%s' "$row" | awk -F'|' '{gsub(/[ `]/,"",$4); print $4}')
        row_effort=$(printf '%s' "$row" | awk -F'|' '{gsub(/ /,"",$5); print $5}')
        fm_model=$(sed -n 's/^model: *//p' "$body" | head -1)
        fm_effort=$(sed -n 's/^effort: *//p' "$body" | head -1)
        [ "$row_model" = "$fm_model" ]
        check "$agent-design-model" "the roster's model matches frontmatter" $? "roster $row_model, frontmatter $fm_model"
        [ "$row_effort" = "${fm_effort:-n/a}" ]
        check "$agent-design-effort" "the roster's effort matches frontmatter" $? "roster $row_effort, frontmatter ${fm_effort:-none}"
    fi
done

# The reverse direction: a name the README table carries that has no agent
# body at all never enters the loop above, so it needs its own pass.
for name in $README_AGENTS_LIST; do
    if [ ! -f "$AGENT_DIR/$name.md" ]; then
        check "readme-$name-orphan" "README names $name but $AGENT_DIR/$name.md does not exist" 1
    fi
done

# The lead's shape. Claude Code loads no skills list for an agent run as the
# session, so the lead's body carries the procedures every order needs and
# names the rest as reference files under references/, read on demand
# (docs/decisions/lead-procedures-skill.md). Its cap is 20 KB, 20480 bytes,
# instead of 60 lines, and under the no-hard-wrap rule each paragraph is held
# to 250 words. Every reference the body names must exist, every file there
# must be named, and each opens by saying which step of the body sends the
# lead there. LEAD_BODY_OVERRIDE lets a fixture prove each check fails.
LEAD_BODY="${LEAD_BODY_OVERRIDE:-$AGENT_DIR/lead.md}"
LEAD_REFS="$PLUGIN_ROOT/references"
LEAD_MAX_BYTES=20480
lead_bytes=$(wc -c < "$LEAD_BODY" | tr -d ' ')
[ "$lead_bytes" -le "$LEAD_MAX_BYTES" ]
check "lead-size" "the lead's body is at most 20 KB ($LEAD_MAX_BYTES bytes)" $? "$lead_bytes bytes"
long_paras=$(awk '/^ *```/{c=!c;next} !c && NF > 250 {print NR ": " NF " words"}' "$LEAD_BODY")
[ -z "$long_paras" ]
check "lead-paragraph-length" "no paragraph of the lead's body runs past 250 words" $? "$long_paras"
named=$(grep -oE '\$\{CLAUDE_PLUGIN_ROOT\}/references/[a-z0-9-]+\.md' "$LEAD_BODY" | sed 's#.*/references/##' | sort -u)
missing=""
for ref in $named; do
    [ -f "$LEAD_REFS/$ref" ] || missing="$missing $ref"
done
[ -n "$named" ] && [ -z "$missing" ]
check "lead-references-resolve" "every reference file the lead's body names exists" $? "missing:${missing:- none named}"
orphans=""
nofirst=""
for f in "$LEAD_REFS"/*.md; do
    [ -f "$f" ] || continue
    ref=$(basename "$f")
    printf '%s\n' "$named" | grep -qx "$ref" || orphans="$orphans $ref"
    head -1 "$f" | grep -q "^The lead's body, " || nofirst="$nofirst $ref"
done
[ -z "$orphans" ]
check "lead-references-named" "every file under references/ is named by the lead's body" $? "not named:$orphans"
[ -z "$nofirst" ]
check "lead-references-first-line" "each reference file opens with the step of the lead's body that sends the lead there" $? "no such first line:$nofirst"

# Memory. Every agent keeps its own (`memory: project`).
for f in "$AGENT_DIR"/*.md; do
    agent=$(basename "$f" .md)
    awk 'NR==1 && $0=="---"{fm=1; next} fm && $0=="---"{exit} fm' "$f" | grep -qx 'memory: project'
    check "$agent-memory-project" "the frontmatter sets memory: project" $?
done

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The roster disagrees with itself: an agent exists that some part of the fleet does not know about.\n'
    exit 1
fi
printf 'Every agent body, the matcher, the eval runner, the eval directories and the design doc roster agree.\n'

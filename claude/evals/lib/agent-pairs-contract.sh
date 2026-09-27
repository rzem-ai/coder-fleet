#!/usr/bin/env bash
#
# agent-pairs-contract.sh - each editor pair is generated from one body source
# (CF-12 spec Q17, AC 18).
#
# Every case runs gen-agent-pairs.sh against a mktemp -d workspace, with
# --sources and --agents pointed inside it, never against the real
# claude/agent-pairs/ or claude/coder-fleet/agents/. A fresh workspace per
# case keeps one case's leftovers from deciding another's result.
#
# Usage:  evals/lib/agent-pairs-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
FIXTURES="$HARNESS_ROOT/evals/fixtures/agent-pairs"
GEN="$HARNESS_ROOT/scripts/gen-agent-pairs.sh"

PASSED=0
FAILED=0

check() {
    # $1 case name, $2 requirement, $3 predicate result (0 ok), $4 detail
    if [ "$3" -eq 0 ]; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %-28s %s\n' "$1" "$2"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %-28s %s\n' "$1" "$2"
        [ -n "${4:-}" ] && printf '        %s\n' "$4"
    fi
    return 0
}

workspace() {
    # Normalise via cd+pwd: on a machine where $TMPDIR itself carries a
    # trailing slash, the raw mktemp -d result would carry a double slash
    # ($TMPDIR/agent-pairs-contract.XXXXXX has "//" in it), which throws off
    # a case that then builds --sources and --agents from this same string
    # in two different ways (one through a plain cd, one by concatenation)
    # and expects them to agree exactly.
    local d
    d=$(mktemp -d "${TMPDIR:-/tmp}/agent-pairs-contract.XXXXXX")
    (cd "$d" && pwd)
}

# pair_drift_block -> reads --check output on stdin, prints only the lines
# from a "PAIR DRIFT" header through the blank line that closes its diff.
# A field name can appear in an unrelated STALE diff too (the same run can
# report both), so a case naming a field must grep this, not the whole
# output, or it passes for the wrong reason.
pair_drift_block() {
    awk '
        /PAIR DRIFT/ { inblock = 1; blanks = 0 }
        inblock {
            print
            if ($0 == "") { blanks++; if (blanks == 2) inblock = 0 }
        }
    '
}

# ---------------------------------------------------------------------------
# generate-writes-pair, pair-differs-only-in-three, generate-idempotent,
# check-clean-passes: one workspace, generated once, reused by all four so a
# later case can prove idempotence and cleanliness against the same output.
# ---------------------------------------------------------------------------
WS1=$(workspace)
SOURCES1="$WS1/sources"
AGENTS1="$WS1/agents"
mkdir -p "$SOURCES1" "$AGENTS1"
cp "$FIXTURES/sample.md" "$SOURCES1/sample.md"

OUT1=$("$GEN" --sources "$SOURCES1" --agents "$AGENTS1" 2>&1)
RC1=$?
# Exit 0 alone is a no-op's favourite trick; require the pair to actually
# exist too, so a generator that does nothing cannot pass this case.
[ "$RC1" -eq 0 ] && [ -f "$AGENTS1/sample.md" ] && [ -f "$AGENTS1/sample-fable.md" ]
check "generate-writes-pair-exit" "the generator exits 0 on a valid source and writes the pair" $? "$OUT1"

[ -f "$AGENTS1/sample.md" ] && [ -f "$AGENTS1/sample-fable.md" ]
check "generate-writes-pair-files" "both pair files exist" $?

if [ -f "$AGENTS1/sample.md" ] && [ -f "$AGENTS1/sample-fable.md" ]; then
    got_name=$(sed -n 's/^name: //p' "$AGENTS1/sample.md" | head -1)
    got_model=$(sed -n 's/^model: //p' "$AGENTS1/sample.md" | head -1)
    [ "$got_name" = "sample" ] && [ "$got_model" = "opus" ]
    check "generate-writes-pair-opus" "sample.md has name sample and model opus" $? "name=$got_name model=$got_model"

    got_name_f=$(sed -n 's/^name: //p' "$AGENTS1/sample-fable.md" | head -1)
    got_model_f=$(sed -n 's/^model: //p' "$AGENTS1/sample-fable.md" | head -1)
    [ "$got_name_f" = "sample-fable" ] && [ "$got_model_f" = "fable" ]
    check "generate-writes-pair-fable" "sample-fable.md has name sample-fable and model fable" $? "name=$got_name_f model=$got_model_f"
else
    # A missing setup file is a FAIL here, not a case dropped out of the
    # count: a case that silently stops running proves nothing.
    check "generate-writes-pair-opus" "sample.md has name sample and model opus" 1 "sample.md or sample-fable.md was not written"
    check "generate-writes-pair-fable" "sample-fable.md has name sample-fable and model fable" 1 "sample.md or sample-fable.md was not written"
fi

# pair-differs-only-in-three: strip name/model/description and the two files
# must be byte-identical; the marker is line 2 of both.
strip_three() {
    grep -v -e '^name: ' -e '^model: ' -e '^description: ' "$1"
}
if [ -f "$AGENTS1/sample.md" ] && [ -f "$AGENTS1/sample-fable.md" ]; then
    diff -q <(strip_three "$AGENTS1/sample.md") <(strip_three "$AGENTS1/sample-fable.md") >/dev/null 2>&1
    check "pair-differs-only-in-three" "stripping name/model/description leaves identical files" $?

    m1=$(sed -n '2p' "$AGENTS1/sample.md")
    m2=$(sed -n '2p' "$AGENTS1/sample-fable.md")
    [ -n "$m1" ] && [ "$m1" = "$m2" ]
    check "pair-marker-line-2" "the marker is line 2 of both files and identical" $? "opus=[$m1] fable=[$m2]"
else
    check "pair-differs-only-in-three" "stripping name/model/description leaves identical files" 1 "sample.md or sample-fable.md was not written"
    check "pair-marker-line-2" "the marker is line 2 of both files and identical" 1 "sample.md or sample-fable.md was not written"
fi

# generate-idempotent: run again, expect "unchanged" and byte-identical output.
cksum_before=$(cat "$AGENTS1/sample.md" "$AGENTS1/sample-fable.md" 2>/dev/null | cksum)
OUT1B=$("$GEN" --sources "$SOURCES1" --agents "$AGENTS1" 2>&1)
RC1B=$?
cksum_after=$(cat "$AGENTS1/sample.md" "$AGENTS1/sample-fable.md" 2>/dev/null | cksum)
[ "$RC1B" -eq 0 ] && [ "$cksum_before" = "$cksum_after" ] && printf '%s\n' "$OUT1B" | grep -q 'unchanged'
check "generate-idempotent" "a second run exits 0, reports unchanged and the bytes are identical" $? "$OUT1B"

# check-clean-passes: --check on a freshly generated pair exits 0 and says
# so. Exit 0 alone would also pass for a --check that does nothing at all;
# requiring the actual success message closes that.
CHECK_CLEAN_OUT="$WS1/check-clean.out"
"$GEN" --check --sources "$SOURCES1" --agents "$AGENTS1" >"$CHECK_CLEAN_OUT" 2>&1
RC_CLEAN=$?
[ "$RC_CLEAN" -eq 0 ] && grep -q 'every pair matches its source' "$CHECK_CLEAN_OUT"
check "check-clean-passes" "--check exits 0 and reports every pair matching its source" $?

rm -rf "$WS1"

# ---------------------------------------------------------------------------
# hand-edit-fails
# ---------------------------------------------------------------------------
WS2=$(workspace)
SOURCES2="$WS2/sources"; AGENTS2="$WS2/agents"
mkdir -p "$SOURCES2" "$AGENTS2"
cp "$FIXTURES/sample.md" "$SOURCES2/sample.md"
"$GEN" --sources "$SOURCES2" --agents "$AGENTS2" >/dev/null 2>&1
printf '\nA hand-edited line that the generator never wrote.\n' >> "$AGENTS2/sample-fable.md"
OUT2=$("$GEN" --check --sources "$SOURCES2" --agents "$AGENTS2" 2>&1)
RC2=$?
[ "$RC2" -eq 1 ]
check "hand-edit-fails-exit" "--check exits exactly 1 after a hand-edited body line" $? "$OUT2"
printf '%s\n' "$OUT2" | grep -q 'STALE'
check "hand-edit-fails-stale" "--check names STALE" $?
printf '%s\n' "$OUT2" | grep -q 'sample-fable.md'
check "hand-edit-fails-names-file" "--check names the file" $?
rm -rf "$WS2"

# ---------------------------------------------------------------------------
# drift-fails
# ---------------------------------------------------------------------------
WS3=$(workspace)
SOURCES3="$WS3/sources"; AGENTS3="$WS3/agents"
mkdir -p "$SOURCES3" "$AGENTS3"
cp "$FIXTURES/sample.md" "$SOURCES3/sample.md"
"$GEN" --sources "$SOURCES3" --agents "$AGENTS3" >/dev/null 2>&1
sed -i.bak 's/^effort: medium$/effort: high/' "$AGENTS3/sample-fable.md" && rm -f "$AGENTS3/sample-fable.md.bak"
OUT3=$("$GEN" --check --sources "$SOURCES3" --agents "$AGENTS3" 2>&1)
RC3=$?
[ "$RC3" -eq 1 ]
check "drift-fails-exit" "--check exits exactly 1 when a pair drifts outside the three fields" $? "$OUT3"
printf '%s\n' "$OUT3" | grep -q 'PAIR DRIFT'
check "drift-fails-names-drift" "--check names PAIR DRIFT" $?
printf '%s\n' "$OUT3" | pair_drift_block | grep -q 'effort'
check "drift-fails-names-field" "--check names the differing field inside the PAIR DRIFT block" $? "$OUT3"
rm -rf "$WS3"

# ---------------------------------------------------------------------------
# source-change-fails
# ---------------------------------------------------------------------------
WS4=$(workspace)
SOURCES4="$WS4/sources"; AGENTS4="$WS4/agents"
mkdir -p "$SOURCES4" "$AGENTS4"
cp "$FIXTURES/sample.md" "$SOURCES4/sample.md"
"$GEN" --sources "$SOURCES4" --agents "$AGENTS4" >/dev/null 2>&1
printf '\nAn extra paragraph added to the source body without regenerating.\n' >> "$SOURCES4/sample.md"
OUT4=$("$GEN" --check --sources "$SOURCES4" --agents "$AGENTS4" 2>&1)
RC4=$?
[ "$RC4" -eq 1 ]
check "source-change-fails" "--check exits exactly 1 when the source changed without regeneration" $? "$OUT4"
printf '%s\n' "$OUT4" | grep -q 'STALE'
check "source-change-fails-stale" "--check names STALE" $?
printf '%s\n' "$OUT4" | grep -q 'sample.md'
check "source-change-fails-names-source" "--check's STALE report names sample.md, the target rendered from the changed source" $? "$OUT4"
rm -rf "$WS4"

# ---------------------------------------------------------------------------
# missing-generated-fails
# ---------------------------------------------------------------------------
WS5=$(workspace)
SOURCES5="$WS5/sources"; AGENTS5="$WS5/agents"
mkdir -p "$SOURCES5" "$AGENTS5"
cp "$FIXTURES/sample.md" "$SOURCES5/sample.md"
"$GEN" --sources "$SOURCES5" --agents "$AGENTS5" >/dev/null 2>&1
rm -f "$AGENTS5/sample-fable.md"
OUT5=$("$GEN" --check --sources "$SOURCES5" --agents "$AGENTS5" 2>&1)
RC5=$?
[ "$RC5" -eq 1 ]
check "missing-generated-fails-exit" "--check exits exactly 1 when a generated file is deleted" $? "$OUT5"
printf '%s\n' "$OUT5" | grep -q 'STALE'
stale_ok=$?
printf '%s\n' "$OUT5" | grep -q 'sample-fable.md'
name_ok=$?
[ "$stale_ok" -eq 0 ] && [ "$name_ok" -eq 0 ]
check "missing-generated-fails-message" "--check names STALE and sample-fable.md, the file deleted" $? "$OUT5"
rm -rf "$WS5"

# ---------------------------------------------------------------------------
# orphan-fails: a marker-bearing file with no source.
# ---------------------------------------------------------------------------
WS6=$(workspace)
SOURCES6="$WS6/sources"; AGENTS6="$WS6/agents"
mkdir -p "$SOURCES6" "$AGENTS6"
cat > "$AGENTS6/ghost.md" <<'EOF'
---
# GENERATED FROM AGENT-PAIR SOURCE ghost.md BY gen-agent-pairs.sh - DO NOT EDIT. Edit the source and regenerate.
name: ghost
description: A ghost with a marker and no source.
model: opus
effort: medium
maxTurns: 15
tools: Read
skills:
  - glossary
  - handoff
---

## Scope

Ghost.

## How you work

1. Haunt.

## Invariants

None.

## Handoff

None.
EOF
OUT6=$("$GEN" --check --sources "$SOURCES6" --agents "$AGENTS6" 2>&1)
RC6=$?
[ "$RC6" -eq 1 ]
check "orphan-fails-exit" "--check exits exactly 1 on a marker-bearing file with no source" $? "$OUT6"
printf '%s\n' "$OUT6" | grep -q 'ORPHAN'
check "orphan-fails-names-orphan" "--check names ORPHAN" $?
printf '%s\n' "$OUT6" | grep -q 'ghost'
check "orphan-fails-names-file" "--check names ghost" $?
rm -rf "$WS6"

# ---------------------------------------------------------------------------
# orphan-beside-source-fails: an orphan is still caught in phase 2, alongside
# a real source that keeps the phase-2 loop from ever finding SOURCE_FILES
# empty. This is the case a phase-2-only regression (the orphan loop losing
# its CHECK_FAILED flag, or the phase-2 orphan loop itself never running)
# would slip past, since orphan-fails above only exercises the no-sources
# path.
# ---------------------------------------------------------------------------
WS6B=$(workspace)
SOURCES6B="$WS6B/sources"; AGENTS6B="$WS6B/agents"
mkdir -p "$SOURCES6B" "$AGENTS6B"
cp "$FIXTURES/sample.md" "$SOURCES6B/sample.md"
"$GEN" --sources "$SOURCES6B" --agents "$AGENTS6B" >/dev/null 2>&1
cat > "$AGENTS6B/ghost.md" <<'EOF'
---
# GENERATED FROM AGENT-PAIR SOURCE ghost.md BY gen-agent-pairs.sh - DO NOT EDIT. Edit the source and regenerate.
name: ghost
description: A ghost with a marker and no source, beside a real source.
model: opus
effort: medium
maxTurns: 15
tools: Read
skills:
  - glossary
  - handoff
---

## Scope

Ghost.

## How you work

1. Haunt.

## Invariants

None.

## Handoff

None.
EOF
OUT6B=$("$GEN" --check --sources "$SOURCES6B" --agents "$AGENTS6B" 2>&1)
RC6B=$?
# The real source's own pair was freshly generated and must not itself be
# STALE; if it were, the exit check could pass for a reason that has
# nothing to do with the orphan this case is actually about.
[ "$RC6B" -eq 1 ] && ! printf '%s\n' "$OUT6B" | grep -q 'STALE'
check "orphan-beside-source-fails-exit" "--check exits exactly 1 on an orphan alongside a real source, and not because of a STALE pair" $? "$OUT6B"
printf '%s\n' "$OUT6B" | grep -q 'ORPHAN'
check "orphan-beside-source-fails-names-orphan" "--check names ORPHAN" $?
printf '%s\n' "$OUT6B" | grep -q 'ghost'
check "orphan-beside-source-fails-names-file" "--check names ghost" $?
rm -rf "$WS6B"

# ---------------------------------------------------------------------------
# description-escapes-preserved: a description carrying backslash sequences
# that look like escapes (\t, \n) must reach the generated file byte for
# byte. awk -v processes backslash escapes in the value it assigns; ENVIRON
# does not. This is the only guard against that regression.
# ---------------------------------------------------------------------------
WS9=$(workspace)
SOURCES9="$WS9/sources"; AGENTS9="$WS9/agents"
mkdir -p "$SOURCES9" "$AGENTS9"
cat > "$SOURCES9/escapes.md" <<'EOF'
role: escapes
description.opus: Splits on \t and C:\new dirs.
description.fable: Splits on \t and C:\new dirs, Fable model.
---
name: {{name}}
description: {{description}}
model: {{model}}
effort: medium
maxTurns: 15
tools: Read
skills:
  - glossary
  - handoff
---

## Scope

A fixture whose description carries literal backslash sequences.

## How you work

1. Exist as a fixture and nothing more.

## Invariants

Never run for real.

## Handoff

Not applicable, this is a fixture body.
EOF
"$GEN" --sources "$SOURCES9" --agents "$AGENTS9" >/dev/null 2>&1
RC9=$?
[ "$RC9" -eq 0 ] && [ -f "$AGENTS9/escapes.md" ] && [ -f "$AGENTS9/escapes-fable.md" ]
check "description-escapes-preserved-exit" "the generator exits 0 and writes the pair for a description with backslash sequences" $?
if [ -f "$AGENTS9/escapes.md" ]; then
    got_desc9=$(sed -n 's/^description: //p' "$AGENTS9/escapes.md" | head -1)
    [ "$got_desc9" = 'Splits on \t and C:\new dirs.' ]
    check "description-escapes-preserved" "the description reaches the generated file byte for byte" $? "got=[$got_desc9]"
else
    check "description-escapes-preserved" "the description reaches the generated file byte for byte" 1 "escapes.md was not written"
fi
rm -rf "$WS9"

# ---------------------------------------------------------------------------
# no-sources-passes: missing sources directory, and separately an empty one,
# each beside a hand-written unmarked agent.
# ---------------------------------------------------------------------------
WS7=$(workspace)
AGENTS7="$WS7/agents"
mkdir -p "$AGENTS7"
cat > "$AGENTS7/handwritten.md" <<'EOF'
---
name: handwritten
description: An ordinary, hand-written agent with no marker.
model: opus
effort: medium
---

## Scope

Ordinary.

## How you work

1. Nothing to do with the generator.

## Invariants

None.

## Handoff

None.
EOF
OUT7A=$("$GEN" --check --sources "$WS7/no-such-dir" --agents "$AGENTS7" 2>&1)
RC7A=$?
[ "$RC7A" -eq 0 ]
check "no-sources-passes-missing-dir" "--check exits 0 when the sources directory is missing" $? "$OUT7A"
printf '%s\n' "$OUT7A" | grep -q 'nothing to check'
check "no-sources-passes-missing-dir-message" "--check prints the nothing-to-check message" $?

mkdir -p "$WS7/empty-sources"
OUT7B=$("$GEN" --check --sources "$WS7/empty-sources" --agents "$AGENTS7" 2>&1)
RC7B=$?
[ "$RC7B" -eq 0 ]
check "no-sources-passes-empty-dir" "--check exits 0 when the sources directory is empty" $? "$OUT7B"
printf '%s\n' "$OUT7B" | grep -q 'nothing to check'
check "no-sources-passes-empty-dir-message" "--check prints the nothing-to-check message" $?
rm -rf "$WS7"

# ---------------------------------------------------------------------------
# refuses-sources-under-agents-dir: --sources pointed at a directory nested
# under a literal agents/ segment refuses, and writes nothing, even though
# the value is relative to the workspace rather than the real harness root.
# ---------------------------------------------------------------------------
WS7B=$(workspace)
mkdir -p "$WS7B/agents/src" "$WS7B/target"
cp "$FIXTURES/sample.md" "$WS7B/agents/src/sample.md"
OUT7C=$("$GEN" --sources "$WS7B/agents/src" --agents "$WS7B/target" 2>&1)
RC7C=$?
[ "$RC7C" -eq 1 ]
check "refuses-sources-under-agents-dir-exit" "the generator refuses with exit exactly 1 for a sources dir nested under agents/" $? "$OUT7C"
written7C=$(find "$WS7B/target" -type f | wc -l | tr -d ' ')
[ "$RC7C" -eq 1 ] && [ "$written7C" -eq 0 ]
check "refuses-sources-under-agents-dir-writes-nothing" "nothing is written for a sources dir nested under agents/" $? "found $written7C file(s)"
rm -rf "$WS7B"

# ---------------------------------------------------------------------------
# refuses-sources-inside-agents-dir: the plan's headline case - the sources
# directory IS the agents directory's own subdirectory, not merely a
# sibling that happens to share an agents/ segment. This is the equality
# and equality-prefix guard (the first case statement), a different check
# from has_agents_segment above; nothing else in this file exercises it.
# ---------------------------------------------------------------------------
WS7G=$(workspace)
mkdir -p "$WS7G/agents/src"
cp "$FIXTURES/sample.md" "$WS7G/agents/src/sample.md"
OUT7G=$("$GEN" --agents "$WS7G/agents" --sources "$WS7G/agents/src" 2>&1)
RC7G=$?
[ "$RC7G" -eq 1 ]
check "refuses-sources-inside-agents-dir-exit" "the generator refuses with exit exactly 1 when sources sits directly inside the agents directory" $? "$OUT7G"
printf '%s\n' "$OUT7G" | grep -q 'must not sit inside the agents directory'
check "refuses-sources-inside-agents-dir-message" "the generator names the specific reason" $? "$OUT7G"
written7G=$(find "$WS7G/agents" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$RC7G" -eq 1 ] && [ "$written7G" -eq 0 ]
check "refuses-sources-inside-agents-dir-writes-nothing" "nothing is written into the agents directory itself" $? "found $written7G file(s)"
rm -rf "$WS7G"

# ---------------------------------------------------------------------------
# refuses-relative-sources-under-agents-dir: the same refusal for a
# --sources value given relative to the current directory, not already
# absolute. A guard that pattern-matches the raw --sources string never
# sees the agents/ segment in a relative value; resolving to an absolute
# path first is what catches it.
# ---------------------------------------------------------------------------
WS7F=$(workspace)
mkdir -p "$WS7F/agents/src" "$WS7F/target"
OUT7F=$(cd "$WS7F" && "$GEN" --sources "agents/src" --agents "$WS7F/target" 2>&1)
RC7F=$?
[ "$RC7F" -eq 1 ]
check "refuses-relative-sources-under-agents-dir" "the generator refuses with exit exactly 1 for a relative --sources value nested under agents/" $? "$OUT7F"
rm -rf "$WS7F"

# ---------------------------------------------------------------------------
# no-sources-passes-harness-under-agents-parent: a harness root that merely
# sits under a directory named agents (unrelated to this generator, an
# accident of where the clone lives) must not trip the same refusal. Build
# a fake harness inside the workspace: scripts/ beside agent-pairs/, so
# HARNESS_ROOT resolves under a parent literally named agents, with no
# sources of its own.
# ---------------------------------------------------------------------------
WS7D=$(workspace)
FAKE_HARNESS="$WS7D/agents/fakeharness"
mkdir -p "$FAKE_HARNESS/scripts" "$FAKE_HARNESS/coder-fleet/agents"
cp "$GEN" "$FAKE_HARNESS/scripts/gen-agent-pairs.sh"
OUT7E=$(bash "$FAKE_HARNESS/scripts/gen-agent-pairs.sh" --check 2>&1)
RC7E=$?
[ "$RC7E" -eq 0 ]
check "no-sources-passes-harness-under-agents-parent" "a harness root under a parent directory named agents still passes with no sources" $? "$OUT7E"
rm -rf "$WS7D"

# ---------------------------------------------------------------------------
# refuses-trailing-slash-on-agents: a trailing slash on --agents must not
# make the sources-is-the-agents-dir equality check miss, since the
# unnormalised pattern "$ABS_AGENTS_DIR/*" would need an extra "/" that a
# trailing-slash --agents value does not textually have.
# ---------------------------------------------------------------------------
WS7H=$(workspace)
mkdir -p "$WS7H/agents/src"
cp "$FIXTURES/sample.md" "$WS7H/agents/src/sample.md"
OUT7H=$("$GEN" --sources "$WS7H/agents" --agents "$WS7H/agents/" 2>&1)
RC7H=$?
[ "$RC7H" -eq 1 ]
check "refuses-trailing-slash-on-agents-exit" "a trailing slash on --agents does not let sources-is-agents-dir slip past" $? "$OUT7H"
printf '%s\n' "$OUT7H" | grep -q 'must not sit inside the agents directory'
check "refuses-trailing-slash-on-agents-message" "the generator still names the specific reason" $? "$OUT7H"
rm -rf "$WS7H"

# ---------------------------------------------------------------------------
# refuses-agents-dot-from-inside: --agents . given from inside the agents
# directory itself must resolve to the same absolute path a full --agents
# value would, so the sources-is-the-agents-dir check still fires.
# ---------------------------------------------------------------------------
WS7I=$(workspace)
mkdir -p "$WS7I/agents/src"
cp "$FIXTURES/sample.md" "$WS7I/agents/src/sample.md"
OUT7I=$(cd "$WS7I/agents" && "$GEN" --sources "$WS7I/agents/src" --agents . 2>&1)
RC7I=$?
[ "$RC7I" -eq 1 ]
check "refuses-agents-dot-from-inside-exit" "--agents . from inside the agents directory does not slip past" $? "$OUT7I"
printf '%s\n' "$OUT7I" | grep -q 'must not sit inside'
check "refuses-agents-dot-from-inside-message" "the generator still names a specific reason" $? "$OUT7I"
rm -rf "$WS7I"

# ---------------------------------------------------------------------------
# no-sources-passes-ancestor-sources-under-agents-parent: the sources dir is
# itself an ancestor of the agents dir (not merely a sibling under a shared
# root), and that ancestor's own path happens to sit under a directory
# literally named agents. The suffix below the point of divergence is
# empty - there is no "below" when sources IS the shared prefix - so this
# must pass, the same way no-sources-passes-harness-under-agents-parent
# does for the sibling shape.
# ---------------------------------------------------------------------------
WS7J=$(workspace)
ANCESTOR="$WS7J/agents/root"
mkdir -p "$ANCESTOR/coder-fleet/agents"
OUT7J=$("$GEN" --check --sources "$ANCESTOR" --agents "$ANCESTOR/coder-fleet/agents" 2>&1)
RC7J=$?
[ "$RC7J" -eq 0 ]
check "no-sources-passes-ancestor-sources-under-agents-parent" "a sources dir that is an ancestor of the agents dir, itself under a directory named agents, still passes with no sources" $? "$OUT7J"
rm -rf "$WS7J"

# ---------------------------------------------------------------------------
# generate-read-only-agents-dir-fails: without set -e, a failed write in the
# middle of generate mode could still fall through to a "wrote" line. A
# read-only target agents directory makes the cp underneath it fail; the
# generator must exit non-zero and never claim it wrote anything.
# ---------------------------------------------------------------------------
WS9B=$(workspace)
SOURCES9B="$WS9B/sources"; AGENTS9B="$WS9B/agents"
mkdir -p "$SOURCES9B" "$AGENTS9B"
cp "$FIXTURES/sample.md" "$SOURCES9B/sample.md"
chmod 0555 "$AGENTS9B"
OUT9B=$("$GEN" --sources "$SOURCES9B" --agents "$AGENTS9B" 2>&1)
RC9B=$?
chmod 0755 "$AGENTS9B"
[ "$RC9B" -eq 1 ]
check "generate-read-only-agents-dir-fails-exit" "generate exits exactly 1 when the agents directory is read-only" $? "$OUT9B"
printf '%s\n' "$OUT9B" | grep -q 'wrote'
wrote_seen=$?
[ "$RC9B" -eq 1 ] && [ "$wrote_seen" -ne 0 ]
check "generate-read-only-agents-dir-fails-no-wrote" "generate never claims it wrote a file when the write failed" $? "$OUT9B"
rm -rf "$WS9B"

# ---------------------------------------------------------------------------
# hand-written-untouched: a source whose role matches an unmarked agent file.
# ---------------------------------------------------------------------------
WS8=$(workspace)
SOURCES8="$WS8/sources"; AGENTS8="$WS8/agents"
mkdir -p "$SOURCES8" "$AGENTS8"
cp "$FIXTURES/sample.md" "$SOURCES8/sample.md"
cat > "$AGENTS8/sample.md" <<'EOF'
---
name: sample
description: A hand-written agent that happens to share the sample role's name.
model: opus
effort: medium
---

## Scope

Hand-written, not generated.

## How you work

1. Stay exactly as written.

## Invariants

None.

## Handoff

None.
EOF
sum_before=$(cksum < "$AGENTS8/sample.md")
OUT8=$("$GEN" --sources "$SOURCES8" --agents "$AGENTS8" 2>&1)
RC8=$?
sum_after=$(cksum < "$AGENTS8/sample.md")
[ "$RC8" -eq 1 ]
check "hand-written-untouched-exit" "the generator refuses with exit exactly 1 when a target exists without the marker" $? "$OUT8"
printf '%s\n' "$OUT8" | grep -q 'target exists without the generated marker'
msg_ok=$?
printf '%s\n' "$OUT8" | grep -q 'sample.md'
name_ok=$?
[ "$msg_ok" -eq 0 ] && [ "$name_ok" -eq 0 ]
check "hand-written-untouched-message" "the refusal names the specific reason and sample.md" $? "$OUT8"
[ "$RC8" -eq 1 ] && [ "$sum_before" = "$sum_after" ]
check "hand-written-untouched-checksum" "the hand-written file's checksum is unchanged" $?
rm -rf "$WS8"

# ---------------------------------------------------------------------------
# refuses-role-invalid-chars: a role outside [a-z0-9-] - here, one with a
# space - must be refused before it ever reaches $ROLES, the space-joined
# list the rest of the script iterates by word-splitting a role with a
# space would otherwise split into two. The fixture's own filename carries
# the space too, "bad role.md", so its role matches the filename exactly
# and this is the only check it can be failing.
# ---------------------------------------------------------------------------
WS10=$(workspace)
SOURCES10="$WS10/sources"; AGENTS10="$WS10/agents"
mkdir -p "$SOURCES10" "$AGENTS10"
cp "$FIXTURES/bad role.md" "$SOURCES10/bad role.md"
OUT10=$("$GEN" --sources "$SOURCES10" --agents "$AGENTS10" 2>&1)
RC10=$?
[ "$RC10" -eq 1 ]
check "refuses-role-invalid-chars-exit" "the generator refuses a role outside [a-z0-9-] with exit exactly 1" $? "$OUT10"
printf '%s\n' "$OUT10" | grep -q 'role must match'
check "refuses-role-invalid-chars-message" "the generator names the specific reason" $? "$OUT10"
written10=$(find "$AGENTS10" -type f | wc -l | tr -d ' ')
[ "$RC10" -eq 1 ] && [ "$written10" -eq 0 ]
check "refuses-role-invalid-chars-writes-nothing" "nothing is written for a role outside [a-z0-9-]" $? "found $written10 file(s)"
rm -rf "$WS10"

# ---------------------------------------------------------------------------
# refuses-*: each bad-* fixture, alone in its own sources directory.
# ---------------------------------------------------------------------------
for bad in bad-body-placeholder bad-hardcoded-model bad-role-mismatch bad-description-colon; do
    case "$bad" in
        bad-body-placeholder) expect='{{ appears' ;;
        bad-hardcoded-model) expect='is not the whole-value placeholder {{model}}' ;;
        bad-role-mismatch) expect='does not match the filename' ;;
        bad-description-colon) expect="contains ': ', which would break the YAML plain scalar" ;;
    esac
    WSB=$(workspace)
    SOURCESB="$WSB/sources"; AGENTSB="$WSB/agents"
    mkdir -p "$SOURCESB" "$AGENTSB"
    cp "$FIXTURES/$bad.md" "$SOURCESB/$bad.md"
    OUTB=$("$GEN" --sources "$SOURCESB" --agents "$AGENTSB" 2>&1)
    RCB=$?
    # Exactly 1, not merely non-zero: a crash (exit 127, say) is not a
    # refusal and must fail this case, not pass it.
    [ "$RCB" -eq 1 ]
    check "refuses-$bad-exit" "the generator refuses on $bad.md with exit exactly 1" $? "$OUTB"
    printf '%s\n' "$OUTB" | grep -qF "$bad: "
    name_ok=$?
    printf '%s\n' "$OUTB" | grep -qF "$expect"
    reason_ok=$?
    [ "$name_ok" -eq 0 ] && [ "$reason_ok" -eq 0 ]
    check "refuses-$bad-message" "the generator names $bad and its specific reason" $? "$OUTB"
    written=$(find "$AGENTSB" -type f | wc -l | tr -d ' ')
    [ "$RCB" -eq 1 ] && [ "$written" -eq 0 ]
    check "refuses-$bad-writes-nothing" "nothing is written for $bad.md" $? "found $written file(s)"
    rm -rf "$WSB"
done

# ---------------------------------------------------------------------------
# refuses-sources-through-symlink-agents: --agents given through a symlink
# whose target directory holds the (real, unsymlinked) sources dir must
# still be refused. resolve_abs resolves through the symlink with `cd` +
# `pwd -P`; a `pwd -P -> pwd` mutant would leave --agents as the symlink
# path, which shares no textual prefix with the real sources path, and the
# refusal would never fire.
# ---------------------------------------------------------------------------
WS11=$(workspace)
mkdir -p "$WS11/real/src"
ln -s "$WS11/real" "$WS11/link"
cp "$FIXTURES/sample.md" "$WS11/real/src/sample.md"
OUT11A=$("$GEN" --agents "$WS11/link" --sources "$WS11/real/src" 2>&1)
RC11A=$?
written11A=$(find "$WS11/real" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$RC11A" -eq 1 ] && [ "$written11A" -eq 0 ]
check "refuses-sources-through-symlink-agents" "--agents through a symlink onto the real sources dir is refused" $? "rc=$RC11A found $written11A file(s); $OUT11A"
rm -rf "$WS11"

# ---------------------------------------------------------------------------
# refuses-sources-through-symlink-sources: the same, but --sources is the one
# given through the symlink and --agents is the real path.
# ---------------------------------------------------------------------------
WS12=$(workspace)
mkdir -p "$WS12/real/src"
ln -s "$WS12/real" "$WS12/link"
cp "$FIXTURES/sample.md" "$WS12/real/src/sample.md"
OUT12=$("$GEN" --agents "$WS12/real" --sources "$WS12/link/src" 2>&1)
RC12=$?
written12=$(find "$WS12/real" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$RC12" -eq 1 ] && [ "$written12" -eq 0 ]
check "refuses-sources-through-symlink-sources" "--sources through a symlink onto the real agents dir is refused" $? "rc=$RC12 found $written12 file(s); $OUT12"
rm -rf "$WS12"

# ---------------------------------------------------------------------------
# refuses-agents-dot-from-inside-symlink: run from inside the symlink itself,
# with --agents given as "." - resolve_abs must follow the symlink via
# pwd -P from the cwd too, not only when given a full path.
# ---------------------------------------------------------------------------
WS13=$(workspace)
mkdir -p "$WS13/real/src"
ln -s "$WS13/real" "$WS13/link"
cp "$FIXTURES/sample.md" "$WS13/real/src/sample.md"
OUT13=$(cd "$WS13/link" && "$GEN" --agents . --sources "$WS13/real/src" 2>&1)
RC13=$?
written13=$(find "$WS13/real" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$RC13" -eq 1 ] && [ "$written13" -eq 0 ]
check "refuses-agents-dot-from-inside-symlink" "--agents . from inside a symlink onto the real sources dir is refused" $? "rc=$RC13 found $written13 file(s); $OUT13"
rm -rf "$WS13"

# ---------------------------------------------------------------------------
# generate-chmod-failure-fails: a chmod stub that always fails is placed
# first on PATH. Without the "|| die" guard on the chmod call, a failed
# chmod would be silently ignored and the generator would still report
# success and claim to have written the file.
# ---------------------------------------------------------------------------
WS14=$(workspace)
SOURCES14="$WS14/sources"; AGENTS14="$WS14/agents"; STUBBIN14="$WS14/stubbin"
mkdir -p "$SOURCES14" "$AGENTS14" "$STUBBIN14"
cp "$FIXTURES/sample.md" "$SOURCES14/sample.md"
cat > "$STUBBIN14/chmod" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$STUBBIN14/chmod"
OUT14=$(PATH="$STUBBIN14:$PATH" "$GEN" --sources "$SOURCES14" --agents "$AGENTS14" 2>&1)
RC14=$?
[ "$RC14" -eq 1 ]
check "generate-chmod-failure-fails-exit" "generate exits exactly 1 when chmod fails" $? "$OUT14"
printf '%s\n' "$OUT14" | grep -q 'could not set permissions'
check "generate-chmod-failure-fails-message" "generate names the specific reason" $? "$OUT14"
rm -rf "$WS14"

# ---------------------------------------------------------------------------
# refuses-agents-dir-trailing-dot-not-yet-existing: --agents given with a
# trailing "/." must still resolve as the parent of the sources dir even
# when the agents directory does not exist yet - the resolve_abs "*/." case
# is the only thing stripping that trailing component before the ancestor
# walk runs.
# ---------------------------------------------------------------------------
WS15=$(workspace)
OUT15=$("$GEN" --agents "$WS15/newagents/." --sources "$WS15/newagents/src" 2>&1)
RC15=$?
written15=0
[ -d "$WS15/newagents" ] && written15=$(find "$WS15/newagents" -maxdepth 1 -type f | wc -l | tr -d ' ')
[ "$RC15" -eq 1 ] && [ "$written15" -eq 0 ]
check "refuses-agents-dir-trailing-dot-not-yet-existing" "an agents dir given with a trailing /. and not yet existing is still recognised as the sources dir's parent" $? "rc=$RC15 found $written15 file(s); $OUT15"
rm -rf "$WS15"

# ---------------------------------------------------------------------------
# refuses-agents-root, refuses-sources-root: an agents or sources directory
# of / must be refused outright, since the equality-prefix check's pattern
# becomes "//*" against a "/"-rooted sources dir, whose common prefix with
# an agents dir of "/" is empty - the whole-string equality never fires.
# Both run in --check mode against an otherwise-empty or missing directory,
# so nothing could be written to / even if the refusal were missing.
# ---------------------------------------------------------------------------
WS16=$(workspace)
OUT16A=$("$GEN" --check --agents "/" --sources "$WS16/no-such-sources" 2>&1)
RC16A=$?
[ "$RC16A" -eq 1 ]
check "refuses-agents-root" "an agents directory of / is refused outright" $? "$OUT16A"

OUT16B=$("$GEN" --check --sources "/" --agents "$WS16/empty-agents" 2>&1)
RC16B=$?
[ "$RC16B" -eq 1 ]
check "refuses-sources-root" "a sources directory of / is refused outright" $? "$OUT16B"
rm -rf "$WS16"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The agent-pairs contract fails: gen-agent-pairs.sh does not yet do what CF-12 Q17 requires.\n'
    exit 1
fi
printf 'Every agent-pairs case passes: each editor pair renders from one source, and the checks catch a hand edit, drift, a stale target, an orphan and a bad source.\n'

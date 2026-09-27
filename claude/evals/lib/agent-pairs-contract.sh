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
    mktemp -d "${TMPDIR:-/tmp}/agent-pairs-contract.XXXXXX"
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
[ "$RC1" -eq 0 ]
check "generate-writes-pair-exit" "the generator exits 0 on a valid source" $? "$OUT1"

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
fi

# generate-idempotent: run again, expect "unchanged" and byte-identical output.
cksum_before=$(cat "$AGENTS1/sample.md" "$AGENTS1/sample-fable.md" 2>/dev/null | cksum)
OUT1B=$("$GEN" --sources "$SOURCES1" --agents "$AGENTS1" 2>&1)
RC1B=$?
cksum_after=$(cat "$AGENTS1/sample.md" "$AGENTS1/sample-fable.md" 2>/dev/null | cksum)
[ "$RC1B" -eq 0 ] && [ "$cksum_before" = "$cksum_after" ]
check "generate-idempotent" "a second run reports unchanged and the bytes are identical" $? "$OUT1B"

# check-clean-passes: --check on a freshly generated pair exits 0.
CHECK_CLEAN_OUT="$WS1/check-clean.out"
"$GEN" --check --sources "$SOURCES1" --agents "$AGENTS1" >"$CHECK_CLEAN_OUT" 2>&1
RC_CLEAN=$?
[ "$RC_CLEAN" -eq 0 ]
check "check-clean-passes" "--check exits 0 on a freshly generated pair" $?

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
[ "$RC2" -ne 0 ]
check "hand-edit-fails-exit" "--check exits non-zero after a hand-edited body line" $? "$OUT2"
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
[ "$RC3" -ne 0 ]
check "drift-fails-exit" "--check exits non-zero when a pair drifts outside the three fields" $? "$OUT3"
printf '%s\n' "$OUT3" | grep -q 'PAIR DRIFT'
check "drift-fails-names-drift" "--check names PAIR DRIFT" $?
printf '%s\n' "$OUT3" | grep -q 'effort'
check "drift-fails-names-field" "--check names the differing field" $?
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
[ "$RC4" -ne 0 ]
check "source-change-fails" "--check exits non-zero when the source changed without regeneration" $? "$OUT4"
printf '%s\n' "$OUT4" | grep -q 'STALE'
check "source-change-fails-stale" "--check names STALE" $?
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
[ "$RC5" -ne 0 ]
check "missing-generated-fails" "--check exits non-zero when a generated file is deleted" $? "$OUT5"
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
[ "$RC6" -ne 0 ]
check "orphan-fails-exit" "--check exits non-zero on a marker-bearing file with no source" $? "$OUT6"
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
[ "$RC6B" -ne 0 ]
check "orphan-beside-source-fails-exit" "--check exits non-zero on an orphan alongside a real source" $? "$OUT6B"
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
[ "$RC9" -eq 0 ]
check "description-escapes-preserved-exit" "the generator exits 0 on a description with backslash sequences" $?
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
[ "$RC8" -ne 0 ]
check "hand-written-untouched-exit" "the generator refuses when a target exists without the marker" $? "$OUT8"
[ "$sum_before" = "$sum_after" ]
check "hand-written-untouched-checksum" "the hand-written file's checksum is unchanged" $?
rm -rf "$WS8"

# ---------------------------------------------------------------------------
# refuses-*: each bad-* fixture, alone in its own sources directory.
# ---------------------------------------------------------------------------
for bad in bad-body-placeholder bad-hardcoded-model bad-role-mismatch bad-description-colon; do
    WSB=$(workspace)
    SOURCESB="$WSB/sources"; AGENTSB="$WSB/agents"
    mkdir -p "$SOURCESB" "$AGENTSB"
    cp "$FIXTURES/$bad.md" "$SOURCESB/$bad.md"
    OUTB=$("$GEN" --sources "$SOURCESB" --agents "$AGENTSB" 2>&1)
    RCB=$?
    [ "$RCB" -ne 0 ]
    check "refuses-$bad-exit" "the generator refuses on $bad.md" $? "$OUTB"
    written=$(find "$AGENTSB" -type f | wc -l | tr -d ' ')
    [ "$written" -eq 0 ]
    check "refuses-$bad-writes-nothing" "nothing is written for $bad.md" $? "found $written file(s)"
    rm -rf "$WSB"
done

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The agent-pairs contract fails: gen-agent-pairs.sh does not yet do what CF-12 Q17 requires.\n'
    exit 1
fi
printf 'Every agent-pairs case passes: each editor pair renders from one source, and the checks catch a hand edit, drift, a stale target, an orphan and a bad source.\n'

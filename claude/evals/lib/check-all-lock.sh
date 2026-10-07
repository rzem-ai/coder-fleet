#!/usr/bin/env bash
#
# check-all-lock.sh - one check-all at a time per machine (CF-76.1).
#
# Two check-alls started together starved each other of CPU and both failed
# the board section on its per-test timeouts; one after the other they passed.
# check-all.sh now takes a machine-wide lock. This runs a copy of it in a
# scratch tree where every section is a stub, and proves: two runs started
# together do not overlap, and the second says it waited; a run nested inside
# a locked one does not wait on its parent; a lock path that cannot be opened,
# or a wait past CHECK_ALL_LOCK_WAIT, runs unlocked instead of failing or
# hanging; and no section inherits the lock's descriptor, so nothing a section
# leaves running can hold the lock.
#
# Usage:  evals/lib/check-all-lock.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1
LIB_DIR=$(cd "$(dirname "$0")" && pwd)
CHECK_ALL="$LIB_DIR/check-all.sh"
[ -f "$CHECK_ALL" ] || { printf 'check-all-lock: missing %s\n' "$CHECK_ALL" >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { printf 'check-all-lock: needs python3\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/check-all-lock.XXXXXX") || exit 2
HOLDER=""
cleanup() { [ -n "$HOLDER" ] && kill "$HOLDER" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# This contract runs inside a locked check-all; its own runs must not read
# that as already holding the lock.
unset CHECK_ALL_LOCK_HELD CHECK_ALL_LOCK CHECK_ALL_SERIAL

PASSED=0
FAILED=0
check() {
    # $1 case, $2 requirement, $3 predicate result (0 ok), $4 detail
    if [ "$3" -eq 0 ]; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %-26s %s\n' "$1" "$2"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %-26s %s\n' "$1" "$2"
        [ -n "${4:-}" ] && printf '        %s\n' "$4"
    fi
    return 0
}

ROOT="$TMP/repo"
mkdir -p "$ROOT/claude/evals/lib" "$ROOT/claude/coder-fleet/hooks" "$ROOT/claude/coder-fleet/scripts" \
         "$ROOT/claude/coder-fleet/workflows" "$ROOT/claude/coder-fleet/board/node_modules" \
         "$ROOT/claude/coder-fleet/.claude-plugin" "$ROOT/claude/scripts" "$ROOT/.claude-plugin" "$TMP/bin"
stub() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$1"; chmod +x "$1"; }

cp "$CHECK_ALL" "$ROOT/claude/evals/lib/check-all.sh"
for f in "$LIB_DIR"/*.sh; do
    name=$(basename "$f")
    [ "$name" = check-all.sh ] && continue
    stub "$ROOT/claude/evals/lib/$name" 'exit 0'
done
for f in "$LIB_DIR"/*.mjs; do printf '\n' > "$ROOT/claude/evals/lib/$(basename "$f")"; done
# One section records when it ran and sleeps, so two runs' sections can be
# compared for overlap. Another fails if the lock's descriptor reached it.
SPANS="$TMP/spans"
stub "$ROOT/claude/evals/lib/handoff-parity.sh" "python3 -c 'import os,time; print(os.environ.get(\"RUN_TAG\",\"?\"), \"S\", time.time())' >> '$SPANS'; sleep 2; python3 -c 'import os,time; print(os.environ.get(\"RUN_TAG\",\"?\"), \"E\", time.time())' >> '$SPANS'"
stub "$ROOT/claude/evals/lib/roster-contract.sh" '[ -e /dev/fd/9 ] && { echo "descriptor 9 is open"; exit 1; }; exit 0'
stub "$ROOT/claude/coder-fleet/hooks/enforce-disabled-agents.sh" 'exit 0'
stub "$ROOT/claude/scripts/gen-glossary-rule.sh" 'exit 0'
stub "$ROOT/claude/scripts/gen-agent-pairs.sh" 'exit 0'
printf 'const x = 1;\n' > "$ROOT/claude/coder-fleet/workflows/stub.js"
printf '{"version":"1.0.0"}\n' > "$ROOT/claude/coder-fleet/.claude-plugin/plugin.json"
printf '{"plugins":[{"name":"coder-fleet","version":"1.0.0"}]}\n' > "$ROOT/.claude-plugin/marketplace.json"
stub "$TMP/bin/bun" 'exit 0'
stub "$TMP/bin/bunx" 'exit 0'

LOCK="$TMP/check-all.lock"
run_copy() { # $1 output file; the rest are VAR=value pairs for the run
    local out="$1"; shift
    env "$@" PATH="$TMP/bin:$PATH" bash "$ROOT/claude/evals/lib/check-all.sh" > "$out" 2>&1 < /dev/null
}
# hold_lock: a process that takes the lock and keeps it until killed.
hold_lock() {
    python3 -c 'import fcntl,sys,time
f=open(sys.argv[1],"a"); fcntl.flock(f, fcntl.LOCK_EX); print("held", flush=True); time.sleep(600)' "$LOCK" > "$TMP/holder.out" &
    HOLDER=$!
    for _ in $(seq 1 50); do grep -q held "$TMP/holder.out" 2>/dev/null && return 0; sleep 0.1; done
    return 1
}
release_lock() { [ -n "$HOLDER" ] && kill "$HOLDER" 2>/dev/null; wait "$HOLDER" 2>/dev/null; HOLDER=""; }

# serial-runs: two runs started together take turns.
: > "$SPANS"
run_copy "$TMP/a.out" CHECK_ALL_LOCK_FILE="$LOCK" RUN_TAG=a & A=$!
run_copy "$TMP/b.out" CHECK_ALL_LOCK_FILE="$LOCK" RUN_TAG=b & B=$!
wait "$A"; RA=$?; wait "$B"; RB=$?
python3 - "$SPANS" <<'PY'
import sys
spans = {}
for line in open(sys.argv[1]):
    tag, kind, at = line.split()
    spans.setdefault(tag, {})[kind] = float(at)
if sorted(spans) != ["a", "b"] or any(set(v) != {"S", "E"} for v in spans.values()):
    sys.exit(1)
first, second = sorted(spans.values(), key=lambda v: v["S"])
# The first run's section has ended before the second run's section starts.
sys.exit(0 if first["E"] <= second["S"] else 1)
PY
check serial-runs "two runs started together never run their sections at the same time" $? "$(cat "$SPANS" | tr '\n' ' ')"
[ "$RA" -eq 0 ] && [ "$RB" -eq 0 ]
check serial-runs-pass "both runs still pass" $? "a=$RA b=$RB"
grep -q 'another check-all holds' "$TMP/a.out" "$TMP/b.out"
check serial-runs-say "the run that waits says it is waiting" $?

# nested: a run that already holds the lock, by its parent, does not wait.
hold_lock || check nested "the lock holder started" 1
start=$(date +%s)
run_copy "$TMP/n.out" CHECK_ALL_LOCK_FILE="$LOCK" CHECK_ALL_LOCK_HELD=1 CHECK_ALL_LOCK_WAIT=30
RN=$?; took=$(( $(date +%s) - start ))
[ "$RN" -eq 0 ] && [ "$took" -lt 20 ] && ! grep -q 'another check-all holds' "$TMP/n.out"
check nested-no-wait "a run nested inside a locked run does not wait on its parent" $? "rc=$RN took=${took}s"

# wait-timeout: past CHECK_ALL_LOCK_WAIT the run goes ahead unlocked.
start=$(date +%s)
run_copy "$TMP/w.out" CHECK_ALL_LOCK_FILE="$LOCK" CHECK_ALL_LOCK_WAIT=1
RW=$?; took=$(( $(date +%s) - start ))
[ "$RW" -eq 0 ] && grep -q 'running unlocked' "$TMP/w.out" && [ "$took" -lt 20 ]
check wait-timeout "a wait past CHECK_ALL_LOCK_WAIT runs unlocked, and says so" $? "rc=$RW took=${took}s"
release_lock

# bad-path: a lock path that cannot be opened runs unlocked.
run_copy "$TMP/p.out" CHECK_ALL_LOCK_FILE="$TMP/no/such/dir/x.lock"
RP=$?
[ "$RP" -eq 0 ] && grep -q 'cannot open the lock' "$TMP/p.out"
check bad-path "an unopenable lock path runs unlocked, and says so" $? "rc=$RP"

# link-path: a lock path that is a symlink is refused, and the run goes
# unlocked rather than opening whatever the link points at.
ln -s "$TMP/elsewhere" "$TMP/linked.lock"
run_copy "$TMP/l.out" CHECK_ALL_LOCK_FILE="$TMP/linked.lock"
RL=$?
[ "$RL" -eq 0 ] && grep -q 'cannot open the lock' "$TMP/l.out" && [ ! -e "$TMP/elsewhere" ]
check link-path "a lock path that is a symlink is refused, and its target is not created" $? "rc=$RL"

# no-descriptor: a section never sees descriptor 9 (the roster stub fails if
# it does), checked on a locked run.
run_copy "$TMP/d.out" CHECK_ALL_LOCK_FILE="$LOCK"
RD=$?
[ "$RD" -eq 0 ] && ! grep -q 'descriptor 9 is open' "$TMP/d.out"
check no-descriptor "no section inherits the lock's descriptor" $? "rc=$RD"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] || exit 1

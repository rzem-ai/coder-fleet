#!/usr/bin/env bash
#
# editor-models-contract.sh - scripts/editor-models.py, which /init and
# /kickoff run to record a project's editor answers (CF-12.5; CF-12 spec Q8,
# Q9, Q12, Q16, Q21).
#
# One answer per editor, opus, fable or neither, recorded twice: a
# `Spec editor:` or `Tech editor:` line in the project's AGENTS.md, which the
# lead and challenge-gate.py read, and Agent(coder-fleet:<name>) rules in
# .claude/settings.json permissions.deny for every definition not chosen. The
# merge touches no other key, and a refusal touches neither file. Every case
# runs against the real script in fixture projects under this test's own
# temporary directory, never in this checkout.
#
# Usage:  claude/evals/lib/editor-models-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
SCRIPT="$PLUGIN_ROOT/scripts/editor-models.py"
GATE="$PLUGIN_ROOT/scripts/challenge-gate.py"
TEMPLATE="$PLUGIN_ROOT/templates/AGENTS.md"

command -v python3 >/dev/null 2>&1 || { printf 'editor-models-contract: python3 is needed\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/editor-models-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
trap 'rm -rf "$TMP"' EXIT

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null

PASSED=0
FAILED=0
ok() {
    PASSED=$((PASSED + 1))
    [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"
    return 0
}
bad() {
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s\n' "$1"
    [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /' | head -n 12
    return 0
}
expect() { # $1 label, rest: command that succeeds when the assertion holds
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then ok "$label"; else bad "$label" "$(cat "$OUT" 2>/dev/null)"; fi
}

OUT="$TMP/out"
RC=0
em() { # runs the script with its arguments; sets RC, writes $OUT
    python3 -I "$SCRIPT" "$@" > "$OUT" 2>&1
    RC=$?
}

N=0
project() { # $1 AGENTS.md content (printf format, may be '-' for none), $2 settings.json content or '-'
    N=$((N + 1))
    P="$TMP/p$N"
    mkdir -p "$P/.claude"
    [ "$1" != '-' ] && printf "$1" > "$P/AGENTS.md"
    [ "$2" != '-' ] && printf '%s' "$2" > "$P/.claude/settings.json"
    cp -p "$P/AGENTS.md" "$TMP/p$N.agents.before" 2>/dev/null || :
    cp -p "$P/.claude/settings.json" "$TMP/p$N.settings.before" 2>/dev/null || :
    return 0
}
agents_unchanged()   { cmp -s "$P/AGENTS.md" "$TMP/p$N.agents.before"; }
settings_unchanged() { cmp -s "$P/.claude/settings.json" "$TMP/p$N.settings.before"; }
no_settings()        { [ ! -e "$P/.claude/settings.json" ]; }
agents_is()          { printf "$1" | cmp -s - "$P/AGENTS.md"; }
rc_is()              { [ "$RC" -eq "$1" ]; }
out_has()            { grep -qF -- "$1" "$OUT"; }
deny_is() { # $1 JSON array the deny list must equal, in order
    python3 -I - "$P/.claude/settings.json" "$1" <<'PY'
import json, sys
s = json.load(open(sys.argv[1]))
sys.exit(0 if s.get('permissions', {}).get('deny') == json.loads(sys.argv[2]) else 1)
PY
}
others_unchanged() { # every key but permissions.deny equals the before copy
    python3 -I - "$TMP/p$N.settings.before" "$P/.claude/settings.json" <<'PY'
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:3])
for s in (a, b):
    s.get('permissions', {}).pop('deny', None)
    if s.get('permissions') == {}:
        s.pop('permissions')
sys.exit(0 if a == b and list(a) == list(b) else 1)
PY
}

PLACEHOLDERS='# P\n\n## Where work lives\n\nSpec editor: <opus, fable or neither>\nTech editor: <opus, fable or neither>\n\n## Writing conventions\n\nAustralian English.\n'
SETTINGS='{
  "agent": "coder-fleet:lead",
  "env": {
    "CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"
  },
  "permissions": {
    "allow": [
      "Bash(ls:*)"
    ],
    "deny": [
      "Read(./.env)"
    ]
  },
  "worktree": {
    "baseRef": "head"
  }
}
'

# ---------------------------------------------------------------------------
[ "$VERBOSE" -eq 1 ] && printf '\nThe template carries both lines as placeholders\n'
expect 'the template has a Spec editor placeholder line'  grep -qE '^Spec editor: <[^>]+>$' "$TEMPLATE"
expect 'the template has a Tech editor placeholder line'  grep -qE '^Tech editor: <[^>]+>$' "$TEMPLATE"
expect 'neither placeholder is a FILL marker'             bash -c '! grep -E "^(Spec|Tech) editor: <FILL:" "$1"' _ "$TEMPLATE"
N=$((N + 1)); P="$TMP/p$N"; mkdir -p "$P"; cp "$TEMPLATE" "$P/AGENTS.md"
em status --root "$P"
expect 'status reads the template as no answer for either' bash -c 'grep -qx "spec editor: none" "$1" && grep -qx "tech editor: none" "$1"' _ "$OUT"

# ---------------------------------------------------------------------------
[ "$VERBOSE" -eq 1 ] && printf '\nstatus\n'
project '# P\n\nSpec editor: opus\nTech editor: `fable`\n' -
em status --root "$P"
expect 'status reads opus'                          grep -qx 'spec editor: opus' "$OUT"
expect 'status reads a backticked fable'            grep -qx 'tech editor: fable' "$OUT"
expect 'status exits 0'                             rc_is 0
project '# P\n\nSpec editor: Neither\nTech editor:\n' -
em status --root "$P"
expect 'status reads Neither in any case'           grep -qx 'spec editor: neither' "$OUT"
expect 'status reads an empty value as none'        grep -qx 'tech editor: none' "$OUT"
project '# P\n\nSpec editor: maybe\n' -
em status --root "$P"
expect 'status names a value it cannot read'        grep -qx 'spec editor: unreadable (maybe)' "$OUT"
expect 'status reads a missing line as none'        grep -qx 'tech editor: none' "$OUT"
project - -
em status --root "$P"
expect 'status with no AGENTS.md reads none'        grep -qx 'spec editor: none' "$OUT"

# ---------------------------------------------------------------------------
[ "$VERBOSE" -eq 1 ] && printf '\nset writes the record and the deny rules\n'
project "$PLACEHOLDERS" "$SETTINGS"
em set spec opus --root "$P"
expect 'opus: exits 0'                              rc_is 0
expect 'opus: the placeholder becomes the answer, nothing else changes' \
    agents_is '# P\n\n## Where work lives\n\nSpec editor: opus\nTech editor: <opus, fable or neither>\n\n## Writing conventions\n\nAustralian English.\n'
expect 'opus: denies the -fable definition, after the existing rules' \
    deny_is '["Read(./.env)", "Agent(coder-fleet:spec-editor-fable)"]'
expect 'opus: no other key changes, nor key order'  others_unchanged
expect 'opus: says what it denied'                  out_has 'Agent(coder-fleet:spec-editor-fable)'

project "$PLACEHOLDERS" "$SETTINGS"
em set spec fable --root "$P"
expect 'fable: denies the unsuffixed definition only' deny_is '["Read(./.env)", "Agent(coder-fleet:spec-editor)"]'
expect 'fable: the line reads fable'                grep -qx 'Spec editor: fable' "$P/AGENTS.md"
expect 'fable: no other key changes'                others_unchanged

project "$PLACEHOLDERS" "$SETTINGS"
em set tech neither --root "$P"
expect 'neither: denies both definitions' \
    deny_is '["Read(./.env)", "Agent(coder-fleet:tech-editor)", "Agent(coder-fleet:tech-editor-fable)"]'
expect 'neither: the line reads neither'            grep -qx 'Tech editor: neither' "$P/AGENTS.md"
expect 'neither: the spec placeholder is untouched' grep -qx 'Spec editor: <opus, fable or neither>' "$P/AGENTS.md"
expect 'neither: no other key changes'              others_unchanged

project "$PLACEHOLDERS" '{"agent": "coder-fleet:lead"}'
em set tech opus --root "$P"
expect 'no permissions object: one is added with the deny list' deny_is '["Agent(coder-fleet:tech-editor-fable)"]'
expect 'no permissions object: agent is kept'       others_unchanged

project "$PLACEHOLDERS" '{"permissions": {"allow": ["Read"]}}'
em set spec opus --root "$P"
expect 'no deny list: one is added beside allow'    deny_is '["Agent(coder-fleet:spec-editor-fable)"]'
expect 'no deny list: allow is kept'                others_unchanged

project "$PLACEHOLDERS" -
em set spec opus --root "$P"
expect 'no settings.json: it is created'            deny_is '["Agent(coder-fleet:spec-editor-fable)"]'
expect 'no settings.json: it holds the deny rule and nothing else' \
    python3 -I -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])) == {"permissions": {"deny": ["Agent(coder-fleet:spec-editor-fable)"]}} else 1)' "$P/.claude/settings.json"

project "$PLACEHOLDERS" '{
    "agent": "coder-fleet:lead"
}
'
em set spec opus --root "$P"
expect 'a four-space settings file stays four-space' \
    python3 -I -c 'import json,sys; t=open(sys.argv[1]).read(); sys.exit(0 if t == json.dumps(json.loads(t), indent=4) + "\n" and "\n    \"agent\"" in t else 1)' "$P/.claude/settings.json"

# ---------------------------------------------------------------------------
[ "$VERBOSE" -eq 1 ] && printf '\nWhere a missing line goes\n'
project '# P\n\n## Where work lives\n\nSpecs live in docs/specs.\n\n## Writing conventions\n\nShort.\n' '{}'
em set spec opus --root "$P"
expect 'no line: it ends the Where work lives section' \
    agents_is '# P\n\n## Where work lives\n\nSpecs live in docs/specs.\n\nSpec editor: opus\n\n## Writing conventions\n\nShort.\n'
em set tech fable --root "$P"
expect 'the second line goes straight after the first' \
    agents_is '# P\n\n## Where work lives\n\nSpecs live in docs/specs.\n\nSpec editor: opus\nTech editor: fable\n\n## Writing conventions\n\nShort.\n'
expect 'both answers deny their own definitions' \
    deny_is '["Agent(coder-fleet:spec-editor-fable)", "Agent(coder-fleet:tech-editor)"]'

project '# P\n\nSpecs live in docs/specs.\n' '{}'
em set tech opus --root "$P"
expect 'no Where work lives section: appended at the end' agents_is '# P\n\nSpecs live in docs/specs.\n\nTech editor: opus\n'

project '# P\n\nNo trailing newline' '{}'
em set spec neither --root "$P"
expect 'a file with no final newline gets one before the line' agents_is '# P\n\nNo trailing newline\n\nSpec editor: neither\n'

project '# P\r\n\r\n## Where work lives\r\n\r\nSpec editor: <opus, fable or neither>\r\n' '{}'
em set spec opus --root "$P"
expect 'CRLF line endings are kept'                 agents_is '# P\r\n\r\n## Where work lives\r\n\r\nSpec editor: opus\r\n'

# ---------------------------------------------------------------------------
[ "$VERBOSE" -eq 1 ] && printf '\nRefusals change nothing\n'
project '# P\n\nSpec editor: opus\n' "$SETTINGS"
em set spec fable --root "$P"
expect 'a recorded answer: exits 1'                 rc_is 1
expect 'a recorded answer: AGENTS.md unchanged'     agents_unchanged
expect 'a recorded answer: settings unchanged'      settings_unchanged
expect 'a recorded answer: says it is recorded'     out_has 'already records'

project '# P\n\nSpec editor: maybe\n' "$SETTINGS"
em set spec opus --root "$P"
expect 'an unreadable answer: exits 1'              rc_is 1
expect 'an unreadable answer: AGENTS.md unchanged'  agents_unchanged
expect 'an unreadable answer: settings unchanged'   settings_unchanged

project - "$SETTINGS"
em set spec opus --root "$P"
expect 'no AGENTS.md: exits 1'                      rc_is 1
expect 'no AGENTS.md: settings unchanged'           settings_unchanged

project - -
em set spec opus --root "$P"
expect 'no AGENTS.md and no settings: none created' no_settings

project "$PLACEHOLDERS" '{"agent": '
em set spec opus --root "$P"
expect 'invalid JSON: exits 1'                      rc_is 1
expect 'invalid JSON: AGENTS.md unchanged'          agents_unchanged
expect 'invalid JSON: settings unchanged'           settings_unchanged

project "$PLACEHOLDERS" '["not", "an", "object"]'
em set spec opus --root "$P"
expect 'settings not an object: exits 1'            rc_is 1
expect 'settings not an object: unchanged'          settings_unchanged

project "$PLACEHOLDERS" '{"permissions": []}'
em set spec opus --root "$P"
expect 'permissions not an object: exits 1'         rc_is 1
expect 'permissions not an object: AGENTS.md unchanged' agents_unchanged
expect 'permissions not an object: settings unchanged' settings_unchanged

project "$PLACEHOLDERS" '{"permissions": {"deny": "Agent(x)"}}'
em set spec opus --root "$P"
expect 'deny not a list: exits 1'                   rc_is 1
expect 'deny not a list: settings unchanged'        settings_unchanged

project "$PLACEHOLDERS" '{"permissions": {"deny": ["Agent(coder-fleet:spec-editor)"]}}'
em set spec opus --root "$P"
expect 'the chosen definition already denied: exits 1' rc_is 1
expect 'the chosen definition already denied: AGENTS.md unchanged' agents_unchanged
expect 'the chosen definition already denied: settings unchanged' settings_unchanged
expect 'the chosen definition already denied: names the rule' out_has 'Agent(coder-fleet:spec-editor)'

# ---------------------------------------------------------------------------
[ "$VERBOSE" -eq 1 ] && printf '\nA rerun adds nothing twice\n'
project "$PLACEHOLDERS" '{"permissions": {"deny": ["Agent(coder-fleet:tech-editor)"]}}'
em set tech neither --root "$P"
expect 'a rule already present is not repeated' \
    deny_is '["Agent(coder-fleet:tech-editor)", "Agent(coder-fleet:tech-editor-fable)"]'
project "$PLACEHOLDERS" '{"permissions": {"deny": ["Agent(coder-fleet:spec-editor-fable)"]}}'
em set spec opus --root "$P"
expect 'every rule already present: settings byte-identical' settings_unchanged
expect 'every rule already present: the line is still written' grep -qx 'Spec editor: opus' "$P/AGENTS.md"

# ---------------------------------------------------------------------------
[ "$VERBOSE" -eq 1 ] && printf '\nUsage\n'
project "$PLACEHOLDERS" "$SETTINGS"
em set spec sonnet --root "$P";   expect 'an unknown answer: exits 2'  rc_is 2
em set docs opus --root "$P";     expect 'an unknown editor: exits 2'  rc_is 2
em set spec --root "$P";          expect 'a missing answer: exits 2'   rc_is 2
em frobnicate;                     expect 'an unknown command: exits 2' rc_is 2
expect 'usage errors touch nothing' bash -c 'cmp -s "$1" "$2" && cmp -s "$3" "$4"' _ \
    "$P/AGENTS.md" "$TMP/p$N.agents.before" "$P/.claude/settings.json" "$TMP/p$N.settings.before"

# ---------------------------------------------------------------------------
[ "$VERBOSE" -eq 1 ] && printf '\nThe root defaults to the repository top level\n'
if command -v git >/dev/null 2>&1; then
    project "$PLACEHOLDERS" '{}'
    git -C "$P" init -q
    mkdir -p "$P/sub/dir"
    (cd "$P/sub/dir" && python3 -I "$SCRIPT" set spec opus) > "$OUT" 2>&1
    RC=$?
    expect 'run from a subdirectory: exits 0'       rc_is 0
    expect 'run from a subdirectory: writes the top-level AGENTS.md' grep -qx 'Spec editor: opus' "$P/AGENTS.md"
    expect 'run from a subdirectory: writes the top-level settings' deny_is '["Agent(coder-fleet:spec-editor-fable)"]'
    expect 'run from a subdirectory: writes nothing there' bash -c '[ -z "$(ls -A "$1")" ]' _ "$P/sub/dir"
else
    bad 'git is needed for the top-level case'
fi

# ---------------------------------------------------------------------------
[ "$VERBOSE" -eq 1 ] && printf '\nThe script and the gate read the Spec editor line alike\n'
PARITY="$TMP/parity"
mkdir -p "$PARITY"
i=0
for content in \
    'Spec editor: opus\n' 'Spec editor: FABLE\n' 'Spec editor: `neither`\n' 'Spec editor:\n' \
    'Spec editor: <opus, fable or neither>\n' 'Spec editor: <FILL: x>\n' 'Spec editor: maybe\n' \
    'Spec editor: opus   \n' 'spec editor: opus\n' ' Spec editor: opus\n' 'Spec editor: opus\nSpec editor: fable\n' \
    'Spec editor: <x>\nSpec editor: opus\n' 'Spec editor: ``\n' 'Spec editor:opus\n' 'nothing here\n'; do
    i=$((i + 1))
    printf "$content" > "$PARITY/$i.md"
done
python3 -I - "$GATE" "$SCRIPT" "$PARITY" "$i" > "$OUT" 2>&1 <<'PY'
import importlib.util, sys
# Loading a module writes its bytecode beside it, which would be a write into
# the checkout under test.
sys.dont_write_bytecode = True
def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
gate, em = load(sys.argv[1], 'gate'), load(sys.argv[2], 'em')
bad = 0
for i in range(1, int(sys.argv[4]) + 1):
    path = '%s/%d.md' % (sys.argv[3], i)
    g = gate.read_record(path)
    g = 'none' if g is None else ('unreadable (%s)' % g[1] if isinstance(g, tuple) else g)
    e = em.describe(em.read_answer(path, 'spec'))
    if g != e:
        bad += 1
        print('%r: gate %s, editor-models %s' % (open(path).read(), g, e))
sys.exit(1 if bad else 0)
PY
RC=$?
expect 'every fixture reads the same through both' rc_is 0

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'An editor answer may be recorded wrongly, or its deny rules may touch other settings.\n'
    exit 1
fi
printf 'Each editor answer is recorded once, in AGENTS.md and as deny rules, and nothing else changes.\n'

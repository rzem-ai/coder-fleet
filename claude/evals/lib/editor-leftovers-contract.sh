#!/usr/bin/env bash
#
# editor-leftovers-contract.sh - scripts/editor-leftovers.py, which /kickoff
# runs to find and, on the human's yes, remove what an earlier /init wrote for
# the editors: `Spec editor:` and `Tech editor:` lines in AGENTS.md, with the
# template's paragraph after them, and the editor deny rules in
# .claude/settings.json and .claude/settings.local.json.
#
# Every removal is compared byte for byte with a hand-written expected file,
# so "every other byte as it was" is a cmp, not a grep. Every case runs in a
# fixture project under this test's own temporary directory.
#
# Usage:  claude/evals/lib/editor-leftovers-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
PLUGIN_ROOT="$(cd "$LIB_DIR/../.." && pwd)/coder-fleet"
SCRIPT="$PLUGIN_ROOT/scripts/editor-leftovers.py"

command -v python3 >/dev/null 2>&1 || { printf 'editor-leftovers-contract: python3 is needed\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/editor-leftovers-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
trap 'rm -rf "$TMP"' EXIT

PASSED=0
FAILED=0
ok() { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"; return 0; }
bad() {
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s\n' "$1"
    [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /' | head -n 14
    return 0
}

OUT="$TMP/out"
RC=0
N=0
project() { # $1 AGENTS.md, $2 settings.json, $3 settings.local.json; printf formats, '-' for none
    N=$((N + 1))
    P="$TMP/p$N"
    mkdir -p "$P/.claude"
    [ "$1" != '-' ] && printf "$1" > "$P/AGENTS.md"
    [ "$2" != '-' ] && printf "$2" > "$P/.claude/settings.json"
    [ "${3:--}" != '-' ] && printf "$3" > "$P/.claude/settings.local.json"
    cp -Rp "$P" "$TMP/p$N.before"
    return 0
}
el() { python3 -I "$SCRIPT" "$@" --root "$P" > "$OUT" 2>&1; RC=$?; }
is() { # $1 label, $2 file under the project, $3 expected content (printf format)
    printf "$3" > "$TMP/want"
    if cmp -s "$TMP/want" "$P/$2"; then ok "$1"
    else bad "$1" "rc $RC; want vs got:
$(diff "$TMP/want" "$P/$2" | cat -A 2>/dev/null || diff "$TMP/want" "$P/$2")
$(cat "$OUT")"; fi
}
unchanged() { # $1 label
    if diff -r "$TMP/p$N.before" "$P" >/dev/null 2>&1; then ok "$1"; else bad "$1" "$(diff -r "$TMP/p$N.before" "$P"; cat "$OUT")"; fi
}
rc_is() { if [ "$RC" -eq "$2" ]; then ok "$1"; else bad "$1" "rc $RC: $(cat "$OUT")"; fi; }

TEMPLATE_AGENTS='# P\n\n## Where work lives\n\nWithout the line, specs apply as above.\n\nSpec editor: opus\nTech editor: neither\n\nThose two lines say whether this project runs a spec editor and a tech editor, both on Opus, or neither.\n\nApp start: node server.js\n'
TEMPLATE_WANT='# P\n\n## Where work lives\n\nWithout the line, specs apply as above.\n\nApp start: node server.js\n'

# ---------------------------------------------------------------------------
# AGENTS.md
# ---------------------------------------------------------------------------
project "$TEMPLATE_AGENTS" -
el status
if [ "$RC" -eq 0 ] && grep -q '^state: found$' "$OUT" && grep -q $'^found\tAGENTS.md:7\tSpec editor: opus$' "$OUT"; then ok status-names-the-lines
else bad status-names-the-lines "rc $RC: $(cat "$OUT")"; fi
unchanged status-writes-nothing
el remove
rc_is remove-exits-0 0
is agents-lines-and-template-paragraph-go AGENTS.md "$TEMPLATE_WANT"
el remove
if [ "$RC" -eq 0 ] && grep -q '^state: none$' "$OUT"; then ok rerun-finds-nothing; else bad rerun-finds-nothing "rc $RC: $(cat "$OUT")"; fi

# This repo's own shape: the two lines with no paragraph after them.
project '# R\n\nA merge cuts no release.\n\nSpec editor: opus\nTech editor: opus\n\n## Releasing\n\nA release.\n' -
el remove
is agents-lines-without-paragraph-go AGENTS.md '# R\n\nA merge cuts no release.\n\n## Releasing\n\nA release.\n'

# Lines at the end of a file with no final newline, and CRLF endings.
project '# R\n\nText.\n\nSpec editor: opus' -
el remove
is agents-lines-at-end-go AGENTS.md '# R\n\nText.\n'
project '# R\r\n\r\nText.\r\n\r\nSpec editor: opus\r\n\r\nMore.\r\n' -
el remove
is agents-crlf-kept AGENTS.md '# R\r\n\r\nText.\r\n\r\nMore.\r\n'

# Only a line starting exactly with the key goes.
project '# R\n\nThe Spec editor: is gone.\n- Spec editor: opus\nspec editor: opus\n' -
el remove
if [ "$RC" -eq 0 ] && grep -q '^state: none$' "$OUT"; then ok agents-other-mentions-are-not-leftovers; else bad agents-other-mentions-are-not-leftovers "$(cat "$OUT")"; fi
unchanged agents-other-mentions-unchanged

# ---------------------------------------------------------------------------
# settings.json and settings.local.json
# ---------------------------------------------------------------------------
project - '{\n  "agent": "coder-fleet:lead",\n  "permissions": {\n    "deny": [\n      "Read(./.env)",\n      "Agent(coder-fleet:spec-editor)",\n      "Bash(rm:*)",\n      "Agent(coder-fleet:tech-editor-fable)"\n    ]\n  },\n  "n": 1.50\n}\n'
el remove
is settings-other-deny-entries-kept .claude/settings.json '{\n  "agent": "coder-fleet:lead",\n  "permissions": {\n    "deny": [\n      "Read(./.env)",\n      "Bash(rm:*)"\n    ]\n  },\n  "n": 1.50\n}\n'

project - '{\n  "permissions": {\n    "deny": [\n      "Agent(coder-fleet:spec-editor-fable)",\n      "Agent(coder-fleet:tech-editor)"\n    ],\n    "allow": ["Read"]\n  }\n}\n'
el remove
is settings-emptied-list-is-brackets .claude/settings.json '{\n  "permissions": {\n    "deny": [],\n    "allow": ["Read"]\n  }\n}\n'

project - '{"permissions":{"deny":["Agent(coder-fleet:spec-editor)","X"]},"n":1e3}'
el remove
is settings-compact-file-keeps-its-layout .claude/settings.json '{"permissions":{"deny":["X"]},"n":1e3}'

project - '{\n  "permissions": {\n    "deny": [\n\t\t\t"Agent(coder-fleet:spec-editor)",\n      "Read(./.env)"\n    ]\n  }\n}\n'
el remove
is settings-kept-entry-keeps-its-indentation .claude/settings.json '{\n  "permissions": {\n    "deny": [\n      "Read(./.env)"\n    ]\n  }\n}\n'

project - - '{\n  "permissions": {\n    "deny": [\n      "Agent(coder-fleet:tech-editor)"\n    ]\n  }\n}\n'
el remove
is settings-local-json-too .claude/settings.local.json '{\n  "permissions": {\n    "deny": []\n  }\n}\n'

# A prefix or a near name is not a leftover.
project - '{"permissions": {"deny": ["Agent(coder-fleet:spec-editor-x)", "Agent(spec-editor)", "Agent(coder-fleet:spec-writer)"]}}'
el remove
unchanged settings-near-names-unchanged

# ---------------------------------------------------------------------------
# None of them, and refusals
# ---------------------------------------------------------------------------
project '# P\n\nNothing about editors.\n' '{\n  "permissions": {\n    "deny": [\n      "Read(./.env)"\n    ]\n  }\n}' '{"x": 1}'
el status
if [ "$RC" -eq 0 ] && grep -q '^state: none$' "$OUT"; then ok none-status-says-none; else bad none-status-says-none "rc $RC: $(cat "$OUT")"; fi
el remove
rc_is none-remove-exits-0 0
unchanged none-every-byte-unchanged

project - - -
el remove
if [ "$RC" -eq 0 ] && grep -q '^state: none$' "$OUT"; then ok no-files-is-none; else bad no-files-is-none "rc $RC: $(cat "$OUT")"; fi
unchanged no-files-nothing-created

project "$TEMPLATE_AGENTS" '{"permissions": {"deny": ["Agent(coder-fleet:spec-editor)"]}}' '{"permissions": '
el remove
rc_is invalid-json-refused 1
if grep -q $'^refused\t.claude/settings.local.json\t' "$OUT"; then ok invalid-json-names-the-file; else bad invalid-json-names-the-file "$(cat "$OUT")"; fi
unchanged invalid-json-nothing-written-anywhere

project - '{"permissions": {"deny": ["Agent(coder-fleet:spec-editor)"]}, "permissions": {}}'
el remove
rc_is duplicate-key-refused 1
unchanged duplicate-key-nothing-written

project - '\357\273\277{"permissions": {"deny": ["Agent(coder-fleet:spec-editor)"]}}'
el remove
rc_is byte-order-mark-refused 1
unchanged byte-order-mark-nothing-written

# A link out of the project is refused before anything is written.
project "$TEMPLATE_AGENTS" -
mkdir -p "$TMP/outside"
printf '{"permissions": {"deny": ["Agent(coder-fleet:spec-editor)"]}}' > "$TMP/outside/settings.json"
ln -s "$TMP/outside/settings.json" "$P/.claude/settings.json"
rm -rf "$TMP/p$N.before"; cp -Rp "$P" "$TMP/p$N.before"
el remove
rc_is outside-link-refused 1
unchanged outside-link-nothing-written
if [ "$(cat "$TMP/outside/settings.json")" = '{"permissions": {"deny": ["Agent(coder-fleet:spec-editor)"]}}' ]; then ok outside-link-target-untouched
else bad outside-link-target-untouched "$(cat "$TMP/outside/settings.json")"; fi

# Mode kept, and a link inside the project written through.
project - -
mkdir -p "$P/real"
printf '{"permissions": {"deny": ["Agent(coder-fleet:spec-editor)", "X"]}}' > "$P/real/settings.json"
chmod 640 "$P/real/settings.json"
ln -s ../real/settings.json "$P/.claude/settings.json"
el remove
if [ "$RC" -eq 0 ] && [ -L "$P/.claude/settings.json" ] && [ "$(cat "$P/real/settings.json")" = '{"permissions": {"deny": ["X"]}}' ] \
    && [ "$(python3 -I -c 'import os,sys; print(oct(os.stat(sys.argv[1]).st_mode & 0o777))' "$P/real/settings.json")" = 0o640 ]; then ok link-written-through-mode-kept
else bad link-written-through-mode-kept "rc $RC: $(cat "$OUT"; ls -l "$P/.claude" "$P/real")"; fi

python3 -I "$SCRIPT" frobnicate > "$OUT" 2>&1; RC=$?
rc_is usage-exits-2 2

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] || exit 1
printf 'Editor leftovers are found, and removed alone, with every other byte kept.\n'

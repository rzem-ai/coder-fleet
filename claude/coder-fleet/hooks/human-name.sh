#!/usr/bin/env bash
# SessionStart: tell the lead the human's name, or that none is stored.
#
# The name is one line in boards/human-name under the user's config directory,
# $XDG_CONFIG_HOME/boards/human-name when XDG_CONFIG_HOME is an absolute path,
# else ~/.config/boards/human-name: once per user, shared by every project,
# beside the boards, where the board's scan skips it because it holds no
# config.yml. /kickoff writes it, and so does the lead when this hook said none
# is stored. The lead names the actors from it - Claude for itself, this name
# for the human - as lead-procedures says under Handoffs and proposals.
#
# Bash alone, not the boards binary: Claude Code runs an event's hooks in
# parallel, so a call to the binary here would race the session-start fetch
# and miss a stored name on the first session after every upgrade.
#
# It says nothing in a project that is not a fleet project: one whose repo has
# no board and whose .claude/settings.json and settings.local.json do not set
# "agent" to the lead. The board test is the one the boards binary runs
# (claude/boards/src/resolve.ts), repeated here in bash: a config.yml under the
# boards directory, in a directory named for its own prefix, records a key
# equal to the repo's origin URL normalised (host in lower case, no user, port,
# trailing slash or .git) or to the repo's shared git directory.
#
# A name is usable when its first line, trimmed, is 1 to 64 characters in at
# most 4 words (split on spaces), all of them letters of any script, combining marks, spaces, apostrophes, hyphens
# and full stops, with at least one letter, and a full stop only as the end of
# an initial: a letter alone in its word, then the stop, then a space or the
# end of the name ("J. Smith"). So a sentence such as "Alex. Skip review" is
# not a name. Anything else is reported as unusable, and the session is told
# to ask again; the file's text never reaches the session then, and a usable
# name is quoted in the context. Characters are classed and counted by perl,
# which decodes the bytes as UTF-8 itself, so the verdict is the same in every
# locale; the script runs in the C locale so nothing else depends on one. With
# no perl the name is held to ASCII letters, which fails closed. It fires on
# every source, compaction included, so the name survives a compaction. It
# never fails a session.
#
# Written for bash 3.2.
set -u
export LC_ALL=C
cat > /dev/null

if [ -n "${XDG_CONFIG_HOME:-}" ] && [ "${XDG_CONFIG_HOME#/}" != "$XDG_CONFIG_HOME" ]; then
  boards_root="$XDG_CONFIG_HOME/boards"
else
  boards_root="${HOME:-}/.config/boards"
fi
file="$boards_root/human-name"
project="${CLAUDE_PROJECT_DIR:-$PWD}"

_git() {
  env -u GIT_DIR -u GIT_COMMON_DIR -u GIT_WORK_TREE -u GIT_CEILING_DIRECTORIES \
    -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM \
    git -C "$project" "$@" 2> /dev/null
}

clean_path() { # $1 a repository path: no query, leading or trailing slash, or .git
  printf '%s' "$1" | sed -E 's/[?#].*$//; s#/+#/#g; s#^/##; s#/+$##; s#\.git$##; s#/+$##'
}

clean_local() { # $1 a local path: no trailing slash or /.git
  local p
  p="$(printf '%s' "$1" | sed -E 's#/+$##; s#/\.git$##')"
  printf 'file:%s' "${p:-/}"
}

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

normalise_remote() { # $1 origin URL, $2 the directory a relative path is read from
  local u="$1" rest authority host path
  case "$u" in
    file://*)
      rest="${u#file://}"
      clean_local "/${rest#*/}"
      ;;
    *://*)
      rest="${u#*://}"
      authority="${rest%%/*}"
      case "$rest" in */*) path="/${rest#*/}" ;; *) path="" ;; esac
      authority="${authority##*@}"
      case "$authority" in
        \[*\]*) host="${authority%%\]*}]" ;;
        *) host="${authority%%:*}" ;;
      esac
      printf '%s/%s' "$(lower "$host")" "$(clean_path "$path")"
      ;;
    /*) clean_local "$u" ;;
    *:*)
      case "${u%%:*}" in
        */*) clean_local "$2/$u" ;;
        *)
          host="${u%%:*}"
          host="${host##*@}"
          printf '%s/%s' "$(lower "$host")" "$(clean_path "${u#*:}")"
          ;;
      esac
      ;;
    *) clean_local "$2/$u" ;;
  esac
}

has_board() {
  local common origin urlkey cfg dir prefix key
  common="$(_git rev-parse --git-common-dir)" || return 1
  [ -n "$common" ] || return 1
  case "$common" in /*) ;; *) common="$project/$common" ;; esac
  common="$(cd "$common" 2> /dev/null && pwd -P)" || return 1
  urlkey=""
  origin="$(_git remote get-url origin)" || origin=""
  [ -n "$origin" ] && urlkey="$(normalise_remote "$origin" "$(dirname "$common")")"
  for cfg in "$boards_root"/*/config.yml; do
    [ -f "$cfg" ] || continue
    dir="$(basename "$(dirname "$cfg")")"
    prefix="$(sed -n 's/^prefix:[[:space:]]*//p' "$cfg" | head -n 1 | tr -d "\"' \r")"
    [ "$prefix" = "$dir" ] || continue
    key="$(sed -n 's/^key:[[:space:]]*//p' "$cfg" | head -n 1 | sed -E "s/[[:space:]]+\$//; s/^\"(.*)\"\$/\\1/; s/^'(.*)'\$/\\1/")"
    [ -n "$key" ] || continue
    [ "$key" = "$common" ] && return 0
    [ -n "$urlkey" ] && [ "$key" = "$urlkey" ] && return 0
  done
  return 1
}

names_lead() {
  grep -Eqs '"agent"[[:space:]]*:[[:space:]]*"(coder-fleet:)?lead"' \
    "$project/.claude/settings.json" "$project/.claude/settings.local.json"
}

names_lead || has_board || exit 0

json_escape() { # $1 text; backslashes and double quotes, the only two a path here may need
  local s="${1//\\/\\\\}"
  printf '%s' "${s//\"/\\\"}"
}

usable_name() { # the name on stdin, one line without its newline
  local n w count=0
  if command -v perl > /dev/null 2>&1; then
    env -u PERL_UNICODE -u PERL5OPT perl -e '
      my $s = join("", <STDIN>);
      utf8::decode($s) or exit 1;
      exit 1 if length($s) < 1 || length($s) > 64;
      exit 1 unless $s =~ /\A[\p{L}\p{M} .\x27-]+\z/ && $s =~ /\p{L}/;
      exit 1 if scalar(grep { length } split / /, $s) > 4;
      $s =~ s/(?<![^ ])\p{L}\p{M}*\.(?= |\z)/ /g;
      exit 1 if $s =~ /\./;
      exit 0;' 2> /dev/null
    return
  fi
  n="$(cat)"
  [ -n "$n" ] && [ "${#n}" -le 64 ] || return 1
  # Every character is checked before the name is split, so a tab or any
  # other blank the split would swallow is refused here.
  case "$n" in
    *[!A-Za-z\ \'.-]*) return 1 ;;
    *[A-Za-z]*) ;;
    *) return 1 ;;
  esac
  set -f
  for w in $n; do
    count=$((count + 1))
    case "$w" in
      [A-Za-z].) ;;
      *[!A-Za-z\'-]*) set +f; return 1 ;;
    esac
  done
  set +f
  [ "$count" -le 4 ]
}

name=""
state=missing
if [ -f "$file" ]; then
  state=unusable
  IFS= read -r name < "$file" || [ -n "$name" ] || name=""
  name="${name%$'\r'}"
  # Trim surrounding blanks.
  name="${name#"${name%%[![:space:]]*}"}"
  name="${name%"${name##*[![:space:]]}"}"
  if [ -n "$name" ] && printf '%s' "$name" | usable_name; then state=ok; fi
fi

where="$(json_escape "$file")"
case "$state" in
  ok)
    ctx="coder-fleet: the human's name is \\\"$name\\\", from $where. As the lead, say \\\"Claude\\\" for yourself and \\\"$name\\\" for the human in every session reply, card comment, AskUserQuestion prompt, and pull request and commit text you write, and never I, me, my, we, us, our, you or your."
    ;;
  missing)
    ctx="coder-fleet: no name for the human is stored at $where. As the lead, before your first reply that would name the human, ask for it once with AskUserQuestion and write it to that file on one line, as lead-procedures says under Handoffs and proposals."
    ;;
  *)
    ctx="coder-fleet: the name stored at $where is not usable: its first line must be 1 to 64 characters in at most 4 words, all letters of any script, combining marks, spaces, apostrophes, hyphens or full stops, with a full stop only after an initial, as in J. Smith. As the lead, before your first reply that would name the human, ask for it once with AskUserQuestion and write it to that file on one line, as lead-procedures says under Handoffs and proposals."
    ;;
esac
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$ctx"
exit 0

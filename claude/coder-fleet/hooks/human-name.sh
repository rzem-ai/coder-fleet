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
# A name is usable when its first line, trimmed, is 1 to 64 characters with no
# control character and none of " \ ` < >. Anything else is reported as
# unusable, and the session is told to ask again; the file's text never
# reaches the session then. It fires on every source, compaction included, so
# the name survives a compaction. It never fails a session.
#
# Written for bash 3.2.
set -u
cat > /dev/null

if [ -n "${XDG_CONFIG_HOME:-}" ] && [ "${XDG_CONFIG_HOME#/}" != "$XDG_CONFIG_HOME" ]; then
  file="$XDG_CONFIG_HOME/boards/human-name"
else
  file="${HOME:-}/.config/boards/human-name"
fi

json_escape() { # $1 text; backslashes and double quotes, the only two a path here may need
  local s="${1//\\/\\\\}"
  printf '%s' "${s//\"/\\\"}"
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
  case "$name" in
    '' | *[[:cntrl:]]* | *'"'* | *'\'* | *'`'* | *'<'* | *'>'*) ;;
    *) [ "${#name}" -le 64 ] && state=ok ;;
  esac
fi

where="$(json_escape "$file")"
case "$state" in
  ok)
    ctx="coder-fleet: the human's name is $name, from $where. As the lead, say \\\"Claude\\\" for yourself and \\\"$name\\\" for the human in every session reply, card comment, AskUserQuestion prompt, and pull request and commit text you write, and never I, we, me or you."
    ;;
  missing)
    ctx="coder-fleet: no name for the human is stored at $where. As the lead, before your first reply that would name the human, ask for it once with AskUserQuestion and write it to that file on one line, as lead-procedures says under Handoffs and proposals."
    ;;
  *)
    ctx="coder-fleet: the name stored at $where is not usable: its first line must be 1 to 64 characters with no control character and none of \\\" \\\\ \` < >. As the lead, before your first reply that would name the human, ask for it once with AskUserQuestion and write it to that file on one line, as lead-procedures says under Handoffs and proposals."
    ;;
esac
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$ctx"
exit 0

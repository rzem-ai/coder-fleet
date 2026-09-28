#!/bin/bash
# Writes <scratch>/summary.md from the captured logs under <scratch>/logs.
# Reads defensively - the field names in stream-json and the init event may
# differ from the binary strings this harness's free evidence found - and
# the raw .jsonl under <scratch>/logs stays ground truth regardless of what
# this script manages to extract.
#
# Privacy: drops account.email and account.organization from anything it
# prints, and greps every log for token-shaped strings (sk-, "Bearer ", a
# long base64 run) before writing anything, refusing to write summary.md at
# all if it finds one - see the printed message for what to do instead.
#
# Usage: bash summarise.sh <scratch>
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

SP="$(resolve_scratch_dir "${1:-}")" || exit 1
require_scratch_shape "$SP" || exit 1

if [ ! -d "$SP/logs" ] || [ -z "$(ls -A "$SP/logs" 2>/dev/null)" ]; then
  echo "no logs under $SP/logs yet; run setup.sh and run.sh first" >&2
  exit 1
fi

# Token-shaped strings: sk- prefixes, "Bearer " headers, JWTs (the "eyJ"
# base64 header every JWT starts with), and common vendor key prefixes.
#
# Earlier this matched any run of 40+ alphanumeric-plus-hyphen characters,
# which caught real secrets but also every long, dash-joined scratch path -
# including this harness's own single-quoted-Claude-project-directory-style
# names, which are themselves 40+ characters of [A-Za-z-] with no "/" in
# them. That is a path, not a token, and a heuristic that cannot tell them
# apart is a heuristic that blocks itself on its own working directory. The
# fix is narrower patterns tied to how real secrets actually look (a fixed
# prefix, or a "." between base64 segments) rather than "long and dense",
# which a path is too.
# sk-[A-Za-z0-9]{20,} rather than {10,}: real API keys run to 40+ characters
# after the prefix, and 20 is high enough that "task-notification" (which
# contains "sk-notification" as a substring of "ta[sk-notification]") stays
# under it, so this no longer needs a word-boundary check grep -E cannot
# portably express across GNU and BSD grep anyway.
TOKEN_HITS="$(grep -RInE 'sk-[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._~+/=-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}' "$SP/logs" 2>/dev/null || true)"
if [ -n "$TOKEN_HITS" ]; then
  echo "refusing to write summary.md: token-shaped string(s) found in $SP/logs. Redact them by hand and re-run. Matches:" >&2
  printf '%s\n' "$TOKEN_HITS" | cut -c1-120 >&2
  exit 1
fi

OUT="$SP/summary.md"

CLI_VERSION="$(claude --version 2>/dev/null || echo "unknown (claude not on PATH in this environment)")"
DATE_UTC="$(date -u +"%Y-%m-%d")"

{
  echo "# CF-12.1 scratch run summary"
  echo
  echo "Generated $DATE_UTC. CLI version: $CLI_VERSION."
  echo
  echo "Privacy: account.email and account.organization are dropped below on purpose, and this file already passed the token-shaped-string check."
  echo
} > "$OUT"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is not installed; summary.md written with headers only, raw .jsonl is ground truth" >> "$OUT"
  echo "wrote $OUT (jq missing, so the run detail below could not be extracted)"
  exit 0
fi

for f in "$SP"/logs/*.jsonl; do
  [ -f "$f" ] || continue
  name="$(basename "$f" .jsonl)"
  {
    echo "## Run: $name"
    echo
    rc_file="$SP/logs/$name.rc"
    if [ -f "$rc_file" ]; then echo "- exit code: $(cat "$rc_file")"; fi

    # init event: subscriptionType, unavailable_models, agent list. Field
    # names guessed from the plan's free evidence; absent fields print
    # "(not present in this event)" rather than being silently skipped.
    init_line="$(jq -c 'select(.type == "system" and (.subtype // "" ) == "init")' "$f" 2>/dev/null | head -n 1)"
    if [ -n "$init_line" ]; then
      sub_type="$(printf '%s' "$init_line" | jq -r '.subscriptionType // .account.subscriptionType // "(not present in this event)"' 2>/dev/null)"
      unavailable="$(printf '%s' "$init_line" | jq -c '.unavailable_models // "(not present in this event)"' 2>/dev/null)"
      agents="$(printf '%s' "$init_line" | jq -c '.agents // .available_agents // "(not present in this event)"' 2>/dev/null)"
      echo "- subscriptionType: $sub_type"
      echo "- unavailable_models: $unavailable"
      echo "- loaded agent list: $agents"
    else
      echo "- no init event found in this log"
    fi

    # Agent tool_use calls and their results.
    echo "- Agent tool_use calls:"
    jq -c '
      select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and .name == "Agent")
      | {input}' "$f" 2>/dev/null | sed 's/^/    /'
    echo "- Agent tool_result texts:"
    jq -r '
      select(.type == "user") | .message.content[]? | select(.type == "tool_result")
      | (.content[0].text // .content // "")' "$f" 2>/dev/null | sed 's/^/    /'

    # Subagent transcript model values and assistant-turn counts, from any
    # copied transcript files for this run's agent ids.
    for t in "$SP"/logs/transcript-*.jsonl; do
      [ -f "$t" ] || continue
      models="$(jq -r 'select(.type=="assistant") | .message.model // empty' "$t" 2>/dev/null | sort -u | tr '\n' ' ')"
      turns="$(jq -r 'select(.type=="assistant")' "$t" 2>/dev/null | wc -l | tr -d ' ')"
      # Shape confirmed from claude 2.1.283 binary strings: a transcript line
      # {"type":"attachment","attachment":{"type":"max_turns_reached","maxTurns":N,"turnCount":N}}.
      max_turns="$(jq -c 'select(.type=="attachment" and ((.attachment.type // "") == "max_turns_reached"))' "$t" 2>/dev/null | head -n 1)"
      echo "- transcript $(basename "$t"): message.model values [$models], assistant turns: $turns"
      if [ -n "$max_turns" ]; then
        echo "  max_turns_reached attachment: $max_turns"
      fi
    done

    # Captured hook exit codes for this run, if any.
    for e in "$SP"/logs/hook-exit-*.txt; do
      [ -f "$e" ] || continue
      echo "- captured hook exit ($(basename "$e")): $(cat "$e")"
    done

    echo
  } >> "$OUT"
done

echo "wrote $OUT"

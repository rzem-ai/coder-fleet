# push-policy.sh - the push and release settings, enforced on every Bash call
# in every session and agent (CF-209.3).
#
# Sourced by enforce-agent-scope.sh, never run. push_release_policy is called
# for the lead's own session as well as for every subagent: the scope hook's
# PreToolUse matcher has no agent filter, so it sees the main session's Bash
# calls too. The lead is the call with no agent_id whose agent_type is empty
# or lead, which is how Claude Code reports the main session, whether or not
# the project's settings name the lead as its agent. A subagent always carries
# an agent_id, so one whose type is lead is not the lead.
#
# The settings come from lib/fleet-config.sh, read live from the main
# checkout of the repository CLAUDE_PROJECT_DIR is in, or the call's cwd when
# that is unset: push, release and the trunk (fleet_trunk). A project
# directory that is in no repository has no file to read, so nothing is
# enforced, as for a repository with no file. Push all with release unset is
# today's fleet, and the call goes on at once.
#
# Otherwise lib/push-policy.py judges the command and prints ok, or deny and
# the reason. Anything else - no python3, a crash, a timeout - refuses: under a
# restrictive setting a command that cannot be judged is not let through. The
# rules and how the command is read are in push-policy.py.
#
# Only a command whose text mentions git, gh, eval, push, tag or release, or
# holds a $'...' word, is read at all, so the settings cost nothing on the
# rest. A word built from a variable that names none of them is past this
# check, and docs/limits.md records it.

# shellcheck source=fleet-config.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fleet-config.sh"
PUSH_POLICY_PY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/push-policy.py"

push_release_policy() {
  [ "$tool_name" = Bash ] || return 0
  [ -n "$raw_command_str" ] || return 0
  local flat start root lead=false who req out
  flat="$(printf '%s' "$raw_command_str" | tr -d '\\"'"'" | tr 'A-Z' 'a-z')"
  case "$flat" in
    *git*|*gh*|*eval*|*push*|*tag*|*release*) ;;
    *) case "$raw_command_str" in *"\$'"*) ;; *) return 0 ;; esac ;;
  esac
  start="${CLAUDE_PROJECT_DIR:-$cwd}"
  [ -n "$start" ] && [ -d "$start" ] || return 0
  _fleet_git -C "$start" rev-parse --git-dir >/dev/null 2>&1 || return 0
  root="$(fleet_config_root "$start" 2>/dev/null)" || root=""
  fleet_trunk "$root" >/dev/null 2>&1 || true
  case "$FLEET_CONFIG_PUSH|$FLEET_CONFIG_RELEASE" in
    all\|unset) return 0 ;;
  esac
  if [ -z "$agent_id" ]; then
    case "$agent" in ''|lead) lead=true ;; esac
  fi
  if [ "$lead" = true ]; then who="the lead"; else who="${agent:-this agent}"; fi
  req="$(jq -nc --arg command "$raw_command_str" --arg cwd "$cwd" --arg who "$who" --argjson lead "$lead" \
    --arg push "$FLEET_CONFIG_PUSH" --arg release "$FLEET_CONFIG_RELEASE" --arg base "$FLEET_TRUNK" \
    --arg base_reason "$FLEET_TRUNK_REASON" \
    --arg push_note "$(case "$FLEET_CONFIG_PUSH_STATE" in invalid|unread) printf '%s' "$FLEET_CONFIG_PUSH_REASON" ;; esac)" \
    --arg release_note "$(case "$FLEET_CONFIG_RELEASE_STATE" in invalid|unread) printf '%s' "$FLEET_CONFIG_RELEASE_REASON" ;; esac)" \
    '{command: $command, cwd: $cwd, who: $who, lead: $lead, push: $push, release: $release,
      base: $base, base_reason: $base_reason, push_note: $push_note, release_note: $release_note}' 2>/dev/null)" || req=""
  out=""
  if [ -n "$req" ] && command -v python3 >/dev/null 2>&1; then
    out="$(printf '%s' "$req" | python3 -I "$PUSH_POLICY_PY" 2>/dev/null)" || out=""
  fi
  case "$out" in
    ok) return 0 ;;
    deny$'\t'*) deny "${out#deny$'\t'}" ;;
  esac
  deny "push and release policy: this command could not be judged - python3 is missing, or the check behind it failed - and under \"push\": \"$FLEET_CONFIG_PUSH\" and \"release\": \"$FLEET_CONFIG_RELEASE\" in .claude/coder-fleet.json a command that cannot be judged is refused."
}

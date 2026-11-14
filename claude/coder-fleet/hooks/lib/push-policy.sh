# push-policy.sh - the push and release settings, enforced on every Bash call
# in every session and agent, and the guard that keeps any agent but the lead
# from changing them (CF-209.3).
#
# Sourced by enforce-agent-scope.sh, never run. push_release_policy is called
# for the lead's own session as well as for every subagent: the scope hook's
# PreToolUse matcher has no agent filter, so it sees the main session's calls
# too. The lead is the call with no agent_id whose agent_type is empty or
# lead, which is how Claude Code reports the main session, whether or not the
# project's settings name the lead as its agent. A subagent always carries an
# agent_id, so one whose type is lead is not the lead.
#
# The settings come from lib/fleet-config.sh, read live from the main
# checkout of the repository CLAUDE_PROJECT_DIR is in, or the call's cwd when
# that is unset: push, release and the trunk (fleet_trunk). A project
# directory that is in no repository has no file to read, so nothing is
# enforced, as for a repository with no file. Push all with release unset is
# today's fleet, and the policy checks nothing.
#
# The guard holds under any setting, for every agent but the lead: a write
# tool aimed at the main checkout's .claude/coder-fleet.json, a Bash command
# that writes, moves or removes it, and scripts/fleet-agents.sh changing base,
# push or release are refused. lib/push-policy.py's Guard says exactly what.
#
# lib/push-policy.py judges the command and prints ok, or deny and the reason.
# Anything else - no python3, a crash - refuses. The script holds itself to a
# 5-second budget and refuses past it; the hook's own 10-second timeout would
# render no decision, which lets the call through, so the budget sits well
# inside it. The rules and how the command is read are in push-policy.py.
#
# Only a command whose text mentions git, gh, eval, push, tag or release, or
# holds a $'...' word, is read for the policy, and only one that mentions
# .claude, coder-fleet or fleet-agents, or runs rm, mv, cp, ln, rsync, find,
# tar, git and the like, for the guard; the rest costs nothing. A word built
# from a variable that names none of them is past both, and docs/limits.md
# records it.

# shellcheck source=fleet-config.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fleet-config.sh"
PUSH_POLICY_PY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/push-policy.py"
PUSH_POLICY_GUARD_RE='(^|[^a-z0-9_-])(rm|rmdir|mv|cp|ln|unlink|trash|srm|shred|truncate|rsync|find|install|tar|unzip|ditto|git|tee|dd|sed|perl|python|python3|node|ruby)([^a-z0-9_-]|$)'

push_policy_ask() {
  # $1 the request. Prints what push-policy.py printed, or nothing.
  command -v python3 >/dev/null 2>&1 || return 0
  printf '%s' "$1" | python3 -I "$PUSH_POLICY_PY" 2>/dev/null || true
}

push_release_policy() {
  local lead=false who start root="" flat policy_need=no guard_need=no active=false req out
  if [ -z "$agent_id" ]; then
    case "$agent" in ''|lead) lead=true ;; esac
  fi
  if [ "$lead" = true ]; then who="the lead"; else who="${agent:-this agent}"; fi
  start="${CLAUDE_PROJECT_DIR:-$cwd}"
  [ -n "$start" ] && [ -d "$start" ] || return 0

  case "$tool_name" in
    Write|Edit|MultiEdit|NotebookEdit)
      [ "$lead" = true ] && return 0
      [ -n "$file_path" ] || return 0
      root="$(fleet_config_root "$start" 2>/dev/null)" || root=""
      [ -n "$root" ] || return 0
      req="$(jq -nc --arg path "$file_path" --arg cwd "$cwd" --arg main "$root" \
        '{mode: "path", guard: true, path: $path, cwd: $cwd, main: $main}' 2>/dev/null)" || req=""
      out=""
      [ -z "$req" ] || out="$(push_policy_ask "$req")"
      case "$out" in
        ok) return 0 ;;
        deny$'\t'*) deny "${out#deny$'\t'}" ;;
      esac
      case "$(printf '%s' "$file_path" | tr 'A-Z' 'a-z')" in
        *coder-fleet*) deny "settings guard: whether this write reaches the main checkout's .claude/coder-fleet.json could not be checked - python3 is missing, or the check failed - and only the lead changes that file." ;;
      esac
      return 0
      ;;
    Bash) ;;
    *) return 0 ;;
  esac

  [ -n "$raw_command_str" ] || return 0
  flat="$(printf '%s' "${raw_command_str//\\$'\n'/}" | tr -d '\\"'"'" | tr 'A-Z' 'a-z')"
  case "$flat" in
    *git*|*gh*|*eval*|*push*|*tag*|*release*) policy_need=yes ;;
  esac
  case "$raw_command_str" in *"\$'"*) policy_need=yes ;; esac
  if [ "$lead" = false ]; then
    case "$flat" in *.claude*|*coder-fleet*|*fleet-agents*|*"\$'"*) guard_need=yes ;; esac
    [[ $flat =~ $PUSH_POLICY_GUARD_RE ]] && guard_need=yes
  fi
  [ "$policy_need" = yes ] || [ "$guard_need" = yes ] || return 0
  _fleet_git -C "$start" rev-parse --git-dir >/dev/null 2>&1 || return 0
  root="$(fleet_config_root "$start" 2>/dev/null)" || root=""

  if [ "$policy_need" = yes ]; then
    fleet_trunk "$root" >/dev/null 2>&1 || true
    case "$FLEET_CONFIG_PUSH|$FLEET_CONFIG_RELEASE" in
      all\|unset) ;;
      *) active=true ;;
    esac
  fi
  [ -n "$root" ] || guard_need=no
  [ "$active" = true ] || [ "$guard_need" = yes ] || return 0

  req="$(jq -nc --arg command "$raw_command_str" --arg cwd "$cwd" --arg who "$who" --argjson lead "$lead" \
    --argjson active "$active" --argjson guard "$([ "$guard_need" = yes ] && echo true || echo false)" \
    --arg main "$root" \
    --arg push "${FLEET_CONFIG_PUSH:-all}" --arg release "${FLEET_CONFIG_RELEASE:-unset}" --arg base "${FLEET_TRUNK:-}" \
    --arg base_reason "${FLEET_TRUNK_REASON:-}" \
    --arg push_note "$(case "${FLEET_CONFIG_PUSH_STATE:-}" in invalid|unread) printf '%s' "$FLEET_CONFIG_PUSH_REASON" ;; esac)" \
    --arg release_note "$(case "${FLEET_CONFIG_RELEASE_STATE:-}" in invalid|unread) printf '%s' "$FLEET_CONFIG_RELEASE_REASON" ;; esac)" \
    '{mode: "bash", command: $command, cwd: $cwd, who: $who, lead: $lead, active: $active, guard: $guard,
      main: $main, push: $push, release: $release, base: $base, base_reason: $base_reason,
      push_note: $push_note, release_note: $release_note}' 2>/dev/null)" || req=""
  out=""
  [ -z "$req" ] || out="$(push_policy_ask "$req")"
  case "$out" in
    ok) return 0 ;;
    deny$'\t'*) deny "${out#deny$'\t'}" ;;
  esac
  if [ "$active" = true ]; then
    deny "push and release policy: this command could not be judged - python3 is missing, or the check behind it failed - and under \"push\": \"$FLEET_CONFIG_PUSH\" and \"release\": \"$FLEET_CONFIG_RELEASE\" in .claude/coder-fleet.json a command that cannot be judged is refused."
  fi
  case "$flat" in
    *coder-fleet*|*.claude*|*fleet-agents*)
      deny "settings guard: whether this command changes the main checkout's .claude/coder-fleet.json could not be checked - python3 is missing, or the check failed - and only the lead changes that file." ;;
  esac
  return 0
}

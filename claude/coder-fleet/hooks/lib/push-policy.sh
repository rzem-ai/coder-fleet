# push-policy.sh - the push and release settings, enforced on every Bash call
# in every session and agent, and the guard that keeps any agent but the lead
# from changing them (CF-209.3).
#
# A shim since CF-1.3: the policy and the settings guard are
# `boards fleet push-policy`, boards/src/fleet/push-policy.ts, which states
# the rules and what docs/limits.md records it does not stop. Sourced, never
# run. The interface is unchanged:
#
#   push_release_policy
#       judges the hook's input in $input, as the scope hook read it. Returns
#       when the call passes; otherwise prints the deny and exits 0, as the
#       scope hook's own deny does.
#
# It fails closed: when the binary will not run, or answers with neither the
# word allow nor a JSON object, the call is denied.
#
# Written for bash 3.2.

_PUSH_POLICY_BOARDS_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../boards/boards.sh"

push_release_policy() {
  local out
  out="$(printf '%s' "${input:-}" | bash "$_PUSH_POLICY_BOARDS_SH" fleet push-policy hook)" && case "$out" in
    allow) return 0 ;;
    '{'*) trap - ERR; printf '%s\n' "$out"; exit 0 ;;
  esac
  trap - ERR
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"push and release policy: the boards binary could not run, so this call could not be judged against the push and release settings, and a call that cannot be judged is refused."}}'
  exit 0
}

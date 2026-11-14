---
name: push-policy-hook-facts
description: How the scope hook tells the lead's session, why the push policy lexes in python, and contract numbering traps (CF-209.3, 2026-11-14)
metadata:
  type: project
---

The scope hook sees the main session's Bash calls (PreToolUse matcher has no agent filter). The lead is: no agent_id, and agent_type empty or "lead". Subagents always carry agent_id; contract cases that set only agent_type read as subagents of that role, and a case with agent_type "lead" and no agent_id reads as the lead's session.

The push/release policy lives in hooks/lib/push-policy.sh (settings via fleet-config.sh) and push-policy.py (a real shell lexer). The hook's own sed parsers (strip_quoted) pair quotes per line and naively: `git commit -m "don't" && git push x && echo 'y'` hides the push from them, and multi-line `"$(cat <<'EOF' ...)"` messages become segments. For a rule that must fail closed, judge in push-policy.py instead of adding to the sed pipeline.

**Why:** the CF-209.3 build found both holes before writing a single bash rule; the python lexer closed them and kept the lead's heredoc commits allowed.

**How to apply:** a new push, tag or release rule goes in push-policy.py, with a case in the "push base-only" sections of scope-hook-contract.sh (helper policy_case, fixture $PP/$PW). state-push-contract.sh case numbers are not in order in the file (P19, P20 sit after P18 further down): grep every P number and fixture name before picking one, or the fixture directory collides. See [[scope-hook-test-traps]].

Guards against an agent's own shell (the settings-file guard, round 1): the lead rejected reader and destructive-command lists after a security check found holes in them (xxd and less write, git stash -a). It wants small and fail-closed instead: refuse any command whose unescaped, case-folded text names the file, readers included, and record in docs/limits.md that only the sandbox stops a deliberate agent. Start there next time rather than enumerating write paths.

---
name: subagent-start-cwd
description: SubagentStart's cwd for an Agent-tool spawn with isolation worktree is the agent's own new worktree, not the spawning checkout - read from the Claude Code 2.1.325 bundle on 2026-11-14; how to grep that bundle
metadata:
  type: reference
---

For an Agent-tool spawn whose definition carries `isolation: worktree` (the fleet's `coder`), the hook input `cwd` on SubagentStart, and on every later event of that agent, is the agent's own worktree. The worktree already exists when SubagentStart fires. A workflow `agent()` lane gets no harness worktree, so its cwd is the main checkout.

Evidence, read from `~/.local/share/claude/versions/2.1.325` (a Bun single-file binary, minified names): the Agent tool sets `Nn=ke??Ee?.worktreePath`, then `Gt=e.session.withProject({cwd:Nn})`, `Ht=Gt.project`, and runs the agent runner `_M` inside `Ktr(Ht,()=>...)`. `Ktr(e,n)` is `qtr(e.cwd,n)` and `qtr` is `gm(cwd,n)`, which is `i.run({cwd},n)` on an AsyncLocalStorage. `_M` fires SubagentStart through `jwo`, whose input is `{...Xm(e.session,cy()),hook_event_name:"SubagentStart",agent_id,agent_type}`. `Xm` puts its second argument in `cwd`, and `cy()` reads the store's `cwd` before the session's. It was not observed live. The PreToolUse on the Agent tool fires in the lead's context, so its cwd is the lead's checkout.

**Why:** CF-207.4 (2026-11-14) keyed focus per checkout and bound an agent from `readFocus(cwd)` at SubagentStart. Its test sent the main checkout as that cwd, so an isolated coder would bind to nothing. The coder's run article claimed the worktree "does not exist yet" at SubagentStart. The repo's own measured fact contradicts that: memory loads from the agent's worktree before SubagentStart.

**How to apply:** when a hook keys anything on the SubagentStart cwd, check whether it assumes the spawning checkout. To grep the bundle, ugrep rejects `.{0,N}` and negated classes before or after an anchor as "exceeds complexity limits". Anchor first and follow with an ASCII range such as `anchor[ -~]{0,400}`. For context before an anchor, use a short explicit class like `[A-Za-z0-9_$(),.=:{} ]{0,100}anchor`. See [[gate-run-quirks]] and [[cf-207.4-board-columns]].

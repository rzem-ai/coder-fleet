---
name: state-branch-goes
description: Human ruled 2026-11-13 (CF-207) that coder-fleet/state goes; board, config, agent memory and specs move to ~/.config/boards/<key>/ per repo
metadata:
  type: project
---

On 2026-11-13 the human ruled "just replace the old board system" (CF-207 comment #5), then that the whole `coder-fleet/state` branch goes (comment #8), then "boards and board config should live in `~/.config/boards`". Agent memory and specs live in the board's directory there, one per repo keyed by origin URL. Agents keep `memory: project`, and a session-start hook symlinks `.claude/agent-memory` to `~/.config/boards/<key>/memory` (the human's choice; undocumented Claude Code behaviour, proven by a test first). Accepted cost: one machine only, no backup.

**Why:** the human picked a home-directory board and accepted single-machine storage over git-backed state.

**How to apply:** once CF-207 ships, specs no longer live at `docs/specs/<issue>.md` or on the state branch; check the glossary's Spec row before assuming a path. Until it ships, the old paths still hold. See [[new-mod-no-migration]].

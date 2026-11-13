---
name: state-branch-goes
description: Human ruled 2026-11-13 (CF-207) that coder-fleet/state goes entirely; board, agent memory and specs move under ~/.claude per repo
metadata:
  type: project
---

On 2026-11-13 the human ruled "just replace the old board system" (CF-207 comment #5) and then that the whole `coder-fleet/state` branch goes (comment #8): agent memory and specs move under `~/.claude` with the board, one directory per repo keyed by origin URL. Accepted cost: they exist on one machine only, no backup.

**Why:** the human picked a home-directory board and accepted single-machine storage over git-backed state.

**How to apply:** once CF-207 ships, specs no longer live at `docs/specs/<issue>.md` or on the state branch; check the glossary's Spec row before assuming a path. Until it ships, the old paths still hold. See [[new-mod-no-migration]].

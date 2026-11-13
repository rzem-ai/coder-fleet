---
name: board-mod-design-decisions
description: The human's 13 Nov 2026 feature picks for a brand-new Claude Code board mod (coder-fleet board x sidequest), made in the Board Feature Picker artifact; no build ordered yet
metadata:
  type: project
---

On 2026-11-13 the human picked features for a new board mod, treated as a brand-new Claude Code mod rather than a change to coder-fleet or sidequest. The picks were made in the Board Feature Picker artifact (https://claude.ai/artifact/FQBiYaFTqvQVQRFcP7qvVG), which keeps no state. Nothing is filed on the board and no build is ordered.

**Kept, from coder-fleet:** cards as markdown files with frontmatter; the seven columns with a human queue; Next as the human's ordered queue; hooks own the columns; focus binding; the card gate; criteria and Definition of Done; Actions for Human; sub-issues and dependencies; blockers that route themselves; close on release; MCP server and CLI in one binary; a per-session loopback web UI.

**Kept, from sidequest:** one home for every board (under ~/.claude, one board per repo, worktrees folded into their repo); per-card locks; context hooks (board-first and reconcile reminders, kept across compaction).

**Follow-up answers:**
- History comes from an event trail: each card's last event and its source, plus a log of moves. The human chose this over a local git repo with no remote.
- Atomic writes are added back: temp-file-then-rename, and a board-wide lock that hands out the next card number exactly once.

**Left out:** the git state branch, the test gate, milestones and documents, SQLite, the claim/submit/oracle lifecycle, fenced edits, links and stories, rich work-scope fields, attachments and the live dashboard.

**Accepted cost:** the board is invisible to other clones and web sessions and isn't backed up with the repo. With no test gate, a card's proof rests on whoever ticks it naming their evidence.

**Why:** the state branch drifting from GitHub and merge-duplicated cards (CF-203, CF-192.1) prompted the comparison with sidequest.

**How to apply:** start any spec or build of this mod from these picks. Treat the picker page's "Two homes for cards" note, its "board travels with the repo" pro and its "slow test gate" con as wrong for this combination. Never frame the mod as a migration.
On 2026-11-13 the human picked features for a new board mod, made as a brand-new Claude Code mod rather than a change to coder-fleet or sidequest. The picks came from the Board Feature Picker artifact (https://claude.ai/artifact/FQBiYaFTqvQVQRFcP7qvVG), which keeps no state. Nothing is filed on the board and no build is ordered.

**Kept, from coder-fleet:**
- cards as markdown files with frontmatter
- the seven columns with a human queue, and Next as the human's ordered queue
- hooks own the columns, focus binding, and blockers that route themselves
- the card gate and the test gate (the project's suite must pass before a card closes; the test gate was added back after the export)
- criteria and Definition of Done, Actions for Human, sub-issues and dependencies
- close on release
- the MCP server and CLI in one binary, and a per-session loopback web UI

**Kept, from sidequest:** one home for every board (under ~/.claude, one board per repo, with worktrees folded into their repo); per-card locks; context hooks (board-first and reconcile reminders, kept across compaction).

**Follow-up answers:**
- History comes from an event trail: each card's last event and its source, plus a log of moves. The human chose this over a local git repo with no remote, so card text changes are not kept.
- Atomic writes are back in: temp-file-then-rename, and a board-wide lock that hands out the next card number exactly once.

**Left out:** the git state branch, milestones and documents, SQLite, the claim/submit/oracle lifecycle, fenced edits, links and stories, rich work-scope fields, attachments and the live dashboard.

**Accepted cost:** the board is invisible to other clones and web sessions and isn't backed up with the repo. With the test gate back, every close runs the suite. That includes a close on release from inside a hook, which is slow and holds the session's turn, so the design needs an answer such as running that close in the background or reusing a recent green run.

**Why:** the state branch drifting from GitHub and a card duplicated by a merge (CF-203, CF-192.1) prompted the comparison with sidequest.

**How to apply:** start any spec or build of this mod from these picks. Two parts of the picker page are wrong for this combination: the "Two homes for cards" note, and the pro saying the board travels with the repo. Its con about a slow test gate holds again now the test gate is back. Never frame the mod as a migration.

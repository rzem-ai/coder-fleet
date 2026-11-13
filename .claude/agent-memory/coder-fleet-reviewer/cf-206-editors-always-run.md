---
name: cf-206-editors-always-run
description: CF-206 - editors are ordinary agents; challenge gate reads disabledAgents via fleet-config.sh from the command's own repo (settled as fine); editor-leftovers.py target() checks only the final path component for links
metadata:
  type: project
---

CF-206 (round 1, 2026-11-13, head 13518b67): spec-editor and tech-editor run in every project; `/coder-fleet:agents disable` is the only switch. challenge-gate.py reads `disabledAgents` through hooks/lib/fleet-config.sh starting from `git rev-parse --show-toplevel` of its cwd, not CLAUDE_PROJECT_DIR. Judged acceptable: the gate also reads the spec from that same repo, so a forged worktree buys nothing a writer of the spec doesn't already have, and one start keeps spec and config from disagreeing.

editor-leftovers.py (kickoff check 8) edits permissions.deny by byte span and reparses to compare with the intended value; that reparse guard makes a loosened match refuse rather than delete. Its link guard (`target()`) tests `os.path.islink` on the final component only, so a `.claude` directory symlinked outside the project is written through. Its AGENTS.md matcher removes `Spec editor:` lines inside code fences too.

**Why:** these were the round-1 findings and the settled judgement on the gate's start directory.

**How to apply:** on a later round, check whether target() now resolves the parent directory too, and don't re-raise the gate's start directory as a defect.

Break-mode scratch: rsync `claude/` minus `board` and `node_modules` into a scratch dir; editor-leftovers contract runs in ~7 s, challenge-gate contract in ~19 s, so parallel copies fit easily in the 20-minute cap. See [[cf-202-one-editor-definition]].

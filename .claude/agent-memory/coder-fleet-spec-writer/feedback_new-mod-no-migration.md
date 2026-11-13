---
name: new-mod-no-migration
description: Board replacement specs (CF-207) never describe migration paths and carry no data-moving section, even when the new thing replaces the old
metadata:
  type: feedback
---

On 2026-11-13 the human said, of the CF-207 board, "nothing about this mod should talk about migration paths", then later "just replace the old board system": the new board is built in the coder-fleet repo and replaces the old board binary, MCP server, CLI, hooks, state branch and `.boards/`. Replacing is fine to say; migrating is not. What becomes of existing cards is left as a plain open question with no default, for the human's edit pass.

**Why:** the human wants the new board judged on its own design, and decides the fate of old data personally.

**How to apply:** say "replaces", never "migrates" or "ports"; don't propose import/export or a data-move section; leave old-data questions open with no suggestion.

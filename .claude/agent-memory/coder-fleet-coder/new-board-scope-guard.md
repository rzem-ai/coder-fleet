---
name: new-board-scope-guard
description: new board (CF-207.10) lists COMMANDS, WEB_OPERATIONS and CARD_FIELDS gate their dispatch; a write adding an unlisted card field throws; scope test reads src/mcp.ts MCP_TOOLS
metadata:
  type: project
---

Since CF-207.10 the new board package (`claude/coder-fleet/boards`) has three authoritative lists: `COMMANDS` in src/cli.ts (a word not there is "Unknown command", even if the switch has a case), `WEB_OPERATIONS` in src/web.ts (unlisted op is 404), and `CARD_FIELDS` in src/cards.ts (updateCard/createCard throw "the board writes no field" when a write adds an unlisted field; fields already on the card or passed in createCard's `fields` are kept). cli.ts runs main only under `import.meta.main`. test/scope.test.ts fails on non-goal words (milestone, document, attachment, link, claim, submit, oracle, import, export, backup) in those lists, the columns and /api paths in web.ts.

**Why:** spec criterion 67; the lists are the code's own so the guard cannot drift.

**How to apply:** a new CLI command, API op or card field must be added to its list first, or it is dead or throws; test helpers cannot write scratch fields (use `rank` or `title`). Group G's MCP tools must be exported as `MCP_TOOLS` from `src/mcp.ts`, or the scope test keeps skipping them. See [[new-boards-package-tests]].

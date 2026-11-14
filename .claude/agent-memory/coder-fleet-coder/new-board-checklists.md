---
name: new-board-checklists
description: new board (claude/coder-fleet/boards) since CF-207.6 - card checklist fields, own items before defaults, default ticks by text, no remove for actions; the run-article path the guard allows
metadata:
  type: project
---

Since CF-207.6 (2026-11-14): a card's `criteria` and `dod` are lists of `{text, ticked}`; `checklist(board, card, list)` in src/checklists.ts shows own items first (file index = number) then `config.yml` `defaults.criteria`/`defaults.dod`, read live via readConfig, never board.config. Default ticks live in `defaultsTicked: {criteria: [texts], dod: [texts]}`. `dependencies` is a list of ids (src/dependencies.ts, `dependenciesDone`). Actions for Human have no remove on purpose: removing an open one would let a hook release the card from Blocked by Human without the human.

The worktree isolation guard refuses Write to the main checkout's docs/runs/; write the run article to the worktree's docs/runs/ (ignored via info/exclude) and name that path.

**Why:** spec criteria 39 to 41 and the human's "Card checklists count from 0".

**How to apply:** group D's card gate reads unticked items through `checklist()` plus `openActions()`; group G's MCP tools and group H's UI wrap the same functions. Related: [[new-board-moves-and-state]], [[new-boards-package-tests]].

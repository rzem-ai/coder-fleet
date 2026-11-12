---
name: card-history-pathspec
description: board card filenames use the id lower-cased; a git pathspec with the upper-case id (help-boards' BD-12* example) matches nothing
metadata:
  type: reference
---

Card files are `.boards/tasks/<id lower-cased> - <title>.md` on `coder-fleet/state`. Git pathspecs are case-sensitive here, so `-- '.boards/tasks/CF-184.1 *'` returns no history while `-- '.boards/tasks/cf-184.1 - *'` returns all of it. The ` - ` also stops `cf-18` matching `cf-184`. Measured 2026-11-12 on CF-184.1.

**How to apply:** to read a card's status history, `git log coder-fleet/state --glob='refs/coder-fleet/flushed/*' -p --format= -- '.boards/tasks/<id lower> - *' | grep -E '^[-+]status:'`. Run git log from the worktree without `-C`; the guard refuses `-C` to the main checkout. See [[live-card-in-state-worktree]].

---
name: hook-fixture-background-trap
description: A background job started from a git hook in a board test must redirect the whole group, or Bun.spawnSync of the parent hangs until the job exits
metadata:
  type: feedback
---

In a fixture git hook (pre-push used to stage a race in `flush.test.ts`), write `(cd X && cmd) </dev/null >log 2>&1 &`, never `(cd X && cmd >log 2>&1 &)`. The second backgrounds the whole `cd && cmd` list, whose subshell keeps the hook's stdout and stderr open, so the `Bun.spawnSync` running the CLI waits for that job to finish.

**Why:** on CF-183.3 the background board write waited 60 s on the board lock, so the flush under test appeared to hang for 60 s and the test timed out; it cost one long round to find.

**How to apply:** any test that starts a process from a hook or script and spawns the parent with piped stdio. A pre-push hook that pushes from a second clone is a real push race for a bare remote; `unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE` at its top.

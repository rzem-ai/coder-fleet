# gates-app fixture

The base tree for the reviewer's gate eval (CF-90). The runner commits this directory as `main`, cuts a linked worktree, and applies and commits `fixtures/inputs/discount-cap.diff` there, so the head fails the declared `test` gate that the base passes. Its `AGENTS.md` declares the gates the reviewer may run. Nothing here has dependencies; the tests run under `node --test`.

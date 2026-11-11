---
name: bun-spawn-env-preload
description: In the board's bun tests, Bun.spawnSync without env does not carry identity vars the test preload sets on process.env; env: process.env is load-bearing, not redundant
metadata:
  type: project
---

`claude/coder-fleet/board/src/test/test-preload.ts` sets GIT_AUTHOR_* and GIT_COMMITTER_* on `process.env`. A `Bun.spawnSync` with no `env` option does not pass those to git, so a fixture that commits without its own `git config user.email` fails on a machine with no global identity (CI, or `user.useConfigOnly=true`). Fixed for flush.test.ts and state-worktree.test.ts in f75811d (CF-183); most other test files set `user.email` in their fixture instead.

**Why:** a mechanical pass called `env: process.env` redundant on that commit; it is not, and removing it reintroduces 27 CI failures.

**How to apply:** when a review sees a new git test helper without `env` and a fixture without `user.email`, flag it; when someone proposes dropping `env: process.env` as cleanup, push back.

Second Bun trap (CF-183.2, b4bdc50, 2026-11-12): on Linux, Bun 1.3.14 (CI's pin and the release-binary builder) silently skips an existing destination file in `cpSync(..., { verbatimSymlinks: true })` unless `force: true` is spelled out, though Node documents force as defaulting to true. macOS and Bun 1.4.4 behave, so a local run cannot show it. Any new `cpSync` that overwrites must pass `force: true`; one into a missing or just-removed path is fine. The memory hook's clean_env strips GIT_*, so a fixture the hook commits in needs a repo `user.email`, not only the preload's env identity.

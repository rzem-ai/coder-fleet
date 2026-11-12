---
name: git-hook-testing-and-trust
description: How to test a hook that fetches or merges with real git (ssh stub, bash timeout), and the trust model three security reviews settled for CF-200
metadata:
  type: project
---

A hook that runs git at session start runs outside every agent's sandbox and scope hook, and `.git/config` is shared by every worktree, so any agent session can plant a key there. CF-200 (2026-11-12) went through three security reviews mid-build that converged on: hold local and worktree-scope config to an allowlist (a denylist was rejected because git keeps adding command-bearing keys, e.g. core.alternateRefsCommand), refuse `objects/info/alternates`, trust global and system config, fixed sentences only in additionalContext with git's words in the log, userinfo redacted greedily to the last `@`, and `protocol.allow=never` plus per-protocol allows on the fetch.

**Why:** the first review said keep local sshCommand and credential helpers; the second reversed it. Start from the allowlist and skip the two extra rounds.

**How to apply:** for any hook or script that runs git unattended:
- Test with `ssh://fixture.invalid/<abs path>` remotes and `GIT_SSH_COMMAND=<stub>` plus `GIT_SSH_VARIANT=simple` in the environment; the stub execs `git upload-pack` on the path, and can count, record env, hang or fail. Local-path remotes and uploadpack stubs stop working once file transport is refused.
- macOS has no `timeout`: `set -m` inside `$( )` puts a background job in its own process group on bash 3.2 and 5, and a watchdog `kill -- -$pid` takes the children too.
- `protocol.<name>.allow` in any scope beats `protocol.allow` on the command line, so pin ext and file to never explicitly.
- `git merge` has no `--no-recurse-submodules` and ignores submodule.recurse; `-c submodule.recurse=false` is an equivalent mutant there.
- Allowlist exact extensions (worktreeconfig, objectformat, refstorage, relativeworktrees), never `extensions.*`: partialclone fetches lazily. Check every remote's url and pushurl at every scope, refuse control characters, and match with `[[ =~ ]]`, never grep, which reads a newline-split value line by line.
- This repo's own `.git/config` carries `branch.main.vscode-merge-base`; an allowlist without it skips the fleet's own checkout.

See [[worktree-guard-traps]].

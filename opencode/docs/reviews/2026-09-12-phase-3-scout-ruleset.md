# Review: `scout`'s permission ruleset, Phase 3

Reviewed at commit `f3fdf28`, against OpenCode source at `/Users/alex/Dev/Work/desktop/opencode`. Read-only review; nothing was edited by the reviewer.

## Verdict

The ruleset's internal ordering holds. The invariant it exists to enforce does not.

Both halves are load-bearing. Inside `.opencode/agent/scout.md` the four-block discipline is correct and could not be broken: block 1 is the only `*`-permission rule and it is first, every later rule names an exact permission or is a `bash` sub-block carrying its own `"*": deny` first, and no globs are used anywhere in the file so there is no accidental match in either direction.

But `scout`'s block is not the ruleset. OpenCode merges two rulesets in front of it and appends one behind it at `packages/opencode/src/agent/agent.ts:262-309`, and against the front one the file commits exactly the mistake its own header comment warns about. Below the permission layer entirely, the shell allowlist does not stop writes - it stops `echo`.

## Findings

**1. HIGH - shell redirection walks through the allowlist.** `source()` at `packages/opencode/src/tool/shell.ts:119` climbs to the `redirected_statement` parent, so the redirect text is in the pattern. It does not help: `Wildcard.match` compiles `cat *` to `^cat( .*)?$` with the `s` flag, which matches the whole redirected statement including newlines. Verified by executing the matcher's own source: `cat CLAUDE.md > pwned.txt`, `cat > pwned.txt <<'EOF'`, `tail -n1 a.md > pwned.txt` and `grep -r x . > pwned.txt` all match their allow patterns. `parts()` at `shell.ts:98` skips `redirection` children, so the target never reaches `pathArgs` and never becomes an `external_directory` ask. Phase 3 observed `echo hello > file` denied and concluded redirection was caught; that was `echo` failing the allowlist. Substitute `cat` and the write lands. The no-write invariant is prose.

**2. HIGH - `read: allow` reopens OpenCode's own `.env` guard.** `defaults` at `agent.ts:128-133` ships `read: { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" }`. A custom agent is `merge(defaults, user)` with the agent's own block appended last, so `scout.md`'s `read: {"*": allow}` is the last rule matching `read` for every path including `.env`. Stock OpenCode would have asked; nothing does. The generalisable lesson: the block you write is always the last block, so every rule in it is a potential reopen of something upstream.

**3. HIGH - `find *` is an arbitrary-execution primitive.** `find` is a single AST node and its `-exec` payload is arguments, never parsed into command nodes. `find . -delete` and `find . -exec sh -c '...' ;` both match `find *`. Not closable declaratively, since `find` has no read-only mode to glob for.

**4. MEDIUM - `sed -n *` permits writes.** `-n` is not read-only. `sed -n 'w /tmp/x' file` writes via the `w` script command, and `sed -n -i.bak` edits in place.

**5. MEDIUM - `git diff --output=`.** Matches `git diff *`. The subcommand is not the unit; the flags are. No write flag found on `git log`, `git show`, `git blame` or `git ls-files`.

**6. LOW, latent - `read: allow` un-hides the MCP resource tools.** `permission/index.ts:206` aliases `list_mcp_resources`, `list_mcp_resource_templates` and `read_mcp_resource` onto `read`. Absent from this build's payload, so latent.

**7. LOW - `external_directory: {"*": ask}` downgrades OpenCode's own whitelist** of the tmp, skill and reference directories. Truncation still works via the appendix rule at `agent.ts:299-309`.

**8. Note - `opencode.json`'s denies never reach `build`.** `agent.ts:144-152` constructs `build` as `merge(defaults, {question:allow, plan_enter:allow})` without merging user config. A project-level deny is not global.

## What was confirmed clean

The corpus write lock is genuinely closed. The four write tools are named exactly rather than globbed, so the over-match question does not arise in either direction, the two allowed kv reads survive, and any future kv write tool falls back to block 1 and is denied. Fail-closed.

The plugin's preload half passes all four properties: it appends rather than replaces, reads from disk in the factory body before the hooks object is returned, tolerates an undefined `sessionID` by never dereferencing it, and carries no cache of any kind, so the Phase 0 stale-agent failure cannot occur.

## The judgement that changed the plan

An allowlist of verbs enforces the wrong property. It asks whether a binary is on the list when the invariant is whether the command changes state, and redirection, `find` and `sed` are three proofs those are different questions. Every allowed verb becomes a write primitive the moment `>` is appended.

The allowlist is also too tight to use. Every AST node must evaluate to allow, so one unlisted verb kills the whole command: `rg foo | sort -u` is refused, `ls -la x || echo missing` is refused. Denied and plausibly wanted on an ordinary run: `echo`, `pwd`, `awk`, `sort`, `uniq`, `cut`, `jq`, `basename`, `dirname`, `stat`, `xargs`, `diff`, `which`, and the read-only git verbs `status`, `rev-parse`, `branch`, `grep`, `remote -v`, `cat-file`, `describe`.

The sequencing consequence, which is the reason this review changed the plan rather than just correcting a file: fix redirection centrally in Phase 4 and the allowlists can afford to be generous, because the dangerous operation stops being "which binary" and becomes "does this node write". That is one boundary for all ten agents instead of nine hand-written allowlists each wrong in its own way.

## Lead's rulings

Findings 1, 3, 4 and 5 become Phase 4's four rows, redirection first. Finding 2 is fixed in Phase 3 immediately, as `deny` rather than `ask`, because an ask auto-rejects in a non-interactive run. `find` is dropped from the allowlists entirely rather than gated by a flag denylist, since `glob` covers what `scout` is told to use it for. The allowlist widening is deferred to Phase 5 and applied to all ten agents at once, against the central write-gate rather than ahead of it.

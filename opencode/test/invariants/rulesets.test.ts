/**
 * The declarative half of the invariant register: what each agent's merged
 * permission ruleset actually decides.
 *
 * scope.test.ts proves the plugin's residue and live.test.ts proves one denial
 * end to end. Neither reads the frontmatter rulesets, and those are the first
 * lock on every invariant - and the one that is easy to get wrong silently,
 * because a body's block is appended after OpenCode's defaults and the
 * project's own block, so correctness is a property of the MERGED list rather
 * than of the file (docs/divergence-register.md, "the block you write is always
 * the last block"). Reading a body in isolation cannot say what it does.
 *
 * So this test asks a real OpenCode for each merged ruleset, with
 * `opencode debug agent <name>` against a scratch project built from the
 * payload, and evaluates it the way `Permission.evaluate` does: `Wildcard.match`
 * on both the permission and the pattern, last match wins, "ask" when nothing
 * matches. `match` below is a transcription of `Wildcard.match` from the 1.18.30
 * binary - escape, `*` to `.*`, `?` to `.`, a trailing ` *` made optional, the
 * `s` flag - and the transcription is the one thing here that could drift from
 * upstream. It was checked against the case the register records:
 * `match("/x/.env", "*.env")` is true.
 *
 * It also proves every body decodes. A frontmatter value that fails the schema
 * drops the agent with no warning at all, so a missing name is a broken body.
 *
 * A bash case is one command node's source text. OpenCode also asks with the
 * node's arity prefix, and every pattern must allow; the cases here are chosen
 * so the source text is the deciding pattern.
 *
 * Run with: bun test test/invariants/rulesets.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const REPO = path.join(import.meta.dir, "..", "..")
const OPENCODE = process.env["OPENCODE_BIN"] || path.join(process.env["HOME"] ?? "", ".opencode", "bin", "opencode")

const AGENTS = ["lead", "scout", "spec-writer", "coder", "reviewer", "refuter", "researcher", "tech-writer", "ui-designer"]

type Rule = { permission: string; pattern: string; action: "allow" | "deny" | "ask" }

/** `Wildcard.match`, transcribed. */
function match(text: string, pattern: string): boolean {
  const s = text.replaceAll("\\", "/")
  let re = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  if (re.endsWith(" .*")) re = re.slice(0, -3) + "( .*)?"
  return new RegExp("^" + re + "$", "s").test(s)
}

function evaluate(rules: Rule[], permission: string, pattern: string): string {
  const hit = rules.findLast((r) => match(permission, r.permission) && match(pattern, r.pattern))
  return hit?.action ?? "ask"
}

let root = ""
const merged: Record<string, Rule[]> = {}
const models: Record<string, string> = {}
/** What `opencode debug agent` said for a body it would not print. */
const failures: Record<string, string> = {}

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "fleet-rulesets-"))
  const project = path.join(root, "project")
  const home = path.join(root, "home")
  mkdirSync(path.join(project, ".opencode"), { recursive: true })
  mkdirSync(home, { recursive: true })
  for (const part of ["agent", "command", "skill", "plugin", "lib"]) {
    cpSync(path.join(REPO, "coder-fleet", part), path.join(project, ".opencode", part), { recursive: true })
  }
  // The repo's own config, so the project-level `permission` block the bodies
  // are appended after is the real one.
  cpSync(path.join(REPO, "coder-fleet", "opencode.json"), path.join(project, "opencode.json"))
  // A git repository, because OpenCode's worktree for a directory outside git
  // is "/", and the worktree-relative `edit` patterns would then mean
  // something else (refuter.md says why that matters).
  Bun.spawnSync(["git", "init", "-q", "."], { cwd: project })
  writeFileSync(path.join(project, "README.md"), "fixture\n")

  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
  }
  // One at a time. Nine processes started together share one data directory
  // and a different agent came back empty on each of three parallel runs,
  // which reads as a broken body when it is contention.
  for (const name of AGENTS) {
    const proc = Bun.spawnSync([OPENCODE, "debug", "agent", name], { cwd: project, env, stdout: "pipe", stderr: "pipe" })
    const out = proc.stdout.toString()
    const start = out.indexOf("{")
    if (start < 0) {
      failures[name] = `exit ${proc.exitCode}: ${out}${proc.stderr.toString()}`.trim()
      continue
    }
    const info = JSON.parse(out.slice(start))
    merged[name] = info.permission
    models[name] = `${info.model?.providerID}/${info.model?.modelID}`
  }
}, 240_000)

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

/** One expectation: on `agent`, `permission` with `pattern` evaluates to `want`. */
type Case = [permission: string, pattern: string, want: "allow" | "deny" | "ask"]

function check(agent: string, cases: Case[]) {
  const rules = merged[agent]
  expect(rules, `${agent} did not decode - look at its frontmatter. ${failures[agent] ?? ""}`).toBeArray()
  const wrong = cases
    .map(([p, pat, want]) => ({ p, pat, want, got: evaluate(rules!, p, pat) }))
    .filter((c) => c.got !== c.want)
    .map((c) => `${c.p} ${JSON.stringify(c.pat)} -> ${c.got}, want ${c.want}`)
  expect(wrong).toEqual([])
}

test("the matcher transcription agrees with the case the register records", () => {
  expect(match("/x/.env", "*.env")).toBe(true)
  expect(match("git log", "git log *")).toBe(true)
  expect(match("git logx", "git log *")).toBe(false)
})

test("every body decodes, on the model it declares", () => {
  for (const name of AGENTS) expect(merged[name], `${name} did not decode. ${failures[name] ?? ""}`).toBeArray()
  for (const name of AGENTS.filter((a) => a !== "ui-designer")) expect(models[name]).toBe("trillian/qwen3-coder-next")
  expect(models["ui-designer"]).toBe("trillian/qwen3.8-27b")
})

describe("the flat fleet, on every subagent", () => {
  const subagents = AGENTS.filter((a) => a !== "lead")
  test("no MCP server is granted by default, and no subagent spawns", () => {
    for (const agent of subagents) {
      check(agent, [
        ["task", "scout", "deny"],
        ["question", "*", "deny"],
        ["skill", "handoff", "deny"],
        // An MCP server added later is denied by default, not allowed.
        ["some-future-server_tool", "*", "deny"],
        ["read", "/project/.env", "deny"],
        ["read", "/project/.env.local", "deny"],
      ])
    }
  })
})

test("lead: spawns fleet agents and nothing else, and asks the human", () => {
  check("lead", [
    ...["scout", "spec-writer", "coder", "reviewer", "refuter", "researcher", "tech-writer", "ui-designer"].map(
      (a): Case => ["task", a, "allow"],
    ),
    ["task", "general", "deny"],
    ["task", "explore", "deny"],
    ["task", "scripter", "deny"],
    ["task", "fleet-steward", "deny"],
    ["question", "*", "allow"],
    ["skill", "compound", "allow"],
    ["skill", "handoff", "deny"],
    ["skill", "glossary", "deny"],
    ["bash", "git push origin feat", "allow"],
    ["edit", "src/x.ts", "allow"],
  ])
})

test("scout: read-only gh pairs pass the declarative layer, and the writes do not", () => {
  check("scout", [
    ["bash", "gh issue list", "allow"],
    ["bash", "gh pr view 42 --json title,body", "allow"],
    ["bash", "gh api repos/o/r/issues --paginate", "allow"],
    ["bash", "gh -R o/r issue list", "allow"],
    ["bash", "gh issue close 1", "deny"],
    ["bash", "gh pr merge 1 --squash", "deny"],
    ["bash", "gh auth token", "deny"],
    ["bash", "gh browse", "deny"],
    ["bash", "gh repo clone o/r", "deny"],
  ])
})

test("coder: writes anything but a credential, and never force-pushes or rewrites history", () => {
  check("coder", [
    ["edit", "src/x.ts", "allow"],
    ["edit", ".env", "deny"],
    ["edit", "config/.env.prod", "deny"],
    ["bash", "npm test", "allow"],
    ["bash", "git push origin feat", "allow"],
    ["bash", "git push --follow-tags origin feat", "allow"],
    ["bash", "git push --force", "deny"],
    ["bash", "git push origin feat --force-with-lease", "deny"],
    ["bash", "git push -f origin feat", "deny"],
    ["bash", "git push origin feat -f", "deny"],
    ["bash", "git push --mirror", "deny"],
    ["bash", "git push origin --delete feat", "deny"],
    ["bash", "git filter-branch --tree-filter x", "deny"],
    ["bash", "git filter-repo", "deny"],
    ["webfetch", "*", "allow"],
    ["skill", "looping", "allow"],
    ["skill", "humanize", "deny"],
  ])
})

test("reviewer: reads, and runs nothing that is not a read verb", () => {
  check("reviewer", [
    ["edit", "src/x.ts", "deny"],
    ["bash", "git diff main...HEAD", "allow"],
    ["bash", "git status", "allow"],
    ["bash", "rg foo src", "allow"],
    ["bash", "sed -n 1,20p x", "allow"],
    ["bash", "pwd", "allow"],
    ["bash", "npm test", "deny"],
    ["bash", "git commit -m x", "deny"],
    ["bash", "find . -name x", "deny"],
    ["bash", "awk '{print}' x", "deny"],
    ["bash", "sed -i s/a/b/ x", "deny"],
    ["webfetch", "*", "deny"],
  ])
})

test("refuter: writes outside the project only, and its git is read-only", () => {
  check("refuter", [
    ["edit", "src/x.ts", "deny"],
    ["edit", "x.ts", "deny"],
    ["edit", "../../tmp/refuter-1/src/x.ts", "allow"],
    ["external_directory", "/tmp/refuter-1/*", "allow"],
    ["external_directory", "/home/someone/*", "ask"],
    ["bash", "npm test", "allow"],
    ["bash", "cp -r . /tmp/refuter-1", "allow"],
    ["bash", "git log -3", "allow"],
    ["bash", "git commit -m fix", "deny"],
    ["bash", "git stash", "deny"],
    ["bash", "git worktree add /tmp/x", "deny"],
  ])
})

test("researcher: the web, no shell and no files", () => {
  check("researcher", [
    ["webfetch", "*", "allow"],
    ["websearch", "*", "allow"],
    ["bash", "ls", "deny"],
    ["edit", "x.md", "deny"],
    ["skill", "run-article", "allow"],
  ])
})

test("spec-writer: writes under docs/specs/ and nowhere else", () => {
  check("spec-writer", [
    ["edit", "docs/specs/CF-1.md", "allow"],
    ["edit", "docs/specs/sub/x.md", "allow"],
    ["edit", "docs/plans/x.md", "deny"],
    ["edit", "docs/specsx.md", "deny"],
    ["edit", "src/x.ts", "deny"],
    ["edit", "../docs/specs/x.md", "deny"],
    ["bash", "ls", "deny"],
    ["skill", "anything", "deny"],
  ])
})

test("tech-writer: writes documents, reaches humanize and its references", () => {
  check("tech-writer", [
    ["edit", "README.md", "allow"],
    ["edit", ".env", "deny"],
    ["bash", "ls", "deny"],
    ["skill", "humanize", "allow"],
    ["external_directory", "/home/someone/.config/opencode/skill/humanize/references/*", "allow"],
    ["external_directory", "/home/someone/.config/opencode/skill/handoff/*", "ask"],
  ])
})

test("ui-designer: builds and serves prototypes, installs nothing, writes no git", () => {
  check("ui-designer", [
    ["edit", "prototypes/a.html", "allow"],
    ["bash", "python3 -m http.server 8000", "allow"],
    ["bash", "npm install react", "deny"],
    ["bash", "npm i", "deny"],
    ["bash", "pnpm add x", "deny"],
    ["bash", "bun install", "deny"],
    ["bash", "pip install x", "deny"],
    ["bash", "git commit -m x", "deny"],
    ["bash", "git status", "allow"],
  ])
})

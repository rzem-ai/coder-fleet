/**
 * The declarative half of the invariant register: what each agent's merged
 * permission ruleset actually decides.
 *
 * scope.test.ts proves the plugin's residue and live.test.ts proves it end to
 * end. Neither reads the frontmatter rulesets, and those are the first lock on
 * every invariant - and the one that is easy to get wrong silently, because a
 * body's block is appended after OpenCode's defaults and the project's own
 * block, so correctness is a property of the MERGED list rather than of the
 * file (docs/divergence-register.md, "the block you write is always the last
 * block"). Reading a body in isolation cannot say what it does.
 *
 * So this test asks a real OpenCode for each merged ruleset: it starts
 * `opencode serve` on a scratch project built from the payload, reads
 * `agent.list` through `opencode api`, and evaluates each list the way 2.x's
 * permission evaluation does: the wildcard match on both the action and the
 * resource, last match wins, "ask" when nothing matches. `match` below is a
 * transcription of that wildcard match from the 2.0.32 binary - escape, `*` to
 * `.*`, `?` to `.`, a trailing ` *` made optional, the `s` flag - and the
 * transcription is the one thing here that could drift from upstream. It was
 * checked against the case the register records: `match("/x/.env", "*.env")`
 * is true.
 *
 * 2.x reads the bodies' 1.x frontmatter through its legacy normaliser, which
 * renames `bash` to `shell` and `task` to `subagent`, so the cases below ask
 * with the 2.x names.
 *
 * It also proves every body decodes. A frontmatter value that fails the schema
 * drops the agent with no warning at all, so a missing name is a broken body.
 *
 * A shell case is one command node's source text. OpenCode also asks with the
 * node's arity prefix, and every pattern must allow; the cases here are chosen
 * so the source text is the deciding pattern.
 *
 * Run with: opencode/test/run.sh live
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const REPO = path.join(import.meta.dir, "..", "..")
const OPENCODE = process.env["OPENCODE_BIN"] || path.join(process.env["HOME"] ?? "", ".opencode", "bin", "opencode")

const AGENTS = ["lead", "scout", "spec-writer", "coder", "reviewer", "refuter", "researcher", "tech-writer", "ui-designer"]

type Rule = { action: string; resource: string; effect: "allow" | "deny" | "ask" }

/** The 2.x wildcard match, transcribed. */
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
  const hit = rules.findLast((r) => match(permission, r.action) && match(pattern, r.resource))
  return hit?.effect ?? "ask"
}

let root = ""
const merged: Record<string, Rule[]> = {}
const models: Record<string, string> = {}
/** What the server said when the agents never all appeared. */
const failures: Record<string, string> = {}

/** A port nothing is listening on, from the kernel. */
function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = probe.port!
  probe.stop(true)
  return port
}

let serve: ReturnType<typeof Bun.spawn> | undefined
let serveLog = ""

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "fleet-rulesets-"))
  const project = path.join(root, "project")
  const home = path.join(root, "home")
  mkdirSync(path.join(project, ".opencode"), { recursive: true })
  mkdirSync(home, { recursive: true })
  for (const part of ["agent", "command", "skill", "plugin", "lib"]) {
    cpSync(path.join(REPO, "coder-fleet", part), path.join(project, ".opencode", part), { recursive: true })
  }
  // The repo's own config, so the project-level `permissions` block the bodies
  // are appended after is the real one.
  cpSync(path.join(REPO, "coder-fleet", "opencode.json"), path.join(project, "opencode.json"))
  // A git repository, because OpenCode's worktree for a directory outside git
  // is "/", and the worktree-relative `edit` patterns would then mean
  // something else (refuter.md says why that matters).
  Bun.spawnSync(["git", "init", "-q", "."], { cwd: project })
  writeFileSync(path.join(project, "README.md"), "fixture\n")

  // Isolated from the machine, and a private server rather than the human's
  // background service: the service would answer for the human's own config.
  const env = {
    ...process.env,
    PWD: project,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    OPENCODE_PASSWORD: "fleet-rulesets",
  }
  const url = `http://127.0.0.1:${freePort()}`
  serveLog = path.join(root, "serve.log")
  serve = Bun.spawn([OPENCODE, "serve", "--port", url.split(":").pop()!, "--print-logs", "--log-level", "warn"], {
    cwd: project,
    env,
    stdout: "ignore",
    stderr: Bun.file(serveLog),
  })

  // The server loads agents after its first request for the directory, so the
  // list is polled until every fleet body is in it or the deadline passes.
  let last = ""
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const proc = Bun.spawnSync([OPENCODE, "api", "--server", url, "agent.list"], { cwd: project, env, stdout: "pipe", stderr: "pipe" })
    last = `exit ${proc.exitCode}: ${proc.stdout.toString()}${proc.stderr.toString()}`.trim()
    const out = proc.stdout.toString()
    if (proc.exitCode === 0 && out.trim().startsWith("{")) {
      const data: any[] = JSON.parse(out).data ?? []
      for (const info of data) {
        merged[info.id] = info.permissions
        models[info.id] = `${info.model?.providerID}/${info.model?.id}`
      }
      if (AGENTS.every((a) => merged[a])) break
    }
    await Bun.sleep(500)
  }
  for (const a of AGENTS) if (!merged[a]) failures[a] = last.slice(0, 2000)
}, 240_000)

afterAll(async () => {
  serve?.kill()
  await serve?.exited
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

test("the repository's opencode.json is read as 2.x config, with nothing for the normaliser to rewrite", () => {
  const log = readFileSync(serveLog, "utf8")
  const diagnostics = log.split("\n").filter((l) => l.includes("normalization diagnostic") && l.includes("opencode.json"))
  expect(diagnostics).toEqual([])
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
        ["subagent", "scout", "deny"],
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
      (a): Case => ["subagent", a, "allow"],
    ),
    ["subagent", "general", "deny"],
    ["subagent", "explore", "deny"],
    ["subagent", "scripter", "deny"],
    ["subagent", "fleet-steward", "deny"],
    ["question", "*", "allow"],
    ["skill", "compound", "allow"],
    ["skill", "handoff", "deny"],
    ["skill", "glossary", "deny"],
    ["shell", "git push origin feat", "allow"],
    ["edit", "src/x.ts", "allow"],
  ])
})

test("scout: read-only gh pairs pass the declarative layer, and the writes do not", () => {
  check("scout", [
    ["shell", "gh issue list", "allow"],
    ["shell", "gh pr view 42 --json title,body", "allow"],
    ["shell", "gh api repos/o/r/issues --paginate", "allow"],
    ["shell", "gh -R o/r issue list", "allow"],
    ["shell", "gh issue close 1", "deny"],
    ["shell", "gh pr merge 1 --squash", "deny"],
    ["shell", "gh auth token", "deny"],
    ["shell", "gh browse", "deny"],
    ["shell", "gh repo clone o/r", "deny"],
  ])
})

test("coder: writes anything but a credential, and never force-pushes or rewrites history", () => {
  check("coder", [
    ["edit", "src/x.ts", "allow"],
    ["edit", ".env", "deny"],
    ["edit", "config/.env.prod", "deny"],
    ["shell", "npm test", "allow"],
    ["shell", "git push origin feat", "allow"],
    ["shell", "git push --follow-tags origin feat", "allow"],
    ["shell", "git push --force", "deny"],
    ["shell", "git push origin feat --force-with-lease", "deny"],
    ["shell", "git push -f origin feat", "deny"],
    ["shell", "git push origin feat -f", "deny"],
    ["shell", "git push --mirror", "deny"],
    ["shell", "git push origin --delete feat", "deny"],
    ["shell", "git filter-branch --tree-filter x", "deny"],
    ["shell", "git filter-repo", "deny"],
    ["webfetch", "*", "allow"],
    ["skill", "looping", "allow"],
    ["skill", "humanize", "deny"],
  ])
})

test("reviewer: reads, and runs nothing that is not a read verb", () => {
  check("reviewer", [
    ["edit", "src/x.ts", "deny"],
    ["shell", "git diff main...HEAD", "allow"],
    ["shell", "git status", "allow"],
    ["shell", "rg foo src", "allow"],
    ["shell", "sed -n 1,20p x", "allow"],
    ["shell", "pwd", "allow"],
    ["shell", "npm test", "deny"],
    ["shell", "git commit -m x", "deny"],
    ["shell", "find . -name x", "deny"],
    ["shell", "awk '{print}' x", "deny"],
    ["shell", "sed -i s/a/b/ x", "deny"],
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
    ["shell", "npm test", "allow"],
    ["shell", "cp -r . /tmp/refuter-1", "allow"],
    ["shell", "git log -3", "allow"],
    ["shell", "git commit -m fix", "deny"],
    ["shell", "git stash", "deny"],
    ["shell", "git worktree add /tmp/x", "deny"],
  ])
})

test("researcher: the web, no shell and no files", () => {
  check("researcher", [
    ["webfetch", "*", "allow"],
    ["websearch", "*", "allow"],
    ["shell", "ls", "deny"],
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
    ["shell", "ls", "deny"],
    ["skill", "anything", "deny"],
  ])
})

test("tech-writer: writes documents, reaches humanize and its references", () => {
  check("tech-writer", [
    ["edit", "README.md", "allow"],
    ["edit", ".env", "deny"],
    ["shell", "ls", "deny"],
    ["skill", "humanize", "allow"],
    ["external_directory", "/home/someone/.config/opencode/skill/humanize/references/*", "allow"],
    ["external_directory", "/home/someone/.config/opencode/skill/handoff/*", "ask"],
  ])
})

test("ui-designer: builds and serves prototypes, installs nothing, writes no git", () => {
  check("ui-designer", [
    ["edit", "prototypes/a.html", "allow"],
    ["shell", "python3 -m http.server 8000", "allow"],
    ["shell", "npm install react", "deny"],
    ["shell", "npm i", "deny"],
    ["shell", "pnpm add x", "deny"],
    ["shell", "bun install", "deny"],
    ["shell", "pip install x", "deny"],
    ["shell", "git commit -m x", "deny"],
    ["shell", "git status", "allow"],
  ])
})

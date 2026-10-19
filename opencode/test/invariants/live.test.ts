/**
 * The live half of the invariant suite: the plugin, end to end, through a real
 * OpenCode 2.x process.
 *
 * scope.test.ts proves what `decide` decides. It cannot prove what only a
 * running session can show, and that is where a port in a new language against
 * a different interface goes wrong:
 *
 *   1. the plugin loads at all, and its hooks are registered on the domains
 *      OpenCode actually triggers;
 *   2. the agent name reaches the tool hook, for a primary session and for a
 *      subagent spawned into a child session;
 *   3. each tool reaches `decide` in the shape `decide` reads - the shell
 *      command, the write tools' path, the patch text - so that every denial
 *      site in coder-fleet/lib/scope.ts fires inside a session;
 *   4. throwing from the hook DENIES the call, nothing it would have written
 *      lands, and the thrown message reaches the model intact;
 *   5. the preload puts the handoff and glossary bodies into the agent loop's
 *      system prompt and leaves the title request alone.
 *
 * It runs against a mock endpoint rather than a real model. The assertion is
 * about OpenCode's plumbing, and the mock decides which tool gets called, so
 * the run never depends on a model choosing to run the forbidden command.
 *
 * Each fixture agent's `permission` ALLOWS everything, so the only thing that
 * can deny a call is the plugin. If the declarative layer refused first, these
 * tests would pass while proving nothing.
 *
 * Every expected denial is computed by calling `decide` in this process with
 * the same agent, tool, arguments and directory, and each case also names a
 * fragment of the site it is there to hit. The live result must carry that
 * exact message, so a case cannot pass by meeting a different rule. The cases
 * are in live-cases.ts, and deny-sites.test.ts fails in the unit suite when a
 * `return deny(` site in scope.ts has none.
 *
 * Run with: opencode/test/run.sh live
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { decide } from "../../coder-fleet/lib/scope.ts"
import { type Call, type Case, CASES, sh } from "./live-cases.ts"

const REPO = path.join(import.meta.dir, "..", "..")
const OPENCODE = process.env["OPENCODE_BIN"] || path.join(process.env["HOME"] ?? "", ".opencode", "bin", "opencode")

/** A call the plugin must let through, so a hook that denied everything fails. */
const ALLOWED: Call = sh("echo fleet-allowed")

/** What the mock is scripted to call, by the fixture agent whose prompt it sees. */
let scripts: Record<string, Call[]> = {}
/** Every tool result the mock was sent, by agent, in call order. */
let results: Record<string, string[]> = {}
/** The system prompt of every request, and whether it was a title request. */
let systems: { title: boolean; text: string }[] = []

let root = ""
let project = ""
let server: ReturnType<typeof Bun.serve> | undefined

const MARKER = (agent: string) => `FLEET-FIXTURE:${agent};`

function sse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n"
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } })
}

function text(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.map((p: any) => (typeof p === "string" ? p : (p?.text ?? JSON.stringify(p)))).join("\n")
  return JSON.stringify(content)
}

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname.endsWith("/models")) {
        return Response.json({ object: "list", data: [{ id: "mock-model", object: "model" }] })
      }
      const payload: any = await req.json()
      const messages: any[] = payload.messages ?? []
      const system = messages.filter((m) => m.role === "system").map((m) => text(m.content)).join("\n")
      const base = { id: "chatcmpl-mock", object: "chat.completion.chunk", created: 0, model: "mock-model" }
      const say = (content: string) =>
        sse([
          { ...base, choices: [{ index: 0, delta: { role: "assistant", content } }] },
          { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
        ])

      // The title request carries no tools. Answer it and keep it out of the
      // agent's script.
      const title = !Array.isArray(payload.tools)
      systems.push({ title, text: system })
      if (title) return say("Fixture run")

      const agent = Object.keys(scripts).find((a) => system.includes(MARKER(a)))
      if (!agent) return say("no script for this prompt")
      const seen = messages.filter((m) => m.role === "tool").map((m) => text(m.content))
      results[agent] = seen
      const next = scripts[agent]![seen.length]
      if (!next) return say(`FIXTURE-DONE ${agent}`)
      return sse([
        {
          ...base,
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [{ index: 0, id: `call_${seen.length}`, type: "function", function: { name: next.tool, arguments: JSON.stringify(next.args) } }],
              },
            },
          ],
        },
        { ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
      ])
    },
  })

  root = realpathSync(mkdtempSync(path.join(tmpdir(), "fleet-live-")))
  project = path.join(root, "project")
  mkdirSync(path.join(project, ".opencode", "agent"), { recursive: true })
  mkdirSync(path.join(root, "home"), { recursive: true })
  for (const c of CASES) {
    if (typeof c.args["workdir"] === "string") c.args["workdir"] = (c.args["workdir"] as string).replace("HOME_DIR", path.join(root, "home"))
  }

  // The plugin and what it reads, copied rather than symlinked so the test
  // cannot pass by loading something out of the repository's own session.
  for (const part of ["plugin", "lib", "skill"]) {
    cpSync(path.join(REPO, "coder-fleet", part), path.join(project, ".opencode", part), { recursive: true })
  }

  // The context window is large on purpose. Every step carries the preloaded
  // skills, and a small window makes OpenCode compact partway through the
  // longest script, which the mock cannot answer.
  writeFileSync(
    path.join(project, "opencode.json"),
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        providers: {
          mock: {
            name: "mock",
            package: "aisdk:@ai-sdk/openai-compatible",
            settings: { baseURL: `http://127.0.0.1:${server.port}/v1`, apiKey: "mock" },
            models: { "mock-model": { name: "mock-model", capabilities: { tools: true }, limit: { context: 1000000, output: 1024 } } },
          },
        },
        model: "mock/mock-model",
      },
      null,
      2,
    ),
  )

  // `mode: all` so one fixture serves both a direct run and a spawn from the
  // lead. The body carries the marker the mock routes on.
  const agents = new Set([...CASES.map((c) => c.agent), "lead"])
  for (const agent of agents) {
    writeFileSync(
      path.join(project, ".opencode", "agent", `${agent}.md`),
      ["---", `description: Live-test fixture standing in for ${agent}.`, "mode: all", "model: mock/mock-model", "permission:", '  "*": allow', "---", "", `${MARKER(agent)} You are a fixture.`, ""].join("\n"),
    )
  }

  writeFileSync(path.join(project, "AGENTS.md"), "a file for the fixture to read\n")
  // A git repository, so OpenCode's worktree is the project rather than "/".
  Bun.spawnSync(["git", "init", "-q", "."], { cwd: project })
})

afterAll(() => {
  server?.stop(true)
  if (root) rmSync(root, { recursive: true, force: true })
})

/** One `opencode run` as `agent`, with the mock scripted by `script`. */
async function run(agent: string, script: Record<string, Call[]>) {
  scripts = script
  results = {}
  systems = []
  const home = path.join(root, "home")
  const proc = Bun.spawn([OPENCODE, "run", "--standalone", "--agent", agent, "--print-logs", "--log-level", "info", "Run the probe."], {
    cwd: project,
    env: {
      ...process.env,
      // `cwd` alone is not enough: the instance directory comes from PWD.
      PWD: project,
      // Isolated from the machine: no global config, MCP servers, credentials
      // or session database of the human's reaches the run.
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, ".config"),
      XDG_DATA_HOME: path.join(home, ".local", "share"),
      XDG_STATE_HOME: path.join(home, ".local", "state"),
      XDG_CACHE_HOME: path.join(home, ".cache"),
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  await proc.exited

  // An empty success is the worst shape available. Treat it as a failure.
  expect(stdout.trim().length, `empty output from opencode\n--- stderr ---\n${stderr}`).toBeGreaterThan(0)
  // A plugin that fails to load is logged once and the session runs without
  // it, which takes the preload and the enforcement down together.
  const loadFailure = stderr.split("\n").find((l) => l.includes("failed to load plugin"))
  expect(loadFailure, "the fleet plugin did not load").toBeUndefined()
  return { stdout, stderr, exitCode: proc.exitCode }
}

const expected = (c: Case) => decide({ agent: c.agent, tool: c.tool, args: c.args, directory: project })

describe("every denial site in scope.ts fires inside a running 2.x session", () => {
  const byAgent = new Map<string, Case[]>()
  for (const c of CASES) byAgent.set(c.agent, [...(byAgent.get(c.agent) ?? []), c])

  test("each case is denied in-process by the site it names", () => {
    for (const c of CASES) {
      const want = expected(c)
      expect(want, `${c.agent} ${c.tool} ${JSON.stringify(c.args).slice(0, 80)} is not denied`).toBeString()
      expect(want, `${c.agent} ${c.tool} is denied by another site`).toContain(c.site)
    }
  })

  for (const [agent, cases] of byAgent) {
    test(
      `${agent}: ${cases.length} denial(s) reach the model, and nothing they would write lands`,
      async () => {
        await run(agent, { [agent]: [...cases, ALLOWED] })
        const got = results[agent] ?? []
        expect(got.length, `${agent} saw ${got.length} tool results for ${cases.length + 1} calls`).toBe(cases.length + 1)
        cases.forEach((c, i) => {
          const want = expected(c)!
          // The message arrives inside OpenCode's error envelope, intact.
          expect(got[i], `${agent} call ${i}: ${c.tool} ${JSON.stringify(c.args).slice(0, 80)}`).toContain(JSON.stringify(want).slice(1, -1))
          if (c.writes) expect(existsSync(path.join(project, c.writes)), `${c.writes} was created`).toBe(false)
        })
        // The allowed call ran, so the hook is not denying everything.
        expect(got[cases.length]).toContain("fleet-allowed")
        expect(got[cases.length]).not.toContain("DENIED BY THE FLEET")
      },
      120_000,
    )
  }
})

test(
  "a subagent spawned by the lead is governed by its own name",
  async () => {
    const target = path.join(project, "pwned-spawned.txt")
    await run("lead", {
      lead: [{ tool: "subagent", args: { agent: "scout", description: "probe", prompt: "Run the probe." } }],
      scout: [sh("cat AGENTS.md > pwned-spawned.txt")],
    })
    const denial = (results["scout"] ?? [])[0]
    expect(denial, "the spawned scout made no tool call").toBeString()
    expect(denial).toContain("DENIED BY THE FLEET. scout invariant:")
    expect(denial).toContain("redirects")
    expect(existsSync(target), `${target} was created, so the gate did not hold`).toBe(false)
  },
  120_000,
)

test(
  "the handoff and glossary bodies are preloaded into the agent loop, and not into the title request",
  async () => {
    await run("coder", { coder: [] })
    const loop = systems.filter((s) => !s.title)
    const titles = systems.filter((s) => s.title)
    expect(loop.length).toBeGreaterThan(0)
    for (const s of loop) {
      expect(s.text).toContain('<fleet-skill name="handoff"')
      expect(s.text).toContain('<fleet-skill name="glossary"')
      expect(s.text).toContain("## Done")
    }
    for (const s of titles) expect(s.text).not.toContain("<fleet-skill")
  },
  120_000,
)

test(
  "enforcement holds when a preloaded skill is missing",
  async () => {
    // The preload and the enforcement are independent halves. A vendored
    // SKILL.md that cannot be read costs the preload, never the denials.
    const skill = path.join(project, ".opencode", "skill", "handoff", "SKILL.md")
    const saved = readFileSync(skill)
    rmSync(skill)
    try {
      const { stderr } = await run("coder", { coder: [sh('bash -c "git push --force"')] })
      expect((results["coder"] ?? [])[0]).toContain("DENIED BY THE FLEET. coder invariant:")
      expect(stderr).toContain("could not read the vendored handoff skill")
    } finally {
      writeFileSync(skill, saved)
    }
  },
  120_000,
)

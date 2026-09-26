/**
 * The live half of the invariant suite: one denial, end to end, through a real
 * OpenCode process.
 *
 * scope.test.ts proves what `decide` decides. It cannot prove the three things
 * only a running session can show, and those three are where a port in a new
 * language against a different interface goes wrong:
 *
 *   1. the plugin is loaded at all, and its hook is registered under a name
 *      OpenCode actually triggers;
 *   2. the agent name reaches the hook, through the session lookup rather than
 *      through anything the test arranged;
 *   3. throwing DENIES the call, and the thrown message reaches the model
 *      verbatim - which is the property the denial text was written for.
 *
 * It runs against a mock endpoint rather than against trillian, on Phase 0's
 * explicit recommendation. The assertion is about OpenCode's plumbing, and
 * putting a 38GB model and a contended box in the loop buys nothing and costs
 * the afternoon. It also makes the run deterministic: the mock decides which
 * tool gets called, so the test never depends on a model choosing to run the
 * forbidden command.
 *
 * ONE REDUCTION, STATED RATHER THAN HIDDEN. The fixture `coder` is
 * `mode: primary`, because `opencode run --agent <name>` silently runs `build`
 * instead when the named agent is a subagent (`defaultInfo` rejects one and
 * there is no error path back to the flag). The path under test is identical
 * either way - the hook looks the session up by id and reads `.agent` - and
 * Phase 0 observed directly that a task-spawned subagent gets its own session
 * whose `.agent` is the subagent's own name. What this file does not re-prove
 * is that spawning half.
 *
 * Run with: bun test test/invariants/live.test.ts
 */

import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const REPO = path.join(import.meta.dir, "..", "..")
const OPENCODE = path.join(process.env["HOME"] ?? "", ".opencode", "bin", "opencode")

/**
 * The command the mock will make the fixture attempt. Set by each test before
 * it spawns, so both cases go through one server and one project.
 */
let forbidden = ""

let root = ""
let server: ReturnType<typeof Bun.serve> | undefined
/** Every tool result the mock was sent, so the test can read exactly what the
 * model saw rather than what OpenCode chose to print. */
const toolResults: string[] = []

function sse(chunks: unknown[]): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n"
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } })
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
      const seen = messages.filter((m) => m.role === "tool")
      for (const m of seen) {
        const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content)
        if (!toolResults.includes(text)) toolResults.push(text)
      }
      const id = "chatcmpl-mock"
      const base = { id, object: "chat.completion.chunk", created: 0, model: "mock-model" }

      // First turn: call the forbidden command. Second turn: say back, verbatim,
      // what the tool result said, so the test reads the message the MODEL got.
      if (seen.length === 0) {
        return sse([
          {
            ...base,
            choices: [
              {
                index: 0,
                delta: {
                  role: "assistant",
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_1",
                      type: "function",
                      function: { name: "bash", arguments: JSON.stringify({ command: forbidden, description: "probe" }) },
                    },
                  ],
                },
              },
            ],
          },
          { ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
        ])
      }
      const last = seen[seen.length - 1]
      const text = typeof last.content === "string" ? last.content : JSON.stringify(last.content)
      return sse([
        { ...base, choices: [{ index: 0, delta: { role: "assistant", content: `TOOL_RESULT_VERBATIM:\n${text}` } }] },
        { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      ])
    },
  })

  root = mkdtempSync(path.join(tmpdir(), "fleet-live-"))
  mkdirSync(path.join(root, "project", ".opencode", "agent"), { recursive: true })
  mkdirSync(path.join(root, "config"), { recursive: true })
  const project = path.join(root, "project")

  // The plugin and the skills it preloads, copied rather than symlinked so the
  // test cannot pass by accidentally loading something out of the repo's own
  // session.
  for (const part of ["plugin", "lib", "skill"]) {
    cpSync(path.join(REPO, ".opencode", part), path.join(project, ".opencode", part), { recursive: true })
  }

  writeFileSync(
    path.join(project, "opencode.json"),
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        provider: {
          mock: {
            npm: "@ai-sdk/openai-compatible",
            name: "mock",
            options: { baseURL: `http://127.0.0.1:${server.port}/v1`, apiKey: "mock" },
            models: { "mock-model": { name: "mock-model", tool_call: true, limit: { context: 8192, output: 1024 } } },
          },
        },
        model: "mock/mock-model",
      },
      null,
      2,
    ),
  )

  // The fixtures. Each one's `permission` deliberately ALLOWS what the test
  // then attempts, so the only thing that can deny it is the plugin. If the
  // declarative layer refused first, these tests would pass while proving
  // nothing - which is exactly the mistake Phase 3 made about redirection.
  writeFileSync(
    path.join(project, ".opencode", "agent", "coder.md"),
    [
      "---",
      "description: Live-test fixture standing in for the ported coder.",
      "mode: primary",
      "model: mock/mock-model",
      "permission:",
      '  "*": allow',
      "  bash:",
      '    "*": allow',
      "---",
      "",
      "You are a fixture. Do as you are told and nothing else.",
      "",
    ].join("\n"),
  )

  // This one carries `scout`'s real allowlist shape rather than a blanket
  // allow, because the claim under test is that `cat *` allows a write. The
  // rule below is the rule `scout.md` ships.
  writeFileSync(
    path.join(project, ".opencode", "agent", "scout.md"),
    [
      "---",
      "description: Live-test fixture standing in for the ported scout.",
      "mode: primary",
      "model: mock/mock-model",
      "permission:",
      '  "*": allow',
      "  bash:",
      '    "*": deny',
      '    "cat *": allow',
      "---",
      "",
      "You are a fixture. Do as you are told and nothing else.",
      "",
    ].join("\n"),
  )

  writeFileSync(path.join(project, "CLAUDE.md"), "a file for the fixture to read\n")
})

afterAll(() => {
  server?.stop(true)
  if (root) rmSync(root, { recursive: true, force: true })
})

/** One `opencode run`, serialised, returning what the process and the mock saw. */
async function run(agent: string, command: string) {
  forbidden = command
  toolResults.length = 0
  const proc = Bun.spawn(
    [OPENCODE, "run", "--agent", agent, "--print-logs", "--log-level", "INFO", "Run the probe command."],
    {
      cwd: path.join(root, "project"),
      env: {
        ...process.env,
        // `cwd` alone is not enough: the run resolved its instance directory
        // from the inherited PWD and loaded THIS repository's config and plugin
        // instead of the fixture's. A test that silently reads the repo it is
        // testing is worse than no test.
        PWD: path.join(root, "project"),
        // Isolated from the machine's own global config, so the test does not
        // depend on Alex's MCP servers, his credential file, or his model pin.
        OPENCODE_CONFIG_DIR: path.join(root, "config"),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  await proc.exited

  // Phase 1 and Phase 0 both watched a run exit 0 having printed nothing at
  // all. Treat that as a failure rather than as a pass: an empty success is the
  // worst shape available and it is the one this suite is most likely to meet.
  expect(stdout.trim().length, `empty output from opencode\n--- stderr ---\n${stderr}`).toBeGreaterThan(0)
  // A plugin whose module has any non-function export fails to load ENTIRELY,
  // logged once at ERROR and nowhere else. That takes the preload transform
  // down with the enforcement, so it is asserted rather than inferred.
  expect(stdout + stderr).not.toContain("failed to load plugin")

  return { stdout, stderr, denial: toolResults.find((t) => t.includes("DENIED BY THE FLEET")) }
}

test(
  'bash -c "git push --force" is denied for coder inside a running session',
  async () => {
    const { stdout, denial } = await run("coder", 'bash -c "git push --force"')
    expect(denial, "no denial reached the model").toBeString()
    expect(denial).toContain("coder invariant:")
    expect(denial).toContain("force-push")
    // Verbatim: the thrown message arrives with no wrapper and no truncation,
    // which is what makes the denial text worth writing carefully.
    expect(stdout).toContain("DENIED BY THE FLEET")
  },
  120_000,
)

test(
  "a redirection out of an allowed read verb is denied, and the file is not created",
  async () => {
    // The headline of this gate: `cat *` is an ALLOW rule in the fixture above,
    // and `cat CLAUDE.md > pwned.txt` matches it. Before this gate existed the
    // write landed.
    const target = path.join(root, "project", "pwned.txt")
    const { denial } = await run("scout", "cat CLAUDE.md > pwned.txt")
    expect(denial, "no denial reached the model").toBeString()
    expect(denial).toContain("scout invariant:")
    expect(denial).toContain("redirects")
    // The assertion that would have failed before: the denial is not the point
    // if the write happened anyway.
    expect(existsSync(target), `${target} was created, so the gate did not hold`).toBe(false)
  },
  120_000,
)

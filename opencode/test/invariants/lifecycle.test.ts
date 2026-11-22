import { describe, expect, test } from "bun:test"
import { FleetLifecycle, messageText, type LifecycleHost } from "../../coder-fleet/lib/lifecycle.ts"

function fixture(valid = true) {
  const store = new Map<string, any>()
  const calls: [string, any][] = []
  const prompts: [string, string][] = []
  const session = { id: "child", parentID: "parent", agent: "coder", location: { directory: "/repo" } }
  let message = 0
  const host: LifecycleHost = {
    get: async () => session,
    context: async () => [
      { id: "brief", type: "user", text: "Board-Item: CF-1" },
      { id: `answer-${message}`, type: "assistant", content: [{ type: "text", text: "handoff" }] },
    ],
    prompt: async (id, text) => { prompts.push([id, text]) },
    read: async (key) => store.get(key),
    write: async (key, value) => { store.set(key, value) },
    board: async (action, input) => { calls.push([action, input]); return { valid, card: "CF-1", reason: "missing headings" } },
  }
  const lifecycle = new FleetLifecycle(host, new Set(["coder", "lead"]))
  return { lifecycle, session, calls, prompts, advance: () => message++ }
}

describe("OpenCode lifecycle", () => {
  test("reads the V2 stored message shapes", () => {
    expect(messageText({ id: "x", type: "user", text: "brief" })).toBe("brief")
    expect(messageText({ id: "x", type: "assistant", content: [{ type: "reasoning", text: "private" }, { type: "text", text: "result" }] })).toBe("result")
  })
  test("binds a child once, even under concurrent contexts", async () => {
    const f = fixture()
    await Promise.all([f.lifecycle.start("child"), f.lifecycle.start("child")])
    const starts = f.calls.filter(([action]) => action === "start")
    expect(starts).toHaveLength(1)
    expect(starts[0][1].prompt).toBe("Board-Item: CF-1")
  })
  test("a repeated completion is processed once", async () => {
    const f = fixture()
    await Promise.all([f.lifecycle.finish("child"), f.lifecycle.finish("child")])
    expect(f.calls.filter(([action]) => action === "finish")).toHaveLength(1)
    expect(f.prompts).toHaveLength(0)
  })
  test("a malformed handoff gets three corrections, then a failed-run report", async () => {
    const f = fixture(false)
    for (let i = 0; i < 4; i++) { await f.lifecycle.finish("child"); f.advance() }
    expect(f.prompts.map(([id]) => id)).toEqual(["child", "child", "child", "parent"])
    expect(f.prompts[3][1]).toContain("Do not treat the run as success")
  })
  test("the lead owes no subagent handoff", async () => {
    const f = fixture()
    f.session.agent = "lead"
    await f.lifecycle.finish("child")
    expect(f.calls).toHaveLength(0)
  })
})

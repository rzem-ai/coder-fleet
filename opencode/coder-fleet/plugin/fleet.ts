import { Plugin } from "@opencode/plugin"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { decide } from "../lib/scope.ts"
import { boardLifecycle, boardsBinary, runBoards } from "../lib/boards.ts"
import { FleetLifecycle } from "../lib/lifecycle.ts"
import { editorWriteRefused } from "../lib/editor-scope.ts"

/**
 * OpenCode V2 scope enforcement, skill preloads, board controls and native
 * session lifecycle integration. The board is a compiled subprocess; the
 * server plugin never imports Bun-only board modules into its own runtime.
 *
 * The first half puts the `handoff` and `glossary` bodies into every agent's
 * system prompt, so no agent has to discover them and every agent has the
 * contract before its first turn.
 *
 * The second half is scope enforcement, and only the part of it the
 * declarative permission rulesets cannot reach. The decision itself lives in
 * ../lib/scope.ts, which explains what that residue is. It lives outside this
 * directory because OpenCode loads every file in plugin/ as a plugin, and a
 * sibling directory is not scanned.
 *
 * 2.x loads a plugin from its default export, `Plugin.define({ id, setup })`,
 * and registers hooks on the domain that owns each operation. A 1.x plugin,
 * a function returning a hook map, fails to load on 2.x with one WARN line
 * and the session runs without it.
 *
 * The preload runs in `session.hook("context")`, which fires before every
 * model call of the agent loop, once per step of a multi-tool turn. The title
 * request has a hook of its own and never reaches this one, so the title
 * generator is not charged for the handoff contract. Everything below is paid
 * for on every step, hence reading the files once at setup.
 */

const SKILLS = ["handoff", "glossary"] as const

/** Strip the YAML frontmatter block a SKILL.md starts with. */
function body(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text)
  return (match ? text.slice(match[0].length) : text).trim()
}

export default Plugin.define({
  id: "coder-fleet",
  setup: async (ctx) => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skill")
    const directory = ctx.location.directory
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
    const binary = boardsBinary(root)
    const roles = new Set(["lead", "scout", "spec-writer", "spec-editor", "coder", "scripter", "reviewer", "ui-designer", "tech-writer", "tech-editor", "researcher", "fleet-steward"])
    const lifecycle = binary ? new FleetLifecycle({
      get: (sessionID) => ctx.session.get({ sessionID }),
      context: (sessionID) => ctx.session.context({ sessionID }),
      prompt: (sessionID, text) => ctx.session.prompt({ sessionID, text, delivery: "queue" }),
      read: (key) => ctx.storage.get(key),
      write: (key, value) => ctx.storage.set(key, value),
      board: (action, input) => boardLifecycle(binary, root, action, input),
    }, roles) : undefined

    /**
     * Throwing here DENIES the call. The thrown message reaches the model as
     * the tool result's error message, intact, so the message is the product:
     * it is what the agent reads before its next turn, which is why `decide`
     * writes instructions to an agent rather than log lines.
     *
     * The event names the agent making the call, and a subagent spawned into a
     * child session is named as itself rather than as the lead, which is what
     * makes a per-agent table expressible at all. The name comes with every
     * call, so there is nothing to look up and nothing to cache.
     *
     * Registered first, before anything in setup can fail: a setup that throws
     * fails the whole plugin, and the enforcement must not depend on the
     * preload's files being readable.
     */
    await ctx.tool.hook("execute.before", async (event) => {
      const args = event.input && typeof event.input === "object" ? (event.input as Record<string, unknown>) : undefined
      const session = await ctx.session.get({ sessionID: event.sessionID })
      let writeRoots: string[] | undefined
      if (binary && event.agent === "spec-writer") {
        const board = await boardLifecycle(binary, root, "info", { cwd: session.location.directory, sessionID: event.sessionID })
        if (board.available) writeRoots = [path.join(board.directory, "specs")]
      }
      const reason = decide({ agent: event.agent, tool: event.tool, args, directory: session.location.directory, writeRoots })
      if (reason) throw new Error(reason)
      if (["spec-editor", "tech-editor"].includes(event.agent)) {
        const messages = await ctx.session.context({ sessionID: event.sessionID })
        const brief = messages.find((message) => message.type === "user")
        const refused = editorWriteRefused(event.agent, event.tool, args, session.location.directory, brief?.type === "user" ? brief.text : "")
        if (refused) throw new Error(refused)
      }
      if (binary && event.tool === "subagent") {
        const resumed = typeof args?.sessionID === "string" ? await ctx.session.get({ sessionID: args.sessionID }) : undefined
        const agent = resumed?.agent ?? args?.agent
        if (typeof agent === "string") {
          const policy = await boardLifecycle(binary, root, "check", { cwd: session.location.directory, sessionID: event.sessionID, agent })
          if (policy.warning && args && typeof args.prompt === "string" && !args.prompt.includes(policy.warning)) args.prompt += `\n\n${policy.warning}`
        }
      }
    })

    // A vendored skill that cannot be read is said so on stderr, once, at
    // load, and in its place every agent's system prompt carries a note, so
    // the gap shows in the session that runs without that contract rather
    // than only in a log nobody reads. Scope enforcement is independent of
    // these files; handoff validation uses the board's compiled parser.
    const preloads: string[] = []
    for (const name of SKILLS) {
      const file = path.join(dir, name, "SKILL.md")
      try {
        const text = await readFile(file, "utf8")
        preloads.push(`<fleet-skill name="${name}" note="preloaded, not discovered">\n${body(text)}\n</fleet-skill>`)
      } catch (err) {
        const why = `fleet plugin: could not read the vendored ${name} skill at ${file}, so it is not preloaded: ${err}`
        console.error(why)
        preloads.push(`<fleet-skill name="${name}" note="missing">\n${why}\nThe fleet's ${name} contract is not in this session. Say so to the human in your final answer.\n</fleet-skill>`)
      }
    }

    // Append, never replace: the parts already there are OpenCode's own
    // system prompt, the agent's body and the project's instructions.
    await ctx.session.hook("context", async (event) => {
      if (!roles.has(event.agent)) return
      for (const text of preloads) event.system.push({ type: "text", text })
      const context = lifecycle ? await lifecycle.start(event.sessionID) : "Fleet board binary is unavailable. Board lifecycle hooks and handoff validation are inactive. Build opencode/boards and reinstall with CODER_FLEET_BOARDS_BIN, then restart OpenCode. Do not claim that board gates ran."
      if (context) event.system.push({ type: "text", text: context })
    })

    if (!binary || !lifecycle) return
    await ctx.tool.transform((editor) => {
      editor.namespace({ name: "fleet", description: "Fleet board and project controls" })
      editor.add({
        name: "control",
        description: "Run a deterministic fleet control: agents, status, where, board, focus, complete, challenge or prune. Args are literal argv words, never shell text. Complete runs the card gate after the lead has ticked proven criteria.",
        options: { namespace: "fleet", codemode: false },
        input: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["agents", "status", "where", "board", "focus", "complete", "challenge", "prune"] },
            args: { type: "array", items: { type: "string" } },
          },
          required: ["action"], additionalProperties: false,
        },
        execute: async (input, context) => {
          const { action, args = [] } = input as { action: string; args?: string[] }
          await ctx.permission.assert({ sessionID: context.sessionID, agent: context.agent, action: "fleet_control", resources: [action] })
          const session = await ctx.session.get({ sessionID: context.sessionID })
          if (action === "focus" || action === "complete") {
            if (args.length > 1) throw new Error(`${action} takes at most one card id`)
            const result = await boardLifecycle(binary, root, action, { cwd: session.location.directory, sessionID: context.sessionID, card: args[0] })
            return { content: JSON.stringify(result) }
          }
          const commands: Record<string, string[]> = {
            agents: ["fleet", "agents"], status: ["fleet", "status-lines"], where: ["where"], board: ["web"],
            challenge: ["fleet", "challenge-gate"], prune: ["fleet", "prune-worktrees"],
          }
          if (!commands[action]) throw new Error(`unknown fleet control: ${action}`)
          return { content: await runBoards(binary, root, session.location.directory, [...commands[action], ...args]) }
        },
      })
    })
    // One MCP server, owned by this plugin's installation. Native V2 resolves
    // its effective tool names as boards_card_*, not Claude's plugin prefix.
    await ctx.mcp.transform((editor) => {
      if (!editor.get("boards")) editor.set("boards", {
        type: "local", command: [binary, "mcp"],
        environment: { CODER_FLEET_PLUGIN_ROOT: root },
      })
    })
    await ctx.tool.hook("execute.after", async (event) => {
      if (event.status !== "completed" || event.tool !== "shell") return
      const args = event.input as { command?: string; workdir?: string }
      if (!args.command?.includes("push")) return
      const session = await ctx.session.get({ sessionID: event.sessionID })
      await boardLifecycle(binary, root, "push", {
        cwd: args.workdir ? path.resolve(session.location.directory, args.workdir) : session.location.directory,
        sessionID: event.sessionID, command: args.command,
      })
    })
    const controller = new AbortController()
    const events = ctx.event.subscribe({ signal: controller.signal })
    // Public events are server-wide. Check the session's location before
    // handling one, otherwise two project plugin instances act on one stop.
    const task = (async () => {
      for await (const event of events) {
        if (event.type !== "session.execution.succeeded") continue
        if (event.location?.directory !== directory) continue
        try { await lifecycle.finish(event.data.sessionID) }
        catch (error) { console.error("fleet lifecycle:", error) }
      }
    })().catch((error) => { if (!controller.signal.aborted) console.error("fleet events:", error) })
    return async () => { controller.abort(); await task }
  },
})

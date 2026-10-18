import { Plugin } from "@opencode/plugin"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { decide } from "../lib/scope.ts"

/**
 * The fleet plugin, on the OpenCode 2.x plugin API. Two halves that share
 * nothing but a file.
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
    await ctx.tool.hook("execute.before", (event) => {
      const args = event.input && typeof event.input === "object" ? (event.input as Record<string, unknown>) : undefined
      const reason = decide({ agent: event.agent, tool: event.tool, args, directory })
      if (reason) throw new Error(reason)
    })

    // A vendored skill that cannot be read is left out of the preload and said
    // so on stderr, once, at load. Agents then run without that contract and
    // answer in whatever shape they like, which nothing downstream validates;
    // the enforcement above is unaffected.
    const preloads: string[] = []
    for (const name of SKILLS) {
      const file = path.join(dir, name, "SKILL.md")
      try {
        const text = await readFile(file, "utf8")
        preloads.push(`<fleet-skill name="${name}" note="preloaded, not discovered">\n${body(text)}\n</fleet-skill>`)
      } catch (err) {
        console.error(`fleet plugin: could not read the vendored ${name} skill at ${file}, so it is not preloaded: ${err}`)
      }
    }

    // Append, never replace: the parts already there are OpenCode's own
    // system prompt, the agent's body and the project's instructions.
    await ctx.session.hook("context", (event) => {
      for (const text of preloads) event.system.push({ type: "text", text })
    })
  },
})

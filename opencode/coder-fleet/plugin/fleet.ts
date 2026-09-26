import type { Plugin } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { decide } from "../lib/scope.ts"

/**
 * The fleet plugin. Two halves that share nothing but a file.
 *
 * The first half puts the `handoff` and `glossary` bodies into every agent's
 * system prompt, so no agent has to discover them and every agent has the
 * contract before its first turn.
 *
 * The second half is scope enforcement, and only the part of it the
 * declarative `permission` rulesets cannot reach. The decision itself lives in
 * ../lib/scope.ts, which explains both what that residue is and why it cannot
 * live in this file.
 *
 * Two things about the preload hook were measured rather than assumed, in
 * docs/measurements/phase-0-spike.md:
 *
 * - APPEND to `output.system`, never replace. `prepare` builds `system` as a
 *   single joined string and then rewrites it at
 *   packages/opencode/src/session/llm/request.ts:77 when `system.length > 2`.
 *   That rewrite joins the appended elements rather than discarding them, so
 *   two appends survive it. Assigning `output.system = [...]` would not.
 *
 * - `sessionID` is optional and is genuinely absent sometimes:
 *   packages/opencode/src/agent/agent.ts:381 triggers this hook from
 *   `Agent.generate`, which has no session. Nothing here may depend on it.
 *
 * The hook also fires once per step of a multi-tool turn, not once per session,
 * so everything below is paid for on every request. Hence reading the files at
 * init.
 */

const SKILLS = ["handoff", "glossary"] as const

/** Strip the YAML frontmatter block a SKILL.md starts with. */
function body(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text)
  return (match ? text.slice(match[0].length) : text).trim()
}

/**
 * The title generator is a separate, tiny request OpenCode makes on its own
 * path, and preloading the handoff contract into a thread-title prompt is pure
 * waste. There is no flag distinguishing it: `inputKeys` is exactly
 * ["sessionID", "model"]. The only discriminator available is the content of
 * the prompt itself.
 *
 * This is a string match against an upstream prompt (packages/opencode/src/
 * agent/prompt/title.txt) and it will stop matching, silently, the day that
 * prompt is reworded. The failure is a larger bill rather than a broken run,
 * which is why it is acceptable at all. Registered as fragile.
 */
const TITLE_PROMPT_PREFIX = "You are a title generator."

export const FleetPlugin: Plugin = async ({ client, directory }) => {
  const dir = path.join(import.meta.dir, "..", "skill")

  const preloads = await Promise.all(
    SKILLS.map(async (name) => {
      const file = path.join(dir, name, "SKILL.md")
      const text = await readFile(file, "utf8").catch((err) => {
        // Loud rather than quiet. An agent silently missing the handoff
        // contract still answers, it just answers in the wrong shape, and
        // nothing downstream validates the shape.
        throw new Error(`fleet plugin: could not read the vendored ${name} skill at ${file}: ${err}`)
      })
      return `<fleet-skill name="${name}" note="preloaded, not discovered">\n${body(text)}\n</fleet-skill>`
    }),
  )

  /**
   * Which agent is about to make this call.
   *
   * Looked up on EVERY call, with no cache. That is deliberate and it was
   * demonstrated rather than argued (docs/measurements/phase-0-spike.md,
   * question 2): a session's agent is mutable - `setAgentModel` re-patches it
   * from prompt.ts:679 whenever it changes - and a cache keyed on `sessionID`
   * was caught returning `build` for a session that had become `spike-alt`.
   * In this plugin that is one agent's rules applied to another agent's
   * command, silently, with enforcement reporting success. The lookup is
   * 0.65ms at p50 over 50 calls, so there is no performance case for the
   * optimisation that produces it. Do not add a cache.
   *
   * A task-spawned subagent gets its own session and `.agent` on it is the
   * subagent's own name, which is what makes a per-agent table expressible at
   * all.
   */
  const agentFor = async (sessionID: string): Promise<string | undefined> => {
    try {
      const res: any = await client.session.get({ path: { id: sessionID } })
      return (res?.data ?? res)?.agent
    } catch (err) {
      // Fail open, and say so. The fleet's hook fails open too and states the
      // cost; the cost here is the same and larger, because the port has no
      // sandbox underneath. A silent allow would be the failure this whole
      // half exists to prevent, so it is at least loud.
      console.error(`fleet plugin: could not resolve the agent for session ${sessionID}, allowing the call: ${err}`)
      return undefined
    }
  }

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      if (output.system[0]?.startsWith(TITLE_PROMPT_PREFIX)) return
      output.system.push(...preloads)
    },

    /**
     * Throwing here DENIES the call, and the thrown `Error.message` reaches the
     * model verbatim - no wrapper, no prefix, no truncation, confirmed
     * byte-for-byte in phase-0-spike.md question 3. So the message is the
     * product: it is what the agent reads before its next turn, which is why
     * `decide` writes instructions to an agent rather than log lines.
     */
    "tool.execute.before": async (input, output) => {
      const agent = await agentFor(input.sessionID)
      if (!agent) return
      const reason = decide({ agent, tool: input.tool, args: output.args, directory })
      if (reason) throw new Error(reason)
    },
  }
}

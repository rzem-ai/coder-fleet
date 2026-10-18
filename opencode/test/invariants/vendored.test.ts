/**
 * The vendored skills have not drifted from their sources.
 *
 * Seven skills are vendored under coder-fleet/skill/ as copies of
 * claude/coder-fleet/skills/ (spec decision 8), and nothing kept them in step:
 * by 2026-10-18 four of them had fallen behind their sources, one by a whole
 * section, while the register still called two of them verbatim. This makes
 * drift a red test. Every line of a source skill must appear verbatim in its
 * copy, or be listed below as a known divergence that the register explains.
 * The repo never hard-wraps prose, so a line is a paragraph, a table row or a
 * list item. The glossary is compared on its Term and Meaning cells only,
 * because its Maps to column is OpenCode's by design.
 *
 * A divergence is keyed by a hash of the whole source line, so an upstream
 * edit to a line the port changed still fails here: re-sync it, then update
 * its hash. An entry whose source line is gone fails too, so the list cannot
 * outlive what it describes. `migration-checklist` is deferred whole (see its
 * register row) and is not checked.
 *
 * Run with: bun test test/invariants/vendored.test.ts
 */

import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

const PORT = path.join(import.meta.dir, "..", "..", "coder-fleet", "skill")
const SOURCE = path.join(import.meta.dir, "..", "..", "..", "claude", "coder-fleet", "skills")

/** Source lines the port changes on purpose, as [hash of the line, its start]. */
const DIVERGENT: Record<string, [string, string][]> = {
  "glossary": [
    ["a83264e1250e212a", "Canonical copy. `claude/coder-fleet/templates/rules/glossary"],
    ["d68840986610a8d8", " Handoff | The structured result a subagent returns. Always "],
    ["87565d67a9be4386", " Memory | What one agent keeps for its own later runs in thi"],
    ["77b5621d4c09c360", "Of the typed Decisions needed lines, only `Blocker:` reaches"],
    ["af9200f1d1c0dc24", "Board columns are written by hooks, never by an agent decidi"],
  ],
  "handoff": [
    ["e0f3aab6951bbf6f", "If your spawn gave you an output schema, finish by calling S"],
    ["fecbdc574c8c52b3", "Every line under Decisions needed carries one of exactly two"],
    ["124915c771e58edc", "- `- Blocker: ` - a question only the human can answer, with"],
    ["fb7d2f6bd65f4425", "- `- Propose item: ` - suggested new board work. The lead fi"],
    ["7d3a60bc4bdb7cba", "Anchor: `^- (Blocker|Propose item): `."],
    ["78d6a45697e63362", "There is no third prefix and an untyped line is invalid. Wha"],
    ["da87e35f9d6f4736", "A typed line belongs under `## Decisions needed` and nowhere"],
    ["7bfb1175dfafd374", "Both parsers anchor on the start of a line, so naming a pref"],
    ["640d4a71e1e0639b", "The harness sends `SubagentStop` no status field - not `succ"],
    ["766c5b215822ca08", "- Rate limiting on the endpoint, the card's third acceptance"],
    ["7c411115444452d4", "- Read main...feature/refresh against docs/specs/AUTH-3.md a"],
    ["81cd2ab138441179", "- Blocker: The card caps a session at 7 days and the spec at"],
  ],
  "compound": [
    ["1291617ef16990f9", "| A repeatable procedure, multi-step, worth following again "],
    ["bd2b3b4f021d9f30", "| A durable decision about the work, and why, that one agent"],
    ["a81cb6a6d1a193f1", "The second commonest is writing a memory that is really a ru"],
    ["d62c75b614db2478", "When a board comment was too long for the card, the hook wro"],
    ["47b2805b21db7fce", "Nothing prunes that directory and nothing backs it up. A run"],
    ["b339159caa7c8329", "4. For each survivor, search `.claude/rules/`, the skills di"],
    ["ae6f1c55d8e989ce", "6. Record it in the handoff - what you wrote goes under Done"],
  ],
  "run-article": [
    ["1b4fc04fd0074c8b", "`SubagentStop` posts the `## Done` items as a comment on the"],
    ["1f010ce994a1ffc7", "An archive under `~/.local/state/coder-fleet/archives/` is a"],
  ],
  "looping": [
    ["6d764f6909fdc6c0", "Decide how much you will run before you run anything, and wr"],
  ],
  "humanize": [
  ],
}

function lines(text: string): string[] {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "").split("\n").filter((l) => l.trim())
}

/** A glossary table row reduced to its Term and Meaning cells. */
function cells(line: string): string {
  return line.startsWith("| ") ? line.split("|").slice(1, 3).join("|") : line
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16)

describe("every vendored skill matches its source, except where the register says why", () => {
  for (const [skill, divergent] of Object.entries(DIVERGENT)) {
    test(skill, () => {
      const norm = skill === "glossary" ? cells : (l: string) => l
      const source = lines(readFileSync(path.join(SOURCE, skill, "SKILL.md"), "utf8")).map(norm)
      const port = new Set(lines(readFileSync(path.join(PORT, skill, "SKILL.md"), "utf8")).map(norm))
      const known = new Set(divergent.map(([h]) => h))
      const drifted = source.filter((l) => !port.has(l) && !known.has(hash(l))).map((l) => l.slice(0, 120))
      expect(drifted, `${skill}: these source lines are not in the vendored copy. Re-sync them, or register the divergence and list its hash`).toEqual([])
      const present = new Set(source.map(hash))
      const stale = divergent.filter(([h]) => !present.has(h)).map(([h, start]) => `${h} ${start}`)
      expect(stale, `${skill}: these divergences name a source line that no longer exists. Re-sync the copy and drop the entry`).toEqual([])
    })
  }

  test("humanize's references are byte-for-byte copies", () => {
    const dir = path.join(SOURCE, "humanize", "references")
    const differ = readdirSync(dir)
      .filter((f) => statSync(path.join(dir, f)).isFile())
      .filter((f) => readFileSync(path.join(dir, f), "utf8") !== readFileSync(path.join(PORT, "humanize", "references", f), "utf8"))
    expect(differ).toEqual([])
  })
})

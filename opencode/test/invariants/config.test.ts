import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const ROOT = path.join(import.meta.dir, "..", "..", "coder-fleet")
for (const file of ["opencode.json", "template/opencode.json"]) {
  describe(file, () => {
    const config = JSON.parse(readFileSync(path.join(ROOT, file), "utf8"))
    test("inherits the selected provider and model without installing a provider", () => {
      expect(config.model).toBeUndefined()
      expect(config.providers).toBeUndefined()
      expect(config.default_agent).toBe("lead")
      expect(config.instructions).toEqual([".opencode/rules/*.md"])
    })
    test("contains no legacy configuration keys", () => {
      for (const key of ["provider", "permission", "plugin", "subagent_depth", "agent", "mode"]) {
        expect(key in config).toBe(false)
      }
    })
  })
}

test("agents and commands do not override the human's selected model", () => {
  for (const dir of ["agent", "command"]) {
    for (const file of readdirSync(path.join(ROOT, dir)).filter((name) => name.endsWith(".md"))) {
      const text = readFileSync(path.join(ROOT, dir, file), "utf8")
      const frontmatter = text.split("---")[1]
      expect(frontmatter, `${dir}/${file}`).not.toMatch(/^model:/m)
    }
  }
})

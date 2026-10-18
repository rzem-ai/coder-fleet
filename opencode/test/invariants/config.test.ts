/**
 * The port's two opencode.json files are in OpenCode 2.x's own config shape.
 *
 * 2.x still reads a 1.x config, through a normaliser that renames what it can
 * and drops what it cannot with one WARN line nobody reads: `subagent_depth`
 * and a model's `attachment` are simply gone, and a model with no `input`
 * capabilities is assumed to take images. So the files are written in the 2.x
 * keys and nothing here may need the normaliser. rulesets.test.ts proves the
 * repository's file decodes with no diagnostic on a real 2.x server; this
 * checks both files' keys without one.
 *
 * Run with: bun test test/invariants/config.test.ts
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const REPO = path.join(import.meta.dir, "..", "..")
const FILES = ["coder-fleet/opencode.json", "coder-fleet/template/opencode.json"]

/** The 1.x keys the normaliser rewrites or drops. */
const LEGACY_TOP = ["provider", "permission", "plugin", "subagent_depth", "agent", "mode"]
const LEGACY_PROVIDER = ["npm", "options"]
const LEGACY_MODEL = ["tool_call", "attachment", "reasoning", "temperature", "modalities"]

for (const file of FILES) {
  describe(file, () => {
    const config = JSON.parse(readFileSync(path.join(REPO, file), "utf8"))

    test("carries no 1.x key", () => {
      expect(LEGACY_TOP.filter((k) => k in config)).toEqual([])
      for (const [id, provider] of Object.entries<any>(config.providers ?? {})) {
        expect(LEGACY_PROVIDER.filter((k) => k in provider), `provider ${id}`).toEqual([])
        for (const [mid, model] of Object.entries<any>(provider.models ?? {})) {
          expect(LEGACY_MODEL.filter((k) => k in model), `model ${id}/${mid}`).toEqual([])
        }
      }
    })

    test("names the model as an object and every permission as a rule", () => {
      expect(config.model).toEqual({ providerID: "trillian", model: "qwen3-coder-next" })
      expect(config.permissions).toBeArray()
      for (const rule of config.permissions) {
        expect(Object.keys(rule).sort()).toEqual(["action", "effect", "resource"])
        expect(["allow", "ask", "deny"]).toContain(rule.effect)
      }
    })

    test("states each model's inputs, so only the vision model is sent images", () => {
      const models = config.providers.trillian.models
      expect(models["qwen3-coder-next"].capabilities.input).toEqual(["text"])
      expect(models["qwen3.8-27b"].capabilities.input).toEqual(["text", "image"])
    })
  })
}

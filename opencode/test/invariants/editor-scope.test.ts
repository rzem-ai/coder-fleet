import { expect, test } from "bun:test"
import { editorWriteRefused } from "../../coder-fleet/lib/editor-scope.ts"
import { decide } from "../../coder-fleet/lib/scope.ts"

const brief = 'Edit-Paths: ["/repo/README.md"]'
test("an editor needs a named document and cannot patch a second file", () => {
  expect(editorWriteRefused("tech-editor", "edit", { path: "README.md" }, "/repo", brief)).toBeUndefined()
  expect(editorWriteRefused("tech-editor", "edit", { path: "README.md" }, "/repo", "missing")).toContain("requires")
  expect(editorWriteRefused("tech-editor", "edit", { path: "src/a.ts" }, "/repo", brief)).toContain("only")
  expect(editorWriteRefused("tech-editor", "write", { path: "README.md" }, "/repo", brief)).toContain("existing")
  expect(editorWriteRefused("tech-editor", "patch", { patchText: "*** Begin Patch\n*** Update File: README.md\n@@\n-a\n+b\n*** Add File: other.md\n+x\n*** End Patch" }, "/repo", brief)).toContain("only")
})
test("scripter inherits coder's force-push guard", () => {
  expect(decide({ agent: "scripter", tool: "shell", args: { command: "env git push origin HEAD --force" }, directory: "/repo" })).toContain("force-push")
})
test("trusted board roots replace the fallback spec directory", () => {
  const context = { agent: "spec-writer", tool: "write", directory: "/repo", writeRoots: ["/config/boards/CF/specs"] }
  expect(decide({ ...context, args: { path: "/config/boards/CF/specs/CF-1.md" } })).toBeUndefined()
  expect(decide({ ...context, args: { path: "docs/specs/CF-1.md" } })).toContain("outside")
})

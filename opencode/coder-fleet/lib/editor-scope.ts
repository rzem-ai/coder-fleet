import path from "node:path"
import { patchTargets } from "./scope.ts"

/** The lead explicitly names the documents an editor may change. */
export function editorWriteRefused(agent: string, tool: string, args: Record<string, unknown> | undefined, directory: string, brief: string): string | undefined {
  if (!["spec-editor", "tech-editor"].includes(agent) || !["edit", "write", "patch", "apply_patch"].includes(tool)) return
  const line = /^Edit-Paths: (.+)$/m.exec(brief)
  let allowed: unknown
  try { allowed = JSON.parse(line?.[1] ?? "") } catch {}
  if (!Array.isArray(allowed) || !allowed.length || !allowed.every((file) => typeof file === "string" && path.isAbsolute(file))) {
    return `${agent} requires an Edit-Paths: JSON array of absolute document paths in the lead's brief. No edit was made.`
  }
  if (tool === "write" || (typeof args?.patchText === "string" && /^\*\*\* (?:Add File|Delete File|Move to): /m.test(args.patchText))) {
    return `${agent} may only edit existing documents, never create, delete, rename or replace a whole file with write.`
  }
  const targets = typeof args?.patchText === "string" ? patchTargets(args.patchText).paths : [args?.path ?? args?.filePath].filter((file): file is string => typeof file === "string")
  if (!targets.length || targets.some((file) => !allowed.includes(path.resolve(directory, file)))) {
    return `${agent} may edit only the documents named by Edit-Paths in the lead's brief. No edit was made.`
  }
}

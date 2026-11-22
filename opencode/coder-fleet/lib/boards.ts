import { execFile } from "node:child_process"
import { accessSync, constants } from "node:fs"
import path from "node:path"

/** Only compiled binaries are run. Never execute source in a target project. */
export function boardsBinary(root: string, env = process.env): string | undefined {
  const name = `boards-${process.platform}-${process.arch}`
  const checkout = path.basename(root) === "coder-fleet" ? path.join(root, "..", "boards", "bin", name) : undefined
  const candidates = env.CODER_FLEET_BOARDS_BIN ? [env.CODER_FLEET_BOARDS_BIN] : [path.join(root, "bin", name), checkout]
  return candidates.find((file): file is string => {
    if (!file) return false
    try { accessSync(file, constants.X_OK); return true } catch { return false }
  })
}

export function runBoards(binary: string, root: string, cwd: string, args: string[], input?: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(binary, args, {
      cwd,
      env: { ...process.env, PWD: cwd, CODER_FLEET_PLUGIN_ROOT: root, CODER_FLEET_PROJECT_DIR: cwd },
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) reject(new Error(`boards ${args.join(" ")}: ${stderr.trim() || error.message}`))
      else resolve(stdout)
    })
    child.stdin?.end(input === undefined ? undefined : JSON.stringify(input))
  })
}

export async function boardLifecycle(binary: string, root: string, action: string, input: { cwd: string; sessionID: string; [key: string]: unknown }): Promise<Record<string, any>> {
  return JSON.parse(await runBoards(binary, root, input.cwd, ["opencode", action], input))
}

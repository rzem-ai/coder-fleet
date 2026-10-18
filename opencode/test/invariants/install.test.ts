/**
 * install-project.sh installs a tagged payload with `--ref`, and every install
 * says which version it put down in `.opencode/.coder-fleet-version`.
 *
 * The tagged route must install what the tag holds, not what the checkout
 * running the script holds, so the fixture is a scratch git repository whose
 * tag carries a marker the working tree does not. `CODER_FLEET_REPO` points
 * the script at it instead of GitHub, which keeps the test off the network.
 *
 * Run with: bun test test/invariants/install.test.ts
 */

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const PORT = path.join(import.meta.dir, "..", "..")
const SCRIPT = path.join(PORT, "scripts", "install-project.sh")
const MARKER = "TAGGED-PAYLOAD-MARKER"

// One install copies every payload file with its own cp, a couple of seconds
// each, and the longest test runs three.
setDefaultTimeout(60_000)

let root = ""
let fixture = ""
let tagged = ""
let bare = ""

/** The environment with every GIT_* variable removed, so a hook's GIT_DIR cannot redirect a fixture command. */
function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_") && v !== undefined) env[k] = v
  return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", ...extra }
}

function git(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "init.defaultBranch=main", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], { cwd, env: cleanEnv() })
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`)
  return r.stdout.toString().trim()
}

function install(args: string[], env: Record<string, string> = {}) {
  const r = Bun.spawnSync(["bash", SCRIPT, ...args], { env: cleanEnv({ CODER_FLEET_REPO: `file://${fixture}`, ...env }) })
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}

function project(name: string): string {
  const dir = path.join(root, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

function stamp(dir: string): Record<string, string> {
  const text = readFileSync(path.join(dir, ".coder-fleet-version"), "utf8")
  return Object.fromEntries(text.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "fleet-install-")))
  fixture = path.join(root, "repo")
  mkdirSync(path.join(fixture, "opencode"), { recursive: true })
  cpSync(path.join(PORT, "coder-fleet"), path.join(fixture, "opencode", "coder-fleet"), { recursive: true })
  git(fixture, "init", "-q", ".")
  git(fixture, "add", "-A")
  git(fixture, "commit", "-q", "-m", "payload")
  appendFileSync(path.join(fixture, "opencode", "coder-fleet", "agent", "coder.md"), `\n${MARKER}\n`)
  git(fixture, "commit", "-q", "-am", "tagged payload")
  git(fixture, "tag", "-a", "v9.9.9", "-m", "v9.9.9")
  tagged = git(fixture, "rev-parse", "v9.9.9^{commit}")
  // Back on main, the marker is gone again, so a test that reads the branch
  // tip instead of the tag fails.
  git(fixture, "revert", "--no-edit", "HEAD")

  bare = path.join(root, "empty-repo")
  mkdirSync(bare)
  writeFileSync(path.join(bare, "README"), "no payload here\n")
  git(bare, "init", "-q", ".")
  git(bare, "add", "-A")
  git(bare, "commit", "-q", "-m", "no payload")
  git(bare, "tag", "v1.0.0")
})

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

describe("install-project.sh --ref", () => {
  test("installs the payload the tag holds, not the working tree's", () => {
    const dir = project("tagged")
    const r = install(["--ref", "v9.9.9", dir])
    expect(r.code, r.err).toBe(0)
    expect(readFileSync(path.join(dir, ".opencode", "agent", "coder.md"), "utf8")).toContain(MARKER)
    expect(readFileSync(path.join(PORT, "coder-fleet", "agent", "coder.md"), "utf8")).not.toContain(MARKER)
    for (const part of ["agent", "command", "skill", "plugin", "lib", "template"]) {
      expect(existsSync(path.join(dir, ".opencode", part)), part).toBe(true)
    }
    expect(existsSync(path.join(dir, "opencode.json"))).toBe(true)
  })

  test("stamps the ref, the commit it resolved to and the source", () => {
    const dir = project("stamped")
    expect(install(["--ref", "v9.9.9", dir]).code).toBe(0)
    expect(stamp(path.join(dir, ".opencode"))).toEqual({ ref: "v9.9.9", commit: tagged, source: `file://${fixture}` })
  })

  test("a ref the repository does not have fails and installs nothing", () => {
    const dir = project("missing-ref")
    const r = install(["--ref", "v0.0.0-nope", dir])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain("v0.0.0-nope")
    expect(existsSync(path.join(dir, ".opencode"))).toBe(false)
    expect(existsSync(path.join(dir, "opencode.json"))).toBe(false)
  })

  test("a ref with no OpenCode payload fails and installs nothing", () => {
    const dir = project("no-payload")
    const r = install(["--ref", "v1.0.0", dir], { CODER_FLEET_REPO: `file://${bare}` })
    expect(r.code).not.toBe(0)
    expect(r.err).toContain("no OpenCode payload")
    expect(existsSync(path.join(dir, ".opencode"))).toBe(false)
  })

  test("--ref needs a value", () => {
    const r = install(["--ref"])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain("--ref")
  })

  test("a dry run writes no stamp", () => {
    const dir = project("dry")
    expect(install(["--dry-run", "--ref", "v9.9.9", dir]).code).toBe(0)
    expect(existsSync(path.join(dir, ".opencode"))).toBe(false)
  })

  test("--global puts the stamp in the global config directory", () => {
    const config = project("global-config")
    expect(install(["--global", "--ref", "v9.9.9"], { OPENCODE_CONFIG_DIR: config }).code).toBe(0)
    expect(stamp(config).ref).toBe("v9.9.9")
    expect(readFileSync(path.join(config, "agent", "coder.md"), "utf8")).toContain(MARKER)
  })
})

describe("what install-project.sh refuses", () => {
  test("credentials in a repository URL that cannot be fetched are never echoed", () => {
    const dir = project("credentials-fail")
    const r = install(["--ref", "v9.9.9", dir], { CODER_FLEET_REPO: "https://fleet-user:s3cr3t-token@127.0.0.1:1/coder-fleet.git" })
    expect(r.code).not.toBe(0)
    expect(r.err).toContain("https://127.0.0.1:1/coder-fleet.git")
    expect(r.out + r.err).not.toContain("s3cr3t-token")
    expect(r.out + r.err).not.toContain("fleet-user")
    expect(existsSync(path.join(dir, ".opencode"))).toBe(false)
  })

  test("credentials in a repository URL never reach the stamp or the output of a good install", () => {
    const dir = project("credentials-ok")
    const url = "https://fleet-user:s3cr3t-token@example.invalid/coder-fleet.git"
    // git rewrites the credentialed URL to the fixture, so the clone succeeds
    // while the script only ever sees the credentialed form.
    const r = install(["--ref", "v9.9.9", dir], {
      CODER_FLEET_REPO: url,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.file://${fixture}.insteadOf`,
      GIT_CONFIG_VALUE_0: url,
    })
    expect(r.code, r.err).toBe(0)
    const written = readFileSync(path.join(dir, ".opencode", ".coder-fleet-version"), "utf8")
    for (const secret of ["s3cr3t-token", "fleet-user"]) {
      expect(written).not.toContain(secret)
      expect(r.out + r.err).not.toContain(secret)
    }
    expect(stamp(path.join(dir, ".opencode")).source).toBe("https://example.invalid/coder-fleet.git")
  })

  test("a symlinked stamp path is refused, its target untouched, nothing installed", () => {
    const dir = project("symlink-stamp")
    const victim = path.join(root, "victim-stamp.txt")
    writeFileSync(victim, "original\n")
    mkdirSync(path.join(dir, ".opencode"))
    symlinkSync(victim, path.join(dir, ".opencode", ".coder-fleet-version"))
    const r = install(["--ref", "v9.9.9", dir])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain("symlink")
    expect(readFileSync(victim, "utf8")).toBe("original\n")
    expect(existsSync(path.join(dir, ".opencode", "agent"))).toBe(false)
  })

  test("a symlinked payload directory is refused and its target stays empty", () => {
    const dir = project("symlink-agent")
    const elsewhere = path.join(root, "elsewhere-agent")
    mkdirSync(elsewhere)
    mkdirSync(path.join(dir, ".opencode"))
    symlinkSync(elsewhere, path.join(dir, ".opencode", "agent"))
    const r = install([dir])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain("symlink")
    expect(readdirSync(elsewhere)).toEqual([])
  })

  test("a symlinked payload file is refused and its target untouched", () => {
    const dir = project("symlink-file")
    const victim = path.join(root, "victim-file.txt")
    writeFileSync(victim, "original\n")
    mkdirSync(path.join(dir, ".opencode", "agent"), { recursive: true })
    symlinkSync(victim, path.join(dir, ".opencode", "agent", "coder.md"))
    const r = install(["--update", dir])
    expect(r.code).not.toBe(0)
    expect(readFileSync(victim, "utf8")).toBe("original\n")
  })

  test("a symlinked .opencode is refused", () => {
    const dir = project("symlink-dest")
    const elsewhere = path.join(root, "elsewhere-dest")
    mkdirSync(elsewhere)
    symlinkSync(elsewhere, path.join(dir, ".opencode"))
    const r = install([dir])
    expect(r.code).not.toBe(0)
    expect(readdirSync(elsewhere)).toEqual([])
  })

  test("a dangling opencode.json symlink is refused and its target not created", () => {
    const dir = project("symlink-config")
    const target = path.join(root, "created-by-config.json")
    symlinkSync(target, path.join(dir, "opencode.json"))
    const r = install([dir])
    expect(r.code).not.toBe(0)
    expect(existsSync(target)).toBe(false)
  })
})

describe("the version stamp", () => {
  test("a working-tree install stamps itself as one", () => {
    const dir = project("working-tree")
    expect(install([dir]).code).toBe(0)
    const s = stamp(path.join(dir, ".opencode"))
    expect(s.ref).toBe("working-tree")
    expect(s.source).toBe(path.join(PORT, "coder-fleet"))
    expect(readFileSync(path.join(dir, ".opencode", "agent", "coder.md"), "utf8")).not.toContain(MARKER)
  })

  test("a later install replaces the stamp, and names the files it kept", () => {
    const dir = project("upgrade")
    expect(install([dir]).code).toBe(0)
    const r = install(["--ref", "v9.9.9", dir])
    expect(r.code).toBe(0)
    // coder.md differs between the two payloads and is kept without --update,
    // so the stamp says the install is mixed.
    expect(stamp(path.join(dir, ".opencode"))).toEqual({ ref: "v9.9.9", commit: tagged, source: `file://${fixture}`, kept: "1" })
    expect(install(["--update", "--ref", "v9.9.9", dir]).code).toBe(0)
    expect(stamp(path.join(dir, ".opencode")).kept).toBeUndefined()
    expect(readFileSync(path.join(dir, ".opencode", "agent", "coder.md"), "utf8")).toContain(MARKER)
  })
})

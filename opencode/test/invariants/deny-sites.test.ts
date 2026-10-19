/**
 * Every `return deny(` site in coder-fleet/lib/scope.ts has a live case.
 *
 * live.test.ts proves each denial end to end through a running OpenCode, but
 * only for the sites its cases reach, and a new site added without a case
 * would pass there unseen. This test needs no binary, so the unit suite runs
 * it: it numbers every `return deny(` in a copy of scope.ts, runs every case
 * in live-cases.ts through that copy's `decide`, and fails naming each site
 * no case reached.
 *
 * Run with: opencode/test/run.sh unit
 */

import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { CASES } from "./live-cases.ts"

const SCOPE = path.join(import.meta.dir, "..", "..", "coder-fleet", "lib", "scope.ts")
const SITE = "return deny("
const scratch = mkdtempSync(path.join(tmpdir(), "fleet-deny-sites-"))

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

test("every return deny( site in scope.ts is reached by a live case", async () => {
  const source = readFileSync(SCOPE, "utf8")
  const parts = source.split(SITE)
  const sites = parts.length - 1
  expect(sites, "scope.ts has no deny sites, so this test checks nothing").toBeGreaterThan(0)

  // Each site records its number before it denies. `Set.add` returns the set,
  // so `return hit.add(n) && deny(...)` still returns the denial message.
  const lines: number[] = []
  let line = 1
  let instrumented = parts[0]!
  for (let i = 1; i < parts.length; i++) {
    line += parts[i - 1]!.split("\n").length - 1
    lines.push(line)
    instrumented += `return (globalThis as any).__fleetDenySites.add(${i - 1}) && deny(` + parts[i]
  }
  const copy = path.join(scratch, "scope.ts")
  writeFileSync(copy, instrumented)
  const hit = new Set<number>()
  ;(globalThis as any).__fleetDenySites = hit
  const { decide } = await import(copy)

  for (const c of CASES) {
    // live.test.ts fills HOME_DIR in once its fixture exists; any home will do here.
    const args = Object.fromEntries(Object.entries(c.args).map(([k, v]) => [k, typeof v === "string" ? v.replace("HOME_DIR", "/home/u") : v]))
    const reason = decide({ agent: c.agent, tool: c.tool, args, directory: "/repo" })
    expect(reason, `${c.agent} ${c.tool} ${JSON.stringify(c.args).slice(0, 80)} is not denied`).toBeString()
  }

  const missed = lines.flatMap((l, n) => (hit.has(n) ? [] : [`scope.ts:${l}`]))
  expect(missed, `deny sites with no case in live-cases.ts: ${missed.join(", ")}`).toEqual([])
})

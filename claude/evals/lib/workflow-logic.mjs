#!/usr/bin/env node
//
// workflow-logic.mjs - run the real workflow scripts with stubbed agents.
//
// The three workflow bugs the September 2026 review found were all in
// branching and aggregation, not in prompts: a claim promoted to verified by
// two agents failing to answer, a typo'd stage walking past the approval gate,
// and a fix round whose commits went somewhere the next round never looked.
// None of them needs a model to reproduce, and none of them would be caught by
// the handoff formatting suite.
//
// So the scripts are executed for real, with `agent`, `parallel`, `pipeline`,
// `phase` and `log` supplied as deterministic stubs. What this proves is the
// control flow. What it cannot prove is the native loader's behaviour -
// agentType resolution, skill loading, worktree base, the shape of a structured
// result - which stays a live integration check.
//
// Usage:  node evals/lib/workflow-logic.mjs [-v]

import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const VERBOSE = process.argv.includes('-v')
const HARNESS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PLUGIN_ROOT = join(HARNESS_ROOT, 'coder-fleet')
const WORKFLOWS = join(PLUGIN_ROOT, 'workflows')

let passed = 0
let failed = 0

function check(name, requirement, ok, detail) {
  if (ok) {
    passed += 1
    if (VERBOSE) console.log(`  ok    ${name.padEnd(34)} ${requirement}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name.padEnd(34)} ${requirement}`)
    if (detail !== undefined) console.log(`        got: ${JSON.stringify(detail)}`)
  }
}

// Run a workflow script with stubbed primitives. `respond` receives the prompt
// and the options and returns whatever that agent call should resolve to;
// returning null models a stopped or failed call, which is a documented result.
async function runWorkflow(file, args, respond) {
  const calls = []
  // new Function on file contents is the point of this harness, not an
  // oversight: the thing under test is the workflow script itself, and it uses
  // top-level `return`, so it only parses inside a function body the way the
  // real loader wraps it. The only string interpolated is a file read from this
  // repository's own claude/coder-fleet/workflows directory. Never point this at a
  // path that comes from anywhere else.
  const src = readFileSync(join(WORKFLOWS, file), 'utf8').replace(/^export const meta/m, 'const meta')
  const body = new Function(
    'agent',
    'parallel',
    'pipeline',
    'phase',
    'log',
    'args',
    `return (async () => {${src}})()`,
  )
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts })
    return respond(prompt, opts, calls)
  }
  const parallel = async (fns) => Promise.all(fns.map((f) => (typeof f === 'function' ? f() : f)))
  // pipeline(items, stage, then) - `then` receives the first stage's result and
  // the original item, so an angle can carry its own name into stage two.
  const pipeline = async (items, stage, then) =>
    Promise.all(
      (items || []).map(async (item) => {
        const first = await stage(item)
        return then ? then(first, item) : first
      }),
    )
  const logs = []
  const result = await body(agent, parallel, pipeline, () => {}, (m) => logs.push(String(m)), args)
  return { result, calls, logs }
}

console.log('\ndeep-research: a check that did not happen is not a vote in favour')

// Run the real cross-check with a fixed vote per lens. `null` models a stopped
// or failed agent call, which is a documented workflow result.
async function crossCheck(votes) {
  let i = 0
  let synthesis = ''
  const { result } = await runWorkflow('deep-research.js', { question: 'q', rounds: 1 }, (prompt, opts) => {
    const label = opts.label || ''
    if (label === 'frame') {
      return {
        restated: 'q',
        answerShape: 'shape',
        angles: [{ name: 'a', mode: 'web', looksFor: 'x' }],
        codebaseQuestions: [],
      }
    }
    if (/^(source quality|recency|contradiction):/.test(label)) {
      const v = votes[i]
      i += 1
      return v === null ? null : { verdict: v, why: 'reason-' + v }
    }
    if (/completeness critic/.test(prompt)) return { angles: [] }
    if (label === 'synthesis') {
      synthesis = prompt
      return 'report'
    }
    return { claims: [{ claim: 'c1', source: 's', why: 'w' }], deadEnds: [] }
  })
  return { counts: result.counts, unverified: result.unverified || [], synthesis }
}

// The review's table. Anything short of two clean positives is unverified, and
// a single refutation is never outvoted by silence.
for (const [votes, want, why] of [
  [['refuted', null, null], 'unverifiable', 'one refutation plus two missing checks'],
  [['stands', null, null], 'unverifiable', 'one positive is not enough on its own'],
  [['stands', 'stands', 'refuted'], 'unverifiable', 'a contradiction is not outvoted'],
  [['stands', 'stands', 'unverifiable'], 'stands', 'two clean positives and nothing against'],
  [['stands', 'stands', 'stands'], 'stands', 'all three lenses agree'],
  [['refuted', 'refuted', 'refuted'], 'refuted', 'all three lenses refute'],
]) {
  const { counts } = await crossCheck(votes)
  check(
    'votes-' + votes.map((v) => v || 'null').join('-'),
    why + ' -> ' + want,
    counts[want] === 1 && Object.values(counts).reduce((a, b) => a + b, 0) === 1,
    counts,
  )
}

// The reasons have to survive into the synthesis, or a contradiction that was
// found simply disappears from the record.
{
  const { synthesis } = await crossCheck(['refuted', null, null])
  check(
    'missing-lenses-recorded',
    'the synthesis is told how many lenses returned nothing',
    /returned no result/.test(synthesis),
    synthesis.slice(0, 160),
  )
  check(
    'refutation-reason-kept',
    "and the refuting lens's reason is carried forward",
    /reason-refuted/.test(synthesis),
    synthesis.slice(0, 160),
  )
}

console.log('\nspec-to-card: an unknown stage never reaches the board')

// Run a workflow that may not load, or may throw, and report that as a result
// rather than crashing the suite: a missing file is a failing check, not a
// stack trace that hides every other check.
async function tryRun(file, args, respond) {
  try {
    return await runWorkflow(file, args, respond)
  } catch (error) {
    return { error, result: {}, calls: [], logs: [] }
  }
}

// R10. `plna` matched neither guard and fell through into the second stage,
// reporting itself afterwards as that stage. `plan` is no stage at all now:
// the fleet has no plans, so asking for one is as wrong as a typo.
for (const stage of ['plna', 'plan']) {
  let spawned = 0
  const { error } = await tryRun('spec-to-card.js', { issue: 'EX-1', stage }, () => {
    spawned += 1
    return { specExists: false, specApproved: false, evidence: 'none', related: [] }
  })
  check('invalid-stage-throws:' + stage, 'an unknown stage is rejected', Boolean(error) && /stage must be/.test(error.message), error && error.message)
  check('invalid-stage-spawns-nothing:' + stage, 'and it is rejected before anything spawns', spawned === 0, spawned)
}

// The valid stages must still work, or the guard has just broken the workflow.
{
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1', stage: 'card' }, () => ({
    specExists: true,
    specApproved: false,
    evidence: 'status line reads draft',
    related: [],
  }))
  check('unapproved-spec-blocks', 'an explicit card stage on an unapproved spec blocks', !error && result.stage === 'blocked', error ? error.message : result.stage)
  check('unapproved-spec-files-nothing', 'and nothing touches the card', !error && calls.every((c) => !/task edit /.test(c.prompt)), calls.map((c) => c.opts.label))
}

console.log('\nspec-to-card: the approved spec becomes criteria on the card, and nothing else')

// Every lane the second stage runs, answered by label. `over` replaces one.
function specToCard(over = {}) {
  return (prompt, opts = {}) => {
    const label = opts.label || ''
    for (const [k, v] of Object.entries(over)) {
      if (label === k) return typeof v === 'function' ? v(prompt, opts) : v
    }
    if (label === 'gate: EX-1') return { specExists: true, specApproved: true, evidence: 'Status: approved', related: [] }
    // A project with no `Requirements source: <path>` line, as this repo is.
    if (label === 'requirements source') return { line: '', pathExists: false, evidence: 'AGENTS.md has no such line' }
    if (label === 'criteria: EX-1')
      return { criteria: [{ number: 1, text: 'The refresh token rotates' }, { number: 2, text: "A revoked token's session ends" }], evidence: 'section Acceptance criteria' }
    if (label === 'card: EX-1') return { found: true, boardRead: true, criteria: ['The refresh token rotates'], evidence: 'acceptanceCriteriaCount: 1' }
    if (label === 'file criteria: EX-1') return { commandsRun: ['task edit EX-1'], criteriaCount: 2, boardRead: true, criteria: ['The refresh token rotates', "A revoked token's session ends"], couldNotRun: [] }
    return null
  }
}
const filingCalls = (calls) => calls.filter((c) => /task edit /.test(c.prompt))
// A board lane reaches the binary through the plugin's shim, never a bare
// `board` from PATH: a binary missing from PATH exits 127, and that was read as
// "no card" and answered with advice to file one.
const usesShim = (p) => /\/board\/board\.sh/.test(p || '') && !/(^|[\s;&|(`])board task /m.test(p || '')
const NO_BINARY = 'board: no binary at ~/.local/bin/board or /p/board/bin/board and no bun on PATH'
// A status write, in either spelling, with a space or an equals sign.
const STATUS_FLAG = /(^|\s)(-s|--status)(\s|=)/

{
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard())
  const filing = filingCalls(calls)
  check('card-stage-runs', 'an approved spec runs the card stage', !error && result.stage === 'card', error ? error.message : result.stage)
  check('card-stage-files-once', 'one lane files the criteria', filing.length === 1, filing.length)
  const prompt = (filing[0] || {}).prompt || ''
  check('card-stage-files-only-missing', 'with one --ac per criterion the card does not already carry', (prompt.match(/--ac=/g) || []).length === 1 && /revoked token/.test(prompt) && !/--ac='The refresh token rotates'/.test(prompt), prompt)
  check('card-stage-quotes-criteria', 'and a quote inside a criterion is shell-quoted, not a broken command', prompt.includes("--ac='A revoked token'\\''s session ends'"), prompt)
  check('card-stage-names-the-card', 'against the issue the run was given', /task edit EX-1 /.test(prompt), prompt)
  const statusWrites = calls.filter((c) => STATUS_FLAG.test(c.prompt))
  check('card-stage-writes-no-status', 'and no prompt anywhere passes a status flag', statusWrites.length === 0, statusWrites.map((c) => c.opts.label))
  check('card-stage-reports-filed', 'the result counts what was filed', result.filed === 1, result.filed)
  const planned = calls.filter((c) => c.opts.agentType === 'Plan' || /docs\/plans|\bplans?\b/i.test(c.prompt))
  check('card-stage-plans-nothing', 'no Plan agent and no plan anywhere in the run', planned.length === 0, planned.map((c) => c.opts.label))
  check('card-stage-result-has-no-plan', 'and the result never mentions one', !/\bplans?\b/i.test(JSON.stringify(result)), result)
}

{
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'criteria: EX-1': { criteria: [], evidence: 'no acceptance criteria section' } }))
  check('no-criteria-blocks', 'a spec with no numbered criteria blocks', !error && result.stage === 'blocked', error ? error.message : result.stage)
  check('no-criteria-files-nothing', 'and files nothing', filingCalls(calls).length === 0, calls.map((c) => c.opts.label))
}

{
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'criteria: EX-1': null }))
  check('silent-criteria-lane-blocks', 'a criteria lane that returned nothing blocks', !error && result.stage === 'blocked' && filingCalls(calls).length === 0, error ? error.message : [result.stage, filingCalls(calls).length])
}

{
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'card: EX-1': null }))
  check('silent-card-lane-blocks', 'a card lane that returned nothing blocks rather than filing blind', !error && result.stage === 'blocked' && filingCalls(calls).length === 0, error ? error.message : [result.stage, filingCalls(calls).length])
}

{
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'card: EX-1': { found: 'false', boardRead: true, criteria: [], evidence: 'no task EX-1' } }))
  check('no-card-blocks', 'no card on the board blocks, and "false" is a no', !error && result.stage === 'blocked' && filingCalls(calls).length === 0, error ? error.message : [result.stage, filingCalls(calls).length])
}

{
  // Only a real true, or the string "true", is a found card.
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'card: EX-1': { found: 'not found', boardRead: true, criteria: [], evidence: 'no task EX-1' } }))
  check('not-found-string-blocks', '"not found" is not a card', !error && result.stage === 'blocked' && /there is no card/.test(result.reason || '') && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason])
}

{
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    specToCard({ 'card: EX-1': { found: true, criteria: ['The refresh token rotates', "A revoked token's session ends"], evidence: 'acceptanceCriteriaCount: 2' } }),
  )
  check('card-already-carries-all', 'a card that already carries every criterion is not written again', !error && result.stage === 'card' && result.filed === 0 && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.filed, filingCalls(calls).length])
}

{
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'file criteria: EX-1': null }))
  check('silent-filing-lane-blocks', 'a filing lane that returned nothing is not reported as filed', !error && result.stage === 'blocked', error ? error.message : result.stage)
}

{
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'file criteria: EX-1': { commandsRun: ['task edit EX-1'], criteriaCount: 1, couldNotRun: [] } }))
  check('short-card-blocks', 'a card still short of the spec after filing is not reported as filed', !error && result.stage === 'blocked', error ? error.message : result.stage)
}

{
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'file criteria: EX-1': { commandsRun: ['task edit EX-1'], criteriaCount: true, couldNotRun: [] } }))
  check('boolean-count-blocks', 'a count that is not a number is not a count', !error && result.stage === 'blocked', error ? error.message : result.stage)
}

// Stage one is unchanged: it drafts the spec and stops for the human.
{
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, (prompt, opts) => {
    if (opts.label === 'gate: EX-1') return { specExists: false, specApproved: false, evidence: 'no file', related: [] }
    if (opts.label === 'requirements source') return { line: '', pathExists: false, evidence: 'AGENTS.md has no such line' }
    if (opts.label === 'interview brief') return { questions: [{ question: 'q', why: 'w', blocking: true }] }
    return 'reading'
  })
  check('spec-stage-drafts', 'an unapproved spec runs the spec stage', !error && result.stage === 'spec', error ? error.message : result.stage)
  check('spec-stage-writes-the-spec', 'and spec-writer drafts docs/specs/<issue>.md', calls.some((c) => c.opts.agentType === 'coder-fleet:spec-writer' && /Write docs\/specs\/EX-1\.md/.test(c.prompt)), calls.map((c) => c.opts.label))
  check('spec-stage-files-nothing', 'and nothing touches the card before the human approves', filingCalls(calls).length === 0, calls.map((c) => c.opts.label))
  check('spec-stage-names-the-card', 'its next step is the card, not a plan', /card/.test(result.nextStep || '') && !/\bplans?\b/i.test(JSON.stringify(result)), result.nextStep)
}

console.log('\nspec-to-card: a board it cannot read is not a missing card, and an approved spec is never redrafted')

{
  const { calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard())
  const cardLane = calls.find((c) => c.opts.label === 'card: EX-1')
  const filing = filingCalls(calls)[0]
  check('card-lane-runs-shim', 'the card lane reads the board through the plugin shim', !error && Boolean(cardLane) && usesShim(cardLane.prompt) && /task view EX-1 --json/.test(cardLane.prompt), cardLane && cardLane.prompt)
  check('filing-lane-runs-shim', 'and so does the filing lane', Boolean(filing) && usesShim(filing.prompt), filing && filing.prompt)
}

for (const [name, card] of [
  ['no-binary', { found: false, boardRead: false, criteria: [], evidence: NO_BINARY }],
  ['exit-127-claimed-read', { found: false, boardRead: true, criteria: [], evidence: 'zsh: command not found: board' }],
  ['read-absent', { found: false, criteria: [], evidence: 'no task EX-1' }],
]) {
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'card: EX-1': card }))
  check('unreadable-board-blocks:' + name, 'a card lane that could not read the board is its own stop, not "no card"', !error && result.stage === 'blocked' && /^could not read the board/.test(result.reason || '') && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason])
  check('unreadable-board-never-files-a-card:' + name, 'and its next step checks the binary and never says to file a card', /kickoff/.test(result.nextStep || '') && !/File the card/i.test(result.nextStep || ''), result.nextStep)
}

{
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'file criteria: EX-1': { commandsRun: [], criteriaCount: 2, boardRead: false, couldNotRun: [NO_BINARY] } }))
  check('unreadable-board-filing-blocks', 'a filing lane that could not reach the board is not reported as filed', !error && result.stage === 'blocked' && /^could not read the board/.test(result.reason || ''), error ? error.message : [result.stage, result.reason])
}

{
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    specToCard({ 'card: EX-1': { found: true, boardRead: true, criteria: ['The  refresh\n  token rotates', "  A revoked token's session ends "], evidence: 'acceptanceCriteriaCount: 2' } }),
  )
  check('rerun-whitespace-not-refiled', 'a card criterion that differs only in whitespace is not filed again', !error && result.stage === 'card' && result.filed === 0 && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.filed])
}

{
  // The board drops a leading "#<n> " from a criterion's text when it reads
  // the card, so a spec criterion that starts with one has to be compared the
  // same way or every rerun files it again.
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    specToCard({
      'criteria: EX-1': { criteria: [{ number: 1, text: '#1 The refresh token rotates' }, { number: 2, text: "A revoked token's session ends" }], evidence: 'section Acceptance criteria' },
      'card: EX-1': { found: true, boardRead: true, criteria: ['The refresh token rotates', "A revoked token's session ends"], evidence: 'acceptanceCriteriaCount: 2' },
    }),
  )
  check('rerun-hash-prefix-not-refiled', 'a criterion starting "#1 " matches the card the board read it back as', !error && result.stage === 'card' && result.filed === 0 && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.filed])
}

{
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'file criteria: EX-1': { commandsRun: ['task edit EX-1'], criteriaCount: 3, boardRead: true, couldNotRun: [] } }))
  check('doubled-filing-blocks', 'a card carrying more criteria than expected after filing is a doubled filing, not a success', !error && result.stage === 'blocked', error ? error.message : result.stage)
}

for (const bad of ['example', 'EX-1; touch /tmp/pwned', '../../etc/passwd', 'EX-1/../../x', 'EX-', 'EX-1\n']) {
  let spawned = 0
  const { error } = await tryRun('spec-to-card.js', { issue: bad }, () => {
    spawned += 1
    return null
  })
  check('invalid-issue-stops:' + JSON.stringify(bad), 'an issue that is not a board id stops before anything spawns', Boolean(error) && /issue must be a board id/.test(error.message) && spawned === 0, error ? [error.message, spawned] : spawned)
}

{
  // A string "true" is an approval: it was read as a no and redrafted over the
  // approved spec.
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'gate: EX-1': { specExists: true, specApproved: 'true', evidence: 'Status: approved', related: [] } }))
  const drafts = calls.filter((c) => /^draft /.test(c.opts.label || ''))
  check('string-true-approval-runs-card', 'an approval reported as the string "true" runs the card stage', !error && result.stage === 'card', error ? error.message : result.stage)
  check('string-true-approval-not-redrafted', 'and never redrafts the approved spec', drafts.length === 0, drafts.map((c) => c.opts.label))
}

for (const [name, args, gate] of [
  ['explicit-spec-stage', { issue: 'EX-1', stage: 'spec' }, { specExists: true, specApproved: true, evidence: 'Status: approved', related: [] }],
  ['unreadable-approval', { issue: 'EX-1' }, { specExists: true, specApproved: 'approved', evidence: 'Status: approved', related: [] }],
]) {
  const { result, calls, error } = await tryRun('spec-to-card.js', args, specToCard({ 'gate: EX-1': gate }))
  const writers = calls.filter((c) => c.opts.agentType === 'coder-fleet:spec-writer')
  check('approved-spec-not-redrafted:' + name, 'a spec whose status says approved is never redrafted', !error && result.stage === 'blocked' && writers.length === 0 && filingCalls(calls).length === 0, error ? error.message : [result.stage, writers.map((c) => c.opts.label)])
}

console.log('\nspec-to-card: a project that names a requirements source skips spec-writer (CF-53)')

// The rule is the literal line `Requirements source: <path>` in the project's
// AGENTS.md. With it, the card's criteria are the requirement clauses the item
// answers, in clause order, and spec-writer never runs; without it, every case
// above is the flow, unchanged. A path that does not exist is a stop, never a
// fallback to a spec.
const REQ_LINE = { line: 'Requirements source: docs/requirements.md', pathExists: true, evidence: 'AGENTS.md:41' }
const R2_TEXT = "R2 The refresh token's lifetime is one day"
const R7_TEXT = 'R7 A revoked session ends within one minute'
const CLAUSES = {
  // Out of document order on purpose: the lane supplies each clause's
  // position, and the script sorts by it.
  clauses: [
    { id: 'R7', position: 7, text: R7_TEXT },
    { id: 'R2', position: 2, text: R2_TEXT },
  ],
  openDecisions: ['Does R7 apply to sessions opened before the change?'],
  evidence: 'docs/requirements.md sections 2 and 7',
}
function reqFlow(over = {}) {
  return specToCard({
    'gate: EX-1': { specExists: false, specApproved: false, evidence: 'no file', related: [] },
    'requirements source': REQ_LINE,
    'card: EX-1': { found: true, boardRead: true, criteria: [], indices: [], ticked: 0, description: 'Sessions must end when revoked', evidence: 'acceptanceCriteriaCount: 0' },
    'clauses: EX-1': CLAUSES,
    'file criteria: EX-1': { commandsRun: ['task edit EX-1'], criteriaCount: 2, boardRead: true, criteria: [R2_TEXT, R7_TEXT], couldNotRun: [] },
    ...over,
  })
}
const specWriters = (calls) => calls.filter((c) => c.opts.agentType === 'coder-fleet:spec-writer')
const clauseLanes = (calls) => calls.filter((c) => c.opts.label === 'clauses: EX-1')

{
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1', brief: 'end revoked sessions fast' }, reqFlow())
  check('reqsource-runs-clauses', 'a named requirements source with no approved spec runs the clauses stage', !error && result.stage === 'clauses', error ? error.message : result.stage)
  check('reqsource-skips-spec-writer', 'and spec-writer is never spawned', specWriters(calls).length === 0, specWriters(calls).map((c) => c.opts.label))
  const lane = clauseLanes(calls)[0]
  check('reqsource-reads-the-named-path', 'the clauses lane reads the path the line names, with the brief and the card', Boolean(lane) && /docs\/requirements\.md/.test(lane.prompt) && /end revoked sessions fast/.test(lane.prompt) && /Sessions must end when revoked/.test(lane.prompt), lane && lane.prompt)
  const filing = filingCalls(calls)
  const prompt = (filing[0] || {}).prompt || ''
  check('reqsource-files-once', 'one lane files the clauses', filing.length === 1, filing.length)
  const r2 = prompt.indexOf("--ac='R2 "), r7 = prompt.indexOf("--ac='R7 ")
  check('reqsource-clause-order', 'in clause order, whatever order the lane returned them in', r2 > -1 && r7 > r2, prompt)
  check('reqsource-result-in-clause-order', 'and the result lists them in that order', JSON.stringify(result.criteria) === JSON.stringify([CLAUSES.clauses[1].text, CLAUSES.clauses[0].text]), result.criteria)
  check('reqsource-names-the-source', 'the result names the requirements source', result.requirementsSource === 'docs/requirements.md', result.requirementsSource)
  check('reqsource-returns-open-decisions', 'and carries every open decision back to the lead', Array.isArray(result.questions) && result.questions.includes(CLAUSES.openDecisions[0]), result.questions)
  check('reqsource-questions-before-build', 'whose next step makes each one an Actions for Human question, answered before the first build spawn', /Actions for Human/.test(result.nextStep || '') && /before the first build spawn/.test(result.nextStep || ''), result.nextStep)
  const statusWrites = calls.filter((c) => STATUS_FLAG.test(c.prompt))
  check('reqsource-writes-no-status', 'no prompt passes a status flag', statusWrites.length === 0, statusWrites.map((c) => c.opts.label))
  const planned = calls.filter((c) => /docs\/plans|\bplans?\b/i.test(c.prompt))
  check('reqsource-plans-nothing', 'and no plan anywhere in the run', planned.length === 0 && !/\bplans?\b/i.test(JSON.stringify(result)), planned.map((c) => c.opts.label))
}

// Without the line, the flow is the one every case above drives: spec-writer
// drafts, and no clauses lane runs.
for (const [name, req] of [
  ['absent', { line: '', pathExists: false, evidence: 'no such line' }],
  ['lower-case', { line: 'requirements source: docs/requirements.md', pathExists: true, evidence: 'AGENTS.md:41' }],
  ['other-words', { line: 'Requirements: docs/requirements.md', pathExists: true, evidence: 'AGENTS.md:41' }],
  ['not-at-line-start', { line: '- Requirements source: docs/requirements.md', pathExists: true, evidence: 'AGENTS.md:41' }],
]) {
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({ 'requirements source': req, 'interview brief': { questions: [] } }),
  )
  check('no-reqsource-drafts-a-spec:' + name, 'without the literal line the spec stage runs as before', !error && result.stage === 'spec' && specWriters(calls).length > 0 && clauseLanes(calls).length === 0, error ? error.message : [result.stage, calls.map((c) => c.opts.label)])
}

// Every stop below spawns no spec-writer and files nothing.
for (const [name, args, over, reason] of [
  ['missing-path', { issue: 'EX-1' }, { 'requirements source': { line: 'Requirements source: docs/requirements.md', pathExists: false, evidence: 'no such file' } }, /does not exist/],
  ['string-false-path', { issue: 'EX-1' }, { 'requirements source': { line: 'Requirements source: docs/requirements.md', pathExists: 'false', evidence: 'no such file' } }, /does not exist/],
  ['placeholder-path', { issue: 'EX-1' }, { 'requirements source': { line: 'Requirements source: <FILL: path>', pathExists: false, evidence: 'AGENTS.md:41' } }, /names no path/],
  ['silent-lane', { issue: 'EX-1' }, { 'requirements source': null }, /could not read AGENTS\.md/],
  ['non-string-line', { issue: 'EX-1' }, { 'requirements source': { line: true, pathExists: true, evidence: '?' } }, /could not read AGENTS\.md/],
  ['explicit-spec-stage', { issue: 'EX-1', stage: 'spec' }, {}, /requirements source/],
  ['no-clauses', { issue: 'EX-1' }, { 'clauses: EX-1': { clauses: [], openDecisions: [], evidence: 'nothing matches' } }, /no requirement clause/],
  ['silent-clauses-lane', { issue: 'EX-1' }, { 'clauses: EX-1': null }, /clauses lane returned nothing/],
  ['unordered-clause', { issue: 'EX-1' }, { 'clauses: EX-1': { clauses: [{ id: 'R2', position: 'second', text: 'R2 x' }], openDecisions: [], evidence: 'e' } }, /clause order/],
  ['no-card', { issue: 'EX-1' }, { 'card: EX-1': { found: false, boardRead: true, criteria: [], evidence: 'no task EX-1' } }, /there is no card/],
]) {
  const { result, calls, error } = await tryRun('spec-to-card.js', args, reqFlow(over))
  check('reqsource-stops:' + name, 'stops with its reason, spawning no spec-writer and filing nothing', !error && result.stage === 'blocked' && reason.test(result.reason || '') && specWriters(calls).length === 0 && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason, calls.map((c) => c.opts.label)])
}

{
  // No card, no clauses lane: which clauses an item answers is read from its card.
  const { calls } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'card: EX-1': { found: false, boardRead: true, criteria: [], evidence: 'no task EX-1' } }))
  check('reqsource-no-card-reads-no-clauses', 'a missing card stops before the clauses are read', clauseLanes(calls).length === 0, calls.map((c) => c.opts.label))
}

{
  // An approved spec is still the spec: the requirements source does not
  // override criteria the human already approved.
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({
      'gate: EX-1': { specExists: true, specApproved: true, evidence: 'Status: approved', related: [] },
      // The card reads back as the spec's criteria, which is what it now carries.
      'file criteria: EX-1': { commandsRun: ['x'], criteriaCount: 2, boardRead: true, criteria: ['The refresh token rotates', "A revoked token's session ends"], couldNotRun: [] },
    }),
  )
  check('reqsource-approved-spec-is-the-card-stage', 'an approved spec still files its own criteria', !error && result.stage === 'card' && clauseLanes(calls).length === 0 && /revoked token/.test((filingCalls(calls)[0] || {}).prompt || ''), error ? error.message : [result.stage, calls.map((c) => c.opts.label)])
}

{
  const { calls } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': { line: 'Requirements source: `docs/requirements.md`', pathExists: true, evidence: 'AGENTS.md:41' } }))
  const lane = clauseLanes(calls)[0]
  check('reqsource-backticked-path', 'a path in backticks is the same path', Boolean(lane) && /docs\/requirements\.md/.test(lane.prompt) && !/`docs\/requirements\.md`/.test(lane.prompt), lane && lane.prompt)
}

console.log('\nspec-to-card: the requirements-source lane only decides the route it is asked about (CF-53 fix round 1)')

const reqLanes = (calls) => calls.filter((c) => c.opts.label === 'requirements source')

// An approved spec is the card stage whatever the lane says: without the line,
// nothing changes, and a failed lane is not a reason to stop a spec's filing.
for (const [name, lane] of [
  ['null', null],
  ['garbage', 'garbage'],
  ['no-line', { pathExists: false }],
]) {
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, specToCard({ 'requirements source': lane }))
  check('approved-spec-ignores-failed-lane:' + name, 'an approved spec runs the card stage even when the requirements lane failed', !error && result.stage === 'card', error ? error.message : [result.stage, result.reason])
}

{
  // Where the lane decides the route, a failure gets one retry.
  let n = 0
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': () => (++n === 1 ? null : REQ_LINE) }))
  check('reqlane-retried-once', 'a failed lane is asked once more, and its second answer decides the route', !error && result.stage === 'clauses' && reqLanes(calls).length === 2, error ? error.message : [result.stage, reqLanes(calls).length])
}
{
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': null }))
  check('reqlane-fails-twice-stops', 'two failures stop, never guessing that there is no line', !error && result.stage === 'blocked' && /could not read AGENTS\.md/.test(result.reason || '') && reqLanes(calls).length === 2 && specWriters(calls).length === 0, error ? error.message : [result.stage, reqLanes(calls).length])
}
{
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1', stage: 'spec' }, reqFlow({ 'requirements source': null }))
  check('reqlane-explicit-spec-fails-stops', 'an explicit spec stage with a failed lane stops too', !error && result.stage === 'blocked' && specWriters(calls).length === 0, error ? error.message : [result.stage, result.reason])
}

console.log('\nspec-to-card: the line is read one way, and a bad path always stops')

for (const [name, req, reason] of [
  ['missing-path-exists', { line: 'Requirements source: docs/requirements.md', evidence: 'e' }, /does not exist/],
  ['empty-backticks', { line: 'Requirements source: ``', pathExists: true, evidence: 'e' }, /names no path/],
  ['blank-path', { line: 'Requirements source: ', pathExists: true, evidence: 'e' }, /names no path/],
  ['no-space-no-path', { line: 'Requirements source:', pathExists: true, evidence: 'e' }, /names no path/],
  ['spaces-only', { line: 'Requirements source:    ', pathExists: true, evidence: 'e' }, /names no path/],
]) {
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': req }))
  check('reqsource-bad-path-stops:' + name, 'stops with its reason and never falls back to a spec', !error && result.stage === 'blocked' && reason.test(result.reason || '') && specWriters(calls).length === 0 && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason])
}

{
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': { line: 'Requirements source: docs/requirements.md\r', pathExists: true, evidence: 'e' } }))
  check('reqsource-crlf-line', 'a CRLF line is still a requirements source', !error && result.stage === 'clauses' && result.requirementsSource === 'docs/requirements.md', error ? error.message : [result.stage, result.requirementsSource])
}

{
  const dup = { clauses: [{ id: 'R2', position: 2, text: R2_TEXT }, { id: 'R2', position: 3, text: '  ' + R2_TEXT + ' ' }], openDecisions: [], evidence: 'e' }
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'clauses: EX-1': dup, 'file criteria: EX-1': { commandsRun: ['x'], criteriaCount: 1, boardRead: true, criteria: [R2_TEXT], couldNotRun: [] } }))
  const prompt = (filingCalls(calls)[0] || {}).prompt || ''
  check('reqsource-duplicate-clause-filed-once', 'two clauses with the same text are filed once', !error && (prompt.match(/--ac=/g) || []).length === 1 && result.criteria.length === 1, error ? error.message : prompt)
}

{
  // A directory source: sorted file path first, then position in the file.
  const dir = {
    clauses: [
      { id: 'B1', file: 'reqs/b.rq', position: 1, text: 'B1 second file, first clause' },
      { id: 'A9', file: 'reqs/a.rq', position: 9, text: 'A9 first file, ninth clause' },
      { id: 'A2', file: 'reqs/a.rq', position: 2, text: 'A2 first file, second clause' },
    ],
    openDecisions: [],
    evidence: 'e',
  }
  const want = ['A2 first file, second clause', 'A9 first file, ninth clause', 'B1 second file, first clause']
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'clauses: EX-1': dir, 'file criteria: EX-1': { commandsRun: ['x'], criteriaCount: 3, boardRead: true, criteria: want, couldNotRun: [] } }))
  check('reqsource-directory-order', 'a directory source orders by file path, then position', !error && JSON.stringify(result.criteria) === JSON.stringify(want), error ? error.message : result.criteria)
  const lane = clauseLanes(calls)[0]
  check('reqsource-directory-prompt', 'and the clauses lane is told how a directory is ordered', Boolean(lane) && /sorted/.test(lane.prompt) && /file/.test(lane.prompt), lane && lane.prompt)
}

console.log('\nspec-to-card: the card comes out as the source, in order, with extras after')

const PROVISIONAL = 'Provisional: the spec settles what done means here, and its criteria replace this one'
// Position of each --ac and --remove-ac in the filing command.
function filed(calls) {
  const p = (filingCalls(calls)[0] || {}).prompt || ''
  return {
    prompt: p,
    adds: [...p.matchAll(/--ac='((?:[^']|'\\'')*)'/g)].map((m) => m[1].replace(/'\\''/g, "'")),
    removes: [...p.matchAll(/--remove-ac=(\d+)/g)].map((m) => Number(m[1])),
  }
}

{
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({ 'card: EX-1': { found: true, boardRead: true, criteria: [PROVISIONAL], indices: [1], ticked: 0, description: 'd', evidence: 'acceptanceCriteriaCount: 1' } }),
  )
  const f = filed(calls)
  check('clauses-replace-provisional', 'a provisional criterion is removed and the clauses filed in its place, in order', !error && result.stage === 'clauses' && JSON.stringify(f.adds) === JSON.stringify([R2_TEXT, R7_TEXT]) && JSON.stringify(f.removes) === JSON.stringify([1]), error ? error.message : [f.adds, f.removes])
  check('clauses-replace-result', 'and the result is the list the card now carries', JSON.stringify(result.criteria) === JSON.stringify([R2_TEXT, R7_TEXT]), result.criteria)
}

{
  // R7 already there, R2 not: appending would file R2 after R7.
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({ 'card: EX-1': { found: true, boardRead: true, criteria: [R7_TEXT], indices: [1], ticked: 0, description: 'd', evidence: 'acceptanceCriteriaCount: 1' } }),
  )
  const f = filed(calls)
  check('clauses-partial-overlap-reordered', 'a partial overlap is rewritten in clause order, not appended', !error && result.stage === 'clauses' && JSON.stringify(f.adds) === JSON.stringify([R2_TEXT, R7_TEXT]) && JSON.stringify(f.removes) === JSON.stringify([1]), error ? error.message : [f.adds, f.removes])
}

{
  const EXTRA = 'The runbook names the new timeout'
  const want = [R2_TEXT, R7_TEXT, EXTRA]
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({
      'card: EX-1': { found: true, boardRead: true, criteria: [PROVISIONAL, EXTRA], indices: [1, 2], ticked: 0, description: 'd', evidence: 'acceptanceCriteriaCount: 2' },
      'file criteria: EX-1': { commandsRun: ['x'], criteriaCount: 3, boardRead: true, criteria: want, couldNotRun: [] },
    }),
  )
  const f = filed(calls)
  check('clauses-extra-follows', 'an extra criterion is kept, after the clauses, and the provisional one goes', !error && result.stage === 'clauses' && JSON.stringify(f.adds) === JSON.stringify(want) && JSON.stringify(f.removes) === JSON.stringify([1, 2]) && JSON.stringify(result.criteria) === JSON.stringify(want), error ? error.message : [f.adds, f.removes, result.criteria])
}

{
  // A card already exactly the clauses in order is not written.
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({ 'card: EX-1': { found: true, boardRead: true, criteria: [R2_TEXT, R7_TEXT], indices: [1, 2], ticked: 0, description: 'd', evidence: 'acceptanceCriteriaCount: 2' } }),
  )
  check('clauses-already-in-order', 'a card that already reads as the clauses in order is left alone', !error && result.stage === 'clauses' && result.filed === 0 && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.filed])
}

{
  // A rewrite would untick a criterion the lead ticked on evidence.
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({ 'card: EX-1': { found: true, boardRead: true, criteria: [R7_TEXT], indices: [1], ticked: 1, description: 'd', evidence: 'acceptanceCriteriaCount: 1' } }),
  )
  check('clauses-ticked-rewrite-stops', 'a rewrite over a ticked criterion stops rather than untick it', !error && result.stage === 'blocked' && /ticked/.test(result.reason || '') && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason])
}

{
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'file criteria: EX-1': { commandsRun: ['x'], criteriaCount: 2, boardRead: true, criteria: [R7_TEXT, R2_TEXT], couldNotRun: [] } }))
  check('filed-order-read-back', 'a card read back out of order after filing is not reported as filed', !error && result.stage === 'blocked' && /order/.test(result.reason || ''), error ? error.message : [result.stage, result.reason])
}

console.log('\nspec-to-card: fix round 2 - an explicit card stage, and a rewrite the card lane cannot vouch for')

{
  // A project with a source asking for the card stage with no approved spec is
  // pointed at the clauses, never at a spec interview.
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1', stage: 'card' }, reqFlow())
  check('card-stage-with-source-names-clauses', 'an unapproved card stage in a project with a source points at the clauses route', !error && result.stage === 'blocked' && /requirement clauses/.test(result.nextStep || '') && !/Interview/i.test(result.nextStep || ''), error ? error.message : result.nextStep)
  check('card-stage-with-source-spawns-no-writer', 'and spawns no spec-writer', specWriters(calls).length === 0, specWriters(calls).map((c) => c.opts.label))
}
{
  // A failed lane there gets neutral advice, never the spec interview.
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1', stage: 'card' }, reqFlow({ 'requirements source': null }))
  check('card-stage-failed-lane-neutral', 'a failed lane on an unapproved card stage gives neutral advice', !error && result.stage === 'blocked' && !/Interview/i.test(result.nextStep || ''), error ? error.message : result.nextStep)
}
{
  // Without the line, the explicit card stage is unchanged.
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1', stage: 'card' }, reqFlow({ 'requirements source': { line: '', pathExists: false, evidence: 'none' } }))
  check('card-stage-no-source-unchanged', 'without the line, an unapproved card stage still says to interview the human', !error && result.stage === 'blocked' && /Interview the human/.test(result.nextStep || ''), error ? error.message : result.nextStep)
}

// Each case names the guard that stopped it: a missing tick count says so and
// says to run again, never "undefined ticked criteria" and a reorder with the
// human; a short index list says it lacks a number for each criterion.
const NO_TICK_COUNT = /did not report a tick count/
const NO_INDEX = /a number for each/
for (const [name, card, reason, next] of [
  // M1: a ticked count the lane never gave is not zero.
  ['ticked-missing', { found: true, boardRead: true, criteria: [R7_TEXT], indices: [1], description: 'd', evidence: 'e' }, NO_TICK_COUNT, /Run this workflow again/],
  ['ticked-garbage', { found: true, boardRead: true, criteria: [R7_TEXT], indices: [1], ticked: 'none', description: 'd', evidence: 'e' }, NO_TICK_COUNT, /Run this workflow again/],
  // M2: fewer numbers than criteria means which ones to remove is unknown.
  ['short-indices', { found: true, boardRead: true, criteria: [PROVISIONAL, 'The runbook names the new timeout'], indices: [1], ticked: 0, description: 'd', evidence: 'e' }, NO_INDEX, /Run this workflow again/],
  ['no-indices', { found: true, boardRead: true, criteria: [R7_TEXT], ticked: 0, description: 'd', evidence: 'e' }, NO_INDEX, /Run this workflow again/],
]) {
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'card: EX-1': card }))
  check('rewrite-unvouched-stops:' + name, 'a rewrite the card lane cannot vouch for stops with its own reason, filing nothing', !error && result.stage === 'blocked' && reason.test(result.reason || '') && next.test(result.nextStep || '') && !/undefined|Reorder/.test((result.reason || '') + (result.nextStep || '')) && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason, result.nextStep, filingCalls(calls).length])
}

{
  // Only the backfill's "Provisional:" marks a provisional criterion; a
  // criterion that merely starts with the word is an extra.
  const EXTRA = 'Provisional accounts expire after 30 days'
  const want = [R2_TEXT, R7_TEXT, EXTRA]
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({
      'card: EX-1': { found: true, boardRead: true, criteria: [EXTRA], indices: [1], ticked: 0, description: 'd', evidence: 'e' },
      'file criteria: EX-1': { commandsRun: ['x'], criteriaCount: 3, boardRead: true, criteria: want, couldNotRun: [] },
    }),
  )
  check('provisional-word-is-an-extra', 'a criterion starting with the word Provisional but no colon is kept as an extra', !error && JSON.stringify(result.criteria) === JSON.stringify(want), error ? error.message : result.criteria)
}

{
  // A directory source where one clause names no file cannot be ordered.
  const mixed = {
    clauses: [
      { id: 'A2', file: 'reqs/a.rq', position: 2, text: 'A2 first file, second clause' },
      { id: 'X1', file: '', position: 1, text: 'X1 from no file' },
    ],
    openDecisions: [],
    evidence: 'e',
  }
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'clauses: EX-1': mixed }))
  check('directory-clause-without-file-stops', 'a clause with no file among clauses that name one stops', !error && result.stage === 'blocked' && /clause order/.test(result.reason || '') && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason])
}

console.log('\nspec-to-card: fix round 3 - a directory source orders by file, so every clause names one')

// The requirements lane says whether the source is a directory. A directory's
// positions restart at 1 in every file, so a clause with no file has no place,
// even when none of them names one.
const DIR_LINE = { line: 'Requirements source: reqs', pathExists: true, isDirectory: true, evidence: 'AGENTS.md:41' }
const FILE_LINE = { ...REQ_LINE, isDirectory: false }
const DIR_CLAUSES = {
  clauses: [
    { id: 'B1', file: 'reqs/b.rq', position: 1, text: 'B1 second file, first clause' },
    { id: 'A9', file: 'reqs/a.rq', position: 9, text: 'A9 first file, ninth clause' },
    { id: 'A2', file: 'reqs/a.rq', position: 2, text: 'A2 first file, second clause' },
  ],
  openDecisions: [],
  evidence: 'e',
}
const DIR_WANT = ['A2 first file, second clause', 'A9 first file, ninth clause', 'B1 second file, first clause']
const NO_FILES = {
  clauses: [
    { id: 'B1', position: 1, text: 'B1 second file, first clause' },
    { id: 'A2', position: 2, text: 'A2 first file, second clause' },
  ],
  openDecisions: [],
  evidence: 'e',
}

for (const [name, lane] of [
  ['true', DIR_LINE],
  ['string-true', { ...DIR_LINE, isDirectory: 'true' }],
]) {
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': lane, 'clauses: EX-1': NO_FILES }))
  check('directory-no-file-names-stops:' + name, 'a directory source where no clause names its file stops, filing nothing', !error && result.stage === 'blocked' && /directory/.test(result.reason || '') && /name(s)? its file/.test(result.reason || '') && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason])
}
{
  // One clause short of a file is enough.
  const one = { ...DIR_CLAUSES, clauses: DIR_CLAUSES.clauses.map((c, i) => (i === 1 ? { ...c, file: ' ' } : c)) }
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': DIR_LINE, 'clauses: EX-1': one }))
  check('directory-one-blank-file-stops', 'a directory source where one clause names a blank file stops, counting the clauses that named none', !error && result.stage === 'blocked' && /directory/.test(result.reason || '') && /\b1 of the 3 clauses\b/.test(result.reason || '') && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason])
}
{
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({ 'requirements source': DIR_LINE, 'clauses: EX-1': DIR_CLAUSES, 'file criteria: EX-1': { commandsRun: ['x'], criteriaCount: 3, boardRead: true, criteria: DIR_WANT, couldNotRun: [] } }),
  )
  check('directory-all-named-sorts', 'a directory source where every clause names its file sorts by path, then position', !error && result.stage === 'clauses' && JSON.stringify(result.criteria) === JSON.stringify(DIR_WANT) && JSON.stringify(filed(calls).adds) === JSON.stringify(DIR_WANT), error ? error.message : [result.stage, result.reason, result.criteria])
}
{
  // A single file: positions are the file's own, so no file name is needed.
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': FILE_LINE }))
  check('single-file-no-names-unchanged', 'a single-file source whose clauses name no file files them in position order, as before', !error && result.stage === 'clauses' && JSON.stringify(result.criteria) === JSON.stringify([R2_TEXT, R7_TEXT]), error ? error.message : [result.stage, result.reason])
}
// The lane could not say whether the path is a directory: today's rule holds.
// No clause naming a file is filed by position; a mix stops.
for (const [name, isDirectory] of [
  ['missing', undefined],
  ['garbage', 'maybe'],
]) {
  const lane = { ...REQ_LINE, isDirectory }
  {
    const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': lane }))
    check('directory-unknown-no-names-files:' + name, 'with the directory status unknown, clauses naming no file are filed by position', !error && result.stage === 'clauses' && JSON.stringify(result.criteria) === JSON.stringify([R2_TEXT, R7_TEXT]), error ? error.message : [result.stage, result.reason])
  }
  {
    const mixed = { ...DIR_CLAUSES, clauses: DIR_CLAUSES.clauses.map((c, i) => (i === 0 ? { ...c, file: '' } : c)) }
    const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': lane, 'clauses: EX-1': mixed }))
    check('directory-unknown-mixed-stops:' + name, 'with the directory status unknown, a mix of named and unnamed files still stops', !error && result.stage === 'blocked' && /clause order/.test(result.reason || '') && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason])
  }
}
{
  const { calls } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow())
  const lane = reqLanes(calls)[0]
  check('reqlane-asks-directory', 'the requirements lane is asked whether the path is a directory, and its schema carries the answer', Boolean(lane) && /isDirectory/.test(lane.prompt) && Boolean(lane.opts.schema && lane.opts.schema.properties && lane.opts.schema.properties.isDirectory), lane && lane.prompt)
}

console.log('\nspec-to-card: fix round 4 - one file order on every machine, and the tick stop first')

{
  // File paths sort by code unit, never by locale: upper case before
  // punctuation before lower case, so B, then _x, then a.
  const mixedCase = {
    clauses: [
      { id: 'a1', file: 'reqs/a.rq', position: 1, text: 'a1 lower-case file' },
      { id: 'X1', file: 'reqs/_x.rq', position: 1, text: 'X1 underscore file' },
      { id: 'B1', file: 'reqs/B.rq', position: 1, text: 'B1 upper-case file' },
    ],
    openDecisions: [],
    evidence: 'e',
  }
  const want = ['B1 upper-case file', 'X1 underscore file', 'a1 lower-case file']
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({ 'requirements source': DIR_LINE, 'clauses: EX-1': mixedCase, 'file criteria: EX-1': { commandsRun: ['x'], criteriaCount: 3, boardRead: true, criteria: want, couldNotRun: [] } }),
  )
  check('directory-code-unit-order', 'a directory source files its paths in code-unit order, B before _x before a', !error && result.stage === 'clauses' && JSON.stringify(filed(calls).adds) === JSON.stringify(want), error ? error.message : [result.stage, result.reason, filed(calls).adds])
}

{
  // A card with ticks and a short index list: the tick stop wins, because
  // ticks are the human's to settle and running again cannot fix them.
  const card = { found: true, boardRead: true, criteria: [PROVISIONAL, 'The runbook names the new timeout'], indices: [1], ticked: 1, description: 'd', evidence: 'e' }
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'card: EX-1': card }))
  check('ticked-and-short-indices-tick-stop-wins', 'a card both ticked and short of index numbers stops on the ticks, with the reorder step', !error && result.stage === 'blocked' && /ticked criteria a rewrite would untick/.test(result.reason || '') && /^Reorder the card with the human/.test(result.nextStep || '') && !/a number for each|Run this workflow again/.test((result.reason || '') + (result.nextStep || '')) && filingCalls(calls).length === 0, error ? error.message : [result.stage, result.reason, result.nextStep])
}

{
  // One file named three ways is one file: a leading ./ and a doubled /
  // do not split it into files that sort apart and interleave.
  const spelt = {
    clauses: [
      { id: 'A9', file: './reqs/a.rq', position: 9, text: 'A9 first file, ninth clause' },
      { id: 'B1', file: 'reqs/b.rq', position: 1, text: 'B1 second file, first clause' },
      { id: 'A5', file: 'reqs//a.rq', position: 5, text: 'A5 first file, fifth clause' },
      { id: 'A2', file: 'reqs/a.rq', position: 2, text: 'A2 first file, second clause' },
    ],
    openDecisions: [],
    evidence: 'e',
  }
  const want = ['A2 first file, second clause', 'A5 first file, fifth clause', 'A9 first file, ninth clause', 'B1 second file, first clause']
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    reqFlow({ 'requirements source': DIR_LINE, 'clauses: EX-1': spelt, 'file criteria: EX-1': { commandsRun: ['x'], criteriaCount: 4, boardRead: true, criteria: want, couldNotRun: [] } }),
  )
  check('directory-path-spellings-one-file', 'a file named as ./reqs/a.rq, reqs//a.rq and reqs/a.rq sorts as one file', !error && result.stage === 'clauses' && JSON.stringify(filed(calls).adds) === JSON.stringify(want), error ? error.message : [result.stage, result.reason, filed(calls).adds])
}

{
  const { result, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'file criteria: EX-1': { commandsRun: ['x'], criteriaCount: 3, boardRead: true, criteria: [R2_TEXT, R7_TEXT, R7_TEXT], couldNotRun: [] } }))
  check('doubled-nextstep-is-true', 'a doubled filing says a rerun rewrites the card, removing the duplicates', !error && result.stage === 'blocked' && /rewrites/.test(result.nextStep || '') && !/running this again will not/i.test(result.nextStep || ''), error ? error.message : result.nextStep)
}

{
  // The spec path replaces a provisional criterion too (lead step 5).
  const { result, calls, error } = await tryRun(
    'spec-to-card.js',
    { issue: 'EX-1' },
    specToCard({ 'card: EX-1': { found: true, boardRead: true, criteria: [PROVISIONAL], indices: [1], ticked: 0, evidence: 'acceptanceCriteriaCount: 1' } }),
  )
  const f = filed(calls)
  check('spec-replaces-provisional', 'the spec stage removes the provisional criterion and files the spec in its place', !error && result.stage === 'card' && JSON.stringify(f.adds) === JSON.stringify(['The refresh token rotates', "A revoked token's session ends"]) && JSON.stringify(f.removes) === JSON.stringify([1]), error ? error.message : [f.adds, f.removes])
}

console.log('\nspec-to-card: fix round 5 - a single-file source orders by position alone')

// A single file has one set of positions, so the file names the lane gives
// carry no order: two spellings of the one file, or a mix of named and
// unnamed, still file in position order.
{
  const twoWays = {
    clauses: [
      { id: 'R7', file: 'docs/requirements.md', position: 7, text: R7_TEXT },
      { id: 'R2', file: 'requirements.md', position: 2, text: R2_TEXT },
    ],
    openDecisions: [],
    evidence: 'e',
  }
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': FILE_LINE, 'clauses: EX-1': twoWays }))
  check('single-file-two-spellings-position-order', 'a single-file source whose clauses spell the file two ways files them in position order', !error && result.stage === 'clauses' && JSON.stringify(result.criteria) === JSON.stringify([R2_TEXT, R7_TEXT]) && JSON.stringify(filed(calls).adds) === JSON.stringify([R2_TEXT, R7_TEXT]), error ? error.message : [result.stage, result.reason, result.criteria])
}
{
  const mixed = {
    clauses: [
      { id: 'R7', file: 'docs/requirements.md', position: 7, text: R7_TEXT },
      { id: 'R2', file: '', position: 2, text: R2_TEXT },
    ],
    openDecisions: [],
    evidence: 'e',
  }
  const { result, calls, error } = await tryRun('spec-to-card.js', { issue: 'EX-1' }, reqFlow({ 'requirements source': FILE_LINE, 'clauses: EX-1': mixed }))
  check('single-file-mixed-names-files', 'a single-file source with named and unnamed files files in position order rather than stopping', !error && result.stage === 'clauses' && JSON.stringify(result.criteria) === JSON.stringify([R2_TEXT, R7_TEXT]) && JSON.stringify(filed(calls).adds) === JSON.stringify([R2_TEXT, R7_TEXT]), error ? error.message : [result.stage, result.reason, result.criteria])
}

console.log('\nreview-round: blocking findings come back as a handoff, not a silent re-review')

// The range is pinned to commits before any round runs, so every stub below
// answers the pin lane first. Nothing else about these cases changed: they
// still drive the default invocation, which still reviews and hands back.
//
// CF-145: with no phase in .claude/coder-fleet.json a project is in the build
// phase, which runs one round, fixes nothing itself and refutes only on
// sensitive paths. Every case written before that is about the full loop, so
// every stub pin below reports the main checkout's file set to harden, and
// those cases are the proof that harden behaves as review-round did before.
// The build phase has its own cases further down.
const HARDEN_CONFIG = { found: true, text: '{"phase": "harden"}', path: '/repo/.claude/coder-fleet.json' }
const PIN = {
  resolved: [{ role: 'base', ref: 'main', sha: 'ba5e0000' }, { role: 'head', ref: 'HEAD', sha: 'facef00d' }],
  worktrees: [{ path: '/repo', head: 'facef00d', dirty: false, isMain: true }],
  fleetConfig: HARDEN_CONFIG,
  commandsRun: ['git rev-parse'],
  couldNotRun: [],
}

// R04. coder fixed in its own worktree and the next round re-read the original
// range. The run must now stop and say what the lead has to do.
{
  const { result, calls } = await runWorkflow(
    'review-round.js',
    { range: 'main...feature/refresh', maxRounds: 3 },
    (prompt, opts) => {
      if (opts.label === 'pin refs') return PIN
      if (/git diff --stat/.test(prompt)) return { files: ['src/a.ts'], added: 10, removed: 2, commits: ['c'] }
      if (opts.agentType === 'coder-fleet:reviewer')
        return { verdict: 'changes requested', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'bug' }] }
      return { findings: [] }
    },
  )
  check('fix-stops-the-run', 'a blocking verdict stops for a fix handoff', result.stopped === 'fix handoff required', result.stopped)
  const spawnedCoder = calls.some((c) => c.opts.agentType === 'coder-fleet:coder')
  check('no-coder-spawned', 'and never commissions coder from inside the review', spawnedCoder === false, spawnedCoder)
  check(
    'fix-request-recorded',
    'the next step tells the lead what to record before another round',
    Boolean(result.history) && /new reviewed commit|fix commit|record the resulting/i.test(result.nextStep),
    result.nextStep,
  )
  check('range-reviewed-once', 'the same range is not reviewed twice in one run', result.roundsRun === 1, result.roundsRun)
}

// A clean verdict must still pass, or the workflow only knows how to stop.
{
  const { result } = await runWorkflow('review-round.js', { range: 'main...clean' }, (prompt, opts) => {
    if (opts.label === 'pin refs') return PIN
    if (/git diff --stat/.test(prompt)) return { files: ['src/a.ts'], added: 1, removed: 0, commits: ['c'] }
    if (opts.agentType === 'coder-fleet:reviewer') return { verdict: 'approve', summary: 'fine', findings: [] }
    return { findings: [] }
  })
  check('clean-run-passes', 'a clean verdict still reports clean', result.stopped === 'clean', result.stopped)
}

console.log('\nreview-round: a fix is a commit git can find, or the run stops')

// The loop is back, and everything it branches on comes from git rather than
// from coder saying so. These cases drive the real script with stubbed agents,
// so what they pin is the decision procedure: which worktree counts as the fix,
// what disqualifies it, and what the next round is pointed at.
//
// A handoff, as coder actually returns it when spawned without a schema - a
// plain string, per the probe of 10 September 2026.
function handoff({ done = [], notDone = ['None'], unverified = ['None'], decisions = ['None'] } = {}) {
  const sec = (h, items) => '## ' + h + '\n' + items.map((i) => '- ' + i).join('\n')
  return [
    sec('Done', done.length ? done : ['None']),
    sec('Not done', notDone),
    sec('Unverified', unverified),
    sec('Decisions needed', decisions),
  ].join('\n\n')
}

// The worktree and branch review-round cuts for round 1's fix of X-1, under
// the main checkout the default pin lane reports (CF-127). A workflow-spawned
// coder gets no harness isolation, so the script makes this one itself.
const FIXWT = '/repo/.claude/worktrees/review-round-X-1-r1'
const FIXBR = 'review-round/X-1-r1'

// What the worktree lane was asked for, read back out of its prompt so a stub
// can answer "created exactly that" without restating the naming rule.
function worktreeAsk(prompt) {
  const m = /worktree add "([^"]+)" -b "([^"]+)" ([0-9a-f]+)/.exec(prompt || '')
  return m ? { path: m[1], branch: m[2], at: m[3] } : null
}

const HINTS = ['worktree: ' + FIXWT, 'base-commit: aaa1111', 'head-commit: bbb2222']

// A responder with sane defaults that each case overrides. `over` is consulted
// first, so a case says only what makes it different.
function responder(over = {}) {
  const state = { round: 0, prompts: [] }
  const fn = (prompt, opts = {}) => {
    const label = opts.label || ''
    const type = opts.agentType
    state.prompts.push({ prompt, label, type, opts })
    for (const [k, v] of Object.entries(over)) {
      if (k === 'match') continue
      if (label === k || (k === 'coder' && type === 'coder-fleet:coder') || (k === 'reviewer' && type === 'coder-fleet:reviewer')) {
        return typeof v === 'function' ? v(prompt, opts, state) : v
      }
    }
    if (label === 'pin refs') {
      return {
        resolved: [{ role: 'base', ref: 'main', sha: 'ba5e0000' }, { role: 'head', ref: 'HEAD', sha: 'facef00d' }],
        worktrees: [{ path: '/repo', head: 'facef00d', dirty: false, isMain: true }],
        fleetConfig: HARDEN_CONFIG,
        commandsRun: ['git rev-parse'],
        couldNotRun: [],
      }
    }
    if (/git diff --stat/.test(prompt)) return { files: ['src/a.ts'], added: 10, removed: 2, commits: ['c'] }
    if (label === 'card gate') return { found: true, boardRead: true, criteriaCount: 3, evidence: 'acceptanceCriteriaCount: 3' }
    if (type === 'coder-fleet:reviewer') {
      state.round += 1
      return state.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'bug', why: 'w' }] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    }
    if (type === 'coder-fleet:coder') return handoff({ done: HINTS.concat('fixed src/a.ts') })
    // Under fix: true the refutation stage runs by default, so every FIX-based
    // case in this suite that says nothing about it still needs an answer -
    // one where nothing survived, since these cases are about the fix loop,
    // not about refutation.
    if (type === 'coder-fleet:refuter') return handoff({ done: ['ran 12 mutations, all killed'] })
    if (label === 'fix worktree') {
      const ask = worktreeAsk(prompt)
      if (!ask) return null
      state.fixWorktree = ask
      return { created: true, path: ask.path, branch: ask.branch, head: ask.at, gitDir: '/repo/.git/worktrees/' + ask.path.split('/').pop(), error: '', commandsRun: ['git worktree add'], couldNotRun: [] }
    }
    if (label === 'verify fix') {
      const wt = state.fixWorktree || { path: FIXWT, branch: FIXBR }
      return {
        headCommit: 'bbb2222',
        containsReviewedHead: true,
        dirty: false,
        filesChanged: ['src/a.ts'],
        commits: ['fix the bug'],
        worktreePath: wt.path, branch: wt.branch,
        isMain: false,
        candidates: ['bbb2222'],
        worktrees: [
          { path: '/repo', head: 'facef00d', dirty: false, isMain: true },
          { path: wt.path, head: 'bbb2222', branch: wt.branch, dirty: false, isMain: false },
        ],
      }
    }
    return { lane: /lint/.test(prompt) ? 'lint and format' : /type/.test(prompt) ? 'types and build' : /test/.test(prompt) ? 'tests' : 'obvious smells', ran: ['x'], findings: [] }
  }
  fn.state = state
  return fn
}

const FIX = { range: 'main...feature/refresh', issue: 'X-1', fix: true, maxRounds: 3 }

// --- the default path is untouched ------------------------------------------

{
  const r = responder()
  const { result, calls } = await runWorkflow('review-round.js', { range: 'main...feature/refresh', issue: 'X-1' }, r)
  check('fix-is-opt-in', 'without fix:true a blocking verdict still just hands off', result.stopped === 'fix handoff required', result.stopped)
  check('opt-in-spawns-no-coder', 'and commissions nobody', calls.every((c) => c.opts.agentType !== 'coder-fleet:coder'), calls.map((c) => c.opts.agentType))
}

// --- the transport, which is the whole reason this design exists -------------

{
  const r = responder()
  const { calls } = await runWorkflow('review-round.js', FIX, r)
  const coder = calls.find((c) => c.opts.agentType === 'coder-fleet:coder')
  check('coder-spawned', 'with fix:true the fix run happens', Boolean(coder), false)
  // A schema on a fleet agent deletes last_assistant_message, and with it the
  // handoff gate, the "## Done" card comment, and the only working route to the
  // human queue. coder is the agent most likely to raise a real blocker.
  check('coder-carries-no-schema', 'and carries no schema, so its handoff still reaches the hook', coder && coder.opts.schema === undefined, coder && coder.opts.schema)
  // Identified by phase, not by "has a schema and no agentType" - the four
  // mechanical lanes match that too, so the loose version passed even with an
  // agentType put back on both git lanes.
  const gitLanes = calls.filter((c) => c.opts.phase === 'git state')
  check('git-lanes-have-no-agent-type', 'while the git bookkeeping runs on lanes the matcher skips', gitLanes.length >= 2 && gitLanes.every((c) => !c.opts.agentType), gitLanes.map((c) => c.opts.agentType))
}

// --- pinning ----------------------------------------------------------------

{
  const r = responder()
  const { calls } = await runWorkflow('review-round.js', FIX, r)
  const verdict = calls.find((c) => c.opts.agentType === 'coder-fleet:reviewer')
  check('range-pinned-not-symbolic', 'the reviewed range is pinned to SHAs, so a moving branch cannot change it', verdict && /ba5e0000/.test(verdict.prompt) && /facef00d/.test(verdict.prompt), verdict && verdict.prompt.slice(0, 120))
}

{
  const r = responder({ 'pin refs': { resolved: [{ role: 'base', ref: 'main', sha: 'ba5e0000' }, { role: 'head', ref: 'HEAD', sha: '', error: 'unknown revision' }], worktrees: [], fleetConfig: HARDEN_CONFIG, commandsRun: [], couldNotRun: [] } })
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  check('pin-failure-stops-early', 'an unresolvable head stops before anything is reviewed', /does not resolve/.test(result.stopped || ''), result.stopped)
  check('pin-failure-spawns-nothing', 'and spawns no reviewer', calls.every((c) => c.opts.agentType !== 'coder-fleet:reviewer'), calls.length)
}

// --- a failed scope pass is not an empty diff -------------------------------

{
  const r = responder({ match: 1 })
  const { result } = await runWorkflow('review-round.js', FIX, (p, o, s) => (/git diff --stat/.test(p) ? null : r(p, o, s)))
  check('scope-failure-is-not-nothing-to-review', 'a scope pass that returned nothing is its own stop, not a clean review', result.stopped === 'scope pass returned nothing' && result.verdict !== 'nothing to review', [result.stopped, result.verdict])
}

// --- the main checkout is never the fix -------------------------------------

// The probe of 10 September 2026 found both agents running in the MAIN checkout,
// because the repo had no remote and worktree.baseRef defaults to branching from
// origin/<default-branch>. If coder is not isolated the main worktree's HEAD
// moves, it becomes the only candidate, ancestry passes, and the run would
// accept a commit made on the human's real working branch - inverting coder's own
// invariant that anything on a shared branch is out of scope.
{
  const r = responder({
    'verify fix': {
      headCommit: '', containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'], commits: [],
      isMain: true, candidates: [], worktrees: [{ path: '/repo', head: 'ccc3333', dirty: false, isMain: true }],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('main-worktree-is-not-a-candidate', 'a fix found only in the main checkout stops the run', result.stopped === 'fix not isolated', result.stopped)
  check('main-worktree-reason-names-it', 'and says the run was not isolated', /main checkout|not isolated/i.test(JSON.stringify(result.fixRequest || {})), result.fixRequest)
}

// Fixing "absent" is not fixing "lying". The flat isMain guarded the very
// cross-check that exists to check it, so a payload contradicting itself in one
// object - flat field says not-main, its own worktree list says that exact path
// IS main - was believed on the flat claim.
{
  const r = responder({
    'verify fix': {
      headCommit: 'bbb2222', worktreePath: FIXWT, branch: FIXBR, isMain: false, containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'],
      worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: true }],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('worktree-list-beats-the-flat-claim', 'a flat isMain:false does not override a worktree list that says otherwise', result.stopped === 'fix not isolated', result.stopped)
}
{
  const r = responder({
    'verify fix': {
      headCommit: 'bbb2222', worktreePath: FIXWT, branch: FIXBR, isMain: 'false', containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'],
      worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: 'true' }],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('string-flags-read-the-same-way', 'and the strings "true"/"false" read the same as the booleans everywhere', result.stopped === 'fix not isolated', result.stopped)
}

// The fail-OPEN direction on the two flags that had no case for it. `dirty` was
// pinned by string-dirty-stops; these were not.
for (const [name, patch] of [
  ['string-false-not-descendant-stops', { containsReviewedHead: 'false' }],
  ['string-true-is-main-stops', { isMain: 'true' }],
]) {
  const r = responder({
    'verify fix': Object.assign({
      headCommit: 'bbb2222', worktreePath: FIXWT, branch: FIXBR, isMain: false, containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'],
      worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: false }],
    }, patch),
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check(name, 'a flag arriving as a string is read for what it says, not for being a string', /unverified fix|not isolated/.test(result.stopped || ''), result.stopped)
}

// The flat field is the fallback for when the list has no entry for that path,
// and that path has to stay open - a lane may report a commit in a worktree the
// list call did not cover. It is a fallback, not the primary evidence.
{
  const r = responder({
    'verify fix': {
      headCommit: 'bbb2222', worktreePath: FIXWT, branch: FIXBR, isMain: false, containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'], worktrees: [],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('flat-flag-is-the-fallback', 'with no list entry for the path, an explicit isMain:false is accepted', result.stopped === 'clean', result.stopped)
}
{
  const r = responder({
    'verify fix': {
      headCommit: 'bbb2222', worktreePath: FIXWT, branch: FIXBR, containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'], worktrees: [],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('no-evidence-either-way-stops', 'and with neither a list entry nor a flat answer, the run stops', result.stopped === 'fix not isolated', result.stopped)
}

// git's own path is what the list reports, and macOS resolves /tmp to /private/tmp.
{
  const r = responder({
    'verify fix': {
      headCommit: 'bbb2222', worktreePath: FIXWT + '/', branch: FIXBR, containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'],
      worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: false }],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('trailing-slash-still-matches-the-list', 'a trailing slash does not stop the worktree list being found', result.stopped === 'clean', result.stopped)
}

// The dangerous shape, and the one a first pass at this test missed: the lane
// reports a REAL commit and says isMain. Mutation testing found that deleting
// the isMain guard in gateFix broke nothing, because the only case exercising
// it also had an empty headCommit, which the no-commit branch caught first.
{
  const r = responder({
    'verify fix': {
      headCommit: 'ccc3333', containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'],
      commits: ['fix'], isMain: true, worktreePath: '/repo', candidates: ['ccc3333'],
      worktrees: [{ path: '/repo', head: 'ccc3333', dirty: false, isMain: true }],
    },
  })
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  check('main-worktree-with-a-real-commit-stops', 'a real commit in the main checkout is still refused', result.stopped === 'fix not isolated', result.stopped)
  check('main-worktree-not-re-reviewed', 'and no second round reviews a commit on the shared branch', calls.filter((c) => c.opts.agentType === 'coder-fleet:reviewer').length === 1, calls.filter((c) => c.opts.agentType === 'coder-fleet:reviewer').length)
}

// isMain is optional in the verify schema, so a lane that simply omits it must
// not thereby prove isolation. The check is not "did anyone say main" but "can
// this run confirm the commit is NOT in the main checkout".
{
  const r = responder({
    'verify fix': {
      headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'],
      commits: ['c'], worktreePath: FIXWT, branch: FIXBR, candidates: ['bbb2222'], worktrees: [],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('unconfirmed-isolation-stops', 'a lane that never says whether the worktree is the main one does not get the benefit of the doubt', result.stopped === 'fix not isolated', result.stopped)
}

// The reviewed head abbreviated is still the reviewed head. Adopting it would
// re-point round two at the code round one already reviewed - the original bug
// this whole loop was removed for.
{
  const r = responder({
    'verify fix': {
      headCommit: 'facef00', containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'],
      commits: [], isMain: false, worktreePath: FIXWT, branch: FIXBR, candidates: ['facef00'], worktrees: [],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('abbreviated-reviewed-head-is-not-a-fix', 'an abbreviation of the reviewed commit is not a new commit', result.stopped === 'unverified fix', result.stopped)
}

// A reviewer's `blocking` is not guaranteed to be a boolean. Both naive
// readings are wrong, and one of them approves a merge.
{
  const r = responder({ reviewer: { verdict: 'request changes', summary: 's', findings: [{ blocking: 'true', file: 'src/a.ts', what: 'b', why: 'w' }] } })
  const { result } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, r)
  check('string-true-is-blocking', 'the string "true" is a blocking finding, not an approval', result.stopped === 'fix handoff required', result.stopped)
}
{
  const r = responder({ reviewer: { verdict: 'approve', summary: 's', findings: [{ blocking: 'false', file: 'src/a.ts', what: 'b', why: 'w' }] } })
  const { result } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, r)
  check('string-false-is-not-blocking', 'and the string "false" is not', result.stopped === 'clean', result.stopped)
}

// --- everything else that disqualifies a fix --------------------------------

const REJECTS = [
  ['no-commit-stops', { headCommit: '', candidates: [], containsReviewedHead: true, dirty: false, filesChanged: [], commits: [], worktrees: [] }, /no commit/i],
  ['ambiguous-candidates-stop', { headCommit: '', candidates: ['aaa1111', 'bbb2222'], containsReviewedHead: true, dirty: false, filesChanged: [], commits: [], worktrees: [] }, /more than one/i],
  ['not-descendant-stops', { headCommit: 'bbb2222', containsReviewedHead: false, forkPoint: 'origin1', dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, worktreePath: FIXWT, branch: FIXBR, worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: false }] }, /reviewed commit|forks at/i],
  ['dirty-worktree-stops', { headCommit: 'bbb2222', containsReviewedHead: true, dirty: true, filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, worktreePath: FIXWT, branch: FIXBR, worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: false }] }, /uncommitted|whole fix/i],
  ['untouched-files-stop', { headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: ['docs/x.md'], commits: ['c'], isMain: false, worktreePath: FIXWT, branch: FIXBR, worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: false }] }, /touches none/i],
]
for (const [name, verify, reason] of REJECTS) {
  const r = responder({ 'verify fix': verify })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  const said = JSON.stringify(result.fixRequest || {}) + (result.stopped || '')
  check(name, 'a fix git cannot vouch for stops the run', /unverified fix|not isolated/.test(result.stopped || '') && reason.test(said), [result.stopped, said.slice(0, 160)])
}

// --- path forms the reviewer might report ------------------------------------

// A reviewer's `file` is model text. If "./src/a.ts" or "src/a.ts:88" fails to
// match "src/a.ts" from git, the untouched-files rule fires on every legitimate
// fix and the loop never closes.
for (const reported of ['./src/a.ts', 'src/a.ts:88']) {
  const r = responder({
    reviewer: (p, o, s) => {
      s.round += 1
      return s.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: reported, what: 'bug', why: 'w' }] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('path-forms-still-match', 'a reviewer path form still matches what git reports: ' + reported, result.stopped === 'clean', [reported, result.stopped])
}

// Escalation is the lead's policy, written down here rather than in the
// reviewer's body, so the return has to say honestly whether it fired.
{
  const r = responder({ match: 1 })
  const { result, calls } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, (p, o, s) =>
    /git diff --stat/.test(p) ? { files: ['src/session-token.ts'], added: 3, removed: 1, commits: ['c'] } : r(p, o, s),
  )
  const verdict = calls.find((c) => c.opts.agentType === 'coder-fleet:reviewer')
  check('sensitive-paths-escalate', 'a sensitive path raises the verdict effort', verdict && verdict.opts.effort === 'max', verdict && verdict.opts.effort)
  check('sensitive-reported-honestly', 'and the run reports that it did, naming the file', result.sensitive === true && (result.sensitiveFiles || []).includes('src/session-token.ts'), [result.sensitive, result.sensitiveFiles])
}

// A suffix match is how an absolute path from a reviewer meets a repo-relative
// one from git. It must not become a licence to match on a bare basename: the
// gate's job is to check the fix touched the files the findings NAME, and
// "index.ts" matching every index.ts in the tree defeats exactly that.
{
  const r = responder({
    reviewer: (p, o, s) => {
      s.round += 1
      return s.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'index.ts', what: 'bug', why: 'w' }] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
    'verify fix': {
      headCommit: 'bbb2222', containsReviewedHead: true, dirty: false,
      filesChanged: ['packages/totally/unrelated/index.ts'], commits: ['c'], isMain: false,
      worktreePath: FIXWT, branch: FIXBR, candidates: ['bbb2222'], worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: false }],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('bare-basename-does-not-match-anywhere', 'a finding named only by basename does not match an unrelated file of that name', result.stopped === 'unverified fix', result.stopped)
}

// ...while the form it exists for still works.
{
  const r = responder({
    'verify fix': {
      headCommit: 'bbb2222', containsReviewedHead: true, dirty: false,
      filesChanged: ['/Users/human/repo/src/a.ts'], commits: ['c'], isMain: false,
      worktreePath: FIXWT, branch: FIXBR, candidates: ['bbb2222'], worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: false }],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('absolute-path-still-matches', 'an absolute path from one side still matches a repo-relative one from the other', result.stopped === 'clean', result.stopped)
}

// --- the loop actually closes ------------------------------------------------

{
  const r = responder()
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  check('clean-after-fix', 'a verified fix is re-reviewed and the run ends clean', result.stopped === 'clean' && result.roundsRun === 2, [result.stopped, result.roundsRun])
  check('fix-request-cleared', 'and the stale fix request is cleared once a fix is accepted', !result.fixRequest, result.fixRequest)
  check('fix-recorded', 'the accepted fix records the worktree and commit git found', result.fixes && result.fixes[0] && result.fixes[0].headCommit === 'bbb2222' && result.fixes[0].worktreePath === FIXWT, result.fixes)
  // Round two must read the fixed code, not the original range.
  const round2 = calls.filter((c) => c.opts.agentType === 'coder-fleet:reviewer')[1]
  check('range-repointed', 'round two reviews the fix commit and not the original range', round2 && /bbb2222/.test(round2.prompt) && !/feature\/refresh/.test(round2.prompt), round2 && round2.prompt.slice(0, 160))
  const round2Mech = calls.filter((c) => !c.opts.agentType && c.opts.schema && /Round 2/.test(c.prompt))
  check('mech-lanes-follow-the-fix', 'and the mechanical lanes run in the fix worktree, not the original checkout', round2Mech.length > 0 && round2Mech.every((c) => c.prompt.includes(FIXWT)), round2Mech.length)
}

// --- git hints are hints -----------------------------------------------------

{
  const r = responder({ coder: handoff({ done: ['fixed it'] }) })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('hints-optional', 'a handoff with no hint bullets still verifies from git alone', result.stopped === 'clean', result.stopped)
}

{
  const r = responder({ coder: handoff({ done: ['worktree: ' + FIXWT, 'head-commit: deadbee', 'fixed it'] }) })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  // The claimed sha appears in coderSaid verbatim whatever happens, so assert
  // on claimMismatch itself or this passes with the disagreement discarded.
  const mismatch = (result.fixes[0] || {}).claimMismatch || []
  check('hint-mismatch-git-wins', 'when coder claims a different commit, git decides', result.fixes[0] && result.fixes[0].headCommit === 'bbb2222', result.fixes[0])
  check('hint-mismatch-recorded', 'and the disagreement is recorded rather than discarded', mismatch.some((m) => /headCommit/.test(m) && /deadbee/.test(m)), mismatch)
}

// --- the fix lane cuts its own worktree (CF-127) -----------------------------
//
// A workflow agent() spawn with agentType coder-fleet:coder does not get the
// type's isolation: worktree. In the live run wf_1297e8b7-cb8 the fix-lane coder
// started in the main checkout and only its scope guard kept it off main. So a
// git lane cuts the worktree before the coder starts, the coder is told to work
// there and nowhere else, and git has to find the fix on that worktree's branch.

const fixLaneCoder = (calls) => calls.some((c) => c.opts.agentType === 'coder-fleet:coder')

{
  const r = responder()
  const { calls } = await runWorkflow('review-round.js', FIX, r)
  const wtAt = calls.findIndex((c) => c.opts.label === 'fix worktree')
  const coderAt = calls.findIndex((c) => c.opts.agentType === 'coder-fleet:coder')
  check('worktree-lane-before-coder', 'a git lane cuts the fix worktree before the coder is spawned', wtAt >= 0 && coderAt > wtAt, [wtAt, coderAt])
  const wt = calls[wtAt] || { opts: {}, prompt: '' }
  check('worktree-lane-is-a-git-lane', 'and it is an untyped git lane, like the others', !wt.opts.agentType && wt.opts.phase === 'git state' && Boolean(wt.opts.schema), wt.opts)
  const ask = worktreeAsk(wt.prompt)
  check('worktree-cut-at-pinned-head', 'on a new branch named from the issue and round, under .claude/worktrees/, at the pinned head', Boolean(ask) && ask.path === FIXWT && ask.branch === FIXBR && ask.at === 'facef00d', ask)
  check('worktree-lane-never-forces', 'and the lane is told never to reuse or force an existing branch', /already exists/i.test(wt.prompt) && !/(^|\s)-B\s/.test(wt.prompt) && /never pass --force|do not pass --force/i.test(wt.prompt), wt.prompt.slice(0, 300))
  const coder = calls[coderAt] || { prompt: '' }
  check('coder-prompt-names-worktree', 'the coder prompt names the worktree and says to work only there', coder.prompt.includes(FIXWT) && /only in|nowhere else/i.test(coder.prompt), coder.prompt.slice(0, 400))
  check('coder-prompt-names-branch', 'and the branch it is on, so the coder does not cut another', coder.prompt.includes(FIXBR) && !/git switch -c/.test(coder.prompt), coder.prompt.slice(0, 400))
  const verify = calls.find((c) => c.opts.label === 'verify fix') || { prompt: '' }
  check('verify-told-the-worktree', 'the verify lane is told which worktree and branch the fix belongs on', verify.prompt.includes(FIXWT) && verify.prompt.includes(FIXBR), verify.prompt.slice(0, 300))
}

// A failed worktree creation commissions nobody. Every way the lane can fail to
// vouch for the worktree it was asked for is a failure.
// Each row breaks exactly one thing and leaves the rest as a good lane would
// report it, so no row passes on the strength of a different check.
const FIXGD = '/repo/.git/worktrees/review-round-X-1-r1'
const GOOD_CUT = { created: true, path: FIXWT, branch: FIXBR, head: 'facef00d', gitDir: FIXGD, error: '' }
const { created: _created, ...CUT_NO_CREATED } = GOOD_CUT
const { gitDir: _gitDir, ...CUT_NO_GITDIR } = GOOD_CUT
for (const [name, lane] of [
  ['returned-nothing', null],
  ['branch-exists', { created: false, path: '', branch: FIXBR, head: '', gitDir: '', error: "fatal: a branch named '" + FIXBR + "' already exists" }],
  ['created-false-otherwise-whole', { ...GOOD_CUT, created: false, error: "fatal: '" + FIXWT + "' already exists" }],
  ['string-false', { ...GOOD_CUT, created: 'false' }],
  ['created-absent', CUT_NO_CREATED],
  ['other-path', { ...GOOD_CUT, path: '/repo' }],
  ['other-branch', { ...GOOD_CUT, branch: 'main' }],
  ['other-head', { ...GOOD_CUT, head: 'ccc3333' }],
  ['head-not-a-sha', { ...GOOD_CUT, head: 'facef00d-ish' }],
  ['no-head', { ...GOOD_CUT, head: '' }],
  ['not-linked', { ...GOOD_CUT, gitDir: '/repo/.git' }],
  ['no-git-dir', CUT_NO_GITDIR],
]) {
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({ 'fix worktree': lane }))
  check('worktree-failure-no-coder:' + name, 'a worktree the lane cannot vouch for spawns no coder', !fixLaneCoder(calls), calls.map((c) => c.opts.label))
  check('worktree-failure-stops:' + name, 'and stops by name, not as an approval', result.stopped === 'fix worktree not created' && result.approved === false, [result.stopped, result.approved])
  check('worktree-failure-carries-why:' + name, 'and says why in fixRequest', Boolean(result.fixRequest && result.fixRequest.worktreeReason), result.fixRequest)
}
// The control: the row every case above breaks one thing of is itself enough.
{
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({ 'fix worktree': GOOD_CUT }))
  check('worktree-good-cut-spawns-coder', 'the lane reporting exactly the worktree it was asked for starts the coder', fixLaneCoder(calls) && result.stopped !== 'fix worktree not created', result.stopped)
}

{
  const { result } = await runWorkflow('review-round.js', FIX, responder({ 'fix worktree': { created: false, path: '', branch: FIXBR, head: '', error: "fatal: a branch named '" + FIXBR + "' already exists" } }))
  check('branch-exists-next-step', 'an existing branch is a stop, and the next step says to adopt or prune it', /already exists|adopt|prune/i.test(result.nextStep || '') && (result.nextStep || '').includes(FIXBR), result.nextStep)
}

// No main checkout in the pinned worktree list: nowhere to cut the worktree
// under, so neither the worktree lane nor a coder runs. Since CF-145 the run
// stops before the fix lane: with no main checkout no config is believed, so
// the phase is build, which hands the fix back rather than commissioning it.
{
  const r = responder({ 'pin refs': { resolved: [{ role: 'base', ref: 'main', sha: 'ba5e0000' }, { role: 'head', ref: 'HEAD', sha: 'facef00d' }], worktrees: [], fleetConfig: HARDEN_CONFIG, commandsRun: [], couldNotRun: [] } })
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  check('no-main-checkout-no-coder', 'with no main checkout on record the fix lane spawns no coder', !fixLaneCoder(calls) && !calls.some((c) => c.opts.label === 'fix worktree') && result.stopped === 'fix handoff required' && result.phase === 'build' && result.fleetConfig.state === 'unread', [result.stopped, result.phase, calls.map((c) => c.opts.label)])
}

// The fix has to be on the worktree this run created, not just on some
// isolated worktree.
for (const [name, patch] of [
  ['another-worktree', { worktreePath: '/w/other', branch: FIXBR, worktrees: [{ path: '/w/other', head: 'bbb2222', branch: FIXBR, dirty: false, isMain: false }] }],
  ['another-branch', { branch: 'fix/r1' }],
  ['no-branch', { branch: '' }],
]) {
  const r = responder({
    'verify fix': Object.assign({
      headCommit: 'bbb2222', worktreePath: FIXWT, branch: FIXBR, isMain: false, containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'],
      worktrees: [{ path: FIXWT, head: 'bbb2222', branch: FIXBR, dirty: false, isMain: false }],
    }, patch),
  })
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  check('fix-off-the-worktree-stops:' + name, 'a commit that is not on the created worktree\'s branch is not adopted', result.stopped === 'unverified fix' && /review-round\/X-1-r1|created/.test(String((result.fixRequest || {}).unverifiedReason)), [result.stopped, result.fixRequest && result.fixRequest.unverifiedReason])
  check('fix-off-the-worktree-not-re-reviewed:' + name, 'and no second round reviews it', calls.filter((c) => c.opts.agentType === 'coder-fleet:reviewer').length === 1, calls.length)
}

// Each fix round cuts its own worktree, at the head that round reviewed.
{
  const r = responder({ reviewer: { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'b', why: 'w' }] } })
  let n = 0
  const inner = (p, o, s) => {
    if (o.label === 'verify fix') {
      n += 1
      // Falls back rather than throwing, so a script that cut no worktree
      // fails this check by name instead of aborting every check after it.
      const ask = r.state.fixWorktree || { path: FIXWT, branch: FIXBR }
      return { headCommit: 'abc000' + n, containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, worktreePath: ask.path, branch: ask.branch, candidates: [], worktrees: [{ path: ask.path, head: 'abc000' + n, branch: ask.branch, dirty: false, isMain: false }] }
    }
    return r(p, o, s)
  }
  const { calls } = await runWorkflow('review-round.js', { ...FIX, maxRounds: 3 }, inner)
  const asks = calls.filter((c) => c.opts.label === 'fix worktree').map((c) => worktreeAsk(c.prompt))
  check('worktree-per-round', 'round two cuts a fresh r2 worktree at the commit round two reviewed', asks.length === 2 && asks[1] && asks[1].branch === 'review-round/X-1-r2' && asks[1].path === '/repo/.claude/worktrees/review-round-X-1-r2' && asks[1].at === 'abc0001', asks)
}

// The worktree is left behind for the lead, and the result says so.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder())
  check('worktree-left-for-the-lead', 'a run that cut a worktree names it and says it was left to adopt or prune', result.stopped === 'clean' && (result.nextStep || '').includes(FIXWT) && /prune-worktrees/.test(result.nextStep || ''), result.nextStep)
  check('worktree-in-the-result', 'and the result lists it', Array.isArray(result.fixWorktrees) && result.fixWorktrees.some((w) => w.path === FIXWT && w.branch === FIXBR), result.fixWorktrees)
}
{
  const r = responder({ 'verify fix': { headCommit: '', candidates: [], containsReviewedHead: true, dirty: false, filesChanged: [], commits: [], worktrees: [] } })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('worktree-named-on-a-stop', 'and a stopped run names it too', result.stopped === 'unverified fix' && (result.nextStep || '').includes(FIXWT), result.nextStep)
}

// --- the tests lane is found by name, never by position ----------------------

{
  // parallel() ordering in the real loader is unproven, and the `lane` field is
  // whatever the model wrote, so neither may decide which result is the tests
  // lane. Deliberately mislabelled: the lane the workflow ran as tests reports
  // itself as 'obvious smells' with a clean run, and the smells lane reports
  // itself as 'tests' with a finding. Only the name the workflow stamps inside
  // each lane's own task settles the previous fix's test claims from the lane
  // that actually ran the tests.
  const r = responder({})
  const inner = (p, o, s) => {
    if (!o.agentType && o.schema && /Mechanical review pass/.test(p)) {
      if (/Run the test suite/.test(p)) return { lane: 'obvious smells', ran: ['pnpm test'], findings: [] }
      if (/a linter misses/.test(p)) return { lane: 'tests', ran: ['x'], findings: [{ file: 'src/a.ts', what: 'smell' }] }
      return { lane: 'lint and format', ran: ['x'], findings: [] }
    }
    return r(p, o, s)
  }
  const { result } = await runWorkflow('review-round.js', FIX, inner)
  check('test-claims-settled-by-lane-name', 'the previous fix’s test claims are settled by the lane the workflow ran as tests, whatever it calls itself', result.fixes && result.fixes[0] && result.fixes[0].testResults && result.fixes[0].testResults.verified === true, result.fixes && result.fixes[0] && result.fixes[0].testResults)
}

// --- the card gate -----------------------------------------------------------
//
// The fleet has no plans: a coder builds from the board card, so fix: true
// commissions nobody until the card named by `issue` exists and carries at
// least one acceptance criterion. Every way that can fail stops by name, and a
// gate lane that says nothing is not a yes.

const coderSpawned = (calls) => calls.some((c) => c.opts.agentType === 'coder-fleet:coder')
const cardGateCalls = (calls) => calls.filter((c) => c.opts.label === 'card gate')

{
  const r = responder()
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  const gate = cardGateCalls(calls)
  check('card-gate-runs-board', 'the card gate reads the card through the plugin shim', gate.length >= 1 && usesShim(gate[0].prompt) && /task view X-1 --json/.test(gate[0].prompt), gate.map((c) => c.prompt))
  check('card-gate-then-coder', 'and a card with criteria commissions the fix', coderSpawned(calls) && result.fixes.length >= 1, result.stopped)
}

{
  const r = responder({ 'card gate': { found: true, criteriaCount: 0, evidence: 'acceptanceCriteriaCount: 0' } })
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  check('no-criteria-no-coder', 'a card with no acceptance criteria commissions nobody', !coderSpawned(calls), calls.map((c) => c.opts.agentType))
  check('no-criteria-stop-named', 'and stops for the criteria, saying so', result.stopped === 'no acceptance criteria' && /acceptanceCriteriaCount: 0/.test(JSON.stringify(result.fixRequest || {})), [result.stopped, result.fixRequest])
  check('no-criteria-next-step', 'and tells the human to add them', /the card X-1 has no acceptance criteria - add them, then run again/i.test(result.nextStep || ''), result.nextStep)
}

{
  // The eval harness has never once applied a schema, so no value the
  // workflow branches on can be trusted to be the type it asked for.
  for (const [name, gate] of [
    ['string-zero', { found: true, criteriaCount: '0', evidence: 'e' }],
    ['boolean-count', { found: true, criteriaCount: true, evidence: 'e' }],
    ['missing-count', { found: true, evidence: 'e' }],
    ['negative-count', { found: true, criteriaCount: -2, evidence: 'e' }],
  ]) {
    const { result, calls } = await runWorkflow('review-round.js', FIX, responder({ 'card gate': gate }))
    check('uncounted-criteria-no-coder:' + name, 'a count that is not a positive number is not a criterion', !coderSpawned(calls) && result.stopped === 'no acceptance criteria', result.stopped)
  }
}

{
  for (const [name, gate] of [
    ['false', { found: false, boardRead: true, criteriaCount: 3, evidence: 'no task X-1' }],
    ['string-false', { found: 'false', boardRead: true, criteriaCount: 3, evidence: 'no task X-1' }],
    ['absent', { boardRead: true, criteriaCount: 3, evidence: 'no task X-1' }],
    // Only a real true, or the string "true", is a found card: "not found" is
    // not a yes because it is a non-empty string.
    ['not-found-string', { found: 'not found', boardRead: true, criteriaCount: 3, evidence: 'no task X-1' }],
  ]) {
    const { result, calls } = await runWorkflow('review-round.js', FIX, responder({ 'card gate': gate }))
    check('no-card-no-coder:' + name, 'a card the board does not have commissions nobody', !coderSpawned(calls) && result.stopped === 'no card', result.stopped)
  }
}

{
  const r = responder({ 'card gate': null })
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  check('silent-card-gate-no-coder', 'a card gate that returned nothing commissions nobody', !coderSpawned(calls), calls.map((c) => c.opts.agentType))
  check('silent-card-gate-stop-named', 'and is its own stop reason, not a yes', result.stopped === 'card gate returned nothing' && result.approved === false, [result.stopped, result.approved])
}

{
  const r = responder()
  const { result, calls } = await runWorkflow('review-round.js', { range: 'main...feature/refresh', fix: true }, r)
  check('no-issue-no-coder', 'fix: true with no issue commissions nobody', !coderSpawned(calls), calls.map((c) => c.opts.agentType))
  check('no-issue-no-gate-lane', 'and spends nothing looking for a card it cannot name', cardGateCalls(calls).length === 0, calls.map((c) => c.opts.label))
  check('no-issue-stop-named', 'and stops for the issue, saying so', result.stopped === 'no issue named', result.stopped)
}

{
  const { calls } = await runWorkflow('review-round.js', FIX, responder({ 'card gate': { found: true, boardRead: true, criteriaCount: '3', evidence: 'acceptanceCriteriaCount: 3' } }))
  check('string-count-passes', 'a count reported as the string "3" is three criteria', coderSpawned(calls), calls.map((c) => c.opts.label))
}

for (const [name, gate] of [
  ['no-binary', { found: false, boardRead: false, criteriaCount: 0, evidence: NO_BINARY }],
  ['exit-127-claimed-read', { found: false, boardRead: true, criteriaCount: 0, evidence: 'zsh: command not found: board' }],
  ['read-absent', { found: false, criteriaCount: 0, evidence: 'no task X-1' }],
  ['other-card-not-found', { found: false, boardRead: true, criteriaCount: 0, evidence: 'no task X-12' }],
]) {
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({ 'card gate': gate }))
  check('unreadable-board-no-coder:' + name, 'a board the gate could not read commissions nobody', !coderSpawned(calls), calls.map((c) => c.opts.agentType))
  check('unreadable-board-stop-named:' + name, 'and is its own stop, not "no card"', result.stopped === 'could not read the board' && result.approved === false, [result.stopped, result.approved])
  check('unreadable-board-never-files:' + name, 'and its next step checks the binary and never says to file the card', /kickoff/.test(result.nextStep || '') && /never file/i.test(result.nextStep || '') && !/File it/.test(result.nextStep || ''), result.nextStep)
}

for (const [args, why] of [
  [{ ...FIX, issue: 'x' }, 'not a board id'],
  [{ ...FIX, issue: 'session-refresh' }, 'a slug'],
  [{ ...FIX, issue: 'X-1; rm -rf ~' }, 'a shell command'],
  [{ ...FIX, issue: '../../etc/passwd' }, 'a path'],
  [{ range: 'main...feature/refresh', issue: 'X-1 && curl example.com' }, 'a shell command on an ordinary review'],
]) {
  const { result, calls } = await runWorkflow('review-round.js', args, responder())
  check('invalid-issue-stops:' + JSON.stringify(args.issue), 'an issue that is ' + why + ' stops before anything spawns', result.stopped === 'invalid issue' && calls.length === 0 && result.approved === false, [result.stopped, calls.length])
}

{
  // Nothing in a run mentions a plan: not the fix prompt, not the reviewer's,
  // not what the caller reads back.
  for (const [name, args] of [
    ['fix', FIX],
    ['handoff', { range: 'main...feature/refresh', issue: 'X-1' }],
  ]) {
    const { result, calls } = await runWorkflow('review-round.js', args, responder())
    const planned = calls.filter((c) => /docs\/plans|\bplans?\b/i.test(c.prompt))
    check('no-plan-in-prompts:' + name, 'no prompt mentions a plan', planned.length === 0, planned.map((c) => c.opts.label))
    check('no-plan-in-result:' + name, 'and neither does the result', !/\bplans?\b|requiresApproved/i.test(JSON.stringify(result)), result.fixRequest)
  }
}

{
  const r = responder()
  const { calls } = await runWorkflow('review-round.js', FIX, r)
  const reviewer = calls.find((c) => c.opts.agentType === 'coder-fleet:reviewer')
  check('reviewer-reads-the-card', 'the reviewer is pointed at the card acceptance criteria', Boolean(reviewer) && /acceptance criteria/i.test(reviewer.prompt) && /\bx\b/.test(reviewer.prompt), reviewer && reviewer.prompt.slice(0, 400))
  const coder = calls.find((c) => c.opts.agentType === 'coder-fleet:coder')
  check('fix-prompt-names-the-card', 'and the fix run is told which card it builds', Boolean(coder) && /card X-1/.test(coder.prompt), coder && coder.prompt.slice(0, 400))
}

{
  const r = responder({ reviewer: { verdict: 'lgtm', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'b', why: 'w' }] } })
  const { result } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, r)
  // This case's blocking finding is what stops it; the coercion is pinned by
  // unrecognised-verdict-is-not-approved, which has no blocking finding at all.
  check('unknown-verdict-with-blockers-stops', 'an unrecognised verdict with blocking findings is not an approval', result.stopped !== 'clean' && result.approved === false, [result.stopped, result.approved])
}

// --- coder failures ----------------------------------------------------------

{
  const r = responder({ coder: null })
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  check('coder-null-stops', 'a fix run that returned nothing stops rather than re-reviewing', /returned nothing/.test(result.stopped || ''), result.stopped)
  check('coder-null-skips-verify', 'and does not verify a run that did not happen', calls.every((c) => c.opts.label !== 'verify fix'), calls.map((c) => c.opts.label))
}

{
  const r = responder({ coder: handoff({ done: HINTS, decisions: ['Blocker: Refresh TTL unspecified'] }) })
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  check('coder-blocker-stops', 'a blocker from the fix run stops the loop', result.stopped === 'coder raised a blocker', result.stopped)
  check('coder-blocker-recorded', 'and the blocker text is carried back', /Refresh TTL/.test(JSON.stringify(result.fixRequest || {})), result.fixRequest)
  // The human is being told they are needed. They must also be told where to look.
  check('coder-blocker-still-locates-the-work', 'and the run still says where the commits are', calls.some((c) => c.opts.label === 'verify fix'), calls.map((c) => c.opts.label))
}

// --- the cap is not an approval ----------------------------------------------

{
  const r = responder({ reviewer: { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'b', why: 'w' }] } })
  const { result, calls } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1', fix: true, maxRounds: 2 }, r)
  check('cap-not-approval', 'a run that hits the cap is not an approval', result.stopped === 'round cap' && !/approve/.test(result.verdict || ''), [result.stopped, result.verdict])
  const coders = calls.filter((c) => c.opts.agentType === 'coder-fleet:coder').length
  check('cap-commissions-no-final-fix', 'and never commissions a fix it could not review', coders === 1, coders)
}

{
  const r = responder()
  const { result, calls } = await runWorkflow('review-round.js', { range: 'main...x', round: 4, maxRounds: 3, fix: true }, r)
  check('explicit-round-past-cap', 'a round past the cap spawns nothing at all', result.stopped === 'round cap' && calls.length === 0, [result.stopped, calls.length])
}

// --- every stop reason has somewhere to send the human -----------------------

{
  const seen = new Set()
  for (const [args, over] of [
    [{ range: 'main...x', issue: 'X-1' }, {}],
    [{ range: 'main...x', issue: 'X-1', fix: true }, {}],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { coder: null }],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { 'card gate': { found: false, boardRead: true, criteriaCount: 0, evidence: 'no task X-1' } }],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { 'card gate': { found: true, criteriaCount: 0, evidence: 'acceptanceCriteriaCount: 0' } }],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { 'card gate': null }],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { 'card gate': { found: false, boardRead: false, criteriaCount: 0, evidence: NO_BINARY } }],
    [{ range: 'main...x', issue: 'x', fix: true }, {}],
    [{ range: 'main...x', fix: true }, {}],
    [{ range: 'main...x', issue: 'X-1', fix: true, maxRounds: 2 }, { reviewer: { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'b', why: 'w' }] } }],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { reviewer: null }],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { 'fix worktree': null }],
  ]) {
    const { result } = await runWorkflow('review-round.js', args, responder(over))
    seen.add(result.stopped + '|' + (result.nextStep || ''))
  }
  const generic = [...seen].filter((s) => /The review is incomplete/.test(s))
  check('nextStep-covers-every-stop', 'no stop reason falls through to the generic next step', generic.length === 0, generic)
}

console.log('\nreview-round: what the caller reads, and what bounds the spend')

// `approved` is the field a caller gates a merge on, and until now nothing
// asserted it: hard-coding it true left all 65 checks green. Every stop reason
// gets pinned, not just the clean one.
{
  const cases = [
    [{ range: 'main...x', issue: 'X-1' }, {}, false, 'a blocking handoff'],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { coder: null }, false, 'a fix run that returned nothing'],
    [{ range: 'main...x', issue: 'X-1', fix: true, maxRounds: 2 }, { reviewer: { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'b', why: 'w' }] } }, false, 'the round cap'],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { reviewer: null }, false, 'a silent reviewer'],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { 'card gate': { found: false, boardRead: true, criteriaCount: 0, evidence: 'no task X-1' } }, false, 'no card'],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { 'card gate': { found: true, criteriaCount: 0, evidence: 'e' } }, false, 'a card with no criteria'],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { 'card gate': null }, false, 'a silent card gate'],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { 'card gate': { found: false, boardRead: false, criteriaCount: 0, evidence: NO_BINARY } }, false, 'a board nobody could read'],
    [{ range: 'main...x', fix: true }, {}, false, 'no issue named'],
    [{ range: 'main...x', issue: 'X-1', fix: true }, { 'fix worktree': null }, false, 'a fix worktree that was not created'],
  ]
  for (const [args, over, want, why] of cases) {
    const { result } = await runWorkflow('review-round.js', args, responder(over))
    check('approved-false-on-' + result.stopped.replace(/\s+/g, '-'), 'approved is false after ' + why, result.approved === want, [result.stopped, result.approved])
  }
  const { result: clean } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, responder({ reviewer: { verdict: 'approve', summary: 'fine', findings: [] } }))
  check('approved-true-only-when-approved', 'and true only when a reviewer actually approved', clean.approved === true, [clean.stopped, clean.approved])
}

// A verdict nobody recognises is coerced to the strict end, so the run must not
// then report itself approved. The output object contradicting itself is worse
// than either answer.
{
  const r = responder({ reviewer: { verdict: 'looks fine to me', summary: 's', findings: [] } })
  const { result } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, r)
  check('unrecognised-verdict-is-not-approved', 'an unrecognised verdict does not come back as an approval', result.approved === false, [result.verdict, result.approved])
}

// The cap is the only thing bounding what this workflow spends. `|| 3` accepts
// any truthy value, so a string made every comparison NaN-false and the loop
// commissioned coder for ever.
{
  // A fresh commit every round, so nothing but the cap can end this loop.
  let n = 0
  const r = responder({
    reviewer: { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'b', why: 'w' }] },
    'verify fix': () => {
      n += 1
      return { headCommit: 'abc' + String(n).padStart(4, '0'), containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, worktreePath: '/w/' + n, candidates: ['x'], worktrees: [] }
    },
  })
  const { result, calls } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1', fix: true, maxRounds: 'three' }, r)
  check('non-numeric-cap-refused', 'a cap that is not a number stops the run rather than removing the bound', /cap/i.test(result.stopped || '') || result.roundsRun <= 3, [result.stopped, result.roundsRun])
  check('non-numeric-cap-is-bounded', 'and nothing runs away', calls.length < 40, calls.length)
}
{
  const r = responder()
  const { result } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1', round: '2' }, r)
  check('string-round-is-a-number', 'a round number arriving as a string is still a number', typeof result.roundsRun === 'number' && (result.history[0] || {}).round === 2, result.history && result.history[0])
}

console.log('\nreview-round: input it does not understand is refused, and a branch is a target')

// CF-3 #1. A key the script does not read used to be dropped without a word, so
// { target } reviewed HEAD~1...HEAD and the verdict read as if it were about the branch.
{
  let spawned = 0
  const { error } = await tryRun('review-round.js', { range: 'main...x', phase: 1, foo: true }, () => {
    spawned += 1
    return null
  })
  const m = error ? error.message : ''
  check('unknown-key-throws', 'an unknown top-level key is an error naming each one', Boolean(error) && /phase/.test(m) && /foo/.test(m), m)
  check('unknown-key-lists-accepted', 'the error lists the accepted keys', ['range', 'base', 'head', 'target', 'issue', 'maxRounds', 'fix', 'refute', 'round'].every((k) => m.includes(k)), m)
  check('unknown-key-spawns-nothing', 'and it is raised before any agent runs', spawned === 0, spawned)
}
{
  const { error } = await tryRun('review-round.js', { range: 'main...x', issue: 'X-1', fix: false, refute: false, maxRounds: 2, round: 1 }, responder())
  check('known-keys-not-rejected', 'every key the script reads is accepted', !error || !/does not accept/.test(error.message), error && error.message)
}

// CF-3 #3. target names the thing to review; a range names it too. Two answers are not a precedence rule.
for (const other of [{ range: 'main...x' }, { base: 'main' }, { head: 'x' }]) {
  let spawned = 0
  const { error } = await tryRun('review-round.js', { target: 'feature/b', ...other }, () => {
    spawned += 1
    return null
  })
  const key = Object.keys(other)[0]
  check('target-conflict-throws:' + key, 'target with ' + key + ' is an error naming both', Boolean(error) && /"target" together with/.test(error.message) && error.message.includes('"' + key + '"'), error && error.message)
  check('target-conflict-spawns-nothing:' + key, 'raised before any agent runs', spawned === 0, spawned)
}

// CF-3 #2. target resolves to <default>...<target>, and the result says so.
// The stub answers for the branch the prompt asked about (`over.ask`, default
// feature/b) and gives any other prompt shas that could never pass for it, so a
// script that ignored `target` cannot be rescued by a stub that always agrees.
// tryRun drops `calls` when the script throws, so a case that must prove nothing
// but the pin lane ran counts them itself.
function counting(fn) {
  const labels = []
  const wrapped = (prompt, opts, state) => {
    labels.push((opts && opts.label) || '')
    return fn(prompt, opts, state)
  }
  wrapped.labels = labels
  return wrapped
}
function targetPin(over = {}) {
  return (prompt) => {
    const asked = prompt.includes('"' + (over.ask || 'feature/b') + '^{commit}"')
    return {
    defaultBranch: over.defaultBranch === undefined ? 'main' : over.defaultBranch,
    resolved: [
      { role: 'base', ref: over.noRef ? undefined : over.baseRef || 'main', sha: asked ? 'ba5e0000' : 'dec0de01' },
      { role: 'head', ref: over.noRef ? undefined : over.headRef || over.ask || 'feature/b', sha: asked ? (over.headSha === undefined ? 'facef00d' : over.headSha) : 'dec0de02', error: over.headError },
    ],
    worktrees: [{ path: '/repo', head: 'facef00d', dirty: false, isMain: true }],
    fleetConfig: HARDEN_CONFIG,
    commandsRun: [],
    couldNotRun: [],
    }
  }
}
{
  const r = responder({ 'pin refs': targetPin() })
  const { result, calls } = await runWorkflow('review-round.js', { target: 'feature/b', issue: 'X-1' }, r)
  const pin = calls.find((c) => c.opts.label === 'pin refs')
  check('target-resolves-range', 'target reviews the default branch against the branch', result.range === 'main...feature/b', result.range)
  check('target-echoed', 'and the result names the target', result.target === 'feature/b', result.target)
  check('target-pin-asks-for-branch', 'the pin lane is asked about the branch', Boolean(pin) && pin.prompt.includes('feature/b'), pin && pin.prompt)
  check('target-pin-asks-default', 'and asked to find the default branch', Boolean(pin) && /default branch/i.test(pin.prompt), pin && pin.prompt)
  check('target-reviews-pinned', 'the review runs on the pinned range', result.reviewedRange === 'ba5e0000...facef00d', result.reviewedRange)
}

// CF-3 #4. A branch that is not there is an error naming it before the review, never HEAD~1...HEAD.
{
  const r = counting(responder({ 'pin refs': targetPin({ ask: 'nope/gone', headSha: '', headError: 'unknown revision' }) }))
  const { error } = await tryRun('review-round.js', { target: 'nope/gone' }, r)
  const calls = r.labels.map((label) => ({ opts: { label } }))
  check('missing-target-throws', 'a target that does not exist is an error naming it', Boolean(error) && error.message.includes('nope/gone') && /does not exist/.test(error.message), error && error.message)
  check('missing-target-no-review', 'and no review lane runs', calls.length === 1 && calls[0].opts.label === 'pin refs', calls.map((c) => c.opts.label))
}
for (const bad of ['x; rm -rf /', 'a..b', '--all', '-foo', '--git-dir/tmp/x', 'a@{1}', '', null, 42, ['a']]) {
  let spawned = 0
  const { error } = await tryRun('review-round.js', { target: bad }, () => {
    spawned += 1
    return null
  })
  check('target-shape-refused:' + JSON.stringify(bad), 'a target that is not a branch name is refused', Boolean(error) && /"target" is/.test(error.message), error && error.message)
  check('target-shape-spawns-nothing:' + JSON.stringify(bad), 'before any agent runs', spawned === 0, spawned)
}

// The default branch comes from the lane and reaches the range, so it is held to the same shape.
for (const defaultBranch of ['', '$(touch x)']) {
  const r = counting(responder({ 'pin refs': targetPin({ defaultBranch }) }))
  const { error } = await tryRun('review-round.js', { target: 'feature/b' }, r)
  const calls = r.labels.map((label) => ({ opts: { label } }))
  check('bad-default-branch-throws:' + JSON.stringify(defaultBranch), 'an empty or malformed default branch stops the run', Boolean(error) && /could not find the default branch/.test(error.message), error && error.message)
  check('bad-default-branch-no-review:' + JSON.stringify(defaultBranch), 'before any review lane', calls.length === 1, calls.map((c) => c.opts.label))
}

// A lane that answers about some other ref is not an answer about the target.
for (const [name, over] of [['head', { headRef: 'other' }], ['base', { baseRef: 'develop' }]]) {
  const r = counting(responder({ 'pin refs': targetPin(over) }))
  const { error } = await tryRun('review-round.js', { target: 'feature/b' }, r)
  const calls = r.labels.map((label) => ({ opts: { label } }))
  check('ref-mismatch-throws:' + name, 'a resolved ' + name + ' ref that is not the one asked for stops the run', Boolean(error) && /reported/.test(error.message), error && error.message)
  check('ref-mismatch-no-review:' + name, 'before any review lane', calls.length === 1, calls.map((c) => c.opts.label))
}

// A lane that leaves `ref` out has not said what it resolved; that is its own error, not a mismatch.
{
  const r = counting(responder({ 'pin refs': targetPin({ noRef: true }) }))
  const { error } = await tryRun('review-round.js', { target: 'feature/b' }, r)
  check('missing-ref-own-message', 'a lane result with no ref is refused for the missing ref', Boolean(error) && /did not say which ref/.test(error.message) && !/but it reported/.test(error.message), error && error.message)
  check('missing-ref-no-review', 'before any review lane', r.labels.length === 1, r.labels)
}

// The target pin prompt says one thing about `ref`, and says not to substitute.
{
  const r = responder({ 'pin refs': targetPin() })
  const { calls } = await runWorkflow('review-round.js', { target: 'feature/b' }, r)
  const pin = calls.find((c) => c.opts.label === 'pin refs')
  const t = pin ? pin.prompt : ''
  check('pin-prompt-exact-name', 'the target pin prompt asks for ref as exactly the name it was asked to resolve', /exactly the name you were asked to resolve/.test(t), t)
  check('pin-prompt-no-decoration', 'without ^{commit}, refs/heads/ or a remote prefix', /without \^\{commit\}/.test(t) && /without refs\/heads\//.test(t) && /without a remote prefix/.test(t), t)
  check('pin-prompt-no-substitution', 'and forbids substituting another ref, origin/<name> included', /Do not substitute another ref/.test(t) && /never fall back to origin\//.test(t), t)
  check('pin-prompt-one-ref-rule', 'and does not also say to report the ref it was given', !/the ref you were given/.test(t), t)
  check('pin-schema-requires-ref', 'target mode requires ref in the schema', pin && pin.opts.schema.properties.resolved.items.required.includes('ref'), pin && pin.opts.schema.properties.resolved.items.required)
}
{
  const { calls: rc } = await runWorkflow('review-round.js', { range: 'main...x' }, responder())
  const rpin = rc.find((c) => c.opts.label === 'pin refs')
  check('range-pin-schema-ref-optional', 'range mode keeps ref optional, as before', rpin && !rpin.opts.schema.properties.resolved.items.required.includes('ref'), rpin && rpin.opts.schema.properties.resolved.items.required)
}

// A silent pin lane is not a missing branch.
{
  const r = responder({ 'pin refs': null })
  const { error } = await tryRun('review-round.js', { target: 'feature/b' }, r)
  check('silent-pin-lane-own-message', 'a pin lane that returned nothing says so rather than claiming the branch is missing', Boolean(error) && /no result/.test(error.message) && !/does not exist/.test(error.message), error && error.message)
}

// CF-3 #5. The string form and the old keys work as they did.
{
  const { result } = await runWorkflow('review-round.js', 'main...feature/refresh', responder())
  check('string-form-unchanged', 'a string is still a range', result.range === 'main...feature/refresh', result.range)
  const { result: bh } = await runWorkflow('review-round.js', { base: 'main', head: 'feature/refresh' }, responder())
  check('base-head-unchanged', 'base and head still make a range', bh.range === 'main...feature/refresh', bh.range)
  const { result: none } = await runWorkflow('review-round.js', {}, responder())
  check('default-range-unchanged', 'no range still reviews the last commit', none.range === 'HEAD~1...HEAD', none.range)
}

console.log('\nspec-to-card and deep-research: input they do not read is refused too')

// CF-3 #7. Both scripts drop an unknown key without a word, the pattern that sent
// review-round at the wrong commit.
for (const [file, good, keys] of [
  ['spec-to-card.js', { issue: 'EX-1' }, ['issue', 'stage', 'brief', 'context']],
  ['deep-research.js', { question: 'why' }, ['question', 'q', 'inCodebase', 'angles', 'rounds']],
]) {
  let spawned = 0
  const { error } = await tryRun(file, { ...good, stges: 'card' }, () => {
    spawned += 1
    return null
  })
  const m = error ? error.message : ''
  check('unknown-key-throws:' + file, 'an unknown key is an error naming it', Boolean(error) && m.includes('stges'), m)
  check('unknown-key-lists-accepted:' + file, 'the error lists the accepted keys', keys.every((k) => m.includes(k)), m)
  check('unknown-key-spawns-nothing:' + file, 'and it is raised before any agent runs', spawned === 0, spawned)
}
{
  const { error } = await tryRun('spec-to-card.js', { issue: 'EX-1', stage: 'card', brief: 'b', context: 'c' }, () => ({ specExists: false, specApproved: false, evidence: 'none', related: [] }))
  check('spec-to-card-known-keys-accepted', 'every key spec-to-card reads is accepted', !error || !/does not accept/.test(error.message), error && error.message)
  const { error: e2 } = await tryRun('deep-research.js', { q: 'x', inCodebase: false, angles: 2, rounds: 1 }, () => null)
  check('deep-research-known-keys-accepted', 'every key deep-research reads is accepted', !e2 || !/does not accept/.test(e2.message), e2 && e2.message)
}

console.log('\nreview-round: the gate believes git, or it stops')

// Each of these is a well-formed verify result that the gate accepted.
const GATE_HOLES = [
  ['no-worktree-path-stops', { headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, candidates: ['bbb2222'], worktrees: [] },
    'a fix with no known location cannot be re-reviewed in the checkout that holds it'],
  ['ambiguous-with-a-sha-stops', { headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, worktreePath: FIXWT, branch: FIXBR, candidates: ['bbb2222', 'ccc3333'], worktrees: [] },
    'a lane that names three candidates and then picks one is still guessing'],
  ['string-dirty-stops', { headCommit: 'bbb2222', containsReviewedHead: true, dirty: 'true', filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, worktreePath: FIXWT, branch: FIXBR, candidates: ['bbb2222'], worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: false }] },
    'a boolean that arrived as a string is not a licence to read it as false'],
]
for (const [name, verify, why] of GATE_HOLES) {
  const { result } = await runWorkflow('review-round.js', FIX, responder({ 'verify fix': verify }))
  check(name, why, /unverified fix|not isolated/.test(result.stopped || ''), result.stopped)
}

// A blocking finding that names no file removed the file-touch rule entirely,
// so an empty commit satisfied it. "Each of those stops the run on its own" has
// to be true of this one too.
{
  const r = responder({
    reviewer: (p, o, s) => {
      s.round += 1
      return s.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, what: 'something is wrong', why: 'w' }] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
    'verify fix': { headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: [], commits: [], isMain: false, worktreePath: FIXWT, branch: FIXBR, candidates: ['bbb2222'], worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: false }] },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('nameless-finding-stops', 'a fix cannot be checked against findings that name no file, so it is not adopted', result.stopped === 'unverified fix', result.stopped)
}

// The blocker path recorded the commit before the gate ran, so a dirty,
// non-descendant commit in the main checkout was reported as a fix and the human was
// pointed at it.
{
  const r = responder({
    coder: handoff({ done: HINTS, decisions: ['Blocker: which TTL?'] }),
    'verify fix': { headCommit: 'ccc3333', containsReviewedHead: false, dirty: true, filesChanged: ['docs/unrelated.md'], commits: ['c'], isMain: true, worktreePath: '/repo', candidates: ['ccc3333'], worktrees: [] },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('blocker-does-not-bless-a-commit', 'a blocker run does not report an ungated commit as a fix', (result.history[0] || {}).fixed !== true, result.history)
}

// The design's central claim: everything the loop decides on comes from lanes
// the SubagentStop matcher skips. Asserting "some call has a schema and no
// agentType" was satisfied by the four mechanical lanes alone.
{
  const { calls } = await runWorkflow('review-round.js', FIX, responder())
  const gitLanes = calls.filter((c) => c.opts.phase === 'git state')
  check('git-lanes-are-the-ones-deciding', 'the pin and verify lanes both exist', gitLanes.length >= 2, gitLanes.length)
  check('git-lanes-carry-no-agent-type', 'and neither carries an agentType, so the handoff gate never fires on them', gitLanes.every((c) => !c.opts.agentType), gitLanes.map((c) => c.opts.agentType))
}

// coder writes paths the way a model writes paths.
{
  const r = responder({
    reviewer: (p, o, s) => {
      s.round += 1
      return s.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'a', why: 'w' }, { blocking: true, file: 'src/b.ts', what: 'b', why: 'w' }] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
    coder: handoff({ done: HINTS, notDone: ['rejected as wrong: `src/b.ts` - the finding misreads the guard'] }),
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  const b = (result.fixes[0] || {}).unresolvedFindings || []
  check('backticked-path-is-still-a-path', 'a disposition naming a backticked path is read as the refusal it is', b.length === 1 && b[0].disposition === 'rejected as wrong', b)
}
{
  const r = responder({
    reviewer: (p, o, s) => {
      s.round += 1
      return s.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'a', why: 'w' }, { blocking: true, file: 'src/b.ts', what: 'b', why: 'w' }] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
    coder: handoff({ done: HINTS, notDone: ['rejected as wrong: src/a.ts - it is fine, unlike src/b.ts which I did fix'] }),
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  const b = (result.fixes[0] || {}).unresolvedFindings || []
  check('disposition-does-not-bleed', 'a file mentioned in passing does not inherit another finding’s disposition', b.every((f) => f.file !== 'src/b.ts' || f.disposition === 'not attempted'), b)
}

console.log('\nreview-round: claims that were right, and now watched')

// The bug class this harness was built for - "a claim promoted to verified by
// agents failing to answer". The happy case was pinned; the contradicted one
// was not.
{
  const r = responder()
  const inner = (p, o, sState) => {
    if (!o.agentType && o.schema && /Mechanical review pass/.test(p)) {
      const rnd = (/Round (\d+)/.exec(p) || [])[1] || '?'
      if (/Run the test suite/.test(p)) return { lane: 'tests', ran: ['pnpm test'], findings: rnd === '2' ? [{ file: 'src/a.ts', what: 'a test fails over the fix' }] : [] }
      return { lane: 'lint and format', ran: ['x'], findings: [] }
    }
    return r(p, o, sState)
  }
  const { result } = await runWorkflow('review-round.js', FIX, inner)
  const t = (result.fixes[0] || {}).testResults || {}
  check('contradicted-test-claims-stay-unverified', 'a tests lane that reports findings does not confirm the fix', t.verified === false && /contradicted/.test(t.verifiedBy || ''), t)
}

// A reviewer that said nothing is not a clean round.
{
  const { result } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, responder({ reviewer: null }))
  check('silent-reviewer-is-not-clean', 'silence from the reviewer is its own stop reason, not "clean"', result.stopped === 'reviewer returned nothing' && result.approved === false, [result.stopped, result.approved])
}

// A reviewer contradicting itself - approving while marking a finding blocking
// - is exactly why the flags are read the strict way.
{
  const r = responder({ reviewer: { verdict: 'approve', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'b', why: 'w' }] } })
  const { result } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, r)
  check('approve-with-a-blocker-is-not-approved', 'an approve verdict beside a blocking finding is not an approval', result.approved === false && result.stopped === 'fix handoff required', [result.stopped, result.approved])
}

// Only the three named dispositions are dispositions. Anything else is a Not
// done bullet, and reporting it as coder's decision would put a word coder
// never chose in front of the next reviewer.
{
  const r = responder({
    reviewer: (p, o, sState) => {
      sState.round += 1
      return sState.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'a', why: 'w' }, { blocking: true, file: 'src/b.ts', what: 'b', why: 'w' }] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
    coder: handoff({ done: HINTS, notDone: ['note: src/b.ts is fine as it stands'] }),
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  const u = (result.fixes[0] || {}).unresolvedFindings || []
  check('unknown-disposition-is-not-a-disposition', 'a Not done bullet that is not one of the three reads as not attempted', u.length === 1 && u[0].disposition === 'not attempted', u)
}

// The headline invariant, for the field that decides where every later lane
// runs: git says where the fix is, and coder's claim is recorded, not followed.
{
  const r = responder({ coder: handoff({ done: ['worktree: /w/coder-lied', 'head-commit: bbb2222', 'fixed it'] }) })
  const { result, calls } = await runWorkflow('review-round.js', FIX, r)
  const round2 = calls.filter((c) => /Round 2/.test(c.prompt))
  check('git-decides-where-the-fix-is', 'a coder claiming a different worktree does not redirect the next round', round2.length > 0 && round2.every((c) => !/coder-lied/.test(c.prompt)), round2.length)
  check('the-lie-is-recorded', 'and the disagreement is written down rather than dropped', ((result.fixes[0] || {}).claimMismatch || []).some((m) => /worktreePath/.test(m) && /coder-lied/.test(m)), (result.fixes[0] || {}).claimMismatch)
}

// A commit has to look like a commit.
{
  const r = responder({ 'verify fix': { headCommit: 'the-fix-branch', worktreePath: FIXWT, branch: FIXBR, isMain: false, containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['x'], worktrees: [] } })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('headCommit-must-look-like-a-commit', 'a branch name is not a commit', result.stopped === 'unverified fix', result.stopped)
}

// The honesty fixes, which were themselves untested.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({ coder: handoff({ done: HINTS, decisions: ['Blocker: which TTL?'] }) }))
  check('no-next-round-is-promised', 'a run that stopped does not promise a next round that will not come', (result.unverified || []).every((u) => !/the next round re-runs/.test(u)), result.unverified)
}
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({ coder: handoff({ done: HINTS, decisions: ['Propose item: rename the helper', 'Propose memory: the TTL is 15 minutes'] }) }))
  check('coder-proposals-are-carried', 'coder cannot file its own proposals, so the run carries them back', (result.proposals || []).length === 2, result.proposals)
}

// An unrecognised verdict is reported as what it was read as, not as what
// arrived, or the field says one thing and the decision was another.
{
  const { result } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, responder({ reviewer: { verdict: 'lgtm', summary: 's', findings: [] } }))
  check('coerced-verdict-is-reported-coerced', 'the verdict field reports the reading the run acted on', result.verdict === 'request changes', result.verdict)
}

// The fix prompt used to tell coder to branch and commit FIRST and report the
// isolation check afterwards, which guaranteed that a non-isolated coder wrote
// to the main checkout before anything could notice. The gate can only ever
// detect that; the ordering is what makes a compliant coder never do it.
{
  const { calls } = await runWorkflow('review-round.js', FIX, responder())
  const fix = calls.find((c) => c.opts.agentType === 'coder-fleet:coder')
  const p = fix ? fix.prompt : ''
  // CF-127: the workflow cuts the branch now, so the first write the prompt
  // asks for is the fix itself, and the check has to come before it.
  const checkAt = p.indexOf('git -C "' + FIXWT + '" rev-parse --absolute-git-dir')
  const writeAt = p.indexOf('A failing test first')
  check('isolation-checked-before-anything-is-written', 'the fix prompt checks the worktree it was given before it writes', checkAt > -1 && writeAt > checkAt && !/git switch -c/.test(p), [checkAt, writeAt])
  check('main-checkout-is-refused-not-reported', 'and says to write nothing at all if it is the main checkout', /Run no writing git command at all/.test(p), false)
}

console.log('\nreview-round: a round is clean when nobody could break it')

// Off by default. Nothing that runs today gets slower or more expensive
// without being asked for it.
{
  const { calls } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, responder({ reviewer: { verdict: 'approve', summary: 'fine', findings: [] } }))
  check('refuter-is-opt-in', 'an ordinary review does not spawn a refuter', calls.every((c) => c.opts.agentType !== 'coder-fleet:refuter'), calls.map((c) => c.opts.agentType))
}

// Reachable outside a loop, which is how the role earns its place before
// anything depends on it.
{
  const { calls } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1', refute: true }, responder({ reviewer: { verdict: 'approve', summary: 'fine', findings: [] } }))
  const r = calls.find((c) => c.opts.agentType === 'coder-fleet:refuter')
  check('refute-flag-spawns-one', 'refute: true spawns a refuter on an ordinary review', Boolean(r), false)
  check('refuter-carries-no-schema', 'and it carries no schema, so its handoff still reaches the gate', r && r.opts.schema === undefined, r && r.opts.schema)
}

// A clean verdict is not the end of a loop round.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': handoff({ done: ['ran 12 mutations, all killed'] }),
  }))
  check('clean-plus-unbroken-is-done', 'a clean verdict and a failed refutation together are done', result.stopped === 'clean' && result.approved === true, [result.stopped, result.approved])
}

// A surviving mutation is a blocking finding, whatever the reviewer said. It
// arrives as a "survived:" Done bullet, never as a Blocker line: a survivor is
// work the lead routes, and a Blocker puts the card on the human queue.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': handoff({ done: ['ran 12 mutations', 'survived: deleting the isMain guard at src/a.ts:40 - no test noticed'] }),
  }))
  check('a-survivor-is-not-clean', 'a survived: Done bullet stops the round as refuted even on an approving verdict', result.stopped === 'refuted' && result.approved === false, [result.stopped, result.approved])
  check('the-survivor-is-carried', 'and what survived is carried back in refutation.survivors', ((result.refutation || {}).survivors || []).some((s) => /isMain guard/.test(s)), result.refutation)
}

// A model writes a key in bold or in any case as often as bare.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': handoff({ done: ['ran 12 mutations', '**Survived:** inverted the guard - no test noticed'] }),
  }))
  check('survived-key-tolerates-markup', 'a bold, capitalised survived: key is still a survivor', result.stopped === 'refuted', [result.stopped, result.refutation])
}

// The guard against a naive parser: a model may write the key with nothing
// behind it when every mutation was killed.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': handoff({ done: ['ran 12 mutations, all killed', 'survived: none'] }),
  }))
  check('survived-none-is-not-a-survivor', 'a survived: bullet reading none is not a survivor', result.stopped === 'clean' && result.approved === true, [result.stopped, result.approved])
}

// The survivor key as models actually write it. Missing a survivor fails open
// (the round approves), so the key is read generously near the start of a
// Done bullet, and the none test is read after markup and punctuation go.
for (const [name, requirement, done, want] of [
  ['survivor-key-survivors', 'a Survivors: bullet is a survivor', 'Survivors: deleting the isMain guard at src/a.ts:40 - no test noticed', 'refuted'],
  ['survivor-key-surviving-mutations', 'a Surviving mutations: bullet is a survivor', 'Surviving mutations: inverting the guard at src/a.ts:40 - no test noticed', 'refuted'],
  ['survivor-key-mutation-n-survived', 'a Mutation 3 survived: bullet is a survivor', 'Mutation 3 survived: inverting the guard at src/a.ts:40 - no test noticed', 'refuted'],
  ['survivor-key-in-backticks', 'a survived: key in backticks is a survivor', '`survived:` inverting the guard at src/a.ts:40 - no test noticed', 'refuted'],
  ['survived-none-with-a-reason', 'survived: none followed by a reason is not a survivor', 'survived: none - all 12 killed', 'clean'],
  ['survived-none-in-bold', 'a bold survived: none is not a survivor', '**survived: none**', 'clean'],
  ['survived-none-with-punctuation', 'survived: none; is not a survivor', 'survived: none;', 'clean'],
  ['survived-nothing', 'survived: nothing is not a survivor', 'survived: nothing', 'clean'],
  ['survived-zero', 'survived: 0 is not a survivor', 'survived: 0', 'clean'],
  ['survivor-key-survived-mutation-n', 'a Survived mutation 3: bullet is a survivor', 'Survived mutation 3: inverted the guard - no test noticed', 'refuted'],
  ['survivor-key-n-survived', 'a 3 survived: bullet is a survivor', '3 survived: inverted the guard - no test noticed', 'refuted'],
  ['survivor-text-starting-nothing', 'a survivor whose text starts with nothing is a survivor', 'survived: nothing asserts the retry cap; set MAX_RETRIES=0 at src/retry.ts:12 - no test noticed', 'refuted'],
  ['survivor-text-starting-none', 'a survivor whose text starts with none is a survivor', 'survived: none of the TTL tests notice dropping the expiry check at src/ttl.ts:8', 'refuted'],
  ['survivor-text-starting-0', 'a survivor whose text starts with 0 is a survivor', 'survived: 0-length token accepted after deleting the length guard at src/token.ts:20', 'refuted'],
  ['survivor-text-0-then-parenthesis', 'a survivor starting 0 and a parenthesis is a survivor', 'survived: 0 (the default retry count) replaced with 1 at src/retry.ts:3 - no test noticed', 'refuted'],
  ['survived-none-in-backticks', 'survived: none in backticks is not a survivor', 'survived: `none`', 'clean'],
  ['survived-zero-of-n', 'Surviving mutations: 0 of 12 is not a survivor', 'Surviving mutations: 0 of 12', 'clean'],
  ['survived-none-with-parenthesised-reason', 'survived: none (all killed) is not a survivor', 'survived: none (all killed)', 'clean'],
  // Fail closed: any bullet that mentions surviving is a survivor unless the
  // whole bullet is a strict nothing-survived form.
  ['survivor-key-parenthesised-id', 'survived (m4): is a survivor', 'survived (m4): inverted the guard at src/a.ts:40 - no test noticed', 'refuted'],
  ['survivor-key-bracketed-id', 'Survived [m4]: is a survivor', 'Survived [m4]: inverted the guard at src/a.ts:40 - no test noticed', 'refuted'],
  ['survivor-key-mutation-id-survived', 'Mutation m4 survived: is a survivor', 'Mutation m4 survived: inverted the guard at src/a.ts:40 - no test noticed', 'refuted'],
  ['survivor-key-id-survived', 'm4 survived: is a survivor', 'm4 survived: inverted the guard at src/a.ts:40 - no test noticed', 'refuted'],
  ['survivor-key-dashed-id-survived', 'M-4 survived: is a survivor', 'M-4 survived: inverted the guard at src/a.ts:40 - no test noticed', 'refuted'],
  ['survivor-key-mutation-with-description', 'Mutation 4 (inverted guard) survived: is a survivor', 'Mutation 4 (inverted guard) survived: src/a.ts:40 - no test noticed', 'refuted'],
  ['survivor-key-survived-mutations-count', 'survived mutations (2): is a survivor', 'survived mutations (2): inverted the guard at src/a.ts:40; deleted the isMain check', 'refuted'],
  ['survivor-key-dash-no-colon', 'survived - with no colon is a survivor', 'survived - inverted the guard at src/a.ts:40 and no test noticed', 'refuted'],
  ['survivor-zero-dash-then-survivor', 'survived: 0 - followed by a survivor is a survivor', 'survived: 0 - deleting the guard at src/a.ts:40 went unnoticed', 'refuted'],
  ['survivor-none-dash-except', 'survived: none - except ... is a survivor', 'survived: none - except inverting the guard at src/a.ts:40', 'refuted'],
  ['survivor-nothing-parenthesised-survivor', 'survived: nothing (a survivor) is a survivor', 'survived: nothing (deleting the guard at src/a.ts:40 was not noticed)', 'refuted'],
  ['survivor-none-parenthesised-survivor', 'survived: none (m4 survived: ...) is a survivor', 'survived: none (m4 survived: inverted the guard)', 'refuted'],
  ['survivor-n-a', 'survived: n/a fails closed as a survivor', 'survived: n/a', 'refuted'],
  ['survived-none-semicolon-all-killed', 'survived: none; all 14 killed is not a survivor', 'survived: none; all 14 killed', 'clean'],
  ['survived-no-survivors', 'no survivors is not a survivor', 'no survivors', 'clean'],
  ['survived-survivors-none', 'Survivors: none is not a survivor', 'Survivors: none', 'clean'],
  ['survived-none-capitalised', 'survived: None is not a survivor', 'survived: None', 'clean'],
  ['survived-none-full-stop', 'survived: none. is not a survivor', 'survived: none.', 'clean'],
  ['survived-mutations-none-comma-all-killed', 'Survived mutations: none, all 14 killed is not a survivor', 'Survived mutations: none, all 14 killed', 'clean'],
  ['survived-zero-of-n-all-killed', 'survived: 0 of 14 (all killed) is not a survivor', 'survived: 0 of 14 (all killed)', 'clean'],
  ['survived-zero-slash-n', 'survived: 0/12 is not a survivor', 'survived: 0/12', 'clean'],
  ['survived-zero-word', 'survived: zero is not a survivor', 'survived: zero', 'clean'],
  ['survived-sentence-none-survived', 'ran 14 mutations, none survived is not a survivor', 'ran 14 mutations, none survived', 'clean'],
  // A bare key is a survivor: whatever it introduced may sit on indented or
  // following lines that handoffSection does not return.
  ['survived-empty-key', 'an empty survived: key is a survivor', 'survived:', 'refuted'],
  ['survived-bare-bold-survivors-key', 'a bare **Survivors:** key is a survivor', '**Survivors:**', 'refuted'],
  ['survived-bare-surviving-mutations-key', 'a bare Surviving mutations: key is a survivor', 'Surviving mutations:', 'refuted'],
  ['survivor-key-underscored', 'mutation_4_survived: is a survivor', 'mutation_4_survived: inverted the guard at src/a.ts:40', 'refuted'],
  ['survivor-key-run-together', 'm4survived: is a survivor', 'm4survived: inverted the guard at src/a.ts:40', 'refuted'],
]) {
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': handoff({ done: ['ran 12 mutations', done] }),
  }))
  check(name, requirement, result.stopped === want && result.approved === (want === 'clean'), [done, result.stopped, result.approved, result.refutation])
}

// Shapes where the survivor itself is on a line handoffSection never returns:
// nested sub-bullets, a wrapped item (LF and CRLF), and a key whose survivor
// is the next bullet. Only the bare key is left to read, so it must stop.
for (const [name, requirement, done, crlf] of [
  ['survivor-nested-sub-bullets', 'a survived key over nested sub-bullets is a survivor', ['ran 12 mutations', 'Survived mutations:\n  - m4: inverted the guard at src/a.ts:40\n  - m7: deleted the isMain check'], false],
  ['survivor-wrapped-lf', 'a survived: item wrapped onto an indented line is a survivor', ['ran 12 mutations', 'survived:\n  inverting the guard at src/a.ts:40 went unnoticed'], false],
  ['survivor-wrapped-crlf', 'the same wrapped item with CRLF line endings is a survivor', ['ran 12 mutations', 'survived:\n  inverting the guard at src/a.ts:40 went unnoticed'], true],
  ['survivor-key-then-separate-bullet', 'a bare survived: followed by a separate bullet is a survivor', ['ran 12 mutations', 'survived:', 'inverting the guard at src/a.ts:40 went unnoticed'], false],
]) {
  const text = handoff({ done })
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': crlf ? text.replace(/\n/g, '\r\n') : text,
  }))
  check(name, requirement, result.stopped === 'refuted' && result.approved === false, [result.stopped, result.approved, result.refutation])
}

// A survivor has to be confirmed, so one under Unverified is not read.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': handoff({ done: ['ran 12 mutations, all killed'], unverified: ['survived: inverting the guard at src/a.ts:40 may not be caught - not run'] }),
  }))
  check('survivor-under-unverified-is-ignored', 'a survived: bullet under Unverified is not a survivor', result.stopped === 'clean' && result.approved === true, [result.stopped, result.approved])
}
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': handoff({ done: ['ran 12 mutations, all killed'], notDone: ['survived: inverting the guard at src/a.ts:40 was not tried - budget ran out'] }),
  }))
  check('survivor-under-not-done-is-ignored', 'a survived: bullet under Not done is not a survivor', result.stopped === 'clean' && result.approved === true, [result.stopped, result.approved])
}

// What is recorded: the text after the key, or the whole bullet when there is
// no key.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': handoff({ done: ['Mutation m4 survived: inverted the guard at src/a.ts:40', 'survived - deleted the isMain check at src/b.ts:7'] }),
  }))
  const got = (result.refutation || {}).survivors || []
  check('survivor-text-after-the-key', 'the survivor is recorded as the text after the key', got[0] === 'inverted the guard at src/a.ts:40', got)
  check('survivor-text-whole-bullet-without-key', 'with no key the whole bullet is recorded', got[1] === 'survived - deleted the isMain check at src/b.ts:7', got)
}

// A refuter Blocker is a question for the human. Read as survivors it made a
// question look like a finding; ignored, it would read as clean and approve.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': handoff({ done: ['ran 0 mutations'], decisions: ['Blocker: The card says the guard must reject an empty token and the spec says it must accept one, and which mutations matter depends on it. Which is right?'] }),
  }))
  const survivors = (result.refutation || {}).survivors || []
  check('refuter-blocker-is-its-own-stop', 'a refuter Blocker stops as its own reason, not as survivors', result.stopped === 'refuter raised a blocker' && result.approved === false && survivors.length === 0, [result.stopped, result.approved, survivors])
  check('refuter-blocker-has-a-next-step', 'and it has its own next step', !/The review is incomplete/.test(result.nextStep || ''), result.nextStep)
}

// The human's answer may change what gets fixed, so the question wins, and the
// survivor is still carried rather than dropped.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': handoff({
      done: ['ran 12 mutations', 'survived: deleting the isMain guard at src/a.ts:40 - no test noticed'],
      decisions: ['Blocker: The card and the spec disagree on the guard. Which is right?'],
    }),
  }))
  check('refuter-blocker-outranks-survivors', 'a refuter Blocker outranks survivors, which are still carried', result.stopped === 'refuter raised a blocker' && ((result.refutation || {}).survivors || []).some((s) => /isMain guard/.test(s)), [result.stopped, result.refutation])
  check('refuted-flag-follows-carried-survivors', 'refuted is true when survivors are carried, even when a blocker set the stop', result.refuted === true, [result.stopped, result.refuted])
}

// What the agents are told, since a parser reading survived: bullets is only
// as good as the prompt asking for them.
{
  const { calls } = await runWorkflow('review-round.js', FIX, responder({ reviewer: { verdict: 'approve', summary: 'fine', findings: [] } }))
  const ref = calls.find((c) => c.opts.agentType === 'coder-fleet:refuter')
  const p = ref ? ref.prompt : ''
  check('refuter-prompt-asks-for-survived-bullets', 'the refuter is asked for survived: Done bullets, not Blocker lines', p.includes('- survived: ') && p.includes('## Done') && !/mutation[^.]*as a "- Blocker: " line/.test(p), p)
}
{
  const { calls } = await runWorkflow('review-round.js', FIX, responder())
  const verdicts = calls.filter((c) => c.opts.agentType === 'coder-fleet:reviewer')
  check('reviewer-prompt-names-no-blocker', 'the verdict prompt never asks for a Blocker line', verdicts.length > 0 && verdicts.every((c) => !c.prompt.includes('Blocker')), verdicts.length)
  const fix = calls.find((c) => c.opts.agentType === 'coder-fleet:coder')
  const n = fix ? fix.prompt.split('as a question ending in "?"').length - 1 : 0
  check('fix-prompt-blockers-are-questions', 'both fix-prompt Blockers are asked for as questions', n === 2, n)
}

// Fails closed, like every other branch in this file.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': null,
  }))
  check('silent-refuter-is-not-clean', 'a refuter that returned nothing is its own stop reason', result.stopped === 'refutation returned nothing' && result.approved === false, [result.stopped, result.approved])
}

// The other half of the same guard: a string that is empty, or all whitespace,
// is not evidence of anything either. Silence read as unbreakable is the exact
// failure this stage exists to prevent, whatever shape the silence takes.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': '',
  }))
  check('empty-refuter-is-not-clean', 'a refuter that returned an empty string is its own stop reason too', result.stopped === 'refutation returned nothing' && result.approved === false, [result.stopped, result.approved])
}

// The whitespace half, which is the half that carries the guard. `''` is falsy
// with or without the .trim(), so it cannot tell the real check from a mutant
// that drops the trim - both `refutation === ''` and `!refutation` survive it,
// confirmed by running them. A string of blanks is the only input where the
// three differ, so it is the only input that pins the line.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1 refutation': '   \n\t  ',
  }))
  check('blank-refuter-is-not-clean', 'a refuter that returned only whitespace is its own stop reason too', result.stopped === 'refutation returned nothing' && result.approved === false, [result.stopped, result.approved])
}

console.log('\nreview-round: a Low finding is fixed in the round or dropped')

// CF-44. A Low finding is local to the change and needs no decision: a
// misnamed test, a stale comment. It rides a fix round that runs anyway, is
// dropped when none does, and is never follow-up work. It never widens the
// gate and never starts a round of its own.
const LOW = { blocking: false, low: true, file: 'src/a.test.ts', what: 'misnamed-test', why: 'w' }
const FOLLOW = { blocking: false, file: 'docs/x.md', what: 'follow-up-work', why: 'w' }
const hasWhat = (list, what) => (list || []).some((f) => f && f.what === what)

{
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: (p, o, s) => {
      s.round += 1
      return s.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'bug', why: 'w' }, LOW, FOLLOW] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
  }))
  const fix = calls.find((c) => c.opts.agentType === 'coder-fleet:coder')
  const p = fix ? fix.prompt : ''
  const lowAt = p.indexOf('fix these in this run too')
  const ctxAt = p.indexOf('for context only')
  const lowPart = lowAt >= 0 && ctxAt > lowAt ? p.slice(lowAt, ctxAt) : ''
  const ctxPart = ctxAt >= 0 ? p.slice(ctxAt) : ''
  check(
    'low-rides-the-fix-round',
    'a Low finding goes to the fix run under its own heading, a follow-up stays context',
    lowPart.includes('misnamed-test') && !lowPart.includes('follow-up-work') && ctxPart.includes('follow-up-work') && !ctxPart.includes('misnamed-test') && hasWhat((result.fixes[0] || {}).low, 'misnamed-test') && Array.isArray(result.dropped) && result.dropped.length === 0,
    [lowAt, ctxAt, (result.fixes[0] || {}).low, result.dropped],
  )
}

{
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve with follow-ups', summary: 's', findings: [LOW] },
  }))
  const coder = calls.some((c) => c.opts.agentType === 'coder-fleet:coder')
  check(
    'low-alone-commissions-nobody',
    'Low findings alone start no fix round and are dropped, not followed up',
    !coder && result.stopped === 'clean' && hasWhat(result.dropped, 'misnamed-test') && Array.isArray(result.low) && result.low.length === 0 && !hasWhat(result.followUps, 'misnamed-test') && /dropped/i.test(result.nextStep || ''),
    [coder, result.stopped, result.dropped, result.followUps],
  )
}

{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'bug', why: 'w' }, { blocking: false, low: true, file: 'src/b.ts', what: 'low-b', why: 'w' }] },
    'verify fix': { headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: ['src/b.ts'], commits: ['c'], isMain: false, worktreePath: FIXWT, branch: FIXBR, candidates: ['bbb2222'], worktrees: [{ path: FIXWT, head: 'bbb2222', dirty: false, isMain: false }] },
  }))
  const fr = result.fixRequest || {}
  const reason = fr.unverifiedReason || ''
  check(
    'low-does-not-widen-the-gate',
    'a commit touching only the Low file does not pass the gate, and the Low finding travels with the fix',
    result.stopped === 'unverified fix' && reason.includes('src/a.ts') && !reason.includes('src/b.ts') && hasWhat(result.low, 'low-b') && !hasWhat(result.followUps, 'low-b') && Array.isArray(result.dropped) && !hasWhat(result.dropped, 'low-b'),
    [result.stopped, reason, result.low, result.followUps, result.dropped],
  )
}

{
  const { result } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, responder({
    reviewer: { verdict: 'approve with follow-ups', summary: 's', findings: [
      { blocking: false, low: 'false', file: 'src/a.ts', what: 'string-false', why: 'w' },
      { blocking: false, file: 'src/a.ts', what: 'absent', why: 'w' },
    ] },
  }))
  check(
    'low-read-strictly',
    'low: "false" and an absent low both leave the finding a follow-up',
    result.stopped === 'clean' && hasWhat(result.followUps, 'string-false') && hasWhat(result.followUps, 'absent') && Array.isArray(result.dropped) && result.dropped.length === 0,
    [result.stopped, result.followUps, result.dropped],
  )
}

{
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: (p, o, s) => {
      s.round += 1
      return s.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, low: true, file: 'src/a.ts', what: 'both', why: 'w' }] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
  }))
  const fix = calls.find((c) => c.opts.agentType === 'coder-fleet:coder')
  const p = fix ? fix.prompt : ''
  const first = result.fixes[0] || {}
  check(
    'blocking-outranks-low',
    'a finding marked both blocking and Low is commissioned as blocking and never dropped',
    Boolean(fix) && !p.includes('fix these in this run too') && hasWhat(first.requested, 'both') && Array.isArray(first.low) && first.low.length === 0 && Array.isArray(result.dropped) && !hasWhat(result.dropped, 'both'),
    [Boolean(fix), first.requested, first.low, result.dropped],
  )
}

// CF-44 fix round 1: the review's four Low findings on this branch, each
// pinned before it was fixed.
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: (p, o, s) => {
      s.round += 1
      return s.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'bug', why: 'w' }, { blocking: false, low: true, file: 'src/b.ts', what: 'low-b', why: 'w' }] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
  }))
  const first = result.fixes[0] || {}
  check(
    'low-is-never-unresolved',
    'a fix touching only the blocking file leaves nothing unresolved, although the Low file is untouched',
    first.accepted === true && Array.isArray(first.unresolvedFindings) && first.unresolvedFindings.length === 0,
    [first.accepted, first.unresolvedFindings],
  )
}

{
  const { result } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1' }, responder({
    reviewer: { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'bug', why: 'w' }, LOW] },
  }))
  check(
    'low-travels-on-the-default-path',
    'on fix handoff required the Low findings are carried for the fix run, not dropped, and the next step names them',
    result.stopped === 'fix handoff required' && hasWhat(result.low, 'misnamed-test') && Array.isArray(result.dropped) && result.dropped.length === 0 && /\bLow\b/.test(result.nextStep || '') && /\blow\b/.test(result.nextStep || ''),
    [result.stopped, result.low, result.dropped, result.nextStep],
  )
}

{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve with follow-ups', summary: 's', findings: [LOW] },
    'Round 1 refutation': handoff({ done: ['ran 8 mutations', 'survived: deleting the isMain guard at src/a.ts:40 - no test noticed'] }),
  }))
  check(
    'low-rides-the-test-fix',
    'on a refuted stop the Low findings ride the test fix the next step commissions, and are not dropped',
    result.stopped === 'refuted' && hasWhat(result.low, 'misnamed-test') && Array.isArray(result.dropped) && result.dropped.length === 0 && /\blow\b/.test(result.nextStep || ''),
    [result.stopped, result.low, result.dropped, result.nextStep],
  )
}

// Fix round 2: whether a fix run follows is read from the stop, never from a
// verdict that may be a round stale.
{
  const r = responder({
    reviewer: (p, o, s) => {
      s.round += 1
      return s.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'bug', why: 'w' }, LOW] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
  })
  let scopes = 0
  const { result } = await runWorkflow('review-round.js', FIX, (p, o, s) => (/git diff --stat/.test(p) && ++scopes === 2 ? null : r(p, o, s)))
  check(
    'low-not-reoffered-after-its-fix',
    'a Low that rode an accepted fix is not offered to another fix run when the next round stops on its scope pass',
    result.stopped === 'scope pass returned nothing' && hasWhat((result.fixes[0] || {}).low, 'misnamed-test') && Array.isArray(result.low) && result.low.length === 0 && !/under low/.test(result.nextStep || ''),
    [result.stopped, result.low, result.nextStep],
  )
}

{
  const { result } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: { verdict: 'approve with follow-ups', summary: 's', findings: [LOW] },
    'Round 1 refutation': handoff({ done: ['ran 8 mutations', 'survived: deleting the isMain guard at src/a.ts:40 - no test noticed'], decisions: ['Blocker: The card and the spec disagree on the guard. Which is right?'] }),
  }))
  check(
    'low-not-promised-on-refuter-blocker',
    'a refuter Blocker with survivors commissions no fix run, so its Low findings are dropped and no fix run is promised',
    result.stopped === 'refuter raised a blocker' && Array.isArray(result.low) && result.low.length === 0 && hasWhat(result.dropped, 'misnamed-test') && !/under low/.test(result.nextStep || ''),
    [result.stopped, result.low, result.dropped, result.nextStep],
  )
}

{
  const { calls } = await runWorkflow('review-round.js', FIX, responder({
    reviewer: (p, o, s) => {
      s.round += 1
      return s.round === 1
        ? { verdict: 'request changes', summary: 's', findings: [{ blocking: true, file: 'src/a.ts', what: 'bug', why: 'w' }, LOW] }
        : { verdict: 'approve', summary: 'fixed', findings: [] }
    },
  }))
  const fix = calls.find((c) => c.opts.agentType === 'coder-fleet:coder')
  const opening = fix ? fix.prompt.split('\n\n')[0] : ''
  check(
    'fix-prompt-scope-includes-low',
    'the fix prompt opens by naming the Low findings in scope, so "nothing else" does not contradict them',
    /Low findings/.test(opening) && /nothing else/.test(opening),
    opening,
  )
}

{
  const { calls } = await runWorkflow('review-round.js', FIX, responder())
  const v = calls.find((c) => c.opts.agentType === 'coder-fleet:reviewer')
  const p = v ? v.prompt : ''
  check(
    'verdict-prompt-asks-for-low',
    'the verdict prompt asks for low and says a Low finding is never follow-up work',
    /\blow\b/.test(p) && /never follow-up work/i.test(p),
    p.slice(-600),
  )
}

console.log('\nevery workflow: fleet agents are spawned by their plugin name')
{
  // Issue 10. Installed as a plugin, the fleet's agents are registered as
  // `coder-fleet:<name>`, and `agent({agentType: 'scout'})` fails on
  // launch with "agent type 'scout' not found". The built-in
  // general-purpose lanes carry no prefix, and a lane with no agentType is
  // deliberate (see review-round's header). This reads the scripts' own
  // constants rather than the recorded calls, so a workflow the harness never
  // drives is held to it too.
  const FLEET = ['lead', 'scout', 'spec-writer', 'coder', 'scripter', 'reviewer', 'ui-designer', 'tech-writer', 'researcher', 'fleet-steward', 'refuter']
  for (const file of ['spec-to-card.js', 'review-round.js', 'deep-research.js']) {
    let src = ''
    try {
      src = readFileSync(join(WORKFLOWS, file), 'utf8')
    } catch (e) {
      check('workflow-exists:' + file, 'the workflow file exists', false, e.message)
      continue
    }
    const bare = []
    for (const m of src.matchAll(/^const\s+[A-Z_]+\s*=\s*'([^']+)'/gm)) {
      if (FLEET.includes(m[1])) bare.push(m[1])
    }
    check('prefixed-agent-types:' + file, 'names every fleet agent by its plugin name', bare.length === 0, bare)
  }
}

console.log('\nreview-round: a refuter is capped at eight mutants, and runs only where the lead tiers one')

// CF-45. The cap is one phrase in four places: the refuter's body, the looping
// skill, the lead's brief rule and the prompt this workflow sends. A refuter
// spawned by the workflow reads only the prompt and its own body, so the
// prompt carries the round's time as well as its count.
{
  const { calls } = await runWorkflow('review-round.js', FIX, responder({ reviewer: { verdict: 'approve', summary: 'fine', findings: [] } }))
  const r = calls.find((c) => c.opts.agentType === 'coder-fleet:refuter')
  const p = r ? r.prompt : ''
  check('refuter-prompt-caps-mutants', 'the refuter prompt says at most eight mutants and 20 minutes', /at most eight mutants/.test(p) && /20 minutes/.test(p), p.slice(0, 120))
}

{
  const missing = []
  for (const rel of ['agents/refuter.md', 'agents/lead.md', 'skills/looping/SKILL.md']) {
    if (!readFileSync(join(PLUGIN_ROOT, rel), 'utf8').includes('at most eight mutants')) missing.push(rel)
  }
  check('mutant-cap-one-phrase', 'the refuter, the lead and the looping skill each say at most eight mutants', missing.length === 0, missing)
}

// Tiering: the lead decides which phases get a refuter, so a caller that says
// refute: false is obeyed even under fix: true. Only an explicit false does it.
{
  const { result, calls } = await runWorkflow('review-round.js', { ...FIX, refute: false }, responder({ reviewer: { verdict: 'approve', summary: 'fine', findings: [] } }))
  const spawned = calls.some((c) => c.opts.agentType === 'coder-fleet:refuter')
  check('refute-false-overrides-fix', 'fix: true with refute: false spawns no refuter and stops clean', !spawned && result.stopped === 'clean', [spawned, result.stopped])
}

// The default is unchanged: fix: true alone still refutes.
{
  const { calls } = await runWorkflow('review-round.js', FIX, responder({ reviewer: { verdict: 'approve', summary: 'fine', findings: [] } }))
  check('fix-refutes-by-default', 'fix: true with no refute key still spawns a refuter', calls.some((c) => c.opts.agentType === 'coder-fleet:refuter'), calls.map((c) => c.opts.agentType))
}

// Fail safe: only a real false turns the refuter off. A string "false" from a
// slash command keeps the default rather than silently dropping the refuter.
{
  const { calls } = await runWorkflow('review-round.js', { ...FIX, refute: 'false' }, responder({ reviewer: { verdict: 'approve', summary: 'fine', findings: [] } }))
  check('refute-string-false-still-refutes', 'fix: true with refute: "false" (a string) still spawns a refuter', calls.some((c) => c.opts.agentType === 'coder-fleet:refuter'), calls.map((c) => c.opts.agentType))
}

// The tier is the lead's call on the files it classified. A fix round that adds
// a sensitive path is a file the lead never saw, so under fix: true a round
// whose re-derived `sensitive` is true refutes even when refute: false was
// passed.
{
  let scopes = 0
  const r = responder()
  const { calls } = await runWorkflow('review-round.js', { ...FIX, refute: false }, (p, o, s) => {
    if (/git diff --stat/.test(p)) {
      scopes += 1
      return scopes === 1
        ? { files: ['src/a.ts'], added: 10, removed: 2, commits: ['c'] }
        : { files: ['src/a.ts', 'src/auth/session.ts'], added: 30, removed: 2, commits: ['c', 'fix'] }
    }
    return r(p, o, s)
  })
  const refuters = calls.filter((c) => c.opts.agentType === 'coder-fleet:refuter')
  check('sensitive-fix-round-overrides-refute-false', 'a fix round that adds a sensitive path refutes despite refute: false', refuters.length === 1 && /Round 2/.test(refuters[0].opts.label || ''), refuters.map((c) => c.opts.label))
}

// With refute: false the tests and types-and-build lanes are the phase's
// independent gate run, so the result has to say what they ran, and a lane
// that returned nothing has to show up as missing rather than vanish.
{
  const { result } = await runWorkflow('review-round.js', { ...FIX, refute: false }, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1: tests': { lane: 'tests', ran: ['npm test'], findings: [] },
    'Round 1: types and build': { lane: 'types and build', ran: ['tsc --noEmit', 'npm run build'], findings: [] },
  }))
  const gates = result.gates || []
  const byName = (n) => gates.find((g) => g.lane === n) || {}
  check(
    'result-carries-gate-ran-lists',
    'the result carries the tests and types-and-build lanes with their ran lists',
    JSON.stringify(byName('tests').ran) === JSON.stringify(['npm test']) &&
      JSON.stringify(byName('types and build').ran) === JSON.stringify(['tsc --noEmit', 'npm run build']) &&
      Array.isArray(result.gatesMissing) && result.gatesMissing.length === 0,
    [gates, result.gatesMissing],
  )
}

{
  const { result } = await runWorkflow('review-round.js', { ...FIX, refute: false }, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1: tests': null,
  }))
  const gates = result.gates || []
  const tests = gates.find((g) => g.lane === 'tests')
  check(
    'missing-gate-lane-is-reported',
    'a tests lane that returned nothing is reported as missing, with ran: null',
    Boolean(tests) && tests.ran === null && Array.isArray(result.gatesMissing) && result.gatesMissing.includes('tests') && !result.gatesMissing.includes('types and build'),
    [gates, result.gatesMissing],
  )
}

// A lane that answers with an empty ran list ran no gate, whatever else it
// says, and neither does one whose ran is not a list at all. Both are missing,
// the run is not an approval, and the lane's own couldNotRun reaches the lead.
{
  const { result } = await runWorkflow('review-round.js', { ...FIX, refute: false }, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1: tests': { lane: 'tests', ran: [], findings: [], couldNotRun: ['no test command found'] },
    'Round 1: types and build': { lane: 'types and build', ran: 'tsc', findings: [] },
  }))
  const gates = result.gates || []
  const tests = gates.find((g) => g.lane === 'tests') || {}
  const missing = result.gatesMissing || []
  check(
    'empty-ran-gate-lane-is-missing',
    'a gate lane with an empty or malformed ran is missing, and the run is not approved',
    missing.includes('tests') && missing.includes('types and build') && result.approved === false,
    [missing, result.approved],
  )
  // A clean stop that is not approved must not read like one: the next step
  // says so first and names the lanes, so the lead runs the gates itself.
  const step = result.nextStep || ''
  check(
    'missing-gate-next-step-is-not-approval',
    'a clean stop with a missing gate lane opens its next step by saying it is not an approval and naming the lanes',
    /^Not an approval/.test(step) && step.includes('tests') && step.includes('types and build'),
    step.slice(0, 300),
  )
  check(
    'gate-carries-could-not-run',
    'each gates entry carries the lane\'s couldNotRun',
    JSON.stringify(tests.couldNotRun) === JSON.stringify(['no test command found']),
    tests,
  )
}

// The lane name is the workflow's, never the model's. A types lane that calls
// itself 'types' is still the types-and-build gate, and is not reported
// missing.
{
  const { result } = await runWorkflow('review-round.js', { ...FIX, refute: false }, responder({
    reviewer: { verdict: 'approve', summary: 'fine', findings: [] },
    'Round 1: types and build': { lane: 'types', ran: ['tsc --noEmit'], findings: [] },
  }))
  const types = (result.gates || []).find((g) => g.lane === 'types and build') || {}
  check(
    'misnamed-gate-lane-still-matched',
    'a gate lane reporting the wrong lane name is matched to the lane the workflow ran',
    JSON.stringify(types.ran) === JSON.stringify(['tsc --noEmit']) && (result.gatesMissing || []).length === 0,
    [result.gates, result.gatesMissing],
  )
}

// The sensitive override spawns a refuter against the lead's refute: false,
// so it says so in the log, once, in the round it fires.
{
  let scopes = 0
  const r = responder()
  const { logs } = await runWorkflow('review-round.js', { ...FIX, refute: false }, (p, o, s) => {
    if (/git diff --stat/.test(p)) {
      scopes += 1
      return scopes === 1
        ? { files: ['src/a.ts'], added: 10, removed: 2, commits: ['c'] }
        : { files: ['src/a.ts', 'src/auth/session.ts'], added: 30, removed: 2, commits: ['c', 'fix'] }
    }
    return r(p, o, s)
  })
  const fired = logs.filter((l) => /refute: false/.test(l))
  check('sensitive-override-is-logged', 'the sensitive override logs one line in the round it fires', fired.length === 1 && /^Round 2/.test(fired[0]), fired)
}

console.log('\nreview-round: a project that disabled the refuter never gets one, and the result says so')

// CF-111. The pin lane reads .claude/coder-fleet.json, so the workflow learns
// the disabled list itself rather than trusting the lead to pass it. With the
// refuter listed, no path spawns one - not fix: true's default, not
// refute: true, not the sensitive force - and a round that would have refuted
// stops as 'refutation skipped by config', never as a plain 'clean'.
const APPROVE = { verdict: 'approve', summary: 'fine', findings: [] }
// The lane reports the main worktree's file, path included, so every honoured
// case below goes through the main-worktree guard rather than around it.
const MAIN_CONFIG = '/repo/.claude/coder-fleet.json'
function pinWith(text, found = true) {
  return {
    resolved: [{ role: 'base', ref: 'main', sha: 'ba5e0000' }, { role: 'head', ref: 'HEAD', sha: 'facef00d' }],
    worktrees: [{ path: '/repo', head: 'facef00d', dirty: false, isMain: true }],
    fleetConfig: { found, text: found ? text : '', path: MAIN_CONFIG },
    commandsRun: ['git rev-parse'],
    couldNotRun: [],
  }
}
// In harden, as these cases were written before CF-145's phases. A config the
// script does not read or finds invalid leaves the phase build, so those cases
// use a sensitive diff, on which build refutes too.
const OFF = '{"phase": "harden", "disabledAgents": ["refuter"]}'
const refuterCalls = (calls) => calls.filter((c) => c.opts.agentType === 'coder-fleet:refuter')
const sensitiveScope = (r) => (p, o, s) =>
  /git diff --stat/.test(p) ? { files: ['src/session-token.ts'], added: 3, removed: 1, commits: ['c'] } : r(p, o, s)

{
  const { calls } = await runWorkflow('review-round.js', FIX, responder({ reviewer: APPROVE }))
  const pin = calls.find((c) => c.opts.label === 'pin refs')
  check('pin-lane-reads-fleet-config', 'the pin lane is asked for .claude/coder-fleet.json', Boolean(pin) && pin.prompt.includes('.claude/coder-fleet.json'), pin && pin.prompt.slice(-400))
  // The main checkout's file, as hooks/lib/fleet-config.sh resolves it: the
  // first worktree git worktree list --porcelain names. Never the top level of
  // the checkout the lane runs in, which is the branch under review.
  const from = pin ? pin.prompt.indexOf('fleet config') : -1
  const sentence = from < 0 ? '' : pin.prompt.slice(from, pin.prompt.indexOf('Do not review anything', from))
  check('pin-lane-no-main-reads-nothing', 'with no main checkout to find, the pin lane reads no file rather than falling back to its own checkout', /no main checkout|bare/i.test(pin ? pin.prompt : '') && /read no file/i.test(pin ? pin.prompt : ''), pin && pin.prompt.slice(-700))
  check('pin-schema-asks-for-config-path', 'the pin schema requires the path the lane read', Boolean(pin) && JSON.stringify((((pin.opts.schema || {}).properties || {}).fleetConfig || {}).required || []).includes('path'), pin && pin.opts.schema && pin.opts.schema.properties.fleetConfig)
  check('pin-lane-reads-main-checkout-config', 'the pin lane reads the file in the first worktree git worktree list --porcelain names, not the show-toplevel of its own checkout', /git worktree list --porcelain/.test(sentence) && /first/i.test(sentence) && !/show-toplevel/.test(sentence), sentence.slice(0, 600))
}

{
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({ reviewer: APPROVE, 'pin refs': pinWith(OFF) }))
  check('disabled-fix-default-spawns-no-refuter', 'fix: true with the refuter disabled spawns no refuter', refuterCalls(calls).length === 0, calls.map((c) => c.opts.agentType))
  check('disabled-fix-default-stop-is-skipped', 'and stops as refutation skipped by config, not clean', result.stopped === 'refutation skipped by config', result.stopped)
  check('disabled-result-names-the-file', 'refutationSkipped names .claude/coder-fleet.json', /\.claude\/coder-fleet\.json/.test(result.refutationSkipped || ''), result.refutationSkipped)
  check('disabled-result-carries-list', 'the result carries the disabled list and the config state', JSON.stringify(result.disabledAgents) === '["refuter"]' && result.fleetConfig && result.fleetConfig.state === 'ok', [result.disabledAgents, result.fleetConfig])
  check('disabled-approval-stands', 'a reviewer approval with both gate lanes run is still an approval', result.approved === true && result.refutation === null && result.refuted === false, [result.approved, result.refutation, result.refuted])
  const step = result.nextStep || ''
  check('disabled-next-step-says-skipped', 'the next step says the refutation was skipped by the project and nothing ran in its place', /disable/i.test(step) && /\.claude\/coder-fleet\.json/.test(step) && /nothing (was )?run in its place|no substitute/i.test(step), step.slice(0, 300))
}

{
  const { result, calls } = await runWorkflow('review-round.js', { ...FIX, refute: false }, sensitiveScope(responder({ reviewer: APPROVE, 'pin refs': pinWith(OFF) })))
  check('disabled-beats-sensitive-force', 'a sensitive round under fix: true spawns no refuter when it is disabled', refuterCalls(calls).length === 0, calls.map((c) => c.opts.agentType))
  check('disabled-sensitive-stop-is-skipped', 'and reports the refutation the force called for as skipped', result.stopped === 'refutation skipped by config' && result.sensitive === true, [result.stopped, result.sensitive])
}

{
  const { result, calls } = await runWorkflow('review-round.js', FIX, sensitiveScope(responder({ reviewer: APPROVE, 'pin refs': pinWith(OFF) })))
  check('disabled-sensitive-default-spawns-none', 'a sensitive round under plain fix: true spawns no refuter either', refuterCalls(calls).length === 0 && result.stopped === 'refutation skipped by config', [refuterCalls(calls).length, result.stopped])
  // fix: true called for the refutation and the paths are sensitive too: the
  // reason names both, so a sensitive skip is never described as routine.
  check('disabled-sensitive-skip-names-files', 'the skip reason names the sensitive files even when fix: true also called for a refutation', /fix: true/.test(result.refutationSkipped || '') && /src\/session-token\.ts/.test(result.refutationSkipped || ''), result.refutationSkipped)
}

// The guard against self-exemption: a reviewed range that changes the config
// file cannot use it to skip its own refuter, so the round refutes as it
// would with no config, and says why.
{
  const scopeWithConfig = (r) => (p, o, s) =>
    /git diff --stat/.test(p) ? { files: ['src/session-token.ts', '.claude/coder-fleet.json'], added: 4, removed: 1, commits: ['c'] } : r(p, o, s)
  const { result, calls, logs } = await runWorkflow('review-round.js', FIX, scopeWithConfig(responder({ reviewer: APPROVE, 'pin refs': pinWith(OFF) })))
  check('config-in-range-still-refutes', 'a sensitive diff that also adds .claude/coder-fleet.json still spawns a refuter', refuterCalls(calls).length === 1 && result.stopped === 'clean' && result.refutationSkipped === null, [refuterCalls(calls).length, result.stopped, result.refutationSkipped])
  check('config-in-range-is-logged', 'and the log says the range changes the file, so its disabled list is not honoured for this round', logs.some((l) => /\.claude\/coder-fleet\.json/.test(l) && /refuter/.test(l) && /changes|changed|touches/.test(l)), logs.filter((l) => /coder-fleet\.json/.test(l)))
}
{
  const plainWithConfig = (r) => (p, o, s) =>
    /git diff --stat/.test(p) ? { files: ['src/a.ts', '.Claude/Coder-Fleet.json'], added: 4, removed: 1, commits: ['c'] } : r(p, o, s)
  const { calls } = await runWorkflow('review-round.js', FIX, plainWithConfig(responder({ reviewer: APPROVE, 'pin refs': pinWith(OFF) })))
  check('config-in-range-any-case-refutes', 'an ordinary diff that changes the file in another case (one file on a case-blind disk) refutes too', refuterCalls(calls).length === 1, refuterCalls(calls).length)
}
// A fix round that adds the file: round 1 skips by config, round 2 does not.
{
  let scopes = 0
  const r = responder({ 'pin refs': pinWith(OFF) })
  const { result, calls } = await runWorkflow('review-round.js', FIX, (p, o, s) => {
    if (/git diff --stat/.test(p)) {
      scopes += 1
      return scopes === 1
        ? { files: ['src/a.ts'], added: 10, removed: 2, commits: ['c'] }
        : { files: ['src/a.ts', '.claude/coder-fleet.json'], added: 12, removed: 2, commits: ['c', 'fix'] }
    }
    return r(p, o, s)
  })
  check('config-added-by-fix-refutes', 'a fix round that adds .claude/coder-fleet.json gets its refuter', refuterCalls(calls).length === 1 && result.roundsRun === 2, [refuterCalls(calls).length, result.roundsRun, result.stopped])
}

{
  const { result, calls } = await runWorkflow('review-round.js', { range: 'main...x', issue: 'X-1', refute: true }, responder({ reviewer: APPROVE, 'pin refs': pinWith(OFF) }))
  check('disabled-beats-refute-true', 'refute: true on an ordinary review spawns no refuter when it is disabled', refuterCalls(calls).length === 0 && result.stopped === 'refutation skipped by config', [refuterCalls(calls).length, result.stopped])
}

{
  const { result, calls } = await runWorkflow('review-round.js', { ...FIX, refute: false }, responder({ reviewer: APPROVE, 'pin refs': pinWith(OFF) }))
  check('disabled-nothing-called-for-is-clean', 'with no refutation called for, a disabled refuter changes nothing: clean, nothing skipped', refuterCalls(calls).length === 0 && result.stopped === 'clean' && result.refutationSkipped === null, [result.stopped, result.refutationSkipped])
}

// A fix round that adds a sensitive path still spawns no refuter.
{
  let scopes = 0
  const r = responder({ 'pin refs': pinWith(OFF) })
  const { result, calls } = await runWorkflow('review-round.js', { ...FIX, refute: false }, (p, o, s) => {
    if (/git diff --stat/.test(p)) {
      scopes += 1
      return scopes === 1
        ? { files: ['src/a.ts'], added: 10, removed: 2, commits: ['c'] }
        : { files: ['src/a.ts', 'src/auth/session.ts'], added: 30, removed: 2, commits: ['c', 'fix'] }
    }
    return r(p, o, s)
  })
  check('disabled-fix-round-sensitive-spawns-none', 'a fix round that adds a sensitive path spawns no refuter when it is disabled', refuterCalls(calls).length === 0 && result.stopped === 'refutation skipped by config' && result.roundsRun === 2, [refuterCalls(calls).length, result.stopped, result.roundsRun])
}

// No substitute gate run: the round runs the same four mechanical lanes it runs
// for any change, and a missing gate lane is reported exactly as today.
{
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({ reviewer: APPROVE, 'pin refs': pinWith(OFF), 'Round 1: tests': null }))
  const lanes = calls.filter((c) => /mechanical/.test(c.opts.phase || ''))
  check('disabled-runs-no-extra-lanes', 'a skipped refutation adds no lane beyond the four mechanical ones', lanes.length === 4, lanes.map((c) => c.opts.label))
  check('disabled-missing-gate-not-approved', 'and a missing gate lane still makes it no approval', result.approved === false && /^Not an approval/.test(result.nextStep || '') && (result.gatesMissing || []).includes('tests'), [result.approved, (result.nextStep || '').slice(0, 80)])
}

// Re-enabling restores today's behaviour: no file, an empty list, or another
// agent listed all refute exactly as before.
for (const [label, pin, scope] of [
  ['absent', pinWith('', false), sensitiveScope],
  ['empty-object', pinWith('{}'), sensitiveScope],
  ['harden-only', pinWith('{"phase": "harden"}'), (r) => r],
  ['empty-list', pinWith('{"phase": "harden", "disabledAgents": []}'), (r) => r],
  ['scout-only', pinWith('{"phase": "harden", "disabledAgents": ["scout"]}'), (r) => r],
]) {
  const { result, calls } = await runWorkflow('review-round.js', FIX, scope(responder({ reviewer: APPROVE, 'pin refs': pin })))
  check('enabled-refutes-' + label, 'with the refuter not disabled (' + label + ') fix: true refutes as today and stops clean', refuterCalls(calls).length === 1 && result.stopped === 'clean' && result.refutationSkipped === null, [refuterCalls(calls).length, result.stopped])
}

// A lane that read a linked worktree's copy is not believed: the file that
// counts is the main checkout's, so the refuter stays on and the result says
// the config was not read. A path that is the main checkout's is honoured.
{
  const linked = pinWith(OFF)
  linked.worktrees.push({ path: '/repo/.claude/worktrees/agent-x', head: 'facef00d', dirty: false, isMain: false })
  linked.fleetConfig.path = '/repo/.claude/worktrees/agent-x/.claude/coder-fleet.json'
  const { result, calls } = await runWorkflow('review-round.js', FIX, sensitiveScope(responder({ reviewer: APPROVE, 'pin refs': linked })))
  check('linked-worktree-config-not-honoured', 'a config the lane read from a linked worktree disables nothing, and the result says it was not read', refuterCalls(calls).length === 1 && result.fleetConfig && result.fleetConfig.state === 'unread' && /main/.test(result.fleetConfig.reason), [refuterCalls(calls).length, result.fleetConfig])
  const main = pinWith(OFF)
  main.fleetConfig.path = '/repo/.claude/coder-fleet.json'
  const { result: r2, calls: c2 } = await runWorkflow('review-round.js', FIX, responder({ reviewer: APPROVE, 'pin refs': main }))
  check('main-worktree-config-honoured', 'the main checkout\'s config, path reported, disables the refuter', refuterCalls(c2).length === 0 && r2.stopped === 'refutation skipped by config', [refuterCalls(c2).length, r2.stopped])
}

// A lane that says it found the file but not where cannot be checked against
// the main worktree, so it is not believed either: an empty path, a blank one
// and no path at all each leave the refuter on.
for (const [label, mutate] of [
  ['empty', (fc) => { fc.path = '' }],
  ['blank', (fc) => { fc.path = '   ' }],
  ['missing', (fc) => { delete fc.path }],
]) {
  const pin = pinWith(OFF)
  mutate(pin.fleetConfig)
  const { result, calls } = await runWorkflow('review-round.js', FIX, sensitiveScope(responder({ reviewer: APPROVE, 'pin refs': pin })))
  check('found-config-' + label + '-path-not-honoured', 'a config the lane found but whose path it reported as ' + label + ' disables nothing, and the result says it was not read', refuterCalls(calls).length === 1 && result.fleetConfig && result.fleetConfig.state === 'unread' && result.stopped === 'clean', [refuterCalls(calls).length, result.fleetConfig, result.stopped])
}

// A pin lane that reports no fleetConfig at all (every older stub above) is
// today's behaviour, and the result says the file was not read.
{
  const noConfig = pinWith('')
  delete noConfig.fleetConfig
  const { result, calls } = await runWorkflow('review-round.js', FIX, sensitiveScope(responder({ reviewer: APPROVE, 'pin refs': noConfig })))
  check('unread-config-refutes', 'a pin lane that did not report the config leaves the refuter on, and the phase build', refuterCalls(calls).length === 1 && result.fleetConfig && result.fleetConfig.state === 'unread' && result.phase === 'build', [refuterCalls(calls).length, result.fleetConfig, result.phase])
}

// An invalid file honours nothing, as the hook does.
for (const [label, text] of [
  ['core-listed', '{"disabledAgents": ["refuter", "coder"]}'],
  ['broken-json', '{"disabledAgents": ["refuter"'],
  ['not-a-list', '{"disabledAgents": "refuter"}'],
]) {
  const { result, calls } = await runWorkflow('review-round.js', FIX, sensitiveScope(responder({ reviewer: APPROVE, 'pin refs': pinWith(text) })))
  check('invalid-config-honours-nothing-' + label, 'an invalid config (' + label + ') keeps the refuter and reports the config invalid', refuterCalls(calls).length === 1 && result.fleetConfig && result.fleetConfig.state === 'invalid' && Boolean(result.fleetConfig.reason), [refuterCalls(calls).length, result.fleetConfig])
}

console.log('\nreview-round: the build phase runs one round and defers the rest; harden runs the loop (CF-145)')

// `phase` in the main checkout's .claude/coder-fleet.json. Build, the default,
// runs one round, commissions no fix round (a blocking verdict is handed back,
// and a Low finding is reported and never fixed), refutes only when today's
// rule calls for it AND the diff touches an authentication or credential path
// (SENSITIVE), and reports follow-ups and proposals without filing them.
// Harden is review-round as it was, which every case above already pins.
const BUILD = pinWith('{"phase": "build"}')
const HARDEN = pinWith('{"phase": "harden"}')
const coderCalls = (calls) => calls.filter((c) => c.opts.agentType === 'coder-fleet:coder')
const BUILD_NOTE_RE = /build phase/i

for (const [label, pin] of [
  ['set', BUILD],
  ['absent', pinWith('', false)],
  ['invalid', pinWith('{"phase": "Harden"}')],
  ['unread', (() => { const p = pinWith(''); delete p.fleetConfig; return p })()],
]) {
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({ 'pin refs': pin }))
  check('build-' + label + '-one-round', 'build (' + label + '): a blocking verdict under fix: true ends the run after one round', result.roundsRun === 1 && result.phase === 'build', [result.roundsRun, result.phase, result.stopped])
  check('build-' + label + '-no-fix-round', 'build (' + label + '): and commissions no fix round - no coder, no fix worktree, no card gate', coderCalls(calls).length === 0 && !calls.some((c) => c.opts.label === 'fix worktree' || c.opts.label === 'card gate') && result.fixes.length === 0 && result.fixWorktrees.length === 0, calls.map((c) => c.opts.label))
  check('build-' + label + '-hands-back', 'build (' + label + '): the blocking finding is handed back to the lead as a fixRequest', result.stopped === 'fix handoff required' && result.fixRequest && result.fixRequest.findings.length === 1 && result.fixRequest.findings[0].what === 'bug', [result.stopped, result.fixRequest])
}
{
  const { result, logs } = await runWorkflow('review-round.js', FIX, responder({ 'pin refs': pinWith('{"phase": "Harden"}') }))
  check('build-invalid-phase-reported', 'an invalid phase is reported in the result and the log, and read as build', result.fleetConfig.phaseState === 'invalid' && /"Harden"/.test(result.fleetConfig.phaseReason) && logs.some((l) => /phase/.test(l) && /"Harden"/.test(l) && /build/.test(l)), [result.fleetConfig, logs.filter((l) => /phase/i.test(l))])
}
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({ 'pin refs': BUILD }))
  const step = result.nextStep || ''
  check('build-handoff-next-step', 'the build next step says the run reviews once and commissions no fix itself, and how to get the loop', BUILD_NOTE_RE.test(step) && /harden/.test(step) && !/Passing fix: true with the issue does all of that here/.test(step), step)
}
{
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({ 'pin refs': HARDEN }))
  check('harden-runs-the-loop', 'harden: the same verdict under fix: true commissions the fix and reviews it in round 2, as before', coderCalls(calls).length === 1 && result.roundsRun === 2 && result.phase === 'harden' && !BUILD_NOTE_RE.test(result.nextStep || ''), [coderCalls(calls).length, result.roundsRun, result.phase, result.stopped])
}

// Low findings: build reports them and never fixes them.
{
  const BLOCK = { blocking: true, file: 'src/a.ts', what: 'bug', why: 'w' }
  const reviewer = { verdict: 'request changes', summary: 's', findings: [BLOCK, LOW] }
  const { result, calls } = await runWorkflow('review-round.js', FIX, responder({ reviewer, 'pin refs': BUILD }))
  check('build-low-not-in-fix-request', 'build: a Low finding beside a blocking one is not in the fixRequest', result.fixRequest && !hasWhat(result.fixRequest.findings, 'misnamed-test') && !('low' in result.fixRequest), result.fixRequest)
  check('build-low-reported-dropped', 'build: it is reported under dropped, not low, and no coder is asked to fix it', hasWhat(result.dropped, 'misnamed-test') && (result.low || []).length === 0 && coderCalls(calls).length === 0, [result.low, result.dropped])
  check('build-low-no-fix-note', 'build: the next step does not send the Low finding to a fix run', !/go in the brief of the fix run/.test(result.nextStep || ''), result.nextStep)
  const { result: h, calls: hc } = await runWorkflow('review-round.js', FIX, responder({ reviewer: (p, o, s) => (s.round++ === 0 ? reviewer : APPROVE), 'pin refs': HARDEN }))
  const brief = (coderCalls(hc)[0] || {}).prompt || ''
  check('harden-low-rides-fix', 'harden: the same Low finding rides the fix run, as before', /misnamed-test/.test(brief) && h.roundsRun === 2, [h.roundsRun, brief.slice(0, 120)])
}
{
  // A refuted stop commissions a test fix, and in harden its Low findings ride it.
  const survived = handoff({ done: ['survived: flip the expiry check - no test noticed'] })
  const reviewer = { verdict: 'approve', summary: 'fine', findings: [LOW] }
  const { result } = await runWorkflow('review-round.js', FIX, sensitiveScope(responder({ reviewer, 'pin refs': BUILD, 'Round 1 refutation': survived })))
  check('build-refuted-low-dropped', 'build: on a refuted stop the Low finding is still reported under dropped, not sent to a fix', result.stopped === 'refuted' && hasWhat(result.dropped, 'misnamed-test') && (result.low || []).length === 0, [result.stopped, result.low, result.dropped])
  const { result: h } = await runWorkflow('review-round.js', FIX, sensitiveScope(responder({ reviewer, 'pin refs': HARDEN, 'Round 1 refutation': survived })))
  check('harden-refuted-low-follows', 'harden: on a refuted stop the Low finding goes to the fix that follows, as before', h.stopped === 'refuted' && hasWhat(h.low, 'misnamed-test') && (h.dropped || []).length === 0, [h.stopped, h.low, h.dropped])
}

// The refuter: build spawns one only on authentication or credential paths.
for (const [label, args, scope, pin, want, stop] of [
  ['build-plain-fix', FIX, (r) => r, BUILD, 0, 'refutation skipped by build phase'],
  ['build-plain-refute-true', { range: 'main...x', issue: 'X-1', refute: true }, (r) => r, BUILD, 0, 'refutation skipped by build phase'],
  ['build-sensitive-fix', FIX, sensitiveScope, BUILD, 1, 'clean'],
  ['build-sensitive-refute-true', { range: 'main...x', issue: 'X-1', refute: true }, sensitiveScope, BUILD, 1, 'clean'],
  ['build-sensitive-fix-refute-false', { ...FIX, refute: false }, sensitiveScope, BUILD, 1, 'clean'],
  ['build-sensitive-not-called-for', { range: 'main...x', issue: 'X-1' }, sensitiveScope, BUILD, 0, 'clean'],
  ['build-plain-fix-refute-false', { ...FIX, refute: false }, (r) => r, BUILD, 0, 'clean'],
  ['build-sensitive-disabled', FIX, sensitiveScope, pinWith('{"disabledAgents": ["refuter"]}'), 0, 'refutation skipped by config'],
  ['harden-plain-fix', FIX, (r) => r, HARDEN, 1, 'clean'],
  ['harden-plain-refute-true', { range: 'main...x', issue: 'X-1', refute: true }, (r) => r, HARDEN, 1, 'clean'],
]) {
  const { result, calls } = await runWorkflow('review-round.js', args, scope(responder({ reviewer: APPROVE, 'pin refs': pin })))
  check('refuter-' + label, label + ': ' + want + ' refuter spawn(s), stopped ' + stop, refuterCalls(calls).length === want && result.stopped === stop, [refuterCalls(calls).length, result.stopped])
}
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({ reviewer: APPROVE, 'pin refs': BUILD }))
  check('build-skip-says-why', 'build: a skipped refutation says the build phase skipped it and names the config file', BUILD_NOTE_RE.test(result.refutationSkipped || '') && /\.claude\/coder-fleet\.json/.test(result.refutationSkipped || ''), result.refutationSkipped)
  check('build-skip-approves', 'build: with both gate lanes run, a clean verdict whose refutation the phase skipped is an approval', result.approved === true && result.refutation === null, [result.approved, result.refutation])
  check('build-skip-next-step', 'build: the next step says no refuter ran because of the phase, and how to get one', BUILD_NOTE_RE.test(result.nextStep || '') && /refuter/.test(result.nextStep || '') && /harden/.test(result.nextStep || ''), result.nextStep)
}
{
  const { result } = await runWorkflow('review-round.js', FIX, responder({ reviewer: APPROVE, 'pin refs': BUILD, 'Round 1: tests': null }))
  check('build-skip-missing-gate-not-approved', 'build: a missing gate lane still makes a phase-skipped round no approval', result.approved === false && /^Not an approval/.test(result.nextStep || ''), [result.approved, (result.nextStep || '').slice(0, 80)])
}

// No self-exemption (CF-111's guard, extended to the phase): the phase is read
// from the main checkout's live file, and a reviewed range that changes that
// file - a branch checked out in the main checkout setting its own phase to
// build - cannot use the build phase to skip a refutation the round called
// for. Its refuter runs, sensitive paths or not, and the log says why.
for (const [label, pin, files] of [
  ['set-build', BUILD, ['src/a.ts', '.claude/coder-fleet.json']],
  ['default-build', pinWith('', false), ['src/a.ts', '.claude/coder-fleet.json']],
  ['other-case', BUILD, ['src/a.ts', '.Claude/Coder-Fleet.json']],
  ['config-only', BUILD, ['.claude/coder-fleet.json']],
]) {
  const scope = (r) => (p, o, s) => (/git diff --stat/.test(p) ? { files, added: 2, removed: 1, commits: ['c'] } : r(p, o, s))
  const { result, calls, logs } = await runWorkflow('review-round.js', FIX, scope(responder({ reviewer: APPROVE, 'pin refs': pin })))
  check('build-config-in-range-refutes-' + label, 'build, range changes .claude/coder-fleet.json (' + label + '): the refuter runs and nothing is skipped', refuterCalls(calls).length === 1 && result.stopped === 'clean' && result.refutationSkipped === null, [refuterCalls(calls).length, result.stopped, result.refutationSkipped])
  check('build-config-in-range-logged-' + label, 'and the log says the range changes the file, so the build phase does not skip its refuter', logs.some((l) => /reviewed range changes/.test(l) && /coder-fleet\.json/i.test(l) && /build phase/.test(l) && /refuter runs/.test(l)), logs.filter((l) => /coder-fleet\.json/i.test(l)))
}
// The other self-exemption route: a copy read anywhere but the main checkout
// is not believed, so a linked worktree saying harden leaves the run in build.
{
  const linked = pinWith('{"phase": "harden"}')
  linked.worktrees.push({ path: '/repo/.claude/worktrees/agent-x', head: 'facef00d', dirty: false, isMain: false })
  linked.fleetConfig.path = '/repo/.claude/worktrees/agent-x/.claude/coder-fleet.json'
  const { result } = await runWorkflow('review-round.js', FIX, responder({ 'pin refs': linked }))
  check('linked-worktree-phase-not-honoured', 'a phase read from a linked worktree is not believed: the run is in build', result.phase === 'build' && result.fleetConfig.state === 'unread' && result.roundsRun === 1, [result.phase, result.fleetConfig, result.roundsRun])
}

// Proposals and follow-ups: build reports them and says they are not filed.
{
  const reviewer = { verdict: 'approve with follow-ups', summary: 'fine', findings: [FOLLOW] }
  const { result } = await runWorkflow('review-round.js', FIX, responder({ reviewer, 'pin refs': BUILD }))
  const step = result.nextStep || ''
  check('build-follow-ups-reported', 'build: the follow-up is reported in the result', hasWhat(result.followUps, 'follow-up-work') && Array.isArray(result.proposals), [result.followUps, result.proposals])
  check('build-follow-ups-not-filed', 'build: the next step says follow-ups and proposals are reported, not filed as cards', /not filed/i.test(step) && /proposals/.test(step) && !/decide which become items/.test(step), step)
  const { result: h } = await runWorkflow('review-round.js', FIX, responder({ reviewer, 'pin refs': HARDEN }))
  check('harden-follow-ups-as-before', 'harden: the next step leaves the lead to decide which become items, as before', /decide which become items/.test(h.nextStep || '') && !BUILD_NOTE_RE.test(h.nextStep || ''), h.nextStep)
}

// The workflow and the hook read the file the same way. Each fixture goes to
// the shell helper the hook sources and to review-round's pin lane, and the
// two must agree on the state and on the disabled list.
{
  const helper = join(PLUGIN_ROOT, 'hooks', 'lib', 'fleet-config.sh')
  const dir = mkdtempSync(join(tmpdir(), 'fleet-config-parity-'))
  mkdirSync(join(dir, '.claude'))
  const disagreements = []
  const wrong = []
  const reasonsSplit = []
  // CF-111 round 2: jq 1.6 accepted number forms (01, 1., .5, +1) that
  // JSON.parse refuses, so the shell now parses with python3's json module.
  // Each pair is an input and the answer both readers must give. Raw control
  // characters and trailing form feeds were already refused by jq and are
  // pinned so the new parser keeps refusing them. The second half are the
  // places python3 and JSON.parse were found to differ out of the box (a deep
  // array, a long integer) and the edges around them that must not move.
  const R = '{"disabledAgents":["refuter"],'
  const nest = (n) => R + '"x":' + '['.repeat(n) + ']'.repeat(n) + '}'
  const STRICT_FIXTURES = [
    [R + '"x":01}', 'invalid|'],
    [R + '"x":1.}', 'invalid|'],
    [R + '"x":.5}', 'invalid|'],
    [R + '"x":+1}', 'invalid|'],
    [R + '"x":-01}', 'invalid|'],
    [R + '"x":1.e5}', 'invalid|'],
    [R + '"x":00}', 'invalid|'],
    // A digit outside ASCII (Arabic-Indic one and five) is no JSON digit.
    // python's pure-Python scanner matches numbers with a Unicode \d, so
    // these hold the parser to the C scanner's ASCII-only reading.
    [R + '"x":1١}', 'invalid|'],
    [R + '"x":١}', 'invalid|'],
    [R + '"x":1.٥}', 'invalid|'],
    [R + '"x":1e٥}', 'invalid|'],
    [R + '"x":"a\tb"}', 'invalid|'],
    [R + '"a\nb":1}', 'invalid|'],
    ['{"disabledAgents":["refuter"]}\f', 'invalid|'],
    ['{"disabledAgents":["refuter"]}\v', 'invalid|'],
    // JSON's own whitespace around the value, and number forms it allows.
    ['\n\t {"disabledAgents":["refuter"]}\r\n\t ', 'ok|refuter'],
    [R + '"x":-0.5e+10,"y":0,"z":-0,"w":1E-2}', 'ok|refuter'],
    [R + '"x":1e400}', 'ok|refuter'],
    // python3.11+ refuses an integer of more than 4300 digits by default.
    [R + '"x":' + '1'.repeat(5000) + '}', 'ok|refuter'],
    // python3 runs out of recursion on a deep array and JSON.parse does not,
    // so both refuse a document nested deeper than 64 levels.
    [nest(63), 'ok|refuter'],
    [nest(64), 'invalid|'],
    [nest(100000), 'invalid|'],
    // Counted on the text: broken JSON nested too deep gets the same reason in
    // both, and brackets inside a string, escaped quote or not, do not count.
    [R + '"x":' + '['.repeat(100), 'invalid|'],
    [R + '"x":"' + '['.repeat(100) + '"}', 'ok|refuter'],
    [R + '"x":"\\"' + '{'.repeat(100) + '\\\\"}', 'ok|refuter'],
    // A lone surrogate is legal JSON to both; in a name it is not printable.
    [R + '"x":"\\ud800"}', 'ok|refuter'],
    ['{"disabledAgents":["refuter\\ud800"]}', 'invalid|'],
    ['{"disabledAgents":["refuter\\udc00x"]}', 'invalid|'],
    // DEL is not printable ASCII, raw or escaped.
    [R + '"x":"\x7f"}', 'ok|refuter'],
    ['{"disabledAgents":["refuter\x7f"]}', 'invalid|'],
    ['{"disabledAgents":["refuter\\u007f"]}', 'invalid|'],
    // An escaped key is the same key; __proto__ is an ordinary key to both.
    ['{"disabled\\u0041gents":["refuter"]}', 'ok|refuter'],
    ['{"__proto__":{"disabledAgents":["refuter"]}}', 'ok|'],
    ['{"__proto__":{"disabledAgents":["refuter"]},"disabledAgents":["scout"]}', 'ok|scout'],
    // Bytes that are not UTF-8 read as U+FFFD in both.
    [Buffer.concat([Buffer.from(R + '"x":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]), 'ok|refuter'],
    [Buffer.concat([Buffer.from('{"disabledAgents":["refuter'), Buffer.from([0xed, 0xa0, 0x80]), Buffer.from('"]}')]), 'invalid|'],
    // Names outside printable ASCII: the reason quotes them the same way.
    ['{"disabledAgents":["refuter\\t"]}', 'invalid|'],
    ['{"disabledAgents":[" Refuter\\t"]}', 'invalid|'],
    ['{"disabledAgents":["\\u212Aeeper", "refuter\\u0085", "\\ud83d\\ude00", "a\\"b\\\\c"]}', 'invalid|'],
    ['{"disabledAgents":["refuter\\u0000"]}', 'invalid|'],
  ]
  const WANT = new Map(STRICT_FIXTURES)
  // Agreement alone would pass two readers that are wrong the same way.
  const PARITY_WANT = {
    '{"disabledAgents":["refuter"]} {"disabledAgents":["lead"]}': 'invalid|',
    '{"disabledAgents":["refuter"]} {"disabledAgents":["scout"]}': 'invalid|',
    '{"disabledAgents": [" coder-fleet:refuter"]}': 'ok|refuter',
    '{"disabledAgents": ["coder-fleet: refuter"]}': 'invalid|',
    '{"disabledAgents": ["Coder-Fleet:refuter"]}': 'ok|refuter',
    '{"disabledAgents": ["refuterK"]}': 'invalid|',
    '{"disabledAgents": ["refuter", "Keeper"]}': 'invalid|',
    '{"disabledAgents": ["refuter", "\\u212Aeeper"]}': 'invalid|',
    '{"disabledAgents": ["refuter﻿"]}': 'invalid|',
    '{"disabledAgents": ["refuter\u0085"]}': 'invalid|',
    '{"disabledAgents": ["refuter "]}': 'invalid|',
    '{"disabledAgents": [" refuter"]}': 'invalid|',
    '﻿{"disabledAgents": ["refuter"]}': 'invalid|',
    '{"disabledAgents": ["refuter\\nx"]}': 'invalid|',
    '{"disabledAgents": ["refuter\\n"]}': 'invalid|',
    '{"disabledAgents": ["\\trefuter"]}': 'invalid|',
    '{"disabledAgents": ["refuter"], "x": NaN}': 'invalid|',
    '{"disabledAgents": ["refuter"], "x": -Infinity}': 'invalid|',
    '{"disabledAgents": ["lead"], "disabledAgents": ["refuter"]}': 'ok|refuter',
  }
  // CF-145: the phase each reader gives, as phase|phaseState. Absent means
  // build; anything but the exact string "build" or "harden" is reported and
  // read as build. The phase is judged apart from disabledAgents, so a bad
  // list does not void a good phase, and a bad phase does not void the list.
  const PHASE_FIXTURES = [
    ['{"phase": "build"}', 'ok|', 'build|ok'],
    ['{"phase": "harden"}', 'ok|', 'harden|ok'],
    ['{"phase": "harden", "disabledAgents": ["refuter"]}', 'ok|refuter', 'harden|ok'],
    ['{"disabledAgents": ["refuter"]}', 'ok|refuter', 'build|default'],
    ['{}', 'ok|', 'build|default'],
    ['{"phase": "Harden"}', 'ok|', 'build|invalid'],
    ['{"phase": " harden"}', 'ok|', 'build|invalid'],
    ['{"phase": "harden "}', 'ok|', 'build|invalid'],
    ['{"phase": ""}', 'ok|', 'build|invalid'],
    ['{"phase": "polish"}', 'ok|', 'build|invalid'],
    ['{"phase": 1}', 'ok|', 'build|invalid'],
    ['{"phase": null}', 'ok|', 'build|invalid'],
    ['{"phase": true}', 'ok|', 'build|invalid'],
    ['{"phase": ["harden"]}', 'ok|', 'build|invalid'],
    ['{"phase": {"harden": true}}', 'ok|', 'build|invalid'],
    ['{"phase": "harden\\u0000"}', 'ok|', 'build|invalid'],
    ['{"phase": "h\\u00e4rden", "disabledAgents": ["scout"]}', 'ok|scout', 'build|invalid'],
    ['{"phase": "h\\u212Arden"}', 'ok|', 'build|invalid'],
    ['{"phase": "harden\\ud800"}', 'ok|', 'build|invalid'],
    ['{"phase": "harden\\nx"}', 'ok|', 'build|invalid'],
    // Independent of the list, both ways.
    ['{"phase": "harden", "disabledAgents": ["lead"]}', 'invalid|', 'harden|ok'],
    ['{"phase": "nope", "disabledAgents": ["refuter"]}', 'ok|refuter', 'build|invalid'],
    // Duplicate keys: the last wins, as for the list.
    ['{"phase": "build", "phase": "harden"}', 'ok|', 'harden|ok'],
    ['{"phase": "harden", "phase": "nope"}', 'ok|', 'build|invalid'],
    // An escaped key is the same key; __proto__ is an ordinary key.
    ['{"ph\\u0061se": "harden"}', 'ok|', 'harden|ok'],
    ['{"__proto__": {"phase": "harden"}}', 'ok|', 'build|default'],
    // No JSON object at all: nothing is read, so the phase is the default.
    ['{"phase": "harden"', 'invalid|', 'build|default'],
    ['{"phase": "harden"} {"phase": "build"}', 'invalid|', 'build|default'],
    ['["harden"]', 'invalid|', 'build|default'],
    ['"harden"', 'invalid|', 'build|default'],
    ['﻿{"phase": "harden"}', 'invalid|', 'build|default'],
    ['{"phase": "harden", "x": 01}', 'invalid|', 'build|default'],
    ['{"phase": "harden", "x": NaN}', 'invalid|', 'build|default'],
    ['', 'invalid|', 'build|default'],
    // The shapes where a lenient parser and JSON.parse part ways, each one
    // carrying "harden", so a reader that let one through would say harden.
    ['{"phase": "harden"} x', 'invalid|', 'build|default'],
    ['{"phase": "harden"},', 'invalid|', 'build|default'],
    ['{"phase": "harden"}\f', 'invalid|', 'build|default'],
    ['{"phase": "harden",}', 'invalid|', 'build|default'],
    ["{'phase': 'harden'}", 'invalid|', 'build|default'],
    ['{phase: "harden"}', 'invalid|', 'build|default'],
    ['{"phase": "harden", "x": .5}', 'invalid|', 'build|default'],
    ['{"phase": "harden", "x": +1}', 'invalid|', 'build|default'],
    ['{"phase": "harden", "x": Infinity}', 'invalid|', 'build|default'],
    ['{"phase": "harden"} // build', 'invalid|', 'build|default'],
    ['{"phase": "har\tden"}', 'invalid|', 'build|default'],
    ['{"phase": "harden\n"}', 'invalid|', 'build|default'],
    ['{"phase": "harden", "x": ' + '['.repeat(64) + ']'.repeat(64) + '}', 'invalid|', 'build|default'],
    ['{"phase": "harden", "x": ' + '['.repeat(63) + ']'.repeat(63) + '}', 'ok|', 'harden|ok'],
    ['\n\t {"phase": "harden"}\r\n ', 'ok|', 'harden|ok'],
    ['{"phase": "\\u0068arden"}', 'ok|', 'harden|ok'],
    ['{"phase": "harden\\t"}', 'ok|', 'build|invalid'],
    ['{"phase": "harden\\u00a0"}', 'ok|', 'build|invalid'],
    ['{"phase": "HARDEN"}', 'ok|', 'build|invalid'],
    ['{"phase": 0}', 'ok|', 'build|invalid'],
    ['{"phase": "harden", "phase": null}', 'ok|', 'build|invalid'],
    ['{"phase": null, "phase": "harden"}', 'ok|', 'harden|ok'],
  ]
  const phaseSplit = []
  const phaseWrong = []
  const phaseReasonSplit = []
  const readShell = (d) =>
    execFileSync('/bin/bash', ['-c', '. "$1"; fleet_config_read "$2"; printf "%s\\037%s\\037%s\\037%s\\037%s\\037%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED" "$FLEET_CONFIG_REASON" "${FLEET_CONFIG_PHASE-}" "${FLEET_CONFIG_PHASE_STATE-}" "${FLEET_CONFIG_PHASE_REASON-}"', '_', helper, d], { encoding: 'utf8' }).split('\x1f')
  const jsPhase = (result) => {
    const fc = result.fleetConfig || {}
    return { phase: fc.phase + '|' + fc.phaseState, reason: fc.phaseReason, top: result.phase }
  }
  try {
    for (const input of [
      '{"disabledAgents": ["refuter"]}',
      '{"disabledAgents": ["coder-fleet:Refuter", " scout "]}',
      '{"disabledAgents": ["refuter", "refuter"]}',
      '{"disabledAgents": ["scout", "refuter"]}',
      '{}',
      '{"disabledAgents": []}',
      '{"disabledAgents": ["reviewer"]}',
      '{"disabledAgents": ["refuter", "Lead"]}',
      '{"disabledAgents": ["re futer"]}',
      '{"disabledAgents": [1]}',
      '{"disabledAgents": null}',
      '["refuter"]',
      'null',
      '{"disabledAgents": ["refuter"',
      '',
      // CF-111 round 1: every input the two readers once disagreed on.
      // A multi-value stream: jq reads each value, JSON.parse refuses it.
      '{"disabledAgents":["refuter"]} {"disabledAgents":["lead"]}',
      '{"disabledAgents":["refuter"]} {"disabledAgents":["scout"]}',
      // Padded and prefixed: trimmed before the prefix is dropped, in both.
      '{"disabledAgents": [" coder-fleet:refuter"]}',
      '{"disabledAgents": ["coder-fleet: refuter"]}',
      '{"disabledAgents": ["Coder-Fleet:refuter"]}',
      // Non-ASCII: the Kelvin sign lower-cases to k in JS and not in jq; the
      // others are whitespace to one reader and not the other. All invalid.
      '{"disabledAgents": ["refuterK"]}',
      '{"disabledAgents": ["refuter", "Keeper"]}',
      '{"disabledAgents": ["refuter", "\\u212Aeeper"]}',
      '{"disabledAgents": ["refuter﻿"]}',
      '{"disabledAgents": ["refuter\u0085"]}',
      '{"disabledAgents": ["refuter "]}',
      '{"disabledAgents": [" refuter"]}',
      // A leading byte order mark: jq skips it, JSON.parse refuses it. Both refuse.
      '﻿{"disabledAgents": ["refuter"]}',
      // Control characters inside a name, escaped as JSON allows.
      '{"disabledAgents": ["refuter\\nx"]}',
      '{"disabledAgents": ["refuter\\n"]}',
      '{"disabledAgents": ["\\trefuter"]}',
      // Literals jq accepts and JSON does not.
      '{"disabledAgents": ["refuter"], "x": NaN}',
      '{"disabledAgents": ["refuter"], "x": -Infinity}',
      // Duplicate keys: the last one wins in both.
      '{"disabledAgents": ["lead"], "disabledAgents": ["refuter"]}',
      ...STRICT_FIXTURES.map(([input]) => input),
      ...PHASE_FIXTURES.map(([input]) => input),
    ]) {
      // A Buffer fixture is the file's exact bytes; review-round gets them as
      // the text a lane would see, decoded as UTF-8.
      const text = Buffer.isBuffer(input) ? input.toString('utf8') : input
      writeFileSync(join(dir, '.claude', 'coder-fleet.json'), input)
      const [sState, sNames, sReason, sPhase, sPhaseState, sPhaseReason] = readShell(dir)
      const shell = sState + '|' + sNames
      const { result } = await runWorkflow('review-round.js', FIX, responder({ reviewer: APPROVE, 'pin refs': pinWith(text) }))
      const js = (result.fleetConfig || {}).state + '|' + (result.disabledAgents || []).join(' ')
      const jsReason = (result.fleetConfig || {}).reason
      const shown = JSON.stringify(text).slice(0, 140)
      if (shell !== js) disagreements.push({ text: shown, shell, js })
      if (sReason !== jsReason) reasonsSplit.push({ text: shown, shell: sReason, js: jsReason })
      const want = WANT.has(input) ? WANT.get(input) : PARITY_WANT[text]
      if (want !== undefined && shell !== want) wrong.push({ text: shown, want, shell, js })
      // The phase, on every fixture: both readers, the result's own phase
      // field, and the intended answer where the fixture names one.
      const shellPhase = sPhase + '|' + sPhaseState
      const jp = jsPhase(result)
      if (shellPhase !== jp.phase || jp.top !== sPhase) phaseSplit.push({ text: shown, shell: shellPhase, js: jp.phase, top: jp.top })
      if (sPhaseReason !== jp.reason) phaseReasonSplit.push({ text: shown, shell: sPhaseReason, js: jp.reason })
      const pw = PHASE_FIXTURES.find(([i]) => i === input)
      if (pw && (shell !== pw[1] || shellPhase !== pw[2])) phaseWrong.push({ text: shown, want: [pw[1], pw[2]], shell: [shell, shellPhase], js: [js, jp.phase] })
      if (pw && sPhaseState === 'invalid' && !/^phase is .*, and only "build" or "harden" is a phase$/.test(sPhaseReason)) phaseWrong.push({ text: shown, reason: sPhaseReason })
      if (pw && sPhaseState !== 'invalid' && sPhaseReason !== '') phaseWrong.push({ text: shown, reasonWhenValid: sPhaseReason })
    }
    // No file at all: both readers say build, by default, with no reason.
    rmSync(join(dir, '.claude', 'coder-fleet.json'), { force: true })
    {
      const [sState, , , sPhase, sPhaseState, sPhaseReason] = readShell(dir)
      const { result } = await runWorkflow('review-round.js', FIX, responder({ reviewer: APPROVE, 'pin refs': pinWith('', false) }))
      const jp = jsPhase(result)
      check('fleet-config-phase-absent', 'with no file, both readers give phase build by default and no reason', sState === 'absent' && sPhase + '|' + sPhaseState === 'build|default' && jp.phase === 'build|default' && jp.top === 'build' && sPhaseReason === '' && jp.reason === '', { shell: [sState, sPhase, sPhaseState, sPhaseReason], js: jp })
    }
    // No main checkout: the shell reads nothing, and the phase is the default.
    {
      const [sState, , , sPhase, sPhaseState] = execFileSync('/bin/bash', ['-c', '. "$1"; fleet_config_read ""; printf "%s\\037%s\\037%s\\037%s\\037%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED" "$FLEET_CONFIG_REASON" "${FLEET_CONFIG_PHASE-}" "${FLEET_CONFIG_PHASE_STATE-}"', '_', helper], { encoding: 'utf8' }).split('\x1f')
      check('fleet-config-phase-unresolved', 'with no main checkout the shell gives phase build by default', sState === 'unresolved' && sPhase + '|' + sPhaseState === 'build|default', [sState, sPhase, sPhaseState])
    }
    // A directory where the file should be: neither reader can read it, and
    // both say so with the same label.
    rmSync(join(dir, '.claude', 'coder-fleet.json'), { force: true })
    mkdirSync(join(dir, '.claude', 'coder-fleet.json'))
    const shellDir = execFileSync('/bin/bash', ['-c', '. "$1"; fleet_config_read "$2"; printf "%s|%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED"', '_', helper, dir], { encoding: 'utf8' })
    const dirPin = pinWith('')
    dirPin.fleetConfig = { found: true, text: '', path: MAIN_CONFIG, error: 'cat: .claude/coder-fleet.json: Is a directory' }
    const { result: dirResult, calls: dirCalls } = await runWorkflow('review-round.js', FIX, sensitiveScope(responder({ reviewer: APPROVE, 'pin refs': dirPin })))
    const jsDir = (dirResult.fleetConfig || {}).state + '|' + (dirResult.disabledAgents || []).join(' ')
    check('fleet-config-parity-directory', 'a directory at the config path is unreadable to both readers, and the refuter still runs', shellDir === 'unreadable|' && jsDir === 'unreadable|' && refuterCalls(dirCalls).length === 1, { shellDir, jsDir })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  check('fleet-config-parity', 'review-round and the hook helper read every fixture the same way', disagreements.length === 0, disagreements)
  check('fleet-config-parity-answers', 'and the shared answer is the intended one where a fixture once split them', wrong.length === 0, wrong)
  // The reason is what the hook's warning and review-round's log show, so a
  // name outside printable ASCII is quoted the same way by both.
  check('fleet-config-parity-reasons', 'and both readers give the same reason for every fixture', reasonsSplit.length === 0, reasonsSplit)
  check('fleet-config-parity-phase', 'both readers give the same phase and phase state on every fixture, and review-round reports it as result.phase', phaseSplit.length === 0, phaseSplit)
  check('fleet-config-parity-phase-answers', 'and the phase is the intended one: absent and anything but "build" or "harden" read as build, an invalid value reported with a reason', phaseWrong.length === 0, phaseWrong)
  check('fleet-config-parity-phase-reasons', 'and both readers give the same phase reason', phaseReasonSplit.length === 0, phaseReasonSplit)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log('A workflow branch approves the wrong thing, or has stopped doing its job.')
  process.exit(1)
}
console.log('The workflow branches decide on evidence, and still do the work they exist for.')

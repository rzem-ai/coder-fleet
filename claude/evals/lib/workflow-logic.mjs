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

import { readFileSync } from 'node:fs'
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
  const { result } = await runWorkflow('deep-research.js', { question: 'q', maxRounds: 1 }, (prompt, opts) => {
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
    if (label === 'criteria: EX-1')
      return { criteria: [{ number: 1, text: 'The refresh token rotates' }, { number: 2, text: "A revoked token's session ends" }], evidence: 'section Acceptance criteria' }
    if (label === 'card: EX-1') return { found: true, boardRead: true, criteria: ['The refresh token rotates'], evidence: 'acceptanceCriteriaCount: 1' }
    if (label === 'file criteria: EX-1') return { commandsRun: ['task edit EX-1'], criteriaCount: 2, boardRead: true, couldNotRun: [] }
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

console.log('\nreview-round: blocking findings come back as a handoff, not a silent re-review')

// The range is pinned to commits before any round runs, so every stub below
// answers the pin lane first. Nothing else about these cases changed: they
// still drive the default invocation, which still reviews and hands back.
const PIN = {
  resolved: [{ role: 'base', ref: 'main', sha: 'ba5e0000' }, { role: 'head', ref: 'HEAD', sha: 'facef00d' }],
  worktrees: [{ path: '/repo', head: 'facef00d', dirty: false, isMain: true }],
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

const HINTS = ['worktree: /w/fix', 'base-commit: aaa1111', 'head-commit: bbb2222']

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
    if (label === 'verify fix') {
      return {
        headCommit: 'bbb2222',
        containsReviewedHead: true,
        dirty: false,
        filesChanged: ['src/a.ts'],
        commits: ['fix the bug'],
        worktreePath: '/w/fix',
        isMain: false,
        candidates: ['bbb2222'],
        worktrees: [
          { path: '/repo', head: 'facef00d', dirty: false, isMain: true },
          { path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false },
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
  const r = responder({ 'pin refs': { resolved: [{ role: 'base', ref: 'main', sha: 'ba5e0000' }, { role: 'head', ref: 'HEAD', sha: '', error: 'unknown revision' }], worktrees: [], commandsRun: [], couldNotRun: [] } })
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
      headCommit: 'bbb2222', worktreePath: '/w/fix', isMain: false, containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'],
      worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: true }],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('worktree-list-beats-the-flat-claim', 'a flat isMain:false does not override a worktree list that says otherwise', result.stopped === 'fix not isolated', result.stopped)
}
{
  const r = responder({
    'verify fix': {
      headCommit: 'bbb2222', worktreePath: '/w/fix', isMain: 'false', containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'],
      worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: 'true' }],
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
      headCommit: 'bbb2222', worktreePath: '/w/fix', isMain: false, containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'],
      worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false }],
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
      headCommit: 'bbb2222', worktreePath: '/w/fix', isMain: false, containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'], worktrees: [],
    },
  })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('flat-flag-is-the-fallback', 'with no list entry for the path, an explicit isMain:false is accepted', result.stopped === 'clean', result.stopped)
}
{
  const r = responder({
    'verify fix': {
      headCommit: 'bbb2222', worktreePath: '/w/fix', containsReviewedHead: true,
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
      headCommit: 'bbb2222', worktreePath: '/w/fix/', containsReviewedHead: true,
      dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['bbb2222'],
      worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false }],
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
      commits: ['c'], worktreePath: '/w/fix', candidates: ['bbb2222'], worktrees: [],
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
      commits: [], isMain: false, worktreePath: '/w/fix', candidates: ['facef00'], worktrees: [],
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
  ['not-descendant-stops', { headCommit: 'bbb2222', containsReviewedHead: false, forkPoint: 'origin1', dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, worktreePath: '/w/fix', worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false }] }, /reviewed commit|forks at/i],
  ['dirty-worktree-stops', { headCommit: 'bbb2222', containsReviewedHead: true, dirty: true, filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, worktreePath: '/w/fix', worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false }] }, /uncommitted|whole fix/i],
  ['untouched-files-stop', { headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: ['docs/x.md'], commits: ['c'], isMain: false, worktreePath: '/w/fix', worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false }] }, /touches none/i],
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
      worktreePath: '/w/fix', candidates: ['bbb2222'], worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false }],
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
      worktreePath: '/w/fix', candidates: ['bbb2222'], worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false }],
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
  check('fix-recorded', 'the accepted fix records the worktree and commit git found', result.fixes && result.fixes[0] && result.fixes[0].headCommit === 'bbb2222' && result.fixes[0].worktreePath === '/w/fix', result.fixes)
  // Round two must read the fixed code, not the original range.
  const round2 = calls.filter((c) => c.opts.agentType === 'coder-fleet:reviewer')[1]
  check('range-repointed', 'round two reviews the fix commit and not the original range', round2 && /bbb2222/.test(round2.prompt) && !/feature\/refresh/.test(round2.prompt), round2 && round2.prompt.slice(0, 160))
  const round2Mech = calls.filter((c) => !c.opts.agentType && c.opts.schema && /Round 2/.test(c.prompt))
  check('mech-lanes-follow-the-fix', 'and the mechanical lanes run in the fix worktree, not the original checkout', round2Mech.length > 0 && round2Mech.every((c) => /\/w\/fix/.test(c.prompt)), round2Mech.length)
}

// --- git hints are hints -----------------------------------------------------

{
  const r = responder({ coder: handoff({ done: ['fixed it'] }) })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  check('hints-optional', 'a handoff with no hint bullets still verifies from git alone', result.stopped === 'clean', result.stopped)
}

{
  const r = responder({ coder: handoff({ done: ['worktree: /w/fix', 'head-commit: deadbee', 'fixed it'] }) })
  const { result } = await runWorkflow('review-round.js', FIX, r)
  // The claimed sha appears in coderSaid verbatim whatever happens, so assert
  // on claimMismatch itself or this passes with the disagreement discarded.
  const mismatch = (result.fixes[0] || {}).claimMismatch || []
  check('hint-mismatch-git-wins', 'when coder claims a different commit, git decides', result.fixes[0] && result.fixes[0].headCommit === 'bbb2222', result.fixes[0])
  check('hint-mismatch-recorded', 'and the disagreement is recorded rather than discarded', mismatch.some((m) => /headCommit/.test(m) && /deadbee/.test(m)), mismatch)
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

console.log('\nreview-round: the gate believes git, or it stops')

// Each of these is a well-formed verify result that the gate accepted.
const GATE_HOLES = [
  ['no-worktree-path-stops', { headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, candidates: ['bbb2222'], worktrees: [] },
    'a fix with no known location cannot be re-reviewed in the checkout that holds it'],
  ['ambiguous-with-a-sha-stops', { headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, worktreePath: '/w/fix', candidates: ['bbb2222', 'ccc3333'], worktrees: [] },
    'a lane that names three candidates and then picks one is still guessing'],
  ['string-dirty-stops', { headCommit: 'bbb2222', containsReviewedHead: true, dirty: 'true', filesChanged: ['src/a.ts'], commits: ['c'], isMain: false, worktreePath: '/w/fix', candidates: ['bbb2222'], worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false }] },
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
    'verify fix': { headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: [], commits: [], isMain: false, worktreePath: '/w/fix', candidates: ['bbb2222'], worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false }] },
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
  const r = responder({ 'verify fix': { headCommit: 'the-fix-branch', worktreePath: '/w/fix', isMain: false, containsReviewedHead: true, dirty: false, filesChanged: ['src/a.ts'], commits: ['c'], candidates: ['x'], worktrees: [] } })
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
  check('isolation-checked-before-anything-is-written', 'the fix prompt checks which checkout it is in before it writes', p.indexOf('rev-parse --git-dir') > -1 && p.indexOf('rev-parse --git-dir') < p.indexOf('git switch -c'), [p.indexOf('rev-parse --git-dir'), p.indexOf('git switch -c')])
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
    'verify fix': { headCommit: 'bbb2222', containsReviewedHead: true, dirty: false, filesChanged: ['src/b.ts'], commits: ['c'], isMain: false, worktreePath: '/w/fix', candidates: ['bbb2222'], worktrees: [{ path: '/w/fix', head: 'bbb2222', dirty: false, isMain: false }] },
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

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log('A workflow branch approves the wrong thing, or has stopped doing its job.')
  process.exit(1)
}
console.log('The workflow branches decide on evidence, and still do the work they exist for.')

export const meta = {
  name: 'spec-to-card',
  description: 'Prepare and draft a spec for the human to edit, then write the edited spec\'s acceptance criteria into the GitHub issue and stop; in a project whose AGENTS.md names a requirements source, write the requirement clauses the issue answers instead, with no spec',
  whenToUse:
    'An idea or issue too unshaped to build from. Run it once to prepare and draft the spec - on an issue, or with a title and the human\'s words to file the issue first - run the interview yourself, then run it again on the spec the human has edited and approved to put its criteria in the issue. In a project whose AGENTS.md has a `Requirements source: <path>` line, one run writes the clauses the issue answers into it, in clause order, and spec-writer never runs.',
  phases: [
    { title: 'File the issue', detail: 'with a title and no issue, file the issue with the human\'s words as its body' },
    { title: 'Gate check', detail: 'read the spec, if it exists, and report the approval state; read AGENTS.md for a requirements source' },
    { title: 'Recall and locate', detail: 'prior decisions, the code the issue touches, and prior art, in parallel' },
    { title: 'Interview brief', detail: 'the ordered questions spec-writer has to put to the human' },
    { title: 'Draft spec', detail: 'write docs/specs/<n>.md with everything unheard as an open question' },
    { title: 'Challenge gate', detail: 'run the shared challenge gate on the approved spec, which closes and commits the spec editor\'s challenges when it passes' },
    { title: 'Read the criteria', detail: 'the approved spec\'s numbered acceptance criteria, or the requirement clauses the issue answers, and the ones the issue already carries' },
    { title: 'File the criteria', detail: 'replace the issue\'s criteria with the source\'s, in order, keeping any others after them, with the Definition of Done from AGENTS.md where the issue has none, through gh, and stop' },
  ],
}

// ---------------------------------------------------------------------------
// spec-to-card
//
// A spec shapes an unshaped idea into acceptance criteria, and the criteria go
// on the card - the GitHub issue's `## Acceptance criteria` task list - because
// the card is what a coder builds from. A workflow cannot ask the human a
// question mid-run, so the script runs as two stages and stops after each.
//
//   Stage "spec": recall, locate, build the interview brief, draft the spec.
//     The human is interviewed in session, not here. They then edit the file and
//     change its status line to approved. That edit is the gate: the eval
//     cited in the fleet design put developer-written specs at +4% task success
//     and LLM-written ones at -3% for 20% more cost, so the draft exists to be
//     corrected, not to be accepted.
//
//   Stage "card": read the approved spec's numbered acceptance criteria, read
//     the issue, and replace its criteria with the spec's, in order, keeping
//     any others after them (see "replace, never append to" below). The same
//     write adds a `Spec: docs/specs/<n>.md` line where the body has no Spec
//     line, and the project's Definition of Done where the body has no such
//     section. Then stop. The workflow never writes a status label: the
//     board's columns belong to the hooks. This stage needs gh: on a machine
//     where gh is missing or signed out it stops as `could not read the board`,
//     never as a missing issue, so nobody files a second issue for one that
//     exists.
//
//   /coder-fleet:spec-to-card { "issue": "#12" }
//   /coder-fleet:spec-to-card { "issue": "#12", "stage": "card" }
//   /coder-fleet:spec-to-card { "title": "Rotate refresh tokens on reuse", "brief": "<the human's words>" }
//
// `issue` is a GitHub issue of this repository: `#12`, `12` or the issue's
// URL, and anything else is refused before anything spawns, because its number
// reaches a shell command and a path. The spec is docs/specs/<n>.md. With
// `title` and `brief` instead, the run first files the issue, its body the
// human's words and nothing else, and goes on with the number GitHub gave it;
// the spec does not exist yet, so the explicit card stage is refused there.
//
// Every write to GitHub goes through the plugin's scripts/issue-body.py, run by
// a lane as one command built here. The script reads the live body with gh,
// changes only the sections it is asked to, and writes it back with
// `gh issue edit --body-file`, so the human's words never pass through a model
// on their way back to GitHub. It refuses to write when the issue's criteria
// are no longer the ones this run read, so a body read wrong, or edited in
// between, is never written over. Reads go through a scout running
// `gh issue view`, which its scope hook allows.
//
// An approved spec is never redrafted. The spec stage refuses a spec whose
// approval reads as anything but a plain no, and there is no flag to force it:
// to redraft, the human sets the status line back to draft first. That keeps an
// approved and possibly uncommitted spec from being written over by a run that
// misread its status.
//
// A project that names a requirements source skips the spec. The rule
// is one literal line in the project's AGENTS.md, `Requirements source: <path>`,
// matched by REQUIREMENTS_LINE below and nowhere else in this script. With it
// and no approved spec, the run is stage "clauses": it reads the issue, has a
// scout list the requirement clauses the issue answers, and writes them as its
// criteria in clause order. The lane supplies each clause's file and
// position; the script sorts by file path, then position - or by position alone
// when the source is a single file - so the order never rests on the order the
// lane happened to list them in. spec-writer never runs,
// an explicit `stage: "spec"` is refused, and the open decisions the clauses
// leave go back to the lead as Actions for human questions. A line whose path
// does not exist, or names no path, is a stop: never a fallback to a spec,
// because a spec in a project with approved requirements restates them behind a
// second approval gate. An approved spec still wins over the clauses, and the
// lane is only consulted where it decides the route - `auto` with no approved
// spec, or an explicit `stage: "spec"` - where a failed answer gets one retry
// and then stops; and for an explicit `stage: "card"` with no approved spec,
// where it only decides which next step the stop gives; a failed answer there
// stops the same way, with neutral advice, never the spec interview. Without the line,
// nothing here changes.
//
// The card stage runs the spec editor's challenge gate before it reads a
// criterion. The gate is one script, the plugin's
// scripts/challenge-gate.py, run as `run <n>`, the same script and
// subcommand lead.md step 3 runs before the first build spawn; this file holds
// none of its logic and reads only the verdict lines it prints. A refusal stops
// the run, files nothing and names the blocking challenge ids. A pass on the
// editor's intact section has already been closed and committed by the script
// when the lane returns, so the criteria are read from the closed spec, and the
// result names both commits. Any other answer - no verdict, an exit code that
// disagrees with it, a close that could not be committed - stops too. Where
// the gate passes without closing anything (no editor recorded, or none
// chosen) and the spec still carries an inline [challenge Cn] marker, the run
// stops rather than file one onto a card.
//
// Either source's criteria replace, never append to, what the issue carries
// (lead step 5): the section comes out as the source's criteria in their order,
// then any criterion the issue carried beyond them, with a provisional one - a
// criterion starting "Provisional:" - removed. An issue already in that shape,
// with a Spec line and a Definition of Done, is not written. Where its
// criteria are a prefix of that list, every tick on them stays; anything else
// rewrites the list unticked, so a rewrite over a ticked criterion stops
// instead, because ticks are the lead's, given on evidence.
// ---------------------------------------------------------------------------

const SCOUT = 'coder-fleet:scout'
const RESEARCHER = 'coder-fleet:researcher'
const SPEC_WRITER = 'coder-fleet:spec-writer'

// A GitHub issue: 12, #12 or the issue's URL. Only the number goes any
// further, and it is digits alone, so it is safe in a command and a path. A
// leading zero is not a number GitHub hands out, so 012 is refused rather than
// guessed at, as hooks/lib/board.sh refuses it.
function issueNumber(ref) {
  if (typeof ref === 'number') return Number.isSafeInteger(ref) && ref > 0 ? String(ref) : null
  if (typeof ref !== 'string') return null
  const m = /^#?([1-9]\d{0,9})$/.exec(ref) || /^https?:\/\/[^\s?#]+\/issues\/([1-9]\d{0,9})(?:[/#?][^\s]*)?$/.exec(ref)
  return m ? m[1] : null
}

// The one rule for naming a requirements source is this literal text, in this
// case, at the start of a line of the project's AGENTS.md, then the path. The
// colon ends the match, so a line with nothing after it is still the line, and
// stops as naming no path rather than reading as no line at all.
const REQUIREMENTS_LINE = /^Requirements source:(.*)$/
// A criterion the lead filed ahead of its source, to be replaced at sign-off.
// Only the wording "Provisional:" marks one: a criterion that merely starts
// with the word is kept.
const PROVISIONAL_RE = /^Provisional:/

// The shared challenge gate. CLAUDE_PLUGIN_ROOT is exported to hooks but not
// to a lane's shell (it is unset in a subagent's Bash), so the command finds
// the script itself: the runtime's root when it is set, else the most recently
// installed coder-fleet in the plugin cache. With neither it exits 127 and
// says so. It runs the same under bash and zsh; the cache is searched with
// find rather than a glob because zsh aborts on a glob that matches nothing.
// lead.md names the same file through ${CLAUDE_PLUGIN_ROOT}, which Claude Code
// substitutes into an agent body when it loads it.
const pluginScript = (v, name) =>
  v + '="${CLAUDE_PLUGIN_ROOT:-}/scripts/' + name + '"; ' +
  '[ -f "$' + v + '" ] || ' + v + '="$(find "$HOME/.claude/plugins/cache" -path \'*/coder-fleet/*/scripts/' + name + '\' -type f -exec ls -1t {} + 2>/dev/null | head -n 1)"; ' +
  '[ -n "$' + v + '" ] || { echo "' + name.replace(/\.py$/, '') + ': no scripts/' + name + ' (CLAUDE_PLUGIN_ROOT is unset and the plugin cache has none)" >&2; exit 127; }; ' +
  'python3 -I "$' + v + '"'
const CHALLENGE_GATE = pluginScript('g', 'challenge-gate.py')
// The one writer of an issue body, found the same way.
const ISSUE_BODY = pluginScript('h', 'issue-body.py')
// A request to issue-body.py is one line of JSON on standard input, in a
// quoted here-document, so no criterion passes through a shell word. JSON
// never holds a raw newline, so the line can never be the delimiter.
const HEREDOC = 'CODER_FLEET_REQUEST'
const withRequest = (cmd, req) => cmd + " <<'" + HEREDOC + "'\n" + JSON.stringify(req) + '\n' + HEREDOC
// An inline marker the spec editor appends to a line it challenges. The gate's
// close strips them; this only refuses to file one that is still there.
const CHALLENGE_MARKER_RE = /\[challenge C\d+\]/

const input = typeof args === 'string' ? { issue: args } : args || {}

// Input this script does not read is refused, never dropped: a silently
// dropped key can send a run at the wrong commit. Every key
// read below is in this list, so adding a read means adding it here.
const ACCEPTED_KEYS = ['issue', 'title', 'stage', 'brief', 'context']
const unknownKeys = Object.keys(input).filter((k) => !ACCEPTED_KEYS.includes(k))
if (unknownKeys.length) {
  throw new Error(
    'spec-to-card does not accept ' +
      unknownKeys.map((k) => '"' + k + '"').join(', ') +
      '. Accepted keys: ' +
      ACCEPTED_KEYS.join(', ') +
      '. Nothing ran.',
  )
}
const requested = input.stage || 'auto'
// Reject an unknown stage before anything spawns. If only the second stage
// were checked against spec approval, a stage that is neither it nor `spec` - a
// typo - would skip the approval guard, skip the spec branch, and fall straight
// through into the second stage from an unapproved or absent spec.
if (!['auto', 'spec', 'card'].includes(requested)) {
  throw new Error(
    'stage must be auto, spec or card; got ' + JSON.stringify(requested) + '.',
  )
}
const toFile = 'title' in input
if (toFile && input.issue !== undefined) {
  throw new Error('spec-to-card got both "issue" and "title". Pass the issue to work on, or a title and the human\'s words as brief to file a new one, not both. Nothing ran.')
}
if (!toFile && (input.issue === undefined || input.issue === null || input.issue === '')) {
  throw new Error('spec-to-card needs an issue, for example { "issue": "#12" }, or a title and the human\'s words to file one, { "title": "...", "brief": "..." }')
}
if (toFile) {
  if (typeof input.title !== 'string' || !input.title.trim()) {
    throw new Error('title must be the new issue\'s title; got ' + JSON.stringify(input.title) + '. Nothing ran.')
  }
  if (typeof input.brief !== 'string' || !input.brief.trim()) {
    throw new Error('filing an issue needs the human\'s words as brief, because they are its body. Nothing ran.')
  }
  if (requested === 'card') {
    throw new Error('stage card files an approved spec\'s criteria, and an issue filed by this run has no spec yet. Run without a stage. Nothing ran.')
  }
}
let n = toFile ? null : issueNumber(input.issue)
if (!toFile && n === null) {
  throw new Error(
    'issue must be a GitHub issue of this repository: #12, 12 or the issue URL; got ' + JSON.stringify(input.issue) + '. Nothing ran.',
  )
}
const context = input.brief || input.context || '(none supplied - the issue is the brief)'

// Nothing a lane reports is trusted to be the type it was asked for: the eval
// harness has never applied a schema. A count is a count only when it is a
// whole number, and a yes is a yes only when it says so.
function wholeNumber(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : null
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v)
  return null
}
// The `<key>\t<value>` lines the plugin's scripts print, first of each key.
function factsOf(output) {
  const facts = {}
  for (const line of String(output || '').split(/\r?\n/)) {
    const tab = line.indexOf('\t')
    if (tab > 0 && !(line.slice(0, tab) in facts)) facts[line.slice(0, tab)] = line.slice(tab + 1)
  }
  return facts
}
// A lane that runs one script and reports its exit code and output.
const SCRIPT_SCHEMA = {
  type: 'object',
  required: ['exitCode', 'output'],
  properties: { exitCode: { type: 'number' }, output: { type: 'string' } },
}
const scriptRun = (what) => [
  'exitCode is the exit code the command returned, as a number.',
  'output is everything the command printed, standard output and standard error, word for word and line for line, with its tab characters kept. Do not summarise or reformat it.',
  'Do not run the command a second time, and do not ' + what + ' yourself, whatever it printed.',
]

// --- File the issue --------------------------------------------------------
//
// With a title, the issue does not exist yet and the spec's path needs its
// number, so it is filed before anything else. The body is the human's words
// and nothing more: the criteria, the Spec line and the Definition of Done
// come with the card stage, once there is something approved to write.

if (toFile) {
  phase('File the issue')
  const filedIssue = await agent(
    [
      'Run exactly this one command, from the checkout this workflow was started in, and nothing else. It files a GitHub issue with gh through the fleet\'s issue-body script:',
      withRequest(ISSUE_BODY + ' create', { title: input.title.trim(), words: input.brief }),
      ...scriptRun('file, edit or close any issue'),
    ].join('\n'),
    { model: 'sonnet', effort: 'low', phase: 'File the issue', label: 'file issue', schema: SCRIPT_SCHEMA },
  )
  const f = factsOf(filedIssue && filedIssue.output)
  const created = filedIssue && wholeNumber(filedIssue.exitCode) === 0 && f.result === 'created' ? issueNumber(f.number) : null
  if (!created) {
    log('Stopping: the issue was not filed.')
    return {
      issue: null,
      stage: 'blocked',
      reason:
        'could not file the issue "' + input.title.trim() + '" (exit ' + String(filedIssue ? filedIssue.exitCode : 'none') + ', ' + (f.result || 'no result') + '). ' + (f.message || String((filedIssue && filedIssue.output) || 'the lane returned nothing').slice(0, 300)),
      nextStep:
        'Check gh is installed and signed in (gh auth status) - /coder-fleet:kickoff checks it - then search the issues for "' + input.title.trim() + '" before running this again: the issue may have been filed even though this run could not say so.',
    }
  }
  n = created
  log('Filed #' + n + ': ' + input.title.trim() + '.')
}

const issue = '#' + n
const specPath = 'docs/specs/' + n + '.md'

// --- Gate check ------------------------------------------------------------

// The requirements-source lane: which line, if any, AGENTS.md carries. It is a
// function because a failed answer is asked once more where it decides the route.
const requirementsLane = () =>
  agent(
    [
      'Report on one file and change nothing.',
      'Read AGENTS.md at the root of the checkout this workflow was started in.',
      'Find the first line that begins with exactly this text, in this case, at the very start of the line: Requirements source:',
      'Return that whole line, word for word, as line - even when nothing follows the colon - or an empty string when AGENTS.md has no such line. A line that says something similar in other words, or has anything before that text, is not it.',
      'When there is such a line, pathExists is true only when the path after the colon, read relative to the checkout root, is a file or directory that exists; otherwise false.',
      'isDirectory is true when that path is a directory, false when it is a file, and left out when you cannot tell.',
      'Quote the line and its line number, or say there is none, as evidence.',
    ].join(' '),
    {
      agentType: SCOUT,
      phase: 'Gate check',
      label: 'requirements source',
      schema: {
        type: 'object',
        required: ['line', 'pathExists', 'evidence'],
        properties: {
          line: { type: 'string' },
          pathExists: { type: 'boolean' },
          isDirectory: { type: 'boolean' },
          evidence: { type: 'string' },
        },
      },
    },
  )

phase('Gate check')
const [gateResult, reqResult] = await parallel([
  () =>
    agent(
      [
        'Report on one file and change nothing.',
        'Read ' + specPath + ' if it exists.',
        'A spec counts as approved only when a status line in its first fifteen lines reads approved.',
        'A spec that is missing, or whose status still reads draft, is not approved.',
        'Also list any other spec under docs/specs/ covering the same subject.',
        'Quote the status line you read. Do not judge the content of the file.',
      ].join(' '),
      {
        agentType: SCOUT,
        phase: 'Gate check',
        label: 'gate: ' + issue,
        schema: {
          type: 'object',
          required: ['specExists', 'specApproved', 'evidence'],
          properties: {
            specExists: { type: 'boolean' },
            specApproved: { type: 'boolean' },
            evidence: { type: 'string' },
            related: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    ),
  requirementsLane,
])

const gate = gateResult || {
  specExists: false,
  specApproved: false,
  evidence: 'the gate check returned nothing, so this run assumes no spec exists',
  related: [],
}

// Nothing a lane reports is trusted to be the type it was asked for: the eval
// harness has never applied a schema. A yes the workflow acts on is a real true
// or the string "true"; the string "true" read as a no redrafted an approved
// spec. A plain no is false, or the words false, no or 0.
const isTrue = (v) => v === true || v === 'true'
const isPlainNo = (v) => v === false || (typeof v === 'string' && ['false', 'no', '0'].includes(v.trim().toLowerCase()))

const approved = isTrue(gate.specApproved)
// Every result names the issue, and the one this run filed says so.
const filedKeys = toFile ? { filedIssue: issue } : {}

// --- The requirements source -----------------------------------------------
//
// The lane is read where the route is open - `auto` with no approved spec, or an
// explicit spec stage - and on an explicit card stage with no approved spec,
// which stops either way but takes its advice from the line. Where an approved
// spec decides the route, a failed lane stops nothing. Where the lane is read, a
// failed answer is asked once more and then stops, never read as "no line": read
// as a no, it would send a project with approved requirements into a spec
// interview.
function sourceStop(reason, nextStep) {
  log('Stopping: ' + reason)
  return { issue, ...filedKeys, stage: 'blocked', spec: specPath, reason, nextStep }
}
const laneAnswered = (r) => Boolean(r) && typeof r === 'object' && typeof r.line === 'string'
// An explicit card stage with no approved spec stops either way, but the line
// decides what it tells the lead to do next, so the lane is read there too.
const cardUnapproved = requested === 'card' && !approved
const laneDecides = (requested === 'auto' && !approved) || requested === 'spec' || cardUnapproved
let req = reqResult
if (laneDecides && !laneAnswered(req)) {
  log('The requirements-source lane returned no line to read. Asking it once more.')
  req = await requirementsLane()
}
// A failed lane stops everywhere it decides, the unapproved card stage
// included: that stop's advice is neutral, never the spec interview.
const laneFailed = laneDecides && !laneAnswered(req)
if (laneFailed) {
  return sourceStop(
    'could not read AGENTS.md for a requirements source, twice, so whether this project skips the spec is unknown. ' + String((req && req.evidence) || ''),
    'Run this workflow again' + (toFile ? ' with { "issue": "' + issue + '" }' : '') + '. Nothing was drafted and nothing was written to the issue.',
  )
}
// A CRLF file leaves a carriage return the pattern's `.` will not match.
const reqMatch = laneDecides && !laneFailed ? REQUIREMENTS_LINE.exec(req.line.trimEnd()) : null
// A path may be written in backticks, as a path in markdown usually is.
const requirementsSource = reqMatch ? reqMatch[1].trim().replace(/^`(.*)`$/, '$1').trim() : ''
if (reqMatch && (!requirementsSource || requirementsSource.startsWith('<'))) {
  return sourceStop(
    'AGENTS.md has a requirements source line that names no path: "' + req.line.trim() + '".',
    'Put the path to the approved requirements on that line, or delete the line if the project has none, then run this workflow again. Nothing falls back to a spec while the line is there.',
  )
}
if (reqMatch && !isTrue(req.pathExists)) {
  return sourceStop(
    'AGENTS.md names ' + requirementsSource + ' as the requirements source, and it does not exist. ' + String(req.evidence || ''),
    'Fix the path on the `Requirements source:` line in AGENTS.md, or delete the line if the project has no requirements, then run this workflow again. Nothing falls back to a spec while the line is there.',
  )
}
const hasSource = Boolean(reqMatch)
// Whether the source is a directory decides how its clauses are ordered: true,
// false, or null when the lane could not say.
const sourceIsDirectory = !hasSource ? null : isTrue(req.isDirectory) ? true : isPlainNo(req.isDirectory) ? false : null

if (hasSource && requested === 'spec') {
  return sourceStop(
    'this project names ' + requirementsSource + ' as its requirements source, so spec-writer does not run and no spec is drafted.',
    'Run this workflow on ' + issue + ' without a stage to write the requirement clauses it answers into the issue.',
  )
}

const stage = requested === 'auto' ? (approved ? 'card' : hasSource ? 'clauses' : 'spec') : requested

if (stage === 'spec' && !isPlainNo(gate.specApproved)) {
  log('Stopping: ' + specPath + ' reads approved, or its approval could not be read as a no, so it is not redrafted.')
  return {
    issue,
    ...filedKeys,
    stage: 'blocked',
    spec: specPath,
    reason: specPath + ' reads approved, or its approval could not be read as a no, so the spec stage will not redraft it. ' + gate.evidence,
    nextStep: approved
      ? 'Run this workflow without a stage to write the approved spec\'s criteria into ' + issue + '. To redraft it instead, the human sets its status line back to draft first.'
      : 'Read the status line of ' + specPath + ' yourself. If it reads approved, run this workflow again; if it should be redrafted, the human sets it to draft first.',
  }
}

if (stage === 'card' && !approved) {
  log('Stopping: ' + specPath + ' is not approved. ' + gate.evidence)
  return {
    issue,
    ...filedKeys,
    stage: 'blocked',
    spec: specPath,
    reason: 'The card stage needs an approved spec. ' + gate.evidence,
    nextStep: hasSource
      ? 'This project names ' + requirementsSource + ' as its requirements source, so run this workflow without a stage to write the requirement clauses ' + issue + ' answers.'
      : 'Interview the human, edit ' + specPath + ' with them, set its status line to approved, then run this workflow again.',
  }
}

// Which source the criteria come from, for every message below.
const fromClauses = stage === 'clauses'
const from = fromClauses ? requirementsSource : specPath
// What every result of stage two says it filed from.
const sourceKeys = fromClauses ? { requirementsSource } : { spec: specPath }

// Whitespace is not content, so a criterion wrapped differently in the issue is
// still the same criterion and is not filed twice.
const sameText = (t) => String(t || '').replace(/\s+/g, ' ').trim()
const UNREADABLE_NEXT =
  'Check gh is installed and signed in on this machine (gh auth status) - /coder-fleet:kickoff checks it - then run this workflow again. Never file a new issue for ' +
  issue +
  ' on the strength of this run: it may well exist.'

function blocked(reason, nextStep, extra = {}) {
  log('Stopping: ' + reason)
  return { issue, ...filedKeys, stage: 'blocked', ...sourceKeys, card: issue, reason, nextStep, ...extra }
}

// --- reading the issue -----------------------------------------------------
//
// A level-2 heading, matched ignoring case and trailing space, to the next
// level-2 heading; an item is `- [ ] text` or `- [x] text`. The rules
// hooks/lib/board.sh and scripts/issue-body.py read the body by.
function bodyLines(body) {
  return String(body || '').split('\n').map((l) => l.replace(/\r$/, ''))
}
function sectionAt(lines, name) {
  const head = new RegExp('^##[ \\t]+' + name + '[ \\t]*$', 'i')
  const start = lines.findIndex((l) => head.test(l))
  if (start < 0) return null
  let end = lines.findIndex((l, i) => i > start && /^##[ \t]/.test(l))
  if (end < 0) end = lines.length
  return { start, end }
}
function sectionItems(body, name) {
  const lines = bodyLines(body)
  const at = sectionAt(lines, name)
  if (!at) return null
  const out = []
  for (const l of lines.slice(at.start + 1, at.end)) {
    const m = /^[-*][ \t]+\[([ xX])\][ \t]/.exec(l)
    if (m) out.push({ text: l.replace(/^[-*][ \t]+\[[ xX]\][ \t]+/, ''), checked: m[1] !== ' ' })
  }
  return out
}
// The human's words: the body without the three checklists and the Spec line.
function wordsOf(body) {
  let lines = bodyLines(body)
  for (const name of ['actions for human', 'acceptance criteria', 'definition of done']) {
    const at = sectionAt(lines, name)
    if (at) lines = lines.slice(0, at.start).concat(lines.slice(at.end))
  }
  return lines.filter((l) => !/^Spec:[ \t]*\S/.test(l)).join('\n').trim()
}
// gh's own error for a number the repository has no issue under. Only that,
// from a command that failed, is a missing issue; gh missing, signed out or
// anything else is a board this run could not read.
function ghSaidNoIssue(text) {
  if (!/Could not resolve to an issue/i.test(text)) return false
  const m = /with the number of (\d+)/i.exec(text)
  return !m || m[1] === n
}
const firstLine = (t) => String(t || '').trim().split('\n')[0].slice(0, 300)

// The card lane is a scout running read-only gh, which its scope hook allows.
// It is the same for both sources, and runs first, alone, for the clauses,
// because which clauses an issue answers is read from its words. The spec
// stage reads the comments too, because spec-writer runs no gh and the
// decisions recorded on the issue are part of what it is told.
const cardLane = (withComments = false) =>
  agent(
    [
      'Report on a GitHub issue and change nothing. Run this one command exactly as written, from the checkout this workflow was started in, and nothing else:',
      'gh issue view ' + n + ' --json number,title,state,body' + (withComments ? ',comments' : ''),
      'exitCode is the exit code it returned, as a number. If gh is not installed, report exitCode 127 and say so in stderr.',
      'stdout is everything it printed to standard output, character for character - do not reformat, fix, shorten or summarise it, even if it is long - or an empty string.',
      'stderr is everything it printed to standard error, word for word, or an empty string.',
    ].join('\n'),
    {
      agentType: SCOUT,
      phase: 'Read the criteria',
      label: 'card: ' + issue,
      schema: {
        type: 'object',
        required: ['exitCode', 'stdout', 'stderr'],
        properties: { exitCode: { type: 'number' }, stdout: { type: 'string' }, stderr: { type: 'string' } },
      },
    },
  )

// The issue as the card lane read it, or a stop before anything is filed.
// Returns { stop } or { card: { title, body, comments, criteria, hasDod,
// hasSpecLine, words } }.
function readCard(r) {
  if (!r || typeof r !== 'object') {
    return {
      stop: blocked(
        'the card lane returned nothing, so whether issue ' + issue + ' exists, and what it already carries, is unknown.',
        'Run this workflow again. Nothing was written to the issue, because filing blind would duplicate what is already there.',
      ),
    }
  }
  const exit = wholeNumber(r.exitCode)
  const said = String(r.stderr || '') + '\n' + String(r.stdout || '')
  if (exit === 0) {
    let data = null
    try {
      data = JSON.parse(String(r.stdout || ''))
    } catch (e) {
      data = null
    }
    if (data && typeof data === 'object' && !Array.isArray(data) && String(data.number) === n && (data.body == null || typeof data.body === 'string')) {
      const body = data.body || ''
      const criteria = sectionItems(body, 'acceptance criteria') || []
      return {
        card: {
          title: typeof data.title === 'string' ? data.title : '',
          comments: (Array.isArray(data.comments) ? data.comments : [])
            .filter((c) => c && typeof c === 'object' && typeof c.body === 'string')
            .map((c) => ({ author: String((c.author && c.author.login) || ''), at: String(c.createdAt || ''), body: c.body })),
          body,
          criteria,
          hasDod: sectionItems(body, 'definition of done') !== null,
          hasSpecLine: bodyLines(body).some((l) => /^Spec:[ \t]*\S/.test(l)),
          words: wordsOf(body),
        },
      }
    }
    return { stop: blocked('could not read the board: gh exited 0 but what the card lane reported is not issue ' + issue + ' as JSON.', UNREADABLE_NEXT) }
  }
  if (exit !== null && exit !== 0 && ghSaidNoIssue(said)) {
    return {
      stop: blocked(
        'there is no issue ' + issue + ' in this repository. ' + firstLine(r.stderr || r.stdout),
        fromClauses
          ? 'File the issue first, with the human\'s words as its body, or run this workflow with the issue the work has.'
          : 'File the issue first, or run this workflow with the issue the spec belongs to.',
      ),
    }
  }
  return {
    stop: blocked(
      'could not read the board, so whether issue ' + issue + ' exists is unknown (gh exited ' + String(r.exitCode) + '). ' + firstLine(r.stderr || r.stdout),
      UNREADABLE_NEXT,
    ),
  }
}

// --- Stage one: prepare and draft the spec ---------------------------------

if (stage === 'spec') {
  log('Stage one for ' + issue + '. Preparing the interview and drafting ' + specPath + '.')

  // spec-writer runs no gh, so the issue it drafts for - its title, the
  // human's words and the comments recorded on it - is read here and handed
  // to every lane below in its prompt.
  phase('Recall and locate')
  const readIssue = readCard(await cardLane(true))
  if (readIssue.stop) return readIssue.stop
  const theIssue = readIssue.card
  const issueText =
    'Issue ' + issue + ': ' + (sameText(theIssue.title) || '(no title)') + '\n\n' +
    'The issue body:\n' + (theIssue.body.trim() || '(empty)') +
    (theIssue.comments.length
      ? '\n\nIts comments, oldest first:\n' + theIssue.comments.map((c) => '- ' + (c.author || 'someone') + (c.at ? ' on ' + c.at : '') + ': ' + c.body.trim()).join('\n')
      : '\n\nIt has no comments.')

  // A barrier is right here: the interview brief has to weigh all three
  // readings against each other before it can decide what is worth asking.
  const groundwork = await parallel([
    () =>
      agent(
        'Read your memory for anything already decided about issue ' +
          issue +
          '.\n\n' +
          issueText +
          '\n\nContext: ' +
          context +
          ' Report decisions and their dates. Record nothing in your memory on this run.',
        { agentType: RESEARCHER, phase: 'Recall and locate', label: 'prior decisions' },
      ),
    () =>
      agent(
        'Locate the code this issue touches.\n\n' +
          issueText +
          '\n\nContext: ' +
          context +
          ' Return paths, line numbers and quoted excerpts for the entry points, the data model, the tests and the config involved. No opinions.',
        { agentType: SCOUT, phase: 'Recall and locate', label: 'in codebase' },
      ),
    () =>
      agent(
        'Find prior art and hard constraints for issue ' +
          issue +
          '.\n\n' +
          issueText +
          '\n\nContext: ' +
          context +
          ' Read primary sources - a standard, a vendor document, an RFC - rather than summaries of them, and cite every claim with title, publisher, URL and the date you read it. Do not propose a design.',
        { agentType: RESEARCHER, phase: 'Recall and locate', label: 'prior art' },
      ),
  ])
  const [decided, located, priorArt] = groundwork.map((r) => r || '(this reading returned nothing)')

  phase('Interview brief')
  const brief = await agent(
    [
      'Build the interview brief for the spec on issue ' + issue + '. You are not writing the spec yet.',
      'The issue, as gh reads it now:\n' + issueText,
      'The human is the only source for the problem, the non-goals and the acceptance criteria, so your job is the questions that get what is already in their head onto the page.',
      'What has already been decided:\n' + decided,
      'Where the code is:\n' + located,
      'Prior art and constraints:\n' + priorArt,
      'Return the questions in the order you would ask them, one at a time, never as a questionnaire.',
      'Mark a question blocking when nothing can be specified until it is answered.',
      'Do not ask anything the recall above has already settled.',
    ].join('\n\n'),
    {
      agentType: SPEC_WRITER,
      label: 'interview brief',
      schema: {
        type: 'object',
        required: ['questions'],
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['question', 'why', 'blocking'],
              properties: {
                question: { type: 'string' },
                why: { type: 'string' },
                blocking: { type: 'boolean' },
              },
            },
          },
          settled: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  )

  const questions = (brief && brief.questions) || []
  log('Interview brief: ' + questions.length + ' questions, ' + questions.filter((q) => q.blocking).length + ' blocking.')

  phase('Draft spec')
  const draft = await agent(
    [
      'Write ' + specPath + ' as a draft for the human to edit. Write nowhere else.',
      'This is a strawman written before the interview, not after one. That is deliberate: the human reacts to a wrong draft faster than they fill a blank page. It means the draft must read as a strawman - status draft, every supplied line marked, every question you would have asked left standing in the file. Do not write a handoff that implies the interview happened.',
      'Sections: problem, non-goals, acceptance criteria, open questions.',
      'Number the acceptance criteria, one criterion per number: once the human approves the spec, each one goes into issue ' + issue + ' as written.',
      'The issue, as gh reads it now:\n' + issueText,
      'Put a status line reading draft in the first fifteen lines. The human changes it to approved once they have edited the file, and nothing downstream runs until they do.',
      'Every question below that the human has not answered is an open question in the file, not a decision you made for them.',
      'Mark every line you supplied rather than heard, so the first thing they edit is the part you guessed at.',
      'An acceptance criterion that cannot be tested is not a criterion.',
      'Questions still open:\n' + JSON.stringify(questions, null, 2),
      'Already decided:\n' + decided,
      'Where the code is:\n' + located,
      'Prior art:\n' + priorArt,
    ].join('\n\n'),
    { agentType: SPEC_WRITER, label: 'draft ' + specPath },
  )

  return {
    issue,
    ...filedKeys,
    stage: 'spec',
    spec: specPath,
    questions,
    draft,
    nextStep:
      'Put the questions to the human one at a time in session, edit ' +
      specPath +
      ' with them, and have them set its status line to approved. Then run this workflow again on ' +
      issue +
      ' to write its acceptance criteria into the issue. The human edit is the gate, not a formality.',
  }
}

// --- Stage two: the approved spec's criteria, or the clauses, go on the card

log(
  fromClauses
    ? 'Clauses stage for ' + issue + '. This project names ' + requirementsSource + ' as its requirements source, so writing the clauses the issue answers into it, with no spec.'
    : 'Stage two for ' + issue + '. ' + specPath + ' is approved, so writing its acceptance criteria into the issue.',
)

// The challenge gate lane runs one command it is handed, with no agentType,
// because no fleet agent's scope runs python, and reports what the script
// printed. The SubagentStop matcher skips an agentType-less lane, so its schema
// costs no handoff.
const challengeGateLane = () =>
  agent(
    [
      'Run exactly this one command, from the checkout this workflow was started in, and nothing else. It runs the fleet\'s shared challenge gate on the spec for ' + issue + ', and when the gate passes on the spec editor\'s section the script itself commits the close:',
      CHALLENGE_GATE + ' run ' + n,
      ...scriptRun('edit, commit or revert anything'),
    ].join('\n'),
    { model: 'sonnet', effort: 'low', phase: 'Challenge gate', label: 'challenge gate: ' + issue, schema: SCRIPT_SCHEMA },
  )

// The gate's verdict, read from the `<key>\t<value>` lines the script prints.
// Returns { stop } to end the run, or { facts } to go on. Nothing here decides
// whether a challenge blocks; the script did that, and this reads its answer.
function readChallengeGate(r) {
  const NEXT = 'Run this workflow again once the gate can run. Nothing was written to the issue.'
  if (!r || typeof r !== 'object') {
    return { stop: blocked('the challenge gate lane returned nothing, so whether the spec may be filed is unknown.', NEXT) }
  }
  const facts = factsOf(r.output)
  const exit = wholeNumber(r.exitCode)
  if (exit === 1 && facts.verdict === 'refuse') {
    const ids = String(facts.blocking || '').split(/\s+/).filter(Boolean)
    return {
      stop: blocked(
        'the challenge gate refused ' + specPath + (ids.length ? ', naming the blocking challenges ' + ids.join(', ') + '. ' : '. ') + (facts.message || ''),
        ids.length
          ? 'Have the human close each of ' + ids.join(', ') + ' in ' + specPath + ', by an edit that fixes it or by striking it with a reason, then run this workflow again. Nothing was written to the issue.'
          : 'Fix what the gate names in ' + specPath + ' with the human, then run this workflow again. Nothing was written to the issue.',
        { blocking: ids, challengeGate: facts.reason || '' },
      ),
    }
  }
  if (exit !== 0 || facts.verdict !== 'pass') {
    return {
      stop: blocked(
        'the challenge gate gave no clean verdict (exit ' + String(r.exitCode) + ', verdict ' + (facts.verdict || 'none') + '), so whether the spec may be filed is unknown. ' + (facts.message || String(r.output || '').slice(0, 300)),
        NEXT,
      ),
    }
  }
  // A pass on the editor's intact section is closed and committed by `run`.
  // Without both commits named, the close did not happen where this run can
  // see it, and the criteria would be read with their markers still on.
  if (facts.reason === 'resolved' && !/^[0-9a-f]{7,64} [0-9a-f]{7,64}$/.test(facts.closed || '')) {
    return {
      stop: blocked(
        'the challenge gate passed ' + specPath + ' but reported no close commit, so its challenges were not closed before filing. ' + (facts.message || ''),
        NEXT,
      ),
    }
  }
  return { facts }
}

phase('Read the criteria')

let criteria
let card
let questions = []
// What the challenge gate said, for a spec; null for the clauses.
let challenges = null
if (fromClauses) {
  const read = readCard(await cardLane())
  if (read.stop) return read.stop
  card = read.card
  const fromSource = await agent(
    [
      'Report on files and change nothing.',
      'Read ' + requirementsSource + ', the approved requirements this project names in AGENTS.md. It may be one file or a directory of them.',
      'Issue ' + issue + ' says, in the human\'s words:\n' + (card.words || '(the issue has no words of its own)'),
      'Brief:\n' + context,
      'Return every requirement clause this issue answers - the clauses its work would satisfy, and no others. For each, give its identifier as the source writes it, or an empty string when it has none; its file, the path of the file it is in relative to the checkout root; its position, a whole number counting the clauses in that file from 1 in document order; and its text exactly as written, including its identifier, joined onto one line.',
      'When the source is a directory, clause order is the files sorted by path, then position within each file. Report file and position faithfully; the ordering is done from them, not from the order you list the clauses in.',
      'Do not reword, merge, split or judge a clause, and do not add one the source does not have.',
      'openDecisions is every decision the issue needs that those clauses leave open, each phrased as a question for the human ending in a question mark. Do not answer them.',
      'Quote the headings or identifiers you read the clauses under as evidence.',
    ].join('\n\n'),
    {
      agentType: SCOUT,
      phase: 'Read the criteria',
      label: 'clauses: ' + issue,
      schema: {
        type: 'object',
        required: ['clauses', 'openDecisions', 'evidence'],
        properties: {
          clauses: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'file', 'position', 'text'],
              properties: { id: { type: 'string' }, file: { type: 'string' }, position: { type: 'number' }, text: { type: 'string' } },
            },
          },
          openDecisions: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'string' },
        },
      },
    },
  )
  if (!fromSource) {
    return blocked(
      'the clauses lane returned nothing, so which requirement clauses ' + issue + ' answers is unknown.',
      'Run this workflow again. Nothing was written to the issue.',
    )
  }
  // One file can come back spelt several ways - ./reqs/a.rq, reqs//a.rq and
  // reqs/a.rq - and each spelling would sort as its own file, interleaving
  // the clauses. Repeated slashes collapse and a leading ./ goes first.
  const samePath = (f) => f.trim().replace(/\/{2,}/g, '/').replace(/^(\.\/)+/, '')
  const clauses = (Array.isArray(fromSource.clauses) ? fromSource.clauses : [])
    .filter((c) => c && typeof c === 'object' && sameText(c.text))
    .map((c) => ({ file: typeof c.file === 'string' ? samePath(c.file) : '', position: wholeNumber(c.position), text: sameText(c.text) }))
  if (!clauses.length) {
    return blocked(
      'the lane found no requirement clause in ' + requirementsSource + ' that ' + issue + ' answers. ' + (fromSource.evidence || ''),
      'Read ' + requirementsSource + ' with the human: either the issue answers a clause the lane missed, or the requirements do not cover it yet, which is the human\'s to settle. Nothing was written to the issue, and no spec is drafted in its place.',
    )
  }
  // Clause order is the order criteria are filed in, so a clause whose place in
  // the source is unknown stops the run rather than landing in a guessed slot.
  // A directory source orders by file first, and its positions restart at 1 in
  // every file, so there a clause that names no file has no place - even when
  // none of them names one, which sorted by position alone would interleave the
  // files. Where the lane could not say whether the source is a directory, only
  // a clause with no file among clauses that name one is known to be misplaced.
  // A single file has one set of positions, so there the file names carry no
  // order: two spellings of it, or a mix of named and unnamed, sort by position.
  const singleFile = sourceIsDirectory === false
  if (sourceIsDirectory && clauses.some((c) => !c.file)) {
    const unnamed = clauses.filter((c) => !c.file).length
    return blocked(
      requirementsSource + ' is a directory, so clause order is file path then position, and ' + unnamed + ' of the ' + clauses.length + ' clauses the lane returned did not name its file. ' + (fromSource.evidence || ''),
      'Run this workflow again. Nothing was written to the issue.',
    )
  }
  const namesFile = !singleFile && clauses.some((c) => c.file)
  if (clauses.some((c) => c.position === null || (namesFile && !c.file))) {
    return blocked(
      'a clause came back with no whole-number position, or with no file where the others name one, so the clause order cannot be known. ' + (fromSource.evidence || ''),
      'Run this workflow again. Nothing was written to the issue.',
    )
  }
  // File path first (a directory source), then position within the file; a
  // single file by position alone. A plain comparison rather than
  // localeCompare, so the order is the same on every machine.
  const byClauseOrder = singleFile
    ? (a, b) => a.position - b.position
    : (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.position - b.position)
  criteria = clauses
    .slice()
    .sort(byClauseOrder)
    .map((c) => c.text)
  questions = (Array.isArray(fromSource.openDecisions) ? fromSource.openDecisions : []).map(sameText).filter(Boolean)
} else {
  phase('Challenge gate')
  const gated = readChallengeGate(await challengeGateLane())
  if (gated.stop) return gated.stop
  challenges = {
    gate: gated.facts.reason || '',
    ...(gated.facts.closed ? { closed: gated.facts.closed } : {}),
    ...(gated.facts.suggest ? { suggest: gated.facts.suggest } : {}),
  }
  phase('Read the criteria')
  const read = await parallel([
    () =>
      agent(
        [
          'Report on one file and change nothing.',
          'Read ' + specPath + ' and find its acceptance criteria section.',
          'Return every numbered acceptance criterion in order, each as its number and its text exactly as written, without the number or the list marker. Join a criterion that wraps onto several lines into one line.',
          'Return nothing from any other section, and do not reword, merge, split or judge a criterion.',
          'Quote the heading you read them under as evidence.',
        ].join(' '),
        {
          agentType: SCOUT,
          phase: 'Read the criteria',
          label: 'criteria: ' + issue,
          schema: {
            type: 'object',
            required: ['criteria', 'evidence'],
            properties: {
              criteria: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['number', 'text'],
                  properties: { number: { type: 'number' }, text: { type: 'string' } },
                },
              },
              evidence: { type: 'string' },
            },
          },
        },
      ),
    cardLane,
  ])
  const [fromSpec, cardRead] = read

  if (!fromSpec) {
    return blocked(
      'the criteria lane returned nothing, so what the spec asks for is unknown.',
      'Run this workflow again. Nothing was written to the issue.',
    )
  }
  criteria = (Array.isArray(fromSpec.criteria) ? fromSpec.criteria : [])
    .map((c) => sameText(c && typeof c === 'object' ? c.text : c))
    .filter(Boolean)
  if (!criteria.length) {
    return blocked(
      specPath + ' has no numbered acceptance criteria. ' + (fromSpec.evidence || ''),
      'Add numbered acceptance criteria to ' + specPath + ' with the human, then run this workflow again. A spec with nothing testable in it has nothing to put in the issue.',
    )
  }
  const marked = criteria.filter((c) => CHALLENGE_MARKER_RE.test(c))
  if (marked.length) {
    return blocked(
      specPath + ' has ' + marked.length + ' acceptance criteria still carrying an inline challenge marker, such as [challenge C1], and the challenge gate passed as ' + (challenges.gate || 'unknown') + ', which closes nothing. A marker is never filed onto a card.',
      'Remove the markers from ' + specPath + ' with the human, or record the project\'s spec editor in AGENTS.md and close its challenges through the gate, then run this workflow again. Nothing was written to the issue.',
    )
  }
  const cardOf = readCard(cardRead)
  if (cardOf.stop) return cardOf.stop
  card = cardOf.card
}

// --- What the card should read as -------------------------------------------
//
// The source's criteria in order, each once, then whatever the issue carried
// beyond them in its own order, with a provisional criterion dropped (lead step
// 5: "any criterion you add beyond the spec's or the clauses follows after
// them"). Compared by sameText, so whitespace is not a difference.
const seen = new Set()
const fromSourceList = []
for (const c of criteria) {
  const k = sameText(c)
  if (seen.has(k)) continue
  seen.add(k)
  fromSourceList.push(c)
}
const onCard = card.criteria.map((c) => ({ text: sameText(c.text), checked: c.checked }))
const onCardKeys = onCard.map((c) => c.text)
const extras = []
for (const c of onCardKeys) {
  if (!c || seen.has(c) || PROVISIONAL_RE.test(c)) continue
  seen.add(c)
  extras.push(c)
}
const target = fromSourceList.concat(extras)
const targetKeys = target.map(sameText)
const alreadyOnCard = fromSourceList.filter((c) => onCardKeys.includes(sameText(c))).length

// The clauses leave decisions a spec interview would have closed. They go to
// the human as questions on the issue, and building waits for the answers.
function readyStep(carries) {
  if (!fromClauses) return carries + ' It is ready to build from.' + (challenges && challenges.suggest ? ' The challenge gate says: ' + challenges.suggest + '.' : '')
  if (!questions.length) return carries + ' The clauses leave no open decision, so it is ready to build from.'
  return (
    carries +
    ' Add each of the ' +
    questions.length +
    ' open decisions in questions to the issue\'s Actions for human section as a numbered question, ask them in the session, and have the human answer every one before the first build spawn.'
  )
}
const resultStage = fromClauses ? 'clauses' : 'card'
const carriesWhat =
  (fromClauses
    ? 'the ' + fromSourceList.length + ' requirement clauses in ' + requirementsSource + ' that ' + issue + ' answers, in clause order'
    : 'the ' + fromSourceList.length + ' acceptance criteria in ' + specPath + ', in order') +
  (extras.length ? ', then the ' + extras.length + ' criteria it carried beyond them.' : ', and nothing else.')
const clauseKeys = fromClauses ? { questions } : {}
const challengeKeys = challenges ? { challenges } : {}

// The issue is written when its criteria differ from the target, when the
// spec route finds no Spec line, or when it has no Definition of Done, which
// the script copies from AGENTS.md where the project keeps one.
const sameList = onCardKeys.length === targetKeys.length && onCardKeys.every((k, i) => k === targetKeys[i])
const needsSpecLine = !fromClauses && !card.hasSpecLine
if (sameList && !needsSpecLine && card.hasDod) {
  log('Issue ' + issue + ' already reads as ' + target.length + ' criteria in order. Nothing to file.')
  return {
    issue,
    ...filedKeys,
    stage: resultStage,
    ...sourceKeys,
    card: issue,
    criteria: target,
    filed: 0,
    alreadyOnCard,
    ...clauseKeys,
    ...challengeKeys,
    nextStep: readyStep('The issue already carries ' + carriesWhat),
  }
}

// A list whose criteria are a prefix of the target keeps every tick and gains
// the tail unticked. Anything else - a provisional criterion, a clause out of
// order, an extra ahead of the source - is rewritten unticked, so a ticked one
// would lose the tick the lead gave it on evidence; that stops instead.
const isPrefix = onCardKeys.length <= targetKeys.length && onCardKeys.every((k, i) => k === targetKeys[i])
const ticked = onCard.filter((c) => c.checked).length
if (!isPrefix && ticked !== 0) {
  return blocked(
    'issue ' + issue + ' has to be rewritten to read as ' + from + ' in order, and it has ' + ticked + ' ticked criteria a rewrite would untick.',
    'Reorder the issue\'s criteria with the human: ticks are the lead\'s, given on evidence, and this workflow will not remove them.',
  )
}
const wanted = target.map((text, i) => ({ text, checked: isPrefix && i < onCard.length ? onCard[i].checked : false }))
const command = withRequest(ISSUE_BODY + ' criteria ' + n, {
  expect: onCard,
  criteria: wanted,
  spec: fromClauses ? null : specPath,
})
const filedCount = isPrefix ? target.length - onCard.length : target.length

phase('File the criteria')
// No agentType: no fleet agent's scope runs a write through gh, and this lane
// runs one command it is handed.
const filedResult = await agent(
  [
    'Run exactly this one command, from the checkout this workflow was started in. It runs the fleet\'s issue-body script, which reads issue ' + issue + ' with gh, writes its acceptance criteria, and writes the body back with gh issue edit --body-file. Do not change the command, add to it, or run any other command that writes:',
    command,
    ...scriptRun('edit the issue'),
  ].join('\n'),
  { model: 'sonnet', effort: 'low', phase: 'File the criteria', label: 'file criteria: ' + issue, schema: SCRIPT_SCHEMA },
)

const RERUN = 'Running this workflow again reads the issue afresh and writes only what still differs.'
if (!filedResult || typeof filedResult !== 'object') {
  return blocked(
    'the filing lane returned nothing, so whether the criteria reached issue ' + issue + ' is unknown.',
    'Look at the issue before doing anything else. ' + RERUN,
    { command },
  )
}
const filedFacts = factsOf(filedResult.output)
const filedExit = wholeNumber(filedResult.exitCode)
if (filedExit === 1 && filedFacts.result === 'changed') {
  return blocked(
    'the criteria on issue ' + issue + ' are not the ones this run read, so the script wrote nothing. ' + (filedFacts.message || ''),
    'Someone edited the issue while this ran, or the card lane misread it. ' + RERUN,
    { command },
  )
}
if (filedExit === 3 || filedFacts.result === 'unreadable') {
  return blocked(
    'could not read the board while filing, so whether the criteria reached issue ' + issue + ' is unknown. ' + (filedFacts.message || ''),
    'Check gh is installed and signed in (gh auth status) - /coder-fleet:kickoff checks it - then look at the issue before anything else: the edit may have landed. ' + RERUN + ' Never file a new issue for ' + issue + ' on the strength of this run.',
    { command },
  )
}
if (filedExit !== 0 || !['filed', 'unchanged'].includes(filedFacts.result)) {
  return blocked(
    'the filing lane gave no clean answer (exit ' + String(filedResult.exitCode) + ', result ' + (filedFacts.result || 'none') + '), so whether the criteria reached issue ' + issue + ' is unknown. ' + (filedFacts.message || String(filedResult.output || '').slice(0, 300)),
    'Look at the issue before doing anything else. ' + RERUN,
    { command },
  )
}
// The count proves how many; only the read-back proves the order the result
// is about to claim.
let readBack = null
try {
  const parsed = JSON.parse(filedFacts.criteria || '')
  if (Array.isArray(parsed)) readBack = parsed.map(sameText)
} catch (e) {
  readBack = null
}
const want = targetKeys.length
if (!readBack) {
  return blocked('after filing, issue ' + issue + ' did not read back: the script reported no criteria to compare.', 'Look at the issue before doing anything else. ' + RERUN, { command })
}
if (readBack.length !== want) {
  const doubled = readBack.length > want
  return blocked(
    'after filing, issue ' + issue + ' reports ' + readBack.length + ' acceptance criteria where ' + want + ' were expected.',
    doubled
      ? 'Look at the issue: it carries more criteria than ' + from + ' and the issue held between them, so another write landed at the same time. Running this workflow again rewrites the section to read as ' + from + ' in order, then its other criteria once each, which removes the duplicates - unless a criterion is ticked, when it stops and the duplicates are the human\'s to remove.'
      : 'Look at the issue: some criteria may not have been written. ' + RERUN,
    { command },
  )
}
if (readBack.some((k, i) => k !== targetKeys[i])) {
  return blocked('after filing, issue ' + issue + ' does not read back as ' + from + ' in order.', 'Look at the issue before doing anything else. ' + RERUN, { command })
}

return {
  issue,
  ...filedKeys,
  stage: resultStage,
  ...sourceKeys,
  card: issue,
  criteria: target,
  filed: filedFacts.result === 'unchanged' ? 0 : filedCount,
  alreadyOnCard,
  ...clauseKeys,
  ...challengeKeys,
  command,
  nextStep: readyStep('Issue ' + issue + ' now carries ' + carriesWhat),
}

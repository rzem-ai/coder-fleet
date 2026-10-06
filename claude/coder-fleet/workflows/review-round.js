export const meta = {
  name: 'review-round',
  description:
    'Review a numbered round of a diff: a cheap mechanical pass, then the Opus reviewer verdict, then - with fix: true - a fix run whose commit git has to vouch for before the next round reviews it',
  whenToUse:
    'After a coder finishes work on a board item and before anything merges. By default one run is one round: it reviews and hands blocking findings back. With { fix: true } and an issue whose card carries acceptance criteria it commissions the fix itself, verifies the commit against git rather than against what coder said, re-points the review at that commit and goes round again.',
  phases: [
    { title: 'Pin the range', detail: 'resolve both ends to commits and record the worktrees that exist now' },
    { title: 'Scope the diff', detail: 'what changed, how much, and whether it touches anything sensitive' },
    { title: 'Round mechanical', detail: 'lint, types, tests and obvious smells, in parallel', model: 'sonnet' },
    { title: 'Round verdict', detail: 'the reviewer verdict and ranked findings' },
    { title: 'Round fixes', detail: 'the card gate, the fix run, and the git evidence that it happened where it claims' },
  ],
}

// ---------------------------------------------------------------------------
// review-round
//
// A round is one pass, and rounds are numbered - the glossary's definition, not
// a loose word for iteration. Each round is a two-stage review:
//
//   1. A Sonnet mechanical pass, four lanes in parallel, leaning on the
//      pr-review-toolkit plugin for lint, types, tests and obvious smells.
//      Cheap, so the expensive stage never spends judgement on a lint error.
//   2. The Opus reviewer verdict. The reviewer never edits - that is its whole
//      value, because a reviewer that fixes things means the diff the human approves
//      is not the diff he read.
//
// With `fix: true` the loop closes: blocking findings go to coder, and the next
// round re-reviews the result. coder builds from the board card, so the fix is
// commissioned only once the card named by `issue` exists and carries at least
// one acceptance criterion; the human's order is the approval, and the card is
// what they ordered. The card gate needs the board: a machine without the
// binary gets the stop `could not read the board`, never `no card`, because
// the one says to fix the machine and the other says to file a card that may
// well exist. The loop ends when a round returns no blocking
// findings, or at the round cap, which is reported rather than passed off as a
// clean review. A Low finding - local to the change, needing no decision -
// rides a fix run that is happening anyway and is dropped when none is. It is
// never follow-up work, never widens the gate and never starts a round.
//
// WHAT THE LOOP BRANCHES ON, AND WHY IT IS NOT WHAT CODER SAID
//
// The previous version of this script commissioned coder and then lost the
// result. coder carries `isolation: worktree`, so its fixes land as commits in
// a worktree this script never learned the path of; nothing recorded a fix
// HEAD or moved the reviewed ref, so round two re-read the identical diff and
// ran to the cap while the fixes sat in a directory nobody looked at again.
// The loop was removed rather than left lying.
//
// It is back, on evidence. Every fact this script branches on - which worktree
// holds the fix, what it committed, whether that commit is built on the
// reviewed one, whether it is clean, which files it touched - comes from git,
// through lanes that run git and report what it said. coder's handoff is read
// for hints, and the hints are cross-checked and discarded on mismatch. What
// git cannot judge - whether the change is the *requested* change - is what the
// next round's reviewer is for, which is why a fix is never reported as good
// until a later round says so.
//
// TWO TRANSPORTS, AND WHY CODER GETS THE QUIET ONE
//
// A subagent spawned with a `schema` is forced through StructuredOutput, and
// the runtime then sends SubagentStop no `last_assistant_message` at all
// (measured 10 September 2026; hooks/README.md item 16). For a fleet agent that
// costs three things: the handoff-format gate never runs, no "## Done" comment
// reaches the card, and a `- Blocker: ` line - the only route to "Blocked by
// human" that works, since the runtime sends no status - cannot be emitted.
//
// So coder is spawned WITHOUT a schema. Its handoff comes back as a plain
// string, the hook still validates it, still comments the card, and still
// routes a blocker to the human. Everything this script needs to *decide* on comes
// instead from `gitLane` calls, which carry a schema and deliberately carry no
// `agentType`: the SubagentStop matcher lists only the ten fleet names, so
// those lanes are skipped by the gate and a schema costs them nothing.
//
// Note what that means and does not mean: no branch of enforce-agent-scope.sh
// governs an agentType-less lane either, so "read-only git only" in those
// prompts is an instruction, not enforcement. That is the same position the
// four mechanical lanes have always been in, and they run the project's test
// suite.
//
// Escalation lives here rather than in the reviewer body, because the agent
// frontmatter is static and a diff touching authentication, authorisation,
// secrets or credentials earns a deeper look. That is the lead's policy, and
// this script is the lead writing it down.
//
//   /coder-fleet:review-round { "base": "main", "head": "HEAD", "issue": "CF-12" }
//   /coder-fleet:review-round { "range": "main...feature/refresh", "maxRounds": 2 }
//   /coder-fleet:review-round { "target": "feature/refresh", "issue": "CF-12" }
//   /coder-fleet:review-round { "range": "main...feature/refresh", "issue": "CF-12", "fix": true }
//
// `issue` is a board id - letters, a dash, a number, and any sub-issue numbers
// after dots - and anything else stops as `invalid issue` before anything
// spawns, because the id reaches a shell command and a path.
//
// `fix` is opt-in. Worktree isolation for a workflow-spawned coder has not been
// observed once against a live Claude, and until it has, a run that commissions
// code by default is a run that surprises somebody.
//
//   /coder-fleet:review-round { "range": "main...feature/refresh", "issue": "CF-12", "fix": true, "refute": false }
//   /coder-fleet:review-round { "range": "main...feature/refresh", "issue": "CF-12", "refute": true }
//
// `refute` is the lead's tier switch. A clean round spawns a refuter under
// fix: true, or with refute: true on an ordinary review. Only a JSON false turns
// it off under fix: true (a string "false" keeps the refuter), and a round
// whose changed files match SENSITIVE refutes under fix: true regardless. With
// no refuter, the result's `gates` and `gatesMissing` are the item's gate run:
// what the tests and types-and-build lanes ran, and which ran nothing.
//
// A project can switch the refuter off altogether by listing it under
// `disabledAgents` in .claude/coder-fleet.json (CF-111). The pin lane reads
// that file from the main checkout, live, never from the worktree under
// review, so the caller need not pass anything, and then no round spawns a
// refuter whatever `refute`, `fix` or SENSITIVE say: a round that would have
// refuted stops as 'refutation skipped by config', carries refutationSkipped,
// and runs nothing in the refuter's place. The one exception is a round whose
// reviewed range changes that file: a branch cannot switch off its own
// refuter, so that round refutes as it would with no config.
//
// The same file sets the phase (CF-145): `"phase": "build"` or `"harden"`,
// read from the main checkout at the pin like disabledAgents. Build is the
// default - no file, no key, a value that is neither, or a file the pin lane
// did not read. It exists because every finding used to become a fix round,
// and the pipeline had no way to say "not yet". In build this run:
//   - reviews one round and commissions no fix round itself, under fix: true
//     too: blocking findings come back in fixRequest for the lead;
//   - fixes no Low finding: every one is reported under dropped;
//   - spawns a refuter only when today's rule calls for one AND the diff
//     touches an authentication or credential path (SENSITIVE); a round that
//     would otherwise have refuted stops as 'refutation skipped by build phase';
//   - reports follow-ups and proposals and says they are not filed as cards.
// Harden is everything above, unchanged.
// ---------------------------------------------------------------------------

const SCOUT = 'coder-fleet:scout'
const REVIEWER = 'coder-fleet:reviewer'
const CODER = 'coder-fleet:coder'
const REFUTER = 'coder-fleet:refuter'

const SENSITIVE =
  /(auth|authz|authn|login|logout|session|token|jwt|oauth|saml|oidc|password|passkey|credential|secret|crypto|cipher|hash|permission|entitlement|\.env|keychain|vault)/i

const SHA_RE = /^[0-9a-f]{7,40}$/i
// A board id: CF-12, or CF-12.1 for a sub-issue.
const ISSUE_RE = /^[A-Za-z]+-\d+(\.\d+)*$/

// The board is reached through the plugin's shim, never a bare `board` from
// PATH: a binary missing from PATH exits 127, and a lane that read that as "no
// card" advised filing a card that may well exist. CLAUDE_PLUGIN_ROOT is
// exported to hooks and the MCP server but not to a lane's shell (it was unset
// in a subagent's Bash when checked on 28 September 2026), so the command finds
// the shim itself: the runtime's root when it is set, else the most recently
// installed coder-fleet in the plugin cache, else ~/.local/bin/board, which is
// the binary every shim tries first. With none of them it exits 127 and says
// so. It runs the same under bash and zsh; the cache is searched with find
// rather than a glob because zsh aborts on a glob that matches nothing.
const BOARD =
  'b="${CLAUDE_PLUGIN_ROOT:-}/board/board.sh"; ' +
  '[ -x "$b" ] || b="$(find "$HOME/.claude/plugins/cache" -path \'*/coder-fleet/*/board/board.sh\' -type f -exec ls -1t {} + 2>/dev/null | head -n 1)"; ' +
  '[ -n "$b" ] || b="$HOME/.local/bin/board"; ' +
  '[ -x "$b" ] || { echo "board: no board.sh shim (CLAUDE_PLUGIN_ROOT is unset and the plugin cache has none) and no ~/.local/bin/board" >&2; exit 127; }; ' +
  '"$b"'
// git prints whatever length it feels like, so the reviewed head abbreviated is
// still the reviewed head. Comparing with === would let it be adopted as the
// fix, and round two would re-review the code round one already read - which is
// the exact failure this loop was deleted for in the first place.
function sameCommit(a, b) {
  const x = String(a || '').toLowerCase()
  const y = String(b || '').toLowerCase()
  if (!x || !y) return false
  return x === y || x.startsWith(y) || y.startsWith(x)
}
// The eval harness has never applied a schema, and neither has anything else
// this script's booleans arrive from. Two readings are both wrong: a truthy
// test makes the string "false" a blocking finding, and a strict `=== true`
// makes the string "true" a passing one - and that second failure approves a
// merge. So a reviewer's flag is read to FAIL CLOSED: anything that is not
// recognisably a no counts as blocking.
const NO_WORDS = new Set(['false', 'no', '0', ''])
// One reading for every flag that arrives from a model, used in both
// directions. A truthy test makes the string "false" a yes; a strict `=== true`
// makes the string "true" a no. Parse the word instead.
function saysYes(v) {
  if (typeof v === 'string') return !NO_WORDS.has(v.trim().toLowerCase())
  return Boolean(v)
}
// Not the negation of saysYes: absent and undefined are neither a yes nor a no,
// and the difference is what "confirmed isolated" turns on.
function saysNo(v) {
  if (v === false) return true
  return typeof v === 'string' && NO_WORDS.has(v.trim().toLowerCase()) && v.trim() !== ''
}

// git prints the path it resolved, and macOS resolves /tmp through /private, so
// string equality would leave a real worktree unfindable in its own list - and
// this check fails closed, so that would mean the loop never closes.
function samePath(a, b) {
  const trim = (p) => String(p || '').replace(/\/+$/, '')
  const x = trim(a)
  const y = trim(b)
  if (!x || !y) return false
  return x === y || '/private' + x === y || x === '/private' + y
}
function isBlocking(f) {
  return saysYes(f && f.blocking)
}
// Optional, and blocking outranks it. An absent flag is not Low, so a reviewer
// that never sets it leaves the finding a follow-up, as before: a missed flag
// can only reproduce the old behaviour, never drop a finding silently.
function isLow(f) {
  return !isBlocking(f) && saysYes(f && f.low)
}
function isFollowUp(f) {
  return !isBlocking(f) && !isLow(f)
}

// The cap is the only thing bounding what this workflow spends, and `|| 3`
// accepted any truthy value - so a maxRounds of "three" made every comparison
// NaN-false and the loop commissioned coder until the process died. Numbers
// that bound spend get the same suspicion as the flag that authorises it.
function positiveInt(v, fallback, name) {
  if (v === undefined || v === null || v === '') return fallback
  const n = Number(v)
  if (!Number.isFinite(n) || Math.floor(n) !== n || n < 1) return { bad: String(v), name }
  return n
}
const VERDICTS = ['approve', 'approve with follow-ups', 'request changes']
const DISPOSITIONS = ['not attempted', 'attempted and failed', 'rejected as wrong']

const input = typeof args === 'string' ? { range: args } : args || {}

// Input this script does not read is refused, never dropped. It used to be
// dropped: { target } fell through to HEAD~1...HEAD, the run reviewed the
// previous commit on main, and the verdict read as if it were about the branch
// (CF-3). Every key read anywhere below is in this list, so adding a read means
// adding it here.
const ACCEPTED_KEYS = ['range', 'base', 'head', 'target', 'issue', 'maxRounds', 'fix', 'refute', 'round']
const unknownKeys = Object.keys(input).filter((k) => !ACCEPTED_KEYS.includes(k))
if (unknownKeys.length) {
  throw new Error(
    'review-round does not accept ' +
      unknownKeys.map((k) => '"' + k + '"').join(', ') +
      '. Accepted keys: ' +
      ACCEPTED_KEYS.join(', ') +
      '. Nothing ran.',
  )
}

// `target` is a branch, reviewed against the default branch: a triple-dot range
// diffs from the merge-base, which is the change the branch made. It is the same
// question `range` answers, so the two together are an error rather than a
// precedence rule. The workflow runtime hands a script agent(), phase(), log()
// and its args and nothing that runs git, so the default branch and whether the
// branch exists are found by the pin lane below; the earliest that check can
// run is that lane, before any scope, mechanical or verdict lane.
const BRANCH_RE = /^[A-Za-z0-9._][A-Za-z0-9._\/@+-]*$/
// Presence is `in`, not a value test: { target: null } and { target: '' } are a
// caller asking for a target and getting the shape check, never the default range.
const hasTarget = 'target' in input
const target = hasTarget ? input.target : null
if (hasTarget) {
  const clash = ['range', 'base', 'head'].filter((k) => input[k] !== undefined)
  if (clash.length) {
    throw new Error(
      'review-round got "target" together with ' +
        clash.map((k) => '"' + k + '"').join(', ') +
        '. Pass either a target branch or a range, not both. Nothing ran.',
    )
  }
  // The name reaches a git command in a lane's prompt.
  if (typeof target !== 'string' || !BRANCH_RE.test(target) || target.includes('..')) {
    throw new Error('review-round "target" is ' + JSON.stringify(target) + ', which is not a branch name. Nothing ran.')
  }
}
// Until the pin lane names the default branch, a target's range is unresolved.
let rawRange = hasTarget
  ? '(default branch)...' + target
  : input.range || (input.base && input.head ? input.base + '...' + input.head : 'HEAD~1...HEAD')
const issue = input.issue || null
const maxRounds = positiveInt(input.maxRounds, 3, 'maxRounds')
// Opt-in, and read strictly. `input.fix` arrives from a slash command's JSON,
// so anything other than a real `true` is not consent.
const autoFix = input.fix === true

// On by default under fix: true, and reachable on an ordinary review through
// refute: true. Reaching it outside a loop is how the role earns its place:
// one agent on a single round produces real evidence about its behaviour,
// where a refuter first exercised inside a loop is being trusted with
// compounding errors on its first outing. The lead tiers the refuter (CF-45):
// an item that touches no authentication, authorisation, secrets or data
// writes gets none, so an explicit refute: false turns it off even under
// fix: true, and the tests and types-and-build lanes are that item's gate run.
// Only a real false does it; an absent key keeps the default.
const refute = input.refute === true || (autoFix && input.refute !== false)

// --- the project's disabled agents (CF-111) ---------------------------------
//
// A project lists fleet agents it goes without under `disabledAgents` in the
// main checkout's .claude/coder-fleet.json. This script cannot read a file, so
// the pin lane reports the file's text and fleetConfigFrom reads it here, with the
// rules hooks/lib/fleet-config.sh states for the hook (whose parser is
// python3's json module, in hooks/lib/fleet-config.py): no file or no key is
// today's fleet; a name must be printable ASCII, then is trimmed, lower-cased and loses any coder-fleet:
// prefix; lead, coder and reviewer cannot be disabled; and an invalid file
// honours nothing. workflow-logic.mjs runs both readings over the same fixtures
// and fails if they disagree. The file is read once per run, at the pin.
//
// Only the refuter is acted on here. With it disabled, no round spawns one -
// not under fix: true, not under refute: true and not on sensitive paths,
// unless the round's range changes the config file itself - and
// a round that would have refuted stops as REFUTATION_SKIPPED, never as a plain
// 'clean'. Nothing runs in its place: the human chose to skip the refutation,
// not to substitute another gate (CF-111 decision 3).
const FLEET_CONFIG_PATH = '.claude/coder-fleet.json'
const CORE_AGENTS = ['lead', 'coder', 'reviewer']
const AGENT_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/
const PRINTABLE_ASCII_RE = /^[ -~]*$/
const REFUTATION_SKIPPED = 'refutation skipped by config'
const PHASE_SKIPPED = 'refutation skipped by build phase'
// The shell parses with python3, which runs out of recursion on a deep array
// long before JSON.parse does, so both refuse a file whose brackets nest past
// this, counted on the text the same way (hooks/lib/fleet-config.py).
const FLEET_CONFIG_MAX_DEPTH = 64

function fleetConfigNesting(text) {
  let depth = 0
  let deepest = 0
  let inString = false
  let escaped = false
  for (const c of text) {
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '[' || c === '{') deepest = Math.max(deepest, ++depth)
    else if (c === ']' || c === '}') depth -= 1
  }
  return deepest
}

// JSON with every character outside printable ASCII escaped as \uXXXX, the
// way python's json.dumps(ensure_ascii=True) quotes a name in the shell's
// reason, so the two readers' reasons match character for character.
function asciiJson(s) {
  return JSON.stringify(s).replace(/[^ -~]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

// mainPath is the main worktree the pin lane reported. A file the lane found
// must come with the path it read, and that path must be the main worktree's:
// a copy read from a linked worktree is the branch under review speaking, and
// a found file with no path cannot be told apart from one, so neither is
// believed. A lane that found no file honours nothing anyway.
// The phase (CF-145): "build" or "harden", exactly, judged apart from
// disabledAgents. No key is build by default; any other value is build,
// reported. hooks/lib/fleet-config.py's phase_of matches it, reason included.
const PHASES = ['build', 'harden']
const PHASE_ONLY = ', and only "build" or "harden" is a phase'
const DEFAULT_PHASE = { phase: 'build', phaseState: 'default', phaseReason: '' }
function phaseOf(parsed) {
  if (!Object.prototype.hasOwnProperty.call(parsed, 'phase')) return DEFAULT_PHASE
  const v = parsed.phase
  if (typeof v === 'string' && PHASES.includes(v)) return { phase: v, phaseState: 'ok', phaseReason: '' }
  return { phase: 'build', phaseState: 'invalid', phaseReason: 'phase is ' + (typeof v === 'string' ? asciiJson(v) : 'not a string') + PHASE_ONLY }
}

function fleetConfigFrom(report, mainPath) {
  // Until a JSON object is read, the phase is the default.
  let phase = DEFAULT_PHASE
  const out = (state, disabled, reason) => ({ path: FLEET_CONFIG_PATH, state, reason: reason || '', disabledAgents: disabled, ...phase })
  if (!report || typeof report !== 'object' || !('found' in report)) {
    return out('unread', [], 'the pin lane did not report ' + FLEET_CONFIG_PATH + ', so nothing is treated as disabled')
  }
  const readAt = typeof report.path === 'string' ? report.path.trim() : ''
  if (isTrue(report.found) && !readAt) {
    return out('unread', [], 'the pin lane found ' + FLEET_CONFIG_PATH + ' but did not say where, so it cannot be checked against the main checkout and nothing is treated as disabled')
  }
  if (readAt) {
    const want = mainPath ? String(mainPath).replace(/\/+$/, '') + '/' + FLEET_CONFIG_PATH : ''
    if (!want || readAt !== want) {
      return out('unread', [], 'the pin lane read ' + readAt + ', which is not ' + (want || 'the main checkout\'s copy') + ' in the main checkout, so nothing is treated as disabled')
    }
  }
  if (!isTrue(report.found)) return out('absent', [])
  // The lane could see the file but not read it (a directory, no permission):
  // the label the shell helper gives the same case.
  if (report.error && String(report.error).trim() && !String(report.text || '')) {
    return out('unreadable', [], FLEET_CONFIG_PATH + ' exists but cannot be read')
  }
  const text = String(report.text == null ? '' : report.text)
  // A leading byte order mark is refused by name, as the helper refuses it.
  if (text.charCodeAt(0) === 0xfeff) return out('invalid', [], 'the file starts with a byte order mark')
  if (fleetConfigNesting(text) > FLEET_CONFIG_MAX_DEPTH) return out('invalid', [], 'the file nests deeper than ' + FLEET_CONFIG_MAX_DEPTH + ' levels')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return out('invalid', [], 'the file is empty or not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out('invalid', [], 'the file is not a JSON object')
  phase = phaseOf(parsed)
  if (!('disabledAgents' in parsed)) return out('ok', [])
  const list = parsed.disabledAgents
  if (!Array.isArray(list)) return out('invalid', [], 'disabledAgents is not a list')
  if (list.some((n) => typeof n !== 'string')) return out('invalid', [], 'disabledAgents holds something that is not a string')
  // The helper's order and alphabet exactly: a name with anything outside
  // printable ASCII is left as it is, so the shape test refuses it (JS and python
  // disagree on non-ASCII case and whitespace) and the reason quotes it with
  // asciiJson; otherwise trim spaces, lower
  // ASCII case, then drop the prefix.
  const names = list.map((n) => {
    if (!PRINTABLE_ASCII_RE.test(n)) return n
    const low = n.replace(/^ +/, '').replace(/ +$/, '').replace(/[A-Z]/g, (c) => c.toLowerCase())
    return low.startsWith('coder-fleet:') ? low.slice('coder-fleet:'.length) : low
  })
  const bad = names.filter((n) => !AGENT_NAME_RE.test(n))
  if (bad.length) return out('invalid', [], 'disabledAgents lists ' + bad.map(asciiJson).join(', ') + ', which is not an agent name')
  const cores = [...new Set(names.filter((n) => CORE_AGENTS.includes(n)))].sort()
  if (cores.length) return out('invalid', [], 'disabledAgents lists ' + cores.join(', ') + ', and lead, coder and reviewer cannot be disabled')
  return out('ok', [...new Set(names)].sort())
}

// --- reading a handoff -----------------------------------------------------
//
// These are EXTRACTORS, not validators. The handoff gate lives in
// board-subagent-stop.sh and stays there; nothing here decides whether a
// handoff is well formed, only what it says. The section rules are the hook's,
// quoted rather than reinvented: `^## ` opens or closes a section, `^- ` at
// column 0 is an item, and a line that is exactly `- None` (with optional
// trailing blanks, matching the hook's anchored filter) is not an item at all.
// `evals/lib/handoff-parity.sh` is where these stay pinned to the hook.

function handoffSection(msg, name) {
  if (typeof msg !== 'string') return []
  // Every line below is the hook's, in the hook's order:
  //   tr -d '\r'
  //   awk '{ sub(/[[:space:]]+$/, "") } $0 == want {inside=1; next} /^## / {inside=0} inside'
  //   grep -E '^- '
  //   grep -vE '^- None$'
  // Every line is right-trimmed before the heading test, exactly as the hook
  // does - trailing whitespace is invisible in rendered markdown ("## Done  "
  // is the hard-line-break idiom), so it never changes what a line means.
  // Leading whitespace still matters: "-  None", two spaces after the dash,
  // is a real item. handoff-extractor-parity.sh fails the build if these two
  // ever disagree on any fixture.
  const want = '## ' + name
  const out = []
  let inside = false
  for (const raw of msg.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/[ \t\v\f]+$/, '')
    if (line === want) {
      inside = true
      continue
    }
    if (/^## /.test(line)) inside = false
    if (!inside) continue
    if (!/^- /.test(line)) continue
    if (line === '- None') continue
    out.push(line.slice(2))
  }
  return out
}

// The three bullets the fix prompt asks for. All optional: a run whose handoff
// carries none of them still verifies, because git is the source and these are
// only ever a cross-check.
function fixHints(msg) {
  const hints = { worktreePath: '', baseCommit: '', headCommit: '' }
  for (const item of handoffSection(msg, 'Done')) {
    const m = /^(worktree|base-commit|head-commit)\s*:\s*(\S+)/i.exec(item)
    if (!m) continue
    const key = { worktree: 'worktreePath', 'base-commit': 'baseCommit', 'head-commit': 'headCommit' }[m[1].toLowerCase()]
    if (key && !hints[key]) hints[key] = m[2]
  }
  return hints
}

function readHandoff(msg) {
  const decisions = handoffSection(msg, 'Decisions needed')
  return {
    hints: fixHints(msg),
    done: handoffSection(msg, 'Done'),
    notDone: handoffSection(msg, 'Not done'),
    unverified: handoffSection(msg, 'Unverified'),
    blockers: decisions.filter((d) => /^Blocker:\s*/i.test(d)).map((d) => d.replace(/^Blocker:\s*/i, '')),
    proposals: decisions.filter((d) => /^Propose (item|memory):\s*/i.test(d)),
  }
}

// The refuter's survivors, from its Done bullets. Done and nowhere else: a
// survivor has to be confirmed, and one mentioned under Unverified or Not done
// was not. The rule fails closed: a Done bullet that mentions surviving (the
// stem "surviv" anywhere, markup stripped) is a survivor unless the whole
// bullet is one of the strict nothing-survived forms below. Models write the
// key in too many shapes to enumerate ("survived (m4):", "M-4 survived:",
// "survived - ..."), and a missed survivor approves the round, so the shapes
// are not enumerated; only "nothing survived" is, and anything it does not
// recognise, "survived: n/a" included, stops the round. A bare key is a
// survivor too: what it introduced may be nested, wrapped or on the next
// bullet, none of which handoffSection returns.
const NONE_KEY = String.raw`(?:survived|survivors|surviving mutations|survived mutations)\s*:\s*`
const NONE_WORD = String.raw`(?:none(?:\s+of\s+\d+)?|nothing|zero|no\s+survivors|0(?:\s+of\s+\d+|\s*\/\s*\d+)?)`
const ALL_KILLED = String.raw`all(?:\s+\d+)?(?:\s+(?:mutations|mutants))?\s+(?:were\s+)?killed`
const KILLED_CLAUSE = String.raw`(?:\s*\(${ALL_KILLED}\)|\s*[;,]\s*${ALL_KILLED}|\s+-\s+${ALL_KILLED})`
const NONE_SENTENCE = String.raw`(?:(?:ran|tried)\s+\d+\s+(?:mutations|mutants)\s*[,;]\s*|${ALL_KILLED}\s*[,;]\s*)?(?:none\s+survived|no\s+mutations?\s+survived|no\s+survivors)`
const NOTHING_SURVIVED = new RegExp(
  String.raw`^(?:${NONE_KEY}${NONE_WORD}${KILLED_CLAUSE}?|${NONE_WORD}${KILLED_CLAUSE}?|${NONE_SENTENCE})[.;,!]*$`,
  'i',
)
// A short key ending in a colon, for recording the survivor without it.
const SURVIVOR_KEY = /^(.{0,40}?surviv[^:]{0,24}):\s*(.*)$/i
function survivorsOf(said) {
  const out = []
  for (const item of said.done || []) {
    const plain = item.replace(/[`*_]/g, '').trim()
    if (!/surviv/i.test(plain)) continue
    if (NOTHING_SURVIVED.test(plain)) continue
    const m = SURVIVOR_KEY.exec(item)
    const text = m ? m[2].replace(/^[`*_\s]+/, '').trim() : ''
    out.push(text || item.trim())
  }
  return out
}

// How a refutation ends, in precedence order. A Blocker is a question only the
// human can answer, and the answer may change what gets fixed, so it outranks
// survivors, which are still carried. A branch for an incomplete refutation
// belongs before clean.
function refutationStop(said, survivors) {
  if ((said.blockers || []).length) return 'refuter raised a blocker'
  if ((survivors || []).length) return 'refuted'
  return 'clean'
}

// coder.md explicitly permits declining a finding it believes is wrong. A
// "## Not done" bullet of the form `<disposition>: <text naming the file>` says
// which of the three happened; anything else is read as not attempted, because
// silence is not a refusal.
function dispositionOf(said, file) {
  const want = normalisePath(file)
  for (const item of said.notDone || []) {
    // The shape asked for is "<disposition>: <file> - <why>", so only the FIRST
    // word after the colon is the file. Scanning the whole line let a file
    // mentioned in the reasoning inherit another finding's disposition -
    // "rejected as wrong: src/a.ts - unlike src/b.ts which I did fix" marked
    // src/b.ts rejected, which is the opposite of what it says.
    const m = /^([a-z ]+):\s*(\S+)/i.exec(item)
    if (!m) continue
    const disposition = m[1].trim().toLowerCase()
    if (!DISPOSITIONS.includes(disposition)) continue
    // A model writes a path in backticks or bold as often as bare, and reading
    // `src/b.ts` as a different file from src/b.ts turns a reasoned refusal
    // into a silent omission.
    const named = normalisePath(m[2].replace(/^[`*_'"(\[]+|[`*_'"),.\]]+$/g, ''))
    if (pathsMatch(named, want) || named === want) return disposition
  }
  return 'not attempted'
}

// A reviewer's `file` is model text: it may arrive as `./src/a.ts`, as
// `src/a.ts:88`, or as an absolute path. git reports repo-relative paths. A
// format mismatch that hard-stops every legitimate fix would mean the loop
// never closes, so both sides are normalised and a suffix match is accepted as
// a logged fallback rather than a silent one.
function normalisePath(p) {
  return String(p || '')
    .trim()
    .replace(/^\.\//, '')
    .replace(/:\d+(:\d+)?$/, '')
}

function pathsMatch(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  // A suffix match is how an absolute path from a reviewer meets a
  // repo-relative one from git. It is not a licence to match on a bare
  // basename: "index.ts" would otherwise match every index.ts in the tree, and
  // a fix that touched an unrelated file of that name would satisfy the very
  // gate that exists to check it touched the right one. So the shorter side has
  // to carry at least one directory of its own before a suffix counts.
  const shorter = a.length < b.length ? a : b
  if (!shorter.includes('/')) return false
  return a.endsWith('/' + b) || b.endsWith('/' + a)
}

// --- the git lanes ---------------------------------------------------------
//
// No agentType, deliberately - see the header. These carry a schema because
// nothing downstream reads their prose, and because the matcher skips them so
// the schema costs no handoff.

const GIT_STATE_SCHEMA = {
  type: 'object',
  // fleetConfig is required so a live pin lane has to answer it; the verify
  // lane reuses only this schema's worktrees, so it never has to.
  required: ['resolved', 'worktrees', 'fleetConfig'],
  properties: {
    defaultBranch: { type: 'string' },
    // The main checkout's .claude/coder-fleet.json as the lane found it,
    // verbatim, and where. The script parses it (fleetConfigFrom), never the
    // lane, and checks the path is the main worktree's.
    fleetConfig: {
      type: 'object',
      required: ['found', 'text', 'path'],
      properties: {
        found: { type: 'boolean' },
        text: { type: 'string' },
        path: { type: 'string' },
        error: { type: 'string' },
      },
    },
    resolved: {
      type: 'array',
      items: {
        type: 'object',
        // `role` rather than matching on the ref text: a lane that tidies
        // "feature/refresh" into "refs/heads/feature/refresh" would otherwise
        // silently resolve to nothing, and positional order is the same guess
        // this script refuses to make about the mechanical lanes. Target mode
        // is the exception (TARGET_PIN_SCHEMA below): it compares the ref text
        // back to the names it asked about, so there `ref` is required and the
        // prompt says to report it exactly as given.
        required: ['role', 'sha'],
        properties: {
          role: { type: 'string', enum: ['base', 'head'] },
          ref: { type: 'string' },
          sha: { type: 'string' },
          error: { type: 'string' },
        },
      },
    },
    worktrees: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'head', 'isMain'],
        properties: {
          path: { type: 'string' },
          head: { type: 'string' },
          branch: { type: 'string' },
          dirty: { type: 'boolean' },
          isMain: { type: 'boolean' },
        },
      },
    },
    commandsRun: { type: 'array', items: { type: 'string' } },
    couldNotRun: { type: 'array', items: { type: 'string' } },
  },
}

const FIX_VERIFY_SCHEMA = {
  type: 'object',
  // `worktrees` is required, not optional, so the before-snapshot can be
  // refreshed between rounds. Left stale, round three would see round two's
  // worktree as still new, find two candidates and stop as ambiguous. That is
  // a contract with the lane rather than something the stubbed suite can
  // demonstrate - the lanes are stubs here, so nothing below proves it.
  required: ['headCommit', 'containsReviewedHead', 'dirty', 'filesChanged', 'commits', 'worktrees'],
  properties: {
    headCommit: { type: 'string' },
    containsReviewedHead: { type: 'boolean' },
    dirty: { type: 'boolean' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    commits: { type: 'array', items: { type: 'string' } },
    worktrees: GIT_STATE_SCHEMA.properties.worktrees,
    worktreePath: { type: 'string' },
    branch: { type: 'string' },
    isMain: { type: 'boolean' },
    forkPoint: { type: 'string' },
    candidates: { type: 'array', items: { type: 'string' } },
    isolatedSelfReport: { type: 'string' },
    commandsRun: { type: 'array', items: { type: 'string' } },
    couldNotRun: { type: 'array', items: { type: 'string' } },
  },
}

// The fix lane's own worktree (CF-127). A workflow agent() spawn does not get
// coder's `isolation: worktree` - in the live run wf_1297e8b7-cb8 the fix-lane
// coder started in the main checkout - so a git lane cuts one before the coder
// starts, and reports what git says about it once it exists.
const FIX_WORKTREE_SCHEMA = {
  type: 'object',
  required: ['created', 'path', 'branch', 'head', 'gitDir', 'error'],
  properties: {
    created: { type: 'boolean' },
    path: { type: 'string' },
    branch: { type: 'string' },
    head: { type: 'string' },
    gitDir: { type: 'string' },
    error: { type: 'string' },
    commandsRun: { type: 'array', items: { type: 'string' } },
    couldNotRun: { type: 'array', items: { type: 'string' } },
  },
}

// Named from the issue and the round, so a rerun of the same round meets the
// branch it left last time. That is a stop, never a fresh suffix: the old
// branch may hold a fix nobody has looked at, and quietly forking past it is
// how work goes missing. The lead adopts or prunes it, then runs again.
function fixWorktreeFor(main, id, n) {
  const name = id + '-r' + n
  return { path: String(main).replace(/\/+$/, '') + '/.claude/worktrees/review-round-' + name, branch: 'review-round/' + name }
}

// git prints a branch bare from symbolic-ref --short, and as refs/heads/<name>
// from the porcelain worktree list. Either is the same branch.
function sameBranch(a, b) {
  const strip = (x) => String(x || '').trim().replace(/^refs\/heads\//, '')
  return Boolean(strip(a)) && strip(a) === strip(b)
}

// The worktree lane, as a pure function over what it reported. Returns the
// stop reason, or null when the coder may start in that worktree. It fails
// closed: a lane that does not say it made exactly the worktree it was asked
// for, at the reviewed head, as a linked worktree, has not made it.
function worktreeLaneStop(w, want, head) {
  if (!w) return 'the worktree lane returned nothing'
  if (!isTrue(w.created)) return 'git did not create ' + want.path + ' on ' + want.branch + (w.error ? ': ' + w.error : '')
  if (!samePath(w.path, want.path)) return 'the lane reported the worktree at ' + JSON.stringify(w.path || '') + ', not ' + want.path
  if (!sameBranch(w.branch, want.branch)) return 'the lane reported the worktree on branch ' + JSON.stringify(w.branch || '') + ', not ' + want.branch
  if (!SHA_RE.test(String(w.head || '')) || !sameCommit(w.head, head)) return 'the lane reported the worktree at ' + JSON.stringify(w.head || '') + ', not the reviewed commit ' + head
  if (!/\/worktrees\//.test(String(w.gitDir || ''))) return 'the lane did not show ' + want.path + ' is a linked worktree: its git dir is ' + JSON.stringify(w.gitDir || '')
  return null
}

// Target mode checks the ref text the lane reports against the target and the
// default branch it named, so a lane that omits `ref` cannot be checked. Range
// mode stays as it was.
const TARGET_PIN_SCHEMA = JSON.parse(JSON.stringify(GIT_STATE_SCHEMA))
TARGET_PIN_SCHEMA.properties.resolved.items.required = ['role', 'ref', 'sha']

const CARD_GATE_SCHEMA = {
  type: 'object',
  required: ['found', 'boardRead', 'criteriaCount', 'evidence'],
  properties: {
    found: { type: 'boolean' },
    boardRead: { type: 'boolean' },
    criteriaCount: { type: 'number' },
    evidence: { type: 'string' },
  },
}

// A yes for a fact the gate acts on: a real true, or the string "true". The
// fail-closed saysYes above reads any word it does not know as a yes, which is
// right for a blocking flag and wrong here - "not found" is not a card.
const isTrue = (v) => v === true || v === 'true'

// The binary's own not-found error for this id is `no task <id>` and nothing
// else. Only that, on a board the lane says it read, is "no card".
function boardSaidNoTask(g, id) {
  if (!isTrue(g.boardRead)) return false
  const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('(^|\\W)no task ' + escaped + '(?![\\w-]|\\.\\d)', 'i').test(String(g.evidence || ''))
}

// The card gate, as a pure function over what its lane reported. Returns the
// stop reason, or null when the card may be built from. It fails closed: a
// silent lane, a found that is not a yes, and a count that is not a whole
// number above zero all stop, because a card nobody could read is not a card
// with criteria on it. `true` is not a count, though Number(true) is 1. A card
// that was not found is `no card` only when the board answered with its own
// not-found error for this id; a missing binary, a shell that could not find
// it, or anything else is `could not read the board`.
function cardGateStop(g, id) {
  if (!g) return 'card gate returned nothing'
  if (!isTrue(g.found)) return boardSaidNoTask(g, id) ? 'no card' : 'could not read the board'
  const v = g.criteriaCount
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN
  if (!Number.isInteger(n) || n < 1) return 'no acceptance criteria'
  return null
}

function gitLane(label, lines, schema) {
  return agent(lines.filter(Boolean).join('\n'), {
    model: 'sonnet',
    effort: 'low',
    phase: 'git state',
    label,
    schema,
  })
}

// --- pinning ---------------------------------------------------------------

function splitRange(r) {
  const three = r.indexOf('...')
  if (three > 0) return { base: r.slice(0, three), head: r.slice(three + 3), sep: '...' }
  const two = r.indexOf('..')
  if (two > 0) return { base: r.slice(0, two), head: r.slice(two + 2), sep: '..' }
  return { base: r + '~1', head: r, sep: '...' }
}

const ends = hasTarget ? { base: '', head: target, sep: '...' } : splitRange(rawRange)

// The cap is checked before anything spawns. A round past the cap has nothing
// to do, and resolving refs for a review that will not happen is just spend.
const startRound = positiveInt(input.round, 1, 'round')

// Refuse an id that is not a board id before anything spawns: it reaches the
// card gate's shell command and the reviewer's path to the card.
if (issue !== null && !(typeof issue === 'string' && ISSUE_RE.test(issue))) {
  return {
    range: rawRange,
    issue,
    roundsRun: 0,
    stopped: 'invalid issue',
    approved: false,
    verdict: 'no verdict',
    rounds: [],
    history: [],
    fixes: [],
    nextStep:
      'issue was ' + JSON.stringify(issue) + ', which is not a board id such as CF-12 or CF-12.1. Nothing ran. Run this again with the id of the card this work belongs to.',
  }
}

// Refuse an unusable bound rather than running without one.
const badNumber = [maxRounds, startRound].find((v) => v && typeof v === 'object')
if (badNumber) {
  return {
    range: rawRange,
    issue,
    roundsRun: 0,
    stopped: 'unusable ' + badNumber.name,
    approved: false,
    verdict: 'no verdict',
    rounds: [],
    history: [],
    fixes: [],
    nextStep:
      badNumber.name + ' was "' + badNumber.bad + '", which is not a whole number of rounds. Nothing ran, because that value is the only thing bounding what this workflow spends.',
  }
}

if (startRound > maxRounds) {
  return {
    range: rawRange,
    issue,
    roundsRun: 0,
    stopped: 'round cap',
    verdict: 'no verdict',
    rounds: [],
    approved: false,
    history: [],
    fixes: [],
    nextStep:
      'Round ' + startRound + ' is past the cap of ' + maxRounds + '. This is not an approval and nothing was reviewed. Decide whether the change needs a different approach rather than another round.',
  }
}

phase('Pin the range')
const pinned = await gitLane(
  'pin refs',
  [
    'Report on a git repository and change nothing. Read-only git only.',
    hasTarget
      ? 'First find the default branch: the branch git symbolic-ref --short refs/remotes/origin/HEAD names (drop the origin/ prefix), or if that is unset, main, or failing that master, whichever exists. Report it as defaultBranch, or an empty string if none exists. Then run git rev-parse --verify "<defaultBranch>^{commit}" - that one is role "base" - and git rev-parse --verify "' + target + '^{commit}", which is role "head". Report each as a resolved entry carrying its role, its ref, and the full commit sha. Report ref as exactly the name you were asked to resolve, without ^{commit}, without refs/heads/ and without a remote prefix such as origin/: the literal defaultBranch for base and the literal ' + JSON.stringify(target) + ' for head. Do not substitute another ref: if a name does not resolve locally, report that entry with an empty sha and the error text in `error`, and never fall back to origin/<name>.'
      : 'Run git rev-parse --verify "' + ends.base + '^{commit}" - that one is role "base" - and git rev-parse --verify "' + ends.head + '^{commit}", which is role "head".',
    hasTarget
      ? ''
      : 'Report each as a resolved entry carrying its role, the ref you were given, and the full commit sha. If one does not resolve, report an empty sha for that role and put the error text in `error`.',
    'Then run git worktree list --porcelain and report every worktree: its path, its HEAD commit, its branch if it has one, whether git status --porcelain in it is non-empty (dirty), and isMain, which is true for the FIRST worktree the porcelain output names and false for every other.',
    'Last, the project\'s fleet config, which lives in the main checkout and never in the checkout you were started in. Take the path of the FIRST worktree the git worktree list --porcelain output above names - the one you report isMain true - and cat the file ' + FLEET_CONFIG_PATH + ' under that directory if it exists, as it is on disk now, uncommitted edits included. Do not read it from any other worktree, even if the first one has no such file. If git worktree list failed, named no worktree, or its first entry is bare, there is no main checkout: read no file, and report found false, text empty and path empty. Report fleetConfig.path as the absolute path you read or looked for. Report fleetConfig.found as true when the file exists and false when it does not, and fleetConfig.text as the exact contents cat printed, character for character - do not reformat, fix or summarise it, even if it is not valid JSON - or an empty string when there is no file. If the file exists but cannot be read, report found true, text empty, and the error in fleetConfig.error.',
    'Do not review anything and do not offer an opinion.',
  ],
  hasTarget ? TARGET_PIN_SCHEMA : GIT_STATE_SCHEMA,
)

const fleetConfig = fleetConfigFrom(pinned && pinned.fleetConfig, (((pinned && pinned.worktrees) || []).find((w) => w && isTrue(w.isMain)) || {}).path)
const refuterDisabled = fleetConfig.disabledAgents.includes('refuter')
if (fleetConfig.state === 'invalid' || fleetConfig.state === 'unreadable') {
  log(FLEET_CONFIG_PATH + ' is ' + fleetConfig.state + ' (' + fleetConfig.reason + '), so none of its disabledAgents entries is honoured and every agent stays enabled.')
} else if (fleetConfig.state === 'unread') {
  log(fleetConfig.reason + '.')
} else if (refuterDisabled) {
  log(FLEET_CONFIG_PATH + ' disables the refuter, so no round of this run spawns one and nothing runs in its place, unless a round\'s range changes that file.')
}
// Harden only when the main checkout's file says so; anything else is build.
const buildPhase = fleetConfig.phase !== 'harden'
if (fleetConfig.phaseState === 'invalid') {
  log(FLEET_CONFIG_PATH + ' sets phase to a value it does not know (' + fleetConfig.phaseReason + '), so this run works in the build phase.')
}
log(
  buildPhase
    ? 'Build phase: one round, no fix round commissioned here, Low findings reported and not fixed, a refuter only on authentication or credential paths.'
    : 'Harden phase: the full loop.',
)

const resolvedOf = (role) => ((pinned && pinned.resolved) || []).find((r) => r && r.role === role)
const reviewBase = (resolvedOf('base') || {}).sha || ''
let reviewedHead = (resolvedOf('head') || {}).sha || ''

// A target that is not there stops the run here, by name. Falling back to
// HEAD~1...HEAD is the defect this key exists to end, and returning a normal
// "does not resolve" result would read like a verdict, so it throws. This is
// after one lane, not before any: the script cannot run git itself.
if (hasTarget) {
  const head = resolvedOf('head') || {}
  if (!pinned) {
    throw new Error('review-round could not check target "' + target + '": the pin lane returned no result. Nothing was reviewed. Run it again.')
  }
  if (!SHA_RE.test(reviewedHead)) {
    throw new Error(
      'review-round target "' + target + '" does not exist in this checkout' + (head.error ? ' (' + head.error + ')' : '') + '. Nothing was reviewed.',
    )
  }
  const def = String((pinned && pinned.defaultBranch) || '').trim()
  if (!def || !BRANCH_RE.test(def) || !SHA_RE.test(reviewBase)) {
    throw new Error(
      'review-round could not find the default branch to review "' + target + '" against (the lane reported ' + JSON.stringify(def) + '). Pass a range instead. Nothing was reviewed.',
    )
  }
  // The lane must have answered about what it was asked, not tidied it into
  // something else or resolved the wrong ref.
  const baseEntry = resolvedOf('base') || {}
  if (!head.ref || !baseEntry.ref) {
    throw new Error(
      'review-round asked the pin lane about "' + def + '" and "' + target + '" but it did not say which ref it resolved for ' + (!baseEntry.ref ? 'base' : 'head') + '. Nothing was reviewed.',
    )
  }
  if (head.ref !== target || (resolvedOf('base') || {}).ref !== def) {
    throw new Error(
      'review-round asked the pin lane about "' + def + '" and "' + target + '" but it reported ' + JSON.stringify((resolvedOf('base') || {}).ref) + ' and ' + JSON.stringify(head.ref) + '. Nothing was reviewed.',
    )
  }
  rawRange = def + '...' + target
}

if (!SHA_RE.test(reviewBase) || !SHA_RE.test(reviewedHead)) {
  // A symbolic base is not good enough to carry across rounds: if `main` moves
  // while this runs, round two reviews a different range from round one and the
  // claim that the rounds review the same cumulative change is false.
  return {
    range: rawRange,
    issue,
    roundsRun: 0,
    stopped: 'the reviewed head does not resolve',
    verdict: 'no verdict',
    rounds: [],
    approved: false,
    history: [],
    fixes: [],
    pinned: { base: reviewBase, head: reviewedHead, reported: (pinned && pinned.resolved) || [] },
    nextStep:
      'Neither end of ' + rawRange + ' could be pinned to a commit, so there is nothing to review and nothing to compare a later round against. Check the refs exist in this checkout and run again.',
  }
}

let worktreesBefore = (pinned && pinned.worktrees) || []
// The main checkout, from the pin. The fix lane cuts its worktrees under it, and
// it does not move during a run, so later worktree lists do not replace it.
const mainCheckout = ((worktreesBefore.find((w) => w && isTrue(w.isMain)) || {}).path || '').trim()
// Every worktree a fix lane cut, left for the lead to adopt or prune.
const fixWorktrees = []
let reviewRange = reviewBase + '...' + reviewedHead
let checkoutPath = ''
// Reported at the end, and re-derived every round: a fix adds files, so
// whether the change touches anything sensitive is a fact about the code as it
// now stands rather than about the range this run started with.
let sensitive = false
let sensitiveFiles = []
// The changed paths that are the fleet config itself, re-derived every round
// like sensitiveFiles. Matched case-blind and anywhere in the path text, so a
// rename line or a case-insensitive disk errs towards refuting.
let configInRange = []
log('Reviewing ' + rawRange + ', pinned to ' + reviewRange + '.')

// --- schemas ---------------------------------------------------------------

const LANES = [
  {
    name: 'lint and format',
    task: 'Run the repository lint and format checks over the changed files and report every violation the diff introduced. Use the pr-review-toolkit plugin checks where they cover this.',
  },
  {
    name: 'types and build',
    task: 'Run the type check and the build. Report every error the diff introduced, with file and line.',
  },
  {
    name: 'tests',
    task: 'Run the test suite, or the tests covering the changed files if the full suite is impractical. Report failures, and report any changed behaviour that no test covers. Say plainly which tests you actually ran.',
  },
  {
    name: 'obvious smells',
    task: 'Read the diff for the mechanical things a linter misses: dead code, a debug statement left in, a swallowed error, a copied block, a TODO shipped, a magic value, an unused import, a commented-out block. Report only what is mechanically checkable - leave judgement to the next stage.',
  },
]

// The lanes that run the item's gates. The lead reads their ran lists when no
// refuter ran, so they are reported by name in the result.
const GATE_LANES = ['types and build', 'tests']

// A gate lane ran nothing on record when it returned nothing, or when its ran
// is empty or not a list: a lane that says it could not find a test command
// has not run the tests.
function gateMissing(g) {
  return !Array.isArray(g.ran) || g.ran.length === 0
}

const MECH_SCHEMA = {
  type: 'object',
  required: ['lane', 'ran', 'findings'],
  properties: {
    lane: { type: 'string' },
    ran: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'what'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          what: { type: 'string' },
        },
      },
    },
    couldNotRun: { type: 'array', items: { type: 'string' } },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'summary', 'findings'],
  properties: {
    verdict: { type: 'string', enum: VERDICTS },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'what', 'why', 'blocking'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          what: { type: 'string' },
          why: { type: 'string' },
          blocking: { type: 'boolean' },
          low: { type: 'boolean' },
        },
      },
    },
    unverified: { type: 'array', items: { type: 'string' } },
  },
}

// --- the fix gate ----------------------------------------------------------
//
// A pure function over what the verify lane reported, which is what makes the
// whole design testable without a git repository or a model. Returns the first
// disqualifying reason, or null when the commit may be reviewed.

function gateFix(v, blocking, head) {
  if (!v) return 'the fix verification returned nothing'

  if (!SHA_RE.test(String(v.headCommit || ''))) {
    if (saysYes(v.isMain)) return NOT_ISOLATED
    if ((v.candidates || []).length > 1)
      return 'more than one worktree could be the fix (' + v.candidates.join(', ') + '), so which commit to review would be a guess'
    return 'the fix run produced no commit'
  }
  // Ambiguity disqualifies whether or not the lane went on to pick one. A lane
  // that reports three candidates and then names a winner has guessed, and the
  // check used to sit inside the no-commit branch where it never saw this.
  if ((v.candidates || []).length > 1)
    return 'the verification named ' + v.candidates.length + ' candidate worktrees (' + v.candidates.join(', ') + ') and then chose one, so the commit to review is a guess'
  // A commit whose location is unknown cannot be re-reviewed, because every
  // later lane is told to work in that checkout. Adopting it sends round two to
  // read the original code and call the result verified.
  if (!v.worktreePath) return 'the verification found a commit but not the checkout holding it, so a later round has nowhere to read it'
  if (sameCommit(v.headCommit, head)) return 'the fix commit is the reviewed commit, so nothing was committed'
  // Isolation has to be CONFIRMED, not merely unmentioned. `isMain` is optional
  // in the schema, so a lane that omits it would otherwise prove isolation by
  // saying nothing - and in the probe both agents ran in the main checkout, so
  // silence is the shape this failure actually takes. Confirmation is an
  // explicit isMain: false, or the worktree list saying so about this path.
  // The worktree list is consulted FIRST, always. Guarding the cross-check
  // behind the flat field meant an `isMain: false` skipped it - so a payload
  // that contradicted itself in one object, flat field saying not-main while
  // its own list said that exact path IS main, was believed on the flat claim.
  // Fixing "absent" was not fixing "lying", and they are one branch apart.
  const entry = (v.worktrees || []).find((w) => w && w.path && samePath(w.path, v.worktreePath))
  if (entry) {
    if (saysYes(entry.isMain)) return NOT_ISOLATED
    if (!saysNo(entry.isMain)) return NOT_CONFIRMED_ISOLATED
    // The list says this path is not the main checkout. If the flat field says
    // it is, the payload contradicts itself and neither half can be trusted -
    // whichever way round the disagreement runs.
    if (saysYes(v.isMain)) return NOT_CONFIRMED_ISOLATED
  } else if (!saysNo(v.isMain)) {
    // No entry for this path: the flat field is all there is, and it has to be
    // an explicit no rather than merely not a yes.
    return NOT_CONFIRMED_ISOLATED
  }
  if (!saysYes(v.containsReviewedHead))
    return (
      'the fix is not built on the reviewed commit ' + head + (v.forkPoint ? ' - it forks at ' + v.forkPoint : '')
    )
  if (saysYes(v.dirty)) return 'the fix worktree has uncommitted changes, so the commit is not the whole fix'

  // The file-touch rule used to be skipped entirely when no finding named a
  // file, which meant an empty commit satisfied it. If there is nothing to
  // check the fix against, that is a reason to stop, not a reason to pass.
  const named = (blocking || []).map((f) => normalisePath(f.file)).filter(Boolean)
  if (!named.length)
    return 'no blocking finding names a file, so there is nothing to check the fix commit against'
  const changed = (v.filesChanged || []).map(normalisePath).filter(Boolean)
  const hit = named.filter((n) => changed.some((c) => pathsMatch(c, n)))
  if (!hit.length)
    return 'the fix commit touches none of the files the blocking findings name (' + named.join(', ') + ')'
  if (hit.length < named.length) log('The fix touches ' + hit.length + ' of ' + named.length + ' named files; the rest go back to the reviewer by name.')
  return null
}

// Run after gateFix passes, so every reason it gives keeps its own words. An
// isolated commit is not enough: the fix belongs on the worktree this run cut
// for it, on that worktree's branch, and git has to say both (CF-127).
function offTheFixWorktree(v, wt) {
  if (!v || !wt) return null
  if (!samePath(v.worktreePath, wt.path))
    return 'the fix commit is in ' + v.worktreePath + ', not in ' + wt.path + ', the worktree this run created for it'
  if (!sameBranch(v.branch, wt.branch))
    return 'the fix commit is on branch ' + JSON.stringify(v.branch || '') + ', not on ' + wt.branch + ', the branch this run created for it'
  return null
}

const NOT_CONFIRMED_ISOLATED =
  'the fix run could not be confirmed isolated: nothing in the verification says whether that worktree is the main checkout, and an unconfirmed fix is not adopted'

const NOT_ISOLATED =
  'the fix run was not isolated: the only worktree whose HEAD moved is the main checkout, so the commit is on the shared working branch rather than in a worktree this run may re-review'

function unresolvedFrom(v, blocking, said) {
  const changed = (v.filesChanged || []).map(normalisePath).filter(Boolean)
  return (blocking || [])
    .filter((f) => !changed.some((c) => pathsMatch(c, normalisePath(f.file))))
    .map((f) => ({
      ...f,
      disposition: dispositionOf(said, f.file),
      why: 'the fix commit does not touch ' + f.file,
    }))
}

// --- the rounds ------------------------------------------------------------

const rounds = []
const fixes = []
let round = startRound
let stopped = 'clean'
let fixRequest = null
// Set only when a round called for a refutation and the project's config
// disabled the refuter. Says why in words the result carries to the lead.
let refutationSkipped = null

while (true) {
  const tag = 'Round ' + round

  if (round > maxRounds) {
    stopped = 'round cap'
    log(tag + ' is past the cap of ' + maxRounds + '. This is not an approval.')
    break
  }

  // Scope, inside the loop: a fix adds files, and whether the change is
  // sensitive has to be re-derived from the code as it now stands.
  phase('Scope the diff')
  const scopeResult = await agent(
    [
      'Report on a diff and change nothing. Read-only git only.',
      checkoutPath ? 'Run these in ' + checkoutPath + '. cd there first; that checkout holds the commits under review.' : '',
      'Run git diff --stat ' + reviewRange + ' and git diff --name-only ' + reviewRange + '.',
      'Return every changed path, the total lines added and removed, and the first line of each commit in the range.',
      'Do not review anything and do not offer an opinion.',
    ]
      .filter(Boolean)
      .join(' '),
    {
      agentType: SCOUT,
      label: 'scope ' + reviewRange,
      schema: {
        type: 'object',
        required: ['files', 'added', 'removed'],
        properties: {
          files: { type: 'array', items: { type: 'string' } },
          added: { type: 'number' },
          removed: { type: 'number' },
          commits: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  )

  // A scope pass that failed and a diff that is genuinely empty are two
  // different facts about the world. Collapsing them reported a broken run as
  // "nothing to review", which reads exactly like a clean one.
  if (!scopeResult) {
    stopped = 'scope pass returned nothing'
    log(tag + ': the scope pass returned nothing, so what changed is unknown. Stopping rather than reviewing an empty list.')
    break
  }

  const scope = scopeResult
  if (!(scope.files || []).length) {
    stopped = rounds.length ? 'the fix range is empty' : 'nothing to review'
    break
  }

  sensitiveFiles = scope.files.filter((f) => SENSITIVE.test(f))
  sensitive = sensitiveFiles.length > 0
  configInRange = scope.files.filter((f) => String(f).toLowerCase().includes(FLEET_CONFIG_PATH))
  log(
    tag +
      ': ' +
      scope.files.length +
      ' files, +' +
      scope.added +
      '/-' +
      scope.removed +
      (sensitive ? '. Sensitive paths present, so the verdict runs deeper: ' + sensitiveFiles.join(', ') : '.'),
  )

  // A barrier is right here: the verdict stage needs every lane's findings in
  // hand, so that it can see what the mechanical pass already took. Each result
  // is stamped with the workflow's own lane name inside that lane's own task,
  // so matching depends neither on what the model wrote in `lane` nor on the
  // order parallel() hands results back in.
  phase(tag + ' mechanical')
  const mechRaw = await parallel(
    LANES.map(
      (lane) => () =>
        agent(
          [
            'Mechanical review pass, ' + tag + ', over the diff ' + reviewRange + '.',
            lane.task,
            checkoutPath
              ? 'Run everything in ' + checkoutPath + '. That is the checkout holding the commits under review; cd there first. Do not commit, do not check anything out, and do not modify tracked files.'
              : '',
            'Changed files:\n' + scope.files.join('\n'),
            'Report what you found and what you could not run. Do not fix anything and do not judge design.',
          ]
            .filter(Boolean)
            .join('\n\n'),
          {
            model: 'sonnet',
            effort: 'low',
            phase: tag + ' mechanical',
            label: tag + ': ' + lane.name,
            schema: MECH_SCHEMA,
          },
        ).then((r) => (r && typeof r === 'object' ? { ...r, lane: lane.name } : r)),
    ),
  )
  const mechanical = mechRaw.filter(Boolean)

  // Under refute: false these two lanes are the item's independent gate run,
  // so the result carries what each one ran and what it said it could not
  // run. A lane that returned nothing is kept with ran: null rather than
  // dropped, and one whose ran is empty or not a list ran no gate either, so
  // both count as missing. Found by the stamped lane name above.
  const gates = GATE_LANES.map((name) => {
    const m = mechanical.find((x) => x && x.lane === name)
    return m
      ? { lane: name, ran: Array.isArray(m.ran) ? m.ran : null, findings: m.findings || [], couldNotRun: Array.isArray(m.couldNotRun) ? m.couldNotRun : [] }
      : { lane: name, ran: null, findings: [], couldNotRun: [] }
  })
  for (const g of gates) {
    if (gateMissing(g)) {
      log(
        tag +
          ': the ' +
          g.lane +
          ' lane ' +
          (mechanical.some((x) => x && x.lane === g.lane) ? 'reported no command it ran' : 'returned nothing') +
          ', so no gate run is on record for it' +
          (g.couldNotRun.length ? ' (could not run: ' + g.couldNotRun.join('; ') + ').' : '.'),
      )
    }
  }

  // Settle the previous fix's test claims, if there was one. Found by the lane
  // name stamped above: parallel() ordering in the real loader is unproven,
  // indexing would settle a claim from whichever lane happened to land third,
  // and the name the model wrote is not evidence of which lane it was.
  const prevFix = fixes[fixes.length - 1]
  if (prevFix && !prevFix.testResults.verified) {
    const testsLane = mechanical.find((m) => m && m.lane === 'tests')
    if (!testsLane) {
      prevFix.testResults.verifiedBy = 'no mechanical lane reported itself as "tests" in ' + tag + ', so the previous fix\'s test claims stay unverified'
      log(tag + ': no lane identified itself as tests, so the previous fix\'s test claims stay unverified.')
    } else if ((testsLane.findings || []).length) {
      prevFix.testResults.verifiedBy =
        'the tests lane in ' + tag + ' reported ' + testsLane.findings.length + ' finding(s) over the fix, so the claims are contradicted rather than confirmed'
    } else {
      prevFix.testResults.verified = true
      prevFix.testResults.verifiedBy = 'the tests lane in ' + tag + ' ran ' + ((testsLane.ran || []).join(', ') || 'no named command') + ' over the fix range with no findings'
    }
  }

  const mechCount = mechanical.reduce((n, m) => n + (m.findings || []).length, 0)
  if (mechanical.length < LANES.length) {
    log(tag + ': ' + (LANES.length - mechanical.length) + ' of ' + LANES.length + ' mechanical lanes returned nothing.')
  }
  log(tag + ': mechanical pass found ' + mechCount + ' items across ' + mechanical.length + ' lanes.')

  phase(tag + ' verdict')
  // No model override: the reviewer body already pins opus at high effort, and
  // the contract forbids conditional model logic in a body. Effort is raised
  // here only, because escalation is the lead's decision, not the agent's.
  const verdictOpts = {
    agentType: REVIEWER,
    phase: tag + ' verdict',
    label: tag + ' verdict',
    schema: VERDICT_SCHEMA,
  }
  if (sensitive) verdictOpts.effort = 'max'

  const prevUnresolved = prevFix ? prevFix.unresolvedFindings || [] : []
  const review = await agent(
    [
      'Review the diff ' + reviewRange + '. This is ' + tag + '.',
      checkoutPath ? 'Read it in ' + checkoutPath + ', which is the checkout holding these commits.' : '',
      issue
        ? 'The change claims to implement board card ' + issue + '. Read its acceptance criteria first - the card is the file under .boards/tasks/ in the checkout you were started in whose front matter reads id: ' + issue + ' - and review the diff against them: a change reviewed against no stated intent has not been reviewed.'
        : 'No issue was named, so there is no card and no acceptance criteria to review against. Say so in your report and review against the code as it stands.',
      'The mechanical pass has already run, so the easy findings are taken. Spend your effort where only judgement helps.',
      'Mechanical findings already reported:\n' + JSON.stringify(mechanical, null, 2),
      sensitive
        ? 'This diff touches sensitive paths - ' +
          sensitiveFiles.join(', ') +
          ' - so spend your full budget on those files: authorisation on every path, secrets handling, session and token lifetime, and what an attacker gets from each one.'
        : 'No path in this diff looks security-sensitive, so review it as ordinary code.',
      prevFix
        ? 'This is a re-review of a fix. What the previous round asked for:\n' +
          JSON.stringify(prevFix.requested || [], null, 2) +
          '\nSay for each of those whether it is now fixed, still open, or fixed in a way that introduces something new. Git has already confirmed that a commit exists, is built on the reviewed code and touches the right files; what it cannot confirm, and what you are here for, is whether the change is the change that was asked for.'
        : '',
      prevUnresolved.length
        ? 'The fix commit did not touch these files at all, so treat them as unaddressed unless the code says otherwise:\n' +
          JSON.stringify(prevUnresolved, null, 2)
        : '',
      'Give a one-sentence verdict, then the findings that justify it, worst first, each naming a file and a line, what breaks, and why that matters.',
      'Mark a finding blocking only when it must be fixed before merge. A reviewer who calls everything blocking gets ignored.',
      'Mark a non-blocking finding low when it is local to this change and needs no decision - test hygiene, a misnamed test, a stale comment or message, an unconfirmed value. A Low finding is fixed in a fix run that happens anyway or dropped, and is never follow-up work; leave low unset on anything outside the change or needing a decision.',
      'Change nothing. Not a fix, not a test, not a note.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    verdictOpts,
  )

  rounds.push({ round, mechanical, gates, verdict: review })

  if (!review) {
    stopped = 'reviewer returned nothing'
    log(tag + ': the reviewer returned nothing. Stopping rather than treating silence as approval.')
    break
  }

  // Coerce at the boundary. The eval harness has never applied a schema, and a
  // truthy read of `blocking` would let the string "false" block a merge while
  // an unrecognised verdict passed for approval.
  if (!VERDICTS.includes(review.verdict)) {
    log(tag + ': verdict "' + review.verdict + '" is not one of the three, so it is read as "request changes".')
    review.verdict = 'request changes'
  }
  const blocking = (review.findings || []).filter(isBlocking)
  log(tag + ': ' + review.verdict + ', ' + blocking.length + ' blocking of ' + (review.findings || []).length + '.')

  if (!blocking.length) {
    // The tier is the lead's call. Under fix: true any round whose re-derived
    // `sensitive` is true refutes even when refute: false was passed, round 1
    // included, not only a round whose fix added a sensitive path. That spawns
    // an Opus refuter against the lead's call, so it is logged.
    if (!refute && !(autoFix && sensitive)) {
      stopped = 'clean'
      break
    }
    // The build phase narrows that: a refuter only on an authentication or
    // credential path. Reaching here without one means refute was on (fix:
    // true's default or refute: true), so the stop says the phase skipped it.
    if (buildPhase && !sensitive) {
      stopped = PHASE_SKIPPED
      refutationSkipped =
        'this round called for a refutation (' +
        (input.refute === true ? 'refute: true' : 'fix: true') +
        '), but the project is in the build phase (phase in ' +
        FLEET_CONFIG_PATH +
        '), which spawns a refuter only when the diff touches an authentication or credential path, and this one touches none, so none ran'
      log(tag + ': ' + refutationSkipped + '.')
      break
    }
    // A project that disabled the refuter gets none, whichever of the two
    // reasons above called for one, and the stop says it was skipped rather
    // than passing for a clean round that never needed one. Except a range
    // that changes the config file itself: a branch cannot switch off its own
    // refuter, so that round refutes as it would with no config.
    if (refuterDisabled && configInRange.length) {
      log(
        tag +
          ': the reviewed range changes ' +
          configInRange.join(', ') +
          ', so the project\'s disabled refuter is not honoured for this round and a refuter runs as it would with no config. A change to the switch cannot skip its own refutation.',
      )
    } else if (refuterDisabled) {
      stopped = REFUTATION_SKIPPED
      const why = refute ? (input.refute === true ? 'refute: true' : 'fix: true') : 'sensitive paths under fix: true'
      refutationSkipped =
        'this round called for a refutation (' +
        why +
        (sensitive ? (refute ? ', on sensitive paths: ' : ': ') + sensitiveFiles.join(', ') : '') +
        '), and the project disables the refuter in ' +
        FLEET_CONFIG_PATH +
        ', so none ran and nothing ran in its place'
      log(tag + ': ' + refutationSkipped + '.')
      break
    }
    if (!refute) {
      log(tag + ': refute: false was passed, but under fix: true this round touches sensitive paths, so a refuter runs anyway: ' + sensitiveFiles.join(', '))
    }

    // A clean verdict is the reviewer failing to find something. It is not the
    // same as somebody failing to break it, and only the second is evidence.
    phase(tag + ' refutation')
    const refutation = await agent(
      [
        'Try to break the change in ' + reviewRange + '. This is ' + tag + '.',
        checkoutPath ? 'It is in ' + checkoutPath + '.' : '',
        'The reviewer found nothing blocking. That is what you are here to disagree with.',
        'Copy what you need OUTSIDE this project, mutate it there, and run the suite against each mutation. Never mutate the tree under test.',
        'The round is at most eight mutants, most damaging first, and 20 minutes of wall-clock from your spawn, everything included. Name each mutation you did not reach under "## Not done".',
        'Report every mutation that no test noticed as its own bullet under "## Done", in the form "- survived: <the exact edit> - <the behaviour no test noticed>". Write no such bullet when nothing survived.',
        'A survivor is never a "- Blocker: " line. That line is only for a question only the human can answer before the work continues, written as the question.',
        'A mutation that makes the process exit non-zero is a kill, not a survival.',
        'Say what you could not attack, in the same detail as what you did.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      // No schema, for the same reason coder gets none: a schema would delete
      // this handoff too, and with it the survived: bullets this stage reads
      // and the refuter's only route to the human.
      { agentType: REFUTER, phase: tag + ' refutation', label: tag + ' refutation' },
    )

    if (typeof refutation !== 'string' || !refutation.trim()) {
      stopped = 'refutation returned nothing'
      log(tag + ': the refutation returned nothing. Stopping rather than treating silence as unbreakable.')
      break
    }

    const broke = readHandoff(refutation)
    const survivors = survivorsOf(broke)
    rounds[rounds.length - 1].refutation = { survivors, blockers: broke.blockers, said: broke.done }
    stopped = refutationStop(broke, survivors)
    if (stopped === 'refuter raised a blocker') {
      log(tag + ': the refuter raised ' + broke.blockers.length + ' blocker(s) and ' + survivors.length + ' survivor(s). The card is already on the human queue; this is not an approval.')
    } else if (stopped === 'refuted') {
      log(tag + ': ' + survivors.length + ' mutation(s) survived. A clean verdict over tests that would not notice is not clean.')
    } else {
      log(tag + ': the refuter confirmed no survivor.')
    }
    break
  }

  // The default path, unchanged: review, and hand the fix back. The build
  // phase takes it under fix: true too, so a run there is one round.
  if (!autoFix || buildPhase) {
    fixRequest = { range: reviewRange, card: issue, findings: blocking }
    rounds[rounds.length - 1].fixRequest = fixRequest
    stopped = 'fix handoff required'
    log(
      tag +
        ': ' +
        blocking.length +
        ' blocking finding(s). ' +
        (buildPhase
          ? 'The project is in the build phase, so this run commissions no fix round; the findings go back to the lead.'
          : 'Pass fix: true with an issue whose card carries acceptance criteria to have this workflow commission and verify the fix.'),
    )
    break
  }

  // A fix made in the final round could never be reviewed, and an unreviewed
  // commit reported as fixed is the silent wrong answer the coder-fleet repo refuses.
  if (round >= maxRounds) {
    stopped = 'round cap'
    fixRequest = { range: reviewRange, card: issue, findings: blocking }
    log(tag + ' is the last round the cap allows, so no fix is commissioned: it could not be reviewed. This is not an approval.')
    break
  }

  // The card gate. coder builds from the board card - the human's words, its
  // acceptance criteria and the decisions recorded on it - so no fix is
  // commissioned for an issue with no card, or a card with nothing on it to
  // build towards.
  phase(tag + ' fixes')
  if (!issue) {
    stopped = 'no issue named'
    fixRequest = { range: reviewRange, card: null, findings: blocking, cardEvidence: 'no issue was supplied, so there is no card to build the fix from' }
    log(tag + ': blocking findings, but no issue was named, so nothing is commissioned.')
    break
  }

  // No agentType: scout's allowlist has no board command, and this lane only
  // reads. Like the git lanes, it is skipped by the SubagentStop matcher, so
  // its schema costs no handoff. Run from the checkout the workflow started
  // in, because that is where the board is, not from a fix worktree.
  const cardGate = await agent(
    [
      'Report on a board card and change nothing. Run this one command exactly as written, from the checkout this workflow was started in rather than any fix worktree, and nothing else. It finds the plugin\'s board shim and runs it:',
      BOARD + ' task view ' + issue + ' --json',
      'boardRead is true when the command exits 0, or when it exits non-zero having printed exactly: no task ' + issue + ' - the board\'s own error for an id it does not have. Any other failure is boardRead false: exit 127, a missing shim or binary, no board here, or any other error.',
      'found is true only when the command exits 0 and prints the card, and false otherwise.',
      'criteriaCount is task.acceptanceCriteriaCount from that output, as a number.',
      'Quote the acceptanceCriteriaCount line as evidence, or the error the command printed, word for word. Do not judge whether the criteria are any good.',
    ].join('\n'),
    { model: 'sonnet', effort: 'low', phase: tag + ' fixes', label: 'card gate', schema: CARD_GATE_SCHEMA },
  )

  const cardStop = cardGateStop(cardGate, issue)
  if (cardStop) {
    stopped = cardStop
    fixRequest = {
      range: reviewRange,
      card: issue,
      findings: blocking,
      cardEvidence: (cardGate && cardGate.evidence) || 'the card gate returned nothing',
    }
    log(tag + ': card ' + issue + ' - ' + cardStop + ', so nothing is commissioned.')
    break
  }

  // The fix lane's worktree, cut before the coder exists (CF-127). A workflow
  // spawn gets no harness isolation, so without this the coder's only place to
  // work is the main checkout, and only its scope guard stands between it and
  // the shared branch. No worktree, no coder.
  const want = mainCheckout ? fixWorktreeFor(mainCheckout, issue, round) : null
  const cut = want
    ? await gitLane(
        'fix worktree',
        [
          'Make one git worktree for a fix run, and change nothing else.',
          'Run exactly this, once: git -C "' + mainCheckout + '" worktree add "' + want.path + '" -b "' + want.branch + '" ' + reviewedHead,
          'Never pass --force or -f, never use -B, and never reuse, delete, rename or reset anything. If the branch or the directory already exists, git refuses, and that refusal is the answer: report created false and the error git printed, word for word. Do not pick another name and do not retry.',
          'If it succeeded, report created true, then from git itself: path from git -C "' + want.path + '" rev-parse --show-toplevel, branch from git -C "' + want.path + '" symbolic-ref --short HEAD, head from git -C "' + want.path + '" rev-parse HEAD, and gitDir from git -C "' + want.path + '" rev-parse --absolute-git-dir.',
          'If it failed, report created false, path, branch, head and gitDir as empty strings, and the error.',
          'Put every command you ran in commandsRun and anything you could not run in couldNotRun. Do not review anything and do not offer an opinion.',
        ],
        FIX_WORKTREE_SCHEMA,
      )
    : null
  const cutStop = want
    ? worktreeLaneStop(cut, want, reviewedHead)
    : 'the pinned worktree list names no main checkout, so there is nowhere to cut the fix worktree under'
  if (cutStop) {
    stopped = 'fix worktree not created'
    fixRequest = { range: reviewRange, card: issue, findings: blocking, worktreeReason: cutStop, worktree: want }
    log(tag + ': ' + cutStop + '. No coder was spawned.')
    break
  }
  const fixWorktree = { round, path: want.path, branch: want.branch, base: reviewedHead }
  fixWorktrees.push(fixWorktree)
  log(tag + ': cut ' + want.path + ' on ' + want.branch + ' at ' + reviewedHead + ' for the fix run.')

  const low = (review.findings || []).filter(isLow)
  const handoffText = await commissionFixes({ tag, blocking, low, review, fixWorktree })

  if (typeof handoffText !== 'string' || !handoffText.trim()) {
    stopped = 'the fix run returned nothing'
    fixRequest = { range: reviewRange, card: issue, findings: blocking }
    log(tag + ': the fix run returned nothing, so there is no commit to look for. Stopping.')
    break
  }

  const said = readHandoff(handoffText)

  // Verify BEFORE deciding what to do about a blocker. If coder committed and
  // then raised a blocker, the human is being told they are needed; they must
  // also be told where the work is.
  const verify = await gitLane(
    'verify fix',
    [
      'Report on a git repository and change nothing. Read-only git only.',
      'A fix run has just finished. Find the commit it made, or report that you cannot tell.',
      'The reviewed commit is ' + reviewedHead + '.',
      'Before the fix run started, this workflow cut the worktree ' + fixWorktree.path + ' on branch ' + fixWorktree.branch + ' at that commit, and told the fix run to work only there. Report on it as you would any other candidate, with its branch from the worktree list; a commit anywhere else is not the fix, and you report it as found rather than choosing it.',
      'These worktrees existed before the run:\n' + JSON.stringify(worktreesBefore, null, 2),
      'Run git worktree list --porcelain now. A candidate is a worktree that is new, or whose HEAD has moved since that list, whose isMain is false, whose HEAD is not ' +
        reviewedHead +
        ', and for which git merge-base --is-ancestor ' +
        reviewedHead +
        ' <its head> exits 0.',
      'If the ONLY worktree whose HEAD moved is the main one, report headCommit as the empty string, isMain true, and say so in couldNotRun. A commit on the main checkout is on a shared branch and is not a fix this run may adopt.',
      'If there are no candidates, or more than one, report headCommit as the empty string and list what you found in candidates. Guessing which worktree holds the fix is worse than reporting that you cannot tell.',
      'For the chosen commit report: headCommit, its worktreePath and branch, dirty from whether git -C <path> status --porcelain is non-empty, containsReviewedHead from the merge-base test, forkPoint from git merge-base ' +
        reviewedHead +
        ' <head>, filesChanged from git diff --name-only ' +
        reviewedHead +
        '..<head>, and commits from git log --format=%s ' +
        reviewedHead +
        '..<head> oldest first.',
      'Always report the full current worktree list in `worktrees`, with isMain true for the first entry the porcelain output names.',
      'Put every command you ran in commandsRun and everything you could not run in couldNotRun.',
      // Kept for the day this lane has to move to scout, whose allowlist has
      // neither merge-base nor rev-parse: ancestry is also two emptiness
      // checks - git log <head>..<sha> non-empty and git log <sha>..<head>
      // empty means <sha> is a descendant of <head>.
    ],
    FIX_VERIFY_SCHEMA,
  )

  const record = {
    round,
    // The gate and the re-review read `requested` only, so a Low fix can never
    // stand in for a blocking one.
    requested: blocking,
    low,
    // git's answer only. Falling back to coder's claim here meant that when the
    // lane omitted the path, the location reported to the human was the very thing
    // this design refuses to trust - and claimMismatch stayed empty, because
    // there was nothing left to disagree with.
    worktreePath: (verify && verify.worktreePath) || '',
    baseCommit: reviewedHead,
    headCommit: (verify && verify.headCommit) || '',
    commits: (verify && verify.commits) || [],
    filesChanged: (verify && verify.filesChanged) || [],
    coderSaid: { done: said.done, notDone: said.notDone, unverified: said.unverified },
    testResults: {
      claimed: said.done.filter((d) => /\b(test|lint|build|suite)\b/i.test(d)),
      verified: false,
      verifiedBy: 'not yet - the next round re-runs lint, types and tests over the fix range',
    },
    unresolvedFindings: [],
    claimMismatch: [],
    proposals: said.proposals,
    accepted: false,
  }

  // coder's hints are a cross-check, never a source. Where git disagrees, git
  // wins and the disagreement is recorded rather than quietly dropped.
  for (const [key, claimed] of Object.entries(said.hints)) {
    if (!claimed) continue
    const actual = record[key]
    if (actual && String(actual) !== String(claimed) && !String(actual).startsWith(String(claimed))) {
      record.claimMismatch.push(key + ': coder said ' + claimed + ', git says ' + actual)
    }
  }
  if (record.claimMismatch.length) log(tag + ': coder\'s handoff disagrees with git - ' + record.claimMismatch.join('; ') + '. Git decides.')

  if (said.blockers.length) {
    // Recorded so the human is told where to look, but never as an accepted fix: the
    // gate has not run, and on this path it would often refuse. Marking it
    // accepted put a dirty non-descendant commit in the main checkout into the
    // history as `fixed: true`.
    record.accepted = false
    record.ungatedReason = gateFix(verify, blocking, reviewedHead) || offTheFixWorktree(verify, fixWorktree) || 'the run stopped on a blocker before the fix was gated'
    stopped = 'coder raised a blocker'
    fixRequest = {
      range: reviewRange,
      card: issue,
      findings: blocking,
      blockers: said.blockers,
      worktree: record.worktreePath,
      headCommit: record.headCommit,
    }
    fixes.push(record)
    log(tag + ': the fix run raised ' + said.blockers.length + ' blocker(s). The card is already on the human queue; this run records where the commits are.')
    break
  }

  const refusal = gateFix(verify, blocking, reviewedHead) || offTheFixWorktree(verify, fixWorktree)
  if (refusal) {
    stopped = refusal === NOT_ISOLATED || refusal === NOT_CONFIRMED_ISOLATED ? 'fix not isolated' : 'unverified fix'
    fixRequest = {
      range: reviewRange,
      card: issue,
      findings: blocking,
      unverifiedReason: refusal,
      coderSaid: record.coderSaid,
      worktree: record.worktreePath,
      headCommit: record.headCommit,
    }
    log(tag + ': ' + refusal + '. Not re-pointing the review at it.')
    break
  }

  record.unresolvedFindings = unresolvedFrom(verify, blocking, said)
  record.accepted = true
  fixes.push(record)

  // Accept: the review moves to the fix. fixRequest is not cleared here because
  // it cannot be set on this path - every branch that assigns it breaks out of
  // the loop immediately - and a line that clears an unreachable state reads
  // like it is guarding against something.
  reviewedHead = verify.headCommit
  reviewRange = reviewBase + '...' + reviewedHead
  checkoutPath = verify.worktreePath || checkoutPath
  worktreesBefore = verify.worktrees || worktreesBefore
  log(tag + ': fix verified at ' + reviewedHead + ' in ' + (checkoutPath || 'an unnamed checkout') + '. Round ' + (round + 1) + ' reviews that commit.')
  round += 1
}

// The fix prompt. Reachable now, and deliberately carries NO schema: a schema
// would delete coder's handoff, and with it the format gate, the card comment
// and the only working route to the human queue.
async function commissionFixes({ tag, blocking, low, review, fixWorktree }) {
  const wt = fixWorktree.path
  return await agent(
    [
      'Fix the blocking findings from ' + tag + ' of the review of ' + reviewRange + (low.length ? ', and the Low findings listed below them' : '') + '. Fix these and nothing else.',
      'This is the work on card ' + issue + '. Its acceptance criteria are what the change is for: fix the findings towards them and widen nothing.',
      'Your worktree is ' + wt + ', on branch ' + fixWorktree.branch + ', already checked out at the reviewed commit ' + reviewedHead + '. This workflow cut it for you before you started, because a workflow spawn gets no worktree from the harness: the directory you were started in is probably the main checkout, and you do no work there. Work only in ' + wt + ' and nowhere else: pass git -C "' + wt + '" on every git command, open every command that is not git with cd "' + wt + '" &&, and read and edit files only by absolute paths under ' + wt + '. Do not create, switch or delete a branch or a worktree.',
      'FIRST, before any command that writes anything, run: git -C "' + wt + '" rev-parse --absolute-git-dir',
      'If its output does not contain "/worktrees/", that directory is not a linked worktree. Run no writing git command at all - no switch, no branch, no commit - change nothing, and end with a "- Blocker: " line that names the directory, quotes what that command printed, and asks the human, as a question ending in "?", how this fix run should be set up. Committing to a shared working branch is out of scope for you, and this is the check that tells you which one you are in.',
      'Then check git -C "' + wt + '" symbolic-ref --short HEAD prints ' + fixWorktree.branch + ' and git -C "' + wt + '" merge-base --is-ancestor ' + reviewedHead + ' HEAD exits 0. If either fails, the worktree is not the one this workflow cut. Change nothing, and end with a "- Blocker: " line that names the worktree path, quotes what git printed, and asks the human, as a question ending in "?", how this fix run should be set up. Do not rebase, merge or reset to fix it yourself.',
      'Blocking findings:\n' + JSON.stringify(blocking, null, 2),
      low.length
        ? 'Low findings - fix these in this run too, since you are in this code anyway. Fix only what each one names; they widen nothing else:\n' +
          JSON.stringify(low, null, 2)
        : '',
      'Non-blocking findings, for context only - do not fix them, they are follow-up work:\n' +
        JSON.stringify((review.findings || []).filter(isFollowUp), null, 2),
      'A failing test first where the finding is a defect, then the smallest change that passes it. Commit small.',
      'If a finding is wrong, say so and leave the code alone rather than changing it to satisfy the review. Record that as a "## Not done" bullet reading "rejected as wrong: <file> - <why>", so the next reviewer sees a decision rather than an omission. The other two spellings are "not attempted: <file> - <why>" and "attempted and failed: <file> - <why>".',
      'Run the tests, the lint and the build before you finish, and record every command you could not run.',
      'In your "## Done" section include three bullets exactly in this shape, so the verification can be cross-checked against what you believe you did: "- worktree: <absolute path>", "- base-commit: <sha you branched from>", "- head-commit: <sha of your last commit>", plus a fourth saying what the git rev-parse --absolute-git-dir check above printed.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    { agentType: CODER, phase: tag + ' fixes', label: tag + ' fixes' },
  )
}

const last = rounds[rounds.length - 1] || {}
const lastVerdict = last.verdict || {}
const stillBlocking = (lastVerdict.findings || []).filter(isBlocking)
const lastLow = (lastVerdict.findings || []).filter(isLow)
const lastFix = fixes[fixes.length - 1] || null
const lastGates = last.gates || GATE_LANES.map((name) => ({ lane: name, ran: null, findings: [], couldNotRun: [] }))
const gatesMissing = lastGates.filter(gateMissing).map((g) => g.lane)
// A clean verdict with no refuter is an approval only when both gate lanes
// ran something: otherwise nobody independent ran the gates, and the next step
// says so before anything else, naming the lanes the lead has to run itself.
// A refutation the project's config skipped ends the round the way a clean one
// does: no refuter ran, so the gate lanes are the round's gate run, exactly as
// for a change the lead never tiered a refuter for. So does one the build
// phase skipped.
const cleanStop = stopped === 'clean' || stopped === REFUTATION_SKIPPED || stopped === PHASE_SKIPPED
const gatesUnrun = cleanStop && !last.refutation && gatesMissing.length > 0
const approved = cleanStop && /^approve/i.test(lastVerdict.verdict || '') && !gatesUnrun
const GATES_NOTE = gatesUnrun
  ? 'Not an approval: the ' + gatesMissing.join(' and ') + ' gate lane(s) ran nothing, so no independent gate run exists. Run those gates yourself in the checkout before calling the review complete. '
  : ''
// Every worktree a fix lane cut stays where it is whatever the stop, and the
// lead decides what happens to it: prune-worktrees removes only merged, clean
// ones, so an unmerged fix worktree is never cleared up behind anyone's back.
const WORKTREE_NOTE = fixWorktrees.length
  ? ' This run cut ' +
    fixWorktrees.length +
    ' fix worktree(s) and left them for you to adopt or prune: ' +
    fixWorktrees.map((w) => w.path + ' on ' + w.branch).join('; ') +
    '. /coder-fleet:prune-worktrees removes only merged, clean worktrees, so one that is not merged stays until you deal with it.'
  : ''

// Every Low finding of the last verdict lands in exactly one of low and
// dropped. Whether a fix run follows is read from how the run stopped, never
// from the last verdict: that can be a round stale, when a round stops before
// it reviews and its Low findings already rode an accepted fix. One follows
// when a fix was handed to the lead (fixRequest), or on a refuted stop, whose
// next step commissions a test fix. A refuter Blocker commissions nothing
// until the human answers, survivors or not. In the build phase no Low
// finding is fixed, whatever follows: every one is reported under dropped.
const fixFollows = !buildPhase && (fixRequest !== null || stopped === 'refuted')
const low = fixFollows ? lastLow : []
const dropped = fixFollows ? [] : lastLow
const LOW_NOTE = low.length
  ? ' The ' + low.length + ' Low finding(s) under low go in the brief of the fix run that follows, fixed only as each one names; they widen nothing and start no round of their own.'
  : ''
const BUILD_NOTE = buildPhase
  ? ' This run was in the build phase (phase in ' +
    FLEET_CONFIG_PATH +
    ', build when unset): one round, no fix round commissioned here, Low findings reported under dropped and not fixed, a refuter only on authentication or credential paths, and follow-ups and proposals reported here, not filed as cards. /coder-fleet:agents phase harden switches the project to the full loop.'
  : ''

// Every stop reason gets its own next step. A run that falls through to a
// generic line is a run that tells the human nothing they did not already know.
const CLEAN_STEP =
  'No blocking findings. Read the unverified checks and the follow-ups above before deciding whether to merge: they are the reviewer\'s own words, not merge blockers, ' +
  (buildPhase
    ? 'and in the build phase they and anything under proposals are reported here and not filed as cards.'
    : 'and it is the lead\'s job to decide which become items.') +
  ' The Low findings under dropped were dropped, not filed: no fix run followed them, and none is started for them alone. Anything coder proposed is under proposals.' +
  (fixes.length
    ? ' ' +
      fixes.length +
      ' fix round(s) ran and nothing was merged: the work is at ' +
      (lastFix && lastFix.headCommit) +
      ' in ' +
      ((lastFix && lastFix.worktreePath) || 'the fix worktree') +
      '. Integrating it is yours.'
    : '')
const NEXT_STEP = {
  clean: CLEAN_STEP,
  [REFUTATION_SKIPPED]:
    'No refuter ran: this round called for a refutation, and the project disables the refuter in ' +
    FLEET_CONFIG_PATH +
    ', so it was skipped and nothing was run in its place. No substitute gate run is owed - the project chose to go without one - and the tests and types-and-build lanes under gates are this round\'s gate run, as for any change no refuter covers. ' +
    CLEAN_STEP,
  [PHASE_SKIPPED]:
    'No refuter ran: this round called for a refutation, but the project is in the build phase, which spawns a refuter only when the diff touches an authentication or credential path, and this one touches none. The tests and types-and-build lanes under gates are this round\'s gate run, as for any change no refuter covers. ' +
    CLEAN_STEP,
  'fix handoff required': buildPhase
    ? 'The project is in the build phase, so this run reviewed one round and commissioned no fix round, fix: true or not. The blocking findings are in fixRequest: they are the one fix round the lead runs, with coder from the reviewed commit and the card as its brief. The Low findings are under dropped and are not part of it.'
    : 'Check the card carries acceptance criteria, resolve the reviewed head to a commit, and run coder from that commit with the card as its brief. Record the resulting worktree path and commit, check the commit actually contains the requested changes, then run this workflow again against that commit in that checkout. A coder saying it committed the fixes is not a review target, and merging just to make another review possible is not an option. Passing fix: true with the issue does all of that here, provided its card carries acceptance criteria.',
  'round cap':
    'The cap of ' +
    maxRounds +
    ' rounds is reached and blocking findings remain. This is not an approval. Read the findings and decide whether the change needs a different approach rather than another round.',
  'no issue named':
    'Blocking findings need a fix run, and coder builds from a board card, but no issue was named. Run this again with the issue and fix: true.',
  'no card':
    'Blocking findings need a fix run, and coder builds from a board card, but the board has no card ' +
    issue +
    '. File it, or run this again with the id of the card this work belongs to.',
  'no acceptance criteria':
    'The card ' + issue + ' has no acceptance criteria - add them, then run again with fix: true.',
  'could not read the board':
    'The card gate could not read the board, so whether card ' +
    issue +
    ' exists is unknown - which is not the same as there being none. Nothing was commissioned. Check the board binary is built and on this machine - /coder-fleet:kickoff checks it - then run this again. Never file a new card for ' +
    issue +
    ' on the strength of this run: it may well exist.',
  'card gate returned nothing':
    'The card gate returned nothing, so whether card ' + issue + ' exists and carries acceptance criteria is unknown. Nothing was commissioned. Run this again.',
  'fix worktree not created':
    'The fix lane could not cut its own worktree, so no coder was spawned and nothing was committed. Why is in fixRequest.worktreeReason. A workflow-spawned coder gets no worktree from the harness, so this run never starts one without the worktree it cut. ' +
    (fixRequest && fixRequest.worktree
      ? 'If ' + fixRequest.worktree.branch + ' or ' + fixRequest.worktree.path + ' already exists, an earlier run left it: adopt the work on it, or prune it (git worktree remove, then git branch -d), then run this again. This run never picks another name, because the old branch may hold a fix nobody has read.'
      : 'The pin lane named no main checkout to cut it under; check git worktree list in this repository, then run this again.'),
  'the fix run returned nothing':
    'The fix run produced no handoff, so nothing is known about what it did or where. Check whether a worktree was left behind before running it again; do not assume the work did not happen.',
  'coder raised a blocker':
    'The fix run stopped on a decision only you can make. The card is on the human queue with the blocker text; the commits, if any, are recorded above with their worktree. Answer the blocker, then run this again against that commit.',
  'unverified fix':
    'A fix run happened but git could not vouch for the result, so the review was not re-pointed at it. The reason is in fixRequest.unverifiedReason and what coder said is beside it. Look at the worktree yourself before running another round.',
  'fix not isolated':
    'The fix landed in the main checkout rather than an isolated worktree, which means it is on a shared working branch. Nothing was adopted and nothing was re-reviewed. Check what moved in your own checkout before doing anything else, and see hooks/README.md on worktree isolation.',
  'reviewer returned nothing':
    'The reviewer returned nothing, which is not an approval. Run the round again; if it keeps happening, the diff may be too large for one verdict.',
  'nothing to review': 'The scope pass found no changed files in ' + rawRange + '.',
  'the fix range is empty':
    'A fix was verified but the range from the reviewed commit to it is empty, which should not happen. Look at the worktree directly.',
  'scope pass returned nothing':
    'The scope pass returned nothing, so what changed is unknown and nothing was reviewed. This is not an empty diff and not an approval - run it again.',
  refuted:
    'The reviewer found nothing and the refuter did. Every surviving mutation above is a behaviour no test would notice changing, so the code may well be right and the tests are not evidence that it is. Fix the tests, then run this again.',
  'refuter raised a blocker':
    'The refuter stopped on a question only you can answer, and the card is on the human queue with it. Any mutation it saw survive is under refutation.survivors. Answer the question, then run this again against the same commit. This is not an approval.',
  'refutation returned nothing':
    'The refutation produced no handoff, so nothing is known about whether the change survives being attacked. This is not an approval. Run it again.',
}

return {
  range: rawRange,
  target,
  reviewedRange: reviewRange,
  pinned: { base: reviewBase, head: reviewedHead },
  issue,
  card: issue,
  autoFix,
  sensitive,
  sensitiveFiles,
  roundsRun: rounds.length,
  stopped,
  // A run that ends with no blocking findings but a verdict nobody recognised -
  // coerced to "request changes" above - is not an approval, and reporting one
  // beside the other made the return contradict itself. Nor is a round with
  // no refuter and a gate lane missing: those lanes were its only gate run.
  approved,
  verdict: lastVerdict.verdict || (stopped === 'nothing to review' ? 'nothing to review' : 'no verdict'),
  summary: lastVerdict.summary || '',
  blocking: stillBlocking,
  // Neither blocking nor Low. A Low finding is never follow-up work.
  followUps: (lastVerdict.findings || []).filter(isFollowUp),
  // Every Low finding of the last verdict is in exactly one of these two.
  low,
  dropped,
  unverified: (lastVerdict.unverified || []).concat(
    fixes
      .filter((f) => !f.testResults.verified)
      .map((f) =>
        'Round ' +
        f.round +
        ' fix: ' +
        (cleanStop
          ? f.testResults.verifiedBy
          : 'its test claims were never settled, because the run stopped at "' + stopped + '" and no later round re-ran them'),
      ),
  ),
  // coder's own Propose lines. Parsed and carried rather than dropped: it
  // cannot file them itself, and nothing downstream sees its handoff except
  // the card comment.
  proposals: fixes.flatMap((f) => f.proposals || []),
  // Non-null only when the loop declined to fix, or could not.
  fixRequest,
  fixes,
  // From what was carried, not from the stop: a refuter Blocker outranks
  // survivors for the stop reason, and the survivors are still real.
  refuted: ((last.refutation || {}).survivors || []).length > 0,
  refutation: (last.refutation || null),
  // CF-111. Non-null only when a round called for a refutation and the
  // project's config disabled the refuter; stopped then reads
  // 'refutation skipped by config'. Or, CF-145, when the build phase skipped
  // it on a diff with no authentication or credential path; stopped then
  // reads 'refutation skipped by build phase'. fleetConfig says what the pin lane found
  // (state absent, ok, invalid, unreadable or unread) and disabledAgents what was honoured.
  refutationSkipped,
  fleetConfig: {
    path: fleetConfig.path,
    state: fleetConfig.state,
    reason: fleetConfig.reason,
    phase: fleetConfig.phase,
    phaseState: fleetConfig.phaseState,
    phaseReason: fleetConfig.phaseReason,
  },
  disabledAgents: fleetConfig.disabledAgents,
  // CF-145. The phase this run worked in: build unless the main checkout's
  // file says harden.
  phase: fleetConfig.phase,
  // The last round's gate lanes, each { lane, ran, findings, couldNotRun }. ran
  // is null for a lane that returned nothing or whose ran was not a list, a
  // lane is missing when ran is empty or null, and every lane is missing when
  // no round got as far as the mechanical pass. The tests lane may have run a subset, so read ran before
  // calling the gates run.
  gates: lastGates,
  gatesMissing,
  checkout: checkoutPath,
  history: rounds.map((r) => ({
    round: r.round,
    mechanical: (r.mechanical || []).reduce((n, m) => n + (m.findings || []).length, 0),
    verdict: (r.verdict || {}).verdict || 'none',
    blocking: ((r.verdict || {}).findings || []).filter(isBlocking).length,
    fixed: fixes.some((f) => f.round === r.round && f.accepted === true && SHA_RE.test(f.headCommit)),
  })),
  // CF-127. Each { round, path, branch, base } a fix lane cut, left in place.
  fixWorktrees,
  nextStep: GATES_NOTE + (NEXT_STEP[stopped] || 'The review is incomplete. Read the stop reason above and resolve it; this run is not an approval.') + WORKTREE_NOTE + LOW_NOTE + BUILD_NOTE,
}

/**
 * Per-agent scope enforcement: the decision, and the parsers it needs.
 *
 * WHY THIS IS NOT IN .opencode/plugin/. Every export of an auto-discovered
 * plugin module must be a function. `getLegacyPlugins`
 * (packages/opencode/src/plugin/index.ts:99-111) walks `Object.values(mod)` and
 * throws `Plugin export is not a function` on the first one that is not, and
 * the throw fails the WHOLE module - so exporting a rule table beside the
 * plugin does not merely fail to register that export, it takes the preload
 * transform down with it. Observed: adding `export const AGENT_RULES` to
 * fleet.ts stopped the plugin loading at all, logged once at ERROR and visible
 * only under --print-logs. Discovery globs `{plugin,plugins}/*.{ts,js}`
 * (packages/opencode/src/config/plugin.ts:21), so a sibling directory is not
 * scanned and this file is free to export whatever it likes.
 *
 * Everything here is pure, which is the other half of why it is a separate
 * file: the denial text is the product, and it is testable without a session,
 * a model or a network. See test/invariants/scope.test.ts.
 */

/* WHAT THIS IS FOR, AND WHY IT IS NOT A REWRITE OF THE FLEET'S HOOK.
 *
 * The fleet enforces per-agent scope in `hooks/enforce-agent-scope.sh`, 1200
 * lines of shell. Most of that file has no counterpart here because OpenCode
 * already does the same work declaratively, and does it better:
 *
 * - The shell tool parses the command into an AST and evaluates EVERY command
 *   node separately (packages/opencode/src/tool/shell.ts:391-410). It adds the
 *   node's own source text and an arity-normalised prefix from
 *   permission/arity.ts, so `git push --force` produces both `git push --force`
 *   and `git push *`. Every node must evaluate to allow. A per-agent git verb
 *   ban is therefore config rather than code, and the fleet's segment splitter,
 *   its leading-token parser and its scan bounds are all upstream's problem now.
 * - `read` and `edit` are asked with the file's worktree-relative path as the
 *   pattern (read.ts:256, edit.ts:103), so a path-scoped write rule is config
 *   too.
 * - A tool denied with `pattern: "*"` is stripped from the payload entirely
 *   (permission/index.ts:204-214), which is a stronger lock than refusing the
 *   call and costs no context.
 *
 * WHAT IS LEFT is what the AST cannot see into, and it is two shapes.
 *
 * The first is an interpreter payload. `bash -c "git push --force"` parses as
 * ONE command node whose inner string is never parsed, so every rule above
 * matches `bash` and nothing matches `git push`. Same for `sh -c`, `zsh -c`,
 * `dash -c`, `ksh -c` and `eval`. `recoverInterpreterPayloads` pulls the
 * payload out and it is then scanned exactly as a bare command would be.
 *
 * The second is a wrapper. `env git push --force` is one node whose arity
 * prefix is `env` (arity.ts lists `env: 1`), so `git push *` never matches it.
 * `commandWords` walks off the leading assignments and wrappers - `env`,
 * `xargs`, `nice`, `timeout`, `command`, `nohup`, `stdbuf` - the way a shell
 * does, so the token a rule sees is the command that will actually run.
 *
 * Everything else here is carried across from the fleet's hook because its
 * header comments record what it cost to learn, and re-deriving it would be
 * paying twice:
 *
 * - Quoting a word does not change which command runs. `""git`, `g""it` and
 *   `"git"` are all the word `git`, and `b""ash` is `bash`. The fleet's header
 *   records that those two characters retired four separate checks at once.
 *   `stripInertQuotes` takes INERT quotes off - a span whose content could be a
 *   command name or a plain path - and leaves load-bearing ones alone, because
 *   `grep -R '=>' src` and `git commit -m "a message"` depend on the quotes
 *   still being there when `stripQuoted` erases the span.
 * - A backslash quotes the next character and disappears, so `\git` is `git`.
 * - Recovery repeats over what the previous pass found, because
 *   `bash -c "sh -c 'git push --force'"` nests. What bounds the depth is
 *   escaping, not the pass count: a payload is appended as written, so a quote
 *   still carrying its backslash is invisible to the next pass. Caught to any
 *   depth when the innermost payload is single-quoted; not caught when reaching
 *   it would mean unescaping a layer first. The fleet took that trade
 *   deliberately and this takes the same one.
 *
 * KNOWN AND DELIBERATELY UNCOVERED, the same list the fleet's hook carries:
 * a payload built from a variable (`bash -c "$VAR"`), a heredoc, a flag cluster
 * that is not the interpreter's first argument, and any expansion at all. This
 * is a role reminder, not a containment boundary. The fleet had a sandbox
 * underneath it; the port has none, and that is a register row rather than a
 * sentence hidden here.
 */

/** The interpreters whose `-c` argument is a script the AST never parses. */
const INTERPRETERS = ["bash", "sh", "zsh", "dash", "ksh"]

/**
 * Commands that run the command that follows them. A rule must see past these
 * or `env git push --force` is a `git push --force` nobody checked.
 */
const COMMAND_WRAPPERS = [
  "env",
  "xargs",
  "nice",
  "timeout",
  "command",
  "nohup",
  "stdbuf",
  "setsid",
  "time",
  "sudo",
  "doas",
]

/**
 * Take the quotes off a span that could only ever be a command name or a plain
 * path, and leave every other span quoted. The backslash-escaped forms go in
 * the same pass because that is the shape a payload arrives in: the recovery
 * below appends the payload exactly as written, backslashes intact.
 *
 * A lone escaped quote is hidden behind a placeholder first, or the plain rules
 * pair it with the real quote that follows and eat the payload's terminator.
 * An ODD number of quotes is left alone: a real shell refuses to run an
 * unterminated command, so denying it would add a case nothing can reach.
 */
export function stripInertQuotes(text: string): string {
  // Two control bytes, written as escapes so nothing between here and disk
  // can eat them. A command that already contains one has it handed back
  // escaped, which is not a way through: the shell has no meaning for those
  // bytes either, so a word holding one names a command that does not exist
  // whichever of the two ways this reads it.
  const INERT_DQ = "\u0001"
  const INERT_SQ = "\u0002"
  return text
    .replace(/\\"([A-Za-z0-9_./-]*)\\"/g, "$1")
    .replace(/\\'([A-Za-z0-9_./-]*)\\'/g, "$1")
    .split('\\"')
    .join(INERT_DQ)
    .split("\\'")
    .join(INERT_SQ)
    .replace(/"([A-Za-z0-9_./-]*)"/g, "$1")
    .replace(/'([A-Za-z0-9_./-]*)'/g, "$1")
    .split(INERT_DQ)
    .join('\\"')
    .split(INERT_SQ)
    .join("\\'")
}

/**
 * Erase quoted spans so a redirection character inside a search pattern -
 * `grep -R '=>' src` - is not read as a redirection. Use for redirection and
 * process substitution only: those are inert inside either kind of quote.
 */
export function stripQuoted(text: string): string {
  return text.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
}

/**
 * Erase single-quoted spans only. The shell expands `$( )` and backticks inside
 * double quotes, so a fully stripped string answers the wrong question about a
 * command substitution and waves every double-quoted one through.
 */
export function stripSingleQuoted(text: string): string {
  return text.replace(/'[^']*'/g, "''")
}

/** A backslash quotes the next character and disappears; before whitespace it
 * joins the words either side, so that one becomes a placeholder rather than a
 * split. `\git` is the command `git`. */
export function unescapeWords(text: string): string {
  return text.replace(/\\(\s)/g, "_").replace(/\\(.)/g, "$1")
}

/**
 * Split on the shell's operators and on newlines.
 *
 * The two lookarounds keep a redirection operator in one piece. A bare `&`
 * backgrounds and a bare `|` pipes, but `&>` and `>|` are single redirection
 * operators and `2>&1` is one fd duplication - splitting inside any of them
 * leaves a fragment whose leading token is `>` and, worse, leaves `ls x 2>`
 * looking like a redirection whose target could not be read. That reads as a
 * write and denies honest work.
 */
export function splitSegments(text: string): string[] {
  return text
    .split(/\|\||&&|;|(?<![>])\|(?!\|)|(?<![>])&(?!>)|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * The segment with leading syntax, assignments and wrappers removed, so both
 * `leadingToken` and `subVerb` start from the same word. The fleet's hook
 * records what it cost when they disagreed: `NODE_ENV=production npm install`
 * walked past an install ban because one parser stripped the assignment and the
 * other dropped position one, which WAS the assignment.
 */
export function commandWords(segment: string): string {
  let s = segment.trim().replace(/^[({]\s*/, "")
  let afterWrapper = false
  for (;;) {
    const first = s.split(/\s+/)[0] ?? ""
    if (!first) break
    if (first.includes("=") && /^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) {
      // a leading assignment, transparent to the shell
    } else if (first.startsWith("-")) {
      // A wrapper's own options belong to the wrapper, so `env -i git push` is
      // still the git command. Only consumed straight after a wrapper.
      if (!afterWrapper) break
    } else if (/^[0-9]+(\.[0-9]+)?[smhd]?$/.test(first)) {
      // `timeout 5 git push` - the duration belongs to the wrapper. `env 7z x`
      // keeps its command word, because `7z` is not a duration.
      if (!afterWrapper) break
    } else if (COMMAND_WRAPPERS.includes(first.replace(/^.*\//, ""))) {
      afterWrapper = true
    } else break
    const next = s.replace(/^\S+\s+/, "")
    if (next === s) return ""
    s = next
  }
  return s
}

/** The command a segment would actually run, unescaped and reduced to its
 * basename the way the shell resolves a name. */
export function leadingToken(segment: string): string {
  const tok = unescapeWords(commandWords(segment).split(/\s+/)[0] ?? "")
  return tok.replace(/^.*\//, "")
}

/**
 * The subcommand a segment would run: the first word after the command word
 * that is neither an option nor an option's value.
 *
 * The command word is dropped BY POSITION, because the shell's first word is
 * the command whatever it is called. `awk '{print $2}'` reads `-C` as the verb
 * of `git -C /path push`, which against a denylist ALLOWS a banned verb - the
 * fleet fixed exactly that.
 */
export function subVerb(segment: string): string {
  const words = unescapeWords(commandWords(segment)).split(/\s+/).filter(Boolean)
  let skipNext = false
  for (const tok of words.slice(1)) {
    if (skipNext) {
      skipNext = false
      continue
    }
    // git's global options that take a SEPARATE value. `--exec-path` does not:
    // listing it made it swallow the verb that followed.
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--attr-source", "--config-env"].includes(tok)) {
      skipNext = true
      continue
    }
    if (tok.startsWith("-")) continue
    return tok
  }
  return ""
}

const PAYLOAD = String.raw`('[^']*'|"([^"\\]|\\.)*"|[^\s'"]+)`
const INTERPRETER_RE = new RegExp(
  String.raw`(^|[^A-Za-z0-9_.-])(?:${INTERPRETERS.join("|")})\s+-[A-Za-z]*c\s+${PAYLOAD}`,
  "g",
)
const EVAL_RE = new RegExp(String.raw`(^|[^A-Za-z0-9_.-])eval\s+${PAYLOAD}`, "g")

function unquotePayload(raw: string): string {
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1)
  }
  return raw
}

function recoverOnce(text: string): string[] {
  const out: string[] = []
  for (const re of [INTERPRETER_RE, EVAL_RE]) {
    re.lastIndex = 0
    for (const m of text.matchAll(re)) {
      const payload = unquotePayload(m[2] ?? "")
      // A payload with no word character in it is punctuation the pattern
      // caught on its way past - a stray backslash between two escaped quotes,
      // most often. Scanning it would produce a leading token like `\` that
      // matches no allowlist, which is a denial with no command behind it.
      if (payload && /[A-Za-z0-9]/.test(payload)) out.push(payload)
    }
  }
  return out
}

/**
 * Every interpreter payload in a command, and every payload inside those, to a
 * small fixed number of passes. The cap bounds the work; what bounds the DEPTH
 * is escaping, as the header above says. The boundary class accepts `/`, so a
 * path-qualified interpreter (`/bin/bash -c`) is recognised on its basename,
 * and the flag is matched as a cluster ending in `c` because `-lc`, `-ec` and
 * `-xc` are all "-c plus something else".
 */
export function recoverInterpreterPayloads(command: string): string[] {
  const all: string[] = []
  let found = recoverOnce(command)
  let pass = 0
  while (found.length && pass < 3) {
    all.push(...found)
    found = found.flatMap((p) => recoverOnce(p))
    pass++
  }
  all.push(...found)
  return all
}

/**
 * THE REDIRECTION GATE, and the most important function in this file.
 *
 * The declarative allowlist does NOT stop a write, and every reading of it that
 * says otherwise is wrong. `source()` at
 * packages/opencode/src/tool/shell.ts:119 climbs to the `redirected_statement`
 * parent, so the redirect text IS in the pattern the matcher sees - and it does
 * not help, because `Wildcard.match` compiles `cat *` to `^cat( .*)?$` with the
 * `s` flag and that matches the whole redirected statement, newlines included.
 * Observed true, every one of them, against the allow rule beside it:
 *
 *     "cat CLAUDE.md > pwned.txt"          vs  cat *
 *     "cat > pwned.txt <<'EOF'\nhi\nEOF"   vs  cat *
 *     "tail -n1 a.md > pwned.txt"          vs  tail *
 *     "grep -r x . > pwned.txt"            vs  grep *
 *
 * And `parts()` at shell.ts:98 skips `redirection` children, so the target
 * never reaches `pathArgs` and never raises an `external_directory` ask either.
 * Phase 3 watched `echo hello > file` get denied and concluded redirection was
 * caught; `echo` had failed the allowlist. Substitute `cat` and the write lands.
 *
 * So the boundary cannot be "is this binary on the list". It has to be "does
 * this node write", and this function is that question for the whole fleet.
 *
 * Returns one entry per redirection that creates or truncates a file. An entry
 * is the empty string when the operator is there and the target could not be
 * read, which is treated as a write with an unknown target rather than as no
 * write at all: a redirection this cannot parse is exactly the case a guard
 * must not wave through.
 *
 * Skipped: a file descriptor duplication (`2>&1`, `>&2`, `1>&-`), which moves a
 * descriptor rather than naming a file.
 */
const REDIRECT_RE = /(?:[0-9]+|&)?>{1,2}\|?[ \t]*(&?[^\s;|&<>()]*)/g

export function redirectTargets(segment: string): string[] {
  const out: string[] = []
  for (const m of stripQuoted(segment).matchAll(REDIRECT_RE)) {
    const target = m[1] ?? ""
    // `&1`, `&2`, `&-` duplicate or close a descriptor.
    if (target.startsWith("&")) continue
    out.push(target)
  }
  return out
}

/**
 * Quote-aware words. Everything else in this file reads a command with the
 * quoted spans already erased, which is right for redirections and wrong for
 * anything whose payload IS the quoted span - a sed script, most of all.
 */
export function quotedWords(text: string): string[] {
  return text.match(/'[^']*'|"(?:[^"\\]|\\.)*"|[^\s]+/g) ?? []
}

const SED_OPERATORS = new Set([";", "|", "||", "&&", "&", "\n"])

/**
 * Every `sed` invocation in a command, as `{ scripts, inPlace }`.
 *
 * `-n` is not read-only, which is the whole reason this exists. `sed -n 'w
 * /tmp/pwned.txt' file` writes a file with no redirection character anywhere in
 * it, and an author writing `"sed -n *": allow` never thinks of it. Neither
 * does `sed -n -i.bak 's/a/b/' file`, which edits in place while looking like a
 * read.
 *
 * Read from quote-aware words rather than from a stripped segment, because the
 * script is nearly always quoted and stripping it erases exactly the thing
 * being inspected. Scanning the whole command for a standalone `w` instead -
 * which is what the fleet's hook does - denies `grep w file | sed -n p`, a
 * denial with no write behind it.
 */
export function sedInvocations(text: string): { scripts: string[]; inPlace: boolean }[] {
  const words = quotedWords(text)
  const out: { scripts: string[]; inPlace: boolean }[] = []
  for (let i = 0; i < words.length; i++) {
    if (unescapeWords(words[i]!).replace(/^.*\//, "") !== "sed") continue
    const found: { scripts: string[]; inPlace: boolean } = { scripts: [], inPlace: false }
    let takeNext = false
    let sawScript = false
    for (let j = i + 1; j < words.length; j++) {
      const tok = words[j]!
      if (SED_OPERATORS.has(tok)) break
      if (takeNext) {
        found.scripts.push(unquotePayload(tok))
        takeNext = false
        continue
      }
      if (["-e", "--expression", "-f", "--file"].includes(tok)) {
        takeNext = true
        continue
      }
      // `-i`, `--in-place`, `-i.bak`, and the clustered `-ni` GNU sed accepts.
      // Matched ANYWHERE in the argv rather than only as the first flag.
      if (tok === "--in-place" || tok.startsWith("--in-place=")) found.inPlace = true
      else if (/^-[A-Za-z]*i/.test(tok)) found.inPlace = true
      if (tok.startsWith("-")) continue
      if (!sawScript) {
        found.scripts.push(unquotePayload(tok))
        sawScript = true
      }
    }
    out.push(found)
  }
  return out
}

/**
 * The credential surface, ported from the fleet's session-wide deny list in
 * `home/settings.json` rather than invented here. In the fleet this was one of
 * two locks and the sandbox was the other; here it is the only one.
 *
 * Deliberately fleet-wide rather than `coder`-only. The register enumerates the
 * row against `coder` because that is the agent most likely to reach for one,
 * but narrowing a credential lock to one agent would make it weaker than the
 * thing it is ported from, and the fleet denied these to every agent in the
 * session.
 */
export const CREDENTIAL_PATTERNS: RegExp[] = [
  /(^|\/)\.ssh(\/|$)/,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /(^|\/)\.aws(\/|$)/,
  /(^|\/)\.env($|\.)/,
  /(^|\/)\.vault-token$/,
  /(^|\/)\.vault(\/|$)/,
  /(^|\/)\.config\/claude-agents(\/|$)/,
  /(^|\/)\.config\/op(\/|$)/,
  /(^|\/)\.credentials\.json$/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.gnupg(\/|$)/,
]

export function isCredentialPath(p: string): boolean {
  const clean = unescapeWords(p).replace(/^['"]|['"]$/g, "")
  return CREDENTIAL_PATTERNS.some((re) => re.test(clean))
}

/** Absolute and lexically normalised. No realpath: the target of a write need
 * not exist yet. */
export function lexAbs(p: string, base: string): string {
  let s = p
  if (s.startsWith("~/")) s = (process.env["HOME"] ?? "~") + s.slice(1)
  if (!s.startsWith("/")) s = `${base}/${s}`
  const out: string[] = []
  for (const seg of s.split("/")) {
    if (seg === "" || seg === ".") continue
    if (seg === "..") out.pop()
    else out.push(seg)
  }
  return "/" + out.join("/")
}

/** The read-only git verbs. The fleet gives `scout` a shorter list than
 * `reviewer` and `refuter`; this is the longer one, and `scout`'s own
 * frontmatter allowlist is what narrows it further. */
const READ_ONLY_GIT = [
  "log",
  "show",
  "blame",
  "diff",
  "ls-files",
  "status",
  "shortlog",
  "describe",
  "rev-parse",
  "rev-list",
  "cat-file",
  "grep",
  "whatchanged",
]

/** `scout`'s allowlist from the fleet, plus the output-shaping commands the
 * fleet adds for `reviewer`. `cd`, `pwd`, `echo` and `true` are on it because
 * none of them changes state and every one appears inside a legal command. */
const READ_ONLY_SHELL = [
  "ls", "cat", "head", "tail", "sed", "wc", "file", "rg", "grep", "find", "git", "cd", "pwd", "echo", "true",
  "awk", "sort", "uniq", "comm", "diff", "cut", "tr", "column", "basename", "dirname", "stat", "od", "xxd",
]

/** A sed script writes with no redirection character in it at all: `w file`,
 * `W file` and `s/x/y/w file` write, and `e` runs a program. Matched at a
 * position where sed would take a command - the start of the script, or after
 * an address, a semicolon or a brace - so `sed -n '/warning/p'` and
 * `sed -n '1,50p'` still pass. */
const SED_WRITE_RE = /(^|[\s;{}0-9$/,])[wW](\s|$)|(^|[\s;{}])e(\s|$)|s[/|#,:].*[/|#,:][A-Za-z0-9]*w(\s|$)/

/**
 * `find` is an arbitrary-execution primitive and `find *` grants it whole:
 * `-exec` and `-execdir` run a program, and an `-exec` payload is an argument
 * that is never parsed into a command node of its own. `-delete` and the `-f*`
 * actions write.
 *
 * The lead's decision is to drop `find` from the allowlists in Phase 5 and use
 * `glob` instead, so this is a backstop for an agent that later needs `find`
 * legitimately rather than the primary control. Kept small on purpose.
 */
const FIND_WRITE_FLAGS = /(^|\s)-(exec|execdir|ok|okdir|delete|fprintf|fls|fprint)(\s|$)/

/**
 * git flags that write or execute, whatever the verb in front of them.
 *
 * The lesson from `git diff --output=/tmp/pwned.txt` matching `git diff *` is
 * that the subcommand is not the unit, the argv is. The honest statement about
 * this list is that it is a denylist and denylists lose: assume every allowed
 * verb has at least one write flag nobody here has found yet. What makes that
 * survivable is that it is the second gate rather than the only one - the
 * redirection gate above catches the general case, and this catches the ones
 * that write without a redirection character.
 *
 * `-c` and `--config-env` are the sharpest of them and are not about writing at
 * all: `git -c core.pager='sh -c ...' log` runs an arbitrary program, so
 * config injection is arbitrary execution wearing a read verb's clothes.
 */
const GIT_WRITE_FLAGS = [
  "-c",
  "--config-env",
  "-o",
  "--output",
  "-O",
  "--open-files-in-pager",
  "--exec",
  "--upload-pack",
  "--receive-pack",
  "--ext-diff",
  "--textconv",
]

function gitWriteFlag(segment: string): string | undefined {
  for (const word of unescapeWords(commandWords(segment)).split(/\s+/).filter(Boolean)) {
    const name = word.split("=")[0]!
    if (GIT_WRITE_FLAGS.includes(name)) return word
  }
  return undefined
}

/** The four corpus-write tools, by the identifier a live session puts in front
 * of the model - `sanitize(clientName) + "_" + sanitize(name)`, enumerated from
 * a request body in docs/measurements/runtime.md rather than predicted. */
const CORPUS_WRITE_TOOLS = [
  "rzem-memory_memory_capture",
  "rzem-memory_memory_forget",
  "rzem-memory_memory_kv_set",
  "rzem-memory_memory_kv_delete",
]

const WRITE_TOOLS = ["edit", "write", "apply_patch", "patch"]

/**
 * THE WRITE POSTURE. What an agent is allowed to change, asked once and
 * answered for every mechanism that changes something.
 *
 * This is the property the allowlists were standing in for and getting wrong.
 * An allowlist of verbs asks "is this binary on the list" when the invariant
 * says "does this command change state", and redirection, `find -exec` and
 * `sed -n 'w file'` are three proofs those are different questions. Keying the
 * gates on posture rather than on a per-agent list means one boundary for all
 * ten agents, in one place, and it is what lets Phase 5 write generous
 * allowlists without reopening what the allowlist was holding shut.
 *
 * - `none`: changes nothing, anywhere. scout, reviewer, researcher.
 * - `roots`: changes files under `writeRoots` and nowhere else. spec-writer.
 * - `free`: writes are the job. coder, refuter, tech-writer, ui-designer,
 *   fleet-steward, lead. The other rules still apply; this one does not.
 */
type WritePosture = "none" | "roots" | "free"

type AgentRule = {
  /** Quoted from the agent's own Invariants section. Every denial says which
   * line it hit, because an invariant the agent cannot read is one it cannot
   * comply with next turn. */
  noEdit?: string
  /** Defaults to "free". */
  writes?: WritePosture
  /** Writes are confined to these worktree-relative roots. Implies "roots". */
  writeRoots?: string[]
  /** The shell is an allowlist of readers. */
  readOnlyShell?: string
  /** git is read-only, but the rest of the shell is not. */
  readOnlyGit?: string
  /** git verbs refused outright, mapped to the reason. */
  bannedGitVerbs?: Record<string, string>
  /** `git push` shapes refused. */
  noForcePush?: string
  noPushToDefaultBranch?: string
  /** One of the eight agents that may read the corpus and not write it. */
  corpusReadOnly?: boolean
}

/**
 * THE PER-AGENT RULE TABLE. One row per agent, and every string is the
 * invariant as its body states it, so the denial the model reads next turn is
 * the line it violated rather than a paraphrase of it.
 *
 * Nine of these ten bodies do not exist until Phase 5. That is deliberate and
 * it is the whole reason the table lives here rather than only in frontmatter:
 * an invariant enforced by a body that has not been written yet is an
 * invariant nothing enforces, and the register would be claiming a lock that is
 * not there. These rules hold from the moment an agent of that name runs.
 *
 * Where a row duplicates what a Phase 5 frontmatter allowlist will also say -
 * `readOnlyShell` most of all - the duplication is intended. The declarative
 * layer denies first and denies more cheaply; this layer is what sees inside an
 * interpreter payload, and keeping one list for both means a payload can never
 * be more permissive than a bare command. The cost is drift: if a Phase 5 body
 * widens its allowlist and this table does not, the agent meets a denial its
 * own frontmatter allows. Registered.
 */
export const AGENT_RULES: Record<string, AgentRule> = {
  scout: {
    noEdit:
      "Never edit, write or create a file, and leave the working tree exactly as you found it. scout answers in paths, line numbers and quoted excerpts only. Hand the change to coder.",
    writes: "none",
    readOnlyShell:
      "run only commands that read - ls, cat, head, tail, sed -n, wc, file, rg, grep, and read-only git log, git show, git blame, git diff, git ls-files.",
    corpusReadOnly: true,
  },
  reviewer: {
    noEdit:
      "Never edit, write or create a file. Not a fix, not a test, not a note. The report is the whole output: a reviewer that edits makes the diff the human approves a different diff from the one they read. Raise it as a finding and let coder make the change.",
    writes: "none",
    readOnlyShell:
      "Never run tests, builds or installs. If something needs running, that is a finding, not a task.",
    corpusReadOnly: true,
  },
  researcher: {
    noEdit:
      "Never edit a file. The synthesis is the whole output, and every claim in it carries a source.",
    writes: "none",
    readOnlyShell: "Never run anything that changes state. Read, cite, and hand the change to the agent that asked.",
    // Not corpusReadOnly: plan decision 12 allows `researcher` to write the
    // corpus, and `lead`. Those two are the whole allowlist.
  },
  refuter: {
    noEdit:
      "Never write inside the project, and never fix what you find. A refutation is a finding with a reproduction rather than a patch.",
    readOnlyGit:
      "Never fix what you find. A refutation is a finding with a reproduction rather than a patch. Mutate a copy outside the project and report what survived.",
    corpusReadOnly: true,
  },
  "spec-writer": {
    writeRoots: ["docs/specs"],
    corpusReadOnly: true,
  },
  "tech-writer": { corpusReadOnly: true },
  "ui-designer": { corpusReadOnly: true },
  coder: {
    noForcePush:
      "Out of scope is anything on a shared branch - no merging, no releasing, no touching main. A force-push rewrites history somebody else has already pulled. Push the branch normally and let the lead decide what merges.",
    bannedGitVerbs: {
      "filter-branch":
        "Out of scope is anything on a shared branch. \"git filter-branch\" rewrites published history. Raise it as a Blocker: line and let the human decide.",
      "filter-repo":
        "Out of scope is anything on a shared branch. \"git filter-repo\" rewrites published history. Raise it as a Blocker: line and let the human decide.",
    },
    corpusReadOnly: true,
  },
  "fleet-steward": {
    bannedGitVerbs: {
      merge: "Never merge. File it and propose it; the human decides on the pull request.",
      rebase:
        "Never run a git command that rewrites shared history: no force-push, no reset, no rebase onto a shared branch.",
      reset:
        "Never run a git command that rewrites shared history: no force-push, no reset, no rebase onto a shared branch.",
      "filter-branch": "Never run a git command that rewrites shared history.",
      "filter-repo": "Never run a git command that rewrites shared history.",
    },
    noForcePush: "Never run a git command that rewrites shared history: no force-push. Push the branch normally and open a pull request.",
    noPushToDefaultBranch:
      "Never push to a default branch. Push the migration branch and open a pull request instead.",
    corpusReadOnly: true,
  },
  lead: {},
}

export type ScopeContext = {
  agent: string
  tool: string
  args: Record<string, unknown> | undefined
  /** The base a relative path is resolved against. */
  directory: string
}

/** The file paths a tool call targets, whatever shape the tool states them in. */
function targetPaths(tool: string, args: Record<string, unknown> | undefined): string[] {
  if (!args) return []
  const out: string[] = []
  const fp = args["filePath"] ?? args["path"] ?? args["notebook_path"]
  if (typeof fp === "string" && fp) out.push(fp)
  // apply_patch states its paths inside the patch text rather than as an
  // argument, so a path-scoped rule that only read `filePath` would let the
  // whole tool through.
  const patch = args["patchText"]
  if (typeof patch === "string") {
    for (const m of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) out.push(m[1]!.trim())
  }
  return out
}

function deny(agent: string, invariant: string, detail: string): string {
  return `DENIED BY THE FLEET. ${agent} invariant: "${invariant}" ${detail} Do not retry this call; if the work genuinely needs it, say so in a "Blocker: " line in your handoff.`
}

/**
 * The whole decision, as one pure function of the agent, the tool and the
 * arguments. Returns the message the model will read verbatim, or undefined to
 * allow.
 *
 * Pure on purpose. A thrown message is the only thing the agent sees
 * (docs/measurements/phase-0-spike.md, question 3), so the text is the product,
 * and the text is testable without a session, a model or a network.
 */
export function decide(ctx: ScopeContext): string | undefined {
  const rule = AGENT_RULES[ctx.agent]
  const { tool, args, directory } = ctx

  // The credential lock is fleet-wide and runs before the table, so an agent
  // with no row still cannot read one.
  for (const p of targetPaths(tool, args)) {
    if (isCredentialPath(p)) {
      return deny(
        ctx.agent,
        "Never read or write a credential.",
        `${tool} targeted ${p}, which is on the fleet's credential deny list (ported from claude-agents home/settings.json). Nothing the fleet does needs the contents of that file.`,
      )
    }
  }

  if (!rule) return undefined

  if (rule.corpusReadOnly && CORPUS_WRITE_TOOLS.includes(tool)) {
    return deny(
      ctx.agent,
      "Never write to the shared memory corpus. Propose a line with \"Propose memory: \" in your handoff and let the lead file it.",
      `${tool} writes the corpus. Under OpenCode every agent shares one memory credential, so this rule is the only lock there is.`,
    )
  }

  if (WRITE_TOOLS.includes(tool)) {
    if (rule.noEdit) return deny(ctx.agent, rule.noEdit, `${tool} writes a file.`)
    if (rule.writeRoots) {
      const roots = rule.writeRoots.map((r) => lexAbs(r, directory))
      for (const p of targetPaths(tool, args)) {
        const abs = lexAbs(p, directory)
        if (!roots.some((root) => abs === root || abs.startsWith(root + "/"))) {
          return deny(
            ctx.agent,
            `Never write anywhere except under ${rule.writeRoots.map((r) => r + "/").join(" or ")}.`,
            `${tool} targeted ${abs}, which is outside ${roots.join(" and ")}. Name the file you need in the handoff and let the lead commission it.`,
          )
        }
      }
    }
  }

  if (tool !== "bash") return undefined
  const raw = typeof args?.["command"] === "string" ? (args["command"] as string) : ""
  if (!raw) return undefined

  // Bounded before anything parses it, for the same reason the fleet bounds it:
  // work proportional to a command nobody typed is a way to make the check
  // cost more than the call. The fleet had a hook timeout to blow; here an
  // unbounded scan just wastes the agent's wall clock, so the bound is cheaper
  // insurance than it was there, not dearer.
  const bounded = raw.slice(0, 8192)
  // Line continuations first: the shell deletes the backslash AND the newline,
  // joining the words either side, and splitting on newlines without joining
  // strands the verb on a segment whose leading token is not the command.
  const joined = bounded.replace(/\\\n/g, "")
  const normalised = stripInertQuotes(joined)
  const texts = [normalised, ...recoverInterpreterPayloads(normalised).map(stripInertQuotes)]

  // The write posture, resolved once. Everything below that is about changing
  // something asks this rather than asking which agent it is.
  const posture: WritePosture = rule.writes ?? (rule.writeRoots ? "roots" : "free")
  const roots = (rule.writeRoots ?? []).map((r) => lexAbs(r, directory))
  const writeInvariant =
    rule.readOnlyShell ??
    rule.noEdit ??
    (rule.writeRoots ? `Never write anywhere except under ${rule.writeRoots.map((r) => r + "/").join(" or ")}.` : "")

  /** Undefined if this agent may write there, a reason if it may not. */
  const writeRefused = (target: string): string | undefined => {
    if (posture === "free") return undefined
    // `2>/dev/null` discards output rather than writing a file, and it appears
    // inside honest commands constantly. The fleet strips it before scanning
    // for the same reason. Only the device directory, never a temp directory:
    // /tmp is shared with every other process on the box and is exactly the
    // "outside your scope" a write rule is about.
    if (/^\/dev\//.test(target)) return undefined
    if (posture === "none") {
      return target
        ? `it creates or truncates ${target}, and this agent changes nothing.`
        : "it redirects into a file this check could not name, and this agent changes nothing. A redirection that cannot be read is not a redirection that can be allowed."
    }
    if (!target) return "it redirects into a file this check could not name, so it cannot be shown to be inside the allowed roots."
    const abs = lexAbs(target, directory)
    if (roots.some((root) => abs === root || abs.startsWith(root + "/"))) return undefined
    return `it creates or truncates ${abs}, which is outside ${roots.join(" and ")}.`
  }

  for (const text of texts) {
    for (const segment of splitSegments(stripQuoted(text)).slice(0, 16)) {
      const token = leadingToken(segment)
      if (!token) continue

      // THE REDIRECTION GATE, first because it is the general case and because
      // every allowlist in this file is wrong without it. The declarative
      // permission rules do NOT catch this: `cat CLAUDE.md > pwned.txt` matches
      // the allow rule `cat *`, and the redirect target never becomes an
      // external_directory ask either. See redirectTargets.
      for (const target of redirectTargets(segment)) {
        const refused = writeRefused(target)
        if (refused) return deny(ctx.agent, writeInvariant, `"${segment.trim()}" redirects: ${refused}`)
      }

      if (rule.readOnlyShell && !READ_ONLY_SHELL.includes(token)) {
        return deny(
          ctx.agent,
          rule.readOnlyShell,
          `"${token}" is not one of the commands this agent reads with, and it was found in "${segment.trim()}".`,
        )
      }

      if (token === "git") {
        const verb = subVerb(segment)
        const banned = rule.bannedGitVerbs?.[verb]
        if (banned) return deny(ctx.agent, banned, `"git ${verb}" is that command, in "${segment.trim()}".`)
        if ((rule.readOnlyGit || rule.readOnlyShell) && verb && !READ_ONLY_GIT.includes(verb)) {
          return deny(
            ctx.agent,
            rule.readOnlyGit ?? rule.readOnlyShell!,
            `"git ${verb}" is not a read-only verb. Read the history with git log, show, blame, diff or ls-files; anything that changes a ref belongs to coder.`,
          )
        }
        // The argv, not the verb. `git diff --output=/tmp/pwned.txt` matches
        // the allow rule `git diff *` and writes a file, so an allowed verb is
        // not an allowed command.
        if (posture !== "free") {
          const flag = gitWriteFlag(segment)
          if (flag) {
            return deny(
              ctx.agent,
              writeInvariant,
              `"${flag}" makes git write a file or run a program, whatever verb it is attached to. The subcommand is not the unit here, the arguments are.`,
            )
          }
        }
        if (verb === "push") {
          const words = segment.split(/\s+/)
          if (
            rule.noForcePush &&
            (words.some((w) => w === "-f" || w.startsWith("--force") || w === "--mirror" || w === "--delete") ||
              words.some((w) => w.startsWith("+") && w.includes(":")))
          ) {
            return deny(ctx.agent, rule.noForcePush, `"${segment.trim()}" force-pushes.`)
          }
          if (rule.noPushToDefaultBranch && words.some((w) => ["main", "master", "refs/heads/main", "refs/heads/master"].includes(w.replace(/^\+/, "").split(":").pop() ?? ""))) {
            return deny(ctx.agent, rule.noPushToDefaultBranch, `"${segment.trim()}" names a default branch.`)
          }
        }
      }

      // `find` writes and executes through its own arguments, and an `-exec`
      // payload is never parsed into a command node of its own.
      if (token === "find" && posture !== "free" && FIND_WRITE_FLAGS.test(segment)) {
        return deny(
          ctx.agent,
          writeInvariant,
          "find -exec, -execdir, -delete and the -f* actions run programs or write files, and an -exec payload is an argument that nothing else here parses. Locate files with glob and read them separately.",
        )
      }
    }

    // `sed` is read from the RAW text rather than from a stripped segment,
    // because its script is the quoted span and stripping erases exactly the
    // thing being inspected. `-n` is not read-only.
    if (posture !== "free") {
      for (const sed of sedInvocations(text)) {
        if (sed.inPlace) {
          return deny(
            ctx.agent,
            writeInvariant,
            "sed -i edits the file in place. It is a write wherever it appears in the arguments, and -n does not make it a read.",
          )
        }
        for (const script of sed.scripts) {
          if (SED_WRITE_RE.test(script)) {
            return deny(
              ctx.agent,
              writeInvariant,
              `that sed script - ${script} - contains a w, W or e command, which writes a file or runs a program with no redirection character anywhere in the command. Quote it however you like; it is still a script.`,
            )
          }
        }
      }
    }

    // Paths are checked on the whole text rather than per segment, because a
    // credential can be an argument to anything.
    for (const word of unescapeWords(stripQuoted(text)).split(/[\s;|&<>()]+/)) {
      if (word && isCredentialPath(word)) {
        return deny(
          ctx.agent,
          "Never read or write a credential.",
          `"${word}" is on the fleet's credential deny list (ported from claude-agents home/settings.json).`,
        )
      }
    }

    // A command substitution hides its own command from every check above, and
    // double quotes do not disarm it. Only the agents whose rule is an
    // allowlist pay this: for the others the shell is the job.
    if (rule.readOnlyShell && /\$\(|`/.test(stripSingleQuoted(text))) {
      return deny(
        ctx.agent,
        rule.readOnlyShell,
        "a command substitution can hide a write or a test run behind something that reads like an inspection, and $( ) and backticks expand inside double quotes. Run the inner command on its own.",
      )
    }
  }

  return undefined
}

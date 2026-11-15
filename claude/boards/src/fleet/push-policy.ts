// The push and release settings, judged on one Bash command, and the guard
// that keeps any agent but the lead from changing them (CF-209.3). Ported
// from hooks/lib/push-policy.py and push-policy.sh, now shims onto
// `boards fleet push-policy`. The scope hook (scope.ts) calls
// pushReleasePolicy for every call, the lead's own session included: its
// matcher has no agent filter. The lead is the call with no agent_id whose
// agent_type is empty or lead.
//
// The rules, from CF-209 comments 2 and 5:
//
//   push base-only    No git push but the lead's plain push of the base branch,
//                     and of one version tag when release allows it. No gh pr
//                     create by anyone.
//   release off       No tag created, no tag pushed, no gh release create, by
//                     anyone, whatever push is. release unset under push
//                     base-only is the same, and says to set release.
//   release tag       The lead may push one annotated tag vMAJOR.MINOR.PATCH on
//                     the base branch. No gh release create.
//   release github    As tag, and the lead may run gh release create for a tag
//                     that already exists on the remote, with --verify-tag.
//
// Push all with release unset is today's fleet, and nothing is checked.
//
// Every reading here is of hostile text. The command is lexed the way the
// shell reads it - quotes, backslashes, $'...', $( ), backticks, ${ },
// heredocs, comments, redirections, subshells and operators - and a word the
// shell builds at run time is never guessed at: under a restrictive setting, a
// git or gh command that needs such a word judged is refused. A command whose
// name is built at run time is refused only when the command's text names git
// or gh with a push, tag or release word, so `$(printf %s gi t) push` gets
// past; this is a guard against mistakes and the obvious routes, not a
// security boundary, and docs/limits.md lists what it misses, the three
// recorded gaps included: a here-string, git's -x and editor strings, and a
// name built at run time. Refused too are the ways a command reaches git
// without being written as git: a string handed to sh -c, eval, env -S, su -c,
// script -c or watch is lexed and judged as a command; git or gh named later
// in another command's words (find -exec, flock, sudo) is judged from that
// word on; an alias, a shell function named git or gh, a variable assigned
// anywhere in the command, a git option that changes its config or
// repository, xargs in front of git or gh, a shell reading a pipe, and any
// other program whose own words name git or gh with a push, tag or release
// word. What the words alone decide is decided before any git runs, and the
// whole check refuses past a 5-second budget, well inside the hook's
// 10-second timeout, past which the call would go through.
//
// The settings guard (the human's decision on CF-209.3) holds under any
// setting, for every agent but the lead, and is small and fail-closed: a write
// tool aimed at the main checkout's .claude/coder-fleet.json, followed through
// symlinks, hard links and case; any Bash command whose text, with line
// continuations joined, backslashes and quotes removed and case folded, names
// coder-fleet.json at all, readers included; and scripts/fleet-agents.sh
// changing base, push or release.
//
// Only a command whose text mentions git, gh, eval, push, tag or release, or
// holds a $'...' word, is read for the policy; the rest costs nothing.
import { existsSync, lstatSync, readlinkSync, statSync } from "node:fs";
import { posix } from "node:path";
import { configRoot, trunk } from "./config.ts";
import { denyJson, obj, parseEvent, readInput, str } from "./hook.ts";
import { fleetGit, isDir } from "./proc.ts";

const MAX_COMMAND = 65536;
const BUDGET = 5.0;
const MAX_UNITS = 64;
const MAX_PUSH_WORDS = 16;
// Python's default recursion limit, as frames of the lexer: past it the
// command is refused as too deeply nested, as the Python reader refused it.
const MAX_FRAMES = 1000;
const METACHARS = " \t\n;&|()<>";
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "mksh", "yash", "fish", "csh", "tcsh"]);
const WRAPPERS = new Set(["command", "env", "builtin", "exec", "nohup", "time", "xargs", "timeout", "nice", "stdbuf", "setsid", "ionice", "sudo", "doas"]);
const WRAPPER_VALUE_OPTS: Record<string, Set<string>> = {
	env: new Set(["-u", "--unset", "-C", "--chdir"]),
	timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
	nice: new Set(["-n", "--adjustment"]),
	ionice: new Set(["-c", "--class", "-n", "--classdata", "-p", "--pid", "-P", "--pgid", "-u", "--uid"]),
	stdbuf: new Set(["-i", "-o", "-e", "--input", "--output", "--error"]),
	xargs: new Set(["-I", "-L", "-n", "-P", "-s", "-d", "-E", "-a", "--arg-file", "--delimiter", "--max-args", "--max-procs", "--max-chars", "--max-lines", "--replace", "--eof"]),
	sudo: new Set(["-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt", "-C", "--close-from", "-D", "--chdir", "-r", "--role", "-t", "--type", "-U", "--other-user", "-T", "--command-timeout"]),
	doas: new Set(["-u", "-C"]),
	exec: new Set(["-a"]),
	time: new Set(["-o", "--output", "-f", "--format"]),
};
const RESERVED = new Set(["!", "{", "}", "then", "do", "else", "elif", "if", "while", "until", "fi", "done", "esac"]);
const ASSIGNERS = new Set(["export", "declare", "typeset", "local", "readonly"]);
const ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/;
const DURATION_RE = /^[0-9]+(\.[0-9]+)?[smhd]?$/;
const CFLAG_RE = /^-[A-Za-z]*c[A-Za-z]*$/;

// git's global options. Those that only change output are safe; those that
// change which config or repository git reads, or which refs it sees, are not.
const GIT_SAFE_GLOBALS = new Set(["-P", "--no-pager", "-p", "--paginate", "--no-optional-locks", "--no-replace-objects", "--literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs", "--no-advice", "--no-lazy-fetch"]);
const GIT_VALUE_GLOBALS = new Set(["-c", "--git-dir", "--work-tree", "--namespace", "--attr-source", "--config-env", "--super-prefix"]);
const GIT_EXIT_GLOBALS = new Set(["--version", "-v", "--help", "-h", "--exec-path", "--html-path", "--man-path", "--info-path"]);
const PUSH_VERBS = new Set(["push", "send-pack", "http-push"]);
const TAG_VERBS = new Set(["tag", "update-ref", "symbolic-ref", "fast-import"]);
const GIT_WORDS = new Set([...PUSH_VERBS, ...TAG_VERBS]);
const GH_WORDS = new Set(["pr", "release"]);

// Commands that only read or print, and run nothing they are given.
const NON_EXEC = new Set(["cat", "head", "tail", "grep", "egrep", "fgrep", "wc", "ls", "echo", "printf", "less", "more", "cut", "sort", "uniq", "tr", "diff", "cmp", "comm", "column", "nl", "stat", "file", "basename", "dirname", "pwd", "true", "false", "test", "[", "[[", "cd", "realpath", "readlink", "jq"]);

// The options a plain push of the base branch may carry. Exact names only: git
// accepts any unambiguous prefix of a long option, and --mir is --mirror.
const PUSH_PLAIN_LONG = new Set(["set-upstream", "quiet", "verbose", "progress", "no-progress", "dry-run", "porcelain", "no-verify", "verify", "atomic", "no-atomic", "no-follow-tags"]);
const PUSH_PLAIN_SHORT = new Set("uqvn");
const PUSH_FORCING = ["force", "force-with-lease", "force-if-includes", "delete", "prune"];
const PUSH_WIDENING = ["mirror", "all", "branches", "tags", "follow-tags"];
const PUSH_TAGGING = ["tags", "follow-tags", "mirror"];
const PUSH_VALUE_LONG = ["push-option", "repo", "receive-pack", "exec"];
const VERSION_TAG_RE = /^v[0-9]+\.[0-9]+\.[0-9]+$/;

// gh's own top-level commands (gh 2.103). Anything else is an alias or an
// extension, which can run any command.
const GH_GROUPS = new Set(["agent-task", "alias", "api", "attestation", "auth", "browse", "cache", "codespace", "completion", "config", "copilot", "discussion", "extension", "gist", "gpg-key", "help", "issue", "label", "licenses", "org", "pr", "preview", "project", "release", "repo", "ruleset", "run", "search", "secret", "skill", "ssh-key", "status", "variable", "workflow"]);

// A verdict: the reason is the whole message.
class Refuse extends Error {}
class TooDeep extends Error {}

type Word = { raw: string; value: string | null; why: string | null };

class Command {
	words: Word[] = [];
	stdin = false;
	heredocs: [string, boolean][] = [];
	constructor(
		public sep: string | null,
		public depth: number,
		public sub: boolean,
	) {}
}

class Sink {
	commands: Command[] = [];
	open: string[] = [];
	funcs = new Set<string>();
}

let frames = 0;
function enter(): void {
	if (++frames > MAX_FRAMES) throw new TooDeep();
}

// ------------------------------------------------------------------- lexing

const startsAt = (s: string, i: number, re: RegExp): RegExpExecArray | null => {
	re.lastIndex = i;
	return re.exec(s);
};

const RE_FUNC_PARENS = /\(\s*\)/y;
const RE_REDIR_AHEAD = /[0-9]+[<>]|\{[A-Za-z_][A-Za-z0-9_]*\}[<>]/y;
const RE_REDIR = /([0-9]+|\{[A-Za-z_][A-Za-z0-9_]*\})?(<<<|<<-|<<|<>|<&|>&|>>|>\||<|>)/y;
const RE_TILDE = /~([^/ \t\n;&|()<>]*)/y;
const RE_DOLLAR_NAME = /[A-Za-z_][A-Za-z0-9_]*|[0-9]|[@*#?$!-]/y;
const RE_HEX2 = /x([0-9A-Fa-f]{1,2})/y;
const RE_HEX4 = /u([0-9A-Fa-f]{1,4})/y;
const RE_HEX8 = /U([0-9A-Fa-f]{1,8})/y;
const RE_OCT = /[0-7]{1,3}/y;
const RE_CTRL = /c([\s\S])/y;

function pyChr(n: number): string {
	if (n > 0x10ffff) throw new RangeError("chr() arg not in range");
	return String.fromCodePoint(n);
}

class Lex {
	s: string;
	n: number;
	i = 0;
	pending: [string, boolean, boolean, Command][] = [];
	constructor(
		text: string,
		public sink: Sink,
		public depth = 0,
		public sub = false,
	) {
		this.s = text;
		this.n = text.length;
	}

	run(): Sink {
		this.seq(null, this.depth, this.sub);
		return this.sink;
	}

	end(cmd: Command): void {
		if (!cmd.words.length) return;
		const first = cmd.words[0].value;
		if (first === "function" && cmd.words.length > 1 && cmd.words[1].value) this.sink.funcs.add(baseName(cmd.words[1].value));
		this.sink.commands.push(cmd);
	}

	seq(closer: string | null, depth: number, sub: boolean): void {
		enter();
		let cmd = new Command(null, depth, sub);
		while (this.i < this.n) {
			const c = this.s[this.i];
			if (closer && c === closer) {
				this.i += 1;
				this.end(cmd);
				frames--;
				return;
			}
			if (c === " " || c === "\t") {
				this.i += 1;
				continue;
			}
			if (c === "\n") {
				this.i += 1;
				this.end(cmd);
				this.bodies();
				cmd = new Command("\n", depth, sub);
				continue;
			}
			if (c === "#") {
				const j = this.s.indexOf("\n", this.i);
				this.i = j < 0 ? this.n : j;
				continue;
			}
			if (c === ";" || c === "&" || c === "|") {
				const op = this.operator();
				this.i += op.length;
				if (op === "&>" || op === "&>>") {
					this.target(cmd);
					continue;
				}
				this.end(cmd);
				cmd = new Command(op, depth, sub);
				continue;
			}
			if (c === "(") {
				const m = startsAt(this.s, this.i, RE_FUNC_PARENS);
				if (cmd.words.length && m) {
					// name() { ...; }: a function definition. Its body is lexed and
					// judged like any other command.
					const name = cmd.words[cmd.words.length - 1].value;
					this.sink.funcs.add(baseName(name ?? ""));
					this.i += m[0].length;
					cmd = new Command(cmd.sep, depth, sub);
					continue;
				}
				if (this.s.startsWith("((", this.i)) {
					this.arith();
					cmd.words.push({ raw: "((", value: null, why: "arithmetic" });
					continue;
				}
				this.i += 1;
				this.end(cmd);
				this.seq(")", depth + 1, sub);
				cmd = new Command("(", depth, sub);
				continue;
			}
			if (c === ")") {
				this.sink.open.push("a ) with no ( before it");
				this.i += 1;
				continue;
			}
			if (c === "<" || c === ">" || startsAt(this.s.slice(this.i, this.i + 40), 0, RE_REDIR_AHEAD)) {
				this.redirection(cmd);
				continue;
			}
			cmd.words.push(this.word());
		}
		if (closer) this.sink.open.push(`a ${({ ")": "(", "`": "`" } as Record<string, string>)[closer] ?? closer} that is never closed`);
		this.end(cmd);
		this.bodies();
		frames--;
	}

	operator(): string {
		for (const op of [";;&", "&>>", "&&", "||", ";;", ";&", "|&", "&>", "&", "|", ";"]) if (this.s.startsWith(op, this.i)) return op;
		return this.s[this.i];
	}

	redirection(cmd: Command): void {
		const m = startsAt(this.s, this.i, RE_REDIR) as RegExpExecArray;
		const op = m[2];
		this.i += m[0].length;
		if ((op === "<" || op === ">") && this.s.startsWith("(", this.i)) {
			this.i += 1;
			this.seq(")", this.depth + 1, true);
			cmd.words.push({ raw: `${op}(`, value: null, why: "a process substitution" });
			return;
		}
		if (op === "<<" || op === "<<-") {
			this.spaces();
			const w = this.word();
			let delim = w.raw;
			for (const q of ["\\", "'", '"']) delim = delim.split(q).join("");
			const expands = !["\\", "'", '"'].some((q) => w.raw.includes(q));
			this.pending.push([delim, op === "<<-", expands, cmd]);
			return;
		}
		if (op === "<") cmd.stdin = true;
		this.target(cmd);
	}

	target(_cmd: Command): void {
		// A redirection's target is no argument, but what it expands still runs.
		this.spaces();
		if (this.i < this.n && !METACHARS.includes(this.s[this.i])) this.word();
	}

	spaces(): void {
		while (this.i < this.n && (this.s[this.i] === " " || this.s[this.i] === "\t")) this.i += 1;
	}

	bodies(): void {
		for (const [delim, strip, expands, cmd] of this.pending) {
			const lines: string[] = [];
			while (this.i < this.n) {
				const j = this.s.indexOf("\n", this.i);
				const line = this.s.slice(this.i, j < 0 ? this.n : j);
				this.i = j < 0 ? this.n : j + 1;
				if ((strip ? line.replace(/^\t+/, "") : line) === delim) break;
				lines.push(line);
			}
			cmd.heredocs.push([lines.join("\n"), expands]);
		}
		this.pending = [];
	}

	word(): Word {
		enter();
		const start = this.i;
		const parts: string[] = [];
		let known = true;
		let why: string | null = null;
		let brace = false;
		while (this.i < this.n) {
			const c = this.s[this.i];
			if (METACHARS.includes(c)) break;
			if (c === "\\") {
				if (this.i + 1 < this.n) {
					const nxt = this.s[this.i + 1];
					this.i += 2;
					if (nxt !== "\n") parts.push(nxt);
				} else this.i += 1;
				continue;
			}
			if (c === "'") {
				const j = this.s.indexOf("'", this.i + 1);
				if (j < 0) {
					this.sink.open.push("a single quote that is never closed");
					this.i = this.n;
					known = false;
					break;
				}
				parts.push(this.s.slice(this.i + 1, j));
				this.i = j + 1;
				continue;
			}
			if (c === '"') {
				this.i += 1;
				const v = this.dquote('"');
				if (v === null) {
					known = false;
					why = why ?? "expands";
				} else parts.push(v);
				continue;
			}
			if (c === "$") {
				const nxt = this.i + 1 < this.n ? this.s[this.i + 1] : "";
				if (nxt === "'") {
					this.i += 2;
					parts.push(this.ansiC());
					continue;
				}
				if (nxt === '"') {
					this.i += 2;
					const v = this.dquote('"');
					if (v === null) {
						known = false;
						why = why ?? "expands";
					} else parts.push(v);
					continue;
				}
				if (this.dollar()) {
					known = false;
					why = why ?? "expands";
				} else parts.push("$");
				continue;
			}
			if (c === "`") {
				this.backtick();
				known = false;
				why = why ?? "expands";
				continue;
			}
			if (c === "*" || c === "?" || c === "[") {
				known = false;
				why = why ?? "is a glob";
				this.i += 1;
				continue;
			}
			if (c === "{" || c === "}") {
				brace = true;
				parts.push(c);
				this.i += 1;
				continue;
			}
			if (c === "~" && this.i === start) {
				const m = startsAt(this.s, this.i, RE_TILDE) as RegExpExecArray;
				const home = process.env.HOME;
				if (m[1] === "" && home) parts.push(home);
				else {
					known = false;
					why = why ?? "expands";
				}
				this.i += m[0].length;
				continue;
			}
			parts.push(c);
			this.i += 1;
		}
		const raw = this.s.slice(start, this.i);
		let value: string | null = known ? parts.join("") : null;
		if (value !== null && brace && value !== "{" && value !== "}") {
			value = null;
			why = "may be a brace expansion";
		}
		frames--;
		return { raw, value, why };
	}

	// Inside double quotes. end null reads to the end of the text, as in a
	// heredoc body. Returns the value, or null when it expands.
	dquote(end: string | null): string | null {
		const parts: string[] = [];
		let known = true;
		while (this.i < this.n) {
			const c = this.s[this.i];
			if (end && c === end) {
				this.i += 1;
				return known ? parts.join("") : null;
			}
			if (c === "\\" && this.i + 1 < this.n) {
				const nxt = this.s[this.i + 1];
				if ('$`"\\\n'.includes(nxt)) {
					this.i += 2;
					if (nxt !== "\n") parts.push(nxt);
					continue;
				}
				parts.push("\\");
				this.i += 1;
				continue;
			}
			if (c === "$") {
				if (this.dollar()) known = false;
				else parts.push("$");
				continue;
			}
			if (c === "`") {
				this.backtick();
				known = false;
				continue;
			}
			parts.push(c);
			this.i += 1;
		}
		if (end) {
			this.sink.open.push("a double quote that is never closed");
			return null;
		}
		return known ? parts.join("") : null;
	}

	// At a $. Consumes an expansion and returns true, or consumes the $ alone
	// and returns false.
	dollar(): boolean {
		const s = this.s;
		const i = this.i;
		const nxt = i + 1 < this.n ? s[i + 1] : "";
		if (nxt === "(") {
			this.i = i + 1;
			if (s.startsWith("((", this.i)) {
				this.arith();
				return true;
			}
			this.i += 1;
			this.seq(")", this.depth + 1, true);
			return true;
		}
		if (nxt === "{") {
			this.i = i + 2;
			this.param();
			return true;
		}
		const m = startsAt(s, i + 1, RE_DOLLAR_NAME);
		if (m) {
			this.i = i + 1 + m[0].length;
			return true;
		}
		this.i = i + 1;
		return false;
	}

	// After ${, to its closing }. What it holds can run: ${x:-$(cmd)}.
	param(): void {
		let level = 1;
		while (this.i < this.n) {
			const c = this.s[this.i];
			if (c === "\\") {
				this.i += 2;
				continue;
			}
			if (c === "'") {
				const j = this.s.indexOf("'", this.i + 1);
				this.i = j < 0 ? this.n : j + 1;
				continue;
			}
			if (c === '"') {
				this.i += 1;
				this.dquote('"');
				continue;
			}
			if (c === "$") {
				this.dollar();
				continue;
			}
			if (c === "`") {
				this.backtick();
				continue;
			}
			if (c === "{") level += 1;
			else if (c === "}") {
				level -= 1;
				if (level === 0) {
					this.i += 1;
					return;
				}
			}
			this.i += 1;
		}
		this.sink.open.push("a ${ that is never closed");
	}

	// At ((: to the matching )). A $( ) inside still runs.
	arith(): void {
		let level = 0;
		while (this.i < this.n) {
			const c = this.s[this.i];
			if (c === "$" && this.s.startsWith("$(", this.i) && !this.s.startsWith("$((", this.i)) {
				this.dollar();
				continue;
			}
			if (c === "`") {
				this.backtick();
				continue;
			}
			if (c === "(") level += 1;
			else if (c === ")") {
				level -= 1;
				if (level === 0) {
					this.i += 1;
					return;
				}
			}
			this.i += 1;
		}
		this.sink.open.push("an arithmetic (( that is never closed");
	}

	backtick(): void {
		let j = this.i + 1;
		const body: string[] = [];
		while (j < this.n) {
			const c = this.s[j];
			if (c === "\\" && j + 1 < this.n && "`$\\".includes(this.s[j + 1])) {
				body.push(this.s[j + 1]);
				j += 2;
				continue;
			}
			if (c === "`") break;
			body.push(c);
			j += 1;
		}
		if (j >= this.n) this.sink.open.push("a backtick that is never closed");
		this.i = j + 1;
		new Lex(body.join(""), this.sink, this.depth + 1, true).run();
	}

	ansiC(): string {
		const out: string[] = [];
		const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", v: "\v", "\\": "\\", "'": "'", '"': '"', "?": "?" };
		while (this.i < this.n) {
			const c = this.s[this.i];
			if (c === "'") {
				this.i += 1;
				return out.join("");
			}
			if (c === "\\" && this.i + 1 < this.n) {
				const e = this.s[this.i + 1];
				if (e in simple) {
					out.push(simple[e]);
					this.i += 2;
					continue;
				}
				const at = this.i + 1;
				const m = startsAt(this.s, at, RE_HEX2) || startsAt(this.s, at, RE_HEX4) || startsAt(this.s, at, RE_HEX8);
				if (m) {
					out.push(pyChr(Number.parseInt(m[1], 16)));
					this.i += 1 + m[0].length;
					continue;
				}
				const o = startsAt(this.s, at, RE_OCT);
				if (o) {
					out.push(pyChr(Number.parseInt(o[0], 8)));
					this.i += 1 + o[0].length;
					continue;
				}
				const k = startsAt(this.s, at, RE_CTRL);
				if (k) {
					out.push(String.fromCharCode((k[1].codePointAt(0) as number) & 31));
					this.i += 3;
					continue;
				}
				out.push("\\");
				this.i += 1;
				continue;
			}
			out.push(c);
			this.i += 1;
		}
		this.sink.open.push("a $' that is never closed");
		return out.join("");
	}
}

function lex(text: string, depth = 0, sub = false): Sink {
	return new Lex(text, new Sink(), depth, sub).run();
}

// A heredoc body with an unquoted delimiter runs its $( ) and backticks.
function lexExpansions(body: string, sink: Sink, depth: number): void {
	new Lex(body, sink, depth + 1, true).dquote(null);
}

export function baseName(v: string | null): string {
	if (!v) return "";
	const parts = v.replace(/\/+$/, "").split("/");
	return parts[parts.length - 1].toLowerCase();
}

// os.path.normpath(os.path.join(dir, p)).
function normJoin(dir: string, p: string): string {
	const joined = p.startsWith("/") ? p : dir.endsWith("/") || dir === "" ? `${dir}${p}` : `${dir}/${p}`;
	if (joined === "") return ".";
	let n = posix.normalize(joined);
	if (n.length > 1 && n.endsWith("/")) n = n.slice(0, -1);
	if (joined.startsWith("//") && !joined.startsWith("///")) n = `/${n}`;
	return n;
}

// ------------------------------------------------------------------ reading

type Unit = { words: Word[]; xargs: boolean; dir: string | null; sure: boolean; origin: string };

class Prefix {
	index = 0;
	xargs = false;
	chdir = false;
	payload: string | false | null = null; // env -S's string, run as the command
	skip = false; // a for or case header: no command runs
}

function stripPrefix(words: Word[], assigns: string[]): Prefix {
	const p = new Prefix();
	let i = 0;
	while (i < words.length) {
		const w = words[i];
		const v = w.value;
		if (v !== null && w.raw === v && RESERVED.has(v)) {
			i += 1;
			continue;
		}
		if ((v === "for" || v === "select") && w.raw === v) {
			if (i + 1 < words.length) assigns.push(`the loop variable ${words[i + 1].raw || "?"}`);
			p.skip = true;
			break;
		}
		if (v === "case" && w.raw === v) {
			p.skip = true;
			break;
		}
		if (ASSIGN_RE.test(w.raw)) {
			assigns.push(w.raw.split("=")[0]);
			i += 1;
			continue;
		}
		const name = baseName(v);
		if (v !== null && WRAPPERS.has(name)) {
			if (name === "xargs") p.xargs = true;
			i += 1;
			while (i < words.length) {
				const o = words[i].value;
				if (o === null) break;
				if (name === "env" && ASSIGN_RE.test(words[i].raw)) {
					assigns.push(words[i].raw.split("=")[0]);
					i += 1;
					continue;
				}
				if (name === "env" && (o === "-S" || o === "--split-string" || o.startsWith("--split-string=") || (o.startsWith("-S") && o.length > 2))) {
					if (o === "-S" || o === "--split-string") {
						let payload: string | false | null = i + 1 < words.length ? words[i + 1].value : "";
						if (payload === null) payload = false;
						p.payload = payload;
						i += 2;
					} else {
						p.payload = o.startsWith("--") ? o.slice(o.indexOf("=") + 1) : o.slice(2);
						i += 1;
					}
					const rest = words
						.slice(i)
						.map((x) => x.raw)
						.join(" ");
					if (p.payload !== false) p.payload = p.payload + (rest ? ` ${rest}` : "");
					p.index = words.length;
					return p;
				}
				if (o.startsWith("-") && o !== "-") {
					if (
						(name === "env" && (o === "-C" || o === "--chdir")) ||
						(name === "sudo" && (o === "-D" || o === "--chdir")) ||
						(name === "env" && (o.startsWith("--chdir=") || (o.startsWith("-C") && o.length > 2)))
					) {
						p.chdir = true;
					}
					i += WRAPPER_VALUE_OPTS[name]?.has(o) ? 2 : 1;
					continue;
				}
				if ((name === "timeout" || name === "nice" || name === "ionice") && DURATION_RE.test(o)) {
					i += 1;
					continue;
				}
				break;
			}
			continue;
		}
		break;
	}
	p.index = i;
	return p;
}

// The value of an option in names at words[i], separate or attached, and the
// index after it. null when words[i] is not one of them.
function optionValue(words: Word[], i: number, names: string[]): [string | null, number] | null {
	const v = words[i].value;
	if (v === null) return null;
	for (const n of names) {
		if (v === n) return [i + 1 < words.length ? words[i + 1].value : null, i + 2];
		if (n.startsWith("--") && v.startsWith(`${n}=`)) return [v.slice(n.length + 1), i + 1];
	}
	return null;
}

class Reader {
	units: Unit[] = [];
	assigns: string[] = [];
	funcs = new Set<string>();
	open: string[] = [];
	stdinShell = false;
	strings: string[] = []; // what runs a string: why it could not be read
	coded: [string, string][] = []; // a command that may run code naming git or gh

	read(text: string, dir: string | null, sure: boolean, origin: string, depth: number): void {
		enter();
		const sink = lex(text, depth, origin !== "command");
		this.open.push(...sink.open);
		for (const f of sink.funcs) this.funcs.add(f);
		const cmds = sink.commands;
		const prefixes = cmds.map((c) => stripPrefix(c.words, this.assigns));
		const names = cmds.map((c, k) => {
			const p = prefixes[k];
			return p.index < c.words.length && c.words[p.index].value ? baseName(c.words[p.index].value) : "";
		});
		const cds = names.map((nm, k) => (nm === "cd" || nm === "pushd" || nm === "popd" ? k : -1)).filter((k) => k >= 0);
		let cdDir: string | null = null;
		if (cds.length === 1 && cds[0] === 0 && cmds[0].depth === 0 && !cmds[0].sub) {
			const c0 = cmds[0];
			const p0 = prefixes[0];
			const args = c0.words.slice(p0.index + 1);
			if (args.length === 1 && args[0].value && names[0] === "cd" && dir) {
				const a = args[0].value;
				if (a.startsWith("/") || a.startsWith("./") || a.startsWith("../") || a === "." || a === "..") cdDir = normJoin(dir, a);
			}
		}
		cmds.forEach((cmd, k) => {
			const p = prefixes[k];
			let here = dir;
			let hereSure = sure;
			if (cds.length) {
				let chain = cdDir !== null && k > 0;
				for (let j = 1; chain && j <= k; j++) if (!(cmds[j].depth === 0 && !cmds[j].sub && cmds[j].sep === "&&")) chain = false;
				if (chain) here = cdDir;
				else hereSure = false;
			}
			if (p.chdir) hereSure = false;
			this.command(cmd, p, here, hereSure, origin, depth);
		});
		frames--;
	}

	command(cmd: Command, p: Prefix, dir: string | null, sure: boolean, origin: string, depth: number): void {
		const words = cmd.words;
		if (p.payload !== null) {
			if (p.payload === false) this.strings.push("env -S runs a string built at run time");
			else this.read(p.payload, dir, sure, "payload", depth + 1);
			return;
		}
		for (const [body, expands] of cmd.heredocs) {
			if (this.stdinShellCommand(words, p)) this.read(body, dir, sure, "payload", depth + 1);
			else if (expands) {
				const sink = new Sink();
				lexExpansions(body, sink, depth);
				this.open.push(...sink.open);
				for (const c of sink.commands) this.command(c, stripPrefix(c.words, this.assigns), dir, false, "payload", depth + 1);
			}
		}
		if (p.skip || p.index >= words.length) return;
		const head = words[p.index];
		if (head.value === null) {
			this.strings.push(`the command name "${head.raw}" is built at run time`);
			return;
		}
		const name = baseName(head.value);
		const args = words.slice(p.index + 1);
		if (ASSIGNERS.has(name)) {
			for (const a of args) if (a.value === null || !a.value.startsWith("-")) this.assigns.push(a.raw.split("=")[0]);
		} else if (name === "read") this.assigns.push("a variable read from standard input");
		else if (name === "alias") this.assigns.push("an alias");
		else if (name === "hash" && args.some((a) => a.value === "-p")) this.assigns.push("the command hashed by hash -p");
		if (this.funcs.has(name) && (name === "git" || name === "gh")) this.strings.push(`a shell function named ${name} stands in for it`);
		const opened = this.payloads(cmd, name, args, dir, sure, depth);
		if (!opened && !NON_EXEC.has(name) && name !== "git" && name !== "gh" && !name.startsWith("git-")) {
			this.coded.push([
				name,
				words
					.slice(p.index)
					.map((w) => w.raw)
					.join(" "),
			]);
		}
		this.units.push({ words: words.slice(p.index), xargs: p.xargs, dir, sure, origin });
		for (let j = p.index + 1; j < words.length; j++) {
			const v = words[j].value;
			const b = baseName(v);
			if (v && (b === "git" || b === "gh" || b.startsWith("git-"))) this.units.push({ words: words.slice(j), xargs: p.xargs, dir, sure: false, origin: "suffix" });
		}
	}

	stdinShellCommand(words: Word[], p: Prefix): boolean {
		if (p.index >= words.length) return false;
		if (!SHELLS.has(baseName(words[p.index].value))) return false;
		for (const w of words.slice(p.index + 1)) {
			const v = w.value;
			if (v === null || !(v.startsWith("-") || v.startsWith("+"))) return false;
			if (CFLAG_RE.test(v)) return false;
		}
		return true;
	}

	// true when the command's string was read as commands, or could not be and
	// says so in strings or stdinShell. false when nothing was opened, so the
	// caller still looks at the command's own words.
	payloads(cmd: Command, name: string, args: Word[], dir: string | null, sure: boolean, depth: number): boolean {
		if (SHELLS.has(name)) {
			let cflag = false;
			let i = 0;
			while (i < args.length) {
				const v = args[i].value;
				if (v === null) {
					if (cflag) this.strings.push(`${name} -c runs a string built at run time`);
					return cflag;
				}
				if (v === "--") {
					i += 1;
					break;
				}
				if (["-o", "+o", "--rcfile", "--init-file", "-O", "+O"].includes(v)) {
					i += 2;
					continue;
				}
				if ((v.startsWith("-") || v.startsWith("+")) && v.length > 1) {
					if (CFLAG_RE.test(v)) cflag = true;
					i += 1;
					continue;
				}
				break;
			}
			if (cflag) {
				if (i < args.length && args[i].value !== null) this.read(args[i].value as string, dir, sure, "payload", depth + 1);
				else if (i < args.length) this.strings.push(`${name} -c runs a string built at run time`);
				return true;
			}
			if (i >= args.length && (cmd.sep === "|" || cmd.sep === "|&" || cmd.stdin) && !cmd.heredocs.length) {
				this.stdinShell = true;
				return true;
			}
			return cmd.heredocs.length > 0 && i >= args.length;
		}
		if (name === "eval") {
			const vals = args.map((a) => a.value);
			if (vals.some((v) => v === null)) this.strings.push("eval runs a string built at run time");
			else this.read(vals.join(" "), dir, sure, "payload", depth + 1);
			return true;
		}
		if (name === "su" || name === "runuser" || name === "script") {
			let opened = false;
			for (let i = 0; i < args.length; i++) {
				const got = optionValue(args, i, ["-c", "--command"]);
				if (got) {
					opened = true;
					if (got[0] === null) this.strings.push(`${name} -c runs a string built at run time`);
					else this.read(got[0], dir, sure, "payload", depth + 1);
				}
			}
			return opened;
		}
		if (name === "watch") {
			let i = 0;
			while (i < args.length && args[i].value && (args[i].value as string).startsWith("-")) i += ["-n", "--interval", "-d"].includes(args[i].value as string) ? 2 : 1;
			const vals = args.slice(i).map((a) => a.value);
			if (vals.some((v) => v === null)) this.strings.push("watch runs a string built at run time");
			else if (vals.length) this.read(vals.join(" "), dir, sure, "payload", depth + 1);
			return true;
		}
		return false;
	}
}

// ---------------------------------------------------------------- the policy

export type PolicyRequest = {
	mode?: string;
	command?: string;
	cwd?: string;
	who?: string;
	lead?: boolean;
	active?: boolean;
	push?: string;
	release?: string;
	base?: string;
	base_reason?: string;
	push_note?: string;
	release_note?: string;
	guard?: boolean;
	path?: string;
	main?: string;
};

type Config = ["set" | "unset" | "error", string];

class Policy {
	push: string | undefined;
	release: string | undefined;
	base: string;
	lead: boolean;
	who: string;
	cwd: string;
	baseOnly: boolean;
	tagblock: boolean;
	gitblock: boolean;
	builtinSet: Set<string> | null = null;
	deadline: number;

	constructor(public req: PolicyRequest) {
		this.push = req.push;
		this.release = req.release;
		this.base = req.base || "";
		this.lead = Boolean(req.lead);
		this.who = req.who || "this agent";
		this.cwd = req.cwd || "";
		this.baseOnly = this.push === "base-only";
		this.tagblock = this.release === "off" || (this.release === "unset" && this.baseOnly);
		this.gitblock = this.baseOnly || this.tagblock;
		this.deadline = performance.now() / 1000 + BUDGET;
	}

	// --- messages

	pushPart(specific: string): string {
		const n = this.req.push_note || "";
		const note = n ? ` (${n})` : "";
		const base = this.base ? `the base branch, ${this.base},` : `the base branch, which could not be resolved (${this.req.base_reason || "no reason given"}),`;
		return `push policy: .claude/coder-fleet.json makes "push" "base-only"${note}, so nothing leaves this machine but ${base} which only the lead pushes, plainly, and a version tag the release setting allows. ${specific}`.trim();
	}

	releasePart(specific: string): string {
		const n = this.req.release_note || "";
		const note = n ? ` (${n})` : "";
		const r = this.release;
		if (r === "unset") {
			return `release policy: "release" is not set in .claude/coder-fleet.json, and under "push": "base-only" that means no tag is created or pushed and no GitHub release is made. ${specific} To release, set "release" to "tag" or "github" in .claude/coder-fleet.json.`;
		}
		if (r === "tag") return `release policy: .claude/coder-fleet.json makes "release" "tag", so the lead may push a version tag, but no GitHub release is made. ${specific}`.trim();
		if (r === "github") {
			return `release policy: .claude/coder-fleet.json makes "release" "github", so only the lead makes a GitHub release, and only of a tag that already exists on the remote. ${specific}`.trim();
		}
		return `release policy: .claude/coder-fleet.json makes "release" "off"${note}, so no tag is created or pushed and no GitHub release is made, whatever "push" says. ${specific}`.trim();
	}

	refuse(push: string | null = null, release: string | null = null): never {
		const parts: string[] = [];
		if (push !== null) parts.push(this.pushPart(push));
		if (release !== null) parts.push(this.releasePart(release));
		throw new Refuse(parts.join(" "));
	}

	unread(why: string): never {
		const settings: string[] = [];
		if (this.baseOnly) settings.push('"push": "base-only"');
		if (this.release !== "unset" || this.baseOnly) settings.push(`"release": "${this.release !== "unset" ? this.release : "not set"}"`);
		throw new Refuse(
			`push and release policy: ${why}. Under ${settings.join(" and ")} in .claude/coder-fleet.json, a command about pushing, tagging or releasing that cannot be read is refused. Write the git or gh command out plainly, on its own, with no variable, alias, wrapper or substitution, and pass a repository with git -C <path> rather than a cd.`,
		);
	}

	// --- git

	git(dir: string | null, ...args: string[]): [number, string] {
		const left = this.deadline - performance.now() / 1000;
		if (left < 0.2) this.outOfTime();
		let r: ReturnType<typeof Bun.spawnSync>;
		try {
			r = Bun.spawnSync(["git", ...(dir ? ["-C", dir] : []), ...args], {
				stdin: "ignore",
				stdout: "pipe",
				stderr: "ignore",
				timeout: Math.max(1, Math.floor(left * 1000)),
				env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } as Record<string, string>,
			});
		} catch {
			return [255, ""];
		}
		if (r.exitedDueToTimeout) this.outOfTime();
		return [r.exitCode ?? 255, (r.stdout ?? Buffer.from("")).toString().trim()];
	}

	outOfTime(): never {
		throw new Refuse(
			`push and release policy: judging this command took longer than its ${BUDGET}-second budget, so it is refused rather than left to the hook's timeout, which would let it through. Split it into shorter commands.`,
		);
	}

	builtins(): Set<string> {
		if (this.builtinSet === null) {
			const [rc, out] = this.git(null, "--list-cmds=builtins");
			this.builtinSet = rc === 0 ? new Set(out.split(/\s+/).filter(Boolean)) : new Set();
		}
		return this.builtinSet;
	}

	config(dir: string | null, ...args: string[]): Config {
		const [rc, out] = this.git(dir, "config", ...args);
		if (rc === 0) return ["set", out];
		if (rc === 1) return ["unset", ""];
		return ["error", ""];
	}

	isRepo(dir: string | null): boolean {
		return Boolean(dir) && this.git(dir, "rev-parse", "--git-dir")[0] === 0;
	}

	// tag, maybe or other: whether a push word sends a tag.
	refKind(dir: string | null, sure: boolean, word: string): string {
		const r = word.startsWith("+") ? word.slice(1) : word;
		let src: string;
		let dst: string | null;
		if (r.includes(":")) {
			const k = r.indexOf(":");
			src = r.slice(0, k);
			dst = r.slice(k + 1);
		} else {
			src = r;
			dst = r;
		}
		const ls = src.toLowerCase();
		const ld = (dst || "").toLowerCase();
		if (ls.startsWith("refs/tags/") || ls === "tag" || ld.startsWith("refs/tags/")) return "tag";
		if (!src) return "other";
		if (!sure) return "maybe";
		if (!this.isRepo(dir)) return "other";
		if (this.git(dir, "show-ref", "--verify", "-q", `refs/tags/${src}`)[0] === 0) return "tag";
		const [rc, kind] = this.git(dir, "cat-file", "-t", src);
		if (rc === 0 && kind === "tag") return "tag";
		return "other";
	}

	// --- judging

	judge(reader: Reader): void {
		for (const u of reader.units) {
			const name = baseName(u.words[0].value);
			if (name === "git" || name.startsWith("git-")) this.judgeGit(u, reader);
			else if (name === "gh") this.judgeGh(u, reader);
		}
	}

	judgeGit(u: Unit, reader: Reader): void {
		const words = u.words;
		const name = baseName(words[0].value);
		if (name.startsWith("git-")) {
			const verb = name.slice(4);
			if ((PUSH_VERBS.has(verb) && this.gitblock) || (TAG_VERBS.has(verb) && this.tagblock)) {
				this.unread(`"${words[0].raw}" runs git ${verb} through its own program name, which this check does not read; run it as git ${verb}`);
			}
			return;
		}
		let i = 1;
		let dir = u.dir;
		let bad: string | null = null;
		let verb: string | null = null;
		while (i < words.length) {
			const v = words[i].value;
			if (v === null) {
				if (this.gitblock && u.origin !== "suffix") {
					this.unread(`"${words[i].raw}" stands before git's verb and ${words[i].why || "expands"}, so which git command runs cannot be read`);
				}
				return;
			}
			if (v === "-C") {
				const nv = i + 1 < words.length ? words[i + 1].value : null;
				dir = dir && nv ? normJoin(dir, nv) : null;
				i += 2;
				continue;
			}
			if (GIT_VALUE_GLOBALS.has(v)) {
				bad = bad || v;
				i += 2;
				continue;
			}
			if (GIT_EXIT_GLOBALS.has(v) || v.startsWith("--list-cmds=")) return;
			if (GIT_SAFE_GLOBALS.has(v)) {
				i += 1;
				continue;
			}
			if (v.startsWith("-")) {
				bad = bad || v;
				i += 1;
				continue;
			}
			verb = v;
			break;
		}
		const args = words.slice(i + 1);
		if (verb === null) {
			if (u.xargs && this.gitblock && u.origin !== "suffix") this.unread("xargs hands git its verb from standard input, which no check can see");
			return;
		}
		if (!this.builtins().has(verb)) {
			if (u.origin !== "suffix" && this.gitblock) {
				this.unread(`"git ${verb}" is not one of git's own commands, so it may be an alias, or a program on the PATH, that pushes or tags; write out the git command it stands for`);
			}
			return;
		}
		if (verb === "push" || verb === "send-pack" || verb === "http-push") {
			if (!this.gitblock) return;
		} else if (TAG_VERBS.has(verb)) {
			if (!this.tagblock) return;
		} else return;
		if (u.xargs) this.unread("xargs hands git words from standard input, which no check can see");
		if (bad) this.unread(`"${bad}" before git's verb changes which config or repository git reads`);
		if (reader.assigns.length) this.unread(`the command assigns ${reader.assigns[0]}, and a variable can change what git sends`);
		for (const a of args) if (a.value === null) this.unread(`"${a.raw}" ${a.why || "expands"}, so what git is given cannot be read`);
		const vals = args.map((a) => a.value as string);
		if (verb === "push") this.judgePush(u, dir, vals);
		else if (verb === "send-pack" || verb === "http-push") {
			this.refuse(this.baseOnly ? `"git ${verb}" pushes refs without git push's checks; use git push.` : null, this.tagblock ? `"git ${verb}" can send tags.` : null);
		} else if (verb === "tag") this.judgeTag(vals);
		else if (verb === "update-ref" || verb === "symbolic-ref") {
			if (vals.some((v) => v.toLowerCase().includes("tags") || v.startsWith("--stdin"))) this.refuse(null, `"git ${verb}" here writes a tag ref.`);
		} else if (verb === "fast-import") this.refuse(null, '"git fast-import" creates the tags its input names.');
	}

	judgeTag(vals: string[]): void {
		if (!vals.length) return;
		let listing = false;
		let creating = false;
		let positional = false;
		for (const v of vals) {
			if (v.startsWith("--")) {
				const name = v.slice(2).split("=")[0];
				if (["list", "delete", "verify", "contains", "no-contains", "merged", "no-merged", "points-at"].includes(name)) listing = true;
				else if (name && ["annotate", "sign", "local-user", "message", "file", "force", "edit", "create-reflog", "trailer", "cleanup", "no-sign"].some((w) => w.startsWith(name))) creating = true;
			} else if (v.startsWith("-") && v.length > 1) {
				const letters = new Set(v.slice(1));
				if ([..."asumFfe"].some((l) => letters.has(l))) creating = true;
				if ([..."ldvn"].some((l) => letters.has(l))) listing = true;
			} else positional = true;
		}
		if (creating || (positional && !listing)) this.refuse(null, '"git tag" here creates a tag.');
	}

	judgePush(u: Unit, dir: string | null, vals: string[]): void {
		let force: string | null = null;
		let widen: string | null = null;
		let odd: string | null = null;
		let tagflag: string | null = null;
		let nofollow = false;
		const pos: string[] = [];
		let take = false;
		let after = false;
		for (const v of vals) {
			if (take) {
				take = false;
				continue;
			}
			if (after) {
				pos.push(v);
				continue;
			}
			if (v === "--") {
				after = true;
				continue;
			}
			if (v.startsWith("--")) {
				const name = v.slice(2).split("=")[0];
				if (PUSH_PLAIN_LONG.has(name) && !v.includes("=")) {
					nofollow = nofollow || name === "no-follow-tags";
					continue;
				}
				odd = odd || v;
				if (name) {
					if (PUSH_FORCING.some((w) => w.startsWith(name))) force = force || v;
					if (PUSH_WIDENING.some((w) => w.startsWith(name))) widen = widen || v;
					if (PUSH_TAGGING.some((w) => w.startsWith(name))) tagflag = tagflag || v;
					if (!v.includes("=") && PUSH_VALUE_LONG.some((w) => w.startsWith(name))) take = true;
				}
				continue;
			}
			if (v.startsWith("-") && v.length > 1) {
				const letters = v.slice(1);
				if ([...letters].some((l) => !PUSH_PLAIN_SHORT.has(l))) odd = odd || v;
				if (letters.includes("f") || letters.includes("d")) force = force || v;
				if (letters.endsWith("o")) take = true;
				continue;
			}
			pos.push(v);
		}

		// What can be decided from the words alone is decided before any git
		// runs, so a long list of refspecs cannot outrun the time budget.
		if (this.baseOnly && !this.lead) {
			const cheap =
				tagflag ||
				pos.some((w) => {
					const l = w.toLowerCase();
					return l.replace(/^\++/, "").startsWith("refs/tags/") || l.includes(":refs/tags/") || VERSION_TAG_RE.test(w.replace(/^\++/, "")) || w === "tag";
				});
			this.refuse(`${this.who} is not the lead, so it pushes nothing, the base branch included.`, this.tagblock && cheap ? "This push may send a tag." : null);
		}
		if (this.baseOnly && pos.length > 2) this.refuse(`It names ${pos.length - 1} refspecs, and the base branch or one version tag goes alone.`);
		if (pos.length > MAX_PUSH_WORDS) this.unread(`the push names ${pos.length} words after its options, more than the ${MAX_PUSH_WORDS} this check reads`);
		const sure = u.sure && dir !== null;
		const repo = sure && this.isRepo(dir);

		// Does it send a tag? yes, no or maybe.
		let tagged = tagflag ? "yes" : "no";
		for (const w of pos) {
			const k = this.refKind(dir, sure, w);
			if (k === "tag") tagged = "yes";
			else if (k === "maybe" && tagged === "no") tagged = "maybe";
		}
		if (!sure && tagged === "no") tagged = "maybe";
		let follow: Config | null = null;
		let mirror: Config | null = null;
		let configured: Config | null = null;
		let recurse: [Config, Config] | null = null;
		if (repo) {
			follow = this.config(dir, "--type=bool", "--get", "push.followTags");
			mirror = this.config(dir, "--get-regexp", "^remote\\..*\\.mirror$");
			configured = this.config(dir, "--get-regexp", "^remote\\..*\\.push$");
			recurse = [this.config(dir, "--get", "push.recurseSubmodules"), this.config(dir, "--type=bool", "--get", "submodule.recurse")];
			if ((follow[0] === "set" && follow[1] === "true" && !nofollow) || mirror[0] === "set") tagged = "yes";
			else if ((follow[0] === "error" || mirror[0] === "error") && tagged === "no") tagged = "maybe";
			if (pos.length <= 1 && configured[0] !== "unset" && tagged === "no") tagged = "maybe";
		}
		let rel: string | null = null;
		if (this.tagblock && tagged !== "no") rel = tagged === "yes" ? "This push sends a tag." : "This push may send a tag, and which refs it sends cannot be read here.";

		if (!this.baseOnly) {
			if (rel) this.refuse(null, rel);
			return;
		}
		if (!this.lead) this.refuse(`${this.who} is not the lead, so it pushes nothing, the base branch included.`, rel);
		if (!sure) this.refuse("Where this push runs cannot be read: it changes directory in a way this check does not follow. Run it as git -C <path> push, with no cd before it.", rel);
		if (force) this.refuse(`"${force}" forces or deletes, and the base branch is only ever pushed plainly.`, rel);
		if (widen) this.refuse(`"${widen}" sends more than the base branch.`, rel);
		if (odd) this.refuse(`"${odd}" is not an option a plain push here takes; those are -u, -q, -v, -n, --porcelain, --atomic, --no-verify and --no-follow-tags.`, rel);
		if (!this.base) this.refuse("With no base branch known, nothing is pushed.", rel);
		if (!repo) this.refuse(`${dir} is not a repository this check can read.`, rel);
		if (pos.length > 2) this.refuse(`It names ${pos.length - 1} refspecs, and the base branch or one version tag goes alone.`, rel);
		const [mir, fol, conf, rec] = [mirror as Config, follow as Config, configured as Config, recurse as [Config, Config]];
		if (mir[0] !== "unset") this.refuse("The repository's config sets a remote's mirror key, which makes a push send every ref.", rel);
		if (fol[0] === "error" || (fol[1] === "true" && !nofollow)) this.refuse("push.followTags is set, so this push would send tags with it; add --no-follow-tags.", rel);
		const [rs, sr] = rec;
		if (rs[0] === "error" || (rs[0] === "set" && rs[1] !== "no" && rs[1] !== "check") || sr[0] === "error" || (sr[0] === "set" && sr[1] === "true")) {
			this.refuse("The repository's config pushes submodules with it, which sends their refs too.", rel);
		}
		const b = this.base;
		if (pos.length <= 1) {
			const [rc, head] = this.git(dir, "symbolic-ref", "-q", "HEAD");
			if (rc !== 0 || head !== `refs/heads/${b}`) {
				this.refuse(`A bare git push from ${dir} sends ${head.startsWith("refs/heads/") ? head.slice("refs/heads/".length) : "a detached HEAD"}, which is not the base branch, ${b}.`, rel);
			}
			if (conf[0] !== "unset") {
				this.refuse(`The repository's config names push refspecs for a remote, and they, not the base branch alone, decide what a bare push sends. Name the branch: git push <remote> ${b}.`, rel);
			}
			const pd = this.config(dir, "--get", "push.default");
			if (pd[0] === "error" || (pd[0] === "set" && pd[1] !== "simple" && pd[1] !== "current")) {
				this.refuse(`push.default is "${pd[1]}", so a bare push may send more than ${b}, or send it somewhere else. Name the branch: git push <remote> ${b}.`, rel);
			}
			if (rel) this.refuse(null, rel);
			return;
		}
		const ref = pos[1];
		if ([b, `refs/heads/${b}`, `${b}:${b}`, `${b}:refs/heads/${b}`, `refs/heads/${b}:${b}`, `refs/heads/${b}:refs/heads/${b}`].includes(ref)) {
			if (tagged !== "no") this.refuse(`This push would send a tag with ${b}.`, rel);
			return;
		}
		let tag: string | null = null;
		const colon = ref.indexOf(":");
		if (ref.startsWith("refs/tags/") && colon < 0) tag = ref.slice("refs/tags/".length);
		else if (colon >= 0 && ref.slice(0, colon) === ref.slice(colon + 1) && ref.startsWith("refs/tags/")) tag = ref.slice(0, colon).slice("refs/tags/".length);
		else if (colon < 0 && this.refKind(dir, true, ref) === "tag") tag = ref;
		if (tag !== null && VERSION_TAG_RE.test(tag)) {
			if (this.tagblock) this.refuse(null, `Pushing the tag ${tag} is a tag push.`);
			const [crc, ckind] = this.git(dir, "cat-file", "-t", `refs/tags/${tag}`);
			if (!(crc === 0 && ckind === "tag")) this.refuse(`${tag} is a lightweight tag, or no tag at all, and only an annotated tag is pushed.`);
			if (this.git(dir, "show-ref", "--verify", "-q", `refs/heads/${tag}`)[0] === 0) this.refuse(`A branch is named ${tag} too, so the push cannot be read as the tag alone.`);
			const [rc, commit] = this.git(dir, "rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`);
			if (rc !== 0 || this.git(dir, "merge-base", "--is-ancestor", commit, `refs/heads/${b}`)[0] !== 0) this.refuse(`${tag} points at a commit that is not on the base branch, ${b}.`);
			return;
		}
		if (tag !== null || tagged !== "no") this.refuse(`"${ref}" is a tag, and the one tag pushed is an annotated vMAJOR.MINOR.PATCH on the base branch, pushed alone.`, rel);
		this.refuse(`"${ref}" is not the base branch, ${b}.`);
	}

	judgeGh(u: Unit, reader: Reader): void {
		const words = u.words;
		const suffix = u.origin === "suffix";
		let i = 1;
		while (i < words.length) {
			const v = words[i].value;
			if (v === "-R" || v === "--repo") {
				i += 2;
				continue;
			}
			if (v !== null && (v.startsWith("--repo=") || (v.startsWith("-R") && v.length > 2))) {
				i += 1;
				continue;
			}
			break;
		}
		if (i >= words.length) return;
		const g = words[i];
		if (g.value === null) {
			if (!suffix) this.unread(`"${g.raw}" ${g.why || "expands"}, so which gh command runs cannot be read`);
			return;
		}
		const group = g.value;
		if (group.startsWith("-")) {
			if (group === "--version" || group === "--help" || group === "-h" || suffix) return;
			this.unread(`"${group}" stands before gh's command, and gh may read the next word as its value`);
		}
		if (u.xargs && !suffix) this.unread("xargs hands gh words from standard input, which no check can see");
		if (!GH_GROUPS.has(group)) {
			if (!suffix) this.unread(`"gh ${group}" is not one of gh's own commands, so it may be an alias or an extension, which can run anything`);
			return;
		}
		let sub: string | null = null;
		const j = i + 1;
		const gated = group === "pr" || group === "release" || group === "extension";
		if (j < words.length) {
			const s = words[j];
			if (s.value === null) {
				if (!suffix && gated) this.unread(`"${s.raw}" ${s.why || "expands"}, so which gh ${group} command runs cannot be read`);
				return;
			}
			if (s.value.startsWith("-") && gated && !suffix && s.value !== "--help" && s.value !== "-h") {
				this.unread(`"${s.value}" stands before the gh ${group} subcommand, and gh may read the next word as its value`);
			}
			sub = s.value;
		}
		if (group === "pr" && (sub === "create" || sub === "new")) {
			if (this.baseOnly) this.refuse('"gh pr create" opens a pull request, and the branch it proposes is a push the human did not grant.');
			return;
		}
		if (group === "extension" && sub === "exec" && !suffix) this.unread('"gh extension exec" runs an extension, which can do anything');
		if (group === "release" && (sub === "create" || sub === "new")) this.judgeRelease(words.slice(j + 1), reader);
	}

	judgeRelease(args: Word[], reader: Reader): void {
		if (this.tagblock) this.refuse(null, '"gh release create" makes a GitHub release, and creates its tag on the remote when the tag is missing.');
		if (this.release === "tag") this.refuse(null, '"gh release create" makes a GitHub release.');
		if (this.release !== "github") return;
		if (!this.lead) this.refuse(null, `${this.who} is not the lead.`);
		if (reader.assigns.length) this.unread(`the command assigns ${reader.assigns[0]}, and a variable can change what gh does`);
		const vals: string[] = [];
		for (const a of args) {
			if (a.value === null) this.unread(`"${a.raw}" ${a.why || "expands"}, so what gh is given cannot be read`);
			vals.push(a.value as string);
		}
		if (vals.includes("--")) this.refuse(null, `"--" ends gh's options, so a --verify-tag after it is not a flag; write the command without it.`);
		const odd = vals.filter((v) => v.includes("verify-tag") && v !== "--verify-tag");
		if (odd.length) this.refuse(null, `"${odd[0]}" sets verify-tag with a value, and only the bare --verify-tag is read: a later --verify-tag=false turns it off.`);
		if (vals.filter((v) => v === "--verify-tag").length !== 1) {
			this.refuse(null, "Give --verify-tag exactly once, bare, which makes gh stop when the tag is not already on the remote; without it gh creates the tag itself.");
		}
		if (vals.some((v) => v === "--target" || v.startsWith("--target="))) this.refuse(null, "--target names where gh creates a missing tag, and the tag must already exist.");
	}
}

// Whether the raw text names git or gh with a word about pushing, tagging or
// releasing, for the commands no lexing can open.
function relevant(command: string, policy: Policy): boolean {
	const flat = command.toLowerCase().replace(/[\\"']/g, "");
	const words = new Set(flat.split(/[^a-z0-9_./-]+/));
	const names = new Set([...words].map((w) => w.replace(/\/+$/, "").split("/").pop() as string));
	const git = [...names].some((n) => n === "git" || n.startsWith("git-"));
	const gh = names.has("gh");
	if (policy.gitblock && git && ([...names].some((n) => GIT_WORDS.has(n)) || [...names].some((n) => n.startsWith("git-") && GIT_WORDS.has(n.slice(4))))) return true;
	return gh && [...names].some((n) => GH_WORDS.has(n));
}

// Python's os.path.realpath, which is not strict: each component that is a
// symlink is followed, a dangling one included, and a component that does
// not exist ends the resolving, the rest kept as written. A symlink loop
// stops there too.
export function pyRealpath(filename: string): string {
	const seen = new Map<string, string | null>();
	const join = (a: string, b: string) => (a === "/" ? `/${b}` : `${a}/${b}`);
	const inner = (start: string, restIn: string): [string, boolean] => {
		let path = start;
		let rest = restIn;
		if (rest.startsWith("/")) {
			rest = rest.slice(1);
			path = "/";
		}
		while (rest) {
			const k = rest.indexOf("/");
			const name = k < 0 ? rest : rest.slice(0, k);
			rest = k < 0 ? "" : rest.slice(k + 1);
			if (!name || name === ".") continue;
			if (name === "..") {
				path = path ? posix.dirname(path) : "..";
				continue;
			}
			const next = join(path, name);
			let link = false;
			try {
				link = lstatSync(next).isSymbolicLink();
			} catch {}
			if (!link) {
				path = next;
				continue;
			}
			if (seen.has(next)) {
				const known = seen.get(next);
				if (known != null) {
					path = known;
					continue;
				}
				return [rest ? join(next, rest) : next, false];
			}
			seen.set(next, null);
			const [target, ok] = inner(path, readlinkSync(next));
			if (!ok) return [rest ? join(target, rest) : target, false];
			seen.set(next, target);
			path = target;
		}
		return [path, true];
	};
	const abs = filename.startsWith("/") ? filename : join(process.cwd(), filename);
	return posix.normalize(inner("/", abs)[0]);
}

// The settings guard's write-tool half: no agent but the lead aims a write
// tool at the main checkout's .claude/coder-fleet.json, through a symlink, a
// hard link or another case of the name.
function guardPath(req: PolicyRequest): void {
	const path = req.path || "";
	if (!path) return;
	const cwd = req.cwd || "";
	const config = posix.join(req.main || "", ".claude", "coder-fleet.json");
	const target = pyRealpath(path.startsWith("/") ? path : `${cwd || "/"}/${path}`);
	// APFS, the default macOS filesystem, folds case.
	let same = target.toLowerCase() === pyRealpath(config).toLowerCase();
	try {
		if (!same && existsSync(target) && existsSync(config)) {
			const a = statSync(target);
			const b = statSync(config);
			same = a.dev === b.dev && a.ino === b.ino;
		}
	} catch {}
	if (same) {
		throw new Refuse(
			`settings guard: only the lead changes ${config}, which holds the push and release settings the scope hook enforces. Say in your handoff what should change, and the lead decides.`,
		);
	}
}

// One request, as push-policy.py answered it: "ok", or "deny", a tab and the
// reason. Anything that goes wrong in the reading is thrown to the caller,
// which refuses.
export function judgeRequest(req: PolicyRequest): string {
	frames = 0;
	const policy = new Policy(req);
	const active = Boolean(req.active);
	const command = req.command || "";
	try {
		if (req.mode === "path") {
			guardPath(req);
			return "ok";
		}
		if (command.length > MAX_COMMAND) {
			if (active && relevant(command, policy)) policy.unread(`the command is over ${MAX_COMMAND} bytes`);
			return "ok";
		}
		const reader = new Reader();
		reader.read(command, policy.cwd, true, "command", 0);
		if (active) {
			if (relevant(command, policy)) {
				if (reader.open.length) policy.unread(`it has ${reader.open[0]}`);
				if (reader.strings.length) policy.unread(reader.strings[0]);
				if (reader.stdinShell) policy.unread("it pipes text into a shell, and what the shell runs is not in the command");
				if (reader.units.length > MAX_UNITS) policy.unread(`it holds ${reader.units.length} commands, more than the ${MAX_UNITS} this check reads`);
			}
			for (const [name, text] of reader.coded) {
				if (relevant(text, policy)) policy.unread(`"${name}" runs code that names git or gh, which this check cannot read; run the git or gh command itself`);
			}
			policy.judge(reader);
		}
	} catch (e) {
		if (e instanceof Refuse) return `deny\t${e.message.replace(/[\n\t]/g, " ")}`;
		if (e instanceof TooDeep) return "deny\tpush and release policy: the command nests too deeply to read, so it is refused.";
		throw e;
	}
	return "ok";
}

// --- the scope hook's half: push-policy.sh's push_release_policy -------------

// One tool call as the scope hook reads it.
export type Call = {
	agentId: string;
	agent: string;
	toolName: string;
	filePath: string;
	cwd: string;
	// The command as sent, trailing newlines dropped and line continuations
	// joined.
	raw: string;
};

const GUARD_SAYS =
	"settings guard: only the lead changes the main checkout's .claude/coder-fleet.json, which holds the push and release settings the scope hook enforces, so no other agent's command may name that file at all, to read it or to write it, and none may run scripts/fleet-agents.sh base, push or release with a value. Say in your handoff what should change, and the lead decides.";
const SETTINGS_RE = /fleet-agents\.sh([^;|&]*\s)?(push|release|base)\s+[^\s;|&]/;

// A request judged here; anything that throws is a check that failed, which
// the callers below read as refusing.
function ask(req: PolicyRequest): string {
	try {
		return judgeRequest(req);
	} catch {
		return "";
	}
}

// null when the call passes, or the reason it is denied.
export function pushReleasePolicy(call: Call): string | null {
	const lead = !call.agentId && (call.agent === "" || call.agent === "lead");
	const who = lead ? "the lead" : call.agent || "this agent";
	const start = process.env.CLAUDE_PROJECT_DIR || call.cwd;

	switch (call.toolName) {
		case "Write":
		case "Edit":
		case "MultiEdit":
		case "NotebookEdit": {
			if (lead) return null;
			if (!call.filePath || !start || !isDir(start)) return null;
			const root = configRoot(start) ?? "";
			if (!root) return null;
			const out = ask({ mode: "path", guard: true, path: call.filePath, cwd: call.cwd, main: root });
			if (out === "ok") return null;
			if (out.startsWith("deny\t")) return out.slice(5);
			if (call.filePath.toLowerCase().includes("coder-fleet")) {
				return "settings guard: whether this write reaches the main checkout's .claude/coder-fleet.json could not be checked - the check failed - and only the lead changes that file.";
			}
			return null;
		}
		case "Bash":
			break;
		default:
			return null;
	}

	if (!call.raw) return null;
	const flat = call.raw.replace(/\\\n/g, "").replace(/[\\"']/g, "").replace(/[A-Z]/g, (c) => c.toLowerCase());
	if (!lead) {
		if (flat.includes("coder-fleet.json")) return GUARD_SAYS;
		if (SETTINGS_RE.test(flat)) return GUARD_SAYS;
	}
	const need = ["git", "gh", "eval", "push", "tag", "release"].some((w) => flat.includes(w)) || call.raw.includes("$'");
	if (!need) return null;
	if (!start || !isDir(start)) return null;
	if (!fleetGit(["-C", start, "rev-parse", "--git-dir"]).ok) return null;
	const root = configRoot(start) ?? "";

	const t = trunk(root).vars;
	if (`${t.FLEET_CONFIG_PUSH}|${t.FLEET_CONFIG_RELEASE}` === "all|unset") return null;
	const noteOf = (state: string, reason: string) => (state === "invalid" || state === "unread" ? reason : "");
	const out = ask({
		mode: "bash",
		command: call.raw,
		cwd: call.cwd,
		who,
		lead,
		active: true,
		push: t.FLEET_CONFIG_PUSH || "all",
		release: t.FLEET_CONFIG_RELEASE || "unset",
		base: t.FLEET_TRUNK || "",
		base_reason: t.FLEET_TRUNK_REASON || "",
		push_note: noteOf(t.FLEET_CONFIG_PUSH_STATE, t.FLEET_CONFIG_PUSH_REASON),
		release_note: noteOf(t.FLEET_CONFIG_RELEASE_STATE, t.FLEET_CONFIG_RELEASE_REASON),
	});
	if (out === "ok") return null;
	if (out.startsWith("deny\t")) return out.slice(5);
	return `push and release policy: this command could not be judged - the check behind it failed - and under "push": "${t.FLEET_CONFIG_PUSH}" and "release": "${t.FLEET_CONFIG_RELEASE}" in .claude/coder-fleet.json a command that cannot be judged is refused.`;
}

// jq's `a // b // ""`: the first that is neither null nor false, as text.
function alt(...vs: unknown[]): string {
	for (const v of vs) if (v !== null && v !== undefined && v !== false) return str(v);
	return "";
}

// The call as the scope hook reads it from the hook's input, an object or
// null. Each field is read as `jq -r` printed it into a shell variable, so
// trailing newlines are gone.
export function callFromEvent(ev: Record<string, unknown>): Call & { agentType: string; transcriptPath: string } {
	const ti = obj(ev.tool_input);
	const chompNl = (s: string) => s.replace(/\n+$/, "");
	const agentType = chompNl(str(ev.agent_type));
	return {
		agentType,
		agent: agentType.slice(agentType.lastIndexOf(":") + 1),
		agentId: chompNl(str(ev.agent_id)),
		toolName: chompNl(str(ev.tool_name)),
		cwd: chompNl(str(ev.cwd)),
		filePath: chompNl(alt(ti.file_path, ti.notebook_path, ti.path)),
		// A line continuation is a backslash and the newline after it, which the
		// shell deletes, joining the words either side.
		raw: chompNl(alt(ti.command)).replace(/\\\n/g, ""),
		transcriptPath: chompNl(str(ev.transcript_path)),
	};
}

const READ_FAILED = "deny\tpush and release policy: the scope hook sent a request this check could not read, so the command is refused.";

// `boards fleet push-policy`: one JSON request on stdin, push-policy.py's
// interface, answered with "ok" or "deny", a tab and the reason. Exits 1 with
// nothing printed when the check itself fails, which the caller refuses.
// `boards fleet push-policy hook`: the hook's input on stdin, judged as the
// scope hook judges it, answered with the word allow or a deny as JSON.
export async function pushPolicyCommand(args: string[]): Promise<number> {
	const input = await readInput();
	if (args[0] === "hook") {
		const ev = parseEvent(input);
		const why = ev ? pushReleasePolicy(callFromEvent(ev)) : null;
		process.stdout.write(why === null ? "allow\n" : `${denyJson(why)}\n`);
		return 0;
	}
	let req: PolicyRequest;
	try {
		req = JSON.parse(input) as PolicyRequest;
		if (!req || typeof req !== "object") throw new Error("not an object");
	} catch {
		process.stdout.write(`${READ_FAILED}\n`);
		return 0;
	}
	process.stdout.write(`${judgeRequest(req)}\n`);
	return 0;
}

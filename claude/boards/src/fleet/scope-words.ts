// How the scope hook reads a command's text, ported from
// hooks/enforce-agent-scope.sh, where each of these was a function built from
// sed, awk, grep and bash's own word splitting. They keep that file's reading
// exactly, its known gaps included, because the scope contract is written
// against it. This is not a shell, and the scope hook is a role reminder, not
// a containment boundary: the sandbox is what contains an agent.
//
// Three readings recur. A "word" is what bash's default word splitting makes:
// runs of anything but space, tab and newline. [[:space:]] in sed, grep and
// bash regexes is space, tab, newline, vertical tab, form feed and carriage
// return (SP below). And sed and grep read a line at a time, so no pattern
// below crosses a newline.

export const SP = "[ \\t\\n\\v\\f\\r]";
const SPC = " \\t\\n\\v\\f\\r";

export function words(s: string): string[] {
	return s.split(/[ \t\n]+/).filter(Boolean);
}

// awk '{print $1}' on one line.
export function firstWord(s: string): string {
	return words(s)[0] ?? "";
}

export function secondWord(s: string): string {
	return words(s)[1] ?? "";
}

// Lines as `while IFS= read -r x; done <<< "$s"` reads them.
export function lines(s: string): string[] {
	return s.split("\n");
}

// `${tok##*/}`.
export function base(tok: string): string {
	return tok.slice(tok.lastIndexOf("/") + 1);
}

// Absolute, lexically normalised. No realpath: the target of a Write may not
// exist yet.
export function lexAbs(p: string, cwd: string): string {
	let q = p;
	if (q.startsWith("/")) {
	} else if (q.startsWith("~/")) q = `${process.env.HOME ?? ""}/${q.slice(2)}`;
	else q = `${cwd || "/"}/${q}`;
	const out: string[] = [];
	for (const seg of q.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") out.pop();
		else out.push(seg);
	}
	return out.length ? `/${out.join("/")}` : "/";
}

// --------------------------------------------------------- quoting the command
// Only inert quotes go: a span whose content is empty or made entirely of the
// characters a command name or a plain path can hold, so `""git` is `git`.
// The backslash-escaped forms go first, and a lone escaped quote left over is
// hidden behind a placeholder while the plain rules run. An odd number of
// quotes is left alone.
const INERT_DQ = "\x01";
const INERT_SQ = "\x02";
export function stripInertQuotes(s: string): string {
	return s
		.replace(/\\"([A-Za-z0-9_./-]*)\\"/g, "$1")
		.replace(/\\'([A-Za-z0-9_./-]*)\\'/g, "$1")
		.replace(/\\"/g, INERT_DQ)
		.replace(/\\'/g, INERT_SQ)
		.replace(/"([A-Za-z0-9_./-]*)"/g, "$1")
		.replace(/'([A-Za-z0-9_./-]*)'/g, "$1")
		.replace(/\x01/g, '\\"')
		.replace(/\x02/g, "\\'");
}

// The payload of `bash -c "..."` and its kin, recovered before the quoted
// spans are erased and appended as lines of their own, so every rule's segment
// scan reads it. Sibling occurrences are found in one pass; a nested one by
// repeating the pass over what the last found, at most three more times. A
// payload is appended exactly as written, so a quote still carrying its
// backslash is not a quote to the next pass: that is what bounds the depth.
const PAYLOAD_RE = new RegExp(`(^|[^A-Za-z0-9_.-])(bash|sh|zsh|dash|ksh)${SP}+-[A-Za-z]*c${SP}+('[^'\\n]*'|"([^"\\\\\\n]|\\\\[^\\n])*"|[^${SPC}'"]+)`, "g");
const QUOTED_END_RE = /('[^'\n]*'|"([^"\\\n]|\\[^\n])*")$/;
const BARE_END_RE = new RegExp(`${SP}([^${SPC}'"]+)$`);

function recoverOnce(text: string): string {
	let extra = "";
	for (const line of lines(text)) {
		for (const m of line.matchAll(PAYLOAD_RE)) {
			const found = m[0];
			if (!found) continue;
			let payload: string;
			const q = QUOTED_END_RE.exec(found);
			if (q) payload = q[1].slice(1, -1);
			else {
				const b = BARE_END_RE.exec(found);
				if (!b) continue;
				payload = b[1];
			}
			extra += `\n${payload}`;
		}
	}
	return extra.replace(/\n+$/, "");
}

export function recoverPayloads(text: string): string {
	let all = recoverOnce(text);
	let found = all;
	let pass = 0;
	while (found && pass < 3) {
		found = recoverOnce(found);
		if (found) all += `\n${found}`;
		pass += 1;
	}
	return all.replace(/\n+$/, "");
}

// ------------------------------------------------------------- the scan bound
// A hook that blows its 10-second timeout renders no decision at all, so a
// command is read to SCAN_MAX bytes and SEGMENT_MAX segments. Truncating is not
// skipping: the head is still read. The bounds say so in the log.
export const SCAN_MAX = 8192;
export const SEGMENT_MAX = 16;

export function boundScan(text: string, what: string, log: (m: string) => void): string {
	if (text.length <= SCAN_MAX) return text;
	log(
		`${what} is ${text.length} bytes, ${text.length - SCAN_MAX} over the ${SCAN_MAX}-byte scan bound; scanning the first ${SCAN_MAX} bytes only, so a verb past that point will not be seen`,
	);
	return text.slice(0, SCAN_MAX);
}

// At most SEGMENT_MAX segments, blank ones dropped before the count so they
// cannot push a verb past the bound.
export function boundSegments(segs: string, log: (m: string) => void): string {
	const kept = lines(segs).filter((l) => !new RegExp(`^${SP}*$`).test(l));
	if (kept.length <= SEGMENT_MAX) return kept.join("\n");
	log(
		`the command splits into ${kept.length} segments, ${kept.length - SEGMENT_MAX} over the ${SEGMENT_MAX}-segment scan bound; scanning the first ${SEGMENT_MAX} only, so a verb in a later segment will not be seen`,
	);
	return kept.slice(0, SEGMENT_MAX).join("\n");
}

// Split on the shell operators that start a new command.
export function splitOps(s: string): string {
	return s.replace(/(\|\||&&|;|\||&)/g, "\n");
}

export function trimSeg(s: string): string {
	return s.replace(new RegExp(`^${SP}+`), "").replace(new RegExp(`${SP}+$`), "");
}

// Erases single- and double-quoted spans, for redirection and process
// substitution, which are inert inside either.
export function stripQuoted(s: string): string {
	return s.replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""');
}

// Erases single-quoted spans only: $( ) and backticks run inside double quotes.
export function stripSingleQuoted(s: string): string {
	return s.replace(/'[^'\n]*'/g, "''");
}

// Discarding output is not a state change.
export function dropDevNull(s: string): string {
	return s.replace(/[0-9]?>>?[ \t\v\f\r]*\/dev\/null/g, "");
}

function anyLine(s: string, re: RegExp): boolean {
	return lines(s).some((l) => re.test(l));
}

// sed writes with no redirection: w, W, a w flag, and e runs a program.
const SED_WRITE_RE = new RegExp(`(^|[${SPC};{}0-9$/,'"])[wW](${SP}|$)|(^|[${SPC};{}'"])e(${SP}|$)|s[/|#,:].*[/|#,:][A-Za-z0-9]*w(${SP}|$)`);
export function sedWrites(cmd: string): boolean {
	return anyLine(cmd, SED_WRITE_RE);
}

export function runsSed(scan: string): boolean {
	return anyLine(scan, new RegExp(`(^|[${SPC};|&])sed(${SP}|$)`));
}

// A quote opening a word whose first character is -.
const QUOTED_FLAG_RE = new RegExp(`(^|${SP})\\$?["']-`);
export function hasQuotedFlag(cmd: string): boolean {
	return anyLine(cmd, QUOTED_FLAG_RE);
}

// ------------------------------------------------------------- word readers

// What a backslash does: before whitespace it joins the word (a placeholder
// keeps the path whole); anywhere else it quotes the next character and goes.
export function unescapeWords(s: string): string {
	return lines(s)
		.map((l) => l.replace(/\\[ \t\v\f\r]/g, "_").replace(/\\(.)/g, "$1"))
		.join("\n");
}

export const COMMAND_WRAPPERS = new Set(["command", "env", "builtin", "exec", "nohup", "time", "xargs", "timeout", "nice", "stdbuf", "setsid", "ionice"]);
const DURATION_RE = /^[0-9]+(\.[0-9]+)?[smhd]?$/;

// Shell syntax in front of a command word: openers, closers, keywords, a
// for-loop header (which runs nothing) and a leading redirection.
const LEADING_SPACE_RE = new RegExp(`^${SP}+([\\s\\S]*)$`);
const LEADING_KEYWORD_RE = new RegExp(`^(!|\\{|\\}|then|do|else|elif|if|while|until|fi|done|esac)(${SP}[\\s\\S]*)?$`);
const FOR_HEADER_RE = new RegExp(`^for${SP}+[A-Za-z_][A-Za-z0-9_]*(${SP}+in(${SP}[\\s\\S]*)?)?$`);
const LEADING_REDIRECT_RE = new RegExp(`^[0-9]*(>>?|<)${SP}*[^${SPC};|&<>()]+([\\s\\S]*)$`);
export function stripLeadingSyntax(input: string): string {
	let s = input;
	for (;;) {
		let m = LEADING_SPACE_RE.exec(s);
		if (m) {
			s = m[1];
			continue;
		}
		if (s.startsWith("(")) {
			s = s.slice(1);
			continue;
		}
		m = LEADING_KEYWORD_RE.exec(s);
		if (m) {
			s = m[2] ?? "";
			continue;
		}
		if (FOR_HEADER_RE.test(s)) return "";
		m = LEADING_REDIRECT_RE.exec(s);
		if (m) {
			s = m[2];
			continue;
		}
		return s;
	}
}

const DROP_FIRST_RE = new RegExp(`^[^${SPC}]+${SP}+`);

// The segment with leading assignments and wrapper commands removed, the
// wrappers' own options and a timeout's duration with them.
export function commandWords(segIn: string): string {
	let seg = stripLeadingSyntax(segIn);
	let afterWrapper = false;
	for (;;) {
		const first = firstWord(seg);
		if (first === "") break;
		if (first.includes("=")) {
		} else if (first.startsWith("-")) {
			if (!afterWrapper) break;
		} else if (/^[0-9]/.test(first)) {
			if (!(afterWrapper && DURATION_RE.test(first))) break;
		} else if (COMMAND_WRAPPERS.has(base(first))) afterWrapper = true;
		else break;
		const next = seg.replace(DROP_FIRST_RE, "");
		if (next === seg) {
			seg = "";
			break;
		}
		seg = next;
	}
	return seg;
}

export function leadingToken(seg: string): string {
	return base(unescapeWords(firstWord(commandWords(seg))));
}

// The subcommand a segment runs: the first word after the command word that
// is not an option or an option's value.
export function subVerb(seg: string): string {
	const ws = words(unescapeWords(commandWords(seg)));
	let skip = false;
	for (const tok of ws.slice(1)) {
		if (skip) {
			skip = false;
			continue;
		}
		if (["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--attr-source", "--config-env"].includes(tok)) {
			skip = true;
			continue;
		}
		if (tok.startsWith("-")) continue;
		return tok;
	}
	return "";
}

// The install verb is the first word that is one, scanning past a non-verb
// word only when an option preceded it.
const INSTALL_VERBS = new Set(["install", "i", "ci", "add", "require", "get", "remove", "uninstall", "update", "upgrade", "link"]);
export function installVerb(seg: string): string {
	const ws = words(unescapeWords(commandWords(seg)));
	let prev = "";
	for (const tok of ws.slice(1)) {
		if (tok.startsWith("-")) {
			prev = tok;
			continue;
		}
		if (INSTALL_VERBS.has(tok)) return tok;
		if (prev.startsWith("-")) {
			prev = "";
			continue;
		}
		return "";
	}
	return "";
}
export { INSTALL_VERBS };

// ------------------------------------------------------------------- gh words

// "group sub", "api", "option:<word>" when an option other than -R/--repo
// stands before the pair, or the group alone.
export function ghPair(seg: string): string {
	const ws = words(unescapeWords(commandWords(seg)));
	let group = "";
	let skip = false;
	for (const tok of ws.slice(1)) {
		if (skip) {
			skip = false;
			continue;
		}
		if (tok === "-R" || tok === "--repo") {
			skip = true;
			continue;
		}
		if (/^-R./.test(tok) || tok.startsWith("--repo=")) continue;
		if (tok.startsWith("-")) return `option:${tok}`;
		if (!group) {
			group = tok;
			if (group === "api") return "api";
			continue;
		}
		return `${group} ${tok}`;
	}
	return group;
}

const GH_API_ENDPOINT_RE = /^[A-Za-z0-9_./-]+(\?[A-Za-z0-9_.,:%+=/-]*)?$/;
const GH_API_ACCEPT_RE = /^[Aa][Cc][Cc][Ee][Pp][Tt]:/;

// Why a gh api segment is not a plain GET, or "".
export function ghApiDenial(seg: string): string {
	const ws = words(unescapeWords(commandWords(seg)));
	let state = "before";
	let endpoint = "";
	for (const tok of ws) {
		if (state === "before") {
			if (tok === "api") state = "flags";
			continue;
		}
		if (tok.includes("'") || tok.includes('"')) return `"${tok}" is quoted, so what it says cannot be read`;
		if (state === "method") {
			state = "flags";
			if (tok === "GET" || tok === "get") continue;
			return `the method is "${tok}"`;
		}
		if (state === "value" || state === "header") {
			if (tok.startsWith("-")) return `the option value "${tok}" starts with -, and gh reads it as a value while it looks like a flag`;
			if (tok.includes("?")) return `the option value "${tok}" holds a ?, which the shell expands`;
			if (state === "header" && !GH_API_ACCEPT_RE.test(tok)) return `the header "${tok}" is not an Accept header`;
			state = "flags";
			continue;
		}
		if (["--paginate", "--slurp", "-i", "--include"].includes(tok)) continue;
		if (["-q", "--jq", "-t", "--template"].includes(tok)) {
			state = "value";
			continue;
		}
		if (tok === "-H" || tok === "--header") {
			state = "header";
			continue;
		}
		if (/^--(jq|template|header)=./.test(tok)) {
			const v = tok.slice(tok.indexOf("=") + 1);
			if (v.startsWith("-") || v.includes("?")) return `the option value in "${tok}" starts with - or holds a ?`;
			if (tok.startsWith("--header=") && !GH_API_ACCEPT_RE.test(v)) return `the header in "${tok}" is not an Accept header`;
			continue;
		}
		if (tok === "-X" || tok === "--method") {
			state = "method";
			continue;
		}
		if (["-XGET", "-Xget", "-X=GET", "-X=get", "--method=GET", "--method=get"].includes(tok)) continue;
		if (tok.startsWith("-")) return `"${tok}" is not one of its read flags`;
		if (endpoint) return `"${tok}" is a second endpoint after "${endpoint}"`;
		if (!GH_API_ENDPOINT_RE.test(tok)) return `the endpoint "${tok}" is not a plain path with an optional query string`;
		endpoint = tok;
	}
	return "";
}

// The first word the shell would expand or re-read, as "expands:<word>" or
// "quoted:<word>", or "". qmark: whether a ? may stand.
export function wordExpansionDenial(s: string, qmark: boolean): string {
	for (const tok of words(s)) {
		if (/[${*[`]/.test(tok)) return `expands:${tok}`;
		if (!qmark && tok.includes("?")) return `expands:${tok}`;
		if (/^-.*['"]/.test(tok)) return `quoted:${tok}`;
	}
	return "";
}

export function ghWordsDenial(seg: string, pair: string): string {
	const s = unescapeWords(commandWords(seg));
	const why = wordExpansionDenial(s, pair === "api");
	if (why) return why;
	for (const tok of words(s)) {
		if (tok === "--web" || tok.startsWith("--web=")) return `web:${tok}`;
		if (/^-[A-Za-z]*w[A-Za-z]*$/.test(tok)) return `web:${tok}`;
	}
	return "";
}

// Whether xargs stands in front of gh: it hands gh words no check can see.
export function ghViaXargs(seg: string): boolean {
	for (const tok of words(unescapeWords(seg))) {
		const b = base(tok);
		if (b === "gh") return false;
		if (b === "xargs") return true;
	}
	return false;
}

// The first variable any segment assigns, "for:<name>" for a for-loop header,
// "read" for read, or "". An assignment is a NAME=value word in front of the
// command word or behind a wrapper.
const GH_FOR_HEADER_RE = new RegExp(`^(${SP}|\\(|\\{|!|(then|do|else|elif|if|while|until)${SP})*for${SP}+([A-Za-z_][A-Za-z0-9_]*)`);
export function commandAssigns(segs: string): string {
	for (const raw of lines(segs)) {
		const f = GH_FOR_HEADER_RE.exec(raw);
		if (f) return `for:${f[3]}`;
		const seg = stripLeadingSyntax(raw);
		let after = false;
		for (const tok of words(seg)) {
			const a = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(tok);
			if (a) return a[1];
			if (tok.startsWith("-")) {
				if (after) continue;
				break;
			}
			if (/^[0-9]/.test(tok)) {
				if (after && DURATION_RE.test(tok)) continue;
				break;
			}
			if (["export", "declare", "typeset", "readonly", "local"].includes(tok)) {
				after = true;
				continue;
			}
			if (tok === "read") return "read";
			if (COMMAND_WRAPPERS.has(base(tok))) {
				after = true;
				continue;
			}
			break;
		}
	}
	return "";
}

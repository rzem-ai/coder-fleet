// The spec-editor challenge gate, and the close after it, ported from
// scripts/challenge-gate.py, now a shim onto `boards fleet challenge-gate`.
//
//     run <issue>                    the gate, then close in place, then close it in place
//     check <spec> [--spec-editor-disabled]
//                                    the verdict only, no git
//     close <spec> --sha <sha>       the closed spec, to stdout
//     lint <spec> [--original <f>]   the notation, for the eval
//
// `run` is what lead.md step 3 and spec-to-card's card stage use. From
// anywhere inside the repository it reads specs/<issue>.md in the directory
// of the repo's board (~/.config/boards/<PREFIX>, src/resolve.ts), or the
// nearest parent's spec for a sub-issue, and whether the project disables
// spec-editor, read through config.ts as the spawn hook reads it. A spec
// there is outside the project's history, so nothing is committed: when the
// gate passes on an intact section it closes the spec in place, replacing the
// section with the closed marker naming the commit the repository is at and
// stripping the inline markers, written whole through a temporary file. Every
// other verdict changes nothing.
//
// The notation (docs/decisions/challenge-notation.md):
//
//     ## Challenges (spec-editor)                         the section heading
//     - C3 [must resolve] [open] The text.                one challenge per line
//     ## Challenges (spec-editor): closed in <sha>        the closed marker
//     A line ending ` [challenge C3]`                     an inline marker
//
// Output is one `<key>\t<value>` line per fact: verdict (pass | refuse),
// reason (resolved | closed-marker | disabled | no-spec | open | no-section |
// ambiguous), spec, blocking, closed, suggest and message.
//
// Exit 0 pass, 1 refuse, 2 usage, 3 the close could not be made (the spec is
// left as it was, and the caller does not build).
import { chmodSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { resolveBoard } from "../resolve.ts";
import { agentDisabled, configRead, configRoot } from "./config.ts";
import { run } from "./proc.ts";

const HEADING = "Challenges (spec-editor)";
const SECTION_RE = /^## Challenges \(spec-editor\)$/;
const CLOSED_RE = /^## Challenges \(spec-editor\): closed in [0-9a-f]{7,64}$/;
const NEAR_RE = /^#{1,6}\s*Challenges\s*\(spec-editor\)/;
const NEXT_SECTION_RE = /^## /;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const CHALLENGE_RE = /^- (C\d+) \[(must resolve|should resolve|note)\](?: (\[[^\]]*\]))?/;
const STATE_RE = /^\[(open|resolved|struck:([^\]]*))\]$/;
const MARKERS_RE = /(?: \[challenge C\d+\])+$/;
const MARKER_ID_RE = /\[challenge (C\d+)\]/g;
const ID_RE = /\bC\d+\b/;
const SHA_RE = /^[0-9a-f]{7,64}$/;
const ISSUE_RE = /^[A-Za-z]+-\d+(\.\d+)*$/;

type Facts = Array<[string, string]>;

class Usage extends Error {}

// --- bytes and lines ---------------------------------------------------------

// A spec is UTF-8 text, decoded so the regexes see characters; one that is
// not is read a byte to a character, so every rewrite stays byte-exact.
type Text = { s: string; utf8: boolean };

function decode(data: Uint8Array): Text {
	try {
		return { s: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data), utf8: true };
	} catch {
		return { s: Buffer.from(data).toString("latin1"), utf8: false };
	}
}

function encode(s: string, utf8: boolean): Buffer {
	return utf8 ? Buffer.from(s, "utf8") : Buffer.from(s, "latin1");
}

// python's str.splitlines(keepends=True). A latin1-read file is split only on
// ASCII separators, since a 0x85 byte there is part of a character.
function splitLines(t: Text): string[] {
	const sep = t.utf8 ? /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/g : /\r\n|[\n\r\v\f\x1c\x1d\x1e]/g;
	const out: string[] = [];
	let last = 0;
	for (const m of t.s.matchAll(sep)) {
		const end = (m.index ?? 0) + m[0].length;
		out.push(t.s.slice(last, end));
		last = end;
	}
	if (last < t.s.length) out.push(t.s.slice(last));
	return out;
}

// A line without its ending.
function body(line: string): string {
	if (line.endsWith("\r\n")) return line.slice(0, -2);
	if (line.endsWith("\n") || line.endsWith("\r")) return line.slice(0, -1);
	return line;
}

function ending(line: string): string {
	return line.slice(body(line).length);
}

function pyRepr(s: string): string {
	const q = s.includes("'") && !s.includes('"') ? '"' : "'";
	return q + s.replace(/\\/g, "\\\\").replace(new RegExp(q, "g"), `\\${q}`).replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + q;
}

// --- parsing -------------------------------------------------------------------

type Parsed = { sections: Array<[number, number]>; markers: number[]; near: number[] };

// Where the section and the closed marker are, outside code fences.
function parse(lines: string[]): Parsed {
	const sections: Array<[number, number]> = [];
	const markers: number[] = [];
	const near: number[] = [];
	let fence: string | null = null;
	let open: number | null = null;
	lines.forEach((line, i) => {
		const text = body(line);
		const f = FENCE_RE.exec(text);
		if (fence !== null) {
			if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !text.trim().slice(f[1].length).trim()) fence = null;
			return;
		}
		if (f) {
			fence = f[1];
			return;
		}
		if (open !== null && NEXT_SECTION_RE.test(text)) {
			sections.push([open, i]);
			open = null;
		}
		if (SECTION_RE.test(text)) open = i;
		else if (CLOSED_RE.test(text)) markers.push(i);
		else if (NEAR_RE.test(text)) near.push(i);
	});
	if (open !== null) sections.push([open, lines.length]);
	return { sections, markers, near };
}

// Every must-resolve challenge in the section not closed by the human.
function blockingIds(lines: string[], start: number, end: number): string[] {
	const blocking: string[] = [];
	for (let i = start + 1; i < end; i++) {
		const text = body(lines[i]);
		if (!text.includes("[must resolve]")) continue;
		const m = CHALLENGE_RE.exec(text);
		let ident = m ? m[1] : null;
		if (ident === null) {
			const found = ID_RE.exec(text);
			ident = found ? found[0] : `line:${i + 1}`;
		}
		if (!m || m[2] !== "must resolve") {
			blocking.push(ident);
			continue;
		}
		const s = STATE_RE.exec(m[3] ?? "");
		const closed = !!s && (s[1] === "resolved" || (s[2] !== undefined && s[2].trim() !== ""));
		if (!closed || text.includes("[open]")) blocking.push(ident);
	}
	return blocking;
}

// --- the verdict ---------------------------------------------------------------

export function verdict(data: Uint8Array, disabled = false): [number, Facts] {
	if (disabled) {
		return [
			0,
			[
				["verdict", "pass"],
				["reason", "disabled"],
				["message", "spec-editor is disabled for this project (.claude/coder-fleet.json lists it under disabledAgents), so no spec editor runs and there is no gate."],
			],
		];
	}
	const lines = splitLines(decode(data));
	const { sections, markers, near } = parse(lines);
	if (sections.length + markers.length > 1) {
		return [
			1,
			[
				["verdict", "refuse"],
				["reason", "ambiguous"],
				["message", `The spec has ${sections.length} challenges sections and ${markers.length} closed markers; it needs exactly one of the two. Remove the extra one.`],
			],
		];
	}
	if (markers.length) {
		return [
			0,
			[
				["verdict", "pass"],
				["reason", "closed-marker"],
				["message", "The challenges on this spec were closed earlier; nothing to do."],
			],
		];
	}
	if (sections.length) {
		const [start, end] = sections[0];
		const blocking = blockingIds(lines, start, end);
		if (blocking.length) {
			return [
				1,
				[
					["verdict", "refuse"],
					["reason", "open"],
					["blocking", blocking.join(" ")],
					[
						"message",
						`Must-resolve challenges are still open: ${blocking.join(", ")}. Each needs [resolved] after an edit that fixes it, or [struck: <reason>] with a reason, before building.`,
					],
				],
			];
		}
		return [
			0,
			[
				["verdict", "pass"],
				["reason", "resolved"],
				["message", "Every must-resolve challenge is resolved or struck."],
			],
		];
	}
	const facts: Facts = [
		["verdict", "refuse"],
		["reason", "no-section"],
	];
	const orphans: string[] = [];
	for (const line of lines) for (const m of body(line).matchAll(MARKER_ID_RE)) if (!orphans.includes(m[1])) orphans.push(m[1]);
	let msg =
		`The spec has neither a "## ${HEADING}" section nor a closed marker. Run spec-editor on it, or restore the section if it was deleted. ` +
		"A spec-editor denied by a permission rule is not seen here; /coder-fleet:agents disable spec-editor is what lets specs through without it, " +
		"and /kickoff offers to remove a deny rule an earlier /init left.";
	if (near.length) msg += ` Line ${near[0] + 1} looks like the heading but is not exactly it.`;
	if (orphans.length) {
		// The section that held these is gone, so each one's state is unknown,
		// and an unknown state blocks as an open one does.
		facts.push(["blocking", orphans.join(" ")]);
		msg += ` Inline markers name ${orphans.join(", ")} with no section to find them in.`;
	}
	facts.push(["message", msg]);
	return [1, facts];
}

// --- the close -------------------------------------------------------------------

// The closed spec: the section replaced by the marker, markers stripped. The
// section's trailing blank lines stay, so the heading after it keeps the blank
// line before it.
export function closeSpec(data: Uint8Array, sha: string): Buffer {
	const t = decode(data);
	const lines = splitLines(t);
	const { sections, markers } = parse(lines);
	if (sections.length !== 1 || markers.length) throw new Error("the spec has no single intact challenges section to close");
	const [start, end] = sections[0];
	let keepFrom = end;
	while (keepFrom > start + 1 && !body(lines[keepFrom - 1]).trim()) keepFrom -= 1;
	const out: string[] = [];
	lines.forEach((line, i) => {
		if (i === start) {
			const eol = ending(line) || (end < lines.length ? "\n" : "");
			out.push(`## ${HEADING}: closed in ${sha}${eol}`);
		} else if (start < i && i < keepFrom) {
			// dropped with the section
		} else out.push(body(line).replace(MARKERS_RE, "") + ending(line));
	});
	return encode(out.join(""), t.utf8);
}

// The spec with the section, its trailing blank lines and every marker gone.
function unmarked(data: Uint8Array): string {
	const lines = splitLines(decode(data));
	const [start, end] = parse(lines).sections[0];
	return lines
		.filter((_, i) => !(start <= i && i < end))
		.map((l) => body(l).replace(MARKERS_RE, "") + ending(l))
		.join("");
}

// --- lint ------------------------------------------------------------------------

// Problems with the notation, as sentences. Empty means well formed.
export function lint(data: Uint8Array, original: Uint8Array | null = null): string[] {
	const problems: string[] = [];
	const lines = splitLines(decode(data));
	const { sections, markers } = parse(lines);
	if (sections.length !== 1) problems.push(`there are ${sections.length} "## ${HEADING}" sections; a spec editor writes exactly one`);
	if (markers.length) problems.push("the spec carries a closed marker");
	if (sections.length !== 1) return problems;
	const [start, end] = sections[0];
	const ids: string[] = [];
	for (let i = start + 1; i < end; i++) {
		const text = body(lines[i]);
		if (!text.startsWith("- ")) continue;
		const m = CHALLENGE_RE.exec(text);
		if (!m) {
			problems.push(`line ${i + 1} is not "- C<n> [must resolve|should resolve|note] [<state>] <text>"`);
			continue;
		}
		const ident = m[1];
		const state = m[3];
		if (ids.includes(ident)) problems.push(`line ${i + 1} repeats the id ${ident}`);
		ids.push(ident);
		const s = STATE_RE.exec(state ?? "");
		if (!s) problems.push(`line ${i + 1}, ${ident}, has no state tag`);
		else if (original !== null && s[1] !== "open") problems.push(`line ${i + 1}, ${ident}, is ${state}; a spec editor writes every challenge [open]`);
	}
	// An empty section is well formed: the gate passes it, and a sound draft
	// should draw nothing rather than a note invented to fill the section.
	lines.forEach((line, i) => {
		if (start <= i && i < end) return;
		const text = body(line);
		const trailing = MARKERS_RE.exec(text);
		for (const m of text.matchAll(MARKER_ID_RE)) if (!ids.includes(m[1])) problems.push(`line ${i + 1} marks ${m[1]}, which is not a challenge in the section`);
		const inner = [...(trailing ? text.slice(0, trailing.index) : text).matchAll(MARKER_ID_RE)];
		if (inner.length) problems.push(`line ${i + 1} carries a marker that is not appended at the end of the line`);
	});
	if (original !== null) {
		const got = unmarked(data).replace(/[\r\n]+$/, "");
		const want = decode(original).s.replace(/[\r\n]+$/, "");
		if (got !== want) {
			const a = got.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
			const b = want.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
			const min = Math.min(a.length, b.length);
			let n = min;
			for (let k = 0; k < min; k++)
				if (a[k] !== b[k]) {
					n = k;
					break;
				}
			problems.push(`with the section and markers removed the spec differs from the original at line ${n + 1}: the editor changed prose it must leave alone`);
		}
	}
	return problems;
}

// --- git, for run only ---------------------------------------------------------

// Replace path with data through a temporary file beside it, taking the
// spec's mode, so a failure at any point leaves the old file whole.
function writeWhole(path: string, data: Buffer): void {
	const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
	try {
		writeFileSync(tmp, data, { flag: "wx", mode: 0o600 });
		chmodSync(tmp, statSync(path).mode & 0o7777);
		renameSync(tmp, path);
	} catch (e) {
		try {
			unlinkSync(tmp);
		} catch {}
		throw e;
	}
}

function findSpec(specs: string, issue: string): [string, string] | null {
	let ident = issue;
	while (true) {
		const path = join(specs, `${ident}.md`);
		try {
			if (statSync(path).isFile()) return [ident, path];
		} catch {}
		if (!ident.includes(".")) return null;
		ident = ident.slice(0, ident.lastIndexOf("."));
	}
}

// True when the project disables spec-editor, read as the spawn hook reads
// it. A file the hook would not honour disables nothing.
function specEditorDisabled(start: string): boolean {
	try {
		const c = configRead(configRoot(start) ?? "");
		return agentDisabled(c.FLEET_CONFIG_STATE, c.FLEET_CONFIG_DISABLED, "spec-editor");
	} catch {
		return false;
	}
}

function runGate(issue: string): [number, Facts] {
	if (!ISSUE_RE.test(issue)) throw new Usage(`the issue must be a board id such as CF-12 or CF-12.3; got ${pyRepr(issue)}`);
	const r = run(["git", "rev-parse", "--show-toplevel"]);
	if (!r.ok) throw new Usage("run needs to be inside a git repository");
	const start = r.stdout.trim();
	let specs: string | null = null;
	try {
		const res = resolveBoard(start);
		specs = res?.found ? res.found.paths.specs : null;
	} catch {}
	const found = specs === null ? null : findSpec(specs, issue);
	if (found === null) {
		return [
			0,
			[
				["verdict", "pass"],
				["reason", "no-spec"],
				["spec", "-"],
				["message", `No spec in the board's specs/ for ${issue} or a parent, so there is nothing to gate.`],
			],
		];
	}
	const [specId, path] = found;
	const original = readFileSync(path);
	const [code, verdictFacts] = verdict(original, specEditorDisabled(start));
	let facts = verdictFacts;
	facts.splice(2, 0, ["spec", path]);
	const reason = Object.fromEntries(facts).reason;
	if (code !== 0 || reason !== "resolved") return [code, facts];
	const head = run(["git", "-C", start, "rev-parse", "HEAD"]);
	const sha = head.ok ? head.stdout.trim() : "";
	try {
		if (!SHA_RE.test(sha)) throw new Error("the repository has no commit to name");
		writeWhole(path, closeSpec(original, sha));
	} catch (e) {
		return [
			3,
			[
				["verdict", "pass"],
				["reason", "resolved"],
				["spec", path],
				["message", `The gate passed but the close could not be made (${(e as Error).message}). The spec is as it was; do not build until the close lands.`],
			],
		];
	}
	facts = facts.filter(([k]) => k !== "message");
	facts.push(["closed", sha]);
	facts.push(["message", `Closed the challenges on ${specId} in place, naming ${sha.slice(0, 12)}. The spec is outside the project's history, so nothing is committed.`]);
	return [0, facts];
}

// --- entry -----------------------------------------------------------------------

const DOC = `boards fleet challenge-gate - the spec-editor challenge gate, and the close after it.

    run <issue>                    the gate on the issue's spec, then close it in place
    check <spec> [--spec-editor-disabled]
                                   the verdict only, no git
    close <spec> --sha <sha>       the closed spec, to stdout
    lint <spec> [--original <f>]   the notation, for the eval

Output is one <key>\\t<value> line per fact: verdict, reason, spec, blocking,
closed, suggest and message. Exit 0 pass, 1 refuse, 2 usage, 3 the close could
not be made.
`;

function option(args: string[], name: string): string | null {
	const i = args.indexOf(name);
	if (i < 0) return null;
	if (i + 1 >= args.length) throw new Usage(`${name} needs a value`);
	const value = args[i + 1];
	args.splice(i, 2);
	return value;
}

function emit(facts: Facts): void {
	process.stdout.write(facts.map(([k, v]) => `${k}\t${v}\n`).join(""));
}

function main(argv: string[]): number {
	if (!argv.length || argv[0] === "-h" || argv[0] === "--help") {
		process.stdout.write(DOC);
		return argv.length ? 0 : 2;
	}
	const [cmd, ...rest] = argv;
	let args = [...rest];
	if (cmd === "run") {
		if (args.length !== 1) throw new Usage("usage: challenge-gate.py run <issue>");
		const [code, facts] = runGate(args[0]);
		emit(facts);
		return code;
	}
	if (cmd === "check") {
		const disabled = args.includes("--spec-editor-disabled");
		args = args.filter((a) => a !== "--spec-editor-disabled");
		if (args.length !== 1) throw new Usage("usage: challenge-gate.py check <spec> [--spec-editor-disabled]");
		const [code, facts] = verdict(readFileSync(args[0]), disabled);
		facts.splice(2, 0, ["spec", args[0]]);
		emit(facts);
		return code;
	}
	if (cmd === "close") {
		const sha = option(args, "--sha");
		if (sha === null || args.length !== 1) throw new Usage("usage: challenge-gate.py close <spec> --sha <sha>");
		if (!SHA_RE.test(sha)) throw new Usage(`--sha must be a hexadecimal commit id of 7 to 64 characters; got ${pyRepr(sha)}`);
		const data = readFileSync(args[0]);
		const lines = splitLines(decode(data));
		const { sections, markers } = parse(lines);
		const blocked = sections.length !== 1 || markers.length > 0 || blockingIds(lines, ...sections[0]).length > 0;
		if (blocked) {
			let [code, facts] = verdict(data);
			if (code === 0)
				facts = [
					["verdict", "refuse"],
					["reason", "closed-marker"],
					["message", "There is no intact section to close."],
				];
			emit(facts);
			return 1;
		}
		process.stdout.write(closeSpec(data, sha));
		return 0;
	}
	if (cmd === "lint") {
		const original = option(args, "--original");
		if (args.length !== 1) throw new Usage("usage: challenge-gate.py lint <spec> [--original <file>]");
		const problems = lint(readFileSync(args[0]), original ? readFileSync(original) : null);
		process.stdout.write(problems.map((p) => `problem\t${p}\n`).join(""));
		process.stdout.write(`verdict\t${problems.length ? "refuse" : "pass"}\n`);
		return problems.length ? 1 : 0;
	}
	throw new Usage(`unknown command ${pyRepr(cmd)}; try --help`);
}

export function challengeGateCommand(argv: string[]): number {
	try {
		return main(argv);
	} catch (e) {
		process.stderr.write(`challenge-gate.py: ${(e as Error).message}\n`);
		return 2;
	}
}

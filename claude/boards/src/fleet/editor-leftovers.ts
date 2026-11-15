// Find and remove what an earlier /init wrote for the editors. Ported from
// scripts/editor-leftovers.py, now a shim onto `boards fleet
// editor-leftovers`, which /kickoff runs.
//
//     status [--root DIR]
//     remove [--root DIR]
//
// Both editors run in every project, and /coder-fleet:agents disable is the
// one switch for either. An earlier /init wrote the answer down twice; both
// are leftovers now:
//
//   - in AGENTS.md, every line starting exactly `Spec editor:` or `Tech
//     editor:`, and the template's paragraph beginning `Those two lines say`
//     when it follows them;
//   - in .claude/settings.json and .claude/settings.local.json, every
//     permissions.deny entry that is exactly Agent(coder-fleet:spec-editor),
//     Agent(coder-fleet:tech-editor), or either with -fable appended.
//
// Nothing else is touched. A removed AGENTS.md run takes one blank line beside
// it. A settings file is never re-serialised: each removed entry takes the
// comma beside it, a list that empties becomes [], and every other byte stays
// as it was. The result is parsed again and must equal the original less the
// removed entries.
//
// `remove` checks every file before it writes any. It refuses, changing
// nothing, when a settings file is not UTF-8 JSON, has a duplicate key, or is
// a link resolving outside the project. A file keeps its mode, and a link is
// written through rather than replaced.
//
// Output is one `<kind>\t<file>\t<what>` line per leftover, `found` for status
// and `removed` for remove, then `state: none`, `state: found` or `state:
// removed`. A refusal prints `refused\t<file>\t<why>`.
//
// Exit codes: 0 done; 1 refused, nothing changed; 2 usage; 3 a file could not
// be read or written, and the message says which files were already written.
import { chmodSync, lstatSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { run } from "./proc.ts";

const RULES = ["Agent(coder-fleet:spec-editor)", "Agent(coder-fleet:tech-editor)", "Agent(coder-fleet:spec-editor-fable)", "Agent(coder-fleet:tech-editor-fable)"];
const SETTINGS = [".claude/settings.json", ".claude/settings.local.json"];
const LINE_RE = /^(Spec|Tech) editor:/;
const PARAGRAPH = "Those two lines say";
const SPLIT_KEEP = /(?<=\r\n|[\n\v\f\x1c\x1d\x1e\x85\u2028\u2029]|\r(?!\n))/;

class Refused extends Error {}
class Usage extends Error {}

const body = (line: string) => line.replace(/[\r\n]+$/, "");
const blank = (line: string) => !body(line).trim();

// --- AGENTS.md -------------------------------------------------------------------

function agentsPlan(text: string): [string, Array<[number, string]>] {
	const lines = text ? text.split(SPLIT_KEEP).filter((l) => l !== "") : [];
	const drop = new Set<number>();
	const found: Array<[number, string]> = [];
	lines.forEach((line, i) => {
		if (LINE_RE.test(body(line))) {
			drop.add(i);
			found.push([i + 1, body(line)]);
		}
	});
	if (!found.length) return [text, []];
	// The template's paragraph, after a blank line, following an editor line.
	for (const i of [...drop].sort((a, b) => a - b)) {
		let j = i + 1;
		while (drop.has(j)) j += 1;
		if (j + 1 < lines.length && blank(lines[j]) && body(lines[j + 1]).startsWith(PARAGRAPH)) {
			let k = j + 1;
			while (k < lines.length && !blank(lines[k])) {
				drop.add(k);
				found.push([k + 1, body(lines[k])]);
				k += 1;
			}
			drop.add(j);
		}
	}
	// Each dropped run takes one blank separator, so the paragraphs around it
	// keep the one blank line between them.
	let i = 0;
	while (i < lines.length) {
		if (!drop.has(i)) {
			i += 1;
			continue;
		}
		let end = i;
		while (drop.has(end)) end += 1;
		const beforeBlank = i > 0 && !drop.has(i - 1) && blank(lines[i - 1]);
		const afterBlank = end < lines.length && blank(lines[end]);
		if (afterBlank && (beforeBlank || i === 0)) drop.add(end);
		else if (beforeBlank && end >= lines.length) drop.add(i - 1);
		i = end + 1;
	}
	let out = lines.filter((_, n) => !drop.has(n)).join("");
	// A file whose last kept line had no newline keeps that shape; one that
	// ended in a newline still does.
	if (/[\n\r]$/.test(text) && out && !/[\n\r]$/.test(out)) out += text.endsWith("\r\n") ? "\r\n" : "\n";
	found.sort((a, b) => a[0] - b[0]);
	return [out, found];
}

// --- JSON, located by span -----------------------------------------------------------

type Span = { s: number; e: number; kind: "string" | "object" | "array" | "scalar"; keys?: Array<{ key: string; v: Span }>; items?: Span[] };

const WS = " \t\r\n";

class Scanner {
	constructor(readonly t: string) {}
	ws(i: number): number {
		while (i < this.t.length && WS.includes(this.t[i])) i += 1;
		return i;
	}
	stringEnd(i: number): number {
		i += 1;
		while (this.t[i] !== '"') i += this.t[i] === "\\" ? 2 : 1;
		return i + 1;
	}
	value(i: number): Span {
		i = this.ws(i);
		const c = this.t[i];
		if (c === '"') return { s: i, e: this.stringEnd(i), kind: "string" };
		if (c === "{") {
			const keys: Array<{ key: string; v: Span }> = [];
			let j = this.ws(i + 1);
			if (this.t[j] === "}") return { s: i, e: j + 1, kind: "object", keys };
			while (true) {
				j = this.ws(j);
				const ke = this.stringEnd(j);
				const key = JSON.parse(this.t.slice(j, ke)) as string;
				j = this.ws(ke) + 1;
				const v = this.value(j);
				keys.push({ key, v });
				j = this.ws(v.e);
				if (this.t[j] === "}") return { s: i, e: j + 1, kind: "object", keys };
				j += 1;
			}
		}
		if (c === "[") {
			const items: Span[] = [];
			let j = this.ws(i + 1);
			if (this.t[j] === "]") return { s: i, e: j + 1, kind: "array", items };
			while (true) {
				const v = this.value(j);
				items.push(v);
				j = this.ws(v.e);
				if (this.t[j] === "]") return { s: i, e: j + 1, kind: "array", items };
				j += 1;
			}
		}
		let j = i;
		while (j < this.t.length && !`${WS},]}`.includes(this.t[j])) j += 1;
		return { s: i, e: j, kind: "scalar" };
	}
}

function noDuplicates(span: Span): void {
	if (span.kind === "object") {
		const seen = new Set<string>();
		for (const { key, v } of span.keys ?? []) {
			if (seen.has(key)) throw new Refused(`it has the key "${key}" twice, so which one counts is unknown`);
			seen.add(key);
			noDuplicates(v);
		}
	} else if (span.kind === "array") for (const v of span.items ?? []) noDuplicates(v);
}

// Strict JSON with no key twice in one object.
function parse(text: string): unknown {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch (e) {
		throw new Refused(`it is not valid JSON (${(e as Error).message})`);
	}
	noDuplicates(new Scanner(text).value(0));
	return data;
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
	const ka = Object.keys(a);
	const kb = Object.keys(b);
	return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function commaBetween(t: string, from: number, to: number): number {
	const i = t.indexOf(",", from);
	if (i < 0 || i >= to) throw new Error("no comma between two list entries");
	return i;
}

function settingsPlan(text: string): [string, string[]] {
	const data = parse(text);
	const perms = isObj(data) ? data.permissions : undefined;
	const deny = isObj(perms) ? perms.deny : undefined;
	if (!Array.isArray(deny) || !deny.some((r) => typeof r === "string" && RULES.includes(r))) return [text, []];
	const top = new Scanner(text).value(0);
	const p = (top.keys ?? []).find((k) => k.key === "permissions");
	const d = (p?.v.keys ?? []).find((k) => k.key === "deny");
	if (!d) return [text, []];
	const { s: start, e: end } = d.v;
	const elems = d.v.items ?? [];
	const t = text;
	const pres: string[] = [];
	const posts: string[] = [];
	elems.forEach((el, n) => {
		const prev = n === 0 ? start + 1 : commaBetween(t, elems[n - 1].e, el.s) + 1;
		pres.push(t.slice(prev, el.s));
		const next = n === elems.length - 1 ? end - 1 : commaBetween(t, el.e, elems[n + 1].s);
		posts.push(t.slice(el.e, next));
	});
	const valueOf = (el: Span) => JSON.parse(t.slice(el.s, el.e)) as unknown;
	const isRule = (v: unknown) => typeof v === "string" && RULES.includes(v);
	const keep = elems.map((_, n) => n).filter((n) => !isRule(valueOf(elems[n])));
	const removed = elems.filter((_, n) => !keep.includes(n)).map((el) => valueOf(el) as string);
	let newList: string;
	if (!keep.length) newList = "[]";
	else {
		const parts = keep.map((n, idx) => {
			const pre = idx === 0 && !pres[n].includes("\n") ? pres[0] : pres[n];
			const post = idx < keep.length - 1 ? posts[n] : posts[posts.length - 1];
			return pre + t.slice(elems[n].s, elems[n].e) + post;
		});
		newList = `[${parts.join(",")}]`;
	}
	const out = t.slice(0, start) + newList + t.slice(end);
	const want = data as Record<string, Record<string, unknown>>;
	want.permissions.deny = (deny as unknown[]).filter((r) => !isRule(r));
	if (!deepEqual(parse(out), want)) throw new Refused("the edit would change more than the deny entries, so it is not made");
	return [out, removed];
}

// --- files ---------------------------------------------------------------------------

function real(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		// python's realpath resolves what exists and keeps the rest.
		const parent = dirname(p);
		return parent === p ? p : join(real(parent), p.slice(parent.length + 1));
	}
}

function projectRoot(arg: string | null): string {
	if (arg) return real(resolve(arg));
	const r = run(["git", "rev-parse", "--show-toplevel"]);
	const top = r.ok ? r.stdout.trim() : "";
	return real(top || process.cwd());
}

// The real file behind rel, refused when a link leads outside root.
function target(root: string, rel: string): string {
	const path = join(root, rel);
	const r = real(path);
	if (lstatSync(path).isSymbolicLink() && !(r === root || r.startsWith(root + sep))) throw new Refused(`it is a link to ${r}, outside the project`);
	return r;
}

function readText(path: string): string {
	const data = readFileSync(path);
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
	} catch {
		throw new Refused("it is not UTF-8");
	}
}

function writeWhole(path: string, text: string): void {
	const mode = statSync(path).mode & 0o7777;
	const tmp = join(dirname(path) || ".", `.${path.slice(dirname(path).length + 1)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
	try {
		writeFileSync(tmp, text, { flag: "wx", mode: 0o600 });
		chmodSync(tmp, mode);
		renameSync(tmp, path);
	} catch (e) {
		try {
			unlinkSync(tmp);
		} catch {}
		throw e;
	}
}

type Plan = { rel: string; real: string; text: string; items: Array<[string, string]> };

function plan(root: string): [Plan[], Array<[string, string]>] {
	const plans: Plan[] = [];
	const refusals: Array<[string, string]> = [];
	for (const [rel, planner] of [["AGENTS.md", "agents"], ...SETTINGS.map((s) => [s, "settings"])]) {
		try {
			lstatSync(join(root, rel));
		} catch {
			continue;
		}
		try {
			const r = target(root, rel);
			const text = readText(r);
			let items: Array<[string, string]>;
			let next: string;
			if (planner === "agents") {
				const [n, found] = agentsPlan(text);
				next = n;
				items = found.map(([num, line]) => [`AGENTS.md:${num}`, line]);
			} else {
				const [n, found] = settingsPlan(text);
				next = n;
				items = found.map((rule) => [rel, rule]);
			}
			if (items.length) plans.push({ rel, real: r, text: next, items });
		} catch (e) {
			if (!(e instanceof Refused)) throw e;
			refusals.push([rel, e.message]);
		}
	}
	return [plans, refusals];
}

function main(argv: string[]): number {
	const args = [...argv];
	let root: string | null = null;
	const i = args.indexOf("--root");
	if (i >= 0) {
		if (i + 1 >= args.length) throw new Usage("--root needs a directory");
		root = args[i + 1];
		args.splice(i, 2);
	}
	if (args.length !== 1 || !["status", "remove"].includes(args[0])) throw new Usage("usage: editor-leftovers.py status|remove [--root DIR]");
	const top = projectRoot(root && !isAbsolute(root) ? resolve(root) : root);
	const [plans, refusals] = plan(top);
	const say = (s: string) => process.stdout.write(`${s}\n`);
	for (const [rel, why] of refusals) say(`refused\t${rel}\t${why}`);
	if (args[0] === "status") {
		for (const p of plans) for (const [where, what] of p.items) say(`found\t${where}\t${what}`);
		say(`state: ${plans.length ? "found" : "none"}`);
		return refusals.length ? 1 : 0;
	}
	if (refusals.length) {
		say("Nothing was removed: fix the file named above, then run this again.");
		return 1;
	}
	const written: string[] = [];
	for (const p of plans) {
		try {
			writeWhole(p.real, p.text);
		} catch (e) {
			say(`error\t${p.rel}\t${(e as Error).message}`);
			say(`Already written: ${written.join(", ") || "nothing"}. Run this again once the file can be written.`);
			return 3;
		}
		written.push(p.rel);
		for (const [where, what] of p.items) say(`removed\t${where}\t${what}`);
	}
	say(`state: ${plans.length ? "removed" : "none"}`);
	return 0;
}

export function editorLeftoversCommand(argv: string[]): number {
	try {
		return main(argv);
	} catch (e) {
		const usage = e instanceof Usage;
		process.stderr.write(`editor-leftovers.py: ${(e as Error).message}\n`);
		return usage ? 2 : 3;
	}
}

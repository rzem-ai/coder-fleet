// The fleet's reading of a project's .claude/coder-fleet.json, ported from
// hooks/lib/fleet-config.sh and fleet-config.py, which are now shims onto
// this file. The rules, stated once:
//
//   - The file that counts is the one in the repository's main checkout, read
//     live, uncommitted edits included (configRoot). A linked worktree's copy
//     never counts, so a branch under review cannot disable its own checks,
//     and a toggle needs no commit.
//   - No file, or no `disabledAgents` key: nothing is disabled.
//   - The file must be a JSON object, and `disabledAgents`, when present, a
//     list of strings. Other top-level keys are ignored.
//   - The file is exactly one strict JSON value, as JSON.parse reads it, with
//     no byte order mark and brackets nested no deeper than 64 levels.
//   - A name must be printable ASCII. It is then trimmed of spaces,
//     lower-cased and has any `coder-fleet:` prefix dropped, in that order,
//     and must then look like an agent name.
//   - lead, coder and reviewer cannot be disabled.
//   - A file that breaks any rule is invalid, and an invalid file honours
//     nothing: every agent stays enabled, and the caller reports the reason.
//   - `phase` is "build" or "harden", judged apart from disabledAgents. A read
//     that failed is harden (state unread), because it says nothing about
//     what the human chose.
//   - `baseBranch`, `push` and `release` are judged apart from every other
//     key. push and release each guard a remote, so an invalid value or a
//     failed read resolves as the strict one: push base-only, release off.
//
// review-round.js carries its own copy of the reading (asciiJson, phaseOf,
// fleetConfigFrom), and this port gives the same answers, reasons included
// (claude/evals/lib/workflow-logic.mjs holds the fixtures).
//
// Parsing still runs as its own process, `python3 -I hooks/lib/fleet-config.py
// <file> <core agents>`, as fleet_config_read ran it: that file is a shim back
// onto parseConfig below, so the parse is this code, but a python3 that is
// missing or cannot run still makes the file invalid with the reason saying
// so, which disabled-agents-contract.sh pins.
//
// Nothing is cached. Every read reads the file.
import { accessSync, constants, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { assignments, fleetGit, isDir, isFile, onPath, pluginRoot, realDir, run } from "./proc.ts";

export const CONFIG_REL = ".claude/coder-fleet.json";
export const CORE_AGENTS = ["lead", "coder", "reviewer"];
const MAX_DEPTH = 64;
const PRINTABLE_ASCII = /^[ -~]*$/;
const AGENT_NAME = /^[a-z0-9][a-z0-9_-]*$/;
const PREFIX = "coder-fleet:";
const NOT_JSON = "the file is empty or not valid JSON";
const TOO_DEEP = `the file nests deeper than ${MAX_DEPTH} levels`;
const PHASES = ["build", "harden"];
const PHASE_ONLY = ', and only "build" or "harden" is a phase';
const PUSHES = ["all", "base-only"];
const RELEASES = ["off", "tag", "github"];

type Triple = [string, string, string];

// JSON with every character outside printable ASCII escaped as \uXXXX, as
// review-round.js's asciiJson and python's json.dumps(ensure_ascii=True) quote
// a name.
export function asciiJson(s: string): string {
	return JSON.stringify(s).replace(/[^ -~]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

// How deep the brackets go outside strings, counted on the text before it is
// parsed, so it is defined for broken JSON too.
export function nesting(text: string): number {
	let depth = 0;
	let deepest = 0;
	let inString = false;
	let escaped = false;
	for (const c of text) {
		if (inString) {
			if (escaped) escaped = false;
			else if (c === "\\") escaped = true;
			else if (c === '"') inString = false;
		} else if (c === '"') inString = true;
		else if (c === "[" || c === "{") deepest = Math.max(deepest, ++depth);
		else if (c === "]" || c === "}") depth -= 1;
	}
	return deepest;
}

class Invalid extends Error {}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function normaliseListed(name: string): string {
	if (!PRINTABLE_ASCII.test(name)) return name;
	const low = name.replace(/^ +/, "").replace(/ +$/, "").replace(/[A-Z]/g, (c) => c.toLowerCase());
	return low.startsWith(PREFIX) ? low.slice(PREFIX.length) : low;
}

function parseDoc(bytes: Uint8Array): Record<string, unknown> {
	const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
	if (text.charCodeAt(0) === 0xfeff) throw new Invalid("the file starts with a byte order mark");
	if (nesting(text) > MAX_DEPTH) throw new Invalid(TOO_DEEP);
	let doc: unknown;
	try {
		doc = JSON.parse(text);
	} catch {
		throw new Invalid(NOT_JSON);
	}
	if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Invalid("the file is not a JSON object");
	return doc as Record<string, unknown>;
}

function phaseOf(doc: Record<string, unknown>): Triple {
	if (!has(doc, "phase")) return ["build", "default", ""];
	const v = doc.phase;
	if (typeof v === "string" && PHASES.includes(v)) return [v, "ok", ""];
	if (typeof v === "string") return ["build", "invalid", `phase is ${asciiJson(v)}${PHASE_ONLY}`];
	return ["build", "invalid", `phase is not a string${PHASE_ONLY}`];
}

function baseOf(doc: Record<string, unknown>): Triple {
	if (!has(doc, "baseBranch")) return ["", "unset", ""];
	const v = doc.baseBranch;
	if (typeof v !== "string") return ["", "invalid", "baseBranch is not a string, so it names no branch"];
	if (v === "" || !PRINTABLE_ASCII.test(v)) return ["", "invalid", `baseBranch is ${asciiJson(v)}, which is not a branch name`];
	return [v, "ok", ""];
}

function choiceOf(doc: Record<string, unknown>, key: string, allowed: string[], unset: string, strict: string): Triple {
	if (!has(doc, key)) return [unset, "unset", ""];
	const v = doc[key];
	const names = allowed.map((a) => `"${a}"`);
	const only = `, and only ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]} is a ${key} value, so it is taken as ${strict}`;
	if (typeof v === "string" && allowed.includes(v)) return [v, "ok", ""];
	if (typeof v === "string") return [strict, "invalid", `${key} is ${asciiJson(v)}${only}`];
	return [strict, "invalid", `${key} is not a string${only}`];
}

function disabledOf(doc: Record<string, unknown>, core: string[]): string[] {
	if (!has(doc, "disabledAgents")) return [];
	const list = doc.disabledAgents;
	if (!Array.isArray(list)) throw new Invalid("disabledAgents is not a list");
	if (list.some((n) => typeof n !== "string")) throw new Invalid("disabledAgents holds something that is not a string");
	const names = (list as string[]).map(normaliseListed);
	const bad = names.filter((n) => !AGENT_NAME.test(n));
	if (bad.length) throw new Invalid(`disabledAgents lists ${bad.map(asciiJson).join(", ")}, which is not an agent name`);
	const cores = [...new Set(names.filter((n) => core.includes(n)))].sort();
	if (cores.length) throw new Invalid(`disabledAgents lists ${cores.join(", ")}, and lead, coder and reviewer cannot be disabled`);
	return [...new Set(names)].sort();
}

// fleet-config.py's output: the state (ok or invalid), the names or the
// reason, then value, state and reason for the phase, baseBranch, push and
// release. Fourteen lines.
export function parseConfig(argv: string[]): string[] {
	let state: string;
	let payload: string;
	let phase: Triple | null = null;
	let settings: string[] | null = null;
	if (argv.length !== 2) {
		state = "invalid";
		payload = NOT_JSON;
	} else {
		try {
			const doc = parseDoc(readFileSync(argv[0]));
			phase = phaseOf(doc);
			settings = [...baseOf(doc), ...choiceOf(doc, "push", PUSHES, "all", "base-only"), ...choiceOf(doc, "release", RELEASES, "unset", "off")];
			state = "ok";
			payload = disabledOf(doc, argv[1].split(/\s+/).filter(Boolean)).join(" ");
		} catch (e) {
			state = "invalid";
			payload = e instanceof Invalid ? e.message : NOT_JSON;
		}
	}
	if (!phase) phase = ["harden", "unread", `${CONFIG_REL} could not be read as JSON (${payload}), so the phase is taken as harden`];
	if (!settings) {
		const read = `${CONFIG_REL} could not be read as JSON (${payload})`;
		settings = ["", "unread", `${read}, so baseBranch is unknown`, "base-only", "unread", `${read}, so push is taken as base-only`, "off", "unread", `${read}, so release is taken as off`];
	}
	return [state, payload, ...phase, ...settings];
}

// --- the main checkout --------------------------------------------------------

// The main worktree of the repository `dir` is in, even from a linked
// worktree; null when there is none it can trust. It is the first entry `git
// worktree list --porcelain` prints, believed only when that checkout's own
// list names the starting worktree, so a .git file edited to point at another
// repository is caught. Anything that fails or is ambiguous - no git, no
// repository, a bare main, a worktree its main does not list - is null, and
// the caller then reads no file. When the main worktree's directory has gone,
// its path is still returned: the file is then absent.
export function configRoot(arg?: string): string | null {
	const dir = arg || process.env.CLAUDE_PROJECT_DIR || process.cwd();
	if (!dir || !realDir(dir)) return null;
	if (!onPath("git")) return null;
	const top = fleetGit(["-C", dir, "rev-parse", "--show-toplevel"]);
	if (!top.ok) return null;
	const start = top.stdout.replace(/\n$/, "");
	if (!start) return null;
	const list = fleetGit(["-C", start, "worktree", "list", "--porcelain"]);
	if (!list.ok) return null;
	const lines = list.stdout.split("\n");
	const main = lines[0].startsWith("worktree ") ? lines[0].slice("worktree ".length) : "";
	if (!main) return null;
	for (let i = 0; i < lines.length; i++) {
		if (i > 0 && lines[i] === "") break;
		if (lines[i] === "bare") return null;
	}
	const startReal = realDir(start);
	if (!startReal) return null;
	if (isDir(main)) {
		const ml = fleetGit(["-C", main, "worktree", "list", "--porcelain"]);
		if (!ml.ok) return null;
		const mlines = ml.stdout.split("\n");
		const first = mlines[0].startsWith("worktree ") ? mlines[0].slice("worktree ".length) : "";
		if (realDir(first) !== realDir(main)) return null;
		if (!mlines.some((l) => l.startsWith("worktree ") && realDir(l.slice("worktree ".length)) === startReal)) return null;
	}
	return main;
}

// --- reading -----------------------------------------------------------------

export type ConfigRead = Record<string, string>;

function fresh(root: string): ConfigRead {
	return {
		FLEET_CONFIG_PATH: `${root}/${CONFIG_REL}`,
		FLEET_CONFIG_STATE: "absent",
		FLEET_CONFIG_REASON: "",
		FLEET_CONFIG_DISABLED: "",
		FLEET_CONFIG_PHASE: "build",
		FLEET_CONFIG_PHASE_STATE: "default",
		FLEET_CONFIG_PHASE_REASON: "",
		FLEET_CONFIG_BASE: "",
		FLEET_CONFIG_BASE_STATE: "unset",
		FLEET_CONFIG_BASE_REASON: "",
		FLEET_CONFIG_PUSH: "all",
		FLEET_CONFIG_PUSH_STATE: "unset",
		FLEET_CONFIG_PUSH_REASON: "",
		FLEET_CONFIG_RELEASE: "unset",
		FLEET_CONFIG_RELEASE_STATE: "unset",
		FLEET_CONFIG_RELEASE_REASON: "",
	};
}

// Nothing is known of baseBranch, push and release: push and release take
// their strict values.
function settingsUnread(c: ConfigRead, why: string): void {
	Object.assign(c, {
		FLEET_CONFIG_BASE: "",
		FLEET_CONFIG_BASE_STATE: "unread",
		FLEET_CONFIG_BASE_REASON: `${why}, so baseBranch is unknown`,
		FLEET_CONFIG_PUSH: "base-only",
		FLEET_CONFIG_PUSH_STATE: "unread",
		FLEET_CONFIG_PUSH_REASON: `${why}, so push is taken as base-only`,
		FLEET_CONFIG_RELEASE: "off",
		FLEET_CONFIG_RELEASE_STATE: "unread",
		FLEET_CONFIG_RELEASE_REASON: `${why}, so release is taken as off`,
	});
}

// A read that failed never removes a break lane or a fix round: the phase is
// harden, and the reason, the read's own with this added, says so.
function phaseUnread(c: ConfigRead): void {
	c.FLEET_CONFIG_PHASE = "harden";
	c.FLEET_CONFIG_PHASE_STATE = "unread";
	c.FLEET_CONFIG_PHASE_REASON = `${c.FLEET_CONFIG_REASON}, so the phase is taken as harden`;
	settingsUnread(c, c.FLEET_CONFIG_REASON);
}

// The variables fleet_config_read sets, for the main checkout `root` ("" when
// configRoot found none).
export function configRead(root: string): ConfigRead {
	const c = fresh(root);
	if (!root) {
		c.FLEET_CONFIG_PATH = "";
		c.FLEET_CONFIG_STATE = "unresolved";
		c.FLEET_CONFIG_REASON = `no main checkout could be found through git, so no ${CONFIG_REL} is read and every agent is enabled`;
		phaseUnread(c);
		return c;
	}
	const path = c.FLEET_CONFIG_PATH;
	let st: ReturnType<typeof statSync>;
	try {
		st = statSync(path);
	} catch {
		return c;
	}
	let readable = true;
	try {
		accessSync(path, constants.R_OK);
	} catch {
		readable = false;
	}
	if (!readable || st.isDirectory()) {
		c.FLEET_CONFIG_STATE = "unreadable";
		c.FLEET_CONFIG_REASON = `${CONFIG_REL} exists but cannot be read`;
		phaseUnread(c);
		return c;
	}
	if (!onPath("python3")) {
		c.FLEET_CONFIG_STATE = "invalid";
		c.FLEET_CONFIG_REASON = `python3 is not installed, so ${CONFIG_REL} cannot be parsed`;
		phaseUnread(c);
		return c;
	}
	const parser = join(pluginRoot(), "hooks", "lib", "fleet-config.py");
	const p = run(["python3", "-I", parser, path, CORE_AGENTS.join(" ")]);
	const out = p.ok ? p.stdout.split("\n") : [];
	const line = (n: number) => out[n - 1] ?? "";
	const phaseKey = `${line(3)}|${line(4)}`;
	if (["build|ok", "harden|ok", "build|invalid", "harden|unread"].includes(phaseKey)) {
		c.FLEET_CONFIG_PHASE = line(3);
		c.FLEET_CONFIG_PHASE_STATE = line(4);
		if (line(4) === "invalid" || line(4) === "unread") c.FLEET_CONFIG_PHASE_REASON = line(5);
	}
	settingsFrom(c, out, root);
	if (line(1) === "ok") {
		c.FLEET_CONFIG_STATE = "ok";
		c.FLEET_CONFIG_DISABLED = line(2);
	} else if (line(1) === "invalid") {
		c.FLEET_CONFIG_STATE = "invalid";
		c.FLEET_CONFIG_REASON = line(2);
	} else {
		c.FLEET_CONFIG_STATE = "invalid";
		c.FLEET_CONFIG_REASON = p.status !== 0 ? `python3 could not run (exit ${p.status}), so ${CONFIG_REL} cannot be parsed` : "the file is empty or not valid JSON";
		phaseUnread(c);
	}
	return c;
}

// Lines 6 to 14 of the parser's output. Output that is not what the parser
// prints is a failed read. A baseBranch whose shape passed is then asked of
// git: a branch name, and a branch in the main checkout `root`.
function settingsFrom(c: ConfigRead, out: string[], root: string): void {
	const line = (n: number) => out[n - 1] ?? "";
	const [base, baseState, push, pushState, release, releaseState] = [line(6), line(7), line(9), line(10), line(12), line(13)];
	const unreadable = () => settingsUnread(c, `${CONFIG_REL} could not be read`);
	if (!["unset", "ok", "invalid", "unread"].includes(baseState)) return unreadable();
	if (!["all|unset", "all|ok", "base-only|ok", "base-only|invalid", "base-only|unread"].includes(`${push}|${pushState}`)) return unreadable();
	if (!["unset|unset", "off|ok", "tag|ok", "github|ok", "off|invalid", "off|unread"].includes(`${release}|${releaseState}`)) return unreadable();
	Object.assign(c, {
		FLEET_CONFIG_BASE: base,
		FLEET_CONFIG_BASE_STATE: baseState,
		FLEET_CONFIG_BASE_REASON: line(8),
		FLEET_CONFIG_PUSH: push,
		FLEET_CONFIG_PUSH_STATE: pushState,
		FLEET_CONFIG_PUSH_REASON: line(11),
		FLEET_CONFIG_RELEASE: release,
		FLEET_CONFIG_RELEASE_STATE: releaseState,
		FLEET_CONFIG_RELEASE_REASON: line(14),
	});
	if (baseState !== "ok") return;
	const quoted = `"${base}"`;
	if (!base.startsWith("-") && fleetGit(["check-ref-format", `refs/heads/${base}`]).ok) {
		if (fleetGit(["-C", root, "show-ref", "--verify", "-q", `refs/heads/${base}`]).ok) return;
		c.FLEET_CONFIG_BASE = "";
		c.FLEET_CONFIG_BASE_STATE = "invalid";
		c.FLEET_CONFIG_BASE_REASON = `baseBranch is ${quoted}, which names no local branch in ${root}`;
		return;
	}
	c.FLEET_CONFIG_BASE = "";
	c.FLEET_CONFIG_BASE_STATE = "invalid";
	c.FLEET_CONFIG_BASE_REASON = `baseBranch is ${quoted}, which is not a branch name`;
}

// --- the trunk ---------------------------------------------------------------

// The one name check a trunk passes before any caller hands it to git.
export function trunkNameOk(name: string): boolean {
	return name !== "" && !name.startsWith("-") && /^[A-Za-z0-9._/-]+$/.test(name);
}

// The trunk: baseBranch when set; else the branch the remote's HEAD names, the
// remote being origin or the only one; else main. FLEET_TRUNK is empty, with
// the reason in FLEET_TRUNK_REASON, when baseBranch is invalid or the file
// could not be read, or the name it would return fails trunkNameOk.
export function trunk(root: string): { vars: ConfigRead; ok: boolean } {
	const c = configRead(root);
	const t = { FLEET_TRUNK: "", FLEET_TRUNK_FROM: "", FLEET_TRUNK_REASON: "" };
	const done = (ok: boolean) => ({ vars: { ...c, ...t }, ok });
	if (c.FLEET_CONFIG_BASE_STATE === "ok") {
		t.FLEET_TRUNK_FROM = "setting";
		if (!trunkNameOk(c.FLEET_CONFIG_BASE)) {
			t.FLEET_TRUNK_REASON = `baseBranch is "${c.FLEET_CONFIG_BASE}", which holds a character outside letters, digits, '.', '_', '/' and '-', so the fleet does not pass it to git`;
			return done(false);
		}
		t.FLEET_TRUNK = c.FLEET_CONFIG_BASE;
		return done(true);
	}
	if (c.FLEET_CONFIG_BASE_STATE !== "unset") {
		t.FLEET_TRUNK_FROM = "setting";
		t.FLEET_TRUNK_REASON = c.FLEET_CONFIG_BASE_REASON;
		return done(false);
	}
	const r = fleetGit(["-C", root, "remote"]);
	const remotes = r.ok ? r.stdout.split("\n").filter((l) => l !== "") : [];
	let remote = "";
	if (remotes.includes("origin")) remote = "origin";
	else if (remotes.length === 1) remote = remotes[0];
	if (remote) {
		const h = fleetGit(["-C", root, "symbolic-ref", "-q", `refs/remotes/${remote}/HEAD`]);
		let head = h.ok ? h.stdout.replace(/\n$/, "") : "";
		const prefix = `refs/remotes/${remote}/`;
		if (head.startsWith(prefix)) head = head.slice(prefix.length);
		if (head) {
			t.FLEET_TRUNK_FROM = "remote";
			if (!trunkNameOk(head)) {
				t.FLEET_TRUNK_REASON =
					"the remote's HEAD names a branch with a character outside letters, digits, '.', '_', '/' and '-', or a leading '-', so the fleet does not pass it to git";
				return done(false);
			}
			t.FLEET_TRUNK = head;
			return done(true);
		}
	}
	t.FLEET_TRUNK = "main";
	t.FLEET_TRUNK_FROM = "fallback";
	return done(true);
}

// --- names ---------------------------------------------------------------------

// fleet_config_normalise: lower case, [[:space:]] trimmed, the prefix dropped.
export function normalise(name: string): string {
	const n = name.replace(/[A-Z]/g, (c) => c.toLowerCase()).replace(/^[ \t\n\v\f\r]+/, "").replace(/[ \t\n\v\f\r]+$/, "");
	return n.startsWith(PREFIX) ? n.slice(PREFIX.length) : n;
}

// The fleet's agents, one per body under <plugin root>/agents, sorted.
export function roster(root: string): string[] {
	let names: string[];
	try {
		names = readdirSync(join(root, "agents"));
	} catch {
		return [];
	}
	const agents = names.filter((n) => n.endsWith(".md") && !n.startsWith(".") && isFile(join(root, "agents", n))).map((n) => n.slice(0, -3));
	return [...new Set(agents)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// Whether a read whose state and disabled list are given disables `type`,
// bare or coder-fleet:-prefixed. Another plugin's agent of the same name is
// not the fleet's.
export function agentDisabled(state: string, disabled: string, type: string): boolean {
	if (state !== "ok") return false;
	const raw = type.replace(/[A-Z]/g, (c) => c.toLowerCase());
	if (raw.includes(":") && !raw.startsWith(PREFIX)) return false;
	const name = normalise(raw);
	if (!name) return false;
	return ` ${disabled} `.includes(` ${name} `);
}

// --- the subcommand ----------------------------------------------------------

const CONFIG_USAGE = `usage: boards fleet config root [dir] | read <root> | trunk <root> | parse <file> <core agents> | roster <plugin root> | normalise <name> | agent-disabled <state> <disabled> <type> (prints disabled or enabled)`;

export function configCommand(args: string[]): number {
	const [op, ...rest] = args;
	const out = (s: string) => process.stdout.write(s);
	switch (op) {
		case "root": {
			const root = configRoot(rest[0]);
			if (root === null) return 1;
			out(root);
			return 0;
		}
		case "read":
			out(assignments(configRead(rest[0] ?? "")));
			return 0;
		case "trunk": {
			const t = trunk(rest[0] ?? "");
			out(assignments(t.vars));
			return t.ok ? 0 : 1;
		}
		case "parse":
			out(`${parseConfig(rest).join("\n")}\n`);
			return 0;
		case "roster":
			out(roster(rest[0] ?? pluginRoot()).join(" "));
			return 0;
		case "normalise":
			out(normalise(rest[0] ?? ""));
			return 0;
		case "agent-disabled":
			process.stdout.write(agentDisabled(rest[0] ?? "", rest[1] ?? "", rest[2] ?? "") ? "disabled" : "enabled");
			return 0;
		default:
			process.stderr.write(`${CONFIG_USAGE}\n`);
			return 2;
	}
}

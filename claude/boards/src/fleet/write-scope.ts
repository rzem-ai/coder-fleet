// Whether an agent's write tool may land where it is pointed. Ported from
// hooks/lib/check-write-scope.py, now a shim onto
// `boards fleet check-write-scope`; the scope hook (scope.ts) calls it in
// process.
//
// A glob on a lexically normalised path misses three things, and each was
// reachable: `*/docs/specs/*` matched any project's specs directory, a
// symlinked specs directory pointing at src resolved to itself, and two roles
// that hold Write had no write branch at all. So this resolves the target
// physically and anchors it to this project and its board.
//
// Roles and their destinations, where <board> is the directory of the board
// the event's cwd reaches (~/.config/boards/<PREFIX>, src/resolve.ts):
//
//   spec-writer    <board>/specs/**                   one spec, nowhere else
//   spec-editor    <board>/specs/**                   one spec, nowhere else
//   fleet-steward  <repo>/**                          its own working copy
//   tech-writer    documentation: docs/**, and *.md at the project root
//   tech-editor    tech-writer's scope exactly
//   ui-designer    prototypes/**, plus <board>/runs/** for a commissioned article
//
// With no board for the repo, the board's destinations do not exist, and a
// write there is denied.
//
// outside answers for a reviewer in break or use mode, whatever the event's
// agent_type: anywhere EXCEPT <project>/** and the main checkout git reports
// for it, so a project directory that is a linked worktree still leaves the
// main checkout and the worktrees inside it refused, and never the fleet's state
// directory or Claude Code's transcripts, which record the reviewer's own
// modes and brief, nor the boards root, which holds every board's cards,
// config, specs and run articles, nor the board's state root, which holds
// each checkout's focus and each spawn's binding. It is the inverted rule, so it is the only one that needs
// CLAUDE_PROJECT_DIR set: an allowlist survives a wrong project by being
// narrower than intended, a denial does not. Unset, it denies.
//
// CODER_FLEET_OUTPUT_FILES may narrow tech-writer and ui-designer to an exact
// list of commissioned files, as JSON mapping role to paths (the tech editors
// read tech-writer's entry). It narrows and never widens. Unset, the
// defaults above apply.
//
// For every allowlist above, <project> is the checkout the agent works in:
// the linked worktree holding the event's cwd when the project
// (CLAUDE_PROJECT_DIR) registers it, under the same test memory uses below,
// else the project. A relative commissioned path resolves there too. So a
// tech-writer, tech editor or ui-designer in a worktree writes that
// worktree's files and not the main checkout's or another worktree's. The
// board's specs/ and runs/ are outside every checkout and are reached from a
// worktree as from its main checkout, and fleet-steward's working copy is
// CODER_FLEET_REPO, so neither moves. The inverted rule above is measured from
// the project and its main checkout instead.
//
// memory answers a different question, for any role: is the target inside the
// agent's own memory directory, <project>/.claude/agent-memory/<agent type>/
// with every character of the type outside [A-Za-z0-9_-] turned into "-"? The
// project is CLAUDE_PROJECT_DIR, and also the linked worktree holding the
// event's cwd, since Claude Code resolves memory against the agent's spawn
// cwd. That worktree counts only when the project's own `git worktree list`
// names it under the project's .claude/worktrees/ (symlinks resolved, and case
// folded only where a probe shows the filesystem holding the worktrees folds
// it) and it is neither the home directory nor a parent of it. A memory
// directory that resolves anywhere else has been redirected and is refused.
//
// Resolution is physical on the deepest existing ancestor, because the file
// being written usually does not exist yet. true allows, false denies, and any
// error denies: a scope that cannot be established is not satisfied.
//
// Not covered: writes a program run through Bash makes, and a symlink swapped
// between this check and the write. Both need filesystem containment
// (docs/limits.md).
import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { posix } from "node:path";
import { boardsRoot, stateRoot } from "../paths.ts";
import { resolveBoard } from "../resolve.ts";
import { readInput } from "./hook.ts";
import { run } from "./proc.ts";

const ROLES = new Set(["spec-writer", "spec-editor", "ui-designer", "tech-writer", "tech-editor", "fleet-steward"]);
const SPECS_ROLES = new Set(["spec-writer", "spec-editor"]);
// A tech editor is held to tech-writer's scope, commissioned list included.
const SCOPE_OF: Record<string, string> = { "tech-editor": "tech-writer" };

function home(): string {
	return process.env.HOME || homedir();
}

function expandUser(p: string): string {
	if (p === "~") return home();
	if (p.startsWith("~/")) return home() + p.slice(1);
	return p;
}

// os.path.abspath: absolute against the process's cwd, normalised lexically.
function abspath(p: string): string {
	const a = p.startsWith("/") ? p : `${process.cwd()}/${p}`;
	let n = posix.normalize(a);
	if (n.length > 1 && n.endsWith("/")) n = n.slice(0, -1);
	return n;
}

// Absolute, with symlinks followed as far as the path actually exists.
export function resolve(p: string): string {
	let existing = abspath(expandUser(p));
	const tail: string[] = [];
	while (!existsSync(existing) && existing !== posix.dirname(existing)) {
		tail.unshift(posix.basename(existing));
		existing = posix.dirname(existing);
	}
	let real = existing;
	try {
		real = realpathSync(existing);
	} catch {}
	return tail.length ? posix.join(real, ...tail) : real;
}

function relativeOk(path: string, root: string): boolean {
	return root === "/" ? path.startsWith("/") : path === root || path.startsWith(`${root}/`);
}

// Strictly inside: under root, and not root itself.
function inside(path: string, root: string): boolean {
	return relativeOk(path, root) && path !== root;
}

function foldedInside(path: string, root: string): boolean {
	return inside(path.toLowerCase(), root.toLowerCase());
}

function swapCase(s: string): string {
	let out = "";
	for (const c of s) out += c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
	return out;
}

// Whether the filesystem holding p folds case, probed rather than assumed per
// OS: the nearest existing name with a letter in it, looked up again with its
// case swapped, is the same file. Any doubt answers false, and a case-sensitive
// comparison only ever matches less. The lookup must happen on p's own
// filesystem, so the walk stops at a mount point.
function caseInsensitiveAt(p: string): boolean {
	let cur = resolve(p);
	while (!existsSync(cur) && cur !== posix.dirname(cur)) cur = posix.dirname(cur);
	try {
		const dev = statSync(cur).dev;
		for (; cur !== posix.dirname(cur); cur = posix.dirname(cur)) {
			const parent = posix.dirname(cur);
			if (statSync(parent).dev !== dev) return false;
			const name = posix.basename(cur);
			const swapped = swapCase(name);
			if (swapped === name) continue;
			const a = statSync(cur);
			const b = statSync(posix.join(parent, swapped), { throwIfNoEntry: false });
			return !!b && a.dev === b.dev && a.ino === b.ino;
		}
	} catch {}
	return false;
}

// Inside, or root itself, compared as the filesystem compares names.
function within(path: string, root: string, fold: boolean): boolean {
	const [p, r] = fold ? [path.toLowerCase(), root.toLowerCase()] : [path, root];
	return p === r || inside(p, r);
}

// Path.suffix: the last dot's extension of the name, "" when it has none or
// the name starts with its only dot.
function suffix(p: string): string {
	const name = posix.basename(p);
	const i = name.lastIndexOf(".");
	if (i <= 0 || i === name.length - 1) return "";
	return name.slice(i);
}

// The physical directory of the board cwd's repo reaches, or null when it
// has none. Two boards claiming the repo throw, and the caller denies.
function boardDir(cwd: string): string | null {
	const res = resolveBoard(cwd);
	return res?.found ? resolve(res.found.paths.dir) : null;
}

function defaultScope(role: string, project: string, cwd: string): [string[], string[] | null] {
	if (role === "tech-writer") return [[`${project}/docs`], [".md", ".mdx", ".txt"]];
	if (role === "ui-designer") {
		const board = boardDir(cwd);
		return [[`${project}/prototypes`, ...(board ? [`${board}/runs`] : [])], null];
	}
	return [[], null];
}

// The fleet's state directory, Claude Code's transcripts, the boards root and
// the board's state root, as the hooks and the board compute them.
function protectedRoots(): string[] {
	const h = process.env.HOME ?? "";
	const state = process.env.CODER_FLEET_STATE_DIR || posix.join(process.env.XDG_STATE_HOME || posix.join(h, ".local", "state"), "coder-fleet");
	const config = process.env.CLAUDE_CONFIG_DIR || posix.join(h, ".claude");
	return [resolve(state), resolve(posix.join(config, "projects")), resolve(boardsRoot()), resolve(stateRoot())];
}

function configured(role: string, project: string): Set<string> | null {
	const raw = process.env.CODER_FLEET_OUTPUT_FILES ?? "";
	if (!raw.trim()) return null;
	const doc = JSON.parse(raw);
	if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("CODER_FLEET_OUTPUT_FILES is not an object");
	const entries = doc[role];
	if (!entries || (Array.isArray(entries) && !entries.length)) return null;
	const allowed = new Set<string>();
	for (const item of entries as unknown[]) {
		let p = expandUser(String(item));
		if (!p.startsWith("/")) p = `${project}/${p}`;
		allowed.add(resolve(p));
	}
	return allowed;
}

// A git query's output, or null when git fails or is missing. Every GIT_*
// variable is dropped, so nothing the caller set redirects git.
function gitOut(cwd: string, ...args: string[]): string | null {
	const env: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
	env.GIT_CONFIG_NOSYSTEM = "1";
	const r = run(["git", "-C", cwd, ...args], { env });
	return r.ok ? r.stdout : null;
}

// The linked worktree holding cwd, believed only as the main checkout
// registers it under its .claude/worktrees/; never the home directory or a
// parent of it.
function registeredWorktreeOf(cwd: string, project: string): string | null {
	const listing = gitOut(project, "worktree", "list", "--porcelain", "-z");
	if (!listing) return null;
	const h = resolve(home());
	const worktrees = `${project}/.claude/worktrees`;
	// Case is folded only where the filesystem holding the worktrees folds it;
	// on a case-sensitive one Agent-X is not agent-x. The home exclusion is a
	// refusal, so it folds always.
	const fold = caseInsensitiveAt(worktrees);
	const c = (s: string) => (fold ? s.toLowerCase() : s);
	let best: string | null = null;
	for (const field of listing.split("\0")) {
		if (!field.startsWith("worktree ")) continue;
		const tree = resolve(field.slice("worktree ".length));
		if (!inside(c(tree), c(worktrees))) continue;
		if (tree.toLowerCase() === h.toLowerCase() || foldedInside(h, tree)) continue;
		if (c(cwd) === c(tree) || inside(c(cwd), c(tree))) {
			if (best === null || tree.length > best.length) best = tree;
		}
	}
	return best;
}

// The checkout an agent works in, after the project: the linked worktree
// holding cwd when the project registers it under its .claude/worktrees/,
// else the project. With CLAUDE_PROJECT_DIR unset the project is cwd and no
// worktree is looked for, and a git failure leaves the project.
function agentCheckout(cwd: string): [string, string] {
	const project = resolve(process.env.CLAUDE_PROJECT_DIR || cwd);
	if (!process.env.CLAUDE_PROJECT_DIR) return [project, project];
	return [project, registeredWorktreeOf(resolve(cwd), project) ?? project];
}

// The main checkout of the repository holding project, as git lists it first,
// or null when project is in no repository. When git cannot answer for a
// project with a .git at or above it, this throws and the caller denies.
function mainCheckoutOf(project: string): string | null {
	const listing = gitOut(project, "worktree", "list", "--porcelain", "-z");
	if (listing !== null) {
		const first = listing.split("\0").find((f) => f.startsWith("worktree "));
		if (!first) throw new Error("git listed no main checkout");
		return resolve(first.slice("worktree ".length));
	}
	for (let d = project; ; d = posix.dirname(d)) {
		if (existsSync(posix.join(d, ".git"))) throw new Error("git could not name the main checkout");
		if (d === posix.dirname(d)) return null;
	}
}

type Event = Record<string, unknown>;

function rawTarget(event: Event): string {
	const data = event.tool_input && typeof event.tool_input === "object" ? (event.tool_input as Record<string, unknown>) : {};
	for (const k of ["file_path", "notebook_path", "path"]) {
		const v = data[k];
		if (v) return String(v);
	}
	return "";
}

function targetOf(raw: string, cwd: string): string {
	let t = expandUser(raw);
	if (!t.startsWith("/")) t = `${cwd}/${t}`;
	return resolve(t);
}

export function memoryOk(event: Event): boolean {
	const raw = rawTarget(event);
	const cwd = event.cwd ? String(event.cwd) : "";
	const agentType = typeof event.agent_type === "string" ? event.agent_type : event.agent_type ? String(event.agent_type) : "";
	if (!raw || !cwd || !agentType) return false;
	// Claude Code's own rule for the directory name.
	const name = agentType.replace(/[^a-zA-Z0-9\-_]/g, "-") || "unknown";
	const [project, here] = agentCheckout(cwd);
	const projects = here === project ? [project] : [project, here];
	const target = targetOf(raw, cwd);
	for (const base of projects) {
		const root = `${base}/.claude/agent-memory/${name}`;
		if (resolve(root) !== root) continue;
		if (inside(target, root)) return true;
	}
	return false;
}

export function scopeOk(event: Event, outside: boolean): boolean {
	const at = typeof event.agent_type === "string" ? event.agent_type : "";
	let role = at.split(":").pop() as string;
	if (!outside && !ROLES.has(role)) return true;
	role = SCOPE_OF[role] ?? role;

	const raw = rawTarget(event);
	const cwd = event.cwd ? String(event.cwd) : "";
	if (!raw || !cwd) return false;
	const target = targetOf(raw, cwd);

	if (!outside && role === "fleet-steward") {
		const root = process.env.CODER_FLEET_REPO;
		if (!root) return false;
		return inside(target, resolve(root));
	}

	if (outside) {
		// The inverse of every scope below: anywhere EXCEPT the project and the
		// main checkout git reports for it, roots included, and no fallback to
		// cwd. A project directory that is itself a linked worktree still
		// leaves the main checkout, and every worktree inside it, refused.
		if (!process.env.CLAUDE_PROJECT_DIR) return false;
		const folded = target.toLowerCase();
		for (const root of protectedRoots()) {
			const r = root.toLowerCase().replace(/\/+$/, "");
			if (folded === r || folded.startsWith(`${r}/`)) return false;
		}
		const project = resolve(process.env.CLAUDE_PROJECT_DIR);
		const main = mainCheckoutOf(project);
		for (const root of main === null ? [project] : [project, main]) {
			if (within(target, root, caseInsensitiveAt(root))) return false;
		}
		return true;
	}

	if (SPECS_ROLES.has(role)) {
		// Anchored to the physical specs directory of this repo's board; one
		// that resolves somewhere else has been redirected.
		const board = boardDir(cwd);
		if (!board) return false;
		const root = `${board}/specs`;
		if (existsSync(root) && resolve(root) !== root) return false;
		return inside(target, root);
	}

	// Every allowlist below is measured from the checkout the agent works in.
	const project = agentCheckout(cwd)[1];
	const [roots, suffixes] = defaultScope(role, project, cwd);
	let inDefault = roots.some((r) => inside(target, r));
	if (role === "tech-writer" && !inDefault) {
		// A top-level README or CHANGELOG is documentation too.
		inDefault = posix.dirname(target) === project && [".md", ".mdx"].includes(suffix(target).toLowerCase());
	}
	if (!inDefault) return false;
	if (suffixes && !suffixes.includes(suffix(target).toLowerCase())) return false;
	const exact = configured(role, project);
	if (exact !== null && !exact.has(target)) return false;
	return true;
}

// Either check, with every error a denial.
export function writeAllowed(event: Event, mode: "memory" | "outside" | "scope"): boolean {
	try {
		if (mode === "memory") return memoryOk(event);
		return scopeOk(event, mode === "outside");
	} catch {
		return false;
	}
}

// `boards fleet check-write-scope [--memory | --outside]`: the event on stdin,
// the answer as a word, allowed or denied. The shim exits 0 on allowed and 1
// on anything else.
export async function checkWriteScopeCommand(args: string[]): Promise<number> {
	let ok = false;
	try {
		const event = JSON.parse(await readInput());
		if (event && typeof event === "object" && !Array.isArray(event)) {
			ok = writeAllowed(event as Event, args.includes("--memory") ? "memory" : args.includes("--outside") ? "outside" : "scope");
		}
	} catch {}
	process.stdout.write(ok ? "allowed\n" : "denied\n");
	return 0;
}

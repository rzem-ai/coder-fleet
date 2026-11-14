// Remove the agent worktrees whose work has been adopted, then sweep the
// scratch directories of worktrees that no longer exist. Ported from scripts/prune-worktrees.sh, now a shim onto
// `boards fleet prune-worktrees`, which /coder-fleet:prune-worktrees runs.
//
// A worktree is removed only when all of these hold, each answered by git:
//   - its path is under <main checkout>/.claude/worktrees/
//   - it does not hold the current directory
//   - it is not locked: the harness locks an agent worktree while its agent
//     runs, so a lock means it may be in use, and is never lifted here
//   - git status shows nothing, untracked files included
//   - its HEAD is an ancestor of the trunk, local or origin's; or, under push
//     base-only, its work landed there as one squashed commit
// Every verdict is taken before anything is removed. Removal is git worktree
// remove, then git branch -d, then one git worktree prune. A git refusal is
// reported and left as it is; nothing is ever forced.
//
// The scratch sweep reads CODER_FLEET_SCRATCH_ROOT, else
// /private/tmp/claude-<uid> when /private/tmp exists, else /tmp/claude-<uid>.
// The harness names each entry by encoding a working directory with
// tr '/.' '--', so every name starts with '-'; names are only ever compared
// as strings. Only a real directory named <enc(main)>--claude-worktrees-<x>,
// matching no live worktree's encoded path exactly or as a prefix followed by
// '-', is deleted. If any path involved holds a character whose encoding is
// unverified, the sweep is skipped.
//
// Output, one tab-separated line per verdict:
//   removed <path> <branch|-> <head>      would-remove under --dry-run
//   kept <path> <not-agent|current|locked|missing|dirty|unmerged>
//   scratch <name>                        would-delete-scratch under --dry-run
//   refused <path-or-branch> <first line of git's stderr>
//   sweep-skipped <encoding-unverified|no-scratch-root>
// Exit 0 whenever it ran, refusals included; 1, having changed nothing, when
// the resolver finds no trunk, the reason on stderr; 2 on a usage error or
// outside a git repository.
import { lstatSync, readdirSync, realpathSync, rmSync, writeSync } from "node:fs";
import { join } from "node:path";
import { trunk } from "./config.ts";
import { isDir, run } from "./proc.ts";

type Worktree = { path: string; head: string; branch: string; locked: boolean };

function emit(...fields: string[]): void {
	writeSync(1, `${fields.join("\t")}\n`);
}

function firstLine(s: string): string {
	return s.split("\n", 1)[0].replace(/\r$/, "");
}

function realPath(p: string): string {
	if (!isDir(p)) return p;
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
}

const enc = (p: string) => p.replace(/[/.]/g, "-");

const git = (args: string[], input?: string) => run(["git", ...args], { input });

function readWorktrees(): Worktree[] {
	const out: Worktree[] = [];
	const r = git(["worktree", "list", "--porcelain", "-z"]);
	let cur: Worktree = { path: "", head: "", branch: "-", locked: false };
	const flush = () => {
		if (cur.path) out.push(cur);
		cur = { path: "", head: "", branch: "-", locked: false };
	};
	for (const field of r.stdout.split("\0")) {
		if (field === "") {
			flush();
			continue;
		}
		if (field.startsWith("worktree ")) cur.path = field.slice("worktree ".length);
		else if (field.startsWith("HEAD ")) cur.head = field.slice("HEAD ".length);
		else if (field.startsWith("branch ")) cur.branch = field.slice("branch ".length).replace(/^refs\/heads\//, "");
		else if (field === "detached") cur.branch = "-";
		else if (field === "locked" || field.startsWith("locked ")) cur.locked = true;
	}
	flush();
	return out;
}

export function pruneWorktreesCommand(args: string[]): number {
	let dry = false;
	if (args.length === 1 && args[0] === "--dry-run") dry = true;
	else if (args.length !== 0) {
		process.stderr.write("usage: prune-worktrees.sh [--dry-run]\n");
		return 2;
	}
	if (!git(["rev-parse", "--path-format=absolute", "--git-common-dir"]).ok) {
		process.stderr.write("prune-worktrees.sh: not inside a git repository\n");
		return 2;
	}
	const cwdReal = realPath(process.cwd());
	let wts = readWorktrees();
	if (!wts.length) {
		process.stderr.write("prune-worktrees.sh: git listed no worktrees\n");
		return 2;
	}
	const main = wts[0].path;
	const mainReal = realPath(main);
	const agentPrefix = `${mainReal}/.claude/worktrees/`;

	// The trunk fleet trunk resolves. Either the local branch or origin's copy
	// proves the commits exist outside the worktree. A baseBranch the resolver
	// cannot use stops the run before any verdict.
	const t = trunk(main);
	if (!t.ok) {
		process.stderr.write(`prune-worktrees.sh: no trunk, so nothing was judged or removed: ${t.vars.FLEET_TRUNK_REASON}\n`);
		return 1;
	}
	const def = t.vars.FLEET_TRUNK;
	const baseOnly = t.vars.FLEET_CONFIG_PUSH === "base-only";
	const defRefs = [`refs/heads/${def}`, `refs/remotes/origin/${def}`].filter((ref) => git(["-C", main, "show-ref", "--verify", "-q", ref]).ok);

	const isMerged = (head: string) => !!head && defRefs.some((ref) => git(["-C", main, "merge-base", "--is-ancestor", head, ref]).ok);

	// Under push base-only a card lands as one squashed commit on the trunk,
	// so a worktree is also merged when its whole diff from its merge base has
	// the patch id of one commit the trunk gained since that base.
	const isLanded = (head: string) => {
		if (!baseOnly || !head) return false;
		for (const ref of defRefs) {
			const mb = git(["-C", main, "merge-base", head, ref]);
			if (!mb.ok) continue;
			const base = mb.stdout.trim();
			const diff = git(["-C", main, "diff", "--no-color", "--no-ext-diff", base, head]);
			const pid = git(["-C", main, "patch-id", "--stable"], diff.stdout);
			if (!diff.ok || !pid.ok) continue;
			const id = pid.stdout.replace(/\n+$/, "").split(" ")[0];
			if (!id) continue;
			const log = git(["-C", main, "log", "-p", "--no-merges", "--no-color", "--no-ext-diff", "--format=commit %H", `${base}..${ref}`]);
			const ids = git(["-C", main, "patch-id", "--stable"], log.stdout);
			if (!log.ok || !ids.ok) continue;
			if (`\n${ids.stdout.replace(/\n+$/, "")}`.includes(`\n${id} `)) return true;
		}
		return false;
	};

	// --no-optional-locks: read only, so a live agent's index.lock is never
	// contended and its index never rewritten underneath it.
	const isClean = (p: string) => {
		const r = git(["--no-optional-locks", "-C", p, "status", "--porcelain", "--untracked-files=normal", "--ignore-submodules=none"]);
		return r.ok && r.stdout.replace(/\n+$/, "") === "";
	};

	// --- verdicts, all taken before anything is removed ---
	const remove: Worktree[] = [];
	for (const w of wts.slice(1)) {
		const pr = realPath(w.path);
		if (!(pr.startsWith(agentPrefix) && pr.length > agentPrefix.length)) emit("kept", w.path, "not-agent");
		else if (cwdReal === pr || cwdReal.startsWith(`${pr}/`)) emit("kept", w.path, "current");
		else if (w.locked) emit("kept", w.path, "locked");
		// A registered, unlocked worktree whose directory is gone: the prune
		// below drops its registration.
		else if (!isDir(w.path)) emit("kept", w.path, "missing");
		else if (!isClean(w.path)) emit("kept", w.path, "dirty");
		else if (!isMerged(w.head) && !isLanded(w.head)) emit("kept", w.path, "unmerged");
		else remove.push(w);
	}

	// --- removal ---
	const removed: string[] = [];
	for (const w of remove) {
		if (dry) {
			emit("would-remove", w.path, w.branch, w.head);
			removed.push(w.path);
			continue;
		}
		const r = git(["-C", main, "worktree", "remove", w.path]);
		if (r.ok) {
			emit("removed", w.path, w.branch, w.head);
			removed.push(w.path);
			if (w.branch !== "-" && w.branch !== def) {
				const b = git(["-C", main, "branch", "-d", w.branch]);
				if (!b.ok) emit("refused", w.branch, firstLine(b.stderr));
			}
		} else emit("refused", w.path, firstLine(r.stderr));
	}
	if (!dry) {
		const r = git(["-C", main, "worktree", "prune"]);
		if (!r.ok) emit("refused", "worktree prune", firstLine(r.stderr));
	}

	// --- scratch sweep, against the worktrees live now ---
	let root = process.env.CODER_FLEET_SCRATCH_ROOT || "";
	if (!root) root = isDir("/private/tmp") ? `/private/tmp/claude-${process.getuid?.()}` : `/tmp/claude-${process.getuid?.()}`;
	if (!isDir(root)) {
		emit("sweep-skipped", "no-scratch-root");
		return 0;
	}
	wts = readWorktrees();
	const unverified = (p: string) => /[^A-Za-z0-9/._-]/.test(p);
	if (unverified(mainReal)) {
		emit("sweep-skipped", "encoding-unverified");
		return 0;
	}
	const liveEnc: string[] = [];
	for (const w of wts.slice(1)) {
		if (removed.includes(w.path)) continue;
		const pr = realPath(w.path);
		if (unverified(pr)) {
			emit("sweep-skipped", "encoding-unverified");
			return 0;
		}
		liveEnc.push(enc(pr));
	}
	const prefix = `${enc(mainReal)}--claude-worktrees-`;
	const isLive = (name: string) => liveEnc.some((e) => name === e || name.startsWith(`${e}-`));
	let names: string[] = [];
	try {
		names = readdirSync(root)
			.filter((n) => !n.startsWith("."))
			.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
	} catch {}
	for (const name of names) {
		const entry = join(root, name);
		try {
			const st = lstatSync(entry);
			if (st.isSymbolicLink() || !st.isDirectory()) continue;
		} catch {
			continue;
		}
		if (!(name.startsWith(prefix) && name.length > prefix.length)) continue;
		if (isLive(name)) continue;
		if (dry) emit("would-delete-scratch", name);
		else {
			try {
				rmSync(entry, { recursive: true, force: true });
				emit("scratch", name);
			} catch (e) {
				emit("refused", entry, firstLine(String((e as Error).message)));
			}
		}
	}
	return 0;
}

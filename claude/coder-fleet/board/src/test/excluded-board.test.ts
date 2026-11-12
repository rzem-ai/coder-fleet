import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BOARD_DIR } from "../board-root.ts";
import { restoreSpecs, STATE_BRANCH, stateWorktreeOf } from "../state-worktree.ts";

function lexists(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}

// CF-201: a project keeps the board, the fleet's memory, its installed rules,
// its config and its specs out of its own history with the common git dir's
// info/exclude, as /init writes it through scripts/fleet-exclude.py. Nothing
// under .boards/ is tracked on the default branch, so every board file is
// untracked and excluded in each checkout, and the state branch is the only
// place the board is committed. These run real repositories: the main
// checkout, its state worktree, an agent worktree and a bare remote.

const CLI = join(import.meta.dir, "..", "cli.ts");
const EXCLUDE_SCRIPT = join(import.meta.dir, "..", "..", "..", "scripts", "fleet-exclude.py");
const MEMORY = join(".claude", "agent-memory", "coder-fleet-coder", "MEMORY.md");
let tmp = "";
let repo = "";
let remote = "";
let agent = "";
let state = "";

function run(cmd: string[], cwd: string, env: Record<string, string | undefined> = process.env) {
	const p = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
	return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

function git(dir: string, ...args: string[]): string {
	const r = run(["git", "-C", dir, ...args], dir);
	if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.err}`);
	return r.out.trim();
}

/** The CLI as a hook or the lead runs it: no root override, no push script, the board found from cwd. */
function board(cwd: string, ...args: string[]) {
	const env = { ...process.env };
	delete env.CODER_FLEET_BOARD_ROOT;
	delete env.CODER_FLEET_STATE_PUSH_SCRIPT;
	return run(["bun", CLI, ...args], cwd, env);
}

function task(id: string, title: string, status = "To Do"): string {
	return `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\nassignee: []\ncreated_date: '2026-11-08 00:00'\nlabels: []\ndependencies: []\n---\n\n## Description\n\n${title}\n`;
}

const SPECS = join("docs", "specs");

/** A spec committed on the state branch, as hooks/memory-state.sh commits one (CF-201.1). */
function specOnState(rel: string, text: string): void {
	const path = join(state, SPECS, rel);
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, text);
	git(state, "add", "-f", "--", join(SPECS, rel));
	git(state, "commit", "-q", "-m", `Record specs: ${rel}`);
}

/** The files the state branch's tip carries under a path. */
function onState(path: string): string[] {
	return git(repo, "ls-tree", "-r", "--name-only", STATE_BRANCH, "--", path).split("\n").filter(Boolean);
}

beforeEach(() => {
	tmp = realpathSync(mkdtempSync(join(tmpdir(), "excluded-board-")));
	repo = join(tmp, "repo");
	remote = join(tmp, "remote.git");
	mkdirSync(repo, { recursive: true });
	writeFileSync(join(repo, "README.md"), "product\n");
	git(tmp, "init", "-q", "--bare", "-b", "main", remote);
	git(repo, "init", "-q", "-b", "main");
	git(repo, "config", "user.email", "test@example.com");
	git(repo, "config", "user.name", "Test User");
	git(repo, "add", "-A");
	git(repo, "commit", "-q", "-m", "base");
	git(repo, "remote", "add", "origin", remote);
	git(repo, "push", "-q", "-u", "origin", "main");
	git(repo, "remote", "set-head", "origin", "main");
	const excluded = run(["python3", "-I", EXCLUDE_SCRIPT, "write"], repo);
	if (excluded.code !== 0) throw new Error(`fleet-exclude.py write: ${excluded.out}${excluded.err}`);
	// The board /init makes, after the exclude: untracked from the start.
	mkdirSync(join(repo, BOARD_DIR, "tasks"), { recursive: true });
	writeFileSync(
		join(repo, BOARD_DIR, "config.yml"),
		'project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]\ndefault_status: "To Do"\nauto_commit: true\n',
	);
	writeFileSync(join(repo, BOARD_DIR, ".gitignore"), ".focus\n");
	writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"), task("BD-1", "One"));
	writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-2 - Two.md"), task("BD-2", "Two"));
	mkdirSync(join(repo, MEMORY, ".."), { recursive: true });
	writeFileSync(join(repo, MEMORY), "- a note from before the move\n");
	agent = join(repo, ".claude", "worktrees", "agent-x");
	git(repo, "worktree", "add", "-q", agent, "-b", "agent-x");
	// The agent worktree is kept out of the main checkout's status on its own, as state-worktree.test.ts does.
	writeFileSync(join(repo, ".git", "info", "exclude"), "/.claude/worktrees/agent-x/\n", { flag: "a" });
	state = stateWorktreeOf(repo);
	const log = process.env.BOARD_LOG_FILE;
	if (log && existsSync(log)) unlinkSync(log);
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("an excluded board", () => {
	it("is untracked and out of the main checkout's status before the move", () => {
		expect(git(repo, "status", "--porcelain", "--untracked-files=all")).toBe("");
		expect(git(repo, "ls-files", "--", BOARD_DIR)).toBe("");
	});

	it("moves onto the state branch with every card, its config and the memory, and main gains no commit", () => {
		const r = board(repo, "state");
		expect(r.code).toBe(0);
		expect(onState(BOARD_DIR)).toEqual([
			".boards/.gitignore",
			".boards/config.yml",
			".boards/tasks/bd-1 - One.md",
			".boards/tasks/bd-2 - Two.md",
		]);
		expect(onState(".claude/agent-memory")).toEqual([MEMORY]);
		expect(git(repo, "log", "--format=%s", "main")).toBe("base");
		expect(git(state, "status", "--porcelain", "--untracked-files=all")).toBe("");
		// The main checkout's copy stays on disk.
		expect(existsSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"))).toBe(true);
	});

	it("commits a new card and an edit made from an agent worktree on the state branch, and nowhere else", () => {
		expect(board(repo, "state").code).toBe(0);
		const mainBefore = git(repo, "rev-parse", "main");
		const agentBefore = git(repo, "rev-parse", "agent-x");
		const created = board(agent, "task", "create", "Three", "--by", "lead");
		expect(created.code).toBe(0);
		expect(created.err).not.toContain("commit failed");
		const edited = board(agent, "task", "edit", "BD-1", "-s", "In Progress", "--by", "SubagentStart");
		expect(edited.code).toBe(0);
		expect(onState(join(BOARD_DIR, "tasks"))).toContain(".boards/tasks/bd-3 - Three.md");
		expect(git(repo, "show", `${STATE_BRANCH}:.boards/tasks/bd-1 - One.md`)).toContain("status: In Progress");
		expect(git(state, "status", "--porcelain", "--untracked-files=all")).toBe("");
		expect(git(repo, "rev-parse", "main")).toBe(mainBefore);
		expect(git(repo, "rev-parse", "agent-x")).toBe(agentBefore);
		const log = process.env.BOARD_LOG_FILE ?? "";
		expect(existsSync(log) ? readFileSync(log, "utf8") : "").not.toContain("is gitignored");
	});

	it("keeps a personal pattern of the info/exclude out of the state branch, bypassing only the fleet's own entry", () => {
		writeFileSync(join(repo, ".git", "info", "exclude"), "*.swp\n.DS_Store\n", { flag: "a" });
		expect(board(repo, "state").code).toBe(0);
		writeFileSync(join(state, BOARD_DIR, "tasks", ".bd-1 - One.md.swp"), "editor swap\n");
		writeFileSync(join(state, BOARD_DIR, ".DS_Store"), "finder\n");
		expect(board(repo, "task", "create", "Three", "--by", "lead").code).toBe(0);
		const files = onState(BOARD_DIR);
		expect(files).toContain(".boards/tasks/bd-3 - Three.md");
		expect(files).not.toContain(".boards/tasks/.bd-1 - One.md.swp");
		expect(files).not.toContain(".boards/.DS_Store");
	});

	it("is never committed on main while the move cannot be made", () => {
		mkdirSync(join(repo, ".git", "coder-fleet"), { recursive: true });
		writeFileSync(join(repo, ".git", "coder-fleet", "state-migration-failed"), "a move that failed\n");
		const mainBefore = git(repo, "rev-parse", "main");
		const created = board(repo, "task", "create", "Three", "--by", "lead");
		expect(created.code).toBe(0);
		expect(existsSync(join(repo, BOARD_DIR, "tasks", "bd-3 - Three.md"))).toBe(true);
		expect(git(repo, "rev-parse", "main")).toBe(mainBefore);
		expect(git(repo, "ls-files", "--", BOARD_DIR)).toBe("");
	});

	it("moves with a memory directory that holds no file yet", () => {
		rmSync(join(repo, MEMORY));
		const r = board(repo, "state");
		expect(r.code).toBe(0);
		expect(onState(BOARD_DIR)).toContain(".boards/config.yml");
		expect(onState(".claude/agent-memory")).toEqual([]);
	});

	it("is excluded the same way in the main checkout, an agent worktree and the state worktree", () => {
		expect(board(repo, "state").code).toBe(0);
		const exclude = realpathSync(join(repo, ".git", "info", "exclude"));
		for (const checkout of [repo, agent, state]) {
			for (const path of [
				".boards/x",
				".claude/agent-memory/coder-fleet-coder/x",
				"docs/specs/x.md",
				"docs/runs/x.md",
			]) {
				const r = run(["git", "-C", checkout, "check-ignore", "-v", "--no-index", "--", path], checkout);
				expect(r.code).toBe(0);
				const source = r.out.split(":")[0] as string;
				expect(realpathSync(resolve(checkout, source))).toBe(exclude);
			}
		}
	});
});

describe("the flush in an excluded project", () => {
	it("lands nothing on the default branch, says so in one line, and loses no board or memory file", () => {
		expect(board(repo, "state").code).toBe(0);
		expect(board(repo, "task", "create", "Three", "--by", "lead").code).toBe(0);
		git(repo, "tag", "-a", "v1.0.0", "-m", "v1.0.0: the release", "main");
		git(repo, "push", "-q", "origin", "v1.0.0");
		const originBefore = git(remote, "rev-parse", "refs/heads/main");
		const mainBefore = git(repo, "rev-parse", "main");
		const stateBefore = git(repo, "rev-parse", STATE_BRANCH);
		const filesBefore = onState(".");

		const r = board(repo, "flush", "--tag", "v1.0.0", "--by", "lead");

		expect(r.code).toBe(0);
		const lines = r.out.trim().split("\n");
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("nothing lands on main");
		expect(git(remote, "rev-parse", "refs/heads/main")).toBe(originBefore);
		expect(git(repo, "rev-parse", "main")).toBe(mainBefore);
		expect(git(repo, "rev-parse", STATE_BRANCH)).toBe(stateBefore);
		expect(onState(".")).toEqual(filesBefore);
		expect(existsSync(join(state, BOARD_DIR, "tasks", "bd-3 - Three.md"))).toBe(true);
		expect(existsSync(join(state, MEMORY))).toBe(true);
		expect(git(state, "status", "--porcelain", "--untracked-files=all")).toBe("");
	});
});

describe("a fresh clone", () => {
	it("gets the board and the memory back from the pushed state branch on its first board use", () => {
		expect(board(repo, "state").code).toBe(0);
		expect(board(repo, "task", "create", "Three", "--by", "lead").code).toBe(0);
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const clone = join(tmp, "clone");
		git(tmp, "clone", "-q", remote, clone);
		expect(existsSync(join(clone, BOARD_DIR))).toBe(false);

		const listed = board(clone, "task", "list", "--plain");

		expect(listed.code).toBe(0);
		expect(listed.out).toContain("Three");
		const cloneState = stateWorktreeOf(clone);
		expect(git(clone, "symbolic-ref", "--short", "HEAD")).toBe("main");
		expect(git(cloneState, "symbolic-ref", "--short", "HEAD")).toBe(STATE_BRANCH);
		expect(git(clone, "rev-parse", STATE_BRANCH)).toBe(git(repo, "rev-parse", STATE_BRANCH));
		expect(readFileSync(join(cloneState, MEMORY), "utf8")).toBe("- a note from before the move\n");
		const log = process.env.BOARD_LOG_FILE ?? "";
		expect(readFileSync(log, "utf8")).toContain(
			`adopted ${STATE_BRANCH} from origin at ${git(repo, "rev-parse", "--short", STATE_BRANCH)}`,
		);
	});

	it("writes the exclude entries when it adopts the state branch, so its main-checkout memory is never left untracked and unexcluded", () => {
		expect(board(repo, "state").code).toBe(0);
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const clone = join(tmp, "clone");
		git(tmp, "clone", "-q", remote, clone);
		const exclude = join(clone, ".git", "info", "exclude");
		const before = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
		expect(before).not.toContain("/.boards/");

		expect(board(clone, "task", "list", "--plain").code).toBe(0);

		const after = readFileSync(exclude, "utf8");
		for (const entry of ["/.boards/", "/.claude/agent-memory/coder-fleet-*/", "/docs/specs/", "/docs/runs/"]) {
			expect(after.split("\n")).toContain(entry);
		}
		expect(git(clone, "rev-list", "--count", "main")).toBe("1");
		expect(git(clone, "diff", "--cached", "--name-only")).toBe("");
		mkdirSync(join(clone, MEMORY, ".."), { recursive: true });
		writeFileSync(join(clone, MEMORY), "- a note\n");
		expect(git(clone, "status", "--porcelain", "--untracked-files=all")).toBe("");
	});

	it("writes no exclude, and logs why, when it adopts the state branch of a project whose default branch still tracks the board", () => {
		const tracked = join(tmp, "tracked");
		const trackedRemote = join(tmp, "tracked.git");
		git(tmp, "init", "-q", "--bare", "-b", "main", trackedRemote);
		mkdirSync(join(tracked, BOARD_DIR, "tasks"), { recursive: true });
		writeFileSync(join(tracked, BOARD_DIR, "config.yml"), 'project_name: "t"\ntask_prefix: "BD"\nauto_commit: true\n');
		writeFileSync(join(tracked, BOARD_DIR, "tasks", "bd-1 - One.md"), task("BD-1", "One"));
		git(tmp, "init", "-q", "-b", "main", tracked);
		git(tracked, "add", "-A");
		git(tracked, "commit", "-q", "-m", "a board tracked as before CF-201");
		git(tracked, "remote", "add", "origin", trackedRemote);
		git(tracked, "push", "-q", "origin", "main");
		expect(board(tracked, "state").code).toBe(0);
		git(tracked, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const clone = join(tmp, "tracked-clone");
		git(tmp, "clone", "-q", trackedRemote, clone);
		rmSync(join(clone, BOARD_DIR), { recursive: true, force: true });
		git(clone, "checkout", "-q", "--", BOARD_DIR);

		expect(board(clone, "task", "list", "--plain").code).toBe(0);

		const exclude = join(clone, ".git", "info", "exclude");
		expect(existsSync(exclude) ? readFileSync(exclude, "utf8") : "").not.toContain("/.boards/");
		expect(readFileSync(process.env.BOARD_LOG_FILE ?? "", "utf8")).toContain("wrote no exclude");
	});

	it("adopts only the state branch of the remote it fetches from, never another remote's", () => {
		expect(board(repo, "state").code).toBe(0);
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		// A second remote whose state branch says something else.
		const stranger = join(tmp, "stranger.git");
		git(tmp, "init", "-q", "--bare", "-b", "main", stranger);
		git(repo, "push", "-q", stranger, "main");
		const forged = join(tmp, "forged");
		git(tmp, "clone", "-q", stranger, forged);
		mkdirSync(join(forged, BOARD_DIR, "tasks"), { recursive: true });
		writeFileSync(join(forged, BOARD_DIR, "config.yml"), 'project_name: "t"\ntask_prefix: "BD"\nauto_commit: true\n');
		writeFileSync(join(forged, BOARD_DIR, "tasks", "bd-9 - Forged.md"), task("BD-9", "Forged"));
		git(forged, "checkout", "-q", "-b", STATE_BRANCH);
		git(forged, "add", "-f", "--", BOARD_DIR);
		git(forged, "commit", "-q", "-m", "forged board");
		git(forged, "push", "-q", "origin", STATE_BRANCH);

		// With origin there, the clone takes origin's and never the stranger's.
		const clone = join(tmp, "clone");
		git(tmp, "clone", "-q", remote, clone);
		git(clone, "remote", "add", "stranger", stranger);
		git(clone, "fetch", "-q", "stranger");
		expect(board(clone, "task", "list", "--plain").out).not.toContain("Forged");
		expect(git(clone, "rev-parse", STATE_BRANCH)).toBe(git(repo, "rev-parse", STATE_BRANCH));

		// With origin's state branch absent, the stranger's is still not taken.
		const lone = join(tmp, "lone");
		git(tmp, "clone", "-q", "--single-branch", "-b", "main", remote, lone);
		git(lone, "remote", "add", "stranger", stranger);
		git(lone, "fetch", "-q", "stranger");
		const listed = board(lone, "task", "list", "--plain");
		expect(listed.out).not.toContain("Forged");
		expect(run(["git", "-C", lone, "rev-parse", "-q", "--verify", `refs/heads/${STATE_BRANCH}`], lone).code).not.toBe(
			0,
		);
	});

	it("gets docs/specs/ back in its main checkout when it adopts the state branch, untracked, excluded and committed nowhere", () => {
		expect(board(repo, "state").code).toBe(0);
		specOnState("CF-1.md", "# CF-1\n\nthe spec\n");
		specOnState(join("CF-2", "notes.md"), "a picture\n");
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const clone = join(tmp, "clone");
		git(tmp, "clone", "-q", remote, clone);
		expect(existsSync(join(clone, SPECS))).toBe(false);

		expect(board(clone, "task", "list", "--plain").code).toBe(0);

		expect(readFileSync(join(clone, SPECS, "CF-1.md"), "utf8")).toBe("# CF-1\n\nthe spec\n");
		expect(readFileSync(join(clone, SPECS, "CF-2", "notes.md"), "utf8")).toBe("a picture\n");
		expect(git(clone, "status", "--porcelain", "--untracked-files=all")).toBe("");
		expect(git(clone, "ls-files", "--", SPECS)).toBe("");
		expect(git(clone, "rev-list", "--count", "main")).toBe("1");
		expect(readFileSync(process.env.BOARD_LOG_FILE ?? "", "utf8")).toContain("restored 2 spec(s)");
	});

	it("never writes a state branch spec over one the main checkout already has, or through a symlink", () => {
		expect(board(repo, "state").code).toBe(0);
		specOnState("CF-1.md", "the state branch copy\n");
		specOnState("CF-3.md", "only on the state branch\n");
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const clone = join(tmp, "clone");
		git(tmp, "clone", "-q", remote, clone);
		mkdirSync(join(clone, SPECS), { recursive: true });
		writeFileSync(join(clone, SPECS, "CF-1.md"), "a local edit the clone already had\n");
		const outside = join(tmp, "outside.md");
		writeFileSync(outside, "not a spec\n");
		symlinkSync(outside, join(clone, SPECS, "CF-3.md"));

		expect(board(clone, "task", "list", "--plain").code).toBe(0);

		expect(readFileSync(join(clone, SPECS, "CF-1.md"), "utf8")).toBe("a local edit the clone already had\n");
		expect(readFileSync(outside, "utf8")).toBe("not a spec\n");
		expect(lstatSync(join(clone, SPECS, "CF-3.md")).isSymbolicLink()).toBe(true);
		expect(readFileSync(process.env.BOARD_LOG_FILE ?? "", "utf8")).toContain("kept 2 the main checkout already had");
	});

	it("restores no spec through a symlinked docs/specs/", () => {
		expect(board(repo, "state").code).toBe(0);
		specOnState("CF-1.md", "the spec\n");
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const clone = join(tmp, "clone");
		git(tmp, "clone", "-q", remote, clone);
		const elsewhere = join(tmp, "elsewhere");
		mkdirSync(elsewhere);
		mkdirSync(join(clone, "docs"));
		symlinkSync(elsewhere, join(clone, SPECS));

		expect(board(clone, "task", "list", "--plain").code).toBe(0);

		expect(existsSync(join(elsewhere, "CF-1.md"))).toBe(false);
		expect(readFileSync(process.env.BOARD_LOG_FILE ?? "", "utf8")).toContain("restored no spec");
	});

	it("restores a spec another machine added when state --from fast-forwards, and none over a local one", () => {
		expect(board(repo, "state").code).toBe(0);
		specOnState("CF-1.md", "first\n");
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const clone = join(tmp, "clone");
		git(tmp, "clone", "-q", remote, clone);
		expect(board(clone, "task", "list", "--plain").code).toBe(0);
		writeFileSync(join(clone, SPECS, "CF-1.md"), "edited on the clone\n");
		specOnState("CF-1.md", "edited on the first machine\n");
		specOnState("CF-5.md", "new on the first machine\n");
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		git(clone, "fetch", "-q", "origin");

		expect(board(clone, "state", "--from", "origin").code).toBe(0);

		expect(readFileSync(join(clone, SPECS, "CF-5.md"), "utf8")).toBe("new on the first machine\n");
		expect(readFileSync(join(clone, SPECS, "CF-1.md"), "utf8")).toBe("edited on the clone\n");
	});

	it("restores no .git path, symlink, gitlink, executable or non-.md file from a state branch, and logs each refusal", () => {
		// A state branch as a hostile remote could serve it, built with plumbing,
		// since git add and checkout refuse these paths on their own.
		const mk = (lines: string[]): string => {
			const p = Bun.spawnSync(["git", "-C", repo, "mktree"], { stdin: new TextEncoder().encode(`${lines.join("\n")}\n`) });
			if (p.exitCode !== 0) throw new Error(`git mktree: ${p.stderr.toString()}`);
			return p.stdout.toString().trim();
		};
		const blob = (text: string): string => {
			const p = Bun.spawnSync(["git", "-C", repo, "hash-object", "-w", "--stdin"], { stdin: new TextEncoder().encode(text) });
			return p.stdout.toString().trim();
		};
		const gitTree = mk([`100644 blob ${blob("[core]\n\thooksPath = /tmp\n")}\tconfig`]);
		const hooks = mk([`100644 blob ${blob("#!/bin/sh\nexit 1\n")}\tpre-commit`]);
		const x = mk([`040000 tree ${mk([`040000 tree ${hooks}\thooks`])}\t.GIT`]);
		const specs = mk([
			`040000 tree ${gitTree}\t.git`,
			`040000 tree ${x}\tx`,
			`120000 blob ${blob("../../../outside.md")}\tlink.md`,
			`100644 blob ${blob("#!/bin/sh\n")}\tevil.sh`,
			`100755 blob ${blob("# runs\n")}\trun.md`,
			`160000 commit ${git(repo, "rev-parse", "main")}\tsub.md`,
			`100644 blob ${blob("# CF-1\n")}\tCF-1.md`,
		]);
		const root = mk([`040000 tree ${mk([`040000 tree ${specs}\tspecs`])}\tdocs`]);
		git(repo, "update-ref", `refs/heads/${STATE_BRANCH}`, git(repo, "commit-tree", root, "-m", "a hostile state branch"));

		restoreSpecs(repo);

		expect(readFileSync(join(repo, SPECS, "CF-1.md"), "utf8")).toBe("# CF-1\n");
		for (const name of [".git", "x", "link.md", "evil.sh", "run.md", "sub.md"]) {
			expect(lexists(join(repo, SPECS, name))).toBe(false);
		}
		const log = readFileSync(process.env.BOARD_LOG_FILE ?? "", "utf8");
		for (const path of [".git/config", "x/.GIT/hooks/pre-commit", "link.md", "evil.sh", "run.md", "sub.md"]) {
			expect(log).toContain(`"docs/specs/${path}"`);
		}
		expect(log).toContain("restored 1 spec(s)");
	});

	it("restores no spec into a clone whose default branch still tracks docs/specs/", () => {
		const tracked = join(tmp, "tracked");
		const trackedRemote = join(tmp, "tracked.git");
		git(tmp, "init", "-q", "--bare", "-b", "main", trackedRemote);
		mkdirSync(join(tracked, BOARD_DIR, "tasks"), { recursive: true });
		mkdirSync(join(tracked, SPECS), { recursive: true });
		writeFileSync(join(tracked, BOARD_DIR, "config.yml"), 'project_name: "t"\ntask_prefix: "BD"\nauto_commit: true\n');
		writeFileSync(join(tracked, SPECS, "CF-1.md"), "tracked\n");
		git(tmp, "init", "-q", "-b", "main", tracked);
		git(tracked, "add", "-A");
		git(tracked, "commit", "-q", "-m", "specs tracked as before CF-201");
		git(tracked, "remote", "add", "origin", trackedRemote);
		git(tracked, "push", "-q", "origin", "main");
		expect(board(tracked, "state").code).toBe(0);
		const trackedState = stateWorktreeOf(tracked);
		writeFileSync(join(trackedState, SPECS, "CF-7.md"), "only on the state branch\n");
		git(trackedState, "add", "-f", "--", SPECS);
		git(trackedState, "commit", "-q", "-m", "a spec on the state branch");
		git(tracked, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const clone = join(tmp, "tracked-clone");
		git(tmp, "clone", "-q", trackedRemote, clone);

		expect(board(clone, "task", "list", "--plain").code).toBe(0);

		expect(existsSync(join(clone, SPECS, "CF-7.md"))).toBe(false);
		expect(readFileSync(process.env.BOARD_LOG_FILE ?? "", "utf8")).toContain("still tracks docs/specs/");
	});

	it("leaves an existing local state branch alone when the remote's differs, until state --from fast-forwards it", () => {
		expect(board(repo, "state").code).toBe(0);
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const clone = join(tmp, "clone");
		git(tmp, "clone", "-q", remote, clone);
		expect(board(clone, "task", "list", "--plain").code).toBe(0);
		const before = git(clone, "rev-parse", STATE_BRANCH);
		// The first machine writes on; the clone fetches it, and nothing moves on its own.
		expect(board(repo, "task", "create", "Three", "--by", "lead").code).toBe(0);
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		git(clone, "fetch", "-q", "origin");
		expect(board(clone, "task", "list", "--plain").out).not.toContain("Three");
		expect(git(clone, "rev-parse", STATE_BRANCH)).toBe(before);

		const restored = board(clone, "state", "--from", "origin");
		expect(restored.code).toBe(0);
		expect(git(clone, "rev-parse", STATE_BRANCH)).toBe(git(repo, "rev-parse", STATE_BRANCH));
		expect(board(clone, "task", "list", "--plain").out).toContain("Three");
		const log = process.env.BOARD_LOG_FILE ?? "";
		expect(readFileSync(log, "utf8")).toContain(`fast-forwarded ${STATE_BRANCH} from origin`);

		// A local write the remote lacks makes it no fast-forward: refused, nothing moves.
		expect(board(clone, "task", "create", "Local", "--by", "lead").code).toBe(0);
		expect(board(repo, "task", "create", "Four", "--by", "lead").code).toBe(0);
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		git(clone, "fetch", "-q", "origin");
		const local = git(clone, "rev-parse", STATE_BRANCH);
		const refused = board(clone, "state", "--from", "origin");
		expect(refused.code).not.toBe(0);
		expect(refused.err).toContain("not a fast-forward");
		expect(git(clone, "rev-parse", STATE_BRANCH)).toBe(local);
	});
});

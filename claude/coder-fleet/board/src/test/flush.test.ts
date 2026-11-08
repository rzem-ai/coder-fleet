import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOARD_DIR } from "../board-root.ts";
import { FLUSH_SUBJECT_UNTAGGED, flushSubject } from "../flush.ts";
import { STATE_BRANCH, stateWorktreeOf } from "../state-worktree.ts";

// The flush lands the state branch's board and memory changes on the default
// branch as one commit and pushes it. These tests run real repositories: the
// main checkout, its state worktree, a bare remote, and a second clone that
// pushes to the remote from a pre-push hook, which is a real push race.

const CLI = join(import.meta.dir, "..", "cli.ts");
const MEMORY = join(".claude", "agent-memory", "coder", "MEMORY.md");
let tmp = "";
let repo = "";
let remote = "";
let other = "";
let state = "";

function git(dir: string, ...args: string[]): string {
	const p = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" });
	if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr.toString()}`);
	return p.stdout.toString().trim();
}

function gitOk(dir: string, ...args: string[]): boolean {
	return Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" }).exitCode === 0;
}

/** The CLI as the lead or a human runs it: no root override, the board found from cwd. */
function board(cwd: string, ...args: string[]) {
	const env = { ...process.env };
	delete env.CODER_FLEET_BOARD_ROOT;
	const p = Bun.spawnSync(["bun", CLI, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
	return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

function task(id: string, title: string, status = "To Do"): string {
	return `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\nassignee: []\ncreated_date: '2026-11-08 00:00'\nlabels: []\ndependencies: []\n---\n\n## Description\n\n${title}\n`;
}

const originMain = () => git(remote, "rev-parse", "refs/heads/main");
const subject = (ref: string) => git(remote, "log", "-1", "--format=%s", ref);

/** Pushes a commit to the remote's main from the second clone. */
function pushFromOther(file: string, text: string, message: string): string {
	git(other, "pull", "-q", "--ff-only", "origin", "main");
	mkdirSync(join(other, file, ".."), { recursive: true });
	writeFileSync(join(other, file), text);
	git(other, "add", "-A");
	git(other, "commit", "-q", "-m", message);
	git(other, "push", "-q", "origin", "HEAD:main");
	return git(other, "rev-parse", "HEAD");
}

/** A pre-push hook in the main repository that runs `body` the first `times` pushes. */
function prePush(times: number, body: string): void {
	const hook = join(repo, ".git", "hooks", "pre-push");
	const count = join(tmp, "pushes");
	writeFileSync(
		hook,
		[
			"#!/bin/sh",
			"unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE",
			`n=$(cat "${count}" 2>/dev/null || echo 0)`,
			`echo $((n + 1)) > "${count}"`,
			`[ "$n" -ge ${times} ] && exit 0`,
			body,
			"exit 0",
			"",
		].join("\n"),
	);
	chmodSync(hook, 0o755);
}

/** A push race: the second clone lands a product commit between the flush's fetch and its push. */
function racePush(times: number): void {
	prePush(
		times,
		`cd "${other}" && git pull -q --ff-only origin main </dev/null && echo "race $n" >> product.txt && git add product.txt && git commit -q -m "race $n" && git push -q origin HEAD:main </dev/null`,
	);
}

beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), "flush-"));
	repo = join(tmp, "repo");
	remote = join(tmp, "remote.git");
	other = join(tmp, "other");
	mkdirSync(join(repo, BOARD_DIR, "tasks"), { recursive: true });
	writeFileSync(
		join(repo, BOARD_DIR, "config.yml"),
		'project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]\ndefault_status: "To Do"\nauto_commit: true\n',
	);
	writeFileSync(join(repo, BOARD_DIR, ".gitignore"), ".focus\n");
	writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"), task("BD-1", "One"));
	writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-2 - Two.md"), task("BD-2", "Two"));
	writeFileSync(join(repo, "README.md"), "product\n");
	git(tmp, "init", "-q", "--bare", "-b", "main", remote);
	git(repo, "init", "-q", "-b", "main");
	git(repo, "add", "-A");
	git(repo, "commit", "-q", "-m", "base");
	git(repo, "remote", "add", "origin", remote);
	git(repo, "push", "-q", "-u", "origin", "main");
	git(repo, "remote", "set-head", "origin", "main");
	git(tmp, "clone", "-q", remote, other);
	state = stateWorktreeOf(repo);
	const log = process.env.BOARD_LOG_FILE;
	if (log && existsSync(log)) unlinkSync(log);
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("the flush", () => {
	it("lands every board and memory change since the last flush as one commit, pushes it and re-bases the state branch", () => {
		expect(board(repo, "task", "edit", "BD-1", "-s", "In Progress", "--by", "lead").code).toBe(0);
		expect(board(repo, "task", "create", "Three", "--by", "lead").code).toBe(0);
		mkdirSync(join(state, MEMORY, ".."), { recursive: true });
		writeFileSync(join(state, MEMORY), "- a note\n");
		git(state, "add", "--", MEMORY);
		git(state, "commit", "-q", "-m", "Remember a note");
		git(repo, "tag", "-a", "v1.0.0", "-m", "v1.0.0: the release", "main");
		git(repo, "push", "-q", "origin", "v1.0.0");
		const before = originMain();
		const tagged = git(remote, "rev-parse", "v1.0.0^{commit}");

		const r = board(repo, "flush", "--tag", "v1.0.0", "--by", "lead");

		expect(r.code).toBe(0);
		const flushed = originMain();
		expect(flushed).not.toBe(before);
		expect(git(remote, "rev-list", "--count", `${before}..${flushed}`)).toBe("1");
		expect(git(remote, "rev-parse", `${flushed}^`)).toBe(before);
		expect(git(remote, "rev-list", "--count", "--merges", `${before}..${flushed}`)).toBe("0");
		expect(subject(flushed)).toBe("Board and memory at v1.0.0");
		expect(git(remote, "log", "-1", "--format=%(trailers:key=Board-Writer,valueonly)", flushed)).toBe("lead");
		expect(git(remote, "show", `${flushed}:.boards/tasks/bd-1 - One.md`)).toContain("status: In Progress");
		expect(git(remote, "show", `${flushed}:.boards/tasks/bd-3 - Three.md`)).toContain("title: Three");
		expect(git(remote, "show", `${flushed}:${MEMORY}`)).toBe("- a note");
		// The tag stays on the commit CI proved.
		expect(git(remote, "rev-parse", "v1.0.0^{commit}")).toBe(tagged);
		expect(git(repo, "rev-parse", "v1.0.0^{commit}")).toBe(tagged);
		// The state branch is the flush commit, and the next write builds on it.
		expect(git(repo, "rev-parse", STATE_BRANCH)).toBe(flushed);
		expect(git(state, "status", "--porcelain")).toBe("");
		expect(board(repo, "task", "edit", "BD-2", "-s", "Done", "--by", "lead").code).toBe(0);
		expect(git(repo, "rev-parse", `${STATE_BRANCH}^`)).toBe(flushed);
		expect(r.out).toContain(flushed.slice(0, 7));
	});

	it("makes no commit when there is nothing to flush", () => {
		expect(board(repo, "state").code).toBe(0);
		const before = originMain();
		const stateBefore = git(repo, "rev-parse", STATE_BRANCH);

		const first = board(repo, "flush");
		expect(first.code).toBe(0);
		expect(first.out).toContain("nothing to flush");
		expect(originMain()).toBe(before);
		expect(git(repo, "rev-parse", STATE_BRANCH)).toBe(stateBefore);

		expect(board(repo, "task", "create", "Three").code).toBe(0);
		expect(board(repo, "flush").code).toBe(0);
		const flushed = originMain();
		expect(subject(flushed)).toBe(FLUSH_SUBJECT_UNTAGGED);

		const again = board(repo, "flush");
		expect(again.code).toBe(0);
		expect(again.out).toContain("nothing to flush");
		expect(originMain()).toBe(flushed);
	});

	it("keeps what reached the default branch some other way since the state branch's base", () => {
		expect(board(repo, "task", "edit", "BD-1", "-s", "Blocked").code).toBe(0);
		// A product change, a memory note riding a feature PR, and a card the state branch never touched.
		pushFromOther("product.txt", "shipped\n", "Ship a feature");
		pushFromOther(MEMORY, "- from a PR\n", "Ship memory with a PR");
		pushFromOther(join(BOARD_DIR, "tasks", "bd-2 - Two.md"), task("BD-2", "Two", "Done"), "Move BD-2 to Done - Two");
		const before = originMain();

		expect(board(repo, "flush").code).toBe(0);

		const flushed = originMain();
		expect(git(remote, "rev-parse", `${flushed}^`)).toBe(before);
		expect(git(remote, "show", `${flushed}:product.txt`)).toBe("shipped");
		expect(git(remote, "show", `${flushed}:${MEMORY}`)).toBe("- from a PR");
		expect(git(remote, "show", `${flushed}:.boards/tasks/bd-2 - Two.md`)).toContain("status: Done");
		expect(git(remote, "show", `${flushed}:.boards/tasks/bd-1 - One.md`)).toContain("status: Blocked");
		expect(git(remote, "diff", "--name-only", before, flushed)).toBe(".boards/tasks/bd-1 - One.md");
	});

	it("refuses a tag that does not exist, and makes no commit", () => {
		expect(board(repo, "task", "create", "Three").code).toBe(0);
		const before = originMain();
		const r = board(repo, "flush", "--tag", "v9.9.9");
		expect(r.code).not.toBe(0);
		expect(r.err).toContain("v9.9.9");
		expect(originMain()).toBe(before);
	});

	it("names the tag in the subject whichever commit the tag is on", () => {
		// AGENTS.md's order: the tag on the branch head CI proved, which a merge commit then lands.
		git(repo, "checkout", "-q", "-b", "release");
		writeFileSync(join(repo, "README.md"), "v2\n");
		git(repo, "commit", "-q", "-am", "v2.0.0: release");
		git(repo, "tag", "-a", "v2.0.0", "-m", "v2.0.0", "release");
		git(repo, "checkout", "-q", "main");
		git(repo, "merge", "-q", "--no-ff", "-m", "Merge release", "release");
		git(repo, "push", "-q", "origin", "main", "v2.0.0");
		expect(board(repo, "task", "create", "Three").code).toBe(0);
		expect(board(repo, "flush", "--tag", "v2.0.0").code).toBe(0);
		expect(subject("main")).toBe(flushSubject("v2.0.0"));
		expect(git(remote, "rev-parse", "v2.0.0^{commit}")).toBe(git(repo, "rev-parse", "release"));

		// The lead's default: the tag on the merge commit itself.
		git(repo, "pull", "-q", "--ff-only", "origin", "main");
		const merge = git(repo, "rev-parse", "main^");
		git(repo, "tag", "-a", "v2.1.0", "-m", "v2.1.0", merge);
		git(repo, "push", "-q", "origin", "v2.1.0");
		expect(board(repo, "task", "create", "Four").code).toBe(0);
		expect(board(repo, "flush", "--tag", "v2.1.0").code).toBe(0);
		expect(subject("main")).toBe("Board and memory at v2.1.0");
		expect(git(remote, "rev-parse", "v2.1.0^{commit}")).toBe(merge);
	});
});

describe("a push race", () => {
	it("re-fetches and builds on the new tip rather than overwriting it", () => {
		expect(board(repo, "task", "create", "Three").code).toBe(0);
		racePush(1);

		const r = board(repo, "flush");

		expect(r.code).toBe(0);
		const flushed = originMain();
		const raced = git(other, "rev-parse", "HEAD");
		expect(git(remote, "rev-parse", `${flushed}^`)).toBe(raced);
		expect(gitOk(remote, "merge-base", "--is-ancestor", raced, flushed)).toBe(true);
		expect(git(remote, "show", `${flushed}:product.txt`)).toBe("race 0");
		expect(git(remote, "show", `${flushed}:.boards/tasks/bd-3 - Three.md`)).toContain("title: Three");
		expect(git(repo, "rev-parse", STATE_BRANCH)).toBe(flushed);
	});

	it("gives up after its attempts, leaving the remote's commits and the state branch as they were", () => {
		expect(board(repo, "task", "create", "Three").code).toBe(0);
		const stateBefore = git(repo, "rev-parse", STATE_BRANCH);
		racePush(100);

		const r = board(repo, "flush");

		expect(r.code).not.toBe(0);
		expect(r.err).toContain("moved");
		expect(subject(originMain())).toMatch(/^race /);
		expect(git(remote, "log", "--format=%s", "main")).not.toContain("Board and memory");
		expect(git(repo, "rev-parse", STATE_BRANCH)).toBe(stateBefore);
	});
});

describe("a board write during a flush", () => {
	it("waits for the flush and commits on top of it, losing nothing", () => {
		expect(board(repo, "task", "create", "Three").code).toBe(0);
		const out = join(tmp, "write.log");
		// During the push, with the flush's lock held, another process writes the
		// board and gets up to three seconds to commit before the push goes on.
		prePush(
			1,
			[
				`(cd "${repo}" && bun "${CLI}" task edit BD-2 --comment "made during the flush" --comment-author t) < /dev/null > "${out}" 2>&1 &`,
				"i=0",
				`while [ $i -lt 30 ]; do git -C "${state}" log -1 --format=%s | grep -q "comment to BD-2" && break; sleep 0.1; i=$((i + 1)); done`,
			].join("\n"),
		);

		const r = board(repo, "flush");
		expect(r.err).toBe("");
		expect(r.code).toBe(0);

		const flushed = originMain();
		expect(git(repo, "rev-parse", STATE_BRANCH)).not.toBe("");
		const deadline = Date.now() + 30_000;
		while (Date.now() < deadline && git(repo, "rev-parse", STATE_BRANCH) === flushed) Bun.sleepSync(100);
		expect(git(repo, "rev-parse", `${STATE_BRANCH}^`)).toBe(flushed);
		expect(git(repo, "log", "-1", "--format=%s", STATE_BRANCH)).toContain("comment to BD-2");
		expect(readFileSync(join(state, BOARD_DIR, "tasks", "bd-2 - Two.md"), "utf8")).toContain("made during the flush");
		expect(git(state, "status", "--porcelain")).toBe("");
		// The next flush carries it.
		expect(board(repo, "flush").code).toBe(0);
		expect(git(remote, "show", "main:.boards/tasks/bd-2 - Two.md")).toContain("made during the flush");
	});
});

describe("the main checkout after a flush", () => {
	it("clears leftovers the flush matched, reports the rest, and can pull the default branch", () => {
		// Left uncommitted when the board moved: an edit and a new card, both taken across.
		writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"), task("BD-1", "One", "Blocked"));
		writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-4 - Four.md"), task("BD-4", "Four"));
		expect(board(repo, "state").code).toBe(0);
		// Written in the main checkout after the move: on no board anyone reads.
		const stale = task("BD-2", "Two", "Done");
		writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-2 - Two.md"), stale);

		const r = board(repo, "flush");

		expect(r.code).toBe(0);
		const status = git(repo, "status", "--porcelain", "-z", "--untracked-files=all", "--", BOARD_DIR);
		expect(status.split("\0").filter(Boolean)).toEqual(["M .boards/tasks/bd-2 - Two.md"]);
		expect(r.out).toContain("bd-2 - Two.md");
		expect(readFileSync(join(repo, BOARD_DIR, "tasks", "bd-2 - Two.md"), "utf8")).toBe(stale);
		expect(gitOk(repo, "pull", "-q", "--ff-only", "origin", "main")).toBe(true);
		expect(readFileSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"), "utf8")).toContain("status: Blocked");
		expect(readFileSync(join(repo, BOARD_DIR, "tasks", "bd-4 - Four.md"), "utf8")).toContain("title: Four");
		expect(readFileSync(join(repo, BOARD_DIR, "tasks", "bd-2 - Two.md"), "utf8")).toBe(stale);
	});
});

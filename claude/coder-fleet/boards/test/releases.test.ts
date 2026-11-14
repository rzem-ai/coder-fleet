import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { createCard, readCard } from "../src/cards.ts";
import { commentsOf } from "../src/comments.ts";
import { type LoggedEvent, readEvents } from "../src/events.ts";
import { alive } from "../src/lock.ts";
import { moveCard } from "../src/moves.ts";
import { cardsLine } from "../src/releases.ts";
import { World } from "./fixtures.ts";

// Group D, the test gate and releases: CF-207 criteria 30 to 37 (card
// criteria 2 to 9). A throwaway repo pushes to a throwaway bare remote; the
// hooks are driven through their own entry points. Each commit carries its own
// test.sh, and the board's test command runs it, so a run's log shows which
// commit it ran.
const w = new World("releases");
afterAll(() => w.dispose());
mkdirSync(join(w.root, "state"));
const env = { ...w.env, XDG_STATE_HOME: join(w.root, "state") };
const remote = join(w.root, "remote.git");
w.git(w.root, "init", "-q", "--bare", remote);
const repo = w.repo("rl", remote);
const board = createBoard(repo, "RL", env);
const HOOKS = join(import.meta.dir, "..", "src", "hooks");
const columnOf = (id: string) => readCard(board, id).card.column;
let n = 0;

function hook(name: string, input: Record<string, unknown>): string {
	const p = Bun.spawnSync(["bun", join(HOOKS, `${name}.ts`)], {
		cwd: repo,
		env: { ...env, CLAUDE_PROJECT_DIR: repo } as Record<string, string>,
		stdin: new TextEncoder().encode(JSON.stringify(input)),
		stdout: "pipe",
		stderr: "pipe",
	});
	expect({ code: p.exitCode, err: p.stderr.toString() }).toEqual({ code: 0, err: "" });
	const out = p.stdout.toString();
	return out ? String(JSON.parse(out).hookSpecificOutput.additionalContext) : "";
}

// The PostToolUse hook after a successful Bash call running `command`.
const postBash = (command: string) =>
	hook("post-push", { session_id: "s1", cwd: repo, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command }, tool_response: { stdout: "", stderr: "" } });
const sessionStart = (source = "startup") => hook("session-start", { session_id: `start${++n}`, cwd: repo, hook_event_name: "SessionStart", source });

function cardIn(column: string): string {
	const { id } = createCard(board, { title: `${column} ${++n}` }).card;
	moveCard(board, { card: id, to: "Backlog", source: "web" });
	if (column !== "Backlog") moveCard(board, { card: id, to: column, source: "web" });
	return id;
}

// A commit whose test.sh is `script`; returns its sha.
function commitTest(script: string): string {
	writeFileSync(join(repo, "test.sh"), `# ${++n}\necho "testing $(git rev-parse HEAD)"\n${script}\n`);
	w.git(repo, "add", "test.sh");
	w.git(repo, "commit", "-q", "-m", `test ${n}`);
	return w.git(repo, "rev-parse", "HEAD");
}

// An annotated tag on HEAD, pushed from a shell.
function release(tag: string, message: string): void {
	w.git(repo, "tag", "-a", tag, "-m", message);
	w.git(repo, "push", "-q", "origin", tag);
}

const events = (kind: string) => readEvents(board.paths).filter((e) => e.event === kind);
const finished = (tag: string) => events("release-finished").find((e) => e.tag === tag);

async function until<T>(what: string, get: () => T | undefined | null | false, ms = 20_000): Promise<T> {
	const end = Date.now() + ms;
	for (;;) {
		const v = get();
		if (v) return v;
		if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
		await Bun.sleep(50);
	}
}

// The temporary worktree a run used, as its log's header names it.
function worktreeOf(run: string): string {
	return /^Started \S+ in (.+): /m.exec(readFileSync(join(board.paths.testRuns, `${run}.log`), "utf8"))?.[1] ?? "";
}

function setTestCommand(command: string): void {
	const text = readFileSync(board.paths.config, "utf8").replace(/\ntest:.*\n?/, "\n");
	writeFileSync(board.paths.config, `${text.trimEnd()}\ntest: ${JSON.stringify(command)}\n`);
}

describe("a release's Cards line (31)", () => {
	it("reads the ids on one `Cards:` line, and none without one", () => {
		expect(cardsLine("v1.2.0: things\n\nCards: RL-1, rl-2 ,RL-3.1\n")).toEqual(["RL-1", "RL-2", "RL-3.1"]);
		expect(cardsLine("v1.2.0: things\n\nCards RL-1\nThe cards: RL-2\n")).toBeNull();
	});

	it("moves nothing for a pushed tag with no Cards line, lightweight or annotated", () => {
		const id = cardIn("Done");
		commitTest("exit 0");
		setTestCommand("sh ./test.sh");
		w.git(repo, "tag", "plain");
		w.git(repo, "push", "-q", "origin", "plain");
		release("no-cards", `no-cards: names ${id} in prose only`);
		expect(postBash("git push origin no-cards")).toBe("");
		expect(columnOf(id)).toBe("Done");
		expect(events("release-started")).toEqual([]);
	});
});

describe("the test command (30)", () => {
	it("is read from the board's config.yml, and with none set the gate waits for one", () => {
		const id = cardIn("Done");
		commitTest("exit 0");
		const text = readFileSync(board.paths.config, "utf8").replace(/\ntest:.*\n?/, "\n");
		writeFileSync(board.paths.config, text);
		release("v0.1.0", `v0.1.0\n\nCards: ${id}`);
		expect(postBash("git push origin v0.1.0")).toContain("this board has no test command");
		expect(events("release-started")).toEqual([]);
		expect(existsSync(join(repo, "config.yml"))).toBe(false);
		setTestCommand("sh ./test.sh");
	});
});

describe("the test gate (32 to 37)", () => {
	it("starts on an in-session push of the tag, never waits for the suite, and moves the named Done cards to Released when it passes", async () => {
		// The v0.1.0 tag from the test above still waits on its gate; let it pass.
		sessionStart();
		await until("v0.1.0", () => finished("v0.1.0"));
		const done = cardIn("Done");
		const working = cardIn("In Progress");
		const tagged = commitTest("echo halfway; sleep 4; echo finished");
		release("v1.0.0", `v1.0.0: the thing\n\nCards: ${done}, ${working}, RL-999`);
		// The checkout moves past the tag; the run must test the tagged commit.
		commitTest("exit 9");
		const t0 = Date.now();
		const said = postBash("git push origin main v1.0.0");
		const took = Date.now() - t0;
		// The turn returns long before the four-second suite finishes (36).
		expect(took).toBeLessThan(3_000);
		expect(finished("v1.0.0")).toBeUndefined();
		expect(columnOf(done)).toBe("Done");
		expect(said).toContain("the test gate is running");
		expect(said).toContain(`${working}, RL-999 are not in Done, so they stay where they are`);
		const started = events("release-started").find((e) => e.tag === "v1.0.0") as LoggedEvent;
		const run = String(started.run);
		// The log is beside the board and readable through the CLI while the run is in flight (34).
		expect(w.cli(repo, ["runs"]).out).toContain(`${run}\tv1.0.0\t${tagged.slice(0, 12)}\trunning`);
		await until("the run's first line", () => w.cli(repo, ["run-log", run]).out.includes("halfway"));
		expect(existsSync(join(board.paths.testRuns, `${run}.log`))).toBe(true);
		const fin = await until("v1.0.0", () => finished("v1.0.0"));
		expect(columnOf(done)).toBe("Released");
		// A card named but not in Done stays, and the release's result says so (37).
		expect(columnOf(working)).toBe("In Progress");
		expect(fin).toMatchObject({ result: "passed", released: [done], stayed: { [working]: expect.stringContaining("not Done"), "RL-999": expect.stringContaining("not a card") } });
		// Every run is in the trail with its commit and result (33).
		expect(events("test-run").find((e) => e.run === run)).toMatchObject({ commit: tagged, result: "passed", exit: 0 });
		const log = w.cli(repo, ["run-log", run]).out;
		expect(log).toContain(`testing ${tagged}`);
		expect(log).toContain("finished");
		expect(w.cli(repo, ["runs"]).out).toContain(`${run}\tv1.0.0\t${tagged.slice(0, 12)}\tpassed`);
		// The temporary worktree is gone, was never in the repo, and the repo is clean.
		const dir = worktreeOf(run);
		expect(dir).toBe(join(w.root, "state", "coder-fleet-boards", "runs", `RL-${run}`));
		expect(existsSync(dir)).toBe(false);
		expect(w.git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length).toBe(1);
		expect(w.git(repo, "status", "--porcelain")).toBe("");
		// A tag already claimed is not run again.
		expect(postBash("git push origin v1.0.0")).toBe("");
	}, 30_000);

	it("moves the cards to Released at once when a green run is recorded for the tagged commit (33)", () => {
		const id = cardIn("Done");
		const runs = events("test-run").length;
		w.git(repo, "checkout", "-q", "v1.0.0");
		try {
			release("v1.0.0-again", `v1.0.0-again\n\nCards: ${id}`);
		} finally {
			w.git(repo, "checkout", "-q", "main");
		}
		const said = postBash("git push --tags");
		expect(columnOf(id)).toBe("Released");
		expect(said).toContain(`Moved to Released: ${id}`);
		expect(events("test-run").length).toBe(runs);
	});

	it("moves the named Done cards to Blocked with the run's output as a comment when the run fails (35)", async () => {
		const id = cardIn("Done");
		const tagged = commitTest("echo boom-the-suite-broke; exit 3");
		release("v2.0.0", `v2.0.0\n\nCards: ${id}`);
		postBash("cd sub && git -C .. push origin v2.0.0");
		const fin = await until("v2.0.0", () => finished("v2.0.0"));
		expect(fin).toMatchObject({ result: "failed", blocked: [id] });
		expect(columnOf(id)).toBe("Blocked");
		expect(events("test-run").at(-1)).toMatchObject({ commit: tagged, result: "failed", exit: 3 });
		const comment = commentsOf(readCard(board, id).card).at(-1);
		expect(comment?.text).toContain("v2.0.0 failed its test run");
		expect(comment?.text).toContain("boom-the-suite-broke");
	}, 30_000);

	it("returns a Blocked card to Done and on to Released when a later release naming it passes (27)", async () => {
		const id = (events("release-finished").find((e) => e.tag === "v2.0.0")?.blocked as string[])[0] as string;
		commitTest("exit 0");
		release("v2.0.1", `v2.0.1\n\nCards: ${id}`);
		postBash("git push origin v2.0.1");
		const fin = await until("v2.0.1", () => finished("v2.0.1"));
		expect(fin).toMatchObject({ result: "passed", returned: [id], released: [id] });
		expect(readCard(board, id).card.column).toBe("Released");
	}, 30_000);

	it("catches a tag pushed from a shell outside any session at the next session start (32)", async () => {
		const id = cardIn("Done");
		commitTest("exit 0");
		release("v3.0.0", `v3.0.0\n\nCards: ${id}`);
		expect(columnOf(id)).toBe("Done");
		expect(sessionStart("compact")).not.toContain("v3.0.0");
		expect(sessionStart()).toContain("Release v3.0.0: the test gate is running");
		await until("v3.0.0", () => finished("v3.0.0"));
		expect(columnOf(id)).toBe("Released");
	}, 30_000);

	it("reads only ids that match the board's id pattern from a Cards line", async () => {
		const id = cardIn("Done");
		commitTest("exit 0");
		release("v3.1.0", `v3.1.0\n\nCards: ${id}, $(touch pwned), <b>x</b>, ${id} ; rm -rf, OTHER-1`);
		const said = postBash("git push origin v3.1.0");
		expect(events("release-started").find((e) => e.tag === "v3.1.0")?.cards).toEqual([id]);
		for (const junk of ["pwned", "<b>", "RM -RF", "OTHER-1"]) expect(said.toUpperCase()).not.toContain(junk.toUpperCase());
		const fin = await until("v3.1.0", () => finished("v3.1.0"));
		expect(JSON.stringify(fin).toUpperCase()).not.toContain("PWNED");
		expect(columnOf(id)).toBe("Released");
	}, 30_000);

	it("starts no gate at session start for a tag whose commit is not on the local base branch, and says so", () => {
		const id = cardIn("Done");
		w.git(repo, "checkout", "-q", "-b", "side");
		let side = "";
		try {
			side = commitTest("exit 0");
			release("v3.2.0", `v3.2.0\n\nCards: ${id}`);
		} finally {
			w.git(repo, "checkout", "-q", "main");
		}
		const said = sessionStart();
		expect(said).toContain(`Release v3.2.0 names ${id}, but its commit ${side.slice(0, 12)} is not on the local main branch, so its test gate has not started`);
		expect(events("release-started").some((e) => e.tag === "v3.2.0")).toBe(false);
		expect(columnOf(id)).toBe("Done");
		w.git(repo, "push", "-q", "origin", ":refs/tags/v3.2.0");
		w.git(repo, "tag", "-d", "v3.2.0");
	});

	it("leaves a tag that never reached origin alone", () => {
		const id = cardIn("Done");
		commitTest("exit 0");
		w.git(repo, "tag", "-a", "v3.5.0", "-m", `v3.5.0\n\nCards: ${id}`);
		expect(postBash("git push origin main")).toBe("");
		expect(events("release-started").some((e) => e.tag === "v3.5.0")).toBe(false);
		w.git(repo, "tag", "-d", "v3.5.0");
	});

	it("starts a run whose process vanished without a result again at the next session start (34)", async () => {
		const id = cardIn("Done");
		const marker = join(w.root, "let-it-pass");
		commitTest(`if [ -f '${marker}' ]; then exit 0; fi; sleep 60`);
		release("v4.0.0", `v4.0.0\n\nCards: ${id}`);
		postBash("git push origin v4.0.0");
		const run = String(events("release-started").find((e) => e.tag === "v4.0.0")?.run);
		const pid = Number(events("test-run-started").find((e) => e.run === run)?.pid);
		await until("the run's first line", () => w.cli(repo, ["run-log", run]).out.includes("testing"));
		process.kill(-pid, "SIGKILL");
		await until("the run to be gone", () => !alive(pid));
		expect(w.cli(repo, ["runs"]).out).toContain(`${run}\tv4.0.0`);
		expect(w.cli(repo, ["runs"]).out).toMatch(new RegExp(`${run}\\t.*\\tstopped\\t`));
		writeFileSync(marker, "");
		expect(sessionStart("resume")).toContain("Release v4.0.0's test run had stopped without a result, so it was started again");
		const fin = await until("v4.0.0", () => finished("v4.0.0"));
		expect(fin).toMatchObject({ result: "passed", released: [id] });
		expect(events("test-run-started").filter((e) => e.run === run).at(-1)).toMatchObject({ restart: true });
		expect(w.cli(repo, ["run-log", run]).out).toContain("so it starts again");
		expect(existsSync(worktreeOf(run))).toBe(false);
	}, 30_000);
});

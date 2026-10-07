import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOARD_DIR } from "../board-root.ts";
import { Core } from "../core/backlog.ts";
import { boardLogPath, resetCommitsOffNote } from "../git/board-log.ts";
import { resetCommitContext, setCommitContext } from "../git/commit-context.ts";
import { createMcpServer } from "../mcp/server.ts";

// CF-21. A board write whose commit fails or is skipped leaves a line in the
// hooks log, the file the human already reads for board trouble, from the CLI
// the hooks call and from the MCP server alike. A deliberate skip says
// "commit skipped"; a git failure says "commit failed". A commit that lands, or
// a write that changed nothing, says neither.

let tmp = "";
let repo = "";
let log = "";
const saved: Record<string, string | undefined> = {};
const ENV = ["BOARD_LOG_FILE", "CODER_FLEET_STATE_DIR", "XDG_STATE_HOME", "CODER_FLEET_BOARD_NO_COMMIT"];

function git(...args: string[]) {
	const p = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
	if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr.toString()}`);
	return p.stdout.toString().trim();
}

function config(extra = "auto_commit: true\n") {
	writeFileSync(
		join(repo, BOARD_DIR, "config.yml"),
		`project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "Doing", "Blocked", "Blocked by human", "Done"]\ndefault_status: "To Do"\n${extra}`,
	);
}

function logText(): string {
	return existsSync(log) ? readFileSync(log, "utf8") : "";
}

beforeEach(() => {
	for (const k of ENV) saved[k] = process.env[k];
	tmp = mkdtempSync(join(tmpdir(), "board-commit-log-"));
	repo = join(tmp, "repo");
	log = join(tmp, "state", "log", "hooks.log");
	mkdirSync(join(repo, BOARD_DIR, "tasks"), { recursive: true });
	git("init", "-q", "-b", "main");
	git("config", "user.email", "t@t");
	git("config", "user.name", "t");
	config();
	git("add", "-A");
	git("commit", "-q", "-m", "base");
	process.env.BOARD_LOG_FILE = log;
	delete process.env.CODER_FLEET_BOARD_NO_COMMIT;
	resetCommitContext();
	resetCommitsOffNote();
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
	for (const k of ENV) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
	resetCommitContext();
	resetCommitsOffNote();
});

describe("boardLogPath", () => {
	it("is BOARD_LOG_FILE when set", () => {
		process.env.BOARD_LOG_FILE = "/x/y.log";
		expect(boardLogPath()).toBe("/x/y.log");
	});

	it("is the hook library's default otherwise: CODER_FLEET_STATE_DIR, then XDG_STATE_HOME", () => {
		delete process.env.BOARD_LOG_FILE;
		process.env.CODER_FLEET_STATE_DIR = "/s/cf";
		expect(boardLogPath()).toBe("/s/cf/log/hooks.log");
		delete process.env.CODER_FLEET_STATE_DIR;
		process.env.XDG_STATE_HOME = "/xdg";
		expect(boardLogPath()).toBe("/xdg/coder-fleet/log/hooks.log");
	});

	// Refuter survivor 2: with both set, the state directory wins, as in the
	// hook library. Compared against the library itself, sourced by bash.
	it("is the file the hook library resolves when CODER_FLEET_STATE_DIR and XDG_STATE_HOME are both set", () => {
		const env: Record<string, string | undefined> = {
			...process.env,
			HOME: tmp,
			CODER_FLEET_CONFIG_DIR: join(tmp, "no-config"),
			CODER_FLEET_STATE_DIR: join(tmp, "cf-state"),
			XDG_STATE_HOME: join(tmp, "xdg"),
		};
		delete env.BOARD_LOG_FILE;
		const lib = join(import.meta.dir, "..", "..", "..", "hooks", "lib", "board.sh");
		const p = Bun.spawnSync(["bash", "-c", '. "$1"; printf "%s" "$BOARD_LOG_FILE"', "x", lib], {
			env,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(p.exitCode).toBe(0);
		const fromLibrary = p.stdout.toString();
		expect(fromLibrary).toBe(join(tmp, "cf-state", "log", "hooks.log"));
		delete process.env.BOARD_LOG_FILE;
		process.env.CODER_FLEET_STATE_DIR = env.CODER_FLEET_STATE_DIR;
		process.env.XDG_STATE_HOME = env.XDG_STATE_HOME;
		expect(boardLogPath()).toBe(fromLibrary);
	});
});

describe("a failed board commit is logged", () => {
	it("logs a stale index lock as a failure, naming the write, the writer and the lock", async () => {
		const lock = join(repo, ".git", "index.lock");
		writeFileSync(lock, "");
		setCommitContext({ by: "SubagentStart" });
		const errors = spyOn(console, "error").mockImplementation(() => {});
		try {
			const { task } = await new Core(repo).createTaskFromInput({ title: "First" });
			const text = logText();
			expect(text).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ \[board\] commit failed/m);
			expect(text).toContain(`Create ${task.id}`);
			expect(text).toContain("SubagentStart");
			expect(text).toContain(lock);
			expect(text).not.toContain("commit skipped");
		} finally {
			errors.mockRestore();
		}
	});

	it("logs a git commit refusal as a failure", async () => {
		writeFileSync(join(repo, "conflict.txt"), "main\n");
		git("add", "conflict.txt");
		git("commit", "-q", "-m", "c");
		git("checkout", "-q", "-b", "other");
		writeFileSync(join(repo, "conflict.txt"), "other\n");
		git("commit", "-q", "-a", "-m", "other");
		git("checkout", "-q", "main");
		writeFileSync(join(repo, "conflict.txt"), "main change\n");
		git("commit", "-q", "-a", "-m", "main change");
		Bun.spawnSync(["git", "-C", repo, "merge", "other"], { stdout: "pipe", stderr: "pipe" });
		const errors = spyOn(console, "error").mockImplementation(() => {});
		try {
			await new Core(repo).createTaskFromInput({ title: "Mid merge" });
			expect(logText()).toMatch(/\[board\] commit failed/);
		} finally {
			errors.mockRestore();
		}
	});

	// Refuter survivor 1: an add that fails for a reason other than the lock.
	it("logs a git add failure that is not the lock, naming git add", async () => {
		const unreadable = join(repo, BOARD_DIR, "tasks", "unreadable.md");
		writeFileSync(unreadable, "x\n");
		chmodSync(unreadable, 0o000);
		const errors = spyOn(console, "error").mockImplementation(() => {});
		try {
			const { task } = await new Core(repo).createTaskFromInput({ title: "Beside it" });
			const text = logText();
			expect(text).toMatch(/\[board\] commit failed for "Create [^"]+": git add: /);
			expect(text).toContain(`Create ${task.id}`);
			expect(text).not.toContain("index stayed locked");
		} finally {
			errors.mockRestore();
			chmodSync(unreadable, 0o644);
		}
	});

	it("logs a failure from the MCP server, naming it as the writer", async () => {
		const lock = join(repo, ".git", "index.lock");
		writeFileSync(lock, "");
		const errors = spyOn(console, "error").mockImplementation(() => {});
		const server = await createMcpServer(repo);
		try {
			const result = await server.testInterface.callTool({
				params: { name: "task_create", arguments: { title: "From MCP", acceptanceCriteria: ["It works"] } },
			});
			expect(result.isError).toBeFalsy();
			expect(logText()).toMatch(/\[board\] commit failed \(writer mcp\)/);
		} finally {
			await server.stop();
			errors.mockRestore();
		}
	});
});

describe("a deliberate skip is logged as one", () => {
	it("names CODER_FLEET_BOARD_NO_COMMIT", async () => {
		process.env.CODER_FLEET_BOARD_NO_COMMIT = "1";
		const { task } = await new Core(repo).createTaskFromInput({ title: "First" });
		const text = logText();
		expect(text).toMatch(/\[board\] commit skipped/);
		expect(text).toContain("CODER_FLEET_BOARD_NO_COMMIT=1");
		expect(text).toContain(`Create ${task.id}`);
		expect(text).not.toContain("commit failed");
	});

	it("names an ignored .boards", async () => {
		writeFileSync(join(repo, ".gitignore"), `${BOARD_DIR}/\n`);
		git("add", ".gitignore");
		git("commit", "-q", "-m", "ignore");
		git("rm", "-r", "-q", "--cached", BOARD_DIR);
		git("commit", "-q", "-m", "untrack");
		await new Core(repo).createTaskFromInput({ title: "First" });
		expect(logText()).toMatch(/\[board\] commit skipped.*gitignored/);
	});
});

// Reviewer follow-up 3. A board with commits off says so once per process,
// after a write that landed, naming that write's item, on the MCP path too.
describe("auto_commit off is said once, after a write that landed", () => {
	beforeEach(() => {
		config("");
		git("commit", "-q", "-a", "-m", "config");
	});

	it("logs one line, not two, for two writes in one process, naming the first item", async () => {
		const core = new Core(repo);
		const { task: first } = await core.createTaskFromInput({ title: "First" });
		await core.createTaskFromInput({ title: "Second" });
		const lines = logText()
			.split("\n")
			.filter((l) => l.includes("commit skipped"));
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("auto_commit");
		expect(lines[0]).toContain(`for "Create ${first.id}"`);
		expect(logText()).not.toContain("commit failed");
	});

	it("logs nothing when the write itself fails", async () => {
		const core = new Core(repo);
		await expect(core.createTaskFromInput({ title: "Orphan", parentTaskId: "BD-99" })).rejects.toThrow();
		expect(logText()).toBe("");
	});

	it("names the item on the MCP path", async () => {
		const server = await createMcpServer(repo);
		try {
			const result = await server.testInterface.callTool({
				params: { name: "task_create", arguments: { title: "From MCP", acceptanceCriteria: ["It works"] } },
			});
			expect(result.isError).toBeFalsy();
			const text = logText();
			expect(text).toMatch(/\[board\] commit skipped \(writer mcp\) for "Create BD-\d+": auto_commit/);
			expect(text).not.toContain("a board write");
		} finally {
			await server.stop();
		}
	});
});

describe("nothing is logged when nothing went wrong", () => {
	it("logs nothing for a commit that lands", async () => {
		await new Core(repo).createTaskFromInput({ title: "First" });
		expect(git("status", "--porcelain")).toBe("");
		expect(logText()).toBe("");
	});

	it("logs nothing for a write that changed nothing", async () => {
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		const loaded = await core.getTask(task.id);
		if (!loaded) throw new Error("task missing");
		await core.updateTasksBulk([loaded], undefined, true);
		expect(logText()).toBe("");
	});
});

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOARD_DIR } from "../board-root.ts";
import { Core } from "../core/backlog.ts";
import { boardLogPath } from "../git/board-log.ts";
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
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
	for (const k of ENV) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
	resetCommitContext();
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

	it("names auto_commit being off", async () => {
		config("");
		git("commit", "-q", "-a", "-m", "config");
		await new Core(repo).createTaskFromInput({ title: "First" });
		const text = logText();
		expect(text).toMatch(/\[board\] commit skipped.*auto_commit/);
		expect(text).not.toContain("commit failed");
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

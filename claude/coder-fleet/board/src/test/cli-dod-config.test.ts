import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_DIRECTORIES } from "../constants/index.ts";

// CF-24.2: the two CLI surfaces the Definition of Done backfill script reads and
// writes through - `config show --json` for the defaults, parsed by the fork
// rather than by a shell, and `task edit --dod` to add items to a card.

const CLI = join(import.meta.dir, "..", "cli.ts");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeBoard(extraConfig: string[] = []): string {
	const root = mkdtempSync(join(tmpdir(), "board-dod-cli-"));
	roots.push(root);
	mkdirSync(join(root, DEFAULT_DIRECTORIES.BACKLOG));
	writeFileSync(
		join(root, DEFAULT_DIRECTORIES.BACKLOG, "config.yml"),
		[
			'project_name: "test"',
			'task_prefix: "BD"',
			'statuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]',
			'default_status: "To Do"',
			"auto_commit: false",
			...extraConfig,
			"",
		].join("\n"),
	);
	return root;
}

function board(root: string, ...args: string[]) {
	const proc = Bun.spawnSync(["bun", CLI, ...args], {
		env: { ...process.env, CODER_FLEET_BOARD_ROOT: root },
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

describe("board config show", () => {
	it("prints the statuses and the Definition of Done defaults as JSON", () => {
		const root = makeBoard(["definition_of_done:", '  - "Checks pass"', '  - "A reviewer approved"']);
		const r = board(root, "config", "show", "--json");
		expect(r.code).toBe(0);
		expect(JSON.parse(r.out)).toEqual({
			schemaVersion: 1,
			kind: "config",
			config: {
				statuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"],
				definitionOfDone: ["Checks pass", "A reviewer approved"],
			},
		});
	});

	it("reports an absent definition_of_done as an empty list", () => {
		const r = board(makeBoard(), "config", "show", "--json");
		expect(r.code).toBe(0);
		expect(JSON.parse(r.out).config.definitionOfDone).toEqual([]);
	});
});

describe("board task edit --dod", () => {
	it("appends each repeated --dod as an unticked Definition of Done item, after any already there", () => {
		const root = makeBoard(['definition_of_done: ["Checks pass"]']);
		expect(board(root, "task", "create", "An item").code).toBe(0);
		const r = board(root, "task", "edit", "BD-1", "--dod", "Docs updated", "--dod", "Spec linked", "--json");
		expect(r.code).toBe(0);
		expect(JSON.parse(r.out).task.definitionOfDone).toEqual([
			{ index: 1, text: "Checks pass", checked: false },
			{ index: 2, text: "Docs updated", checked: false },
			{ index: 3, text: "Spec linked", checked: false },
		]);
	});
});

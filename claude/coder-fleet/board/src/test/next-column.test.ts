import { afterEach, describe, expect, it } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_DIRECTORIES } from "../constants/index.ts";
import { BacklogServer } from "../server/index.ts";
import { isTerminalStatus } from "../utils/terminal-status.ts";

// CF-140. Next is the human's ordered queue, between To Do and In Progress.
// The web board draws one column per entry in /api/statuses, in that order, so
// serving each shipped config is what the board shows. Done stays last, because
// the last status is the terminal one.
const SIX = ["To Do", "Next", "In Progress", "Blocked", "Blocked by human", "Done"];
const BOARD_DIR = resolve(import.meta.dir, "../..");
const CONFIGS = {
	"the plugin's template": join(BOARD_DIR, "../templates/board.config.yml"),
	"this repository's own board": join(BOARD_DIR, "../../../.boards/config.yml"),
};

let root = "";
let server: BacklogServer | undefined;

afterEach(async () => {
	await server?.stop();
	server = undefined;
	if (root) rmSync(root, { recursive: true, force: true });
	root = "";
});

describe("the Next column", () => {
	for (const [name, path] of Object.entries(CONFIGS)) {
		it(`${name} serves Next between To Do and In Progress, with Done last and terminal`, async () => {
			root = mkdtempSync(join(tmpdir(), "board-next-"));
			mkdirSync(join(root, DEFAULT_DIRECTORIES.BACKLOG, "tasks"), { recursive: true });
			copyFileSync(path, join(root, DEFAULT_DIRECTORIES.BACKLOG, "config.yml"));
			server = new BacklogServer(root);
			await server.start(0, false, { quiet: true });
			const statuses = (await (await fetch(`${server.url}/api/statuses`)).json()) as string[];
			expect(statuses).toEqual(SIX);
			expect(isTerminalStatus("Done", statuses)).toBe(true);
			expect(isTerminalStatus("Next", statuses)).toBe(false);
		});
	}
});

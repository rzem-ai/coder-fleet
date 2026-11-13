import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { boardForHook } from "../src/hook-board.ts";
import { World } from "./fixtures.ts";

// Criterion 10: with no board for the session, a hook does nothing and says
// so once per session.
const w = new World("hook-board");
afterAll(() => w.dispose());
const stateDir = join(w.root, "state");

describe("a hook with no board", () => {
	it("outside any git repository, as in a web session, says so once per session", () => {
		const plain = join(w.root, "not-a-repo");
		mkdirSync(plain);
		const first = boardForHook({ cwd: plain, sessionId: "s1", env: w.env, stateDir });
		expect(first.board).toBeNull();
		expect(first.message).toContain("not inside a git repository");
		expect(first.message).toContain("do nothing in this session");
		expect(boardForHook({ cwd: plain, sessionId: "s1", env: w.env, stateDir })).toEqual({ board: null, message: null });
		expect(boardForHook({ cwd: plain, sessionId: "s2", env: w.env, stateDir }).message).not.toBeNull();
	});

	it("in a repo with no board, says so once and points at the human", () => {
		const repo = w.repo("no-board", "git@example.com:o/nb.git");
		const first = boardForHook({ cwd: repo, sessionId: "s3", env: w.env, stateDir });
		expect(first.message).toContain("Ask the human to create one");
		expect(boardForHook({ cwd: repo, sessionId: "s3", env: w.env, stateDir }).message).toBeNull();
		expect(existsSync(w.boardsRoot) ? readdirSync(w.boardsRoot) : []).toEqual([]);
		expect(w.git(repo, "status", "--porcelain", "--ignored", "--untracked-files=all")).toBe("");
	});

	it("keeps its marker under the system temporary directory by default", () => {
		const repo = w.repo("default-state");
		expect(boardForHook({ cwd: repo, sessionId: "s4", env: w.env }).message).not.toBeNull();
		expect(boardForHook({ cwd: repo, sessionId: "s4", env: w.env }).message).toBeNull();
		expect(readdirSync(join(w.env.TMPDIR ?? "")).some((d) => d.startsWith("coder-fleet-boards-"))).toBe(true);
	});
});

describe("a hook with a board", () => {
	it("gets the board and no message", () => {
		const repo = w.repo("with-board", "git@example.com:o/wb.git");
		createBoard(repo, "WB", w.env);
		const r = boardForHook({ cwd: repo, sessionId: "s5", env: w.env, stateDir });
		expect(r.message).toBeNull();
		expect(r.board?.config.prefix).toBe("WB");
	});
});

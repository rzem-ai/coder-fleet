import { afterAll, describe, expect, it } from "bun:test";
import { World } from "./fixtures.ts";

// Criterion 2: after every operation the board offers, git status in the repo
// and in each of its worktrees shows nothing the board wrote, ignored files
// included. The CLI is the only interface so far; the MCP tools and the web UI
// join this test when they exist.
const w = new World("git-clean");
afterAll(() => w.dispose());

function status(dir: string): string {
	return w.git(dir, "status", "--porcelain", "--ignored", "--untracked-files=all");
}

describe("git status after board operations", () => {
	it("shows nothing in the main checkout or a worktree", () => {
		const repo = w.repo("clean", "git@example.com:o/clean.git");
		const wt = w.worktree(repo, "clean-wt");
		const steps: Array<[string, string[], string?]> = [
			[repo, ["init"], "CL\n"],
			[repo, ["where"]],
			[repo, ["new", "first"]],
			[wt, ["new", "second"]],
			[wt, ["new", "sub", "--parent", "CL-1"]],
			[repo, ["list"]],
			[wt, ["delete", "CL-2"]],
			[wt, ["where"]],
		];
		for (const [cwd, args, stdin] of steps) {
			const r = w.cli(cwd, args, stdin);
			expect({ args, code: r.code, err: r.err }).toEqual({ args, code: 0, err: "" });
			expect(status(repo)).toBe("");
			expect(status(wt)).toBe("");
		}
	});
});

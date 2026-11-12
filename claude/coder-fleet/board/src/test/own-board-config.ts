import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// This repository's own .boards/config.yml, wherever this checkout keeps it.
// The coder-fleet repo commits it until fleet-exclude.py keeps the fleet's files
// out of its history (CF-201.2); after that the main checkout has it on disk, a
// linked worktree reads it from coder-fleet/state, and a CI clone has none.
// claude/scripts/fleet-layout.py decides, so these tests and the shell contracts
// read the same arm. Its contract, fleet-layout-contract.sh, proves each arm.

const LAYOUT_SCRIPT = resolve(import.meta.dir, "../../../../scripts/fleet-layout.py");
const REPO_ROOT = resolve(import.meta.dir, "../../../../..");

export type OwnBoardConfig = {
	layout: "tracked" | "excluded";
	arm: "worktree" | "state-branch" | "absent";
	/** A readable copy of the config, or "-" when the arm is absent. */
	file: string;
	/** What a test name says about where the config came from. */
	label: string;
};

export function ownBoardConfig(): OwnBoardConfig {
	const out = join(mkdtempSync(join(tmpdir(), "own-board-config-")), "config.yml");
	const run = spawnSync("python3", ["-I", LAYOUT_SCRIPT, "--repo", REPO_ROOT, "--out", out, ".boards/config.yml"], {
		encoding: "utf8",
	});
	if (run.status !== 0 && run.status !== 1) {
		throw new Error(`fleet-layout.py failed (${run.status}): ${run.stderr || run.stdout}`);
	}
	const [layout, arm, ...rest] = run.stdout.trim().split(" ");
	const file = rest.join(" ");
	const label =
		arm === "worktree"
			? `this repository's .boards/config.yml (${layout} layout)`
			: `this repository's .boards/config.yml (${layout} layout, ${arm})`;
	return { layout, arm, file, label } as OwnBoardConfig;
}

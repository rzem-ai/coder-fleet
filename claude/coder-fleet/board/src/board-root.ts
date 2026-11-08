import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ensureStateWorktree } from "./state-worktree.ts";

/** Overrides discovery when set: the directory that contains `.boards/`. */
export const BOARD_ROOT_ENV = "CODER_FLEET_BOARD_ROOT";
/** The directory under the root that holds tasks, config and the rest. */
export const BOARD_DIR = ".boards";

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/**
 * The main checkout of the repository containing `cwd`, or null outside a
 * repository. A linked worktree's git dir is `<main>/.git/worktrees/<name>`,
 * and `--git-common-dir` answers `<main>/.git` from either, so the parent of
 * that is the main checkout in both cases. `--path-format=relative` keeps the
 * answer expressed against `cwd` rather than a realpath-resolved absolute
 * path, so a caller reached through a symlinked temp directory (macOS puts
 * `/tmp` and `/var/folders` behind one) still gets back the path it started
 * from instead of git's canonicalised equivalent. A worktree carries a copy
 * of `.boards/` because it is committed, and nothing may write to that copy;
 * the live board is the state worktree's, found from here.
 */
export function mainCheckoutOf(cwd: string): string | null {
	const proc = Bun.spawnSync(["git", "-C", cwd, "rev-parse", "--path-format=relative", "--git-common-dir"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (proc.exitCode !== 0) return null;
	const common = proc.stdout.toString().trim();
	if (common.length === 0) return null;
	const absolute = resolve(cwd, common);
	return dirname(absolute);
}

/**
 * Where the board is. The environment variable wins when set; otherwise the
 * state worktree of the repository containing cwd (see
 * `src/state-worktree.ts`), made from the main checkout's `.boards/` on first
 * use. The main checkout is the answer only while the move cannot be made: a
 * repository with no commit yet, or a move that failed and recorded why.
 * There is no fallback board: a repository with neither says "no board here".
 */
export function resolveBoardRoot(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string {
	const fromEnv = env[BOARD_ROOT_ENV]?.trim();
	if (fromEnv && fromEnv.length > 0) {
		const root = resolve(fromEnv);
		if (!isDirectory(root)) {
			throw new Error(
				`board root is not a directory: ${root} (${BOARD_ROOT_ENV} names the directory that contains ${BOARD_DIR}/)`,
			);
		}
		return root;
	}
	const main = mainCheckoutOf(cwd);
	if (main === null) {
		throw new Error(`no board here: ${cwd} is not inside a git repository, and there is no ${BOARD_DIR}/ without one`);
	}
	return ensureStateWorktree(main).root;
}

// The git layer, carried in part from upstream Backlog.md.
//
// Only what a board that commits its own writes needs: add and commit,
// pathspec-limited to the board directory, an index-lock retry, and the
// repository root. Cross-branch task loading, remote fetches and everything
// else upstream's layer did stay out; the methods Core still calls for those
// return empty rather than throwing, so filesystem-only reads are unchanged.
import { isAbsolute, join } from "node:path";
import { BOARD_DIR } from "../board-root.ts";
import { FOCUS_FILE } from "../core/focus.ts";
import type { BacklogConfig } from "../types/index.ts";
import { logBoardCommit } from "./board-log.ts";
import { clearCommitNote, getCommitContext } from "./commit-context.ts";

/** The focus file is never part of a board commit; see `src/core/focus.ts`. */
const FOCUS_PATH = `${BOARD_DIR}/${FOCUS_FILE}`;
const EXCLUDE_FOCUS = `:(exclude)${FOCUS_PATH}`;

export interface GitBranchTip {
	name: string;
	commit: string;
	current: boolean;
}

export interface GitIndexEntry {
	mode: string;
	objectId: string;
	stage: number;
}

export const NO_COMMIT_ENV = "CODER_FLEET_BOARD_NO_COMMIT";
const LOCK_RETRIES = 3;
const LOCK_RETRY_MS = 300;

/** The trailer that names who made a board write; the subject never does. */
export const WRITER_TRAILER = "Board-Writer";

/**
 * A board commit's subject: the imperative action, then "on the board", with
 * no prefix, so it reads like the repository's own commits. `action` already
 * names the item, as in `Update BD-2` or `Move BD-2 to Doing`.
 */
export function formatCommitSubject(action: string): string {
	return `${action} on the board`;
}

/** `git commit` arguments for the subject and, when there is a writer, its trailer paragraph. */
export function commitMessageArgs(action: string, by?: string): string[] {
	const args = ["-m", formatCommitSubject(action)];
	return by ? [...args, "-m", `${WRITER_TRAILER}: ${by}`] : args;
}

function run(cwd: string, args: string[]): { code: number; out: string; err: string } {
	// env passed explicitly: without it Bun spawns with the environment as it
	// was at startup, not as it is now.
	const p = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", env: process.env });
	return { code: p.exitCode, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GitOperations {
	constructor(
		public readonly projectRoot: string,
		_config: BacklogConfig | null = null,
		_configLoader?: () => Promise<BacklogConfig | null>,
	) {}

	setConfig(_config: BacklogConfig | null): void {}

	async getRepositoryRoot(cwd?: string): Promise<string | null> {
		const r = run(cwd ?? this.projectRoot, ["rev-parse", "--show-toplevel"]);
		return r.code === 0 && r.out.length > 0 ? r.out : null;
	}

	/** Worktree copies of the board are never consulted, so there are none to list. */
	async listWorktreePaths(): Promise<string[]> {
		return [];
	}

	async getIndexEntries(_filePath: string): Promise<GitIndexEntry[]> {
		return [];
	}

	async restoreIndexEntriesIfMatches(
		_filePath: string,
		_expectedEntries: readonly GitIndexEntry[],
		_restoreEntries: readonly GitIndexEntry[],
	): Promise<boolean> {
		return true;
	}

	/**
	 * The one commit routine. `git add -- .boards`, then `git reset --
	 * .boards/.focus`, then `git commit -- .boards`, so the human's own staged
	 * work stays out of it. `.boards/.focus` is a per-checkout binding, never a
	 * thing to commit. The add cannot exclude it by pathspec: where init's
	 * `.boards/.gitignore` ignores it, git reads the exclude as naming an
	 * ignored file and the add exits 1. So the add takes all of .boards (which
	 * skips .focus when it is ignored) and the reset pulls .focus back out
	 * where it is not, leaving its index entry at HEAD. diff --cached, commit
	 * and reset accept the exclude on an ignored path, so they keep it.
	 * Skipped, with a "commit skipped" line in the hooks log, when the env var
	 * says so, there is no repository or .boards is ignored; skipped silently
	 * when the add produced no staged change (decided from the index with `git
	 * diff --cached`, never by matching git's prose, which varies with
	 * untracked files present), since there was nothing to commit; retried on
	 * a locked index; false with a "commit failed" line in the hooks log and on
	 * stderr on anything else (see `board-log.ts`). Every branch that leaves the loop after an add, failed or not,
	 * first runs `git reset -- .boards`, so a commit that cannot be made never
	 * leaves .boards sitting in the human's index (a failed add can still have
	 * staged, and git refuses a partial commit mid-merge; neither may survive).
	 * The file write has already happened either way. `action` is the
	 * imperative phrase for the subject; a note in the commit context, set by
	 * the CLI for a status move or a comment, replaces it. The commit note is
	 * always cleared here, win or lose, so a later write in the same process
	 * is never labelled with this one's note; `by` is left alone, since a
	 * long-lived caller such as the MCP server sets it once and every commit it
	 * makes should still carry it.
	 */
	async commitBoard(action: string): Promise<boolean> {
		const ctx = getCommitContext();
		const label = ctx.note ?? action;
		const skipped = (reason: string) => {
			logBoardCommit("skipped", label, ctx.by, reason);
			return false;
		};
		const failed = (reason: string) => {
			console.error(`board: commit failed: ${reason}`);
			logBoardCommit("failed", label, ctx.by, reason);
			return false;
		};
		try {
			if (process.env[NO_COMMIT_ENV] === "1") return skipped(`${NO_COMMIT_ENV}=1 is set`);
			const root = await this.getRepositoryRoot();
			if (!root) return skipped("the board is not in a git repository");
			if (run(this.projectRoot, ["check-ignore", "-q", BOARD_DIR]).code === 0) {
				return skipped(`${BOARD_DIR} is gitignored`);
			}
			const message = commitMessageArgs(label, ctx.by);
			for (let attempt = 0; attempt < LOCK_RETRIES; attempt++) {
				const add = run(this.projectRoot, ["add", "--", BOARD_DIR]);
				if (add.code !== 0 && /index\.lock/.test(add.err)) {
					await sleep(LOCK_RETRY_MS);
					continue;
				}
				if (add.code !== 0) {
					run(this.projectRoot, ["reset", "-q", "--", BOARD_DIR, EXCLUDE_FOCUS]);
					return failed(`git add: ${add.err}`);
				}
				run(this.projectRoot, ["reset", "-q", "--", FOCUS_PATH]);
				// A no-op write (a status set to what it already was, the second
				// commitFiles of a multi-step archive) stages nothing to commit.
				// Decide that from the index, not from git's commit-failure prose.
				const diff = run(this.projectRoot, ["diff", "--cached", "--quiet", "--", BOARD_DIR, EXCLUDE_FOCUS]);
				if (diff.code === 0) return false;
				const commit = run(this.projectRoot, ["commit", "-q", ...message, "--", BOARD_DIR, EXCLUDE_FOCUS]);
				if (commit.code === 0) return true;
				// Returns the .boards index to HEAD, so a human who had deliberately
				// staged a .boards change of their own finds it unstaged again but
				// intact in the working tree, not swallowed by the failed commit.
				run(this.projectRoot, ["reset", "-q", "--", BOARD_DIR, EXCLUDE_FOCUS]);
				if (/index\.lock/.test(commit.err)) {
					await sleep(LOCK_RETRY_MS);
					continue;
				}
				return failed(`git commit: ${commit.err || commit.out}`);
			}
			return failed(
				`the index stayed locked for ${LOCK_RETRIES} attempts; if no git process is running, ${this.indexLockPath()} is stale: remove it, then commit ${BOARD_DIR}`,
			);
		} finally {
			clearCommitNote();
		}
	}

	/** The checkout's index lock, absolute, worktrees included. */
	private indexLockPath(): string {
		const r = run(this.projectRoot, ["rev-parse", "--git-path", "index.lock"]);
		if (r.code !== 0 || !r.out) return ".git/index.lock";
		return isAbsolute(r.out) ? r.out : join(this.projectRoot, r.out);
	}

	async addFile(_filePath: string): Promise<void> {}

	async addFiles(_filePaths: string[]): Promise<void> {}

	async stageFileMove(_fromPath: string, _toPath: string): Promise<string | null> {
		return this.getRepositoryRoot();
	}

	async resetPaths(_filePaths: string[], _repoRoot?: string | null): Promise<void> {}

	async commitFiles(message: string, _filePaths: string[], _repoRoot?: string | null): Promise<void> {
		await this.commitBoard(message.replace(/^backlog:\s*/i, ""));
	}

	/** `message` is already imperative and names the item: `Create draft BD-3`. */
	async commitTaskChange(_taskId: string, message: string, _filePath: string): Promise<void> {
		await this.commitBoard(message);
	}

	async addAndCommitTaskFile(
		taskId: string,
		_filePath: string,
		action: "create" | "update" | "archive",
		_onStaged?: (entries: GitIndexEntry[]) => void,
	): Promise<void> {
		const verb = action === "create" ? "Create" : action === "update" ? "Update" : "Archive";
		await this.commitBoard(`${verb} ${taskId}`);
	}
}

export async function isGitRepository(projectRoot: string): Promise<boolean> {
	return run(projectRoot, ["rev-parse", "--is-inside-work-tree"]).code === 0;
}

export async function initializeGitRepository(_projectRoot: string): Promise<void> {
	throw new Error("the board never initialises a repository; /init does");
}

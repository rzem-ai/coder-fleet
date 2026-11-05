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
import { parseFrontmatter } from "../markdown/frontmatter.ts";
import type { BacklogConfig } from "../types/index.ts";
import { logBoardCommit, logCommitsOffOnce } from "./board-log.ts";
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

/** Past this a subject is cut on GitHub and in most log views. */
export const SUBJECT_LIMIT = 72;

/** A board item a commit carries, read from its staged frontmatter. */
export interface CommittedItem {
	id: string;
	title: string;
}

const ELLIPSIS = "...";
/** Fewer characters of title than this in the subject says nothing; the body carries it instead. */
const MIN_TITLE_ROOM = 12;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `action` names `id` as a whole id: `CF-16` is not named by `CF-164` or `CF-16.1`. */
function names(action: string, id: string): boolean {
	return new RegExp(`(^|[^\\w.])${escapeRegExp(id)}($|[^\\w.])`, "i").test(action);
}

/**
 * A board commit's subject and the item lines for its body. The subject is the
 * imperative action, which names the item (`Move CF-2 to In Progress`), then
 * " - " and the item's title, with no prefix, so it reads like the
 * repository's own commits; the `Board-Writer` trailer is what marks a board
 * write. A title that would take the subject past {@link SUBJECT_LIMIT} is cut
 * with "..." and given whole in the body. A commit carrying several items, or
 * one its action does not name, keeps the action alone as the subject and
 * lists every item as `<id> - <title>` in the body.
 */
export function formatCommitSubject(
	action: string,
	items: readonly CommittedItem[] = [],
): {
	subject: string;
	itemLines: string[];
} {
	const lines = items.map((item) => `${item.id} - ${item.title}`);
	const only = items.length === 1 ? items[0] : undefined;
	if (!only || !names(action, only.id)) return { subject: action, itemLines: lines };
	const whole = `${action} - ${only.title}`;
	if (whole.length <= SUBJECT_LIMIT) return { subject: whole, itemLines: [] };
	const room = SUBJECT_LIMIT - action.length - " - ".length - ELLIPSIS.length;
	if (room < MIN_TITLE_ROOM) return { subject: action, itemLines: lines };
	let cut = only.title.slice(0, room);
	// A cut between the halves of a surrogate pair leaves half a character.
	if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
	return { subject: `${action} - ${cut.trimEnd()}${ELLIPSIS}`, itemLines: lines };
}

/**
 * `git commit` arguments: the subject, then the item lines, then `body` (the
 * reason behind a write, such as a move to Blocked), then, when there is a
 * writer, the trailer paragraph, which git reads only as the last paragraph.
 */
export function commitMessageArgs(
	action: string,
	by?: string,
	items: readonly CommittedItem[] = [],
	body?: string,
): string[] {
	const { subject, itemLines } = formatCommitSubject(action, items);
	const args = ["-m", subject];
	if (itemLines.length > 0) args.push("-m", itemLines.join("\n"));
	if (body?.trim()) args.push("-m", body.trim());
	if (by) args.push("-m", `${WRITER_TRAILER}: ${by}`);
	return args;
}

/** The id and title in a board file's frontmatter, or null for a file that has no both. */
export function readCommittedItem(content: string): CommittedItem | null {
	try {
		const data = parseFrontmatter(content).data as { id?: unknown; title?: unknown };
		const id = typeof data.id === "string" || typeof data.id === "number" ? String(data.id).trim() : "";
		const title = typeof data.title === "string" ? data.title.replace(/\s+/g, " ").trim() : "";
		return id && title ? { id, title } : null;
	} catch {
		return null;
	}
}

function run(cwd: string, args: string[]): { code: number; out: string; err: string } {
	// env passed explicitly: without it Bun spawns with the environment as it
	// was at startup, not as it is now.
	const p = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", env: process.env });
	return { code: p.exitCode, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GitOperations {
	/**
	 * Reads the board config at commit time. Core passes its own loader, so
	 * `auto_commit` is decided here, after the write, beside the other reasons
	 * not to commit; a GitOperations made without one commits.
	 */
	private readonly configLoader?: () => Promise<BacklogConfig | null>;

	constructor(
		public readonly projectRoot: string,
		_config: BacklogConfig | null = null,
		configLoader?: () => Promise<BacklogConfig | null>,
	) {
		this.configLoader = configLoader;
	}

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
	 * says so, there is no repository or .boards is ignored; skipped with one
	 * such line per process when the config's auto_commit is not true; skipped
	 * silently when the add produced no staged change (decided from the index
	 * with `git diff --cached`, never by matching git's prose, which varies
	 * with untracked files present), since there was nothing to commit;
	 * retried on a locked index; false with a "commit failed" line in the
	 * hooks log and on stderr on anything else (see `board-log.ts`). Every
	 * branch that leaves the loop after an add, failed or not,
	 * first runs `git reset -- .boards`, so a commit that cannot be made never
	 * leaves .boards sitting in the human's index (a failed add can still have
	 * staged, and git refuses a partial commit mid-merge; neither may survive).
	 * The file write has already happened either way. `action` is the
	 * imperative phrase for the subject; a note in the commit context replaces
	 * it. The titles come from the staged files themselves (see
	 * `stagedItems`), so no caller passes one; `body` is the reason behind the
	 * write, such as a Blocked move's comment, put between them and the
	 * trailer; a reason the caller set (the CLI's `--reason`) wins over it,
	 * since it was given on purpose. The commit note is
	 * always cleared here, win or lose, so a later write in the same process
	 * is never labelled with this one's note; `by` is left alone, since a
	 * long-lived caller such as the MCP server sets it once and every commit it
	 * makes should still carry it.
	 */
	async commitBoard(action: string, body?: string): Promise<boolean> {
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
			if (this.configLoader && (await this.configLoader())?.autoCommit !== true) {
				logCommitsOffOnce(label, ctx.by);
				return false;
			}
			// Decided by the exit code, never the printed path: under load Bun.spawnSync
			// now and then returns exit 0 with stdout lost, and reading that empty
			// answer as "no repository" dropped the commit (CF-163).
			if (run(this.projectRoot, ["rev-parse", "--show-toplevel"]).code !== 0) {
				return skipped("the board is not in a git repository");
			}
			if (run(this.projectRoot, ["check-ignore", "-q", BOARD_DIR]).code === 0) {
				return skipped(`${BOARD_DIR} is gitignored`);
			}
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
				const message = commitMessageArgs(label, ctx.by, this.stagedItems(), ctx.body ?? body);
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

	/**
	 * The items the staged board change carries, each read from its staged
	 * frontmatter, or from HEAD's for a deleted file. A rename is one item,
	 * read at its new path. Files with no id and title (the config, a .gitignore)
	 * carry none. An empty answer, from a git that failed or printed nothing,
	 * only leaves the title out: it never stops the commit.
	 */
	private stagedItems(): CommittedItem[] {
		const diff = run(this.projectRoot, [
			"diff",
			"--cached",
			"--name-status",
			"-M",
			"-z",
			"--",
			BOARD_DIR,
			EXCLUDE_FOCUS,
		]);
		if (diff.code !== 0 || !diff.out) return [];
		const fields = diff.out.split("\0").filter((field) => field.length > 0);
		const items: CommittedItem[] = [];
		const seen = new Set<string>();
		for (let i = 0; i < fields.length; ) {
			const status = fields[i] ?? "";
			const renamed = status.startsWith("R") || status.startsWith("C");
			const path = fields[i + (renamed ? 2 : 1)] ?? "";
			i += renamed ? 3 : 2;
			if (!path.endsWith(".md")) continue;
			const blob = run(this.projectRoot, ["show", status.startsWith("D") ? `HEAD:${path}` : `:${path}`]);
			if (blob.code !== 0) continue;
			const item = readCommittedItem(blob.out);
			if (!item || seen.has(item.id.toLowerCase())) continue;
			seen.add(item.id.toLowerCase());
			items.push(item);
		}
		return items;
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

	/** `message` is already imperative and names what it changed: `Archive CF-3`, `Add milestone m-1`. */
	async commitFiles(message: string, _filePaths: string[], _repoRoot?: string | null): Promise<void> {
		await this.commitBoard(message);
	}

	/** `message` is already imperative and names the item: `Create draft BD-3`. `body` is the reason, if any. */
	async commitTaskChange(_taskId: string, message: string, _filePath: string, body?: string): Promise<void> {
		await this.commitBoard(message, body);
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

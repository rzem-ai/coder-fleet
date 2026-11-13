import { existsSync, realpathSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { readConfig, writeConfig } from "./config.ts";
import { appendEvent, type Source } from "./events.ts";
import { type BoardKey, makeKey, normaliseRemote } from "./key.ts";
import { type BoardPaths, boardPaths, boardsRoot, type Env } from "./paths.ts";

export interface Checkout {
	commonDir: string; // the shared git directory, real path: the same from the main checkout and every worktree
	origin: string | null; // origin's URL as git reports it, insteadOf rewrites applied
}

function git(cwd: string, env: Env, ...args: string[]): { ok: boolean; out: string } {
	const p = Bun.spawnSync(["git", ...args], { cwd, env: env as Record<string, string>, stdout: "pipe", stderr: "pipe" });
	return { ok: p.exitCode === 0, out: p.stdout.toString().trim() };
}

// Null outside a git repository.
export function readCheckout(cwd: string, env: Env = process.env): Checkout | null {
	if (!existsSync(cwd)) return null;
	const common = git(cwd, env, "rev-parse", "--path-format=absolute", "--git-common-dir");
	if (!common.ok || !common.out) return null;
	const origin = git(cwd, env, "remote", "get-url", "origin");
	return { commonDir: realpathSync(common.out), origin: origin.ok && origin.out ? origin.out : null };
}

export function keysFor(checkout: Checkout): { url: BoardKey | null; path: BoardKey } {
	const remote = checkout.origin ? normaliseRemote(checkout.origin, dirname(checkout.commonDir)) : null;
	return { url: remote ? makeKey("url", remote) : null, path: makeKey("path", checkout.commonDir) };
}

export interface Resolution {
	key: BoardKey;
	paths: BoardPaths;
	exists: boolean; // a board has been created under this key
	moved?: { from: string; to: string }; // this call moved a path-keyed board to its URL key
	leftBehind?: string; // a path-keyed board that was not moved because the URL key already had one
}

function hasBoard(dir: string): boolean {
	return existsSync(join(dir, "config.yml"));
}

// Which board a checkout reaches, or null outside a git repository. A repo
// with origin uses the URL key. A repo without one uses its git directory's
// path. The first time a repo that has a path-keyed board is seen with an
// origin, that board's directory is renamed to the URL key, once; after that
// no path-keyed board is left to move. When the URL key already holds a board
// the path-keyed one is left where it is and reported, never merged.
export function resolveBoard(cwd: string, env: Env = process.env, source: Source = "hook"): Resolution | null {
	const checkout = readCheckout(cwd, env);
	if (!checkout) return null;
	const root = boardsRoot(env);
	const { url, path } = keysFor(checkout);
	const pathDir = join(root, path.dirName);
	if (!url) return { key: path, paths: boardPaths(pathDir), exists: hasBoard(pathDir) };

	const urlDir = join(root, url.dirName);
	if (hasBoard(urlDir)) {
		return { key: url, paths: boardPaths(urlDir), exists: true, ...(hasBoard(pathDir) ? { leftBehind: pathDir } : {}) };
	}
	if (!hasBoard(pathDir)) return { key: url, paths: boardPaths(urlDir), exists: false };

	// The one-time move. Another process may win the rename; if it did, the
	// URL key now has the board and this call uses it.
	try {
		renameSync(pathDir, urlDir);
	} catch (e) {
		if (hasBoard(urlDir)) return { key: url, paths: boardPaths(urlDir), exists: true };
		throw e;
	}
	const paths = boardPaths(urlDir);
	const cfg = readConfig(paths);
	writeConfig(paths, { ...cfg, key: url.value, keyKind: url.kind });
	appendEvent(paths, { event: "board-rekeyed", source, from: path.value, to: url.value });
	return { key: url, paths, exists: true, moved: { from: pathDir, to: urlDir } };
}

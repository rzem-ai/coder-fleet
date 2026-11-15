import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { type BoardConfig, readConfig } from "./config.ts";
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

// A board's directory is named by its prefix. A directory there is a board
// when it holds a config.yml whose prefix is the directory's name; one whose
// config cannot be read is skipped, so a broken board elsewhere never stops
// this repo's. There is no index: every resolve reads the configs, so nothing
// can go stale.
export interface Found {
	paths: BoardPaths;
	config: BoardConfig;
}

export function scanBoards(env: Env = process.env): Found[] {
	const root = boardsRoot(env);
	if (!existsSync(root)) return [];
	const out: Found[] = [];
	for (const name of readdirSync(root).sort()) {
		const paths = boardPaths(join(root, name));
		if (!existsSync(paths.config)) continue;
		try {
			const config = readConfig(paths);
			if (config.prefix === name) out.push({ paths, config });
		} catch {
			// unreadable: not a board this resolve can use
		}
	}
	return out;
}

function findByKey(boards: Found[], key: BoardKey): Found | null {
	const hits = boards.filter((b) => b.config.keyKind === key.kind && b.config.key === key.value);
	if (hits.length > 1) {
		throw new Error(`Two boards claim ${key.value}: ${hits.map((h) => h.paths.dir).join(" and ")}. Delete one by hand.`);
	}
	return hits[0] ?? null;
}

export interface Resolution {
	key: BoardKey; // the key of the board found, or the key a new board would get
	found: Found | null; // the board, when one exists for either of the checkout's keys
	shadowed?: string; // a path-keyed board for this repo, unused because its URL key also has one
}

// Which board a checkout reaches, or null outside a git repository. Its
// board is the one recorded under its origin's URL key, else the one under
// its git directory's path key, so a repo whose board was made before it had
// an origin keeps that path-keyed board for good, after gaining one. Nothing
// here writes: a board's recorded key never changes. If both keys somehow
// have a board, the URL-keyed one wins and the other is reported as shadowed.
// A repo with no board gets the URL key when it has an origin, for the board
// it would create.
export function resolveBoard(cwd: string, env: Env = process.env): Resolution | null {
	const checkout = readCheckout(cwd, env);
	if (!checkout) return null;
	const { url, path } = keysFor(checkout);
	const boards = scanBoards(env);
	const byPath = findByKey(boards, path);
	const byUrl = url ? findByKey(boards, url) : null;
	if (url && byUrl) return { key: url, found: byUrl, ...(byPath ? { shadowed: byPath.paths.dir } : {}) };
	if (byPath) return { key: path, found: byPath };
	return { key: url ?? path, found: null };
}

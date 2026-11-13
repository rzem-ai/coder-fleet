import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { type BoardConfig, readConfig, writeConfig } from "./config.ts";
import { appendEvent, type Source } from "./events.ts";
import { type BoardKey, makeKey, normaliseRemote } from "./key.ts";
import { type BoardPaths, boardPaths, boardsRoot, type Env } from "./paths.ts";
import { isLookupHost, sshHostname } from "./ssh-host.ts";

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

// urlSettled is false when the origin is an ssh remote whose host ssh was
// asked about and could not answer (missing, failed, timed out): the URL key
// then carries the host as written, which may be an alias, so it is good for
// finding a board but must never be recorded by a re-key.
export function keysFor(
	checkout: Checkout,
	env: Env = process.env,
): { url: BoardKey | null; path: BoardKey; urlSettled: boolean } {
	let urlSettled = true;
	const remote = checkout.origin
		? normaliseRemote(checkout.origin, dirname(checkout.commonDir), (host) => {
				const real = sshHostname(host, env);
				if (real === null && isLookupHost(host)) urlSettled = false;
				return real;
			})
		: null;
	return { url: remote ? makeKey("url", remote) : null, path: makeKey("path", checkout.commonDir), urlSettled };
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
		throw new Error(`Two boards claim ${key.value}: ${hits.map((h) => h.paths.dir).join(" and ")}. Delete or re-key one by hand.`);
	}
	return hits[0] ?? null;
}

export interface Resolution {
	key: BoardKey; // the key this checkout's board has, or would have
	found: Found | null; // the board, when one has been created for the key
	rekeyed?: { from: string; to: string }; // this call moved a path-keyed board to its URL key
	leftBehind?: string; // a path-keyed board that was not re-keyed because the URL key already had one
}

// Which board a checkout reaches, or null outside a git repository. A repo
// with origin uses the URL key, a repo without one its git directory's path.
// The first time a repo whose board is path-keyed is seen with an origin, the
// board's recorded key becomes the URL key, once, and its directory stays
// where it is; after that no path-keyed board is left for this repo. When the
// URL key already has a board the path-keyed one is left alone and reported,
// never merged.
export function resolveBoard(cwd: string, env: Env = process.env, source: Source = "hook"): Resolution | null {
	const checkout = readCheckout(cwd, env);
	if (!checkout) return null;
	const { url, path, urlSettled } = keysFor(checkout, env);
	const boards = scanBoards(env);
	const byPath = findByKey(boards, path);
	if (!url) return { key: path, found: byPath };

	const byUrl = findByKey(boards, url);
	if (byUrl) return { key: url, found: byUrl, ...(byPath ? { leftBehind: byPath.paths.dir } : {}) };
	if (!byPath) return { key: url, found: null };
	// ssh could not say what the host really is, so the URL key is not known
	// yet: keep the path-keyed board as it is and re-key on a later resolve.
	if (!urlSettled) return { key: path, found: byPath };

	// The one-time re-key. A second process doing the same at once writes the
	// same config and a second log line; the board's lock belongs around this.
	const config: BoardConfig = { ...byPath.config, key: url.value, keyKind: url.kind };
	writeConfig(byPath.paths, config);
	appendEvent(byPath.paths, { event: "board-rekeyed", source, from: path.value, to: url.value });
	return { key: url, found: { paths: byPath.paths, config }, rekeyed: { from: path.value, to: url.value } };
}

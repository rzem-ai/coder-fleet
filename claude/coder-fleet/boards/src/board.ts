import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BoardConfig, readConfig, writeConfig } from "./config.ts";
import { appendEvent, type Source } from "./events.ts";
import { type BoardPaths, boardPaths, boardsRoot, type Env } from "./paths.ts";
import { type Resolution, resolveBoard } from "./resolve.ts";

// The command the human runs to create a board, named in every message that
// sends an agent to the human for one.
export const CLI_NAME = "boards";

export interface Board {
	paths: BoardPaths;
	config: BoardConfig;
	resolution: Resolution;
}

// One letter, then up to nine letters or digits; typed in either case and
// kept in upper case. It names the board's directory, so it is unique on the
// machine, and it never changes once the board exists: nothing writes a new
// one, and a board whose config names a prefix other than its directory's is
// not found at all.
export const PREFIX_RE = /^[A-Z][A-Z0-9]{0,9}$/;

export function normalisePrefix(input: string): string {
	const p = input.trim().toUpperCase();
	if (!PREFIX_RE.test(p)) {
		throw new Error(`"${input.trim()}" is not a board prefix: use a letter, then up to nine letters or digits, for example XY`);
	}
	return p;
}

export class NoBoardError extends Error {}

// What an agent is told when its repo has no board. A board is created only
// by the human, through the CLI or the web UI, because only the human picks
// the prefix.
export function noBoardMessage(res: Resolution | null): string {
	if (!res) return "There is no board here: this directory is not inside a git repository.";
	return `This repo has no board yet. Ask the human to create one: they run \`${CLI_NAME} init\` in this repo, which asks for the board's id prefix. Until then there is nothing to read or write.`;
}

export function openBoard(cwd: string, env: Env = process.env, source: Source = "hook"): Board | null {
	const res = resolveBoard(cwd, env, source);
	if (!res?.found) return null;
	return { ...res.found, resolution: res };
}

export function requireBoard(cwd: string, env: Env = process.env, source: Source = "hook"): Board {
	const res = resolveBoard(cwd, env, source);
	if (!res?.found) throw new NoBoardError(noBoardMessage(res));
	return { ...res.found, resolution: res };
}

// Creates the board for the repo at cwd, in a directory named by the prefix
// the human gave. Only the CLI's init and the web UI call this; no
// agent-facing tool does.
export function createBoard(cwd: string, prefixInput: string, env: Env = process.env, source: Source = "cli"): Board {
	const prefix = normalisePrefix(prefixInput);
	const res = resolveBoard(cwd, env, source);
	if (!res) throw new NoBoardError(noBoardMessage(null));
	if (res.found) {
		throw new Error(`This repo already has a board, prefix ${res.found.config.prefix}, at ${res.found.paths.dir}`);
	}
	const root = boardsRoot(env);
	mkdirSync(root, { recursive: true });
	const paths = boardPaths(join(root, prefix));
	// Not recursive: the directory is the claim on the prefix, and a second
	// board asking for it fails here, whoever made the first.
	try {
		mkdirSync(paths.dir);
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
		let owner = "";
		try {
			owner = ` for ${readConfig(paths).key}`;
		} catch {}
		throw new Error(`The prefix ${prefix} is taken: a board already exists at ${paths.dir}${owner}. Choose another prefix.`);
	}
	for (const d of [paths.cards, paths.specs, paths.runs, paths.locks, paths.testRuns]) mkdirSync(d);
	writeFileSync(paths.ids, `${JSON.stringify({ top: 0, sub: {} })}\n`);
	// config.yml is written last: its presence is what makes a board exist.
	const config: BoardConfig = { prefix, key: res.key.value, keyKind: res.key.kind, created: new Date().toISOString() };
	writeConfig(paths, config);
	appendEvent(paths, { event: "board-created", source, prefix, key: res.key.value });
	return { paths, config, resolution: { ...res, found: { paths, config } } };
}

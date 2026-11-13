import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BoardConfig, readConfig, writeConfig } from "./config.ts";
import { appendEvent, type Source } from "./events.ts";
import { type BoardPaths, boardPaths, boardsRoot, type Env } from "./paths.ts";
import { type Resolution, resolveBoard } from "./resolve.ts";

// Single-quotes a word for a POSIX shell, so a path with a space or a quote
// pastes as one argument.
export function shellQuote(word: string): string {
	return `'${word.replace(/'/g, `'\\''`)}'`;
}

// How the human runs the CLI today: Bun on this package's own cli.ts, by its
// quoted absolute path, from inside the repo. Every message that sends an
// agent to the human for a board names it. The compiled binary replaces it
// once the board ships as one.
export const CLI_COMMAND = `bun ${shellQuote(join(import.meta.dir, "cli.ts"))}`;

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
	return `This repo has no board yet. Ask the human to create one: they run \`${CLI_COMMAND} init\` from inside this repo, which asks for the board's id prefix. Until then there is nothing to read or write.`;
}

export function openBoard(cwd: string, env: Env = process.env): Board | null {
	const res = resolveBoard(cwd, env);
	if (!res?.found) return null;
	return { ...res.found, resolution: res };
}

export function requireBoard(cwd: string, env: Env = process.env): Board {
	const res = resolveBoard(cwd, env);
	if (!res?.found) throw new NoBoardError(noBoardMessage(res));
	return { ...res.found, resolution: res };
}

// Creates the board for the repo at cwd, in a directory named by the prefix
// the human gave. Only the CLI's init and the web UI call this; no
// agent-facing tool does.
// Throws unless cwd is in a git repository whose key has no board yet. The
// CLI calls this before asking for a prefix, so nobody types one for nothing.
export function assertCanCreate(cwd: string, env: Env = process.env): Resolution {
	const res = resolveBoard(cwd, env);
	if (!res) throw new NoBoardError(noBoardMessage(null));
	if (res.found) {
		throw new Error(`This repo already has a board, prefix ${res.found.config.prefix}, at ${res.found.paths.dir}`);
	}
	return res;
}

export function createBoard(cwd: string, prefixInput: string, env: Env = process.env, source: Source = "cli"): Board {
	const prefix = normalisePrefix(prefixInput);
	const res = assertCanCreate(cwd, env);
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

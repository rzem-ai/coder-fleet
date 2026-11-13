import { mkdirSync, writeFileSync } from "node:fs";
import { type BoardConfig, readConfig, writeConfig } from "./config.ts";
import { appendEvent, type Source } from "./events.ts";
import { type BoardPaths, type Env } from "./paths.ts";
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
// kept in upper case.
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
	if (!res?.exists) return null;
	return { paths: res.paths, config: readConfig(res.paths), resolution: res };
}

export function requireBoard(cwd: string, env: Env = process.env, source: Source = "hook"): Board {
	const res = resolveBoard(cwd, env, source);
	if (!res?.exists) throw new NoBoardError(noBoardMessage(res));
	return { paths: res.paths, config: readConfig(res.paths), resolution: res };
}

// Creates the board for the repo at cwd with the prefix the human gave. Only
// the CLI's init and the web UI call this; no agent-facing tool does.
export function createBoard(cwd: string, prefixInput: string, env: Env = process.env, source: Source = "cli"): Board {
	const prefix = normalisePrefix(prefixInput);
	const res = resolveBoard(cwd, env, source);
	if (!res) throw new NoBoardError(noBoardMessage(null));
	if (res.exists) {
		const cfg = readConfig(res.paths);
		throw new Error(`This repo already has a board, prefix ${cfg.prefix}, at ${res.paths.dir}`);
	}
	const { paths, key } = res;
	for (const d of [paths.dir, paths.cards, paths.specs, paths.runs, paths.locks, paths.testRuns]) mkdirSync(d, { recursive: true });
	writeFileSync(paths.ids, `${JSON.stringify({ top: 0, sub: {} })}\n`);
	// config.yml is written last: its presence is what makes a board exist.
	const config: BoardConfig = { prefix, key: key.value, keyKind: key.kind, created: new Date().toISOString() };
	writeConfig(paths, config);
	appendEvent(paths, { event: "board-created", source, prefix, key: key.value });
	return { paths, config, resolution: { ...res, exists: true } };
}

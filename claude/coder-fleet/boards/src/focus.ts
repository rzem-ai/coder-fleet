import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "./lock.ts";
import { type Env, privateStateDir } from "./paths.ts";

// Focus binding, as the old board does it. Each checkout (the main checkout
// and each linked worktree, by its top-level path) has one focus file naming
// the card its sessions are working on. The lead sets it, or a `Board-Item:`
// line in a spawn prompt does; a new, cleared or resumed session clears it, and
// a compaction keeps it. When a subagent starts, it is bound to the spawning
// session's focus for the whole of its run, in its own worktree or not, and a
// resume keeps the card it started on. The board's hooks move only an agent's
// bound card, so a checkout focused on one card never moves another's.
//
// Every file lives in the user's private state directory (privateStateDir in
// src/paths.ts) and is written to a temporary file and renamed into place.

// What a card id looks like on any board, capped in length. A focus or a
// binding that does not look like one is read as none, so nothing else in
// the file ever reaches a hook's output.
const CARD_ID = /^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]*(?:\.[1-9][0-9]*)*$/;

export function looksLikeCardId(text: string): boolean {
	return text.length <= 64 && CARD_ID.test(text);
}

function readId(file: string): string | null {
	if (!existsSync(file)) return null;
	const id = readFileSync(file, "utf8").split("\n")[0]?.trim() ?? "";
	return looksLikeCardId(id) ? id : null;
}

function checkoutOf(cwd: string, env: Env): string | null {
	if (!existsSync(cwd)) return null;
	const p = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd, env: env as Record<string, string>, stdout: "pipe", stderr: "pipe" });
	const top = p.stdout.toString().trim();
	return p.exitCode === 0 && top ? realpathSync(top) : null;
}

function focusFile(cwd: string, env: Env): string | null {
	const top = checkoutOf(cwd, env);
	if (!top) return null;
	return join(privateStateDir(env), "focus", createHash("sha256").update(top).digest("hex").slice(0, 32));
}

export function readFocus(cwd: string, env: Env = process.env): string | null {
	const f = focusFile(cwd, env);
	return f ? readId(f) : null;
}

// The file's second line names the checkout, for a human reading the file.
export function setFocus(cwd: string, id: string, env: Env = process.env): void {
	if (!looksLikeCardId(id)) throw new Error(`"${id}" is not a card id`);
	const f = focusFile(cwd, env);
	if (!f) throw new Error(`${cwd} is not inside a git checkout, so it has no focus`);
	mkdirSync(join(f, ".."), { recursive: true, mode: 0o700 });
	writeAtomic(f, `${id}\n${checkoutOf(cwd, env)}\n`);
}

// Clears the checkout's focus and returns the card it named, if any.
export function clearFocus(cwd: string, env: Env = process.env): string | null {
	const f = focusFile(cwd, env);
	if (!f) return null;
	const was = readId(f);
	rmSync(f, { force: true });
	return was;
}

function safe(part: string): string {
	return part.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128) || "_";
}

function agentFile(sessionId: string, agentId: string, env: Env): string {
	return join(privateStateDir(env), "agents", safe(sessionId), safe(agentId));
}

// The card a subagent is bound to: a card id, "" for an agent bound to none,
// or null when this agent has no binding yet.
export function agentCard(sessionId: string, agentId: string, env: Env = process.env): string | null {
	const f = agentFile(sessionId, agentId, env);
	return existsSync(f) ? (readId(f) ?? "") : null;
}

// Binds an agent to a card, or to none, once: the first start writes the
// binding and a resume, which fires the start again, keeps it. Returns the
// binding that stands.
export function bindAgent(sessionId: string, agentId: string, card: string | null, env: Env = process.env): string {
	const f = agentFile(sessionId, agentId, env);
	mkdirSync(join(f, ".."), { recursive: true, mode: 0o700 });
	try {
		writeAtomic(f, `${card ?? ""}\n`, true);
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
	}
	return agentCard(sessionId, agentId, env) ?? "";
}

// The card a `Board-Item: XY-12` line names, the first such line in `text`.
// A leading "- " and any case of the key are allowed; the id is upper-cased.
export function boardItemLine(text: string): string | null {
	const m = /^[ \t]*(?:-[ \t]+)?board-item:[ \t]*([A-Za-z][A-Za-z0-9]*-[0-9]+(?:\.[0-9]+)*)[ \t]*$/im.exec(text.replace(/\r/g, ""));
	return m?.[1] ? m[1].toUpperCase() : null;
}

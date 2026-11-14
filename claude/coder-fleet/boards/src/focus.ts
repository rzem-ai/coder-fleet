import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "./lock.ts";
import { type Env, privateStateDir } from "./paths.ts";

// Focus and binding. Each checkout (the main checkout and each linked
// worktree, by its top-level path) has one focus file naming the card its
// sessions are working on. The lead sets it, or a `Board-Item:` line in a
// spawn prompt does; a new, cleared or resumed session clears it, and a
// compaction keeps it.
//
// A spawn is bound when it is sent, not when its agent starts: the Agent
// tool's PreToolUse records the card for that one call, keyed by its
// tool_use_id, so a focus that changes later in the same batch never reaches
// it. SubagentStart carries no tool_use_id and fires before the agent's
// transcript exists, so the agent learns its spawn at its first stop, from
// the `toolUseId` in the `.meta.json` Claude Code writes beside the agent's
// transcript. A workflow lane is sent by no Agent call and its meta names no
// toolUseId, so it falls back to the focus as it was when it started. The
// binding then holds for the agent's whole run, and a resume keeps it. The
// board's hooks move only an agent's bound card, so a checkout focused on one
// card never moves another's.
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

// The checkout whose focus a hook sets, reads and clears: the session's own,
// CLAUDE_PROJECT_DIR, when it is set and is a git checkout, else the event's
// cwd. A `cd` moves the cwd but not CLAUDE_PROJECT_DIR, and an agent spawned
// into its own worktree starts with that worktree as its cwd, so every hook
// starts from here and they all reach the same focus.
export function focusBase(cwd: string, env: Env = process.env): string {
	const project = env.CLAUDE_PROJECT_DIR;
	return project && checkoutOf(project, env) ? project : cwd;
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

// Binds an agent to a card, or to none, once: the first stop writes the
// binding and a resumed agent keeps it. Returns the binding that stands.
export function bindAgent(sessionId: string, agentId: string, card: string | null, env: Env = process.env): string {
	return writeOnce(agentFile(sessionId, agentId, env), card);
}

// Writes `card` (or "" for none) to `file` once, exclusively, and returns
// what stands there.
function writeOnce(file: string, card: string | null): string {
	mkdirSync(join(file, ".."), { recursive: true, mode: 0o700 });
	try {
		writeAtomic(file, `${card ?? ""}\n`, true);
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
	}
	return readId(file) ?? "";
}

function spawnFile(sessionId: string, toolUseId: string, env: Env): string {
	return join(privateStateDir(env), "spawns", safe(sessionId), safe(toolUseId));
}

// Records the card one Agent call was sent for, or none. Returns what stands.
export function recordSpawn(sessionId: string, toolUseId: string, card: string | null, env: Env = process.env): string {
	return writeOnce(spawnFile(sessionId, toolUseId, env), card);
}

// The card one Agent call was sent for: a card id, "" for none, or null when
// the call left no record.
export function spawnCard(sessionId: string, toolUseId: string, env: Env = process.env): string | null {
	const f = spawnFile(sessionId, toolUseId, env);
	return existsSync(f) ? (readId(f) ?? "") : null;
}

function startFile(sessionId: string, agentId: string, env: Env): string {
	return join(privateStateDir(env), "starts", safe(sessionId), safe(agentId));
}

// Notes that an agent started, with the checkout's focus at that moment, the
// fallback binding for a workflow lane. A resume keeps the first note.
export function noteStart(sessionId: string, agentId: string, focus: string | null, env: Env = process.env): void {
	writeOnce(startFile(sessionId, agentId, env), focus);
}

// The focus noted at an agent's start: a card id, "" for none, or null when
// no start was noted.
export function startNote(sessionId: string, agentId: string, env: Env = process.env): string | null {
	const f = startFile(sessionId, agentId, env);
	return existsSync(f) ? (readId(f) ?? "") : null;
}

// The tool_use_id of the Agent call that spawned the agent whose transcript
// is `transcript`, read from the `.meta.json` beside it: a string, null when
// the meta names none (a workflow lane), or undefined when there is no meta
// to read.
export function spawnToolUseId(transcript: string): string | null | undefined {
	if (!transcript.endsWith(".jsonl")) return undefined;
	try {
		const meta = JSON.parse(readFileSync(`${transcript.slice(0, -".jsonl".length)}.meta.json`, "utf8")) as { toolUseId?: unknown };
		return typeof meta.toolUseId === "string" && meta.toolUseId ? meta.toolUseId : null;
	} catch {
		return undefined;
	}
}

// The card a `Board-Item: XY-12` line names, the first such line in `text`.
// A leading "- " and any case of the key are allowed; the id is upper-cased.
export function boardItemLine(text: string): string | null {
	const m = /^[ \t]*(?:-[ \t]+)?board-item:[ \t]*([A-Za-z][A-Za-z0-9]*-[0-9]+(?:\.[0-9]+)*)[ \t]*$/im.exec(text.replace(/\r/g, ""));
	return m?.[1] ? m[1].toUpperCase() : null;
}

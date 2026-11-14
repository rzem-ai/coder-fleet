import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Env, stateRoot } from "./paths.ts";

// Focus binding, as the old board does it. Each checkout (the main checkout
// and each linked worktree, by its top-level path) has one focus file naming
// the card its sessions are working on. The lead sets it, or a `Board-Item:`
// line in a spawn prompt does; a new, cleared or resumed session clears it, and
// a compaction keeps it. When a subagent starts, it is bound to its spawning
// checkout's focus for the whole of its run, in its own worktree or not, and a
// resume keeps the card it started on. The board's hooks move only an agent's
// bound card, so a checkout focused on one card never moves another's.

function checkoutOf(cwd: string, env: Env): string | null {
	if (!existsSync(cwd)) return null;
	const p = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd, env: env as Record<string, string>, stdout: "pipe", stderr: "pipe" });
	const top = p.stdout.toString().trim();
	return p.exitCode === 0 && top ? realpathSync(top) : null;
}

function focusFile(cwd: string, env: Env): string | null {
	const top = checkoutOf(cwd, env);
	if (!top) return null;
	return join(stateRoot(env), "focus", createHash("sha256").update(top).digest("hex").slice(0, 32));
}

export function readFocus(cwd: string, env: Env = process.env): string | null {
	const f = focusFile(cwd, env);
	if (!f || !existsSync(f)) return null;
	return readFileSync(f, "utf8").split("\n")[0]?.trim() || null;
}

// The file's second line names the checkout, for a human reading the file.
export function setFocus(cwd: string, id: string, env: Env = process.env): void {
	const f = focusFile(cwd, env);
	if (!f) throw new Error(`${cwd} is not inside a git checkout, so it has no focus`);
	mkdirSync(join(f, ".."), { recursive: true });
	writeFileSync(f, `${id}\n${checkoutOf(cwd, env)}\n`);
}

// Clears the checkout's focus and returns the card it named, if any.
export function clearFocus(cwd: string, env: Env = process.env): string | null {
	const was = readFocus(cwd, env);
	const f = focusFile(cwd, env);
	if (f) rmSync(f, { force: true });
	return was;
}

function safe(part: string): string {
	return part.replace(/[^A-Za-z0-9._-]/g, "_") || "_";
}

function agentFile(sessionId: string, agentId: string, env: Env): string {
	return join(stateRoot(env), "agents", safe(sessionId), safe(agentId));
}

// The card a subagent is bound to: a string, "" for an agent bound to none, or
// null when this agent has no binding yet.
export function agentCard(sessionId: string, agentId: string, env: Env = process.env): string | null {
	const f = agentFile(sessionId, agentId, env);
	return existsSync(f) ? readFileSync(f, "utf8").trim() : null;
}

// Binds an agent to a card, or to none, once: the first start writes the
// binding and a resume, which fires the start again, keeps it. Returns the
// binding that stands.
export function bindAgent(sessionId: string, agentId: string, card: string | null, env: Env = process.env): string {
	const f = agentFile(sessionId, agentId, env);
	mkdirSync(join(f, ".."), { recursive: true });
	try {
		writeFileSync(f, `${card ?? ""}\n`, { flag: "wx" });
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

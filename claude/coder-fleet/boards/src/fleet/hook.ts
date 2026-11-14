// What the fleet's hook ports share: the state directory, the log line every
// hook writes, a hook's input, and its PreToolUse answers.
//
// A hook whose shim must fail closed (the scope hook, the disabled-agents
// hook) prints a word or a JSON object, never nothing: `allow` lets the call
// through, and any JSON object is the hook's output, passed on as it is. The
// shim refuses on anything else, a crash included, so a crash is never read
// as an allow.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ${CODER_FLEET_STATE_DIR:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/coder-fleet}
export function stateDir(): string {
	const env = process.env;
	if (env.CODER_FLEET_STATE_DIR) return env.CODER_FLEET_STATE_DIR;
	const base = env.XDG_STATE_HOME || `${env.HOME ?? ""}/.local/state`;
	return `${base}/coder-fleet`;
}

export function utcStamp(d = new Date()): string {
	return `${d.toISOString().slice(0, 19)}Z`;
}

// One log line, `<UTC time> [<hook>] <message>`, to stderr and, when `file`
// is given, appended to it, its directory made first. A file that cannot be
// written is skipped.
export function hookLog(hook: string, message: string, file?: string): void {
	const line = `${utcStamp()} [${hook}] ${message}\n`;
	process.stderr.write(line);
	if (!file) return;
	try {
		mkdirSync(dirname(file), { recursive: true });
		appendFileSync(file, line);
	} catch {}
}

export function hooksLogFile(): string {
	return join(stateDir(), "log", "hooks.log");
}

export async function readInput(): Promise<string> {
	return await Bun.stdin.text();
}

// jq's `.x // ""` then `tostring`: null and false read as empty, a string as
// itself, anything else as its JSON text.
export function str(v: unknown): string {
	if (v === null || v === undefined || v === false) return "";
	if (typeof v === "string") return v;
	return JSON.stringify(v);
}

// The hook's input as jq reads it: an object, or null, whose fields all read
// as empty. Anything else, broken JSON included, is null here.
export function parseEvent(input: string): Record<string, unknown> | null {
	let v: unknown;
	try {
		v = JSON.parse(input);
	} catch {
		return null;
	}
	if (v === null) return {};
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function denyJson(reason: string): string {
	return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
}

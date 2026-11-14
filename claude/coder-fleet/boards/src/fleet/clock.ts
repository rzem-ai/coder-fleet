// `boards fleet clock`: SubagentStart and PreToolUse, a wall-clock cap for the
// agents that have one. Ported from hooks/agent-clock.sh, now a shim that
// pipes the hook's input here.
//
// The human's rule: a reviewer in break mode must not run for more than 20
// minutes, and a hook stops it at 25. The reviewer's body tells it the 20;
// this enforces the 25. At SubagentStart it records when a reviewer was
// spawned, every reviewer, because its brief may not be on disk yet. On every
// tool call of a reviewer whose brief names break mode it denies the call once
// the hard cap has passed, and under the cap it trims a Bash call's timeout to
// the time left. A reviewer in review or use mode alone is never capped.
//
// The mode comes from the reviewer's brief (reviewer-modes.ts), recorded on
// the first clean read. A brief that cannot be read is capped as break mode,
// logged once per agent id through a marker file, clocks/<id>.nobrief, and
// nothing is recorded for it, since SubagentStart can come before the prompt
// is on disk.
//
// Not in the scope hook: that hook's matcher misses Read, Grep, Glob and every
// MCP tool, and this one is registered with no matcher. The shim leaves before
// starting this program for the main session, which sends no agent_id.
//
// The resume rule. SendMessage fires SubagentStart again for the same agent
// id, so the clock file is created exclusively and the first start stands,
// and nothing removes it at SubagentStop, which fires before every resume too.
//
// It fails open: input that is not JSON, a clock file that cannot be read or
// written, or any other error allows the call and logs why, since failing
// closed would kill a whole run over a hook fault. A capped agent with no
// clock file has its clock started late. StructuredOutput is never denied: it
// is how a schema run returns its result.
//
// The trim relies on runtime behaviour the documentation contradicts. The
// docs say "Without a decision, `updatedInput` is ignored"; the 2.1.283 bundle
// applies it (`if(Ee.updatedInput&&Ee.permissionBehavior===void 0)yield
// {type:"hookUpdatedInput",...}`) before the normal permission decision runs on
// the rewritten input. So the trim sends updatedInput with NO
// permissionDecision, never "allow", which would wave the call past the deny
// and ask rules in settings. If a later CLI follows the docs, the trim stops
// and the deny still holds. Hooks README item 20 says how to re-derive this.
//
// Prints the hook's JSON, or nothing to allow. Always exits 0.
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hookLog, hooksLogFile, obj, parseEvent, readInput, stateDir, str, utcStamp } from "./hook.ts";
import { reviewerModes } from "./reviewer-modes.ts";

const HOOK = "AgentClock";

// The per-agent table: advisory and hard caps in seconds. Only the hard one is
// enforced here; the agent's body tells it the advisory one.
const CAPS: Record<string, [number, number]> = { reviewer: [1200, 1500] };

// Quoted back on a deny, character for character as the agent's body has it.
const INVARIANT: Record<string, string> = {
	reviewer: "Never let a break-mode run go past 20 minutes of wall-clock from your spawn.",
};

// The runtime's floor for a trimmed Bash timeout, and its default, in ms.
const TRIM_FLOOR_MS = 5000;
const BASH_RUNTIME_DEFAULT_MS = 120000;

const log = (m: string) => hookLog(HOOK, m, hooksLogFile());

function digitsOnly(s: string): boolean {
	return /^[1-9][0-9]*$/.test(s);
}

export function clock(input: string): string {
	const ev = parseEvent(input);
	if (!ev) {
		log("hook input is not valid JSON; allowing the call");
		return "";
	}
	const event = str(ev.hook_event_name);
	const agentType = str(ev.agent_type);
	const agentId = str(ev.agent_id);
	const toolName = str(ev.tool_name);
	const transcript = str(ev.transcript_path).replace(/[\r\n\x1f]/g, "");
	const toolInput = ev.tool_input;
	let timeoutIn = "";
	const t = obj(toolInput).timeout;
	if (typeof t === "number" && t >= 1) timeoutIn = String(Math.min(Math.floor(t), 1000000000));
	if (!digitsOnly(timeoutIn)) timeoutIn = "";

	// A plugin agent can arrive as "reviewer" or as "coder-fleet:reviewer".
	const agent = agentType.slice(agentType.lastIndexOf(":") + 1);
	if (!agent || !agentId) return "";
	const caps = CAPS[agent];
	if (!caps) return "";
	const [advisory, hard] = caps;

	const safeId = agentId.replace(/[^A-Za-z0-9._-]/g, "_");
	const clockDir = join(stateDir(), "clocks");
	const clockFile = join(clockDir, safeId);

	// Create-if-absent; false when the file is already there or cannot be written.
	const startClock = (): boolean => {
		const now = Math.floor(Date.now() / 1000);
		try {
			mkdirSync(clockDir, { recursive: true, mode: 0o700 });
		} catch {
			return false;
		}
		try {
			chmodSync(clockDir, 0o700);
		} catch {}
		try {
			writeFileSync(clockFile, `started_at=${now}\nstarted_iso=${utcStamp()}\nagent_type=${agent}\n`, { flag: "wx", mode: 0o600 });
			return true;
		} catch {
			return false;
		}
	};

	if (event === "SubagentStart") {
		if (startClock()) {
			log(`started the clock for ${agent} ${agentId}: if its brief names break mode, asked to finish by ${advisory / 60} minutes, stopped at ${hard / 60}`);
		} else if (isFile(clockFile)) {
			log(`${agent} ${agentId} started again (a resume); its first start in ${clockFile} stands`);
		} else {
			log(`could not write ${clockFile}; ${agent} ${agentId} is uncapped until its first tool call starts the clock`);
		}
		return "";
	}
	if (event !== "PreToolUse") return "";

	// Only a break-mode run is capped, and a brief that cannot be read is
	// capped too.
	const modes = reviewerModes(transcript, agentId, join(stateDir(), "modes"));
	if (modes.read) {
		if (!` ${modes.modes} `.includes(" break ")) return "";
	} else {
		let marked = false;
		try {
			mkdirSync(clockDir, { recursive: true, mode: 0o700 });
			writeFileSync(`${clockFile}.nobrief`, "", { flag: "wx", mode: 0o600 });
			marked = true;
		} catch {}
		if (marked) {
			log(
				`could not read the brief of ${agent} ${agentId} from beside ${transcript || "no transcript_path"}, or its Modes: header is malformed; it is capped as break mode until a clean read records its modes`,
			);
		}
	}

	if (!isFile(clockFile)) {
		if (startClock()) log(`no clock for ${agent} ${agentId} at ${toolName}; started it now, late, and allowed the call`);
		else log(`no clock for ${agent} ${agentId} and ${clockFile} cannot be written; allowing the call, uncapped`);
		return "";
	}

	let started = "";
	try {
		const line = readFileSync(clockFile, "utf8")
			.split("\n")
			.find((l) => l.startsWith("started_at="));
		started = line ? line.slice("started_at=".length) : "";
	} catch {}
	if (!digitsOnly(started)) {
		log(`clock file ${clockFile} is unreadable (started_at '${started}'); allowing the call, uncapped`);
		return "";
	}
	if (started.length > 12) {
		log(`clock file ${clockFile} is unreadable (started_at out of range); allowing the call, uncapped`);
		return "";
	}

	// A clock stepped back counts as no time at all. Machine sleep counts in
	// full: the rule is wall-clock.
	const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - Number(started));

	if (toolName === "StructuredOutput") return "";

	if (elapsed >= hard) {
		const minutes = Math.floor(elapsed / 60);
		const reason = `${agent} invariant: "${INVARIANT[agent] ?? "Stay inside your time cap."}" This run has been going ${minutes} minutes, past the ${hard / 60}-minute hard cap, so this call and every later one is denied - do not retry it or try another tool. End now with your four-heading handoff from what you already have: what you ran and what died under Done, and every claim or mutation you did not finish under Not done, named, so a fresh ${agent} in break mode can start there.`;
		log(`denied ${toolName} for ${agent} ${agentId} at ${elapsed}s, past the ${hard}s cap`);
		return JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }, null, 2);
	}

	if (toolName !== "Bash") return "";

	const remainingMs = (hard - elapsed) * 1000;
	let requested = timeoutIn;
	if (!requested) {
		requested = process.env.BASH_DEFAULT_TIMEOUT_MS ?? "";
		if (!digitsOnly(requested)) requested = String(BASH_RUNTIME_DEFAULT_MS);
		if (requested.length > 10) requested = "1000000000";
	}
	if (remainingMs >= Number(requested)) return "";

	const trimmed = Math.max(remainingMs, TRIM_FLOOR_MS);
	// No permissionDecision, on purpose. Every other field of tool_input is kept.
	const out = JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { ...obj(toolInput), timeout: trimmed } } });
	log(`trimmed a Bash timeout for ${agent} ${agentId} from ${requested}ms to ${trimmed}ms, ${elapsed}s into a ${hard}s cap`);
	return out;
}

function isFile(p: string): boolean {
	try {
		return statSync(p).isFile();
	} catch {
		return false;
	}
}

export async function clockCommand(): Promise<number> {
	let out = "";
	try {
		out = clock(await readInput());
	} catch (e) {
		log(`unexpected error (${(e as Error).message ?? e}); allowing the call`);
		out = "";
	}
	if (out) process.stdout.write(`${out}\n`);
	return 0;
}

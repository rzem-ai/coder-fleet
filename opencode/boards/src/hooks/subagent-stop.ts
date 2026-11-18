#!/usr/bin/env bun
// The SubagentStop hook, `boards hook subagent-stop`, matched in hooks.json to
// the fleet's agents but the lead. Two jobs.
//
//   1. The handoff-format check (src/handoff.ts). A fleet agent's final
//      message must be a valid handoff. If it is not, the hook exits 2 with
//      the reasons on stderr, which sends the agent back to re-emit it, up to
//      CODER_FLEET_HANDOFF_REEMIT_CAP times (3) per agent; past the cap, or on
//      a re-emit with no count to cap it by, the stop is let go and logged.
//      An untyped stop, a lead-typed one and the session's own side call (no
//      start noted and no transcript on disk) owe no handoff. A run with no
//      final message is judged by its transcript: a StructuredOutput call was
//      never asked for a handoff, text is checked as one, and an unreadable
//      transcript lets the stop through.
//   2. The board. The agent is bound to its card (bindAtStop in
//      src/hook-moves.ts), each `Blocker:` line becomes an Action for Human on
//      it, which moves it to Blocked by Human, and a coder's or scripter's stop
//      runs the card gate (onAgentStop). A board failure never blocks a stop.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentCard, startNote } from "../focus.ts";
import { handoffErrors, reemitReason, transcriptFinalBlock } from "../handoff.ts";
import { boardForHook } from "../hook-board.ts";
import { onAgentStop } from "../hook-moves.ts";
import { privateStateDir, StateDirRefused } from "../paths.ts";

interface StopInput {
	cwd?: string;
	session_id?: string;
	agent_id?: string;
	agent_type?: unknown;
	stop_hook_active?: unknown;
	agent_transcript_path?: unknown;
	last_assistant_message?: unknown;
}

const log = (m: string) => process.stderr.write(`board: SubagentStop: ${m}\n`);

let input: StopInput;
try {
	input = JSON.parse(await Bun.stdin.text());
	if (!input || typeof input !== "object") throw new Error("not an object");
} catch {
	log("its input was not a JSON object; nothing to check");
	process.exit(0);
}

const session = input.session_id ?? "";
const agent = input.agent_id ?? "";
const type = typeof input.agent_type === "string" ? input.agent_type : "";
const transcript = typeof input.agent_transcript_path === "string" ? input.agent_transcript_path : "";
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128) || "_";

if (!type) {
	log(`an untyped subagent (${agent || "no id"}) stopped; no fleet role, no handoff to check`);
	process.exit(0);
}
if (type === "lead" || type === "coder-fleet:lead") process.exit(0);

// The session's own side call carries the session's agent type, so its shape
// gives it away: no start noted for its id and no transcript on disk. Both are
// needed, since either alone can be missing for a real agent.
let started = false;
try {
	started = !!agent && (startNote(session, agent) !== null || agentCard(session, agent) !== null);
} catch {}
if (agent && !started && !(transcript && existsSync(transcript))) {
	log(`a ${type} stop (${agent}) has no start and no transcript on disk, so it is the session's own side call; nothing to check`);
	process.exit(0);
}

let message: string;
if (input.last_assistant_message !== undefined && input.last_assistant_message !== null) {
	message = typeof input.last_assistant_message === "string" ? input.last_assistant_message : JSON.stringify(input.last_assistant_message);
} else {
	const block = transcriptFinalBlock(transcript, Number(process.env.CODER_FLEET_TRANSCRIPT_MAX_BYTES) || undefined);
	if (!block || "structured" in block) process.exit(0);
	message = block.text;
}

const errors = handoffErrors(message);
let reemitFile = "";
try {
	if (agent) reemitFile = join(privateStateDir(), "reemits", safe(session), safe(agent));
} catch {}

if (errors.length) {
	const cap = /^[0-9]+$/.test(process.env.CODER_FLEET_HANDOFF_REEMIT_CAP ?? "") ? Number(process.env.CODER_FLEET_HANDOFF_REEMIT_CAP) : 3;
	let counted = false;
	if (reemitFile) {
		const n = Number(existsSync(reemitFile) ? readFileSync(reemitFile, "utf8").trim() : "0") || 0;
		if (n >= cap) {
			rmSync(reemitFile, { force: true });
			log(`the handoff from ${type} ${agent} is still malformed after ${n} re-emits, the cap; letting it stop`);
			process.exit(0);
		}
		try {
			mkdirSync(join(reemitFile, ".."), { recursive: true, mode: 0o700 });
			writeFileSync(reemitFile, `${n + 1}\n`, { mode: 0o600 });
			counted = true;
		} catch {}
	}
	if (!counted && input.stop_hook_active === true) {
		log(`the handoff from ${type} ${agent || "(no id)"} is still malformed after a re-emit, with no count to cap it by; letting it stop`);
		process.exit(0);
	}
	process.stderr.write(reemitReason(errors));
	process.exit(2);
}
if (reemitFile) rmSync(reemitFile, { force: true });

try {
	const { board } = boardForHook({ cwd: input.cwd || process.cwd(), sessionId: session });
	if (board && session && agent) onAgentStop(board, session, agent, type, message, transcript);
} catch (e) {
	// A refused state directory was named once, at session start.
	if (!(e instanceof StateDirRefused)) log((e as Error).message);
}

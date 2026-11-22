// OpenCode's native lifecycle boundary. No Claude hook payloads or transcripts.
import { NoBoardError, requireBoard } from "./board.ts";
import { agentCard, bindAgent, clearFocus, setFocus } from "./focus.ts";
import { cardGate } from "./gates.ts";
import { handoffErrors, reemitReason } from "./handoff.ts";
import { draftSpawnWarning, onAgentStop, onSpawnSent, returnStranded } from "./hook-moves.ts";
import { isGitPush, pushedNames, releaseCatchUp, restartVanishedRuns } from "./releases.ts";
import { agentDisabled, configRead, configRoot } from "./fleet/config.ts";
import { privateStateDir, type Env } from "./paths.ts";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { withLock, writeAtomic } from "./lock.ts";

export interface LifecycleInput {
	cwd: string;
	sessionID: string;
	parentID?: string;
	agent?: string;
	prompt?: string;
	text?: string;
	command?: string;
	card?: string;
	messageID?: string;
}

export function lifecycle(action: string, input: LifecycleInput, env: Env = process.env): Record<string, unknown> {
	if (!["info", "check", "session", "start", "finish", "push", "focus", "complete"].includes(action)) throw new Error(`unknown OpenCode lifecycle action: ${action}`);
	if (!input.cwd || !input.sessionID) throw new Error("cwd and sessionID are required");
	const agent = input.agent ?? "";
	const config = configRead(configRoot(input.cwd) ?? "");
	const warning = config.FLEET_CONFIG_REASON ? `Fleet configuration: ${config.FLEET_CONFIG_PATH || input.cwd}: ${config.FLEET_CONFIG_REASON}.` : undefined;
	if (action === "check" || action === "start") {
		if (agentDisabled(config.FLEET_CONFIG_STATE, config.FLEET_CONFIG_DISABLED, agent)) {
			throw new Error(`${agent} is disabled in ${config.FLEET_CONFIG_PATH}`);
		}
		if (action === "check") return { config, warning };
	}
	// Validation does not depend on the repository having a board. A failed
	// handoff never reaches the card gate or the Actions for Human reader.
	if (action === "finish") {
		const errors = handoffErrors(input.text ?? "");
		if (errors.length) return { valid: false, errors, reason: reemitReason(errors) };
	}
	let board;
	try {
		board = requireBoard(input.cwd, env);
	} catch (error) {
		if (!(error instanceof NoBoardError)) throw error;
		return { available: false, valid: action === "finish" ? true : undefined, config };
	}
	// Parent and child ids are both supplied by OpenCode, never by a model.
	const parent = `opencode-${input.parentID ?? input.sessionID}`;
	const child = input.sessionID;
	switch (action) {
		case "info":
			return { available: true, directory: board.paths.dir, config };
		case "focus":
			if (input.card) setFocus(input.cwd, input.card, env);
			else clearFocus(input.cwd, env);
			return { card: input.card ?? null };
		case "complete":
			if (!input.card) throw new Error("complete requires a card id");
			return { card: input.card, result: cardGate(board, input.card, child) };
		case "session":
			return {
				available: true,
				directory: board.paths.dir,
				config,
				context: [
					`The board is ${board.paths.dir}. Specs live in specs/ there. Check Next and In Progress before starting; reconcile the board before stopping. Only the lead ticks criteria, on named evidence.`,
					...restartVanishedRuns(board, env, child),
					...releaseCatchUp(board, input.cwd, env, child, "on-base"),
					...returnStranded(board, child),
				].join("\n"),
			};
		case "start": {
			let card = agentCard(parent, child, env);
			if (card === null) {
				card = onSpawnSent(board, input.cwd, parent, child, input.prompt ?? "", env);
				bindAgent(parent, child, card, env);
			}
			return { available: true, directory: board.paths.dir, card, warning: draftSpawnWarning(board, card, agent) };
		}
		case "finish": {
			const apply = () => ({ available: true, valid: true, card: onAgentStop(board, parent, child, agent, input.text ?? "", "", env) });
			if (!input.messageID) return apply();
			const key = createHash("sha256").update(`${parent}\0${child}\0${input.messageID}`).digest("hex");
			const receipt = join(privateStateDir(env), `opencode-finish-${key}.json`);
			return withLock(`${receipt}.lock`, "OpenCode completion", child, () => {
				if (existsSync(receipt)) return JSON.parse(readFileSync(receipt, "utf8"));
				const result = apply();
				writeAtomic(receipt, JSON.stringify(result));
				return result;
			});
		}
		case "push":
			return { context: isGitPush(input.command ?? "") ? releaseCatchUp(board, input.cwd, env, child, pushedNames(input.command ?? "")) : [] };
		default:
			throw new Error(`unknown OpenCode lifecycle action: ${action}`);
	}
}

export async function opencodeCommand(args: string[]): Promise<number> {
	try {
		const input = JSON.parse(await Bun.stdin.text());
		if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("expected a JSON object");
		process.stdout.write(`${JSON.stringify(lifecycle(args[0] ?? "", input))}\n`);
		return 0;
	} catch (error) {
		process.stderr.write(`boards opencode: ${(error as Error).message}\n`);
		return 1;
	}
}

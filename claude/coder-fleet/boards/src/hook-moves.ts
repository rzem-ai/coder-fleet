import { addAction, openActions } from "./actions.ts";
import type { Board } from "./board.ts";
import { cardExists, idPattern, readCard } from "./cards.ts";
import { appendEvent } from "./events.ts";
import { agentCard, bindAgent, boardItemLine, clearFocus, readFocus, setFocus } from "./focus.ts";
import { moveCard, returnFromBlock } from "./moves.ts";
import type { Env } from "./paths.ts";

// What each board hook does, apart from reading its event. The table of which
// event moves a card from which column to which is in the README.

// SessionStart: a new, cleared or resumed session clears its checkout's focus,
// so a focus from an earlier session never binds this one's spawns; a
// compaction is the same session going on and keeps it. Returns a line for the
// session's context when it cleared a card.
export function focusOnSessionStart(cwd: string, source: string | undefined, env: Env = process.env): string | null {
	if (source === "compact") return null;
	const was = clearFocus(cwd, env);
	return was ? `Board focus: ${was} was focused from an earlier session and has been cleared.` : null;
}

// PreToolUse on the Agent tool: a `Board-Item:` line in the spawn prompt
// focuses the spawning checkout on that card, so the spawn binds to it.
// Returns the card it focused, or null.
export function focusFromSpawnPrompt(board: Board, cwd: string, prompt: string, env: Env = process.env): string | null {
	const id = boardItemLine(prompt);
	if (!id || !idPattern(board.config.prefix).test(id) || !cardExists(board, id)) return null;
	setFocus(cwd, id, env);
	return id;
}

// SubagentStart: binds the agent to its checkout's focus (a resume keeps its
// first binding) and starts work on the card. Returns the bound card, if any.
export function onAgentStart(board: Board, cwd: string, sessionId: string, agentId: string, env: Env = process.env): string | null {
	const known = agentCard(sessionId, agentId, env);
	const id = known ?? bindAgent(sessionId, agentId, readFocus(cwd, env), env);
	if (!id || !cardExists(board, id)) return null;
	startWork(board, id, agentId);
	return id;
}

// An agent starting work on its card. A card in Blocked by Human with every
// action ticked goes back to the column it was blocked from first. Then the
// card goes to In Progress from Backlog or Next; from any other column nothing
// moves, and the event log says why.
export function startWork(board: Board, id: string, actor?: string): void {
	let card = readCard(board, id).card;
	if (card.column === "Blocked by Human" && openActions(card).length === 0) {
		returnFromBlock(board, id, "hook", actor);
		card = readCard(board, id).card;
	}
	if (card.column === "Backlog" || card.column === "Next") {
		moveCard(board, { card: id, to: "In Progress", source: "hook", actor });
		return;
	}
	const open = openActions(card).length;
	const reason =
		card.column === "Blocked by Human" && open
			? `it has ${open} Action(s) for Human still unticked`
			: `an agent's start moves a card to In Progress only from Backlog or Next`;
	appendEvent(board.paths, { event: "move-skipped", source: "hook", card: id, column: card.column, to: "In Progress", reason, ...(actor ? { actor } : {}) });
}

// The text of each `- Blocker: ` line under `## Decisions needed`, as the
// handoff skill defines them. A `Propose item:` line is never read.
export function blockerLines(handoff: string): string[] {
	const out: string[] = [];
	let inside = false;
	for (const raw of handoff.replace(/\r/g, "").split("\n")) {
		const line = raw.trimEnd();
		if (line.startsWith("## ")) inside = line === "## Decisions needed";
		else if (inside && line.startsWith("- Blocker: ")) out.push(line.slice("- Blocker: ".length).trim());
	}
	return out.filter(Boolean);
}

// SubagentStop: each Blocker line in the agent's handoff becomes an unticked
// Action for Human on its bound card, which moves the card to Blocked by
// Human. Returns the card it reached, if any.
export function onAgentStop(board: Board, sessionId: string, agentId: string, handoff: string, env: Env = process.env): string | null {
	const id = agentCard(sessionId, agentId, env);
	if (!id || !cardExists(board, id)) return null;
	for (const text of blockerLines(handoff)) addAction(board, id, text, "hook", agentId);
	return id;
}

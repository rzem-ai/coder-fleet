import type { Board } from "./board.ts";
import { cardExists, readCard } from "./cards.ts";
import { appendEvent } from "./events.ts";
import { MoveRefused, moveCard } from "./moves.ts";

// The card gate: a card goes into Done only when every acceptance criterion
// and Definition of Done item on it is ticked, the board's live defaults
// included (untickedItems in src/checklists.ts). moveCard in src/moves.ts
// holds the rule for every source but the human in the web UI; this file
// holds what triggers the gate.

// The agents whose stop runs the card gate: coder and scripter, with or
// without the plugin's prefix (`coder-fleet:coder`).
const GATE_AGENT = /^(?:[A-Za-z0-9_-]+:)?(?:coder|scripter)$/;

export function isGateAgent(agentType: unknown): boolean {
	return typeof agentType === "string" && GATE_AGENT.test(agentType);
}

// The columns the card gate takes a card into Done from. A card anywhere
// else stays: Draft leaves only for Backlog, a Blocked card leaves through
// the human or a passing release, a card in Blocked by Human through its
// Actions for Human, and Released is final.
const GATE_FROM: readonly unknown[] = ["Backlog", "Next", "In Progress"];

// Runs the card gate on a card: moves it into Done when every item is
// ticked. Anything that holds it is a `move-skipped` line in the event trail
// naming why, the unticked items included. Returns the reason it stayed, or
// null when it moved or was in Done already.
export function cardGate(board: Board, id: string, actor?: string): string | null {
	if (!cardExists(board, id)) return `there is no card ${id} on this board`;
	const { card } = readCard(board, id);
	if (card.column === "Done") return null;
	const skip = (reason: string) => {
		appendEvent(board.paths, { event: "move-skipped", source: "hook", card: id, column: card.column, to: "Done", reason, ...(actor ? { actor } : {}) });
		return reason;
	};
	if (!GATE_FROM.includes(card.column)) return skip(`the card gate moves a card into Done only from Backlog, Next or In Progress`);
	try {
		moveCard(board, { card: id, to: "Done", source: "hook", actor });
		return null;
	} catch (e) {
		if (e instanceof MoveRefused) return skip(e.message);
		throw e;
	}
}

// The `[board:<id>]` marker in a task's subject, or null.
export function boardMarker(subject: string): string | null {
	return /\[board:\s*([A-Za-z][A-Za-z0-9]*-[0-9]+(?:\.[0-9]+)*)\s*\]/i.exec(subject)?.[1]?.toUpperCase() ?? null;
}

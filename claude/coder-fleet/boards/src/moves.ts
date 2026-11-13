import type { Board } from "./board.ts";
import { readCard, writeCard } from "./cards.ts";
import { appendEvent, type Gate, type MoveEvent, type Source } from "./events.ts";

export interface Move {
	card: string;
	from: string;
	to: string;
	source: Source;
	actor?: string; // the session or agent, where known
	gate?: Gate; // the gate this move bypassed, if any
}

// Records a column move. The card is written first, carrying its new column
// and the move as `lastEvent`; the log line is appended after. The card file
// is the source of truth, so a crash between the two leaves the card moved
// and the log without that line. Which moves are allowed is the caller's
// business: this records whatever it is given.
export function moveCard(board: Board, move: Move): MoveEvent {
	for (const k of ["from", "to"] as const) {
		if (typeof move[k] !== "string" || !move[k].trim()) throw new Error(`A move needs a ${k} column`);
	}
	const file = readCard(board, move.card);
	const ev: MoveEvent = {
		time: new Date().toISOString(),
		event: "card-moved",
		source: move.source,
		card: move.card,
		from: move.from,
		to: move.to,
		...(move.actor ? { actor: move.actor } : {}),
		...(move.gate ? { gate: move.gate } : {}),
	};
	writeCard(board, { card: { ...file.card, column: move.to, lastEvent: ev }, body: file.body });
	appendEvent(board.paths, ev);
	return ev;
}

import { openActions } from "./actions.ts";
import type { Board } from "./board.ts";
import { type Card, listCards, readCard, updateCard } from "./cards.ts";
import { untickedItems } from "./checklists.ts";
import { COLUMNS, type Column, isColumn } from "./columns.ts";
import { cardHistory, type Gate, type MoveEvent, type Source } from "./events.ts";

export interface Move {
	card: string;
	to: string;
	source: Source;
	actor?: string; // the session or agent, where known
	// The move that adding an Action for Human makes into Blocked by Human.
	// Set only by addAction in src/actions.ts.
	forAction?: true;
}

// A move the column rules turn down. The card is left where it was.
export class MoveRefused extends Error {}

const BLOCKED: readonly Column[] = ["Blocked", "Blocked by Human"];

// The column a card was in when it last went into Blocked or Blocked by
// Human, read from the event trail, or null when the trail has no such move.
export function blockedFrom(board: Board, id: string): Column | null {
	const into = cardHistory(board.paths, id).filter((e) => BLOCKED.includes(e.to as Column) && !BLOCKED.includes(e.from as Column));
	const from = into.at(-1)?.from;
	return isColumn(from) ? from : null;
}

// The column rules. Returns why a move is refused, or null when it may go,
// and the gate a web move bypasses, if any.
function check(board: Board, card: Card, from: Column, to: Column, move: Move): { refused: string | null; gate?: Gate } {
	const refused = (why: string) => ({ refused: `${card.id} stays in ${from}: ${why}` });
	if (to === from) return refused(`it is already there`);
	// Draft leaves only for Backlog, whoever asks, the web UI included.
	if (from === "Draft") return to === "Backlog" ? { refused: null } : refused(`a card leaves Draft only for Backlog`);
	const unticked = to === "Done" ? untickedItems(board, card) : [];
	if (move.source === "web") {
		// The human overrides the gates; the move says which one it bypassed.
		// A card with every item ticked passes the card gate, so it bypasses
		// nothing; nothing the web UI does passes the test gate.
		return { refused: null, gate: unticked.length ? "card" : to === "Released" ? "test" : undefined };
	}
	if (from === "Released") return refused(`Released is the final column; only the human moves a card out of it, in the web UI`);
	if (to === "Done" && unticked.length) return refused(`the card gate holds it, with ${unticked.length} item(s) unticked: ${unticked.join("; ")}`);
	if (to === "Released" && from !== "Done") return refused(`the test gate moves a card into Released only from Done`);
	if (to === "Next") {
		const back = move.source === "hook" && BLOCKED.includes(from) && blockedFrom(board, card.id) === "Next";
		return back ? { refused: null } : refused(`only the human fills Next, in the web UI; a hook may only return a card there that was blocked from it`);
	}
	if (to === "Blocked by Human" && move.forAction) return { refused: null };
	if (move.source !== "hook") {
		return refused(`the MCP tools and the CLI move a card only from Draft to Backlog; every other move is made by the board's hooks, its gates or the human in the web UI`);
	}
	if (from === "Blocked by Human" && openActions(card).length) {
		return refused(`it has ${openActions(card).length} Action(s) for Human still unticked`);
	}
	return { refused: null };
}

// Every column move goes through here. Under the card's lock it reads the
// card's column from the card itself, checks the move against the column
// rules, and writes the card with its new column and the move as
// `lastEvent`, then appends the same line to the event trail. A refused move
// throws MoveRefused and writes nothing. The card file is the source of
// truth, so a crash between the card write and the append leaves the card
// moved and the log without that line.
export function moveCard(board: Board, move: Move): MoveEvent {
	if (!isColumn(move.to)) throw new MoveRefused(`"${move.to}" is not a column on this board`);
	const to = move.to;
	let ev: MoveEvent | undefined;
	updateCard(
		board,
		move.card,
		(file) => {
			const from = file.card.column;
			if (!isColumn(from)) throw new MoveRefused(`${move.card} is in no column the board knows ("${String(from)}"), so it cannot be moved`);
			const { refused, gate } = check(board, file.card, from, to, move);
			if (refused) throw new MoveRefused(refused);
			ev = {
				time: new Date().toISOString(),
				event: "card-moved",
				source: move.source,
				card: move.card,
				from,
				to,
				...(move.actor ? { actor: move.actor } : {}),
				...(gate ? { gate } : {}),
			};
			// A card's place in Next is the human's to give, so any move drops it
			// and a card coming into Next joins the bottom.
			const { rank: _, ...card } = file.card;
			return { card: { ...card, column: to, lastEvent: ev } as Card, body: file.body };
		},
		{ actor: move.actor, columnMove: true, event: () => ev as MoveEvent },
	);
	return ev as MoveEvent;
}

export interface MoveTarget {
	column: Column;
	refused?: string; // why the column rules turn this move down
	gate?: Gate; // the gate a web move there would bypass
}

// What the column rules say of moving a card to each column, from `source`,
// so the web UI can show which lanes take a dragged card. It asks the same
// check moveCard does, and moves nothing.
export function moveTargets(board: Board, id: string, source: Source): MoveTarget[] {
	const { card } = readCard(board, id);
	const from = card.column;
	return COLUMNS.map((column) => {
		if (!isColumn(from)) return { column, refused: `${id} is in no column the board knows` };
		const { refused, gate } = check(board, card, from, column, { card: id, to: column, source });
		return { column, ...(refused ? { refused } : {}), ...(gate ? { gate } : {}) };
	});
}

// Takes a card out of Blocked or Blocked by Human, back to the column it was
// blocked from, read from the event trail. With no such move in the trail it
// goes to Backlog.
export function returnFromBlock(board: Board, id: string, source: Source, actor?: string): MoveEvent {
	return moveCard(board, { card: id, to: blockedFrom(board, id) ?? "Backlog", source, actor });
}

// Next is the human's ordered queue. Each card the human has ordered carries
// `rank`, the lowest at the top; a card without one, newly come into Next,
// sorts after those with one, by id.
function rankOf(card: Card): number {
	return typeof card.rank === "number" ? card.rank : Number.POSITIVE_INFINITY;
}

export function nextQueue(board: Board): Card[] {
	return listCards(board)
		.map((f) => f.card)
		.filter((c) => c.column === "Next")
		.sort((a, b) => rankOf(a) - rankOf(b) || 0);
}

// The human's order for Next, from the web UI: `ids` top first. Every card in
// Next must be named once, and nothing else. Only the web UI orders Next.
export function orderNext(board: Board, ids: string[], source: Source, actor?: string): void {
	if (source !== "web") throw new MoveRefused("Only the human orders Next, in the web UI");
	const inNext = nextQueue(board).map((c) => c.id);
	if (ids.length !== inNext.length || new Set(ids).size !== ids.length || ids.some((id) => !inNext.includes(id))) {
		throw new MoveRefused(`An order for Next names every card in it once: ${inNext.join(", ") || "it is empty"}`);
	}
	ids.forEach((id, rank) => {
		updateCard(board, id, (f) => ({ ...f, card: { ...f.card, rank } }), { actor });
	});
}

// The card an agent asking for work is given: the top of Next, else the
// first card in Backlog, else none. A card with an unticked Action for Human
// is waiting on the human and is never given.
export function takeNext(board: Board): Card | null {
	const free = (c: Card) => openActions(c).length === 0;
	const backlog = listCards(board).map((f) => f.card).filter((c) => c.column === "Backlog");
	return nextQueue(board).find(free) ?? backlog.find(free) ?? null;
}

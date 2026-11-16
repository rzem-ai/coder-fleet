import type { Board } from "./board.ts";
import { type Card, readCard, updateCard } from "./cards.ts";
import { appendEvent, type Source } from "./events.ts";
import { blockedFrom, MoveRefused, moveCard } from "./moves.ts";

// Actions for Human: a list on the card, `actions`, each with its text and
// whether the human has ticked it, numbered from 0. There is no remove: an
// action is cleared by ticking it, so nothing takes a card out of Blocked by
// Human without the human's word, and the last tick takes it out.
export interface Action {
	text: string;
	ticked: boolean;
}

export function actionsOf(card: Card): Action[] {
	return Array.isArray(card.actions) ? (card.actions as Action[]) : [];
}

export function openActions(card: Card): Action[] {
	return actionsOf(card).filter((a) => !a.ticked);
}

// Columns an added action never moves a card out of: Draft leaves only for
// Backlog, and only the human moves a card out of Released.
const STAYS: readonly unknown[] = ["Blocked by Human", "Draft", "Released"];

// Adds unticked actions to the card in one write, then moves the card to
// Blocked by Human once, unless it is there already or in Draft or Released,
// where it keeps its actions and stays.
export function addActions(board: Board, id: string, texts: string[], source: Source, actor?: string): Card {
	const added = texts.map((t) => t.trim());
	if (!added.length || added.some((t) => !t)) throw new Error("An Action for Human needs its text");
	const { card } = updateCard(board, id, (f) => ({ ...f, card: { ...f.card, actions: [...actionsOf(f.card), ...added.map((text) => ({ text, ticked: false }))] } }), { actor });
	if (!STAYS.includes(card.column)) moveCard(board, { card: id, to: "Blocked by Human", source, actor, forAction: true });
	return card;
}

export function addAction(board: Board, id: string, text: string, source: Source, actor?: string): Card {
	return addActions(board, id, [text], source, actor);
}

// Ticks action n (from 0). The tick that leaves no unticked action on a card
// in Blocked by Human returns the card, in the same call, to the column it was
// blocked from, or Backlog when the trail has none, as `source`. A tick that
// leaves an action open, a tick of an action already ticked, and a tick on a
// card in any other column move nothing. A refused return keeps the tick and
// leaves a move-skipped line in the event log saying why. Returns the card as
// it stands after the tick and any move.
export function tickAction(board: Board, id: string, n: number, source: Source, actor?: string): Card {
	let last = false;
	const { card } = updateCard(
		board,
		id,
		(f) => {
			const list = actionsOf(f.card);
			if (!Number.isInteger(n) || n < 0 || n >= list.length) throw new Error(`${id} has no Action for Human ${n}; it has ${list.length}, numbered from 0`);
			const actions = list.map((a, i) => (i === n ? { ...a, ticked: true } : a));
			last = !list[n]?.ticked && f.card.column === "Blocked by Human" && actions.every((a) => a.ticked);
			return { ...f, card: { ...f.card, actions } };
		},
		{ actor },
	);
	if (!last) return card;
	const to = blockedFrom(board, id) ?? "Backlog";
	try {
		moveCard(board, { card: id, to, source, actor, forLastTick: true });
	} catch (e) {
		if (!(e instanceof MoveRefused)) throw e;
		appendEvent(board.paths, { event: "move-skipped", source, card: id, column: "Blocked by Human", to, reason: e.message, ...(actor ? { actor } : {}) });
	}
	return readCard(board, id).card;
}

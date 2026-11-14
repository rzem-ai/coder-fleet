import type { Board } from "./board.ts";
import { type Card, updateCard } from "./cards.ts";
import type { Source } from "./events.ts";
import { moveCard } from "./moves.ts";

// Actions for Human: a list on the card, `actions`, each with its text and
// whether the human has ticked it, numbered from 0. There is no remove: an
// action is cleared by ticking it, so nothing takes a card out of Blocked by
// Human without the human's word.
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

// Ticks action n (from 0). Ticking never moves a column: the card leaves
// Blocked by Human at the next hook that finds every action ticked.
export function tickAction(board: Board, id: string, n: number, actor?: string): Card {
	return updateCard(
		board,
		id,
		(f) => {
			const list = actionsOf(f.card);
			if (!Number.isInteger(n) || n < 0 || n >= list.length) throw new Error(`${id} has no Action for Human ${n}; it has ${list.length}, numbered from 0`);
			return { ...f, card: { ...f.card, actions: list.map((a, i) => (i === n ? { ...a, ticked: true } : a)) } };
		},
		{ actor },
	).card;
}

import type { Board } from "./board.ts";
import { type Card, updateCard } from "./cards.ts";
import type { Source } from "./events.ts";
import { moveCard } from "./moves.ts";

// Actions for Human, as far as group C needs them: a list on the card,
// `actions`, each with its text and whether the human has ticked it,
// numbered from 0. Group E builds the rest of the field on this.
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

// Adds an unticked action to the card, then moves the card to Blocked by
// Human unless it is there already. Draft still leaves only for Backlog, so a
// card in Draft keeps its action and stays in Draft.
export function addAction(board: Board, id: string, text: string, source: Source, actor?: string): Card {
	const t = text.trim();
	if (!t) throw new Error("An Action for Human needs its text");
	const { card } = updateCard(board, id, (f) => ({ ...f, card: { ...f.card, actions: [...actionsOf(f.card), { text: t, ticked: false }] } }), { actor });
	if (card.column !== "Blocked by Human" && card.column !== "Draft") moveCard(board, { card: id, to: "Blocked by Human", source, actor, forAction: true });
	return card;
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

import type { Board } from "./board.ts";
import { type Card, cardExists, listCards, updateCard } from "./cards.ts";

// The cards a card depends on: `dependencies` in its frontmatter, a list of
// card ids on the same board. A sub-issue is a different thing: a dotted id
// under its parent, filed with `createCard`'s `parent`.
export function dependenciesOf(card: Card): string[] {
	return Array.isArray(card.dependencies) ? card.dependencies.filter((d): d is string => typeof d === "string") : [];
}

export function addDependency(board: Board, id: string, on: string, actor?: string): Card {
	if (on === id) throw new Error(`${id} cannot depend on itself`);
	if (!cardExists(board, on)) throw new Error(`No card ${on} on this board to depend on`);
	return updateCard(
		board,
		id,
		(f) => {
			const deps = dependenciesOf(f.card);
			return deps.includes(on) ? f : { ...f, card: { ...f.card, dependencies: [...deps, on] } };
		},
		{ actor },
	).card;
}

export function removeDependency(board: Board, id: string, on: string, actor?: string): Card {
	return updateCard(
		board,
		id,
		(f) => {
			const deps = dependenciesOf(f.card);
			if (!deps.includes(on)) throw new Error(`${id} does not depend on ${on}`);
			return { ...f, card: { ...f.card, dependencies: deps.filter((d) => d !== on) } };
		},
		{ actor },
	).card;
}

const FINISHED: readonly unknown[] = ["Done", "Released"];

// Exactly the cards whose dependencies are all in Done or Released, a card
// with none included. A dependency on a card that no longer exists is never
// finished.
export function dependenciesDone(board: Board): Card[] {
	const cards = listCards(board).map((f) => f.card);
	const column = new Map(cards.map((c) => [c.id, c.column]));
	return cards.filter((c) => dependenciesOf(c).every((d) => FINISHED.includes(column.get(d))));
}

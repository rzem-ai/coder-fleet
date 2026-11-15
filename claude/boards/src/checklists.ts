import type { Board } from "./board.ts";
import { type Card, updateCard } from "./cards.ts";
import { readConfig } from "./config.ts";

// A card's two checklists: its acceptance criteria and its Definition of
// Done. Each shows the card's own items first, as the card file lists them
// in `criteria` or `dod`, then the board's project-wide defaults for that
// list, read live from config.yml. One number counts the whole list from 0,
// so a card's own item n is item n of its list in the card file.
//
// A default item is not copied onto the card. Its tick is kept on the card
// by the item's text, in `defaultsTicked`, so a default whose text changes,
// or a new one, shows unticked. Ticking never moves a column, so nothing a
// defaults change does moves a card either.
export const LISTS = ["criteria", "dod"] as const;
export type ListName = (typeof LISTS)[number];

export function isListName(name: unknown): name is ListName {
	return typeof name === "string" && (LISTS as readonly string[]).includes(name);
}

export const LIST_TITLES: Record<ListName, string> = { criteria: "Acceptance criteria", dod: "Definition of Done" };

export interface Item {
	text: string;
	ticked: boolean;
}

export interface ShownItem extends Item {
	n: number;
	fromDefaults: boolean;
}

function strings(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

// The board's defaults for a list, read from config.yml now, not from the
// config the board was opened with, so an edit shows at once.
export function defaultsFor(board: Board, list: ListName): string[] {
	const d = readConfig(board.paths).defaults as Record<string, unknown> | undefined;
	return strings(d?.[list]);
}

function ownItems(card: Card, list: ListName): Item[] {
	return Array.isArray(card[list]) ? (card[list] as Item[]) : [];
}

function tickedDefaults(card: Card, list: ListName): string[] {
	return strings((card.defaultsTicked as Record<string, unknown> | undefined)?.[list]);
}

// What a card's list shows, numbered from 0: its own items, then the defaults.
export function checklist(board: Board, card: Card, list: ListName): ShownItem[] {
	const own = ownItems(card, list).map((i, n) => ({ n, text: i.text, ticked: i.ticked === true, fromDefaults: false }));
	const ticked = tickedDefaults(card, list);
	const defaults = defaultsFor(board, list).map((text, i) => ({ n: own.length + i, text, ticked: ticked.includes(text), fromDefaults: true }));
	return [...own, ...defaults];
}

// Each unticked item on both lists, the board's defaults included, named by
// its list, its number from 0 and its text. The card gate reads this.
export function untickedItems(board: Board, card: Card): string[] {
	return LISTS.flatMap((list) => checklist(board, card, list).filter((i) => !i.ticked).map((i) => `${LIST_TITLES[list]} ${i.n} "${i.text}"`));
}

function noItem(id: string, list: ListName, n: number, count: number): Error {
	return new Error(`${id} has no ${LIST_TITLES[list]} item ${n}; it has ${count}, numbered from 0`);
}

// Adds an unticked item to the end of the card's own items.
export function addItem(board: Board, id: string, list: ListName, text: string, actor?: string): Card {
	const t = text.trim();
	if (!t) throw new Error(`A ${LIST_TITLES[list]} item needs its text`);
	return updateCard(board, id, (f) => ({ ...f, card: { ...f.card, [list]: [...ownItems(f.card, list), { text: t, ticked: false }] } }), { actor }).card;
}

// Ticks item n of the list as the card shows it. A default item's tick is
// kept by its text. Ticking never moves a column.
export function tickItem(board: Board, id: string, list: ListName, n: number, actor?: string): Card {
	return updateCard(
		board,
		id,
		(f) => {
			const shown = checklist(board, f.card, list);
			const item = Number.isInteger(n) ? shown[n] : undefined;
			if (!item) throw noItem(id, list, n, shown.length);
			if (!item.fromDefaults) {
				return { ...f, card: { ...f.card, [list]: ownItems(f.card, list).map((i, k) => (k === n ? { ...i, ticked: true } : i)) } };
			}
			const ticked = tickedDefaults(f.card, list);
			if (ticked.includes(item.text)) return f;
			const all = (f.card.defaultsTicked as Record<string, unknown> | undefined) ?? {};
			return { ...f, card: { ...f.card, defaultsTicked: { ...all, [list]: [...ticked, item.text] } } };
		},
		{ actor },
	).card;
}

// Unticks item n of the list as the card shows it. A default item's tick is
// kept by its text, so unticking one drops its text from defaultsTicked.
// Unticking never moves a column.
export function untickItem(board: Board, id: string, list: ListName, n: number, actor?: string): Card {
	return updateCard(
		board,
		id,
		(f) => {
			const shown = checklist(board, f.card, list);
			const item = Number.isInteger(n) ? shown[n] : undefined;
			if (!item) throw noItem(id, list, n, shown.length);
			if (!item.fromDefaults) {
				return { ...f, card: { ...f.card, [list]: ownItems(f.card, list).map((i, k) => (k === n ? { ...i, ticked: false } : i)) } };
			}
			const ticked = tickedDefaults(f.card, list);
			if (!ticked.includes(item.text)) return f;
			const all = (f.card.defaultsTicked as Record<string, unknown> | undefined) ?? {};
			return { ...f, card: { ...f.card, defaultsTicked: { ...all, [list]: ticked.filter((t) => t !== item.text) } } };
		},
		{ actor },
	).card;
}

// Changes the text of the card's own item n, keeping its tick. A default
// item belongs to the board, so its text changes in config.yml, not here.
export function editItem(board: Board, id: string, list: ListName, n: number, text: string, actor?: string): Card {
	const t = text.trim();
	if (!t) throw new Error(`A ${LIST_TITLES[list]} item needs its text`);
	return updateCard(
		board,
		id,
		(f) => {
			const shown = checklist(board, f.card, list);
			const item = Number.isInteger(n) ? shown[n] : undefined;
			if (!item) throw noItem(id, list, n, shown.length);
			if (item.fromDefaults) throw new Error(`${LIST_TITLES[list]} item ${n} on ${id} is one of the board's defaults; change it in ${board.paths.config}`);
			return { ...f, card: { ...f.card, [list]: ownItems(f.card, list).map((i, k) => (k === n ? { ...i, text: t } : i)) } };
		},
		{ actor },
	).card;
}

// Removes the card's own item n. A default item belongs to the board, so it
// is changed in config.yml, not removed from one card.
export function removeItem(board: Board, id: string, list: ListName, n: number, actor?: string): Card {
	return updateCard(
		board,
		id,
		(f) => {
			const shown = checklist(board, f.card, list);
			const item = Number.isInteger(n) ? shown[n] : undefined;
			if (!item) throw noItem(id, list, n, shown.length);
			if (item.fromDefaults) throw new Error(`${LIST_TITLES[list]} item ${n} on ${id} is one of the board's defaults; change it in ${board.paths.config}`);
			return { ...f, card: { ...f.card, [list]: ownItems(f.card, list).filter((_, k) => k !== n) } };
		},
		{ actor },
	).card;
}

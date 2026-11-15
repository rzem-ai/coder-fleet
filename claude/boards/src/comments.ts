import type { Board } from "./board.ts";
import { type Card, updateCard } from "./cards.ts";

// A card's comments: a list on the card, `comments`, oldest first, each with
// its time, who wrote it and its text. The test gate writes one when a
// release's run fails; the MCP tools, the CLI and the web UI add their own
// later.
export interface Comment {
	time: string;
	by: string;
	text: string;
}

export function commentsOf(card: Card): Comment[] {
	return Array.isArray(card.comments) ? (card.comments as Comment[]) : [];
}

export function addComment(board: Board, id: string, text: string, by: string, actor?: string): Card {
	if (!text.trim()) throw new Error("A comment needs its text");
	return updateCard(board, id, (f) => ({ ...f, card: { ...f.card, comments: [...commentsOf(f.card), { time: new Date().toISOString(), by, text }] } }), { actor }).card;
}

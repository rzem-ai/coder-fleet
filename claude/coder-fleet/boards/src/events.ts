import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { BoardPaths } from "./paths.ts";

// The event log is one JSON object per line in events.log, appended and never
// rewritten. This file is the only writer and reader of it, so the trail's
// own format can replace these two functions without touching their callers.
export type Source = "hook" | "mcp" | "cli" | "web";

export interface BoardEvent {
	event: string; // what happened: board-created, board-rekeyed, card-deleted
	source: Source;
	card?: string;
	actor?: string; // the session or agent, where known
	[detail: string]: unknown;
}

export type LoggedEvent = BoardEvent & { time: string };

export function appendEvent(paths: BoardPaths, ev: BoardEvent): void {
	appendFileSync(paths.events, `${JSON.stringify({ time: new Date().toISOString(), ...ev })}\n`);
}

export function readEvents(paths: BoardPaths): LoggedEvent[] {
	if (!existsSync(paths.events)) return [];
	return readFileSync(paths.events, "utf8")
		.split("\n")
		.filter((l) => l.trim())
		.map((l) => JSON.parse(l) as LoggedEvent);
}

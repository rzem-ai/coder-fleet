import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { BoardPaths } from "./paths.ts";

// The event log is one JSON object per line in events.log. Lines are only ever
// appended, never removed or rewritten, and the log is kept forever: there is
// no rotation. This file is the only writer and reader of it.
//
// Every line has `time` (ISO 8601), `event` and `source`, then what the event
// needs. A column move is
//   {"time":"...","event":"card-moved","source":"hook","card":"XY-3",
//    "from":"Backlog","to":"In Progress","actor":"session-1","gate":"test"}
// where `actor` (the session or agent) appears only when known and `gate`
// (the gate the move bypassed, card or test) only when one was bypassed.
export type Source = "hook" | "mcp" | "cli" | "web";
export type Gate = "card" | "test";

export interface BoardEvent {
	event: string; // what happened: board-created, card-deleted, card-moved
	source: Source;
	time?: string; // set by appendEvent when absent
	card?: string;
	actor?: string; // the session or agent, where known
	[detail: string]: unknown;
}

export type LoggedEvent = BoardEvent & { time: string };

export interface MoveEvent extends LoggedEvent {
	event: "card-moved";
	card: string;
	from: string;
	to: string;
	gate?: Gate;
}

// Appends one line in a single append-mode write and returns what it wrote.
export function appendEvent(paths: BoardPaths, ev: BoardEvent): LoggedEvent {
	const { time, ...rest } = ev;
	const logged: LoggedEvent = { time: time ?? new Date().toISOString(), ...rest };
	appendFileSync(paths.events, `${JSON.stringify(logged)}\n`);
	return logged;
}

export function readEvents(paths: BoardPaths): LoggedEvent[] {
	if (!existsSync(paths.events)) return [];
	return readFileSync(paths.events, "utf8")
		.split("\n")
		.filter((l) => l.trim())
		.map((l) => JSON.parse(l) as LoggedEvent);
}

// A card's move history, oldest first: the log's card-moved lines for it, in
// the order they were appended.
export function cardHistory(paths: BoardPaths, id: string): MoveEvent[] {
	return readEvents(paths).filter((e): e is MoveEvent => e.event === "card-moved" && e.card === id);
}

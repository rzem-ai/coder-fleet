import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Board } from "./board.ts";
import { appendEvent, type Source } from "./events.ts";

// A card is one markdown file, cards/<ID>.md: YAML frontmatter between two
// --- lines, then the markdown body. The frontmatter always carries id and
// title; later fields sit beside them and are kept by every write.
export interface Card {
	id: string;
	title: string;
	parent?: string;
	created: string;
	updated: string;
	[field: string]: unknown;
}

export interface CardFile {
	card: Card;
	body: string;
}

export function parseCard(text: string, where = "card"): CardFile {
	const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text);
	if (!m) throw new Error(`${where} has no YAML frontmatter`);
	const card = Bun.YAML.parse(m[1] ?? "") as Card | null;
	if (!card || typeof card.id !== "string" || typeof card.title !== "string") {
		throw new Error(`${where}'s frontmatter lacks an id or a title`);
	}
	return { card, body: m[2] ?? "" };
}

export function serialiseCard({ card, body }: CardFile): string {
	const fm = Bun.YAML.stringify(card, null, 2).trimEnd();
	const tail = body.length && !body.endsWith("\n") ? `${body}\n` : body;
	return `---\n${fm}\n---\n${tail}`;
}

// PREFIX-n, then any number of .n for sub-issues: XY-12, XY-12.1, XY-12.1.3.
export function idPattern(prefix: string): RegExp {
	return new RegExp(`^${prefix}-([1-9][0-9]*)((?:\\.[1-9][0-9]*)*)$`);
}

function checkId(board: Board, id: string): string {
	if (!idPattern(board.config.prefix).test(id)) {
		throw new Error(`"${id}" is not a card id on this board: ids look like ${board.config.prefix}-12 or ${board.config.prefix}-12.1`);
	}
	return id;
}

export function cardPath(board: Board, id: string): string {
	return join(board.paths.cards, `${checkId(board, id)}.md`);
}

export function cardExists(board: Board, id: string): boolean {
	return existsSync(cardPath(board, id));
}

export function readCard(board: Board, id: string): CardFile {
	const p = cardPath(board, id);
	if (!existsSync(p)) throw new Error(`No card ${id} on this board`);
	return parseCard(readFileSync(p, "utf8"), id);
}

function cardIds(board: Board): string[] {
	const re = idPattern(board.config.prefix);
	return readdirSync(board.paths.cards)
		.filter((f) => f.endsWith(".md"))
		.map((f) => f.slice(0, -3))
		.filter((id) => re.test(id));
}

function compareIds(a: string, b: string): number {
	const na = a.slice(a.indexOf("-") + 1).split(".").map(Number);
	const nb = b.slice(b.indexOf("-") + 1).split(".").map(Number);
	for (let i = 0; i < Math.max(na.length, nb.length); i++) {
		const d = (na[i] ?? -1) - (nb[i] ?? -1);
		if (d) return d;
	}
	return 0;
}

// Every card that parses, in id order. A card file that does not parse is
// skipped and named through `warn`, so one broken file never hides the rest.
export function listCards(board: Board, warn: (message: string) => void = (m) => console.warn(m)): CardFile[] {
	const out: CardFile[] = [];
	for (const id of cardIds(board).sort(compareIds)) {
		try {
			out.push(readCard(board, id));
		} catch (e) {
			warn(`Skipped ${id}: ${(e as Error).message}`);
		}
	}
	return out;
}

interface Ids {
	top: number; // the highest top-level number ever handed out
	sub: Record<string, number>; // per parent id, the highest sub-issue number ever handed out
}

function readIds(board: Board): Ids {
	if (!existsSync(board.paths.ids)) return { top: 0, sub: {} };
	const raw = JSON.parse(readFileSync(board.paths.ids, "utf8")) as Partial<Ids>;
	return { top: raw.top ?? 0, sub: raw.sub ?? {} };
}

// Hands out the next id: the next top-level number, or the next sub-issue
// number under `parent`. ids.json keeps the highest number ever handed out, so
// a deleted card's number is never handed out again; a card file present with
// a higher number (one written by hand) is also stepped over. This is a
// read-modify-write of ids.json and must run under the board-wide numbering
// lock once there is one: wrap this whole function, nothing narrower.
export function allocateId(board: Board, parent?: string): string {
	const ids = readIds(board);
	const present = cardIds(board);
	const { prefix } = board.config;
	let id: string;
	if (parent) {
		checkId(board, parent);
		if (!cardExists(board, parent)) throw new Error(`No card ${parent} on this board to file a sub-issue under`);
		const child = new RegExp(`^${parent.replace(/\./g, "\\.")}\\.([1-9][0-9]*)$`);
		const seen = present.map((p) => Number(child.exec(p)?.[1] ?? 0));
		const n = Math.max(ids.sub[parent] ?? 0, ...seen) + 1;
		ids.sub[parent] = n;
		id = `${parent}.${n}`;
	} else {
		const top = idPattern(prefix);
		const seen = present.map((p) => {
			const m = top.exec(p);
			return m && !m[2] ? Number(m[1]) : 0;
		});
		const n = Math.max(ids.top, ...seen) + 1;
		ids.top = n;
		id = `${prefix}-${n}`;
	}
	writeFileSync(board.paths.ids, `${JSON.stringify(ids)}\n`);
	return id;
}

export interface NewCard {
	title: string;
	parent?: string;
	body?: string;
	fields?: Record<string, unknown>;
}

export function createCard(board: Board, spec: NewCard): CardFile {
	const title = spec.title.trim();
	if (!title) throw new Error("A card needs a title");
	const id = allocateId(board, spec.parent);
	const now = new Date().toISOString();
	// id and title lead the frontmatter, and no extra field can replace them.
	const card: Card = Object.assign({ id, title }, spec.fields, { id, title }, spec.parent ? { parent: spec.parent } : {}, {
		created: now,
		updated: now,
	});
	const file: CardFile = { card, body: spec.body ?? "" };
	// wx: a fresh id never lands on an existing file.
	writeFileSync(cardPath(board, id), serialiseCard(file), { flag: "wx" });
	return file;
}

// Rewrites a card in place. The atomic write and the per-card lock go here.
export function writeCard(board: Board, file: CardFile): void {
	const p = cardPath(board, file.card.id);
	if (!existsSync(p)) throw new Error(`No card ${file.card.id} on this board`);
	const card = { ...file.card, updated: new Date().toISOString() };
	writeFileSync(p, serialiseCard({ card, body: file.body }));
}

// Deletes a card's file and logs the deletion. Any interface may call this;
// `source` says which. The card's sub-issues are left as they are. A card
// whose file does not parse can still be deleted; its log line then carries
// the id alone, with no title.
export function deleteCard(board: Board, id: string, source: Source, actor?: string): void {
	const p = cardPath(board, id);
	if (!existsSync(p)) throw new Error(`No card ${id} on this board`);
	let title: string | undefined;
	try {
		title = parseCard(readFileSync(p, "utf8"), id).card.title;
	} catch {
		title = undefined;
	}
	unlinkSync(p);
	appendEvent(board.paths, {
		event: "card-deleted",
		source,
		card: id,
		...(title !== undefined ? { title } : {}),
		...(actor ? { actor } : {}),
	});
}

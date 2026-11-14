import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { actionsOf, addAction, openActions, tickAction } from "./actions.ts";
import { type Board, requireBoard } from "./board.ts";
import { type Card, createCard, deleteCard, editCard, listCards, readCard } from "./cards.ts";
import { addItem, checklist, editItem, isListName, removeItem, tickItem, untickItem } from "./checklists.ts";
import { COLUMNS } from "./columns.ts";
import { addComment, commentsOf } from "./comments.ts";
import { dependenciesDone, dependenciesOf } from "./dependencies.ts";
import { cardHistory } from "./events.ts";
import { alive, withLock, writeAtomic } from "./lock.ts";
import { MoveRefused, moveCard, moveTargets, nextQueue, orderNext } from "./moves.ts";
import { type Env, privateStateDir } from "./paths.ts";
import { logPath, testRuns } from "./releases.ts";

// The board's web UI: a small JSON API over the board's own functions, and
// the built Vue bundle under web/dist. It listens on the loopback address
// only and trusts the local machine (CF-207 criteria 20 and 58). Every move
// it makes has source `web`, which is what lets the human fill Next and
// override the gates; the MCP tools and the CLI are refused those moves.

export const LOOPBACK = "127.0.0.1";
export const DIST = join(import.meta.dir, "..", "web", "dist");
const SERVER = join(import.meta.dir, "web-server.ts");

// What the board view needs of each card.
function summary(board: Board, card: Card, ready: Set<string>) {
	const criteria = checklist(board, card, "criteria");
	return {
		id: card.id,
		title: card.title,
		column: card.column,
		parent: card.parent ?? null,
		criteria: { ticked: criteria.filter((i) => i.ticked).length, total: criteria.length },
		actions: openActions(card).map((a) => a.text),
		ready: ready.has(card.id),
	};
}

function boardView(board: Board) {
	const ready = new Set(dependenciesDone(board).map((c) => c.id));
	const next = nextQueue(board);
	const rest = listCards(board)
		.map((f) => f.card)
		.filter((c) => c.column !== "Next");
	return {
		// The repo's name, the last part of the board's key.
		name: board.config.key.replace(/\/\.git$/, "").split("/").at(-1) ?? board.config.prefix,
		prefix: board.config.prefix,
		dir: board.paths.dir,
		columns: COLUMNS,
		cards: [...next, ...rest].map((c) => summary(board, c, ready)),
	};
}

function cardView(board: Board, id: string) {
	const { card, body } = readCard(board, id);
	return {
		id: card.id,
		title: card.title,
		column: card.column,
		parent: card.parent ?? null,
		dependencies: dependenciesOf(card),
		body,
		created: card.created,
		updated: card.updated,
		criteria: checklist(board, card, "criteria"),
		dod: checklist(board, card, "dod"),
		actions: actionsOf(card).map((a, n) => ({ n, text: a.text, ticked: a.ticked === true })),
		comments: commentsOf(card),
		history: cardHistory(board.paths, id),
		runs: testRuns(board)
			.filter((r) => r.cards.includes(id))
			.map(({ release, tag, commit, state }) => ({ release, tag, commit, state })),
		targets: moveTargets(board, id, "web"),
	};
}

class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

function json(data: unknown, status = 200): Response {
	return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function str(v: unknown, what: string): string {
	if (typeof v !== "string") throw new HttpError(400, `${what} must be text`);
	return v;
}

function int(v: unknown, what: string): number {
	if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new HttpError(400, `${what} must be a number from 0`);
	return v;
}

// One write through the API, by its operation name, on card `id`.
function operate(board: Board, id: string, op: string, b: Record<string, unknown>): void {
	switch (op) {
		case "edit":
			editCard(board, id, {
				...(b.title !== undefined ? { title: str(b.title, "title") } : {}),
				...(b.body !== undefined ? { body: str(b.body, "body") } : {}),
			});
			return;
		case "move": {
			// Checked before the move, so a bad index moves nothing.
			const to = str(b.to, "to");
			const index = b.index !== undefined ? int(b.index, "index") : undefined;
			moveCard(board, { card: id, to, source: "web" });
			// Dropped at a place in Next: the human's order for it.
			if (to === "Next" && index !== undefined) placeInNext(board, id, index);
			return;
		}
		case "order":
			placeInNext(board, id, int(b.index, "index"));
			return;
		case "add": {
			const list = str(b.list, "list");
			const text = str(b.text, "text");
			if (list === "actions") addAction(board, id, text, "web");
			else if (isListName(list)) addItem(board, id, list, text);
			else throw new HttpError(400, `"${list}" is not a list: use criteria, dod or actions`);
			return;
		}
		case "tick": {
			const list = str(b.list, "list");
			const n = int(b.n, "n");
			if (list === "actions") tickAction(board, id, n);
			else if (isListName(list)) tickItem(board, id, list, n);
			else throw new HttpError(400, `"${list}" is not a list: use criteria, dod or actions`);
			return;
		}
		case "untick":
		case "edititem": {
			const list = str(b.list, "list");
			if (!isListName(list)) throw new HttpError(400, `"${list}" is not a list whose items are ${op === "untick" ? "unticked" : "edited"}: use criteria or dod`);
			if (op === "untick") untickItem(board, id, list, int(b.n, "n"));
			else editItem(board, id, list, int(b.n, "n"), str(b.text, "text"));
			return;
		}
		case "remove": {
			const list = str(b.list, "list");
			if (!isListName(list)) throw new HttpError(400, `"${list}" is not a list that items are removed from: use criteria or dod`);
			removeItem(board, id, list, int(b.n, "n"));
			return;
		}
		case "comment":
			addComment(board, id, str(b.text, "text"), "human");
			return;
		default:
			throw new HttpError(404, `No operation ${op}`);
	}
}

// Puts a card already in Next at `index` in the human's order, top first.
function placeInNext(board: Board, id: string, index: number): void {
	const ids = nextQueue(board)
		.map((c) => c.id)
		.filter((c) => c !== id);
	ids.splice(Math.min(index, ids.length), 0, id);
	orderNext(board, ids, "web");
}

function staticFile(dist: string, pathname: string): Response {
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return new Response("Bad path\n", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
	}
	const index = join(dist, "index.html");
	if (!existsSync(index)) {
		return new Response("The board's web UI is not built. Run `bun install --frozen-lockfile && bun run build` in the boards package's web directory.\n", {
			status: 503,
			headers: { "content-type": "text/plain; charset=utf-8" },
		});
	}
	const file = normalize(join(dist, decoded));
	const inside = file.startsWith(dist + sep);
	const path = inside && existsSync(file) && statSync(file).isFile() ? file : index;
	return new Response(Bun.file(path), { headers: path === index ? { "cache-control": "no-store" } : {} });
}

// The request handler. Requests must name the loopback address the server
// listens on as their Host, so a page that rebinds a domain name to it is
// refused, and a write must be JSON from the UI's own origin, so another
// site's page cannot post a form to it.
export function handler(board: Board, port: () => number, dist = DIST) {
	return async (req: Request): Promise<Response> => {
		const url = new URL(req.url);
		const origin = `http://${LOOPBACK}:${port()}`;
		const hosts = [`${LOOPBACK}:${port()}`, `localhost:${port()}`];
		if (!hosts.includes(req.headers.get("host") ?? "")) return json({ error: "Wrong host" }, 403);
		if (!url.pathname.startsWith("/api/")) return staticFile(dist, url.pathname);
		try {
			if (req.method === "GET" && url.pathname === "/api/board") return json(boardView(board));
			const cardGet = /^\/api\/cards\/([^/]+)$/.exec(url.pathname);
			if (req.method === "GET" && cardGet) return json(cardView(board, decodeURIComponent(cardGet[1] ?? "")));
			const log = /^\/api\/runs\/([A-Za-z0-9-]+)\/log$/.exec(url.pathname);
			if (req.method === "GET" && log) {
				const path = logPath(board, log[1] ?? "");
				if (!existsSync(path)) throw new HttpError(404, `No log for run ${log[1]}`);
				return new Response(readFileSync(path, "utf8"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
			}
			if (req.method !== "POST") throw new HttpError(404, "Not found");
			const from = req.headers.get("origin");
			if (from !== null && from !== origin && from !== `http://localhost:${port()}`) throw new HttpError(403, "Wrong origin");
			if (!req.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Send JSON");
			const b = (await req.json()) as Record<string, unknown>;
			if (url.pathname === "/api/cards") {
				const { card } = createCard(board, { title: str(b.title, "title") });
				return json(cardView(board, card.id), 201);
			}
			const op = /^\/api\/cards\/([^/]+)\/([a-z]+)$/.exec(url.pathname);
			if (!op) throw new HttpError(404, "Not found");
			const id = decodeURIComponent(op[1] ?? "");
			if (op[2] === "delete") {
				deleteCard(board, id, "web");
				return json({ deleted: id });
			}
			operate(board, id, op[2] ?? "", b);
			return json(cardView(board, id));
		} catch (e) {
			const status = e instanceof HttpError ? e.status : e instanceof MoveRefused ? 409 : /^No card /.test((e as Error).message) ? 404 : 400;
			return json({ error: (e as Error).message }, status);
		}
	};
}

// Listens on the loopback address only, on `port` (0 for any free one).
export function serveWeb(board: Board, port = 0, dist = DIST): ReturnType<typeof Bun.serve> {
	let bound = 0;
	const server = Bun.serve({ hostname: LOOPBACK, port, fetch: handler(board, () => bound, dist) });
	bound = server.port ?? 0;
	return server;
}

// One server per board, shared by every session that asks for it. Its state
// file, in the user's private state directory, names its pid, its port and
// the sessions holding it open, each by the pid of a process that lives as
// long as the session does. The server drops each holder whose process has
// gone and stops once none is left.
export interface WebState {
	pid: number;
	port: number;
	holders: number[];
}

export function webStatePaths(prefix: string, env: Env = process.env): { state: string; lock: string } {
	const dir = join(privateStateDir(env), "web");
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	return { state: join(dir, `${prefix}.json`), lock: join(dir, `${prefix}.lock`) };
}

export function readWebState(path: string): WebState | null {
	try {
		const s = JSON.parse(readFileSync(path, "utf8")) as WebState;
		return Number.isInteger(s.pid) && Number.isInteger(s.port) && Array.isArray(s.holders) ? s : null;
	} catch {
		return null;
	}
}

export function writeWebState(path: string, s: WebState): void {
	writeAtomic(path, `${JSON.stringify(s)}\n`);
}

export function webUrl(port: number): string {
	return `http://${LOOPBACK}:${port}/`;
}

const START_WAIT_MS = 10_000;

// Starts the board's web UI for the repo at cwd, or reuses the one already
// running for its board, and returns its address. `holder` is the pid of a
// process that lives as long as the asking session: the CLI passes the Claude
// Code process it runs under (CLAUDE_PID) or else its own parent shell, and
// the MCP tool passes the Claude Code process that started the MCP server.
// The server stops once every holder's process has ended.
export function startWebUI(cwd: string, holder: number, env: Env = process.env): { url: string; reused: boolean } {
	if (!Number.isInteger(holder) || holder <= 0 || !alive(holder)) throw new Error(`No running process ${holder} to hold the web UI open`);
	const board = requireBoard(cwd, env);
	const { state, lock } = webStatePaths(board.config.prefix, env);
	return withLock(lock, `The web UI of ${board.config.prefix}`, undefined, () => {
		const running = readWebState(state);
		if (running && alive(running.pid)) {
			if (!running.holders.includes(holder)) writeWebState(state, { ...running, holders: [...running.holders, holder] });
			return { url: webUrl(running.port), reused: true };
		}
		if (running) unlinkSync(state);
		const child = spawn(process.execPath, [SERVER, board.paths.dir, String(holder)], {
			detached: true,
			stdio: "ignore",
			env: env as NodeJS.ProcessEnv,
		});
		child.unref();
		const until = Date.now() + START_WAIT_MS;
		while (Date.now() < until) {
			const s = readWebState(state);
			if (s && s.pid === child.pid) return { url: webUrl(s.port), reused: false };
			Bun.sleepSync(25);
		}
		throw new Error(`The web UI did not start within ${START_WAIT_MS / 1000} seconds`);
	});
}

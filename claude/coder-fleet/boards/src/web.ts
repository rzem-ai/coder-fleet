import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { isIPv6 } from "node:net";
import { networkInterfaces } from "node:os";
import { join, normalize, sep } from "node:path";
import { actionsOf, addAction, openActions, tickAction } from "./actions.ts";
import { type Board, requireBoard } from "./board.ts";
import { type Card, createCard, deleteCard, editCard, listCards, readCard } from "./cards.ts";
import { addItem, checklist, editItem, isListName, removeItem, tickItem, untickItem } from "./checklists.ts";
import { COLUMNS } from "./columns.ts";
import { addComment, commentsOf } from "./comments.ts";
import { type Listen, webConfig } from "./config.ts";
import { dependenciesDone, dependenciesOf } from "./dependencies.ts";
import { cardHistory } from "./events.ts";
import { alive, withLock, writeAtomic } from "./lock.ts";
import { MoveRefused, moveCard, moveTargets, nextQueue, orderNext } from "./moves.ts";
import { type Env, privateStateDir } from "./paths.ts";
import { logPath, testRuns } from "./releases.ts";
import { selfCommand } from "./self.ts";

// The board's web UI: a small JSON API over the board's own functions, and
// the built Vue bundle under web/dist. It listens on the loopback address and
// trusts the local machine (CF-207 criteria 20 and 58), unless the board's
// config.yml sets `listen: 0.0.0.0`, when it trusts the network (CF-10). Every move
// it makes has source `web`, which is what lets the human fill Next and
// override the gates; the MCP tools and the CLI are refused those moves.

export const LOOPBACK = "127.0.0.1";
export const DIST = join(import.meta.dir, "..", "web", "dist");

// The built page inside the compiled binary: each file of web/dist by its
// path from the page's root (`/index.html`, `/assets/...`), naming where the
// binary holds it. The binary's entry point (src/main.ts) sets it; from
// source it stays null and the page is read from DIST.
let embeddedPage: Record<string, string> | null = null;

export function usePage(files: Record<string, string>): void {
	embeddedPage = files;
}

// Whether there is a page to serve: the binary's own, or a built web/dist.
export function pageBuilt(): boolean {
	return embeddedPage !== null || existsSync(join(DIST, "index.html"));
}

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

// Every write the API makes on a card, as POST /api/cards/<ID>/<operation>.
// A name not here is not found, whatever operate has a case for.
export const WEB_OPERATIONS = ["edit", "move", "order", "add", "tick", "untick", "edititem", "remove", "comment", "delete"] as const;

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
	if (embeddedPage) {
		// Looked up by exact path, so nothing outside the page is reachable;
		// any other path is the page's own route and gets index.html.
		const asset = decoded === "/index.html" ? undefined : embeddedPage[decoded];
		if (asset) return new Response(Bun.file(asset));
		const page = embeddedPage["/index.html"];
		if (page) return new Response(Bun.file(page), { headers: { "cache-control": "no-store" } });
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

const OCTET = "(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])";
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`);

// Whether `host` names this server by an address no DNS answer can point
// elsewhere, on its own port: `localhost`, a dotted-quad IPv4 literal in its
// plain form, or a bracketed IPv6 literal with no zone, then `:<port>`. A
// domain name, a trailing dot, a capitalised `localhost`, a missing or other
// port and any other spelling of an address are refused.
export function ipHost(host: string, port: number): boolean {
	const at = host.startsWith("[") ? host.indexOf("]") + 1 : host.lastIndexOf(":");
	if (at <= 0 || host[at] !== ":" || host.slice(at + 1) !== String(port)) return false;
	const name = host.slice(0, at);
	if (name === "localhost" || IPV4.test(name)) return true;
	return name.startsWith("[") && name.endsWith("]") && !name.includes("%") && isIPv6(name.slice(1, -1));
}

// Whether a request may be answered, and a write taken from where it came.
// On 127.0.0.1 the Host is the loopback address or localhost with the
// server's port, and a write's Origin, when it carries one, is either of
// those. On 0.0.0.0 the Host is any address `ipHost` takes, and a write
// carries an Origin of exactly `http://` and that Host. Either way a page
// that rebinds a domain name to this machine is refused, and another site's
// page cannot post a form to it, since a browser sets Origin itself.
export function hostAllowed(listen: Listen, host: string | null, port: number): boolean {
	if (host === null) return false;
	if (listen === LOOPBACK) return host === `${LOOPBACK}:${port}` || host === `localhost:${port}`;
	return ipHost(host, port);
}

export function originAllowed(listen: Listen, host: string, origin: string | null, port: number): boolean {
	if (listen === LOOPBACK) return origin === null || origin === `http://${LOOPBACK}:${port}` || origin === `http://localhost:${port}`;
	return origin === `http://${host}`;
}

// The request handler: the Host and Origin rules above, and a write must be
// JSON.
export function handler(board: Board, port: () => number, dist = DIST, listen: Listen = LOOPBACK) {
	return async (req: Request): Promise<Response> => {
		// Before the URL is read, since it is built from the Host.
		const host = req.headers.get("host");
		if (host === null || !hostAllowed(listen, host, port())) return json({ error: "Wrong host" }, 403);
		const url = new URL(req.url);
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
			if (!originAllowed(listen, host, req.headers.get("origin"), port())) throw new HttpError(403, "Wrong origin");
			if (!req.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Send JSON");
			const b = (await req.json()) as Record<string, unknown>;
			if (url.pathname === "/api/cards") {
				const { card } = createCard(board, { title: str(b.title, "title") });
				return json(cardView(board, card.id), 201);
			}
			const op = /^\/api\/cards\/([^/]+)\/([a-z]+)$/.exec(url.pathname);
			if (!op || !(WEB_OPERATIONS as readonly string[]).includes(op[2] ?? "")) throw new HttpError(404, "Not found");
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

// Listens on `listen`, 127.0.0.1 unless the board's config.yml names
// 0.0.0.0, on `port` (0 for any free one).
export function serveWeb(board: Board, port = 0, dist = DIST, listen: Listen = LOOPBACK): ReturnType<typeof Bun.serve> {
	let bound = 0;
	const server = Bun.serve({ hostname: listen, port, fetch: handler(board, () => bound, dist, listen) });
	bound = server.port ?? 0;
	return server;
}

// One server per board, shared by every session that asks for it. Its state
// file, in the user's private state directory, names its pid, its port, the
// address it listens on, the port config.yml asked for (0 for any) and the
// sessions holding it open, each by the pid of a process that lives as long
// as the session does. The server drops each holder whose process has gone
// and stops once none is left. A server that could not listen writes `error`
// in place of serving, and exits.
export interface WebState {
	pid: number;
	port: number;
	holders: number[];
	listen?: Listen;
	asked?: number;
	error?: string;
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

// The server's addresses on the network when it listens on 0.0.0.0: one for
// each IPv4 address of this machine that is not its loopback.
export function networkUrls(listen: Listen, port: number): string[] {
	if (listen === LOOPBACK) return [];
	return Object.values(networkInterfaces())
		.flat()
		.flatMap((a) => (a && a.family === "IPv4" && !a.internal ? [`http://${a.address}:${port}/`] : []));
}

// Whether a running server listens where config.yml says. A state file from
// before `listen:` and `port:` existed is a loopback server on a free port.
function matches(s: WebState, want: { listen: Listen; port: number }): boolean {
	return (s.listen ?? LOOPBACK) === want.listen && (s.asked ?? 0) === want.port;
}

// Whether a retired server has stopped: its process has gone, or its port
// is free again. The port tells where the pid cannot, since a server this
// process started stays a zombie, alive to a signal, until it is reaped.
function stopped(s: WebState): boolean {
	if (!alive(s.pid)) return true;
	try {
		Bun.serve({ hostname: s.listen ?? LOOPBACK, port: s.port, fetch: () => new Response("") }).stop(true);
		return true;
	} catch {
		return false;
	}
}

export interface WebStart {
	url: string;
	reused: boolean;
	// Its addresses on the network, when it listens on 0.0.0.0.
	network: string[];
	// The address of the server it replaced, when config.yml had moved it.
	was?: string;
}

// What `web` and `board_web` print for a start.
export function webMessage(start: WebStart): string {
	const lead = start.was
		? `Restarted the board's web UI where config.yml now says, since it was running at ${start.was}`
		: start.reused
			? "The board's web UI is running"
			: "Started the board's web UI";
	const lines = [`${lead}: ${start.url}`];
	if (start.network.length) lines.push(`It listens on 0.0.0.0 with no access control, so anyone on the network can read and change the board at: ${start.network.join(", ")}`);
	return lines.join("\n");
}

const START_WAIT_MS = 10_000;
// How long a start waits for a server it retired to stop: it looks at its
// state file once a second.
const RETIRE_WAIT_MS = 5_000;

// Starts the board's web UI for the repo at cwd, or reuses the one already
// running for its board, and returns its address. `holder` is the pid of a
// process that lives as long as the asking session: the CLI passes the Claude
// Code process it runs under (CLAUDE_PID) or else its own parent shell, and
// the MCP tool passes the Claude Code process that started the MCP server.
// The server stops once every holder's process has ended. A running server
// whose address or port config.yml no longer names is retired, by removing
// its state file, which it stops on seeing, and a new one started in its
// place, held by its holders as well; it is never signalled, since its pid
// may by now be another process's.
export function startWebUI(cwd: string, holder: number, env: Env = process.env): WebStart {
	if (!Number.isInteger(holder) || holder <= 0 || !alive(holder)) throw new Error(`No running process ${holder} to hold the web UI open`);
	const board = requireBoard(cwd, env);
	const want = webConfig(board.config, board.paths.config);
	const { state, lock } = webStatePaths(board.config.prefix, env);
	const what = `The web UI of ${board.config.prefix}`;
	const retired = withLock(lock, what, undefined, () => {
		const running = readWebState(state);
		if (!running || !alive(running.pid) || matches(running, want)) return null;
		unlinkSync(state);
		return running;
	});
	if (retired) {
		const until = Date.now() + RETIRE_WAIT_MS;
		while (!stopped(retired) && Date.now() < until) Bun.sleepSync(25);
		// Started beside it, a new server could share its port on another
		// address, and the old one would go on answering its loopback URL.
		if (!stopped(retired)) {
			throw new Error(
				`The board's web UI at ${webUrl(retired.port)} is not where ${board.paths.config} says, and process ${retired.pid} serving it has not stopped within ${RETIRE_WAIT_MS / 1000} seconds of being told to. Stop it, then start the web UI again.`,
			);
		}
	}
	return withLock(lock, what, undefined, () => {
		const running = readWebState(state);
		if (running && alive(running.pid)) {
			if (!matches(running, want)) {
				throw new Error(
					`The board's web UI is running at ${webUrl(running.port)}, on ${running.listen ?? LOOPBACK}, not where ${board.paths.config} says, since another session started it while this one waited. Start the web UI again to restart it there.`,
				);
			}
			if (!running.holders.includes(holder)) writeWebState(state, { ...running, holders: [...running.holders, holder] });
			return { url: webUrl(running.port), reused: true, network: networkUrls(want.listen, running.port) };
		}
		if (running) unlinkSync(state);
		const self = selfCommand(["web-server", board.paths.dir, String(holder)], env as Record<string, string | undefined>);
		const [program = process.execPath, ...args] = self.argv;
		const child = spawn(program, args, {
			detached: true,
			stdio: "ignore",
			cwd: self.cwd,
			env: self.env as NodeJS.ProcessEnv,
		});
		child.unref();
		const until = Date.now() + START_WAIT_MS;
		while (Date.now() < until) {
			const s = readWebState(state);
			if (s && s.pid === child.pid) {
				if (s.error !== undefined) {
					unlinkSync(state);
					throw new Error(s.error);
				}
				// The retired server's sessions hold this one open too.
				const holders = [...new Set([...s.holders, ...(retired?.holders ?? []).filter(alive)])];
				if (holders.length !== s.holders.length) writeWebState(state, { ...s, holders });
				return {
					url: webUrl(s.port),
					reused: false,
					network: networkUrls(s.listen ?? LOOPBACK, s.port),
					...(retired ? { was: webUrl(retired.port) } : {}),
				};
			}
			Bun.sleepSync(25);
		}
		throw new Error(`The web UI did not start within ${START_WAIT_MS / 1000} seconds`);
	});
}

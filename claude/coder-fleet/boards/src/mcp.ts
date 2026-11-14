// The board's MCP tools, served over stdio by the CLI's `mcp` subcommand: the
// card operations a session needs (CF-207 criterion 49), each a thin call
// into the board's own functions. Every move they make has source `mcp`, so
// the column rules in src/moves.ts refuse anything but a move out of Draft
// into Backlog, and the one other column change, into Blocked by Human, comes
// from adding an Action for Human. Filling Next stays the web UI's.
//
// A tool reads each argument it takes by name and passes nothing else on, so
// a caller's extra fields never reach createCard or any other write.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { actionsOf, addAction, tickAction } from "./actions.ts";
import { type Board, requireBoard } from "./board.ts";
import { type Card, cardExists, createCard, editCard, listCards, readCard } from "./cards.ts";
import { addItem, checklist, editItem, isListName, type ListName, removeItem, tickItem, untickItem } from "./checklists.ts";
import { COLUMNS, isColumn } from "./columns.ts";
import { addComment, commentsOf } from "./comments.ts";
import { addDependency, dependenciesDone, dependenciesOf, removeDependency } from "./dependencies.ts";
import { clearFocus, focusBase, setFocus } from "./focus.ts";
import { moveCard, takeNext } from "./moves.ts";
import type { Env } from "./paths.ts";
import { startWebUI } from "./web.ts";

type Args = Record<string, unknown>;

// What a tool call runs against: the checkout the MCP server was started in.
interface Context {
	cwd: string;
	env: Env;
	// The pid of the Claude Code process that started the MCP server, which
	// holds the web UI open for as long as its session lasts.
	holder: number;
}

interface Tool {
	name: string;
	description: string;
	inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
	run(args: Args, ctx: Context): string;
}

function str(args: Args, key: string): string {
	const v = args[key];
	if (typeof v !== "string") throw new Error(`${key} must be text`);
	return v;
}

function optStr(args: Args, key: string): string | undefined {
	return args[key] === undefined ? undefined : str(args, key);
}

function int(args: Args, key: string): number {
	const v = args[key];
	if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new Error(`${key} must be a number from 0`);
	return v;
}

function listArg(args: Args): ListName {
	const list = str(args, "list");
	if (isListName(list)) return list;
	throw new Error(`"${list}" is not a list here: use criteria or dod`);
}

function listOrActions(args: Args): ListName | "actions" {
	const list = str(args, "list");
	if (isListName(list) || list === "actions") return list;
	throw new Error(`"${list}" is not a list: use criteria, dod or actions`);
}

function view(board: Board, id: string) {
	const { card, body } = readCard(board, id);
	return {
		id: card.id,
		title: card.title,
		column: card.column,
		parent: card.parent ?? null,
		dependencies: dependenciesOf(card),
		criteria: checklist(board, card, "criteria").map(({ n, text, ticked, fromDefaults }) => ({ n, text, ticked, fromDefaults })),
		dod: checklist(board, card, "dod").map(({ n, text, ticked, fromDefaults }) => ({ n, text, ticked, fromDefaults })),
		actions: actionsOf(card).map((a, n) => ({ n, text: a.text, ticked: a.ticked === true })),
		comments: commentsOf(card),
		body,
	};
}

function brief(card: Card) {
	return { id: card.id, title: card.title, column: card.column, parent: card.parent ?? null };
}

function shown(data: unknown): string {
	return JSON.stringify(data, null, 2);
}

const ID = { type: "string", description: "The card's id, for example XY-12 or XY-12.1" };
const N = { type: "integer", minimum: 0, description: "The item's number, counted from 0" };
const LIST = { type: "string", enum: ["criteria", "dod"], description: "criteria (acceptance criteria) or dod (Definition of Done)" };
const LIST_OR_ACTIONS = { type: "string", enum: ["criteria", "dod", "actions"], description: "criteria, dod or actions (Actions for Human)" };

function schema(properties: Record<string, unknown>, required: string[] = []): Tool["inputSchema"] {
	return { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false };
}

// Every tool the MCP server serves. test/scope.test.ts reads the names.
export const MCP_TOOLS: readonly Tool[] = [
	{
		name: "card_file",
		description: "File a new card into Draft, or a sub-issue under a parent card, and return it.",
		inputSchema: schema({ title: { type: "string" }, parent: ID, body: { type: "string", description: "The card's description, in markdown" } }, ["title"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const { card } = createCard(board, { title: str(args, "title"), parent: optStr(args, "parent"), body: optStr(args, "body") });
			return shown(view(board, card.id));
		},
	},
	{
		name: "card_read",
		description: "Read a card: its column, parent, dependencies, acceptance criteria and Definition of Done with the board's defaults, Actions for Human, comments and description. Lists count from 0.",
		inputSchema: schema({ id: ID }, ["id"]),
		run(args, ctx) {
			return shown(view(requireBoard(ctx.cwd, ctx.env), str(args, "id")));
		},
	},
	{
		name: "card_list",
		description: "List cards, optionally filtered: by column, by parent, or ready (only the cards whose dependencies are all in Done or Released).",
		inputSchema: schema({ column: { type: "string", enum: [...COLUMNS] }, parent: ID, ready: { type: "boolean" } }),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const column = optStr(args, "column");
			if (column !== undefined && !isColumn(column)) throw new Error(`"${column}" is not a column: use ${COLUMNS.join(", ")}`);
			const parent = optStr(args, "parent");
			const cards = args.ready === true ? dependenciesDone(board) : listCards(board).map((f) => f.card);
			return shown(cards.filter((c) => (column === undefined || c.column === column) && (parent === undefined || c.parent === parent)).map(brief));
		},
	},
	{
		name: "card_next",
		description: "The card to take next: the top of Next, else the first card in Backlog, skipping any card waiting on the human.",
		inputSchema: schema({}),
		run(_args, ctx) {
			const card = takeNext(requireBoard(ctx.cwd, ctx.env));
			return card ? shown(brief(card)) : "Nothing to take: Next and Backlog are empty.";
		},
	},
	{
		name: "card_edit",
		description: "Change a card's title, its description, or both.",
		inputSchema: schema({ id: ID, title: { type: "string" }, body: { type: "string" } }, ["id"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const id = str(args, "id");
			const title = optStr(args, "title");
			const body = optStr(args, "body");
			editCard(board, id, { ...(title !== undefined ? { title } : {}), ...(body !== undefined ? { body } : {}) });
			return shown(view(board, id));
		},
	},
	{
		name: "card_to_backlog",
		description: "Move a card out of Draft into Backlog. It is the only column move a tool makes; the board's hooks, its gates and the human own every other.",
		inputSchema: schema({ id: ID }, ["id"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const id = str(args, "id");
			moveCard(board, { card: id, to: "Backlog", source: "mcp" });
			return shown(view(board, id));
		},
	},
	{
		name: "card_add",
		description: "Add an item to a card's acceptance criteria, Definition of Done or Actions for Human. Adding an Action for Human moves the card to Blocked by Human.",
		inputSchema: schema({ id: ID, list: LIST_OR_ACTIONS, text: { type: "string" } }, ["id", "list", "text"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const id = str(args, "id");
			const list = listOrActions(args);
			if (list === "actions") addAction(board, id, str(args, "text"), "mcp");
			else addItem(board, id, list, str(args, "text"));
			return shown(view(board, id));
		},
	},
	{
		name: "card_tick",
		description: "Tick item n, counted from 0, of a card's acceptance criteria, Definition of Done or Actions for Human. Ticking never moves a column.",
		inputSchema: schema({ id: ID, list: LIST_OR_ACTIONS, n: N }, ["id", "list", "n"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const id = str(args, "id");
			const list = listOrActions(args);
			if (list === "actions") tickAction(board, id, int(args, "n"));
			else tickItem(board, id, list, int(args, "n"));
			return shown(view(board, id));
		},
	},
	{
		name: "card_untick",
		description: "Untick item n, counted from 0, of a card's acceptance criteria or Definition of Done.",
		inputSchema: schema({ id: ID, list: LIST, n: N }, ["id", "list", "n"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const id = str(args, "id");
			untickItem(board, id, listArg(args), int(args, "n"));
			return shown(view(board, id));
		},
	},
	{
		name: "card_edit_item",
		description: "Change the text of the card's own item n, counted from 0, of its acceptance criteria or Definition of Done. Board defaults change only in the board's config.",
		inputSchema: schema({ id: ID, list: LIST, n: N, text: { type: "string" } }, ["id", "list", "n", "text"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const id = str(args, "id");
			editItem(board, id, listArg(args), int(args, "n"), str(args, "text"));
			return shown(view(board, id));
		},
	},
	{
		name: "card_remove_item",
		description: "Remove the card's own item n, counted from 0, from its acceptance criteria or Definition of Done.",
		inputSchema: schema({ id: ID, list: LIST, n: N }, ["id", "list", "n"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const id = str(args, "id");
			removeItem(board, id, listArg(args), int(args, "n"));
			return shown(view(board, id));
		},
	},
	{
		name: "card_comment",
		description: "Add a comment to a card.",
		inputSchema: schema({ id: ID, text: { type: "string" } }, ["id", "text"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const id = str(args, "id");
			addComment(board, id, str(args, "text"), "agent");
			return shown(view(board, id));
		},
	},
	{
		name: "card_depend",
		description: "Record that a card depends on another card on the same board.",
		inputSchema: schema({ id: ID, on: ID }, ["id", "on"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const id = str(args, "id");
			addDependency(board, id, str(args, "on"));
			return shown(view(board, id));
		},
	},
	{
		name: "card_undepend",
		description: "Drop a card's dependency on another card.",
		inputSchema: schema({ id: ID, on: ID }, ["id", "on"]),
		run(args, ctx) {
			const board = requireBoard(ctx.cwd, ctx.env);
			const id = str(args, "id");
			removeDependency(board, id, str(args, "on"));
			return shown(view(board, id));
		},
	},
	{
		name: "card_focus",
		description: "Bind this checkout's focus to a card, so the agents it spawns bind to that card; with no id, clear the focus.",
		inputSchema: schema({ id: ID }),
		run(args, ctx) {
			const base = focusBase(ctx.cwd, ctx.env);
			const id = optStr(args, "id");
			if (id === undefined) {
				const was = clearFocus(base, ctx.env);
				return was ? `Cleared the focus on ${was}.` : "There was no focus to clear.";
			}
			const board = requireBoard(ctx.cwd, ctx.env);
			if (!cardExists(board, id)) throw new Error(`No card ${id} on this board`);
			setFocus(base, id, ctx.env);
			return `This checkout is focused on ${id}.`;
		},
	},
	{
		name: "board_web",
		description: "Start the board's web UI on this machine, or reuse the one running, and return its address for the human. Only the human fills and orders Next, there.",
		inputSchema: schema({}),
		run(_args, ctx) {
			const { url, reused } = startWebUI(ctx.cwd, ctx.holder, ctx.env);
			return `${reused ? "The board's web UI is running" : "Started the board's web UI"}: ${url}`;
		},
	},
];

const INSTRUCTIONS =
	"This is the repository's board, kept under ~/.config/boards. File, read, list and edit cards, tick their checklists, comment, add and tick Actions for Human and bind this checkout's focus with these tools. Never move a card's column but out of Draft into Backlog: the fleet's hooks, the gates and the human own every other move. Lists count from 0.";

// One tool call: its text, or its error as a tool error.
export function callTool(name: string, args: Args, ctx: Context): { content: { type: "text"; text: string }[]; isError?: true } {
	const tool = MCP_TOOLS.find((t) => t.name === name);
	try {
		if (!tool) throw new Error(`No tool ${name}`);
		return { content: [{ type: "text", text: tool.run(args, ctx) }] };
	} catch (e) {
		return { content: [{ type: "text", text: (e as Error).message }], isError: true };
	}
}

// Serves the tools over stdio until the client closes stdin.
export async function serveMcp(cwd: string, env: Env = process.env): Promise<void> {
	const ctx: Context = { cwd, env, holder: process.ppid };
	const server = new Server({ name: "boards", version: "0.0.0" }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: MCP_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
	}));
	server.setRequestHandler(CallToolRequestSchema, async (req) => callTool(req.params.name, (req.params.arguments ?? {}) as Args, ctx));
	const closed = new Promise<void>((resolve) => {
		server.onclose = () => resolve();
		process.stdin.once("end", () => resolve());
	});
	await server.connect(new StdioServerTransport());
	await closed;
}

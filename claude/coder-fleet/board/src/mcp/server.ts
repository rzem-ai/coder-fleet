import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	GetPromptRequestSchema,
	ListPromptsRequestSchema,
	ListResourcesRequestSchema,
	ListResourceTemplatesRequestSchema,
	ListToolsRequestSchema,
	McpError,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Core } from "../core/backlog.ts";
import { setCommitContext } from "../git/commit-context.ts";
import { BacklogServer } from "../server/index.ts";
import { busyPortNote, type PortSource } from "../server/port.ts";
import { getPackageName } from "../utils/app-info.ts";
import { getVersion } from "../utils/version.ts";
import { registerDefinitionOfDoneTools } from "./tools/definition-of-done/index.ts";
import { registerDocumentTools } from "./tools/documents/index.ts";
import { registerFocusTools } from "./tools/focus/index.ts";
import { registerMilestoneTools } from "./tools/milestones/index.ts";
import { registerServeTools } from "./tools/serve/index.ts";
import { registerTaskTools } from "./tools/tasks/index.ts";
import type {
	CallToolResult,
	GetPromptResult,
	ListPromptsResult,
	ListResourcesResult,
	ListResourceTemplatesResult,
	ListToolsResult,
	McpPromptHandler,
	McpResourceHandler,
	McpToolHandler,
	ReadResourceResult,
} from "./types.ts";

/**
 * Minimal MCP server implementation for stdio transport.
 *
 * The Backlog.md MCP server is intentionally local-only and exposes tools,
 * resources, and prompts through the stdio transport so that desktop editors
 * (e.g. Claude Code) can interact with a project without network exposure.
 */
const APP_NAME = getPackageName();
const INSTRUCTIONS =
	"This is the repository's board, under .boards/ in the main checkout. Read items with task_view, task_list and task_search; add a comment with task_edit; say which item a phase is on with task_focus; never move an item's status, the fleet's hooks own that.";

type ServerInitOptions = {
	debug?: boolean;
};

/** What board_serve and board_url return; board_stop adds the URL it stopped. */
export type WebUiStatus = {
	running: boolean;
	url: string | null;
	host: string | null;
	port: number | null;
	/** Set only while running: where the port came from. */
	portSource?: PortSource;
	/** Set only while running on a configured port (env or config): the port asked for. */
	configuredPort?: number;
	/** Set only while running on a configured port: whether it was busy, so the board moved up. */
	configuredPortBusy?: boolean;
	/** Set only when the configured port was busy: one line naming it and the port bound. */
	note?: string;
};

export class McpServer extends Core {
	private readonly server: Server;
	private transport?: StdioServerTransport;
	private stopping = false;

	/**
	 * The session's web UI, started by board_serve and stopped by board_stop or
	 * with this server. Null until asked for.
	 */
	private webUi: BacklogServer | null = null;
	/**
	 * The tail of the queue that runs web UI starts and stops one at a time, in
	 * the order they were asked for, so a stop issued during a start wins and a
	 * start issued during a stop gets a fresh UI. Never rejects.
	 */
	private webUiQueue: Promise<unknown> = Promise.resolve();

	private readonly tools = new Map<string, McpToolHandler>();
	private readonly resources = new Map<string, McpResourceHandler>();
	private readonly prompts = new Map<string, McpPromptHandler>();

	constructor(projectRoot: string, instructions: string, version = "0.0.0") {
		super(projectRoot, { enableWatchers: true });

		this.server = new Server(
			{
				name: APP_NAME,
				version,
			},
			{
				capabilities: {
					tools: { listChanged: true },
					resources: { listChanged: true },
					prompts: { listChanged: true },
				},
				instructions,
			},
		);

		this.setupHandlers();
	}

	private setupHandlers(): void {
		this.server.setRequestHandler(ListToolsRequestSchema, async () => this.listTools());
		this.server.setRequestHandler(CallToolRequestSchema, async (request) => this.callTool(request));
		this.server.setRequestHandler(ListResourcesRequestSchema, async () => this.listResources());
		this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => this.listResourceTemplates());
		this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => this.readResource(request));
		this.server.setRequestHandler(ListPromptsRequestSchema, async () => this.listPrompts());
		this.server.setRequestHandler(GetPromptRequestSchema, async (request) => this.getPrompt(request));
	}

	/**
	 * Register a tool implementation with the server.
	 */
	public addTool(tool: McpToolHandler): void {
		this.tools.set(tool.name, tool);
	}

	/**
	 * Where the web UI is, without starting it. A running UI also says where its
	 * port came from, and a configured one says whether it was busy, with a note
	 * naming both ports when it was.
	 */
	public webUiStatus(): WebUiStatus {
		const url = this.webUi?.url ?? null;
		if (!this.webUi || url === null) return { running: false, url: null, host: null, port: null };
		const status: WebUiStatus = { running: true, url, host: this.webUi.host, port: this.webUi.port };
		const binding = this.webUi.portBinding;
		if (!binding) return status;
		status.portSource = binding.source;
		if (binding.source === "env" || binding.source === "config") {
			status.configuredPort = binding.requested;
			status.configuredPortBusy = binding.busy;
		}
		const note = busyPortNote(binding, this.webUi.port);
		if (note) status.note = note;
		return status;
	}

	/** Run a web UI start or stop after every one asked for before it. */
	private queueWebUi<T>(op: () => Promise<T>): Promise<T> {
		const run = this.webUiQueue.then(op);
		this.webUiQueue = run.catch(() => {});
		return run;
	}

	/**
	 * Start the web UI if it is not running, and report where it is. The port
	 * is the board's usual one - CODER_FLEET_BOARD_PORT, then `default_port` in
	 * the config, then a random loopback port - and a busy configured port moves
	 * up until one binds. Idempotent: two overlapping calls share one UI. A start
	 * after a stop binds a fresh UI. Throws, leaving nothing running, when no port
	 * binds. Quiet, because stdout here is the MCP transport.
	 */
	public startWebUi(): Promise<WebUiStatus> {
		return this.queueWebUi(async () => {
			if (this.webUi?.url) return this.webUiStatus();
			const ui = new BacklogServer(this.filesystem.rootDir);
			await ui.start(undefined, false, { quiet: true });
			this.webUi = ui;
			return this.webUiStatus();
		});
	}

	/**
	 * Stop the web UI if it is running, after any start already asked for, and
	 * return the URL it stopped, or null when nothing was running. Safe to call
	 * when it is not, and writes nothing to stdout.
	 */
	public stopWebUi(): Promise<string | null> {
		return this.queueWebUi(async () => {
			const ui = this.webUi;
			this.webUi = null;
			if (!ui) return null;
			const url = ui.url;
			await ui.stop();
			return url;
		});
	}

	/**
	 * Register a resource implementation with the server.
	 */
	public addResource(resource: McpResourceHandler): void {
		this.resources.set(resource.uri, resource);
	}

	/**
	 * Register a prompt implementation with the server.
	 */
	public addPrompt(prompt: McpPromptHandler): void {
		this.prompts.set(prompt.name, prompt);
	}

	/**
	 * Connect the server to the stdio transport.
	 */
	public async connect(): Promise<void> {
		if (this.transport) {
			return;
		}

		this.transport = new StdioServerTransport();
		await this.server.connect(this.transport);
	}

	/**
	 * Start the server. The stdio transport begins handling requests as soon as
	 * it is connected, so this method exists primarily for symmetry with
	 * callers that expect an explicit start step.
	 */
	public async start(): Promise<void> {
		if (!this.transport) {
			throw new Error("MCP server not connected. Call connect() before start().");
		}
	}

	/**
	 * Stop the server and release transport resources.
	 */
	public async stop(): Promise<void> {
		if (this.stopping) {
			return;
		}
		this.stopping = true;
		try {
			await this.stopWebUi();
			await this.server.close();
		} finally {
			this.transport = undefined;
			this.disposeSearchService();
			this.disposeContentStore();
		}
	}

	public getServer(): Server {
		return this.server;
	}

	// -- Internal handlers --------------------------------------------------

	protected async listTools(): Promise<ListToolsResult> {
		return {
			tools: Array.from(this.tools.values()).map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: {
					type: "object",
					...tool.inputSchema,
				},
				...(tool.annotations ? { annotations: tool.annotations } : {}),
			})),
		};
	}

	protected async callTool(request: {
		params: { name: string; arguments?: Record<string, unknown> };
	}): Promise<CallToolResult> {
		const { name, arguments: args = {} } = request.params;
		const tool = this.tools.get(name);

		if (!tool) {
			throw new McpError(ErrorCode.InvalidParams, `Tool not found: ${name}`);
		}

		return await tool.handler(args);
	}

	protected async listResources(): Promise<ListResourcesResult> {
		return {
			resources: Array.from(this.resources.values()).map((resource) => ({
				uri: resource.uri,
				name: resource.name || "Unnamed Resource",
				description: resource.description,
				mimeType: resource.mimeType,
			})),
		};
	}

	protected async listResourceTemplates(): Promise<ListResourceTemplatesResult> {
		return {
			resourceTemplates: [],
		};
	}

	protected async readResource(request: { params: { uri: string } }): Promise<ReadResourceResult> {
		const { uri } = request.params;

		// Exact match first
		let resource = this.resources.get(uri);

		// Fallback to base URI for parameterised resources
		if (!resource) {
			const baseUri = uri.split("?")[0] || uri;
			resource = this.resources.get(baseUri);
		}

		if (!resource) {
			throw new McpError(ErrorCode.InvalidParams, `Resource not found: ${uri}`);
		}

		return await resource.handler(uri);
	}

	protected async listPrompts(): Promise<ListPromptsResult> {
		return {
			prompts: Array.from(this.prompts.values()).map((prompt) => ({
				name: prompt.name,
				description: prompt.description,
				arguments: prompt.arguments,
			})),
		};
	}

	protected async getPrompt(request: {
		params: { name: string; arguments?: Record<string, unknown> };
	}): Promise<GetPromptResult> {
		const { name, arguments: args = {} } = request.params;
		const prompt = this.prompts.get(name);

		if (!prompt) {
			throw new McpError(ErrorCode.InvalidParams, `Prompt not found: ${name}`);
		}

		return await prompt.handler(args);
	}

	/**
	 * Helper exposed for tests so they can call handlers directly.
	 */
	public get testInterface() {
		return {
			listTools: () => this.listTools(),
			callTool: (request: { params: { name: string; arguments?: Record<string, unknown> } }) => this.callTool(request),
			listResources: () => this.listResources(),
			listResourceTemplates: () => this.listResourceTemplates(),
			readResource: (request: { params: { uri: string } }) => this.readResource(request),
			listPrompts: () => this.listPrompts(),
			getPrompt: (request: { params: { name: string; arguments?: Record<string, unknown> } }) =>
				this.getPrompt(request),
		};
	}
}

/**
 * Factory that bootstraps a fully configured MCP server instance.
 *
 * The board root is fixed (see resolveBoardRoot), so a root without a config is
 * an error rather than something to discover a way out of.
 */
export async function createMcpServer(projectRoot: string, options: ServerInitOptions = {}): Promise<McpServer> {
	// We need to check config first to determine which instructions to use
	const tempCore = new Core(projectRoot);
	await tempCore.ensureConfigLoaded();
	const [config, version] = await Promise.all([tempCore.filesystem.loadConfig(), getVersion()]);

	if (!config) {
		throw new Error("no board/config.yml under the board root");
	}

	const server = new McpServer(projectRoot, INSTRUCTIONS, version);

	setCommitContext({ by: "mcp" });
	registerTaskTools(server, config);
	registerMilestoneTools(server);
	registerDefinitionOfDoneTools(server);
	registerDocumentTools(server, config);
	registerServeTools(server);
	registerFocusTools(server);

	if (options.debug) {
		console.error("MCP server initialised (stdio transport only).");
	}

	return server;
}

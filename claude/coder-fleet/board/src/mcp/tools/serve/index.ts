import type { McpServer } from "../../server.ts";
import type { McpToolHandler } from "../../types.ts";
import { createSimpleValidatedTool } from "../../validation/tool-wrapper.ts";

/**
 * The web UI, per Claude Code instance.
 *
 * Nothing about the board depends on the web UI: the task tools and the fleet's
 * hooks read and write the task files directly. The UI is a viewer for the
 * human, started only when asked - the `/board` command calls `board_serve` -
 * inside this MCP process, on a random loopback port, so it lives no longer
 * than the session that started it. `board_url` answers without starting
 * anything, so an agent can report whether there is a board to look at.
 * `board_stop` - the `/board stop` command - ends it mid-session; otherwise it
 * ends when the MCP server stops. A serve after a stop starts a fresh UI on a
 * new random port, so the old URL stops working.
 */
export function registerServeTools(server: McpServer): void {
	const emptySchema = { type: "object", properties: {}, additionalProperties: false };

	const serveTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "board_serve",
			description:
				"Start the board's web UI for this session if it is not already running, on a random loopback port, and return its URL. Idempotent: a second call returns the same URL. The UI stops on board_stop or when this session's MCP server stops.",
			inputSchema: emptySchema,
			annotations: { title: "Serve the board", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		emptySchema,
		async () => {
			const status = await server.startWebUi();
			return { content: [{ type: "text", text: JSON.stringify(status) }] };
		},
	);

	const urlTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "board_url",
			description:
				"Report whether this session's board web UI is running and, if so, its URL. Starts nothing; use board_serve to start it.",
			inputSchema: emptySchema,
			annotations: { title: "Board URL", readOnlyHint: true, destructiveHint: false },
		},
		emptySchema,
		async () => {
			return { content: [{ type: "text", text: JSON.stringify(server.webUiStatus()) }] };
		},
	);

	const stopTool: McpToolHandler = createSimpleValidatedTool(
		{
			name: "board_stop",
			description:
				"Stop this session's board web UI if it is running, and return its status with `stopped`: the URL it stopped, or null when nothing was running. Idempotent: stopping when nothing runs is not an error. A later board_serve starts a fresh UI on a new random port, so the old URL stops working.",
			inputSchema: emptySchema,
			annotations: { title: "Stop the board", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		emptySchema,
		async () => {
			const stopped = await server.stopWebUi();
			return { content: [{ type: "text", text: JSON.stringify({ ...server.webUiStatus(), stopped }) }] };
		},
	);

	server.addTool(serveTool);
	server.addTool(urlTool);
	server.addTool(stopTool);
}

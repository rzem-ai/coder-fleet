import { BacklogToolError } from "../mcp/errors/mcp-errors.ts";

/** The environment variable that sets the board's port, over `default_port` in the config. */
export const BOARD_PORT_ENV = "CODER_FLEET_BOARD_PORT";

/** The highest port the bind loop tries before it gives up. */
export const MAX_BOARD_PORT = 65535;

/**
 * Where the port came from. `flag` is an explicit port - `board serve --port`
 * or a caller passing one - and is bound exactly. `env` and `config` are a
 * configured port, which moves up from a busy one. `random` asks the kernel.
 */
export type PortSource = "flag" | "env" | "config" | "random";

export type PortRequest = { port: number; source: PortSource };

/** How the board came by the port it bound: what was asked for, and whether that was busy. */
export type PortBinding = { source: PortSource; requested: number; busy: boolean };

/** A port the board could not use: an invalid value, a busy explicit port, or no free port left. */
export class BoardPortError extends BacklogToolError {
	constructor(message: string, code = "PORT_UNAVAILABLE") {
		super(message, code);
		this.name = "BoardPortError";
	}
}

/** Name a port's source the way the human set it, for messages. */
export function describePortSource(source: PortSource): string {
	switch (source) {
		case "flag":
			return "--port";
		case "env":
			return BOARD_PORT_ENV;
		case "config":
			return "default_port in the board's config.yml";
		case "random":
			return "a random port";
	}
}

function parsePort(value: number | string, source: PortSource): number {
	const text = typeof value === "number" ? String(value) : value.trim();
	const port = /^\d+$/.test(text) ? Number(text) : Number.NaN;
	if (!Number.isInteger(port) || port < 0 || port > MAX_BOARD_PORT) {
		throw new BoardPortError(
			`${describePortSource(source)} must be a port from 1 to ${MAX_BOARD_PORT}, or 0 for a random one; got ${String(value).trim() || "an empty value"}`,
			"INVALID_PORT",
		);
	}
	return port;
}

/**
 * The board's port, for every way of starting it: an explicit flag, then
 * CODER_FLEET_BOARD_PORT, then `default_port` in the config, then a random
 * port. An unset or blank value falls through to the next; 0 from any source
 * asks for a random port. Throws a BoardPortError on a value that is not a port.
 */
export function resolveBoardPort(input: { flag?: number | string; env?: string; configPort?: number }): PortRequest {
	const candidates: Array<[number | string | undefined, PortSource]> = [
		[input.flag, "flag"],
		[input.env, "env"],
		[input.configPort, "config"],
	];
	for (const [value, source] of candidates) {
		if (value === undefined || (typeof value === "string" && value.trim() === "")) continue;
		const port = parsePort(value, source);
		return port === 0 ? { port: 0, source: "random" } : { port, source };
	}
	return { port: 0, source: "random" };
}

/** The line the board says when a configured port was busy and it moved up. */
export function busyPortNote(binding: PortBinding, bound: number): string | null {
	if (!binding.busy) return null;
	return `The configured port ${binding.requested} (${describePortSource(binding.source)}) was busy, so the board is on ${bound}.`;
}

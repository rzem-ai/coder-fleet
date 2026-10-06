/**
 * The board's answer to DNS rebinding (CF-139). A page in the human's browser
 * can point its own hostname at 127.0.0.1 and then reach the board as if it
 * were same-origin, so CORS never applies. The board therefore refuses any
 * request whose Host is not one of its own names, and any state-changing
 * request whose Origin is present but not its own.
 *
 * Its own names are the loopback ones, plus the interface the human bound on
 * purpose with `board serve --host`. A name matches exactly, case aside: a
 * trailing dot ("localhost.") is a different name and is refused.
 */

/** The names a Host header may carry for any board, in Host-header form. */
const LOOPBACK_HOST_NAMES = ["127.0.0.1", "localhost", "[::1]"] as const;

/** The methods whose Origin, when present, must be the board's own. */
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type RequestGuardScope = {
	/** The interface the server is bound to, as given to `start`. */
	boundHost: string;
	/** The port the live server is bound to, which may differ from the one configured. */
	port: number;
};

/** A host as a Host header names it: lower case, an IPv6 literal in brackets. */
function hostHeaderName(host: string): string {
	const name = host.trim().toLowerCase();
	return name.includes(":") && !name.startsWith("[") ? `[${name}]` : name;
}

/** The host names this server answers to: loopback, and the bound interface. */
export function allowedHostNames(boundHost: string): Set<string> {
	const names = new Set<string>(LOOPBACK_HOST_NAMES);
	const bound = hostHeaderName(boundHost);
	if (bound) names.add(bound);
	return names;
}

/** Split a Host header into its name and port, or null when it is malformed. */
function parseHostHeader(value: string): { name: string; port: number | null } | null {
	const host = value.trim().toLowerCase();
	let name: string;
	let rest: string;
	if (host.startsWith("[")) {
		const end = host.indexOf("]");
		if (end === -1) return null;
		name = host.slice(0, end + 1);
		rest = host.slice(end + 1);
	} else {
		const colon = host.indexOf(":");
		name = colon === -1 ? host : host.slice(0, colon);
		rest = colon === -1 ? "" : host.slice(colon);
	}
	if (rest === "") return { name, port: null };
	if (!/^:\d+$/.test(rest)) return null;
	return { name, port: Number(rest.slice(1)) };
}

function isOwnHost(value: string | null, names: Set<string>, port: number): boolean {
	if (value === null) return false;
	const host = parseHostHeader(value);
	if (!host || !names.has(host.name)) return false;
	return host.port === null || host.port === port;
}

/** Whether an Origin header names this board: http, one of its names, and its bound port. */
function isOwnOrigin(value: string, names: Set<string>, port: number): boolean {
	let origin: URL;
	try {
		origin = new URL(value);
	} catch {
		// "null", and anything else that is not a URL, is not the board's origin.
		return false;
	}
	if (origin.protocol !== "http:") return false;
	if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return false;
	if (!names.has(origin.hostname)) return false;
	return Number(origin.port || "80") === port;
}

/** Whether a request asks to become a WebSocket, whatever the header's letter case. */
export function isWebSocketUpgrade(req: Request): boolean {
	return req.headers.get("upgrade")?.trim().toLowerCase() === "websocket";
}

function forbidden(message: string): Response {
	return new Response(`${message}\n`, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * The 403 to send when a request did not come from the board's own origin, or
 * null to let it through. Every request is checked, before any route.
 */
export function refuseForeignRequest(req: Request, scope: RequestGuardScope): Response | null {
	const names = allowedHostNames(scope.boundHost);
	if (!isOwnHost(req.headers.get("host"), names, scope.port)) {
		return forbidden("Forbidden: this board answers only to its own host name.");
	}
	const origin = req.headers.get("origin");
	if (
		origin !== null &&
		STATE_CHANGING_METHODS.has(req.method.toUpperCase()) &&
		!isOwnOrigin(origin, names, scope.port)
	) {
		return forbidden("Forbidden: another origin may not change this board.");
	}
	return null;
}

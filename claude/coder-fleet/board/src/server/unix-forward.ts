import net from "node:net";

/**
 * Forward a request to the board's app server on its Unix socket (CF-139).
 *
 * Not `fetch(url, { unix })`: Bun reads HTTP_PROXY once at start-up, and its
 * fetch then sends the proxy's absolute-form request line ("GET http://...")
 * down even a Unix socket, which no `routes` entry matches, so a human with a
 * proxy set would get a 404 for every page. node:http in Bun is built on the
 * same fetch, and `proxy: ""` does not turn it off. So this speaks the little
 * HTTP the hop needs over node:net: one HTTP/1.0 request with a buffered body
 * and `Connection: close`, read until the announced length or the close.
 */

/** Headers that describe one connection, never the message, so they do not cross the hop. */
const HOP_BY_HOP = new Set([
	"connection",
	"keep-alive",
	"proxy-connection",
	"transfer-encoding",
	"te",
	"trailer",
	"upgrade",
	"expect",
	"content-length",
]);

/** Statuses a Response must carry with no body. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

const HEAD_END = Buffer.from("\r\n\r\n");
const CHUNKED_END = Buffer.from("0\r\n\r\n");

type Expected = { kind: "length"; total: number } | { kind: "chunked" } | { kind: "close" };

/**
 * How the response's end is known, once its head has arrived, or null while
 * the head is incomplete. Bun.serve keeps the socket open after an async
 * handler answers, even under `Connection: close`, so the read has to stop at
 * the announced length rather than wait for the close.
 */
function expectedEnd(raw: Buffer, isHead: boolean): Expected | null {
	const headEnd = raw.indexOf(HEAD_END);
	if (headEnd === -1) return null;
	const bodyStart = headEnd + HEAD_END.length;
	const head = raw.subarray(0, headEnd).toString("latin1").toLowerCase();
	if (isHead || NULL_BODY_STATUSES.has(Number(head.split(" ")[1]))) return { kind: "length", total: bodyStart };
	const length = head.match(/\r\ncontent-length:[ \t]*(\d+)/)?.[1];
	if (length !== undefined) return { kind: "length", total: bodyStart + Number(length) };
	if (/\r\ntransfer-encoding:[^\r]*chunked/.test(head)) return { kind: "chunked" };
	return { kind: "close" };
}

function exchange(socketPath: string, payload: Buffer, isHead: boolean): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const socket = net.connect({ path: socketPath });
		let raw = Buffer.alloc(0);
		let expected: Expected | null = null;
		let settled = false;
		const done = (error?: Error) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			if (error) reject(error);
			else resolve(raw);
		};
		// Not end(payload): Bun.serve drops a request whose sender half-closes before the response.
		socket.on("connect", () => socket.write(payload));
		socket.on("data", (chunk: Buffer) => {
			raw = Buffer.concat([raw, chunk]);
			if (expected === null) expected = expectedEnd(raw, isHead);
			if (expected === null) return;
			if (expected.kind === "length" && raw.length >= expected.total) done();
			// The whole buffer's tail, not this chunk's: the terminator can arrive split across reads.
			else if (expected.kind === "chunked" && raw.subarray(-CHUNKED_END.length).equals(CHUNKED_END)) done();
		});
		socket.on("end", () => done());
		socket.on("close", () => done());
		socket.on("error", (error) => done(error));
	});
}

/** Undo chunked transfer coding, which an HTTP/1.0 request should never get back but costs little to accept. */
function dechunk(body: Buffer): Buffer {
	const parts: Buffer[] = [];
	let at = 0;
	for (;;) {
		const lineEnd = body.indexOf("\r\n", at);
		if (lineEnd === -1) throw new Error("the app server sent a truncated chunked body");
		const size = Number.parseInt(body.subarray(at, lineEnd).toString("latin1").split(";")[0] ?? "", 16);
		if (!Number.isFinite(size)) throw new Error("the app server sent a malformed chunk size");
		if (size === 0) return Buffer.concat(parts);
		parts.push(body.subarray(lineEnd + 2, lineEnd + 2 + size));
		at = lineEnd + 2 + size + 2;
	}
}

function parseResponse(raw: Buffer, isHead: boolean): Response {
	const headEnd = raw.indexOf(HEAD_END);
	if (headEnd === -1) throw new Error("the app server closed without a complete response");
	const [statusLine = "", ...headerLines] = raw.subarray(0, headEnd).toString("latin1").split("\r\n");
	const status = Number(statusLine.split(" ")[1]);
	if (!Number.isInteger(status)) throw new Error(`the app server sent a malformed status line: ${statusLine}`);
	const statusText = statusLine.split(" ").slice(2).join(" ");

	const headers = new Headers();
	let length: number | null = null;
	let chunked = false;
	for (const line of headerLines) {
		const colon = line.indexOf(":");
		if (colon <= 0) continue;
		const name = line.slice(0, colon).trim();
		const value = line.slice(colon + 1).trim();
		const lower = name.toLowerCase();
		if (lower === "content-length") length = Number(value);
		if (lower === "transfer-encoding") chunked = value.toLowerCase().includes("chunked");
		if (!HOP_BY_HOP.has(lower)) headers.append(name, value);
	}

	if (isHead || NULL_BODY_STATUSES.has(status)) {
		if (isHead && length !== null) headers.set("Content-Length", String(length));
		return new Response(null, { status, statusText, headers });
	}
	let body = raw.subarray(headEnd + HEAD_END.length);
	if (chunked) body = dechunk(body);
	else if (length !== null && Number.isInteger(length)) body = body.subarray(0, length);
	return new Response(new Uint8Array(body), { status, statusText, headers });
}

/** Send `req` to the HTTP server listening on `socketPath` and return what it answered. */
export async function forwardToUnixSocket(socketPath: string, req: Request): Promise<Response> {
	const url = new URL(req.url);
	const body = req.method === "GET" || req.method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await req.arrayBuffer());
	const lines = [`${req.method} ${url.pathname}${url.search} HTTP/1.0`];
	// Headers has already refused any value carrying CR or LF, so none can split the head.
	req.headers.forEach((value, name) => {
		if (!HOP_BY_HOP.has(name.toLowerCase())) lines.push(`${name}: ${value}`);
	});
	lines.push("Connection: close", `Content-Length: ${body.length}`);
	const head = Buffer.from(`${lines.join("\r\n")}\r\n\r\n`, "latin1");
	const isHead = req.method === "HEAD";
	const raw = await exchange(socketPath, Buffer.concat([head, body]), isHead);
	return parseResponse(raw, isHead);
}

import net from "node:net";
import { closeServer, listenOnEphemeralPort } from "./test-utils.ts";

/** An ephemeral loopback port that is free at the moment this resolves, for tests to bind. */
export async function unusedLoopbackPort(): Promise<number> {
	const { server: portProbe, port } = await listenOnEphemeralPort();
	await closeServer(portProbe);
	return port;
}

/**
 * Hold a loopback port so a bind to it fails, and return the holder, or null
 * when something else already holds it - which leaves it just as busy. Close
 * a non-null holder with `closeServer`.
 */
export async function holdLoopbackPort(port: number): Promise<net.Server | null> {
	const holder = net.createServer();
	return new Promise((resolve, reject) => {
		holder.once("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE") resolve(null);
			else reject(error);
		});
		holder.listen(port, "127.0.0.1", () => resolve(holder));
	});
}

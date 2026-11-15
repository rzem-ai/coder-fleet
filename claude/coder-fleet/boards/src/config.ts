import { readFileSync, writeFileSync } from "node:fs";
import type { KeyKind } from "./key.ts";
import type { BoardPaths } from "./paths.ts";

// A board's config.yml. Later fields (the test command, the default
// checklists) sit beside these and are kept by every write.
export interface BoardConfig {
	prefix: string;
	key: string;
	keyKind: KeyKind;
	created: string;
	[field: string]: unknown;
}

export function readConfig(paths: BoardPaths): BoardConfig {
	const cfg = Bun.YAML.parse(readFileSync(paths.config, "utf8")) as BoardConfig | null;
	if (!cfg || typeof cfg.prefix !== "string") throw new Error(`${paths.config} carries no prefix`);
	return cfg;
}

// Where the board's web UI listens, from config.yml: `listen:` is the
// address, 127.0.0.1 unless set, and `port:` a fixed port, 0 when unset for a
// free one each start. Any other value is refused, naming its key.
export const LISTEN_ADDRESSES = ["127.0.0.1", "0.0.0.0"] as const;
export type Listen = (typeof LISTEN_ADDRESSES)[number];

export function webConfig(cfg: BoardConfig, where = "config.yml"): { listen: Listen; port: number } {
	const listen = cfg.listen ?? "127.0.0.1";
	if (!(LISTEN_ADDRESSES as readonly unknown[]).includes(listen)) {
		throw new Error(`listen: in ${where} must be 127.0.0.1 or 0.0.0.0, not ${JSON.stringify(listen)}`);
	}
	const port = cfg.port ?? 0;
	if (cfg.port !== undefined && cfg.port !== null && (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535)) {
		throw new Error(`port: in ${where} must be a whole number from 1 to 65535, or left out for a free port, not ${JSON.stringify(cfg.port)}`);
	}
	return { listen: listen as Listen, port: port as number };
}

export function writeConfig(paths: BoardPaths, cfg: BoardConfig): void {
	writeFileSync(paths.config, `${Bun.YAML.stringify(cfg, null, 2).trimEnd()}\n`);
}

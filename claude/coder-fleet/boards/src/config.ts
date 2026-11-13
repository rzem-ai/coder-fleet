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

export function writeConfig(paths: BoardPaths, cfg: BoardConfig): void {
	writeFileSync(paths.config, `${Bun.YAML.stringify(cfg, null, 2).trimEnd()}\n`);
}

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { DEFAULT_DIRECTORIES } from "../constants/index.ts";
import { Core } from "../core/backlog.ts";
import { ownBoardConfig } from "./own-board-config.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

// The Definition of Done defaults this repository's board and the /init
// template ship with, and proof that a new item carries them. The files under test
// are the real ones, read from the repository, so a config edit that drops or
// rewords a default fails here.
const PLUGIN_ROOT = resolve(import.meta.dir, "../../..");
const OWN = ownBoardConfig();
const TEMPLATE_CONFIG = join(PLUGIN_ROOT, "templates", "board.config.yml");

const REPO_DEFAULTS = [
	"`bash claude/evals/lib/check-all.sh` passes on the branch",
	"The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter",
	"`migration-checklist` findings are in the PR when an agent body or skill frontmatter changed",
	"The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed",
	"The port divergence register has a row where a ported artefact changed",
	"The spec, where there is one, is linked as a reference",
];

const TEMPLATE_DEFAULTS = [
	"The reviewer approved, with a break round where the lead's step 4 calls for one",
	"The gates declared in AGENTS.md are green on the branch",
	"The spec, where there is one, is linked as a reference",
];

// What marks one of this repository's own release steps. /kickoff names the same
// four, and the template /init copies into every other project carries none.
const RELEASE_MARKERS = ["check-all.sh", "migration-checklist", "plugin.json", "marketplace.json", "divergence register"];

let TEST_DIR: string;

/** A scratch board whose config.yml is a copy of `source`, with auto-commit off so nothing touches git. */
async function boardWithConfigFrom(source: string): Promise<Core> {
	const content = await readFile(source, "utf8");
	const configPath = join(TEST_DIR, DEFAULT_DIRECTORIES.BACKLOG, "config.yml");
	await writeFile(configPath, content.replace(/^auto_commit: true$/m, "auto_commit: false"));
	return new Core(TEST_DIR);
}

describe("Definition of Done defaults in the shipped configs", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-dod-defaults-config");
		await mkdir(TEST_DIR, { recursive: true });
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await initializeTestProject(new Core(TEST_DIR), "DoD defaults");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	// A CI clone of the migrated repository has no config of its own to read;
	// that is only true when its history carries none of the fleet's files.
	if (OWN.arm === "absent") {
		it(`${OWN.label} is not in this checkout, so only the template is checked`, () => {
			expect(OWN.layout).toBe("excluded");
		});
	}

	for (const [name, source, defaults] of [
		...(OWN.arm === "absent" ? [] : [[OWN.label, OWN.file, REPO_DEFAULTS] as const]),
		["templates/board.config.yml", TEMPLATE_CONFIG, TEMPLATE_DEFAULTS] as const,
	]) {
		describe(name, () => {
			it("carries the default Definition of Done, with no plan in it", async () => {
				const core = await boardWithConfigFrom(source);
				const config = await core.filesystem.loadConfig();
				expect(config?.definitionOfDone).toEqual([...defaults]);
				for (const item of config?.definitionOfDone ?? []) expect(item.toLowerCase()).not.toContain("plan");
			});

			it("gives a newly created item every default, unticked and in order", async () => {
				const core = await boardWithConfigFrom(source);
				const { task } = await core.createTaskFromInput({
					title: "A new item",
					acceptanceCriteria: [{ text: "Something is proven", checked: false }],
				});
				const saved = await core.filesystem.loadTask(task.id);
				expect(saved?.definitionOfDoneItems?.map((item) => item.text)).toEqual([...defaults]);
				expect(saved?.definitionOfDoneItems?.every((item) => !item.checked)).toBe(true);
			});

			it("keeps the defaults when the config is saved and reloaded", async () => {
				const core = await boardWithConfigFrom(source);
				const config = await core.filesystem.loadConfig();
				if (!config) throw new Error("config did not load");
				await core.filesystem.saveConfig(config);
				const reloaded = await new Core(TEST_DIR).filesystem.loadConfig();
				expect(reloaded?.definitionOfDone).toEqual([...defaults]);
			});
		});
	}

	it("seeds other projects with none of this repository's release steps", async () => {
		const core = await boardWithConfigFrom(TEMPLATE_CONFIG);
		const config = await core.filesystem.loadConfig();
		const released = (config?.definitionOfDone ?? []).filter((item) =>
			RELEASE_MARKERS.some((marker) => item.toLowerCase().includes(marker)),
		);
		expect(released).toEqual([]);
	});
});

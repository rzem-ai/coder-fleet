// List, enable and disable fleet agents for a project by editing
// `disabledAgents` in its .claude/coder-fleet.json, and show and set its
// phase, base branch, push policy and release setting. Ported from
// scripts/fleet-agents.sh, now a shim onto `boards fleet agents`, which
// /coder-fleet:agents runs.
//
// The file it edits is the one in the main checkout (configRoot), the same
// file the spawn hook and review-round read, and it reads it through
// config.ts, so this and the hook never disagree about what it says:
//
//   - The roster is the plugin's agents/ directory, one agent per body.
//   - A name is accepted bare or coder-fleet:-prefixed, in any case, and
//     stored bare. Another plugin's prefix is not a fleet agent.
//   - lead, coder and reviewer cannot be disabled, and a name not on the
//     roster cannot be disabled either. Enabling a listed name always works.
//   - An invalid or unreadable file is never edited.
//   - The write is a temporary file in .claude/ moved over the old one, keeps
//     every other top-level key, and leaves the list sorted, deduplicated and
//     bare. A refusal or a no-op does not touch the file.
//   - Nothing is committed.
//
// Exit 0 when it listed, changed or found nothing to change; 1 when it
// refused or when what it showed was invalid; 2 on a usage error.
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_REL, CORE_AGENTS, type ConfigRead, agentDisabled, configRead, configRoot, normalise, roster, trunk } from "./config.ts";
import { fleetGit, pluginRoot } from "./proc.ts";

const USAGE =
	"usage: fleet-agents.sh [list | disable <agent> | enable <agent> | phase [build | harden] | base [<branch> | --unset] | push [all | base-only | --unset] | release [off | tag | github | --unset]]";
const TAIL = "This applies from the next spawn, with no restart. The file is written but not committed; commit it to keep the setting for the project.";
const SETTINGS_HINT =
	"Change them with /coder-fleet:agents base <branch>, push all or base-only, and release off, tag or github; --unset in place of a value clears one.";

class Exit extends Error {
	constructor(readonly code: number) {
		super(`exit ${code}`);
	}
}

function usageOk(args: string[]): boolean {
	const [verb = "list", value] = args;
	const n = args.length;
	switch (verb) {
		case "list":
			return n <= 1;
		case "disable":
		case "enable":
			return n === 2 && !!value;
		case "phase":
			return n === 1 || (n === 2 && (value === "build" || value === "harden"));
		case "base":
		case "push":
		case "release": {
			if (n === 1) return true;
			if (n !== 2) return false;
			if (value === "--unset") return true;
			if (verb === "push") return value === "all" || value === "base-only";
			if (verb === "release") return value === "off" || value === "tag" || value === "github";
			return value !== "" && !value.startsWith("-");
		}
		default:
			return false;
	}
}

function byteSort(a: string[]): string[] {
	return [...new Set(a)].sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)));
}

export function agentsCommand(args: string[]): number {
	const lines: string[] = [];
	const say = (s: string) => lines.push(s);
	let code: number;
	try {
		code = main(args, say);
	} catch (e) {
		if (!(e instanceof Exit)) throw e;
		code = e.code;
	}
	process.stdout.write(lines.join(""));
	return code;
}

function main(args: string[], say: (s: string) => void): number {
	if (!usageOk(args)) {
		process.stderr.write(`${USAGE}\n`);
		return 2;
	}
	const verb = args[0] ?? "list";
	const plugin = pluginRoot();
	const agents = roster(plugin);
	if (!agents.length) {
		say(`No agents found under ${plugin}/agents, so the roster is unknown and nothing was changed.\n`);
		return 1;
	}
	const isCore = (n: string) => CORE_AGENTS.includes(n);
	const onRoster = (n: string) => agents.includes(n);
	const cwd = process.env.PWD || process.cwd();
	const root = configRoot(cwd);
	if (!root) {
		say(
			`No main checkout could be found through git from ${cwd}, so there is no ${CONFIG_REL} to read or edit and nothing was changed. Run this from inside the project's repository.\n`,
		);
		return 1;
	}
	let c = configRead(root);
	const path = () => c.FLEET_CONFIG_PATH;
	const valid = () => c.FLEET_CONFIG_STATE === "absent" || c.FLEET_CONFIG_STATE === "ok";
	const disabled = () => c.FLEET_CONFIG_DISABLED.split(" ").filter(Boolean);
	const refuseInvalid = (): never => {
		say(
			`${path()} is ${c.FLEET_CONFIG_STATE}: ${c.FLEET_CONFIG_REASON}. This command never overwrites it, so nothing was changed. Fix the file by hand, then run the command again.\n`,
		);
		throw new Exit(1);
	};

	// Writes the file with `edit` applied to its object, through a temporary
	// file in .claude/ and a rename, keeping every other key.
	const write = (edit: (o: Record<string, unknown>) => void): boolean => {
		const file = path();
		const dir = dirname(file);
		let tmp = "";
		try {
			mkdirSync(dir, { recursive: true });
			let obj: Record<string, unknown> = {};
			let mode = 0o644;
			if (c.FLEET_CONFIG_STATE !== "absent") {
				obj = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
				mode = statSync(file).mode & 0o7777;
			}
			if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
			edit(obj);
			tmp = join(dir, `.coder-fleet.json.${Math.random().toString(36).slice(2, 8)}`);
			writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, { flag: "wx", mode: 0o600 });
			chmodSync(tmp, mode);
			renameSync(tmp, file);
			return true;
		} catch {
			if (tmp)
				try {
					unlinkSync(tmp);
				} catch {}
			return false;
		}
	};

	let listRc = 0;
	if (verb === "list") {
		if (c.FLEET_CONFIG_STATE === "absent") say(`No ${CONFIG_REL} in ${root}, so every fleet agent is enabled.\n`);
		else if (c.FLEET_CONFIG_STATE === "ok") say(`Fleet agents for ${root}, from ${CONFIG_REL}:\n`);
		else say(`${path()} is ${c.FLEET_CONFIG_STATE}: ${c.FLEET_CONFIG_REASON}. Nothing in it is honoured, so every fleet agent is enabled until it is fixed.\n`);
		for (const a of agents) {
			if (isCore(a)) say(`  ${a.padEnd(15)} enabled (core, cannot be disabled)\n`);
			else if (agentDisabled(c.FLEET_CONFIG_STATE, c.FLEET_CONFIG_DISABLED, a)) say(`  ${a.padEnd(15)} disabled\n`);
			else say(`  ${a.padEnd(15)} enabled\n`);
		}
		const strays = disabled().filter((d) => !onRoster(d));
		if (strays.length) say(`Listed under disabledAgents but not a fleet agent: ${strays.join(" ")}. /coder-fleet:agents enable <name> takes one off the list.\n`);
		say("Change one with /coder-fleet:agents disable <agent> or /coder-fleet:agents enable <agent>.\n");
		listRc = valid() ? 0 : 1;
	}

	if (verb === "phase" && args.length === 1) {
		let rc = 0;
		switch (c.FLEET_CONFIG_PHASE_STATE) {
			case "ok":
				say(`The phase is ${c.FLEET_CONFIG_PHASE}, set in ${path()}.\n`);
				break;
			case "invalid":
				say(`${path()} sets a phase this fleet does not know: ${c.FLEET_CONFIG_PHASE_REASON}. review-round reads it as build until it is fixed.\n`);
				rc = 1;
				break;
			case "unread":
				say(`The phase is harden: ${c.FLEET_CONFIG_PHASE_REASON}. A failed read never removes a break lane or a fix round.\n`);
				rc = 1;
				break;
			default:
				if (c.FLEET_CONFIG_STATE === "absent") say(`No ${CONFIG_REL} in ${root}, so the phase is build, the default.\n`);
				else say(`The phase is build, the default: ${path()} sets none.\n`);
		}
		if (!valid()) {
			say(
				`${path()} is ${c.FLEET_CONFIG_STATE}: ${c.FLEET_CONFIG_REASON}. Until it is fixed nothing in its disabledAgents is honoured, and this command will not write it.\n`,
			);
			rc = 1;
		}
		if (c.FLEET_CONFIG_PHASE === "harden") say("Harden: review-round runs the full loop of fix rounds, Low fixes and refutation.\n");
		else
			say(
				"Build: review-round runs one round, commissions no fix round, reports Low findings without fixing them, spawns a break-mode reviewer only on authentication or credential paths, and reports proposals without filing them.\n",
			);
		say("Change it with /coder-fleet:agents phase build or /coder-fleet:agents phase harden.\n");
		return rc;
	}

	if (verb === "phase") {
		const want = args[1];
		if (!valid()) refuseInvalid();
		if (c.FLEET_CONFIG_PHASE_STATE === "ok" && c.FLEET_CONFIG_PHASE === want) {
			say(`The phase is already ${want} in ${path()}. Nothing was changed.\n`);
			return 0;
		}
		if (
			!write((o) => {
				o.phase = want;
			})
		) {
			say(`Could not write ${path()}, so it was left as it was.\n`);
			return 1;
		}
		say(
			`The phase is now ${want}: ${path()} sets it. review-round reads it at the start of each run, so it applies from the next run, with no restart. The file is written but not committed; commit it to keep the setting for the project.\n`,
		);
		return 0;
	}

	// Each shows its value and where it came from, and is false when the
	// value was invalid or unread, which is never taken as the permissive one.
	const show: Record<string, () => boolean> = {
		base: () => {
			const t = trunk(root);
			c = { ...c, ...pick(t.vars) };
			if (t.ok) {
				const name = t.vars.FLEET_TRUNK;
				if (t.vars.FLEET_TRUNK_FROM === "setting") say(`The base branch is ${name}, set by baseBranch in ${path()}.\n`);
				else if (t.vars.FLEET_TRUNK_FROM === "remote") say(`The base branch is ${name}, the fallback: baseBranch is unset, and ${name} is what the remote's HEAD names.\n`);
				else say(`The base branch is ${name}, the fallback: baseBranch is unset and no remote HEAD names a branch.\n`);
				return true;
			}
			say(`The base branch is not resolved: ${t.vars.FLEET_TRUNK_REASON}. Nothing that reads the trunk acts until it is fixed.\n`);
			return false;
		},
		push: () => {
			if (c.FLEET_CONFIG_PUSH_STATE === "ok") say(`The push policy is ${c.FLEET_CONFIG_PUSH}, set by push in ${path()}.\n`);
			else if (c.FLEET_CONFIG_PUSH_STATE === "unset") say("The push policy is all, the fallback: push is unset.\n");
			else {
				say(`The push policy is ${c.FLEET_CONFIG_PUSH}, because the setting is ${c.FLEET_CONFIG_PUSH_STATE}: ${c.FLEET_CONFIG_PUSH_REASON}.\n`);
				return false;
			}
			return true;
		},
		release: () => {
			if (c.FLEET_CONFIG_RELEASE_STATE === "ok") say(`The release setting is ${c.FLEET_CONFIG_RELEASE}, set by release in ${path()}.\n`);
			else if (c.FLEET_CONFIG_RELEASE_STATE === "unset") say("The release setting is unset, which is not off: the project's shipping words decide whether it releases.\n");
			else {
				say(`The release setting is ${c.FLEET_CONFIG_RELEASE}, because the setting is ${c.FLEET_CONFIG_RELEASE_STATE}: ${c.FLEET_CONFIG_RELEASE_REASON}.\n`);
				return false;
			}
			return true;
		},
	};

	if (verb === "list") {
		show.base();
		show.push();
		show.release();
		say(`${SETTINGS_HINT}\n`);
		return listRc;
	}

	if (verb === "base" || verb === "push" || verb === "release") {
		const key = verb === "base" ? "baseBranch" : verb;
		if (args.length === 1) {
			let rc = show[verb]() ? 0 : 1;
			if (!valid()) {
				say(`${path()} is ${c.FLEET_CONFIG_STATE}: ${c.FLEET_CONFIG_REASON}. Until it is fixed this command will not write it.\n`);
				rc = 1;
			}
			say(`${SETTINGS_HINT}\n`);
			return rc;
		}
		const want = args[1];
		if (!valid()) refuseInvalid();
		const [cur, curState] =
			verb === "base"
				? [c.FLEET_CONFIG_BASE, c.FLEET_CONFIG_BASE_STATE]
				: verb === "push"
					? [c.FLEET_CONFIG_PUSH, c.FLEET_CONFIG_PUSH_STATE]
					: [c.FLEET_CONFIG_RELEASE, c.FLEET_CONFIG_RELEASE_STATE];
		if (want === "--unset") {
			if (curState === "unset") {
				say(`${key} is already unset in ${path()}. Nothing was changed.\n`);
				return 0;
			}
		} else if (curState === "ok" && cur === want) {
			say(`${key} is already ${want} in ${path()}. Nothing was changed.\n`);
			return 0;
		}
		if (verb === "base" && want !== "--unset") {
			if (!fleetGit(["check-ref-format", `refs/heads/${want}`]).ok) {
				say(`baseBranch "${want}" is not a branch name, so nothing was changed.\n`);
				return 1;
			}
			if (!fleetGit(["-C", root, "show-ref", "--verify", "-q", `refs/heads/${want}`]).ok) {
				say(`baseBranch "${want}" names no local branch in ${root}, so nothing was changed. Create the branch first.\n`);
				return 1;
			}
		}
		if (
			!write((o) => {
				if (want === "--unset") delete o[key];
				else o[key] = want;
			})
		) {
			say(`Could not write ${path()}, so it was left as it was.\n`);
			return 1;
		}
		c = configRead(root);
		if (want === "--unset") say(`${key} is now unset in ${path()}. `);
		else say(`${key} is now ${want} in ${path()}. `);
		show[verb]();
		say("The file is written but not committed; commit it to keep the setting for the project.\n");
		return 0;
	}

	const raw = args[1];
	const name = normalise(raw);
	// The agent-name shape config.ts enforces. Normalising drops only this
	// plugin's prefix, so another plugin's "other:researcher" fails here.
	const notFleet = (): never => {
		say(`${raw} is not a fleet agent, so nothing was changed. The fleet agents are: ${agents.join(" ")}\n`);
		throw new Exit(1);
	};
	if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) notFleet();
	const writeList = (list: string[]) =>
		write((o) => {
			o.disabledAgents = byteSort(list.filter(Boolean));
		});

	if (verb === "disable") {
		if (isCore(name)) {
			say(`${name} cannot be disabled: lead, coder and reviewer are the core of the fleet. Nothing was changed.\n`);
			return 1;
		}
		if (!onRoster(name)) notFleet();
		if (!valid()) refuseInvalid();
		if (disabled().includes(name)) {
			say(`${name} is already disabled in ${path()}. Nothing was changed.\n`);
			return 0;
		}
		if (!writeList([...disabled(), name])) {
			say(`Could not write ${path()}, so it was left as it was.\n`);
			return 1;
		}
		say(`${name} is now disabled: ${path()} lists it under disabledAgents. ${TAIL}\n`);
		return 0;
	}

	// enable
	if (isCore(name)) {
		say(`${name} is a core agent and is always enabled. Nothing was changed.\n`);
		return 0;
	}
	if (!valid()) refuseInvalid();
	if (!disabled().includes(name)) {
		if (!onRoster(name)) notFleet();
		say(`${name} is not disabled, so there was nothing to enable. Nothing was changed.\n`);
		return 0;
	}
	if (!writeList(disabled().filter((d) => d !== name))) {
		say(`Could not write ${path()}, so it was left as it was.\n`);
		return 1;
	}
	say(`${name} is enabled again: it is no longer listed under disabledAgents in ${path()}. ${TAIL}\n`);
	return 0;
}

// The FLEET_CONFIG_* part of a trunk answer, which rereads the file.
function pick(vars: ConfigRead): ConfigRead {
	return Object.fromEntries(Object.entries(vars).filter(([k]) => k.startsWith("FLEET_CONFIG_")));
}

// `boards fleet disabled-agents`: PreToolUse on the Agent tool, a project's
// disabled agents are never spawned. Ported from hooks/enforce-disabled-agents.sh,
// now a shim that pipes the hook's input here; its header keeps the reasons.
//
// It denies an Agent or Task call whose subagent_type, bare or
// coder-fleet:-prefixed, the main checkout's .claude/coder-fleet.json lists
// under disabledAgents (config.ts states the rules and reads the file on
// every call). The repository is found from CLAUDE_PROJECT_DIR when it is a
// directory, else from the call's cwd. An invalid file honours nothing, and
// every Agent call carries a warning saying why.
//
// Input that is not JSON, or any other error, allows the call and logs why.
// The shim refuses only when this program cannot run, or prints neither the
// word allow nor a JSON object.
//
//   boards fleet disabled-agents             the hook: prints allow or JSON
//   boards fleet disabled-agents --check [dir]
//       validates the file in the main checkout of dir's repository (default:
//       the current directory), prints what it disables, warns on a name that
//       matches no fleet agent, and exits 1 when the file is invalid.
import { agentDisabled, CONFIG_REL, configRead, configRoot, normalise, roster } from "./config.ts";
import { denyJson, hookLog, hooksLogFile, parseEvent, readInput, str } from "./hook.ts";
import { isDir, pluginRoot } from "./proc.ts";

const HOOK = "DisabledAgents";
const log = (m: string) => hookLog(HOOK, m, hooksLogFile());

export function check(dirArg: string | undefined): number {
	const dir = dirArg || process.env.PWD || process.cwd();
	const root = configRoot(dir) ?? "";
	const c = configRead(root);
	const out = (s: string) => process.stdout.write(`${s}\n`);
	switch (c.FLEET_CONFIG_STATE) {
		case "unresolved":
			out(`${dir}: no main checkout found through git, so no ${CONFIG_REL} is read and every agent is enabled`);
			return 0;
		case "absent":
			out(`${root}: no ${CONFIG_REL}, so every agent is enabled`);
			return 0;
		case "ok": {
			const disabled = c.FLEET_CONFIG_DISABLED;
			if (!disabled) {
				out(`${root}: ${CONFIG_REL} disables nothing`);
				return 0;
			}
			out(`${root}: ${CONFIG_REL} disables ${disabled}`);
			// A name that matches no fleet agent disables nothing, usually a typo.
			// A warning only: the file stays valid.
			const names = roster(pluginRoot());
			if (names.length) {
				const list = names.join(" ");
				for (const entry of disabled.split(/\s+/).filter(Boolean)) {
					if (names.includes(entry)) continue;
					out(`warning: ${CONFIG_REL} lists "${entry}" under disabledAgents, which matches no fleet agent, so it disables nothing. The fleet agents are: ${list}`);
				}
			}
			return 0;
		}
		default:
			process.stderr.write(`${root}: ${CONFIG_REL} is invalid: ${c.FLEET_CONFIG_REASON}. Nothing in it is honoured until it is fixed.\n`);
			return 1;
	}
}

export function decide(input: string): string {
	// Only the subagent tool is this hook's business.
	if (!input.includes('"Agent"') && !input.includes('"Task"')) return "allow";
	const ev = parseEvent(input);
	if (!ev) {
		log("hook input is not valid JSON; allowing the call");
		return "allow";
	}
	const toolName = str(ev.tool_name);
	const ti = ev.tool_input;
	const rawType = ti && typeof ti === "object" && !Array.isArray(ti) ? (ti as Record<string, unknown>).subagent_type : undefined;
	const subagentType = str(rawType).replace(/[\r\n\x1f]/g, "");
	const cwd = str(ev.cwd).replace(/[\r\n\x1f]/g, "");
	if (toolName !== "Agent" && toolName !== "Task") return "allow";

	// The session's project directory first, when it is one: the event's cwd
	// follows a cd, so a lead that steps into another worktree would otherwise
	// move the resolution with it.
	const projectDir = process.env.CLAUDE_PROJECT_DIR;
	const start = projectDir && isDir(projectDir) ? projectDir : cwd;
	const root = configRoot(start) ?? "";
	const c = configRead(root);
	const spawn = subagentType || "a spawn with no type";

	switch (c.FLEET_CONFIG_STATE) {
		case "absent":
			return "allow";
		case "unresolved":
			log(`no main checkout found from ${start || "the current directory"}; reading no config, allowing ${spawn}`);
			return "allow";
		case "ok":
			break;
		default: {
			const msg = `coder-fleet: ${root}/${CONFIG_REL} is invalid (${c.FLEET_CONFIG_REASON}), so none of its disabledAgents entries is honoured and every fleet agent stays enabled. Fix the file: lead, coder and reviewer cannot be disabled.`;
			log(`config at ${root} is ${c.FLEET_CONFIG_STATE} (${c.FLEET_CONFIG_REASON}); honouring nothing, allowing ${spawn}`);
			return JSON.stringify({ systemMessage: msg, hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: msg } });
		}
	}

	if (!subagentType) return "allow";
	if (!agentDisabled(c.FLEET_CONFIG_STATE, c.FLEET_CONFIG_DISABLED, subagentType)) return "allow";
	const name = normalise(subagentType);
	const reason = `${name} is disabled for this project: ${CONFIG_REL} lists it under disabledAgents (${root}/${CONFIG_REL}). Do not retry this spawn, and do not spawn another agent or run its work yourself in its place - the project chose to go without it. To enable it again, remove "${name}" from disabledAgents in that file; the next spawn reads it.`;
	log(`denied a ${subagentType} spawn: ${root}/${CONFIG_REL} disables ${name}`);
	return denyJson(reason);
}

export async function disabledAgentsCommand(args: string[]): Promise<number> {
	if (args[0] === "--check") return check(args[1]);
	let out: string;
	try {
		out = decide(await readInput());
	} catch (e) {
		log(`unexpected error (${(e as Error).message ?? e}); allowing the call`);
		out = "allow";
	}
	process.stdout.write(`${out}\n`);
	return 0;
}

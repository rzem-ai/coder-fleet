// `boards fleet <tool> ...`: the fleet's own rules and helper scripts, kept
// apart from the board's code (CF-207 comments 29 to 31). Each tool was a
// bash or Python file under hooks/ or scripts/, which is now a shim that
// passes its arguments here, so every caller and contract test reaches this
// code unchanged.
//
// Each tool's module is loaded only when it runs, so a hook that fires on
// every tool call pays for its own code and nothing else.

export const FLEET_TOOLS = [
	"config",
	"challenge-gate",
	"remote-guard",
	"reviewer-modes",
	"gates",
	"trunk",
	"agents",
	"prune-worktrees",
	"exclude",
	"editor-leftovers",
	"clock",
	"disabled-agents",
] as const;

const USAGE = `usage: boards fleet <tool> ...

  config            read .claude/coder-fleet.json, find the main checkout and the trunk
  challenge-gate    the spec-editor challenge gate, and the close after it
  remote-guard      the config keys, URLs and log text a hook may hand to git
  reviewer-modes    which modes a reviewer's brief gives it
  gates             the old board's test gate and card gate into Done
  trunk             print the trunk of the repository a directory is in
  agents            list, enable and disable fleet agents, and set the phase, base, push and release
  prune-worktrees   remove the agent worktrees whose work has been adopted
  exclude           keep the fleet's files out of a project's history
  editor-leftovers  find and remove what an earlier /init wrote for the editors
  clock             the hook: a break-mode reviewer's wall-clock cap
  disabled-agents   the hook: refuse a spawn of a disabled agent; --check [dir] validates the file
`;

export async function runFleet(args: string[]): Promise<number> {
	const [tool, ...rest] = args;
	switch (tool) {
		case "config":
			return (await import("./config.ts")).configCommand(rest);
		case "challenge-gate":
			return (await import("./challenge-gate.ts")).challengeGateCommand(rest);
		case "remote-guard":
			return (await import("./remote-guard.ts")).remoteGuardCommand(rest);
		case "reviewer-modes":
			return (await import("./reviewer-modes.ts")).reviewerModesCommand(rest);
		case "gates":
			return (await import("./gates.ts")).gatesCommand(rest);
		case "trunk":
			return (await import("./config.ts")).trunkCommand(rest);
		case "agents":
			return (await import("./agents.ts")).agentsCommand(rest);
		case "prune-worktrees":
			return (await import("./prune-worktrees.ts")).pruneWorktreesCommand(rest);
		case "exclude":
			return (await import("./exclude.ts")).excludeCommand(rest);
		case "editor-leftovers":
			return (await import("./editor-leftovers.ts")).editorLeftoversCommand(rest);
		case "clock":
			return (await import("./clock.ts")).clockCommand();
		case "disabled-agents":
			return (await import("./disabled-agents.ts")).disabledAgentsCommand(rest);
		default:
			process.stderr.write(USAGE);
			return 2;
	}
}

// `boards fleet <tool> ...`: the fleet's own rules and helper scripts, kept
// apart from the board's code (CF-207 comments 29 to 31). Each tool was a
// bash or Python file under hooks/lib/ or scripts/, which is now a shim that
// passes its arguments here, so every caller and contract test reaches this
// code unchanged.
import { challengeGateCommand } from "./challenge-gate.ts";
import { configCommand } from "./config.ts";

export const FLEET_TOOLS = ["config", "challenge-gate"] as const;

const USAGE = `usage: boards fleet <tool> ...

  config          read .claude/coder-fleet.json, find the main checkout and the trunk
  challenge-gate  the spec-editor challenge gate, and the close after it
`;

export async function runFleet(args: string[]): Promise<number> {
	const [tool, ...rest] = args;
	switch (tool) {
		case "config":
			return configCommand(rest);
		case "challenge-gate":
			return challengeGateCommand(rest);
		default:
			process.stderr.write(USAGE);
			return 2;
	}
}

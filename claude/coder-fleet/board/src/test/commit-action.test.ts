import { describe, expect, it } from "bun:test";
import { describeTaskUpdate } from "../git/commit-action.ts";

describe("describeTaskUpdate", () => {
	it("names a column move, with the canonical status", () => {
		expect(describeTaskUpdate("CF-1", { status: "in progress" }, "In Progress")).toEqual({
			action: "Move CF-1 to In Progress",
		});
	});

	it("gives a move into a Blocked column its comment as the body, and no other move", () => {
		const comment = { body: "Blocked by human. coder raised 1 blocker(s).\n- Which key?", author: "@SubagentStop" };
		expect(describeTaskUpdate("CF-1", { status: "Blocked by human", appendComments: [comment] })).toEqual({
			action: "Move CF-1 to Blocked by human",
			body: comment.body,
		});
		expect(describeTaskUpdate("CF-1", { status: "Blocked", appendComments: ["  Tests failed.  "] }).body).toBe(
			"Tests failed.",
		);
		expect(describeTaskUpdate("CF-1", { status: "In Progress", appendComments: ["started"] })).toEqual({
			action: "Move CF-1 to In Progress",
		});
		expect(describeTaskUpdate("CF-1", { status: "Blocked" })).toEqual({ action: "Move CF-1 to Blocked" });
	});

	it("names the Actions for Human before a comment", () => {
		expect(describeTaskUpdate("CF-1", { addActionsForHuman: ["A?", "B?"], appendComments: ["c"] }).action).toBe(
			"Add 2 actions for the human to CF-1",
		);
		expect(describeTaskUpdate("CF-1", { checkActionsForHuman: [1] }).action).toBe("Tick action 1 on CF-1");
		expect(describeTaskUpdate("CF-1", { uncheckActionsForHuman: [1, 2] }).action).toBe("Untick actions 1, 2 on CF-1");
		expect(describeTaskUpdate("CF-1", { clearActionsForHuman: { reason: "void" } }).action).toBe(
			"Clear the Actions for Human on CF-1",
		);
	});

	it("names comments, criteria and the Definition of Done", () => {
		expect(describeTaskUpdate("CF-1", { appendComments: ["a"] }).action).toBe("Add a comment to CF-1");
		expect(describeTaskUpdate("CF-1", { appendComments: ["a", "b"] }).action).toBe("Add 2 comments to CF-1");
		expect(describeTaskUpdate("CF-1", { checkAcceptanceCriteria: [2] }).action).toBe("Tick criterion 2 on CF-1");
		expect(describeTaskUpdate("CF-1", { uncheckAcceptanceCriteria: [1, 3] }).action).toBe(
			"Untick criteria 1, 3 on CF-1",
		);
		expect(describeTaskUpdate("CF-1", { addAcceptanceCriteria: ["x"] }).action).toBe("Add 1 criterion to CF-1");
		expect(describeTaskUpdate("CF-1", { removeAcceptanceCriteria: [4] }).action).toBe("Remove criterion 4 from CF-1");
		expect(describeTaskUpdate("CF-1", { acceptanceCriteria: [] }).action).toBe(
			"Rewrite the acceptance criteria on CF-1",
		);
		expect(describeTaskUpdate("CF-1", { checkDefinitionOfDone: [1, 2] }).action).toBe(
			"Tick Definition of Done items 1, 2 on CF-1",
		);
	});

	it("names the fields an edit set, and a title alone as a rename", () => {
		expect(describeTaskUpdate("CF-1", { title: "New" }).action).toBe("Rename CF-1");
		expect(describeTaskUpdate("CF-1", { title: "New", priority: "high" }).action).toBe(
			"Update the title and priority on CF-1",
		);
		expect(
			describeTaskUpdate("CF-1", { addLabels: ["a"], removeLabels: [], ordinal: 3, finalSummary: "s" }).action,
		).toBe("Update the labels, final summary and order on CF-1");
		expect(describeTaskUpdate("CF-1", { clearImplementationNotes: true }).action).toBe("Update the notes on CF-1");
	});

	it("falls back to a bare Update only when nothing it knows was set", () => {
		expect(describeTaskUpdate("CF-1", {}).action).toBe("Update CF-1");
		expect(describeTaskUpdate("CF-1", { removeLabels: [], clearFinalSummary: false }).action).toBe("Update CF-1");
	});
});

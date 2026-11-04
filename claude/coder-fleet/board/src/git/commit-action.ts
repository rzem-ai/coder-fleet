// What a task edit did, as the imperative action a board commit's subject
// opens with. One function for every writer (the CLI, the MCP server, the web
// UI), so an edit reads the same in the log whoever made it, and none of them
// falls back to a bare "Update <id>" that hides the change.
import type { TaskCommentInput, TaskUpdateInput } from "../types/index.ts";

export interface CommitAction {
	action: string;
	/** The reason behind the write, for the commit body. Only a move to a Blocked column has one. */
	body?: string;
}

/** A column a card waits in for someone, so the comment that moved it there is the why. */
const BLOCKED = /^blocked\b/i;

function plural(count: number, one: string, many: string): string {
	return count === 1 ? one : many;
}

function numbers(values: readonly number[]): string {
	return values.join(", ");
}

/** `a`, `a and b`, `a, b and c`. */
function joinNames(names: readonly string[]): string {
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function commentText(comment: TaskCommentInput | string): string {
	return (typeof comment === "string" ? comment : comment.body).trim();
}

/** A tick, untick, add or remove on a numbered list, or undefined when the edit leaves it alone. */
function listEdit(
	id: string,
	one: string,
	many: string,
	edit: { check?: number[]; uncheck?: number[]; add?: unknown[]; remove?: number[] },
): string | undefined {
	if (edit.check?.length) return `Tick ${plural(edit.check.length, one, many)} ${numbers(edit.check)} on ${id}`;
	if (edit.uncheck?.length) return `Untick ${plural(edit.uncheck.length, one, many)} ${numbers(edit.uncheck)} on ${id}`;
	if (edit.add?.length) return `Add ${edit.add.length} ${plural(edit.add.length, one, many)} to ${id}`;
	if (edit.remove?.length) return `Remove ${plural(edit.remove.length, one, many)} ${numbers(edit.remove)} from ${id}`;
	return undefined;
}

/** The fields an edit sets, by the name a reader knows them by, in a fixed order. */
function fieldNames(input: TaskUpdateInput): string[] {
	const touched = (...values: unknown[]) =>
		values.some((value) => (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false));
	const fields: Array<[string, boolean]> = [
		["title", touched(input.title)],
		["description", touched(input.description)],
		["priority", touched(input.priority)],
		["type", touched(input.type)],
		["project", touched(input.project)],
		["milestone", touched(input.milestone)],
		["labels", touched(input.labels, input.addLabels, input.removeLabels)],
		["assignee", touched(input.assignee)],
		["dependencies", touched(input.dependencies, input.addDependencies, input.removeDependencies)],
		["references", touched(input.references, input.addReferences, input.removeReferences)],
		["documentation", touched(input.documentation, input.addDocumentation, input.removeDocumentation)],
		["modified files", touched(input.modifiedFiles)],
		["plan", touched(input.implementationPlan, input.appendImplementationPlan, input.clearImplementationPlan)],
		["notes", touched(input.implementationNotes, input.appendImplementationNotes, input.clearImplementationNotes)],
		["final summary", touched(input.finalSummary, input.appendFinalSummary, input.clearFinalSummary)],
		["due date", touched(input.dueDate)],
		["order", touched(input.ordinal)],
		["content", touched(input.rawContent)],
	];
	return fields.filter(([, set]) => set).map(([name]) => name);
}

/**
 * The action for an edit to task `id`, naming the one thing a reader most
 * needs from the log, in this order: a column move, the Actions for Human, a
 * comment, the acceptance criteria, the Definition of Done, then the fields it
 * set. `status` is the column the card is in after the edit, canonical, since
 * the input may spell it in any case. A move into a Blocked column carries the
 * comments that went with it as the body, which is the why of the block.
 */
export function describeTaskUpdate(id: string, input: TaskUpdateInput, status?: string): CommitAction {
	const comments = input.appendComments ?? [];
	if (input.status !== undefined) {
		const column = status ?? input.status;
		const reason = comments.map(commentText).filter(Boolean).join("\n\n");
		return BLOCKED.test(column) && reason
			? { action: `Move ${id} to ${column}`, body: reason }
			: { action: `Move ${id} to ${column}` };
	}
	if (input.clearActionsForHuman) return { action: `Clear the Actions for Human on ${id}` };
	const actions = listEdit(id, "action", "actions", {
		check: input.checkActionsForHuman,
		uncheck: input.uncheckActionsForHuman,
	});
	if (input.addActionsForHuman?.length) {
		const count = input.addActionsForHuman.length;
		return { action: `Add ${count} ${plural(count, "action", "actions")} for the human to ${id}` };
	}
	if (actions) return { action: actions };
	if (comments.length)
		return { action: comments.length === 1 ? `Add a comment to ${id}` : `Add ${comments.length} comments to ${id}` };
	if (input.acceptanceCriteria !== undefined) return { action: `Rewrite the acceptance criteria on ${id}` };
	const criteria = listEdit(id, "criterion", "criteria", {
		check: input.checkAcceptanceCriteria,
		uncheck: input.uncheckAcceptanceCriteria,
		add: input.addAcceptanceCriteria,
		remove: input.removeAcceptanceCriteria,
	});
	if (criteria) return { action: criteria };
	const done = listEdit(id, "Definition of Done item", "Definition of Done items", {
		check: input.checkDefinitionOfDone,
		uncheck: input.uncheckDefinitionOfDone,
		add: input.addDefinitionOfDone,
		remove: input.removeDefinitionOfDone,
	});
	if (done) return { action: done };
	const fields = fieldNames(input);
	if (fields.length === 1 && fields[0] === "title") return { action: `Rename ${id}` };
	if (fields.length > 0) return { action: `Update the ${joinNames(fields)} on ${id}` };
	return { action: `Update ${id}` };
}

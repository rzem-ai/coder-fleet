import type { TaskDetail } from "../../core/task-detail.ts";
import { formatTaskPlainText } from "../../formatters/task-plain-text.ts";
import type { Task } from "../../types/index.ts";
import { formatDependencyCleanupMessage } from "../../utils/dependency-graph.ts";
import type { CallToolResult } from "../types.ts";

/** Every MCP task result renders through the one plain serializer, so they all read the same. */
export async function formatTaskCallResult(
	task: TaskDetail,
	summaryLines: string[] = [],
	options: Parameters<typeof formatTaskPlainText>[1] = {},
): Promise<CallToolResult> {
	const formattedTask = formatTaskPlainText(task, options);
	const summary = summaryLines.filter((line) => line.trim().length > 0).join("\n");
	const text = summary ? `${summary}\n\n${formattedTask}` : formattedTask;

	return textResult(text);
}

function textResult(text: string): CallToolResult {
	return { content: [{ type: "text", text }] };
}

// CF-146: task_create and task_edit answer with a short acknowledgement rather than the whole card,
// which upstream returned and which ran to 67 KB on a long card. task_view still returns the card.

/** The card fields an edit can change, in the order the acknowledgement names them. */
const ACKNOWLEDGED_FIELDS: ReadonlyArray<readonly [string, (task: Task) => unknown]> = [
	["title", (task) => task.title],
	["status", (task) => task.status],
	["priority", (task) => task.priority],
	["type", (task) => task.type],
	["project", (task) => task.project],
	["milestone", (task) => task.milestone],
	["ordinal", (task) => task.ordinal],
	["dueDate", (task) => task.dueDate],
	["assignee", (task) => task.assignee],
	["labels", (task) => task.labels],
	["dependencies", (task) => task.dependencies],
	["references", (task) => task.references],
	["documentation", (task) => task.documentation],
	["modifiedFiles", (task) => task.modifiedFiles],
	["description", (task) => task.description],
	["implementationPlan", (task) => task.implementationPlan],
	["implementationNotes", (task) => task.implementationNotes],
	["finalSummary", (task) => task.finalSummary],
	["acceptanceCriteria", (task) => checklistKey(task.acceptanceCriteriaItems)],
	["definitionOfDone", (task) => checklistKey(task.definitionOfDoneItems)],
	["comments", (task) => (task.comments ?? []).map((comment) => [comment.index, comment.author ?? "", comment.body])],
	["actionsForHuman", (task) => checklistKey(task.actionsForHumanItems)],
];

/** More cleaned ids than this and the cleanup line gives a count, so the acknowledgement stays short. */
const CLEANUP_IDS_LISTED = 5;

function checklistKey(items: Task["acceptanceCriteriaItems"]): unknown {
	return (items ?? []).map((item) => [item.index, item.checked, item.text]);
}

/** Absent, empty string and empty list all read as "no value", so moving between them is no change. */
function comparable(value: unknown): string {
	if (value === undefined || value === null || value === "") return "null";
	if (Array.isArray(value) && value.length === 0) return "null";
	return JSON.stringify(value);
}

/** "#3", "#2-#4", "#1, #5-#6": contiguous numbers collapse to a range. */
function formatNumbers(numbers: number[]): string {
	const sorted = [...new Set(numbers)].sort((a, b) => a - b);
	const runs: string[] = [];
	let start = sorted[0];
	let end = start;
	for (const value of sorted.slice(1)) {
		if (value === (end as number) + 1) {
			end = value;
			continue;
		}
		runs.push(start === end ? `#${start}` : `#${start}-#${end}`);
		start = value;
		end = value;
	}
	if (start !== undefined) runs.push(start === end ? `#${start}` : `#${start}-#${end}`);
	return runs.join(", ");
}

function appendedLine(noun: string, before: Array<{ index: number }>, after: Array<{ index: number }>): string | null {
	const known = new Set(before.map((item) => item.index));
	const added = after.map((item) => item.index).filter((index) => !known.has(index));
	if (added.length === 0) return null;
	return `Appended ${noun}${added.length === 1 ? "" : "s"} ${formatNumbers(added)}.`;
}

/**
 * The task_edit acknowledgement: the id, the fields whose value differs between `before` and
 * `after`, the numbers of the comments and actions the edit appended, and upstream's dependency
 * cleanup line, which names the card by its id before the edit. `before` must be a copy taken before the edit, since the store may hand back the
 * object it then mutates; null when the card could not be read beforehand.
 */
export function formatTaskEditAcknowledgement(
	before: Task | null,
	after: Task,
	cleanedTaskIds: readonly string[] = [],
): string {
	// A demotion or a promotion gives the card a new id, so the old one is named beside it.
	const id = before?.id ?? after.id;
	const lines = [id === after.id ? `Updated task ${id}.` : `Updated task ${id} (now ${after.id}).`];
	if (before) {
		const changed = ACKNOWLEDGED_FIELDS.filter(([, read]) => comparable(read(before)) !== comparable(read(after))).map(
			([name]) => name,
		);
		lines.push(`Changed: ${changed.length > 0 ? changed.join(", ") : "nothing"}.`);
		const comments = appendedLine("comment", before.comments ?? [], after.comments ?? []);
		if (comments) lines.push(comments);
		const actions = appendedLine("action", before.actionsForHumanItems ?? [], after.actionsForHumanItems ?? []);
		if (actions) lines.push(actions);
	} else {
		lines.push("Changed: not known, the card could not be read before the edit.");
	}
	if (cleanedTaskIds.length > CLEANUP_IDS_LISTED) {
		lines.push(`Removed references to ${id} from ${cleanedTaskIds.length} tasks.`);
	} else {
		const cleanup = formatDependencyCleanupMessage(id, cleanedTaskIds);
		if (cleanup) lines.push(`${cleanup}.`);
	}
	return lines.join("\n");
}

export function taskEditAcknowledgement(
	before: Task | null,
	after: Task,
	cleanedTaskIds: readonly string[] = [],
): CallToolResult {
	return textResult(formatTaskEditAcknowledgement(before, after, cleanedTaskIds));
}

/** The task_create acknowledgement: the id, the title and the file the card was written to. */
export function taskCreateAcknowledgement(task: Task): CallToolResult {
	return textResult(`Created task ${task.id}: ${task.title}\nFile: ${task.filePath ?? "not known"}`);
}

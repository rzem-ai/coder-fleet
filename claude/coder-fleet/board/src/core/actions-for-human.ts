import type { AcceptanceCriterion, Task, TaskComment } from "../types/index.ts";
import { isTerminalStatus } from "../utils/terminal-status.ts";

/**
 * The rules for the Actions for Human section (CF-25), in one place for every writer: the CLI, MCP,
 * the web server and the board moves all reach them through Core.
 */

/** The one column the human monitors. Matched ignoring case and spaces, as the hooks match it. */
export const HUMAN_QUEUE_STATUS = "Blocked by human";

/** Marks an ask that is not phrased as a question, so a likely false blocker shows at once. */
export const NOT_A_QUESTION_PREFIX = "[not a question] ";

/** The author of every archive comment. The commit's Board-Writer trailer names who made the write. */
export const ARCHIVE_COMMENT_AUTHOR = "@board";

/** Who the lead's clear names when the caller gives no author. */
export const DEFAULT_CLEAR_AUTHOR = "@lead";

function squashStatus(status: string | undefined): string {
	return (status ?? "").toLowerCase().replace(/\s+/g, "");
}

export function isHumanQueueStatus(status: string | undefined): boolean {
	return squashStatus(status) === squashStatus(HUMAN_QUEUE_STATUS);
}

/**
 * One line of text: every whitespace run, newlines included, becomes one space, and `<!--` is
 * written `&lt;!--` so no text can form a board marker or trip the comment marker check.
 */
function toOneSafeLine(text: string): string {
	return String(text ?? "")
		.replace(/\s+/g, " ")
		.trim()
		.replaceAll("<!--", "&lt;!--");
}

/** Who a lead's clear is credited to: one safe line, as the reason is, or the default. */
export function normaliseClearAuthor(author?: string): string {
	return toOneSafeLine(author ?? "") || DEFAULT_CLEAR_AUTHOR;
}

/** The stored form of an ask. Refuses one with no text. */
export function normaliseActionText(text: string): string {
	const normalised = toOneSafeLine(text);
	if (normalised.length === 0) {
		throw new Error("An action for the human cannot be empty: give the ask as text, ideally a question ending in ?.");
	}
	return normalised;
}

/** Adds the not-a-question prefix unless the ask ends in "?" once right-trimmed, or already carries it. */
export function flagAction(text: string): string {
	if (text.trimEnd().endsWith("?") || text.startsWith(NOT_A_QUESTION_PREFIX)) return text;
	return `${NOT_A_QUESTION_PREFIX}${text}`;
}

/** The lead's clear needs a reason, and it lands in a comment, so it is made one safe line too. */
export function normaliseClearReason(reason: string): string {
	const normalised = toOneSafeLine(reason);
	if (normalised.length === 0) {
		throw new Error("Clearing the Actions for Human needs a reason, which the archive comment records.");
	}
	return normalised;
}

/**
 * The one archive shape: the headline, a blank line, then one line per action. The lines are
 * deliberately not checkbox lines, so no checklist parser can ever read the comment as a checklist.
 * Each text is made one safe line again, since a hand-edited action can carry a `<!--` that no add
 * ever escaped, and the comment would then be refused and the move with it.
 */
export function archiveComment(items: AcceptanceCriterion[], headline: string): string {
	const lines = [...items]
		.sort((a, b) => a.index - b.index)
		.map((item) => `- #${item.index} ${item.checked ? "(ticked)" : "(open)"} ${toOneSafeLine(item.text)}`);
	return [headline, "", ...lines].join("\n");
}

export function moveHeadline(taskId: string, from: string, to: string): string {
	return `Actions for Human cleared: ${taskId} moved from ${from} to ${to}.`;
}

export function leadClearHeadline(author: string, reason: string): string {
	return `Actions for Human cleared by ${author}, moving no column: ${reason}`;
}

function nowStamp(): string {
	return new Date().toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Empties the section and appends the archive comment, as new arrays, so a task object shared with
 * a store is never mutated in place. Returns false, changing nothing, when the section is empty.
 */
export function clearActionsWithArchive(task: Task, headline: string): boolean {
	const items = task.actionsForHumanItems ?? [];
	if (items.length === 0) return false;
	const comments = task.comments ?? [];
	const nextIndex = comments.length > 0 ? Math.max(...comments.map((comment) => comment.index)) + 1 : 1;
	const archive: TaskComment = {
		index: nextIndex,
		body: archiveComment(items, headline),
		createdDate: nowStamp(),
		author: ARCHIVE_COMMENT_AUTHOR,
	};
	task.comments = [...comments, archive];
	task.actionsForHumanItems = [];
	return true;
}

/**
 * Whether a status change clears the section: leaving Blocked by human for anything, or entering the
 * terminal status from anywhere else. A write that stays in Blocked by human, or any other move,
 * does not.
 */
export function statusChangeClearsActions(from: string, to: string, statuses: readonly string[]): boolean {
	if (squashStatus(from) === squashStatus(to)) return false;
	if (isHumanQueueStatus(from)) return true;
	return isTerminalStatus(to, statuses) && !isTerminalStatus(from, statuses);
}

/**
 * Called on every status write before the save, so the clear and its archive are one write and one
 * commit. Returns true when it cleared the section.
 */
export function settleActionsOnStatusChange(
	task: Task,
	from: string,
	to: string,
	statuses: readonly string[],
): boolean {
	if ((task.actionsForHumanItems ?? []).length === 0) return false;
	if (!statusChangeClearsActions(from, to, statuses)) return false;
	return clearActionsWithArchive(task, moveHeadline(task.id, from, to));
}

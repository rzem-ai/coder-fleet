import type { AcceptanceCriterion } from "../../types";

/** The first action still waiting on the human, in number order, or none. */
export function firstOpenAction(items: AcceptanceCriterion[] | undefined): AcceptanceCriterion | undefined {
	return (items ?? [])
		.slice()
		.sort((a, b) => a.index - b.index)
		.find((item) => !item.checked);
}

/**
 * Shortens an ask for the kanban card to at most `max` characters, ending in an ellipsis when cut.
 * It cuts from the end, so the "[not a question] " prefix always survives.
 */
export function truncateAction(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

// A board's eight columns, in the order every view shows them. A card's
// column is the `column` field of its frontmatter, and only moveCard in
// src/moves.ts changes it.
export const COLUMNS = ["Draft", "Backlog", "Next", "In Progress", "Done", "Released", "Blocked", "Blocked by Human"] as const;

export type Column = (typeof COLUMNS)[number];

export function isColumn(name: unknown): name is Column {
	return typeof name === "string" && (COLUMNS as readonly string[]).includes(name);
}

// Where a new card is filed.
export const FIRST_COLUMN: Column = "Draft";

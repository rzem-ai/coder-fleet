import { generateTaskListSchema, generateTaskSearchSchema } from "../../utils/schema-generators.ts";
import type { JsonSchema } from "../../validation/validators.ts";

export const taskListSchema: JsonSchema = generateTaskListSchema({});

export const taskSearchSchema: JsonSchema = generateTaskSearchSchema({});

export const taskViewSchema: JsonSchema = {
	type: "object",
	properties: {
		id: {
			type: "string",
			minLength: 1,
			maxLength: 50,
		},
	},
	required: ["id"],
	additionalProperties: false,
};

export const taskArchiveSchema: JsonSchema = {
	type: "object",
	properties: {
		id: {
			type: "string",
			minLength: 1,
			maxLength: 50,
		},
	},
	required: ["id"],
	additionalProperties: false,
};

/** One of `id` or `ids`: several Done cards cleared together make one commit, not one each. */
export const taskCompleteSchema: JsonSchema = {
	type: "object",
	properties: {
		id: {
			type: "string",
			minLength: 1,
			maxLength: 50,
		},
		ids: {
			type: "array",
			maxItems: 500,
			items: { type: "string", minLength: 1, maxLength: 50 },
		},
	},
	required: [],
	additionalProperties: false,
};

export const taskDemoteSchema: JsonSchema = {
	type: "object",
	properties: {
		id: {
			type: "string",
			minLength: 1,
			maxLength: 50,
		},
	},
	required: ["id"],
	additionalProperties: false,
};

// lib/ai/actionTools.ts
// Tool/function-calling schemas for the Teams bot's "act on the app"
// capability (see app/api/teams/bot/[companyId]/route.ts and
// lib/ai/actions.ts). Field names here are the human-readable strings the
// model is asked to extract (project_name, assignee_name) -- resolving
// those to real project_id/assignee_id happens after the model call, in
// lib/ai/actions.ts's resolve* functions, never trusted from the model
// directly. Together AI's chat completions endpoint supports this
// OpenAI-style `tools` shape (confirmed against their docs 2026-07-23).
//
// Observed in testing: with tool_choice "auto", the model called
// create_project (inventing the placeholder name "My Project") in response
// to a plain "Hi are you live?" -- a casual message with zero actual
// request to create anything. Passing `tools` alone isn't enough; the
// system prompt needs to explicitly discourage speculative tool calls, or
// the model treats "a tool exists" as license to use it. This message is
// appended as its own system message (see the bot route) only for the
// tool-calling call, not the plain RAG chat path, which has no tools to
// misuse in the first place.
export const TOOL_USE_GUARDRAILS =
  "You also have tools for creating/updating tasks and projects. Only call one of these when the user is clearly and explicitly asking you to create or change something specific, using real details they actually provided. Never invent a placeholder name, project, or value to fill a required field. For greetings, small talk, or questions that aren't a clear action request, respond normally in plain text without calling any tool. If a request is action-like but missing a required detail (e.g. no project name for a new task), ask a clarifying question in plain text instead of guessing or calling a tool with incomplete or invented information.";

import type { FieldDef } from "./actionFields";

// create_task/create_project gain one extra string property per *custom*
// field configured for this company (see lib/ai/actionFields.ts) -- this
// lets the model capture something like "matter number 2026-114" directly
// from a rich first message instead of always having to be asked for it
// separately. Built-in optional fields are already static properties below
// and aren't duplicated here.
function customFieldProperties(fields: FieldDef[]): Record<string, { type: string; description: string }> {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const field of fields) {
    if (!field.isCustom) continue;
    properties[field.key] = {
      type: "string",
      description: field.selectOptions?.length ? `${field.label} (one of: ${field.selectOptions.join(", ")})` : field.label,
    };
  }
  return properties;
}

const UPDATE_TASK_TOOL = {
  type: "function",
  function: {
    name: "update_task",
    description: "Update an existing task's fields. Only include fields the user actually wants changed.",
    parameters: {
      type: "object",
      properties: {
        task_name: { type: "string", description: "The name of the existing task to update." },
        new_name: { type: "string", description: "A new name for the task, if it should be renamed." },
        due_date: { type: "string", description: "New due date in YYYY-MM-DD format, if changing." },
        assignee_name: { type: "string", description: "New assignee's name, if changing." },
        status: { type: "string", description: "New status label (e.g. Done, In Progress), if changing." },
        is_completed: { type: "boolean", description: "Whether to mark the task complete or reopen it." },
        notes: { type: "string", description: "New notes, if changing." },
      },
      required: ["task_name"],
    },
  },
};

const UPDATE_PROJECT_TOOL = {
  type: "function",
  function: {
    name: "update_project",
    description: "Update an existing project's fields. Only include fields the user actually wants changed.",
    parameters: {
      type: "object",
      properties: {
        project_name: { type: "string", description: "The name of the existing project to update." },
        new_name: { type: "string", description: "A new name for the project, if it should be renamed." },
        description: { type: "string", description: "New description, if changing." },
        status: { type: "string", description: "New status (e.g. Open, Closed), if changing." },
      },
      required: ["project_name"],
    },
  },
};

// Built with this company's field config so create_task/create_project's
// schemas reflect its custom fields -- called once per bot message (see
// app/api/teams/bot/[companyId]/route.ts). update_task/update_project are
// untouched: Phase G (required/default fields) only changes creation.
export function buildActionTools(taskFields: FieldDef[], projectFields: FieldDef[]) {
  return [
    {
      type: "function",
      function: {
        name: "create_task",
        description: "Create a new task in a project.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "The task's name/title, ONLY if the user actually stated one -- omit this property entirely rather than inventing a placeholder." },
            project_name: { type: "string", description: "The name of the project this task belongs to, only if mentioned." },
            due_date: { type: "string", description: "Due date in YYYY-MM-DD format, if mentioned." },
            assignee_name: { type: "string", description: "Name of the person to assign the task to, if mentioned." },
            notes: { type: "string", description: "Any additional notes or details for the task." },
            ...customFieldProperties(taskFields),
          },
          // Deliberately empty -- name/project_name ARE required before a
          // task can actually be created, but that's enforced by
          // lib/ai/actionAdvance.ts (which asks for whatever's missing)
          // after this call, not by this schema. Observed in testing: with
          // "name" listed here as JSON-schema required, the model invented
          // a placeholder ("Test Project") to satisfy the schema rather
          // than omitting it, silently skipping the "what should this be
          // called?" question entirely. An empty `required` lets the model
          // call the tool the moment it recognizes intent, without being
          // structurally pressured to fabricate any value.
          required: [],
        },
      },
    },
    UPDATE_TASK_TOOL,
    {
      type: "function",
      function: {
        name: "create_project",
        description: "Create a new project.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "The project's name, ONLY if the user actually stated one -- omit this property entirely rather than inventing a placeholder." },
            description: { type: "string", description: "A description of the project, if mentioned." },
            status: { type: "string", description: "Initial status, if mentioned (defaults to Open)." },
            ...customFieldProperties(projectFields),
          },
          required: [],
        },
      },
    },
    UPDATE_PROJECT_TOOL,
  ];
}

// A one-off schema for extracting answers out of a reply to a *batched*
// "I still need: X, Y, Z" question (see lib/ai/actionAdvance.ts) -- no
// `required` array, since the whole point is that the reply might only
// answer some of what was asked; TOOL_USE_GUARDRAILS's "never invent a
// value" instruction applies here too (passed alongside this tool by the
// caller, same as the other tool-calling call).
export function buildMissingFieldsTool(missingFields: FieldDef[]) {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const field of missingFields) {
    properties[field.key] =
      field.kind === "select" && field.selectOptions?.length
        ? { type: "string", description: `${field.label} (one of: ${field.selectOptions.join(", ")})` }
        : { type: "string", description: field.label };
  }
  return [
    {
      type: "function",
      function: {
        name: "provide_details",
        description:
          "Extract any of the requested details that the user's reply actually answers. Omit any field the reply doesn't address -- never invent or guess a value for a field that wasn't mentioned.",
        parameters: { type: "object", properties, required: [] },
      },
    },
  ];
}

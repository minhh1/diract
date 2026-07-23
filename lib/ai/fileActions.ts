// lib/ai/fileActions.ts
// Slot-filling state machine for the bot's create_file/update_file actions
// -- a smaller, separate sibling to lib/ai/actionAdvance.ts's create_task/
// create_project machinery, since a file's "content" isn't a scalar field
// to collect, it's drafted by a model call (lib/ai/fileDraft.ts) once
// name/instructions/project (or which-file) are known. Same collecting/
// confirming shape and confirm-before-write safety net as tasks/projects,
// stored in the same teams_bot_pending_actions/whatsapp_bot_pending_actions
// tables (action_type widened to include 'create_file'/'update_file').
import { resolveProjectByName, resolveOnedriveFileByName } from "./actions";
import { draftFileContent } from "./fileDraft";

export interface FileCollectingResult {
  status: "collecting";
  collected: Record<string, string>;
  missingFields: string[];
  question: string;
}

export interface FileConfirmingResult {
  status: "confirming";
  summary: string;
  params: Record<string, unknown>;
}

export type FileAdvanceResult = FileCollectingResult | FileConfirmingResult;

interface FileField {
  key: string;
  label: string;
  required: boolean;
}

const CREATE_FILE_FIELDS: FileField[] = [
  { key: "name", label: "File name", required: true },
  { key: "instructions", label: "What it should say", required: true },
  { key: "project_name", label: "Project (optional -- say \"none\" to skip)", required: false },
];

const UPDATE_FILE_FIELDS: FileField[] = [
  { key: "file_name", label: "Which file (exact name)", required: true },
  { key: "instructions", label: "What should change", required: true },
];

function buildQuestion(fields: FileField[], notes: string[]): string {
  const prefix = notes.length ? notes.join(" ") + "\n\n" : "";
  return `${prefix}I need a few more details before I do this:\n${fields.map((f) => `- ${f.label}`).join("\n")}`;
}

// Extraction tool for a reply arriving while a create_file/update_file is
// still "collecting" (see the bot routes' continueCollecting). File fields
// are plain, semantic keys already (name/instructions/project_name/
// file_name) -- unlike custom task/project fields, there's no opaque
// field_key needing a label slug (lib/ai/actionTools.ts's
// propertyKeysForFields), so this builds a schema directly off the missing
// keys with no translation step needed afterward.
export function buildFileMissingFieldsTool(actionType: "create_file" | "update_file", missingFieldKeys: string[]) {
  const allFields = actionType === "create_file" ? CREATE_FILE_FIELDS : UPDATE_FILE_FIELDS;
  const properties: Record<string, { type: string; description: string }> = {};
  for (const key of missingFieldKeys) {
    const field = allFields.find((f) => f.key === key);
    if (field) properties[key] = { type: "string", description: field.label };
  }
  return [
    {
      type: "function",
      function: {
        name: "provide_details",
        description: "Extract any of the requested details that the user's reply actually answers. Omit any field the reply doesn't address -- never invent or guess a value.",
        parameters: { type: "object", properties, required: [] },
      },
    },
  ];
}

export async function advanceFileAction(
  admin: any,
  companyId: string,
  actionType: "create_file" | "update_file",
  modelId: string,
  ollamaUrl: string | null,
  sourceTypes: string[],
  collectedIn: Record<string, string>
): Promise<FileAdvanceResult> {
  const fields = actionType === "create_file" ? CREATE_FILE_FIELDS : UPDATE_FILE_FIELDS;
  const collected = { ...collectedIn };

  const missing = fields.filter((f) => f.required && !collected[f.key]?.trim());
  if (missing.length) {
    return { status: "collecting", collected, missingFields: missing.map((f) => f.key), question: buildQuestion(missing, []) };
  }

  let projectMatch: { id: string; name: string } | null = null;
  if (actionType === "create_file" && collected.project_name?.trim() && collected.project_name.trim().toLowerCase() !== "none") {
    const result = await resolveProjectByName(admin, companyId, collected.project_name);
    if (result.status !== "found") {
      delete collected.project_name;
      const note =
        result.status === "ambiguous"
          ? `I found multiple projects matching that: ${result.candidates.map((c) => c.name).join(", ")}.`
          : "I couldn't find a project matching that.";
      return {
        status: "collecting",
        collected,
        missingFields: ["project_name"],
        question: buildQuestion([{ key: "project_name", label: "Which project (or say \"none\")", required: false }], [note]),
      };
    }
    projectMatch = result.match;
  }

  let fileMatch: { id: string; name: string } | null = null;
  if (actionType === "update_file") {
    const result = await resolveOnedriveFileByName(admin, companyId, collected.file_name);
    if (result.status !== "found") {
      delete collected.file_name;
      const note =
        result.status === "ambiguous"
          ? `I found multiple files matching that: ${result.candidates.map((c) => c.name).join(", ")}.`
          : "I couldn't find a file matching that.";
      return {
        status: "collecting",
        collected,
        missingFields: ["file_name"],
        question: buildQuestion([{ key: "file_name", label: "Which file (exact name)", required: true }], [note]),
      };
    }
    fileMatch = result.match;
  }

  const content = await draftFileContent(admin, companyId, modelId, ollamaUrl, sourceTypes, collected.instructions, projectMatch?.name ?? fileMatch?.name ?? null);
  const preview = content.length > 300 ? content.slice(0, 300) + "..." : content;

  if (actionType === "create_file") {
    const summary = `I'll create a file "${collected.name}"${projectMatch ? ` under project ${projectMatch.name}` : ""} with this content:\n\n${preview}`;
    return { status: "confirming", summary, params: { name: collected.name, projectName: projectMatch?.name ?? null, content } };
  }

  const summary = `I'll update "${fileMatch!.name}" with this content:\n\n${preview}`;
  return { status: "confirming", summary, params: { itemId: fileMatch!.id, content } };
}

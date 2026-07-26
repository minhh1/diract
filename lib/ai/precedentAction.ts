// lib/ai/precedentAction.ts
// Slot-filling state machine for the bot's issue_precedent action -- a
// sibling to lib/ai/fileActions.ts, but two-phase: which fields are even
// needed can't be known until the precedent AND this company's letterhead
// are resolved (lib/precedents/letterheadClassify.ts's detected_fields), and
// whether a body_template exists (lib/precedents/bodyTemplateDetect.ts)
// decides between per-field questions or a single freeform "instructions"
// question drafted via lib/ai/precedentDraft.ts (the same model call the web
// Issue modal's "Draft with AI" button uses). Same collecting/confirming
// shape and confirm-before-write safety net as tasks/projects/files, stored
// in the same teams_bot_pending_actions/whatsapp_bot_pending_actions tables
// (action_type widened to include 'issue_precedent').
//
// Deliberately does NOT ask about salutation overrides or a specific signer
// selection in chat -- those stay optional web-only refinements
// (components/dashboard/tabs/PrecedentsTab.tsx's Issue modal); the bot
// always uses the matter/company's configured precedent_settings defaults,
// same as issuePrecedentDocument does when they're omitted.
import { resolvePrecedentByName, resolveProjectByName } from "./actions";
import { draftPrecedentContent } from "./precedentDraft";
import { buildBodyFromTemplate, type BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";
import { costUsd } from "@/lib/billing/aiModels";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

export interface PrecedentField {
  key: string;
  label: string;
  required: boolean;
  options?: string[];
}

export interface PrecedentCollectingResult {
  status: "collecting";
  collected: Record<string, string>;
  missingFields: string[];
  question: string;
}

export interface PrecedentConfirmingResult {
  status: "confirming";
  summary: string;
  params: {
    precedentId: string;
    projectId: string;
    subject: string;
    body?: string;
    fieldValues?: Record<string, string>;
    recipientAddress: string;
    recipientName?: string;
    deliveryMode?: string;
    draftBrief?: string;
  };
}

export type PrecedentAdvanceResult = PrecedentCollectingResult | PrecedentConfirmingResult;

const PHASE1_FIELDS: PrecedentField[] = [
  { key: "precedent_name", label: "Which precedent (document type)", required: true },
  { key: "project_name", label: "Which matter", required: true },
];

function buildQuestion(fields: PrecedentField[], notes: string[]): string {
  const prefix = notes.length ? notes.join(" ") + "\n\n" : "";
  return `${prefix}I need a few more details before I do this:\n${fields.map(f => `- ${f.label}${f.options?.length ? ` (${f.options.join(", ")})` : ""}`).join("\n")}`;
}

// Extraction tool for a reply arriving while an issue_precedent is still
// "collecting" -- mirrors lib/ai/fileActions.ts's buildFileMissingFieldsTool,
// just built off this call's dynamic field list instead of a static one.
export function buildPrecedentMissingFieldsTool(fields: PrecedentField[]) {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const field of fields) {
    properties[field.key] = {
      type: "string",
      description: field.options?.length ? `${field.label} (one of: ${field.options.join(", ")})` : field.label,
    };
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

// All fields this action could ever ask about, across both phases and
// either body path -- used so continueCollecting (in the shared bot engine)
// can look up a field's label/options by key without re-deriving Phase 2's
// field list itself. Rebuilt fresh each call from the same inputs Phase 2
// uses, so it's always in sync.
export async function allKnownFields(
  admin: any, companyId: string, collected: Record<string, string>
): Promise<PrecedentField[]> {
  const fields = [...PHASE1_FIELDS];
  if (!collected.precedent_name?.trim()) return fields;

  // Re-resolves the precedent from its name every call (collected only ever
  // stores the raw strings a reply gave, never a resolved id) -- cheap, and
  // idempotent with the resolution advancePrecedentAction itself does.
  const precedentResult = await resolvePrecedentByName(admin, companyId, collected.precedent_name);
  if (precedentResult.status !== "found") return fields;

  const [{ data: precedent }, { data: letterhead }] = await Promise.all([
    admin.from("precedents").select("body_template").eq("id", precedentResult.match.id).maybeSingle(),
    admin.from("company_letterheads").select("detected_fields").eq("company_id", companyId).maybeSingle(),
  ]);
  const detectedRoles = new Map<string, { role: string; options?: string[] }>(
    (letterhead?.detected_fields || []).map((f: any) => [f.role, f])
  );

  if (detectedRoles.has("recipient_name")) fields.push({ key: "recipient_name", label: "Recipient name", required: true });
  fields.push({ key: "recipient_address", label: "Recipient address", required: true });
  if (detectedRoles.has("delivery_mode")) {
    fields.push({ key: "delivery_mode", label: "Delivery mode", required: true, options: detectedRoles.get("delivery_mode")?.options });
  }
  fields.push({ key: "subject", label: "Subject line", required: true });

  const segments: BodyTemplateSegment[] = precedent?.body_template?.segments || [];
  const bodyFields = segments.filter((s): s is Extract<BodyTemplateSegment, { type: "field" }> => s.type === "field");
  if (bodyFields.length) {
    for (const s of bodyFields) fields.push({ key: s.key, label: s.label, required: true });
  } else {
    fields.push({ key: "instructions", label: "What this document should say", required: true });
  }
  return fields;
}

export async function advancePrecedentAction(
  admin: any,
  companyId: string,
  userId: string,
  modelId: string,
  sourceTypes: string[],
  collectedIn: Record<string, string>
): Promise<PrecedentAdvanceResult> {
  const collected = { ...collectedIn };

  // Phase 1: resolve precedent + matter first -- every other field depends
  // on which precedent/letterhead this is.
  const phase1Missing = PHASE1_FIELDS.filter(f => !collected[f.key]?.trim());
  if (phase1Missing.length) {
    return { status: "collecting", collected, missingFields: phase1Missing.map(f => f.key), question: buildQuestion(phase1Missing, []) };
  }

  const precedentResult = await resolvePrecedentByName(admin, companyId, collected.precedent_name);
  if (precedentResult.status !== "found") {
    delete collected.precedent_name;
    const note = precedentResult.status === "ambiguous"
      ? `I found multiple precedents matching that: ${precedentResult.candidates.map(c => c.name).join(", ")}.`
      : "I couldn't find a precedent matching that.";
    return { status: "collecting", collected, missingFields: ["precedent_name"], question: buildQuestion([PHASE1_FIELDS[0]], [note]) };
  }

  const projectResult = await resolveProjectByName(admin, companyId, collected.project_name);
  if (projectResult.status !== "found") {
    delete collected.project_name;
    const note = projectResult.status === "ambiguous"
      ? `I found multiple matters matching that: ${projectResult.candidates.map(c => c.name).join(", ")}.`
      : "I couldn't find a matter matching that.";
    return { status: "collecting", collected, missingFields: ["project_name"], question: buildQuestion([PHASE1_FIELDS[1]], [note]) };
  }

  const precedentId = precedentResult.match.id;
  const projectId = projectResult.match.id;

  // Phase 2: dynamic fields, now that the precedent (and so its
  // body_template) and this company's letterhead are both known. A missing
  // letterhead just means no extra roles were detected -- issuePrecedentDocument
  // itself rejects with a clear error at confirm time, same as e.g.
  // createOnedriveFile throwing when OneDrive isn't connected.
  const [{ data: precedent }, { data: letterhead }] = await Promise.all([
    admin.from("precedents").select("id, name, ai_instructions, body_template").eq("id", precedentId).maybeSingle(),
    admin.from("company_letterheads").select("detected_fields").eq("company_id", companyId).maybeSingle(),
  ]);
  const detectedRoles = new Map<string, { role: string; options?: string[] }>(
    (letterhead?.detected_fields || []).map((f: any) => [f.role, f])
  );

  const phase2Fields: PrecedentField[] = [];
  if (detectedRoles.has("recipient_name")) phase2Fields.push({ key: "recipient_name", label: "Recipient name", required: true });
  phase2Fields.push({ key: "recipient_address", label: "Recipient address", required: true });
  if (detectedRoles.has("delivery_mode")) {
    phase2Fields.push({ key: "delivery_mode", label: "Delivery mode", required: true, options: detectedRoles.get("delivery_mode")?.options });
  }

  const segments: BodyTemplateSegment[] = precedent?.body_template?.segments || [];
  const bodyFields = segments.filter((s): s is Extract<BodyTemplateSegment, { type: "field" }> => s.type === "field");
  // A body_template has no AI to guess a subject line from, so it's
  // required up front; the freeform "instructions" path already gets a
  // subject drafted by draftPrecedentContent below, so asking for one here
  // too is optional -- a stated one still wins over the drafted one either way.
  phase2Fields.push({ key: "subject", label: "Subject line", required: bodyFields.length > 0 });
  if (bodyFields.length) {
    for (const s of bodyFields) phase2Fields.push({ key: s.key, label: s.label, required: true });
  } else {
    phase2Fields.push({ key: "instructions", label: "What this document should say", required: true });
  }

  const phase2Missing = phase2Fields.filter(f => f.required && !collected[f.key]?.trim());
  if (phase2Missing.length) {
    return { status: "collecting", collected, missingFields: phase2Missing.map(f => f.key), question: buildQuestion(phase2Missing, []) };
  }

  if (detectedRoles.has("delivery_mode")) {
    const options = detectedRoles.get("delivery_mode")?.options || [];
    if (options.length && !options.includes(collected.delivery_mode)) {
      delete collected.delivery_mode;
      const field = phase2Fields.find(f => f.key === "delivery_mode")!;
      return {
        status: "collecting", collected, missingFields: ["delivery_mode"],
        question: buildQuestion([field], ["That's not one of the valid delivery modes."]),
      };
    }
  }

  let subject = collected.subject;
  let body: string | undefined;
  let fieldValues: Record<string, string> | undefined;
  let draftBrief: string | undefined;

  if (bodyFields.length) {
    fieldValues = {};
    for (const s of bodyFields) fieldValues[s.key] = collected[s.key];
  } else {
    draftBrief = collected.instructions;
    const { data: aiSettings } = await admin
      .from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
    const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
    if (await isTokenCapReached(admin, companyId, tokenCap)) {
      return {
        status: "collecting", collected, missingFields: ["instructions"],
        question: "This company's monthly AI token cap has been reached -- ask a company admin to raise it, then reply with what this document should say to continue.",
      };
    }
    const draft = await draftPrecedentContent(
      admin, companyId, modelId, sourceTypes, precedent!.name, precedent!.ai_instructions, collected.instructions, projectResult.match.name
    );
    subject = collected.subject || draft.subject;
    body = draft.body;
    const cost = costUsd("hosted", modelId, draft);
    await admin.from("ai_usage_events").insert({
      company_id: companyId, user_id: userId, model_id: modelId, provider: "hosted",
      input_tokens: draft.inputTokens, output_tokens: draft.outputTokens, cost_usd: cost,
    });
  }

  const bodyPreview = fieldValues ? buildBodyFromTemplate(segments, fieldValues) : body!;
  const preview = bodyPreview.length > 300 ? bodyPreview.slice(0, 300) + "..." : bodyPreview;
  const summary = `I'll issue "${precedent!.name}" for matter "${projectResult.match.name}", subject "${subject}":\n\n${preview}`;

  return {
    status: "confirming",
    summary,
    params: {
      precedentId, projectId, subject,
      body, fieldValues,
      recipientAddress: collected.recipient_address,
      recipientName: collected.recipient_name,
      deliveryMode: collected.delivery_mode,
      draftBrief,
    },
  };
}

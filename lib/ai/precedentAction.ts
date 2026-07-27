// lib/ai/precedentAction.ts
// Slot-filling state machine for the bot's issue_precedent action -- a
// sibling to lib/ai/fileActions.ts, but two-phase: which fields are even
// needed can't be known until the precedent AND this company's letterhead
// are resolved (lib/precedents/letterheadClassify.ts's detected_fields), and
// whether a body_template exists (lib/precedents/bodyTemplateDetect.ts)
// decides between per-field questions or a manual-vs-AI content choice.
// Same collecting/confirming shape and confirm-before-write safety net as
// tasks/projects/files, stored in the same
// teams_bot_pending_actions/whatsapp_bot_pending_actions tables (action_type
// widened to include 'issue_precedent').
//
// Deliberately does NOT ask about salutation overrides in chat -- that stays
// an optional web-only refinement (components/dashboard/tabs/PrecedentsTab.tsx's
// Issue modal); the bot always uses the matter/company's configured
// precedent_settings default. Signer selection, unlike salutation, IS
// handled here -- see lib/botEngine/handleMessage.ts's proactive signoff
// confirmation round, kicked off once this returns "confirming".
import { resolvePrecedentByName, resolveProjectByName } from "./actions";
import { draftPrecedentContent, draftSubjectLine, type SubjectDraft } from "./precedentDraft";
import { buildBodyFromTemplate, type BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";
import { resolveOrCreateGeneralPrecedent, resolveProjectSummary } from "@/lib/precedents/issuePrecedent";
import { resolveCustomFieldDefaults } from "@/lib/precedents/customFieldDefaults";
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

const CONTENT_MODE_FIELD: PrecedentField = {
  key: "content_mode", label: "Write it yourself, or have me draft it with AI?", required: true, options: ["myself", "AI"],
};

function buildQuestion(fields: PrecedentField[], notes: string[]): string {
  const prefix = notes.length ? notes.join(" ") + "\n\n" : "";
  return `${prefix}I need a few more details before I do this:\n${fields.map(f => `- ${f.label}${f.options?.length ? ` (${f.options.join(", ")})` : ""}`).join("\n")}`;
}

// A user reply is treated as "please draft it for me" rather than a literal
// value when it matches one of these -- used both for the subject line
// (any time it's a pending field, see lib/botEngine/handleMessage.ts) and
// for deciding manual-vs-AI content mode below. Deliberately a plain keyword
// check, not a model call -- cheaper and more predictable than running
// extraction just to detect intent.
const DRAFT_REQUEST_PHRASES = ["draft", "suggest", "you choose", "you decide", "write one", "up to you", "ai"];
export function looksLikeDraftRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return DRAFT_REQUEST_PHRASES.some(p => normalized.includes(p));
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
// whichever content path applies -- used so continueCollecting (in the
// shared bot engine) can look up a field's label/options by key without
// re-deriving Phase 2's field list itself. Rebuilt fresh each call from the
// same inputs Phase 2 uses, so it's always in sync.
export async function allKnownFields(
  admin: any, companyId: string, collected: Record<string, string>
): Promise<PrecedentField[]> {
  const fields = [...PHASE1_FIELDS];
  if (collected.use_ai_fallback === "true") {
    fields.push({ key: "instructions", label: "What this document should say", required: true });
    fields.push({ key: "subject", label: "Subject line", required: false });
    return fields;
  }
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
    fields.push(CONTENT_MODE_FIELD);
    fields.push({ key: "body", label: "The document's body text", required: false });
    fields.push({ key: "instructions", label: "What this document should say", required: false });
  }
  return fields;
}

// Given a precedent + matter already resolved in `collected`, drafts just a
// subject line from the matter's own name/custom-field data -- used when a
// reply to the subject question looks like "draft it for me" rather than a
// literal subject (see looksLikeDraftRequest, called from
// lib/botEngine/handleMessage.ts's continueCollecting). Returns null if the
// precedent/matter can't be re-resolved (shouldn't happen at this point in
// the flow, but this is best-effort, not load-bearing).
export async function draftSubjectFromCollected(
  admin: any, companyId: string, modelId: string, collected: Record<string, string>
): Promise<SubjectDraft | null> {
  if (!collected.precedent_name?.trim() || !collected.project_name?.trim()) return null;
  const [precedentResult, projectResult] = await Promise.all([
    resolvePrecedentByName(admin, companyId, collected.precedent_name),
    resolveProjectByName(admin, companyId, collected.project_name),
  ]);
  if (precedentResult.status !== "found" || projectResult.status !== "found") return null;

  const { data: precedent } = await admin.from("precedents").select("name, ai_instructions").eq("id", precedentResult.match.id).maybeSingle();
  if (!precedent) return null;
  const summary = await resolveProjectSummary(admin, companyId, projectResult.match.id);
  return draftSubjectLine(modelId, precedent.name, precedent.ai_instructions, summary);
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
  // on which precedent/letterhead this is. use_ai_fallback (set once the
  // user opts into a freeform AI-written document -- see below) short-
  // circuits precedent_name resolution, but the matter is still required
  // either way.
  const phase1Missing = collected.use_ai_fallback === "true"
    ? PHASE1_FIELDS.filter(f => f.key === "project_name" && !collected[f.key]?.trim())
    : PHASE1_FIELDS.filter(f => !collected[f.key]?.trim());
  if (phase1Missing.length) {
    return { status: "collecting", collected, missingFields: phase1Missing.map(f => f.key), question: buildQuestion(phase1Missing, []) };
  }

  let precedentId: string;
  let precedentName: string;
  if (collected.use_ai_fallback === "true") {
    const general = await resolveOrCreateGeneralPrecedent(admin, companyId);
    precedentId = general.id;
    precedentName = general.name;
  } else {
    const precedentResult = await resolvePrecedentByName(admin, companyId, collected.precedent_name);
    if (precedentResult.status === "ambiguous") {
      delete collected.precedent_name;
      return {
        status: "collecting", collected, missingFields: ["precedent_name"],
        question: buildQuestion([PHASE1_FIELDS[0]], [`I found multiple precedents matching that: ${precedentResult.candidates.map(c => c.name).join(", ")}.`]),
      };
    }
    if (precedentResult.status === "not_found") {
      // Offer to write it from scratch with AI instead of just failing --
      // confirmed with a plain yes/no (checked directly against
      // CONFIRM_WORDS in the shared engine, not run through AI extraction),
      // same as this app's existing confirm-before-write pattern.
      const attemptedName = collected.precedent_name;
      delete collected.precedent_name;
      return {
        status: "collecting", collected, missingFields: ["confirm_ai_fallback"],
        question: `There's no precedent called "${attemptedName}". Want me to write this with AI instead? Reply yes, or give me the right precedent name.`,
      };
    }
    precedentId = precedentResult.match.id;
    precedentName = precedentResult.match.name;
  }

  const projectResult = await resolveProjectByName(admin, companyId, collected.project_name);
  if (projectResult.status !== "found") {
    delete collected.project_name;
    const note = projectResult.status === "ambiguous"
      ? `I found multiple matters matching that: ${projectResult.candidates.map(c => c.name).join(", ")}.`
      : "I couldn't find a matter matching that.";
    return { status: "collecting", collected, missingFields: ["project_name"], question: buildQuestion([PHASE1_FIELDS[1]], [note]) };
  }
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
  // required up front; the freeform path lets it be drafted (see below),
  // so asking for one here too is optional -- a stated one still wins.
  phase2Fields.push({ key: "subject", label: "Subject line (or say 'draft one for me')", required: bodyFields.length > 0 });

  if (bodyFields.length) {
    // Fields bound to an existing project field (see
    // PrecedentsSettingsTab.tsx's "Default from field" picker) are resolved
    // automatically and never asked about, same as the web Issue modal
    // pre-filling them.
    const boundFieldIds = bodyFields.map(s => s.autoFillFieldId).filter((id): id is string => !!id);
    const autoFilled = boundFieldIds.length ? await resolveCustomFieldDefaults(admin, projectId, boundFieldIds) : {};
    for (const s of bodyFields) {
      if (!collected[s.key]?.trim() && s.autoFillFieldId && autoFilled[s.autoFillFieldId]) {
        collected[s.key] = autoFilled[s.autoFillFieldId];
      }
      phase2Fields.push({ key: s.key, label: s.label, required: true });
    }
  } else {
    phase2Fields.push(CONTENT_MODE_FIELD);
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

  // Without a body_template, content_mode decides manual typing vs AI
  // drafting -- ask whichever of body/instructions that choice actually
  // needs, now that we know which one it is.
  if (!bodyFields.length) {
    const wantsAi = collected.content_mode?.trim().toLowerCase().includes("ai");
    const contentField = wantsAi
      ? { key: "instructions", label: "What this document should say", required: true }
      : { key: "body", label: "The document's body text", required: true };
    if (!collected[contentField.key]?.trim()) {
      return { status: "collecting", collected, missingFields: [contentField.key], question: buildQuestion([contentField], []) };
    }
  }

  let subject = collected.subject;
  let body: string | undefined;
  let fieldValues: Record<string, string> | undefined;
  let draftBrief: string | undefined;

  if (bodyFields.length) {
    fieldValues = {};
    for (const s of bodyFields) fieldValues[s.key] = collected[s.key];
  } else if (collected.content_mode?.trim().toLowerCase().includes("ai")) {
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
      admin, companyId, modelId, sourceTypes, precedentName, precedent?.ai_instructions ?? null, collected.instructions, await resolveProjectSummary(admin, companyId, projectId)
    );
    subject = collected.subject || draft.subject;
    body = draft.body;
    const cost = costUsd("hosted", modelId, draft);
    await admin.from("ai_usage_events").insert({
      company_id: companyId, user_id: userId, model_id: modelId, provider: "hosted",
      input_tokens: draft.inputTokens, output_tokens: draft.outputTokens, cost_usd: cost,
    });
  } else {
    body = collected.body;
  }

  const bodyPreview = fieldValues ? buildBodyFromTemplate(segments, fieldValues) : body!;
  const preview = bodyPreview.length > 300 ? bodyPreview.slice(0, 300) + "..." : bodyPreview;
  const summary = `I'll issue "${precedentName}" for matter "${projectResult.match.name}", subject "${subject}":\n\n${preview}`;

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

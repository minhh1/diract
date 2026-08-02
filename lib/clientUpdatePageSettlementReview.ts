// lib/clientUpdatePageSettlementReview.ts
// Shared by both trigger paths for the AI settlement-date review feature --
// the manual "Review emails" button
// (app/api/client-update-pages/[id]/items/[itemId]/ai-review-settlement/route.ts)
// and the automatic trigger fired right after a new email is logged (see
// .../items/[itemId]/emails/route.ts) -- so the two can never behave
// differently. Resolves the matter's linked property and the field's
// current value, asks the AI whether both parties agreed to a new date,
// and if so writes it straight onto project_property_values (the same
// table values/route.ts's own project_property branch writes -- this
// keeps whatever else reads that data, e.g. the normal Matters dashboard,
// in sync automatically), flags the cell as AI-set-pending-confirmation
// (client_update_page_ai_field_flags -- cleared by the confirm route or by
// a subsequent manual edit, see values/route.ts), logs the change with
// source 'ai' so it's clearly distinguishable from a human edit in the
// activity log, and records the AI usage event for billing.
import { HOSTED_MODELS, costUsd } from "@/lib/billing/aiModels";
import { reviewSettlementDateAgreement } from "@/lib/ai/matterSettlementDateReview";
import { logChange } from "@/lib/clientUpdatePageLog";

// HOSTED_MODELS[0], not the cheaper [1] -- see rewrite-text/route.ts's note
// on why this codebase avoids Together's smaller 3.1-8B-Turbo model.
const MODEL_ID = HOSTED_MODELS[0].id;

export interface SettlementReviewResult {
  // false only when there was nothing to review at all (no linked property,
  // or no emails yet) -- distinct from agreed:false, which means the
  // review DID run but found no agreement.
  ran: boolean;
  agreed: boolean;
  newDate: string | null;
  reasoning: string;
}

export async function runSettlementDateReview(
  admin: any, companyId: string, userId: string | null,
  pageId: string, itemId: string, fieldId: string, fieldKey: string,
  projectId: string, matterName: string, propertyId?: string
): Promise<SettlementReviewResult> {
  const { data: links } = await admin.from("project_properties")
    .select("id, property_id").eq("project_id", projectId).order("created_at", { ascending: true });
  const linkedRows = links || [];
  const targetLink = (propertyId && linkedRows.find((l: any) => l.property_id === propertyId)) || linkedRows[0];
  if (!targetLink) return { ran: false, agreed: false, newDate: null, reasoning: "This matter has no linked property." };
  const projectPropertyId = targetLink.id;

  const { data: existingVal } = await admin.from("project_property_values")
    .select("value_date").eq("field_id", fieldKey).eq("project_property_id", projectPropertyId).maybeSingle();
  const currentDate: string | null = existingVal?.value_date ?? null;

  const result = await reviewSettlementDateAgreement(admin, companyId, MODEL_ID, itemId, projectId, matterName, currentDate);
  if (!result) return { ran: false, agreed: false, newDate: null, reasoning: "No emails found for this matter yet." };

  const cost = costUsd("hosted", MODEL_ID, result);
  await admin.from("ai_usage_events").insert({
    company_id: companyId, user_id: userId, model_id: MODEL_ID, provider: "hosted",
    input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
  });

  if (!result.agreed || !result.newDate) {
    return { ran: true, agreed: false, newDate: null, reasoning: result.reasoning };
  }

  const { error } = await admin.from("project_property_values").upsert({
    field_id: fieldKey, project_property_id: projectPropertyId, company_id: companyId,
    value_text: null, value_number: null, value_date: result.newDate, value_boolean: null, value_record_id: null, value_record_capacity: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_property_id,field_id" });
  if (error) throw new Error(error.message);

  await admin.from("client_update_page_ai_field_flags").upsert({
    page_id: pageId, item_id: itemId, project_property_id: projectPropertyId, field_key: fieldKey,
    previous_value: currentDate, applied_value: result.newDate, reasoning: result.reasoning,
  }, { onConflict: "item_id,project_property_id,field_key" });

  await logChange(admin, pageId, "AI review", "ai", "value_changed",
    `AI review: set "Settlement Date" to ${result.newDate} on "${matterName}" -- ${result.reasoning}`,
    { itemId, fieldId, oldValue: currentDate, newValue: result.newDate, reason: result.reasoning });

  return { ran: true, agreed: true, newDate: result.newDate, reasoning: result.reasoning };
}

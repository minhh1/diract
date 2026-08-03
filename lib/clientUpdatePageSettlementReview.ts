// lib/clientUpdatePageSettlementReview.ts
// Shared by both trigger paths for the AI settlement-date review feature --
// the manual per-matter "Review emails" button
// (app/api/client-update-pages/[id]/items/[itemId]/ai-review-settlement/route.ts)
// and the bulk "review every matter on the page" action
// (app/api/client-update-pages/[id]/settlement-status-all/route.ts) -- so
// the two can never behave differently. Resolves the matter's linked
// property and the field's
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
import { reviewSettlementDateAgreement, type SettlementStatus } from "@/lib/ai/matterSettlementDateReview";
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
  status: SettlementStatus | null;
  reasoning: string;
}

export async function runSettlementDateReview(
  admin: any, companyId: string, userId: string | null,
  pageId: string, itemId: string, fieldId: string, fieldKey: string,
  projectId: string, matterName: string, propertyId?: string,
  // Off by default -- the single-matter manual button stays silent (as it
  // always has) when there's no agreement, so a matter with an unresolved
  // back-and-forth doesn't get a fresh "still not agreed" log entry every
  // time it's reviewed. Only the bulk "confirm settlement status for all
  // matters" action
  // (.../settlement-status-all/route.ts) opts in, since its whole point is
  // one log entry per matter regardless of outcome.
  logStatusEvenIfNotAgreed = false
): Promise<SettlementReviewResult> {
  const { data: links } = await admin.from("project_properties")
    .select("id, property_id").eq("project_id", projectId).order("created_at", { ascending: true });
  const linkedRows = links || [];
  const targetLink = (propertyId && linkedRows.find((l: any) => l.property_id === propertyId)) || linkedRows[0];
  if (!targetLink) return { ran: false, agreed: false, newDate: null, status: null, reasoning: "This matter has no linked property." };
  const projectPropertyId = targetLink.id;

  // Fetched for every linked property (not just the target one), even on a
  // single-property matter -- reviewSettlementDateAgreement needs the full
  // set to tell a matter-wide agreement apart from one that names a
  // specific lot (see its "scope" field, resolved back into an actual set
  // of properties to write to below).
  const propertyIds: string[] = linkedRows.map((l: any) => l.property_id);
  const [{ data: existingVals }, { data: propertyRows }] = await Promise.all([
    admin.from("project_property_values").select("project_property_id, value_date")
      .eq("field_id", fieldKey).in("project_property_id", linkedRows.map((l: any) => l.id)),
    propertyIds.length ? admin.from("properties").select("id, street_address").in("id", propertyIds) : Promise.resolve({ data: [] }),
  ]);
  const dateByPropertyId = new Map<string, string | null>((existingVals || []).map((v: any) => [v.project_property_id, v.value_date]));
  const addressByPropertyId = new Map<string, string | null>((propertyRows || []).map((p: any) => [p.id, p.street_address]));
  const currentDate: string | null = dateByPropertyId.get(projectPropertyId) ?? null;

  const propertiesForPrompt = linkedRows.map((l: any) => ({
    address: addressByPropertyId.get(l.property_id) ?? null,
    currentDate: dateByPropertyId.get(l.id) ?? null,
  }));

  const result = await reviewSettlementDateAgreement(admin, companyId, MODEL_ID, itemId, projectId, matterName, propertiesForPrompt);
  if (!result) return { ran: false, agreed: false, newDate: null, status: null, reasoning: "No emails found for this matter yet." };

  const cost = costUsd("hosted", MODEL_ID, result);
  await admin.from("ai_usage_events").insert({
    company_id: companyId, user_id: userId, model_id: MODEL_ID, provider: "hosted",
    input_tokens: result.inputTokens, output_tokens: result.outputTokens, cost_usd: cost,
  });

  if (!result.agreed || !result.newDate) {
    if (logStatusEvenIfNotAgreed) {
      // cell (itemId/fieldId) attached even though nothing actually changed
      // -- without it this only shows up in the page-wide activity log, not
      // the Settlement Date field's own "See what changed" history, which
      // is where staff actually go looking for it (see logs/route.ts and
      // the public cell-logs route, both scoped by item_id+field_id).
      await logChange(admin, pageId, "AI review", "ai", "settlement_status",
        `AI review: settlement date status for "${matterName}" -- ${result.reasoning}`,
        { itemId, fieldId, oldValue: null, newValue: null, reason: result.reasoning });
    }
    return { ran: true, agreed: false, newDate: null, status: result.status, reasoning: result.reasoning };
  }

  // Which linked properties actually get the new date: all of them by
  // default (a multi-lot matter's settlement date change normally applies
  // matter-wide), unless the AI named one specific property's address --
  // in which case, and only if that address matches exactly one linked
  // property, narrow to just that one. Anything else (single-property
  // matter, "all", or an unmatched/ambiguous address) falls back to every
  // linked property.
  let targets = linkedRows;
  if (linkedRows.length > 1 && result.scope.toLowerCase() !== "all") {
    const needle = result.scope.toLowerCase();
    const matches = linkedRows.filter((l: any) => {
      const address = (addressByPropertyId.get(l.property_id) || "").toLowerCase();
      return address && (address.includes(needle) || needle.includes(address));
    });
    if (matches.length === 1) targets = matches;
  }

  for (const t of targets) {
    const previousValue = dateByPropertyId.get(t.id) ?? null;
    const { error } = await admin.from("project_property_values").upsert({
      field_id: fieldKey, project_property_id: t.id, company_id: companyId,
      value_text: null, value_number: null, value_date: result.newDate, value_boolean: null, value_record_id: null, value_record_capacity: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_property_id,field_id" });
    if (error) throw new Error(error.message);

    await admin.from("client_update_page_ai_field_flags").upsert({
      page_id: pageId, item_id: itemId, project_property_id: t.id, field_key: fieldKey,
      previous_value: previousValue, applied_value: result.newDate, reasoning: result.reasoning,
    }, { onConflict: "item_id,project_property_id,field_key" });

    // Every targeted property logs against the same itemId+fieldId (the
    // Settlement Date column is one field definition shared across a
    // matter's properties), so the address is folded into the detail text
    // whenever there's more than one target -- otherwise two lots' entries
    // in the same "See what changed" history would be indistinguishable.
    const addressSuffix = targets.length > 1 ? ` (${addressByPropertyId.get(t.property_id) || "linked property"})` : "";
    await logChange(admin, pageId, "AI review", "ai", "value_changed",
      `AI review: set "Settlement Date" to ${result.newDate} on "${matterName}"${addressSuffix} -- ${result.reasoning}`,
      { itemId, fieldId, oldValue: previousValue, newValue: result.newDate, reason: result.reasoning });
  }

  return { ran: true, agreed: true, newDate: result.newDate, status: "agreed", reasoning: result.reasoning };
}

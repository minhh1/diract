// app/api/client-update-pages/[id]/settlement-status-all/route.ts
// Bulk sibling to .../items/[itemId]/ai-review-settlement/route.ts -- staff-
// triggered (a button in MatterBoard's toolbar, same convention as
// .../summarize-open/route.ts), runs the settlement-date review for EVERY
// matter on the page and logs a status entry for each one regardless of
// outcome (agreed, extension requested, followed up, not yet agreed, or no
// discussion at all) -- see runSettlementDateReview's logStatusEvenIfNotAgreed
// param, which the single-matter button and the automatic per-email trigger
// both deliberately leave off (they only ever log when agreement is
// reached), so this is the one path that gives a full per-matter status
// trail in the activity log on demand instead of only on a value change.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";
import { runSettlementDateReview } from "@/lib/clientUpdatePageSettlementReview";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;
  if (gate.page.base_table !== "projects") {
    return NextResponse.json({ reviewed: 0, agreed: 0, failed: [] });
  }

  // One representative field per distinct underlying field_key -- the
  // Settlement Date column can be configured more than once on the same
  // page (see the ai_field_flags migration's header comment on the Niksen
  // page's pre-existing duplicate-column quirk); reviewing it once per
  // unique field_key is enough, reviewing it once per duplicate column
  // definition would just triple the AI cost for no extra information.
  const { data: fields } = await admin.from("client_update_page_fields")
    .select("id, field_key").eq("page_id", id).eq("field_source", "project_property").ilike("label", "Settlement Date");
  const uniqueFields = [...new Map((fields || []).map((f: any) => [f.field_key, f])).values()] as { id: string; field_key: string }[];
  if (!uniqueFields.length) return NextResponse.json({ reviewed: 0, agreed: 0, failed: [] });

  const { data: items } = await admin.from("client_update_page_items").select("id, record_id, display_name").eq("page_id", id);
  if (!items?.length) return NextResponse.json({ reviewed: 0, agreed: 0, failed: [] });

  const projectIds = items.map((i: any) => i.record_id);
  const { data: projects } = await admin.from("projects").select("id, name").in("id", projectIds);
  const projectNameById = new Map((projects || []).map((p: any) => [p.id, p.name]));

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;

  let reviewed = 0;
  let agreed = 0;
  const failed: string[] = [];
  for (const item of items) {
    const matterName = item.display_name || projectNameById.get(item.record_id) || "this matter";
    for (const field of uniqueFields) {
      if (await isTokenCapReached(admin, companyId, tokenCap)) {
        failed.push(`${matterName} (token cap reached)`);
        continue;
      }
      try {
        const result = await runSettlementDateReview(
          admin, companyId, user.id, id, item.id, field.id, field.field_key, item.record_id, matterName, undefined, true
        );
        if (!result.ran) continue; // no linked property / no emails -- nothing to log
        reviewed++;
        if (result.agreed) agreed++;
      } catch {
        failed.push(matterName);
      }
    }
  }

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "settlement_status",
    `Bulk-checked settlement date status for ${reviewed} matter${reviewed === 1 ? "" : "s"} (${agreed} agreed to a new date)${failed.length ? `, ${failed.length} failed` : ""}`);

  return NextResponse.json({ reviewed, agreed, failed });
}

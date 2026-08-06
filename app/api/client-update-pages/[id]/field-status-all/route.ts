// app/api/client-update-pages/[id]/field-status-all/route.ts
// Bulk sibling to .../items/[itemId]/ai-review-field/route.ts -- staff-
// triggered (a button in MatterBoard's toolbar, same convention as
// .../summarize-open/route.ts), runs the field review for EVERY reviewable
// field (see isReviewableFieldType) on EVERY matter on the page and logs a
// status entry for each one regardless of outcome (agreed, change
// requested, followed up, not yet agreed, or no discussion at all) -- see
// runFieldReview's logStatusEvenIfNotAgreed param, which the single-field
// manual button deliberately leaves off (it only ever logs when agreement
// is reached), so this is the one path that gives a full per-matter,
// per-field status trail in the activity log on demand instead of only on
// a value change. Was field-status-all's predecessor, settlement-status-
// all/route.ts, Settlement-Date-only; generalized once staff asked for the
// same behaviour on every field.
//
// This is now matters x reviewable-fields worth of AI calls in one request
// (was just matters x 1) -- maxDuration below gives it more room than the
// platform default before Vercel cuts the function off; isTokenCapReached
// is still checked before every single call so a company's own configured
// spend limit is the real backstop, not wall-clock time.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";
import { runFieldReview } from "@/lib/clientUpdatePageFieldReview";
import { isReviewableFieldType } from "@/lib/ai/matterFieldReview";
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

  // One representative field per distinct underlying field_key -- the same
  // field can be configured more than once on the same page (see the
  // ai_field_flags migration's header comment on the Niksen page's
  // pre-existing duplicate-column quirk); reviewing it once per unique
  // field_key is enough, reviewing it once per duplicate column definition
  // would just multiply the AI cost for no extra information.
  const { data: fields } = await admin.from("client_update_page_fields")
    .select("id, field_key, label, field_type").eq("page_id", id).eq("field_source", "project_property");
  const reviewableFields = (fields || []).filter((f: any) => isReviewableFieldType(f.field_type));
  const uniqueFields = [...new Map(reviewableFields.map((f: any) => [f.field_key, f])).values()] as { id: string; field_key: string; label: string; field_type: string | undefined }[];
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
        failed.push(`${matterName} -- ${field.label} (token cap reached)`);
        continue;
      }
      try {
        const result = await runFieldReview(
          admin, companyId, user.id, id, item.id, field.id, field.field_key, field.label, field.field_type, item.record_id, matterName, undefined, true
        );
        if (!result.ran) continue; // no linked property / no emails -- nothing to log
        reviewed++;
        if (result.agreed) agreed++;
      } catch {
        failed.push(`${matterName} -- ${field.label}`);
      }
    }
  }

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "field_status",
    `Bulk-checked field status for ${reviewed} matter/field${reviewed === 1 ? "" : "s"} (${agreed} agreed to a new value)${failed.length ? `, ${failed.length} failed` : ""}`);

  return NextResponse.json({ reviewed, agreed, failed });
}

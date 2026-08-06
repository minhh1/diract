// app/api/client-update-pages/[id]/items/[itemId]/ai-review-field/route.ts
// Staff-triggered "review emails for updates to this field" -- the
// per-page bulk counterpart lives in .../[id]/field-status-all/route.ts,
// both calling the same runFieldReview so they can't behave differently.
// Projects pages only -- every reviewable field is project_property-
// sourced, which only exists on a projects-based Detailed Table Page (see
// values/route.ts's own project_property branch). Was ai-review-settlement,
// Settlement-Date-only; generalized to any reviewable field (see
// isReviewableFieldType) once staff asked for the same behaviour on
// Purchase Price etc.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { runFieldReview } from "@/lib/clientUpdatePageFieldReview";
import { isReviewableFieldType } from "@/lib/ai/matterFieldReview";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;
  if (gate.page.base_table !== "projects") {
    return NextResponse.json({ error: "Field review is only available on a matters page" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const fieldId: string | undefined = body?.fieldId;
  const propertyId: string | undefined = body?.propertyId;
  if (!fieldId) return NextResponse.json({ error: "fieldId is required" }, { status: 400 });

  const [{ data: item }, { data: field }] = await Promise.all([
    admin.from("client_update_page_items").select("id, record_id, display_name").eq("id", itemId).eq("page_id", id).maybeSingle(),
    admin.from("client_update_page_fields").select("id, field_source, field_key, label, field_type").eq("id", fieldId).eq("page_id", id).maybeSingle(),
  ]);
  if (!item) return NextResponse.json({ error: "Matter not found on this page" }, { status: 404 });
  if (!field || field.field_source !== "project_property" || !isReviewableFieldType(field.field_type)) {
    return NextResponse.json({ error: "This column can't be reviewed by AI" }, { status: 400 });
  }

  const { data: project } = await admin.from("projects").select("name").eq("id", item.record_id).maybeSingle();
  const matterName = item.display_name || project?.name || "this matter";

  const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
  const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
  if (await isTokenCapReached(admin, companyId, tokenCap)) {
    return NextResponse.json({ error: "Monthly AI token cap reached for this company" }, { status: 429 });
  }

  let result;
  try {
    result = await runFieldReview(admin, companyId, user.id, id, itemId, field.id, field.field_key, field.label, field.field_type, item.record_id, matterName, propertyId);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "AI review failed" }, { status: 502 });
  }
  if (!result.ran) return NextResponse.json({ error: result.reasoning }, { status: 404 });

  return NextResponse.json({ agreed: result.agreed, newValue: result.newValue, reasoning: result.reasoning });
}

// app/api/client-update-pages/[id]/items/[itemId]/emails/route.ts
// Staff-only: manually append an email reference (subject/sender/date/
// snippet) to a matter -- see the migration's header comment for why this
// is a dedicated table rather than a row in project_emails. No GET here --
// reads go through lib/clientUpdatePageDetail.ts (loadPageDetail), which
// already loads every item's appended emails alongside its notes. POST
// returns the created row so the caller doesn't need a separate fetch.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";
import { runSettlementDateReview } from "@/lib/clientUpdatePageSettlementReview";
import { isTokenCapReached } from "@/lib/billing/aiUsageCap";

// Automatic counterpart to the manual "Review emails" button
// (.../ai-review-settlement/route.ts, which both this and that call
// through the same runSettlementDateReview so they can't drift apart) --
// runs right after a new email lands on a matter, on every
// project_property field literally labelled "Settlement Date" (there can
// be more than one -- see the ai_field_flags migration's header comment on
// why that's a pre-existing, harmless duplicate-column quirk on the Niksen
// page rather than something this dedupes incorrectly). Deliberately
// best-effort: a slow or failed AI call, or the company being over its
// monthly token cap, should never turn a successful "log this email"
// action into a visible error -- the email is already saved by the time
// this runs.
async function autoReviewSettlementDates(admin: any, companyId: string, userId: string, pageId: string, itemId: string, projectId: string, matterName: string) {
  try {
    const { data: fields } = await admin.from("client_update_page_fields")
      .select("id, field_key").eq("page_id", pageId).eq("field_source", "project_property").ilike("label", "Settlement Date");
    const uniqueByFieldKey = new Map<string, string>((fields || []).map((f: any) => [f.field_key, f.id]));
    if (!uniqueByFieldKey.size) return;

    const { data: aiSettings } = await admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle();
    const tokenCap = aiSettings?.monthly_token_cap ?? 2000000;
    if (await isTokenCapReached(admin, companyId, tokenCap)) return;

    for (const [fieldKey, fieldId] of uniqueByFieldKey) {
      await runSettlementDateReview(admin, companyId, userId, pageId, itemId, fieldId, fieldKey, projectId, matterName);
    }
  } catch (err) {
    console.error("[emails] auto settlement-date review failed:", err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: item } = await admin.from("client_update_page_items").select("id, project_id, display_name").eq("id", itemId).eq("page_id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Matter not found on this page" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject || "").trim();
  const fromName = String(body.fromName || "").trim();
  const snippet = String(body.snippet || "").trim();
  if (!subject && !snippet) return NextResponse.json({ error: "Add a subject or a summary of the email" }, { status: 400 });

  const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();

  const { data: created, error } = await admin.from("client_update_page_emails").insert({
    item_id: itemId,
    subject: subject || null,
    from_name: fromName || null,
    from_address: body.fromAddress ? String(body.fromAddress).trim() : null,
    snippet: snippet || null,
    email_date: body.emailDate || undefined,
    added_by_name: profile?.full_name || profile?.email || null,
  }).select("id, subject, from_name, from_address, snippet, email_date, added_by_name, created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: project } = await admin.from("projects").select("name").eq("id", item.project_id).maybeSingle();
  const matterName = item.display_name || project?.name || "a matter";
  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "email_appended", `Appended email "${subject || snippet.slice(0, 40)}" to "${matterName}"`);

  if (gate.page.base_table === "projects") {
    await autoReviewSettlementDates(admin, companyId, user.id, id, itemId, item.project_id, matterName);
  }

  return NextResponse.json({ email: created });
}

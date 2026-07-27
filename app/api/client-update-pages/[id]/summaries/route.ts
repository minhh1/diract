// app/api/client-update-pages/[id]/summaries/route.ts
// DELETE clears every item's cached AI email summary on the page in one
// shot (companion to .../summarize-open, which generates) -- lets staff
// wipe a bad or stale batch and start over, rather than clearing cards one
// at a time.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { count } = await admin.from("client_update_page_items").select("id", { count: "exact", head: true }).eq("page_id", id).not("ai_summary", "is", null);

  const { error } = await admin.from("client_update_page_items").update({ ai_summary: null, ai_summary_generated_at: null }).eq("page_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "summaries_cleared", `Cleared AI summaries from ${count || 0} matter${count === 1 ? "" : "s"}`);

  return NextResponse.json({ cleared: count || 0 });
}

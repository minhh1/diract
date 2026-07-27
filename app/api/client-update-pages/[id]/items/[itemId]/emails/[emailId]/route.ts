// app/api/client-update-pages/[id]/items/[itemId]/emails/[emailId]/route.ts
// Remove a manually-appended email reference.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string; emailId: string }> }) {
  const { id, itemId, emailId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: item } = await admin.from("client_update_page_items").select("id, project_id").eq("id", itemId).eq("page_id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Matter not found on this page" }, { status: 404 });

  const { error } = await admin.from("client_update_page_emails").delete().eq("id", emailId).eq("item_id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: project } = await admin.from("projects").select("name").eq("id", item.project_id).maybeSingle();
  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "email_removed", `Removed an appended email from "${project?.name || "a matter"}"`);

  return NextResponse.json({ ok: true });
}

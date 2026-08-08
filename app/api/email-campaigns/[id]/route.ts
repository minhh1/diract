// app/api/email-campaigns/[id]/route.ts
// Delete a draft campaign. Only 'draft' -- once sending has started or
// finished there's nothing to "delete", that history stays.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;

  const { data: campaign } = await admin.from("email_campaigns").select("status").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "draft") return NextResponse.json({ error: "Only a draft campaign can be deleted" }, { status: 400 });

  await admin.from("email_campaigns").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}

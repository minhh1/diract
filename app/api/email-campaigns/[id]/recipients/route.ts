// app/api/email-campaigns/[id]/recipients/route.ts
// Live recipient-count preview (post-suppression) for the compose screen --
// shares resolveCampaignRecipients with the actual send so the previewed
// count is guaranteed accurate, not a separate estimate that can drift.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { resolveCampaignRecipients } from "@/lib/email/campaignRecipients";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;

  const { data: campaign } = await admin.from("email_campaigns").select("*").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const recipients = await resolveCampaignRecipients(admin, campaign);
  return NextResponse.json({ count: recipients.length, sample: recipients.slice(0, 5).map((r) => r.email) });
}

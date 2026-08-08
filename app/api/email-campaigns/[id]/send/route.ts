// app/api/email-campaigns/[id]/send/route.ts
// The actual send -- a separate explicit action from creating the draft
// (same "draft first" pattern as roster_shifts' publish step). Every
// recipient gets a server-inserted, per-recipient unsubscribe footer (not
// admin-authored -- an admin can't accidentally omit it), and the
// recipient list is always resolved fresh from resolveCampaignRecipients
// (which already excludes email_unsubscribes) right before sending, not
// reused from an earlier preview that could have gone stale.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { resolveCampaignRecipients } from "@/lib/email/campaignRecipients";
import { sendBatchEmails } from "@/lib/email/resend";
import { signUnsubscribe } from "@/lib/email/unsubscribeToken";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://diract.io";
const FROM = process.env.EMAIL_FROM_DEFAULT || "Diract <notifications@diract.io>";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtml(bodyText: string, companyId: string, email: string): string {
  const paragraphs = escapeHtml(bodyText).split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;white-space:pre-line;">${p}</p>`).join("");
  const sig = signUnsubscribe(companyId, email);
  const unsubUrl = `${APP_URL}/unsubscribe?company=${companyId}&email=${encodeURIComponent(email)}&sig=${sig}`;
  return `
    <div style="font-family:sans-serif;font-size:14px;color:#1e293b;max-width:560px;">
      ${paragraphs}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
      <p style="font-size:11px;color:#94a3b8;">
        You're receiving this because you're a contact of this company on Diract.
        <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a>
      </p>
    </div>
  `;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;

  const { data: campaign } = await admin.from("email_campaigns").select("*").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "draft") return NextResponse.json({ error: "This campaign has already been sent" }, { status: 400 });

  const recipients = await resolveCampaignRecipients(admin, campaign);
  if (recipients.length === 0) return NextResponse.json({ error: "No recipients to send to" }, { status: 400 });

  await admin.from("email_campaigns").update({ status: "sending", recipient_count: recipients.length }).eq("id", id);

  try {
    const results = await sendBatchEmails(recipients.map((r) => ({
      from: FROM, to: r.email, subject: campaign.subject,
      html: buildHtml(campaign.body_text, companyId, r.email),
    })));
    await admin.from("email_campaigns").update({
      status: "sent", sent_count: results.length, sent_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ ok: true, sent: results.length });
  } catch (err: any) {
    await admin.from("email_campaigns").update({ status: "failed" }).eq("id", id);
    return NextResponse.json({ error: err?.message ?? "Send failed" }, { status: 500 });
  }
}

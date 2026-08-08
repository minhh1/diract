// app/api/admin/invites/send/route.ts
// Sends a registration_tokens invite link directly to the pre-created
// staff profile's (entities row, see app/(app)/dashboard/admin/page.tsx's
// Invites tab) email/phone, instead of the admin having to copy the link
// into their own email/SMS client. Admin-only, same as generating the
// token itself.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { sendEmail } from "@/lib/email/sendEmail";
import { sendSms } from "@/lib/sms/sendMessage";
import { APP_URL } from "@/lib/config";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can send an invite" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { tokenId, channel } = body as { tokenId?: string; channel?: "email" | "sms" };
  if (!tokenId || (channel !== "email" && channel !== "sms")) {
    return NextResponse.json({ error: "tokenId and a valid channel ('email' or 'sms') are required" }, { status: 400 });
  }

  const { data: token } = await admin
    .from("registration_tokens")
    .select("token, used_at, expires_at, company_id, staff_entity_id, company:company_id(name)")
    .eq("id", tokenId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!token) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (token.used_at) return NextResponse.json({ error: "This invite has already been used" }, { status: 400 });
  if (token.expires_at && new Date(token.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invite has expired" }, { status: 400 });
  }
  if (!token.staff_entity_id) {
    return NextResponse.json({ error: "This invite has no pre-created staff profile to send to" }, { status: 400 });
  }

  const { data: entity } = await admin
    .from("entities").select("name, email, phone, mobile_phone").eq("id", token.staff_entity_id).maybeSingle();
  if (!entity) return NextResponse.json({ error: "The staff profile for this invite no longer exists" }, { status: 404 });

  const companyName = (token.company as { name?: string } | null)?.name || "the team";
  const link = `${APP_URL}/login?token=${token.token}`;

  if (channel === "email") {
    if (!entity.email) return NextResponse.json({ error: "This staff profile has no email on file" }, { status: 400 });
    const result = await sendEmail({
      admin, companyId, eventType: "staff_invite",
      to: entity.email,
      subject: `You've been invited to join ${companyName}`,
      html: `<p>Hi ${entity.name},</p><p>You've been invited to join ${companyName}. Follow the link below to set up your account:</p><p><a href="${link}">${link}</a></p>`,
      sentBy: auth.user.id,
    });
    if (!result.ok) return NextResponse.json({ error: result.error || "Could not send email" }, { status: 500 });
  } else {
    const phone = entity.phone || entity.mobile_phone;
    if (!phone) return NextResponse.json({ error: "This staff profile has no phone number on file" }, { status: 400 });
    try {
      await sendSms(phone, `You've been invited to join ${companyName}. Set up your account: ${link}`);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Could not send SMS" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

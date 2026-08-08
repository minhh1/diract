// app/api/unsubscribe/route.ts
// Public, no login required -- verifies the HMAC signature every campaign
// footer link carries (see lib/email/unsubscribeToken.ts) before writing
// to email_unsubscribes. A bad/tampered signature is rejected rather than
// silently no-op'd, so a guessed (company, email) pair can't be
// unsubscribed by someone who was never sent anything.
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/documentTemplateAuth";
import { verifyUnsubscribe } from "@/lib/email/unsubscribeToken";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const companyId = typeof body.company === "string" ? body.company : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const sig = typeof body.sig === "string" ? body.sig : "";
  if (!companyId || !email || !sig) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  if (!verifyUnsubscribe(companyId, email, sig)) return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });

  const admin = adminClient();
  await admin.from("email_unsubscribes").upsert({ company_id: companyId, email }, { onConflict: "company_id,email" });
  return NextResponse.json({ ok: true });
}

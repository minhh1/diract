// app/api/gmail/signature/route.ts
// GET: whether the caller has Gmail connected, so the Settings tab can show
// connection status. POST: renders the caller's current signature (via
// lib/signature/getUserSignatureHtml.ts, the same resolver everything else
// shares) and pushes it as Gmail's own sendAs.signature -- Gmail then
// applies it automatically to every new message the user composes, in
// Gmail itself, not just through this app.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { setNativeSignature } from "@/lib/gmail/client";
import { getUserSignatureHtml } from "@/lib/signature/getUserSignatureHtml";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user } = auth;

  const { data: tokenRow } = await admin
    .from("user_gmail_tokens").select("email").eq("user_id", user.id).maybeSingle();

  return NextResponse.json({ connected: !!tokenRow, email: tokenRow?.email || null });
}

export async function POST() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user } = auth;

  const resolved = await getUserSignatureHtml(admin, user.id);
  if (!resolved) return NextResponse.json({ error: "Could not resolve your signature -- try saving your details first" }, { status: 400 });

  try {
    await setNativeSignature(user.id, resolved.html, admin);
  } catch (e: any) {
    if (e?.message === "Gmail not connected") {
      return NextResponse.json({ error: "Connect Gmail first, from the Gmail tab" }, { status: 400 });
    }
    if (e?.status === 403) {
      return NextResponse.json({ error: "Your Gmail connection predates the signature permission -- reconnect Gmail (disconnect and reconnect from the Gmail tab) and try again", reconnectRequired: true }, { status: 403 });
    }
    return NextResponse.json({ error: e?.message || "Failed to push signature to Gmail" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

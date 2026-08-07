// app/api/outlook/signature-for-user/route.ts
// GENUINELY UNAUTHENTICATED -- called from the Outlook add-in's runtime
// page (public/outlook-addin/runtime/commands.js), which has no session
// cookie for this app at all (it runs inside Outlook, identified only by
// Office.context.mailbox.userProfile.emailAddress -- see that file's own
// comment on why trusting the mailbox's reported email is an acceptable
// simplification here). Same unauthenticated-by-design shape as the public
// document-fill routes (app/api/document-templates/public/[pageId]/
// route.ts) -- gated by knowing a specific identifier, not a login.
//
// Same-origin with the add-in (both served from this app's own domain, see
// manifest.json's runtime page URL), so no CORS handling is needed.
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/documentTemplateAuth";
import { getUserSignatureHtml } from "@/lib/signature/getUserSignatureHtml";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const admin = adminClient();

  // The connected Outlook mailbox address is the authoritative match --
  // falls back to the app login email in case a user's Outlook alias
  // differs from how they signed up (uncommon, but cheap to cover).
  const { data: outlookToken } = await admin
    .from("user_outlook_tokens").select("user_id").ilike("email", email).maybeSingle();
  let userId = outlookToken?.user_id as string | undefined;

  if (!userId) {
    const { data: profile } = await admin
      .from("profiles").select("id").ilike("email", email).maybeSingle();
    userId = profile?.id;
  }

  if (!userId) return NextResponse.json({ enabled: false, html: null });

  const resolved = await getUserSignatureHtml(admin, userId);
  if (!resolved) return NextResponse.json({ enabled: false, html: null });

  return NextResponse.json({ enabled: resolved.enabled, html: resolved.enabled ? resolved.html : null });
}

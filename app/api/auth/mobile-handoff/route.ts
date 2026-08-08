// app/api/auth/mobile-handoff/route.ts
// Mint step of the mobile "open on web" auth handoff (see
// app/auth/mobile-handoff/route.ts for the redeem step, and
// mobile/src/lib/webHandoff.ts for the caller). Lets a mobile user who's
// already signed in land on a web page already authenticated, instead of
// hitting the login page again -- authorizeCompanyMember() already accepts
// mobile's Authorization: Bearer session (lib/supabaseServer.ts), so this
// needs no new auth plumbing of its own.
//
// Mints a genuine Supabase magic-link token via the admin API for the
// CALLER'S OWN verified email (never a client-supplied one) and hands back
// only its hashed_token -- never the full action_link, since that points at
// Supabase's own hosted verify-and-redirect flow, whose PKCE-vs-implicit
// behavior depends on project config this route doesn't want to depend on.
// The redeem route instead calls verifyOtp itself, server-side, with this
// hashed_token -- see that route's own header comment.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember, adminClient } from "@/lib/documentTemplateAuth";
import { APP_URL } from "@/lib/config";

function isSafeRedirectPath(path: unknown): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { user } = auth;
  if (!user.email) return NextResponse.json({ error: "Account has no email on file" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!isSafeRedirectPath(body.redirectPath)) {
    return NextResponse.json({ error: "redirectPath must be a relative path starting with /" }, { status: 400 });
  }

  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: error?.message || "Failed to create handoff link" }, { status: 500 });
  }

  const url = `${APP_URL}/auth/mobile-handoff?token_hash=${encodeURIComponent(data.properties.hashed_token)}&redirect=${encodeURIComponent(body.redirectPath)}`;
  return NextResponse.json({ url });
}

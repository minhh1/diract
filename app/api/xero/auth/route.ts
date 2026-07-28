// app/api/xero/auth/route.ts
// Redirects the logged-in user to Xero's OAuth consent screen. Company
// identity is resolved from the session at callback time (see
// app/api/xero/callback/route.ts), same as app/api/gmail/auth+callback --
// the `state` param here is only a CSRF nonce, not a trusted company id.
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { XERO_REDIRECT_URI, XERO_SCOPES } from "@/lib/config";

export async function GET() {
  const state = randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: process.env.XERO_CLIENT_ID!,
    redirect_uri: XERO_REDIRECT_URI,
    response_type: 'code',
    scope: XERO_SCOPES,
    state,
  });

  const response = NextResponse.redirect(
    `https://login.xero.com/identity/connect/authorize?${params.toString()}`
  );
  response.cookies.set('xero_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}

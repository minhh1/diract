// app/api/outlook/auth/route.ts
// Redirects user to the Microsoft identity platform consent screen
import { NextResponse } from "next/server";
import { MICROSOFT_TENANT, OUTLOOK_REDIRECT_URI, OUTLOOK_SCOPES } from "@/lib/config";

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    redirect_uri: OUTLOOK_REDIRECT_URI,
    response_type: 'code',
    scope: OUTLOOK_SCOPES,
    response_mode: 'query',
    prompt: 'consent',
  });
  return NextResponse.redirect(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/authorize?${params.toString()}`
  );
}

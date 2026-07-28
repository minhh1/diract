// lib/msGraph/getAccessToken.ts
// Refreshes a user's delegated Outlook OAuth access token if it's expiring
// soon, using the same refresh_token grant as app/api/outlook/callback's
// initial exchange. Centralized here on purpose: the Gmail integration
// duplicates this exact refresh logic verbatim across gmail-push,
// gmail-archive-worker, setup-gmail-watch, and gmail-watch-renewal --
// Outlook should have one place to fix if the grant ever changes.
//
// Deno edge functions (the Phase 3+ sync engine) can't import Next.js
// lib/ code, so they'll still need their own copy of this -- same
// constraint the existing gmail-* functions live with (see
// lib/msGraph/onedrive.ts's header comment). This file is for Next.js
// API routes only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { MICROSOFT_TENANT } from "@/lib/config";

interface OutlookTokenRow {
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

export async function getOutlookAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: row, error } = await supabase
    .from("user_outlook_tokens")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .single<OutlookTokenRow>();

  if (error || !row) throw new Error("No connected Outlook account for this user");

  const expiresAt = new Date(row.token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) return row.access_token;

  const res = await fetch(`https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await res.json();
  if (!res.ok || tokens.error) {
    throw new Error(`Failed to refresh Outlook token: ${tokens.error_description || tokens.error || res.status}`);
  }

  const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  // Microsoft may rotate the refresh token on use -- keep the old one if
  // it doesn't send a new one back.
  await supabase
    .from("user_outlook_tokens")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || row.refresh_token,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return tokens.access_token;
}

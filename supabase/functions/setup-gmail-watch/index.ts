// supabase/functions/setup-gmail-watch/index.ts
// One-time / manual function to set up Gmail push notifications for all connected users.
// Call this via: supabase functions invoke setup-gmail-watch

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const googleClientId     = Deno.env.get('GOOGLE_CLIENT_ID')!;
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const PUBSUB_TOPIC = Deno.env.get('GMAIL_PUBSUB_TOPIC')!;

const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (_req) => {
  console.log('[setup-watch] Starting Gmail watch setup');

  if (!PUBSUB_TOPIC) {
    return new Response(JSON.stringify({ error: 'GMAIL_PUBSUB_TOPIC not set' }), { status: 400 });
  }

  const { data: tokens, error } = await db
    .from('user_gmail_tokens')
    .select('user_id, email, access_token, refresh_token, token_expires_at');

  if (error) {
    console.error('[setup-watch] Failed to fetch tokens:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`[setup-watch] Found ${tokens?.length ?? 0} users`);
  const results: any[] = [];

  for (const t of (tokens || [])) {
    console.log(`[setup-watch] Setting up watch for ${t.email}`);

    // Refresh token if needed
    let accessToken = t.access_token;
    const isExpired = Date.now() > new Date(t.token_expires_at).getTime() - 5 * 60 * 1000;
    if (isExpired) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          refresh_token: t.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const refreshed = await res.json();
      if (!refreshed.access_token) {
        console.error(`[setup-watch] Token refresh failed for ${t.email}:`, refreshed.error);
        results.push({ email: t.email, error: 'token refresh failed: ' + refreshed.error });
        continue;
      }
      accessToken = refreshed.access_token;
      await db.from('user_gmail_tokens').update({
        access_token: refreshed.access_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('user_id', t.user_id);
    }

    // Call Gmail watch API
    const watchRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/watch',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicName: PUBSUB_TOPIC,
          labelIds: ['INBOX'],
          labelFilterAction: 'include',
        }),
      }
    );

    const watchData = await watchRes.json();
    console.log(`[setup-watch] ${t.email} watch result:`, JSON.stringify(watchData));

    if (watchRes.ok) {
      await db.from('user_gmail_tokens').update({
        gmail_history_id: watchData.historyId,
        watch_expiry: new Date(parseInt(watchData.expiration)).toISOString(),
      }).eq('user_id', t.user_id);

      results.push({
        email: t.email,
        ok: true,
        historyId: watchData.historyId,
        expiry: new Date(parseInt(watchData.expiration)).toISOString(),
      });
    } else {
      console.error(`[setup-watch] Watch failed for ${t.email}:`, JSON.stringify(watchData));
      results.push({ email: t.email, error: watchData.error?.message || JSON.stringify(watchData) });
    }
  }

  console.log('[setup-watch] Done:', JSON.stringify(results));
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

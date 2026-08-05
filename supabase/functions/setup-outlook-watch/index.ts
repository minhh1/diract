// supabase/functions/setup-outlook-watch/index.ts
// One-time / manual function to set up Graph change notifications for all
// connected Outlook users. Call via: supabase functions invoke setup-outlook-watch
// Mirrors supabase/functions/setup-gmail-watch, adapted for Graph:
//   - a Graph subscription (not a Gmail "watch") expires in ~3 days max,
//     not ~7 -- outlook-watch-renewal has to run much more often than
//     gmail-watch-renewal to keep up.
//   - creating a subscription requires notificationUrl (outlook-push) to
//     already be deployed and reachable -- Graph immediately calls it with a
//     validationToken and expects an echo back within 10s before the
//     subscription create call itself returns.
//   - Gmail's watch just gives you a starting historyId; Graph delta sync
//     needs its own seed call to get an initial @odata.deltaLink, done here
//     too so outlook-push has a cursor to start from.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const microsoftClientId     = Deno.env.get('MICROSOFT_CLIENT_ID')!;
const microsoftClientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')!;
const microsoftTenant       = Deno.env.get('MICROSOFT_TENANT') || 'common';
const webhookSecret         = Deno.env.get('OUTLOOK_WEBHOOK_SECRET')!;

const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const NOTIFICATION_URL = `${supabaseUrl}/functions/v1/outlook-push`;
// Graph caps mail-resource subscriptions at 4230 minutes (~2.94 days).
const SUBSCRIPTION_MINUTES = 4230;

Deno.serve(async (_req) => {
  console.log('[setup-outlook-watch] Starting Outlook watch setup');

  const { data: tokens, error } = await db
    .from('user_outlook_tokens')
    .select('user_id, email, access_token, refresh_token, token_expires_at');

  if (error) {
    console.error('[setup-outlook-watch] Failed to fetch tokens:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log(`[setup-outlook-watch] Found ${tokens?.length ?? 0} users`);
  const results: any[] = [];

  for (const t of (tokens || [])) {
    console.log(`[setup-outlook-watch] Setting up watch for ${t.email}`);

    // Refresh token if needed
    let accessToken = t.access_token;
    const isExpired = Date.now() > new Date(t.token_expires_at).getTime() - 5 * 60 * 1000;
    if (isExpired) {
      const res = await fetch(`https://login.microsoftonline.com/${microsoftTenant}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: microsoftClientId,
          client_secret: microsoftClientSecret,
          refresh_token: t.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const refreshed = await res.json();
      if (!refreshed.access_token) {
        console.error(`[setup-outlook-watch] Token refresh failed for ${t.email}:`, refreshed.error);
        results.push({ email: t.email, error: 'token refresh failed: ' + refreshed.error });
        continue;
      }
      accessToken = refreshed.access_token;
      await db.from('user_outlook_tokens').update({
        access_token: refreshed.access_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('user_id', t.user_id);
    }

    // Create the Graph subscription
    const expirationDateTime = new Date(Date.now() + SUBSCRIPTION_MINUTES * 60 * 1000).toISOString();
    const subRes = await fetch(`${GRAPH_BASE}/subscriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changeType: 'created,updated',
        notificationUrl: NOTIFICATION_URL,
        resource: "me/mailFolders('inbox')/messages",
        expirationDateTime,
        clientState: webhookSecret,
      }),
    });
    const subData = await subRes.json();
    console.log(`[setup-outlook-watch] ${t.email} subscription result:`, JSON.stringify(subData));

    if (!subRes.ok) {
      console.error(`[setup-outlook-watch] Subscription failed for ${t.email}:`, JSON.stringify(subData));
      results.push({ email: t.email, error: subData.error?.message || JSON.stringify(subData) });
      continue;
    }

    // Seed the delta cursor with an initial no-op delta call
    const deltaRes = await fetch(`${GRAPH_BASE}/me/mailFolders('inbox')/messages/delta`, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'odata.maxpagesize=1' },
    });
    let deltaLink: string | null = null;
    if (deltaRes.ok) {
      let page = await deltaRes.json();
      // Walk to the end (deltaLink only appears on the final page)
      while (page['@odata.nextLink'] && !page['@odata.deltaLink']) {
        const nextRes = await fetch(page['@odata.nextLink'], {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!nextRes.ok) break;
        page = await nextRes.json();
      }
      deltaLink = page['@odata.deltaLink'] || null;
    }

    await db.from('user_outlook_tokens').update({
      subscription_id: subData.id,
      subscription_expiry: subData.expirationDateTime,
      delta_link: deltaLink,
    }).eq('user_id', t.user_id);

    results.push({
      email: t.email,
      ok: true,
      subscriptionId: subData.id,
      expiry: subData.expirationDateTime,
      deltaLinkSeeded: !!deltaLink,
    });
  }

  console.log('[setup-outlook-watch] Done:', JSON.stringify(results));
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

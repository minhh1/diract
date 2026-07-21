// supabase/functions/teams-sync-worker/index.ts
// Polls Microsoft Graph for every company with connected Teams credentials
// (see supabase/company_teams_credentials.sql), on the schedule set up in
// supabase/teams_sync_cron.sql. Self-contained, same shape as
// gmail-email-sync-worker/index.ts -- Edge Functions run on Deno and can't
// import the Next app's lib/ files, so the Graph client logic lives here
// rather than in lib/msTeams/.
//
// App-only auth (client-credentials grant, no refresh token/per-user
// consent) -- requires the company's Azure AD app to have been granted org
// admin consent for ChannelMessage.Read.All, Chat.Read.All, and
// Team.ReadBasic.All application permissions (admin_consent_granted flag,
// set manually by the company admin after they complete that Azure step --
// this worker has no way to detect consent itself, it just tries the call
// and records the error if it fails).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MAX_MESSAGES_PER_RESOURCE = 200;

interface TeamsCredentials {
  tenant_id: string;
  client_id: string;
  client_secret: string;
}

async function getAppToken(creds: TeamsCredentials): Promise<string | null> {
  const res = await fetch(
    `https://login.microsoftonline.com/${creds.tenant_id}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );
  const json = await res.json();
  return json.access_token ?? null;
}

// Decodes the `roles` claim out of an app-only Graph access token, purely
// for diagnostics -- no signature verification, since we're only
// introspecting a token we just received ourselves, not authenticating an
// inbound request. Lets a failed Graph call report exactly what roles
// Microsoft actually issued, rather than relying on what the Azure Portal
// displays as granted (which can lag real token issuance).
function decodeTokenRoles(token: string): string[] {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json.roles ?? [];
  } catch {
    return ["<failed to decode token>"];
  }
}

async function getCursor(companyId: string, resourceType: "channel" | "chat", resourceId: string) {
  const { data } = await db
    .from("teams_sync_cursors")
    .select("delta_link")
    .eq("company_id", companyId)
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .maybeSingle();
  return data?.delta_link ?? null;
}

async function saveCursor(companyId: string, resourceType: "channel" | "chat", resourceId: string, deltaLink: string) {
  await db.from("teams_sync_cursors").upsert(
    { company_id: companyId, resource_type: resourceType, resource_id: resourceId, delta_link: deltaLink, updated_at: new Date().toISOString() },
    { onConflict: "company_id,resource_type,resource_id" }
  );
}

// Walks one delta feed to completion, following @odata.nextLink pages, and
// returns the messages plus the final @odata.deltaLink to store as the
// cursor for next time.
async function fetchDelta(token: string, startUrl: string): Promise<{ messages: any[]; deltaLink: string | null }> {
  const messages: any[] = [];
  let url: string | null = startUrl;
  let deltaLink: string | null = null;

  while (url && messages.length < MAX_MESSAGES_PER_RESOURCE) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Graph delta fetch failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    messages.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? null;
    if (json["@odata.deltaLink"]) deltaLink = json["@odata.deltaLink"];
  }
  return { messages, deltaLink };
}

function messageBody(msg: any): string | null {
  return msg.body?.content?.replace(/<[^>]+>/g, " ").trim() || null;
}

interface SyncSummary {
  teams: number;
  channels: number;
  channelListErrors: string[];
  rawMessages: number;
  storedMessages: number;
}

async function syncCompany(companyId: string, creds: TeamsCredentials): Promise<SyncSummary> {
  const token = await getAppToken(creds);
  if (!token) throw new Error("Failed to acquire app-only Graph token");

  const teamsRes = await fetch(`${GRAPH_BASE}/teams`, { headers: { Authorization: `Bearer ${token}` } });
  if (!teamsRes.ok) {
    throw new Error(
      `Failed to list teams: ${teamsRes.status} ${await teamsRes.text()} | roles actually in token: ${JSON.stringify(decodeTokenRoles(token))}`
    );
  }
  const teams = (await teamsRes.json()).value ?? [];

  const rows: Record<string, unknown>[] = [];
  let channelCount = 0;
  let rawMessageCount = 0;
  const channelListErrors: string[] = [];

  for (const team of teams) {
    const channelsRes = await fetch(`${GRAPH_BASE}/teams/${team.id}/channels`, { headers: { Authorization: `Bearer ${token}` } });
    if (!channelsRes.ok) {
      // Previously silently skipped -- a per-team permission/scope issue
      // (e.g. the app can list teams but not this particular team's
      // channels) would look identical to "no channels" with no way to
      // tell them apart.
      channelListErrors.push(`team ${team.id}: ${channelsRes.status} ${await channelsRes.text()}`);
      continue;
    }
    const channels = (await channelsRes.json()).value ?? [];
    channelCount += channels.length;

    for (const channel of channels) {
      const cursor = await getCursor(companyId, "channel", channel.id);
      const startUrl = cursor ?? `${GRAPH_BASE}/teams/${team.id}/channels/${channel.id}/messages/delta`;
      const { messages, deltaLink } = await fetchDelta(token, startUrl);
      rawMessageCount += messages.length;

      for (const msg of messages) {
        if (!messageBody(msg)) continue;
        rows.push({
          company_id: companyId,
          teams_channel_id: channel.id,
          from_name: msg.from?.user?.displayName ?? null,
          body: messageBody(msg),
          teams_message_id: msg.id,
          created_at: msg.createdDateTime ?? new Date().toISOString(),
        });
      }
      if (deltaLink) await saveCursor(companyId, "channel", channel.id, deltaLink);
    }
  }

  if (rows.length > 0) {
    await db.from("teams_messages").upsert(rows, { onConflict: "teams_message_id", ignoreDuplicates: true });
  }

  return { teams: teams.length, channels: channelCount, channelListErrors, rawMessages: rawMessageCount, storedMessages: rows.length };
}

Deno.serve(async () => {
  const started = Date.now();
  const { data: companies } = await db
    .from("company_teams_credentials")
    .select("company_id, credentials")
    .eq("admin_consent_granted", true);

  const results: Record<string, string> = {};

  for (const row of companies ?? []) {
    try {
      const summary = await syncCompany(row.company_id, row.credentials as TeamsCredentials);
      await db
        .from("company_teams_credentials")
        .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
        .eq("company_id", row.company_id);
      results[row.company_id] = `ok: ${JSON.stringify(summary)}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .from("company_teams_credentials")
        .update({ last_sync_error: message })
        .eq("company_id", row.company_id);
      results[row.company_id] = `error: ${message}`;
    }
  }

  await db.from("cron_heartbeats").upsert(
    { name: "teams-sync-worker", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: results },
    { onConflict: "name" }
  );

  return new Response(JSON.stringify({ synced: Object.keys(results).length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});

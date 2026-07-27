// lib/msTeamsBot/connector.ts
// Outbound side of the Bot Framework Connector protocol -- getting a bot
// bearer token and sending a reply activity back into the Teams
// conversation the inbound message came from.
//
// getBotToken uses the *single-tenant* token endpoint
// (login.microsoftonline.com/{tenant_id}/...) rather than the generic
// multi-tenant botframework.com one -- verified 2026-07-21 against
// Microsoft's "Register a Bot Framework bot with Azure" doc, which states
// multi-tenant bot creation was deprecated after 2025-07-31 (existing
// multi-tenant bots still work, but no new one can be created that way,
// and this integration is new as of 2026). Azure Bot resources created
// today are single-tenant or user-assigned-managed-identity; this only
// supports single-tenant (app ID + password + tenant ID), matching what
// AdminMsTeamsTab.tsx's bot connect form collects.
export interface BotCredentials {
  bot_app_id: string;
  bot_app_password: string;
  bot_tenant_id: string;
}

// Module-level cache, keyed by app ID -- the token is valid for roughly an
// hour (whatever `expires_in` the token endpoint returns), so re-fetching
// it on every single incoming message was a wasted network round trip most
// of the time. Only helps on a warm serverless invocation (reset on cold
// start), but that's the common case for a few-minutes-apart conversation.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getBotToken(creds: BotCredentials): Promise<string> {
  const cached = tokenCache.get(creds.bot_app_id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(`https://login.microsoftonline.com/${creds.bot_tenant_id}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.bot_app_id,
      client_secret: creds.bot_app_password,
      scope: "https://api.botframework.com/.default",
    }),
  });
  if (!res.ok) throw new Error(`Failed to get bot token: ${res.status} ${await res.text()}`);
  const json = await res.json();

  // 5-minute safety margin before actual expiry, same buffer style used
  // elsewhere in this codebase for token refresh (see lib/gmail/client.ts).
  tokenCache.set(creds.bot_app_id, { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 300) * 1000 });
  return json.access_token;
}

// Replies to a specific inbound activity within its conversation --
// {serviceUrl}/v3/conversations/{conversationId}/activities/{activityId}
// per the Bot Connector REST API. serviceUrl and conversationId/activityId
// all come from the inbound Activity the bot is responding to. Returns the
// new activity's own id (the Connector API's standard ResourceResponse
// shape, `{ "id": "..." }`) so callers can later verify a "like" reaction's
// `replyToId` actually targets this specific message -- see
// app/api/teams/bot/[companyId]/route.ts.
export async function sendReply(
  serviceUrl: string,
  conversationId: string,
  activityId: string,
  botToken: string,
  text: string
): Promise<string> {
  const url = `${serviceUrl.replace(/\/$/, "")}/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(activityId)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${botToken}` },
    body: JSON.stringify({ type: "message", text }),
  });
  if (!res.ok) throw new Error(`Failed to send Teams bot reply: ${res.status} ${await res.text()}`);
  const json = await res.json().catch(() => ({}));
  return json.id ?? "";
}

// Creates a brand-new 1:1 conversation with a specific Teams user, for
// proactively messaging someone who hasn't sent a message in the current
// conversation -- e.g. asking a configured signer to confirm their
// signature (see lib/ai/precedentAction.ts). Per the Bot Connector API's
// documented proactive-messaging pattern: POST /v3/conversations with the
// bot + target member, scoped to their tenant via channelData. Returns the
// new conversationId to post into via sendNewMessage below.
export async function createConversation(
  creds: BotCredentials,
  botToken: string,
  serviceUrl: string,
  tenantId: string,
  targetAadObjectId: string
): Promise<string> {
  const url = `${serviceUrl.replace(/\/$/, "")}/v3/conversations`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${botToken}` },
    body: JSON.stringify({
      bot: { id: creds.bot_app_id },
      members: [{ id: targetAadObjectId }],
      channelData: { tenant: { id: tenantId } },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create Teams conversation: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.id;
}

// Posts a brand-new message into a conversation with no specific prior
// activity to reply to (unlike sendReply) -- used right after
// createConversation, or any other proactive (not reply-triggered) send.
export async function sendNewMessage(serviceUrl: string, conversationId: string, botToken: string, text: string): Promise<string> {
  const url = `${serviceUrl.replace(/\/$/, "")}/v3/conversations/${encodeURIComponent(conversationId)}/activities`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${botToken}` },
    body: JSON.stringify({ type: "message", text }),
  });
  if (!res.ok) throw new Error(`Failed to send Teams proactive message: ${res.status} ${await res.text()}`);
  const json = await res.json().catch(() => ({}));
  return json.id ?? "";
}

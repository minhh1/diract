// lib/msTeamsBot/handleMessage.ts
// Teams-specific thin wrapper around the shared bot brain
// (lib/botEngine/handleMessage.ts) -- builds a ChannelAdapter (Bot Framework
// reply plumbing, teams_bot_* table names, /link-teams) and a ChannelMessage
// out of the inbound Activity, then hands off. Extracted out of
// app/api/teams/bot/[companyId]/route.ts so both messaging endpoints (that
// BYO-credentials route, and app/api/teams/bot/shared/route.ts's single
// endpoint for companies using Diract's own shared bot) can call the exact
// same logic -- neither this file nor the shared engine cares which
// credentials mode produced the botToken they're given.
import { getBotToken, sendReply, type BotCredentials } from "@/lib/msTeamsBot/connector";
import { handleChannelMessage, type ChannelAdapter, type ChannelMessage } from "@/lib/botEngine/handleMessage";
import type { IncomingMessage } from "./parseActivity";

export async function handleMessage(admin: any, companyId: string, botCreds: BotCredentials, msg: IncomingMessage) {
  const botToken = await getBotToken(botCreds);

  const adapter: ChannelAdapter = {
    linkedAccountsTable: "teams_bot_linked_accounts",
    pendingActionsTable: "teams_bot_pending_actions",
    linkRequestsTable: "teams_bot_link_requests",
    externalIdColumn: "teams_aad_object_id",
    linkPagePath: "/link-teams",
    reply: (text: string) => sendReply(msg.serviceUrl, msg.conversationId, msg.activityId, botToken, text),
    buildLinkRequestRow: () => ({
      teams_aad_object_id: msg.aadObjectId,
      teams_conversation_id: msg.conversationId,
      teams_tenant_id: msg.tenantId,
      teams_service_url: msg.serviceUrl,
    }),
  };

  const channelMessage: ChannelMessage = {
    externalId: msg.aadObjectId,
    question: msg.question,
    reactionTargetId: msg.reactionTargetId,
    isGroup: msg.isGroup,
    senderName: msg.senderName,
  };

  await handleChannelMessage(admin, companyId, adapter, channelMessage);
}

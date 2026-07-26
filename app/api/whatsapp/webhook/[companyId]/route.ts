// app/api/whatsapp/webhook/[companyId]/route.ts
// Meta calls this URL directly (no polling worker for WhatsApp, unlike
// Gmail/Teams). The webhook is scoped per-company via the URL path -- each
// company's Meta App is configured (by that company's admin, see
// AdminWhatsAppTab) to call its own /api/whatsapp/webhook/{companyId}, so
// GET verification can look up that company's webhook_verify_token without
// needing a single shared platform-wide secret.
//
// Beyond ingestion (unchanged from before), this now also gives the
// assistant the same "chat + act on the app" capability the Teams bot has
// (see app/api/teams/bot/[companyId]/route.ts) when a company has
// bot_enabled -- account linking, RAG chat, and create/update task/project/
// file/issue_precedent, via the shared channel-agnostic bot brain
// (lib/botEngine/handleMessage.ts). This route's own job is just Meta's
// protocol specifics: GET verification, X-Hub-Signature-256 authenticity,
// parsing the webhook payload into plain messages, and building a
// ChannelAdapter (WhatsApp Cloud API reply plumbing, whatsapp_bot_* table
// names, /link-whatsapp) per message before handing off.
import { NextRequest, NextResponse, after } from "next/server";
import { adminClient } from "@/lib/documentTemplateAuth";
import { verifyWhatsAppSignature } from "@/lib/whatsappBot/verifySignature";
import { sendWhatsAppReply, type WhatsAppDestination } from "@/lib/whatsappBot/sendMessage";
import { handleChannelMessage, type ChannelAdapter, type ChannelMessage } from "@/lib/botEngine/handleMessage";

interface WhatsAppCredentials {
  access_token: string;
  phone_number_id: string;
  business_account_id: string;
  webhook_verify_token: string;
  app_secret?: string;
}

// Meta's webhook subscription verification handshake -- unchanged.
export async function GET(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const admin = adminClient();
  const { data: row } = await admin.from("company_whatsapp_credentials").select("credentials").eq("company_id", companyId).maybeSingle();
  const credentials = row?.credentials as WhatsAppCredentials | undefined;

  if (mode === "subscribe" && credentials && token === credentials.webhook_verify_token) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// Inbound message delivery. Meta's payload shape:
// entry[].changes[].value.{metadata.phone_number_id, messages[], contacts[]}
// A group message's `messages[].group_id` field distinguishes it from a
// 1:1 message; `from` is still the individual sender's own number either
// way (confirmed against Meta's Groups API docs, 2026-07-24).
export async function POST(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const admin = adminClient();

  const { data: row } = await admin.from("company_whatsapp_credentials").select("credentials, bot_enabled").eq("company_id", companyId).maybeSingle();
  const credentials = row?.credentials as WhatsAppCredentials | undefined;
  if (!credentials) {
    return NextResponse.json({ error: "WhatsApp not connected" }, { status: 404 });
  }

  // Must verify against the *raw* bytes -- req.json() would consume the
  // stream without exposing them, so read as text first and parse after.
  const rawBody = await req.text();
  if (!verifyWhatsAppSignature(rawBody, req.headers.get("x-hub-signature-256"), credentials.app_secret ?? "")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }
  const payload = JSON.parse(rawBody);

  const rows: Record<string, unknown>[] = [];
  const botMessages: { waId: string; messageId: string; text: string; groupId: string | null; contactName: string | null; reactionTargetId?: string }[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (value.metadata?.phone_number_id !== credentials.phone_number_id) continue;

      const contactsByWaId = new Map<string, string>(
        (value.contacts ?? []).map((c: { wa_id: string; profile?: { name?: string } }) => [c.wa_id, c.profile?.name ?? null])
      );

      for (const message of value.messages ?? []) {
        const contactName = contactsByWaId.get(message.from) ?? null;
        rows.push({
          company_id: companyId,
          wa_phone_number_id: credentials.phone_number_id,
          contact_wa_id: message.from,
          contact_name: contactName,
          direction: "inbound",
          message_type: message.type,
          body: message.text?.body ?? null,
          wa_message_id: message.id,
          created_at: new Date(Number(message.timestamp) * 1000).toISOString(),
        });

        if (message.type === "text" && message.text?.body) {
          botMessages.push({ waId: message.from, messageId: message.id, text: message.text.body, groupId: message.group_id ?? null, contactName });
        }
        // A 👍 reaction counts as a lightweight "yes" -- lets someone
        // confirm a pending create/update without typing a word. Verified
        // strictly: message.reaction.message_id is carried through as
        // reactionTargetId and only treated as a confirm if it matches the
        // prompt_message_id we actually stored for that pending action (see
        // lib/botEngine/handleMessage.ts) -- a reaction on some unrelated
        // older message is ignored rather than blindly confirming whatever's
        // pending. Matches the base thumbs-up regardless of skin-tone modifier.
        if (message.type === "reaction" && message.reaction?.emoji?.startsWith("\u{1F44D}") && message.reaction?.message_id) {
          botMessages.push({ waId: message.from, messageId: message.id, text: "\u{1F44D}", groupId: message.group_id ?? null, contactName, reactionTargetId: message.reaction.message_id });
        }
      }
    }
  }

  if (rows.length > 0) {
    // wa_message_id is unique -- ignore duplicates Meta may redeliver.
    await admin.from("whatsapp_messages").upsert(rows, { onConflict: "wa_message_id", ignoreDuplicates: true });
  }

  // Same after()-not-bare-promise reasoning as the Teams bot route: once
  // this response is sent, Vercel can tear the invocation down immediately,
  // silently killing an un-awaited background promise mid-execution.
  if (row?.bot_enabled && botMessages.length > 0) {
    after(async () => {
      for (const m of botMessages) {
        await handleMessage(admin, companyId, credentials, m).catch((err) => console.error("WhatsApp bot message handling failed:", err));
      }
    });
  }

  // Meta requires a fast 200 response regardless of processing outcome,
  // or it will retry (and eventually disable) the webhook.
  return NextResponse.json({ received: true });
}

interface IncomingMessage {
  waId: string;
  messageId: string;
  text: string;
  groupId: string | null;
  contactName: string | null;
  reactionTargetId?: string;
}

function destinationFor(msg: IncomingMessage): WhatsAppDestination {
  return msg.groupId ? { type: "group", groupId: msg.groupId } : { type: "individual", waId: msg.waId };
}

// WhatsApp-specific thin wrapper around the shared bot brain -- builds a
// ChannelAdapter (WhatsApp Cloud API reply plumbing, whatsapp_bot_* table
// names, /link-whatsapp) and a ChannelMessage out of one parsed inbound
// message, then hands off. Mirrors lib/msTeamsBot/handleMessage.ts's Teams
// wrapper exactly.
async function handleMessage(admin: any, companyId: string, credentials: WhatsAppCredentials, msg: IncomingMessage) {
  const adapter: ChannelAdapter = {
    linkedAccountsTable: "whatsapp_bot_linked_accounts",
    pendingActionsTable: "whatsapp_bot_pending_actions",
    linkRequestsTable: "whatsapp_bot_link_requests",
    externalIdColumn: "wa_id",
    linkPagePath: "/link-whatsapp",
    reply: (text: string) => sendWhatsAppReply(credentials, destinationFor(msg), msg.messageId, text),
    buildLinkRequestRow: () => ({ wa_id: msg.waId }),
  };

  const channelMessage: ChannelMessage = {
    externalId: msg.waId,
    question: msg.text,
    reactionTargetId: msg.reactionTargetId,
    isGroup: !!msg.groupId,
    senderName: msg.contactName,
  };

  await handleChannelMessage(admin, companyId, adapter, channelMessage);
}

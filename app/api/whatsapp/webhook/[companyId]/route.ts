// app/api/whatsapp/webhook/[companyId]/route.ts
// Meta calls this URL directly (no polling worker for WhatsApp, unlike
// Gmail/Teams). The webhook is scoped per-company via the URL path -- each
// company's Meta App is configured (by that company's admin, see
// AdminWhatsAppTab) to call its own /api/whatsapp/webhook/{companyId}, so
// GET verification can look up that company's webhook_verify_token without
// needing a single shared platform-wide secret.
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/documentTemplateAuth";

interface WhatsAppCredentials {
  access_token: string;
  phone_number_id: string;
  business_account_id: string;
  webhook_verify_token: string;
}

// Meta's webhook subscription verification handshake.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const admin = adminClient();
  const { data: row } = await admin
    .from("company_whatsapp_credentials")
    .select("credentials")
    .eq("company_id", companyId)
    .maybeSingle();
  const credentials = row?.credentials as WhatsAppCredentials | undefined;

  if (mode === "subscribe" && credentials && token === credentials.webhook_verify_token) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// Inbound message delivery. Meta's payload shape:
// entry[].changes[].value.{metadata.phone_number_id, messages[], contacts[]}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const payload = await req.json();

  const admin = adminClient();
  const { data: row } = await admin
    .from("company_whatsapp_credentials")
    .select("credentials")
    .eq("company_id", companyId)
    .maybeSingle();
  const credentials = row?.credentials as WhatsAppCredentials | undefined;
  if (!credentials) {
    return NextResponse.json({ error: "WhatsApp not connected" }, { status: 404 });
  }

  const rows: Record<string, unknown>[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (value.metadata?.phone_number_id !== credentials.phone_number_id) continue;

      const contactsByWaId = new Map<string, string>(
        (value.contacts ?? []).map((c: { wa_id: string; profile?: { name?: string } }) => [c.wa_id, c.profile?.name ?? null])
      );

      for (const message of value.messages ?? []) {
        rows.push({
          company_id: companyId,
          wa_phone_number_id: credentials.phone_number_id,
          contact_wa_id: message.from,
          contact_name: contactsByWaId.get(message.from) ?? null,
          direction: "inbound",
          message_type: message.type,
          body: message.text?.body ?? null,
          wa_message_id: message.id,
          created_at: new Date(Number(message.timestamp) * 1000).toISOString(),
        });
      }
    }
  }

  if (rows.length > 0) {
    // wa_message_id is unique -- ignore duplicates Meta may redeliver.
    await admin.from("whatsapp_messages").upsert(rows, { onConflict: "wa_message_id", ignoreDuplicates: true });
  }

  // Meta requires a fast 200 response regardless of processing outcome,
  // or it will retry (and eventually disable) the webhook.
  return NextResponse.json({ received: true });
}

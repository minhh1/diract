// app/api/sms/send/route.ts
// On-demand SMS send from a lead/client entity record (see
// components/dashboard/SendSmsCard.tsx) plus the small sent-history list
// shown alongside it. Any company member can send (not admin-gated, unlike
// app/api/whatsapp/credentials/route.ts -- there's no per-company setup
// step to gate here, sending is just a normal record action).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { sendSms } from "@/lib/sms/sendMessage";

// Twilio requires E.164 (e.g. +15551234567). Existing phone/mobile_phone
// fields on entities are free text (see supabase/entities_contact_fields.sql),
// so a plain 10-digit US/Canada number is assumed if no country code is
// given -- anything else (other countries) must already include a leading
// "+" in the field.
function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 8 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const entityId = req.nextUrl.searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "entityId is required" }, { status: 400 });

  const { data, error } = await admin
    .from("sms_messages")
    .select("id, to_number, body, status, error, created_at")
    .eq("company_id", companyId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: data });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const entityId: string | undefined = body?.entityId;
  const to: string | undefined = body?.to;
  const text: string | undefined = body?.body;

  if (!to || !text?.trim()) {
    return NextResponse.json({ error: "to and body are required" }, { status: 400 });
  }
  const toNumber = toE164(to);
  if (!toNumber) {
    return NextResponse.json({ error: "Not a valid phone number" }, { status: 400 });
  }

  let status: "sent" | "failed" = "sent";
  let twilioSid: string | null = null;
  let sendError: string | null = null;
  try {
    const result = await sendSms(toNumber, text.trim());
    twilioSid = result.sid;
  } catch (err) {
    status = "failed";
    sendError = err instanceof Error ? err.message : "Unknown error";
  }

  const { data, error } = await admin
    .from("sms_messages")
    .insert({
      company_id: companyId,
      entity_id: entityId ?? null,
      to_number: toNumber,
      body: text.trim(),
      twilio_sid: twilioSid,
      status,
      error: sendError,
      sent_by: user.id,
    })
    .select("id, to_number, body, status, error, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === "failed") return NextResponse.json({ error: sendError, message: data }, { status: 502 });
  return NextResponse.json({ message: data });
}

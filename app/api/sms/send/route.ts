// app/api/sms/send/route.ts
// On-demand SMS send from a lead/client entity record (see
// components/dashboard/SendSmsCard.tsx), or free-text to any number (see
// app/(app)/dashboard/sms/page.tsx), plus the sent-history list shown
// alongside either. Any company member can send (not admin-gated, unlike
// app/api/whatsapp/credentials/route.ts -- there's no per-company setup
// step to gate here, sending is just a normal record action) -- guarded
// instead by the platform-wide opt-out list and a per-company daily cap
// below, since every company shares one Twilio number/reputation.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { sendSms } from "@/lib/sms/sendMessage";

const DAILY_SEND_CAP_PER_COMPANY = 200;

// Twilio requires E.164 (e.g. +61412345678). Existing phone/mobile_phone
// fields on entities are free text (see supabase/entities_contact_fields.sql),
// so a bare number with no country code is parsed as Australian -- this
// app's own market -- rather than the old default of assuming US/Canada,
// which silently mis-routed a naturally-typed AU mobile like "0412 345 678"
// (10 digits, leading trunk 0) to a +1 number instead of +61.
function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 8 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `+61${digits.slice(1)}`; // AU national format
  if (digits.length === 9) return `+61${digits}`; // AU number, trunk 0 already stripped
  if (digits.length === 10) return `+1${digits}`; // fallback: US/Canada
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  // entityId scopes to one record's own thread (SendSmsCard.tsx); omitting
  // it returns the company's whole recent send history instead (the
  // standalone composer, app/(app)/dashboard/sms/page.tsx, has no single
  // record to scope to).
  const entityId = req.nextUrl.searchParams.get("entityId");

  let query = admin
    .from("sms_messages")
    .select("id, entity_id, to_number, body, status, error, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(entityId ? 10 : 50);
  if (entityId) query = query.eq("entity_id", entityId);

  const { data, error } = await query;
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

  // Platform-wide -- see supabase/migrations/20260805080000_sms_opt_outs.sql
  // for why this isn't scoped to companyId (every tenant shares the same
  // sending number/reputation).
  const { data: optedOut } = await admin
    .from("sms_opt_outs")
    .select("phone_number")
    .eq("phone_number", toNumber)
    .maybeSingle();
  if (optedOut) {
    return NextResponse.json({ error: "This number has opted out of text messages" }, { status: 403 });
  }

  // Per-company cap -- protects the shared number's sender reputation from
  // any single tenant, now that sends aren't limited to "one lead at a time".
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await admin
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gte("created_at", todayStart.toISOString());
  if ((sentToday ?? 0) >= DAILY_SEND_CAP_PER_COMPANY) {
    return NextResponse.json({ error: `Daily send limit reached (${DAILY_SEND_CAP_PER_COMPANY}/day)` }, { status: 429 });
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

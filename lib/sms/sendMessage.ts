// lib/sms/sendMessage.ts
// Outbound SMS via the Twilio REST API, called directly with fetch (same
// raw-fetch approach as lib/whatsappBot/sendMessage.ts) rather than the
// `twilio` npm package -- one endpoint, Basic auth, no SDK needed. Uses the
// single platform-owned Twilio account (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/
// TWILIO_FROM_NUMBER), not per-company credentials -- see .env.example and
// supabase/migrations/20260726020000_sms_messages.sql.
export async function sendSms(to: string, body: string): Promise<{ sid: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER)");
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio send failed: ${res.status} ${json.message ?? JSON.stringify(json)}`);
  return { sid: json.sid };
}

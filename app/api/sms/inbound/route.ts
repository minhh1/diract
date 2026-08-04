// app/api/sms/inbound/route.ts
// Twilio's inbound-message webhook for the platform's shared SMS number
// (see lib/sms/sendMessage.ts) -- point Twilio's Messaging Service "A
// message comes in" webhook at ${APP_URL}/api/sms/inbound (manual step in
// the Twilio console, not something this app configures itself).
//
// Parses STOP/UNSUBSCRIBE/CANCEL replies and adds the sender to
// sms_opt_outs (see supabase/migrations/20260805080000_sms_opt_outs.sql for
// why that list is platform-wide, not per-company -- every tenant shares
// this one number). No authenticated app session exists for this request
// (it's Twilio's servers, not a signed-in user), so this uses the
// service-role client directly and instead verifies Twilio's own request
// signature to make sure the caller really is Twilio -- without that check,
// anyone could POST a forged "STOP" here to silently suppress messages to
// an arbitrary number for every company on the platform.
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { adminClient } from "@/lib/documentTemplateAuth";
import { APP_URL } from "@/lib/config";

const OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "cancel", "end", "quit"];

// Twilio's documented request-validation algorithm: sort the POST params by
// key, append "key+value" (no separator) for each directly onto the full
// webhook URL, HMAC-SHA1 with the auth token, base64-encode, compare to the
// X-Twilio-Signature header. See
// https://www.twilio.com/docs/usage/webhooks/webhooks-security -- this is
// the only thing standing between "anyone on the internet" and writing to
// the platform-wide opt-out list, so it's not optional.
function isValidTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !signature) return false;
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}

function emptyTwiml() {
  return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => { params[key] = String(value); });

  const webhookUrl = `${APP_URL}/api/sms/inbound`;
  const signature = req.headers.get("x-twilio-signature");
  if (!isValidTwilioSignature(webhookUrl, params, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const from = params.From?.trim();
  const body = (params.Body || "").trim().toLowerCase();
  if (from && OPT_OUT_KEYWORDS.includes(body)) {
    const admin = adminClient();
    await admin.from("sms_opt_outs").upsert(
      { phone_number: from, source: "stop_reply" },
      { onConflict: "phone_number", ignoreDuplicates: true }
    );
  }

  // Twilio Advanced Opt-Out (if enabled on the account) already sends its
  // own confirmation reply -- returning empty TwiML here avoids this route
  // ALSO sending a reply and double-texting the person who just asked to
  // stop hearing from this number.
  return emptyTwiml();
}

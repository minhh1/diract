// Resolves the right "from" address for a company (its own verified Resend
// domain if it has one, else the platform default) and sends + logs an
// email. Callers always go through notifyEvent (lib/email/notify.ts), which
// adds the per-company on/off check -- this file has no opinion on whether
// an event should fire, only on how to send one.
import { sendEmail as resendSend } from "@/lib/email/resend";

const DEFAULT_FROM = process.env.EMAIL_FROM_DEFAULT || "Diract <notifications@diract.io>";

export async function resolveSender(admin: any, companyId: string | null): Promise<string> {
  if (!companyId) return DEFAULT_FROM;
  const { data } = await admin
    .from("company_email_domains")
    .select("domain, from_name, from_local_part")
    .eq("company_id", companyId)
    .eq("status", "verified")
    .maybeSingle();
  if (!data) return DEFAULT_FROM;
  return `${data.from_name} <${data.from_local_part}@${data.domain}>`;
}

export interface SendEmailParams {
  admin: any;
  companyId: string | null;
  eventType: string;
  to: string;
  subject: string;
  html: string;
  sentBy?: string | null;
}

export async function sendEmail(params: SendEmailParams): Promise<{ ok: boolean; error?: string }> {
  const { admin, companyId, eventType, to, subject, html, sentBy } = params;
  const from = await resolveSender(admin, companyId);

  let status: "sent" | "failed" = "sent";
  let resendMessageId: string | null = null;
  let error: string | null = null;
  try {
    const result = await resendSend({ from, to, subject, html });
    resendMessageId = result.id;
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : "Unknown error";
  }

  await admin.from("email_log").insert({
    company_id: companyId,
    event_type: eventType,
    to_email: to,
    subject,
    from_address: from,
    resend_message_id: resendMessageId,
    status,
    error,
    sent_by: sentBy ?? null,
  });

  return status === "sent" ? { ok: true } : { ok: false, error: error ?? undefined };
}

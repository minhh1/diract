// The one gate every "important event" email goes through: checks the
// company's per-event on/off toggle (companies.email_notification_settings,
// see lib/notifications/eventTypes.ts) before handing off to sendEmail. A missing
// key means "on" -- only an explicit `false` skips the send.
import { sendEmail, SendEmailParams } from "@/lib/email/sendEmail";

export async function notifyEvent(params: SendEmailParams): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const { admin, companyId, eventType } = params;
  if (companyId) {
    const { data: company } = await admin.from("companies").select("email_notification_settings").eq("id", companyId).maybeSingle();
    if (company?.email_notification_settings?.[eventType] === false) {
      return { ok: true, skipped: true };
    }
  }
  return sendEmail(params);
}

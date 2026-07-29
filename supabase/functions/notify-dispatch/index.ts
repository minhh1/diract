// supabase/functions/notify-dispatch/index.ts
// Generic email + push sender, invoked by create_notification() (see
// supabase/migrations/20260729460000_create_notification_rpc.sql) for
// EVERY notification-worthy event in the app -- replaces the old
// notify-task-assigned function, which duplicated this same send logic for
// exactly one event. All the "should this even send" gating (per-user
// preference, per-company on/off) already happened in create_notification;
// this function trusts send_email/send_push and just sends.
//
// Standalone Deno function -- no access to the Next.js lib/email/* helpers,
// so the sender-resolution and HTML-shell logic below are deliberately
// small, self-contained copies of lib/email/sendEmail.ts and
// lib/email/templates.ts's renderShell (same duplication notify-task-
// assigned already had, for the same reason).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const DEFAULT_FROM = Deno.env.get("EMAIL_FROM_DEFAULT") || "Diract <notifications@diract.io>";

function renderShell(companyName: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;padding:32px;">
    <tr><td style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;padding-bottom:16px;">${companyName}</td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#334155;">${bodyHtml}</td></tr>
    </table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  const {
    recipient_user_id, company_id, event_type, title, body, link_url, send_email, send_push,
  } = await req.json().catch(() => ({}));
  if (!recipient_user_id || !event_type || !title) {
    return new Response(JSON.stringify({ error: "recipient_user_id, event_type, and title are required" }), { status: 400 });
  }
  if (!send_email && !send_push) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const { data: recipient } = await db.from("profiles").select("email, full_name").eq("id", recipient_user_id).maybeSingle();
  const { data: company } = company_id
    ? await db.from("companies").select("name").eq("id", company_id).maybeSingle()
    : { data: null };
  const companyName = company?.name || "Diract";

  let emailResult: { status: "sent" | "failed"; error?: string } | null = null;

  if (send_email && recipient?.email) {
    const { data: domainRow } = await db
      .from("company_email_domains")
      .select("domain, from_name, from_local_part")
      .eq("company_id", company_id)
      .eq("status", "verified")
      .maybeSingle();
    const from = domainRow ? `${domainRow.from_name} <${domainRow.from_local_part}@${domainRow.domain}>` : DEFAULT_FROM;

    const html = renderShell(
      companyName,
      `<p>Hi ${recipient.full_name || "there"},</p>
       <p>${body || title}</p>
       ${link_url ? `<p><a href="${link_url}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#4f46e5;color:#ffffff;border-radius:999px;text-decoration:none;font-weight:600;font-size:13px;">View in Diract</a></p>` : ""}`
    );

    let status: "sent" | "failed" = "sent";
    let resendMessageId: string | null = null;
    let error: string | null = null;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: recipient.email, subject: title, html }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || JSON.stringify(json));
      resendMessageId = json.id;
    } catch (err) {
      status = "failed";
      error = err instanceof Error ? err.message : "Unknown error";
    }

    await db.from("email_log").insert({
      company_id, event_type, to_email: recipient.email, subject: title,
      from_address: from, resend_message_id: resendMessageId, status, error,
    });
    emailResult = { status, error: error ?? undefined };
  }

  if (send_push) {
    await sendPushToUser(recipient_user_id, title, body || "", { type: event_type, link_url });
  }

  return new Response(JSON.stringify({ email: emailResult }), { status: 200 });
});

// Best-effort -- a push failure never blocks the email path above (already
// sent by the time this runs).
async function sendPushToUser(userId: string, title: string, body: string, data: Record<string, unknown>) {
  try {
    const { data: tokens } = await db.from("device_push_tokens").select("expo_push_token").eq("user_id", userId);
    if (!tokens?.length) return;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(tokens.map((t) => ({ to: t.expo_push_token, title, body, data }))),
    });
  } catch (err) {
    console.error("notify-dispatch: push failed", err);
  }
}

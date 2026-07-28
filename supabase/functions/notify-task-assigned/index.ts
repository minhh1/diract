// supabase/functions/notify-task-assigned/index.ts
// Emails a task's assignee. Triggered by the tasks.assignee_id trigger in
// supabase/migrations/20260726050000_task_assigned_email_trigger.sql (see
// that file for why a DB trigger rather than an app-layer call site).
// Standalone Deno function -- no access to the Next.js lib/email/* helpers,
// so the sender-resolution and HTML-shell logic below are deliberately
// small, self-contained copies of lib/email/sendEmail.ts and
// lib/email/templates.ts's renderShell.
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
  const { task_id, company_id, assignee_id, task_name, project_id } = await req.json().catch(() => ({}));
  if (!company_id || !assignee_id || !task_name) {
    return new Response(JSON.stringify({ error: "company_id, assignee_id, and task_name are required" }), { status: 400 });
  }

  const { data: company } = await db.from("companies").select("name, email_notification_settings").eq("id", company_id).maybeSingle();
  if (company?.email_notification_settings?.task_assigned === false) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const { data: assignee } = await db.from("profiles").select("email, full_name").eq("id", assignee_id).maybeSingle();
  if (!assignee?.email) {
    return new Response(JSON.stringify({ skipped: true, reason: "no assignee email" }), { status: 200 });
  }

  const { data: project } = project_id
    ? await db.from("projects").select("name").eq("id", project_id).maybeSingle()
    : { data: null };

  const { data: domainRow } = await db
    .from("company_email_domains")
    .select("domain, from_name, from_local_part")
    .eq("company_id", company_id)
    .eq("status", "verified")
    .maybeSingle();
  const from = domainRow ? `${domainRow.from_name} <${domainRow.from_local_part}@${domainRow.domain}>` : DEFAULT_FROM;

  const companyName = company?.name || "Diract";
  const subject = `You were assigned: ${task_name}`;
  const html = renderShell(
    companyName,
    `<p>Hi ${assignee.full_name || "there"},</p>
     <p>You were assigned a task${project?.name ? ` in <strong>${project.name}</strong>` : ""}:</p>
     <p style="font-size:16px;font-weight:600;color:#0f172a;">${task_name}</p>`
  );

  let status: "sent" | "failed" = "sent";
  let resendMessageId: string | null = null;
  let error: string | null = null;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: assignee.email, subject, html }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || JSON.stringify(json));
    resendMessageId = json.id;
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : "Unknown error";
  }

  await db.from("email_log").insert({
    company_id, event_type: "task_assigned", to_email: assignee.email, subject,
    from_address: from, resend_message_id: resendMessageId, status, error,
  });

  if (company?.push_notification_settings?.task_assigned !== false) {
    await sendPushToUser(assignee_id, "You were assigned a task", task_name, { type: "task", id: task_id });
  }

  return new Response(JSON.stringify({ status, task_id }), { status: 200 });
});

// Best-effort -- a push failure never blocks the email path above (already
// sent by the time this runs) or the trigger that called this function.
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
    console.error("notify-task-assigned: push failed", err);
  }
}

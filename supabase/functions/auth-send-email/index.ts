// supabase/functions/auth-send-email/index.ts
// Supabase Auth "Send Email" hook -- replaces Supabase's own built-in auth
// mailer for every auth email (signup confirmation, password recovery,
// magic link, invite, email change) so each can be sent branded per-tenant
// via Resend, same as notify-task-assigned. Must be enabled manually in
// Supabase Dashboard -> Authentication -> Hooks -> "Send Email hook",
// pointed at this function, with SEND_EMAIL_HOOK_SECRET set to the secret
// the dashboard generates there.
//
// Unlike every other function in this repo (see notify-task-assigned,
// gmail-push, etc. -- none verify their caller), this one DOES verify the
// Supabase-signed webhook payload before doing anything. That's a
// deliberate departure: an unverified endpoint here would let anyone
// trigger and read the content of a real password-reset/signup-confirm
// email for any user, which is a meaningfully worse risk than the
// spam-adjacent exposure notify-task-assigned already inherits from the
// rest of this codebase's no-caller-verification convention.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const DEFAULT_FROM = Deno.env.get("EMAIL_FROM_DEFAULT") || "Diract <notifications@diract.io>";
// Supabase's dashboard shows the hook secret as "v1,whsec_..." -- the
// Webhook class wants just the whsec_ value.
const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "").replace("v1,whsec_", "");

function renderShell(companyName: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;padding:32px;">
    <tr><td style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;padding-bottom:16px;">${companyName}</td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#334155;">${bodyHtml}</td></tr>
    </table></td></tr></table></body></html>`;
}

function contentFor(actionType: string, verifyUrl: string, companyName: string): { subject: string; body: string } {
  switch (actionType) {
    case "signup":
      return {
        subject: `Confirm your ${companyName} account`,
        body: `<p>Welcome to ${companyName}. Confirm your email to get started:</p><p><a href="${verifyUrl}">Confirm email</a></p>`,
      };
    case "recovery":
      return {
        subject: `Reset your ${companyName} password`,
        body: `<p>Someone requested a password reset for your ${companyName} account.</p><p><a href="${verifyUrl}">Reset password</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      };
    case "magiclink":
      return {
        subject: `Your ${companyName} sign-in link`,
        body: `<p><a href="${verifyUrl}">Sign in to ${companyName}</a></p>`,
      };
    case "invite":
      return {
        subject: `You've been invited to ${companyName}`,
        body: `<p><a href="${verifyUrl}">Accept invitation</a></p>`,
      };
    case "email_change":
      return {
        subject: `Confirm your new email for ${companyName}`,
        body: `<p><a href="${verifyUrl}">Confirm new email</a></p>`,
      };
    default:
      return {
        subject: `${companyName} account notice`,
        body: `<p><a href="${verifyUrl}">Continue</a></p>`,
      };
  }
}

Deno.serve(async (req) => {
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let verified: {
    user: { id: string; email: string };
    email_data: { token_hash: string; redirect_to: string; email_action_type: string };
  };
  try {
    verified = new Webhook(hookSecret).verify(payload, headers) as typeof verified;
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 401, message: "Invalid webhook signature" } }), { status: 401 });
  }

  const { user, email_data } = verified;
  const { token_hash, redirect_to, email_action_type } = email_data;

  const { data: profile } = await db.from("profiles").select("active_company_id").eq("id", user.id).maybeSingle();
  const companyId: string | null = profile?.active_company_id ?? null;

  let companyName = "Diract";
  let from = DEFAULT_FROM;
  if (companyId) {
    const { data: company } = await db.from("companies").select("name").eq("id", companyId).maybeSingle();
    if (company?.name) companyName = company.name;
    const { data: domainRow } = await db
      .from("company_email_domains")
      .select("domain, from_name, from_local_part")
      .eq("company_id", companyId)
      .eq("status", "verified")
      .maybeSingle();
    if (domainRow) from = `${domainRow.from_name} <${domainRow.from_local_part}@${domainRow.domain}>`;
  }

  const verifyUrl = `${Deno.env.get("SUPABASE_URL")}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${encodeURIComponent(redirect_to)}`;
  const { subject, body } = contentFor(email_action_type, verifyUrl, companyName);
  const html = renderShell(companyName, body);

  let status: "sent" | "failed" = "sent";
  let resendMessageId: string | null = null;
  let error: string | null = null;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: user.email, subject, html }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || JSON.stringify(json));
    resendMessageId = json.id;
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : "Unknown error";
  }

  await db.from("email_log").insert({
    company_id: companyId, event_type: `auth_${email_action_type}`, to_email: user.email, subject,
    from_address: from, resend_message_id: resendMessageId, status, error,
  });

  if (status === "failed") {
    return new Response(JSON.stringify({ error: { http_code: 500, message: "Failed to send email" } }), { status: 500 });
  }
  return new Response(JSON.stringify({}), { status: 200 });
});

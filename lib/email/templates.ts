// Plain HTML string templates -- no react-email/JSX, matching this
// codebase's preference for raw string bodies over templating libraries
// (see lib/whatsappBot/sendMessage.ts, lib/sms/sendMessage.ts). renderShell
// wraps a body fragment in a minimal, table-based layout that renders
// consistently across email clients. companyName is whatever verified
// sending domain (or lack of one) resolved to -- see resolveSender in
// lib/email/sendEmail.ts -- purely cosmetic, not a security boundary.
export function renderShell(companyName: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;padding:32px;">
            <tr>
              <td style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;padding-bottom:16px;">
                ${companyName}
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:1.6;color:#334155;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function taskAssignedHtml(params: {
  companyName: string;
  assigneeName: string;
  taskName: string;
  projectName: string | null;
  taskUrl: string | null;
}): string {
  const { companyName, assigneeName, taskName, projectName, taskUrl } = params;
  return renderShell(
    companyName,
    `<p>Hi ${assigneeName},</p>
     <p>You were assigned a task${projectName ? ` in <strong>${projectName}</strong>` : ""}:</p>
     <p style="font-size:16px;font-weight:600;color:#0f172a;">${taskName}</p>
     ${taskUrl ? `<p><a href="${taskUrl}" style="color:#4f46e5;">View task</a></p>` : ""}`
  );
}

export function archiveRequestDecisionHtml(params: {
  companyName: string;
  requesterName: string;
  entityLabel: string;
  approved: boolean;
}): string {
  const { companyName, requesterName, entityLabel, approved } = params;
  return renderShell(
    companyName,
    `<p>Hi ${requesterName},</p>
     <p>Your request to archive <strong>${entityLabel}</strong> was
        ${approved ? "<span style=\"color:#059669;\">approved</span>" : "<span style=\"color:#dc2626;\">rejected</span>"}.</p>`
  );
}

// Auth emails (signup confirmation, password recovery, magic link, email
// change) are rendered independently inside
// supabase/functions/auth-send-email -- that's a standalone Deno function
// with no access to this Next.js lib, so its copy of renderShell is
// deliberately duplicated there rather than imported.

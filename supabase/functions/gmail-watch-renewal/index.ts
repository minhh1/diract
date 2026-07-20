// supabase/functions/gmail-watch-renewal/index.ts
// Runs daily — checks Gmail watch health for all connected users
// 1. Renews watches expiring within 48 hours
// 2. Detects users whose last_history_id hasn't changed in 24h (stalled sync)
// 3. Emails company admin if any user's sync is stalled

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const PUBSUB_TOPIC = Deno.env.get("GMAIL_PUBSUB_TOPIC")!;

// ── Token refresh ──────────────────────────────────────────────────

async function getAccessToken(userId: string): Promise<string | null> {
  const { data } = await db.from("user_gmail_tokens")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId).single();
  if (!data) return null;
  if (new Date(data.token_expires_at).getTime() < Date.now() + 60_000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: googleClientId, client_secret: googleClientSecret,
        refresh_token: data.refresh_token, grant_type: "refresh_token" }),
    });
    const r = await res.json();
    if (!r.access_token) return null;
    await db.from("user_gmail_tokens").update({
      access_token: r.access_token,
      token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
    }).eq("user_id", userId);
    return r.access_token;
  }
  return data.access_token;
}

// ── Renew Gmail watch ──────────────────────────────────────────────

async function renewWatch(userId: string, token: string): Promise<{
  ok: boolean; expiry?: string; historyId?: string; error?: string;
}> {
  if (!PUBSUB_TOPIC) return { ok: false, error: "No PUBSUB_TOPIC configured" };

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ topicName: PUBSUB_TOPIC, labelIds: ["INBOX"] }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: `${res.status} ${err}` };
  }

  const data = await res.json();
  const expiry = new Date(parseInt(data.expiration)).toISOString();
  const historyId = data.historyId;

  await db.from("user_gmail_tokens").update({
    watch_expiry: expiry,
    last_history_id: historyId,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return { ok: true, expiry, historyId };
}

// ── Send admin email via Gmail API ─────────────────────────────────

async function sendAdminEmail(
  adminToken: string,
  adminEmail: string,
  subject: string,
  body: string
): Promise<void> {
  const message = [
    `To: ${adminEmail}`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    body,
  ].join("\r\n");

  const encoded = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded }),
  });
}

// ── Heartbeat ──────────────────────────────────────────────────────

async function heartbeat(name: string, durationMs: number, result: unknown): Promise<void> {
  try {
    await db.from("cron_heartbeats").upsert(
      { name, last_run_at: new Date().toISOString(), last_duration_ms: durationMs, last_result: result },
      { onConflict: "name" }
    );
  } catch (_) { /* never break the check over a heartbeat write */ }
}

// ── Main ───────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  console.log("[watch-renewal] START");
  const t0 = Date.now();
  const now = Date.now();
  const in48h = now + 48 * 60 * 60 * 1000;
  const stalledThreshold = now - 24 * 60 * 60 * 1000; // no update in 24h

  const results: any[] = [];

  // Get all companies with Gmail configured
  const { data: companies } = await db.from("companies")
    .select("id, name, gmail_source_emails, gmail_parent_label")
    .not("gmail_parent_label", "is", null);

  for (const company of (companies || [])) {
    const companyId = company.id;
    const companyName = company.name;
    const adminEmail = company.gmail_source_emails?.[0];

    console.log(`[watch-renewal] Company "${companyName}" adminEmail=${adminEmail}`);

    // Get all connected users for this company
    const { data: members } = await db.from("company_memberships")
      .select("user_id").eq("company_id", companyId);

    const userIds = (members || []).map((m: any) => m.user_id);
    if (!userIds.length) continue;

    const { data: tokens } = await db.from("user_gmail_tokens")
      .select("user_id, email, watch_expiry, last_history_id, updated_at")
      .in("user_id", userIds);

    const renewed: string[] = [];
    const stalled: { email: string; lastSeen: string; reason: string }[] = [];
    const failed: { email: string; error: string }[] = [];

    for (const t of (tokens || []) as any[]) {
      const { user_id: userId, email, watch_expiry, last_history_id, updated_at } = t;

      // ── Check if stalled ────────────────────────────────────────
      const lastUpdate = updated_at ? new Date(updated_at).getTime() : 0;
      const watchExpiry = watch_expiry ? new Date(watch_expiry).getTime() : 0;

      let stalledReason = "";
      if (!watch_expiry) {
        stalledReason = "No watch configured";
      } else if (watchExpiry < now) {
        stalledReason = `Watch expired ${new Date(watchExpiry).toLocaleString("en-AU")}`;
      } else if (!last_history_id) {
        stalledReason = "No history ID — never received push notification";
      } else if (lastUpdate < stalledThreshold && lastUpdate > 0) {
        stalledReason = `No activity for ${Math.round((now - lastUpdate) / 3600000)}h`;
      }

      if (stalledReason) {
        console.log(`[watch-renewal] STALLED: ${email} — ${stalledReason}`);
        stalled.push({ email, lastSeen: updated_at || "never", reason: stalledReason });
      }

      // ── Renew if expiring within 48h or stalled ─────────────────
      const needsRenewal = !watch_expiry || watchExpiry < in48h;

      if (needsRenewal || stalledReason) {
        console.log(`[watch-renewal] Renewing watch for ${email}`);
        const token = await getAccessToken(userId);
        if (!token) {
          console.error(`[watch-renewal] No token for ${email}`);
          failed.push({ email, error: "Cannot refresh OAuth token" });
          continue;
        }

        const result = await renewWatch(userId, token);
        if (result.ok) {
          console.log(`[watch-renewal] ✓ Renewed ${email} — expires ${result.expiry}`);
          renewed.push(email);
          // Remove from stalled if renewal fixed it
          const idx = stalled.findIndex(s => s.email === email);
          if (idx !== -1 && stalledReason !== "No history ID — never received push notification") {
            stalled.splice(idx, 1);
          }
        } else {
          console.error(`[watch-renewal] ✗ Failed to renew ${email}: ${result.error}`);
          failed.push({ email, error: result.error || "Unknown" });
        }
      } else {
        const hoursLeft = Math.round((watchExpiry - now) / 3600000);
        console.log(`[watch-renewal] ✓ ${email} watch OK — ${hoursLeft}h remaining`);
      }
    }

    // ── Email admin if any issues ──────────────────────────────────
    const issues = [...stalled, ...failed];
    if (issues.length > 0 && adminEmail) {
      console.log(`[watch-renewal] Emailing admin ${adminEmail} about ${issues.length} issues`);

      const adminUserId = (tokens as any[]).find((t: any) => t.email === adminEmail)?.user_id;
      if (adminUserId) {
        const adminToken = await getAccessToken(adminUserId);
        if (adminToken) {
          const issueRows = issues.map(i => `
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${i.email}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#dc2626;">${'reason' in i ? i.reason : i.error}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#94a3b8;">${'lastSeen' in i ? new Date(i.lastSeen).toLocaleString("en-AU") : "—"}</td>
            </tr>`).join("");

          const renewedHtml = renewed.length
            ? `<p style="color:#16a34a;margin-top:16px;">✓ Successfully renewed watches for: ${renewed.join(", ")}</p>`
            : "";

          const body = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <h2 style="color:#0f172a;margin:0 0 8px;">⚠️ Gmail Sync Alert — ${companyName}</h2>
              <p style="color:#64748b;margin:0 0 24px;">The following users have Gmail sync issues that require attention:</p>
              <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Email</th>
                    <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Issue</th>
                    <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Last seen</th>
                  </tr>
                </thead>
                <tbody>${issueRows}</tbody>
              </table>
              ${renewedHtml}
              <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
                To fix: ask the affected user to disconnect and reconnect their Gmail account in Flow settings.<br>
                This check runs daily at 7am AEST.
              </p>
            </div>`;

          await sendAdminEmail(adminToken, adminEmail,
            `⚠️ Gmail Sync Alert — ${issues.length} user${issues.length !== 1 ? "s" : ""} affected (${companyName})`,
            body);
          console.log(`[watch-renewal] ✓ Alert email sent to ${adminEmail}`);
        }
      }
    } else if (issues.length === 0) {
      console.log(`[watch-renewal] ✓ All users healthy for ${companyName}`);
    }

    results.push({ companyId, companyName, renewed, stalled, failed });
  }

  console.log(`[watch-renewal] DONE in ${Date.now() - t0}ms`);
  await heartbeat("gmail-watch-renewal", Date.now() - t0, {
    companies: results.length,
    stalled: results.reduce((n, r) => n + r.stalled.length, 0),
    failed: results.reduce((n, r) => n + r.failed.length, 0),
  });
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
// supabase/functions/gmail-push/index.ts
// PUB/SUB handler — real-time corrections + auto-label by subject
// 1. Label removed by user → re-add if still active in DB, remove from completed_users
// 2. New email with company label → save to project_emails + store subject
// 3. New email without label → check subject against project_email_subjects → auto-label

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

// ── Helpers ────────────────────────────────────────────────────────

async function getAccessToken(userId: string): Promise<string | null> {
  const { data } = await db
    .from("user_gmail_tokens")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .single();
  if (!data) return null;
  if (new Date(data.token_expires_at).getTime() < Date.now() + 60_000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: data.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const refreshed = await res.json();
    if (!refreshed.access_token) return null;
    await db.from("user_gmail_tokens").update({
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }).eq("user_id", userId);
    return refreshed.access_token;
  }
  return data.access_token;
}

async function getGmailLabels(token: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return (await res.json()).labels || [];
}

// Strip "/" from leaf label name to avoid Gmail hierarchy issues
function sanitiseLabelName(name: string): string {
  const parts = name.split("/");
  if (parts.length <= 1) return name.replace(/\//g, "-");
  const leaf = parts[parts.length - 1].replace(/\//g, "-");
  return [...parts.slice(0, -1), leaf].join("/");
}

async function createLabelHierarchy(
  token: string,
  labelName: string,
  existingLabels: { id: string; name: string }[]
): Promise<string | null> {
  const safeName = sanitiseLabelName(labelName);
  const parts = safeName.split("/");
  let lastId: string | null = null;
  for (let i = 1; i <= parts.length; i++) {
    const partial = parts.slice(0, i).join("/");
    const found = existingLabels.find(l => l.name === partial);
    if (found) { lastId = found.id; continue; }
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: partial,
        labelListVisibility: "labelShow",
        messageListVisibility: i === parts.length ? "show" : "hide",
      }),
    });
    if (res.ok) {
      const created = await res.json();
      lastId = created.id;
      existingLabels.push(created);
    }
  }
  return lastId;
}

async function getMessageHistory(token: string, startHistoryId: string): Promise<any[]> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
  url.searchParams.set("startHistoryId", startHistoryId);
  url.searchParams.append("historyTypes", "messageAdded");
  url.searchParams.append("historyTypes", "labelAdded");
  url.searchParams.append("historyTypes", "labelRemoved");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.log(`[push] History fetch failed: ${res.status} ${await res.text()}`);
    return [];
  }
  return (await res.json()).history || [];
}

async function getMessage(token: string, msgId: string): Promise<any | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.ok ? await res.json() : null;
}


function extractEmailMeta(msgData: any): {
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  date: string | null;
  snippet: string | null;
} {
  const headers = msgData?.payload?.headers || [];
  const get = (name: string) => headers.find((h: any) => h.name === name)?.value || null;
  const fromRaw = get("From");
  // Parse "Name <email>" or just "email"
  let from_name: string | null = null;
  let from_address: string | null = null;
  if (fromRaw) {
    const m = fromRaw.match(/^(.+?)\s*<([^>]+)>/);
    if (m) {
      from_name = m[1].replace(/^"|"$/g, "").trim();
      from_address = m[2].trim();
    } else {
      from_address = fromRaw.trim();
    }
  }
  const dateRaw = get("Date");
  let date: string | null = null;
  if (dateRaw) {
    try { date = new Date(dateRaw).toISOString(); } catch { date = null; }
  }
  return {
    subject: get("Subject"),
    from_address,
    from_name,
    date,
    snippet: msgData?.snippet || null,
  };
}

function normaliseSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd?|fw|aw|antw|tr|sv|vs|rv|ref):\s*/gi, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

async function applyLabel(token: string, msgId: string, labelId: string): Promise<boolean> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
  return res.ok;
}

// Remove user from completed_users so next sync re-processes them
async function invalidateSyncJob(companyId: string, projectId: string, userId: string): Promise<void> {
  const { data: job } = await db.from("gmail_sync_jobs")
    .select("id, completed_users")
    .eq("job_type", "label_sync")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!job) return;
  const updated = (job.completed_users || []).filter((u: string) => u !== userId);
  await db.from("gmail_sync_jobs").update({
    completed_users: updated,
    status: "pending",
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);
}

// ── Main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const body = await req.json();

    // Pub/Sub message is base64 encoded
    const data = body.message?.data;
    if (!data) return new Response("ok", { status: 200 });

    const decoded = JSON.parse(atob(data));
    const { emailAddress, historyId } = decoded;
    console.log(`[push] ${emailAddress} historyId=${historyId}`);

    // Find user by email
    const { data: tokenRow } = await db
      .from("user_gmail_tokens")
      .select("user_id, last_history_id")
      .eq("email", emailAddress)
      .maybeSingle();

    if (!tokenRow) {
      console.log(`[push] No token for ${emailAddress}`);
      return new Response("ok", { status: 200 });
    }

    const { user_id: userId, last_history_id: lastHistoryId } = tokenRow;
    const token = await getAccessToken(userId);
    if (!token) return new Response("ok", { status: 200 });

    // Get ALL companies this user belongs to, with their gmail_parent_label
    const { data: memberships } = await db
      .from("company_memberships")
      .select("company_id, companies:company_id(id, gmail_parent_label)")
      .eq("user_id", userId);

    // Build map: parentLabel → companyId
    const companiesByPrefix = new Map<string, string>();
    for (const m of (memberships || [])) {
      const pl = (m.companies as any)?.gmail_parent_label;
      if (pl) companiesByPrefix.set(pl, m.company_id);
    }

    console.log(`[push] user=${userId} companies=${companiesByPrefix.size} prefixes=[${[...companiesByPrefix.keys()].join(', ')}]`);

    if (!companiesByPrefix.size) {
      console.log(`[push] No companies with gmail configured for ${emailAddress}`);
      return new Response("ok", { status: 200 });
    }

    // Get all active DB labels for ALL this user's companies
    const allCompanyIds = [...companiesByPrefix.values()];
    const { data: dbLabels } = await db
      .from("project_gmail_labels")
      .select("project_id, label_code, gmail_label_name, company_id")
      .in("company_id", allCompanyIds)
      .is("removed_at", null);

    // Key by label_code for quick lookup
    const dbLabelsByCode = new Map((dbLabels || []).map(l => [l.label_code, l]));

    console.log(`[push] companies=${allCompanyIds.length}, dbLabels=${dbLabelsByCode.size}`);

    // Helper: get company_id from a Gmail label name by matching prefix
    const getCompanyFromLabelName = (labelName: string): string | null => {
      for (const [prefix, companyId] of companiesByPrefix) {
        if (labelName.startsWith(prefix + "/")) return companyId;
      }
      return null;
    };

    // Fetch history since last known ID
    const startId = lastHistoryId || String(BigInt(historyId) - 10n);
    const history = await getMessageHistory(token, startId);

    // Update history ID
    await db.from("user_gmail_tokens")
      .update({ last_history_id: historyId })
      .eq("user_id", userId);

    if (!history.length) {
      console.log(`[push] No history events`);
      return new Response("ok", { status: 200 });
    }

    const gmailLabels = await getGmailLabels(token);

    console.log(`[push] ${history.length} history events, companies=${allCompanyIds.length}, dbLabels=${dbLabelsByCode.size}`);

    for (const event of history) {

      // ── Labels added: save to project_emails if company label ─────
      for (const item of (event.labelsAdded || [])) {
        const msgId = item.message?.id;
        if (!msgId) continue;
        for (const addedLabelId of (item.labelIds || [])) {
          const gmailLabel = gmailLabels.find(l => l.id === addedLabelId);
          if (!gmailLabel) continue;
          const companyId = getCompanyFromLabelName(gmailLabel.name);
          if (!companyId) continue;
          const codeMatch = gmailLabel.name.match(/\[([A-Z0-9]{4,6})\]$/);
          if (!codeMatch) continue;
          const dbLabel = dbLabelsByCode.get(codeMatch[1]);
          if (!dbLabel) continue;
          console.log(`[push] Label added "${gmailLabel.name}" → project ${dbLabel.project_id}`);
          const msgData1 = await getMessage(token, msgId);
          const threadId1 = msgData1?.threadId || msgId;
          const meta1 = extractEmailMeta(msgData1);
          const { error: e1 } = await db.from("project_emails").upsert({
            project_id: dbLabel.project_id, company_id: companyId,
            user_id: userId, gmail_message_id: msgId, gmail_thread_id: threadId1,
            subject: meta1.subject, from_address: meta1.from_address, from_name: meta1.from_name,
            date: meta1.date, snippet: meta1.snippet, gmail_label_applied: true,
          }, { onConflict: "user_id,gmail_message_id", ignoreDuplicates: true });
          if (e1) console.error(`[push] project_emails error:`, e1.message);
          else console.log(`[push] ✓ Saved msg=${msgId} subject="${meta1.subject}"`);
          if (meta1.subject) {
            const ns = normaliseSubject(meta1.subject);
            if (ns) await db.from("project_email_subjects").upsert({
              project_id: dbLabel.project_id, company_id: companyId,
              gmail_message_id: msgId, subject_normalised: ns,
            }, { onConflict: "project_id,gmail_message_id", ignoreDuplicates: true });
          }
        }
      }

      // ── Labels removed: re-add if still active in DB ─────────────
      for (const item of (event.labelsRemoved || [])) {
        const msgId = item.message?.id;
        if (!msgId) continue;
        for (const removedLabelId of (item.labelIds || [])) {
          const gmailLabel = gmailLabels.find(l => l.id === removedLabelId);
          if (!gmailLabel) continue;
          const companyId = getCompanyFromLabelName(gmailLabel.name);
          if (!companyId) continue;
          const codeMatch = gmailLabel.name.match(/\[([A-Z0-9]{4,6})\]$/);
          if (!codeMatch) continue;
          const dbLabel = dbLabelsByCode.get(codeMatch[1]);
          if (dbLabel) {
            console.log(`[push] Re-adding label "${gmailLabel.name}" to ${msgId}`);
            await applyLabel(token, msgId, removedLabelId);
            await invalidateSyncJob(companyId, dbLabel.project_id, userId);
          }
        }
      }

      // ── New messages: auto-label by subject across all companies ──
      for (const item of (event.messagesAdded || [])) {
        const msg = item.message;
        if (!msg) continue;
        const msgId = msg.id;
        const msgLabelIds: string[] = msg.labelIds || [];

        // Check if already has a company label
        let matchedCode: string | null = null;
        let matchedCompanyId: string | null = null;
        for (const lid of msgLabelIds) {
          const gl = gmailLabels.find(l => l.id === lid);
          if (!gl) continue;
          const cId = getCompanyFromLabelName(gl.name);
          if (!cId) continue;
          const m = gl.name.match(/\[([A-Z0-9]{4,6})\]$/);
          if (m) { matchedCode = m[1]; matchedCompanyId = cId; break; }
        }

        if (matchedCode && matchedCompanyId) {
          const dbLabel = dbLabelsByCode.get(matchedCode);
          if (dbLabel) {
            const md2 = await getMessage(token, msgId);
            const threadId2 = md2?.threadId || msgId;
            const { error: e2 } = await db.from("project_emails").upsert({
              project_id: dbLabel.project_id, company_id: matchedCompanyId,
              user_id: userId, gmail_message_id: msgId, gmail_thread_id: threadId2, gmail_label_applied: true,
            }, { onConflict: "user_id,gmail_message_id", ignoreDuplicates: true });
            if (e2) console.error(`[push] upsert error:`, e2.message);
            else console.log(`[push] ✓ Saved labelled email ${msgId} [${matchedCode}]`);
            const meta2 = extractEmailMeta(md2);
            await db.from("project_emails").update({
              subject: meta2.subject, from_address: meta2.from_address, from_name: meta2.from_name,
              date: meta2.date, snippet: meta2.snippet,
            }).eq("user_id", userId).eq("gmail_message_id", msgId);
            if (meta2.subject) {
              const ns = normaliseSubject(meta2.subject);
              if (ns) await db.from("project_email_subjects").upsert({
                project_id: dbLabel.project_id, company_id: matchedCompanyId,
                gmail_message_id: msgId, subject_normalised: ns,
              }, { onConflict: "project_id,gmail_message_id", ignoreDuplicates: true });
            }
          }
          continue;
        }

        // Auto-label by subject — search across ALL companies
        const msgData = await getMessage(token, msgId);
        if (!msgData) continue;
        const sh = (msgData.payload?.headers || []).find((h: any) => h.name === "Subject");
        if (!sh?.value) continue;
        const normSubject = normaliseSubject(sh.value);
        if (!normSubject || normSubject.length < 3) continue;

        console.log(`[push] Auto-label check: "${normSubject}"`);

        const { data: subjectMatch } = await db.from("project_email_subjects")
          .select("project_id, company_id")
          .in("company_id", allCompanyIds)
          .eq("subject_normalised", normSubject)
          .limit(1).maybeSingle();

        if (!subjectMatch) continue;

        const { data: dbLabel } = await db.from("project_gmail_labels")
          .select("gmail_label_name, label_code")
          .eq("project_id", subjectMatch.project_id)
          .eq("company_id", subjectMatch.company_id)
          .is("removed_at", null).maybeSingle();

        if (!dbLabel) continue;

        const safeName = sanitiseLabelName(dbLabel.gmail_label_name);
        let labelId = gmailLabels.find(l => l.name.includes(`[${dbLabel.label_code}]`))?.id || null;
        if (!labelId) labelId = await createLabelHierarchy(token, safeName, gmailLabels);

        if (labelId) {
          console.log(`[push] Auto-labelling ${msgId} → "${safeName}"`);
          await applyLabel(token, msgId, labelId);
          const threadId3 = msgData?.threadId || msgId;
          const meta3 = extractEmailMeta(msgData);
          await db.from("project_emails").upsert({
            project_id: subjectMatch.project_id, company_id: subjectMatch.company_id,
            user_id: userId, gmail_message_id: msgId, gmail_thread_id: threadId3,
            subject: meta3.subject, from_address: meta3.from_address, from_name: meta3.from_name,
            date: meta3.date, snippet: meta3.snippet, gmail_label_applied: true,
          }, { onConflict: "user_id,gmail_message_id", ignoreDuplicates: true });
          await db.from("project_email_subjects").upsert({
            project_id: subjectMatch.project_id, company_id: subjectMatch.company_id,
            gmail_message_id: msgId, subject_normalised: normSubject,
          }, { onConflict: "project_id,gmail_message_id", ignoreDuplicates: true });
        }
      }
    }

        return new Response("ok", { status: 200 });
  } catch (err: any) {
    console.error("[push] Error:", err.message);
    return new Response("ok", { status: 200 }); // always 200 to Pub/Sub
  }
});
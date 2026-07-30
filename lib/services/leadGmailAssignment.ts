// Leads shared-label inbox: matching an incoming email to a Lead record, and
// applying/pushing the per-lead Gmail label once an admin approves a
// proposal (see lead_email_assignment_requests, supabase/migrations/
// 20260730140000_lead_email_assignments.sql). Runs server-side (API routes
// only) against the service-role client, never the browser singleton.
import { getValueColumn } from "@/lib/schema/fieldCapabilities";

type AdminClient = any; // supabase-js client created with the service role key

export interface LeadMatch {
  leadId: string;
  matchReason: "thread_id" | "sender_email" | "keyword_rule";
}

async function resolveLeadsTable(admin: AdminClient, companyId: string) {
  const { data: table } = await admin
    .from("company_tables")
    .select("id, primary_field_key")
    .eq("company_id", companyId)
    .eq("slug", "leads")
    .is("deleted_at", null)
    .maybeSingle();
  if (!table) return null;
  const { data: fields } = await admin
    .from("company_table_fields")
    .select("id, field_key, field_type, auto_number_prefix")
    .eq("table_id", table.id)
    .is("deleted_at", null);
  return {
    tableId: table.id as string,
    primaryFieldKey: table.primary_field_key as string | null,
    fields: (fields || []) as { id: string; field_key: string; field_type: string; auto_number_prefix: string | null }[],
  };
}

// Display name for a Lead already matched (kind='link_existing'), used to
// build the per-lead Gmail label name — the primary field ("Client's name")
// on the Leads table's own `lead_name` field.
export async function getLeadDisplayName(admin: AdminClient, companyId: string, leadId: string): Promise<string> {
  const leadsTable = await resolveLeadsTable(admin, companyId);
  const nameField = leadsTable?.fields.find(f => f.field_key === (leadsTable.primaryFieldKey || "lead_name"));
  if (!leadsTable || !nameField) return "Lead";
  const { data } = await admin
    .from("company_table_values")
    .select("value_text")
    .eq("record_id", leadId)
    .eq("field_id", nameField.id)
    .maybeSingle();
  return data?.value_text || "Lead";
}

// Priority order: (1) same Gmail thread already linked to a Lead — the
// strongest signal, a reply in an existing conversation; (2) sender address
// exactly matches an existing Lead's "email" field; (3) an admin-configured
// keyword rule matches the subject. Returns null if nothing matches, meaning
// the caller should propose creating a brand-new Lead instead.
export async function matchLeadForEmail(
  admin: AdminClient,
  companyId: string,
  { fromAddress, subject, threadId }: { fromAddress: string; subject: string; threadId: string | null }
): Promise<LeadMatch | null> {
  if (threadId) {
    const { data: threadMatch } = await admin
      .from("lead_emails")
      .select("lead_id")
      .eq("company_id", companyId)
      .eq("gmail_thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (threadMatch) return { leadId: threadMatch.lead_id, matchReason: "thread_id" };
  }

  if (fromAddress) {
    const leadsTable = await resolveLeadsTable(admin, companyId);
    const emailField = leadsTable?.fields.find(f => f.field_key === "email");
    if (leadsTable && emailField) {
      const { data: valueRows } = await admin
        .from("company_table_values")
        .select("record_id, value_text")
        .eq("field_id", emailField.id)
        .not("value_text", "is", null);
      const normalized = fromAddress.trim().toLowerCase();
      const candidateIds = (valueRows || [])
        .filter((r: any) => (r.value_text || "").trim().toLowerCase() === normalized)
        .map((r: any) => r.record_id);
      if (candidateIds.length) {
        const { data: alive } = await admin
          .from("company_table_records")
          .select("id")
          .in("id", candidateIds)
          .eq("table_id", leadsTable.tableId)
          .is("deleted_at", null)
          .limit(1);
        if (alive?.length) return { leadId: alive[0].id, matchReason: "sender_email" };
      }
    }
  }

  if (subject) {
    const { data: rules } = await admin
      .from("lead_email_keyword_rules")
      .select("keyword, match_lead_id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    const lowerSubject = subject.toLowerCase();
    const rule = (rules || []).find((r: any) => r.keyword && lowerSubject.includes(r.keyword.toLowerCase()));
    if (rule) return { leadId: rule.match_lead_id, matchReason: "keyword_rule" };
  }

  return null;
}

// Minimal, purpose-built record insert for the "create_new" approval path.
// Deliberately doesn't reuse lib/services/customTableService.ts's
// createRecord() — that function is hardcoded to the browser's RLS-scoped
// singleton client (`@/lib/supabase`), which has no valid session inside a
// server API route. The Leads table has no formulas, no ledger semantics,
// and no unique constraints on the fields this prefills, so the full
// validation/rollup machinery in createRecord isn't needed here — just an
// insert plus an auto-number claim for lead_number.
export async function createLeadRecordFromProposal(
  admin: AdminClient,
  companyId: string,
  actingUserId: string,
  proposedFields: Record<string, any>
): Promise<{ id: string; leadName: string } | { error: string }> {
  const leadsTable = await resolveLeadsTable(admin, companyId);
  if (!leadsTable) return { error: "This company has no Leads table installed." };

  const fieldByKey = new Map(leadsTable.fields.map(f => [f.field_key, f]));
  const values: Record<string, any> = { ...proposedFields };

  const numberField = leadsTable.fields.find(f => f.auto_number_prefix != null);
  if (numberField && !values[numberField.field_key]) {
    const { data: num } = await admin.rpc("next_field_sequence", { p_field_id: numberField.id });
    if (num) values[numberField.field_key] = num;
  }

  const { data: record, error: insertError } = await admin
    .from("company_table_records")
    .insert({ table_id: leadsTable.tableId, company_id: companyId, created_by: actingUserId })
    .select("id")
    .single();
  if (insertError || !record) return { error: insertError?.message || "Could not create the Lead record." };

  const upserts: Record<string, any>[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    const field = fieldByKey.get(key);
    if (!field) continue;
    const valueCol = getValueColumn(field.field_type);
    upserts.push({ company_id: companyId, table_id: leadsTable.tableId, record_id: record.id, field_id: field.id, [valueCol]: value });
  }
  if (upserts.length) {
    const { error: valuesError } = await admin
      .from("company_table_values")
      .upsert(upserts, { onConflict: "record_id,field_id" });
    if (valuesError) {
      await admin.from("company_table_records").delete().eq("id", record.id);
      return { error: valuesError.message };
    }
  }

  return { id: record.id, leadName: proposedFields.lead_name || proposedFields.email || "New lead" };
}

interface ApplyLeadLabelParams {
  companyId: string;
  leadId: string;
  leadName: string;
  actingUserId: string;
  messageId: string;
  threadId: string | null;
  subject: string;
  fromAddr: string;
  fromName: string;
  date: string | null;
  snippet: string;
  leadsParentLabel: string;
}

export async function getGmailAccessToken(admin: AdminClient, userId: string): Promise<string | null> {
  const { data: tokenRow } = await admin
    .from("user_gmail_tokens")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .single();
  if (!tokenRow) return null;

  const isExpired = Date.now() > new Date(tokenRow.token_expires_at).getTime() - 5 * 60 * 1000;
  if (!isExpired) return tokenRow.access_token;

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const refreshed = await refreshRes.json();
  if (!refreshed.access_token) return null;
  await admin.from("user_gmail_tokens").update({
    access_token: refreshed.access_token,
    token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  }).eq("user_id", userId);
  return refreshed.access_token;
}

export async function getGmailLabelId(accessToken: string, labelName: string): Promise<string | null> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.labels || []).find((l: any) => l.name === labelName)?.id || null;
}

export async function listMessagesWithLabel(accessToken: string, labelId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("labelIds", labelId);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) break;
    const data = await res.json();
    (data.messages || []).forEach((m: any) => ids.push(m.id));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

export async function getOrCreateLabelHierarchy(accessToken: string, labelParts: string[]): Promise<string | null> {
  const labelsRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!labelsRes.ok) return null;
  const labelsData = await labelsRes.json();
  const existing: { id: string; name: string }[] = labelsData.labels || [];

  let labelId: string | null = null;
  for (let i = 1; i <= labelParts.length; i++) {
    const partialName = labelParts.slice(0, i).join("/");
    const found = existing.find(l => l.name === partialName);
    if (found) { labelId = found.id; continue; }

    const createRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: partialName,
        labelListVisibility: "labelShow",
        messageListVisibility: i === labelParts.length ? "show" : "hide",
      }),
    });
    if (!createRes.ok) return null;
    const created = await createRes.json();
    labelId = created.id;
    existing.push({ id: created.id, name: partialName });
  }
  return labelId;
}

// Generalizes app/api/gmail/assign/route.ts for Leads: builds the label path
// `${leadsParentLabel}/${leadName} [CODE]`, upserts lead_gmail_labels/
// lead_emails (DB-first, rolled back if the Gmail apply call fails — same
// atomicity as the project flow), applies the label in the acting admin's
// mailbox, then pushes the same label into every other team member's
// mailbox. Doesn't touch user_gmail_label_sync (that table only backs the
// periodic *project* reconciliation job in app/api/gmail/sync — there's no
// equivalent lead reconciliation job in this feature, so nothing reads it
// for leads).
export async function applyLeadGmailLabel(
  admin: AdminClient,
  params: ApplyLeadLabelParams
): Promise<{ ok: true; labelName: string; labelId: string; syncedToUsers: number } | { ok: false; error: string }> {
  const { companyId, leadId, leadName, actingUserId, messageId, threadId, subject, fromAddr, fromName, date, snippet, leadsParentLabel } = params;

  const accessToken = await getGmailAccessToken(admin, actingUserId);
  if (!accessToken) return { ok: false, error: "The approving admin has no connected Gmail account." };

  const { data: existingLgl } = await admin
    .from("lead_gmail_labels")
    .select("label_code, gmail_label_name")
    .eq("company_id", companyId)
    .eq("lead_id", leadId)
    .maybeSingle();

  const labelCode = existingLgl?.label_code || Math.random().toString(36).substring(2, 7).toUpperCase();
  const baseLabelName = `${leadsParentLabel}/${leadName}`;
  const labelNameWithCode = existingLgl?.gmail_label_name || `${baseLabelName} [${labelCode}]`;
  const labelParts = labelNameWithCode.split("/");

  const labelId = await getOrCreateLabelHierarchy(accessToken, labelParts);
  if (!labelId) return { ok: false, error: "Could not create the Gmail label hierarchy." };

  const sublabel = labelParts[labelParts.length - 1];

  // DB first — abort before touching Gmail if either write fails.
  const { error: lglError } = await admin.from("lead_gmail_labels").upsert({
    company_id: companyId,
    lead_id: leadId,
    gmail_label_id: labelId,
    gmail_label_name: labelNameWithCode,
    label_code: labelCode,
    label_sub: sublabel,
    removed_at: null,
    created_by: actingUserId,
  }, { onConflict: "company_id,lead_id" });
  if (lglError) return { ok: false, error: `DB error saving label: ${lglError.message}` };

  const { error: leError } = await admin.from("lead_emails").upsert({
    user_id: actingUserId,
    company_id: companyId,
    lead_id: leadId,
    gmail_message_id: messageId,
    gmail_thread_id: threadId || null,
    subject: subject || "(no subject)",
    from_address: fromAddr || "",
    from_name: fromName || "",
    date: date || null,
    snippet: snippet || "",
    gmail_label_applied: true,
  }, { onConflict: "user_id,gmail_message_id" });
  if (leError) {
    if (!existingLgl) await admin.from("lead_gmail_labels").delete().eq("company_id", companyId).eq("lead_id", leadId);
    return { ok: false, error: `DB error saving email: ${leError.message}` };
  }

  const applyRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
  if (!applyRes.ok) {
    const err = await applyRes.json().catch(() => ({}));
    await admin.from("lead_emails").delete().eq("user_id", actingUserId).eq("gmail_message_id", messageId);
    if (!existingLgl) await admin.from("lead_gmail_labels").delete().eq("company_id", companyId).eq("lead_id", leadId);
    return { ok: false, error: `Failed to apply Gmail label: ${err.error?.message || "unknown error"}` };
  }

  // ── Push the same label into every other team member's mailbox ──────────
  const { data: members } = await admin
    .from("company_memberships")
    .select("user_id")
    .eq("company_id", companyId)
    .neq("user_id", actingUserId);

  let syncedToUsers = 0;
  for (const member of members || []) {
    try {
      const memberToken = await getGmailAccessToken(admin, member.user_id);
      if (!memberToken) continue;
      const memberLabelId = await getOrCreateLabelHierarchy(memberToken, labelParts);
      if (!memberLabelId) continue;
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${memberToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ addLabelIds: [memberLabelId] }),
      });
      syncedToUsers++;
    } catch (err) {
      console.error(`[applyLeadGmailLabel] Failed to sync to member ${member.user_id}:`, err);
    }
  }

  await admin.from("gmail_sync_log").insert({
    company_id: companyId,
    triggered_by: actingUserId,
    action: "label_applied",
    lead_id: leadId,
    gmail_message_id: messageId,
    gmail_label_name: labelNameWithCode,
    target_user_id: actingUserId,
    details: { subject, labelId, sublabel, syncedToUsers },
  });

  return { ok: true, labelName: labelNameWithCode, labelId, syncedToUsers };
}

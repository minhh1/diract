// lib/ai/matterEmails.ts
// A matter's email correspondence, combined from both sources a Client
// Update Page ("Detailed table page") item can have -- the real Gmail sync
// (project_emails) and manually staff-appended entries
// (client_update_page_emails, for correspondence that never went through a
// real sync). Shared by every AI feature that reasons over a matter's
// emails (lib/ai/matterEmailSummary.ts, lib/ai/matterSettlementDateReview.ts)
// so they can't drift into fetching a different slice of the same data.
export interface MatterEmailForAi {
  subject: string | null;
  from_name: string | null;
  snippet: string | null;
  sortDate: string;
}

export async function fetchCombinedMatterEmails(
  admin: any, companyId: string, itemId: string, projectId: string, limit = 25
): Promise<MatterEmailForAi[]> {
  const [{ data: syncedEmails }, { data: appendedEmails }] = await Promise.all([
    admin.from("project_emails").select("subject, from_name, snippet, created_at")
      .eq("company_id", companyId).eq("project_id", projectId)
      .order("created_at", { ascending: false }).limit(limit),
    admin.from("client_update_page_emails").select("subject, from_name, snippet, email_date, created_at")
      .eq("item_id", itemId).order("email_date", { ascending: false }).limit(limit),
  ]);

  return [
    ...(syncedEmails || []).map((e: any) => ({ subject: e.subject, from_name: e.from_name, snippet: e.snippet, sortDate: e.created_at })),
    ...(appendedEmails || []).map((e: any) => ({ subject: e.subject, from_name: e.from_name, snippet: e.snippet, sortDate: e.email_date })),
  ].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()).slice(0, limit);
}

// Shared rendering of a combined email list into the plain-text block every
// AI prompt over these emails feeds the model -- kept in one place so a
// future tweak to the format (e.g. adding the recipient) only needs to
// happen once.
export function formatMatterEmailBlock(emails: MatterEmailForAi[]): string {
  return emails
    .map(e => `[${new Date(e.sortDate).toLocaleDateString()}] From ${e.from_name || "unknown"} -- "${e.subject || "(no subject)"}": ${e.snippet || ""}`)
    .join("\n");
}

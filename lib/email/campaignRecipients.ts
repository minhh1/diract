// lib/email/campaignRecipients.ts
// Resolves an email_campaigns row into a deduped, suppression-filtered
// recipient list -- shared by the recipient-count preview
// (app/api/email-campaigns/[id]/recipients/route.ts) and the actual send
// (app/api/email-campaigns/[id]/send/route.ts) so the number an admin
// previews is guaranteed to be the number that actually gets sent to.
import type { SupabaseClient } from "@supabase/supabase-js";

interface CampaignRef {
  company_id: string;
  table_id: string | null;
  table_name: string | null;
  email_field_id: string | null;
  native_field_key: string | null;
}

export interface CampaignRecipient { email: string; record_id: string }

export async function resolveCampaignRecipients(admin: SupabaseClient, campaign: CampaignRef): Promise<CampaignRecipient[]> {
  let raw: { email: string | null; record_id: string }[] = [];

  if (campaign.native_field_key === "email" && campaign.table_name === "entities") {
    const { data } = await admin.from("entities").select("id, email")
      .eq("company_id", campaign.company_id).is("deleted_at", null);
    raw = (data ?? []).map((r) => ({ email: r.email, record_id: r.id }));
  } else if (campaign.table_name && campaign.email_field_id) {
    const { data } = await admin.from("company_custom_field_values").select("record_id, value_text")
      .eq("company_id", campaign.company_id).eq("field_id", campaign.email_field_id);
    raw = (data ?? []).map((r) => ({ email: r.value_text, record_id: r.record_id }));
  } else if (campaign.table_id && campaign.email_field_id) {
    const { data } = await admin.from("company_table_values").select("record_id, value_text")
      .eq("company_id", campaign.company_id).eq("table_id", campaign.table_id).eq("field_id", campaign.email_field_id);
    raw = (data ?? []).map((r) => ({ email: r.value_text, record_id: r.record_id }));
  }

  const seen = new Set<string>();
  const valid: CampaignRecipient[] = [];
  for (const r of raw) {
    const email = r.email?.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    valid.push({ email, record_id: r.record_id });
  }
  if (valid.length === 0) return [];

  const { data: unsubs } = await admin.from("email_unsubscribes").select("email").eq("company_id", campaign.company_id);
  const unsubSet = new Set((unsubs ?? []).map((u) => u.email.toLowerCase()));
  return valid.filter((v) => !unsubSet.has(v.email));
}

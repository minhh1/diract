// lib/services/staffEntityService.ts
// Auto-provisions a Staff entity (an `entities` row with linked_profile_id
// set) the moment a user joins a company, so they can immediately self-select
// on any "signed-in user only" relation field (e.g. Time & Fee Entries'
// Staff field -- see components/dashboard/RelationPicker.tsx's
// CURRENT_USER_SENTINEL) and be given a default_rate (see
// supabase/migrations/20260726065536_entities_default_rate.sql) without an
// admin manually linking them first via app/dashboard/admin/page.tsx.
// Confirmed live this was a real, silent gap: 5 of Huynh Lawyers' 6 real
// staff members had joined with no Staff entity at all.
//
// entity_type is always 'Staff' -- the $team_scope sentinel (see
// RelationPicker.tsx / supabase/migrations/20260726071500_staff_field_team_scope_filter.sql)
// hard-requires entity_type = 'Staff' on top of the linked_profile_id scope,
// specifically to exclude non-staff Person/Company entities (e.g.
// property-owning companies) from the Staff picker -- an entity created
// here with any other entity_type would be invisible to that picker no
// matter what, confirmed live as a real "no matches" bug.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureStaffEntity(
  client: SupabaseClient,
  companyId: string,
  profileId: string
): Promise<void> {
  try {
    // A company that's deleted its Entities table entirely (see
    // supabase/companies_disabled_system_tables.sql) shouldn't get one
    // silently recreated underneath it.
    const { data: company } = await client
      .from("companies")
      .select("disabled_system_tables")
      .eq("id", companyId)
      .maybeSingle();
    if ((company?.disabled_system_tables as Record<string, unknown> | null | undefined)?.entities) return;

    const { data: existing } = await client
      .from("entities")
      .select("id, entity_type")
      .eq("company_id", companyId)
      .eq("linked_profile_id", profileId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      // Self-healing: a linked entity created before entity_type='Staff'
      // existed (or by some other path) would otherwise stay permanently
      // invisible to the $team_scope-filtered Staff picker.
      if (existing.entity_type !== "Staff") {
        await client.from("entities").update({ entity_type: "Staff" }).eq("id", existing.id);
      }
      return;
    }

    const { data: profile } = await client
      .from("profiles")
      .select("full_name")
      .eq("id", profileId)
      .maybeSingle();

    await client.from("entities").insert({
      company_id: companyId,
      name: profile?.full_name?.trim() || "New team member",
      entity_type: "Staff",
      linked_profile_id: profileId,
    });
  } catch (err) {
    // Best-effort -- never blocks the actual company-join flow calling this.
    // Worst case, the member falls back to the existing manual linking flow
    // in app/dashboard/admin/page.tsx, same as before this existed.
    console.error("[ensureStaffEntity] failed", err);
  }
}

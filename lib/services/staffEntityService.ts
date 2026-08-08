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

// Claims a pre-created, still-unlinked Staff entity (see app/(app)/dashboard/
// admin/page.tsx's Invites tab -- an admin can capture a staff member's
// name/email/phone before they've ever logged in, so it exists for SMS/
// email rostering immediately) for the profile that just completed real
// signup, instead of ensureStaffEntity() creating a second, blank entity
// for the same person. Called from joinCompanyWithToken.ts only when the
// consumed registration_tokens row has a staff_entity_id.
//
// Falls back to the normal ensureStaffEntity() flow (returns false) rather
// than throwing when the referenced entity is missing or already linked to
// someone else (e.g. the same link opened twice, or a stale/edited token)
// -- never block a real signup over this being pre-populated.
export async function linkStaffEntity(
  client: SupabaseClient,
  companyId: string,
  profileId: string,
  staffEntityId: string
): Promise<boolean> {
  try {
    const { data: entity } = await client
      .from("entities")
      .select("id, linked_profile_id")
      .eq("id", staffEntityId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!entity || entity.linked_profile_id) return false;

    const { error } = await client
      .from("entities")
      .update({ linked_profile_id: profileId, entity_type: "Staff" })
      .eq("id", staffEntityId);
    return !error;
  } catch (err) {
    console.error("[linkStaffEntity] failed", err);
    return false;
  }
}

// Looks up the caller's own linked Staff entity -- shared by the check-in
// PIN and check-in QR routes (both are strictly self-service, never
// admin-set-for-someone-else), so both stay consistent about what counts as
// "your staff entity" without duplicating the query.
export async function findOwnStaffEntity(
  client: SupabaseClient,
  companyId: string,
  profileId: string
): Promise<{ id: string; checkin_pin_hash: string | null } | null> {
  const { data } = await client
    .from("entities")
    .select("id, checkin_pin_hash")
    .eq("company_id", companyId)
    .eq("entity_type", "Staff")
    .eq("linked_profile_id", profileId)
    .is("deleted_at", null)
    .maybeSingle();
  return data as { id: string; checkin_pin_hash: string | null } | null;
}

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

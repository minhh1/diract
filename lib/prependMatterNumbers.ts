// Server-side counterpart to RelationPicker.tsx's prependMatterNumbers --
// every Matter picker across the app shows both the matter number and the
// matter name, not just the name. Used by API routes that return a plain
// `projects` row shape directly (not through RelationPicker's own client-
// side fetch), e.g. app/api/projects/search/route.ts and the Finance Model
// recent/starred-projects routes. Comma-separated, not a dash, per
// AGENTS.md's "no em dash" rule (also covers ASCII dash-style separators
// in user-facing text).
import type { SupabaseClient } from "@supabase/supabase-js";

export async function prependMatterNumbers<T extends { id: string; name: string }>(
  admin: SupabaseClient, companyId: string, rows: T[]
): Promise<T[]> {
  if (!rows.length) return rows;
  const { data: field } = await admin
    .from("company_custom_fields")
    .select("id")
    .eq("company_id", companyId)
    .eq("table_name", "projects")
    .eq("field_key", "matter_number")
    .is("deleted_at", null)
    .maybeSingle();
  if (!field) return rows;
  const { data: values } = await admin
    .from("company_custom_field_values")
    .select("record_id, value_text")
    .eq("field_id", field.id)
    .in("record_id", rows.map(r => r.id));
  const byId = new Map((values || []).map((v: any) => [v.record_id, v.value_text as string]));
  return rows.map(r => {
    const num = byId.get(r.id);
    return num ? { ...r, name: `${num}, ${r.name}` } : r;
  });
}

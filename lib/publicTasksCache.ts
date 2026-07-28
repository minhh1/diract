// lib/publicTasksCache.ts
// Caches the two lookups in app/api/public-tasks/[pageId]/route.ts's GET
// handler that are safe to cache: task_statuses (a genuinely global table --
// confirmed via the live schema it has no company_id column at all, so
// there's no per-company key needed or possible) and the "matter_number"
// custom field's id (a field DEFINITION, which changes far less often than
// the task/board data itself -- company-scoped, so the cache key includes
// companyId to avoid ever mixing one company's field id into another's
// response). Deliberately narrow: task lists, watchers, follow-ups etc. all
// stay live, uncached -- only the small, slow-changing config lookups get
// the win. Uses Next's built-in Data Cache (unstable_cache) rather than an
// in-memory cache so a hit is shared across serverless invocations, not
// just within one warm instance.
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const getActiveTaskStatuses = unstable_cache(
  async (): Promise<{ id: string; label: string }[]> => {
    const { data } = await adminClient()
      .from("task_statuses").select("id, label").eq("is_active", true).order("display_order");
    return data || [];
  },
  ["public-tasks:task-statuses"],
  { revalidate: 60 }
);

export const getMatterNumberFieldId = unstable_cache(
  async (companyId: string): Promise<string | null> => {
    const { data } = await adminClient()
      .from("company_custom_fields").select("id")
      .eq("company_id", companyId).eq("table_name", "projects").eq("field_key", "matter_number").is("deleted_at", null).maybeSingle();
    return data?.id ?? null;
  },
  ["public-tasks:matter-number-field-id"],
  { revalidate: 60 }
);

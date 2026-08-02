// lib/precedents/installLibrary.ts
// Single implementation of "install (or top up) the seeded precedent library
// for a company", shared by:
//   - app/api/precedents/library/install/route.ts  (admin-triggered)
//   - app/api/templates/[slug]/install/route.ts    (Law Firm template install)
//
// Idempotent on PrecedentSeed.key -> precedents.library_key, so it is safe to
// call repeatedly: it inserts what is missing and never touches a row the
// firm has since edited. That is what lets the library grow over time
// without cloning or overwriting anything a firm already has.
import { PRECEDENT_LIBRARY } from "@/lib/precedents/library";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

export interface InstallResult {
  installed: number;
  alreadyInstalled: number;
  total: number;
}

/**
 * @param admin  service-role Supabase client
 * @param userId recorded as created_by; null when installed by an automated
 *               path with no acting user
 */
export async function installPrecedentLibrary(
  admin: any,
  companyId: string,
  userId: string | null
): Promise<{ result?: InstallResult; error?: string }> {
  // Seeds bind fill-in fields to a matter's own custom field by field_key,
  // since a seed cannot know a per-company UUID. Resolve to real ids so the
  // placeholder pre-populates at issue time; an unresolved key degrades to a
  // normal manual field rather than breaking the precedent.
  const { data: customFields } = await admin
    .from("company_custom_fields")
    .select("id, field_key")
    .eq("company_id", companyId)
    .eq("table_name", "projects")
    .is("deleted_at", null);
  const fieldIdByKey = new Map<string, string>(
    (customFields || []).map((f: { field_key: string; id: string }) => [f.field_key, f.id])
  );

  const { data: existing } = await admin
    .from("precedents")
    .select("library_key")
    .eq("company_id", companyId)
    .not("library_key", "is", null)
    .is("deleted_at", null);
  const alreadyInstalled = new Set((existing || []).map((r: { library_key: string }) => r.library_key));

  const { data: maxOrderRow } = await admin
    .from("precedents")
    .select("display_order")
    .eq("company_id", companyId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = (maxOrderRow?.display_order ?? -1) + 1;

  const toInsert = PRECEDENT_LIBRARY
    .filter(seed => !alreadyInstalled.has(seed.key))
    .map(seed => {
      const segments: BodyTemplateSegment[] | undefined = seed.segments?.map(s =>
        s.type === "field"
          ? { ...s, autoFillFieldId: s.autoFillFieldId ? fieldIdByKey.get(s.autoFillFieldId) ?? null : null }
          : s
      );
      return {
        company_id: companyId,
        record_table: "projects",
        name: seed.name,
        description: seed.description,
        ai_instructions: seed.aiInstructions,
        body_template: segments ? { segments } : null,
        category: seed.category,
        subcategory: seed.subcategory ?? null,
        jurisdictions: seed.jurisdictions ?? null,
        matter_types: seed.matterTypes ?? null,
        document_type: seed.documentType,
        requires_review: seed.requiresReview ?? false,
        review_note: seed.reviewNote ?? null,
        library_key: seed.key,
        display_order: nextOrder++,
        created_by: userId,
      };
    });

  if (!toInsert.length) {
    return { result: { installed: 0, alreadyInstalled: alreadyInstalled.size, total: PRECEDENT_LIBRARY.length } };
  }

  const { error } = await admin.from("precedents").insert(toInsert);
  if (error) return { error: error.message };

  return {
    result: {
      installed: toInsert.length,
      alreadyInstalled: alreadyInstalled.size,
      total: PRECEDENT_LIBRARY.length,
    },
  };
}

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
import type { adminClient } from "@/lib/documentTemplateAuth";
import { PRECEDENT_LIBRARY } from "@/lib/precedents/library";
import { defaultUsesLetterhead } from "@/lib/precedents/library/types";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

export interface InstallResult {
  installed: number;
  alreadyInstalled: number;
  total: number;
}

// Templates that ship the seeded Australian precedent library alongside
// their tables and dashboards. Slug-keyed rather than a flag on
// template_definitions because the library is authored in TypeScript, not
// stored as template rows -- there is nothing in the template record itself
// to hang it off. Shared by the template install/upgrade/preview routes and
// the standalone library-install route so they agree on which templates get
// the top-up offered at all.
export const TEMPLATES_WITH_PRECEDENT_LIBRARY = new Set(["law-firm"]);

// Deliberately NOT filtered by deleted_at -- see installPrecedentLibrary's
// own comment below. A library_key the company has ever had counts as
// "installed" whether or not it was since deleted, because re-installing on
// top of a firm's own deletion decision is exactly the bug this guards
// against.
async function getAlreadyInstalledKeys(admin: ReturnType<typeof adminClient>, companyId: string): Promise<Set<string>> {
  const { data: existing } = await admin
    .from("precedents")
    .select("library_key")
    .eq("company_id", companyId)
    .not("library_key", "is", null);
  return new Set((existing || []).map(r => r.library_key));
}

export interface PrecedentLibraryStatus {
  total: number;
  installed: number;
  available: number;
}

/** How current a company's install is against today's library, without installing anything. */
export async function getPrecedentLibraryStatus(
  admin: ReturnType<typeof adminClient>,
  companyId: string
): Promise<PrecedentLibraryStatus> {
  const alreadyInstalled = await getAlreadyInstalledKeys(admin, companyId);
  const available = PRECEDENT_LIBRARY.filter(seed => !alreadyInstalled.has(seed.key)).length;
  return { total: PRECEDENT_LIBRARY.length, installed: PRECEDENT_LIBRARY.length - available, available };
}

// Whether this company has the Law Firm marketplace template installed --
// signalled by presence of its Trust Transactions table, the same proxy
// RecordDashboard.tsx/Sidebar.tsx already use for other Law Firm-only
// features (Trust Account, Finance Model's own cross-tenant fix). There's no
// cheaper company-type/industry column reliable enough to gate on instead --
// see components/settings/InvoiceTemplateSettingsTab.tsx's isLawFirm comment;
// company_type is a free-text admin field, not a template marker.
export async function hasLawFirmTemplate(admin: ReturnType<typeof adminClient>, companyId: string): Promise<boolean> {
  const { data } = await admin
    .from("company_tables")
    .select("id")
    .eq("company_id", companyId)
    .eq("slug", "trust-transactions")
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

/**
 * @param admin  service-role Supabase client (see adminClient())
 * @param userId recorded as created_by; null when installed by an automated
 *               path with no acting user
 */
export async function installPrecedentLibrary(
  admin: ReturnType<typeof adminClient>,
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
  const fieldIdByKey = new Map<string, string>((customFields || []).map(f => [f.field_key, f.id]));

  // Deliberately NOT filtered by deleted_at -- see getAlreadyInstalledKeys.
  // Filtering deleted rows out here made every re-install resurrect
  // precedents a firm had retired -- and because the unique index is partial
  // (WHERE deleted_at IS NULL) nothing at the database level stopped it, so
  // the firm silently got the old copy back alongside whatever replaced it.
  const alreadyInstalled = await getAlreadyInstalledKeys(admin, companyId);

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
        uses_letterhead: seed.usesLetterhead ?? defaultUsesLetterhead(seed.documentType),
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

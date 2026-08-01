// app/api/precedents/library/install/route.ts
// Installs (and later tops up) the seeded Australian law-firm precedent
// library for the current company -- see lib/precedents/library/.
//
// Idempotent by design: precedents are matched on `library_key`, so
// re-running after the library grows inserts only what's new and never
// touches a row the firm has since edited. That's the whole reason
// library_key exists (supabase/migrations/20260802180000_precedent_library.sql).
//
// A route rather than a scripts/*.mjs backfill because the library is
// authored in TypeScript and this repo has no TS script runner -- and
// because "install/update the library" is a thing a firm's admin should be
// able to do from Settings, not something requiring a developer.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { PRECEDENT_LIBRARY } from "@/lib/precedents/library";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

export async function POST() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  if (!isAdmin) {
    return NextResponse.json({ error: "Only a company admin can install the precedent library" }, { status: 403 });
  }

  // Seeds bind fill-in fields to a matter's own custom field by field_key
  // (a seed can't know a per-company UUID). Resolve those to real ids here
  // so the placeholder pre-populates at issue time; an unresolved key just
  // becomes a normal manual field rather than breaking the precedent.
  const { data: customFields } = await admin
    .from("company_custom_fields")
    .select("id, field_key")
    .eq("company_id", companyId)
    .eq("table_name", "projects")
    .is("deleted_at", null);
  const fieldIdByKey = new Map((customFields || []).map(f => [f.field_key, f.id]));

  const { data: existing } = await admin
    .from("precedents")
    .select("library_key")
    .eq("company_id", companyId)
    .not("library_key", "is", null)
    .is("deleted_at", null);
  const alreadyInstalled = new Set((existing || []).map(r => r.library_key));

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
        created_by: user.id,
      };
    });

  if (!toInsert.length) {
    return NextResponse.json({ ok: true, installed: 0, alreadyInstalled: alreadyInstalled.size, total: PRECEDENT_LIBRARY.length });
  }

  const { error } = await admin.from("precedents").insert(toInsert);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    installed: toInsert.length,
    alreadyInstalled: alreadyInstalled.size,
    total: PRECEDENT_LIBRARY.length,
  });
}

// Lets the Settings screen show what an install would do before doing it.
export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: existing } = await admin
    .from("precedents")
    .select("library_key")
    .eq("company_id", companyId)
    .not("library_key", "is", null)
    .is("deleted_at", null);
  const alreadyInstalled = new Set((existing || []).map(r => r.library_key));

  return NextResponse.json({
    total: PRECEDENT_LIBRARY.length,
    installed: alreadyInstalled.size,
    available: PRECEDENT_LIBRARY.filter(s => !alreadyInstalled.has(s.key)).length,
  });
}

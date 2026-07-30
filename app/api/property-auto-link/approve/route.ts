// app/api/property-auto-link/approve/route.ts
// Admin-only approval for property_auto_link_requests (see
// supabase/migrations/20260730160000_property_auto_link_requests.sql).
// Mirrors app/api/lead-email-assignments/approve's admin-gate + bulk-ids +
// per-id results shape. Each proposed entry with propertyId === null gets a
// new properties row created and its real id written back into `proposed`
// BEFORE moving to the next entry -- so if a later entry in the same
// (multi-property) row fails, a retry doesn't recreate properties the
// first pass already made.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

interface ProposedProperty {
  streetAddress: string;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  propertyId: string | null;
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids is required" }, { status: 400 });

  const { data: requests, error } = await admin
    .from("property_auto_link_requests")
    .select("id, project_id, proposed")
    .in("id", ids)
    .eq("company_id", companyId)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Record<string, { ok: boolean; error?: string }> = {};

  for (const reqRow of requests || []) {
    const proposed = (reqRow.proposed as ProposedProperty[]) || [];
    let rowError: string | null = null;

    for (const entry of proposed) {
      if (!entry.propertyId) {
        const { data: created, error: createErr } = await admin
          .from("properties")
          .insert({
            company_id: companyId,
            street_address: entry.streetAddress,
            suburb: entry.suburb,
            state: entry.state,
            postcode: entry.postcode,
          })
          .select("id")
          .single();
        if (createErr) { rowError = createErr.message; break; }
        entry.propertyId = created.id;
      }

      const { error: linkErr } = await admin
        .from("project_properties")
        .upsert(
          { company_id: companyId, project_id: reqRow.project_id, property_id: entry.propertyId },
          { onConflict: "project_id,property_id", ignoreDuplicates: true }
        );
      if (linkErr) { rowError = linkErr.message; break; }
    }

    if (rowError) {
      // Persist any entries that DID succeed (their propertyId is now set)
      // before recording the failure, so a re-approve retries only what's
      // left rather than recreating already-created properties.
      await admin.from("property_auto_link_requests").update({ proposed, error: rowError }).eq("id", reqRow.id);
      results[reqRow.id] = { ok: false, error: rowError };
      continue;
    }

    await admin.from("property_auto_link_requests").update({
      proposed, status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString(), error: null,
    }).eq("id", reqRow.id);
    results[reqRow.id] = { ok: true };
  }

  return NextResponse.json({ results });
}

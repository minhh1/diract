// app/api/pages/[id]/route.ts
// Single company_pages row -- authenticated Settings-side management (GET
// for the builder view, PUT for manual edits, DELETE to soft-delete).
// `blocks` on PUT is ALWAYS re-validated via validateBlocks() regardless of
// where it came from (manual block editor, or a round-trip of a previously
// AI-generated page) -- never trust a browser PUT body directly, same as
// every other write path onto this table (see lib/pages/validateBlocks.ts's
// header comment).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { validateBlocks } from "@/lib/pages/validateBlocks";
import { resolveRecordBlocks } from "@/lib/pages/resolveRecordBlocks";

const VISIBILITIES = ["company", "client", "public"] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { id } = await params;

  const { data: page, error } = await admin
    .from("company_pages")
    .select("id, title, slug, visibility, access_code, project_id, status, blocks, ai_prompt, updated_at, created_at")
    .eq("id", id).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // Resolved here too (not just the public route) so the Settings builder's
  // live preview always matches what a real visitor would see -- same
  // "preview matches reality" property the rest of this feature already
  // guarantees for every other block type.
  let project = null;
  if (page.project_id) {
    const { data } = await admin.from("projects").select("id, name, status").eq("id", page.project_id).eq("company_id", companyId).maybeSingle();
    project = data ?? null;
  }
  const { data: links } = await admin.from("company_page_projects").select("project_id").eq("page_id", id);
  const linkedIds = (links || []).map((l: { project_id: string }) => l.project_id);
  const { data: linkedMatterRows } = linkedIds.length
    ? await admin.from("projects").select("id, name, status").in("id", linkedIds).eq("company_id", companyId).is("deleted_at", null)
    : { data: [] };

  const blocks = await resolveRecordBlocks(admin, companyId, id, page.project_id, page.blocks ?? []);
  return NextResponse.json({ page: { ...page, blocks, project, linkedMatters: linkedMatterRows || [] } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can edit pages" }, { status: 403 });
  const { id } = await params;

  const { data: existing } = await admin.from("company_pages").select("id").eq("id", id).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body.status === "string" && ["draft", "published"].includes(body.status)) update.status = body.status;
  if (typeof body.visibility === "string" && (VISIBILITIES as readonly string[]).includes(body.visibility)) update.visibility = body.visibility;
  if ("accessCode" in body) update.access_code = typeof body.accessCode === "string" && body.accessCode.trim() ? body.accessCode.trim() : null;
  if ("projectId" in body) {
    const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null;
    if (projectId) {
      // Never trust a client-supplied project id -- confirm it's actually
      // this company's own matter before binding a page to it (the read
      // path, resolveRecordBlocks.ts, checks this too, but rejecting a
      // foreign/invalid id here means the page never silently stores a
      // nonsensical reference in the first place).
      const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
      if (!project) return NextResponse.json({ error: "Matter not found" }, { status: 404 });
    }
    update.project_id = projectId;
  }
  if ("blocks" in body) update.blocks = validateBlocks(body.blocks);

  const { data: updated, error } = await admin
    .from("company_pages")
    .update(update)
    .eq("id", id)
    .select("id, title, slug, visibility, access_code, project_id, status, blocks")
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message || "Failed to update page" }, { status: 500 });

  // linkedProjectIds fully replaces the join rows, mirroring how `blocks`
  // already replaces wholesale on save -- this is the manual removal path
  // (the UI only ever offers "remove", additions are chat-driven via
  // link_matters), so a client-supplied list here is only ever a SUBSET of
  // what's already there, but re-validated against this company regardless.
  if ("linkedProjectIds" in body) {
    const requested = Array.isArray(body.linkedProjectIds) ? body.linkedProjectIds.filter((v): v is string => typeof v === "string" && !!v) : [];
    const { data: valid } = requested.length
      ? await admin.from("projects").select("id").in("id", requested).eq("company_id", companyId).is("deleted_at", null)
      : { data: [] };
    const validIds: string[] = (valid || []).map((p: { id: string }) => p.id);
    await admin.from("company_page_projects").delete().eq("page_id", id);
    if (validIds.length) await admin.from("company_page_projects").insert(validIds.map((projectId) => ({ page_id: id, project_id: projectId })));
  }

  // Resolved here too -- otherwise the client's post-save merge would
  // overwrite the live preview's already-resolved record_field/record_list
  // blocks with the raw, unresolved stored shape until the next full reload.
  const blocks = await resolveRecordBlocks(admin, companyId, id, updated.project_id, updated.blocks ?? []);
  return NextResponse.json({ page: { ...updated, blocks } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can delete pages" }, { status: 403 });
  const { id } = await params;

  const { data: existing } = await admin.from("company_pages").select("id").eq("id", id).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const { error } = await admin.from("company_pages").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

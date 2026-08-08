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
  return NextResponse.json({ page });
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
  if ("projectId" in body) update.project_id = typeof body.projectId === "string" && body.projectId ? body.projectId : null;
  if ("blocks" in body) update.blocks = validateBlocks(body.blocks);

  const { data: updated, error } = await admin
    .from("company_pages")
    .update(update)
    .eq("id", id)
    .select("id, title, slug, visibility, access_code, project_id, status, blocks")
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message || "Failed to update page" }, { status: 500 });

  return NextResponse.json({ page: updated });
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

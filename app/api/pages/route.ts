// app/api/pages/route.ts
// List/create company_pages ("Pages" -> Content pages sub-tab). Creation is
// admin-only (mirrors lib/ai/tableBuilderTools.ts's ADMIN_ONLY_TOOLS
// convention for anything content/schema-defining). Always creates an empty
// draft -- all AI drafting, including a page's first content, happens
// afterward through the conversational "Draft with AI" chat in the editor
// (app/api/pages/[id]/generate/route.ts), which can ask a clarifying
// question before committing to content; that doesn't fit a single
// fire-and-forget create call.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET() {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const { data, error } = await admin
    .from("company_pages")
    .select("id, title, slug, visibility, status, updated_at, created_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pages: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can create pages" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const title = String(body?.title || "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const baseSlug = slugify(typeof body?.slug === "string" && body.slug.trim() ? body.slug : title);
  if (!baseSlug) return NextResponse.json({ error: "Could not derive a URL slug from that title" }, { status: 400 });
  const { data: clash } = await admin.from("company_pages").select("id").eq("slug", baseSlug).maybeSingle();
  if (clash) return NextResponse.json({ error: `The URL "/public/pages/${baseSlug}" is already taken` }, { status: 409 });

  const { data: created, error } = await admin
    .from("company_pages")
    .insert({ company_id: companyId, title, slug: baseSlug, blocks: [], created_by: user.id })
    .select("id, title, slug, visibility, status, blocks")
    .single();
  if (error || !created) return NextResponse.json({ error: error?.message || "Failed to create page" }, { status: 500 });

  return NextResponse.json({ page: created });
}

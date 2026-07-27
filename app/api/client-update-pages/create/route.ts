// app/api/client-update-pages/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const { title, clientLabel, slug, expiresAt } = body;
  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const cleanSlug = slugify(slug || title);
  if (!cleanSlug) return NextResponse.json({ error: "Could not derive a URL slug from that title" }, { status: 400 });

  const { data: clash } = await admin.from("client_update_pages").select("id").eq("slug", cleanSlug).maybeSingle();
  if (clash) return NextResponse.json({ error: `The URL "/public/updates/${cleanSlug}" is already taken` }, { status: 409 });

  const accessCode = String(Math.floor(100000 + Math.random() * 900000));

  const { data: page, error } = await admin.from("client_update_pages").insert({
    company_id: companyId, title: title.trim(), client_label: clientLabel?.trim() || null,
    slug: cleanSlug, access_code: accessCode, expires_at: expiresAt || null, created_by: user.id,
  }).select("id, slug, access_code").single();
  if (error || !page) return NextResponse.json({ error: error?.message || "Failed to create page" }, { status: 500 });

  return NextResponse.json({ ok: true, page });
}

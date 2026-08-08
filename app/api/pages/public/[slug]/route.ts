// app/api/pages/public/[slug]/route.ts
// GENUINELY UNAUTHENTICATED (service-role adminClient(), no session) --
// modeled directly on app/api/client-update-pages/public/[slug]/route.ts's
// gate. visibility = 'company' is refused here even though the row exists
// and is published -- that's the actual enforcement point for "some pages
// are private": a 'company' page can ONLY ever be read through the
// authenticated RLS path in app/api/pages/[id]/route.ts, never this one.
// Returns only { title, blocks } -- never created_by, ai_prompt, or any
// other internal field.
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = adminClient();

  const { data: page } = await admin
    .from("company_pages")
    .select("title, visibility, access_code, status, blocks")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!page || page.status !== "published" || page.visibility === "company") {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  if (page.visibility === "client" && page.access_code) {
    const code = req.nextUrl.searchParams.get("code");
    if (!code) return NextResponse.json({ title: page.title, requiresCode: true, blocks: [] });
    if (code !== page.access_code) return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
  }

  return NextResponse.json({ title: page.title, requiresCode: false, blocks: page.blocks ?? [] });
}

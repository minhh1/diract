// app/api/marketing-pages/[...key]/route.ts
// Catch-all (not [key]) because page_key contains slashes, e.g.
// "for/law-firm-au" -- GET loads one page, PATCH saves its draft_content
// (autosave-on-blur from AdminLandingPagesTab.tsx, same pattern as
// AdminAiAssistantTab.tsx's save()), POST publishes it (copies
// draft_content -> published_content and revalidates the real marketing
// URL). Publish is a POST here rather than a nested .../publish/route.ts --
// Turbopack rejects a static segment after a catch-all ("Invalid segment
// Static("publish"), catch all segment must be the last segment"), so it
// has to be a different HTTP verb on this same route instead of a
// sub-route. Kept as its own verb (not folded into PATCH) so "save my
// draft" and "make it live" stay two distinct, deliberate actions.
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireMinhHuynh, MINH_HUYNH_COMPANY_ID } from "@/lib/marketingPages/auth";

// page_key -> the real marketing URL to revalidate on publish. Unmapped
// keys still publish, just without knowing which path to revalidate
// immediately (would show up on next natural revalidation/deploy instead).
function urlForPageKey(pageKey: string): string | null {
  if (pageKey === "home") return "/";
  if (pageKey === "terms" || pageKey === "privacy") return `/${pageKey}`;
  if (pageKey.startsWith("for/") || pageKey.startsWith("features/")) return `/${pageKey}`;
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const auth = await requireMinhHuynh();
  if (auth.error) return auth.error;
  const { key } = await params;
  const pageKey = key.join("/");

  const { data, error } = await auth.admin
    .from("marketing_page_content")
    .select("page_key, page_kind, draft_content, published_content, published_at, updated_at")
    .eq("company_id", MINH_HUYNH_COMPANY_ID)
    .eq("page_key", pageKey)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ page: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const auth = await requireMinhHuynh();
  if (auth.error) return auth.error;
  const { key } = await params;
  const pageKey = key.join("/");

  const body = await req.json().catch(() => null);
  if (!body?.draft_content || typeof body.draft_content !== "object") {
    return NextResponse.json({ error: "draft_content is required" }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("marketing_page_content")
    .update({ draft_content: body.draft_content, updated_at: new Date().toISOString() })
    .eq("company_id", MINH_HUYNH_COMPANY_ID)
    .eq("page_key", pageKey)
    .select("page_key")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const auth = await requireMinhHuynh();
  if (auth.error) return auth.error;
  const { key } = await params;
  const pageKey = key.join("/");

  const { data: page, error: fetchError } = await auth.admin
    .from("marketing_page_content")
    .select("draft_content")
    .eq("company_id", MINH_HUYNH_COMPANY_ID)
    .eq("page_key", pageKey)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await auth.admin
    .from("marketing_page_content")
    .update({
      published_content: page.draft_content,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", MINH_HUYNH_COMPANY_ID)
    .eq("page_key", pageKey);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = urlForPageKey(pageKey);
  if (url) revalidatePath(url);

  return NextResponse.json({ ok: true });
}

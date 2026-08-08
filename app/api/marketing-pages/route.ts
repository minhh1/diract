// app/api/marketing-pages/route.ts
// Lists every marketing_page_content row for the one company this feature
// is scoped to (see lib/marketingPages/auth.ts) -- powers the page list in
// components/admin/AdminLandingPagesTab.tsx.
import { NextResponse } from "next/server";
import { requireMinhHuynh, MINH_HUYNH_COMPANY_ID } from "@/lib/marketingPages/auth";

export async function GET() {
  const auth = await requireMinhHuynh();
  if (auth.error) return auth.error;

  const { data, error } = await auth.admin
    .from("marketing_page_content")
    .select("page_key, page_kind, draft_content, published_content, published_at, updated_at")
    .eq("company_id", MINH_HUYNH_COMPANY_ID)
    .order("page_key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ pages: data });
}

// lib/financeModelPageGate.ts
// Gating for the GENUINELY UNAUTHENTICATED public Finance Model route
// (app/api/finance-model-pages/public/[pageId]/route.ts). No user session
// on this side -- access is granted purely by the page id existing,
// is_active = true, using the service-role admin client throughout.
// Mirrors lib/documentFillPageGate.ts exactly; codeMatches is reused
// directly from there since it's already generic over any `{access_code}`
// row shape.
import { NextResponse } from "next/server";

export { codeMatches } from "@/lib/documentFillPageGate";

export async function loadActiveFinanceModelPage(admin: any, pageId: string) {
  const { data: page } = await admin
    .from("finance_model_pages")
    .select("id, company_id, entity_id, title, is_active, access_code")
    .eq("id", pageId).maybeSingle();

  const notFound = { error: NextResponse.json({ error: "This page is not available" }, { status: 404 }), page: null };

  if (!page) return notFound;
  if (!page.is_active) return notFound;

  return { error: null as null, page };
}

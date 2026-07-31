// app/api/finance-model-pages/public/[pageId]/route.ts
// GENUINELY UNAUTHENTICATED client-facing route. No supabase.auth.getUser()
// or session/membership check -- access is gated only by the page id
// existing, is_active = true, and (if set) the access code matching. Uses
// the service-role admin client throughout since there is no user session.
// Mirrors app/api/document-templates/public/[pageId]/route.ts's shape.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadActiveFinanceModelPage, codeMatches } from "@/lib/financeModelPageGate";
import { loadOverview } from "@/lib/financeModel/data";

export async function GET(req: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const gate = await loadActiveFinanceModelPage(admin, pageId);
  if (gate.error) return gate.error;
  const { page } = gate;

  // Access-code gate -- a second, independent check on top of is_active.
  // No code supplied yet: tell the client a code is needed without leaking
  // any data. Wrong code: 401.
  if (page.access_code) {
    const code = req.nextUrl.searchParams.get("code");
    if (!code) return NextResponse.json({ title: page.title, requiresCode: true }, { status: 200 });
    if (!codeMatches(page, code)) {
      return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
    }
  }

  try {
    const data = await loadOverview(admin, page.company_id, page.project_id);
    return NextResponse.json({ title: page.title, requiresCode: false, ...data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load" }, { status: 502 });
  }
}

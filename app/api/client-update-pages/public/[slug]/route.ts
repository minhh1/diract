// app/api/client-update-pages/public/[slug]/route.ts
// GENUINELY UNAUTHENTICATED client-facing route (see lib/clientUpdatePageGate.ts)
// -- no supabase.auth calls, service-role admin client throughout. Only
// PIN-active fields (client_visible) and their resolved values are
// returned. Editing a 'custom'/'base' field happens on the authenticated
// staff side only (app/public/updates/[slug]/page.tsx switches to the
// authenticated by-slug + admin mutation routes for a logged-in staff
// member, and never calls this route for writes) -- this GET route only
// ever reads.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadActivePageBySlug, codeMatches } from "@/lib/clientUpdatePageGate";
import { loadPageDetail } from "@/lib/clientUpdatePageDetail";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const gate = await loadActivePageBySlug(admin, slug);
  if (gate.error) return gate.error;
  const { page } = gate;

  if (page.access_code) {
    const code = req.nextUrl.searchParams.get("code");
    if (!code) return NextResponse.json({ title: page.title, dateFormat: page.date_format, freezeFirstColumn: page.freeze_first_column, requiresCode: true, fields: [], groups: [], items: [] });
    if (!codeMatches(page, code)) {
      return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
    }
  }

  const detail = await loadPageDetail(admin, page.id, { clientVisibleOnly: true, baseTable: page.base_table, pageKind: page.page_kind, redactFigures: !!page.redact_figures });

  return NextResponse.json({
    title: page.title,
    dateFormat: page.date_format,
    freezeFirstColumn: page.freeze_first_column,
    baseTable: page.base_table,
    pageKind: page.page_kind,
    requiresCode: false,
    ...detail,
  });
}

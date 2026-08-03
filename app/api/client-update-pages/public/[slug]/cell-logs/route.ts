// app/api/client-update-pages/public/[slug]/cell-logs/route.ts
// GENUINELY UNAUTHENTICATED -- lets a client see the change history for one
// cell (one field on one matter) on their own page: what it changed from/to,
// when, and the reason staff gave for the edit. Same gate as the parent GET
// route (active/unexpired/PIN); additionally verifies itemId and fieldId
// actually belong to this page, so a valid PIN for page A can't be used to
// read another page's cell history by guessing ids. Only rows that carry
// item_id/field_id at all are 'value_changed' or 'settlement_status' (see
// the migration that added those columns, and
// lib/clientUpdatePageSettlementReview.ts for the latter) -- both are fine
// to show a client, so there's no need to filter action explicitly here.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadActivePageBySlug, codeMatches } from "@/lib/clientUpdatePageGate";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const itemId = req.nextUrl.searchParams.get("itemId");
  const fieldId = req.nextUrl.searchParams.get("fieldId");
  const code = req.nextUrl.searchParams.get("code");
  if (!itemId || !fieldId) return NextResponse.json({ error: "itemId and fieldId are required" }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const gate = await loadActivePageBySlug(admin, slug);
  if (gate.error) return gate.error;
  const { page } = gate;
  if (page.access_code && !codeMatches(page, code)) {
    return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
  }

  const [{ data: item }, { data: field }] = await Promise.all([
    admin.from("client_update_page_items").select("id").eq("id", itemId).eq("page_id", page.id).maybeSingle(),
    admin.from("client_update_page_fields").select("id").eq("id", fieldId).eq("page_id", page.id).maybeSingle(),
  ]);
  if (!item || !field) return NextResponse.json({ error: "Not found on this page" }, { status: 404 });

  const { data: logs, error } = await admin
    .from("client_update_page_logs")
    .select("id, actor_name, action, old_value, new_value, reason, created_at")
    .eq("item_id", itemId).eq("field_id", fieldId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: logs || [] });
}

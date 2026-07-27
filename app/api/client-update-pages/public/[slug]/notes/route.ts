// app/api/client-update-pages/public/[slug]/notes/route.ts
// GENUINELY UNAUTHENTICATED -- lets the client themselves post a dated note
// against one of their matters (source: 'client'). Same gate as the parent
// GET route (active/unexpired/PIN); additionally verifies the itemId given
// actually belongs to this page, so one client's link can't be used to write
// notes onto another company's page by guessing an item id.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadActivePageBySlug, codeMatches } from "@/lib/clientUpdatePageGate";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const { itemId, note, code, propertyId } = body as { itemId?: string; note?: string; code?: string; propertyId?: string };

  if (!itemId || !note || !String(note).trim()) {
    return NextResponse.json({ error: "A note is required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const gate = await loadActivePageBySlug(admin, slug);
  if (gate.error) return gate.error;
  const { page } = gate;
  if (page.access_code && !codeMatches(page, code)) {
    return NextResponse.json({ error: "Incorrect access code" }, { status: 401 });
  }

  const { data: item } = await admin.from("client_update_page_items").select("id, project_id").eq("id", itemId).eq("page_id", page.id).maybeSingle();
  if (!item) return NextResponse.json({ error: "This matter is not available" }, { status: 404 });

  // Same "must genuinely belong to this matter" check as the staff route --
  // see its comment. property_id stays null (a whole-matter note) unless
  // that holds.
  let noteProperty: string | null = null;
  if (propertyId) {
    const { count } = await admin.from("project_properties").select("id", { count: "exact", head: true }).eq("project_id", item.project_id).eq("property_id", propertyId);
    if (count) noteProperty = propertyId;
  }

  const { data: created, error } = await admin.from("client_update_page_notes").insert({
    item_id: itemId, body: String(note).trim(), source: "client", property_id: noteProperty,
  }).select("id, note_date, body, author_name, source, created_at, property_id").single();
  if (error) return NextResponse.json({ error: "Could not save your note" }, { status: 500 });

  return NextResponse.json({ note: created });
}

// app/api/client-update-pages/[id]/notes/route.ts
// Staff-side counterpart to the public notes route -- same
// client_update_page_notes log, source: 'staff', author is the caller's name.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const { itemId, note, noteDate } = body;
  if (!itemId || !note?.trim()) return NextResponse.json({ error: "A note is required" }, { status: 400 });

  const { data: item } = await admin.from("client_update_page_items").select("id").eq("id", itemId).eq("page_id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Matter not found on this page" }, { status: 404 });

  const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();

  const { data: created, error } = await admin.from("client_update_page_notes").insert({
    item_id: itemId, body: note.trim(), note_date: noteDate || undefined,
    author_name: profile?.full_name || profile?.email || null, source: "staff",
  }).select("id, note_date, body, author_name, source").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ note: created });
}

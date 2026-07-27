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
  const { itemId, note, noteDate, propertyId } = body;
  if (!itemId || !note?.trim()) return NextResponse.json({ error: "A note is required" }, { status: 400 });

  const { data: item } = await admin.from("client_update_page_items").select("id, project_id").eq("id", itemId).eq("page_id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Matter not found on this page" }, { status: 404 });

  // Only tag the note to a specific property if one was actually given AND
  // it's genuinely linked to this matter -- otherwise it's a whole-matter
  // note (property_id null), same as before this existed.
  let noteProperty: string | null = null;
  if (propertyId) {
    const { count } = await admin.from("project_properties").select("id", { count: "exact", head: true }).eq("project_id", item.project_id).eq("property_id", propertyId);
    if (count) noteProperty = propertyId;
  }

  const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();

  const { data: created, error } = await admin.from("client_update_page_notes").insert({
    item_id: itemId, body: note.trim(), note_date: noteDate || undefined, property_id: noteProperty,
    author_name: profile?.full_name || profile?.email || null, source: "staff",
  }).select("id, note_date, body, author_name, source, created_at, property_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ note: created });
}

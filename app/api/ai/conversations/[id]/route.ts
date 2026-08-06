// app/api/ai/conversations/[id]/route.ts
// GET a conversation's messages (to resume it after a refresh/reopen),
// PATCH its title/pinned state, or DELETE the whole thread. RLS on
// ai_messages already scopes to the owning user, but
// authorizeCompanyMember's admin client bypasses RLS, so user_id AND
// company_id are checked explicitly here too -- a user who belongs to more
// than one company must not be able to open, rename, pin, or delete a
// thread that belongs to a company they're not currently active in, even
// if they own it.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: conversation } = await admin
    .from("ai_conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: messages, error } = await admin
    .from("ai_messages")
    .select("role, content, citations, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: messages ?? [] });
}

// Accepts either or both fields -- undefined means "leave as-is" (a rename
// alone shouldn't touch pinned, and vice versa). An explicit empty-string
// title reverts to the derived-from-first-message title rather than
// showing a blank row (see the route.ts sibling's own title-fallback logic
// and the migration's column comment).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};
  if (typeof body?.title === "string") updates.title = body.title.trim() || null;
  if (typeof body?.pinned === "boolean") updates.pinned = body.pinned;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "title or pinned is required" }, { status: 400 });

  const { data: updated, error } = await admin
    .from("ai_conversations")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { error } = await admin
    .from("ai_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// app/api/ai/conversations/[id]/route.ts
// GET a conversation's messages (to resume it after a refresh/reopen), or
// DELETE the whole thread. RLS on ai_messages already scopes to the
// owning user, but authorizeCompanyMember's admin client bypasses RLS, so
// user_id AND company_id are checked explicitly here too -- a user who
// belongs to more than one company must not be able to open or delete a
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

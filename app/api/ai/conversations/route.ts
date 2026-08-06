// app/api/ai/conversations/route.ts
// Lists the current user's AI assistant conversation threads (personal,
// not shared with teammates -- see supabase/ai_conversations.sql). A
// thread's title is a stored override (set via this route's PATCH sibling,
// [id]/route.ts) when present, falling back to a display label derived
// from its first user message otherwise. Pinned threads sort first.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Scoped to the currently active company as well as the user -- a user
  // who's a member of more than one company (and switches between them)
  // must only see this company's threads, not every thread they've ever
  // started anywhere.
  const { data: conversations, error } = await admin
    .from("ai_conversations")
    .select("id, title, pinned, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!conversations || conversations.length === 0) return NextResponse.json({ conversations: [] });

  const { data: firstMessages } = await admin
    .from("ai_messages")
    .select("conversation_id, content, created_at")
    .in("conversation_id", conversations.map((c) => c.id))
    .eq("role", "user")
    .order("created_at", { ascending: true });

  const derivedTitleByConversation = new Map<string, string>();
  for (const m of firstMessages ?? []) {
    if (!derivedTitleByConversation.has(m.conversation_id)) derivedTitleByConversation.set(m.conversation_id, m.content);
  }

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      updatedAt: c.updated_at,
      pinned: c.pinned,
      title: (c.title?.trim() || derivedTitleByConversation.get(c.id) || "New chat").slice(0, 60),
    })),
  });
}

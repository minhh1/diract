// app/api/gmail/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { fetchEmails } from "@/lib/gmail/client";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient() 
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const query = req.nextUrl.searchParams.get('q') || 'in:inbox';
  const messages = await fetchEmails(user.id, supabase, query);
  return NextResponse.json({ messages });
}
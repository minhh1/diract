// app/api/gmail/messages/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { fetchEmailBody } from "@/lib/gmail/client";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await fetchEmailBody(params.id, user.id, supabase);
  return NextResponse.json({ body });
}
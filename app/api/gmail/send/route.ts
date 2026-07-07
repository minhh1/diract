// app/api/gmail/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/gmail/client";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { to, subject, body, threadId } = await req.json();
  await sendEmail(to, subject, body, threadId, user.id, supabase);
  return NextResponse.json({ success: true });
}
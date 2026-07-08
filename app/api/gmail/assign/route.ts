// app/api/gmail/assign/route.ts
// Assigns email thread to a project and applies Gmail label
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { applyProjectLabel } from "@/lib/gmail/client";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { messageId, threadId, projectId, projectName, subject, from, fromName, date, snippet } =
    await req.json();

  const { data: prof } = await supabase
    .from('profiles')
    .select('active_company_id')
    .eq('id', user.id)
    .single();

  // Save assignment to DB
  await supabase.from('project_emails').upsert({
    user_id: user.id,
    company_id: prof?.active_company_id,
    project_id: projectId,
    gmail_message_id: messageId,
    gmail_thread_id: threadId,
    subject,
    from_address: from,
    from_name: fromName,
    date,
    snippet,
    gmail_label_applied: true,
  }, { onConflict: 'user_id,gmail_message_id' });

  //log

  await supabase.from('email_activity_log').insert({
    user_id: user.id,
    company_id: prof?.active_company_id,
    gmail_message_id: messageId,
    project_id: projectId,
    action: 'label_applied',
    details: {
      subject,
      from,
      label: projectName,
      thread_id: threadId,
  },
  });

  // Apply Gmail label
  if (projectName) {
    await applyProjectLabel(threadId, projectName, user.id, supabase);
  }

  return NextResponse.json({ success: true });
}
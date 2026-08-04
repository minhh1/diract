// app/api/ai/conversations/sweep/route.ts
// Cron-only -- deletes AI conversation threads older than the retention
// window, so raw chat history doesn't accumulate indefinitely (it did
// before this route existed -- ai_messages had no TTL at all). Mirrors
// app/api/ai/usage/sweep/route.ts's CRON_SECRET bearer-auth pattern; add
// this route to the same Vercel Cron Jobs schedule (once a day is plenty --
// this isn't time-sensitive the way billing reporting is).
//
// Deleting ai_conversations cascades to ai_messages
// (ai_messages.conversation_id references ai_conversations
// ON DELETE CASCADE, see supabase/ai_messages.sql) -- one DELETE covers
// both tables. 90 days balances "a user can still find last month's
// answer" against not keeping raw prompts/responses forever; not
// user-configurable today, just a fixed constant here.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RETENTION_DAYS = 90;

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = adminClient();
  const started = Date.now();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: deleted, error } = await admin
    .from("ai_conversations")
    .delete()
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("cron_heartbeats").upsert(
    { name: "ai-conversation-retention-sweep", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: { conversationsDeleted: deleted?.length ?? 0 } },
    { onConflict: "name" }
  );

  return NextResponse.json({ conversationsDeleted: deleted?.length ?? 0 });
}

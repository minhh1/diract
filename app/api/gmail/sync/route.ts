// app/api/gmail/sync/route.ts
// Fetches all niksen/* labels from Gmail and syncs assignments to project_emails
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { APP_URL } from "@/lib/config";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: tokenRow } = await supabase
    .from('user_gmail_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!tokenRow) return NextResponse.json({ synced: 0 });

  let accessToken = tokenRow.access_token;

  // Refresh token if needed
  const expiresAt = new Date(tokenRow.token_expires_at).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokenRow.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const refreshed = await refreshRes.json();
    if (refreshed.access_token) {
      accessToken = refreshed.access_token;
      await supabase.from('user_gmail_tokens').update({
        access_token: refreshed.access_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('user_id', user.id);
    }
  }

  const { data: prof } = await supabase
    .from('profiles')
    .select('active_company_id')
    .eq('id', user.id)
    .single();

  // Get all labels that look like company labels (contain /)
  const labelsRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const labelsData = await labelsRes.json();
  const projectLabels = (labelsData.labels || []).filter((l: any) =>
    l.name.includes('/') &&
    !['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH'].includes(l.name)
  );

  let synced = 0;
  const syncLog: string[] = [];

  for (const label of projectLabels) {
    // Get messages with this label
    const msgsRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${label.id}&maxResults=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const msgsData = await msgsRes.json();
    if (!msgsData.messages?.length) continue;

    // Extract project name from label (everything after last /)
    const labelParts = label.name.split('/');
    const projectIdentifier = labelParts[labelParts.length - 1].trim();

    // Try to find matching project by name, street_address, or matter number
    const { data: matchingProjects } = await supabase
      .from('projects')
      .select('id, name')
      .or(`name.ilike.%${projectIdentifier}%`)
      .is('deleted_at', null)
      .limit(1);

    const projectId = matchingProjects?.[0]?.id || null;

    for (const msg of msgsData.messages) {
      // Get message metadata
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const get = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const fromRaw = get('From');
      const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);

      // Check if already in project_emails
      const { data: existing } = await supabase
        .from('project_emails')
        .select('id, project_id')
        .eq('gmail_message_id', msg.id)
        .eq('user_id', user.id)
        .single();

      if (!existing) {
        // New assignment — insert
        await supabase.from('project_emails').insert({
          user_id: user.id,
          company_id: prof?.active_company_id,
          project_id: projectId,
          gmail_message_id: msg.id,
          gmail_thread_id: msgData.threadId,
          subject: get('Subject') || '(no subject)',
          from_address: fromMatch ? fromMatch[2].trim() : fromRaw,
          from_name: fromMatch ? fromMatch[1].trim().replace(/^"|"$/g, '') : fromRaw,
          date: get('Date'),
          snippet: msgData.snippet || '',
          gmail_label_applied: true,
        });
        syncLog.push(`synced:${msg.id}:${label.name}`);
        synced++;
      } else if (existing.project_id !== projectId && projectId) {
        // Label changed — update project assignment
        await supabase.from('project_emails')
          .update({ project_id: projectId })
          .eq('id', existing.id);
        syncLog.push(`updated:${msg.id}:${label.name}`);
        synced++;
      }
    }
  }

  // Log sync activity
  if (synced > 0) {
    await supabase.from('email_activity_log').insert({
      user_id: user.id,
      company_id: prof?.active_company_id,
      action: 'gmail_sync',
      details: { synced, labels: projectLabels.map((l: any) => l.name), log: syncLog },
    });
  }

  return NextResponse.json({ synced, labels: projectLabels.length });
}
// app/api/gmail/addon/search-projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('X-Gmail-Access-Token');
  const userEmailHeader = req.headers.get('X-User-Email');
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  const labelledOnly = url.searchParams.get('labelled') === 'true';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Resolve email
  let email: string | null = userEmailHeader;
  if (!email && accessToken) {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } });
    if (r.ok) email = (await r.json()).email || null;
  }
  if (!email) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  // Find userId
  let userId: string | null = null;
  const { data: tr } = await db.from('user_gmail_tokens').select('user_id').eq('email', email).single();
  if (tr?.user_id) userId = tr.user_id;
  else {
    const { data: pr } = await db.from('profiles').select('id').eq('email', email).single();
    if (pr?.id) userId = pr.id;
  }
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: prof } = await db.from('profiles').select('active_company_id').eq('id', userId).single();
  if (!prof?.active_company_id) return NextResponse.json({ error: 'No company' }, { status: 404 });

  const companyId = prof.active_company_id;

  if (labelledOnly) {
    // Return all projects that have a gmail label (not deleted, not removed)
    const { data: labels } = await db
      .from('project_gmail_labels')
      .select('project_id, gmail_label_name')
      .eq('company_id', companyId)
      .is('removed_at', null)
      .is('deleted_at', null);

    if (!labels?.length) return NextResponse.json({ projects: [] });

    const projectIds = labels.map(l => l.project_id);
    const labelMap = new Map(labels.map(l => [l.project_id, l.gmail_label_name]));

    let query = db
      .from('projects')
      .select('id, name')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('id', projectIds)
      .order('name');

    if (q) query = query.ilike('name', `%${q}%`);

    const { data: projects } = await query;

    return NextResponse.json({
      projects: (projects || []).map(p => ({
        id: p.id,
        name: p.name,
        labelName: labelMap.get(p.id) || null,
      })),
    });
  }

  // Regular search
  const { data: projects } = await db
    .from('projects')
    .select('id, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(20);

  const projectIds = (projects || []).map(p => p.id);
  const { data: labels } = await db
    .from('project_gmail_labels')
    .select('project_id, gmail_label_name')
    .in('project_id', projectIds)
    .is('removed_at', null);

  const labelMap = new Map((labels || []).map(l => [l.project_id, l.gmail_label_name]));

  return NextResponse.json({
    projects: (projects || []).map(p => ({
      id: p.id,
      name: p.name,
      labelName: labelMap.get(p.id) || null,
    })),
  });
}
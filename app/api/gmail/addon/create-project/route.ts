// app/api/gmail/addon/create-project/route.ts
// Called by the Gmail Add-on when user creates a project from Gmail.
// Creates the project in the DB, builds the label name, and triggers a sync.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { messageId, projectName, matterNumber, status, accessToken, userEmail: bodyEmail } = body;

  if (!projectName?.trim()) {
    return NextResponse.json({ error: 'Project name required' }, { status: 400 });
  }

  const db = adminDb();

  // Resolve email — use bodyEmail directly if provided (from homepage context),
  // otherwise look up via Gmail token
  let gmailEmail: string | null = bodyEmail || null;

  if (!gmailEmail && accessToken) {
    const userRes = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (userRes.ok) {
      const userInfo = await userRes.json();
      gmailEmail = userInfo.email || null;
    }
  }

  if (!gmailEmail) {
    return NextResponse.json({ error: 'Could not resolve user email' }, { status: 401 });
  }

  // Find user by email — check gmail tokens table first, then profiles
  let userId: string | null = null;

  const { data: tokenRow } = await db
    .from('user_gmail_tokens')
    .select('user_id')
    .eq('email', gmailEmail)
    .single();

  if (tokenRow?.user_id) {
    userId = tokenRow.user_id;
  } else {
    const { data: profileRow } = await db
      .from('profiles')
      .select('id')
      .eq('email', gmailEmail)
      .single();
    if (profileRow?.id) userId = profileRow.id;
  }

  if (!userId) {
    return NextResponse.json(
      { error: `Account ${gmailEmail} is not connected to Flow. Please connect Gmail in the app first.` },
      { status: 404 }
    );
  }

  // Get user's active company
  const { data: prof } = await db
    .from('profiles')
    .select('active_company_id')
    .eq('id', userId)
    .single();

  const companyId = prof?.active_company_id;
  if (!companyId) {
    return NextResponse.json({ error: 'No company associated' }, { status: 400 });
  }

  // Get company label settings
  const { data: company } = await db
    .from('companies')
    .select('name, gmail_parent_label, gmail_parent_code, gmail_label_tokens, gmail_sublabel_separator')
    .eq('id', companyId)
    .single();

  const parentLabel = company?.gmail_parent_label || 'Shared Emails';
  const parentCode = company?.gmail_parent_code || '';
  const parentFull = parentCode ? `${parentLabel} #${parentCode}` : parentLabel;
  const tokens: string[] = company?.gmail_label_tokens || ['matter_number', 'project_name'];
  const separator: string = company?.gmail_sublabel_separator || ' — ';

  // Build sublabel
  const sublabelParts: string[] = [];
  for (const token of tokens) {
    switch (token) {
      case 'project_name':   sublabelParts.push(projectName.trim()); break;
      case 'matter_number':  sublabelParts.push(matterNumber?.trim() || ''); break;
      case 'matter_status':  sublabelParts.push(status || 'Open'); break;
      case 'year':           sublabelParts.push(String(new Date().getFullYear())); break;
    }
  }
  const sublabel = sublabelParts.filter(Boolean).join(separator);
  const gmailLabelName = `${parentFull}/${sublabel}`;

  // Create the project in the DB
  const { data: project, error: projError } = await db
    .from('projects')
    .insert({
      company_id: companyId,
      name: projectName.trim(),
      status: status || 'Open',
      created_by: userId,
    })
    .select('id')
    .single();

  if (projError) {
    console.error('[addon/create-project] project insert error:', projError);
    return NextResponse.json({ error: projError.message }, { status: 500 });
  }

  const projectId = project.id;

  // Save matter number as custom field if provided
  if (matterNumber?.trim()) {
    const { data: matterField } = await db
      .from('company_custom_fields')
      .select('id')
      .eq('company_id', companyId)
      .eq('table_name', 'projects')
      .ilike('label', '%matter number%')
      .single();

    if (matterField) {
      await db.from('company_custom_field_values').upsert({
        company_id: companyId,
        record_id: projectId,
        field_id: matterField.id,
        table_name: 'projects',
        value_text: matterNumber.trim(),
      }, { onConflict: 'field_id,record_id' });
    }
  }

  // Save to project_gmail_labels
  await db.from('project_gmail_labels').upsert({
    company_id: companyId,
    project_id: projectId,
    gmail_label_name: gmailLabelName,
    label_sub: sublabel,
    created_by: userId,
  }, { onConflict: 'company_id,project_id' });

  // Save to project_emails for this message
  if (messageId) {
    await db.from('project_emails').upsert({
      user_id: userId,
      company_id: companyId,
      project_id: projectId,
      gmail_message_id: messageId,
      gmail_label_applied: true,
    }, { onConflict: 'user_id,gmail_message_id' });

    // Log it
    await db.from('gmail_sync_log').insert({
      company_id: companyId,
      triggered_by: userId,
      action: 'label_applied',
      project_id: projectId,
      gmail_message_id: messageId,
      gmail_label_name: gmailLabelName,
      target_user_id: userId,
      details: { source: 'gmail_addon', projectName, matterNumber },
    });
  }

  console.log(`[addon/create-project] Created project "${projectName}" label "${gmailLabelName}"`);

  return NextResponse.json({
    ok: true,
    projectId,
    projectName: projectName.trim(),
    labelName: gmailLabelName,
  });
}